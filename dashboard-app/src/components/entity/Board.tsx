import { Plus } from "lucide-react";
import { groupValue } from "../../entities/types";
import { BoardCard, CARD_MIME } from "./BoardCard";
import type { ValueCtx } from "./FieldValue";
import type { EntityDef, FieldDef, Row } from "../../entities/types";

export function Board({def,groupField,rows,ctx,selection,selecting,onToggle,onOpen,onMove,onAdd}:{
 def:EntityDef;groupField:FieldDef;rows:Row[];ctx:ValueCtx;
 selection:string[];selecting:boolean;
 onToggle(id:string):void;onOpen(id:string):void;
 onMove(id:string,value:string):void;onAdd(value:string):void;
}){
 const derived=groupField.kind==="enum"&&!!groupField.derive;
 const options=groupField.kind==="enum"?groupField.options:[];
 const byId=new Map(rows.map(r=>[r.id,r]));

 return <div className="board">{options.map(value=>{
  const items=rows.filter(r=>groupValue(groupField,r)===value);
  return <section className="column" key={value}
   onDragOver={e=>{if(!derived&&e.dataTransfer.types.includes(CARD_MIME)){e.preventDefault();e.dataTransfer.dropEffect="move"}}}
   onDrop={e=>{
    if(derived)return;
    e.preventDefault();
    // Custom MIME + a membership check: stray files and foreign text can't reach the DB.
    const id=e.dataTransfer.getData(CARD_MIME);
    if(id&&byId.has(id))onMove(id,value);
   }}>
   <div className="column-head">
    <span className={"column-name tone-"+(groupField.kind==="enum"&&groupField.tone?groupField.tone(value):"dim")}>{value}</span>
    <b>{items.length}</b>
    {!derived&&<button className="icon-button column-add" onClick={()=>onAdd(value)} aria-label={`New ${def.singular} in ${value}`}><Plus/></button>}
   </div>
   <div className="column-body">
    {items.map(row=><BoardCard key={row.id} def={def} row={row} ctx={ctx}
     selected={selection.includes(row.id)} selecting={selecting}
     onToggle={()=>onToggle(row.id)} onOpen={()=>onOpen(row.id)}/>)}
    {!items.length&&<p className="column-empty">Nothing here</p>}
   </div>
  </section>;
 })}</div>;
}
