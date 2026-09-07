import { htmlToText, sha256 } from "../normalize/text.js";
import { buildOpportunity } from "./build.js";
import { SourceConfigError } from "./types.js";
import type { SourceAdapter, SourceContext, SourceQuery, FetchWindow, SourcePage } from "./types.js";
import type { NormalizedOpportunity, RawItem } from "../types.js";

interface JoobleJob {
 id: string;
 title: string;
 location?: string;
 snippet?: string;
 salary?: string;
 source?: string;
 type?: string;
 link: string;
 company?: string;
 updated?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
 IN: "India", GB: "United Kingdom", DE: "Germany", NL: "Netherlands", SE: "Sweden",
 NO: "Norway", DK: "Denmark", FI: "Finland", CH: "Switzerland", FR: "France",
 BE: "Belgium", AT: "Austria", IE: "Ireland", US: "USA", CA: "Canada",
};

/**
 * Jooble is a job meta-search engine covering 60+ countries -- it already
 * aggregates from many of the large boards a direct crawl can't reach, via a
 * plain POST API rather than anything that needs defeating anti-bot measures.
 */
export function joobleAdapter(sourceKey: string): SourceAdapter {
 let apiKey = "";

 return {
  key: sourceKey,
  kind: "api",
  quotaProvider: "jooble",

  configure(_config, env) {
   apiKey = String(env.JOOBLE_API_KEY ?? "");
   if (!apiKey) throw new SourceConfigError("jooble: JOOBLE_API_KEY not set");
  },

  async *fetch(q: SourceQuery, w: FetchWindow, ctx: SourceContext): AsyncGenerator<SourcePage> {
   let requests = 0, collected = 0;
   const since = q.since ? new Date(q.since) : null;

   for (const country of q.countries) {
    for (const term of q.terms.slice(0, 3)) {
     if (requests >= w.maxRequests || collected >= w.maxItems || Date.now() > w.deadlineAt) break;

     const data = await ctx.http.postJson<{ jobs?: JoobleJob[] }>(`https://jooble.org/api/${apiKey}`, {
      keywords: term,
      location: COUNTRY_NAMES[country] ?? country,
      page: 1,
      ...(since ? { datecreatedfrom: since.toISOString().slice(0, 10) } : {}),
     });
     requests++;
     if (!data?.jobs?.length) continue;
     const items: RawItem[] = data.jobs.slice(0, w.maxItems - collected).map(j => ({
      externalId: j.id ? String(j.id) : sha256(j.link),
      url: j.link,
      payload: j,
      fetchedAt: ctx.now.toISOString(),
     }));
     collected += items.length;
     yield { items, cursor: { lastSuccessIso: ctx.now.toISOString() }, requestsUsed: 1, exhausted: false };
    }
   }
  },

  normalize(item: RawItem): NormalizedOpportunity | null {
   const j = item.payload as JoobleJob;
   return buildOpportunity({
    sourceKey,
    externalId: item.externalId || sha256(item.url),
    url: item.url,
    title: j.title ?? "",
    organization: j.company ?? null,
    description: htmlToText(j.snippet ?? ""),
    locationRaw: j.location ?? null,
    postedAt: j.updated ?? null,
    employmentType: j.type ?? null,
   });
  },
 };
}
