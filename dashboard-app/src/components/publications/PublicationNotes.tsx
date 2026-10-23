import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/format";
import { decodeNote, encodeNote, MAX_NOTE_BYTES, noteFilename, noteWords, PAPER_NOTES_BUCKET } from "../../lib/paperNotes";

type Note={path:string;title:string;body:string;raw:string;updated:string};
const message=(e:unknown)=>e instanceof Error?e.message:typeof e==="object"&&e&&"message" in e?String(e.message):"Could not save the note. Please try again.";
function Markdown({text}:{text:string}){
 return <div className="paper-note-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml
  components={{a:({children,href})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
   img:({alt})=><span className="muted-note">[Image: {alt||"image"}]</span>}}>{text}</ReactMarkdown></div>;
}
function download(note:Pick<Note,"title"|"body">){
 const url=URL.createObjectURL(new Blob([encodeNote(note.title,note.body)],{type:"text/markdown;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=noteFilename(note.title);a.click();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function PublicationNotes({publicationId,canEdit,canDelete}:{publicationId:string;canEdit:boolean;canDelete:boolean}){
 const [notes,setNotes]=useState<Note[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [selected,setSelected]=useState<Note|"new"|null>(null);
 const generation=useRef(0);
 const load=useCallback(async()=>{
  const current=++generation.current;setLoading(true);setError("");
  try{
   if(!supabase)throw new Error("Sign in to save paper notes.");
   const bucket=supabase.storage.from(PAPER_NOTES_BUCKET);
   const files:{name:string;updated_at:string}[]=[];
   for(let offset=0;;offset+=100){
    const {data,error}=await bucket.list(publicationId,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
    if(error)throw error;
    files.push(...(data??[]).filter(file=>file.id&&file.name.endsWith(".md")).map(file=>({name:file.name,updated_at:file.updated_at??file.created_at??""})));
    if(!data||data.length<100)break;
   }
   const result:Note[]=[];let failed=0;
   for(let i=0;i<files.length;i+=5){
    if(current!==generation.current)return;
    await Promise.all(files.slice(i,i+5).map(async file=>{
     const path=`${publicationId}/${file.name}`;
     const {data,error}=await bucket.download(path);
     if(error||!data){failed++;return}
     const raw=await data.text();result.push({path,raw,...decodeNote(raw),updated:file.updated_at});
    }));
   }
   if(current===generation.current){setNotes(result.sort((a,b)=>b.updated.localeCompare(a.updated)));if(failed)setError(`${failed} note(s) could not be loaded. Retry to load them.`)}
  }catch(e){if(current===generation.current)setError(message(e))}
  finally{if(current===generation.current)setLoading(false)}
 },[publicationId]);
 useEffect(()=>{void load();return()=>{generation.current++}},[load]);
 return <section className="panel paper-notes">
  <header className="panel-head"><h2>Paper notes</h2>{canEdit&&<button type="button" className="secondary" onClick={()=>setSelected("new")}><Plus/>Add note</button>}</header>
  <p className="muted-note">Reviewer comments, replies and other long notes. Saved as Markdown files.</p>
  {error&&<div className="data-notice" role="alert">{error} <button type="button" className="link-button" onClick={()=>void load()}>Retry</button></div>}
  {loading&&<p role="status" className="muted-note">Loading notes…</p>}
  {!loading&&!error&&!notes.length&&<p className="workflow-empty">No notes yet. Add “First review comments” or “Response to reviewers”, then paste your text.</p>}
  <div className="paper-note-cards">{notes.map(note=><button type="button" className="paper-note-card" key={note.path} onClick={()=>setSelected(note)}>
   <span className="paper-note-card-title"><FileText/><strong>{note.title}</strong></span>
   <span className="paper-note-excerpt">{note.body.slice(0,240)}</span>
   <small>{noteWords(note.body).toLocaleString()} words · {formatDate(note.updated,true)} · .md</small>
  </button>)}</div>
  {selected&&<NoteDialog key={selected==="new"?"new":selected.path} note={selected==="new"?null:selected} publicationId={publicationId}
   canEdit={canEdit} canDelete={canDelete} onClose={()=>{setSelected(null);void load()}} onSaved={note=>{
    generation.current++;setLoading(false);setError("");setNotes(rows=>[note,...rows.filter(row=>row.path!==note.path)]);setSelected(note);
   }} onDeleted={path=>{generation.current++;setLoading(false);setNotes(rows=>rows.filter(row=>row.path!==path));setSelected(null)}}/>}
 </section>;
}

function NoteDialog({note,publicationId,canEdit,canDelete,onClose,onSaved,onDeleted}:{note:Note|null;publicationId:string;canEdit:boolean;canDelete:boolean;onClose():void;onSaved(note:Note):void;onDeleted(path:string):void}){
 const ref=useRef<HTMLDialogElement>(null);
 const [saved,setSaved]=useState(note),[editing,setEditing]=useState(!note);
 const [title,setTitle]=useState(note?.title??""),[body,setBody]=useState(note?.body??"");
 const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const newPath=useRef(`${publicationId}/${crypto.randomUUID()}.md`);
 const dirty=editing&&(title!==(saved?.title??"")||body!==(saved?.body??""));
 const close=()=>{if(!busy&&(!dirty||window.confirm("Discard unsaved changes to this note?")))onClose()};
 useEffect(()=>{ref.current?.showModal()},[]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=""};
  window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
 },[dirty]);
 const save=async()=>{
  if(!canEdit||busy)return;
  if(!title.trim()||!body.trim()){setError("Add a title and some note text before saving.");return}
  const raw=encodeNote(title,body),blob=new Blob([raw],{type:"text/markdown;charset=utf-8"});
  if(blob.size>MAX_NOTE_BYTES){setError("This note is too large. Split it into notes smaller than 2 MB.");return}
  setBusy(true);setError("");
  try{
   if(!supabase)throw new Error("Sign in to save this note.");
   const bucket=supabase.storage.from(PAPER_NOTES_BUCKET),path=saved?.path??newPath.current;
   if(saved){
    const latest=await bucket.download(path);if(latest.error)throw latest.error;
    if(await latest.data.text()!==saved.raw)throw new Error("This note changed in another session. Download your draft before closing, then reopen the note to load the latest version.");
   }
   const {error}=await bucket.upload(path,blob,{contentType:"text/markdown",cacheControl:"0",upsert:!!saved});
   if(error)throw error;
   const next={path,raw,...decodeNote(raw),updated:new Date().toISOString()};
   setSaved(next);setTitle(next.title);setBody(next.body);setEditing(false);setPreview(false);onSaved(next);
  }catch(e){setError(message(e))}finally{setBusy(false)}
 };
 const remove=async()=>{
  if(!canDelete||!saved||busy||!window.confirm(`Permanently delete “${saved.title}”? Download the Markdown first if you need a copy.`))return;
  setBusy(true);setError("");
  try{if(!supabase)throw new Error("Sign in to delete this note.");const {error}=await supabase.storage.from(PAPER_NOTES_BUCKET).remove([saved.path]);if(error)throw error;onDeleted(saved.path)}
  catch(e){setError(message(e))}finally{setBusy(false)}
 };
 return <dialog ref={ref} className="modal paper-note-dialog" aria-labelledby="paper-note-title" onCancel={e=>{e.preventDefault();close()}}>
  <div className="modal-inner">
   <header className="modal-head"><div><p className="kicker">Paper note · Markdown</p><h2 id="paper-note-title">{editing?(saved?"Edit note":"New note"):saved?.title}</h2></div>
    <button type="button" className="icon-button" aria-label="Close note" disabled={busy} onClick={close}><X/></button></header>
   <div className="paper-note-toolbar">
    <span className="muted-note">{noteWords(body).toLocaleString()} words · {Math.max(1,Math.ceil(noteWords(body)/220))} min read</span>
    <button type="button" className="secondary" onClick={()=>download({title:title||"paper-note",body})}><Download/>Download .md{editing?" draft":""}</button>
    {!editing&&canEdit&&<button type="button" className="secondary" onClick={()=>setEditing(true)}><Pencil/>Edit</button>}
   </div>
   {error&&<p className="data-notice" role="alert">{error}</p>}
   <div className="modal-body paper-note-body">
    {editing?<>
     <label className="field"><span className="field-label">Title</span><input autoFocus className="input" value={title} maxLength={200} disabled={busy} placeholder="First review comments" onChange={e=>setTitle(e.target.value)}/></label>
     <div className="panel-head"><span className="field-label">Note</span><button type="button" className="secondary" onClick={()=>setPreview(v=>!v)}>{preview?"Continue writing":"Preview"}</button></div>
     {preview?<Markdown text={body}/>:<textarea className="input paper-note-editor" aria-label="Note text" value={body} disabled={busy} placeholder="Paste your comments, reply or other notes here. Plain text and Markdown are supported." onChange={e=>setBody(e.target.value)}/>}
    </>:<Markdown text={saved?.body??""}/>}
   </div>
   <footer className="modal-actions">
    {editing?<><span className="muted-note">{dirty?"Unsaved changes":""}</span><button type="button" className="secondary" disabled={busy} onClick={()=>{
     if(dirty&&!window.confirm("Discard unsaved changes?"))return;
     if(!saved){onClose();return}setTitle(saved.title);setBody(saved.body);setEditing(false);setPreview(false);setError("");
    }}>Cancel</button><button type="button" className="primary" disabled={busy||!title.trim()||!body.trim()} onClick={()=>void save()}>{busy?"Saving…":"Save note"}</button></>
    :<>{canDelete&&<button type="button" className="danger-button" disabled={busy} onClick={()=>void remove()}><Trash2/>Delete note</button>}<button type="button" className="secondary" disabled={busy} onClick={close}>Close</button></>}
   </footer>
  </div>
 </dialog>;
}
