import { canonicalizeUrl } from "../normalize/url.js";
import { decodeEntities } from "../normalize/text.js";

const LINK_RE = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;

/** Same-origin links on a page matching an allow-path regex, canonicalized and deduped. */
export function sameSiteLinks(html: string, base: string, allow: RegExp): string[] {
 const origin = new URL(base).origin;
 const out = new Set<string>();
 let m: RegExpExecArray | null;
 while ((m = LINK_RE.exec(html))) {
  let href = decodeEntities(m[1]).trim();
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
  let abs: string;
  try { abs = new URL(href, base).toString(); } catch { continue; }
  if (!abs.startsWith(origin)) continue;
  if (/\.(pdf|docx?|xlsx?|zip|jpe?g|png|gif|svg|mp4)(\?|$)/i.test(abs)) continue;
  if (!allow.test(new URL(abs).pathname)) continue;
  out.add(canonicalizeUrl(abs));
 }
 return [...out];
}
