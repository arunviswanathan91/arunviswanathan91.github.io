// A thesis chapter's outline: sections and subsections with paragraph targets, what each
// should cover, notes and a done toggle, plus the figures and tables to prepare. Can be read
// from a Word writing plan (headings "2.1 Cancer (28 paragraphs)", then a table per section:
// Section | Paras | What to cover | Notes). Pure functions, tested in test/thesis-outline.test.ts.

export interface OutlineItem {
  id: string;
  kind: "section" | "subsection" | "figure";
  /** "2.1", "2.1.3"; empty for figures. */
  number: string;
  title: string;
  /** Target paragraphs (may be fractional, e.g. 1.5). */
  paras: number | null;
  cover: string;
  notes: string;
  done: boolean;
}

/** A block of a Word document: a paragraph (with its style) or a table (rows of cell text). */
export type DocBlock = { type: "p"; style: string; text: string } | { type: "table"; rows: string[][] };

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** Text of a run of WordprocessingML: <w:t> pieces joined, tabs and breaks as spaces. */
function textOf(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)) out += m[1] !== undefined ? decode(m[1]) : " ";
  return out.replace(/\s+/g, " ").trim();
}

/** Paragraphs and tables of word/document.xml, in order. Paragraphs inside tables become cell text. */
export function docxBlocks(documentXml: string): DocBlock[] {
  const body = documentXml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? documentXml;
  const blocks: DocBlock[] = [];
  // Top-level tables and paragraphs. Tables are matched first so their paragraphs stay inside them.
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g)) {
    const part = m[0];
    if (part.startsWith("<w:tbl>")) {
      const rows = [...part.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => textOf(p[0])).filter(Boolean).join(" / ")),
      );
      blocks.push({ type: "table", rows });
    } else {
      const style = part.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "Normal";
      const text = textOf(part);
      if (text) blocks.push({ type: "p", style, text });
    }
  }
  return blocks;
}

const isHeading = (style: string) => /^(Heading|heading)\s?[1-3]$|^Heading[1-3]$/.test(style) || /^Heading\d/.test(style);
const NUMBERED = /^(\d+(?:\.\d+)+)\.?\s+(.+)$/;
const parasOf = (s: string) => { const m = s.match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
let counter = 0;
const newId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Read a writing plan: numbered headings are sections, rows of Section/Paras tables are subsections,
 *  and lines starting "Table", "Figure", "Flowchart" or "Additional table" are figures to prepare. */
export function parseOutline(blocks: DocBlock[]): { title: string; subtitle: string; items: OutlineItem[]; total: string } {
  const items: OutlineItem[] = [];
  const byNumber = new Map<string, OutlineItem>();
  let title = "", subtitle = "", total = "";
  let lastSection: OutlineItem | null = null;
  let seenHeading = false;
  for (const b of blocks) {
    if (b.type === "p") {
      const m = b.text.match(NUMBERED);
      if (isHeading(b.style) && m) {
        // "2.1 Cancer (28 paragraphs – 30- 35%)"
        const paren = m[2].match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        const name = (paren ? paren[1] : m[2]).trim();
        const paras = paren && /paragraph|para/i.test(paren[2]) ? parasOf(paren[2]) : null;
        const item: OutlineItem = { id: newId(), kind: "section", number: m[1], title: name, paras, cover: "", notes: "", done: false };
        items.push(item); byNumber.set(item.number, item); lastSection = item; seenHeading = true;
        continue;
      }
      if (isHeading(b.style)) { lastSection = null; seenHeading = true; continue; } // "Summary" and other plain headings
      if (/^(table|figure|flowchart|additional table|supplementary (table|figure))\b/i.test(b.text)) {
        items.push({ id: newId(), kind: "figure", number: "", title: b.text, paras: null, cover: "", notes: "", done: false });
        continue;
      }
      if (!seenHeading) { if (!title) title = b.text; else if (!subtitle) subtitle = b.text; continue; }
      // A note under a section heading (before or after its table).
      if (lastSection && !/^figures? and tables/i.test(b.text)) lastSection.notes = [lastSection.notes, b.text].filter(Boolean).join(" ");
      continue;
    }
    const [head, ...rows] = b.rows;
    if (!head || !/section/i.test(head[0] ?? "")) continue;
    const col = (name: RegExp) => head.findIndex((h) => name.test(h));
    const iParas = col(/para/i), iCover = col(/cover|content|what/i), iNotes = col(/note|status|remark/i);
    for (const r of rows) {
      const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
      const m = cell(0).match(NUMBERED);
      if (!m) { if (/^total$/i.test(cell(0))) total = [cell(iParas) && `${cell(iParas)} paragraphs`, cell(iCover), cell(iNotes)].filter(Boolean).join(" · "); continue; }
      const existing = byNumber.get(m[1]);
      if (existing) {
        // A row for a whole section (a section with no subsections, or the summary table).
        if (!existing.cover) existing.cover = cell(iCover);
        if (existing.paras == null) existing.paras = parasOf(cell(iParas));
        continue;
      }
      const notes = cell(iNotes);
      const item: OutlineItem = {
        id: newId(), kind: "subsection", number: m[1], title: m[2].trim(), paras: parasOf(cell(iParas)),
        cover: cell(iCover), notes, done: /^done\b/i.test(notes),
      };
      // Keep subsections next to their section, in document order.
      const parent = m[1].split(".").slice(0, -1).join(".");
      const at = items.reduce((last, it, k) => (it.number === parent || it.number.startsWith(parent + ".") ? k : last), -1);
      items.splice(at >= 0 ? at + 1 : items.length, 0, item);
      byNumber.set(item.number, item);
    }
  }
  return { title, subtitle, items, total };
}

/** Subsections of a section ("2.1" → 2.1.1, 2.1.2 …). */
export const childrenOf = (items: OutlineItem[], section: OutlineItem) => items.filter((i) => i.kind === "subsection" && i.number.startsWith(section.number + "."));

/** Items that count towards progress: subsections, plus sections that have none. */
export function countable(items: OutlineItem[]): OutlineItem[] {
  return items.filter((i) => i.kind === "subsection" || (i.kind === "section" && childrenOf(items, i).length === 0));
}

export interface OutlineProgress { done: number; total: number; parasDone: number; parasTotal: number; share: number | null; figuresDone: number; figures: number }
/** Progress by paragraphs (the plan's own unit), falling back to item counts when no targets are given. */
export function outlineProgress(items: OutlineItem[]): OutlineProgress {
  const parts = countable(items);
  const paras = (list: OutlineItem[]) => Math.round(list.reduce((t, i) => t + (i.paras ?? 0), 0) * 10) / 10;
  const parasTotal = paras(parts), parasDone = paras(parts.filter((i) => i.done));
  const done = parts.filter((i) => i.done).length;
  const figs = items.filter((i) => i.kind === "figure");
  return {
    done, total: parts.length, parasDone, parasTotal,
    share: parasTotal > 0 ? parasDone / parasTotal : parts.length ? done / parts.length : null,
    figuresDone: figs.filter((i) => i.done).length, figures: figs.length,
  };
}

/** A section's own progress: its subsections' paragraphs (or itself, if it has none). */
export function sectionProgress(items: OutlineItem[], section: OutlineItem): { done: number; total: number; parasDone: number; parasTotal: number } {
  const kids = childrenOf(items, section);
  const list = kids.length ? kids : [section];
  const p = (l: OutlineItem[]) => Math.round(l.reduce((t, i) => t + (i.paras ?? 0), 0) * 10) / 10;
  return { done: list.filter((i) => i.done).length, total: list.length, parasDone: p(list.filter((i) => i.done)), parasTotal: p(list) };
}

/** Toggle one item. Toggling a section with subsections sets them all. */
export function toggleItem(items: OutlineItem[], id: string): OutlineItem[] {
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  const next = !(target.kind === "section" && childrenOf(items, target).length ? childrenOf(items, target).every((k) => k.done) : target.done);
  const kids = target.kind === "section" ? new Set(childrenOf(items, target).map((k) => k.id)) : new Set<string>();
  return items.map((i) => (i.id === id || kids.has(i.id) ? { ...i, done: next } : i));
}

/** Re-import a plan without losing ticks: items matched by number (or by title for figures) keep "done". */
export function mergeOutline(previous: OutlineItem[], fresh: OutlineItem[]): OutlineItem[] {
  const key = (i: OutlineItem) => (i.number ? `n:${i.number}` : `t:${i.title.toLowerCase()}`);
  const old = new Map(previous.map((i) => [key(i), i]));
  return fresh.map((i) => { const o = old.get(key(i)); return o ? { ...i, id: o.id, done: o.done || i.done } : i; });
}
