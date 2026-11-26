// Cross-links from the core records into the workspace library: which paper a read is,
// which resume went out with an application, and which paper a clipping was taken from.
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";

export interface LinkOption{id:string;title:string}
export interface PaperKey{id:string;title:string;doi:string|null;pmid:string|null}
interface Library{papers:PaperKey[];resumes:LinkOption[]}

/** A DOI as compared across tables: lower case, without a doi.org address or "doi:" in front. */
export const normDoi=(value:unknown)=>String(value??"").trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//,"").replace(/^doi:\s*/,"");
export const normPmid=(value:unknown)=>String(value??"").trim().toLowerCase().replace(/^pmid:?\s*/,"");
/** Whether two records name the same article: the same DOI, or the same PubMed id. */
export const sameArticle=(a:{doi?:unknown;pmid?:unknown},b:{doi?:unknown;pmid?:unknown})=>
 Boolean((normDoi(a.doi)&&normDoi(a.doi)===normDoi(b.doi))||(normPmid(a.pmid)&&normPmid(a.pmid)===normPmid(b.pmid)));

let library:Library={papers:[],resumes:[]};
let loadedAt=0;
let loading:Promise<void>|null=null;
const listeners=new Set<()=>void>();

/** Reload the paper and resume lists (shared by every open picker and link). */
export function refreshLibrary():Promise<void>{
 if(!supabase)return Promise.resolve();
 const client=supabase;
 loading??=(async()=>{
  try{
   const [papers,resumes]=await Promise.all([
    client.from("ws_papers").select("id,title,doi,pmid").order("title").limit(5000),
    client.from("ws_resumes").select("id,title").order("title"),
   ]);
   library={papers:papers.error?library.papers:papers.data as PaperKey[],resumes:resumes.error?library.resumes:resumes.data as LinkOption[]};
   loadedAt=Date.now();
   listeners.forEach(fn=>fn());
  }finally{loading=null}
 })();
 return loading;
}

const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
const snapshot=()=>library;

/** Papers and resumes to link to. Loaded once, refreshed when stale and after any workspace save. */
export function useLibrary():Library{
 const value=useSyncExternalStore(subscribe,snapshot);
 useEffect(()=>{
  if(Date.now()-loadedAt>30_000)void refreshLibrary();
  const onChange=()=>void refreshLibrary();
  window.addEventListener("ws:changed",onChange);
  return()=>window.removeEventListener("ws:changed",onChange);
 },[]);
 return value;
}
