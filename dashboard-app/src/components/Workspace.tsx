import { useMemo, useState } from "react";
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
import type { EntityKey } from "../entities/types";

function Shell(){
 const {userId,projects,loading,notices,tables}=useData();
 const ui=useUi();
 const [navOpen,setNavOpen]=useState(false);
 const [projectComposer,setProjectComposer]=useState(false);

 const hotkeys=useMemo(()=>({
  "mod+k":()=>ui.setPalette(!ui.palette),
  "/":()=>ui.searchRef.current?.focus(),
  n:()=>{if(ENTITY_ORDER.includes(ui.view as EntityKey))document.dispatchEvent(new CustomEvent("dash:new",{detail:ui.view}))},
  Escape:()=>{
   if(ui.palette)ui.setPalette(false);
   else if(ui.drawer)ui.closeDrawer();
   else if(ui.selection.ids.length)ui.clearSelection();
  },
 }),[ui]);
 useHotkeys(hotkeys);

 const createProject=async(values:{name:string;description:string|null;color:string|null})=>{
  const row=await projects.insert({user_id:userId,status:"Active",...values});
  setProjectComposer(false);
  if(row)ui.setScope(row.id);
 };

 const title=ui.view==="home"?"Home":ui.view==="settings"?"Settings":ENTITIES[ui.view as EntityKey].plural;

 return <div className="shell">
  {navOpen&&<div className="nav-scrim" onClick={()=>setNavOpen(false)}/>}
  <Sidebar open={navOpen} onNewProject={()=>setProjectComposer(true)}/>
  <main>
   <header className="topbar">
    <button className="icon-button nav-toggle" onClick={()=>setNavOpen(v=>!v)} aria-label="Toggle navigation"><Menu/></button>
    <div className="crumb">Workspace / <strong>{title}</strong></div>
    <div className="topbar-end">
     <button className="chip-button" onClick={()=>ui.setPalette(true)} aria-label="Open command palette">
      <Command/><span className="kbd-hint">K</span>
     </button>
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
     :ui.view==="home"?<HomeView/>
     :ui.view==="settings"?<SettingsView/>
     :<EntityView key={ui.view} def={ENTITIES[ui.view as EntityKey]}/>}
   </div>
  </main>

  <CommandPalette/>
  {projectComposer&&<ProjectComposer onClose={()=>setProjectComposer(false)} onCreate={v=>void createProject(v)}/>}
 </div>;
}

export function Workspace({userId}:{userId:string}){
 return <StoreProvider userId={userId}><Shell/></StoreProvider>;
}
