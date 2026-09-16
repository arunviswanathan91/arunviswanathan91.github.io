import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
 ArrowLeft, ArrowRight, Building2, BusFront, CalendarDays, ExternalLink,
 MapPin, RotateCcw, ShieldCheck, Sparkles, ThermometerSun, ThumbsDown, ThumbsUp, Users,
} from "lucide-react";
import { formatDate } from "../../lib/format";
import type { Row } from "../../entities/types";

interface OpportunityContext {
 institution?:string;
 place?:string;
 population?:string;
 climate?:string;
 transport?:string;
 living?:string;
 inclusion?:string;
 sources?:{label?:string;url?:string}[];
 generated_at?:string;
}

const safeUrl=(value:unknown)=>{
 try{const url=new URL(String(value??""));return url.protocol==="http:"||url.protocol==="https:"?url.toString():null}
 catch{return null}
};
const contextFor=(row:Row):OpportunityContext=>{
 const score=row.score_breakdown;
 return score&&typeof score==="object"&&score.context&&typeof score.context==="object"?score.context as OpportunityContext:{};
};
const fitFor=(score:number)=>score>=70?"Strong":score>=50?"Good":score>=30?"Maybe":"Weak";

export function OpportunitySwipe({rows,onDecision,onUndo}:{
 rows:Row[];
 onDecision(row:Row,status:"Shortlisted"|"Dismissed"):Promise<boolean>;
 onUndo(row:Row):Promise<boolean>;
}){
 const review=useMemo(()=>rows.filter(row=>row.status==="New"),[rows]);
 const [history,setHistory]=useState<Row[]>([]);
 const [motion,setMotion]=useState<""|"left"|"right">("");
 const busy=useRef(false);
 const current=review[0]??null;

 const decide=async(direction:"left"|"right")=>{
  if(!current||busy.current)return;
  busy.current=true;setMotion(direction);
  await new Promise(resolve=>window.setTimeout(resolve,150));
  const saved=await onDecision(current,direction==="right"?"Shortlisted":"Dismissed");
  if(saved)setHistory(items=>[...items,current]);
  setMotion("");busy.current=false;
 };
 const undo=async()=>{
  const previous=history.at(-1);if(!previous||busy.current)return;
  busy.current=true;
  if(await onUndo(previous))setHistory(items=>items.slice(0,-1));
  busy.current=false;
 };

 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(target?.closest("input,textarea,select,[contenteditable=true]"))return;
   const pressed=event.key.toLowerCase();
   if(event.key==="ArrowLeft"||pressed==="a"){event.preventDefault();void decide("left")}
   else if(event.key==="ArrowRight"||pressed==="d"||pressed==="f"){event.preventDefault();void decide("right")}
   else if(pressed==="b"||event.key==="Backspace"){event.preventDefault();void undo()}
  };
  window.addEventListener("keydown",key);
  return()=>window.removeEventListener("keydown",key);
 },[current,history]);

 if(!current)return <section className="swipe-finished">
  <Sparkles/><h2>Review complete</h2><p>No New opportunities remain in this view.</p>
  {history.length>0&&<button className="secondary" onClick={()=>void undo()}><RotateCcw/>Undo last decision</button>}
 </section>;

 const context=contextFor(current);
 const score=Number(current.match_score??0);
 const listing=safeUrl(current.url),apply=safeUrl(current.apply_url),organisation=safeUrl(current.organization_url);
 const sources=(context.sources??[]).filter(source=>safeUrl(source.url));
 return <section className="swipe-review" aria-label="Opportunity swipe review">
  <div className="swipe-progress"><span><strong>{review.length}</strong> New opportunities remaining</span>
   <span>Keys: <kbd>←</kbd> dismiss · <kbd>→</kbd> shortlist · <kbd>B</kbd> back</span></div>
  <article className={"swipe-card"+(motion?" swipe-"+motion:"")}>
   <header className="swipe-card-head">
    <div><span className={"badge tone-"+(score>=70?"green":score>=50?"violet":score>=30?"amber":"slate")}>{fitFor(score)} · {score}</span>
     <h2>{current.role}</h2>
     <p>{current.organization||"Organisation not specified"}{current.department?" · "+current.department:""}</p></div>
    <div className="swipe-links">
     {listing&&<a className="secondary" href={listing} target="_blank" rel="noopener noreferrer"><ExternalLink/>Listing</a>}
     {apply&&apply!==listing&&<a className="primary" href={apply} target="_blank" rel="noopener noreferrer"><ExternalLink/>Apply</a>}
     {organisation&&<a className="secondary" href={organisation} target="_blank" rel="noopener noreferrer"><Building2/>Institute</a>}
    </div>
   </header>
   <div className="swipe-facts">
    <span><MapPin/>{current.location||[current.city,current.country].filter(Boolean).join(", ")||"Location unavailable"}</span>
    <span><CalendarDays/>{current.deadline?"Deadline "+formatDate(current.deadline):"No deadline listed"}</span>
    <span>{current.opportunity_type||"Research role"}</span>
    {current.salary_display&&<span>{current.salary_display}</span>}
   </div>
   <div className="swipe-card-body">
    <section className="swipe-main-copy">
     {current.summary&&<div><h3>Role overview</h3><p>{current.summary}</p></div>}
     {current.fit_reason&&<div><h3>Why it matched</h3><p>{current.fit_reason}</p></div>}
     {context.institution&&<div><h3><Building2/>Institution</h3><p>{context.institution}</p></div>}
     {context.place&&<div><h3><MapPin/>Place</h3><p>{context.place}</p></div>}
     {context.living&&<div><h3><Sparkles/>Why consider living there</h3><p>{context.living}</p></div>}
     {context.inclusion&&<div><h3><ShieldCheck/>Inclusion and safety context</h3><p>{context.inclusion}</p></div>}
    </section>
    <aside className="swipe-context">
     <ContextFact icon={<Users/>} label="Population" value={context.population}/>
     <ContextFact icon={<ThermometerSun/>} label="Typical climate" value={context.climate}/>
     <ContextFact icon={<BusFront/>} label="Public transport" value={context.transport}/>
     {!context.institution&&!context.place&&<div className="context-pending"><Sparkles/><span>
      Detailed institution and place context will appear after the discovery pipeline enriches this listing.
     </span></div>}
     {sources.length>0&&<div className="context-sources"><strong>Context sources</strong>
      {sources.map((source,index)=><a key={(source.url??"")+index} href={safeUrl(source.url)??undefined}
       target="_blank" rel="noopener noreferrer"><ExternalLink/>{source.label||new URL(String(source.url)).hostname}</a>)}
     </div>}
    </aside>
   </div>
  </article>
  <div className="swipe-controls">
   <button className="secondary" disabled={!history.length} onClick={()=>void undo()}><RotateCcw/>Back <kbd>B</kbd></button>
   <button className="swipe-choice swipe-dismiss" onClick={()=>void decide("left")}><ArrowLeft/><span><small>Not for me</small>Dismiss</span><ThumbsDown/></button>
   <button className="swipe-choice swipe-like" onClick={()=>void decide("right")}><ThumbsUp/><span><small>Check later</small>Shortlist</span><ArrowRight/></button>
  </div>
 </section>;
}

function ContextFact({icon,label,value}:{icon:ReactNode;label:string;value?:string}){
 if(!value)return null;
 return <div className="context-fact"><span>{icon}{label}</span><p>{value}</p></div>;
}
