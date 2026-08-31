import { useState } from "react";
import type { Tag } from "../types";

export function TagPicker({tags,selected,onToggle,onCreate,onManage}:{
 tags:Tag[];
 selected:string[];
 onToggle:(tagId:string)=>void;
 onCreate:(name:string)=>void;
 onManage?:()=>void;
}){
 const [draft,setDraft]=useState("");
 const submit=()=>{const n=draft.trim();if(!n)return;onCreate(n);setDraft("")};
 return <div className="tag-picker">
  <div className="tag-chips">
   {tags.map(t=><button type="button" key={t.id} className={"tag-chip"+(selected.includes(t.id)?" selected":"")} onClick={()=>onToggle(t.id)}>{t.name}</button>)}
  </div>
  <div className="tag-add"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();submit()}}} placeholder="+ new tag"/><button type="button" className="secondary" onClick={submit}>Add</button></div>
  {onManage&&<button type="button" className="tag-manage-link" onClick={onManage}>Manage tags</button>}
 </div>
}
