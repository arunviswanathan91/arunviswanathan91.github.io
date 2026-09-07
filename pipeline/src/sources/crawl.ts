import { extractJsonLd, findJobPostings, readJobPosting } from "../normalize/jsonld.js";
import { canonicalizeUrl } from "../normalize/url.js";
import { sha256 } from "../normalize/text.js";
import { buildOpportunity } from "./build.js";
import { sameSiteLinks } from "./links.js";
import { SourceConfigError } from "./types.js";
import type { SourceAdapter, SourceContext, SourceQuery, FetchWindow, SourcePage } from "./types.js";
import type { NormalizedOpportunity, RawItem } from "../types.js";

/**
 * Walks a small set of known career pages and reads their schema.org JobPosting
 * markup. Google requires that markup for a listing to appear in Google for Jobs,
 * so institutions that want to be found publish it — which means no crawler
 * framework, no headless browser and no model is needed to read them.
 *
 * A seed page that renders only via JavaScript (no JobPosting markup, no links
 * to follow in the raw HTML) gets one Firecrawl-rendered retry via
 * ctx.renderer before being given up on -- see sources/firecrawl.ts. That tier
 * is optional: with no FIRECRAWL_API_KEY set, ctx.renderer is null and such
 * pages are simply skipped, exactly as before it existed.
 */
export function crawlAdapter(sourceKey: string): SourceAdapter {
 let seedUrls: string[] = [];
 let allow = /(job|career|vacanc|recruit|position|opening|employment)/i;
 let maxPagesPerHost = 15;
 let organization: string | null = null;

 return {
  key: sourceKey,
  kind: "crawl",
  quotaProvider: "none",

  configure(config) {
   seedUrls = Array.isArray(config.seedUrls) ? config.seedUrls.map(String) : [];
   if (config.allowPathRe) allow = new RegExp(String(config.allowPathRe), "i");
   if (config.maxPages) maxPagesPerHost = Number(config.maxPages);
   organization = config.organization ? String(config.organization) : null;
   if (!seedUrls.length) throw new SourceConfigError(`${sourceKey}: config.seedUrls is required`);
  },

  async *fetch(_q: SourceQuery, w: FetchWindow, ctx: SourceContext): AsyncGenerator<SourcePage> {
   const etags = (ctx.cursorIn.etags ?? {}) as Record<string, string>;
   const nextEtags: Record<string, string> = { ...etags };
   const seen = new Set<string>();
   const frontier = [...seedUrls.map(canonicalizeUrl)];
   const items: RawItem[] = [];
   let requests = 0;
   let depth0 = seedUrls.length;

   while (frontier.length && requests < Math.min(w.maxRequests, maxPagesPerHost)) {
    if (Date.now() > w.deadlineAt || items.length >= w.maxItems) break;
    const url = frontier.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const isSeed = depth0 > 0;   // only seeds get the Firecrawl fallback -- see below

    const headers: Record<string, string> = {};
    if (etags[url]) headers["if-none-match"] = etags[url];

    let res;
    try { res = await ctx.http.get(url, headers); }
    catch (e) { ctx.log(`${sourceKey}: ${url} failed`, { error: String(e) }); requests++; continue; }
    requests++;

    if (res.notModified) continue;
    if (!res.ok || !res.body) continue;
    if (res.headers["etag"]) nextEtags[url] = res.headers["etag"];

    let body = res.body;
    let postings = findJobPostings(extractJsonLd(body));
    // A seed page with no JobPosting markup and no same-site links to follow is
    // the signature of a JS-rendered shell (e.g. a Workday SPA) -- fall back to
    // a rendered fetch before giving up on it, if that tier is configured.
    if (isSeed && postings.length === 0 && ctx.renderer && sameSiteLinks(body, url, allow).length === 0) {
     const rendered = await ctx.renderer(url);
     if (rendered) {
      body = rendered;
      postings = findJobPostings(extractJsonLd(body));
      ctx.log(`${sourceKey}: ${url} rendered via Firecrawl`, { postings: postings.length });
     }
    }
    for (const node of postings) {
     const job = readJobPosting(node);
     if (!job.title) continue;
     const target = job.applyUrl && /^https?:/i.test(job.applyUrl) ? job.applyUrl : url;
     items.push({
      externalId: job.identifier ?? sha256(canonicalizeUrl(target) + "|" + job.title),
      url: target,
      payload: { job, organization, foundOn: url },
      jsonLd: [node],
      fetchedAt: ctx.now.toISOString(),
     });
     if (items.length >= w.maxItems) break;
    }

    // Only the seed pages contribute new links, keeping the crawl one level deep.
    if (depth0 > 0) {
     depth0--;
     for (const link of sameSiteLinks(body, url, allow)) {
      if (!seen.has(link) && frontier.length < maxPagesPerHost) frontier.push(link);
     }
    }
   }

   yield { items, cursor: { etags: nextEtags }, requestsUsed: requests, exhausted: true };
  },

  normalize(item: RawItem): NormalizedOpportunity | null {
   const { job, organization: fallbackOrg } = item.payload as {
    job: ReturnType<typeof readJobPosting>; organization: string | null;
   };
   if (!job.title) return null;
   return buildOpportunity({
    sourceKey,
    externalId: item.externalId,
    url: item.url,
    title: job.title,
    organization: job.organization ?? fallbackOrg,
    organizationUrl: job.organizationUrl,
    description: job.description,
    locationRaw: job.locationRaw,
    city: job.city,
    country: job.country,
    isRemote: job.isRemote,
    postedAt: job.postedAt,
    deadline: job.deadline,
    employmentType: job.employmentType,
    applyUrl: job.applyUrl,
    salary: job.salary,
   });
  },
 };
}
