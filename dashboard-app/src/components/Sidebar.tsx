import { useMemo, useState } from "react";
import { Check, Home, Inbox, Moon, Plus, Send, Settings, Sun, SunMoon } from "lucide-react";
import { useData, useUi } from "../lib/store";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import type { Theme, ViewKey } from "../lib/store";
import type { EntityKey } from "../entities/types";

const THEMES:{value:Theme;label:string;icon:any}[]=[
 {value:"system",label:"System",icon:SunMoon},{value:"light",label:"Light",icon:Sun},{value:"dark",label:"Dark",icon:Moon},
];

export function Sidebar({open,onNewProject}:{open:boolean;onNewProject():void}){
 const {tables,projects,chatId}=useData();
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

 return <aside className={"sidebar"+(open?" open":"")}>
  <div className="identity">
   <span className="avatar">AV</span>
   <div><strong>Arun’s workspace</strong><small>Personal research OS</small></div>
  </div>

  <nav>
   <button className={ui.view==="home"?"active":""} aria-current={ui.view==="home"?"page":undefined}
    onClick={()=>go("home")}><Home/>Home</button>

   <p className="nav-label">Projects</p>
   <button className={"nav-project"+(ui.scope==="all"?" active":"")} onClick={()=>ui.setScope("all")}>
    <span className="project-dot tint-slate"/>All projects{ui.scope==="all"&&<Check className="nav-tick"/>}
   </button>
   <button className={"nav-project"+(ui.scope===null?" active":"")} onClick={()=>ui.setScope(null)}>
    <Inbox/>Inbox{ui.scope===null&&<Check className="nav-tick"/>}
   </button>
   {visibleProjects.map(p=>
    <button key={p.id} className={"nav-project"+(ui.scope===p.id?" active":"")} onClick={()=>ui.setScope(p.id)}>
     <span className={"project-dot tint-"+(p.color??"slate")}/>
     <span className="clamp-1">{p.name}</span>
     {p.status==="Archived"&&<small className="muted-note">archived</small>}
     {ui.scope===p.id&&<Check className="nav-tick"/>}
    </button>)}
   <div className="nav-row">
    <button className="link-button" onClick={onNewProject}><Plus/>New project</button>
    {projects.rows.some(p=>p.status==="Archived")&&
     <button className="link-button" onClick={()=>setShowArchived(v=>!v)}>{showArchived?"Hide archived":"Show archived"}</button>}
   </div>

   <p className="nav-label">Workspace</p>
   {ENTITY_ORDER.map(key=>{
    const def=ENTITIES[key];
    return <button key={key} className={ui.view===key?"active":""} aria-current={ui.view===key?"page":undefined}
     onClick={()=>go(key as ViewKey)}>
     <def.icon/>{def.plural}<span className="nav-count">{counts[key]}</span>
    </button>;
   })}
  </nav>

  <div className="sidebar-foot">
   <div className="theme-toggle" role="group" aria-label="Theme">
    {THEMES.map(t=><button key={t.value} className={ui.theme===t.value?"active":""} aria-pressed={ui.theme===t.value}
     onClick={()=>ui.setTheme(t.value)} title={t.label} aria-label={t.label}><t.icon/></button>)}
   </div>
   <button className={"telegram"+(ui.view==="settings"?" active":"")} onClick={()=>go("settings")}>
    <Send/><div><strong>Settings</strong><small>{chatId?"Telegram linked":"Telegram not linked"}</small></div>
    <Settings className="nav-tick"/>
   </button>
  </div>
 </aside>;
}
