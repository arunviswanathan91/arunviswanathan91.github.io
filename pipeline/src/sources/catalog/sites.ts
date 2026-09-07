/**
 * Seed crawl targets: career pages expected to publish schema.org JobPosting
 * markup. Each becomes one row in discovery_sources with kind='crawl' --
 * adding a target is editing this list, never writing an adapter.
 *
 * Deliberately excludes Indian institutes: postdoc search is international
 * (Europe/Scandinavia specifically), not India-based -- India-side coverage
 * comes from the Adzuna adapter instead.
 *
 * Candidates checked against the live site and rejected:
 *   - DKFZ (dkfz.de/en/jobs/index.php): 404.
 *   - EMBL (embl.org/jobs/): redirects to a Workday-hosted SPA that renders
 *     client-side with no JSON-LD in the initial HTML. crawl.ts now has a
 *     Firecrawl fallback for exactly this shape (see sources/firecrawl.ts),
 *     but re-adding EMBL here still needs a live check with FIRECRAWL_API_KEY
 *     set to confirm the rendered DOM actually carries JobPosting markup --
 *     Workday boards often load listings via a separate API call the render
 *     alone won't trigger, so this isn't a guaranteed win.
 * postdocjobs.com's homepage embeds 13+ JobPosting nodes directly (verified
 * live) -- no per-posting URL in their JSON-LD, so every posting from this
 * source links back to the listing page rather than its own page; a real but
 * minor trade-off given the source data has nothing better to offer.
 */
export interface CrawlSeed {
 key: string;
 seedUrls: string[];
 organization: string;
 allowPathRe?: string;
 maxPages?: number;
}

export const CRAWL_SEEDS: CrawlSeed[] = [
 {
  key: "crawl:postdocjobs",
  seedUrls: ["https://postdocjobs.com/", "https://postdocjobs.com/job/job/index?page=2"],
  organization: "PostdocJobs.com",
  allowPathRe: "^/job/job/index$",
  maxPages: 10,
 },
];
