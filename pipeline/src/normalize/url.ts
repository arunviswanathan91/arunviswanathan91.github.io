import { createHash } from "node:crypto";

/** Tracking parameters that never identify a vacancy. */
const DROP_EXACT = new Set([
 "gclid","fbclid","msclkid","ref","refid","referrer","src","source","trk","trackingid",
 "position","pagenum","cid","campaign","aff","affid","partner","jobposition","recruiter",
 "lang","hl","locale","from","cx","ved","usg",
]);
const DROP_PREFIX = /^(utm_|_ga|mc_|wt\.|pk_|rx_)/i;

/** Hosts where a query param IS the vacancy identity and must survive. */
const KEEP_PARAMS: Record<string, string[]> = {
 "jobs.ac.uk": ["job"],
 "euraxess.ec.europa.eu": ["jobid"],
 "www.nature.com": ["id"],
 "nature.com": ["id"],
 "taleo.net": ["job"],
};

/** SPA job boards where the fragment carries the route. */
const KEEP_FRAGMENT = [/myworkdayjobs\.com$/i, /taleo\.net$/i];

const stripHost = (h: string) => h.replace(/^(www|m)\./i, "");

export function canonicalizeUrl(input: string): string {
 let u: URL;
 try { u = new URL(input.trim()); } catch { return input.trim(); }
 if (u.protocol !== "http:" && u.protocol !== "https:") return input.trim();

 u.protocol = "https:";
 u.hostname = u.hostname.toLowerCase();
 u.port = "";
 const bareHost = stripHost(u.hostname);
 u.hostname = bareHost;

 if (!KEEP_FRAGMENT.some(re => re.test(bareHost))) u.hash = "";

 const keep = new Set(
  Object.entries(KEEP_PARAMS)
   .filter(([host]) => bareHost === host || bareHost.endsWith("." + host))
   .flatMap(([, params]) => params)
 );
 const kept: [string, string][] = [];
 for (const [k, v] of u.searchParams) {
  const lower = k.toLowerCase();
  if (keep.has(lower)) { kept.push([k, v]); continue; }
  if (DROP_PREFIX.test(lower) || DROP_EXACT.has(lower)) continue;
  kept.push([k, v]);
 }
 kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
 u.search = "";
 for (const [k, v] of kept) u.searchParams.append(k, v);

 u.pathname = u.pathname.replace(/\/{2,}/g, "/");
 if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");

 return u.toString();
}

export const urlHash = (canon: string) => createHash("sha256").update(canon).digest("hex");

/**
 * Applicant-tracking-system identity. This is the highest-yield dedup signal for
 * industry roles: the same requisition appears on the company site, JSearch and
 * Adzuna with three different URLs but one ATS id.
 */
export function atsKey(rawUrl: string): string | null {
 let u: URL;
 try { u = new URL(rawUrl); } catch { return null; }
 const host = stripHost(u.hostname.toLowerCase());
 const path = u.pathname;
 let m: RegExpMatchArray | null;

 if (/(^|\.)(boards|job-boards)\.greenhouse\.io$/.test(host)) {
  m = path.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (m) return `greenhouse:${m[1].toLowerCase()}:${m[2]}`;
 }
 if (/(^|\.)jobs\.lever\.co$/.test(host)) {
  m = path.match(/^\/([^/]+)\/([0-9a-f-]{16,})/i);
  if (m) return `lever:${m[1].toLowerCase()}:${m[2].toLowerCase()}`;
 }
 if (/myworkdayjobs\.com$/.test(host)) {
  const tenant = host.split(".")[0];
  m = (path + u.hash).match(/(_[A-Z]{1,6}-?\d{3,})/);
  if (m) return `workday:${tenant}:${m[1]}`;
 }
 if (/(^|\.)jobs\.smartrecruiters\.com$/.test(host)) {
  m = path.match(/^\/([^/]+)\/(\d+)/);
  if (m) return `smartrecruiters:${m[1].toLowerCase()}:${m[2]}`;
 }
 if (/(^|\.)jobs\.ashbyhq\.com$/.test(host)) {
  m = path.match(/^\/([^/]+)\/([0-9a-f-]{16,})/i);
  if (m) return `ashby:${m[1].toLowerCase()}:${m[2].toLowerCase()}`;
 }
 if (/recruitee\.com$/.test(host)) {
  m = path.match(/^\/o\/([^/]+)/);
  if (m) return `recruitee:${host.split(".")[0]}:${m[1].toLowerCase()}`;
 }
 if (/icims\.com$/.test(host)) {
  m = path.match(/\/jobs\/(\d+)/);
  if (m) return `icims:${host.split(".")[0]}:${m[1]}`;
 }
 if (/euraxess\.ec\.europa\.eu$/.test(host)) {
  m = path.match(/\/jobs\/(\d+)/) ?? u.search.match(/[?&]jobId=(\d+)/i);
  if (m) return `euraxess:${m[1]}`;
 }
 return null;
}
