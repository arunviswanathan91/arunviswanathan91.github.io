import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { DocumentItem, DocumentKind, Project } from "../types";
import { Badge } from "./Badge";
import { DataTable } from "./DataTable";

const kinds:DocumentKind[]=["Manuscript","Protocol","Dataset","Figure","Reference"];

export function DocumentsView({documents,projects,remove,add}:{
 documents:DocumentItem[];
 projects:Project[];
 remove:(id:string)=>void;
 add:(title:string,kind:DocumentKind,projectId:string|null,driveUrl:string)=>void;
}){
 const [composer,setComposer]=useState(false);
 const [title,setTitle]=useState(""),[kind,setKind]=useState<DocumentKind>("Manuscript"),[projectId,setProjectId]=useState(""),[driveUrl,setDriveUrl]=useState("");
 const projectsById=new Map(projects.map(p=>[p.id,p.name]));
 const close=()=>{setComposer(false);setTitle("");setKind("Manuscript");setProjectId("");setDriveUrl("")};
 const submit=()=>{const t=title.trim();if(!t)return;add(t,kind,projectId||null,driveUrl.trim());close()};
 return <>
  <div className="title-row"><div><p className="kicker">Document and Drive tracker</p><h1>Documents</h1><p className="subtitle">Metadata for manuscripts, protocols and datasets.</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New document</button></div>
  <DataTable headers={["Document","Type","Project","Updated","Drive","",]} rows={documents.map(d=>[
   d.title,
   <Badge text={d.kind}/>,
   d.projectId?projectsById.get(d.projectId)??"—":"Inbox",
   d.updated,
   d.driveUrl?<a href={d.driveUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>:"Not linked",
   <button className="icon-button" onClick={()=>remove(d.id)} title="Delete document"><Trash2 size={14}/></button>,
  ])}/>
  {composer&&<div className="modal-backdrop" onMouseDown={close}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
   <button className="close" onClick={close}><X/></button>
   <p className="kicker">New document</p><h2>Add to tracker</h2>
   <input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title"/>
   <select value={kind} onChange={e=>setKind(e.target.value as DocumentKind)}>{kinds.map(k=><option key={k} value={k}>{k}</option>)}</select>
   <select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Inbox (no project)</option>{projects.filter(p=>p.status==="Active").map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <input value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} placeholder="Drive URL (optional)"/>
   <div className="modal-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={submit}>Add</button></div>
  </section></div>}
 </>
}
