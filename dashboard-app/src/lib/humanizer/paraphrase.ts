// Paraphrase pipeline: each paragraph is protected, sent to a back end, restored and checked.
import {protect,restore} from "./protect.ts";
import {applyRules,type LexiconEntry} from "./rules.ts";
import {checkFidelity} from "./fidelity.ts";
import {isBreak,splitParagraphs,type Segment} from "./diff.ts";
/** lexical and order are diversity values 0–100 in steps of 20, as in the DIPPER paper. */
export interface ParaphraseOptions{lexical:number;order:number;prefix?:string;seed?:number}
export type Backend=(text:string,o:ParaphraseOptions)=>Promise<string>;
export interface RewriteOptions extends ParaphraseOptions{locked?:string[];lexicon?:LexiconEntry[];rules?:boolean}
export const LEVELS=[0,20,40,60,80,100];
type Fetch=(url:string,init:{method:string;headers:Record<string,string>;body:string})=>Promise<{ok:boolean;status:number;json():Promise<unknown>}>;
/** Back end for the DIPPER server in tools/dipper-server. */
export function dipperBackend(url:string,token:string,fetchImpl:Fetch=(u,i)=>fetch(u,i)):Backend{
 const endpoint=url.replace(/\/+$/,"")+"/paraphrase";
 return async(text,o)=>{
  const res=await fetchImpl(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
   body:JSON.stringify({text,lexical:o.lexical,order:o.order,prefix:o.prefix??"",seed:o.seed??null})});
  if(!res.ok)throw new Error(`Paraphrase server returned ${res.status}`);
  const data=await res.json() as {text?:unknown};
  if(typeof data.text!=="string"||!data.text.trim())throw new Error("Paraphrase server returned no text");
  return data.text.trim();
 };
}
/** Rewrites paragraph by paragraph. A paragraph whose placeholders do not survive keeps its original text. */
export async function rewrite(text:string,backend:Backend|null,o:RewriteOptions,onProgress?:(done:number,total:number)=>void):Promise<Segment[]>{
 if(!LEVELS.includes(o.lexical)||!LEVELS.includes(o.order))throw new Error("lexical and order must be 0, 20, 40, 60, 80 or 100");
 const parts=splitParagraphs(text),total=parts.filter(p=>!isBreak(p)).length,out:Segment[]=[];
 let prefix=o.prefix??"",done=0;
 for(const part of parts){
  if(isBreak(part)){out.push({original:part,revised:part,accepted:true,flags:[]});continue;}
  const lead=part.match(/^\s*/)?.[0]??"",trail=part.match(/\s*$/)?.[0]??"",body=part.trim();
  const p=protect(body,o.locked);
  let work=p.text,rejected:string|undefined;
  try{
   if(backend)work=await backend(work,{lexical:o.lexical,order:o.order,prefix,seed:o.seed});
   if(o.rules!==false)work=applyRules(work,{seed:o.seed,lexicon:o.lexicon}).text;
  }catch(e){rejected=e instanceof Error?e.message:"Paraphrase failed";}
  const back=restore(work,p.spans);
  if(!rejected&&!back.ok)rejected=`Protected content was ${back.missing.length?"dropped":"repeated"}: ${[...back.missing,...back.duplicated].map(i=>p.spans[i]??"?").join(", ")}`;
  const revised=rejected?part:lead+back.text+trail;
  out.push({original:part,revised,accepted:!rejected,rejected,flags:rejected?[]:checkFidelity(body,back.text)});
  // The server reads earlier output as context, in placeholder form.
  if(!rejected)prefix=(prefix+" "+work).trim().split(/\s+/).slice(-120).join(" ");
  onProgress?.(++done,total);
 }
 return out;
}
