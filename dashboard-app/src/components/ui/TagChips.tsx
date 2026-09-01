import { useState } from "react";
import type { Tag } from "../../lib/tags";

export function TagChips({ids,byId,max}:{ids:string[];byId:Map<string,Tag>;max?:number}){
 if(!ids.length)return null;
 const shown=max?ids.slice(0,max):ids,rest=max?ids.length-shown.length:0;
 return <span className="tag-chips">
  {shown.map(id=>{const t=byId.get(id);return t?<span key={id} className={"tag-chip tint-"+(t.color??"slate")}>{t.name}</span>:null})}
  {rest>0&&<span className="tag-chip tint-slate">+{rest}</span>}
 </span>;
}

/** Multi-select tag editor with inline creation, used by the drawer, composer and bulk bar. */
export function TagEditor({tags,selected,onToggle,onCreate,label="Tags"}:{
 tags:Tag[];selected:string[];onToggle(id:string):void;
 onCreate?(name:string):void|Promise<unknown>;label?:string;
}){
 const [draft,setDraft]=useState("");
 const submit=()=>{const n=draft.trim();if(!n||!onCreate)return;void onCreate(n);setDraft("")};
 return <div className="tag-editor" role="group" aria-label={label}>
  <div className="tag-chips">
   {tags.map(t=><button type="button" key={t.id} aria-pressed={selected.includes(t.id)}
    className={"tag-chip tint-"+(t.color??"slate")+(selected.includes(t.id)?" selected":"")}
    onClick={()=>onToggle(t.id)}>{t.name}</button>)}
   {!tags.length&&<span className="muted-note">No tags yet</span>}
  </div>
  {onCreate&&<div className="tag-add">
   <input className="input input-compact" value={draft} placeholder="New tag" aria-label="New tag name"
    onChange={e=>setDraft(e.target.value)}
    onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();submit()}}}/>
   <button type="button" className="secondary" onClick={submit} disabled={!draft.trim()}>Add</button>
  </div>}
 </div>;
}
