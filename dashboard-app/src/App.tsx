import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, ChevronDown, CircleUserRound, FileText, FlaskConical, Home, LayoutDashboard, Menu, Plus, Search, Send, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { DocumentItem, Job, Publication, Status, Task, View } from "./types";
import { supabase } from "./lib/supabase";

const tasksSeed:Task[]=[
{id:"t1",title:"Review sample analysis",status:"In progress",project:"Sample project",due:"Today",priority:"High"},
{id:"t2",title:"Prepare methods notes",status:"Backlog",project:"Sample project",due:"Tomorrow",priority:"Medium"},
{id:"t3",title:"Send draft for review",status:"Review",project:"Sample writing",due:"Next week",priority:"High"},
{id:"t4",title:"Archive completed files",status:"Done",project:"Sample archive",priority:"Low"}];
const publicationSeed:Publication[]=[
{id:"p1",title:"Sample manuscript",journal:"Venue not selected",stage:"Drafting",nextAction:"Complete results section",due:"Next month"},
{id:"p2",title:"Sample conference abstract",journal:"Example conference",stage:"Submitted",nextAction:"Track decision"},
{id:"p3",title:"New research idea",journal:"Not selected",stage:"Idea",nextAction:"Outline central hypothesis"}];
const documentSeed:DocumentItem[]=[
{id:"d1",title:"Sample manuscript — master draft",kind:"Manuscript",project:"Sample project",updated:"Today"},
{id:"d2",title:"Sample analysis protocol",kind:"Protocol",project:"Sample project",updated:"Yesterday"},
{id:"d3",title:"Sample source data",kind:"Dataset",project:"Sample project",updated:"Last week"}];
const jobSeed:Job[]=[
{id:"j1",organization:"Sample institution",role:"Sample research position",stage:"Preparing",deadline:"Next month",nextAction:"Tailor research statement"},
{id:"j2",organization:"Example university",role:"Sample fellowship",stage:"Saved",nextAction:"Review requirements"},
{id:"j3",organization:"Example institute",role:"Sample scientist role",stage:"Applied",nextAction:"Prepare interview notes"}];
const columns:Status[]=["Backlog","In progress","Review","Done"];
const labels:Record<View,string>={home:"Command center",kanban:"Kanban board",publications:"Publications",documents:"Documents",jobs:"Job tracker"};

function Workspace(){
 const [view,setView]=useState<View>("home"),[tasks,setTasks]=useState(tasksSeed),[query,setQuery]=useState(""),[sidebar,setSidebar]=useState(false),[composer,setComposer]=useState(false),[newTask,setNewTask]=useState("");
 const filtered=useMemo(()=>tasks.filter(t=>(t.title+" "+t.project).toLowerCase().includes(query.toLowerCase())),[tasks,query]);
 const nav=(v:View)=>{setView(v);setSidebar(false)},move=(id:string,status:Status)=>setTasks(v=>v.map(t=>t.id===id?{...t,status}:t));
 const add=()=>{if(!newTask.trim())return;setTasks(v=>[{id:crypto.randomUUID(),title:newTask.trim(),status:"Backlog",project:"Inbox",priority:"Medium"},...v]);setNewTask("");setComposer(false)};
 return <div className="shell">
  <aside className={"sidebar "+(sidebar?"open":"")}><div className="identity"><span className="avatar">AV</span><div><strong>Arun’s workspace</strong><small>Personal research OS</small></div><ChevronDown size={15}/></div><nav>
   <button className={view==="home"?"active":""} onClick={()=>nav("home")}><Home/>Home</button><button className={view==="kanban"?"active":""} onClick={()=>nav("kanban")}><LayoutDashboard/>Kanban</button><p>Knowledge</p>
   <button className={view==="publications"?"active":""} onClick={()=>nav("publications")}><FlaskConical/>Publications <span>{publicationSeed.length}</span></button>
   <button className={view==="documents"?"active":""} onClick={()=>nav("documents")}><FileText/>Documents <span>{documentSeed.length}</span></button><p>Career</p>
   <button className={view==="jobs"?"active":""} onClick={()=>nav("jobs")}><BriefcaseBusiness/>Job tracker <span>{jobSeed.length}</span></button>
  </nav><div className="telegram"><Send size={18}/><div><strong>Telegram inbox</strong><small>Connect after Supabase setup</small></div></div></aside>
  <main><header><button className="mobile-menu" onClick={()=>setSidebar(!sidebar)}><Menu/></button><div className="crumb">Workspace / <strong>{labels[view]}</strong></div><div className="header-actions"><label className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search workspace"/></label><button className="profile" onClick={()=>void supabase?.auth.signOut()} title="Sign out"><CircleUserRound/></button></div></header>
   <div className="page"><div className="title-row"><div><p className="kicker">{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p><h1>{labels[view]}</h1><p className="subtitle">Tasks, research writing and career tracking in one private system.</p></div><button className="primary" onClick={()=>setComposer(true)}><Plus/>New task</button></div>
   {view==="home"&&<HomeView tasks={filtered} open={nav}/>}
   {view==="kanban"&&<Kanban tasks={filtered} move={move}/>}
   {view==="publications"&&<DataTable headers={["Publication","Venue","Stage","Next action","Due"]} rows={publicationSeed.map(x=>[x.title,x.journal,<Badge text={x.stage}/>,x.nextAction,x.due||"—"])}/>}
   {view==="documents"&&<DataTable headers={["Document","Type","Project","Updated","Drive"]} rows={documentSeed.map(x=>[x.title,<Badge text={x.kind}/>,x.project,x.updated,"Not linked"])}/>}
   {view==="jobs"&&<DataTable headers={["Organization","Role","Stage","Deadline","Next action"]} rows={jobSeed.map(x=>[x.organization,x.role,<Badge text={x.stage}/>,x.deadline||"—",x.nextAction])}/>}
  </div></main>
  {composer&&<div className="modal-backdrop" onMouseDown={()=>setComposer(false)}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setComposer(false)}><X/></button><p className="kicker">Quick capture</p><h2>Add to task inbox</h2><input autoFocus value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="What needs doing?"/><div className="modal-actions"><button className="secondary" onClick={()=>setComposer(false)}>Cancel</button><button className="primary" onClick={add}>Add task</button></div></section></div>}
 </div>
}
function HomeView({tasks,open}:{tasks:Task[];open:(v:View)=>void}){const active=tasks.filter(t=>t.status!=="Done");return <><section className="stats"><button onClick={()=>open("kanban")}><span>Open tasks</span><strong>{active.length}</strong><small>Across the workspace</small></button><button onClick={()=>open("publications")}><span>Active publications</span><strong>{publicationSeed.filter(p=>p.stage!=="Published").length}</strong><small>Sample data</small></button><button onClick={()=>open("jobs")}><span>Job applications</span><strong>{jobSeed.length}</strong><small>Sample data</small></button></section><section className="home-grid"><article className="card"><div className="card-head"><div><p className="kicker">Focus queue</p><h2>What needs attention</h2></div><button onClick={()=>open("kanban")}>View board →</button></div><div className="focus-list">{active.map(t=><div key={t.id}><span className={"priority "+t.priority.toLowerCase()}/><div><strong>{t.title}</strong><small>{t.project} · {t.due||"No date"}</small></div><Badge text={t.status}/></div>)}</div></article><aside className="card brief"><p className="kicker">Telegram capture</p><h2>Turn messages into records</h2><ol><li>Add tasks and deadlines.</li><li>Update publication stages.</li><li>Save job opportunities.</li></ol><div className="bot-command"><Send/><code>/add Review draft Friday</code></div></aside></section></>}
function Kanban({tasks,move}:{tasks:Task[];move:(id:string,s:Status)=>void}){return <div className="board">{columns.map(s=><section className="column" key={s} onDragOver={e=>e.preventDefault()} onDrop={e=>move(e.dataTransfer.getData("task"),s)}><div className="column-head"><span>{s}</span><b>{tasks.filter(t=>t.status===s).length}</b></div>{tasks.filter(t=>t.status===s).map(t=><article draggable onDragStart={e=>e.dataTransfer.setData("task",t.id)} className="task-card" key={t.id}><span className={"priority "+t.priority.toLowerCase()}/><h3>{t.title}</h3><p>{t.project}</p><footer><small>{t.due||"No date"}</small><Badge text={t.priority}/></footer></article>)}</section>)}</div>}
function DataTable({headers,rows}:{headers:string[];rows:React.ReactNode[][]}){return <div className="table-card"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
function Badge({text}:{text:string}){return <span className={"badge "+text.toLowerCase().replaceAll(" ","-")}>{text}</span>}
function AuthGate(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{if(!supabase){setReady(true);return}void supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[]);
 const signIn=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase)return;setMessage("Signing in…");const {error}=await supabase.auth.signInWithPassword({email,password});setMessage(error?error.message:"")};
 if(!ready)return <div className="auth-screen"><div className="auth-card"><span className="auth-mark">AV</span><h1>Checking access…</h1></div></div>;
 if(!supabase)return <div className="auth-screen"><div className="auth-card"><span className="auth-mark">AV</span><p className="kicker">Private workspace</p><h1>Workspace locked</h1><p>Supabase authentication has not been configured. No dashboard content is available.</p><a href="../">Return to the public website</a></div></div>;
 if(!session)return <div className="auth-screen"><form className="auth-card" onSubmit={signIn}><span className="auth-mark">AV</span><p className="kicker">Private workspace</p><h1>Sign in</h1><p>Only authorized accounts can open this workspace.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" type="submit">Sign in securely</button><small className="auth-message" role="status">{message}</small></form></div>;
 return <Workspace/>;
}
export default function App(){return <AuthGate/>}
