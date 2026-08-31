import { useEffect, useMemo, useState } from "react";
import { CircleUserRound, Menu, Search } from "lucide-react";
import type { DocumentItem, DocumentKind, Job, JobStage, Project, ProjectStatus, Publication, PublicationStage, Read, Reminder, Status, Task, View } from "../types";
import { supabase } from "../lib/supabase";
import { useSupabaseTable } from "../lib/useSupabaseTable";
import { useItemTags } from "../lib/tags";
import { Sidebar } from "./Sidebar";
import { HomeView } from "./HomeView";
import { Kanban } from "./Kanban";
import { PublicationsBoard } from "./PublicationsBoard";
import { JobsBoard } from "./JobsBoard";
import { DocumentsView } from "./DocumentsView";
import { RemindersView } from "./RemindersView";
import { ReadsView } from "./ReadsView";
import { TelegramSettingsView } from "./TelegramSettingsView";
import { ProjectComposer } from "./ProjectComposer";
import { ProjectManager } from "./ProjectManager";
import { TagManager } from "./TagManager";

type TaskRow={id:string;title:string;status:Status;priority:"Low"|"Medium"|"High";due_at:string|null;project_id:string|null};
type ProjectRow={id:string;name:string;status:ProjectStatus;created_at:string};
type PublicationRow={id:string;title:string;venue:string|null;stage:PublicationStage;next_action:string|null;due_at:string|null;project_id:string|null;url:string|null};
type DocumentRow={id:string;title:string;kind:DocumentKind;project_id:string|null;drive_url:string|null;updated_at:string};
type JobRow={id:string;organization:string;role:string;stage:JobStage;deadline:string|null;next_action:string|null;url:string|null;project_id:string|null};
type ReminderRow={id:string;title:string;body:string|null;remind_at:string|null;done:boolean;created_at:string};
type ReadRow={id:string;url:string;title:string|null;notes:string|null;created_at:string};
type TagRow={id:string;name:string;color:string|null};

const toTask=(r:TaskRow):Task=>({id:r.id,title:r.title,status:r.status,projectId:r.project_id,due:r.due_at?new Date(r.due_at).toLocaleDateString():undefined,priority:r.priority});
const toProject=(r:ProjectRow):Project=>({id:r.id,name:r.name,status:r.status,createdAt:r.created_at});
const toPublication=(r:PublicationRow):Publication=>({id:r.id,title:r.title,venue:r.venue??undefined,stage:r.stage,nextAction:r.next_action??undefined,due:r.due_at?new Date(r.due_at).toLocaleDateString():undefined,projectId:r.project_id,url:r.url??undefined});
const toDocument=(r:DocumentRow):DocumentItem=>({id:r.id,title:r.title,kind:r.kind,projectId:r.project_id,driveUrl:r.drive_url??undefined,updated:new Date(r.updated_at).toLocaleDateString()});
const toJob=(r:JobRow,tagIds:string[]):Job=>({id:r.id,organization:r.organization,role:r.role,stage:r.stage,deadline:r.deadline?new Date(r.deadline).toLocaleDateString():undefined,nextAction:r.next_action??undefined,url:r.url??undefined,projectId:r.project_id,tagIds});
const toReminder=(r:ReminderRow,tagIds:string[]):Reminder=>({id:r.id,title:r.title,body:r.body??undefined,remindAt:r.remind_at??undefined,done:r.done,tagIds});
const toRead=(r:ReadRow,tagIds:string[]):Read=>({id:r.id,url:r.url,title:r.title??undefined,notes:r.notes??undefined,createdAt:r.created_at,tagIds});

const labels:Record<View,string>={home:"Command center",kanban:"Kanban board",publications:"Publications",documents:"Documents",jobs:"Job tracker",reminders:"Reminders",reads:"Reads",telegram:"Telegram"};

export function Workspace({userId}:{userId:string}){
 const [view,setView]=useState<View>("home");
 const [activeProjectId,setActiveProjectId]=useState<string|null>(null);
 const [query,setQuery]=useState("");
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [projectComposer,setProjectComposer]=useState(false);
 const [projectManager,setProjectManager]=useState(false);
 const [tagManager,setTagManager]=useState(false);
 const [chatId,setChatId]=useState<number|null>(null);

 const tasksTable=useSupabaseTable<TaskRow>("tasks","id,title,status,priority,due_at,project_id","created_at");
 const projectsTable=useSupabaseTable<ProjectRow>("projects","id,name,status,created_at","created_at");
 const publicationsTable=useSupabaseTable<PublicationRow>("publications","id,title,venue,stage,next_action,due_at,project_id,url","created_at");
 const documentsTable=useSupabaseTable<DocumentRow>("documents","id,title,kind,project_id,drive_url,updated_at","updated_at");
 const jobsTable=useSupabaseTable<JobRow>("job_applications","id,organization,role,stage,deadline,next_action,url,project_id","created_at");
 const remindersTable=useSupabaseTable<ReminderRow>("reminders","id,title,body,remind_at,done,created_at","created_at");
 const readsTable=useSupabaseTable<ReadRow>("reads","id,url,title,notes,created_at","created_at");
 const tagsTable=useSupabaseTable<TagRow>("tags","id,name,color","name",true);
 const itemTags=useItemTags();

 useEffect(()=>{if(!supabase)return;void (async()=>{
  await supabase.from("profiles").upsert({id:userId},{onConflict:"id"});
  const {data}=await supabase.from("profiles").select("telegram_chat_id").eq("id",userId).maybeSingle();
  setChatId((data?.telegram_chat_id as number|null)??null);
 })()},[userId]);
 const refreshTelegramStatus=async()=>{if(!supabase)return;const {data}=await supabase.from("profiles").select("telegram_chat_id").eq("id",userId).maybeSingle();setChatId((data?.telegram_chat_id as number|null)??null)};

 const projects=useMemo(()=>projectsTable.rows.map(toProject),[projectsTable.rows]);
 const tasks=useMemo(()=>tasksTable.rows.map(toTask),[tasksTable.rows]);
 const publications=useMemo(()=>publicationsTable.rows.map(toPublication),[publicationsTable.rows]);
 const documents=useMemo(()=>documentsTable.rows.map(toDocument),[documentsTable.rows]);
 const jobs=useMemo(()=>jobsTable.rows.map(r=>toJob(r,itemTags.tagIdsFor("job_application",r.id))),[jobsTable.rows,itemTags]);
 const reminders=useMemo(()=>remindersTable.rows.map(r=>toReminder(r,itemTags.tagIdsFor("reminder",r.id))),[remindersTable.rows,itemTags]);
 const reads=useMemo(()=>readsTable.rows.map(r=>toRead(r,itemTags.tagIdsFor("read",r.id))),[readsTable.rows,itemTags]);
 const tags=tagsTable.rows;

 const loading=tasksTable.loading||projectsTable.loading||publicationsTable.loading||documentsTable.loading||jobsTable.loading||remindersTable.loading||readsTable.loading||tagsTable.loading;
 const notice=[tasksTable.notice,projectsTable.notice,publicationsTable.notice,documentsTable.notice,jobsTable.notice,remindersTable.notice,readsTable.notice,tagsTable.notice].find(Boolean)||"";

 const nav=(v:View)=>{setView(v);setSidebarOpen(false)};
 const openBoard=(projectId:string|null)=>{setActiveProjectId(projectId);setView("kanban");setSidebarOpen(false)};

 const moveTask=(id:string,status:Status)=>void tasksTable.updateRow(id,{status});
 const removeTask=(id:string)=>{if(!window.confirm("Delete this task?"))return;void tasksTable.deleteRow(id)};
 const addTask=(title:string)=>void tasksTable.insertRow({user_id:userId,title,status:"Backlog",priority:"Medium",project_id:activeProjectId,source:"dashboard"});

 const movePublication=(id:string,stage:PublicationStage)=>void publicationsTable.updateRow(id,{stage});
 const removePublication=(id:string)=>{if(!window.confirm("Delete this publication?"))return;void publicationsTable.deleteRow(id)};
 const addPublication=(title:string,venue:string,projectId:string|null)=>void publicationsTable.insertRow({user_id:userId,title,venue:venue||null,project_id:projectId});

 const removeDocument=(id:string)=>{if(!window.confirm("Delete this document?"))return;void documentsTable.deleteRow(id)};
 const addDocument=(title:string,kind:DocumentKind,projectId:string|null,driveUrl:string)=>void documentsTable.insertRow({user_id:userId,title,kind,project_id:projectId,drive_url:driveUrl||null});

 const moveJob=(id:string,stage:JobStage)=>void jobsTable.updateRow(id,{stage});
 const removeJob=(id:string)=>{if(!window.confirm("Delete this application?"))return;void jobsTable.deleteRow(id)};
 const addJob=async(organization:string,role:string,projectId:string|null,tagIds:string[])=>{const row=await jobsTable.insertRow({user_id:userId,organization,role,project_id:projectId});if(row&&tagIds.length)await itemTags.setTagsFor("job_application",row.id,tagIds)};

 const toggleReminderDone=(id:string,done:boolean)=>void remindersTable.updateRow(id,{done});
 const removeReminder=(id:string)=>{if(!window.confirm("Delete this reminder?"))return;void remindersTable.deleteRow(id)};
 const addReminder=async(title:string,body:string,remindAt:string|null,tagIds:string[])=>{const row=await remindersTable.insertRow({user_id:userId,title,body:body||null,remind_at:remindAt});if(row&&tagIds.length)await itemTags.setTagsFor("reminder",row.id,tagIds)};

 const removeRead=(id:string)=>{if(!window.confirm("Delete this read?"))return;void readsTable.deleteRow(id)};
 const addRead=async(url:string,title:string,notes:string,tagIds:string[])=>{const row=await readsTable.insertRow({user_id:userId,url,title:title||null,notes:notes||null});if(row&&tagIds.length)await itemTags.setTagsFor("read",row.id,tagIds)};

 const createTag=async(name:string)=>{const row=await tagsTable.insertRow({user_id:userId,name});return row?.id??null};
 const renameTag=(id:string,name:string)=>void tagsTable.updateRow(id,{name});
 const deleteTag=(id:string)=>void tagsTable.deleteRow(id);
 const tagUsageCounts=useMemo(()=>{const m=new Map<string,number>();[...jobs,...reminders,...reads].forEach(item=>item.tagIds.forEach(id=>m.set(id,(m.get(id)??0)+1)));return m},[jobs,reminders,reads]);

 const addProject=async(name:string)=>{const row=await projectsTable.insertRow({user_id:userId,name,status:"Active"});if(row)openBoard(row.id)};
 const renameProject=(id:string,name:string)=>void projectsTable.updateRow(id,{name});
 const setProjectStatus=(id:string,status:ProjectStatus)=>void projectsTable.updateRow(id,{status});
 const deleteProject=(id:string)=>{void projectsTable.deleteRow(id);if(activeProjectId===id)setActiveProjectId(null)};

 const filteredTasks=useMemo(()=>query?tasks.filter(t=>t.title.toLowerCase().includes(query.toLowerCase())):tasks,[tasks,query]);

 return <div className="shell">
  <Sidebar view={view} activeProjectId={activeProjectId} projects={projects}
   counts={{publications:publications.length,documents:documents.length,jobs:jobs.length,reminders:reminders.length,reads:reads.length}}
   chatId={chatId} sidebarOpen={sidebarOpen}
   open={nav} openBoard={openBoard} onNewProject={()=>setProjectComposer(true)} onManageProjects={()=>setProjectManager(true)}/>
  <main>
   <header>
    <button className="mobile-menu" onClick={()=>setSidebarOpen(v=>!v)}><Menu/></button>
    <div className="crumb">Workspace / <strong>{labels[view]}</strong></div>
    <div className="header-actions">
     <label className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search workspace"/></label>
     <button className="profile" onClick={()=>void supabase?.auth.signOut()} title="Sign out"><CircleUserRound/></button>
    </div>
   </header>
   <div className="page">
    {notice&&<p className="data-notice" role="alert">{notice}</p>}
    {loading&&<p className="data-loading">Loading your private workspace…</p>}
    {!loading&&view==="home"&&<HomeView tasks={tasks} publications={publications} jobs={jobs} open={nav}/>}
    {!loading&&view==="kanban"&&<Kanban projectId={activeProjectId} projects={projects} tasks={filteredTasks} move={moveTask} remove={removeTask} add={addTask}/>}
    {!loading&&view==="publications"&&<PublicationsBoard publications={publications} projects={projects} move={movePublication} remove={removePublication} add={addPublication}/>}
    {!loading&&view==="documents"&&<DocumentsView documents={documents} projects={projects} remove={removeDocument} add={addDocument}/>}
    {!loading&&view==="jobs"&&<JobsBoard jobs={jobs} projects={projects} tags={tags} move={moveJob} remove={removeJob} add={addJob} onCreateTag={createTag} onManageTags={()=>setTagManager(true)}/>}
    {!loading&&view==="reminders"&&<RemindersView reminders={reminders} tags={tags} toggleDone={toggleReminderDone} remove={removeReminder} add={addReminder} onCreateTag={createTag} onManageTags={()=>setTagManager(true)}/>}
    {!loading&&view==="reads"&&<ReadsView reads={reads} tags={tags} remove={removeRead} add={addRead} onCreateTag={createTag} onManageTags={()=>setTagManager(true)}/>}
    {!loading&&view==="telegram"&&<TelegramSettingsView userId={userId} chatId={chatId} onRefresh={refreshTelegramStatus}/>}
   </div>
  </main>
  {projectComposer&&<ProjectComposer onClose={()=>setProjectComposer(false)} onAdd={name=>{void addProject(name);setProjectComposer(false)}}/>}
  {projectManager&&<ProjectManager projects={projects} onRename={renameProject} onSetStatus={setProjectStatus} onDelete={deleteProject} onClose={()=>setProjectManager(false)}/>}
  {tagManager&&<TagManager tags={tags} usageCounts={tagUsageCounts} onRename={renameTag} onDelete={deleteTag} onClose={()=>setTagManager(false)}/>}
 </div>
}
