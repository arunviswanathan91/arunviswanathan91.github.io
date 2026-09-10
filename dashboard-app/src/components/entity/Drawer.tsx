import { useState } from "react";
import { ExternalLink, Mail, Trash2 } from "lucide-react";
import { useData, useEntityTable } from "../../lib/store";
import { isEditable } from "../../entities/types";
import { formatDate } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { FieldInput } from "./FieldInput";
import { GmailLinkPicker } from "./GmailLinkPicker";
import { useEntityCtx } from "./ctx";
import { PublicationLifecycle } from "../publications/PublicationLifecycle";
import { PublicationWorkflow } from "../publications/PublicationWorkflow";
import type { EntityDef, FieldDef, Row } from "../../entities/types";

/** Existing records use the same centered, modal interaction as the create composer.
 *  The historical component name is retained so callers and UI state stay compatible. */
export function Drawer({def,row,onClose}:{def:EntityDef;row:Row;onClose():void}){
 const table=useEntityTable(def.key);
 const {tags}=useData();
 const {inputCtx}=useEntityCtx(def);
 const [gmailFieldKey,setGmailFieldKey]=useState<string|null>(null);

 const editable=def.fields.filter(f=>f.drawer!==false&&isEditable(f));
 const stamps=def.fields.filter(f=>f.kind==="stamp"&&f.drawer!==false);
 const title=String(row[def.titleField]??"")||`Untitled ${def.singular}`;

 const valueOf=(f:FieldDef)=>f.kind==="tags"?(def.tagEntity?tags.idsFor(def.tagEntity,row.id):[]):row[f.key];
 const safeUrl=(f:FieldDef)=>{
  if(f.kind!=="url")return null;
  const value=String(row[f.key]??"").trim();
  try{
   const url=new URL(value);
   return url.protocol==="http:"||url.protocol==="https:"?url.toString():null;
  }catch{return null}
 };
 const commit=(f:FieldDef,v:any)=>{
  if(f.kind==="tags"){if(def.tagEntity)void tags.setFor(def.tagEntity,row.id,v as string[])}
  else void table.update(row.id,{[f.key]:v});
 };
 const remove=async()=>{
  if(!window.confirm(`Delete this ${def.singular}?`))return;
  if(await table.remove(row.id))onClose();
 };

 return <>
  <Modal kicker={def.singular} title={title} onClose={onClose} footer={
   <div className="record-edit-footer">
    <div className="stamp-row">
     {stamps.map(f=>row[f.key]?<span key={f.key}>{f.label} {formatDate(row[f.key],true)}</span>:null)}
    </div>
    <button type="button" className="danger-button" onClick={()=>void remove()}><Trash2/>Delete</button>
   </div>}>
   <div className="record-edit-grid">
    {def.key==="publications"&&<PublicationLifecycle publication={row}/>} 
    {editable.map(f=><div key={f.key} className={"field"+(f.wide||f.kind==="tags"||f.kind==="longtext"?" field-wide":"")}>
     <label className="field-label">{f.label}{f.required&&<span className="req" aria-hidden="true">*</span>}</label>
     <div className="field-with-action">
      <FieldInput field={f} value={valueOf(f)} ctx={inputCtx} onCommit={v=>commit(f,v)}/>
      {safeUrl(f)&&
       <a className="icon-button" href={safeUrl(f)!} target="_blank" rel="noopener noreferrer"
        title="Open link" aria-label={`Open ${f.label}`}><ExternalLink/></a>}
      {f.kind==="url"&&f.gmailSearch&&
       <button type="button" className="icon-button" title="Find in Gmail" aria-label="Find in Gmail"
        onClick={()=>setGmailFieldKey(f.key)}><Mail/></button>}
     </div>
    </div>)}
    {def.key==="publications"&&<PublicationWorkflow publicationId={row.id}/>} 
   </div>
  </Modal>
  {gmailFieldKey&&(()=>{
   const f=def.fields.find(x=>x.key===gmailFieldKey);
   if(!f||f.kind!=="url"||!f.gmailSearch)return null;
   return <GmailLinkPicker initialQuery={f.gmailSearch(row)}
    onPick={url=>commit(f,url)} onClose={()=>setGmailFieldKey(null)}/>;
  })()}
 </>;
}
