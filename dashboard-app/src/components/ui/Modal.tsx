import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Native <dialog>: focus trap, Esc handling and background inertness come for free. */
type ModalSlot=ReactNode|((close:()=>void)=>ReactNode);

export function Modal({kicker,title,onClose,children,footer,size="md"}:{
 kicker?:string;title:string;onClose():void;children:ModalSlot;footer?:ModalSlot;size?:"md"|"lg";
}){
 const ref=useRef<HTMLDialogElement>(null);
 const timer=useRef<number|null>(null);
 const [closing,setClosing]=useState(false);
 useEffect(()=>{const d=ref.current;if(d&&!d.open)d.showModal();return()=>{if(timer.current)window.clearTimeout(timer.current)}},[]);
 const close=()=>{
  if(closing)return;
  setClosing(true);
  timer.current=window.setTimeout(onClose,140);
 };
 return <dialog ref={ref} className={"modal modal-"+size+(closing?" is-closing":"")}
  onCancel={e=>{e.preventDefault();close()}}>
  <form method="dialog" className="modal-inner" onSubmit={e=>e.preventDefault()}>
   <header className="modal-head">
    <div>{kicker&&<p className="kicker">{kicker}</p>}<h2>{title}</h2></div>
    <button type="button" className="icon-button" onClick={close} aria-label="Close"><X/></button>
   </header>
   <div className="modal-body">{typeof children==="function"?children(close):children}</div>
   {footer&&<div className="modal-actions">{typeof footer==="function"?footer(close):footer}</div>}
  </form>
 </dialog>;
}
