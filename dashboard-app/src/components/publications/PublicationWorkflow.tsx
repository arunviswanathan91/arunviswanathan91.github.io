import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { useData } from "../../lib/store";
import { fromInput, toInput } from "../../lib/format";

const NODE_STATUS=["Pending","In progress","Waiting","Done"] as const;

/** Paper-specific work sequence. The canonical editorial stage remains on the
 * publication itself; these nodes are the custom scientific/submission steps. */
export function PublicationWorkflow({publicationId}:{publicationId:string}){
 const {userId,people,publicationNodes}=useData();
 const [title,setTitle]=useState("");
 const nodes=useMemo(()=>publicationNodes.rows.filter(n=>n.publication_id===publicationId)
  .sort((a,b)=>a.position-b.position||a.created_at.localeCompare(b.created_at)),[publicationNodes.rows,publicationId]);

 const add=async()=>{
  const name=title.trim();if(!name)return;
  await publicationNodes.insert({user_id:userId,publication_id:publicationId,title:name,status:"Pending",
   position:(nodes.at(-1)?.position??-1)+1});
  setTitle("");
 };
 const move=async(index:number,delta:number)=>{
  const other=nodes[index+delta],node=nodes[index];if(!other||!node)return;
  const position=node.position;
  await publicationNodes.update(node.id,{position:other.position});
  await publicationNodes.update(other.id,{position});
 };
 const setStatus=(id:string,status:string)=>void publicationNodes.update(id,{
  status,completed_at:status==="Done"?new Date().toISOString():null,
 });

 return <section className="publication-workflow field-wide" aria-labelledby="publication-workflow-heading">
  <div className="workflow-heading">
   <div><span className="field-label" id="publication-workflow-heading">Custom paper nodes</span>
    <p className="muted-note">Add, assign, date and reorder the work steps specific to this paper.</p></div>
  </div>
  <div className="publication-nodes">
   {nodes.map((node,index)=><article className={"publication-node node-"+node.status.toLowerCase().replaceAll(" ","-")} key={node.id}>
    <div className="publication-node-head">
     <input className="node-title" defaultValue={node.title} aria-label="Step name"
      onBlur={e=>{const value=e.target.value.trim();if(value&&value!==node.title)void publicationNodes.update(node.id,{title:value})}}/>
     <div className="node-actions">
      <button className="icon-button" disabled={index===0} onClick={()=>void move(index,-1)} aria-label="Move step left"><ArrowLeft/></button>
      <button className="icon-button" disabled={index===nodes.length-1} onClick={()=>void move(index,1)} aria-label="Move step right"><ArrowRight/></button>
      <button className="icon-button" onClick={()=>{if(window.confirm(`Delete step “${node.title}”?`))void publicationNodes.remove(node.id)}} aria-label="Delete step"><Trash2/></button>
     </div>
    </div>
    <select className="input input-compact" value={node.status} aria-label={`${node.title} status`}
     onChange={e=>setStatus(node.id,e.target.value)}>
     {NODE_STATUS.map(s=><option key={s}>{s}</option>)}
    </select>
    <select className="input input-compact" value={node.assignee_id??""} aria-label={`${node.title} assignee`}
     onChange={e=>void publicationNodes.update(node.id,{assignee_id:e.target.value||null})}>
     <option value="">Unassigned</option>
     {people.rows.map(p=><option key={p.id} value={p.id}>{p.name}{p.role?` · ${p.role}`:""}</option>)}
    </select>
    <input className="input input-compact" type="date" value={toInput(node.due_at,false)} aria-label={`${node.title} due date`}
     onChange={e=>void publicationNodes.update(node.id,{due_at:fromInput(e.target.value,false)})}/>
    <input className="input input-compact node-notes" defaultValue={node.notes??""} placeholder="Notes or expected output"
     aria-label={`${node.title} notes`} onBlur={e=>{const notes=e.target.value.trim()||null;if(notes!==node.notes)void publicationNodes.update(node.id,{notes})}}/>
    {node.status==="Done"&&<span className="node-done"><Check/>Complete</span>}
   </article>)}
   {!nodes.length&&<p className="workflow-empty">No custom steps yet. Examples: analysis, figures, co-author review, preprint and submission.</p>}
  </div>
  <div className="workflow-add">
   <input className="input" value={title} placeholder="Add a custom step…" aria-label="New paper step"
    onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void add()}}}/>
   <button type="button" className="secondary" disabled={!title.trim()} onClick={()=>void add()}><Plus/>Add step</button>
  </div>
 </section>;
}
