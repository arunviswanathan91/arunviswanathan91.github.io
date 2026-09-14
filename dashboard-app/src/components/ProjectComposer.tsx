import { useState } from "react";
import { Modal } from "./ui/Modal";
import { TAG_COLORS } from "../lib/tags";

export function ProjectComposer({onClose,onCreate}:{
 onClose():void;onCreate(values:{name:string;description:string|null;color:string|null}):Promise<boolean>;
}){
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[color,setColor]=useState("slate");
 const [busy,setBusy]=useState(false);
 const submit=async(close:()=>void)=>{const n=name.trim();if(!n)return;setBusy(true);
  const saved=await onCreate({name:n,description:description.trim()||null,color});setBusy(false);if(saved)close()};
 return <Modal kicker="Projects" title="New project" onClose={onClose}
  footer={close=><>
   <button type="button" className="secondary" onClick={close}>Cancel</button>
   <button type="button" className="primary" onClick={()=>void submit(close)} disabled={busy||!name.trim()}>{busy?"Creating…":"Create"}</button>
  </>}>
  <div className="field-grid">
   <div className="field field-wide">
    <label className="field-label" htmlFor="p-name">Name<span className="req" aria-hidden="true">*</span></label>
    <input id="p-name" className="input" autoFocus value={name} placeholder="Project name"
     onChange={e=>setName(e.target.value)}/>
   </div>
   <div className="field field-wide">
    <label className="field-label" htmlFor="p-desc">Description</label>
    <textarea id="p-desc" className="input" rows={3} value={description}
     placeholder="What is this project for?" onChange={e=>setDescription(e.target.value)}/>
   </div>
   <div className="field">
    <label className="field-label" htmlFor="p-color">Colour</label>
    <select id="p-color" className="input" value={color} onChange={e=>setColor(e.target.value)}>
     {TAG_COLORS.map(c=><option key={c} value={c}>{c}</option>)}
    </select>
   </div>
  </div>
 </Modal>;
}
