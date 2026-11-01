// Turn looked-up paper metadata (DOI, PubMed id or arXiv id) into the fields of a Read.
import type { PaperMeta } from "../extended/modules/papers/lookup.ts";
import { authorLine } from "../extended/modules/papers/lookup.ts";

export interface ReadFill{title:string;url:string;notes:string}

/** The link to save: DOI link first, then arXiv, PubMed, then whatever URL the lookup found. */
export function readUrl(m:PaperMeta):string{
 if(m.doi)return `https://doi.org/${m.doi}`;
 if(m.arxiv_id)return `https://arxiv.org/abs/${m.arxiv_id}`;
 if(m.pmid)return `https://pubmed.ncbi.nlm.nih.gov/${m.pmid}/`;
 return m.url??"";
}

/** Title, URL and a short citation (+ abstract) for the notes field. */
export function readFromMeta(m:PaperMeta):ReadFill{
 const cite=[
  m.authors?.length?authorLine(m.authors):"",
  [m.publication,m.year?`(${m.year})`:""].filter(Boolean).join(" "),
 ].filter(Boolean).join(" — ");
 const lines=[cite,m.doi?`DOI: ${m.doi}`:""].filter(Boolean).join("\n");
 const abstract=(m.abstract??"").replace(/\s+/g," ").trim().slice(0,1500);
 return{
  title:(m.title??"").replace(/\s+/g," ").trim(),
  url:readUrl(m),
  notes:[lines,abstract].filter(Boolean).join("\n\n"),
 };
}

/** Same link ignoring scheme, "www." and a trailing slash, so a pasted copy is recognised. */
export function sameLink(a:string|null|undefined,b:string|null|undefined):boolean{
 const norm=(s:string|null|undefined)=>String(s??"").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/,"").replace(/\/+$/,"");
 return !!norm(a)&&norm(a)===norm(b);
}
