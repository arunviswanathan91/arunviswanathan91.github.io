// Link cleanup: drops listed tracking parameters only. Identifiers and functional queries stay.
const TRACKING=[/^utm_/i,/^fbclid$/i,/^gclid$/i,/^dclid$/i,/^msclkid$/i,/^mc_cid$/i,/^mc_eid$/i,/^igshid$/i,/^srsltid$/i,/^ref_src$/i,/^_hsenc$/i,/^_hsmi$/i];
const SHARED_CHAT=[/(^|\.)chatgpt\.com$/i,/(^|\.)chat\.openai\.com$/i,/(^|\.)claude\.ai$/i,/(^|\.)gemini\.google\.com$/i];
export interface LinkFinding{index:number;original:string;cleaned:string;removed:string[];sharedChat:boolean}
const URL_RE=/https?:\/\/[^\s<>"')\]]+/g;
export function cleanUrl(raw:string):{cleaned:string;removed:string[];sharedChat:boolean}{
 // Trailing sentence punctuation is not part of the link.
 const tail=raw.match(/[.,;:!?]+$/)?.[0]??"",body=tail?raw.slice(0,-tail.length):raw;
 let u:URL;
 try{u=new URL(body);}catch{return {cleaned:raw,removed:[],sharedChat:false};}
 const removed:string[]=[];
 for(const key of [...u.searchParams.keys()])if(TRACKING.some(r=>r.test(key))){removed.push(key);u.searchParams.delete(key);}
 const sharedChat=SHARED_CHAT.some(r=>r.test(u.hostname))&&/\/share\//.test(u.pathname);
 if(!removed.length)return {cleaned:raw,removed,sharedChat};
 let cleaned=u.toString();
 // URL() adds a slash to bare origins; keep the author's form.
 if(!/\/$/.test(body.split(/[?#]/)[0])&&u.pathname==="/")cleaned=cleaned.replace(u.origin+"/",u.origin);
 return {cleaned:cleaned+tail,removed,sharedChat};
}
export function inspectLinks(text:string):LinkFinding[]{
 const out:LinkFinding[]=[];
 for(const m of text.matchAll(URL_RE)){
  const r=cleanUrl(m[0]);
  if(r.removed.length||r.sharedChat)out.push({index:m.index,original:m[0],...r});
 }
 return out;
}
export function cleanLinks(text:string):string{return text.replace(URL_RE,m=>cleanUrl(m).cleaned);}
