import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

const HELP="Commands: /link <code>, /add <task> [#Project], /today, /done <number>, /job <organization> | <role> [#tag], /remind <text> [#tag] [in <N>m|h|d]. Share a link and I'll ask to save it to Reads.";

function extractTags(text:string):{clean:string;tags:string[]}{
 const tags:string[]=[];
 const clean=text.replace(/#([a-zA-Z0-9_]+)/g,(_m,t)=>{tags.push(String(t).toLowerCase());return ""}).replace(/\s+/g," ").trim();
 return {clean,tags};
}
function extractUrl(text:string):string|null{
 const m=text.match(/https?:\/\/\S+/i);
 return m?m[0].replace(/[.,)\]>]+$/,""):null;
}
function extractRelativeOffset(text:string):{clean:string;ms:number|null}{
 const m=text.match(/\bin\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)\b/i);
 if(!m||m.index===undefined)return {clean:text,ms:null};
 const n=parseInt(m[1],10),unit=m[2][0].toLowerCase();
 const ms=unit==="m"?n*60000:unit==="h"?n*3600000:n*86400000;
 return {clean:(text.slice(0,m.index)+text.slice(m.index+m[0].length)).replace(/\s+/g," ").trim(),ms};
}

Deno.serve(async(req)=>{
 if(req.method!=="POST") return json({ok:false},405);
 if(req.headers.get("x-telegram-bot-api-secret-token")!==Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) return json({ok:false},401);
 const update=await req.json();
 const message=update.message;
 if(!message?.chat?.id||!message?.text)return json({ok:true});
 const chatId=message.chat.id as number;
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

 async function findOrCreateTag(userId:string,name:string):Promise<string|null>{
  const {data:existing}=await db.from("tags").select("id").eq("user_id",userId).ilike("name",name).maybeSingle();
  if(existing)return existing.id as string;
  const {data}=await db.from("tags").insert({user_id:userId,name}).select("id").maybeSingle();
  return (data?.id as string)??null;
 }
 async function attachTags(userId:string,entityType:string,entityId:string,tagNames:string[]){
  for(const name of tagNames){
   const tagId=await findOrCreateTag(userId,name);
   if(tagId)await db.from("item_tags").insert({tag_id:tagId,entity_type:entityType,entity_id:entityId});
  }
 }
 async function setPendingRead(url:string,tags:string[]){
  await db.from("telegram_pending_confirmations").upsert({chat_id:chatId,kind:"read_confirm",payload:{url,tags},created_at:new Date().toISOString(),expires_at:new Date(Date.now()+10*60000).toISOString()},{onConflict:"chat_id"});
 }

 const text=String(message.text).trim();

 // Account linking has to work before a chat is linked, and via Telegram's own /start deep-link convention.
 if(text.startsWith("/link ")||text.startsWith("/start ")){
  const code=text.split(" ")[1]?.trim().toUpperCase();
  if(!code)return send(chatId,"Send /link CODE using the code shown in your dashboard Settings → Telegram.");
  const {data:linkRow}=await db.from("telegram_link_codes").select("id,user_id,expires_at,claimed_at").eq("code",code).maybeSingle();
  if(!linkRow||linkRow.claimed_at||new Date(linkRow.expires_at)<new Date())
   return send(chatId,"That code is invalid or expired. Generate a new one from the dashboard.");
  const {error}=await db.from("profiles").upsert({id:linkRow.user_id,telegram_chat_id:chatId},{onConflict:"id"});
  if(error)return send(chatId,error.code==="23505"?"This Telegram account is already linked to another dashboard profile.":"Could not link right now.");
  await db.from("telegram_link_codes").update({claimed_at:new Date().toISOString()}).eq("id",linkRow.id);
  return send(chatId,"Linked! Your Telegram is now connected to the dashboard.");
 }

 const {data:profile}=await db.from("profiles").select("id").eq("telegram_chat_id",chatId).maybeSingle();
 if(!profile)return send(chatId,"This Telegram account is not linked to the dashboard. Generate a code from the dashboard Settings → Telegram and send /link <code>.");
 const userId=profile.id as string;

 if(text.startsWith("/")){
  // A new command supersedes any pending "add to Reads?" confirmation.
  await db.from("telegram_pending_confirmations").delete().eq("chat_id",chatId);
  let reply=HELP;
  if(text.startsWith("/add ")){
   const raw=text.slice(5).trim();
   const hashIdx=raw.indexOf("#");
   const title=(hashIdx===-1?raw:raw.slice(0,hashIdx)).trim();
   const projectName=hashIdx===-1?null:raw.slice(hashIdx+1).trim();
   let projectId:string|null=null,note="";
   if(projectName){
    const {data:proj}=await db.from("projects").select("id,name").eq("user_id",userId).ilike("name",projectName).maybeSingle();
    if(proj)projectId=proj.id as string;
    else note=` I could not find a project named "${projectName}" — added to Inbox instead.`;
   }
   const {error}=await db.from("tasks").insert({user_id:userId,title,project_id:projectId,source:"telegram"});
   reply=error?"I could not add that task.":`Task added to ${projectId?`"${projectName}"`:"your Inbox"} backlog.${note}`;
  } else if(text==="/today"){
   const {data}=await db.from("tasks").select("title,status").eq("user_id",userId).neq("status","Done").order("created_at").limit(10);
   reply=data?.length?data.map((x:any,i:number)=>`${i+1}. ${x.title} [${x.status}]`).join("\n"):"No open tasks.";
  } else if(text.startsWith("/done ")){
   const n=parseInt(text.slice(6).trim(),10);
   const {data}=await db.from("tasks").select("id,title").eq("user_id",userId).neq("status","Done").order("created_at").limit(10);
   const target=data&&n>=1&&n<=data.length?data[n-1]:null;
   if(!target)reply="No matching task. Send /today to see the current numbered list.";
   else{const {error}=await db.from("tasks").update({status:"Done"}).eq("id",target.id);reply=error?"I could not update that task.":`Marked "${target.title}" as done.`}
  } else if(text.startsWith("/job ")){
   const {clean,tags}=extractTags(text.slice(5));
   const [organization,role]=clean.split("|").map((x:string)=>x.trim());
   if(!organization||!role)reply="Use: /job Organization | Role #tag";
   else{
    const {data,error}=await db.from("job_applications").insert({user_id:userId,organization,role}).select("id").maybeSingle();
    if(error)reply="I could not save that job.";
    else{if(data&&tags.length)await attachTags(userId,"job_application",data.id as string,tags);reply="Job saved to your tracker."+(tags.length?` Tags: ${tags.join(", ")}.`:"")}
   }
  } else if(text.startsWith("/remind ")){
   const {clean:withoutOffset,ms}=extractRelativeOffset(text.slice(8));
   const {clean:title,tags}=extractTags(withoutOffset);
   if(!title)reply="Use: /remind <text> #tag in 2h";
   else{
    const remindAt=ms!=null?new Date(Date.now()+ms).toISOString():null;
    const {data,error}=await db.from("reminders").insert({user_id:userId,title,remind_at:remindAt}).select("id").maybeSingle();
    if(error)reply="I could not save that reminder.";
    else{if(data&&tags.length)await attachTags(userId,"reminder",data.id as string,tags);reply=remindAt?`Reminder set for ${new Date(remindAt).toLocaleString()}.`:"Reminder saved — set a time for it from the dashboard to get a push."}
   }
  }
  return send(chatId,reply);
 }

 // No command: continue or start a "save this link to Reads?" confirmation.
 const {data:pending}=await db.from("telegram_pending_confirmations").select("payload,expires_at").eq("chat_id",chatId).maybeSingle();
 const pendingActive=!!pending&&new Date(pending.expires_at)>new Date();
 const url=extractUrl(text);
 if(pendingActive&&url){
  const {tags}=extractTags(text);
  await setPendingRead(url,tags);
  return send(chatId,`Replacing the pending link — add this to Reads instead?\n${url}\n(yes/no)`);
 }
 if(pendingActive){
  const answer=text.toLowerCase();
  const payload=pending!.payload as {url:string;tags:string[]};
  await db.from("telegram_pending_confirmations").delete().eq("chat_id",chatId);
  if(answer!=="yes"&&answer!=="y")return send(chatId,"Okay, not saved.");
  const {data,error}=await db.from("reads").insert({user_id:userId,url:payload.url}).select("id").maybeSingle();
  if(error||!data)return send(chatId,"I could not save that link.");
  if(payload.tags?.length)await attachTags(userId,"read",data.id as string,payload.tags);
  return send(chatId,`Saved to Reads: ${payload.url}`);
 }
 if(url){
  const {tags}=extractTags(text);
  await setPendingRead(url,tags);
  return send(chatId,`Add this to Reads?\n${url}${tags.length?`\nTags: ${tags.join(", ")}`:""}\n(yes/no)`);
 }
 return send(chatId,HELP);
});

async function send(chat_id:number,text:string){
 const token=Deno.env.get("TELEGRAM_BOT_TOKEN");
 const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id,text})});
 return json({ok:r.ok});
}
