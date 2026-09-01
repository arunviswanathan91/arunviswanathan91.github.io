import { useEffect } from "react";

const isTyping=(t:EventTarget|null)=>{
 const el=t as HTMLElement|null;
 if(!el?.tagName)return false;
 return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable;
};

/** Global shortcuts. Typing in a field suppresses everything except Escape and Ctrl/Cmd-K. */
export function useHotkeys(map:Record<string,(e:KeyboardEvent)=>void>){
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const combo=(e.ctrlKey||e.metaKey?"mod+":"")+e.key.toLowerCase();
   const always=combo==="mod+k"||e.key==="Escape";
   if(!always&&isTyping(e.target))return;
   const handler=map[combo]??map[e.key];
   if(handler){e.preventDefault();handler(e)}
  };
  document.addEventListener("keydown",onKey);
  return()=>document.removeEventListener("keydown",onKey);
 },[map]);
}
