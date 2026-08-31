import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { supabase } from "../lib/supabase";

const CODE_CHARS="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(){
 const bytes=new Uint8Array(6);
 crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>CODE_CHARS[b%CODE_CHARS.length]).join("");
}

export function TelegramSettingsView({userId,chatId,onRefresh}:{userId:string;chatId:number|null;onRefresh:()=>void}){
 const [code,setCode]=useState<string|null>(null);
 const [expiresAt,setExpiresAt]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const generate=async()=>{
  if(!supabase)return;
  setBusy(true);setNotice("");
  const now=new Date().toISOString();
  await supabase.from("telegram_link_codes").delete().eq("user_id",userId).or(`claimed_at.not.is.null,expires_at.lt.${now}`);
  const next=generateCode();
  const expires=new Date(Date.now()+15*60*1000).toISOString();
  const {error}=await supabase.from("telegram_link_codes").insert({user_id:userId,code:next,expires_at:expires});
  setBusy(false);
  if(error){setNotice(error.message);return}
  setCode(next);setExpiresAt(expires);
 };
 return <>
  <div className="title-row"><div><p className="kicker">Settings</p><h1>Telegram</h1><p className="subtitle">Link your Telegram account to add tasks, jobs, reminders and reads from the bot.</p></div></div>
  <div className="settings-stack">
   <section className="card telegram-status">
    <div className="card-head"><div><p className="kicker">Status</p><h2>{chatId?"Linked":"Not linked"}</h2></div><button className="secondary" onClick={onRefresh}><RefreshCw size={14}/>Refresh status</button></div>
    {chatId?<p>Your dashboard is connected to Telegram chat #{chatId}.</p>:<p>Generate a code below and send it to the bot to link your account.</p>}
   </section>
   <section className="card">
    <div className="card-head"><div><p className="kicker">Link a new device</p><h2>Generate a code</h2></div><button className="primary" onClick={generate} disabled={busy}>Generate code</button></div>
    {code&&<div className="bot-command"><Send size={15}/><div><code>/link {code}</code><small>Send this to the bot before {expiresAt&&new Date(expiresAt).toLocaleTimeString()}.</small></div></div>}
    {notice&&<p className="data-notice" role="alert">{notice}</p>}
   </section>
  </div>
 </>
}
