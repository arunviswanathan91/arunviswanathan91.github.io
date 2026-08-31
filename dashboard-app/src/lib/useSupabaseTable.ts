import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useSupabaseTable<Row extends {id:string}>(table:string, select:string, orderBy:string, ascending=false){
 const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[notice,setNotice]=useState("");
 useEffect(()=>{let active=true;const load=async()=>{if(!supabase){setLoading(false);return}const {data,error}=await supabase.from(table).select(select).order(orderBy,{ascending});if(!active)return;if(error)setNotice(error.message);else setRows((data??[]) as unknown as Row[]);setLoading(false)};void load();return()=>{active=false}},[]);
 const insertRow=async(values:Record<string,unknown>,returning=select)=>{if(!supabase)return null;const {data,error}=await supabase.from(table).insert(values).select(returning).single();if(error){setNotice(error.message);return null}setRows(v=>[data as unknown as Row,...v]);return data as unknown as Row};
 const updateRow=async(id:string,values:Record<string,unknown>)=>{if(!supabase)return;const previous=rows;setRows(v=>v.map(r=>r.id===id?{...r,...values} as Row:r));const {error}=await supabase.from(table).update(values).eq("id",id);if(error){setRows(previous);setNotice(error.message)}};
 const deleteRow=async(id:string)=>{if(!supabase)return;const previous=rows;setRows(v=>v.filter(r=>r.id!==id));const {error}=await supabase.from(table).delete().eq("id",id);if(error){setRows(previous);setNotice(error.message)}};
 return {rows,setRows,loading,notice,setNotice,insertRow,updateRow,deleteRow};
}
