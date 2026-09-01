import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldInput } from "./FieldInput";
import { useEntityCtx } from "./ctx";
import { isEditable } from "../../entities/types";
import type { EntityDef, FieldDef } from "../../entities/types";

/** Starts with the handful of `create` fields and expands to the full set on request —
 *  so the quick path stays quick but nothing is unreachable at creation time. */
export function Composer({def,seed,onClose,onSubmit}:{
 def:EntityDef;seed:Record<string,unknown>;onClose():void;
 onSubmit(values:Record<string,unknown>,tagIds:string[]):Promise<void>;
}){
 const {inputCtx}=useEntityCtx(def);
 const [values,setValues]=useState<Record<string,any>>(seed);
 const [tagIds,setTagIds]=useState<string[]>([]);
 const [expanded,setExpanded]=useState(false);
 const [busy,setBusy]=useState(false);

 const editable=def.fields.filter(f=>isEditable(f)&&f.drawer!==false);
 const quick=editable.filter(f=>f.create);
 const shown=expanded?editable:quick;
 const missing=def.fields.filter(f=>f.required&&!String(values[f.key]??"").trim());

 const set=(f:FieldDef,v:any)=>{if(f.kind==="tags")setTagIds(v as string[]);else setValues(s=>({...s,[f.key]:v}))};
 const submit=async()=>{
  if(missing.length){setExpanded(true);return}
  setBusy(true);await onSubmit(values,tagIds);setBusy(false);
 };

 return <Modal kicker={def.kicker} title={`New ${def.singular}`} onClose={onClose}
  footer={<>
   {!expanded&&editable.length>quick.length&&
    <button type="button" className="secondary" onClick={()=>setExpanded(true)}>More fields</button>}
   <button type="button" className="secondary" onClick={onClose}>Cancel</button>
   <button type="button" className="primary" onClick={()=>void submit()} disabled={busy||missing.length>0}>
    {busy?"Adding…":"Add"}</button>
  </>}>
  <div className="field-grid">
   {shown.map((f,i)=><div key={f.key} className={"field"+(f.wide||f.kind==="tags"||f.kind==="longtext"?" field-wide":"")}>
    <label className="field-label">{f.label}{f.required&&<span className="req" aria-hidden="true">*</span>}</label>
    <FieldInput field={f} value={f.kind==="tags"?tagIds:values[f.key]} ctx={inputCtx}
     autoFocus={i===0} onCommit={v=>set(f,v)}/>
   </div>)}
  </div>
 </Modal>;
}
