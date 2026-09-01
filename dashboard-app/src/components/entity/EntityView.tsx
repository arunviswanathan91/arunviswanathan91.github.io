import { useEffect, useMemo, useState } from "react";
import { useData, useEntityTable, useUi } from "../../lib/store";
import { applyQuery } from "../../lib/query";
import { fieldByKey } from "../../entities/types";
import { Toolbar } from "./Toolbar";
import { Board } from "./Board";
import { Table } from "./Table";
import { BulkBar } from "./BulkBar";
import { Composer } from "./Composer";
import { Drawer } from "./Drawer";
import { useEntityCtx } from "./ctx";
import type { EntityDef, FieldDef, Row } from "../../entities/types";

export function EntityView({def}:{def:EntityDef}){
 const table=useEntityTable(def.key);
 const {tags,userId}=useData();
 const ui=useUi();
 const {valueCtx,inputCtx}=useEntityCtx(def);
 const [composer,setComposer]=useState<Record<string,unknown>|null>(null);

 const query=ui.queries[def.key];
 const scopeProjectId=ui.scope==="all"?null:ui.scope;
 const selection=ui.selection.entity===def.key?ui.selection.ids:[];

 const rows=useMemo(()=>applyQuery(def,table.rows,query,{
  scope:ui.scope,tagsFor:(e,id)=>tags.idsFor(e,id),
 }),[def,table.rows,query,ui.scope,tags]);

 const groupField=query.groupBy?fieldByKey(def,query.groupBy):null;
 const layout=query.layout==="board"&&groupField?"board":"table";
 const columns=def.fields.filter(f=>f.table&&!query.hidden.includes(f.key));

 const openDrawer=(id:string)=>ui.openDrawer(def.key,id);
 const toggle=(id:string)=>ui.toggleSelect(def.key,id);
 const toggleAll=()=>ui.setSelection(def.key,selection.length===rows.length?[]:rows.map(r=>r.id));

 const commit=(row:Row,field:FieldDef,value:any)=>{
  if(field.kind==="tags"){if(def.tagEntity)void tags.setFor(def.tagEntity,row.id,value as string[])}
  else void table.update(row.id,{[field.key]:value});
 };

 const startNew=(preset:Record<string,unknown>={})=>
  setComposer({...def.newDefaults({userId,projectId:scopeProjectId}),...preset});

 const submitNew=async(values:Record<string,unknown>,tagIds:string[])=>{
  const clean=Object.fromEntries(Object.entries(values).filter(([,v])=>v!==""&&v!==undefined));
  const row=await table.insert(clean);
  setComposer(null);
  if(!row)return;
  if(tagIds.length&&def.tagEntity)await tags.setFor(def.tagEntity,row.id,tagIds);
  openDrawer(row.id);                       // create-then-fill is one motion
 };

 const drawerRow=ui.drawer?.entity===def.key?table.byId.get(ui.drawer.id)??null:null;

 // "New <entity>" from the command palette and the global `n` shortcut land here.
 useEffect(()=>{
  const onNew=(e:Event)=>{if((e as CustomEvent).detail===def.key)startNew()};
  document.addEventListener("dash:new",onNew);
  return()=>document.removeEventListener("dash:new",onNew);
 });

 return <div className="entity-view">
  <div className="view-head">
   <div>
    <p className="kicker">{def.kicker}</p>
    <h1>{def.plural}</h1>
    <p className="subtitle">{def.subtitle}</p>
   </div>
  </div>

  <Toolbar def={def} query={query} shown={rows.length} total={table.rows.length} tags={tags.tags}
   onChange={patch=>ui.setQuery(def.key,patch)} onNew={()=>startNew()} onRefresh={()=>void table.refetch(true)}/>

  {!def.projectField&&ui.scope!=="all"&&
   <p className="scope-note">{def.plural} aren’t project-scoped — showing all of them.</p>}

  {rows.length===0
   ?<div className="empty-state">
     <def.icon/>
     <p>{table.rows.length?`No ${def.plural.toLowerCase()} match these filters.`:`No ${def.plural.toLowerCase()} yet.`}</p>
     <button className="primary" onClick={()=>startNew()}>New {def.singular}</button>
    </div>
   :layout==="board"&&groupField
    ?<Board def={def} groupField={groupField} rows={rows} ctx={valueCtx}
      selection={selection} selecting={selection.length>0}
      onToggle={toggle} onOpen={openDrawer}
      onMove={(id,value)=>void table.update(id,{[groupField.key]:value})}
      onAdd={value=>startNew({[groupField.key]:value})}/>
    :<Table def={def} columns={columns} rows={rows} ctx={valueCtx} inputCtx={inputCtx} sort={query.sort}
      selection={selection} onSort={key=>ui.setQuery(def.key,{sort:{key,dir:query.sort.key===key&&query.sort.dir==="asc"?"desc":"asc"}})}
      onToggle={toggle} onOpen={openDrawer} onCommit={commit} onToggleAll={toggleAll}/>}

  {selection.length>0&&<BulkBar def={def} ids={selection} onClear={ui.clearSelection}/>}
  {composer&&<Composer def={def} seed={composer} onClose={()=>setComposer(null)} onSubmit={submitNew}/>}
  {drawerRow&&<Drawer def={def} row={drawerRow} onClose={ui.closeDrawer}/>}
 </div>;
}
