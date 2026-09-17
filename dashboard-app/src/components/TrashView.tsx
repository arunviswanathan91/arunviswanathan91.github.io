import { useMemo, useState } from "react";
import { ChevronDown, Clock3, Layers3, RotateCcw, Trash2 } from "lucide-react";
import { useData } from "../lib/store";
import { useConfirmDialog } from "./ui/ConfirmDialog";

const TYPE_LABELS:Record<string,string>={
 project:"Project",task:"Task",publication:"Publication",document:"Document",
 application:"Job application",reminder:"Reminder",read:"Read",opportunity:"Opportunity",
 tag:"Tag",person:"Person",project_person:"Project person",project_stage:"Project stage",project_link:"Project link",
 project_field:"Custom field",publication_node:"Publication step",
 publication_stage_event:"Publication stage change",
};
const dateTime=(value:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
const timeLeft=(value:string)=>{
 const days=Math.max(0,Math.ceil((new Date(value).getTime()-Date.now())/86_400_000));
 return days===0?"Deletes today":`${days} day${days===1?"":"s"} left`;
};

export function TrashView(){
 const {trashItems,trashBatches,restoreTrashItem,purgeTrashItem,restoreTrashBatch,purgeTrashBatch,emptyTrash}=useData();
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const {ask,confirmation}=useConfirmDialog();
 const grouped=useMemo(()=>new Map(trashBatches.rows.map(batch=>[
  batch.id,trashItems.rows.filter(item=>item.batch_id===batch.id),
 ])),[trashBatches.rows,trashItems.rows]);
 const ungrouped=useMemo(()=>trashItems.rows.filter(item=>!item.batch_id),[trashItems.rows]);
 const setupError=trashItems.error||trashBatches.error;
 const run=async(id:string,action:()=>Promise<string|null>)=>{
  setBusy(id);setNotice("");
  const error=await action();
  if(error)setNotice(error);
  setBusy(null);
 };
 const clear=()=>ask({title:"Empty Trash permanently?",message:"Every item and restart group in Trash will be permanently deleted. This cannot be undone.",confirmLabel:"Delete everything"},
  ()=>run("all",emptyTrash).then(()=>{}));

 return <div className="entity-view">
  <div className="view-head trash-head">
   <div><p className="kicker">Workspace</p><h1>Trash</h1>
    <p className="subtitle">Deleted items stay recoverable until their scheduled removal date. Discovery restarts are kept together as dated groups.</p></div>
   {trashItems.rows.length>0&&<button className="danger-button" disabled={busy!==null} onClick={clear}><Trash2/>Empty Trash</button>}
  </div>

  {setupError&&<div className="data-notice" role="alert">
   Trash needs its latest database setup. Run <code>supabase/trash.sql</code> and <code>supabase/opportunity-reset.sql</code> in the Supabase SQL Editor.
  </div>}
  {notice&&<div className="data-notice" role="alert">{notice}</div>}

  {!setupError&&trashItems.rows.length===0&&<div className="empty-state trash-empty">
   <Trash2/><p>Trash is empty.</p><small>Items you delete or archive during a discovery restart will appear here.</small>
  </div>}

  <div className="trash-list">
   {trashBatches.rows.map(batch=>{
    const items=grouped.get(batch.id)??[];
    const count=items.length||Number(batch.item_count)||0;
    return <article className="trash-batch" key={batch.id}>
     <div className="trash-batch-head">
      <span className="trash-icon"><Layers3/></span>
      <div className="trash-copy"><div><span className="badge tone-violet">Restart group</span><strong>{batch.title}</strong></div>
       <small>Archived {dateTime(batch.deleted_at)} · {count} opportunit{count===1?"y":"ies"}</small></div>
      <span className="trash-expiry"><Clock3/>{timeLeft(batch.purge_at)}<small>{dateTime(batch.purge_at)}</small></span>
      <div className="trash-actions">
       <button className="secondary" disabled={busy!==null} onClick={()=>ask({
        title:`Restore ${count} opportunities?`,
        message:"The archived cards will return to Opportunities. If you already ran a new search, older and newer copies may both be visible.",
        confirmLabel:"Restore group",dangerous:false,
       },()=>run(batch.id,()=>restoreTrashBatch(batch.id)).then(()=>{}))}><RotateCcw/>Restore group</button>
       <button className="danger-button" disabled={busy!==null} onClick={()=>ask({
        title:"Delete restart group permanently?",message:`All ${count} archived opportunities in this group will be permanently deleted.`,confirmLabel:"Delete group forever",
       },()=>run(batch.id,()=>purgeTrashBatch(batch.id)).then(()=>{}))}><Trash2/>Delete group</button>
      </div>
     </div>
     <details className="trash-batch-items">
      <summary>View archived opportunities <ChevronDown/></summary>
      <div>{items.map(item=><div className="trash-batch-item" key={item.id}>
       <span className="badge tone-slate">{TYPE_LABELS[item.item_type]??item.item_type}</span><span>{item.title}</span>
      </div>)}</div>
     </details>
    </article>;
   })}

   {ungrouped.map(item=><article className="trash-row" key={item.id}>
    <span className="trash-icon"><Trash2/></span>
    <div className="trash-copy"><div><span className="badge tone-slate">{TYPE_LABELS[item.item_type]??item.item_type}</span>
     <strong>{item.title}</strong></div><small>Deleted {dateTime(item.deleted_at)}</small></div>
    <span className="trash-expiry"><Clock3/>{timeLeft(item.purge_at)}<small>{dateTime(item.purge_at)}</small></span>
    <div className="trash-actions">
     <button className="secondary" disabled={busy!==null} onClick={()=>void run(item.id,()=>restoreTrashItem(item.id))}><RotateCcw/>Restore</button>
     <button className="danger-button" disabled={busy!==null}
      onClick={()=>ask({title:"Delete permanently?",message:`“${item.title}” cannot be restored after this action.`,confirmLabel:"Delete forever"},
       ()=>run(item.id,()=>purgeTrashItem(item.id)).then(()=>{}))}><Trash2/>Delete forever</button>
    </div>
   </article>)}
  </div>
 {confirmation}</div>;
}
