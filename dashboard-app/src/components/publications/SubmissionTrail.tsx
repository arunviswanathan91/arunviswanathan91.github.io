import { useState } from "react";
import { Pencil, Route, Send, Trash2 } from "lucide-react";
import { insert, list, remove, update, useLoad } from "../../extended/lib/db";
import { today } from "../../extended/lib/dates";
import { formatDate } from "../../lib/format";
import { useData } from "../../lib/store";
import { SUBMISSION_STATUS, SUBMISSION_TONE, daysAt, isDecided, nextSteps, publicationPatch, stepPatch, summarise,
 type Submission, type SubmissionStatus } from "../../lib/submissions";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import type { Row } from "../../entities/types";

/** Every submission of every paper, loaded once and shared by the tiles and the publication page. */
export const useSubmissions=()=>useLoad(()=>list<Submission>("publication_submissions",{order:[["position"],["submitted_on"]]}),[]);

const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;

/** Where a paper has been sent and what happened there. `compact` is the version shown on a
 *  project's publication tile, so the trail can be read and updated without opening the paper. */
export function SubmissionTrail({publication,canEdit,compact=false}:{publication:Row;canEdit:boolean;compact?:boolean}){
 const {tables}=useData();
 const {data,error}=useSubmissions();
 const {ask,confirmation}=useConfirmDialog();
 const [journal,setJournal]=useState(""),[on,setOn]=useState(today());
 const [editing,setEditing]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const now=today();
 const trail=summarise((data??[]).filter(s=>s.publication_id===publication.id),now);
 const {rows,current}=trail;
 const open=current&&!isDecided(current.status)?current:null;

 const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setMessage("");try{await work()}catch(e){setMessage(e instanceof Error?e.message:"That could not be saved.")}finally{setBusy(false)}};
 // The publication's own venue, stage and rejection type follow the latest submission.
 const follow=(name:string,status:SubmissionStatus)=>tables.publications.update(publication.id,publicationPatch(name,status));
 const record=(sub:Submission,status:SubmissionStatus)=>run(async()=>{
  await update("publication_submissions",sub.id,stepPatch(sub,status,on||now));
  if(sub.id===current?.id)await follow(sub.journal,status);
 });
 const submit=()=>run(async()=>{
  const name=journal.trim();if(!name)return;
  const day=on||now;
  await insert("publication_submissions",{publication_id:publication.id,journal:name,position:(rows.at(-1)?.position??-1)+1,
   status:"submitted",submitted_on:day,history:[{status:"submitted",on:day}]});
  await follow(name,"submitted");
  setJournal("");
 });
 const save=(sub:Submission,patch:Partial<Submission>)=>run(async()=>{
  await update("publication_submissions",sub.id,patch);
  if(patch.journal&&sub.id===current?.id)await tables.publications.update(publication.id,{venue:patch.journal});
 });
 const drop=(sub:Submission)=>ask({title:"Remove this submission?",message:`${sub.journal} will be removed from this paper's submission history.`,confirmLabel:"Remove"},
  ()=>run(()=>remove("publication_submissions",{id:sub.id})));

 const counts=[
  trail.deskRejections.length&&`${plural(trail.deskRejections.length,"desk rejection","desk rejections")} (${trail.deskRejections.map(s=>s.journal).join(", ")})`,
  trail.reviewRejections.length&&`${plural(trail.reviewRejections.length,"rejection after review","rejections after review")} (${trail.reviewRejections.map(s=>s.journal).join(", ")})`,
  trail.withdrawn.length&&`${trail.withdrawn.length} withdrawn (${trail.withdrawn.map(s=>s.journal).join(", ")})`,
 ].filter(Boolean) as string[];

 const actions=canEdit&&<div className="submission-actions">
  {open&&nextSteps(open.status).map(step=><button key={step.status} type="button" className="chip-button" disabled={busy} onClick={()=>void record(open,step.status)}>{step.label}</button>)}
  {!open&&current?.status!=="accepted"&&<>
   <input className="input input-compact" value={journal} onChange={e=>setJournal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void submit()}}}
    placeholder={rows.length?"Next journal":"Journal submitted to"} aria-label={rows.length?"Next journal":"Journal submitted to"}/>
   <button type="button" className="chip-button" disabled={busy||!journal.trim()} onClick={()=>void submit()}><Send aria-hidden/>{rows.length?"Submit to next journal":"Record submission"}</button>
  </>}
  {(open||current?.status!=="accepted")&&<label className="submission-on">on <input type="date" className="input input-compact" value={on} max={now} onChange={e=>setOn(e.target.value)} aria-label="Date of this step"/></label>}
 </div>;

 if(error&&compact)return null;
 if(compact)return <div className="submission-trail is-compact">
  <p className="submission-headline">{trail.headline}</p>
  {rows.length>0&&<ol className="submission-chips">{rows.map((s,i)=><li key={s.id}><span className={"badge "+SUBMISSION_TONE[s.status]}>{i+1}. {s.journal} · {SUBMISSION_STATUS[s.status]}</span></li>)}</ol>}
  {counts.length>0&&<p className="muted-note">{counts.join(" · ")}</p>}
  {actions}
  {message&&<p className="muted-note" role="alert">{message}</p>}
  {confirmation}
 </div>;

 return <section className="panel submission-trail">
  <header className="panel-head"><h2><Route aria-hidden/> Submissions</h2>{rows.length>0&&<span className="muted-note">{plural(rows.length,"journal","journals")} tried</span>}</header>
  {error?<p className="muted-note" role="alert">The submission history could not be loaded: {error}</p>:<>
  <p className="submission-headline">{trail.headline}</p>
  {counts.length>0&&<p className="muted-note">{counts.join(" · ")}</p>}
  {rows.length>0&&<ol className="submission-list">{rows.map((s,i)=><li key={s.id} className={s.id===current?.id?"is-current":""}>
   <div className="submission-row">
    <span className="submission-n">{i+1}</span>
    <div className="submission-main">
     <strong>{s.journal}</strong>
     <small>Submitted {formatDate(s.submitted_on)}{s.decided_on?` · decided ${formatDate(s.decided_on)}`:""} · {plural(daysAt(s,now),"day","days")}{s.decided_on?"":" so far"}{s.manuscript_ref?` · ${s.manuscript_ref}`:""}</small>
     {s.history.length>1&&<small>{s.history.map(h=>`${SUBMISSION_STATUS[h.status]} ${formatDate(h.on)}`).join(" → ")}</small>}
     {s.notes&&editing!==s.id&&<p className="submission-notes">{s.notes}</p>}
    </div>
    <span className={"badge "+SUBMISSION_TONE[s.status]}>{SUBMISSION_STATUS[s.status]}</span>
    {canEdit&&<span className="submission-tools">
     <button type="button" className="icon-button" aria-label={`Edit ${s.journal}`} aria-pressed={editing===s.id} onClick={()=>setEditing(editing===s.id?null:s.id)}><Pencil/></button>
     <button type="button" className="icon-button" aria-label={`Remove ${s.journal}`} onClick={()=>drop(s)}><Trash2/></button>
    </span>}
   </div>
   {editing===s.id&&canEdit&&<div className="submission-edit">
    <label>Journal<input className="input" defaultValue={s.journal} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==s.journal)void save(s,{journal:v})}}/></label>
    <label>Submitted<input type="date" className="input" defaultValue={s.submitted_on} max={s.decided_on??now} onBlur={e=>{if(e.target.value&&e.target.value!==s.submitted_on)void save(s,{submitted_on:e.target.value})}}/></label>
    {s.decided_on&&<label>Decided<input type="date" className="input" defaultValue={s.decided_on} min={s.submitted_on} max={now} onBlur={e=>{if(e.target.value&&e.target.value!==s.decided_on)void save(s,{decided_on:e.target.value})}}/></label>}
    <label>Manuscript number<input className="input" defaultValue={s.manuscript_ref} onBlur={e=>{if(e.target.value!==s.manuscript_ref)void save(s,{manuscript_ref:e.target.value.trim()})}}/></label>
    <label className="submission-edit-wide">Notes<textarea className="input" rows={2} defaultValue={s.notes} placeholder="Editor's reason, reviewer themes, what to change before the next journal"
     onBlur={e=>{if(e.target.value!==s.notes)void save(s,{notes:e.target.value.trim()})}}/></label>
   </div>}
  </li>)}</ol>}
  {actions}
  {message&&<p className="muted-note" role="alert">{message}</p>}
  </>}
  {confirmation}
 </section>;
}
