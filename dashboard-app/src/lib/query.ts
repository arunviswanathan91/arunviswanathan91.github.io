import { dayDelta, isOverdue } from "./format";
import { compareRows } from "./useTable";
import { fieldByKey, groupValue } from "../entities/types";
import type { EntityDef, Layout, Row, SortSpec, TagEntity } from "../entities/types";

export type DateBucket="any"|"overdue"|"today"|"week"|"month"|"none";
export const DATE_BUCKETS:{value:DateBucket;label:string}[]=[
 {value:"any",label:"Any time"},{value:"overdue",label:"Overdue"},{value:"today",label:"Today"},
 {value:"week",label:"Next 7 days"},{value:"month",label:"Next 30 days"},{value:"none",label:"No date"},
];

/** "all" = every project, null = Inbox (project_id is null), otherwise a project id. */
export type Scope="all"|null|string;

export interface Query{
 q:string;
 layout:Layout;
 sort:SortSpec;
 groupBy:string|null;
 enums:Record<string,string[]>;
 dates:Record<string,DateBucket>;
 bools:Record<string,boolean>;
 tagIds:string[];
 hidden:string[];
}

export const defaultQuery=(def:EntityDef):Query=>({
 q:"",layout:def.defaultLayout,sort:def.defaultSort,groupBy:def.groupBy,
 enums:{},dates:{},bools:{},tagIds:[],hidden:[],
});

export const activeFilterCount=(q:Query)=>
 Object.values(q.enums).filter(v=>v.length).length+
 Object.values(q.dates).filter(v=>v&&v!=="any").length+
 Object.keys(q.bools).length+(q.tagIds.length?1:0);

export const clearFilters=(q:Query):Query=>({...q,enums:{},dates:{},bools:{},tagIds:[]});

const matchesBucket=(iso:string|null,bucket:DateBucket)=>{
 if(bucket==="any")return true;
 if(bucket==="none")return !iso;
 if(!iso)return false;
 if(bucket==="overdue")return isOverdue(iso);
 const d=dayDelta(iso);
 if(isNaN(d))return false;
 if(bucket==="today")return d===0;
 if(bucket==="week")return d>=0&&d<=7;
 return d>=0&&d<=30;
};

export interface QueryCtx{scope:Scope;tagsFor:(entity:TagEntity,id:string)=>string[]}

export function applyQuery(def:EntityDef,rows:Row[],q:Query,ctx:QueryCtx):Row[]{
 const term=q.q.trim().toLowerCase();
 const out=rows.filter(row=>{
  if(def.projectField&&ctx.scope!=="all"&&(row[def.projectField]??null)!==ctx.scope)return false;
  for(const [key,values] of Object.entries(q.enums)){
   if(!values.length)continue;
   const f=fieldByKey(def,key);
   if(f&&!values.includes(groupValue(f,row)))return false;
  }
  for(const [key,bucket] of Object.entries(q.dates))
   if(bucket&&bucket!=="any"&&!matchesBucket(row[key]??null,bucket))return false;
  for(const [key,want] of Object.entries(q.bools))
   if(Boolean(row[key])!==want)return false;
  if(q.tagIds.length&&def.tagEntity){
   const owned=ctx.tagsFor(def.tagEntity,row.id);
   if(!q.tagIds.some(t=>owned.includes(t)))return false;
  }
  if(term&&!def.searchFields.some(k=>String(row[k]??"").toLowerCase().includes(term)))return false;
  return true;
 });
 return out.sort((a,b)=>compareRows(a,b,q.sort));
}
