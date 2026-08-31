import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Tag } from "../types";

export function TagManager({tags,usageCounts,onRename,onDelete,onClose}:{
 tags:Tag[];
 usageCounts:Map<string,number>;
 onRename:(id:string,name:string)=>void;
 onDelete:(id:string)=>void;
 onClose:()=>void;
}){
 const [editing,setEditing]=useState<Record<string,string>>({});
 return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
  <button className="close" onClick={onClose}><X/></button>
  <p className="kicker">Tags</p><h2>Manage tags</h2>
  <div className="manage-list">
   {tags.map(t=><div className="manage-row" key={t.id}>
    <input value={editing[t.id]??t.name} onChange={e=>setEditing(v=>({...v,[t.id]:e.target.value}))} onBlur={()=>{const next=(editing[t.id]??t.name).trim();if(next&&next!==t.name)onRename(t.id,next)}}/>
    <small>{usageCounts.get(t.id)??0} in use</small>
    <button type="button" className="icon-button" onClick={()=>{if(window.confirm(`Delete tag "${t.name}"? It will be removed from ${usageCounts.get(t.id)??0} item(s).`))onDelete(t.id)}}><Trash2 size={14}/></button>
   </div>)}
   {tags.length===0&&<p className="data-loading">No tags yet — add one from any tag picker.</p>}
  </div>
 </section></div>
}
