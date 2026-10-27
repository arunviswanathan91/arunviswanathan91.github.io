import { useEffect, useRef, useState } from "react";
import { Database, FileArchive, NotebookPen, Upload } from "lucide-react";
import { list } from "../../extended/lib/db";
import { buildBackup, buildBackupZip, parseBackup, restoreBackup, type Backup } from "../../extended/lib/backup";
import { downloadBlob, downloadNotes } from "../../extended/lib/download";
import { saveSettings, useSettings } from "../../extended/lib/settings";
import { CURRENCIES, type Note, type Paper, type Project } from "../../extended/lib/types";
import { SelectMenu } from "../ui/SelectMenu";
import { useConfirmDialog } from "../ui/ConfirmDialog";

const stamp=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");

/** Money and reminder preferences that used to live on a second settings page. */
export function PreferencesPanel(){
 const settings=useSettings();
 const followupOf=(n:number|null|undefined)=>n===undefined?"60":n===null?"":String(n);
 const [followup,setFollowup]=useState(followupOf(settings.publication_followup_days));
 const [status,setStatus]=useState("");
 useEffect(()=>setFollowup(followupOf(settings.publication_followup_days)),[settings.publication_followup_days]);
 const save=async(patch:Parameters<typeof saveSettings>[0])=>{
  try{await saveSettings(patch);setStatus("Saved.");setTimeout(()=>setStatus(""),1800)}catch(e){setStatus((e as Error).message)}
 };
 return <section className="panel">
  <header className="panel-head"><h2>Money & reminders</h2>{status&&<small className="muted-note" role="status">{status}</small>}</header>
  <div className="field">
   <label className="field-label" htmlFor="default-currency">Default currency</label>
   <SelectMenu id="default-currency" value={settings.default_currency} label="Default currency"
    options={[...new Set([settings.default_currency,...CURRENCIES])].map(c=>({value:c,label:c}))}
    onChange={value=>void save({default_currency:value})}/>
   <small className="muted-note">Used for new budget entries, loans and the “≈ all currencies” totals.</small>
  </div>
  <div className="field">
   <label className="field-label" htmlFor="followup-days">Chase papers under review after (days)</label>
   <input id="followup-days" className="input" type="number" min="1" step="1" value={followup} placeholder="Off"
    onChange={e=>setFollowup(e.target.value)}
    onBlur={()=>void save({publication_followup_days:followup===""?null:Math.max(1,Math.round(Number(followup)))})}/>
   <small className="muted-note">Telegram reminds you when a manuscript has been Under Review or Revision Requested this long. Empty turns it off. The evening habit reminder is set on the Habits page.</small>
  </div>
 </section>;
}

/** Backup, restore and notes export for the whole workspace. */
export function BackupPanel(){
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [pending,setPending]=useState<{backup:Backup;files:Record<string,Uint8Array>;name:string}|null>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const {ask,confirmation}=useConfirmDialog();

 const run=async(label:string,fn:()=>Promise<void>)=>{
  setBusy(true);setError("");setProgress(label);
  try{await fn()}catch(e){setError((e as Error).message);setProgress("")}finally{setBusy(false)}
 };
 const exportZip=()=>run("Preparing backup with files…",async()=>{
  const {zip,missing}=await buildBackupZip(setProgress);
  downloadBlob(new Blob([new Uint8Array(zip).buffer],{type:"application/zip"}),`workspace-backup-${stamp()}.zip`);
  setProgress(missing.length?`Backup downloaded, but ${missing.length} file(s) could not be read.`:"Backup with files downloaded.");
 });
 const exportJson=()=>run("Preparing backup…",async()=>{
  const b=await buildBackup(setProgress);
  downloadBlob(new Blob([JSON.stringify(b,null,2)],{type:"application/json"}),`workspace-backup-${stamp()}.json`);
  setProgress(`Backup downloaded: ${Object.values(b.counts).reduce((a,n)=>a+n,0)} records.`);
 });
 const exportNotes=()=>run("Collecting notes…",async()=>{
  const [notes,projects,papers]=await Promise.all([list<Note>("notes"),list<Project>("projects"),list<Paper>("papers")]);
  if(!notes.length)throw new Error("No notes to export");
  downloadNotes(notes,{project:id=>projects.find(p=>p.id===id)?.title??"",paper:id=>papers.find(p=>p.id===id)?.title??""});
  setProgress(`${notes.length} notes downloaded as markdown.`);
 });
 const pick=async(f:File|undefined)=>{
  if(!f)return;setError("");
  try{const parsed=parseBackup(new Uint8Array(await f.arrayBuffer()),f.name);setPending({...parsed,name:f.name})}
  catch(e){setError((e as Error).message)}
  finally{if(fileInput.current)fileInput.current.value=""}
 };
 const restore=()=>pending&&ask({title:"Restore this backup?",message:"Records with the same ids are overwritten with the backup’s version; nothing is deleted.",confirmLabel:"Restore"},
  ()=>run("Restoring…",async()=>{
   const r=await restoreBackup(pending.backup,pending.files,setProgress);
   setPending(null);
   setProgress(`Restored ${Object.values(r.restored).reduce((a,n)=>a+n,0)} records${r.filesUploaded?` and ${r.filesUploaded} files`:""}.${r.filesMissing?` ${r.filesMissing} files were not in the backup (data-only backup).`:""}`);
  }));

 return <section className="panel">
  <header className="panel-head"><h2>Backup & restore</h2></header>
  <p className="muted-note">A backup holds your workspace records (projects, tasks, publications, papers, notes, meetings, deadlines, habits, budget and loans). Connected-service credentials, sharing permissions, Trash and opportunity discovery data are left out.</p>
  <div className="button-column">
   <button className="secondary" disabled={busy} onClick={()=>void exportZip()}><FileArchive/>Download backup with files (.zip)</button>
   <button className="secondary" disabled={busy} onClick={()=>void exportJson()}><Database/>Download data only (.json)</button>
   <button className="secondary" disabled={busy} onClick={()=>void exportNotes()}><NotebookPen/>Download all notes as Markdown</button>
   <button className="secondary" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload/>Restore from a backup…</button>
  </div>
  <input ref={fileInput} type="file" hidden accept=".zip,.json,application/json,application/zip" onChange={e=>void pick(e.target.files?.[0])}/>
  {pending&&<div className="restore-preview">
   <p><strong>{pending.name}</strong> — made {new Date(pending.backup.exported_at).toLocaleString()}</p>
   <small className="muted-note">{Object.entries(pending.backup.counts).filter(([,n])=>n).map(([t,n])=>`${n} ${t.replace(/_/g," ")}`).join(", ")||"Empty backup"}
    {Object.keys(pending.files).length>0&&` · ${Object.keys(pending.files).length} files`}</small>
   <div className="button-row"><button className="primary" disabled={busy} onClick={()=>restore()}>Restore</button><button className="secondary" onClick={()=>setPending(null)}>Cancel</button></div>
  </div>}
  {progress&&<p className="muted-note" role="status">{progress}</p>}
  {error&&<p className="data-notice" role="alert">{error}</p>}
  {confirmation}
 </section>;
}
