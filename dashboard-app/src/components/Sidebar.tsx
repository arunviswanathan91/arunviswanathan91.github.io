import { useMemo, useState } from "react";
import { Check, Home, Inbox, Moon, PanelLeftClose, PanelLeftOpen, Plus, Send, Settings, Sun, SunMoon, Trash2 } from "lucide-react";
import { useData, useUi } from "../lib/store";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import type { Theme, ViewKey } from "../lib/store";
import type { EntityKey } from "../entities/types";

const THEMES:{value:Theme;label:string;icon:any}[]=[
 {value:"system",label:"System",icon:SunMoon},{value:"light",label:"Light",icon:Sun},{value:"dark",label:"Dark",icon:Moon},
];

export function Sidebar({open,collapsed,onToggleCollapsed,onNewProject}:{open:boolean;collapsed:boolean;onToggleCollapsed():void;onNewProject():void}){
 const {tables,projects,trashItems,chatId}=useData();
 const ui=useUi();
 const [showArchived,setShowArchived]=useState(false);

 // One source of truth for counts: the entity's own `openWhen` predicate, so the sidebar
 // and the home tiles can no longer disagree about the same data.
 const counts=useMemo(()=>{
  const out={} as Record<EntityKey,number>;
  for(const key of ENTITY_ORDER){
   const def=ENTITIES[key],rows=tables[key].rows;
   out[key]=def.openWhen?rows.filter(def.openWhen).length:rows.length;
  }
  return out;
 },[tables]);

 const visibleProjects=projects.rows.filter(p=>showArchived||p.status==="Active");
 const go=(v:ViewKey)=>ui.setView(v);

 return <aside className={"sidebar"+(open?" open":"")+(collapsed?" collapsed":"")}>
  <div className="identity" title={collapsed?"Arun’s workspace":undefined}>
   <span className="avatar">AV</span>
   <div className="identity-copy"><strong>Arun’s workspace</strong><small>Personal research OS</small></div>
   <button className="icon-button sidebar-collapse" onClick={onToggleCollapsed}
    title={collapsed?"Expand sidebar":"Collapse sidebar"} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}>
    {collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}
   </button>
  </div>

  <nav>
   <button className={ui.view==="home"?"active":""} aria-current={ui.view==="home"?"page":undefined}
    title={collapsed?"Home":undefined} onClick={()=>go("home")}><Home/><span className="nav-text">Home</span></button>

   <p className="nav-label">Projects</p>
   <button className={"nav-project"+(ui.scope==="all"?" active":"")} title={collapsed?"All projects":undefined} onClick={()=>{ui.setScope("all");if(ui.view==="project"||ui.view==="publication")ui.setView("home")}}>
    <span className="project-dot tint-slate"/><span className="nav-text">All projects</span>{ui.scope==="all"&&<Check className="nav-tick"/>}
   </button>
   <button className={"nav-project"+(ui.scope===null?" active":"")} title={collapsed?"Inbox":undefined} onClick={()=>{ui.setScope(null);if(ui.view==="project"||ui.view==="publication")ui.setView("home")}}>
    <Inbox/><span className="nav-project-copy"><span>Inbox</span><small>Unassigned items</small></span>{ui.scope===null&&<Check className="nav-tick"/>}
   </button>
   {visibleProjects.map(p=>
    <button key={p.id} className={"nav-project"+(ui.scope===p.id?" active":"")} title={collapsed?p.name:undefined} onClick={()=>ui.openProject(p.id)}>
     <span className={"project-dot tint-"+(p.color??"slate")}/>
     <span className="clamp-1 nav-text">{p.name}</span>
     {p.status==="Archived"&&<small className="muted-note">archived</small>}
     {ui.scope===p.id&&<Check className="nav-tick"/>}
    </button>)}
   <div className="nav-row">
    <button className="link-button" title={collapsed?"New project":undefined} onClick={onNewProject}><Plus/><span className="nav-text">New project</span></button>
    {projects.rows.some(p=>p.status==="Archived")&&
     <button className="link-button" onClick={()=>setShowArchived(v=>!v)}>{showArchived?"Hide archived":"Show archived"}</button>}
   </div>

   <p className="nav-label">Workspace</p>
   {ENTITY_ORDER.map(key=>{
    const def=ENTITIES[key];
    const active=ui.view===key||(key==="publications"&&ui.view==="publication");
    return <button key={key} className={active?"active":""} aria-current={active?"page":undefined}
     title={collapsed?def.plural:undefined} onClick={()=>go(key as ViewKey)}>
     <def.icon/><span className="nav-text">{def.plural}</span><span className="nav-count">{counts[key]}</span>
    </button>;
   })}
   <button className={ui.view==="trash"?"active":""} aria-current={ui.view==="trash"?"page":undefined}
    title={collapsed?"Trash":undefined} onClick={()=>go("trash")}>
    <Trash2/><span className="nav-text">Trash</span><span className="nav-count">{trashItems.rows.length}</span>
   </button>
  </nav>

  <div className="sidebar-foot">
   <div className="theme-toggle" role="group" aria-label="Theme">
    {THEMES.map(t=><button key={t.value} className={ui.theme===t.value?"active":""} aria-pressed={ui.theme===t.value}
     onClick={()=>ui.setTheme(t.value)} title={t.label} aria-label={t.label}><t.icon/></button>)}
   </div>
   <button className={"telegram"+(ui.view==="settings"?" active":"")} title={collapsed?"Settings":undefined} onClick={()=>go("settings")}>
    <Send/><div><strong>Settings</strong><small>{chatId?"Telegram linked":"Telegram not linked"}</small></div>
    <Settings className="nav-tick"/>
   </button>
  </div>
 </aside>;
}
