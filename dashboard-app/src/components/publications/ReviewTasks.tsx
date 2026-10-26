import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import type { Row } from "../../entities/types";
import { pointTitle, reviewPoints } from "../../lib/reviewPoints";
import { useData } from "../../lib/store";

/** Turns pasted reviewer comments into tasks linked to the paper, skipping ones already on the board. */
export function ReviewTasks({publication}:{publication:Row}){
 const {userId,tables}=useData();
 const points=useMemo(()=>reviewPoints(String(publication.review_comments??"")),[publication.review_comments]);
 const existing=new Set(tables.tasks.rows.filter(t=>t.publication_id===publication.id).map(t=>String(t.title)));
 const [picked,setPicked]=useState<Set<number>>(()=>new Set(points.map((_,i)=>i)));
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 if(!points.length)return null;
 const chosen=points.map((p,i)=>({p,i,title:pointTitle(p)})).filter(x=>picked.has(x.i)&&!existing.has(x.title));

 const create=async()=>{
  setBusy(true);let n=0;
  for(const {p,title} of chosen){
   const row=await tables.tasks.insert({user_id:userId,title,notes:p===title?null:p,publication_id:publication.id,project_id:publication.project_id??null,status:"Backlog",priority:"Medium",source:"review"});
   if(row)n++;
  }
  setBusy(false);
  setStatus(n?`Created ${n} task${n>1?"s":""} on the task board, linked to this paper.`:"No tasks were created.");
 };

 return <section className="panel review-tasks">
  <header className="panel-head"><h2><ListChecks/> Reviewer comments → tasks</h2></header>
  <p className="muted-note">Each point below becomes a task linked to this paper. Untick anything you don’t want to track.</p>
  <ul className="review-points">
   {points.map((p,i)=>{
    const title=pointTitle(p),done=existing.has(title);
    return <li key={i} className={done?"is-done":""}>
     <label>
      <input type="checkbox" disabled={done} checked={!done&&picked.has(i)}
       onChange={()=>setPicked(s=>{const n=new Set(s);if(n.has(i))n.delete(i);else n.add(i);return n})}/>
      <span><strong>{title}</strong>{p!==title&&<small>{p.slice(title.length).trim()}</small>}{done&&<small> · already a task</small>}</span>
     </label>
    </li>;
   })}
  </ul>
  <div className="review-tasks-foot">
   {status&&<span className="muted-note">{status}</span>}
   <button className="primary" disabled={busy||!chosen.length} onClick={()=>void create()}>{busy?"Creating…":`Create ${chosen.length} task${chosen.length===1?"":"s"}`}</button>
  </div>
 </section>;
}
