import { Quote } from "lucide-react";
import type { Paper } from "../../lib/types.ts";
import { downloadCitations } from "./citations.ts";

/** "Cite" buttons: the papers shown, as BibTeX (LaTeX/Overleaf) or RIS (EndNote, Mendeley, Zotero). */
export function CitationExport({ papers, name }: { papers: Paper[]; name: string }) {
  const n = papers.length;
  const label = n === 1 ? "1 paper" : `${n} papers`;
  return (
    <span className="row citation-export" role="group" aria-label={`Export ${label} as a citation file`}>
      <button disabled={!n} title={`Download ${label} as BibTeX, for LaTeX, Overleaf, Zotero or JabRef`} onClick={() => downloadCitations(papers, "bib", name)}>
        <Quote size={14} /> BibTeX
      </button>
      <button disabled={!n} title={`Download ${label} as RIS, for EndNote, Mendeley or Zotero`} onClick={() => downloadCitations(papers, "ris", name)}>
        RIS
      </button>
    </span>
  );
}
