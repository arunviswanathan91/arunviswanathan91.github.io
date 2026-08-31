import { BookMarked, Bell, BriefcaseBusiness, ChevronDown, FileText, FlaskConical, Home, LayoutDashboard, Pencil, Plus, Send } from "lucide-react";
import type { Project, View } from "../types";

export function Sidebar({view,activeProjectId,projects,counts,chatId,sidebarOpen,open,openBoard,onNewProject,onManageProjects}:{
 view:View;
 activeProjectId:string|null;
 projects:Project[];
 counts:{publications:number;documents:number;jobs:number;reminders:number;reads:number};
 chatId:number|null;
 sidebarOpen:boolean;
 open:(v:View)=>void;
 openBoard:(projectId:string|null)=>void;
 onNewProject:()=>void;
 onManageProjects:()=>void;
}){
 const activeProjects=projects.filter(p=>p.status==="Active");
 return <aside className={"sidebar "+(sidebarOpen?"open":"")}>
  <div className="identity"><span className="avatar">AV</span><div><strong>Arun’s workspace</strong><small>Personal research OS</small></div><ChevronDown size={15}/></div>
  <nav>
   <button className={view==="home"?"active":""} onClick={()=>open("home")}><Home/>Home</button>
   <p>Boards <button className="sidebar-edit" onClick={onManageProjects} title="Manage projects"><Pencil size={11}/></button></p>
   <button className={view==="kanban"&&activeProjectId===null?"active":""} onClick={()=>openBoard(null)}><LayoutDashboard/>Inbox</button>
   {activeProjects.map(p=><button key={p.id} className={view==="kanban"&&activeProjectId===p.id?"active":""} onClick={()=>openBoard(p.id)}><LayoutDashboard/>{p.name}</button>)}
   <button className="sidebar-add" onClick={onNewProject}><Plus size={14}/>New project</button>
   <p>Knowledge</p>
   <button className={view==="publications"?"active":""} onClick={()=>open("publications")}><FlaskConical/>Publications <span>{counts.publications}</span></button>
   <button className={view==="documents"?"active":""} onClick={()=>open("documents")}><FileText/>Documents <span>{counts.documents}</span></button>
   <p>Personal</p>
   <button className={view==="reminders"?"active":""} onClick={()=>open("reminders")}><Bell/>Reminders <span>{counts.reminders}</span></button>
   <button className={view==="reads"?"active":""} onClick={()=>open("reads")}><BookMarked/>Reads <span>{counts.reads}</span></button>
   <p>Career</p>
   <button className={view==="jobs"?"active":""} onClick={()=>open("jobs")}><BriefcaseBusiness/>Job tracker <span>{counts.jobs}</span></button>
  </nav>
  <button className="telegram" onClick={()=>open("telegram")}><Send size={18}/><div><strong>Telegram</strong><small>{chatId?"Linked":"Not linked — tap to connect"}</small></div></button>
 </aside>
}
