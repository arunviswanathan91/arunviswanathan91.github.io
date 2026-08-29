import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method!=="POST") return json({ok:false},405);
 if(req.headers.get("x-telegram-bot-api-secret-token")!==Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) return json({ok:false},401);
 const update=await req.json(); const message=update.message; if(!message?.chat?.id||!message?.text)return json({ok:true});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:profile}=await db.from("profiles").select("id").eq("telegram_chat_id",message.chat.id).maybeSingle();
 if(!profile)return send(message.chat.id,"This Telegram account is not linked to the dashboard.");
 const text=String(message.text).trim(); let reply="Commands: /add <task>, /today, /done <number>, /job <organization> | <role>";
 if(text.startsWith("/add ")){const title=text.slice(5).trim();const {error}=await db.from("tasks").insert({user_id:profile.id,title,source:"telegram"});reply=error?"I could not add that task.":"Task added to your Kanban backlog."}
 else if(text==="/today"){const {data}=await db.from("tasks").select("title,status").eq("user_id",profile.id).neq("status","Done").order("created_at").limit(10);reply=data?.length?data.map((x:any,i:number)=>`${i+1}. ${x.title} [${x.status}]`).join("\n"):"No open tasks."}
 else if(text.startsWith("/job ")){const [organization,role]=text.slice(5).split("|").map((x:string)=>x.trim());if(!organization||!role)reply="Use: /job Organization | Role";else{const {error}=await db.from("job_applications").insert({user_id:profile.id,organization,role});reply=error?"I could not save that job.":"Job saved to your tracker."}}
 return send(message.chat.id,reply);
});
async function send(chat_id:number,text:string){const token=Deno.env.get("TELEGRAM_BOT_TOKEN");const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id,text})});return json({ok:r.ok});}
