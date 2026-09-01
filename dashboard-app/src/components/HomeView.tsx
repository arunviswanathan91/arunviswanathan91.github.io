import { useMemo } from "react";
import { Send } from "lucide-react";
import { useData, useUi } from "../lib/store";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import { formatDate, isOverdue } from "../lib/format";
import { Badge } from "./ui/Badge";
import type { EntityKey, Row } from "../entities/types";
import type { ViewKey } from "../lib/store";

const DUE_FIELDS:Partial<Record<EntityKey,string>>={tasks:"due_at",publications:"due_at",jobs:"deadline",reminders:"remind_at"};

export function HomeView(){
 const {tables}=useData();
 const ui=useUi();

 const stats=ENTITY_ORDER.map(key=>{
  const def=ENTITIES[key],rows=tables[key].rows;
  return {key,def,open:def.openWhen?rows.filter(def.openWhen).length:rows.length,total:rows.length};
 });

 // Everything with a date, still open, soonest first — the one list worth waking up to.
 const upcoming=useMemo(()=>{
  const out:{key:EntityKey;row:Row;due:string}[]=[];
  for(const key of ENTITY_ORDER){
   const field=DUE_FIELDS[key];if(!field)continue;
   const def=ENTITIES[key];
   for(const row of tables[key].rows){
    if(def.openWhen&&!def.openWhen(row))continue;
    if(row[field])out.push({key,row,due:row[field]});
   }
  }
  return out.sort((a,b)=>a.due.localeCompare(b.due)).slice(0,10);
 },[tables]);

 return <div className="entity-view">
  <div className="view-head">
   <div>
    <p className="kicker">{new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</p>
    <h1>Command center</h1>
    <p className="subtitle">Everything open across the workspace.</p>
   </div>
  </div>

  <section className="stat-grid">
   {stats.map(s=><button key={s.key} className="stat-card" onClick={()=>ui.setView(s.key as ViewKey)}>
    <s.def.icon/>
    <strong>{s.open}</strong>
    <span>{s.def.plural}</span>
    <small>{s.total===s.open?"all open":`${s.total} total`}</small>
   </button>)}
  </section>

  <section className="home-grid">
   <article className="panel">
    <header className="panel-head"><h2>What’s coming up</h2></header>
    <div className="due-list">
     {upcoming.map(({key,row,due})=>{
      const def=ENTITIES[key];
      const title=def.searchFields.map(f=>String(row[f]??"").trim()).find(Boolean)||`Untitled ${def.singular}`;
      return <button key={key+row.id} className="due-row" onClick={()=>{ui.setView(key as ViewKey);ui.openDrawer(key,row.id)}}>
       <def.icon/>
       <span className="clamp-1">{title}</span>
       <Badge text={def.singular} tone="dim"/>
       <small className={isOverdue(due)?"overdue":""}>{formatDate(due)}</small>
      </button>;
     })}
     {!upcoming.length&&<p className="muted-note">Nothing scheduled. Add a due date to see it here.</p>}
    </div>
   </article>

   <aside className="panel brief">
    <header className="panel-head"><h2>Telegram capture</h2></header>
    <ol>
     <li><code>/add</code> a task, <code>/job</code> an application, <code>/remind</code> yourself.</li>
     <li>Share any link and confirm to save it to Reads.</li>
     <li>Everything lands straight in this workspace.</li>
    </ol>
    <div className="bot-command"><Send/><code>/add Review draft #Project</code></div>
   </aside>
  </section>
 </div>;
}
