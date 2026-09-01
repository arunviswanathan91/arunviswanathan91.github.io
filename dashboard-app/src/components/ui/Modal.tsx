import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Native <dialog>: focus trap, Esc handling and background inertness come for free. */
export function Modal({kicker,title,onClose,children,footer,size="md"}:{
 kicker?:string;title:string;onClose():void;children:ReactNode;footer?:ReactNode;size?:"md"|"lg";
}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;if(d&&!d.open)d.showModal()},[]);
 return <dialog ref={ref} className={"modal modal-"+size}
  onCancel={e=>{e.preventDefault();onClose()}}
  onMouseDown={e=>{if(e.target===ref.current)onClose()}}>
  <form method="dialog" className="modal-inner" onSubmit={e=>e.preventDefault()}>
   <header className="modal-head">
    <div>{kicker&&<p className="kicker">{kicker}</p>}<h2>{title}</h2></div>
    <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X/></button>
   </header>
   <div className="modal-body">{children}</div>
   {footer&&<div className="modal-actions">{footer}</div>}
  </form>
 </dialog>;
}
