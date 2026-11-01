import { useState } from "react";
import { Search } from "lucide-react";
import { lookupPaper } from "../../extended/modules/papers/lookup";
import { readFromMeta, sameLink, type ReadFill } from "../../lib/readLookup";
import { useEntityTable } from "../../lib/store";

/** "Fetch from DOI" for Reads: same lookup as adding a paper (Crossref, Europe PMC, DataCite). */
export function DoiFetch({onFill,currentId,disabled=false}:{onFill(fill:ReadFill):void;currentId?:string;disabled?:boolean}){
 const reads=useEntityTable("reads");
 const [ident,setIdent]=useState("");
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 const run=async()=>{
  setBusy(true);setMsg("");
  try{
   const fill=readFromMeta(await lookupPaper(ident));
   const dup=reads.rows.find(r=>r.id!==currentId&&sameLink(r.url,fill.url));
   onFill(fill);setIdent("");
   setMsg(dup?`Filled in. Note: this link is already saved as “${dup.title||dup.url}”.`:"Filled in. Check and edit anything before saving.");
  }catch(e){setMsg(`${(e as Error).message}. You can enter the details by hand.`)}
  finally{setBusy(false)}
 };
 return <div className="doi-fetch">
  <label className="field-label" htmlFor="doi-fetch-input">Fetch from DOI, PubMed id or arXiv id</label>
  <div className="doi-fetch-row">
   <input id="doi-fetch-input" className="input" value={ident} disabled={disabled||busy} placeholder="10.1038/… · 34265844 · 2401.12345 · or paste a link"
    onChange={e=>setIdent(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(ident.trim())void run()}}}/>
   <button type="button" className="secondary" disabled={disabled||busy||!ident.trim()} onClick={()=>void run()}><Search/>{busy?"Looking up…":"Fetch"}</button>
  </div>
  {msg&&<p className="doi-fetch-msg" role="status">{msg}</p>}
 </div>;
}
