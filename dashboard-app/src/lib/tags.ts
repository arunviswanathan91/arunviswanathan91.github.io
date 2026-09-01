import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { TagEntity } from "../entities/types";

export interface Tag{id:string;name:string;color:string|null}
type LinkRow={tag_id:string;entity_type:TagEntity;entity_id:string};

export const TAG_COLORS=["slate","amber","blue","violet","green","red","pink","teal"] as const;
export type TagColor=typeof TAG_COLORS[number];

const keyOf=(entity:TagEntity,id:string)=>entity+":"+id;
const byName=(a:Tag,b:Tag)=>a.name.localeCompare(b.name);

export interface TagStore{
 tags:Tag[];
 byId:Map<string,Tag>;
 idsFor(entity:TagEntity,id:string):string[];
 usage:Map<string,number>;
 loading:boolean;
 error:string;
 dismissError():void;
 create(name:string,color?:string|null):Promise<Tag|null>;
 rename(id:string,name:string):Promise<boolean>;
 recolor(id:string,color:string|null):Promise<boolean>;
 destroy(id:string):Promise<boolean>;
 setFor(entity:TagEntity,id:string,tagIds:string[]):Promise<boolean>;
 addTo(entity:TagEntity,ids:string[],tagIds:string[]):Promise<boolean>;
 removeFrom(entity:TagEntity,ids:string[],tagIds:string[]):Promise<boolean>;
}

export function useTags(userId:string):TagStore{
 const [tags,setTags]=useState<Tag[]>([]),[links,setLinks]=useState<LinkRow[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const linksRef=useRef<LinkRow[]>([]);linksRef.current=links;

 useEffect(()=>{
  let alive=true;
  if(!supabase){setLoading(false);return}
  void(async()=>{
   const [t,l]=await Promise.all([
    supabase!.from("tags").select("id,name,color").order("name"),
    supabase!.from("item_tags").select("tag_id,entity_type,entity_id"),
   ]);
   if(!alive)return;
   if(t.error)setError(t.error.message); else setTags((t.data??[]) as unknown as Tag[]);
   if(l.error)setError(l.error.message); else setLinks((l.data??[]) as unknown as LinkRow[]);
   setLoading(false);
  })();
  return()=>{alive=false};
 },[]);

 // Index once per link change: O(1) lookups instead of a filter per item per render,
 // and a stable identity so consumers' useMemo actually holds.
 const index=useMemo(()=>{
  const m=new Map<string,string[]>();
  for(const l of links){const k=keyOf(l.entity_type,l.entity_id),cur=m.get(k);if(cur)cur.push(l.tag_id);else m.set(k,[l.tag_id])}
  return m;
 },[links]);

 const byId=useMemo(()=>new Map(tags.map(t=>[t.id,t])),[tags]);
 const usage=useMemo(()=>{const m=new Map<string,number>();for(const l of links)m.set(l.tag_id,(m.get(l.tag_id)??0)+1);return m},[links]);
 const idsFor=useCallback((entity:TagEntity,id:string)=>index.get(keyOf(entity,id))??[],[index]);

 const create=useCallback(async(name:string,color:string|null=null)=>{
  if(!supabase)return null;
  const {data,error}=await supabase.from("tags").insert({user_id:userId,name,color}).select("id,name,color").single();
  if(error){setError(error.message);return null}
  const tag=data as unknown as Tag;
  setTags(v=>[...v,tag].sort(byName));
  return tag;
 },[userId]);

 const rename=useCallback(async(id:string,name:string)=>{
  if(!supabase)return false;
  const before=tags;
  setTags(v=>v.map(t=>t.id===id?{...t,name}:t).sort(byName));
  const {error}=await supabase.from("tags").update({name}).eq("id",id);
  if(error){setTags(before);setError(error.message);return false}
  return true;
 },[tags]);

 const recolor=useCallback(async(id:string,color:string|null)=>{
  if(!supabase)return false;
  const before=tags;
  setTags(v=>v.map(t=>t.id===id?{...t,color}:t));
  const {error}=await supabase.from("tags").update({color}).eq("id",id);
  if(error){setTags(before);setError(error.message);return false}
  return true;
 },[tags]);

 const destroy=useCallback(async(id:string)=>{
  if(!supabase)return false;
  const beforeTags=tags,beforeLinks=linksRef.current;
  setTags(v=>v.filter(t=>t.id!==id));
  setLinks(v=>v.filter(l=>l.tag_id!==id));      // DB cascades; mirror it locally
  const {error}=await supabase.from("tags").delete().eq("id",id);
  if(error){setTags(beforeTags);setLinks(beforeLinks);setError(error.message);return false}
  return true;
 },[tags]);

 /** Insert the added links first, delete the removed ones second. A failure therefore
  *  leaves the database in its previous state rather than an empty one. */
 const setFor=useCallback(async(entity:TagEntity,id:string,next:string[])=>{
  if(!supabase)return false;
  const current=linksRef.current.filter(l=>l.entity_type===entity&&l.entity_id===id).map(l=>l.tag_id);
  const add=next.filter(t=>!current.includes(t)),del=current.filter(t=>!next.includes(t));
  if(!add.length&&!del.length)return true;
  const before=linksRef.current;
  setLinks(v=>[...v.filter(l=>!(l.entity_type===entity&&l.entity_id===id)),...next.map(tag_id=>({tag_id,entity_type:entity,entity_id:id}))]);
  if(add.length){
   const {error}=await supabase.from("item_tags").upsert(add.map(tag_id=>({tag_id,entity_type:entity,entity_id:id})),{ignoreDuplicates:true});
   if(error){setLinks(before);setError(error.message);return false}
  }
  if(del.length){
   const {error}=await supabase.from("item_tags").delete().eq("entity_type",entity).eq("entity_id",id).in("tag_id",del);
   if(error){
    setLinks(before);
    if(add.length)await supabase.from("item_tags").delete().eq("entity_type",entity).eq("entity_id",id).in("tag_id",add);
    setError(error.message);return false;
   }
  }
  return true;
 },[]);

 const addTo=useCallback(async(entity:TagEntity,ids:string[],tagIds:string[])=>{
  if(!supabase||!ids.length||!tagIds.length)return false;
  const rows=ids.flatMap(entity_id=>tagIds.map(tag_id=>({tag_id,entity_type:entity,entity_id})));
  const before=linksRef.current;
  const existing=new Set(before.map(l=>l.tag_id+l.entity_type+l.entity_id));
  setLinks(v=>[...v,...rows.filter(r=>!existing.has(r.tag_id+r.entity_type+r.entity_id))]);
  const {error}=await supabase.from("item_tags").upsert(rows,{ignoreDuplicates:true});
  if(error){setLinks(before);setError(error.message);return false}
  return true;
 },[]);

 const removeFrom=useCallback(async(entity:TagEntity,ids:string[],tagIds:string[])=>{
  if(!supabase||!ids.length||!tagIds.length)return false;
  const before=linksRef.current,idSet=new Set(ids),tagSet=new Set(tagIds);
  setLinks(v=>v.filter(l=>!(l.entity_type===entity&&idSet.has(l.entity_id)&&tagSet.has(l.tag_id))));
  const {error}=await supabase.from("item_tags").delete().eq("entity_type",entity).in("entity_id",ids).in("tag_id",tagIds);
  if(error){setLinks(before);setError(error.message);return false}
  return true;
 },[]);

 const dismissError=useCallback(()=>setError(""),[]);

 return useMemo(()=>({tags,byId,idsFor,usage,loading,error,dismissError,create,rename,recolor,destroy,setFor,addTo,removeFrom}),
  [tags,byId,idsFor,usage,loading,error,dismissError,create,rename,recolor,destroy,setFor,addTo,removeFrom]);
}
