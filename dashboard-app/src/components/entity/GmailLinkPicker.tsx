import { useState } from "react";
import { Mail, Search } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { Modal } from "../ui/Modal";

interface Hit{threadId:string;subject:string;from:string;date:string;snippet:string}
type Status="idle"|"not_connected"|"error";

/**
 * Read-only Gmail search, scoped to metadata (subject/from/date/snippet) --
 * never a message body. Picking a hit builds the Gmail permalink and hands it
 * back; nothing here writes to Gmail or stores the message content itself,
 * only the link. `#all/` (not `#inbox/`) so the link still works after the
 * email gets archived — the one thing worth knowing is that a link that lands
 * on a Google account other than the browser's first signed-in one (u/0) may
 * open the wrong mailbox; that's a Gmail URL-scheme limitation, not this code.
 */
export function GmailLinkPicker({initialQuery,onPick,onClose}:{
 initialQuery:string;onPick(url:string):void;onClose():void;
}){
 const [query,setQuery]=useState(initialQuery);
 const [hits,setHits]=useState<Hit[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<Status>("idle");

 const search=async()=>{
  if(!supabase||!query.trim())return;
  setBusy(true);setStatus("idle");setHits(null);
  try{
   const {data,error}=await supabase.functions.invoke<{hits:Hit[]}>("gmail-search",{body:{query:query.trim()}});
   if(error){
    if(error instanceof FunctionsHttpError){
     const body=await error.context.json().catch(()=>null);
     setStatus(body?.error==="not_connected"?"not_connected":"error");
    }else setStatus("error");
   }else setHits(data?.hits??[]);
  } finally { setBusy(false) }
 };

 const connect=async()=>{
  if(!supabase)return;
  const {data}=await supabase.functions.invoke<{url:string}>("gmail-oauth-start");
  if(data?.url)window.open(data.url,"_blank","noopener,noreferrer");
 };

 return <Modal title="Find in Gmail" kicker="Decision email" onClose={onClose}>
  <div className="gmail-picker">
   <div className="gmail-picker-search">
    <input className="input" value={query} onChange={e=>setQuery(e.target.value)} autoFocus
     placeholder="Journal name, paper title…"
     onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void search()}}}/>
    <button className="primary" onClick={()=>void search()} disabled={busy||!query.trim()}>
     <Search/>{busy?"Searching…":"Search"}
    </button>
   </div>

   {status==="not_connected"&&<div className="gmail-picker-connect">
    <p>Gmail isn't connected yet.</p>
    <button className="secondary" onClick={()=>void connect()}><Mail/>Connect Gmail</button>
    <small className="muted-note">A Google tab opens to approve access — come back and search again after.</small>
   </div>}
   {status==="error"&&<p className="data-notice" role="alert">Search failed — try again in a moment.</p>}

   {hits&&hits.length===0&&status==="idle"&&<p className="muted-note">No matching emails.</p>}
   {hits&&hits.length>0&&<ul className="gmail-hits">
    {hits.map(h=><li key={h.threadId}>
     <button type="button" className="gmail-hit"
      onClick={()=>{onPick(`https://mail.google.com/mail/u/0/#all/${h.threadId}`);onClose()}}>
      <span className="gmail-hit-subject clamp-1">{h.subject}</span>
      <span className="gmail-hit-meta clamp-1">{h.from} · {h.date}</span>
      <span className="gmail-hit-snippet clamp-1">{h.snippet}</span>
     </button>
    </li>)}
   </ul>}
  </div>
 </Modal>;
}
