// Protected spans: content a rewrite must not touch is swapped for placeholders and restored exactly.
// Placeholders are plain letters and digits so any tokenizer can carry them through.
export interface Protected{text:string;spans:string[]}
export interface Restored{ok:boolean;text:string;missing:number[];duplicated:number[]}
const mark=(i:number)=>`ZQX${i}Z`;
export const MARK_RE=/ZQX(\d+)Z/g;
const UNIT="(?:%|°C|[µμnmpfk]?(?:M|g|L|l|m|Da|mol|Hz|V)(?![A-Za-z])|bp(?![A-Za-z])|kb(?![A-Za-z])|h(?![A-Za-z])|min(?![A-Za-z])|s(?![A-Za-z])|fold(?![A-Za-z])|days?(?![A-Za-z])|weeks?(?![A-Za-z])|months?(?![A-Za-z])|years?(?![A-Za-z]))";
const NUM="[-−+±]?\\d+(?:[.,]\\d+)*";
// Earlier patterns win where matches overlap.
const PATTERNS:RegExp[]=[
 /https?:\/\/[^\s<>"')\]]+/g,
 /"[^"\n]{1,400}"|“[^”\n]{1,400}”/g,
 /\[\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*\]/g,
 /\((?:[A-Z][^()]{0,80}?,?\s)?(?:19|20)\d{2}[a-z]?(?:;\s*[A-Z][^()]{0,80}?(?:19|20)\d{2}[a-z]?)*\)/g,
 /\b[Pp]\s*[<>=≤≥]\s*\d*\.?\d+(?:\s*[×x]\s*10\s*[-−]?\d+)?/g,
 /\b(?:e\.g\.|i\.e\.|et al\.|Fig\.|Figs\.|vs\.|approx\.|ca\.|cf\.|Dr\.|Eq\.|Ref\.|No\.)/g,
 // Mixed-case or digit-bearing symbols: CD8+, STAT3−/−, pSTAT3-Y705, IL-6, TGF-β1.
 /(?<![A-Za-z0-9])[A-Za-z]*[A-Z][A-Za-z]*-?\d[A-Za-z0-9]*(?:[-−][A-Za-z0-9α-ω]+)*(?:[+−-]\/[+−-]|[+−](?![A-Za-z0-9]))?/g,
 /(?<![A-Za-z0-9])[A-Z]{2,}[a-z]?(?:[-−][A-Za-z0-9α-ω]+)*(?:[+−-]\/[+−-]|[+−](?![A-Za-z0-9]))?/g,
 new RegExp(`(?<![A-Za-z0-9])${NUM}(?:\\s*[–-]\\s*\\d+(?:[.,]\\d+)*)?(?:[-\\s]?${UNIT})?`,"g"),
];
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export function protect(text:string,locked:string[]=[]):Protected{
 if(MARK_RE.test(text)){MARK_RE.lastIndex=0;throw new Error("Text already contains a placeholder token");}
 const found:{start:number;end:number}[]=[];
 const take=(re:RegExp)=>{for(const m of text.matchAll(re)){const start=m.index,end=start+m[0].length;if(end>start&&!found.some(f=>start<f.end&&end>f.start))found.push({start,end});}};
 for(const term of [...locked].filter(Boolean).sort((a,b)=>b.length-a.length))take(new RegExp(escape(term),"g"));
 for(const re of PATTERNS)take(re);
 found.sort((a,b)=>a.start-b.start);
 const spans:string[]=[];let out="",at=0;
 for(const f of found){out+=text.slice(at,f.start)+mark(spans.length);spans.push(text.slice(f.start,f.end));at=f.end;}
 return {text:out+text.slice(at),spans};
}
/** Puts the spans back. A rewrite that lost or repeated a placeholder is not ok. */
export function restore(text:string,spans:string[]):Restored{
 const seen=new Map<number,number>();
 for(const m of text.matchAll(MARK_RE)){const i=Number(m[1]);seen.set(i,(seen.get(i)??0)+1);}
 const missing=spans.map((_,i)=>i).filter(i=>!seen.has(i));
 const duplicated=[...seen].filter(([i,n])=>n>1||i>=spans.length).map(([i])=>i);
 const out=text.replace(MARK_RE,(m,d)=>spans[Number(d)]??m);
 return {ok:!missing.length&&!duplicated.length,text:out,missing,duplicated};
}
