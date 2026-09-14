import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption{
 value:string;
 label:string;
 disabled?:boolean;
}

/** Theme-owned replacement for native selects. Native option popups inherit
 * browser/OS colours inconsistently; this menu uses the dashboard tokens in
 * light, dark and system themes. */
export function SelectMenu({value,options,onChange,label,id,className="input",disabled=false}: {
 value:string;
 options:readonly SelectOption[];
 onChange(value:string):void;
 label:string;
 id?:string;
 className?:string;
 disabled?:boolean;
}){
 const [open,setOpen]=useState(false);
 const [position,setPosition]=useState({left:0,top:0,width:180,maxHeight:280,above:false});
 const trigger=useRef<HTMLButtonElement>(null);
 const menu=useRef<HTMLDivElement>(null);
 const selected=options.find(option=>option.value===value);
 const shown=selected?.label??value??"—";

 const place=()=>{
  const rect=trigger.current?.getBoundingClientRect();
  if(!rect)return;
  const gap=5,margin=8;
  const below=window.innerHeight-rect.bottom-gap-margin;
  const above=rect.top-gap-margin;
  const useAbove=below<180&&above>below;
  const maxHeight=Math.max(120,Math.min(320,useAbove?above:below));
  const width=Math.max(180,rect.width);
  const left=Math.min(Math.max(margin,rect.left),Math.max(margin,window.innerWidth-width-margin));
  setPosition({left,top:useAbove?rect.top-gap:rect.bottom+gap,width,maxHeight,above:useAbove});
 };

 useLayoutEffect(()=>{if(open)place()},[open,options.length]);
 useEffect(()=>{
  if(!open)return;
  const close=(event:MouseEvent)=>{
   const target=event.target as Node;
   if(!trigger.current?.contains(target)&&!menu.current?.contains(target))setOpen(false);
  };
  const key=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();setOpen(false);trigger.current?.focus()}
  };
  const reposition=()=>place();
  document.addEventListener("mousedown",close);
  document.addEventListener("keydown",key);
  window.addEventListener("resize",reposition);
  window.addEventListener("scroll",reposition,true);
  requestAnimationFrame(()=>{
   const current=menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
   (current??menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  });
  return()=>{
   document.removeEventListener("mousedown",close);
   document.removeEventListener("keydown",key);
   window.removeEventListener("resize",reposition);
   window.removeEventListener("scroll",reposition,true);
  };
 },[open]);

 const choose=(next:string)=>{onChange(next);setOpen(false);requestAnimationFrame(()=>trigger.current?.focus())};
 const moveFocus=(event:import("react").KeyboardEvent<HTMLDivElement>,delta:number)=>{
  const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")??[]);
  const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(buttons.length){event.preventDefault();buttons[(at+delta+buttons.length)%buttons.length].focus()}
 };

 return <>
  <button ref={trigger} id={id} type="button" className={`${className} select-trigger`} disabled={disabled}
   aria-label={label} aria-haspopup="listbox" aria-expanded={open}
   onClick={event=>{event.stopPropagation();setOpen(current=>!current)}}
   onKeyDown={event=>{
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOpen(true)}
   }}>
   <span>{shown}</span><ChevronDown/>
  </button>
  {open&&createPortal(<div ref={menu} className="select-menu" role="listbox" aria-label={label}
   style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight,
    transform:position.above?"translateY(-100%)":undefined}}
   onKeyDown={event=>{
    if(event.key==="ArrowDown")moveFocus(event,1);
    else if(event.key==="ArrowUp")moveFocus(event,-1);
    else if(event.key==="Home"){event.preventDefault();menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()}
    else if(event.key==="End"){event.preventDefault();const b=menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");b?.[b.length-1]?.focus()}
   }}>
   {options.map(option=><button type="button" role="option" aria-selected={option.value===value}
    className="select-option" key={option.value} disabled={option.disabled}
    onClick={()=>choose(option.value)}><span>{option.label}</span>{option.value===value&&<Check/>}</button>)}
  </div>,document.body)}
 </>;
}
