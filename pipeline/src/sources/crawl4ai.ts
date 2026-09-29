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
 * Confirmed against a live deployed instance: POST /crawl (synchronous --
 * distinct from the async /crawl/job) with {urls:[...]} returns
 * {success, results:[{url, html, cleaned_html, success, ...}]}, matching
 * parseResponse() below.
 *
 * Crawl4AI's own /token endpoint (request a JWT via email + a configured
 * api_token) turned out NOT to gate /crawl at all -- a live test sent an
 * unauthenticated request straight through. So the deployed Cloud Run
 * service is IAM-authenticated instead (no --allow-unauthenticated; see
 * .github/workflows/deploy-discovery-worker.yml), which Cloud Run enforces
 * before a request ever reaches the container, regardless of what the
 * vendor image itself does or doesn't check. That means every caller needs
 * a Google-signed identity token scoped to this service as the audience:
 * fetchMetadataIdentityToken() mints one automatically when this code is
 * itself running on Cloud Run (the discovery worker); a caller that isn't
 * on GCP infrastructure (discover.yml's nightly cron, a plain GitHub
 * Actions runner) has no metadata server to ask, so it mints its own via
 * `gcloud auth print-identity-token` in the workflow and supplies it as
 * apiToken instead.
 */

const METADATA_IDENTITY_URL =
 "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Only resolves when actually running on Cloud Run (or other GCP compute) --
 *  the metadata server is unreachable everywhere else, including a plain
 *  GitHub Actions runner, so this fails fast (2s timeout) and safely (null)
 *  off-GCP rather than hanging. */
async function fetchMetadataIdentityToken(audience: string): Promise<string | null> {
 try {
  const res = await fetch(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`, {
   headers: { "Metadata-Flavor": "Google" },
   signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) return null;
  const token = (await res.text()).trim();
  return token || null;
 } catch {
  return null;
 }
}

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
  const token = apiToken ?? await fetchMetadataIdentityToken(baseUrl);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
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
