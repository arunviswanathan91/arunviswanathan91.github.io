// Publications as an academic CV lists them: grouped by kind (and, if wanted, by whether you
// led the work), each entry a citation with the author list, your own name in bold.
// Pure functions, shared by the on-screen preview and the PDF so the two cannot drift apart.
import type { ResumeItem, ResumeLink, ResumeSection } from "./model.ts";

export type PubKind = "article" | "preprint" | "submitted" | "conference" | "chapter";
export type PubRole = "first" | "cofirst" | "corresponding" | "co";
export const PUB_KINDS: [PubKind, string][] = [
  ["article", "Journal article (published)"], ["preprint", "Preprint"], ["submitted", "Submitted / in preparation"],
  ["conference", "Conference paper or abstract"], ["chapter", "Book chapter"],
];
export const PUB_ROLES: [PubRole, string][] = [["first", "First author"], ["cofirst", "Co-first author"], ["corresponding", "Corresponding author"], ["co", "Co-author"]];
const KIND_HEADING: Record<PubKind, string> = {
  article: "Peer-reviewed articles", preprint: "Preprints", submitted: "Submitted and in preparation",
  conference: "Conference papers and abstracts", chapter: "Book chapters",
};

export interface PubOptions {
  /** "citation": Authors. Title. Journal. Year;details.  "classic": bold title, journal, date on the side. */
  style: "citation" | "classic";
  group: "none" | "kind" | "role" | "both";
  /** How many authors to print before "et al." (0 = all). Your own name is always kept. */
  maxAuthors: number;
  numbered: boolean;
  showDoi: boolean;
  /** Other spellings of your name to bold, comma-separated ("Viswanathan AG, Arun V"). */
  aliases: string;
}
export const DEFAULT_PUB: PubOptions = { style: "citation", group: "kind", maxAuthors: 6, numbered: true, showDoi: true, aliases: "" };
export const pubOptions = (s: Pick<ResumeSection, "pub">): PubOptions => ({ ...DEFAULT_PUB, ...(s.pub ?? {}) });

// ── Authors ────────────────────────────────────────────────────────────────

/** "A B, C D" or "B, A.; D, C." → one string per author. A semicolon anywhere means commas belong to names. */
export function splitAuthors(text: string): string[] {
  const t = text.replace(/\s+/g, " ").replace(/\s+and\s+/gi, ", ").replace(/,?\s*et al\.?\s*$/i, "").trim();
  if (!t) return [];
  return (t.includes(";") ? t.split(";") : t.split(",")).map((a) => a.trim().replace(/^&\s*/, "")).filter(Boolean);
}

const words = (s: string) => s.toLowerCase().replace(/[.,*†‡✉]/g, " ").split(/\s+/).filter(Boolean);

/**
 * Whether an author entry is the resume's owner. Matches the family name plus the given name or its
 * initial, in either order: "Arun Viswanathan", "Viswanathan A", "Viswanathan, A.", "A. Viswanathan".
 */
export function isMe(author: string, profileName: string, aliases = ""): boolean {
  const a = words(author);
  if (!a.length) return false;
  for (const alias of aliases.split(",").map((x) => words(x).join(" ")).filter(Boolean)) if (a.join(" ") === alias) return true;
  const me = words(profileName);
  if (me.length < 2) return me.length === 1 && a.length === 1 && a[0] === me[0];
  const given = me[0], family = me[me.length - 1];
  if (!a.includes(family)) return false;
  const rest = a.filter((w) => w !== family);
  if (!rest.length) return false;
  // "arun", "a", or initials run together such as "ag" (Arun G.)
  return rest.some((w) => w === given || (w.length <= 3 && w[0] === given[0]));
}

export interface AuthorRun { text: string; me: boolean }
/**
 * The author list as printed: at most `max` names, then "et al.". If your name falls outside the
 * first `max`, the list is cut one earlier and continues "…, You, et al." so you are always visible.
 */
export function authorRuns(text: string, profileName: string, max: number, aliases = ""): AuthorRun[] {
  const all = splitAuthors(text).map((a) => ({ text: a, me: isMe(a, profileName, aliases) }));
  if (!max || all.length <= max) return all;
  const mine = all.findIndex((a) => a.me);
  if (mine < max) return [...all.slice(0, max), { text: "et al.", me: false }];
  const lead = all.slice(0, Math.max(1, max - 1));
  const tail = mine === all.length - 1 ? [] : [{ text: "et al.", me: false }];
  return [...lead, { text: "…", me: false }, all[mine], ...tail];
}

// ── Kind and role ──────────────────────────────────────────────────────────

/** The kind chosen for the entry, or a guess from its journal and title when none was chosen. */
export function pubKind(i: ResumeItem): PubKind {
  if (i.kind) return i.kind;
  const venue = i.subtitle.toLowerCase(), all = `${i.title} ${i.subtitle}`.toLowerCase();
  if (/\b(in communication|under review|submitted|in preparation|in prep|in revision|under revision)\b/.test(all)) return "submitted";
  if (/\b(biorxiv|medrxiv|arxiv|chemrxiv|research square|preprint|ssrn)\b/.test(all)) return "preprint";
  // A venue that is a meeting, or a title that announces itself ("Conference publication: …", "Abstract P29: …").
  if (/\b(conference|proceedings|symposium|supplement|suppl|congress|annual meeting)\b/.test(venue) || /^\s*(conference|abstract|poster)\b/.test(i.title.toLowerCase())) return "conference";
  if (/\b(chapter|handbook|springer protocols|methods in molecular biology)\b/.test(venue)) return "chapter";
  return "article";
}

/**
 * The role chosen for the entry, or worked out from where your name stands in the author list.
 * Null when neither is known: a CV must not claim first authorship on a guess.
 */
export function pubRole(i: ResumeItem, profileName: string, aliases = ""): PubRole | null {
  if (i.role) return i.role;
  const authors = splitAuthors(i.authors ?? "");
  if (!authors.length) return null;
  return isMe(authors[0], profileName, aliases) ? "first" : "co";
}
const leads = (r: PubRole | null) => r !== null && r !== "co";

export interface PubGroup { heading: string | null; items: ResumeItem[] }
/** Entries in the order given, split under sub-headings. Empty groups are left out. */
export function pubGroups(items: ResumeItem[], o: PubOptions, profileName: string): PubGroup[] {
  if (o.group === "none") return [{ heading: null, items }];
  const role = (i: ResumeItem) => pubRole(i, profileName, o.aliases);
  if (o.group === "role") {
    return [
      { heading: "First-author publications", items: items.filter((i) => leads(role(i))) },
      { heading: "Co-author publications", items: items.filter((i) => role(i) === "co") },
      { heading: "Other publications", items: items.filter((i) => role(i) === null) },   // no authors entered, no role chosen
    ].filter((g) => g.items.length);
  }
  const out: PubGroup[] = [];
  for (const [kind] of PUB_KINDS) {
    const of = items.filter((i) => pubKind(i) === kind);
    if (!of.length) continue;
    const first = of.filter((i) => leads(role(i))), co = of.filter((i) => role(i) === "co"), unknown = of.filter((i) => role(i) === null);
    // Splitting by role only where both exist keeps a short list from becoming all headings.
    if (o.group === "both" && kind === "article" && first.length && co.length) {
      out.push({ heading: `${KIND_HEADING[kind]}: first author`, items: first }, { heading: `${KIND_HEADING[kind]}: co-author`, items: co });
      if (unknown.length) out.push({ heading: `${KIND_HEADING[kind]}: other`, items: unknown });
    } else out.push({ heading: KIND_HEADING[kind], items: of });
  }
  return out;
}

// ── Citation ───────────────────────────────────────────────────────────────

export interface Run { text: string; bold?: boolean; italic?: boolean }
const yearOf = (i: ResumeItem) => `${i.start} ${i.end}`.match(/\b(19|20)\d{2}\b/)?.[0] ?? "";
const stop = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
/** "10.1038/x" from a doi.org link (or a bare DOI). */
export function doiOf(link: string): string {
  const m = link.trim().match(/(?:doi\.org\/|^doi:\s*)?(10\.\d{4,9}\/\S+)$/i);
  return m ? m[1] : "";
}

/**
 * One entry as a citation, in the order biomedical journals use (Vancouver style):
 * Authors. Title. Journal. Year;volume(issue):pages. doi. A missing part is simply left out.
 */
export function citationRuns(i: ResumeItem, o: PubOptions, profileName: string): Run[] {
  const runs: Run[] = [];
  const authors = authorRuns(i.authors ?? "", profileName, o.maxAuthors, o.aliases);
  authors.forEach((a, n) => {
    const last = n === authors.length - 1;
    // "…" already reads as a gap: no comma before or after it.
    const sep = last ? "" : a.text === "…" || authors[n + 1].text === "…" ? " " : ", ";
    runs.push({ text: a.text, bold: a.me }, { text: sep });
  });
  if (authors.length) runs.push({ text: /\.$/.test(authors[authors.length - 1].text) ? " " : ". " });
  // "Conference publication: …" repeats what the sub-heading already says.
  const title = i.title.replace(/\s+/g, " ").trim().replace(/^conference (publication|paper|abstract)\s*[:\-–]\s*/i, "");
  if (title) runs.push({ text: `${stop(title)} ` });
  const venue = i.subtitle.trim().replace(/[.,;]$/, "");
  const year = yearOf(i), details = (i.details ?? "").trim().replace(/^[;,]\s*/, "").replace(/\.$/, "");
  if (venue) runs.push({ text: venue, italic: true }, { text: year || details ? ". " : "." });
  if (year || details) runs.push({ text: `${[year, details].filter(Boolean).join(";")}.` });
  const role = i.role === "cofirst" ? "co-first author" : i.role === "corresponding" ? "corresponding author" : "";
  if (role) runs.push({ text: ` (${role})` });
  const doi = o.showDoi ? doiOf(i.link) : "";
  if (doi) runs.push({ text: ` doi:${doi}` });
  return runs.filter((r) => r.text);
}

/** Newest first, entries without a year last; the order among equals is kept. */
export function sortNewestFirst(items: ResumeItem[]): ResumeItem[] {
  return items.map((i, n) => ({ i, n, y: Number(yearOf(i)) || 0 })).sort((a, b) => b.y - a.y || a.n - b.n).map((x) => x.i);
}

// ── Research profile links ─────────────────────────────────────────────────

export const PROFILE_PRESETS: { label: string; placeholder: string }[] = [
  { label: "ORCID", placeholder: "https://orcid.org/0000-0000-0000-0000" },
  { label: "Google Scholar", placeholder: "https://scholar.google.com/citations?user=…" },
  { label: "ResearchGate", placeholder: "https://www.researchgate.net/profile/…" },
  { label: "LinkedIn", placeholder: "https://www.linkedin.com/in/…" },
  { label: "GitHub", placeholder: "https://github.com/…" },
];
const isPreset = (label: string) => PROFILE_PRESETS.some((x) => x.label.toLowerCase() === label.trim().toLowerCase());
/** Header links worth printing: a profile added from the presets but not filled in yet is left out. */
export const shownLinks = (links: ResumeLink[]) => links.filter((l) => (l.label || l.url) && !(isPreset(l.label) && !l.url.trim()));

/** What a header link prints as. An ORCID link shows the iD itself, so it survives on paper. */
export function linkText(l: ResumeLink): string {
  const id = l.url.match(/orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i)?.[1];
  if (id) return `ORCID ${id}`;
  return l.label || l.url;
}
