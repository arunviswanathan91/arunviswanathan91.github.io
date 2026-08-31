import { useState } from "react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import type { Job, JobStage, Project, Tag } from "../types";
import { KanbanBoard } from "./KanbanBoard";
import { ProjectScopeSwitcher } from "./ProjectScopeSwitcher";
import { TagPicker } from "./TagPicker";

const columns:JobStage[]=["Saved","Preparing","Applied","Interview","Offer","Closed"];

export function JobsBoard({jobs,projects,tags,move,remove,add,onCreateTag,onManageTags}:{
 jobs:Job[];
 projects:Project[];
 tags:Tag[];
 move:(id:string,stage:JobStage)=>void;
 remove:(id:string)=>void;
 add:(organization:string,role:string,projectId:string|null,tagIds:string[])=>void;
 onCreateTag:(name:string)=>Promise<string|null>;
 onManageTags:()=>void;
}){
 const [scope,setScope]=useState("all");
 const [filterTags,setFilterTags]=useState<string[]>([]);
 const [composer,setComposer]=useState(false);
 const [organization,setOrganization]=useState(""),[role,setRole]=useState(""),[draftTagIds,setDraftTagIds]=useState<string[]>([]);
 const tagsById=new Map(tags.map(t=>[t.id,t]));
 const projectsById=new Map(projects.map(p=>[p.id,p.name]));
 const scoped=(scope==="all"?jobs:jobs.filter(j=>j.projectId===scope)).filter(j=>filterTags.length===0||j.tagIds.some(id=>filterTags.includes(id)));
 const usedTagIds=new Set(jobs.flatMap(j=>j.tagIds));
 const usedTags=tags.filter(t=>usedTagIds.has(t.id));
 const close=()=>{setComposer(false);setOrganization("");setRole("");setDraftTagIds([])};
 const submit=()=>{const org=organization.trim(),r=role.trim();if(!org||!r)return;add(org,r,scope==="all"?null:scope,draftTagIds);close()};
 const toggleFilter=(id:string)=>setFilterTags(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const toggleDraft=(id:string)=>setDraftTagIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const createTag=async(name:string)=>{const id=await onCreateTag(name);if(id)setDraftTagIds(v=>[...v,id])};
 return <>
  <div className="title-row"><div><p className="kicker">Job tracker</p><h1>Jobs</h1><p className="subtitle">Drag between stages. Filter by tag (e.g. postdoc, faculty, industry).</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New application</button></div>
  <ProjectScopeSwitcher projects={projects} scope={scope} onChange={setScope}/>
  {usedTags.length>0&&<div className="tag-filter-row">{usedTags.map(t=><button key={t.id} className={"tag-chip"+(filterTags.includes(t.id)?" selected":"")} onClick={()=>toggleFilter(t.id)}>{t.name}</button>)}{filterTags.length>0&&<button className="tag-filter-clear" onClick={()=>setFilterTags([])}>Clear</button>}</div>}
  <KanbanBoard items={scoped} columns={columns} getId={j=>j.id} getStage={j=>j.stage}
   onMove={(id,s)=>move(id,s as JobStage)}
   renderCard={j=><>
    <button className="delete-card" onClick={()=>remove(j.id)} title="Delete application"><Trash2/></button>
    <h3>{j.role}</h3><p>{j.organization}</p>
    {scope==="all"&&j.projectId&&<span className="card-tag">{projectsById.get(j.projectId)}</span>}
    {j.tagIds.length>0&&<div className="card-tags">{j.tagIds.map(id=>tagsById.get(id)&&<span key={id} className="tag-chip small">{tagsById.get(id)!.name}</span>)}</div>}
    <footer><small>{j.deadline||j.nextAction||"—"}</small>{j.url&&<a href={j.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}><ExternalLink size={13}/></a>}</footer>
   </>}/>
  {composer&&<div className="modal-backdrop" onMouseDown={close}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
   <button className="close" onClick={close}><X/></button>
   <p className="kicker">New application</p><h2>Add to tracker</h2>
   <input autoFocus value={organization} onChange={e=>setOrganization(e.target.value)} placeholder="Organization"/>
   <input value={role} onChange={e=>setRole(e.target.value)} placeholder="Role"/>
   <TagPicker tags={tags} selected={draftTagIds} onToggle={toggleDraft} onCreate={createTag} onManage={onManageTags}/>
   <div className="modal-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={submit}>Add</button></div>
  </section></div>}
 </>
}
