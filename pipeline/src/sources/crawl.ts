import { extractJsonLd, findJobPostings, readJobPosting } from "../normalize/jsonld.js";
import { canonicalizeUrl } from "../normalize/url.js";
import { decodeEntities, sha256 } from "../normalize/text.js";
import { buildOpportunity } from "./build.js";
import { SourceConfigError } from "./types.js";
import type { SourceAdapter, SourceContext, SourceQuery, FetchWindow, SourcePage } from "./types.js";
import type { NormalizedOpportunity, RawItem } from "../types.js";

const LINK_RE = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;

function sameSiteLinks(html: string, base: string, allow: RegExp): string[] {
 const origin = new URL(base).origin;
 const out = new Set<string>();
 let m: RegExpExecArray | null;
 while ((m = LINK_RE.exec(html))) {
  let href = decodeEntities(m[1]).trim();
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
  let abs: string;
  try { abs = new URL(href, base).toString(); } catch { continue; }
  if (!abs.startsWith(origin)) continue;
  if (/\.(pdf|docx?|xlsx?|zip|jpe?g|png|gif|svg|mp4)(\?|$)/i.test(abs)) continue;
  if (!allow.test(new URL(abs).pathname)) continue;
  out.add(canonicalizeUrl(abs));
 }
 return [...out];
}

/**
 * Walks a small set of known career pages and reads their schema.org JobPosting
 * markup. Google requires that markup for a listing to appear in Google for Jobs,
 * so institutions that want to be found publish it — which means no crawler
 * framework, no headless browser and no model is needed to read them.
 *
 * Pages that render only via JavaScript are skipped rather than escalated; a
 * Firecrawl tier can be slotted in behind this same interface if that ever matters.
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

    const headers: Record<string, string> = {};
    if (etags[url]) headers["if-none-match"] = etags[url];

    let res;
    try { res = await ctx.http.get(url, headers); }
    catch (e) { ctx.log(`${sourceKey}: ${url} failed`, { error: String(e) }); requests++; continue; }
    requests++;

    if (res.notModified) continue;
    if (!res.ok || !res.body) continue;
    if (res.headers["etag"]) nextEtags[url] = res.headers["etag"];

    const postings = findJobPostings(extractJsonLd(res.body));
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
     for (const link of sameSiteLinks(res.body, url, allow)) {
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
