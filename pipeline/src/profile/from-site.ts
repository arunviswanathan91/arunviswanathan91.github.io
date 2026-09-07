import { htmlToText } from "../normalize/text.js";

export interface SiteSnapshot {
 tags: string[];
 publications: { year: string | null; title: string; venue: string | null }[];
 currentRole: string | null;
 fetchedAt: string;
}

function extractAll(html: string, tagClass: string): string[] {
 const re = new RegExp(`class="${tagClass}"[^>]*>([\\s\\S]*?)<`, "gi");
 const out: string[] = [];
 let m: RegExpExecArray | null;
 while ((m = re.exec(html))) {
  const text = htmlToText(m[1]).trim();
  if (text) out.push(text);
 }
 return out;
}

/**
 * Seeds the search profile from the site's own markup rather than the CV PDF:
 * the research-area `.tag` list, `.pub-title`/`.pub-venue` publications and the
 * `.tl-role` timeline are already structured, so there is nothing to parse out
 * of unstructured text and nothing personally identifying leaves this process.
 */
export function extractSiteSnapshot(html: string): SiteSnapshot {
 const tags = extractAll(html, "tag");
 const titles = extractAll(html, "pub-title");
 const venues = extractAll(html, "pub-venue");
 const years = extractAll(html, "pub-year");
 const roles = extractAll(html, "tl-role");

 const publications = titles.map((title, i) => ({
  title,
  venue: venues[i] ?? null,
  year: years[i] ?? null,
 }));

 return {
  tags,
  publications,
  currentRole: roles[0] ?? null,
  fetchedAt: new Date().toISOString(),
 };
}

/** Turns the snapshot into search terms for the discovery profile's `terms` column. */
export function termsFromSnapshot(snapshot: SiteSnapshot): string[] {
 const terms = snapshot.tags.map(t => t.toLowerCase());
 return [...new Set(terms)].slice(0, 8);
}
