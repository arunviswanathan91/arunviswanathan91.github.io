import { Check, ExternalLink, StickyNote } from "lucide-react";
import { formatDate, formatRelative, hostname, isOverdue } from "../../lib/format";
import { groupValue } from "../../entities/types";
import { Badge, Dot } from "../ui/Badge";
import { TagChips } from "../ui/TagChips";
import type { FieldDef, Row } from "../../entities/types";
import type { Tag } from "../../lib/tags";

export interface ValueCtx{
 projectName(id:string|null):string|null;
 projectColor(id:string|null):string|null;
 tagIds(id:string):string[];
 tagsById:Map<string,Tag>;
}

/** The only place a stored value is turned into display output. */
export function FieldValue({field,row,ctx,mode}:{field:FieldDef;row:Row;ctx:ValueCtx;mode:"card"|"cell"}){
 const raw=row[field.key];
 switch(field.kind){
  case "enum":{
   const v=groupValue(field,row);
   if(!v)return null;
   return <Badge text={v} tone={field.tone?field.tone(v):"dim"}/>;
  }
  case "date":{
   if(!raw)return mode==="cell"?<span className="muted-note">—</span>:null;
   const late=isOverdue(raw)&&field.key!=="read_at";
   return <span className={"date-value"+(late?" overdue":"")} title={formatDate(raw,true)}>{formatDate(raw,field.time)}</span>;
  }
  case "stamp":
   if(!raw)return mode==="cell"?<span className="muted-note">—</span>:null;
   return <span className="muted-note" title={formatDate(raw,true)}>{formatRelative(raw)}</span>;
  case "url":{
   if(!raw)return mode==="cell"?<span className="muted-note">—</span>:null;
   return <a href={raw} target="_blank" rel="noopener noreferrer" className="link-value"
    onClick={e=>e.stopPropagation()} title={raw}>
    <ExternalLink/>{mode==="cell"&&<span>{hostname(raw)}</span>}
   </a>;
  }
  case "project":{
   const name=ctx.projectName(raw??null);
   if(!name)return mode==="cell"?<span className="muted-note">Inbox</span>:null;
   const color=ctx.projectColor(raw??null);
   return <span className={"project-pill tint-"+(color??"slate")}>{name}</span>;
  }
  case "tags":{
   const ids=ctx.tagIds(row.id);
   if(!ids.length)return mode==="cell"?<span className="muted-note">—</span>:null;
   return <TagChips ids={ids} byId={ctx.tagsById} max={mode==="card"?3:undefined}/>;
  }
  case "bool":
   if(mode==="cell")return raw?<Check className="bool-yes"/>:<span className="muted-note">—</span>;
   return raw?<Dot tone="green" title={field.trueLabel??field.label}/>:null;
  case "longtext":{
   if(!raw)return mode==="cell"?<span className="muted-note">—</span>:null;
   if(mode==="card")return <StickyNote className="note-hint"/>;
   return <span className="clamp-1">{raw}</span>;
  }
  default:{
   if(raw==null||raw==="")return mode==="cell"?<span className="muted-note">—</span>:null;
   return <span>{String(raw)}</span>;
  }
 }
}
