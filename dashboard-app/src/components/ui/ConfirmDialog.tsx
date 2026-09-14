import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";

interface ConfirmOptions{
 title:string;
 message:string;
 confirmLabel?:string;
 dangerous?:boolean;
}
interface Request extends ConfirmOptions{action:()=>void|Promise<void>}

/** In-app confirmation that stays inside the dashboard and inherits its theme. */
export function useConfirmDialog(){
 const [request,setRequest]=useState<Request|null>(null);
 const [busy,setBusy]=useState(false);
 const ask=useCallback((options:ConfirmOptions,action:()=>void|Promise<void>)=>setRequest({...options,action}),[]);
 const close=()=>{if(!busy)setRequest(null)};
 const accept=async()=>{
  if(!request||busy)return;
  setBusy(true);
  try{await request.action();setRequest(null)}finally{setBusy(false)}
 };
 const confirmation=request?<Modal kicker="Please confirm" title={request.title} size="md" onClose={close}
  footer={dismiss=><>
   <button type="button" className="secondary" disabled={busy} onClick={dismiss}>Cancel</button>
   <button type="button" className={request.dangerous===false?"primary":"danger-button"} disabled={busy} onClick={()=>void accept()}>
    {busy?"Working…":request.confirmLabel??"Confirm"}
   </button>
  </>}>
  <div className="confirm-copy"><span className="confirm-icon"><AlertTriangle/></span><p>{request.message}</p></div>
 </Modal>:null;
 return {ask,confirmation};
}
