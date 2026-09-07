/**
 * Tier-3 fallback for pages that render only via JavaScript (Workday-hosted
 * career boards being the recurring case -- see the EMBL note in
 * catalog/sites.ts). Chosen over scrape.do: Firecrawl's flat per-scrape credit
 * already includes rendering, and its `rawHtml` format returns the DOM as
 * fetched -- including any JSON-LD the client-side render injected -- so the
 * existing `extractJsonLd`/`findJobPostings` parser needs no changes to read it.
 *
 * Deliberately last-resort: crawl.ts only calls this when a seed URL's plain
 * fetch came back with zero JobPosting nodes, and only up to a small per-run
 * cap (see FIRECRAWL_MAX_PER_RUN), so a free-tier allowance lasts the month
 * even run nightly.
 */
export class FirecrawlBudget {
 private used = 0;
 constructor(private readonly max: number) {}
 get remaining() { return this.max - this.used; }
 take(): boolean {
  if (this.used >= this.max) return false;
  this.used++;
  return true;
 }
}

interface FirecrawlResponse {
 success?: boolean;
 data?: { rawHtml?: string };
}

export async function firecrawlRender(
 apiKey: string, url: string, budget: FirecrawlBudget,
): Promise<string | null> {
 if (!budget.take()) return null;
 try {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
   method: "POST",
   headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
   },
   body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false }),
   signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as FirecrawlResponse;
  return json.data?.rawHtml ?? null;
 } catch {
  return null;
 }
}

/** Builds the fallback function threaded through SourceContext.renderer, or
 *  null when there's no key configured -- callers treat a null renderer as
 *  "this tier doesn't exist right now", not an error. */
export function makeRenderer(
 apiKey: string | null, maxPerRun: number,
): ((url: string) => Promise<string | null>) | null {
 if (!apiKey) return null;
 const budget = new FirecrawlBudget(maxPerRun);
 return (url: string) => firecrawlRender(apiKey, url, budget);
}
