import { decodeEntities, htmlToText, sha256 } from "../normalize/text.js";
import { buildOpportunity } from "./build.js";
import { SourceConfigError } from "./types.js";
import type { SourceAdapter, SourceContext, SourceQuery, FetchWindow, SourcePage } from "./types.js";
import type { NormalizedOpportunity, RawItem } from "../types.js";

interface FeedEntry {
 title: string; link: string; description: string; published: string | null; guid: string | null;
}

const tag = (xml: string, name: string): string | null => {
 const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
 if (!m) return null;
 return decodeEntities(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim()) || null;
};

/** Atom puts the URL in an attribute rather than the element body. */
const atomLink = (xml: string): string | null => {
 const alt = xml.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
 if (alt) return decodeEntities(alt[1]);
 const any = xml.match(/<link\b[^>]*href=["']([^"']+)["']/i);
 return any ? decodeEntities(any[1]) : null;
};

export function parseFeed(xml: string): FeedEntry[] {
 const out: FeedEntry[] = [];
 const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
 for (const block of blocks) {
  const title = tag(block, "title");
  const link = tag(block, "link") ?? atomLink(block);
  if (!title || !link) continue;
  const description =
   tag(block, "content:encoded") ?? tag(block, "description") ??
   tag(block, "summary") ?? tag(block, "content") ?? "";
  const published =
   tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? tag(block, "dc:date");
  const parsed = published ? new Date(published) : null;
  out.push({
   title,
   link: link.trim(),
   description,
   published: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
   guid: tag(block, "guid") ?? tag(block, "id"),
  });
 }
 return out;
}

/**
 * RSS/Atom source. Costs no API quota and needs no crawler, which makes it the
 * cheapest and most reliable tier — always prefer a feed where one exists.
 */
export function feedAdapter(sourceKey: string): SourceAdapter {
 let url = "";
 let organization: string | null = null;

 return {
  key: sourceKey,
  kind: "feed",
  quotaProvider: "none",

  configure(config) {
   url = String(config.url ?? "");
   organization = config.organization ? String(config.organization) : null;
   if (!url) throw new SourceConfigError(`${sourceKey}: config.url is required`);
  },

  async *fetch(_q: SourceQuery, w: FetchWindow, ctx: SourceContext): AsyncGenerator<SourcePage> {
   const headers: Record<string, string> = {};
   const etag = ctx.cursorIn.etag as string | undefined;
   const lastModified = ctx.cursorIn.lastModified as string | undefined;
   if (etag) headers["if-none-match"] = etag;
   if (lastModified) headers["if-modified-since"] = lastModified;

   const res = await ctx.http.get(url, headers);
   if (res.notModified) {
    ctx.log(`${sourceKey}: not modified`);
    yield { items: [], cursor: ctx.cursorIn, requestsUsed: 1, exhausted: true };
    return;
   }
   if (!res.ok) throw new Error(`${sourceKey}: HTTP ${res.status}`);

   const since = ctx.cursorIn.sinceIso ? new Date(String(ctx.cursorIn.sinceIso)) : null;
   const entries = parseFeed(res.body).filter(e => {
    if (!since || !e.published) return true;
    return new Date(e.published) > since;
   }).slice(0, w.maxItems);

   const items: RawItem[] = entries.map(e => ({
    externalId: e.guid ?? sha256(e.link),
    url: e.link,
    payload: { ...e, organization },
    fetchedAt: ctx.now.toISOString(),
   }));

   const newest = entries.map(e => e.published).filter(Boolean).sort().pop() ?? null;
   yield {
    items,
    cursor: {
     etag: res.headers["etag"] ?? etag ?? null,
     lastModified: res.headers["last-modified"] ?? lastModified ?? null,
     sinceIso: newest ?? ctx.cursorIn.sinceIso ?? null,
    },
    requestsUsed: 1,
    exhausted: true,
   };
  },

  normalize(item: RawItem): NormalizedOpportunity | null {
   const p = item.payload as FeedEntry & { organization: string | null };
   return buildOpportunity({
    sourceKey,
    externalId: item.externalId,
    url: item.url,
    title: p.title,
    organization: p.organization,
    description: htmlToText(p.description ?? ""),
    postedAt: p.published,
   });
  },
 };
}
