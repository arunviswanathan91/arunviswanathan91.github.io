import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { supabase } from "./supabase";
import { useTable } from "./useTable";
import { useTags } from "./tags";
import { defaultQuery } from "./query";
import { save, loadRaw } from "./persist";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import type { TableStore } from "./useTable";
import type { TagStore } from "./tags";
import type { Query, Scope } from "./query";
import type { EntityKey, Row } from "../entities/types";

export interface Project extends Row{
 id:string;name:string;description:string|null;objective:string|null;status:string;phase:string;
 color:string|null;start_date:string|null;target_date:string|null;created_at:string;updated_at:string;
}
export interface Person extends Row{
 id:string;name:string;role:string|null;organization:string|null;email:string|null;
 telegram_handle:string|null;notes:string|null;created_at:string;updated_at:string;
}
export interface ProjectStage extends Row{
 id:string;project_id:string;name:string;color:string|null;position:number;category:string;created_at:string;updated_at:string;
}
export interface ProjectLink extends Row{
 id:string;project_id:string;label:string;url:string;kind:string|null;position:number;created_at:string;updated_at:string;
}
export interface ProjectField extends Row{
 id:string;project_id:string;label:string;value:string|null;field_type:string;position:number;created_at:string;updated_at:string;
}
export interface PublicationNode extends Row{
 id:string;publication_id:string;title:string;status:string;assignee_id:string|null;due_at:string|null;
 position:number;notes:string|null;completed_at:string|null;created_at:string;updated_at:string;
}
export interface PublicationStageEvent extends Row{
 id:string;publication_id:string;from_stage:string|null;to_stage:string;created_at:string;
}
export type ViewKey=EntityKey|"home"|"project"|"settings";
export type Theme="system"|"light"|"dark";
export interface NoticeItem{key:string;message:string;dismiss():void}

const PROJECT_SELECT="id,user_id,name,description,objective,status,phase,color,start_date,target_date,created_at,updated_at";
/** Entity tables carrying a project_id, repaired locally when a project is deleted. */
const PROJECT_SCOPED:EntityKey[]=["tasks","publications","documents","jobs","reminders","reads"];

interface DataValue{
 userId:string;
 tables:Record<EntityKey,TableStore>;
 projects:TableStore<Project>;
 people:TableStore<Person>;
 projectStages:TableStore<ProjectStage>;
 projectLinks:TableStore<ProjectLink>;
 projectFields:TableStore<ProjectField>;
 publicationNodes:TableStore<PublicationNode>;
 publicationStageEvents:TableStore<PublicationStageEvent>;
 tags:TagStore;
 loading:boolean;
 notices:NoticeItem[];
 refreshAll():void;
 chatId:number|null;
 refreshTelegram():Promise<void>;
 deleteProject(id:string):Promise<void>;
}
interface UiValue{
 view:ViewKey;setView(v:ViewKey):void;openProject(id:string):void;
 scope:Scope;setScope(s:Scope):void;
 queries:Record<EntityKey,Query>;
 setQuery(k:EntityKey,patch:Partial<Query>):void;
 drawer:{entity:EntityKey;id:string}|null;
 openDrawer(entity:EntityKey,id:string):void;closeDrawer():void;
 selection:{entity:EntityKey|null;ids:string[]};
 toggleSelect(entity:EntityKey,id:string):void;
 setSelection(entity:EntityKey,ids:string[]):void;
 clearSelection():void;
 palette:boolean;setPalette(v:boolean):void;
 theme:Theme;setTheme(t:Theme):void;
 searchRef:RefObject<HTMLInputElement>;
}

const Data=createContext<DataValue|null>(null);
const Ui=createContext<UiValue|null>(null);
export const useData=()=>useContext(Data)!;
export const useUi=()=>useContext(Ui)!;
export const useEntityTable=(key:EntityKey)=>useData().tables[key];

export function applyTheme(theme:Theme){
 const el=document.documentElement;
 if(theme==="system")el.removeAttribute("data-theme"); else el.setAttribute("data-theme",theme);
}

const initialRoute=():{view:ViewKey;scope:Scope}=>{
 const hash=location.hash.replace(/^#\/?/,"");
 const project=hash.match(/^project\/([0-9a-f-]+)$/i);
 if(project)return {view:"project",scope:project[1]};
 const view=(hash&&(hash==="home"||hash==="settings"||ENTITY_ORDER.includes(hash as EntityKey))?hash:"home") as ViewKey;
 return {view,scope:"all"};
};

export function StoreProvider({userId,children}:{userId:string;children:ReactNode}){
 const tasks=useTable(ENTITIES.tasks.table,ENTITIES.tasks.select,ENTITIES.tasks.defaultSort);
 const publications=useTable(ENTITIES.publications.table,ENTITIES.publications.select,ENTITIES.publications.defaultSort);
 const documents=useTable(ENTITIES.documents.table,ENTITIES.documents.select,ENTITIES.documents.defaultSort);
 const jobs=useTable(ENTITIES.jobs.table,ENTITIES.jobs.select,ENTITIES.jobs.defaultSort);
 const reminders=useTable(ENTITIES.reminders.table,ENTITIES.reminders.select,ENTITIES.reminders.defaultSort);
 const reads=useTable(ENTITIES.reads.table,ENTITIES.reads.select,ENTITIES.reads.defaultSort);
 const opportunities=useTable(ENTITIES.opportunities.table,ENTITIES.opportunities.select,ENTITIES.opportunities.defaultSort);
 const projects=useTable<Project>("projects",PROJECT_SELECT,{key:"name",dir:"asc"});
 const people=useTable<Person>("people","id,user_id,name,role,organization,email,telegram_handle,notes,created_at,updated_at",{key:"name",dir:"asc"});
 const projectStages=useTable<ProjectStage>("project_stages","id,user_id,project_id,name,color,position,category,created_at,updated_at",{key:"position",dir:"asc"});
 const projectLinks=useTable<ProjectLink>("project_links","id,user_id,project_id,label,url,kind,position,created_at,updated_at",{key:"position",dir:"asc"});
 const projectFields=useTable<ProjectField>("project_fields","id,user_id,project_id,label,value,field_type,position,created_at,updated_at",{key:"position",dir:"asc"});
 const publicationNodes=useTable<PublicationNode>("publication_nodes","id,user_id,publication_id,title,status,assignee_id,due_at,position,notes,completed_at,created_at,updated_at",{key:"position",dir:"asc"});
 const publicationStageEvents=useTable<PublicationStageEvent>("publication_stage_events","id,user_id,publication_id,from_stage,to_stage,created_at",{key:"created_at",dir:"desc"});
 const tags=useTags(userId);

 const tables=useMemo(()=>({tasks,publications,documents,jobs,reminders,reads,opportunities}),
  [tasks,publications,documents,jobs,reminders,reads,opportunities]);

 const [chatId,setChatId]=useState<number|null>(null);
 const refreshTelegram=useCallback(async()=>{
  if(!supabase)return;
  const {data}=await supabase.from("profiles").select("telegram_chat_id").eq("id",userId).maybeSingle();
  setChatId((data?.telegram_chat_id as number|null)??null);
 },[userId]);
 useEffect(()=>{
  if(!supabase)return;
  void(async()=>{
   await supabase!.from("profiles").upsert({id:userId},{onConflict:"id"});
   // The bot resolves "due:friday" and "in 2h" in this zone; without it dates land in UTC.
   const {data}=await supabase!.from("profiles").select("timezone").eq("id",userId).maybeSingle();
   if(!data?.timezone){
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    if(zone)await supabase!.from("profiles").update({timezone:zone}).eq("id",userId);
   }
   await refreshTelegram();
  })();
 },[userId,refreshTelegram]);

 const loading=tasks.loading||publications.loading||documents.loading||jobs.loading||reminders.loading||reads.loading||opportunities.loading||
  projects.loading||people.loading||projectStages.loading||projectLinks.loading||projectFields.loading||publicationNodes.loading||publicationStageEvents.loading||tags.loading;

 const notices=useMemo(()=>{
  const all:NoticeItem[]=[];
  for(const key of ENTITY_ORDER){const t=tables[key];if(t.error)all.push({key,message:t.error,dismiss:t.dismissError})}
  if(projects.error)all.push({key:"projects",message:projects.error,dismiss:projects.dismissError});
  for(const [key,t] of [["people",people],["project stages",projectStages],["project links",projectLinks],
   ["project fields",projectFields],["publication nodes",publicationNodes],["publication history",publicationStageEvents]] as const)
   if(t.error)all.push({key,message:t.error,dismiss:t.dismissError});
  if(tags.error)all.push({key:"tags",message:tags.error,dismiss:tags.dismissError});
  return all;
 },[tables,projects.error,projects.dismissError,people,projectStages,projectLinks,projectFields,publicationNodes,publicationStageEvents,tags.error,tags.dismissError]);

 const refreshAll=useCallback(()=>{
  for(const key of ENTITY_ORDER)void tables[key].refetch(true);
  void projects.refetch(true);
  void people.refetch(true);void projectStages.refetch(true);void projectLinks.refetch(true);
  void projectFields.refetch(true);void publicationNodes.refetch(true);void publicationStageEvents.refetch(true);
 },[tables,projects,people,projectStages,projectLinks,projectFields,publicationNodes,publicationStageEvents]);

 // The DB nulls these FKs via `on delete set null`; mirror it locally so rows don't
 // silently disappear from every board until the next reload.
 const deleteProject=useCallback(async(id:string)=>{
  if(!await projects.remove(id))return;
  for(const key of PROJECT_SCOPED)
   tables[key].patchLocal(r=>r.project_id===id?{...r,project_id:null}:null);
 },[projects,tables]);

 const dataValue=useMemo(()=>({userId,tables,projects,people,projectStages,projectLinks,projectFields,publicationNodes,publicationStageEvents,
  tags,loading,notices,refreshAll,chatId,refreshTelegram,deleteProject}),
  [userId,tables,projects,people,projectStages,projectLinks,projectFields,publicationNodes,publicationStageEvents,tags,loading,notices,refreshAll,chatId,refreshTelegram,deleteProject]);

 // ---- UI state ----
 const initial=initialRoute();
 const [view,setViewState]=useState<ViewKey>(initial.view);
 const [scope,setScope]=useState<Scope>(initial.scope);
 const [drawer,setDrawer]=useState<{entity:EntityKey;id:string}|null>(null);
 const [selection,setSelectionState]=useState<{entity:EntityKey|null;ids:string[]}>({entity:null,ids:[]});
 const [palette,setPalette]=useState(false);
 const [theme,setThemeState]=useState<Theme>(()=>loadRaw<Theme>("theme","system"));
 const searchRef=useRef<HTMLInputElement>(null);
 const [queries,setQueries]=useState<Record<EntityKey,Query>>(()=>{
  const base=Object.fromEntries(ENTITY_ORDER.map(k=>[k,defaultQuery(ENTITIES[k])])) as Record<EntityKey,Query>;
  const stored=loadRaw<Partial<Record<EntityKey,Partial<Query>>>>("queries",{});
  for(const k of ENTITY_ORDER)if(stored[k])base[k]={...base[k],...stored[k],q:""};   // never restore a stale search
  return base;
 });

 const setView=useCallback((v:ViewKey)=>{setViewState(v);location.hash="/"+v;setSelectionState({entity:null,ids:[]})},[]);
 const openProject=useCallback((id:string)=>{
  setScope(id);setViewState("project");location.hash="/project/"+id;setSelectionState({entity:null,ids:[]});
 },[]);
 useEffect(()=>{const onHash=()=>{const route=initialRoute();setViewState(route.view);if(route.view==="project")setScope(route.scope)};
  window.addEventListener("hashchange",onHash);return()=>window.removeEventListener("hashchange",onHash)},[]);

 // Navigation is an explicit freshness boundary. This removes the old need to
 // reload after Telegram or another tab changed a row less than 15 seconds ago.
 useEffect(()=>{
  if(view==="project"){
   void tasks.refetch(true);void publications.refetch(true);void documents.refetch(true);void reminders.refetch(true);void reads.refetch(true);
   void projects.refetch(true);void people.refetch(true);void projectStages.refetch(true);void projectLinks.refetch(true);
   void projectFields.refetch(true);void publicationNodes.refetch(true);void publicationStageEvents.refetch(true);
  }else if(ENTITY_ORDER.includes(view as EntityKey))void tables[view as EntityKey].refetch(true);
 },[view,scope,tasks.refetch,publications.refetch,documents.refetch,reminders.refetch,reads.refetch,projects.refetch,
  people.refetch,projectStages.refetch,projectLinks.refetch,projectFields.refetch,publicationNodes.refetch,publicationStageEvents.refetch]);

 const setQuery=useCallback((k:EntityKey,patch:Partial<Query>)=>setQueries(v=>({...v,[k]:{...v[k],...patch}})),[]);
 useEffect(()=>{
  const t=setTimeout(()=>{
   const strip=Object.fromEntries(ENTITY_ORDER.map(k=>{const {q,...rest}=queries[k];return [k,rest]}));
   save("queries",strip);
  },300);
  return()=>clearTimeout(t);
 },[queries]);

 useEffect(()=>{applyTheme(theme);save("theme",theme)},[theme]);
 const setTheme=useCallback((t:Theme)=>setThemeState(t),[]);

 const openDrawer=useCallback((entity:EntityKey,id:string)=>setDrawer({entity,id}),[]);
 const closeDrawer=useCallback(()=>setDrawer(null),[]);
 const clearSelection=useCallback(()=>setSelectionState({entity:null,ids:[]}),[]);
 const setSelection=useCallback((entity:EntityKey,ids:string[])=>setSelectionState({entity,ids}),[]);
 const toggleSelect=useCallback((entity:EntityKey,id:string)=>setSelectionState(s=>{
  if(s.entity!==entity)return {entity,ids:[id]};
  return {entity,ids:s.ids.includes(id)?s.ids.filter(x=>x!==id):[...s.ids,id]};
 }),[]);

 const uiValue=useMemo(()=>({view,setView,openProject,scope,setScope,queries,setQuery,drawer,openDrawer,closeDrawer,
  selection,toggleSelect,setSelection,clearSelection,palette,setPalette,theme,setTheme,searchRef}),
  [view,setView,openProject,scope,queries,setQuery,drawer,openDrawer,closeDrawer,selection,toggleSelect,setSelection,clearSelection,palette,theme,setTheme]);

 return <Data.Provider value={dataValue}><Ui.Provider value={uiValue}>{children}</Ui.Provider></Data.Provider>;
}
