import { htmlToText, sha256 } from "../normalize/text.js";
import { buildOpportunity } from "./build.js";
import { SourceConfigError } from "./types.js";
import type { SourceAdapter, SourceContext, SourceQuery, FetchWindow, SourcePage } from "./types.js";
import type { NormalizedOpportunity, RawItem, SalaryEvidence } from "../types.js";

interface AdzunaResult {
 id: string;
 title: string;
 description: string;
 created: string;
 redirect_url: string;
 salary_min?: number;
 salary_max?: number;
 salary_is_predicted?: string;
 company?: { display_name?: string };
 location?: { display_name?: string; area?: string[] };
 contract_time?: string;
}

const currencyFor = (country: string | undefined) => {
 const name = (country ?? "").toLowerCase();
 if (name.includes("india")) return "INR";
 if (name.includes("united kingdom")) return "GBP";
 if (name.includes("united states")) return "USD";
 if (name.includes("australia")) return "AUD";
 if (name.includes("canada")) return "CAD";
 if (name.includes("singapore")) return "SGD";
 if (name.includes("switzerland")) return "CHF";
 if (name.includes("japan")) return "JPY";
 return null;
};

const COUNTRY_PATHS: Record<string, string> = {
 IN: "in", GB: "gb", US: "us", DE: "de", NL: "nl", FR: "fr", AU: "au", CA: "ca",
 SG: "sg", AT: "at", BE: "be", CH: "ch", ES: "es", IT: "it", PL: "pl", NZ: "nz", ZA: "za",
};

/**
 * Adzuna's free tier is roughly 1000 calls a month, so this adapter is
 * deliberately frugal: one request per (country x term) pair, newest first,
 * bounded by the incremental cursor.
 */
export function adzunaAdapter(sourceKey: string): SourceAdapter {
 let appId = "";
 let appKey = "";
 let resultsPerPage = 50;

 return {
  key: sourceKey,
  kind: "api",
  quotaProvider: "adzuna",

  configure(config, env) {
   appId = String(env.ADZUNA_APP_ID ?? "");
   appKey = String(env.ADZUNA_APP_KEY ?? "");
   if (config.resultsPerPage) resultsPerPage = Number(config.resultsPerPage);
   if (!appId || !appKey) throw new SourceConfigError("adzuna: ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
  },

  async *fetch(q: SourceQuery, w: FetchWindow, ctx: SourceContext): AsyncGenerator<SourcePage> {
   const countries = q.countries.map(c => COUNTRY_PATHS[c]).filter(Boolean);
   if (!countries.length) countries.push("in");

   const maxAgeDays = q.since
    ? Math.max(1, Math.ceil((ctx.now.getTime() - q.since.getTime()) / 86400000) + 1)
    : 30;

   let requests = 0;
   let collected = 0;

   for (const country of countries) {
    for (const term of q.terms.slice(0, 4)) {
     if (requests >= w.maxRequests || collected >= w.maxItems || Date.now() > w.deadlineAt) break;

     const url =
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
      `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
      `&results_per_page=${resultsPerPage}` +
      `&what=${encodeURIComponent(term)}` +
      `&max_days_old=${maxAgeDays}` +
      `&sort_by=date&content-type=application/json`;

     const data = await ctx.http.getJson<{ results?: AdzunaResult[] }>(url);
     requests++;
     if (!data?.results?.length) continue;

     const items: RawItem[] = data.results.slice(0, w.maxItems - collected).map(r => ({
      externalId: String(r.id),
      url: r.redirect_url,
      payload: r,
      fetchedAt: ctx.now.toISOString(),
     }));
     collected += items.length;

     yield {
      items,
      cursor: { lastSuccessIso: ctx.now.toISOString() },
      requestsUsed: 1,
      exhausted: false,
     };
    }
   }
  },

  normalize(item: RawItem): NormalizedOpportunity | null {
   const r = item.payload as AdzunaResult;
   const predicted = r.salary_is_predicted === "1";
   const min = r.salary_min != null && r.salary_min > 0 ? r.salary_min : null;
   const max = r.salary_max != null && r.salary_max > 0 ? r.salary_max : null;
   const salary: SalaryEvidence | null =
    min != null || max != null
     ? {
        min,
        max: max ?? min,
        // Adzuna reports in the currency of the country endpoint.
        currency: currencyFor(r.location?.area?.[0]),
        period: "year",
        isPredicted: predicted,
        extractedFrom: "api",
        confidence: predicted ? 0.4 : 0.9,
        evidence: null,
       }
     : null;

   const area = r.location?.area ?? [];
   return buildOpportunity({
    sourceKey,
    externalId: item.externalId || sha256(item.url),
    url: item.url,
    title: r.title ?? "",
    organization: r.company?.display_name ?? null,
    description: htmlToText(r.description ?? ""),
    locationRaw: r.location?.display_name ?? null,
    city: area.length ? area[area.length - 1] : null,
    country: area.length ? area[0] : null,
    postedAt: r.created ?? null,
    employmentType: r.contract_time ?? null,
    salary,
   });
  },
 };
}
