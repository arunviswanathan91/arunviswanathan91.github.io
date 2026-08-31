import { useState } from "react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import type { Read, Tag } from "../types";
import { TagPicker } from "./TagPicker";

export function ReadsView({reads,tags,remove,add,onCreateTag,onManageTags}:{
 reads:Read[];
 tags:Tag[];
 remove:(id:string)=>void;
 add:(url:string,title:string,notes:string,tagIds:string[])=>void;
 onCreateTag:(name:string)=>Promise<string|null>;
 onManageTags:()=>void;
}){
 const [filterTags,setFilterTags]=useState<string[]>([]);
 const [composer,setComposer]=useState(false);
 const [url,setUrl]=useState(""),[title,setTitle]=useState(""),[notes,setNotes]=useState(""),[draftTagIds,setDraftTagIds]=useState<string[]>([]);
 const tagsById=new Map(tags.map(t=>[t.id,t]));
 const usedTagIds=new Set(reads.flatMap(r=>r.tagIds));
 const usedTags=tags.filter(t=>usedTagIds.has(t.id));
 const filtered=reads.filter(r=>filterTags.length===0||r.tagIds.some(id=>filterTags.includes(id)));
 const toggleFilter=(id:string)=>setFilterTags(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const toggleDraft=(id:string)=>setDraftTagIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const createTag=async(name:string)=>{const id=await onCreateTag(name);if(id)setDraftTagIds(v=>[...v,id])};
 const close=()=>{setComposer(false);setUrl("");setTitle("");setNotes("");setDraftTagIds([])};
 const submit=()=>{const u=url.trim();if(!u)return;add(u,title.trim(),notes.trim(),draftTagIds);close()};
 return <>
  <div className="title-row"><div><p className="kicker">Read later</p><h1>Reads</h1><p className="subtitle">Share a link with the Telegram bot and confirm to save it here.</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New read</button></div>
  {usedTags.length>0&&<div className="tag-filter-row">{usedTags.map(t=><button key={t.id} className={"tag-chip"+(filterTags.includes(t.id)?" selected":"")} onClick={()=>toggleFilter(t.id)}>{t.name}</button>)}{filterTags.length>0&&<button className="tag-filter-clear" onClick={()=>setFilterTags([])}>Clear</button>}</div>}
  {filtered.length===0&&<p className="data-loading">Nothing saved yet.</p>}
  <div className="reads-list">{filtered.map(r=><div className="reads-row" key={r.id}>
   <div><strong>{r.title||r.url}</strong>{r.notes&&<small>{r.notes}</small>}
    {r.tagIds.length>0&&<div className="card-tags">{r.tagIds.map(id=>tagsById.get(id)&&<span key={id} className="tag-chip small">{tagsById.get(id)!.name}</span>)}</div>}
   </div>
   <small>{new Date(r.createdAt).toLocaleDateString()}</small>
   <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink size={15}/></a>
   <button className="icon-button" onClick={()=>remove(r.id)} title="Delete"><Trash2 size={14}/></button>
  </div>)}</div>
  {composer&&<div className="modal-backdrop" onMouseDown={close}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
   <button className="close" onClick={close}><X/></button>
   <p className="kicker">New read</p><h2>Save a link</h2>
   <input autoFocus value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/>
   <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional)"/>
   <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes (optional)"/>
   <TagPicker tags={tags} selected={draftTagIds} onToggle={toggleDraft} onCreate={createTag} onManage={onManageTags}/>
   <div className="modal-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={submit}>Save</button></div>
  </section></div>}
 </>
}
