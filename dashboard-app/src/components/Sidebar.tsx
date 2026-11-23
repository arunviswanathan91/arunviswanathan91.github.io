import { SECTIONS, type SectionId } from "../extended/lib/sections";
import { href, useRoute } from "../extended/lib/route";
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Highlighter, Home, Inbox, Moon, PanelLeftClose, PanelLeftOpen, Plus, Send, Settings, Sun, SunMoon, Trash2 } from "lucide-react";
import { useData, useUi } from "../lib/store";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import type { Theme, ViewKey } from "../lib/store";
import type { EntityKey } from "../entities/types";
import { MENU_GROUPS, PERSONAL_SECTIONS, RESEARCH_SECTIONS, toolKey, useMenuPrefs, viewKey } from "../lib/menuPrefs";

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
 // Workspace pages are hash routes (#/tools/agenda…); highlight the open one like the other menu items.
 const route=useRoute();
 const onTool=(key:SectionId)=>(ui.view==="extended"&&route.path[0]===key)||(key==="tasks"&&ui.view==="tasks");
 const toolClass=(key:SectionId)=>"extension-nav"+(onTool(key)?" active":"");

 // Menu preferences (Settings → Menu): hidden items are left out, and a group folds when
 // its heading is clicked. The icon-only sidebar has no headings, so nothing folds there.
 const menu=useMenuPrefs();
 const foldable=!collapsed||window.innerWidth<=860;
 const group=(id:string)=>{
  const def=MENU_GROUPS.find(g=>g.id===id)!;
  const any=def.items.some(i=>menu.isShown(i.key));
  const folded=foldable&&menu.isFolded(id);
  return {any,open:any&&!folded,label:any&&<button type="button" className="nav-label nav-fold" aria-expanded={!folded} onClick={()=>menu.toggleFolded(id)}>
   <span>{def.label}</span>{folded?<ChevronRight/>:<ChevronDown/>}</button>};
 };
 const research=group("research"),personal=group("personal"),workflows=group("workflows");

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
    title={collapsed?"Home":undefined} onClick={()=>go("home")}><span className="sec-chip"><Home/></span><span className="nav-text">Home</span></button>

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

   {research.label}
   {research.open&&RESEARCH_SECTIONS.filter(key=>menu.isShown(toolKey(key))).map(key=>{const item=SECTIONS[key];return <a key={key} className={toolClass(key)} aria-current={onTool(key)?"page":undefined} href={href(key)} title={item.label}><span className="sec-chip"><item.icon/></span><span className="nav-text">{item.label}</span>{key==="tasks"&&<span className="nav-count">{counts.tasks}</span>}</a>})}
   {personal.label}
   {personal.open&&PERSONAL_SECTIONS.filter(key=>menu.isShown(toolKey(key))).map(key=>{const item=SECTIONS[key];return <a key={key} className={toolClass(key)} aria-current={ui.view==="extended"&&route.path[0]===key?"page":undefined} href={href(key)} title={item.label}><span className="sec-chip"><item.icon/></span><span className="nav-text">{item.label}</span></a>})}
   {workflows.label}
   {workflows.open&&ENTITY_ORDER.filter(key=>key!=="tasks"&&menu.isShown(viewKey(key))).map(key=>{
    const def=ENTITIES[key];
    const active=ui.view===key||(key==="publications"&&ui.view==="publication");
    return <button key={key} className={active?"active":""} aria-current={active?"page":undefined}
     title={collapsed?def.plural:undefined} onClick={()=>go(key as ViewKey)}>
     <span className="sec-chip"><def.icon/></span><span className="nav-text">{def.plural}</span><span className="nav-count">{counts[key]}</span>
    </button>;
   })}
   {workflows.open&&menu.isShown(viewKey("clippings"))&&<button className={ui.view==="clippings"?"active":""} title="Clippings" onClick={()=>go("clippings")}><span className="sec-chip"><Highlighter/></span><span className="nav-text">Clippings</span></button>}
   <button className={ui.view==="trash"?"active":""} aria-current={ui.view==="trash"?"page":undefined}
    title={collapsed?"Trash":undefined} onClick={()=>go("trash")}>
    <span className="sec-chip"><Trash2/></span><span className="nav-text">Trash</span><span className="nav-count">{trashItems.rows.length}</span>
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
