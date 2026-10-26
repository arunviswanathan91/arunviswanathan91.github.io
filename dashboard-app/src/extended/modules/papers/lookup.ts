// Paper metadata lookup from public, browser-friendly services:
//   DOI   → Crossref (metadata) + Europe PMC (abstract, PMID when indexed)
//   arXiv → DataCite (arXiv's own DOIs, 10.48550/arXiv.<id>)
//   PMID  → Europe PMC
// Returns whatever was found; the form stays editable when a lookup fails.

export interface PaperMeta {
  title?: string;
  authors?: string[];
  year?: number | null;
  publication?: string | null;
  abstract?: string | null;
  doi?: string | null;
  arxiv_id?: string | null;
  pmid?: string | null;
  url?: string | null;
}

export type IdKind = "doi" | "arxiv" | "pmid";

/** Recognise a DOI, arXiv id or PubMed id, bare or as a URL. */
export function parseIdentifier(raw: string): { kind: IdKind; id: string } | null {
  const s = raw.trim();
  if (!s) return null;
  const arxiv = s.match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*|10\.48550\/arxiv\.)?(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?$/i);
  if (arxiv && (/arxiv/i.test(s) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(s))) return { kind: "arxiv", id: arxiv[1] };
  const oldArxiv = s.match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*)([a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i);
  if (oldArxiv) return { kind: "arxiv", id: oldArxiv[1] };
  const doi = s.match(/(10\.\d{4,9}\/[^\s"<>]+)/);
  if (doi) return { kind: "doi", id: doi[1].replace(/[.,;]+$/, "").toLowerCase() };
  const pmid = s.match(/^(?:pmid:?\s*)?(\d{1,9})$/i) ?? s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  if (pmid) return { kind: "pmid", id: pmid[1] };
  return null;
}

function stripTags(s: string | undefined | null): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replace(/^Abstract\s*/i, "") || null;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "Not found" : `Lookup failed (${res.status})`);
  return res.json();
}

async function europePmc(query: string): Promise<any | null> {
  const data = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resultType=core&format=json&pageSize=1`);
  return data?.resultList?.result?.[0] ?? null;
}

function fromEuropePmc(r: any): PaperMeta {
  return {
    title: stripTags(r.title)?.replace(/\.$/, "") ?? undefined,
    authors: (r.authorList?.author ?? []).map((a: any) => a.fullName ?? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim()).filter(Boolean),
    year: r.pubYear ? Number(r.pubYear) : null,
    publication: r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher ?? null,
    abstract: stripTags(r.abstractText),
    doi: r.doi?.toLowerCase() ?? null,
    pmid: r.pmid ?? null,
    url: r.doi ? `https://doi.org/${r.doi}` : r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : null,
  };
}

async function byDoi(doi: string): Promise<PaperMeta> {
  if (/^10\.48550\/arxiv\./i.test(doi)) return byArxiv(doi.replace(/^10\.48550\/arxiv\./i, ""));
  const [cr, epmc] = await Promise.allSettled([getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`), europePmc(`DOI:"${doi}"`)]);
  const meta: PaperMeta = { doi, url: `https://doi.org/${doi}` };
  if (cr.status === "fulfilled") {
    const m = cr.value.message;
    meta.title = stripTags(m.title?.[0]) ?? undefined;
    meta.authors = (m.author ?? []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ") || a.name).filter(Boolean);
    const parts = m.issued?.["date-parts"]?.[0] ?? m.published?.["date-parts"]?.[0];
    meta.year = parts?.[0] ?? null;
    meta.publication = m["container-title"]?.[0] ?? m.publisher ?? null;
    meta.abstract = stripTags(m.abstract);
  }
  if (epmc.status === "fulfilled" && epmc.value) {
    const e = fromEuropePmc(epmc.value);
    meta.abstract ??= e.abstract;
    meta.pmid = e.pmid ?? null;
    meta.title ??= e.title;
    if (!meta.authors?.length) meta.authors = e.authors;
    meta.year ??= e.year;
    meta.publication ??= e.publication;
  }
  if (!meta.title) throw new Error("No record found for this DOI");
  return meta;
}

async function byArxiv(id: string): Promise<PaperMeta> {
  const data = await getJson(`https://api.datacite.org/dois/${encodeURIComponent(`10.48550/arXiv.${id}`)}`);
  const a = data.data.attributes;
  const abstract = (a.descriptions ?? []).find((d: any) => d.descriptionType === "Abstract")?.description ?? a.descriptions?.[0]?.description;
  return {
    title: a.titles?.[0]?.title,
    authors: (a.creators ?? []).map((c: any) => (c.givenName && c.familyName ? `${c.givenName} ${c.familyName}` : c.name)).filter(Boolean),
    year: a.publicationYear ? Number(a.publicationYear) : null,
    publication: "arXiv",
    abstract: stripTags(abstract),
    arxiv_id: id,
    url: `https://arxiv.org/abs/${id}`,
  };
}

async function byPmid(pmid: string): Promise<PaperMeta> {
  const r = await europePmc(`EXT_ID:${pmid} AND SRC:MED`);
  if (!r) throw new Error("No PubMed record found");
  return { ...fromEuropePmc(r), pmid };
}

export async function lookupPaper(raw: string): Promise<PaperMeta> {
  const parsed = parseIdentifier(raw);
  if (!parsed) throw new Error("Enter a DOI (10.…), an arXiv id (2401.12345) or a PubMed id");
  if (parsed.kind === "doi") return byDoi(parsed.id);
  if (parsed.kind === "arxiv") return byArxiv(parsed.id);
  return byPmid(parsed.id);
}

/** Short "Smith, Lee et al." author line. */
export function authorLine(authors: string[], max = 3): string {
  if (!authors.length) return "";
  const last = (n: string) => (n.includes(",") ? n.split(",")[0] : n.split(" ").at(-1) ?? n);
  const names = authors.slice(0, max).map(last);
  return authors.length > max ? `${names.join(", ")} et al.` : names.join(", ");
}

