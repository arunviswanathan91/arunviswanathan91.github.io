import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type EntityType = "job_application" | "reminder" | "read";
type ItemTagRow = { tag_id:string; entity_type:EntityType; entity_id:string };

export function useItemTags(){
 const [rows,setRows]=useState<ItemTagRow[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;const load=async()=>{if(!supabase){setLoading(false);return}const {data,error}=await supabase.from("item_tags").select("tag_id,entity_type,entity_id");if(!active)return;if(!error)setRows((data??[]) as ItemTagRow[]);setLoading(false)};void load();return()=>{active=false}},[]);
 const tagIdsFor=(type:EntityType,id:string)=>rows.filter(r=>r.entity_type===type&&r.entity_id===id).map(r=>r.tag_id);
 const setTagsFor=async(type:EntityType,id:string,tagIds:string[])=>{
  if(!supabase)return;
  const previous=rows;
  setRows(v=>[...v.filter(r=>!(r.entity_type===type&&r.entity_id===id)),...tagIds.map(tag_id=>({tag_id,entity_type:type,entity_id:id}))]);
  await supabase.from("item_tags").delete().eq("entity_type",type).eq("entity_id",id);
  if(tagIds.length){const {error}=await supabase.from("item_tags").insert(tagIds.map(tag_id=>({tag_id,entity_type:type,entity_id:id})));if(error)setRows(previous)}
 };
 return {loading,tagIdsFor,setTagsFor};
}
