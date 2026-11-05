import { secretMatches } from "../_shared/secret.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAlertsFor } from "../_shared/alerts.ts";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

// Invoked every minute by a pg_cron job (via net.http_post) to push due reminders to
// Telegram. Authenticated with a shared secret, not the Telegram webhook secret — this
// endpoint is never called by Telegram itself.
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false},405);
 if(!await secretMatches(req.headers.get("x-cron-secret"),Deno.env.get("CRON_SWEEP_SECRET")))return json({ok:false},401);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const token=Deno.env.get("TELEGRAM_BOT_TOKEN");

 // The same scheduled sweep also enforces each user's 14/30-day Trash policy.
 // Ignore "function not found" until the one-time trash.sql migration is applied.
 await db.rpc("purge_expired_trash");
 // Queues loan and habit reminders (card-spending-habit-periods-reminders.sql); a no-op until that migration runs.
 await db.rpc("ws_daily_nudges");

 // Once a day per user, from 06:00 their time: new papers and funding calls (alerts.sql). Then the
 // morning briefing, so it can mention them. Both are no-ops until alerts.sql has been run.
 const alertReport=await dailyAlerts(db);
 await db.rpc("ws_morning_briefing");

 // opportunity_id only exists once opportunity-deadline-reminders.sql has been
 // run; this Edge Function redeploys and starts polling on every push
 // regardless of whether that optional one-time migration has happened yet,
 // so a column-not-found here must degrade instead of breaking every other
 // reminder type. Retry without it rather than fail the whole sweep.
 let due:any[]|null=null;
 let error:{message:string}|null=null;
 {
  const wide=await db.from("reminders").select("id,title,body,user_id,project_id,task_id,person_id,opportunity_id")
   .lte("remind_at",new Date().toISOString()).eq("done",false).is("notified_at",null).limit(100);
  if(wide.error&&/column .*opportunity_id.* does not exist/i.test(wide.error.message)){
   const narrow=await db.from("reminders").select("id,title,body,user_id,project_id,task_id,person_id")
    .lte("remind_at",new Date().toISOString()).eq("done",false).is("notified_at",null).limit(100);
   due=narrow.data;error=narrow.error;
  } else { due=wide.data;error=wide.error; }
 }
 if(error)return json({ok:false,error:error.message},500);

 let sent=0;
 for(const reminder of due??[]){
  const {data:profile}=await db.from("profiles").select("telegram_chat_id").eq("id",reminder.user_id).maybeSingle();
  const chatId=profile?.telegram_chat_id as number|null;
  if(!chatId)continue;
  let contact="";
  if(reminder.person_id){
   const {data:person}=await db.from("people").select("name,email,telegram_handle").eq("id",reminder.person_id).maybeSingle();
   if(person)contact=[person.name,person.email,person.telegram_handle?`@${String(person.telegram_handle).replace(/^@/,"")}`:null].filter(Boolean).join(" · ");
  }
  const text=`⏰ ${reminder.title}${reminder.body?`\n${reminder.body}`:""}${contact?`\nContact: ${contact}`:""}\n\nThis reminder was sent only to you.`;
  const base=Deno.env.get("DASHBOARD_URL")??"https://arunviswanathan91.github.io/dashboard/";
  const root=base.replace(/#.*$/,"").replace(/\/$/,"");
  const url=reminder.project_id?`${root}/#/project/${reminder.project_id}`
   :/^Good morning/.test(reminder.title)?`${root}/#/tools/home`
   :/^New papers for you/.test(reminder.title)?`${root}/#/tools/papers?status=alerts`
   :/^(EMI|Card payment)/.test(reminder.title)?`${root}/#/tools/loans`
   :/^Habits still open/.test(reminder.title)?`${root}/#/tools/habits`
   :reminder.opportunity_id?`${root}/#/opportunities`
   :`${root}/#/reminders`;
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
   chat_id:chatId,text,reply_markup:{inline_keyboard:[[{text:"Open workspace",url}]]},
  })});
  // Only mark notified on a confirmed send — a transient failure retries on the next sweep.
  if(r.ok){await db.from("reminders").update({notified_at:new Date().toISOString()}).eq("id",reminder.id);sent++}
 }
 return json({ok:true,checked:(due??[]).length,sent,alerts:alertReport});
});

// deno-lint-ignore no-explicit-any
async function dailyAlerts(db:any){
 const {data:rows,error}=await db.from("ws_settings").select("user_id,timezone,briefing_time,paper_alert_topics,funding_topics,funding_feeds,paper_alerts_checked_on");
 if(error)return {skipped:error.message};
 let ran=0;
 for(const s of rows??[]){
  const wants=(s.paper_alert_topics??[]).length||(s.funding_topics??[]).length||(s.funding_feeds??[]).length;
  if(!wants)continue;
  const {data:profile}=await db.from("profiles").select("timezone").eq("id",s.user_id).maybeSingle();
  const tz=profile?.timezone??s.timezone??"Asia/Kolkata";
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map((p)=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  if(s.paper_alerts_checked_on===today||Number(parts.hour)<6)continue;
  if(ran>=3)break; // a few users per minute keeps each sweep short
  ran++;
  const report=await runAlertsFor(db,s.user_id,s);
  // Without a morning briefing, say it directly when there is something new.
  if(!s.briefing_time&&report.papers>0){
   const {data:top}=await db.from("ws_paper_alerts").select("title").eq("user_id",s.user_id).eq("status","new").order("score",{ascending:false}).limit(3);
   await db.from("reminders").insert({user_id:s.user_id,title:`New papers for you (${report.papers})`,body:(top??[]).map((t:{title:string})=>`• ${t.title}`).join("\n"),remind_at:new Date().toISOString(),done:false,nudge_key:`papers:${today}`});
  }
 }
 return {ran};
}
