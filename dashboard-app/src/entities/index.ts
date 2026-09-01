import { BookMarked, Bell, BriefcaseBusiness, FileText, FlaskConical, LayoutDashboard } from "lucide-react";
import { isColumn } from "./types";
import type { EntityDef, EntityKey, Row, Tone } from "./types";
import { dayDelta } from "../lib/format";

export const TASK_STATUS=["Backlog","In progress","Review","Done"] as const;
export const PRIORITY=["Low","Medium","High"] as const;
export const PUBLICATION_STAGE=["Idea","Drafting","Submitted","Revision","Published"] as const;
export const JOB_STAGE=["Saved","Preparing","Applied","Interview","Offer","Closed"] as const;
export const DOCUMENT_KIND=["Manuscript","Protocol","Dataset","Figure","Reference"] as const;
export const REMINDER_GROUP=["Overdue","Today","Upcoming","No date","Done"] as const;
export const READ_GROUP=["Unread","Read"] as const;

const stageTone=(v:string):Tone=>
 v==="Backlog"||v==="Idea"||v==="Saved"||v==="No date"||v==="Unread"?"slate":
 v==="In progress"||v==="Drafting"||v==="Preparing"||v==="Today"?"amber":
 v==="Review"||v==="Submitted"||v==="Applied"?"blue":
 v==="Revision"||v==="Interview"||v==="Upcoming"?"violet":
 v==="Done"||v==="Published"||v==="Offer"||v==="Read"?"green":
 v==="Overdue"?"red":"dim";
const priorityTone=(v:string):Tone=>v==="High"?"red":v==="Medium"?"amber":"slate";

const projectField={key:"project_id",kind:"project",label:"Project",card:"meta",table:2,filter:true} as const;
const tagsField={key:"tags",kind:"tags",label:"Tags",create:true,card:"meta",table:2,filter:true,wide:true} as const;
const stamps=[
 {key:"created_at",kind:"stamp",label:"Created",sort:true},
 {key:"updated_at",kind:"stamp",label:"Updated",sort:true},
] as const;

export const tasks:EntityDef={
 key:"tasks",table:"tasks",tagEntity:"task",
 select:"id,user_id,project_id,title,status,priority,due_at,notes,source,created_at,updated_at",
 singular:"task",plural:"Tasks",kicker:"Work",subtitle:"Everything in flight, by status.",icon:LayoutDashboard,
 titleField:"title",searchFields:["title","notes"],projectField:"project_id",groupBy:"status",
 defaultSort:{key:"created_at",dir:"desc"},defaultLayout:"board",layouts:["board","table"],
 openWhen:r=>r.status!=="Done",
 newDefaults:({userId,projectId})=>({user_id:userId,status:"Backlog",priority:"Medium",project_id:projectId,source:"dashboard"}),
 fields:[
  {key:"title",kind:"text",label:"Title",required:true,create:true,card:"title",table:4,sort:true,placeholder:"What needs doing?"},
  {key:"status",kind:"enum",label:"Status",options:TASK_STATUS,tone:stageTone,card:"badge",table:1,filter:true,sort:true},
  {key:"priority",kind:"enum",label:"Priority",options:PRIORITY,tone:priorityTone,create:true,card:"accent",table:1,filter:true,sort:true},
  {key:"due_at",kind:"date",label:"Due",buckets:true,create:true,card:"footer",table:1,filter:true,sort:true},
  projectField,tagsField,
  {key:"notes",kind:"longtext",label:"Notes",rows:5,wide:true,placeholder:"Details, links, next steps…"},
  ...stamps,
 ],
};

export const publications:EntityDef={
 key:"publications",table:"publications",tagEntity:"publication",
 select:"id,user_id,title,venue,stage,next_action,due_at,doi,notes,project_id,url,created_at,updated_at",
 singular:"publication",plural:"Publications",kicker:"Knowledge",subtitle:"Every manuscript from idea to print.",icon:FlaskConical,
 titleField:"title",searchFields:["title","venue","next_action","doi","notes"],projectField:"project_id",groupBy:"stage",
 defaultSort:{key:"created_at",dir:"desc"},defaultLayout:"board",layouts:["board","table"],
 openWhen:r=>r.stage!=="Published",
 newDefaults:({userId,projectId})=>({user_id:userId,stage:"Idea",project_id:projectId}),
 fields:[
  {key:"title",kind:"text",label:"Title",required:true,create:true,card:"title",table:4,sort:true},
  {key:"venue",kind:"text",label:"Venue",create:true,card:"subtitle",table:2,sort:true,placeholder:"Journal or conference"},
  {key:"stage",kind:"enum",label:"Stage",options:PUBLICATION_STAGE,tone:stageTone,card:"badge",table:1,filter:true,sort:true},
  {key:"due_at",kind:"date",label:"Due",buckets:true,card:"footer",table:1,filter:true,sort:true},
  {key:"next_action",kind:"text",label:"Next action",card:"footer",table:2,placeholder:"What moves this forward?"},
  {key:"url",kind:"url",label:"Link",short:true,card:"footer",table:1},
  {key:"doi",kind:"text",label:"DOI",table:1,placeholder:"10.1234/example"},
  projectField,tagsField,
  {key:"notes",kind:"longtext",label:"Notes",rows:5,wide:true},
  ...stamps,
 ],
};

export const documents:EntityDef={
 key:"documents",table:"documents",tagEntity:"document",
 select:"id,user_id,project_id,title,kind,drive_file_id,drive_url,notes,created_at,updated_at",
 singular:"document",plural:"Documents",kicker:"Knowledge",subtitle:"Manuscripts, protocols and datasets.",icon:FileText,
 titleField:"title",searchFields:["title","kind","notes"],projectField:"project_id",groupBy:"kind",
 defaultSort:{key:"updated_at",dir:"desc"},defaultLayout:"table",layouts:["table","board"],
 newDefaults:({userId,projectId})=>({user_id:userId,kind:"Manuscript",project_id:projectId}),
 fields:[
  {key:"title",kind:"text",label:"Title",required:true,create:true,card:"title",table:4,sort:true},
  {key:"kind",kind:"enum",label:"Type",options:DOCUMENT_KIND,free:true,tone:()=>"dim",create:true,card:"badge",table:1,filter:true,sort:true},
  {key:"drive_url",kind:"url",label:"Drive link",create:true,card:"footer",table:1},
  {key:"drive_file_id",kind:"text",label:"Drive file ID",table:1,placeholder:"Optional"},
  projectField,tagsField,
  {key:"notes",kind:"longtext",label:"Notes",rows:5,wide:true},
  ...stamps,
 ],
};

export const jobs:EntityDef={
 key:"jobs",table:"job_applications",tagEntity:"job_application",
 select:"id,user_id,organization,role,stage,url,deadline,next_action,notes,project_id,created_at,updated_at",
 singular:"application",plural:"Job tracker",kicker:"Career",subtitle:"Applications by stage, filterable by tag.",icon:BriefcaseBusiness,
 titleField:"role",searchFields:["role","organization","next_action","notes"],projectField:"project_id",groupBy:"stage",
 defaultSort:{key:"created_at",dir:"desc"},defaultLayout:"board",layouts:["board","table"],
 openWhen:r=>r.stage!=="Closed",
 newDefaults:({userId,projectId})=>({user_id:userId,stage:"Saved",project_id:projectId}),
 fields:[
  {key:"role",kind:"text",label:"Role",required:true,create:true,card:"title",table:3,sort:true},
  {key:"organization",kind:"text",label:"Organization",required:true,create:true,card:"subtitle",table:2,sort:true},
  {key:"stage",kind:"enum",label:"Stage",options:JOB_STAGE,tone:stageTone,card:"badge",table:1,filter:true,sort:true},
  {key:"deadline",kind:"date",label:"Deadline",buckets:true,create:true,card:"footer",table:1,filter:true,sort:true},
  {key:"next_action",kind:"text",label:"Next action",card:"footer",table:2},
  {key:"url",kind:"url",label:"Link",short:true,create:true,card:"footer",table:1},
  projectField,tagsField,
  {key:"notes",kind:"longtext",label:"Notes",rows:5,wide:true},
  ...stamps,
 ],
};

export const reminders:EntityDef={
 key:"reminders",table:"reminders",tagEntity:"reminder",
 select:"id,user_id,title,body,remind_at,done,notified_at,created_at,updated_at",
 singular:"reminder",plural:"Reminders",kicker:"Personal",subtitle:"Set a time and the bot pings you.",icon:Bell,
 titleField:"title",searchFields:["title","body"],projectField:null,groupBy:"bucket",
 defaultSort:{key:"remind_at",dir:"asc"},defaultLayout:"board",layouts:["board","table"],
 openWhen:r=>!r.done,
 newDefaults:({userId})=>({user_id:userId,done:false}),
 fields:[
  {key:"title",kind:"text",label:"Title",required:true,create:true,card:"title",table:4,sort:true,placeholder:"What should I remember?"},
  // Derived grouping: Reminders keep their Overdue/Today/Upcoming sections without a bespoke view.
  {key:"bucket",kind:"enum",label:"When",options:REMINDER_GROUP,tone:stageTone,card:"badge",
   derive:(r:Row)=>{if(r.done)return "Done";if(!r.remind_at)return "No date";const d=dayDelta(r.remind_at);return d<0?"Overdue":d===0?"Today":"Upcoming"}},
  {key:"remind_at",kind:"date",label:"Remind me at",time:true,buckets:true,create:true,card:"footer",table:2,filter:true,sort:true},
  {key:"done",kind:"bool",label:"Done",trueLabel:"Completed",card:"accent",table:1,filter:true},
  tagsField,
  {key:"body",kind:"longtext",label:"Details",rows:4,create:true,card:"subtitle",table:3,wide:true},
  {key:"notified_at",kind:"stamp",label:"Notified",table:1},
  ...stamps,
 ],
};

export const reads:EntityDef={
 key:"reads",table:"reads",tagEntity:"read",
 select:"id,user_id,url,title,notes,read_at,created_at,updated_at",
 singular:"read",plural:"Reads",kicker:"Personal",subtitle:"Links saved from Telegram and the web.",icon:BookMarked,
 titleField:"title",searchFields:["title","url","notes"],projectField:null,groupBy:"state",
 defaultSort:{key:"created_at",dir:"desc"},defaultLayout:"table",layouts:["table","board"],
 openWhen:r=>!r.read_at,
 newDefaults:({userId})=>({user_id:userId}),
 fields:[
  {key:"title",kind:"text",label:"Title",create:true,card:"title",table:4,sort:true,placeholder:"Optional — falls back to the URL"},
  {key:"url",kind:"url",label:"URL",required:true,create:true,card:"subtitle",table:2},
  {key:"state",kind:"enum",label:"State",options:READ_GROUP,tone:stageTone,card:"badge",
   derive:(r:Row)=>r.read_at?"Read":"Unread"},
  {key:"read_at",kind:"date",label:"Read at",time:true,buckets:true,card:"footer",table:1,filter:true,sort:true},
  tagsField,
  {key:"notes",kind:"longtext",label:"Notes",rows:5,create:true,wide:true},
  ...stamps,
 ],
};

export const ENTITIES:Record<EntityKey,EntityDef>={tasks,publications,documents,jobs,reminders,reads};
export const ENTITY_ORDER:EntityKey[]=["tasks","publications","documents","jobs","reminders","reads"];

// Catch config typos at boot rather than as a confusing runtime blank.
if(import.meta.env.DEV){
 for(const def of Object.values(ENTITIES)){
  const cols=def.select.split(",").map(s=>s.trim());
  for(const f of def.fields)
   if(isColumn(f)&&!cols.includes(f.key))
    console.error(`[entities] ${def.key}: field "${f.key}" is not in select`);
  if(def.groupBy){
   const g=def.fields.find(f=>f.key===def.groupBy);
   if(!g||g.kind!=="enum")console.error(`[entities] ${def.key}: groupBy "${def.groupBy}" must name an enum field`);
  }
  if(!def.fields.some(f=>f.key===def.titleField))console.error(`[entities] ${def.key}: titleField "${def.titleField}" has no field`);
 }
}
