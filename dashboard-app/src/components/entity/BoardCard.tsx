import { GripVertical } from "lucide-react";
import { FieldValue } from "./FieldValue";
import type { ValueCtx } from "./FieldValue";
import type { EntityDef, Row } from "../../entities/types";

export const CARD_MIME="application/x-dash-card";

/** Slots fields onto the card by their `card` value — no entity-specific branches. */
export function BoardCard({def,row,ctx,selected,selecting,onToggle,onOpen}:{
 def:EntityDef;row:Row;ctx:ValueCtx;selected:boolean;selecting:boolean;
 onToggle():void;onOpen():void;
}){
 const slot=(name:string)=>def.fields.filter(f=>f.card===name);
 const cell=(f:any)=><FieldValue key={f.key} field={f} row={row} ctx={ctx} mode="card"/>;
 // Falls through the searchable fields, so a Read with no title still shows its URL.
 const title=def.searchFields.map(k=>String(row[k]??"").trim()).find(Boolean)||`Untitled ${def.singular}`;

 return <article className={"card-item"+(selected?" selected":"")} draggable
  onDragStart={e=>{e.dataTransfer.setData(CARD_MIME,row.id);e.dataTransfer.effectAllowed="move"}}
  onClick={e=>{if((e.target as HTMLElement).closest("a,button,select,input,label"))return;onOpen()}}
  onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();onOpen()}if(e.key==="x"){e.preventDefault();onToggle()}}}
  tabIndex={0} aria-label={title}>
  {/* Deliberately not role="button": the card contains its own checkbox, links and
      selects, and nesting interactive elements inside a button role is invalid. */}
  <div className="card-top">
   <label className={"card-check"+(selecting||selected?" shown":"")} onClick={e=>e.stopPropagation()}>
    <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${title}`}/>
   </label>
   <div className="card-accent">{slot("accent").map(cell)}</div>
   <h3 className="card-title clamp-2">{title}</h3>
   <span className="card-grip" aria-hidden="true"><GripVertical/></span>
  </div>
  {slot("subtitle").length>0&&<p className="card-sub clamp-2">{slot("subtitle").map(cell)}</p>}
  {slot("meta").length>0&&<div className="card-meta">{slot("meta").map(cell)}</div>}
  <footer className="card-foot">
   <div className="card-foot-left">{slot("footer").map(cell)}</div>
   <div className="card-foot-right">{slot("badge").map(cell)}</div>
  </footer>
 </article>;
}
