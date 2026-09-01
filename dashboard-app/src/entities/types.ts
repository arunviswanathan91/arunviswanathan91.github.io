import type { LucideIcon } from "lucide-react";

export type Row={id:string}&Record<string,any>;
export type EntityKey="tasks"|"publications"|"documents"|"jobs"|"reminders"|"reads";
export type TagEntity="task"|"publication"|"document"|"job_application"|"reminder"|"read";
export type Layout="board"|"table";
/** Where a field lands on a board card. */
export type CardSlot="accent"|"title"|"subtitle"|"badge"|"meta"|"footer";
export type Tone="slate"|"amber"|"blue"|"violet"|"green"|"red"|"dim";

interface FieldBase {
 key:string;
 label:string;
 required?:boolean;
 /** false = never editable (derived values, timestamps). Default true. */
 editable?:boolean;
 /** Shown in the collapsed composer. Everything else hides behind "More fields". */
 create?:boolean;
 /** Slot on a board card; omit to keep it off cards. */
 card?:CardSlot;
 /** Column weight in table view; omit to hide the column by default. */
 table?:number;
 /** Default true — set false to keep it out of the detail drawer. */
 drawer?:boolean;
 filter?:boolean;
 sort?:boolean;
 placeholder?:string;
 /** Full-width in the drawer's two-column grid. */
 wide?:boolean;
}

export type FieldDef=
 | (FieldBase&{kind:"text"})
 | (FieldBase&{kind:"longtext";rows?:number})
 | (FieldBase&{kind:"enum";options:readonly string[];
     /** Postgres column is free text (documents.kind, projects.status): offer a datalist
      *  rather than a locked select, so an existing value is never silently clobbered. */
     free?:boolean;
     /** Computed group (e.g. Overdue/Upcoming/Done from remind_at+done). Implies
      *  editable:false and makes board columns non-droppable. */
     derive?:(row:Row)=>string;
     tone?:(value:string)=>Tone})
 | (FieldBase&{kind:"date";time?:boolean;buckets?:boolean})
 | (FieldBase&{kind:"url";short?:boolean})
 | (FieldBase&{kind:"project"})
 | (FieldBase&{kind:"tags"})
 | (FieldBase&{kind:"bool";trueLabel?:string})
 | (FieldBase&{kind:"stamp"});

export interface SortSpec{key:string;dir:"asc"|"desc"}

export interface EntityDef{
 key:EntityKey;
 table:string;
 /** Every column, so an inserted row comes back complete and nothing has to refetch. */
 select:string;
 tagEntity:TagEntity|null;
 singular:string;
 plural:string;
 kicker:string;
 subtitle:string;
 icon:LucideIcon;
 fields:FieldDef[];
 titleField:string;
 searchFields:string[];
 /** Column participating in the global project scope; null = not project-scoped. */
 projectField:string|null;
 /** Must name a kind:"enum" field; null = no board layout. */
 groupBy:string|null;
 defaultSort:SortSpec;
 defaultLayout:Layout;
 layouts:Layout[];
 /** "Still open" predicate — the single source of truth for sidebar and home counts. */
 openWhen?:(row:Row)=>boolean;
 newDefaults:(ctx:{userId:string;projectId:string|null})=>Record<string,unknown>;
}

export const fieldByKey=(def:EntityDef,key:string)=>def.fields.find(f=>f.key===key);
export const isEditable=(f:FieldDef)=>f.editable!==false&&f.kind!=="stamp"&&!(f.kind==="enum"&&f.derive);
/** Derived and virtual fields have no column of their own. */
export const isColumn=(f:FieldDef)=>f.kind!=="tags"&&!(f.kind==="enum"&&f.derive);
export const groupValue=(f:FieldDef,row:Row):string=>f.kind==="enum"&&f.derive?f.derive(row):String(row[f.key]??"");
