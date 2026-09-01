import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Home, Plus, Search, Settings } from "lucide-react";
import { useData, useUi } from "../lib/store";
import { ENTITIES, ENTITY_ORDER } from "../entities";
import type { EntityKey } from "../entities/types";
import type { ViewKey } from "../lib/store";

interface Item{id:string;group:string;label:string;hint?:string;icon?:any;run():void}

export function CommandPalette(){
 const {tables}=useData();
 const ui=useUi();
 const [term,setTerm]=useState("");
 const [active,setActive]=useState(0);
 const inputRef=useRef<HTMLInputElement>(null);
 const dialogRef=useRef<HTMLDialogElement>(null);

 useEffect(()=>{
  const d=dialogRef.current;
  if(!d)return;
  if(ui.palette&&!d.open){d.showModal();setTerm("");setActive(0);inputRef.current?.focus()}
  if(!ui.palette&&d.open)d.close();
 },[ui.palette]);

 const items=useMemo(()=>{
  const out:Item[]=[];
  out.push({id:"go:home",group:"Go to",label:"Home",icon:Home,run:()=>ui.setView("home")});
  for(const key of ENTITY_ORDER){
   const def=ENTITIES[key];
   out.push({id:"go:"+key,group:"Go to",label:def.plural,icon:def.icon,run:()=>ui.setView(key as ViewKey)});
  }
  out.push({id:"go:settings",group:"Go to",label:"Settings",icon:Settings,run:()=>ui.setView("settings")});
  for(const key of ENTITY_ORDER){
   const def=ENTITIES[key];
   out.push({id:"new:"+key,group:"Create",label:`New ${def.singular}`,icon:Plus,
    run:()=>{ui.setView(key as ViewKey);requestAnimationFrame(()=>document.dispatchEvent(new CustomEvent("dash:new",{detail:key})))}});
  }
  const q=term.trim().toLowerCase();
  if(q){
   for(const key of ENTITY_ORDER){
    const def=ENTITIES[key];
    const hits=tables[key as EntityKey].rows.filter(r=>
     def.searchFields.some(f=>String(r[f]??"").toLowerCase().includes(q))).slice(0,5);
    for(const row of hits)
     out.push({id:`find:${key}:${row.id}`,group:def.plural,
      label:def.searchFields.map(f=>String(row[f]??"").trim()).find(Boolean)||`Untitled ${def.singular}`,
      hint:def.singular,icon:def.icon,
      run:()=>{ui.setView(key as ViewKey);ui.openDrawer(key as EntityKey,row.id)}});
   }
  }
  return out;
 },[term,tables,ui]);

 const filtered=useMemo(()=>{
  const q=term.trim().toLowerCase();
  if(!q)return items.filter(i=>i.group==="Go to"||i.group==="Create");
  return items.filter(i=>i.id.startsWith("find:")||i.label.toLowerCase().includes(q));
 },[items,term]);

 useEffect(()=>{setActive(0)},[term]);

 const choose=(item?:Item)=>{if(!item)return;item.run();ui.setPalette(false)};
 let lastGroup="";

 return <dialog ref={dialogRef} className="palette" onCancel={e=>{e.preventDefault();ui.setPalette(false)}}
  onMouseDown={e=>{if(e.target===dialogRef.current)ui.setPalette(false)}}>
  <div className="palette-inner">
   <label className="palette-search">
    <Search/>
    <input ref={inputRef} value={term} placeholder="Jump to, create, or find…" aria-label="Command palette"
     onChange={e=>setTerm(e.target.value)}
     onKeyDown={e=>{
      if(e.key==="ArrowDown"){e.preventDefault();setActive(a=>Math.min(a+1,filtered.length-1))}
      if(e.key==="ArrowUp"){e.preventDefault();setActive(a=>Math.max(a-1,0))}
      if(e.key==="Enter"){e.preventDefault();choose(filtered[active])}
     }}/>
   </label>
   <ul className="palette-list">
    {filtered.map((item,i)=>{
     const head=item.group!==lastGroup?item.group:null;lastGroup=item.group;
     return <li key={item.id}>
      {head&&<p className="palette-group">{head}</p>}
      <button className={"palette-item"+(i===active?" active":"")} onMouseEnter={()=>setActive(i)}
       onClick={()=>choose(item)}>
       {item.icon&&<item.icon/>}<span className="clamp-1">{item.label}</span>
       {item.hint&&<small>{item.hint}</small>}
       {i===active&&<CornerDownLeft className="palette-enter"/>}
      </button>
     </li>;
    })}
    {!filtered.length&&<li><p className="palette-empty">Nothing matches “{term}”.</p></li>}
   </ul>
  </div>
 </dialog>;
}
