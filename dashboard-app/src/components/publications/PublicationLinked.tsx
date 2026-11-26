import { CalendarClock, FlaskConical, GraduationCap, Link2, Plane } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { list, useLoad } from "../../extended/lib/db";
import { href } from "../../extended/lib/route";
import { formatDate } from "../../lib/format";

interface Linked{id:string;title:string|null}
interface LinkedExperiment extends Linked{status:string;archived_at:string|null}
interface LinkedTrip extends Linked{starts_on:string|null}
interface LinkedDeadline extends Linked{due_date:string}
interface Item{id:string;title:string;href:string;note?:string}

/** What points at this publication from the workspace pages: experiments feeding it, thesis
 *  chapters built on it, trips presenting it and its deadlines. Each row opens that page. */
export function PublicationLinked({publicationId}:{publicationId:string}){
 const {data}=useLoad(async()=>{
  const eq={publication_id:publicationId};
  const [experiments,chapters,trips,deadlines]=await Promise.all([
   list<LinkedExperiment>("experiments",{eq,order:[["updated_at",false]]}),
   list<Linked>("thesis_chapters",{eq,order:[["position"]]}),
   list<LinkedTrip>("trips",{eq,order:[["starts_on",false]]}),
   list<LinkedDeadline>("deadlines",{eq,order:[["due_date"]]}),
  ]);
  return {experiments,chapters,trips,deadlines};
 },[publicationId]);
 if(!data)return null;
 const groups:{label:string;icon:LucideIcon;items:Item[]}[]=[
  {label:"Experiments",icon:FlaskConical,items:data.experiments.filter(e=>!e.archived_at).map(e=>({
   id:e.id,title:e.title||"Untitled experiment",href:href(`experiments/${e.id}`),note:e.status}))},
  {label:"Thesis chapters",icon:GraduationCap,items:data.chapters.map(c=>({id:c.id,title:c.title||"Untitled chapter",href:href("thesis")}))},
  {label:"Trips",icon:Plane,items:data.trips.map(t=>({
   id:t.id,title:t.title||"Untitled trip",href:href(`trips/${t.id}`),note:t.starts_on?formatDate(t.starts_on):undefined}))},
  {label:"Deadlines",icon:CalendarClock,items:data.deadlines.map(d=>({
   id:d.id,title:d.title||"Untitled deadline",href:href(`deadlines/${d.id}`),note:formatDate(d.due_date)}))},
 ].filter(group=>group.items.length>0);
 if(!groups.length)return null;

 return <section className="panel publication-linked">
  <header className="panel-head"><h2><Link2/> Linked</h2></header>
  {groups.map(group=><div className="publication-linked-group" key={group.label}>
   <div className="paper-section-label"><group.icon/>{group.label}</div>
   {group.items.map(item=><a key={item.id} href={item.href}><span>{item.title}</span>{item.note&&<small>{item.note}</small>}</a>)}
  </div>)}
 </section>;
}
