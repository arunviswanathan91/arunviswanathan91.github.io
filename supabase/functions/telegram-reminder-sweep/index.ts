import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

// Invoked every minute by a pg_cron job (via net.http_post) to push due reminders to
// Telegram. Authenticated with a shared secret, not the Telegram webhook secret — this
// endpoint is never called by Telegram itself.
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false},405);
 if(req.headers.get("x-cron-secret")!==Deno.env.get("CRON_SWEEP_SECRET"))return json({ok:false},401);
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const token=Deno.env.get("TELEGRAM_BOT_TOKEN");

 const {data:due,error}=await db.from("reminders").select("id,title,body,user_id")
  .lte("remind_at",new Date().toISOString()).eq("done",false).is("notified_at",null).limit(100);
 if(error)return json({ok:false,error:error.message},500);

 let sent=0;
 for(const reminder of due??[]){
  const {data:profile}=await db.from("profiles").select("telegram_chat_id").eq("id",reminder.user_id).maybeSingle();
  const chatId=profile?.telegram_chat_id as number|null;
  if(!chatId)continue;
  const text=`⏰ ${reminder.title}${reminder.body?`\n${reminder.body}`:""}`;
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text})});
  // Only mark notified on a confirmed send — a transient failure retries on the next sweep.
  if(r.ok){await db.from("reminders").update({notified_at:new Date().toISOString()}).eq("id",reminder.id);sent++}
 }
 return json({ok:true,checked:(due??[]).length,sent});
});
