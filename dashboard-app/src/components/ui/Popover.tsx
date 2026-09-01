import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function Popover({label,icon,children,align="left",badge,title}:{
 label?:string;icon?:ReactNode;children:(close:()=>void)=>ReactNode;
 align?:"left"|"right";badge?:number;title?:string;
}){
 const [open,setOpen]=useState(false);
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const onDown=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.stopPropagation();setOpen(false)}};
  document.addEventListener("mousedown",onDown);document.addEventListener("keydown",onKey);
  return()=>{document.removeEventListener("mousedown",onDown);document.removeEventListener("keydown",onKey)};
 },[open]);
 return <div className="popover-wrap" ref={ref}>
  <button type="button" className={"chip-button"+(open?" open":"")} onClick={()=>setOpen(v=>!v)}
   aria-expanded={open} aria-haspopup="true" title={title}>
   {icon}{label&&<span>{label}</span>}{badge?<b className="chip-count">{badge}</b>:null}
  </button>
  {open&&<div className={"popover pop-"+align} role="dialog">{children(()=>setOpen(false))}</div>}
 </div>;
}
