import { useState } from "react";
import { BookCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useData } from "../../lib/store";
import { supabase } from "../../lib/supabase";
import { refreshLibrary, sameArticle, useLibrary } from "../../lib/libraryLinks";
import { publishedLink, publishedOf, publishedSource, type Published } from "../../lib/published";
import { lookupPaper } from "../../extended/modules/papers/lookup";
import type { Row } from "../../entities/types";

/** The final paper: fetched from its DOI (or PubMed id) and kept beside the manuscript's own record. */
export function PublishedVersion({publication,canEdit}:{publication:Row;canEdit:boolean}){
 const {tables}=useData();
 const library=useLibrary();
 const saved=publishedOf(publication);
 const [id,setId]=useState(""),[found,setFound]=useState<Published|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [markPublished,setMarkPublished]=useState(true);
 const inLibrary=saved?library.papers.find(p=>sameArticle(p,saved)):undefined;

 const fetchIt=async(raw:string)=>{
  if(!raw.trim())return;
  setBusy(true);setMessage("");setFound(null);
  try{
   const m=await lookupPaper(raw);
   if(!m.title)throw new Error("Nothing was found for that identifier.");
   setFound({title:m.title.replace(/\s+/g," ").trim(),authors:m.authors??[],journal:m.publication??null,year:m.year??null,
    doi:m.doi??null,pmid:m.pmid??null,url:m.url??null,fetched_at:new Date().toISOString()});
  }catch(e){setMessage(e instanceof Error?e.message:"The lookup failed.")}
  finally{setBusy(false)}
 };
 const save=async()=>{
  if(!found)return;
  const link=publishedLink(found);
  // The manuscript's own DOI, link and venue are filled where empty; a working title is never overwritten.
  await tables.publications.update(publication.id,{published:found,
   ...(found.doi?{doi:found.doi}:{}),...(!publication.url&&link?{url:link}:{}),...(!publication.venue&&found.journal?{venue:found.journal}:{}),
   ...(markPublished&&publication.stage!=="Published"?{stage:"Published"}:{})});
  setFound(null);setId("");
 };
 const addToLibrary=async()=>{
  if(!saved||!supabase)return;
  setBusy(true);setMessage("");
  const {error}=await supabase.from("ws_papers").insert({title:saved.title,authors:saved.authors,year:saved.year,publication:saved.journal,
   doi:saved.doi,pmid:saved.pmid,url:publishedLink(saved),status:"read"});
  if(error)setMessage(error.message);else await refreshLibrary();
  setBusy(false);
 };
 const reference=(p:Published)=><div className="published-reference">
  <strong>{p.title}</strong>
  <span>{publishedSource(p)}</span>
  {publishedLink(p)&&<a href={publishedLink(p)!} target="_blank" rel="noopener noreferrer">{p.doi?`doi:${p.doi}`:"Open the paper"} <ExternalLink aria-hidden/></a>}
 </div>;

 if(!saved&&!canEdit)return null;
 return <section className="panel published-panel">
  <header className="panel-head"><h2><BookCheck aria-hidden/> Published version</h2></header>
  {saved?<>
   {reference(saved)}
   <div className="published-actions">
    {inLibrary?<a className="link-button" href={"#/tools/papers/"+inLibrary.id}>In your paper library →</a>
     :<button className="link-button" disabled={busy} onClick={()=>void addToLibrary()}>Add to paper library</button>}
    {canEdit&&<button className="link-button" disabled={busy} onClick={()=>void fetchIt(saved.doi??saved.pmid??"")}><RefreshCw aria-hidden/> Refresh from {saved.doi?"DOI":"PubMed"}</button>}
    {canEdit&&<button className="link-button" onClick={()=>void tables.publications.update(publication.id,{published:null})}>Remove</button>}
   </div>
  </>:<p className="muted-note">When the paper is out, enter its final DOI to pull in the published title, authors, journal and year.</p>}
  {canEdit&&!saved&&<form className="published-fetch" onSubmit={e=>{e.preventDefault();void fetchIt(id)}}>
   <input className="input" value={id} onChange={e=>setId(e.target.value)} placeholder="Final DOI, PubMed id or link" aria-label="Final DOI, PubMed id or link"/>
   <button className="secondary" type="submit" disabled={busy||!id.trim()}>{busy?"Looking up…":"Fetch"}</button>
  </form>}
  {found&&<div className="published-preview">
   <p className="field-label">Found</p>
   {reference(found)}
   {publication.stage!=="Published"&&<label className="published-mark"><input type="checkbox" checked={markPublished} onChange={e=>setMarkPublished(e.target.checked)}/> Also set this publication’s stage to Published</label>}
   <div className="published-actions"><button className="primary" onClick={()=>void save()}>Use this as the published version</button>
    <button className="secondary" onClick={()=>setFound(null)}>Cancel</button></div>
  </div>}
  {message&&<p className="muted-note" role="alert">{message}</p>}
 </section>;
}
