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
 * jobRxiv's postdoc category is also crawled directly because its feed has
 * proved unreliable in production while the category page remains current.
 * postdocjobs.com's homepage embeds 13+ JobPosting nodes directly (verified
 * live) -- no per-posting URL in their JSON-LD, so every posting from this
 * source links back to the listing page rather than its own page; a real but
 * minor trade-off given the source data has nothing better to offer.
 *
 * jobs.ac.uk, Science Careers (AAAS), Times Higher Education unijobs, Nature
 * Careers and University Positions were added on request without the live
 * check the entries above got -- this session's sandboxed network egress
 * blocked every outbound request to these hosts, including a bare
 * robots.txt fetch. They lean on the generic crawlAdapter's existing
 * JobPosting-markup parsing and Firecrawl-rendered-fallback tier rather than
 * a bespoke parser, so a wrong guess here degrades to zero items from that
 * source (visible in the run's per-source checked/matched counts) rather
 * than breaking anything -- but treat their first live run as the real
 * verification step this list normally requires before landing.
 *
 * academicpositions.com and findapostdoc.com were requested too but are
 * deliberately left out: academicpositions.com's robots.txt disallows every
 * path and findapostdoc.com returns 403 to automated requests (both already
 * documented in feeds.ts, discovered when checking them as feed candidates).
 * Both blocks are about automated access in general, not this specific
 * crawl path, so they're respected here as well.
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
  key: "crawl:jobrxiv",
  seedUrls: ["https://jobrxiv.org/job-category/postdoc/"],
  organization: "jobRxiv",
  allowPathRe: "^/job/",
  maxPages: 12,
 },
 {
  key: "crawl:postdocjobs",
  seedUrls: ["https://postdocjobs.com/", "https://postdocjobs.com/job/job/index?page=2"],
  organization: "PostdocJobs.com",
  allowPathRe: "^/job/job/index$",
  maxPages: 10,
 },
 {
  key: "crawl:jobsacuk",
  seedUrls: ["https://www.jobs.ac.uk/categories/postdoc-jobs/1"],
  organization: "jobs.ac.uk",
  maxPages: 12,
 },
 {
  key: "crawl:sciencecareers",
  seedUrls: ["https://jobs.sciencecareers.org/jobs/europe/postdoc/"],
  organization: "Science Careers",
  maxPages: 12,
 },
 {
  key: "crawl:timeshighereducation",
  seedUrls: ["https://www.timeshighereducation.com/unijobs/listings/europe/postdocs/"],
  organization: "Times Higher Education",
  maxPages: 12,
 },
 {
  key: "crawl:naturecareers",
  seedUrls: ["https://www.nature.com/naturecareers/jobs/postdoctoral/europe/5/"],
  organization: "Nature Careers",
  maxPages: 12,
 },
 {
  key: "crawl:universitypositions",
  seedUrls: ["https://universitypositions.eu/jobs/postdoc"],
  organization: "University Positions",
  maxPages: 12,
 },
];
