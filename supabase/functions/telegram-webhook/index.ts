import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BY_COMMAND, ENTITIES, ENTITY_LIST } from "./entities.ts";
import type { BotEntity, EntityKey } from "./entities.ts";
import { isAffirmative, isDone, parseDate, parseMessage, splitPair } from "./parse.ts";
import { dayIn, matchByName, money, parseHabit, parseSpend } from "./money.ts";
import { MENU, parseDeadline, parseNote, parsePaid, parsePaper } from "./workspace.ts";
import { extractWhen, preview, understand } from "./intent.ts";

declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const STATE_TTL=15*60*1000;

const HELP=[
 "Just talk to me — “spent 450 on lunch”, “read 30 min”, “remind me to call Anna tomorrow 9am”, “what's due?”, “paid slice 6557”. Send /menu for buttons.",
 "",
 "Or use commands. Capture — everything after the command is the title:",
 "  /add Draft intro @Thesis #urgent !high due:friday followup:thursday assign:Maya",
 "  /deadline ISMB abstract due:2026-11-02 !high cat:abstract",
 "  /note Try SCENIC on the CAF subset #idea",
 "  /paper 10.1038/s41586-020-2649-2   (DOI, arXiv id, link or title)",
 "  /pub Statin trial venue:Nature #clinical",
 "  /doc Protocol v2 @Thesis kind:Protocol",
 "  /job Acme | Postdoc #postdoc due:2026-03-01",
 "  /remind Call PI in 2h #urgent",
 "  /read https://example.com @Thesis #later   (or just send me a link)",
 "",
 "Tokens: #tag  @project  !high  due:friday  followup:thursday  assign:name  field:value  in 2h",
 "",
 "Money:",
 "  /spend 450 Groceries card:amazon cat:food   (date:yesterday, or 450 SEK …)",
 "  /income 52000 Salary",
 "  /paid slice 6557   record a loan or card payment",
 "  /loans             what you owe and what's next due",
 "",
 "Habits:",
 "  /habit read 30     add 30 to today's Read (or /habit gym to tick it)",
 "  /habits            today's habits and progress",
 "",
 "Plan and review:",
 "  /today             open tasks, numbered",
 "  /due               everything due in the next 7 days",
 "  /week              this week so far",
 "  /list jobs         any module, numbered",
 "  /find intro        search everything, then pick a number to edit",
 "  /done 2            complete item 2 from the last list",
 "  /set priority high change the item you're editing",
 "  /tag               ask me which tag to add",
 "  /projects         list, or /projects new Thesis",
 "  /tags             list, or /tags new urgent",
 "  /discover postdoc  search for opportunities now",
 "",
 "After creating or picking something, just send more tokens to update it — send \"done\" to stop.",
].join("\n");

Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false},405);
 if(req.headers.get("x-telegram-bot-api-secret-token")!==Deno.env.get("TELEGRAM_WEBHOOK_SECRET"))return json({ok:false},401);
 const update=await req.json();
 // A tapped button arrives as a callback_query on the bot's own message; a typed message as `message`.
 const tap=update.callback_query;
 const message=tap?tap.message:update.message;
 if(!message?.chat?.id)return json({ok:true});
 const chatId=message.chat.id as number;
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 let text:string;
 if(tap){
  await tg("answerCallbackQuery",{callback_query_id:tap.id});
  // Buttons are one-shot: clear them so an old menu can't be tapped twice.
  await tg("editMessageReplyMarkup",{chat_id:chatId,message_id:message.message_id,reply_markup:{inline_keyboard:[]}});
  text=fromButton(String(tap.data??""),String(message.reply_to_message?.text??""));
  if(!text)return json({ok:true});
 }else{
  if(!message.text)return json({ok:true});
  text=String(message.text).trim();
 }
 const replyTo=tap?undefined:message.message_id as number;

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
  await syncMenu();
  return send(chatId,"Linked. Send /help to see what I can do.");
 }

 const {data:profile}=await db.from("profiles").select("id,timezone").eq("telegram_chat_id",chatId).maybeSingle();
 if(!profile)return send(chatId,"This Telegram account isn't linked yet. Open the dashboard's Settings page, generate a code, and send /link <code>.");
 const userId=profile.id as string;
 const tz=(profile.timezone as string|null)||"UTC";
 /** "Wed 28 Oct, 09:00" in the user's time zone. */
 const friendly=(iso:string)=>new Date(iso).toLocaleString("en-GB",{timeZone:tz,weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

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
 const resolvePerson=async(name:string):Promise<{id:string;name:string}|null>=>{
  const {data}=await db.from("people").select("id,name").eq("user_id",userId).ilike("name",name).limit(1).maybeSingle();
  return data?{id:data.id as string,name:data.name as string}:null;
 };
 const resolvePublication=async(title:string):Promise<{id:string;title:string}|null>=>{
  const clean=title.replace(/[%,]/g,"");
  const {data}=await db.from("publications").select("id,title").eq("user_id",userId).ilike("title",`%${clean}%`).limit(1).maybeSingle();
  return data?{id:data.id as string,title:data.title as string}:null;
 };
 const resolveReferences=async(entity:BotEntity,fields:Record<string,unknown>)=>{
  const values={...fields},notes:string[]=[];
  for(const field of entity.fields){
   const raw=values[field.key];if(raw===undefined)continue;
   if(field.kind==="person"){
    const person=await resolvePerson(String(raw));
    if(person){values[field.key]=person.id;notes.push(`assigned to ${person.name}`)}
    else{delete values[field.key];notes.push(`no person named "${raw}"`)}
   }else if(field.kind==="publication"){
    const paper=await resolvePublication(String(raw));
    if(paper){values[field.key]=paper.id;notes.push(`paper ${paper.title}`)}
    else{delete values[field.key];notes.push(`no paper matching "${raw}"`)}
   }
  }
  return {values,notes};
 };
 const titleOf=(entity:BotEntity,row:Record<string,unknown>)=>
  entity.searchFields.map(f=>String(row[f]??"").trim()).find(Boolean)||`Untitled ${entity.singular}`;

 /** Applies parsed tokens to an existing row; returns a human summary of what changed. */
 const applyTokens=async(entity:BotEntity,id:string,body:string,treatTextAs:string|null)=>{
  const p=parseMessage(body,entity,tz);
  const resolved=await resolveReferences(entity,p.fields);
  const patch:Record<string,unknown>={...resolved.values};
  const notes:string[]=[...resolved.notes];

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

  for(const [k,v] of Object.entries(resolved.values)){
   const f=entity.fields.find(x=>x.key===k);
   if(f?.kind!=="person"&&f?.kind!=="publication")
    notes.push(f?.kind==="date"?`${f.aliases[0]} ${friendly(String(v))}`:`${f?.aliases[0]??k} ${v}`);
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

 type ReadPayload={url:string;tags:string[];projectId?:string|null;projectName?:string|null};
 const saveRead=async(payload:ReadPayload)=>{
  const {data,error}=await db.from("reads").insert({user_id:userId,url:payload.url,project_id:payload.projectId??null}).select("*").maybeSingle();
  if(error||!data)return send(chatId,"I couldn't save that link.");
  if(payload.tags?.length)await attachTags(ENTITIES.reads,data.id as string,payload.tags);
  await setState("refine",{entity:"reads",id:data.id,title:titleOf(ENTITIES.reads,data)});
  return send(chatId,`Saved to Reads${payload.projectName?` in ${payload.projectName}`:" in Inbox"}: ${payload.url}\n\nType a title if you like, or:`,itemButtons(ENTITIES.reads));
 };
 const offerRead=async(url:string,tags:string[],requestedProject:string|null)=>{
  if(requestedProject){
   const project=await resolveProject(requestedProject);
   if(project){
    await setState("read_confirm",{url,tags,projectId:project.id,projectName:project.name});
    return send(chatId,`Add this to ${project.name} Reads?\n${url}`,[[b("Yes","t:yes"),b("No","t:no")]]);
   }
  }
  const {data}=await db.from("projects").select("id,name").eq("user_id",userId).eq("status","Active").order("name").limit(20);
  const options=(data??[]) as {id:string;name:string}[];
  if(!options.length){
   await setState("read_confirm",{url,tags,projectId:null,projectName:null});
   return send(chatId,`Add this to Reads in Inbox?\n${url}`,[[b("Yes","t:yes"),b("No","t:no")]]);
  }
  await setState("read_project",{url,tags,options});
  return send(chatId,`Save this link to Reads — which project?`+
   `${requestedProject?`\n\nNo project named "${requestedProject}" was found.`:""}`,
   [[b("📥 Inbox","t:0")],...options.slice(0,8).map((p,i)=>[b(p.name,`t:${i+1}`)]),[b("Don't save","t:no")]]);
 };

 // ---------- money and habits ----------
 const settingsRow=async()=>{
  const {data}=await db.from("ws_settings").select("default_currency,timezone,habit_pauses").eq("user_id",userId).maybeSingle();
  return {currency:(data?.default_currency as string)||"INR",tz:(data?.timezone as string)||tz,pauses:(data?.habit_pauses??[]) as {from:string;to:string;habit_id?:string|null}[]};
 };

 const handleSpend=async(kind:"expense"|"income",input:string)=>{
  const p=parseSpend(input);
  if("error" in p)return send(chatId,p.error);
  const s=await settingsRow();
  let currency=p.currency??s.currency;
  const notes:string[]=[];
  let loanId:string|null=null;
  if(p.card){
   const {data:cards}=await db.from("ws_loans").select("id,account_name,card_last4,currency").eq("user_id",userId).eq("account_type","credit_card");
   const list=((cards??[]) as {id:string;account_name:string|null;card_last4:string|null;currency:string}[]).map(c=>({...c,name:c.account_name??""}));
   const card=list.find(c=>c.card_last4===p.card)??matchByName(list,p.card!);
   if(card){loanId=card.id;currency=card.currency;notes.push(`card ${card.account_name??"••"+card.card_last4}`)}
   else notes.push(`no card matching "${p.card}"`);
  }
  let categoryId:string|null=null;
  if(p.category){
   const {data:cats}=await db.from("ws_budget_categories").select("id,name").eq("user_id",userId).eq("kind",kind).is("archived_at",null);
   const cat=matchByName((cats??[]) as {id:string;name:string}[],p.category);
   if(cat){categoryId=cat.id;notes.push(cat.name)}else notes.push(`no category "${p.category}", left uncategorised`);
  }
  const occurred=p.date?(()=>{const iso=parseDate(p.date!,s.tz);return iso?dayIn(s.tz,new Date(iso)):null})():dayIn(s.tz);
  if(!occurred)return send(chatId,`I couldn't read the date "${p.date}".`);
  const {data:tx,error}=await db.from("ws_transactions").insert({user_id:userId,kind,description:p.description,amount:p.amount,currency,category_id:categoryId,occurred_on:occurred,loan_id:loanId,notes:"Telegram"}).select("id").maybeSingle();
  if(error||!tx)return send(chatId,"I couldn't save that: "+(error?.message??"unknown error"));
  const saved=`Saved ${kind}: ${money(p.amount,currency)} · ${p.description} · ${occurred}${notes.length?"\n"+notes.join(" · "):""}`;
  // Ask for what wasn't given, with buttons: category first, then the card.
  const [{data:cats},{data:cards}]=await Promise.all([
   categoryId?Promise.resolve({data:[]}):db.from("ws_budget_categories").select("id,name").eq("user_id",userId).eq("kind",kind).is("archived_at",null).order("name").limit(9),
   loanId||kind!=="expense"?Promise.resolve({data:[]}):db.from("ws_loans").select("id,account_name,card_last4,currency").eq("user_id",userId).eq("account_type","credit_card"),
  ]);
  const catList=(cats??[]) as {id:string;name:string}[];
  const cardList=((cards??[]) as {id:string;account_name:string|null;card_last4:string|null;currency:string}[]).map(c=>({id:c.id,name:c.account_name??`Card ••${c.card_last4??""}`,currency:c.currency}));
  const tail:Btn[][]=[[b(kind==="income"?"💰 Another":"💸 Another",kind==="income"?"x:ask income":"x:ask spend"),b("☰ Menu","t:/menu")]];
  if(catList.length){
   await setState("pick",{matches:[],tx:{id:tx.id,kind},cats:catList,cards:cardList});
   const rows:Btn[][]=[];
   for(let i=0;i<catList.length;i+=3)rows.push(catList.slice(i,i+3).map((c,j)=>b(c.name,`x:cat ${i+j}`)));
   return send(chatId,`${saved}\n\nWhich category?`,[...rows,[b("Skip","x:cat skip")]]);
  }
  if(cardList.length){
   await setState("pick",{matches:[],tx:{id:tx.id,kind},cats:[],cards:cardList});
   return send(chatId,`${saved}\n\nPaid with a credit card?`,[...cardList.map((c,i)=>[b(`💳 ${c.name}`,`x:card ${i}`)]),[b("No card","x:card none")]]);
  }
  return send(chatId,saved,tail);
 };

 type HabitRow={id:string;name:string;target:number|null;unit:string|null;period:string|null;frequency:string;weekdays:number[];start_date:string};
 const activeHabits=async()=>{
  const {data}=await db.from("ws_habits").select("id,name,target,unit,period,frequency,weekdays,start_date").eq("user_id",userId).is("archived_at",null).order("position");
  return (data??[]) as HabitRow[];
 };
 const periodStart=(h:HabitRow,day:string)=>{
  if(h.period==="month")return day.slice(0,8)+"01";
  if(h.period==="week"){const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
  return day;
 };
 const progress=async(h:HabitRow,day:string)=>{
  const {data}=await db.from("ws_habit_checkins").select("day,amount").eq("habit_id",h.id).gte("day",periodStart(h,day)).lte("day",day);
  const rows=(data??[]) as {day:string;amount:number|null}[];
  return {total:rows.reduce((t,r)=>t+Number(r.amount??h.target??1),0),todayRow:rows.find(r=>r.day===day)??null};
 };
 const scope=(h:HabitRow)=>h.period==="week"?" this week":h.period==="month"?" this month":" today";

 const handleHabit=async(input:string)=>{
  const p=parseHabit(input);
  if("error" in p)return send(chatId,p.error);
  const habits=await activeHabits();
  const h=matchByName(habits,p.name);
  if(!h)return send(chatId,`No habit called "${p.name}". Your habits: ${habits.map(x=>x.name).join(", ")||"none yet"}`);
  const s=await settingsRow();
  const day=dayIn(s.tz);
  const before=await progress(h,day);
  if(p.amount===null&&!h.target){
   if(before.todayRow)return send(chatId,`${h.name} is already ticked for today ✓`);
   const {error}=await db.from("ws_habit_checkins").insert({habit_id:h.id,user_id:userId,day});
   return send(chatId,error?"I couldn't save that: "+error.message:`${h.name} ✓ for today`,[[b("✅ Habits","t:/habits"),b("☰ Menu","t:/menu")]]);
  }
  const add=p.amount??Math.max(0,(h.target??1)-before.total);
  const current=before.todayRow?Number(before.todayRow.amount??h.target??1):0;
  const {error}=await db.from("ws_habit_checkins").upsert({habit_id:h.id,user_id:userId,day,amount:current+add},{onConflict:"habit_id,day"});
  if(error)return send(chatId,"I couldn't save that: "+error.message);
  const total=before.total+add,unit=h.unit?" "+h.unit:"";
  const target=h.target??1;
  return send(chatId,`${h.name}: ${total}${unit} of ${target}${unit}${scope(h)}${total>=target?" ✓ nice!":` · ${Math.round((target-total)*100)/100}${unit} to go`}`,
   [[b("✅ Habits","t:/habits"),b("☰ Menu","t:/menu")]]);
 };

 const handleHabits=async()=>{
  const s=await settingsRow();
  const day=dayIn(s.tz);
  const dow=((new Date(day+"T12:00:00Z").getUTCDay()+6)%7)+1;
  const lines:string[]=[];
  const buttons:Btn[][]=[];
  for(const h of await activeHabits()){
   if(h.start_date>day)continue;
   if(s.pauses.some(p=>p.from<=day&&day<=p.to&&(!p.habit_id||p.habit_id===h.id)))continue;
   if((h.period==="day"||!h.period)&&h.frequency!=="daily"&&!h.weekdays.includes(dow))continue;
   const {total}=await progress(h,day);
   const target=h.target??1,unit=h.unit?" "+h.unit:"";
   lines.push(`${total>=target?"✓":"○"} ${h.name}${h.target?` — ${total}${unit} of ${target}${unit}${scope(h)}`:""}`);
   if(total<target)buttons.push(h.target
    ?[...new Set([Math.round(target/2*100)/100,Math.round((target-total)*100)/100])].filter(v=>v>0).map(v=>b(`${h.name} +${v}${unit}`,`t:/habit ${h.name} ${v}`))
    :[b(`✓ ${h.name}`,`t:/habit ${h.name}`)]);
  }
  if(!lines.length)return send(chatId,"No habits due today. 🎉",[[b("☰ Menu","t:/menu")]]);
  return send(chatId,lines.join("\n")+"\n\nTap to log, or tell me e.g. “read 45 min”.",buttons);
 };

 const handleDue=async()=>{
  const s=await settingsRow();
  const day=dayIn(s.tz);
  const until=new Date(Date.parse(day+"T12:00:00Z")+7*86400000).toISOString().slice(0,10);
  const {data,error}=await db.rpc("ws_agenda_for_user",{p_user:userId,p_from:day,p_to:until});
  if(error)return send(chatId,"The agenda isn't available yet.");
  const rows=(data??[]) as {kind:string;title:string;day:string;detail:string|null}[];
  const tail=[[b("📋 Today","t:/today"),b("📊 My week","t:/week"),b("☰ Menu","t:/menu")]];
  if(!rows.length)return send(chatId,"Nothing due in the next 7 days. 🎉",tail);
  const cap=(x:string)=>x.charAt(0).toUpperCase()+x.slice(1);
  return send(chatId,rows.slice(0,25).map(r=>`${cap(relative(r.day,day))} · ${r.title}${r.detail?` (${r.detail})`:""}`).join("\n"),tail);
 };

 // ---------- workspace: deadlines, notes, papers, loans, weekly summary ----------
 const relative=(day:string,today:string)=>{
  const diff=Math.round((Date.parse(day+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000);
  return diff===0?"today":diff===1?"tomorrow":diff===-1?"yesterday":diff>0?`in ${diff} days`:`${-diff} days ago`;
 };

 const handleDeadline=async(input:string)=>{
  const p=parseDeadline(input);
  if("error" in p)return send(chatId,p.error);
  if(!p.due){
   await setState("pick",{matches:[],ask:"deadlinewhen",text:p.title});
   return send(chatId,`When is “${preview(p.title)}” due?`,dateButtons("x:when"));
  }
  const s=await settingsRow();
  const iso=parseDate(p.due,s.tz);
  if(!iso)return send(chatId,`I couldn't read the date "${p.due}".`);
  const day=dayIn(s.tz,new Date(iso));
  const title=p.title.charAt(0).toUpperCase()+p.title.slice(1);
  const values:Record<string,unknown>={user_id:userId,title,due_date:day};
  if(p.priority)values.priority=p.priority;
  if(p.category)values.category=p.category;
  const {error}=await db.from("ws_deadlines").insert(values);
  if(error)return send(chatId,"I couldn't save that deadline: "+error.message);
  return send(chatId,`Deadline saved: ${title} · ${day} (${relative(day,dayIn(s.tz))})${p.priority?` · ${p.priority}`:""}${p.category?` · ${p.category.replace(/_/g," ")}`:""}`,[[b("📅 What's due","t:/due"),b("☰ Menu","t:/menu")]]);
 };

 const handleNote=async(input:string)=>{
  const p=parseNote(input);
  if("error" in p)return send(chatId,p.error);
  const {error}=await db.from("ws_notes").insert({user_id:userId,title:p.title,body:p.body,tags:p.tags,type:"general"});
  return send(chatId,error?"I couldn't save that note: "+error.message:`Note saved: ${p.title}${p.tags.length?" · #"+p.tags.join(" #"):""}`,[[b("📝 Another note","x:ask note"),b("☰ Menu","t:/menu")]]);
 };

 // Crossref for DOIs and the arXiv API for preprints fill in title, authors, year and venue.
 const lookupPaper=async(p:{doi:string|null;arxiv:string|null})=>{
  try{
   if(p.doi){
    const r=await fetch(`https://api.crossref.org/works/${encodeURIComponent(p.doi)}`,{headers:{"user-agent":"arun-workspace-bot/1.0"}});
    if(!r.ok)return null;
    const m=(await r.json()).message;
    return {title:String(m.title?.[0]??"").trim(),authors:(m.author??[]).map((a:{given?:string;family?:string;name?:string})=>[a.given,a.family].filter(Boolean).join(" ")||a.name||"").filter(Boolean),
     year:m.issued?.["date-parts"]?.[0]?.[0]??null,publication:m["container-title"]?.[0]??null};
   }
   if(p.arxiv){
    const r=await fetch(`https://export.arxiv.org/api/query?id_list=${p.arxiv}`);
    if(!r.ok)return null;
    const xml=await r.text();
    const entry=xml.split("<entry>")[1]??"";
    const title=(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]??"").replace(/\s+/g," ").trim();
    const authors=[...entry.matchAll(/<name>([^<]+)<\/name>/g)].map(x=>x[1].trim());
    const year=Number(entry.match(/<published>(\d{4})/)?.[1])||null;
    return title?{title,authors,year,publication:"arXiv"}:null;
   }
  }catch{/* fall back to what was typed */}
  return null;
 };

 const handlePaper=async(input:string)=>{
  const p=parsePaper(input);
  if("error" in p)return send(chatId,p.error);
  if(p.doi||p.arxiv){
   const {data:dup}=await db.from("ws_papers").select("title,status").eq("user_id",userId).eq(p.doi?"doi":"arxiv_id",p.doi??p.arxiv).limit(1).maybeSingle();
   if(dup)return send(chatId,`Already in your library: ${dup.title} (${String(dup.status).replace("_"," ")}).`);
  }
  const meta=await lookupPaper(p);
  const title=meta?.title||p.title||p.doi||p.arxiv||p.url;
  if(!title)return send(chatId,"I couldn't work out a title. Try /paper followed by the title.");
  const {error}=await db.from("ws_papers").insert({user_id:userId,title,authors:meta?.authors??[],year:meta?.year??null,publication:meta?.publication??null,
   doi:p.doi,arxiv_id:p.arxiv,url:p.url,status:"to_read"});
  if(error)return send(chatId,"I couldn't save that paper: "+error.message);
  const by=meta?.authors?.length?` — ${meta.authors[0]}${meta.authors.length>1?" et al.":""}`:"";
  return send(chatId,`Added to read: ${title}${by}${meta?.year?` (${meta.year})`:""}${!meta&&(p.doi||p.arxiv)?"\n(I couldn't fetch the details; edit them on the dashboard.)":""}`,[[b("📄 Another paper","x:ask paper"),b("☰ Menu","t:/menu")]]);
 };

 type LoanRow={id:string;account_name:string|null;account_type:string;direction:string;amount:number;currency:string;contact_id:string};
 const loanState=async()=>{
  const [{data:loans},{data:contacts},{data:pays},{data:txs}]=await Promise.all([
   db.from("ws_loans").select("id,account_name,account_type,direction,amount,currency,contact_id").eq("user_id",userId),
   db.from("ws_contacts").select("id,name").eq("user_id",userId),
   db.from("ws_loan_payments").select("loan_id,amount").eq("user_id",userId),
   db.from("ws_transactions").select("loan_id,kind,amount").eq("user_id",userId).not("loan_id","is",null),
  ]);
  const name=(l:LoanRow)=>l.account_name||((contacts??[]) as {id:string;name:string}[]).find(c=>c.id===l.contact_id)?.name||"Loan";
  return ((loans??[]) as LoanRow[]).map(l=>{
   const paid=((pays??[]) as {loan_id:string;amount:number}[]).filter(x=>x.loan_id===l.id).reduce((t,x)=>t+Number(x.amount),0);
   const charged=((txs??[]) as {loan_id:string;kind:string;amount:number}[]).filter(x=>x.loan_id===l.id).reduce((t,x)=>t+(x.kind==="expense"?1:x.kind==="income"?-1:0)*Number(x.amount),0);
   return {...l,name:name(l),left:Math.max(0,Math.round((Number(l.amount)+charged-paid)*100)/100)};
  });
 };
 const nextDue=async(today:string)=>{
  const until=new Date(Date.parse(today+"T12:00:00Z")+60*86400000).toISOString().slice(0,10);
  const {data}=await db.rpc("ws_agenda_for_user",{p_user:userId,p_from:new Date(Date.parse(today+"T12:00:00Z")-60*86400000).toISOString().slice(0,10),p_to:until});
  const out=new Map<string,{day:string;detail:string|null}>();
  for(const r of (data??[]) as {kind:string;ref_id:string;day:string;detail:string|null}[])
   if((r.kind==="emi"||r.kind==="card")&&!out.has(r.ref_id))out.set(r.ref_id,{day:r.day,detail:r.detail});
  return out;
 };

 const handlePaid=async(input:string)=>{
  const p=parsePaid(input);
  if("error" in p)return send(chatId,p.error);
  const s=await settingsRow();
  const loans=await loanState();
  const loan=matchByName(loans,p.loan);
  if(!loan)return send(chatId,`No loan or card called "${p.loan}". Yours: ${loans.map(l=>l.name).join(", ")||"none yet"}`);
  const paidOn=p.date?(()=>{const iso=parseDate(p.date!,s.tz);return iso?dayIn(s.tz,new Date(iso)):null})():dayIn(s.tz);
  if(!paidOn)return send(chatId,`I couldn't read the date "${p.date}".`);
  if(p.amount>loan.left&&loan.left>0)return send(chatId,`That's more than the ${money(loan.left,loan.currency)} left on ${loan.name}. Send the exact amount, or record it on the dashboard.`);
  const {error}=await db.from("ws_loan_payments").insert({user_id:userId,loan_id:loan.id,amount:p.amount,paid_on:paidOn,note:"Telegram"});
  if(error)return send(chatId,"I couldn't record that: "+error.message);
  const left=Math.max(0,Math.round((loan.left-p.amount)*100)/100);
  const next=(await nextDue(dayIn(s.tz))).get(loan.id);
  await clearState();
  return send(chatId,`Recorded ${money(p.amount,loan.currency)} ${loan.direction==="lent"?"from":"to"} ${loan.name} · ${left?`${money(left,loan.currency)} left`:"settled ✓"}${next&&left?`\nNext: ${next.day}${next.detail?` (${next.detail})`:""}`:""}`,[[b("💳 Loans","t:/loans"),b("☰ Menu","t:/menu")]]);
 };

 const handleLoans=async()=>{
  const s=await settingsRow();
  const today=dayIn(s.tz);
  const open=(await loanState()).filter(l=>l.left>0);
  if(!open.length)return send(chatId,"Nothing outstanding.");
  const due=await nextDue(today);
  const lines=open.map(l=>{
   const n=due.get(l.id);
   return `${l.direction==="lent"?"↙ owes you":"↗ you owe"} ${money(l.left,l.currency)} · ${l.name}${n?(n.day<today?` · ⚠️ overdue since ${n.day}`:` · next ${n.day} (${relative(n.day,today)})`):""}`;
  });
  return send(chatId,lines.join("\n")+"\n\nPaid something? Tap it.",open.slice(0,8).map(l=>[b(`💳 ${l.direction==="lent"?"Got paid by":"Pay"} ${l.name}`,`t:/payopts ${l.name}`)]));
 };

 const handleWeek=async()=>{
  const s=await settingsRow();
  const today=dayIn(s.tz);
  const dow=(new Date(today+"T12:00:00Z").getUTCDay()+6)%7;
  const monday=new Date(Date.parse(today+"T12:00:00Z")-dow*86400000).toISOString().slice(0,10);
  const until=new Date(Date.parse(today+"T12:00:00Z")+7*86400000).toISOString().slice(0,10);
  const [{data:done},{data:spent},{data:coming}]=await Promise.all([
   db.from("tasks").select("title").eq("user_id",userId).eq("status","Done").gte("completed_at",monday+"T00:00:00Z").is("deleted_at",null),
   db.from("ws_transactions").select("amount").eq("user_id",userId).eq("kind","expense").eq("currency",s.currency).gte("occurred_on",monday),
   db.rpc("ws_agenda_for_user",{p_user:userId,p_from:today,p_to:until}),
  ]);
  const doneRows=(done??[]) as {title:string}[];
  const total=((spent??[]) as {amount:number}[]).reduce((t,x)=>t+Number(x.amount),0);
  const next=((coming??[]) as {title:string;day:string}[]).slice(0,5);
  return send(chatId,[
   `Week of ${monday}`,
   `✓ ${doneRows.length} task${doneRows.length===1?"":"s"} done${doneRows.length?": "+doneRows.slice(0,5).map(t=>t.title).join("; ")+(doneRows.length>5?"…":""):""}`,
   `₹ Spent ${money(total,s.currency)} this week`,
   next.length?`Coming up:\n${next.map(r=>`  ${relative(r.day,today)} · ${r.title}`).join("\n")}`:"Nothing due in the next 7 days.",
   "",
   "The full review is on the dashboard (Weekly review).",
  ].join("\n"),[[b("✅ Habits","t:/habits"),b("📅 What's due","t:/due"),b("☰ Menu","t:/menu")]]);
 };

 // ---------- buttons and guided questions ----------
 const itemButtons=(e:BotEntity):Btn[][]=>[
  // Reads use their date field for "read on", which isn't something to schedule.
  [...(e.dateField&&e.key!=="reads"?[b(e.key==="reminders"?"⏰ When":e.key==="jobs"?"📅 Deadline":"📅 Due date","x:due")]:[]),...(e.priorityField?[b("⚡ Priority","x:pri")]:[])],
  [b("🏷 Tag","x:tag"),...(e.projectField?[b("📁 Project","x:proj")]:[])],
  [b("✓ That's all","t:done")],
 ].filter(r=>r.length);
 const refineState=async()=>{
  const st=await getState();
  return st?.kind==="refine"?st.payload as {entity:EntityKey;id:string;title:string;ask?:string;projects?:{id:string;name:string}[]}:null;
 };
 const menu=(intro:string)=>send(chatId,intro,[
  [b("➕ Task","x:ask task"),b("📝 Note","x:ask note"),b("⏰ Reminder","x:ask remind")],
  [b("💸 Spent","x:ask spend"),b("💰 Income","x:ask income"),b("💳 Pay a loan","t:/loans")],
  [b("✅ Habits","t:/habits"),b("📋 Today","t:/today"),b("📅 What's due","t:/due")],
  [b("🗓 Deadline","x:ask deadline"),b("📄 Paper","x:ask paper"),b("📊 My week","t:/week")],
  [b("🔍 Search","x:ask find"),b("❓ All commands","t:/help")],
 ]);
 const ASK:Record<string,string>={
  task:"What's the task? You can add when, e.g. “revise intro by friday”.",
  note:"What's the note? Add #tags if you like.",
  remind:"What should I remind you about, and when? e.g. “call Anna tomorrow 9am”.",
  spend:"How much, and what for? e.g. “450 groceries” or “1200 lunch card:amazon”.",
  income:"How much, and from what? e.g. “52000 salary”.",
  deadline:"What's the deadline, and when? e.g. “ISMB abstract friday”.",
  paper:"Send the DOI, arXiv id, link or title.",
  find:"What are you looking for?",
 };
 const dateButtons=(prefix:string)=>[
  [b("Today",`${prefix} today`),b("Tomorrow",`${prefix} tomorrow`),b("Friday",`${prefix} friday`)],
  [b("Next Monday",`${prefix} next monday`),b("In a week",`${prefix} in 1w`),b("✍️ Other date",`${prefix} ?`)],
 ];
 const afterSave=(e:BotEntity,title:string,lines:string)=>send(chatId,`Saved ${e.singular}: ${title}${lines}\n\nWant to add anything?`,itemButtons(e));

 // Typed answer to a question the bot asked ("What's the task?", "Which date?", "New tag name?").
 const answerAsk=async(ask:string,reply:string,st:{kind:string;payload:any}):Promise<Response>=>{
  if(st.kind==="refine"){
   const payload={...st.payload};delete payload.ask;
   const e=ENTITIES[payload.entity as EntityKey];
   await setState("refine",payload);
   if(ask==="due"){
    const alias=e.fields.find(f=>f.key===e.dateField)?.aliases[0]??"due";
    const res=await applyTokens(e,payload.id,`${alias}:"${reply.replace(/"/g,"")}"`,null);
    return send(chatId,res.ok&&res.summary&&!res.summary.includes("ignored")?`Updated — ${res.summary}`:`I couldn't read “${reply}” as a date. Try “tomorrow 3pm”, “friday” or “12/11”.`,itemButtons(e));
   }
   if(ask==="tag"){
    const tags=reply.split(/[,\s]+/).map(t=>t.replace(/^#/,"").toLowerCase().replace(/[^\p{L}\p{N}_-]/gu,"")).filter(Boolean);
    if(!tags.length)return send(chatId,"Type a tag name, e.g. urgent.");
    await attachTags(e,payload.id,tags);
    return send(chatId,`Tagged ${tags.map(t=>"#"+t).join(" ")}.`,itemButtons(e));
   }
  }
  await clearState();
  const w=extractWhen(reply);
  switch(ask){
   case "task":return handle(`/add ${w.text}${w.when?` due:"${w.when}"`:""}`);
   case "note":return handle(`/note ${reply}`);
   case "spend":return handle(`/spend ${reply}`);
   case "income":return handle(`/income ${reply}`);
   case "paper":return handle(`/paper ${reply}`);
   case "find":return handle(`/find ${reply}`);
   case "remind":
    if(w.when)return handle(`/remind ${w.text} due:"${w.when}"`);
    await setState("pick",{matches:[],ask:"remindwhen",text:reply});
    return send(chatId,`When should I remind you about “${preview(reply)}”?`,[
     [b("In 1 hour","x:when in 1h"),b("Tonight","x:when tonight"),b("Tomorrow 9am","x:when tomorrow 9am")],
     [b("Monday 9am","x:when next monday 9am"),b("✍️ Other time","x:when ?")],
    ]);
   case "deadline":
    if(w.when)return handle(`/deadline ${w.text} due:"${w.when}"`);
    await setState("pick",{matches:[],ask:"deadlinewhen",text:reply});
    return send(chatId,`When is “${preview(reply)}” due?`,dateButtons("x:when"));
   case "remindwhen":return handle(`/remind ${st.payload.text} due:"${reply}"`);
   case "deadlinewhen":return handle(`/deadline ${st.payload.text} due:"${reply}"`);
  }
  if(ask.startsWith("paid:"))return handle(`/paid ${ask.slice(5)} ${reply}`);
  return send(chatId,HELP);
 };

 const handle=async(text:string):Promise<Response>=>{
 // ---------- commands ----------
 if(text.startsWith("/")){
  const [cmd,...restParts]=text.split(/\s+/);
  const rest=text.slice(cmd.length).trim();
  const command=cmd.toLowerCase();

  if(command==="/help"){await syncMenu();return send(chatId,HELP,[[b("☰ Menu","t:/menu")]])}
  if(command==="/start"||command==="/menu"||command==="/hello"){
   await syncMenu();
   return menu(command==="/menu"?"What would you like to do?":"Hi! Tap a button, or just tell me in your own words — “spent 450 on lunch”, “read 30 min”, “remind me to call Anna tomorrow 9am”, “what's due this week?”.");
  }
  if(command==="/thanks")return send(chatId,"Any time 🙂",[[b("☰ Menu","t:/menu")]]);
  if(command==="/x"){
   const [action,...args]=rest.split(" ");
   const arg=args.join(" ");
   if(action==="ask"){
    if(!ASK[arg])return menu("What would you like to do?");
    await setState("pick",{matches:[],ask:arg});
    return send(chatId,ASK[arg]);
   }
   if(action==="when"){
    const st=await getState();
    const pending=st?.payload as {ask?:string;text?:string}|undefined;
    if(!pending?.ask||!pending.text)return menu("That question has expired. What would you like to do?");
    if(arg==="?"){await setState("pick",{matches:[],ask:pending.ask,text:pending.text});return send(chatId,"Type the date or time, e.g. “12/11 3pm” or “next tuesday”.")}
    return answerAsk(pending.ask,arg,{kind:"pick",payload:pending});
   }
   const item=await refineState();
   if(["due","setdue","pri","setpri","tag","settag","newtag","proj","setproj","finish"].includes(action)&&!item)
    return send(chatId,"Pick something first — /today, /list or /find — then try again.");
   if(item){
    const e=ENTITIES[item.entity];
    const apply=async(tokens:string)=>{
     const res=await applyTokens(e,item.id,tokens,null);
     await setState("refine",{entity:item.entity,id:item.id,title:item.title});
     return send(chatId,res.ok?(res.summary?`Updated — ${res.summary}`:"Nothing changed."):res.summary,itemButtons(e));
    };
    if(action==="finish"){
     const DONE:Partial<Record<EntityKey,Record<string,unknown>>>={tasks:{status:"Done"},publications:{stage:"Published"},jobs:{stage:"Closed"},reminders:{done:true},reads:{read_at:new Date().toISOString()}};
     if(!DONE[e.key])return send(chatId,`A ${e.singular} can't be marked done.`,itemButtons(e));
     const {error}=await db.from(e.table).update(DONE[e.key]!).eq("id",item.id);
     await clearState();
     return send(chatId,error?"I couldn't update that.":`Completed: ${item.title} ✓`,[[b("☰ Menu","t:/menu")]]);
    }
    if(action==="due")return send(chatId,e.key==="reminders"?`When should I remind you about “${preview(item.title)}”?`:`When is “${preview(item.title)}” due?`,dateButtons("x:setdue"));
    if(action==="setdue"){
     if(arg==="?"){await setState("refine",{...item,ask:"due"});return send(chatId,"Type the date, e.g. “12/11”, “next tuesday 3pm” or “2026-12-01”.")}
     const alias=e.fields.find(f=>f.key===e.dateField)?.aliases[0]??"due";
     return apply(`${alias}:"${arg}"`);
    }
    if(action==="pri")return send(chatId,"Which priority?",[[b("Low","x:setpri low"),b("Medium","x:setpri medium"),b("High","x:setpri high")]]);
    if(action==="setpri")return apply(`!${arg}`);
    if(action==="tag"){
     const {data}=await db.from("tags").select("name").eq("user_id",userId).is("deleted_at",null).order("name").limit(12);
     const names=((data??[]) as {name:string}[]).map(t=>t.name);
     const rows:Btn[][]=[];
     for(let i=0;i<names.length;i+=3)rows.push(names.slice(i,i+3).map(n=>b("#"+n,`x:settag ${n}`)));
     rows.push([b("➕ New tag","x:newtag")]);
     return send(chatId,names.length?"Which tag?":"You have no tags yet — make one:",rows);
    }
    if(action==="settag")return apply(`#${arg.replace(/\s+/g,"-")}`);
    if(action==="newtag"){await setState("refine",{...item,ask:"tag"});return send(chatId,"Type the new tag (one word, or several separated by commas).")}
    if(action==="proj"){
     const {data}=await db.from("projects").select("id,name").eq("user_id",userId).eq("status","Active").order("name").limit(10);
     const projects=(data??[]) as {id:string;name:string}[];
     await setState("refine",{...item,projects});
     return send(chatId,"Which project?",[...projects.map((p,i)=>[b(p.name,`x:setproj ${i}`)]),[b("📥 Inbox (no project)","x:setproj none")]]);
    }
    if(action==="setproj"&&e.projectField){
     const project=arg==="none"?null:item.projects?.[Number(arg)]??null;
     const {error}=await db.from(e.table).update({[e.projectField]:project?.id??null}).eq("id",item.id);
     await setState("refine",{entity:item.entity,id:item.id,title:item.title});
     return send(chatId,error?"I couldn't change the project.":`Moved to ${project?.name??"Inbox"}.`,itemButtons(e));
    }
   }
   if(action==="cat"||action==="card"){
    const st=await getState();
    const pending=st?.payload as {tx?:{id:string;kind:string};cats?:{id:string;name:string}[];cards?:{id:string;name:string;currency:string}[]}|undefined;
    if(!pending?.tx)return send(chatId,"That question has expired.");
    let filed="";
    if(action==="cat"&&arg!=="skip"){
     const cat=pending.cats?.[Number(arg)];
     if(cat){await db.from("ws_transactions").update({category_id:cat.id}).eq("id",pending.tx.id);filed=cat.name}
    }
    if(action==="card"&&arg!=="none"){
     const card=pending.cards?.[Number(arg)];
     if(card){
      const {error}=await db.from("ws_transactions").update({loan_id:card.id,currency:card.currency}).eq("id",pending.tx.id);
      await clearState();
      return send(chatId,error?"I couldn't link the card.":`Added to ${card.name}.`,[[b("💸 Another","x:ask spend"),b("☰ Menu","t:/menu")]]);
     }
    }
    if(action==="cat"&&pending.tx.kind==="expense"&&pending.cards?.length)
     return send(chatId,"Paid with a credit card?",[...pending.cards.map((c,i)=>[b(`💳 ${c.name}`,`x:card ${i}`)]),[b("No card","x:card none")]]);
    await clearState();
    return send(chatId,filed?`Filed under ${filed} 👍`:"Saved 👍",[[b(pending.tx.kind==="income"?"💰 Another":"💸 Another",pending.tx.kind==="income"?"x:ask income":"x:ask spend"),b("☰ Menu","t:/menu")]]);
   }
   if(action==="ask-remind")return answerAsk("remind",arg,{kind:"pick",payload:{}});
   if(action==="attach"){
    const item=await refineState();
    if(!item)return send(chatId,"That item is no longer open for editing.",[[b("☰ Menu","t:/menu")]]);
    const e=ENTITIES[item.entity];
    const noteField=e.fields.find(f=>["notes","body"].includes(f.key))?.key??null;
    const res=await applyTokens(e,item.id,arg,noteField);
    return send(chatId,res.ok?`Added to “${item.title}”.`:res.summary,itemButtons(e));
   }
   return menu("What would you like to do?");
  }
  if(command==="/payopts"){
   const loans=await loanState();
   const loan=matchByName(loans,rest);
   if(!loan)return send(chatId,`No loan called "${rest}".`);
   const {data:full}=await db.from("ws_loans").select("emi_amount,minimum_due,statement_amount").eq("id",loan.id).maybeSingle();
   const opts=[...new Set([Number(full?.emi_amount??0),Number(full?.minimum_due??0),Number(full?.statement_amount??0),loan.left].filter(v=>v>0&&v<=loan.left))];
   await setState("pick",{matches:[],ask:`paid:${loan.name}`});
   return send(chatId,`How much did you pay ${loan.direction==="lent"?"back from":"to"} ${loan.name}? (${money(loan.left,loan.currency)} left) — tap or type an amount.`,
    [opts.slice(0,4).map(v=>b(money(v,loan.currency),`t:/paid ${loan.name} ${v}`))]);
  }
  if(command==="/complete"){
   const term=rest.replace(/[%,]/g,"").trim();
   const {data}=await db.from("tasks").select("id,title").eq("user_id",userId).neq("status","Done").is("deleted_at",null).ilike("title",`%${term}%`).limit(6);
   const rows=(data??[]) as {id:string;title:string}[];
   if(rows.length===1){
    await db.from("tasks").update({status:"Done"}).eq("id",rows[0].id);
    return send(chatId,`Completed: ${rows[0].title} ✓`,[[b("📋 Today","t:/today")]]);
   }
   if(!rows.length)return send(chatId,`No open task matches “${term}”.`,[[b("📋 Show tasks","t:/today")]]);
   await setState("pick",{matches:rows.map(r=>({entity:"tasks",id:r.id,title:r.title}))});
   return send(chatId,"Which one did you finish?",rows.map((r,i)=>[b(`✓ ${preview(r.title)}`,`t:/done ${i+1}`)]));
  }
  if(command==="/deadline")return handleDeadline(rest);
  if(command==="/note")return handleNote(rest);
  if(command==="/paper")return handlePaper(rest);
  if(command==="/paid")return handlePaid(rest);
  if(command==="/loans")return handleLoans();
  if(command==="/week")return handleWeek();

  if(command==="/spend"||command==="/income")return handleSpend(command==="/income"?"income":"expense",rest);
  if(command==="/habit")return handleHabit(rest);
  if(command==="/habits")return handleHabits();
  if(command==="/due")return handleDue();

  // Create in any module
  const entity=BY_COMMAND[command];
  if(entity){
   if(!rest){await clearState();return send(chatId,`What should the ${entity.singular} be called? Send: ${entity.command} <title> #tag @project`)}

   const p=parseMessage(rest,entity,tz);
   const resolved=await resolveReferences(entity,p.fields);
   const values:Record<string,unknown>={user_id:userId,...resolved.values};
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
    if(body)values[entity.titleField]=body.charAt(0).toUpperCase()+body.slice(1);
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
   if(entity.dateField&&data[entity.dateField])bits.push(`${entity.key==="reminders"?"⏰":"📅"} ${friendly(String(data[entity.dateField]))}`);
   if(entity.priorityField&&values[entity.priorityField])bits.push(String(values[entity.priorityField]));
   bits.push(...resolved.notes);
   await setState("refine",{entity:entity.key,id:data.id,title});
   return afterSave(entity,title,`${bits.length?"\n"+bits.join(" · "):""}${projectNote}`);
  }

  if(command==="/today"){
   const rows=await listRows(ENTITIES.tasks);
   if(!rows.length){await clearState();return send(chatId,"No open tasks.")}
   await setState("pick",{matches:rows.map(r=>({entity:"tasks",id:r.id,title:titleOf(ENTITIES.tasks,r)}))});
   return send(chatId,rows.map((r,i)=>`${i+1}. ${titleOf(ENTITIES.tasks,r)} [${r.status}]`).join("\n")
    +"\n\nTap ✓ to complete one, or send its number to edit it.",
    [...rows.slice(0,8).map((r,i)=>[b(`✓ ${preview(titleOf(ENTITIES.tasks,r))}`,`t:/done ${i+1}`)]),[b("➕ New task","x:ask task")]]);
  }

  if(command==="/list"){
   const name=restParts[0]?.toLowerCase();
   const target=ENTITY_LIST.find(e=>e.key===name||e.singular===name||e.command==="/"+name);
   if(!target)return send(chatId,"Which module? "+ENTITY_LIST.map(e=>e.key).join(", "));
   const rows=await listRows(target);
   if(!rows.length){await clearState();return send(chatId,`Nothing open in ${target.key}.`)}
   await setState("pick",{matches:rows.map(r=>({entity:target.key,id:r.id,title:titleOf(target,r)}))});
   return send(chatId,rows.map((r,i)=>`${i+1}. ${titleOf(target,r)}`).join("\n")+"\n\nTap one to edit it.",
    rows.slice(0,8).map((r,i)=>[b(`✏️ ${preview(titleOf(target,r))}`,`t:${i+1}`)]));
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
   if(!matches.length){await clearState();return send(chatId,`Nothing matches “${term}”.`,[[b("☰ Menu","t:/menu")]])}
   await setState("pick",{matches});
   return send(chatId,matches.map((m,i)=>`${i+1}. ${m.title} — ${ENTITIES[m.entity].singular}`).join("\n")
    +"\n\nTap one to edit it.",matches.slice(0,8).map((m,i)=>[b(`✏️ ${preview(m.title)}`,`t:${i+1}`)]));
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
   return send(chatId,error?"I couldn't update that.":`Completed: ${target.title} ✓`,[[b("📋 Today","t:/today"),b("☰ Menu","t:/menu")]]);
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

  if(command==="/discover"){
   const {data:busy}=await db.from("discovery_runs").select("id")
     .eq("user_id",userId).in("status",["queued","running"])
     .gt("expires_at",new Date().toISOString()).maybeSingle();
   if(busy)return send(chatId,"A search is already running — I'll message you here when it's done.");

   const {data:prof}=await db.from("discovery_profiles").select("id")
     .eq("user_id",userId).eq("active",true).limit(1).maybeSingle();
   const token=crypto.randomUUID();
   const mode=rest?"search":"discovery";
   const {data:run,error:runErr}=await db.from("discovery_runs").insert({
    user_id:userId,profile_id:prof?.id??null,trigger:"telegram",status:"queued",
    run_mode:mode,query:rest||null,chat_id:chatId,claim_token:token,
    stats:{phase:"queued",dispatchTarget:"cloud_run"},
    expires_at:new Date(Date.now()+15*60*1000).toISOString(),
   }).select("id").maybeSingle();
   if(runErr||!run)return send(chatId,"I couldn't start a search right now.");

   const discoveryUrl=Deno.env.get("DISCOVERY_URL");
   const sharedSecret=Deno.env.get("DISCOVERY_SHARED_SECRET");
   if(!discoveryUrl||!sharedSecret){
    await db.from("discovery_runs").update({status:"failed",error:"no dispatch target configured"}).eq("id",run.id);
    return send(chatId,"Discovery isn't wired up yet — configure the Cloud Run DISCOVERY_URL and shared secret.");
   }
   // A single-use claim token makes retries replay-safe; the shared secret
   // prevents anyone outside the Edge Function from invoking the worker.
   EdgeRuntime.waitUntil((async()=>{
    try{
     const response=await fetch(discoveryUrl,{
      method:"POST",
      headers:{"content-type":"application/json","x-discovery-secret":sharedSecret},
      body:JSON.stringify({run_id:run.id,claim_token:token}),
     });
     if(!response.ok)await db.from("discovery_runs").update({
      status:"failed",finished_at:new Date().toISOString(),
      error:`Discovery worker returned HTTP ${response.status}`,
     }).eq("id",run.id);
    }catch(error){
     await db.from("discovery_runs").update({
      status:"failed",finished_at:new Date().toISOString(),
      error:error instanceof Error?error.message:"Discovery worker request failed",
     }).eq("id",run.id);
    }
   })());
   return send(chatId,`Searching${rest?` for "${rest}"`:""} — I'll message you here in a few minutes.`);
  }

  await clearState();
  return send(chatId,`I don't know ${command}.`,[[b("☰ Menu","t:/menu"),b("❓ All commands","t:/help")]]);
 }

 // ---------- conversational replies (no leading slash) ----------
 const state=await getState();

 // An answer to a question the bot just asked.
 const asked=(state?.payload as {ask?:string}|undefined)?.ask;
 if(state&&asked&&!isDone(text))return answerAsk(asked,text,state);
 if(state&&asked&&isDone(text)){await clearState();return send(chatId,"Okay, cancelled.",[[b("☰ Menu","t:/menu")]])}

 // Plain sentences: "spent 450 on lunch", "read 30 min", "what's due?". Numbers and yes/no still answer lists.
 if(state?.kind!=="ask_tag"&&!(state?.kind==="pick"&&/^\d+$/.test(text))){
  const [{data:hs},loans]=await Promise.all([
   db.from("ws_habits").select("name").eq("user_id",userId).is("archived_at",null),
   loanState(),
  ]);
  const intent=understand(text,{habits:((hs??[]) as {name:string}[]).map(h=>h.name),loans:loans.map(l=>l.name)});
  if(intent)return handle(intent.command);
 }

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
   return send(chatId,`Editing “${chosen.title}”. What would you like to change?`,[...itemButtons(ENTITIES[chosen.entity]).slice(0,-1),[b("✓ Mark done","x:finish"),b("Never mind","t:done")]]);
  }
  if(isDone(text)){await clearState();return send(chatId,"Okay.")}
  return send(chatId,"Tap one of the items above, or send its number.",[[b("Never mind","t:done")]]);
 }

 if(state?.kind==="refine"){
  const payload=state.payload as {entity:EntityKey;id:string;title:string};
  const e=ENTITIES[payload.entity];
  if(isDone(text)){await clearState();return send(chatId,"All set ✓",[[b("☰ Menu","t:/menu")]])}
  const noteField=e.fields.find(f=>["notes","body"].includes(f.key))?.key??null;
  // Plain words with no #tag, @project, !priority or field:value: ask rather than quietly attaching them.
  const tokens=parseMessage(text,e,tz);
  if(!tokens.tags.length&&tokens.project===null&&!Object.keys(tokens.fields).length&&!tokens.url&&!tokens.unknown.length){
   return send(chatId,`What should I do with “${preview(text)}”?`,[
    ...(noteField?[[b(`📎 Add to “${preview(payload.title).slice(0,28)}”`,"x:as attach")]]:[]),
    [b("➕ New task","x:as task"),b("📝 Note","x:as note"),b("⏰ Reminder","x:as remind")],
    [b("🔍 Search for it","x:as find"),b("☰ Menu","t:/menu")],
   ],replyTo);
  }
  const res=await applyTokens(e,payload.id,text,noteField);
  await setState("refine",payload);
  return send(chatId,res.ok?(res.summary?`Updated — ${res.summary}`:`Added that as a note.`):res.summary,itemButtons(e));
 }

 if(state?.kind==="read_confirm"){
  const payload=state.payload as ReadPayload;
  const urlInText=parseMessage(text,ENTITIES.reads,tz).url;
  if(urlInText){
   const parsed=parseMessage(text,ENTITIES.reads,tz);
   return offerRead(urlInText,parsed.tags,parsed.project);
  }
  await clearState();
  if(!isAffirmative(text))return send(chatId,"Okay, not saved.");
  return saveRead(payload);
 }

 if(state?.kind==="read_project"){
  const payload=state.payload as {url:string;tags:string[];options:{id:string;name:string}[]};
  const parsed=parseMessage(text,ENTITIES.reads,tz);
  if(parsed.url)return offerRead(parsed.url,parsed.tags,parsed.project);
  if(isDone(text)){await clearState();return send(chatId,"Okay, not saved.")}
  const value=text.trim().toLowerCase();
  const n=value==="inbox"||isAffirmative(value)?0:parseInt(value,10);
  if(!Number.isFinite(n)||n<0||n>payload.options.length)
   return send(chatId,`Reply 0 for Inbox, or 1–${payload.options.length} for a project.`);
  await clearState();
  const project=n===0?null:payload.options[n-1];
  return saveRead({url:payload.url,tags:payload.tags,projectId:project?.id??null,projectName:project?.name??null});
 }

 // ---------- no state: a bare link offers to save itself ----------
 const parsed=parseMessage(text,ENTITIES.reads,tz);
 if(parsed.url){
  return offerRead(parsed.url,parsed.tags,parsed.project);
 }
 // Not understood: offer what it could be instead of a wall of help.
 return send(chatId,`I'm not sure what to do with “${preview(text)}”. Save it as…`,[
  [b("➕ Task","x:as task"),b("📝 Note","x:as note"),b("⏰ Reminder","x:as remind")],
  [b("🔍 Search for it","x:as find"),b("☰ Menu","t:/menu")],
 ],replyTo);
 };

 return handle(text);
});

interface Btn { text:string; callback_data:string }

/** A button; callback data is capped at 64 bytes by Telegram, so longer ones are dropped. */
function b(text:string,data:string):Btn{
 return {text,callback_data:data};
}

async function tg(method:string,body:unknown){
 const token=Deno.env.get("TELEGRAM_BOT_TOKEN");
 try{return await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})}
 catch{return null}
}

async function send(chat_id:number,text:string,buttons?:Btn[][],replyTo?:number){
 const rows=(buttons??[]).map(r=>r.filter(x=>new TextEncoder().encode(x.callback_data).length<=64)).filter(r=>r.length);
 const r=await tg("sendMessage",{chat_id,text,
  ...(rows.length?{reply_markup:{inline_keyboard:rows}}:{}),
  ...(replyTo?{reply_parameters:{message_id:replyTo,allow_sending_without_reply:true}}:{}),
 });
 return json({ok:!!r?.ok});
}

/** What a tapped button means, as if typed: "t:…" is literal text, "x:…" an internal action. "x:as …" files the message it answered. */
function fromButton(data:string,answered:string):string{
 if(data.startsWith("t:"))return data.slice(2);
 if(data.startsWith("x:as ")){
  const what=data.slice(5);
  if(!answered)return "/menu";
  return what==="task"?`/add ${answered}`:what==="note"?`/note ${answered}`:what==="remind"?`/x ask-remind ${answered}`:what==="attach"?`/x attach ${answered}`:`/find ${answered}`;
 }
 if(data.startsWith("x:"))return `/x ${data.slice(2)}`;
 return "";
}

/** Keeps Telegram's "/" menu in step with what the bot understands. */
async function syncMenu(){
 const token=Deno.env.get("TELEGRAM_BOT_TOKEN");
 try{await fetch(`https://api.telegram.org/bot${token}/setMyCommands`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({commands:MENU})})}catch{/* menu is optional */}
}
