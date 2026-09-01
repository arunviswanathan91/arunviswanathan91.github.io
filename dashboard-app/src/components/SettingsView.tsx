import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, RefreshCw, Send, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useData } from "../lib/store";
import { TAG_COLORS } from "../lib/tags";

const CODE_CHARS="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateCode=()=>{
 const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>CODE_CHARS[b%CODE_CHARS.length]).join("");
};

export function SettingsView(){
 const {userId,projects,tags,chatId,refreshTelegram,deleteProject}=useData();
 const [code,setCode]=useState<string|null>(null);
 const [expiresAt,setExpiresAt]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [displayName,setDisplayName]=useState("");
 const [names,setNames]=useState<Record<string,string>>({});

 useEffect(()=>{
  if(!supabase)return;
  void supabase.from("profiles").select("display_name").eq("id",userId).maybeSingle()
   .then(({data})=>setDisplayName((data?.display_name as string|null)??""));
 },[userId]);

 const saveName=async()=>{
  if(!supabase)return;
  await supabase.from("profiles").update({display_name:displayName.trim()||null}).eq("id",userId);
 };

 const generate=async()=>{
  if(!supabase)return;
  setBusy(true);setNotice("");
  const now=new Date().toISOString();
  await supabase.from("telegram_link_codes").delete().eq("user_id",userId).or(`claimed_at.not.is.null,expires_at.lt.${now}`);
  const next=generateCode(),expires=new Date(Date.now()+15*60*1000).toISOString();
  const {error}=await supabase.from("telegram_link_codes").insert({user_id:userId,code:next,expires_at:expires});
  setBusy(false);
  if(error){setNotice(error.message);return}
  setCode(next);setExpiresAt(expires);
 };

 return <div className="entity-view">
  <div className="view-head">
   <div><p className="kicker">Settings</p><h1>Workspace</h1><p className="subtitle">Profile, Telegram, projects and tags.</p></div>
  </div>

  <div className="settings-grid">
   <section className="panel">
    <header className="panel-head"><h2>Profile</h2></header>
    <div className="field">
     <label className="field-label" htmlFor="display-name">Display name</label>
     <input id="display-name" className="input" value={displayName} placeholder="Your name"
      onChange={e=>setDisplayName(e.target.value)} onBlur={()=>void saveName()}/>
    </div>
   </section>

   <section className="panel">
    <header className="panel-head">
     <h2>Telegram</h2>
     <button className="secondary" onClick={()=>void refreshTelegram()}><RefreshCw/>Refresh</button>
    </header>
    <p className={chatId?"status-ok":"muted-note"}>{chatId?`Linked to chat #${chatId}.`:"Not linked yet."}</p>
    <button className="primary" onClick={()=>void generate()} disabled={busy}>Generate linking code</button>
    {code&&<div className="bot-command"><Send/><div><code>/link {code}</code>
     <small>Send this to your bot before {expiresAt&&new Date(expiresAt).toLocaleTimeString()}.</small></div></div>}
    {notice&&<p className="data-notice" role="alert">{notice}</p>}
   </section>

   <section className="panel">
    <header className="panel-head"><h2>Projects</h2></header>
    <div className="manage-list">
     {projects.rows.map(p=><div className="manage-row" key={p.id}>
      <input className="input input-compact" value={names[p.id]??p.name}
       aria-label={`Rename ${p.name}`}
       onChange={e=>setNames(v=>({...v,[p.id]:e.target.value}))}
       onBlur={()=>{const n=(names[p.id]??p.name).trim();if(n&&n!==p.name)void projects.update(p.id,{name:n})}}/>
      <select className="input input-compact tint-select" value={p.color??""} aria-label={`${p.name} colour`}
       onChange={e=>void projects.update(p.id,{color:e.target.value||null})}>
       <option value="">No colour</option>
       {TAG_COLORS.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <button className="icon-button" title={p.status==="Active"?"Archive":"Restore"}
       onClick={()=>void projects.update(p.id,{status:p.status==="Active"?"Archived":"Active"})}>
       {p.status==="Active"?<Archive/>:<ArchiveRestore/>}</button>
      <button className="icon-button" title="Delete project"
       onClick={()=>{if(window.confirm(`Delete “${p.name}”? Its records move to Inbox.`))void deleteProject(p.id)}}>
       <Trash2/></button>
     </div>)}
     {!projects.rows.length&&<p className="muted-note">No projects yet.</p>}
    </div>
   </section>

   <section className="panel">
    <header className="panel-head"><h2>Tags</h2></header>
    <div className="manage-list">
     {tags.tags.map(t=><div className="manage-row" key={t.id}>
      <input className="input input-compact" defaultValue={t.name} aria-label={`Rename ${t.name}`}
       onBlur={e=>{const n=e.target.value.trim();if(n&&n!==t.name)void tags.rename(t.id,n)}}/>
      <select className="input input-compact tint-select" value={t.color??""} aria-label={`${t.name} colour`}
       onChange={e=>void tags.recolor(t.id,e.target.value||null)}>
       <option value="">No colour</option>
       {TAG_COLORS.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <small className="muted-note">{tags.usage.get(t.id)??0} uses</small>
      <button className="icon-button" title="Delete tag"
       onClick={()=>{if(window.confirm(`Delete “${t.name}”? It will be removed from ${tags.usage.get(t.id)??0} record(s).`))void tags.destroy(t.id)}}>
       <Trash2/></button>
     </div>)}
     {!tags.tags.length&&<p className="muted-note">No tags yet — add one from any record.</p>}
    </div>
   </section>
  </div>
 </div>;
}
