import { useState } from "react";
import { Modal } from "../ui/Modal";
import { FieldInput } from "./FieldInput";
import { DoiFetch } from "./DoiFetch";
import { useEntityCtx } from "./ctx";
import { isEditable } from "../../entities/types";
import type { EntityDef, FieldDef } from "../../entities/types";
import type { Person } from "../../lib/store";
import { insert } from "../../extended/lib/db";
import { today } from "../../extended/lib/dates";
import { useFollowPaper } from "../publications/SubmissionTrail";

// A new paper asks for a title and a project. Where it was sent is recorded as its first
// submission; journal, stage, rejection type and DOI then follow from the trail and the published version.
const PAPER_HIDDEN=["venue","stage","rejection_type","decision_email_url","review_comments","doi"];

/** Starts with the handful of `create` fields and expands to the full set on request —
 *  so the quick path stays quick but nothing is unreachable at creation time. */
export function Composer({def,seed,onClose,onSubmit,hiddenFields=[],people}:{
 def:EntityDef;seed:Record<string,unknown>;onClose():void;
 onSubmit(values:Record<string,unknown>,tagIds:string[]):Promise<boolean>;
 hiddenFields?:string[];
 people?:Person[];
}){
 const {inputCtx}=useEntityCtx(def);
 const scopedInputCtx=people?{...inputCtx,people}:inputCtx;
 const [values,setValues]=useState<Record<string,any>>(seed);
 const [tagIds,setTagIds]=useState<string[]>([]);
 const [expanded,setExpanded]=useState(false);
 const [busy,setBusy]=useState(false);
 const isPaper=def.key==="publications";
 const [journal,setJournal]=useState(""),[submittedOn,setSubmittedOn]=useState(today());
 const followProject=useFollowPaper();

 const editable=def.fields.filter(f=>isEditable(f)&&f.drawer!==false&&!hiddenFields.includes(f.key)&&!(isPaper&&PAPER_HIDDEN.includes(f.key)));
 const quick=editable.filter(f=>f.create);
 const shown=expanded?editable:quick;
 const missing=def.fields.filter(f=>f.required&&!String(values[f.key]??"").trim());

 const set=(f:FieldDef,v:any)=>{if(f.kind==="tags")setTagIds(v as string[]);else setValues(s=>({...s,[f.key]:v}))};
 const submit=async(close:()=>void)=>{
  if(missing.length){setExpanded(true);return}
  setBusy(true);
  const sentTo=isPaper?journal.trim():"";
  // An already-submitted paper starts under review at that journal, with the submission as the first entry of its trail.
  const id=sentTo?crypto.randomUUID():undefined;
  const day=submittedOn||today();
  const saved=await onSubmit(sentTo?{...values,id,stage:"Under Review",venue:sentTo}:values,tagIds);
  if(saved&&id){
   try{
    await insert("publication_submissions",{publication_id:id,journal:sentTo,position:0,status:"submitted",submitted_on:day,history:[{status:"submitted",on:day}]});
    await followProject({id,project_id:values.project_id},"submitted");
   }catch{/* the paper is saved; the submission can be recorded from its tile */}
  }
  setBusy(false);
  if(saved)close();
 };

 return <Modal kicker={def.kicker} title={`New ${def.singular}`} onClose={onClose}
  footer={close=><>
   {!expanded&&editable.length>quick.length&&
    <button type="button" className="secondary" onClick={()=>setExpanded(true)}>More fields</button>}
   <button type="button" className="secondary" onClick={close}>Cancel</button>
   <button type="button" className="primary" onClick={()=>void submit(close)} disabled={busy||missing.length>0}>
    {busy?"Adding…":"Add"}</button>
  </>}>
  <div className="field-grid">
   {def.key==="reads"&&<DoiFetch onFill={fill=>setValues(s=>({...s,title:fill.title||s.title,url:fill.url||s.url,notes:String(s.notes??"").trim()?s.notes:(fill.notes||s.notes)}))}/>}
   {shown.map((f,i)=><div key={f.key} className={"field"+(f.wide||f.kind==="tags"||f.kind==="longtext"?" field-wide":"")}>
    <label className="field-label">{f.label}{f.required&&<span className="req" aria-hidden="true">*</span>}</label>
    <FieldInput field={f} value={f.kind==="tags"?tagIds:values[f.key]} ctx={scopedInputCtx}
     autoFocus={i===0} onCommit={v=>set(f,v)}/>
   </div>)}
   {isPaper&&<div className="field field-wide"><label className="field-label" htmlFor="paper-sent-to">Already submitted to (optional)</label>
    <div className="field-with-action"><input id="paper-sent-to" className="input" value={journal} onChange={e=>setJournal(e.target.value)} placeholder="Journal, if it is already at one"/>
     <input type="date" className="input" style={{width:"auto"}} value={submittedOn} max={today()} onChange={e=>setSubmittedOn(e.target.value)} aria-label="Date submitted" disabled={!journal.trim()}/></div>
    <span className="muted-note">Leave empty for a paper still being planned or written. Journals, decisions and the final DOI are recorded on the paper afterwards.</span></div>}
  </div>
 </Modal>;
}
