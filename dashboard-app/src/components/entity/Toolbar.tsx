import { useEffect, useState } from "react";
import { ArrowUpDown, Columns3, LayoutGrid, Plus, RefreshCw, Search, SlidersHorizontal, Table2, X } from "lucide-react";
import { Popover } from "../ui/Popover";
import { activeFilterCount, clearFilters, DATE_BUCKETS } from "../../lib/query";
import { useUi } from "../../lib/store";
import type { DateBucket, Query } from "../../lib/query";
import type { EntityDef, FieldDef, Layout } from "../../entities/types";
import type { Tag } from "../../lib/tags";

export function Toolbar({def,query,shown,total,tags,onChange,onNew,onRefresh}:{
 def:EntityDef;query:Query;shown:number;total:number;tags:Tag[];
 onChange(patch:Partial<Query>):void;onNew():void;onRefresh():void;
}){
 const {searchRef}=useUi();
 const [term,setTerm]=useState(query.q);
 useEffect(()=>{setTerm(query.q)},[def.key]);
 useEffect(()=>{const t=setTimeout(()=>{if(term!==query.q)onChange({q:term})},150);return()=>clearTimeout(t)},[term]);

 const filterable=def.fields.filter(f=>f.filter);
 const sortable=def.fields.filter(f=>f.sort);
 const columns=def.fields.filter(f=>f.table);
 const filters=activeFilterCount(query);

 const toggleEnum=(key:string,value:string)=>{
  const cur=query.enums[key]??[];
  onChange({enums:{...query.enums,[key]:cur.includes(value)?cur.filter(v=>v!==value):[...cur,value]}});
 };

 return <div className="toolbar">
  <div className="toolbar-main">
   <label className="search">
    <Search/>
    <input ref={searchRef} value={term} placeholder={`Search ${def.plural.toLowerCase()}`}
     aria-label={`Search ${def.plural}`} onChange={e=>setTerm(e.target.value)}/>
    {term&&<button className="icon-button" onClick={()=>setTerm("")} aria-label="Clear search"><X/></button>}
   </label>

   {filterable.length>0&&<Popover label="Filter" icon={<SlidersHorizontal/>} badge={filters}>
    {()=><div className="pop-body">
     {filterable.map(f=><section key={f.key} className="pop-section">
      <p className="pop-label">{f.label}</p>
      {f.kind==="enum"&&<div className="pop-options">
       {f.options.map(o=><label key={o} className="check-label">
        <input type="checkbox" checked={(query.enums[f.key]??[]).includes(o)} onChange={()=>toggleEnum(f.key,o)}/>
        <span>{o}</span></label>)}
      </div>}
      {f.kind==="date"&&<select className="input input-compact" value={query.dates[f.key]??"any"}
       onChange={e=>onChange({dates:{...query.dates,[f.key]:e.target.value as DateBucket}})}>
       {DATE_BUCKETS.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}
      </select>}
      {f.kind==="bool"&&<div className="pop-options">
       <label className="check-label">
        <input type="checkbox" checked={query.bools[f.key]===true} onChange={e=>{
         const next={...query.bools};if(e.target.checked)next[f.key]=true;else delete next[f.key];onChange({bools:next})}}/>
        <span>{f.trueLabel??f.label}</span></label>
       <label className="check-label">
        <input type="checkbox" checked={query.bools[f.key]===false} onChange={e=>{
         const next={...query.bools};if(e.target.checked)next[f.key]=false;else delete next[f.key];onChange({bools:next})}}/>
        <span>Not {(f.trueLabel??f.label).toLowerCase()}</span></label>
      </div>}
      {f.kind==="tags"&&<div className="tag-chips">
       {tags.map(t=><button key={t.id} type="button" aria-pressed={query.tagIds.includes(t.id)}
        className={"tag-chip tint-"+(t.color??"slate")+(query.tagIds.includes(t.id)?" selected":"")}
        onClick={()=>onChange({tagIds:query.tagIds.includes(t.id)?query.tagIds.filter(x=>x!==t.id):[...query.tagIds,t.id]})}>
        {t.name}</button>)}
       {!tags.length&&<span className="muted-note">No tags yet</span>}
      </div>}
     </section>)}
     {filters>0&&<button className="secondary full" onClick={()=>onChange(clearFilters(query))}>Clear filters</button>}
    </div>}
   </Popover>}

   {sortable.length>0&&<Popover label="Sort" icon={<ArrowUpDown/>}>
    {close=><div className="pop-body">
     <div className="pop-options">
      {sortable.map(f=><button key={f.key} className={"pop-item"+(query.sort.key===f.key?" active":"")}
       onClick={()=>{onChange({sort:{key:f.key,dir:query.sort.key===f.key&&query.sort.dir==="asc"?"desc":"asc"}});close()}}>
       {f.label}{query.sort.key===f.key&&<small>{query.sort.dir==="asc"?"ascending":"descending"}</small>}
      </button>)}
     </div>
    </div>}
   </Popover>}

   {query.layout==="table"&&columns.length>0&&<Popover label="Columns" icon={<Columns3/>}>
    {()=><div className="pop-body"><div className="pop-options">
     {columns.map(f=><label key={f.key} className="check-label">
      <input type="checkbox" checked={!query.hidden.includes(f.key)}
       onChange={()=>onChange({hidden:query.hidden.includes(f.key)?query.hidden.filter(k=>k!==f.key):[...query.hidden,f.key]})}/>
      <span>{f.label}</span></label>)}
    </div></div>}
   </Popover>}
  </div>

  <div className="toolbar-end">
   <span className="count-note">{shown===total?`${total}`:`${shown} of ${total}`}</span>
   <button className="icon-button" onClick={onRefresh} aria-label="Refresh"><RefreshCw/></button>
   {def.layouts.length>1&&<div className="seg" role="group" aria-label="Layout">
    {def.layouts.map(l=><button key={l} className={query.layout===l?"active":""} aria-pressed={query.layout===l}
     onClick={()=>onChange({layout:l as Layout})} aria-label={l==="board"?"Board view":"Table view"}
     title={l==="board"?"Board":"Table"}>{l==="board"?<LayoutGrid/>:<Table2/>}</button>)}
   </div>}
   <button className="primary" onClick={onNew}><Plus/>New</button>
  </div>
 </div>;
}
