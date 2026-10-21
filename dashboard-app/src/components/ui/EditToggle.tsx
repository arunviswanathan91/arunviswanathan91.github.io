import { Check, Pencil } from "lucide-react";
export function EditToggle({editing,onChange,label}:{editing:boolean;onChange(value:boolean):void;label:string}){
 return <button type="button" className="secondary" title={editing?"Changes save automatically; return to summary":"Open editing controls"} aria-label={`${editing?"Done editing":"Edit"} ${label}`} aria-expanded={editing} onClick={()=>onChange(!editing)}>
  {editing?<Check/>:<Pencil/>}{editing?"Done":"Edit"}
 </button>;
}
