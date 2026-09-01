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

export interface Project extends Row{id:string;name:string;description:string|null;status:string;color:string|null;created_at:string}
export type ViewKey=EntityKey|"home"|"settings";
export type Theme="system"|"light"|"dark";
export interface NoticeItem{key:string;message:string;dismiss():void}

const PROJECT_SELECT="id,user_id,name,description,status,color,created_at";
/** Entity tables carrying a project_id, repaired locally when a project is deleted. */
const PROJECT_SCOPED:EntityKey[]=["tasks","publications","documents","jobs"];

interface DataValue{
 userId:string;
 tables:Record<EntityKey,TableStore>;
 projects:TableStore<Project>;
 tags:TagStore;
 loading:boolean;
 notices:NoticeItem[];
 refreshAll():void;
 chatId:number|null;
 refreshTelegram():Promise<void>;
 deleteProject(id:string):Promise<void>;
}
interface UiValue{
 view:ViewKey;setView(v:ViewKey):void;
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

const initialView=():ViewKey=>{
 const hash=location.hash.replace(/^#\/?/,"");
 return (hash&&(hash==="home"||hash==="settings"||ENTITY_ORDER.includes(hash as EntityKey))?hash:"home") as ViewKey;
};

export function StoreProvider({userId,children}:{userId:string;children:ReactNode}){
 const tasks=useTable(ENTITIES.tasks.table,ENTITIES.tasks.select,ENTITIES.tasks.defaultSort);
 const publications=useTable(ENTITIES.publications.table,ENTITIES.publications.select,ENTITIES.publications.defaultSort);
 const documents=useTable(ENTITIES.documents.table,ENTITIES.documents.select,ENTITIES.documents.defaultSort);
 const jobs=useTable(ENTITIES.jobs.table,ENTITIES.jobs.select,ENTITIES.jobs.defaultSort);
 const reminders=useTable(ENTITIES.reminders.table,ENTITIES.reminders.select,ENTITIES.reminders.defaultSort);
 const reads=useTable(ENTITIES.reads.table,ENTITIES.reads.select,ENTITIES.reads.defaultSort);
 const projects=useTable<Project>("projects",PROJECT_SELECT,{key:"name",dir:"asc"});
 const tags=useTags(userId);

 const tables=useMemo(()=>({tasks,publications,documents,jobs,reminders,reads}),
  [tasks,publications,documents,jobs,reminders,reads]);

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

 const loading=tasks.loading||publications.loading||documents.loading||jobs.loading||reminders.loading||reads.loading||projects.loading||tags.loading;

 const notices=useMemo(()=>{
  const all:NoticeItem[]=[];
  for(const key of ENTITY_ORDER){const t=tables[key];if(t.error)all.push({key,message:t.error,dismiss:t.dismissError})}
  if(projects.error)all.push({key:"projects",message:projects.error,dismiss:projects.dismissError});
  if(tags.error)all.push({key:"tags",message:tags.error,dismiss:tags.dismissError});
  return all;
 },[tables,projects.error,projects.dismissError,tags.error,tags.dismissError]);

 const refreshAll=useCallback(()=>{
  for(const key of ENTITY_ORDER)void tables[key].refetch(true);
  void projects.refetch(true);
 },[tables,projects]);

 // The DB nulls these FKs via `on delete set null`; mirror it locally so rows don't
 // silently disappear from every board until the next reload.
 const deleteProject=useCallback(async(id:string)=>{
  if(!await projects.remove(id))return;
  for(const key of PROJECT_SCOPED)
   tables[key].patchLocal(r=>r.project_id===id?{...r,project_id:null}:null);
 },[projects,tables]);

 const dataValue=useMemo(()=>({userId,tables,projects,tags,loading,notices,refreshAll,chatId,refreshTelegram,deleteProject}),
  [userId,tables,projects,tags,loading,notices,refreshAll,chatId,refreshTelegram,deleteProject]);

 // ---- UI state ----
 const [view,setViewState]=useState<ViewKey>(initialView);
 const [scope,setScope]=useState<Scope>("all");
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
 useEffect(()=>{const onHash=()=>setViewState(initialView());window.addEventListener("hashchange",onHash);return()=>window.removeEventListener("hashchange",onHash)},[]);

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

 const uiValue=useMemo(()=>({view,setView,scope,setScope,queries,setQuery,drawer,openDrawer,closeDrawer,
  selection,toggleSelect,setSelection,clearSelection,palette,setPalette,theme,setTheme,searchRef}),
  [view,setView,scope,queries,setQuery,drawer,openDrawer,closeDrawer,selection,toggleSelect,setSelection,clearSelection,palette,theme,setTheme]);

 return <Data.Provider value={dataValue}><Ui.Provider value={uiValue}>{children}</Ui.Provider></Data.Provider>;
}
