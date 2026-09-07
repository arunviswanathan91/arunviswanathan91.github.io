import { parseEuraxessJob, typeFromResearcherProfile } from "../normalize/euraxess.js";
import { sha256 } from "../normalize/text.js";
import { sameSiteLinks } from "./links.js";
import { buildOpportunity } from "./build.js";
import type { SourceAdapter, SourceContext, SourceQuery, FetchWindow, SourcePage } from "./types.js";
import type { NormalizedOpportunity, RawItem } from "../types.js";

const SEARCH_PAGES = [
 "https://euraxess.ec.europa.eu/jobs/search?f%5B0%5D=offer_type%3Ajob_offer",
 "https://euraxess.ec.europa.eu/jobs/search?f%5B0%5D=offer_type%3Ajob_offer&page=1",
 "https://euraxess.ec.europa.eu/jobs/search?f%5B0%5D=offer_type%3Ajob_offer&page=2",
];
const DETAIL_PATH = /^\/jobs\/\d+$/;

/**
 * Dedicated adapter, not a generic crawl target: EURAXESS's job pages have no
 * JobPosting JSON-LD (confirmed against a live page -- the only JSON-LD present
 * is a BreadcrumbList), so their <dt>/<dd> field list needs its own parser
 * (src/normalize/euraxess.ts). The search results pages ARE server-rendered
 * with real links, so no rendering tier is needed here at all.
 */
export function euraxessAdapter(sourceKey: string): SourceAdapter {
 return {
  key: sourceKey,
  kind: "crawl",
  quotaProvider: "none",

  configure() { /* no credentials needed */ },

  async *fetch(_q: SourceQuery, w: FetchWindow, ctx: SourceContext): AsyncGenerator<SourcePage> {
   const seen = new Set<string>();
   const detailUrls = new Set<string>();
   let requests = 0;

   for (const searchUrl of SEARCH_PAGES) {
    if (requests >= w.maxRequests || Date.now() > w.deadlineAt) break;
    const res = await ctx.http.get(searchUrl);
    requests++;
    if (!res.ok || !res.body) continue;
    for (const link of sameSiteLinks(res.body, searchUrl, DETAIL_PATH)) detailUrls.add(link);
   }

   const items: RawItem[] = [];
   for (const url of detailUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    if (requests >= w.maxRequests || items.length >= w.maxItems || Date.now() > w.deadlineAt) break;

    const res = await ctx.http.get(url);
    requests++;
    if (!res.ok || !res.body) continue;

    const job = parseEuraxessJob(res.body);
    if (!job) continue;
    items.push({
     externalId: sha256(url),
     url,
     payload: job,
     fetchedAt: ctx.now.toISOString(),
    });
   }

   yield { items, cursor: null, requestsUsed: requests, exhausted: true };
  },

  normalize(item: RawItem): NormalizedOpportunity | null {
   const job = item.payload as ReturnType<typeof parseEuraxessJob>;
   if (!job) return null;
   const built = buildOpportunity({
    sourceKey,
    externalId: item.externalId,
    url: item.url,
    title: job.title,
    organization: job.organization,
    department: job.department,
    description: job.description,
    city: job.city,
    country: job.country,
    postedAt: job.postedAt,
    deadline: job.deadline,
    employmentType: job.contractType,
   });
   if (!built) return null;
   // EURAXESS self-reports the EU researcher career stage (R1-R4), which is a
   // more reliable postdoc signal than guessing from the title text.
   const fromProfile = typeFromResearcherProfile(job.researcherProfile);
   return fromProfile ? { ...built, opportunityType: fromProfile } : built;
  },
 };
}
