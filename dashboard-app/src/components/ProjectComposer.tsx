import { useState } from "react";
import { Modal } from "./ui/Modal";
import { TAG_COLORS } from "../lib/tags";

export function ProjectComposer({onClose,onCreate}:{
 onClose():void;onCreate(values:{name:string;description:string|null;color:string|null}):void;
}){
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[color,setColor]=useState("slate");
 const submit=()=>{const n=name.trim();if(!n)return;onCreate({name:n,description:description.trim()||null,color})};
 return <Modal kicker="Projects" title="New project" onClose={onClose}
  footer={<>
   <button type="button" className="secondary" onClick={onClose}>Cancel</button>
   <button type="button" className="primary" onClick={submit} disabled={!name.trim()}>Create</button>
  </>}>
  <div className="field-grid">
   <div className="field field-wide">
    <label className="field-label" htmlFor="p-name">Name<span className="req" aria-hidden="true">*</span></label>
    <input id="p-name" className="input" autoFocus value={name} placeholder="Project name"
     onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit()}}/>
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
