import { useState } from "react";
import { X } from "lucide-react";

export function TaskComposer({boardName,onClose,onAdd}:{boardName:string;onClose:()=>void;onAdd:(title:string)=>void}){
 const [title,setTitle]=useState("");
 const submit=()=>{const t=title.trim();if(!t)return;onAdd(t)};
 return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}>
  <button className="close" onClick={onClose}><X/></button>
  <p className="kicker">{boardName}</p><h2>Add to task board</h2>
  <input autoFocus value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="What needs doing?"/>
  <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>Add task</button></div>
 </section></div>
}
