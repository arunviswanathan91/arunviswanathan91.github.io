import { useEffect, useState } from "react";
import { fromInput, toInput } from "../../lib/format";
import { EnumSelect } from "../ui/EnumSelect";
import { TagEditor } from "../ui/TagChips";
import type { FieldDef } from "../../entities/types";
import type { Project } from "../../lib/store";
import type { Tag } from "../../lib/tags";

export interface InputCtx{
 projects:Project[];
 tags:Tag[];
 createTag(name:string):Promise<Tag|null>;
}

/** Editor for one field. Text-ish inputs keep local state and commit on blur/Enter so the
 *  drawer's autosave doesn't fire a write per keystroke; everything else commits at once. */
export function FieldInput({field,value,onCommit,ctx,compact,autoFocus}:{
 field:FieldDef;value:any;onCommit(v:any):void;ctx:InputCtx;compact?:boolean;autoFocus?:boolean;
}){
 const [draft,setDraft]=useState<string>(value??"");
 useEffect(()=>{setDraft(value??"")},[value,field.key]);
 const commitText=()=>{const next=draft.trim();if(next!==(value??""))onCommit(next===""?null:next)};
 const cls="input"+(compact?" input-compact":"");

 switch(field.kind){
  case "longtext":
   return <textarea className={cls} rows={field.rows??4} value={draft} placeholder={field.placeholder}
    aria-label={field.label} autoFocus={autoFocus}
    onChange={e=>setDraft(e.target.value)} onBlur={commitText}/>;
  case "enum":
   return <EnumSelect value={value??""} options={field.options} free={field.free} label={field.label}
    tone={field.tone?field.tone(value??""):"dim"} compact={compact} onChange={onCommit}/>;
  case "date":
   return <input className={cls} type={field.time?"datetime-local":"date"} aria-label={field.label}
    value={toInput(value??null,field.time)} autoFocus={autoFocus}
    onChange={e=>onCommit(fromInput(e.target.value,field.time))}/>;
  case "bool":
   return <label className="check-label">
    <input type="checkbox" checked={Boolean(value)} onChange={e=>onCommit(e.target.checked)}/>
    <span>{field.trueLabel??field.label}</span>
   </label>;
  case "project":
   return <select className={cls} value={value??""} aria-label={field.label}
    onClick={e=>e.stopPropagation()} onChange={e=>onCommit(e.target.value||null)}>
    <option value="">Inbox (no project)</option>
    {ctx.projects.filter(p=>p.status==="Active"||p.id===value).map(p=>
     <option key={p.id} value={p.id}>{p.name}{p.status==="Archived"?" (archived)":""}</option>)}
   </select>;
  case "tags":{
   const selected:string[]=Array.isArray(value)?value:[];
   return <TagEditor tags={ctx.tags} selected={selected} label={field.label}
    onToggle={id=>onCommit(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id])}
    onCreate={async name=>{const t=await ctx.createTag(name);if(t)onCommit([...selected,t.id])}}/>;
  }
  case "url":
   return <input className={cls} type="url" inputMode="url" value={draft} placeholder={field.placeholder??"https://…"}
    aria-label={field.label} autoFocus={autoFocus}
    onChange={e=>setDraft(e.target.value)} onBlur={commitText}
    onKeyDown={e=>{if(e.key==="Enter")(e.target as HTMLInputElement).blur()}}/>;
  case "stamp":
   return null;
  default:
   return <input className={cls} value={draft} placeholder={field.placeholder} aria-label={field.label} autoFocus={autoFocus}
    onChange={e=>setDraft(e.target.value)} onBlur={commitText}
    onKeyDown={e=>{if(e.key==="Enter")(e.target as HTMLInputElement).blur()}}/>;
 }
}
