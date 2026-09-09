import { ArrowLeft, ExternalLink, Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { ENTITIES } from "../../entities";
import { isEditable } from "../../entities/types";
import { formatDate } from "../../lib/format";
import { useData, useUi } from "../../lib/store";
import { FieldInput } from "../entity/FieldInput";
import { GmailLinkPicker } from "../entity/GmailLinkPicker";
import { useEntityCtx } from "../entity/ctx";
import { PublicationLifecycle } from "./PublicationLifecycle";
import { PublicationWorkflow } from "./PublicationWorkflow";
import type { FieldDef } from "../../entities/types";

const def=ENTITIES.publications;

/** A publication has enough state of its own to be a workspace, not a narrow
 * drawer: editorial lifecycle, custom work nodes, links and manuscript notes. */
export function PublicationView({publicationId}:{publicationId:string}){
 const {tables,tags,projects}=useData();
 const ui=useUi();
 const {inputCtx}=useEntityCtx(def);
 const [gmailFieldKey,setGmailFieldKey]=useState<string|null>(null);
 const publication=tables.publications.byId.get(publicationId)??null;

 const goBack=()=>{
  if(typeof ui.scope==="string"&&projects.byId.has(ui.scope))ui.openProject(ui.scope);
  else ui.setView("publications");
 };

 if(!publication)return <div className="empty-state">
  <def.icon/><p>This publication is unavailable or was deleted.</p>
  <button className="primary" onClick={()=>ui.setView("publications")}>Return to publications</button>
 </div>;

 const editable=def.fields.filter(f=>f.drawer!==false&&isEditable(f)&&f.key!=="stage"&&f.key!=="project_id");
 const stamps=def.fields.filter(f=>f.kind==="stamp"&&f.drawer!==false);
 const valueOf=(f:FieldDef)=>f.kind==="tags"&&def.tagEntity?tags.idsFor(def.tagEntity,publication.id):publication[f.key];
 const safeUrl=(f:FieldDef)=>{
  if(f.kind!=="url")return null;
  const value=String(publication[f.key]??"").trim();
  try{const url=new URL(value);return url.protocol==="http:"||url.protocol==="https:"?url.toString():null}catch{return null}
 };
 const commit=(f:FieldDef,value:any)=>{
  if(f.kind==="tags"&&def.tagEntity)void tags.setFor(def.tagEntity,publication.id,value as string[]);
  else void tables.publications.update(publication.id,{[f.key]:value});
 };
 const remove=async()=>{
  if(!window.confirm("Delete this publication?"))return;
  if(await tables.publications.remove(publication.id))goBack();
 };

 return <div className="publication-page">
  <header className="publication-page-head">
   <div>
    <button className="link-button publication-back" onClick={goBack}><ArrowLeft/>Back</button>
    <p className="kicker">Publication workspace</p>
    <h1>{publication.title||"Untitled publication"}</h1>
    <p className="subtitle">Track the editorial journey and the scientific work for this paper in one place.</p>
   </div>
   <span className="project-phase">{publication.stage||"Idea"}</span>
  </header>

  <div className="publication-page-grid">
   <main className="publication-page-main">
    <PublicationLifecycle publication={publication}/>
    <section className="panel publication-workflow-panel">
     <PublicationWorkflow publicationId={publication.id}/>
    </section>
   </main>

   <aside className="panel publication-details">
    <header className="panel-head"><h2>Paper details</h2><span className="muted-note">Autosaved</span></header>
    <div className="publication-details-grid">
     {editable.map(f=><div key={f.key} className={"field"+(f.wide||f.kind==="tags"||f.kind==="longtext"?" field-wide":"")}>
      <label className="field-label">{f.label}{f.required&&<span className="req" aria-hidden="true">*</span>}</label>
      <div className="field-with-action">
       <FieldInput field={f} value={valueOf(f)} ctx={inputCtx} onCommit={value=>commit(f,value)}/>
       {safeUrl(f)&&<a className="icon-button" href={safeUrl(f)!} target="_blank" rel="noopener noreferrer"
        title="Open link" aria-label={`Open ${f.label}`}><ExternalLink/></a>}
       {f.kind==="url"&&f.gmailSearch&&<button type="button" className="icon-button" title="Find in Gmail"
        aria-label="Find in Gmail" onClick={()=>setGmailFieldKey(f.key)}><Mail/></button>}
      </div>
     </div>)}
    </div>
    <footer className="publication-details-foot">
     <div className="stamp-row">{stamps.map(f=>publication[f.key]?<span key={f.key}>{f.label} {formatDate(publication[f.key],true)}</span>:null)}</div>
     <button className="danger-button" onClick={()=>void remove()}><Trash2/>Delete</button>
    </footer>
   </aside>
  </div>

  {gmailFieldKey&&(()=>{
   const field=def.fields.find(f=>f.key===gmailFieldKey);
   if(!field||field.kind!=="url"||!field.gmailSearch)return null;
   return <GmailLinkPicker initialQuery={field.gmailSearch(publication)}
    onPick={url=>commit(field,url)} onClose={()=>setGmailFieldKey(null)}/>;
  })()}
 </div>;
}
