/**
 * Tier-2.5 render fallback: a self-hosted Crawl4AI instance
 * (github.com/unclecode/crawl4ai, Docker image unclecode/crawl4ai), tried
 * before Firecrawl for the same JS-only-page case crawl.ts already handles
 * (see sources/firecrawl.ts's own header comment) -- free at this pipeline's
 * call volume (Cloud Run's always-free tier comfortably covers it; Firecrawl
 * costs a metered credit per call), so it goes first. Firecrawl stays
 * configured as the fallback-of-the-fallback for whenever a cold-started
 * Crawl4AI container is still spinning up its headless browser (can take
 * 15-30s from scale-to-zero) and times out.
 *
 * IMPORTANT: this assumes Crawl4AI's Docker server's REST contract as of the
 * 0.8.x line -- a synchronous POST /crawl accepting {urls:[...]} and
 * returning {results:[{url,html|cleaned_html,success}]}. That contract has
 * changed across Crawl4AI releases before and could again; this module was
 * written without a live deployed instance to verify against (this
 * environment's network egress is sandboxed). Confirm the actual shape
 * against your deployed container's own FastAPI docs at `<url>/docs` on
 * first real deploy, and adjust `parseResponse` below if it doesn't match --
 * a wrong assumption fails safe (returns null, same as no renderer
 * configured) rather than breaking the run, but it also means this tier
 * silently does nothing until confirmed working.
 */

interface Crawl4aiResult {
 url?: string;
 html?: string;
 cleaned_html?: string;
 success?: boolean;
}
interface Crawl4aiResponse {
 results?: Crawl4aiResult[];
}

function parseResponse(json: Crawl4aiResponse): string | null {
 const result = json.results?.[0];
 if (!result || result.success === false) return null;
 return result.html ?? result.cleaned_html ?? null;
}

export async function crawl4aiRender(
 baseUrl: string, url: string, apiToken: string | null = null, timeoutMs = 25_000,
): Promise<string | null> {
 try {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/crawl`, {
   method: "POST",
   headers,
   body: JSON.stringify({ urls: [url] }),
   signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  return parseResponse((await res.json()) as Crawl4aiResponse);
 } catch {
  return null;
 }
}

/** Composes with an optional next-tier renderer (Firecrawl): try Crawl4AI
 *  first, fall through on any failure/timeout/empty result. Both tiers
 *  missing/unconfigured collapses to null, same as before either existed. */
export function makeCrawl4aiRenderer(
 baseUrl: string | null, apiToken: string | null, next: ((url: string) => Promise<string | null>) | null,
): ((url: string) => Promise<string | null>) | null {
 if (!baseUrl) return next;
 return async (url: string) => (await crawl4aiRender(baseUrl, url, apiToken)) ?? (next ? await next(url) : null);
}
