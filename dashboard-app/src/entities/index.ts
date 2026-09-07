import { BookMarked, Bell, BriefcaseBusiness, FileText, FlaskConical, LayoutDashboard, Telescope } from "lucide-react";
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

export const OPPORTUNITY_STATUS=["New","Shortlisted","Tracked","Dismissed","Expired"] as const;
export const OPPORTUNITY_KIND=["Postdoc","Research scientist","Industry R&D","Fellowship","Staff scientist","Faculty","Other"] as const;
export const OPPORTUNITY_FIT=["Strong","Good","Maybe","Weak"] as const;
export const DISMISS_REASON=["Not relevant","Wrong location","Too junior","Too senior","Salary too low","Deadline too soon","Visa/eligibility","Organisation","Already applied","Other"] as const;
export const OPPORTUNITY_REGION=["Kerala","Bengaluru","Rest of India","Remote","Europe","North America","Asia-Pacific","Other"] as const;
export const SALARY_SOURCE=["Stated (API)","Predicted (API)","JSON-LD","From text","Not stated"] as const;

const fitTone=(v:string):Tone=>v==="Strong"?"green":v==="Good"?"violet":v==="Maybe"?"amber":"slate";
const opportunityTone=(v:string):Tone=>
 v==="New"?"slate":v==="Shortlisted"?"amber":v==="Tracked"?"green":v==="Expired"?"red":"dim";

export const opportunities:EntityDef={
 key:"opportunities",table:"opportunities",tagEntity:"opportunity",
 select:"id,user_id,role,organization,organization_url,status,dismiss_reason,opportunity_type,"+
  "location,region,is_remote,posted_at,deadline,last_seen_at,match_score,fit_reason,"+
  "salary_display,salary_source,url,apply_url,source_count,sources_summary,summary,"+
  "next_action,notes,job_application_id,saved,created_at,updated_at",
 singular:"opportunity",plural:"Opportunities",kicker:"Career",
 subtitle:"Postdocs and research roles found overnight, ranked against your profile.",
 icon:Telescope,
 titleField:"role",
 searchFields:["role","organization","location","summary","fit_reason","notes"],
 projectField:null,
 groupBy:"status",
 defaultSort:{key:"match_score",dir:"desc"},
 defaultLayout:"board",layouts:["board","table"],
 openWhen:r=>r.status==="New",
 newDefaults:({userId})=>({user_id:userId,status:"New",match_score:0,opportunity_type:"Other"}),
 fields:[
  {key:"role",kind:"text",label:"Role",required:true,create:true,card:"title",table:4,sort:true},
  {key:"organization",kind:"text",label:"Organisation",create:true,card:"subtitle",table:2,sort:true},
  {key:"fit",kind:"enum",label:"Fit",options:OPPORTUNITY_FIT,tone:fitTone,card:"accent",filter:true,
   derive:(r:Row)=>{const s=Number(r.match_score??0);return s>=70?"Strong":s>=50?"Good":s>=30?"Maybe":"Weak"}},
  {key:"match_score",kind:"text",label:"Match",editable:false,card:"meta",table:1,sort:true},
  {key:"status",kind:"enum",label:"Status",options:OPPORTUNITY_STATUS,tone:opportunityTone,card:"badge",table:1,filter:true,sort:true},
  {key:"dismiss_reason",kind:"enum",label:"Why dismissed",options:DISMISS_REASON,free:true,tone:()=>"dim",table:1,filter:true,
   placeholder:"Feeds the ranking — worth setting"},
  {key:"opportunity_type",kind:"enum",label:"Type",options:OPPORTUNITY_KIND,free:true,tone:()=>"dim",create:true,table:1,filter:true,sort:true},
  {key:"location",kind:"text",label:"Location",editable:false,card:"meta",table:2,sort:true},
  {key:"region",kind:"enum",label:"Region",options:OPPORTUNITY_REGION,free:true,tone:()=>"dim",table:1,filter:true},
  {key:"is_remote",kind:"bool",label:"Remote",trueLabel:"Remote",editable:false,table:1,filter:true},
  {key:"deadline",kind:"date",label:"Deadline",buckets:true,create:true,card:"footer",table:1,filter:true,sort:true},
  {key:"posted_at",kind:"date",label:"Posted",buckets:true,editable:false,table:1,filter:true,sort:true},
  {key:"salary_display",kind:"text",label:"Salary",editable:false,card:"footer",table:2,sort:true},
  {key:"salary_source",kind:"enum",label:"Salary source",options:SALARY_SOURCE,free:true,
   tone:v=>v.startsWith("Predicted")?"amber":v==="Not stated"?"dim":"blue",editable:false,table:1,filter:true},
  {key:"url",kind:"url",label:"Listing",short:true,create:true,card:"footer",table:1},
  {key:"apply_url",kind:"url",label:"Apply",short:true,table:1},
  {key:"organization_url",kind:"url",label:"Organisation site",short:true},
  {key:"source_count",kind:"text",label:"Sources",editable:false,table:1,sort:true},
  {key:"sources_summary",kind:"text",label:"Seen on",editable:false,table:2},
  {key:"saved",kind:"bool",label:"In job tracker",trueLabel:"In job tracker",editable:false,table:1,filter:true},
  tagsField,
  {key:"fit_reason",kind:"longtext",label:"Why this scored what it did",rows:3,editable:false,wide:true,table:3},
  {key:"summary",kind:"longtext",label:"Summary",rows:4,editable:false,wide:true,table:3},
  {key:"next_action",kind:"text",label:"Next action",table:2},
  {key:"notes",kind:"longtext",label:"Notes",rows:5,create:true,wide:true},
  {key:"last_seen_at",kind:"stamp",label:"Last seen",table:1},
  ...stamps,
 ],
};

export const ENTITIES:Record<EntityKey,EntityDef>={tasks,publications,documents,jobs,reminders,reads,opportunities};
export const ENTITY_ORDER:EntityKey[]=["opportunities","tasks","publications","documents","jobs","reminders","reads"];

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
