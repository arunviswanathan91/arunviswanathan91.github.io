import { useState } from "react";
import { Archive, ArchiveRestore, Trash2, X } from "lucide-react";
import type { Project } from "../types";

export function ProjectManager({projects,onRename,onSetStatus,onDelete,onClose}:{
 projects:Project[];
 onRename:(id:string,name:string)=>void;
 onSetStatus:(id:string,status:"Active"|"Archived")=>void;
 onDelete:(id:string)=>void;
 onClose:()=>void;
}){
 const [editing,setEditing]=useState<Record<string,string>>({});
 return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
  <button className="close" onClick={onClose}><X/></button>
  <p className="kicker">Boards</p><h2>Manage projects</h2>
  <div className="manage-list">
   {projects.map(p=><div className="manage-row" key={p.id}>
    <input value={editing[p.id]??p.name} onChange={e=>setEditing(v=>({...v,[p.id]:e.target.value}))} onBlur={()=>{const next=(editing[p.id]??p.name).trim();if(next&&next!==p.name)onRename(p.id,next)}}/>
    <small>{p.status}</small>
    <button type="button" className="icon-button" title={p.status==="Active"?"Archive":"Unarchive"} onClick={()=>onSetStatus(p.id,p.status==="Active"?"Archived":"Active")}>{p.status==="Active"?<Archive size={14}/>:<ArchiveRestore size={14}/>}</button>
    <button type="button" className="icon-button" title="Delete project" onClick={()=>{if(window.confirm(`Delete project "${p.name}"? Its tasks, publications, documents and jobs move to Inbox/All.`))onDelete(p.id)}}><Trash2 size={14}/></button>
   </div>)}
   {projects.length===0&&<p className="data-loading">No projects yet.</p>}
  </div>
 </section></div>
}
