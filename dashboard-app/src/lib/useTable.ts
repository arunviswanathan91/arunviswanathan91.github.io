import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Row, SortSpec } from "../entities/types";

const REFETCH_THROTTLE=15000;

export function compareRows(a:Row,b:Row,sort:SortSpec){
 const x=a[sort.key],y=b[sort.key];
 if(x===y)return 0;
 if(x==null)return 1;                       // nulls last, whichever direction
 if(y==null)return -1;
 const n=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y));
 return sort.dir==="asc"?n:-n;
}
const insertSorted=(rows:Row[],row:Row,sort:SortSpec)=>{
 const next=rows.slice();
 const at=next.findIndex(r=>compareRows(row,r,sort)<0);
 next.splice(at<0?next.length:at,0,row);
 return next;
};

export interface TableStore<T extends Row=Row>{
 rows:T[];
 byId:Map<string,T>;
 loading:boolean;
 error:string;
 dismissError():void;
 refetch(force?:boolean):Promise<void>;
 insert(values:Record<string,unknown>):Promise<T|null>;
 update(id:string,patch:Record<string,unknown>):Promise<boolean>;
 updateMany(ids:string[],patch:Record<string,unknown>):Promise<boolean>;
 remove(id:string):Promise<boolean>;
 removeMany(ids:string[]):Promise<boolean>;
 /** Local-only repair, e.g. nulling project_id after a project is deleted. */
 patchLocal(fn:(row:T)=>T|null):void;
}

export function useTable<T extends Row=Row>(table:string,select:string,sort:SortSpec):TableStore<T>{
 const [rows,setRows]=useState<T[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const rowsRef=useRef<T[]>([]);rowsRef.current=rows;
 const fetchedAt=useRef(0),alive=useRef(true);
 const {key:sortKey,dir:sortDir}=sort;

 const refetch=useCallback(async(force=false)=>{
  if(!supabase)return;
  if(!force&&Date.now()-fetchedAt.current<REFETCH_THROTTLE)return;
  fetchedAt.current=Date.now();
  const {data,error}=await supabase.from(table).select(select).order(sortKey,{ascending:sortDir==="asc"});
  if(!alive.current)return;
  if(error)setError(error.message); else setRows((data??[]) as unknown as T[]);
  setLoading(false);
 },[table,select,sortKey,sortDir]);

 useEffect(()=>{
  alive.current=true;
  if(!supabase){setLoading(false);return}
  void refetch(true);
  // Records created by the Telegram bot only land here on a refetch, so pick them up
  // whenever the tab regains attention rather than paying for a realtime subscription.
  const onFocus=()=>void refetch();
  const onVisible=()=>{if(document.visibilityState==="visible")void refetch()};
  window.addEventListener("focus",onFocus);
  document.addEventListener("visibilitychange",onVisible);
  return()=>{alive.current=false;window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisible)};
 },[refetch]);

 const byId=useMemo(()=>new Map(rows.map(r=>[r.id,r])),[rows]);

 const insert=useCallback(async(values:Record<string,unknown>)=>{
  if(!supabase)return null;
  const {data,error}=await supabase.from(table).insert(values).select(select).single();
  if(error){setError(error.message);return null}
  const row=data as unknown as T;
  setRows(v=>insertSorted(v,row,{key:sortKey,dir:sortDir}) as T[]);
  return row;
 },[table,select,sortKey,sortDir]);

 const update=useCallback(async(id:string,patch:Record<string,unknown>)=>{
  if(!supabase||!id)return false;
  const before=rowsRef.current.find(r=>r.id===id);
  if(!before)return false;
  setRows(v=>v.map(r=>r.id===id?{...r,...patch} as T:r));
  const {data,error}=await supabase.from(table).update(patch).eq("id",id).select(select).single();
  if(error){setRows(v=>v.map(r=>r.id===id?before:r));setError(error.message);return false}
  // Merge the returned row so trigger-computed updated_at is correct locally.
  if(data)setRows(v=>v.map(r=>r.id===id?data as unknown as T:r));
  return true;
 },[table,select]);

 const updateMany=useCallback(async(ids:string[],patch:Record<string,unknown>)=>{
  if(!supabase||!ids.length)return false;
  const before=rowsRef.current.filter(r=>ids.includes(r.id));
  const set=new Set(ids);
  setRows(v=>v.map(r=>set.has(r.id)?{...r,...patch} as T:r));
  const {error}=await supabase.from(table).update(patch).in("id",ids);
  if(error){
   const restore=new Map(before.map(r=>[r.id,r]));
   setRows(v=>v.map(r=>restore.get(r.id)??r));
   setError(error.message);return false;
  }
  return true;
 },[table]);

 const remove=useCallback(async(id:string)=>{
  if(!supabase||!id)return false;
  const before=rowsRef.current;
  setRows(v=>v.filter(r=>r.id!==id));
  const {error}=await supabase.from(table).delete().eq("id",id);
  if(error){setRows(before);setError(error.message);return false}
  return true;
 },[table]);

 const removeMany=useCallback(async(ids:string[])=>{
  if(!supabase||!ids.length)return false;
  const before=rowsRef.current,set=new Set(ids);
  setRows(v=>v.filter(r=>!set.has(r.id)));
  const {error}=await supabase.from(table).delete().in("id",ids);
  if(error){setRows(before);setError(error.message);return false}
  return true;
 },[table]);

 const patchLocal=useCallback((fn:(row:T)=>T|null)=>{
  setRows(v=>v.map(r=>fn(r)??r));
 },[]);

 const dismissError=useCallback(()=>setError(""),[]);

 return useMemo(()=>({rows,byId,loading,error,dismissError,refetch,insert,update,updateMany,remove,removeMany,patchLocal}),
  [rows,byId,loading,error,dismissError,refetch,insert,update,updateMany,remove,removeMany,patchLocal]);
}
