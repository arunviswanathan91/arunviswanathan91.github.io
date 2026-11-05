// Export papers as BibTeX (LaTeX, Overleaf, Zotero, JabRef) or RIS (EndNote, Mendeley, Zotero).
import type { Paper } from "../../lib/types.ts";

type Citable = Pick<Paper, "id" | "title" | "authors" | "year" | "publication" | "doi" | "arxiv_id" | "pmid" | "url" | "abstract">;

/** "Viswanathan, Arun" from "Arun Viswanathan" or "Viswanathan A"; already-inverted names are kept. */
export function invertName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n || n.includes(",")) return n;
  const parts = n.split(" ");
  if (parts.length === 1) return n;
  const last = parts.at(-1)!;
  const initials = last.replace(/\./g, "");
  // PubMed style "Viswanathan A", "Harikumar KB": surname first, then initials.
  if (/^[A-Z]{1,3}$/.test(initials)) return `${parts.slice(0, -1).join(" ")}, ${initials.split("").join(". ")}.`;
  return `${last}, ${parts.slice(0, -1).join(" ")}`;
}

const ascii = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "");

/** viswanathan2026overweight: first author's surname, year, first meaningful title word. Unique within `taken`. */
export function citeKey(p: Citable, taken: Set<string>): string {
  const first = p.authors[0] ? invertName(p.authors[0]).split(",")[0] : "anon";
  const word = p.title.toLowerCase().split(/\s+/).map(ascii).find((w) => w.length > 3 && !STOP.has(w)) ?? "paper";
  const base = `${ascii(first).toLowerCase() || "anon"}${p.year ?? "nd"}${word}`;
  let key = base;
  for (let i = 0; taken.has(key); i++) key = base + String.fromCharCode(97 + i); // …a, …b
  taken.add(key);
  return key;
}
const STOP = new Set(["the", "and", "from", "with", "into", "that", "this", "their", "towards", "using", "study", "analysis", "role"]);

/** Escape BibTeX specials and keep capitals (acronyms, gene names) as typed. */
function bibValue(s: string): string {
  const escaped = s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
  return escaped.replace(/\b([A-Za-z]*[A-Z][A-Za-z0-9-]*[A-Z0-9][A-Za-z0-9-]*)\b/g, "{$1}"); // STAT3, PDAC, CD8, mRNA…
}

export function toBibTeX(papers: Citable[]): string {
  const taken = new Set<string>();
  return papers
    .map((p) => {
      const preprint = !!p.arxiv_id || /biorxiv|medrxiv|arxiv|preprint/i.test(p.publication ?? "");
      const fields: [string, string | null | undefined][] = [
        ["title", p.title && `{${bibValue(p.title)}}`],
        ["author", p.authors.length ? `{${p.authors.map((a) => invertName(a).replace(/[{}]/g, "")).join(" and ")}}` : null],
        [preprint ? "publisher" : "journal", p.publication && `{${bibValue(p.publication)}}`],
        ["year", p.year ? String(p.year) : null],
        ["doi", p.doi && `{${p.doi}}`],
        ["eprint", p.arxiv_id && `{${p.arxiv_id}}`],
        ["archiveprefix", p.arxiv_id ? "{arXiv}" : null],
        ["pmid", p.pmid && `{${p.pmid}}`],
        ["url", (p.url || (p.doi ? `https://doi.org/${p.doi}` : null)) && `{${p.url || `https://doi.org/${p.doi}`}}`],
      ];
      const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = ${v}`).join(",\n");
      return `@${preprint ? "misc" : "article"}{${citeKey(p, taken)},\n${body}\n}`;
    })
    .join("\n\n") + "\n";
}

export function toRIS(papers: Citable[]): string {
  return papers
    .map((p) => {
      const preprint = !!p.arxiv_id || /biorxiv|medrxiv|arxiv|preprint/i.test(p.publication ?? "");
      const lines: [string, string | null | undefined][] = [
        ["TY", preprint ? "UNPB" : "JOUR"],
        ["TI", p.title],
        ...p.authors.map((a): [string, string] => ["AU", invertName(a)]),
        ["JO", p.publication],
        ["PY", p.year ? String(p.year) : null],
        ["DO", p.doi],
        ["UR", p.url || (p.doi ? `https://doi.org/${p.doi}` : null)],
        ["AN", p.pmid ? `PMID:${p.pmid}` : p.arxiv_id ? `arXiv:${p.arxiv_id}` : null],
        ["AB", p.abstract?.replace(/\s+/g, " ").trim()],
        ["ER", ""],
      ];
      return lines.filter(([k, v]) => k === "ER" || v).map(([k, v]) => `${k}  - ${v ?? ""}`.trimEnd()).join("\r\n");
    })
    .join("\r\n\r\n") + "\r\n";
}

/** Download the papers as a .bib or .ris file. */
export function downloadCitations(papers: Citable[], format: "bib" | "ris", name = "papers") {
  const text = format === "bib" ? toBibTeX(papers) : toRIS(papers);
  const blob = new Blob([text], { type: format === "bib" ? "application/x-bibtex" : "application/x-research-info-systems" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "papers"}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
