import { useState } from "react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import type { Project, Publication, PublicationStage } from "../types";
import { KanbanBoard } from "./KanbanBoard";
import { ProjectScopeSwitcher } from "./ProjectScopeSwitcher";

const columns:PublicationStage[]=["Idea","Drafting","Submitted","Revision","Published"];

export function PublicationsBoard({publications,projects,move,remove,add}:{
 publications:Publication[];
 projects:Project[];
 move:(id:string,stage:PublicationStage)=>void;
 remove:(id:string)=>void;
 add:(title:string,venue:string,projectId:string|null)=>void;
}){
 const [scope,setScope]=useState("all");
 const [composer,setComposer]=useState(false);
 const [title,setTitle]=useState(""),[venue,setVenue]=useState("");
 const projectsById=new Map(projects.map(p=>[p.id,p.name]));
 const scoped=scope==="all"?publications:publications.filter(p=>p.projectId===scope);
 const close=()=>{setComposer(false);setTitle("");setVenue("")};
 const submit=()=>{const t=title.trim();if(!t)return;add(t,venue.trim(),scope==="all"?null:scope);close()};
 return <>
  <div className="title-row"><div><p className="kicker">Publication pipeline</p><h1>Publications</h1><p className="subtitle">Drag between stages. Switch between every publication and a single project.</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New publication</button></div>
  <ProjectScopeSwitcher projects={projects} scope={scope} onChange={setScope}/>
  <KanbanBoard items={scoped} columns={columns} getId={p=>p.id} getStage={p=>p.stage}
   onMove={(id,s)=>move(id,s as PublicationStage)}
   renderCard={p=><>
    <button className="delete-card" onClick={()=>remove(p.id)} title="Delete publication"><Trash2/></button>
    <h3>{p.title}</h3><p>{p.venue||"Venue not selected"}</p>
    {scope==="all"&&p.projectId&&<span className="card-tag">{projectsById.get(p.projectId)}</span>}
    <footer><small>{p.due||p.nextAction||"—"}</small>{p.url&&<a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}><ExternalLink size={13}/></a>}</footer>
   </>}/>
  {composer&&<div className="modal-backdrop" onMouseDown={close}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
   <button className="close" onClick={close}><X/></button>
   <p className="kicker">New publication</p><h2>Add to pipeline</h2>
   <input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title"/>
   <input value={venue} onChange={e=>setVenue(e.target.value)} placeholder="Venue (optional)"/>
   <div className="modal-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={submit}>Add</button></div>
  </section></div>}
 </>
}
