import { useMemo, useState } from "react";
import {
 ArrowLeft, ArrowRight, BookMarked, CalendarClock, ExternalLink,
 FileText, FlaskConical, FolderKanban, Link2, Mail, Pencil, Plus, Send, Trash2, UserRound, Users,
} from "lucide-react";
import { ENTITIES, TASK_STATUS } from "../../entities";
import { formatDate } from "../../lib/format";
import { TAG_COLORS } from "../../lib/tags";
import { useData, useUi } from "../../lib/store";
import { Composer } from "../entity/Composer";
import { Drawer } from "../entity/Drawer";
import { Modal } from "../ui/Modal";
import { TagChips, TagEditor } from "../ui/TagChips";
import type { EntityKey, Row } from "../../entities/types";
import type { Person, Project, ProjectStage } from "../../lib/store";

type ProjectTab="overview"|"work"|"publications"|"reads"|"people";
type ProjectEntityKey="tasks"|"publications"|"reads";
type ComposerState={key:ProjectEntityKey;seed:Record<string,unknown>}|null;
const TASK_MIME="application/x-science-project-task";

const cleanTelegram=(value:string|null)=>value?.trim().replace(/^@/,"")||null;
const safeHttp=(value:string)=>{try{const u=new URL(value);return u.protocol==="http:"||u.protocol==="https:"?u.toString():null}catch{return null}};

export function ProjectView({projectId,accessRole}:{projectId:string;accessRole?:"editor"|"viewer"}){
 const data=useData(),ui=useUi();
 const project=data.projects.byId.get(projectId)??null;
 const [tab,setTab]=useState<ProjectTab>("overview");
 const [composer,setComposer]=useState<ComposerState>(null);
 const [manageStages,setManageStages]=useState(false);
 const [person,setPerson]=useState<Person|"new"|null>(null);

 const projectTasks=useMemo(()=>data.tables.tasks.rows.filter(r=>r.project_id===projectId),[data.tables.tasks.rows,projectId]);
 const stages=useMemo(()=>data.projectStages.rows.filter(s=>s.project_id===projectId)
  .sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name)),[data.projectStages.rows,projectId]);
 const directPapers=useMemo(()=>data.tables.publications.rows.filter(r=>r.project_id===projectId),[data.tables.publications.rows,projectId]);
 const projectTagIds=data.tags.idsFor("project",projectId);
 const relatedPapers=useMemo(()=>data.tables.publications.rows.filter(r=>r.project_id!==projectId&&
  projectTagIds.some(tag=>data.tags.idsFor("publication",r.id).includes(tag))),
  [data.tables.publications.rows,data.tags,projectId,projectTagIds.join("|")]);
 const projectReads=useMemo(()=>data.tables.reads.rows.filter(r=>r.project_id===projectId),[data.tables.reads.rows,projectId]);

 if(!project)return <div className="empty-state"><FolderKanban/><p>This project is unavailable or was deleted.</p>
  <button className="primary" onClick={()=>ui.setView("home")}>Return home</button></div>;

 const isOwner=project.user_id===data.userId;
 const canEdit=isOwner||accessRole==="editor";
 const newEntity=(key:ProjectEntityKey,preset:Record<string,unknown>={})=>
  setComposer({key,seed:{...ENTITIES[key].newDefaults({userId:String(project.user_id),projectId}),...preset}});
 const submitEntity=async(values:Record<string,unknown>,tagIds:string[])=>{
  if(!composer)return;
  const key=composer.key,def=ENTITIES[key];
  const clean=Object.fromEntries(Object.entries(values).filter(([,v])=>v!==""&&v!==undefined));
  const row=await data.tables[key].insert(clean);
  if(!row)return;
  if(tagIds.length&&def.tagEntity)await data.tags.setFor(def.tagEntity,row.id,tagIds);
  setComposer(null);
 };
 const drawer=ui.drawer;
 const drawerRow=drawer?data.tables[drawer.entity].byId.get(drawer.id)??null:null;

 const tabs:{key:ProjectTab;label:string;count?:number}[]=[
  {key:"overview",label:"Overview"},{key:"work",label:"Work board",count:projectTasks.length},
  {key:"publications",label:"Publications",count:directPapers.length+relatedPapers.length},
  {key:"reads",label:"Reads",count:projectReads.length},{key:"people",label:"People"},
 ];

 return <div className="project-view">
  <header className="project-head">
   <div><p className="kicker">Scientific project</p><h1>{project.name}</h1>
    <p className="subtitle">{project.description||"Add a description and objective for this project."}</p></div>
   <div className="project-head-actions">
    <span className="project-phase">{project.phase||"Planning"}</span>
    {canEdit&&<button className="secondary" onClick={()=>setManageStages(true)}><FolderKanban/>Manage stages</button>}
    {canEdit&&<button className="primary" onClick={()=>newEntity("tasks",{stage_id:stages[0]?.id})}><Plus/>Add work</button>}
   </div>
  </header>

  <nav className="project-tabs" aria-label="Project sections">
   {tabs.map(t=><button key={t.key} className={tab===t.key?"active":""} aria-current={tab===t.key?"page":undefined}
    onClick={()=>setTab(t.key)}>{t.label}{t.count!==undefined&&<span>{t.count}</span>}</button>)}
  </nav>

  {tab==="overview"&&<ProjectOverview project={project} canEdit={canEdit} isOwner={isOwner}/>} 
  {tab==="work"&&<ProjectBoard project={project} stages={stages} tasks={projectTasks}
   canEdit={canEdit} onAdd={stageId=>newEntity("tasks",{stage_id:stageId})} onOpen={id=>ui.openDrawer("tasks",id)} onManage={()=>setManageStages(true)}/>} 
  {tab==="publications"&&<ProjectPublications project={project} direct={directPapers} related={relatedPapers}
   canEdit={canEdit} isOwner={isOwner} onAdd={()=>newEntity("publications")} onOpen={ui.openPublication}/>} 
  {tab==="reads"&&<ProjectReads project={project} rows={projectReads}
   canEdit={canEdit} isOwner={isOwner} onAdd={()=>newEntity("reads")} onOpen={id=>ui.openDrawer("reads",id)}/>} 
  {tab==="people"&&<ProjectPeople projectId={projectId} isOwner={isOwner} onAdd={()=>setPerson("new")} onEdit={setPerson}/>} 

  {manageStages&&canEdit&&<StageManager project={project} stages={stages} tasks={projectTasks} isOwner={isOwner} onClose={()=>setManageStages(false)}/>} 
  {person&&isOwner&&<PersonEditor person={person} onClose={()=>setPerson(null)}/>} 
  {composer&&canEdit&&<Composer def={ENTITIES[composer.key]} seed={composer.seed} hiddenFields={isOwner?[]:["project_id","tags"]}
   onClose={()=>setComposer(null)} onSubmit={submitEntity}/>} 
  {drawer&&drawerRow&&<Drawer def={ENTITIES[drawer.entity]} row={drawerRow} canEdit={canEdit} canDelete={isOwner}
   hiddenFields={isOwner?[]:["project_id","tags"]} onClose={ui.closeDrawer}/>} 
 </div>;
}

function ProjectOverview({project,canEdit,isOwner}:{project:Project;canEdit:boolean;isOwner:boolean}){
 const {projects,projectLinks,projectFields,tables,tags}=useData();
 const links=projectLinks.rows.filter(l=>l.project_id===project.id).sort((a,b)=>a.position-b.position);
 const fields=projectFields.rows.filter(f=>f.project_id===project.id).sort((a,b)=>a.position-b.position);
 const documents=tables.documents.rows.filter(r=>r.project_id===project.id);
 const selectedTags=tags.idsFor("project",project.id);
 const [linkLabel,setLinkLabel]=useState(""),[linkUrl,setLinkUrl]=useState("");
 const [fieldLabel,setFieldLabel]=useState(""),[fieldValue,setFieldValue]=useState("");
 const save=(patch:Record<string,unknown>)=>{if(canEdit)void projects.update(project.id,patch)};
 const addLink=async()=>{
  const label=linkLabel.trim(),url=linkUrl.trim();if(!label||!safeHttp(url))return;
  await projectLinks.insert({user_id:project.user_id,project_id:project.id,label,url,position:(links.at(-1)?.position??-1)+1});
  setLinkLabel("");setLinkUrl("");
 };
 const addField=async()=>{
  const label=fieldLabel.trim();if(!label)return;
  await projectFields.insert({user_id:project.user_id,project_id:project.id,label,value:fieldValue.trim()||null,
   field_type:"text",position:(fields.at(-1)?.position??-1)+1});
  setFieldLabel("");setFieldValue("");
 };

 return <div className="project-overview-grid">
  <section className="panel project-summary-panel">
   <header className="panel-head"><h2>Overview</h2><span className="muted-note">Autosaved</span></header>
   <div className="field"><label className="field-label" htmlFor="project-objective">Objective</label>
    <textarea id="project-objective" className="input" rows={3} defaultValue={project.objective??""}
     placeholder="What result should this project produce?" disabled={!canEdit}
     onBlur={e=>{if(e.target.value!==project.objective)save({objective:e.target.value.trim()||null})}}/></div>
   <div className="field"><label className="field-label" htmlFor="project-description">Description</label>
    <textarea id="project-description" className="input" rows={3} defaultValue={project.description??""}
     placeholder="Scientific context, scope and decisions" disabled={!canEdit}
     onBlur={e=>{if(e.target.value!==project.description)save({description:e.target.value.trim()||null})}}/></div>
   <div className="project-detail-grid">
    <div className="field"><label className="field-label" htmlFor="project-phase">Project phase</label>
     <input id="project-phase" className="input" list="project-phase-options" defaultValue={project.phase??""}
      disabled={!canEdit}
      onBlur={e=>{const phase=e.target.value.trim()||"Planning";if(phase!==project.phase)save({phase})}}/>
     <datalist id="project-phase-options"><option value="Planning"/><option value="Active"/><option value="Paused"/><option value="Analysis"/><option value="Writing"/><option value="Completed"/></datalist>
    </div>
    <div className="field"><label className="field-label" htmlFor="project-start">Start date</label>
     <input id="project-start" className="input" type="date" value={project.start_date??""} disabled={!canEdit} onChange={e=>save({start_date:e.target.value||null})}/></div>
    <div className="field"><label className="field-label" htmlFor="project-target">Target date</label>
     <input id="project-target" className="input" type="date" value={project.target_date??""} disabled={!canEdit} onChange={e=>save({target_date:e.target.value||null})}/></div>
   </div>
   <div className="field field-wide"><span className="field-label">Project tags</span>
    {isOwner?<TagEditor tags={tags.tags} selected={selectedTags} label="Project tags"
      onToggle={id=>void tags.setFor("project",project.id,selectedTags.includes(id)?selectedTags.filter(x=>x!==id):[...selectedTags,id])}
      onCreate={async name=>{const tag=await tags.create(name);if(tag)void tags.setFor("project",project.id,[...selectedTags,tag.id])}}/>
     :<><TagChips ids={selectedTags} byId={tags.byId}/><span className="muted-note">Project tags are managed by the owner.</span></>}
   </div>
  </section>

  <div className="project-overview-side">
   <section className="panel">
    <header className="panel-head"><h2>Project links</h2><Link2/></header>
    <div className="resource-list">
     {links.map(link=><div className="resource-row" key={link.id}>
      <a href={safeHttp(link.url)??undefined} target="_blank" rel="noopener noreferrer"><ExternalLink/><span>{link.label}</span></a>
      {isOwner&&<button className="icon-button" onClick={()=>void projectLinks.remove(link.id)} aria-label={`Delete ${link.label}`}><Trash2/></button>}
     </div>)}
     {!links.length&&<p className="muted-note">Add Drive folders, repositories, protocols or datasets.</p>}
    </div>
    {canEdit&&<div className="compact-add-grid">
     <input className="input input-compact" value={linkLabel} placeholder="Label" aria-label="Link label" onChange={e=>setLinkLabel(e.target.value)}/>
     <input className="input input-compact" type="url" value={linkUrl} placeholder="https://…" aria-label="Link URL" onChange={e=>setLinkUrl(e.target.value)}/>
     <button className="secondary" disabled={!linkLabel.trim()||!safeHttp(linkUrl.trim())} onClick={()=>void addLink()}><Plus/>Add</button>
    </div>}
   </section>

   <section className="panel">
    <header className="panel-head"><h2>Custom details</h2><Pencil/></header>
    <div className="resource-list">
     {fields.map(field=><div className="custom-field-row" key={field.id}>
      <input className="input input-compact" defaultValue={field.label} aria-label="Custom field name"
       disabled={!canEdit}
       onBlur={e=>{const label=e.target.value.trim();if(label&&label!==field.label)void projectFields.update(field.id,{label})}}/>
      <input className="input input-compact" defaultValue={field.value??""} aria-label={`${field.label} value`}
       disabled={!canEdit}
       onBlur={e=>{const value=e.target.value.trim()||null;if(value!==field.value)void projectFields.update(field.id,{value})}}/>
      {isOwner&&<button className="icon-button" onClick={()=>void projectFields.remove(field.id)} aria-label={`Delete ${field.label}`}><Trash2/></button>}
     </div>)}
    </div>
    {canEdit&&<div className="compact-add-grid">
     <input className="input input-compact" value={fieldLabel} placeholder="Field name" aria-label="New custom field name" onChange={e=>setFieldLabel(e.target.value)}/>
     <input className="input input-compact" value={fieldValue} placeholder="Value" aria-label="New custom field value" onChange={e=>setFieldValue(e.target.value)}/>
     <button className="secondary" disabled={!fieldLabel.trim()} onClick={()=>void addField()}><Plus/>Add</button>
    </div>}
   </section>

   <section className="panel">
    <header className="panel-head"><h2>Documents</h2><FileText/></header>
    {documents.slice(0,5).map(doc=><button className="resource-button" key={doc.id}><span>{doc.title}</span><small>{doc.kind}</small></button>)}
    {!documents.length&&<p className="muted-note">No project documents yet.</p>}
   </section>
  </div>
 </div>;
}

function ProjectBoard({project,stages,tasks,canEdit,onAdd,onOpen,onManage}:{
 project:Project;stages:ProjectStage[];tasks:Row[];canEdit:boolean;onAdd(stageId:string|null):void;onOpen(id:string):void;onManage():void;
}){
 const {tables,people}=useData();
 const peopleById=new Map(people.rows.map(p=>[p.id,p]));
 const publicationsById=new Map(tables.publications.rows.map(p=>[p.id,p]));
 const stageIds=new Set(stages.map(s=>s.id));
 const unassigned=tasks.filter(t=>!t.stage_id||!stageIds.has(t.stage_id));
 const columns=[...stages,...(unassigned.length?[{id:"",name:"Unsorted",color:"slate",position:999,category:"Backlog"} as ProjectStage]:[])];
 const move=(id:string,stageId:string)=>void tables.tasks.update(id,{stage_id:stageId||null});

 return <section className="project-workspace">
  <div className="project-section-head"><div><h2>Custom workflow</h2><p className="subtitle">Each column belongs only to {project.name}.</p></div>
   {canEdit&&<button className="secondary" onClick={onManage}><FolderKanban/>Add or reorder stages</button>}</div>
  <div className="project-board">
   {columns.map(stage=>{
    const rows=tasks.filter(t=>stage.id?t.stage_id===stage.id:!t.stage_id||!stageIds.has(t.stage_id));
    return <section className="project-column" key={stage.id||"unsorted"}
     onDragOver={e=>{if(canEdit&&stage.id&&e.dataTransfer.types.includes(TASK_MIME)){e.preventDefault();e.dataTransfer.dropEffect="move"}}}
     onDrop={e=>{if(!canEdit)return;e.preventDefault();const id=e.dataTransfer.getData(TASK_MIME);if(stage.id&&tasks.some(t=>t.id===id))move(id,stage.id)}}>
     <header className="project-column-head"><span className={"column-name tint-"+(stage.color??"slate")}>{stage.name}</span><b>{rows.length}</b>
      {canEdit&&stage.id&&<button className="icon-button" onClick={()=>onAdd(stage.id)} aria-label={`Add work to ${stage.name}`}><Plus/></button>}</header>
     <div className="project-task-list">
      {rows.map(task=>{
       const assigned=peopleById.get(task.assignee_id??"");
       const paper=publicationsById.get(task.publication_id??"");
       const handle=cleanTelegram(assigned?.telegram_handle??null);
       return <article className="project-task" key={task.id} draggable={canEdit} onDragStart={e=>{if(!canEdit)return;e.dataTransfer.setData(TASK_MIME,task.id);e.dataTransfer.effectAllowed="move"}}
        onClick={e=>{if(!(e.target as HTMLElement).closest("a,button,select,input"))onOpen(task.id)}}>
        <button className="project-task-title" onClick={()=>onOpen(task.id)}>{task.title}</button>
        {paper&&<span className="project-task-paper"><FlaskConical/>{paper.title}</span>}
        {assigned&&<span className="project-task-meta"><UserRound/>{assigned.name}{assigned.role?` · ${assigned.role}`:""}</span>}
        {task.due_at&&<span className="project-task-meta"><CalendarClock/>Due {formatDate(task.due_at,false)}</span>}
        {task.follow_up_at&&<span className="follow-up-meta"><Send/>Follow up {formatDate(task.follow_up_at,true)}</span>}
        <div className="project-task-actions">
         <select className="input input-compact" value={task.stage_id??""} aria-label={`Move ${task.title}`} disabled={!canEdit}
          onChange={e=>move(task.id,e.target.value)}><option value="">Unsorted</option>{stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
         {assigned?.email&&<a className="icon-button" href={`mailto:${assigned.email}`} aria-label={`Email ${assigned.name}`}><Mail/></a>}
         {handle&&<a className="icon-button" href={`https://t.me/${handle}`} target="_blank" rel="noopener noreferrer" aria-label={`Open Telegram for ${assigned?.name}`}><Send/></a>}
        </div>
       </article>;
      })}
      {!rows.length&&<p className="column-empty">Nothing here</p>}
     </div>
    </section>;
   })}
  </div>
 </section>;
}

function ProjectPublications({project,direct,related,canEdit,isOwner,onAdd,onOpen}:{
 project:Project;direct:Row[];related:Row[];canEdit:boolean;isOwner:boolean;onAdd():void;onOpen(id:string):void;
}){
 const {tables,publicationNodes,tags}=useData();
 const card=(paper:Row,relation:"project"|"tag")=>{
  const nodes=publicationNodes.rows.filter(n=>n.publication_id===paper.id);
  const done=nodes.filter(n=>n.status==="Done").length;
  const tagIds=tags.idsFor("publication",paper.id);
  return <article className="project-paper" key={paper.id} onClick={e=>{if(!(e.target as HTMLElement).closest("button,a"))onOpen(paper.id)}}>
   <div className="project-paper-head"><span className="badge tone-blue">{paper.stage}</span>
    {relation==="tag"&&<span className="badge tone-violet">Related by tag</span>}</div>
   <button className="project-paper-title" onClick={()=>onOpen(paper.id)}>{paper.title}</button>
   {paper.venue&&<p className="subtitle">{paper.venue}</p>}
   {tagIds.length>0&&<TagChips ids={tagIds} byId={tags.byId} max={4}/>} 
   <div className="paper-progress"><span>{nodes.length?`${done} of ${nodes.length} custom steps complete`:"No custom steps yet"}</span>
    {relation==="tag"&&isOwner&&<button className="link-button" onClick={()=>void tables.publications.update(paper.id,{project_id:project.id})}>Link directly</button>}</div>
  </article>;
 };
 return <section className="project-workspace">
  <div className="project-section-head"><div><h2>Publications</h2><p className="subtitle">Direct project papers and papers related through shared tags.</p></div>
   {canEdit&&<button className="primary" onClick={onAdd}><Plus/>New publication</button>}</div>
  <div className="project-paper-grid">{direct.map(p=>card(p,"project"))}{related.map(p=>card(p,"tag"))}</div>
  {!direct.length&&!related.length&&<div className="empty-state"><FlaskConical/><p>No publications are linked to this project or its tags.</p>{canEdit&&<button className="primary" onClick={onAdd}>Add publication</button>}</div>}
 </section>;
}

function ProjectReads({project,rows,canEdit,isOwner,onAdd,onOpen}:{project:Project;rows:Row[];canEdit:boolean;isOwner:boolean;onAdd():void;onOpen(id:string):void}){
 const {tables}=useData();
 const [existing,setExisting]=useState("");
 const inbox=tables.reads.rows.filter(r=>!r.project_id);
 return <section className="project-workspace">
  <div className="project-section-head"><div><h2>Project Reads</h2><p className="subtitle">Links saved from the web or Telegram for {project.name}.</p></div>
   {canEdit&&<button className="primary" onClick={onAdd}><Plus/>New Read</button>}</div>
  {isOwner&&inbox.length>0&&<div className="assign-read"><select className="input" value={existing} onChange={e=>setExisting(e.target.value)} aria-label="Choose an Inbox read">
   <option value="">Assign an existing Inbox Read…</option>{inbox.map(r=><option key={r.id} value={r.id}>{r.title||r.url}</option>)}</select>
   <button className="secondary" disabled={!existing} onClick={async()=>{if(await tables.reads.update(existing,{project_id:project.id}))setExisting("")}}>Assign</button></div>}
  <div className="project-read-list">
   {rows.map(read=><article className="project-read" key={read.id} onClick={e=>{if(!(e.target as HTMLElement).closest("a,button"))onOpen(read.id)}}>
    <BookMarked/><button onClick={()=>onOpen(read.id)}>{read.title||read.url}</button>
    <a href={safeHttp(read.url)??undefined} target="_blank" rel="noopener noreferrer" aria-label="Open Read"><ExternalLink/></a>
   </article>)}
  </div>
  {!rows.length&&<div className="empty-state"><BookMarked/><p>No Reads assigned to this project yet.</p></div>}
 </section>;
}

function ProjectPeople({projectId,isOwner,onAdd,onEdit}:{projectId:string;isOwner:boolean;onAdd():void;onEdit(person:Person):void}){
 const {people,tables,publicationNodes}=useData();
 const projectTasks=tables.tasks.rows.filter(r=>r.project_id===projectId);
 const paperIds=new Set(tables.publications.rows.filter(r=>r.project_id===projectId).map(r=>r.id));
 const counts=new Map<string,number>();
 for(const task of projectTasks)if(task.assignee_id)counts.set(task.assignee_id,(counts.get(task.assignee_id)??0)+1);
 for(const node of publicationNodes.rows)if(paperIds.has(node.publication_id)&&node.assignee_id)counts.set(node.assignee_id,(counts.get(node.assignee_id)??0)+1);
 const ordered=[...people.rows].sort((a,b)=>(counts.get(b.id)??0)-(counts.get(a.id)??0)||a.name.localeCompare(b.name));
 return <section className="project-workspace">
  <div className="project-section-head"><div><h2>Private people directory</h2><p className="subtitle">These are labels and contact details only. No invitation is sent and they cannot see the workspace.</p></div>
   {isOwner&&<button className="primary" onClick={onAdd}><Plus/>Add person</button>}</div>
  <div className="people-grid">{ordered.map(person=>{
   const handle=cleanTelegram(person.telegram_handle);
   return <article className="person-card" key={person.id}>
    <div className="person-avatar">{person.name.slice(0,2).toUpperCase()}</div><div className="person-main"><strong>{person.name}</strong>
     <span>{[person.role,person.organization].filter(Boolean).join(" · ")||"Private contact"}</span>
     <small>{counts.get(person.id)??0} assigned item(s) in this project</small></div>
    <div className="person-actions">{isOwner&&<button className="icon-button" onClick={()=>onEdit(person)} aria-label={`Edit ${person.name}`}><Pencil/></button>}
     {person.email&&<a className="icon-button" href={`mailto:${person.email}`} aria-label={`Email ${person.name}`}><Mail/></a>}
     {handle&&<a className="icon-button" href={`https://t.me/${handle}`} target="_blank" rel="noopener noreferrer" aria-label={`Open Telegram for ${person.name}`}><Send/></a>}</div>
   </article>})}</div>
  {!ordered.length&&<div className="empty-state"><Users/><p>{isOwner?"Add someone as a private assignee. They will not receive an account or notification.":"No people are assigned to work in this project yet."}</p></div>}
 </section>;
}

function StageManager({project,stages,tasks,isOwner,onClose}:{project:Project;stages:ProjectStage[];tasks:Row[];isOwner:boolean;onClose():void}){
 const {projectStages}=useData();
 const [name,setName]=useState(""),[category,setCategory]=useState<string>("In progress"),[color,setColor]=useState("slate");
 const add=async()=>{const title=name.trim();if(!title)return;
  const row=await projectStages.insert({user_id:project.user_id,project_id:project.id,name:title,category,color,position:(stages.at(-1)?.position??-1)+1});
  if(row)setName("");
 };
 const move=async(index:number,delta:number)=>{const stage=stages[index],other=stages[index+delta];if(!stage||!other)return;
  const position=stage.position;await projectStages.update(stage.id,{position:other.position});await projectStages.update(other.id,{position});
 };
 return <Modal kicker="Project workflow" title={`Stages for ${project.name}`} size="lg" onClose={onClose}
  footer={<button type="button" className="primary" onClick={onClose}>Done</button>}>
  <p className="stage-help">Names are fully custom. The behaviour keeps the global Tasks page compatible when a card moves.</p>
  <div className="stage-list">{stages.map((stage,index)=>{
   const used=tasks.filter(t=>t.stage_id===stage.id).length;
   return <div className="stage-row" key={stage.id}>
    <span className={"project-dot tint-"+(stage.color??"slate")}/>
    <input className="input input-compact" defaultValue={stage.name} aria-label="Stage name"
     onBlur={e=>{const value=e.target.value.trim();if(value&&value!==stage.name)void projectStages.update(stage.id,{name:value})}}/>
    <select className="input input-compact" value={stage.category} aria-label={`${stage.name} behaviour`}
     onChange={e=>void projectStages.update(stage.id,{category:e.target.value})}>{TASK_STATUS.map(s=><option key={s}>{s}</option>)}</select>
    <select className="input input-compact" value={stage.color??"slate"} aria-label={`${stage.name} colour`}
     onChange={e=>void projectStages.update(stage.id,{color:e.target.value})}>{TAG_COLORS.map(c=><option key={c}>{c}</option>)}</select>
    <span className="muted-note">{used} card{used===1?"":"s"}</span>
    <button className="icon-button" disabled={index===0} onClick={()=>void move(index,-1)} aria-label={`Move ${stage.name} left`}><ArrowLeft/></button>
    <button className="icon-button" disabled={index===stages.length-1} onClick={()=>void move(index,1)} aria-label={`Move ${stage.name} right`}><ArrowRight/></button>
    {isOwner&&<button className="icon-button" disabled={used>0} title={used?"Move its cards before deleting":"Delete stage"}
     onClick={()=>{if(window.confirm(`Delete stage “${stage.name}”?`))void projectStages.remove(stage.id)}} aria-label={`Delete ${stage.name}`}><Trash2/></button>}
   </div>})}</div>
  <div className="stage-add">
   <input className="input" value={name} placeholder="New stage, e.g. Wet lab" aria-label="New stage name" onChange={e=>setName(e.target.value)}
    onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void add()}}}/>
   <select className="input" value={category} aria-label="New stage behaviour" onChange={e=>setCategory(e.target.value)}>{TASK_STATUS.map(s=><option key={s}>{s}</option>)}</select>
   <select className="input" value={color} aria-label="New stage colour" onChange={e=>setColor(e.target.value)}>{TAG_COLORS.map(c=><option key={c}>{c}</option>)}</select>
   <button type="button" className="secondary" disabled={!name.trim()} onClick={()=>void add()}><Plus/>Add stage</button>
  </div>
 </Modal>;
}

function PersonEditor({person,onClose}:{person:Person|"new";onClose():void}){
 const {userId,people}=useData();
 const current=person==="new"?null:person;
 const [values,setValues]=useState({name:current?.name??"",role:current?.role??"",organization:current?.organization??"",
  email:current?.email??"",telegram_handle:current?.telegram_handle??"",notes:current?.notes??""});
 const set=(key:keyof typeof values,value:string)=>setValues(v=>({...v,[key]:value}));
 const save=async()=>{
  const name=values.name.trim();if(!name)return;
  const payload={name,role:values.role.trim()||null,organization:values.organization.trim()||null,email:values.email.trim()||null,
   telegram_handle:cleanTelegram(values.telegram_handle),notes:values.notes.trim()||null};
  if(current)await people.update(current.id,payload);else await people.insert({user_id:userId,...payload});
  onClose();
 };
 return <Modal kicker="Private contact" title={current?`Edit ${current.name}`:"Add person"} onClose={onClose}
  footer={<><button type="button" className="secondary" onClick={onClose}>Cancel</button>
   {current&&<button type="button" className="danger-button" onClick={async()=>{if(window.confirm(`Delete ${current.name}? Assignments will become unassigned.`)){await people.remove(current.id);onClose()}}}><Trash2/>Delete</button>}
   <button type="button" className="primary" disabled={!values.name.trim()} onClick={()=>void save()}>Save</button></>}>
  <div className="private-note"><Users/><span>This person is a private label in your workspace. No invitation or message will be sent.</span></div>
  <div className="field-grid">
   <div className="field field-wide"><label className="field-label" htmlFor="person-name">Name</label><input id="person-name" className="input" autoFocus value={values.name} onChange={e=>set("name",e.target.value)}/></div>
   <div className="field"><label className="field-label" htmlFor="person-role">Role</label><input id="person-role" className="input" value={values.role} placeholder="PI, collaborator…" onChange={e=>set("role",e.target.value)}/></div>
   <div className="field"><label className="field-label" htmlFor="person-org">Organisation</label><input id="person-org" className="input" value={values.organization} onChange={e=>set("organization",e.target.value)}/></div>
   <div className="field"><label className="field-label" htmlFor="person-email">Email</label><input id="person-email" className="input" type="email" value={values.email} onChange={e=>set("email",e.target.value)}/></div>
   <div className="field"><label className="field-label" htmlFor="person-telegram">Telegram handle</label><input id="person-telegram" className="input" value={values.telegram_handle} placeholder="username" onChange={e=>set("telegram_handle",e.target.value)}/></div>
   <div className="field field-wide"><label className="field-label" htmlFor="person-notes">Notes</label><textarea id="person-notes" className="input" rows={3} value={values.notes} onChange={e=>set("notes",e.target.value)}/></div>
  </div>
 </Modal>;
}
