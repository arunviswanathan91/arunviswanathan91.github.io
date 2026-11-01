// Fill a publication entry from a DOI, PubMed id or arXiv id, using the same lookup as the Papers module.
import type { PaperMeta } from "../papers/lookup.ts";
import type { ResumeItem } from "./model.ts";

/** Publication fields from looked-up metadata. Authors go in the notes line so they can be edited or removed. */
export function itemFromMeta(m: PaperMeta): Partial<ResumeItem> {
  const link = m.doi ? `https://doi.org/${m.doi}` : m.url ?? (m.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${m.pmid}/` : m.arxiv_id ? `https://arxiv.org/abs/${m.arxiv_id}` : "");
  return {
    title: (m.title ?? "").replace(/\s+/g, " ").trim(),
    subtitle: (m.publication ?? (m.arxiv_id ? "arXiv" : "")) || "",
    link,
    start: m.year ? String(m.year) : "",
    end: "",
    body: m.authors?.length ? m.authors.join(", ") : "",
  };
}
