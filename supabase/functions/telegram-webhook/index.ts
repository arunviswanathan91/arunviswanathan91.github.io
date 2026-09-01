import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BY_COMMAND, ENTITIES, ENTITY_LIST } from "./entities.ts";
import type { BotEntity, EntityKey } from "./entities.ts";
import { isAffirmative, isDone, parseDate, parseMessage, splitPair } from "./parse.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const STATE_TTL=15*60*1000;

const HELP=[
 "Create — everything after the command is the title:",
 "  /add Draft intro @Thesis #urgent !high due:friday",
 "  /pub Statin trial venue:Nature #clinical",
 "  /doc Protocol v2 @Thesis kind:Protocol",
 "  /job Acme | Postdoc #postdoc due:2026-03-01",
 "  /remind Call PI in 2h #urgent",
 "  /read https://example.com #later   (or just send me a link)",
 "",
 "Tokens: #tag  @project  !high  due:friday  field:value  in 2h",
 "",
 "Work with what's there:",
 "  /today            open tasks, numbered",
 "  /list jobs        any module, numbered",
 "  /find intro       search everything, then pick a number to edit",
 "  /done 2           complete task 2 from the last list",
 "  /tag              ask me which tag to add",
 "  /projects         list, or /projects new Thesis",
 "  /tags             list, or /tags new urgent",
 "",
 "After creating or picking something, just send more tokens to update it — send \"done\" to stop.",
].join("\n");

Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false},405);
 if(req.headers.get("x-telegram-bot-api-secret-token")!==Deno.env.get("TELEGRAM_WEBHOOK_SECRET"))return json({ok:false},401);
 const update=await req.json();
 const message=update.message;
 if(!message?.chat?.id||!message?.text)return json({ok:true});
 const chatId=message.chat.id as number;
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const text=String(message.text).trim();

 // ---- account linking (must work before a chat is linked) ----
 if(text.startsWith("/link ")||text.startsWith("/start ")){
  const code=text.split(/\s+/)[1]?.trim().toUpperCase();
  if(!code)return send(chatId,"Send /link CODE using the code from the dashboard's Settings page.");
  const {data:row}=await db.from("telegram_link_codes").select("id,user_id,expires_at,claimed_at").eq("code",code).maybeSingle();
  if(!row||row.claimed_at||new Date(row.expires_at)<new Date())
   return send(chatId,"That code is invalid or expired. Generate a new one from the dashboard.");
  const {error}=await db.from("profiles").upsert({id:row.user_id,telegram_chat_id:chatId},{onConflict:"id"});
  if(error)return send(chatId,error.code==="23505"?"This Telegram account is already linked to another profile.":"Could not link right now.");
  await db.from("telegram_link_codes").update({claimed_at:new Date().toISOString()}).eq("id",row.id);
  return send(chatId,"Linked. Send /help to see what I can do.");
 }

 const {data:profile}=await db.from("profiles").select("id,timezone").eq("telegram_chat_id",chatId).maybeSingle();
 if(!profile)return send(chatId,"This Telegram account isn't linked yet. Open the dashboard's Settings page, generate a code, and send /link <code>.");
 const userId=profile.id as string;
 const tz=(profile.timezone as string|null)||"UTC";

 // ---------- helpers bound to this request ----------
 const setState=async(kind:string,payload:unknown)=>{
  await db.from("telegram_pending_confirmations").upsert(
   {chat_id:chatId,kind,payload,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+STATE_TTL).toISOString()},
   {onConflict:"chat_id"});
 };
 const clearState=()=>db.from("telegram_pending_confirmations").delete().eq("chat_id",chatId);
 const getState=async()=>{
  const {data}=await db.from("telegram_pending_confirmations").select("kind,payload,expires_at").eq("chat_id",chatId).maybeSingle();
  return data&&new Date(data.expires_at)>new Date()?data:null;
 };

 const findOrCreateTag=async(name:string):Promise<string|null>=>{
  const {data:found}=await db.from("tags").select("id").eq("user_id",userId).ilike("name",name).maybeSingle();
  if(found)return found.id as string;
  const {data}=await db.from("tags").insert({user_id:userId,name:name.toLowerCase()}).select("id").maybeSingle();
  return (data?.id as string)??null;
 };
 const attachTags=async(entity:BotEntity,id:string,names:string[])=>{
  for(const name of names){
   const tagId=await findOrCreateTag(name);
   if(tagId)await db.from("item_tags").upsert({tag_id:tagId,entity_type:entity.tagEntity,entity_id:id},{ignoreDuplicates:true});
  }
 };
 const resolveProject=async(name:string):Promise<{id:string;name:string}|null>=>{
  const {data}=await db.from("projects").select("id,name").eq("user_id",userId).ilike("name",name).maybeSingle();
  return data?{id:data.id as string,name:data.name as string}:null;
 };
 const titleOf=(entity:BotEntity,row:Record<string,unknown>)=>
  entity.searchFields.map(f=>String(row[f]??"").trim()).find(Boolean)||`Untitled ${entity.singular}`;

 /** Applies parsed tokens to an existing row; returns a human summary of what changed. */
 const applyTokens=async(entity:BotEntity,id:string,body:string,treatTextAs:string|null)=>{
  const p=parseMessage(body,entity,tz);
  const patch:Record<string,unknown>={...p.fields};
  const notes:string[]=[];

  if(p.project!==null&&entity.projectField){
   const proj=await resolveProject(p.project);
   if(proj){patch[entity.projectField]=proj.id;notes.push(`project ${proj.name}`)}
   else notes.push(`no project named "${p.project}"`);
  }
  if(p.url){
   const urlField=entity.fields.find(f=>f.kind==="url");
   if(urlField)patch[urlField.key]=p.url;
  }
  if(p.text&&treatTextAs&&patch[treatTextAs]===undefined)patch[treatTextAs]=p.text;

  for(const [k,v] of Object.entries(p.fields)){
   const f=entity.fields.find(x=>x.key===k);
   notes.push(f?.kind==="date"?`${f.aliases[0]} ${new Date(String(v)).toLocaleString("en-GB",{timeZone:tz})}`:`${f?.aliases[0]??k} ${v}`);
  }
  if(Object.keys(patch).length){
   const {error}=await db.from(entity.table).update(patch).eq("id",id);
   if(error)return {ok:false,summary:"I couldn't save that."};
  }
  if(p.tags.length){await attachTags(entity,id,p.tags);notes.push("tags "+p.tags.join(", "))}
  if(p.unknown.length)notes.push(`(ignored: ${p.unknown.join(", ")})`);
  return {ok:true,summary:notes.length?notes.join(" · "):""};
 };

 const refinePrompt=(entity:BotEntity,title:string)=>
  `Now editing "${title}".\nSend #tag, @project${entity.priorityField?", !high":""}${entity.dateField?", due:friday":""} or field:value — or "done".`;

 const listRows=async(entity:BotEntity,limit=10)=>{
  let q=db.from(entity.table).select("*").eq("user_id",userId);
  if(entity.openFilter){
   if(entity.openFilter.neq!==undefined)q=q.neq(entity.openFilter.column,entity.openFilter.neq);
   else if(entity.openFilter.eq===null)q=q.is(entity.openFilter.column,null);
   else q=q.eq(entity.openFilter.column,entity.openFilter.eq);
  }
  const {data}=await q.order("created_at").limit(limit);
  return (data??[]) as Record<string,unknown>[];
 };

 // ---------- commands ----------
 if(text.startsWith("/")){
  const [cmd,...restParts]=text.split(/\s+/);
  const rest=text.slice(cmd.length).trim();
  const command=cmd.toLowerCase();

  if(command==="/help"||command==="/start")return send(chatId,HELP);

  // Create in any module
  const entity=BY_COMMAND[command];
  if(entity){
   if(!rest){await clearState();return send(chatId,`What should the ${entity.singular} be called? Send: ${entity.command} <title> #tag @project`)}

   const p=parseMessage(rest,entity,tz);
   const values:Record<string,unknown>={user_id:userId,...p.fields};
   let body=p.text;

   if(entity.key==="jobs"){
    const pair=splitPair(body);
    if(!pair&&!(values.organization&&values.role))
     return send(chatId,"Use: /job Organization | Role  (plus #tags, due:… if you like)");
    if(pair){values.organization=pair[0];values.role=pair[1]}
   }else if(entity.key==="reads"){
    if(p.url)values.url=p.url;
    if(!values.url)return send(chatId,"Send a link to save: /read https://example.com #tag");
    if(body)values.title=body;
   }else{
    if(body)values[entity.titleField]=body;
    if(!values[entity.titleField])return send(chatId,`Give the ${entity.singular} a title.`);
   }
   if(entity.key==="tasks")values.source="telegram";

   let projectNote="";
   if(p.project&&entity.projectField){
    const proj=await resolveProject(p.project);
    if(proj)values[entity.projectField]=proj.id;
    else projectNote=` (no project named "${p.project}" — left in Inbox)`;
   }

   const {data,error}=await db.from(entity.table).insert(values).select("*").maybeSingle();
   if(error||!data)return send(chatId,`I couldn't save that ${entity.singular}.`);
   if(p.tags.length)await attachTags(entity,data.id as string,p.tags);

   const title=titleOf(entity,data);
   const bits:string[]=[];
   if(p.tags.length)bits.push("#"+p.tags.join(" #"));
   if(entity.dateField&&data[entity.dateField])bits.push(new Date(String(data[entity.dateField])).toLocaleString("en-GB",{timeZone:tz}));
   if(entity.priorityField&&values[entity.priorityField])bits.push(String(values[entity.priorityField]));
   await setState("refine",{entity:entity.key,id:data.id,title});
   return send(chatId,`Saved ${entity.singular}: ${title}${bits.length?"\n"+bits.join(" · "):""}${projectNote}\n\nAdd more? Send #tag @project or field:value — or "done".`);
  }

  if(command==="/today"){
   const rows=await listRows(ENTITIES.tasks);
   if(!rows.length){await clearState();return send(chatId,"No open tasks.")}
   await setState("pick",{matches:rows.map(r=>({entity:"tasks",id:r.id,title:titleOf(ENTITIES.tasks,r)}))});
   return send(chatId,rows.map((r,i)=>`${i+1}. ${titleOf(ENTITIES.tasks,r)} [${r.status}]`).join("\n")
    +"\n\nSend a number to edit it, or /done <number> to complete it.");
  }

  if(command==="/list"){
   const name=restParts[0]?.toLowerCase();
   const target=ENTITY_LIST.find(e=>e.key===name||e.singular===name||e.command==="/"+name);
   if(!target)return send(chatId,"Which module? "+ENTITY_LIST.map(e=>e.key).join(", "));
   const rows=await listRows(target);
   if(!rows.length){await clearState();return send(chatId,`Nothing open in ${target.key}.`)}
   await setState("pick",{matches:rows.map(r=>({entity:target.key,id:r.id,title:titleOf(target,r)}))});
   return send(chatId,rows.map((r,i)=>`${i+1}. ${titleOf(target,r)}`).join("\n")+"\n\nSend a number to edit one.");
  }

  if(command==="/find"){
   const term=rest.trim();
   if(!term)return send(chatId,"Use: /find <text>");
   const matches:{entity:EntityKey;id:string;title:string}[]=[];
   for(const e of ENTITY_LIST){
    const or=e.searchFields.map(f=>`${f}.ilike.%${term.replace(/[%,]/g,"")}%`).join(",");
    const {data}=await db.from(e.table).select("*").eq("user_id",userId).or(or).limit(5);
    for(const row of (data??[]) as Record<string,unknown>[])
     matches.push({entity:e.key,id:row.id as string,title:titleOf(e,row)});
   }
   if(!matches.length){await clearState();return send(chatId,`Nothing matches "${term}".`)}
   await setState("pick",{matches});
   return send(chatId,matches.map((m,i)=>`${i+1}. ${m.title} — ${ENTITIES[m.entity].singular}`).join("\n")
    +"\n\nSend a number to edit it.");
  }

  if(command==="/done"){
   const n=parseInt(restParts[0]??"",10);
   const state=await getState();
   let target:{entity:EntityKey;id:string;title:string}|null=null;
   if(state?.kind==="pick"&&n>=1){
    const list=(state.payload as any).matches as {entity:EntityKey;id:string;title:string}[];
    target=list[n-1]??null;
   }
   if(!target&&n>=1){
    const rows=await listRows(ENTITIES.tasks);
    const row=rows[n-1];
    if(row)target={entity:"tasks",id:row.id as string,title:titleOf(ENTITIES.tasks,row)};
   }
   if(!target)return send(chatId,"No matching item. Send /today or /list first.");
   const e=ENTITIES[target.entity];
   // Documents have no lifecycle column — `kind` is a type, not a stage — so they're
   // deliberately excluded rather than having their kind overwritten.
   const DONE_PATCH:Partial<Record<EntityKey,Record<string,unknown>>>={
    tasks:{status:"Done"},publications:{stage:"Published"},jobs:{stage:"Closed"},
    reminders:{done:true},reads:{read_at:new Date().toISOString()},
   };
   const patch=DONE_PATCH[e.key];
   if(!patch)return send(chatId,`A ${e.singular} can't be completed — try /set instead.`);
   const {error}=await db.from(e.table).update(patch).eq("id",target.id);
   await clearState();
   return send(chatId,error?"I couldn't update that.":`Completed: ${target.title}`);
  }

  if(command==="/tag"){
   const state=await getState();
   if(state?.kind!=="refine")return send(chatId,"Pick something first — /today, /list or /find — then send /tag.");
   const {data}=await db.from("tags").select("id,name").eq("user_id",userId).order("name").limit(30);
   const options=(data??[]) as {id:string;name:string}[];
   await setState("ask_tag",{...(state.payload as object),options});
   return send(chatId,(options.length?options.map((t,i)=>`${i+1}. ${t.name}`).join("\n"):"You have no tags yet.")
    +"\n\nWhich tag? Send a number, or type a new tag name.");
  }

  if(command==="/projects"){
   if(restParts[0]?.toLowerCase()==="new"){
    const name=rest.slice(restParts[0].length).trim();
    if(!name)return send(chatId,"Use: /projects new <name>");
    const {error}=await db.from("projects").insert({user_id:userId,name,status:"Active"});
    return send(chatId,error?"I couldn't create that project.":`Project "${name}" created.`);
   }
   const {data}=await db.from("projects").select("name,status").eq("user_id",userId).order("name");
   const rows=(data??[]) as {name:string;status:string}[];
   return send(chatId,(rows.length?rows.map(p=>`• ${p.name}${p.status==="Archived"?" (archived)":""}`).join("\n"):"No projects yet.")
    +"\n\nCreate one with /projects new <name>.");
  }

  if(command==="/tags"){
   if(restParts[0]?.toLowerCase()==="new"){
    const name=rest.slice(restParts[0].length).trim();
    if(!name)return send(chatId,"Use: /tags new <name>");
    const id=await findOrCreateTag(name);
    return send(chatId,id?`Tag "${name.toLowerCase()}" ready.`:"I couldn't create that tag.");
   }
   const {data}=await db.from("tags").select("name").eq("user_id",userId).order("name");
   const rows=(data??[]) as {name:string}[];
   return send(chatId,(rows.length?rows.map(t=>`• ${t.name}`).join("\n"):"No tags yet.")+"\n\nCreate one with /tags new <name>.");
  }

  if(command==="/set"){
   const state=await getState();
   if(state?.kind!=="refine")return send(chatId,"Pick something first — /today, /list or /find.");
   const payload=state.payload as {entity:EntityKey;id:string;title:string};
   const e=ENTITIES[payload.entity];
   const body=rest.replace(/^(\w+)\s+/,(_m,k)=>`${k}:`);   // "/set priority high" -> "priority:high"
   const res=await applyTokens(e,payload.id,body,null);
   await setState("refine",payload);
   return send(chatId,res.ok?(res.summary?`Updated — ${res.summary}`:"Nothing changed."):res.summary);
  }

  await clearState();
  return send(chatId,HELP);
 }

 // ---------- conversational replies (no leading slash) ----------
 const state=await getState();

 if(state?.kind==="ask_tag"){
  const payload=state.payload as {entity:EntityKey;id:string;title:string;options:{id:string;name:string}[]};
  const e=ENTITIES[payload.entity];
  const picked:string[]=[];
  for(const part of text.split(/[,\s]+/).filter(Boolean)){
   const n=parseInt(part,10);
   if(!isNaN(n)&&payload.options[n-1])picked.push(payload.options[n-1].name);
   else if(!/^\d+$/.test(part))picked.push(part.replace(/^#/,"").toLowerCase());
  }
  if(!picked.length)return send(chatId,"Send a number from the list, or type a new tag name.");
  await attachTags(e,payload.id,picked);
  await setState("refine",{entity:payload.entity,id:payload.id,title:payload.title});
  return send(chatId,`Tagged ${picked.map(t=>"#"+t).join(" ")}.\n${refinePrompt(e,payload.title)}`);
 }

 if(state?.kind==="pick"){
  const list=(state.payload as any).matches as {entity:EntityKey;id:string;title:string}[];
  const n=parseInt(text,10);
  if(!isNaN(n)&&list[n-1]){
   const chosen=list[n-1];
   await setState("refine",chosen);
   return send(chatId,refinePrompt(ENTITIES[chosen.entity],chosen.title));
  }
  if(isDone(text)){await clearState();return send(chatId,"Okay.")}
  return send(chatId,"Send one of the numbers above, or \"done\".");
 }

 if(state?.kind==="refine"){
  const payload=state.payload as {entity:EntityKey;id:string;title:string};
  const e=ENTITIES[payload.entity];
  if(isDone(text)){await clearState();return send(chatId,"Done.")}
  // Free text with no tokens becomes a note rather than being thrown away.
  const noteField=e.fields.find(f=>["notes","body"].includes(f.key))?.key??null;
  const res=await applyTokens(e,payload.id,text,noteField);
  await setState("refine",payload);
  return send(chatId,res.ok?(res.summary?`Updated — ${res.summary}\nAnything else? Send "done" to stop.`:`I didn't recognise that. ${refinePrompt(e,payload.title)}`):res.summary);
 }

 if(state?.kind==="read_confirm"){
  const payload=state.payload as {url:string;tags:string[]};
  const urlInText=parseMessage(text,ENTITIES.reads,tz).url;
  if(urlInText){
   await setState("read_confirm",{url:urlInText,tags:parseMessage(text,ENTITIES.reads,tz).tags});
   return send(chatId,`Replacing the pending link — save this one instead?\n${urlInText}\n(yes/no)`);
  }
  await clearState();
  if(!isAffirmative(text))return send(chatId,"Okay, not saved.");
  const {data,error}=await db.from("reads").insert({user_id:userId,url:payload.url}).select("*").maybeSingle();
  if(error||!data)return send(chatId,"I couldn't save that link.");
  if(payload.tags?.length)await attachTags(ENTITIES.reads,data.id as string,payload.tags);
  await setState("refine",{entity:"reads",id:data.id,title:titleOf(ENTITIES.reads,data)});
  return send(chatId,`Saved to Reads: ${payload.url}\nAdd a #tag or a title? Send it, or "done".`);
 }

 // ---------- no state: a bare link offers to save itself ----------
 const parsed=parseMessage(text,ENTITIES.reads,tz);
 if(parsed.url){
  await setState("read_confirm",{url:parsed.url,tags:parsed.tags});
  return send(chatId,`Add this to Reads?\n${parsed.url}${parsed.tags.length?"\nTags: "+parsed.tags.join(", "):""}\n(yes/no)`);
 }
 return send(chatId,HELP);
});

async function send(chat_id:number,text:string){
 const token=Deno.env.get("TELEGRAM_BOT_TOKEN");
 const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id,text})});
 return json({ok:r.ok});
}
