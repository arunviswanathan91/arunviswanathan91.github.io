import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Reminder, Tag } from "../types";
import { TagPicker } from "./TagPicker";

function Group({title,items,tagsById,toggleDone,remove,defaultOpen}:{
 title:string;
 items:Reminder[];
 tagsById:Map<string,Tag>;
 toggleDone:(id:string,done:boolean)=>void;
 remove:(id:string)=>void;
 defaultOpen:boolean;
}){
 if(items.length===0)return null;
 return <details className="reminder-group" open={defaultOpen}>
  <summary>{title} <b>{items.length}</b></summary>
  <div className="reminder-list">{items.map(r=><div className="reminder-row" key={r.id}>
   <input type="checkbox" checked={r.done} onChange={e=>toggleDone(r.id,e.target.checked)}/>
   <div><strong className={r.done?"struck":""}>{r.title}</strong>{r.body&&<small>{r.body}</small>}
    {r.tagIds.length>0&&<div className="card-tags">{r.tagIds.map(id=>tagsById.get(id)&&<span key={id} className="tag-chip small">{tagsById.get(id)!.name}</span>)}</div>}
   </div>
   <small>{r.remindAt?new Date(r.remindAt).toLocaleString():"No date"}</small>
   <button className="icon-button" onClick={()=>remove(r.id)} title="Delete reminder"><Trash2 size={14}/></button>
  </div>)}</div>
 </details>
}

export function RemindersView({reminders,tags,toggleDone,remove,add,onCreateTag,onManageTags}:{
 reminders:Reminder[];
 tags:Tag[];
 toggleDone:(id:string,done:boolean)=>void;
 remove:(id:string)=>void;
 add:(title:string,body:string,remindAt:string|null,tagIds:string[])=>void;
 onCreateTag:(name:string)=>Promise<string|null>;
 onManageTags:()=>void;
}){
 const [filterTags,setFilterTags]=useState<string[]>([]);
 const [composer,setComposer]=useState(false);
 const [title,setTitle]=useState(""),[body,setBody]=useState(""),[remindAt,setRemindAt]=useState(""),[draftTagIds,setDraftTagIds]=useState<string[]>([]);
 const tagsById=new Map(tags.map(t=>[t.id,t]));
 const usedTagIds=new Set(reminders.flatMap(r=>r.tagIds));
 const usedTags=tags.filter(t=>usedTagIds.has(t.id));
 const filtered=reminders.filter(r=>filterTags.length===0||r.tagIds.some(id=>filterTags.includes(id)));
 const now=Date.now();
 const overdue=filtered.filter(r=>!r.done&&r.remindAt&&new Date(r.remindAt).getTime()<now);
 const upcoming=filtered.filter(r=>!r.done&&r.remindAt&&new Date(r.remindAt).getTime()>=now);
 const noDate=filtered.filter(r=>!r.done&&!r.remindAt);
 const done=filtered.filter(r=>r.done);
 const toggleFilter=(id:string)=>setFilterTags(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const toggleDraft=(id:string)=>setDraftTagIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const createTag=async(name:string)=>{const id=await onCreateTag(name);if(id)setDraftTagIds(v=>[...v,id])};
 const close=()=>{setComposer(false);setTitle("");setBody("");setRemindAt("");setDraftTagIds([])};
 const submit=()=>{const t=title.trim();if(!t)return;add(t,body.trim(),remindAt?new Date(remindAt).toISOString():null,draftTagIds);close()};
 return <>
  <div className="title-row"><div><p className="kicker">Remember me</p><h1>Reminders</h1><p className="subtitle">Set a time and the Telegram bot will ping you when it arrives.</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New reminder</button></div>
  {usedTags.length>0&&<div className="tag-filter-row">{usedTags.map(t=><button key={t.id} className={"tag-chip"+(filterTags.includes(t.id)?" selected":"")} onClick={()=>toggleFilter(t.id)}>{t.name}</button>)}{filterTags.length>0&&<button className="tag-filter-clear" onClick={()=>setFilterTags([])}>Clear</button>}</div>}
  {filtered.length===0&&<p className="data-loading">No reminders yet.</p>}
  <Group title="Overdue" items={overdue} tagsById={tagsById} toggleDone={toggleDone} remove={remove} defaultOpen/>
  <Group title="Upcoming" items={upcoming} tagsById={tagsById} toggleDone={toggleDone} remove={remove} defaultOpen/>
  <Group title="No date" items={noDate} tagsById={tagsById} toggleDone={toggleDone} remove={remove} defaultOpen/>
  <Group title="Done" items={done} tagsById={tagsById} toggleDone={toggleDone} remove={remove} defaultOpen={false}/>
  {composer&&<div className="modal-backdrop" onMouseDown={close}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
   <button className="close" onClick={close}><X/></button>
   <p className="kicker">New reminder</p><h2>Remember something</h2>
   <input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="What should I remember?"/>
   <input value={body} onChange={e=>setBody(e.target.value)} placeholder="Details (optional)"/>
   <input type="datetime-local" value={remindAt} onChange={e=>setRemindAt(e.target.value)}/>
   <TagPicker tags={tags} selected={draftTagIds} onToggle={toggleDraft} onCreate={createTag} onManage={onManageTags}/>
   <div className="modal-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={submit}>Add</button></div>
  </section></div>}
 </>
}
