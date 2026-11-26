// The published version of one of your manuscripts, as fetched from its final DOI and
// stored in publications.published.
export interface Published{
 title:string;authors:string[];journal:string|null;year:number|null;
 doi:string|null;pmid:string|null;url:string|null;fetched_at:string;
}

/** The stored value, or null when the manuscript has no published version yet. */
export function publishedOf(row:object|null|undefined):Published|null{
 const p=(row as {published?:unknown}|null|undefined)?.published as Partial<Published>|null|undefined;
 if(!p||typeof p!=="object"||!p.title)return null;
 return {title:String(p.title),authors:Array.isArray(p.authors)?p.authors.map(String):[],journal:p.journal??null,
  year:typeof p.year==="number"?p.year:null,doi:p.doi??null,pmid:p.pmid??null,url:p.url??null,fetched_at:String(p.fetched_at??"")};
}

/** Where the published paper can be read: its DOI first. */
export const publishedLink=(p:Published)=>p.doi?`https://doi.org/${p.doi}`:p.url??(p.pmid?`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`:null);

/** "Smith J, Lee K, … (2026). Journal." — the part of a reference that follows the title. */
export function publishedSource(p:Published,maxAuthors=6):string{
 const names=p.authors.length>maxAuthors?[...p.authors.slice(0,maxAuthors),"et al."]:p.authors;
 return [names.join(", "),p.year?`(${p.year})`:"",p.journal??""].filter(Boolean).join(" ").replace(/\s+\./g,".").trim();
}
