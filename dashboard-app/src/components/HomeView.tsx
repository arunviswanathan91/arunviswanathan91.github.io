import { Send } from "lucide-react";
import type { Job, Publication, Task, View } from "../types";
import { Badge } from "./Badge";

export function HomeView({tasks,publications,jobs,open}:{tasks:Task[];publications:Publication[];jobs:Job[];open:(v:View)=>void}){
 const active=tasks.filter(t=>t.status!=="Done");
 const activePublications=publications.filter(p=>p.stage!=="Published");
 const openJobs=jobs.filter(j=>j.stage!=="Closed");
 return <>
 <div className="title-row"><div><p className="kicker">{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p><h1>Command center</h1><p className="subtitle">Tasks, research writing and career tracking in one private system.</p></div></div>
 <section className="stats">
  <button onClick={()=>open("kanban")}><span>Open tasks</span><strong>{active.length}</strong><small>Across every board</small></button>
  <button onClick={()=>open("publications")}><span>Active publications</span><strong>{activePublications.length}</strong><small>Not yet published</small></button>
  <button onClick={()=>open("jobs")}><span>Job applications</span><strong>{openJobs.length}</strong><small>Still open</small></button>
 </section>
 <section className="home-grid">
  <article className="card"><div className="card-head"><div><p className="kicker">Focus queue</p><h2>What needs attention</h2></div><button onClick={()=>open("kanban")}>View board →</button></div>
   <div className="focus-list">
    {active.slice(0,8).map(t=><div key={t.id}><span className={"priority "+t.priority.toLowerCase()}/><div><strong>{t.title}</strong><small>{t.due||"No date"}</small></div><Badge text={t.status}/></div>)}
    {active.length===0&&<p className="data-loading">Nothing open — nice.</p>}
   </div>
  </article>
  <aside className="card brief"><p className="kicker">Telegram capture</p><h2>Turn messages into records</h2><ol><li>/add a task, /job an application, /remind yourself.</li><li>Share any link to save it to Reads.</li><li>Everything lands straight in Supabase.</li></ol><div className="bot-command"><Send size={15}/><code>/add Review draft #Project</code></div></aside>
 </section></>
}
