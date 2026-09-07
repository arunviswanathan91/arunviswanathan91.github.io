import { useEffect, useRef, useState } from "react";
import { Mail, Trash2, X } from "lucide-react";
import { useData, useEntityTable } from "../../lib/store";
import { isEditable } from "../../entities/types";
import { formatDate } from "../../lib/format";
import { FieldInput } from "./FieldInput";
import { GmailLinkPicker } from "./GmailLinkPicker";
import { useEntityCtx } from "./ctx";
import type { EntityDef, FieldDef, Row } from "../../entities/types";

/** Non-modal side panel: the board stays interactive, so you can click straight from one
 *  record to the next. Esc closes and focus returns to whatever opened it. */
export function Drawer({def,row,onClose}:{def:EntityDef;row:Row;onClose():void}){
 const table=useEntityTable(def.key);
 const {tags}=useData();
 const {inputCtx}=useEntityCtx(def);
 const panel=useRef<HTMLDivElement>(null);
 const opener=useRef<Element|null>(null);
 const [gmailFieldKey,setGmailFieldKey]=useState<string|null>(null);

 useEffect(()=>{
  opener.current=document.activeElement;
  panel.current?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.stopPropagation();onClose()}};
  document.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("keydown",onKey);(opener.current as HTMLElement|null)?.focus?.()};
 },[onClose]);

 const editable=def.fields.filter(f=>f.drawer!==false&&isEditable(f));
 const stamps=def.fields.filter(f=>f.kind==="stamp"&&f.drawer!==false);
 const title=String(row[def.titleField]??"")||`Untitled ${def.singular}`;

 const valueOf=(f:FieldDef)=>f.kind==="tags"?(def.tagEntity?tags.idsFor(def.tagEntity,row.id):[]):row[f.key];
 const commit=(f:FieldDef,v:any)=>{
  if(f.kind==="tags"){if(def.tagEntity)void tags.setFor(def.tagEntity,row.id,v as string[])}
  else void table.update(row.id,{[f.key]:v});
 };
 const remove=async()=>{
  if(!window.confirm(`Delete this ${def.singular}?`))return;
  if(await table.remove(row.id))onClose();
 };

 return <aside className="drawer" ref={panel} role="dialog" aria-modal="false" aria-label={`Edit ${def.singular}`}>
  <header className="drawer-head">
   <div><p className="kicker">{def.singular}</p><h2 className="clamp-2">{title}</h2></div>
   <button className="icon-button" onClick={onClose} aria-label="Close panel"><X/></button>
  </header>
  <div className="drawer-body">
   {editable.map(f=><div key={f.key} className={"field"+(f.wide||f.kind==="tags"||f.kind==="longtext"?" field-wide":"")}>
    <label className="field-label">{f.label}{f.required&&<span className="req" aria-hidden="true">*</span>}</label>
    <div className="field-with-action">
     <FieldInput field={f} value={valueOf(f)} ctx={inputCtx} onCommit={v=>commit(f,v)}/>
     {f.kind==="url"&&f.gmailSearch&&
      <button type="button" className="icon-button" title="Find in Gmail"
       onClick={()=>setGmailFieldKey(f.key)}><Mail/></button>}
    </div>
   </div>)}
  </div>
  <footer className="drawer-foot">
   <div className="stamp-row">
    {stamps.map(f=>row[f.key]?<span key={f.key}>{f.label} {formatDate(row[f.key],true)}</span>:null)}
   </div>
   <button className="danger-button" onClick={()=>void remove()}><Trash2/>Delete</button>
  </footer>
  {gmailFieldKey&&(()=>{
   const f=def.fields.find(x=>x.key===gmailFieldKey);
   if(!f||f.kind!=="url"||!f.gmailSearch)return null;
   return <GmailLinkPicker initialQuery={f.gmailSearch(row)}
    onPick={url=>commit(f,url)} onClose={()=>setGmailFieldKey(null)}/>;
  })()}
 </aside>;
}
