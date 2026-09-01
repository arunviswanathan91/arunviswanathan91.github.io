// What the bot knows about each module. Mirrors the dashboard's src/entities configs,
// trimmed to what chat commands need. Adding a settable field is one line here.

export type EntityKey="tasks"|"publications"|"documents"|"jobs"|"reminders"|"reads";
export type TagEntity="task"|"publication"|"document"|"job_application"|"reminder"|"read";
export type FieldKind="text"|"enum"|"date"|"url"|"project";

export interface BotField{
 key:string;
 kind:FieldKind;
 /** Words accepted before a colon, e.g. `venue:Nature`. */
 aliases:string[];
 options?:readonly string[];
 time?:boolean;
}

export interface BotEntity{
 key:EntityKey;
 table:string;
 command:string;                 // /add, /pub, …
 singular:string;
 tagEntity:TagEntity;
 titleField:string;
 /** Extra required column filled from the free text after the command, if any. */
 secondField?:string;
 searchFields:string[];
 projectField:string|null;
 dateField:string|null;          // what `due:` / `in 2h` sets
 priorityField:string|null;
 stageField:string|null;
 stageOptions:readonly string[];
 openFilter?:{column:string;neq?:string;eq?:unknown};
 fields:BotField[];
}

const TASK_STATUS=["Backlog","In progress","Review","Done"] as const;
const PUBLICATION_STAGE=["Idea","Drafting","Submitted","Revision","Published"] as const;
const JOB_STAGE=["Saved","Preparing","Applied","Interview","Offer","Closed"] as const;
const PRIORITY=["Low","Medium","High"] as const;
const DOCUMENT_KIND=["Manuscript","Protocol","Dataset","Figure","Reference"] as const;

export const ENTITIES:Record<EntityKey,BotEntity>={
 tasks:{
  key:"tasks",table:"tasks",command:"/add",singular:"task",tagEntity:"task",
  titleField:"title",searchFields:["title","notes"],projectField:"project_id",
  dateField:"due_at",priorityField:"priority",stageField:"status",stageOptions:TASK_STATUS,
  openFilter:{column:"status",neq:"Done"},
  fields:[
   {key:"title",kind:"text",aliases:["title"]},
   {key:"status",kind:"enum",aliases:["status","stage"],options:TASK_STATUS},
   {key:"priority",kind:"enum",aliases:["priority","p"],options:PRIORITY},
   {key:"due_at",kind:"date",aliases:["due","by","when"]},
   {key:"notes",kind:"text",aliases:["note","notes","detail","details"]},
   {key:"project_id",kind:"project",aliases:["project"]},
  ],
 },
 publications:{
  key:"publications",table:"publications",command:"/pub",singular:"publication",tagEntity:"publication",
  titleField:"title",searchFields:["title","venue","doi","next_action","notes"],projectField:"project_id",
  dateField:"due_at",priorityField:null,stageField:"stage",stageOptions:PUBLICATION_STAGE,
  openFilter:{column:"stage",neq:"Published"},
  fields:[
   {key:"title",kind:"text",aliases:["title"]},
   {key:"venue",kind:"text",aliases:["venue","journal","conference"]},
   {key:"stage",kind:"enum",aliases:["stage","status"],options:PUBLICATION_STAGE},
   {key:"doi",kind:"text",aliases:["doi"]},
   {key:"url",kind:"url",aliases:["url","link"]},
   {key:"due_at",kind:"date",aliases:["due","by","when"]},
   {key:"next_action",kind:"text",aliases:["next","action"]},
   {key:"notes",kind:"text",aliases:["note","notes"]},
   {key:"project_id",kind:"project",aliases:["project"]},
  ],
 },
 documents:{
  key:"documents",table:"documents",command:"/doc",singular:"document",tagEntity:"document",
  titleField:"title",searchFields:["title","kind","notes"],projectField:"project_id",
  dateField:null,priorityField:null,stageField:"kind",stageOptions:DOCUMENT_KIND,
  fields:[
   {key:"title",kind:"text",aliases:["title"]},
   {key:"kind",kind:"enum",aliases:["kind","type"],options:DOCUMENT_KIND},
   {key:"drive_url",kind:"url",aliases:["url","link","drive"]},
   {key:"notes",kind:"text",aliases:["note","notes"]},
   {key:"project_id",kind:"project",aliases:["project"]},
  ],
 },
 jobs:{
  key:"jobs",table:"job_applications",command:"/job",singular:"application",tagEntity:"job_application",
  titleField:"role",secondField:"organization",searchFields:["role","organization","next_action","notes"],
  projectField:"project_id",dateField:"deadline",priorityField:null,stageField:"stage",stageOptions:JOB_STAGE,
  openFilter:{column:"stage",neq:"Closed"},
  fields:[
   {key:"role",kind:"text",aliases:["role","title"]},
   {key:"organization",kind:"text",aliases:["org","organization","company","at"]},
   {key:"stage",kind:"enum",aliases:["stage","status"],options:JOB_STAGE},
   {key:"deadline",kind:"date",aliases:["due","deadline","by"]},
   {key:"url",kind:"url",aliases:["url","link"]},
   {key:"next_action",kind:"text",aliases:["next","action"]},
   {key:"notes",kind:"text",aliases:["note","notes"]},
   {key:"project_id",kind:"project",aliases:["project"]},
  ],
 },
 reminders:{
  key:"reminders",table:"reminders",command:"/remind",singular:"reminder",tagEntity:"reminder",
  titleField:"title",searchFields:["title","body"],projectField:null,
  dateField:"remind_at",priorityField:null,stageField:null,stageOptions:[],
  openFilter:{column:"done",eq:false},
  fields:[
   {key:"title",kind:"text",aliases:["title"]},
   {key:"remind_at",kind:"date",aliases:["due","when","at","by"],time:true},
   {key:"body",kind:"text",aliases:["note","notes","body","detail","details"]},
  ],
 },
 reads:{
  key:"reads",table:"reads",command:"/read",singular:"read",tagEntity:"read",
  titleField:"title",searchFields:["title","url","notes"],projectField:null,
  dateField:"read_at",priorityField:null,stageField:null,stageOptions:[],
  openFilter:{column:"read_at",eq:null},
  fields:[
   {key:"title",kind:"text",aliases:["title","name"]},
   {key:"url",kind:"url",aliases:["url","link"]},
   {key:"notes",kind:"text",aliases:["note","notes"]},
  ],
 },
};

export const BY_COMMAND:Record<string,BotEntity>=Object.fromEntries(
 Object.values(ENTITIES).map(e=>[e.command,e]));
export const ENTITY_LIST=Object.values(ENTITIES);
