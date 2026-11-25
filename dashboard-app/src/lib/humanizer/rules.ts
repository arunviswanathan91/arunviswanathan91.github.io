// Deterministic rewrite stages. They run on protected text, so placeholders are never edited.
import {protect,restore} from "./protect.ts";
export interface LexiconEntry{from:string;to:string[]}
export interface RuleOptions{seed?:number;lexicon?:LexiconEntry[];locked?:string[];split?:boolean;merge?:boolean}
export interface RuleChange{stage:"phrase"|"split"|"merge"|"repeat";before:string;after:string}
export interface RuleResult{text:string;changes:RuleChange[]}
// Generic stock phrases only. Personal pairs come from the lexicon table.
export const BASE_LEXICON:LexiconEntry[]=[
 {from:"it is important to note that ",to:[""]},{from:"it is worth noting that ",to:[""]},{from:"it should be noted that ",to:[""]},
 {from:"in order to",to:["to"]},{from:"due to the fact that",to:["because"]},{from:"a wide range of",to:["many","several"]},
 {from:"plays a crucial role in",to:["is central to","is needed for"]},{from:"plays a pivotal role in",to:["is central to","is needed for"]},
 {from:"delve into",to:["examine","look at"]},{from:"delves into",to:["examines","looks at"]},
 {from:"utilize",to:["use"]},{from:"utilizes",to:["uses"]},{from:"utilized",to:["used"]},{from:"utilizing",to:["using"]},
 {from:"leverage",to:["use"]},{from:"leverages",to:["uses"]},{from:"leveraging",to:["using"]},
 {from:"underscores",to:["shows","points to"]},{from:"showcases",to:["shows"]},{from:"pivotal",to:["key","central"]},
 {from:"intricate",to:["complex"]},{from:"furthermore,",to:["also,","in addition,"]},{from:"moreover,",to:["also,","in addition,"]},
 {from:"additionally,",to:["also,","in addition,"]},{from:"in conclusion,",to:["overall,","taken together,"]},
];
const CONNECTOR=/^(also|in addition|however|overall|taken together|furthermore|moreover|additionally|notably|importantly),\s+/i;
const SAFE_START=/^(This|These|It|They|The|We|In|A|An|Our)\b/;
export function rng(seed:number){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const cap=(s:string)=>s.replace(/^(\s*)([a-z])/,(_,w,c)=>w+c.toUpperCase());
const lower=(s:string)=>s.charAt(0).toLowerCase()+s.slice(1);
const words=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length;
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export function sentences(paragraph:string):string[]{return paragraph.split(/(?<=[.!?])\s+(?=[A-Z("\[“])/).filter(s=>s.trim());}
function phrases(text:string,lexicon:LexiconEntry[],rand:()=>number,changes:RuleChange[]):string{
 let out=text;
 for(const e of [...lexicon].sort((a,b)=>b.from.length-a.from.length)){
  if(!e.from.trim()||!e.to.length)continue;
  const re=new RegExp(`(?<![A-Za-z0-9])${escape(e.from.trim())}${/\s$/.test(e.from)?"\\s+":"(?![A-Za-z0-9])"}`,"gi");
  out=out.replace(re,(m,offset:number,whole:string)=>{
   let to=e.to[Math.floor(rand()*e.to.length)];
   const starts=offset===0||/[.!?]\s+$/.test(whole.slice(0,offset));
   if(/^[A-Z]/.test(m)&&to)to=cap(to);
   changes.push({stage:"phrase",before:m.trim(),after:to});
   // A deleted opener leaves the next word at the start of the sentence.
   return to===""&&starts?"\u0001":to;
  });
 }
 return out.replace(/\u0001\s*([a-z])/g,(_,c:string)=>c.toUpperCase()).replace(/\u0001/g,"");
}
function reshape(paragraph:string,o:RuleOptions,rand:()=>number,changes:RuleChange[]):string{
 let list=sentences(paragraph);
 if(o.split!==false)list=list.flatMap(s=>{
  if(words(s)<32)return [s];
  const at=s.indexOf("; ");
  if(at<0||words(s.slice(0,at))<8||words(s.slice(at+2))<8)return [s];
  const pair=[s.slice(0,at)+".",cap(s.slice(at+2))];
  changes.push({stage:"split",before:s,after:pair.join(" ")});
  return pair;
 });
 const out:string[]=[];
 for(const s of list){
  const prev=out[out.length-1];
  const a=prev?.match(CONNECTOR)?.[1].toLowerCase(),b=s.match(CONNECTOR)?.[1].toLowerCase();
  if(prev&&a&&a===b){const next=cap(s.replace(CONNECTOR,""));changes.push({stage:"repeat",before:s,after:next});out.push(next);continue;}
  if(o.merge!==false&&prev&&words(prev)<8&&words(s)<8&&/\.$/.test(prev)&&SAFE_START.test(s)&&rand()<0.5){
   const joined=prev.slice(0,-1)+"; "+lower(s);
   changes.push({stage:"merge",before:prev+" "+s,after:joined});out[out.length-1]=joined;continue;
  }
  out.push(s);
 }
 return out.join(" ");
}
/** Runs the stages on text that is already protected. */
export function applyRules(text:string,o:RuleOptions={}):RuleResult{
 const rand=rng(o.seed??1),changes:RuleChange[]=[];
 const lexicon=[...BASE_LEXICON,...(o.lexicon??[])];
 const text2=text.split(/(\n+)/).map(part=>/^\n+$/.test(part)||!part.trim()?part:reshape(phrases(part,lexicon,rand,changes),o,rand,changes)).join("");
 return {text:text2,changes};
}
/** Protect, apply the rules, restore. Throws if a placeholder did not survive. */
export function humanize(text:string,o:RuleOptions={}):RuleResult{
 const p=protect(text,o.locked),r=applyRules(p.text,o),back=restore(r.text,p.spans);
 if(!back.ok)throw new Error("Rule stage damaged a protected span");
 return {text:back.text,changes:r.changes.map(c=>({...c,before:restore(c.before,p.spans).text,after:restore(c.after,p.spans).text}))};
}
