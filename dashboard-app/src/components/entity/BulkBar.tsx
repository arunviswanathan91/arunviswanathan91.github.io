import { Tag as TagIcon, Trash2, X } from "lucide-react";
import { Popover } from "../ui/Popover";
import { useData, useEntityTable } from "../../lib/store";
import type { EntityDef } from "../../entities/types";

/** Every action here is derived from the entity config, so no per-entity code. */
export function BulkBar({def,ids,onClear}:{def:EntityDef;ids:string[];onClear():void}){
 const table=useEntityTable(def.key);
 const {projects,tags}=useData();
 const enums=def.fields.filter(f=>f.kind==="enum"&&!f.derive&&f.filter);

 const setField=async(key:string,value:string|null)=>{await table.updateMany(ids,{[key]:value});onClear()};
 const remove=async()=>{
  if(!window.confirm(`Delete ${ids.length} ${ids.length===1?def.singular:def.singular+"s"}?`))return;
  await table.removeMany(ids);onClear();
 };

 return <div className="bulk-bar" role="region" aria-label="Bulk actions">
  <span className="bulk-count">{ids.length} selected</span>
  {enums.map(f=>f.kind==="enum"?<Popover key={f.key} label={f.label}>
   {close=><div className="pop-body"><div className="pop-options">
    {f.options.map(o=><button key={o} className="pop-item" onClick={()=>{void setField(f.key,o);close()}}>{o}</button>)}
   </div></div>}
  </Popover>:null)}

  {def.projectField&&<Popover label="Project">
   {close=><div className="pop-body"><div className="pop-options">
    <button className="pop-item" onClick={()=>{void setField(def.projectField!,null);close()}}>Inbox (no project)</button>
    {projects.rows.filter(p=>p.status==="Active").map(p=>
     <button key={p.id} className="pop-item" onClick={()=>{void setField(def.projectField!,p.id);close()}}>{p.name}</button>)}
   </div></div>}
  </Popover>}

  {def.tagEntity&&<Popover label="Tags" icon={<TagIcon/>}>
   {()=><div className="pop-body">
    <p className="pop-label">Add to all</p>
    <div className="tag-chips">
     {tags.tags.map(t=><button key={t.id} type="button" className={"tag-chip tint-"+(t.color??"slate")}
      onClick={()=>void tags.addTo(def.tagEntity!,ids,[t.id])}>{t.name}</button>)}
     {!tags.tags.length&&<span className="muted-note">No tags yet</span>}
    </div>
    <p className="pop-label">Remove from all</p>
    <div className="tag-chips">
     {tags.tags.map(t=><button key={t.id} type="button" className="tag-chip tint-slate"
      onClick={()=>void tags.removeFrom(def.tagEntity!,ids,[t.id])}>{t.name}</button>)}
    </div>
   </div>}
  </Popover>}

  <button className="danger-button" onClick={()=>void remove()}><Trash2/>Delete</button>
  <button className="icon-button" onClick={onClear} aria-label="Clear selection"><X/></button>
 </div>;
}
