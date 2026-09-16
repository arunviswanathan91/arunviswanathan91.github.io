import type { ReactNode } from "react";
import {
 Building2, BusFront, ExternalLink, MapPin, ShieldCheck, Sparkles,
 ThermometerSun, Users,
} from "lucide-react";
import { formatDate } from "../../lib/format";
import type { Row } from "../../entities/types";

export interface OpportunityContext {
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

export const safeUrl=(value:unknown)=>{
 try{const url=new URL(String(value??""));return url.protocol==="http:"||url.protocol==="https:"?url.toString():null}
 catch{return null}
};

export const contextFor=(row:Row):OpportunityContext=>{
 const score=row.score_breakdown;
 return score&&typeof score==="object"&&score.context&&typeof score.context==="object"?score.context as OpportunityContext:{};
};

export function OpportunityContextDetails({row}:{row:Row}){
 const context=contextFor(row);
 const sources=(context.sources??[]).filter(source=>safeUrl(source.url));
 const ready=Boolean(context.institution||context.place||context.living||context.inclusion);
 return <section className="opportunity-context-details field-wide" aria-label="AI decision context">
  <div className="opportunity-context-head">
   <div><Sparkles/><span><strong>AI decision context</strong><small>Evidence-backed institution and local information</small></span></div>
   {context.generated_at&&<small>Updated {formatDate(context.generated_at,true)}</small>}
  </div>
  {!ready?<div className="context-pending"><Sparkles/><span>
   Context has not been generated yet. Run the AI context backfill workflow to add it.
  </span></div>:<div className="opportunity-context-grid">
   <div className="opportunity-context-copy">
    <ContextSection icon={<Building2/>} label="Institution" value={context.institution}/>
    <ContextSection icon={<MapPin/>} label="Place" value={context.place}/>
    <ContextSection icon={<Sparkles/>} label="Why consider living there" value={context.living}/>
    <ContextSection icon={<ShieldCheck/>} label="Inclusion and safety context" value={context.inclusion}/>
   </div>
   <div className="swipe-context">
    <ContextFact icon={<Users/>} label="Population" value={context.population}/>
    <ContextFact icon={<ThermometerSun/>} label="Typical climate" value={context.climate}/>
    <ContextFact icon={<BusFront/>} label="Public transport" value={context.transport}/>
    {sources.length>0&&<div className="context-sources"><strong>Context sources</strong>
     {sources.map((source,index)=><a key={(source.url??"")+index} href={safeUrl(source.url)??undefined}
      target="_blank" rel="noopener noreferrer"><ExternalLink/>{source.label||new URL(String(source.url)).hostname}</a>)}
    </div>}
   </div>
  </div>}
 </section>;
}

function ContextSection({icon,label,value}:{icon:ReactNode;label:string;value?:string}){
 if(!value)return null;
 return <div><h3>{icon}{label}</h3><p>{value}</p></div>;
}

export function ContextFact({icon,label,value}:{icon:ReactNode;label:string;value?:string}){
 if(!value)return null;
 return <div className="context-fact"><span>{icon}{label}</span><p>{value}</p></div>;
}
