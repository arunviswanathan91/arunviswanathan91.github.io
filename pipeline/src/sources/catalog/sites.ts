/**
 * Seed crawl targets: career pages expected to publish schema.org JobPosting
 * markup. Each becomes one row in discovery_sources with kind='crawl' --
 * adding a target is editing this list, never writing an adapter.
 *
 * Deliberately excludes Indian institutes: postdoc search is international
 * (Europe/Scandinavia specifically), not India-based -- India-side coverage
 * comes from the Adzuna adapter instead.
 *
 * Empty on purpose. Every candidate checked against the live site failed:
 *   - DKFZ (dkfz.de/en/jobs/index.php): 404.
 *   - EMBL (embl.org/jobs/): redirects to a Workday-hosted SPA
 *     (embl.wd103.myworkdayjobs.com) that renders client-side with no
 *     JSON-LD in the initial HTML -- exactly the case the Firecrawl tier
 *     (Phase 3) exists for, not something a plain fetch can read.
 * Shipping guessed URLs as if verified would silently crawl nothing while
 * looking configured. Add rows here (or directly to discovery_sources) once
 * a real target has been checked.
 */
export interface CrawlSeed {
 key: string;
 seedUrls: string[];
 organization: string;
 allowPathRe?: string;
 maxPages?: number;
}

export const CRAWL_SEEDS: CrawlSeed[] = [];
