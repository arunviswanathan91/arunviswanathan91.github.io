import { useEffect, useMemo, useState } from "react";
import { CircleUserRound, Command, Menu, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { StoreProvider, useData, useUi } from "../lib/store";
import { useHotkeys } from "../lib/keys";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import { Sidebar } from "./Sidebar";
import { HomeView } from "./HomeView";
import { SettingsView } from "./SettingsView";
import { EntityView } from "./entity/EntityView";
import { CommandPalette } from "./CommandPalette";
import { ProjectComposer } from "./ProjectComposer";
import { ProjectView } from "./projects/ProjectView";
import { PublicationView } from "./publications/PublicationView";
import type { EntityKey } from "../entities/types";

type ProjectMembership={project_id:string;role:"editor"|"viewer"};

function Shell(){
 const {userId,projects,loading,notices,tables}=useData();
 const ui=useUi();
 const [navOpen,setNavOpen]=useState(false);
 const [projectComposer,setProjectComposer]=useState(false);
 const [membership,setMembership]=useState<ProjectMembership|null|undefined>(undefined);

 useEffect(()=>{
  let active=true;
  if(!supabase){setMembership(null);return}
  void supabase.from("project_members").select("project_id,role")
   .eq("user_id",userId).order("created_at",{ascending:true}).limit(1).maybeSingle()
   .then(({data})=>{if(active)setMembership((data as ProjectMembership|null)??null)});
  return()=>{active=false};
 },[userId]);

 const projectOnly=membership!==undefined&&membership!==null;
 const sharedProject=membership?projects.byId.get(membership.project_id)??null:null;

 const hotkeys=useMemo(()=>({
  "mod+k":()=>{if(!projectOnly)ui.setPalette(!ui.palette)},
  "/":()=>{if(!projectOnly)ui.searchRef.current?.focus()},
  n:()=>{if(!projectOnly&&ENTITY_ORDER.includes(ui.view as EntityKey))document.dispatchEvent(new CustomEvent("dash:new",{detail:ui.view}))},
  Escape:()=>{
   if(ui.palette)ui.setPalette(false);
   else if(ui.drawer)ui.closeDrawer();
   else if(ui.selection.ids.length)ui.clearSelection();
  },
 }),[ui,projectOnly]);
 useHotkeys(hotkeys);

 const createProject=async(values:{name:string;description:string|null;color:string|null})=>{
  const row=await projects.insert({user_id:userId,status:"Active",...values});
  setProjectComposer(false);
  if(row)ui.openProject(row.id);
 };

 const currentProject=typeof ui.scope==="string"?projects.byId.get(ui.scope):null;
 const currentPublication=ui.publicationId?tables.publications.byId.get(ui.publicationId):null;
 const title=ui.view==="home"?"Home":ui.view==="settings"?"Settings":ui.view==="project"?(currentProject?.name??"Project"):
  ui.view==="publication"?(String(currentPublication?.title??"")||"Publication"):ENTITIES[ui.view as EntityKey].plural;

 useEffect(()=>{
  if(!loading&&projectOnly&&sharedProject&&(ui.view!=="project"||ui.scope!==sharedProject.id))ui.openProject(sharedProject.id);
 },[loading,projectOnly,sharedProject,ui]);

 if(membership===undefined)return <div className="shell project-only-shell"><main>
  <header className="topbar"><div className="crumb"><strong>Loading workspace…</strong></div></header>
  <div className="page"><div className="skeleton-stack">{Array.from({length:5}).map((_,i)=><div className="skeleton" key={i}/>)}</div></div>
 </main></div>;

 return <div className={"shell"+(projectOnly?" project-only-shell":"")}>
  {!projectOnly&&navOpen&&<div className="nav-scrim" onClick={()=>setNavOpen(false)}/>}
  {!projectOnly&&<Sidebar open={navOpen} onNewProject={()=>setProjectComposer(true)}/>}
  <main>
   <header className="topbar">
    {!projectOnly&&<button className="icon-button nav-toggle" onClick={()=>setNavOpen(v=>!v)} aria-label="Toggle navigation"><Menu/></button>}
    <div className="crumb">{projectOnly?<><strong>{sharedProject?.name??"Shared project"}</strong></>:<>Workspace / <strong>{title}</strong></>}</div>
    <div className="topbar-end">
     {!projectOnly&&<button className="chip-button" onClick={()=>ui.setPalette(true)} aria-label="Open command palette">
      <Command/><span className="kbd-hint">K</span>
     </button>}
     <button className="icon-button" onClick={()=>void supabase?.auth.signOut()} aria-label="Sign out"><CircleUserRound/></button>
    </div>
   </header>

   <div className="page">
    {notices.map(n=><p key={n.key} className="data-notice" role="alert">
     <span>{n.message}</span>
     <button className="icon-button" onClick={n.dismiss} aria-label="Dismiss"><X/></button>
    </p>)}

    {loading
     ?<div className="skeleton-stack">{Array.from({length:5}).map((_,i)=><div className="skeleton" key={i}/>)}</div>
     :projectOnly&&sharedProject?<ProjectView projectId={sharedProject.id}/>
     :projectOnly?<div className="empty-state"><p>This shared project is unavailable.</p></div>
     :ui.view==="home"?<HomeView/>
     :ui.view==="settings"?<SettingsView/>
     :ui.view==="project"&&typeof ui.scope==="string"?<ProjectView projectId={ui.scope}/>
     :ui.view==="publication"&&ui.publicationId?<PublicationView publicationId={ui.publicationId}/>
     :<EntityView key={ui.view} def={ENTITIES[ui.view as EntityKey]}/>} 
   </div>
  </main>

  {!projectOnly&&<CommandPalette/>}
  {!projectOnly&&projectComposer&&<ProjectComposer onClose={()=>setProjectComposer(false)} onCreate={v=>void createProject(v)}/>}
 </div>;
}

export function Workspace({userId}:{userId:string}){
 return <StoreProvider userId={userId}><Shell/></StoreProvider>;
}
