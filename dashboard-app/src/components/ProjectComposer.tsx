import { useState } from "react";
import { X } from "lucide-react";

export function ProjectComposer({onClose,onAdd}:{onClose:()=>void;onAdd:(name:string)=>void}){
 const [name,setName]=useState("");
 const submit=()=>{const n=name.trim();if(!n)return;onAdd(n)};
 return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
  <button className="close" onClick={onClose}><X/></button>
  <p className="kicker">New board</p><h2>Create a project</h2>
  <input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Project name"/>
  <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>Create</button></div>
 </section></div>
}
