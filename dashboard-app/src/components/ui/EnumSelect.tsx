import { useId } from "react";
import type { Tone } from "../../entities/types";

/** Inline enum editor used by table cells, board card footers and the drawer. This is the
 *  keyboard/touch path for changing a stage — dragging is no longer the only way. */
export function EnumSelect({value,options,onChange,tone="dim",free,label,compact}:{
 value:string;options:readonly string[];onChange(v:string):void;
 tone?:Tone;free?:boolean;label:string;compact?:boolean;
}){
 const listId=useId();
 if(free)return <>
  <input className={"input"+(compact?" input-compact":"")} list={listId} value={value??""} aria-label={label}
   onChange={e=>onChange(e.target.value)}/>
  <datalist id={listId}>{options.map(o=><option key={o} value={o}/>)}</datalist>
 </>;
 return <select className={compact?"badge badge-select tone-"+tone:"input"} value={value??""} aria-label={label}
  onClick={e=>e.stopPropagation()} onChange={e=>onChange(e.target.value)}>
  {!options.includes(value)&&<option value={value??""}>{value||"—"}</option>}
  {options.map(o=><option key={o} value={o}>{o}</option>)}
 </select>;
}
