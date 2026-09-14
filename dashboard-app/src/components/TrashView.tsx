import { useState } from "react";
import { Clock3, RotateCcw, Trash2 } from "lucide-react";
import { useData } from "../lib/store";

const TYPE_LABELS:Record<string,string>={
 project:"Project",task:"Task",publication:"Publication",document:"Document",
 application:"Job application",reminder:"Reminder",read:"Read",opportunity:"Opportunity",
 tag:"Tag",person:"Person",project_stage:"Project stage",project_link:"Project link",
 project_field:"Custom field",publication_node:"Publication step",
 publication_stage_event:"Publication stage change",
};
const dateTime=(value:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
const timeLeft=(value:string)=>{
 const days=Math.max(0,Math.ceil((new Date(value).getTime()-Date.now())/86_400_000));
 return days===0?"Deletes today":`${days} day${days===1?"":"s"} left`;
};

export function TrashView(){
 const {trashItems,restoreTrashItem,purgeTrashItem,emptyTrash}=useData();
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const run=async(id:string,action:()=>Promise<string|null>)=>{
  setBusy(id);setNotice("");
  const error=await action();
  if(error)setNotice(error);
  setBusy(null);
 };
 const clear=async()=>{
  if(!window.confirm("Delete everything in Trash permanently? This cannot be undone."))return;
  await run("all",emptyTrash);
 };

 return <div className="entity-view">
  <div className="view-head trash-head">
   <div><p className="kicker">Workspace</p><h1>Trash</h1>
    <p className="subtitle">Deleted items stay recoverable until their scheduled removal date.</p></div>
   {trashItems.rows.length>0&&<button className="danger-button" disabled={busy!==null} onClick={()=>void clear()}><Trash2/>Empty Trash</button>}
  </div>

  {trashItems.error&&<div className="data-notice" role="alert">
   Trash needs its one-time database setup. Run <code>supabase/trash.sql</code> in the Supabase SQL Editor.
  </div>}
  {notice&&<div className="data-notice" role="alert">{notice}</div>}

  {!trashItems.error&&trashItems.rows.length===0&&<div className="empty-state trash-empty">
   <Trash2/><p>Trash is empty.</p><small>Items you delete will appear here and can be restored.</small>
  </div>}

  <div className="trash-list">{trashItems.rows.map(item=><article className="trash-row" key={item.id}>
   <span className="trash-icon"><Trash2/></span>
   <div className="trash-copy"><div><span className="badge tone-slate">{TYPE_LABELS[item.item_type]??item.item_type}</span>
    <strong>{item.title}</strong></div>
    <small>Deleted {dateTime(item.deleted_at)}</small></div>
   <span className="trash-expiry"><Clock3/>{timeLeft(item.purge_at)}<small>{dateTime(item.purge_at)}</small></span>
   <div className="trash-actions">
    <button className="secondary" disabled={busy!==null} onClick={()=>void run(item.id,()=>restoreTrashItem(item.id))}><RotateCcw/>Restore</button>
    <button className="danger-button" disabled={busy!==null}
     onClick={()=>{if(window.confirm(`Delete “${item.title}” permanently?`))void run(item.id,()=>purgeTrashItem(item.id))}}><Trash2/>Delete forever</button>
   </div>
  </article>)}</div>
 </div>;
}
