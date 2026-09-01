import { ChevronDown, ChevronUp } from "lucide-react";
import { isEditable } from "../../entities/types";
import { FieldValue } from "./FieldValue";
import { FieldInput } from "./FieldInput";
import type { ValueCtx } from "./FieldValue";
import type { InputCtx } from "./FieldInput";
import type { EntityDef, FieldDef, Row, SortSpec } from "../../entities/types";

/** Enum/bool/project cells render their editor directly, so "inline editing" needs no edit mode. */
const INLINE=new Set(["enum","bool","project"]);

export function Table({def,columns,rows,ctx,inputCtx,sort,selection,onSort,onToggle,onOpen,onCommit,onToggleAll}:{
 def:EntityDef;columns:FieldDef[];rows:Row[];ctx:ValueCtx;inputCtx:InputCtx;sort:SortSpec;
 selection:string[];
 onSort(key:string):void;onToggle(id:string):void;onOpen(id:string):void;
 onCommit(row:Row,field:FieldDef,value:any):void;onToggleAll():void;
}){
 const allChecked=rows.length>0&&selection.length===rows.length;
 return <div className="table-card">
  <table>
   <thead><tr>
    <th className="col-check"><input type="checkbox" checked={allChecked} onChange={onToggleAll} aria-label="Select all"/></th>
    {columns.map(f=>{
     const active=sort.key===f.key;
     return <th key={f.key} style={{width:(f.table??1)*80}}
      aria-sort={active?(sort.dir==="asc"?"ascending":"descending"):"none"}>
      {f.sort?<button className="th-sort" onClick={()=>onSort(f.key)}>
       {f.label}{active&&(sort.dir==="asc"?<ChevronUp/>:<ChevronDown/>)}
      </button>:f.label}
     </th>;
    })}
   </tr></thead>
   <tbody>
    {rows.map(row=><tr key={row.id} className={selection.includes(row.id)?"selected":""}
     onClick={e=>{if((e.target as HTMLElement).closest("a,button,select,input,textarea,label"))return;onOpen(row.id)}}>
     <td className="col-check" onClick={e=>e.stopPropagation()}>
      <input type="checkbox" checked={selection.includes(row.id)} onChange={()=>onToggle(row.id)}
       aria-label={`Select ${String(row[def.titleField]??"row")}`}/>
     </td>
     {columns.map(f=><td key={f.key}>
      {INLINE.has(f.kind)&&isEditable(f)
       ?<FieldInput field={f} value={f.kind==="tags"?ctx.tagIds(row.id):row[f.key]} ctx={inputCtx} compact
         onCommit={v=>onCommit(row,f,v)}/>
       :<FieldValue field={f} row={row} ctx={ctx} mode="cell"/>}
     </td>)}
    </tr>)}
   </tbody>
  </table>
 </div>;
}
