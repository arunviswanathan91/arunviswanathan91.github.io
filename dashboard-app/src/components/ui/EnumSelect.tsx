import type { Tone } from "../../entities/types";
import { SelectMenu } from "./SelectMenu";

/** Inline enum editor used by table cells, board card footers and the drawer. This is the
 *  keyboard/touch path for changing a stage — dragging is no longer the only way. */
export function EnumSelect({value,options,onChange,tone="dim",free,label,compact,disabled=false}:{
 value:string;options:readonly string[];onChange(v:string):void;
 tone?:Tone;free?:boolean;label:string;compact?:boolean;disabled?:boolean;
}){
 if(free)return <div className="free-select">
  <input className={"input"+(compact?" input-compact":"")} value={value??""} aria-label={label} disabled={disabled}
   onChange={e=>onChange(e.target.value)}/>
  <SelectMenu className="free-select-button" value={options.includes(value)?value:""} label={`${label} suggestions`} disabled={disabled}
   options={options.map(option=>({value:option,label:option}))} onChange={onChange}/>
 </div>;
 const values=options.includes(value)?options:[value,...options];
 return <SelectMenu className={compact?"badge badge-select tone-"+tone:"input"} value={value??""} label={label} disabled={disabled}
  options={values.map(option=>({value:option,label:option||"—"}))} onChange={onChange}/>;
}
