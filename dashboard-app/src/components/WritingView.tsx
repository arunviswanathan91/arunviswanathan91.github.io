import {useCallback,useEffect,useMemo,useState} from 'react';
import {Copy,Download,History,RefreshCw,Server,Trash2} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {cleanChars,codePoint,inspectChars} from '../lib/humanizer/inspect';
import {cleanLinks,inspectLinks} from '../lib/humanizer/links';
import {compose,isBreak,wordDiff,type Segment} from '../lib/humanizer/diff';
import {styleMetrics} from '../lib/humanizer/metrics';
import {dipperBackend,rewrite} from '../lib/humanizer/paraphrase';
import {describeServer,type ServerStatus} from '../lib/humanizer/serverStatus';
import type {LexiconEntry} from '../lib/humanizer/rules';
type Doc={id:string;title:string;updated_at:string};
type LexRow={phrase:string;replacements:string[];locked:boolean};
type Score={phd:number;tokens:number};
type Mode='rules'|'standard'|'strong';
// Standard and Strong are the DIPPER paper's 40/0 and 60/60 diversity settings.
const MODES:{key:Mode;label:string;hint:string;lexical:number;order:number}[]=[
 {key:'rules',label:'Rules only',hint:'Cleans stock phrases in the browser. No model.',lexical:0,order:0},
 {key:'standard',label:'Standard',hint:'Model rewrite that changes wording and keeps sentence order.',lexical:40,order:0},
 {key:'strong',label:'Strong',hint:'Model rewrite that changes wording and reorders content.',lexical:60,order:60},
];
const fmt=(n:number,d=2)=>Number.isFinite(n)?n.toFixed(d):'–';
const count=(t:string)=>t.trim()?t.trim().split(/\s+/).length:0;
const message=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Something went wrong';
function Metrics({label,text,score}:{label:string;text:string;score?:Score}){
 const m=useMemo(()=>styleMetrics(text),[text]);
 return <div className="writing-metrics"><strong>{label}</strong><span>{m.sentences} sentences</span><span>mean length {fmt(m.meanLength,1)}</span><span>length variation {fmt(m.lengthVariation)}</span><span>type–token {fmt(m.typeTokenRatio)}</span>{score&&<span title="Intrinsic dimension (PHD) of RoBERTa embeddings. Human English text is usually 9–10; generated text is usually near 8. Unreliable on short text.">PHD {fmt(score.phd)} ({score.tokens} tokens)</span>}</div>;
}
function SegmentCard({seg,onToggle}:{seg:Segment;onToggle():void}){
 const parts=useMemo(()=>wordDiff(seg.original,seg.revised),[seg.original,seg.revised]);
 const changed=seg.original!==seg.revised;
 return <article className={'writing-segment'+(seg.rejected?' rejected':'')}>
  <p>{seg.accepted&&changed?parts.map((p,i)=>p.type==='same'?p.text:<span key={i} className={'writing-'+p.type}>{p.text}</span>):seg.original}</p>
  {seg.rejected&&<small className="writing-flag">Kept the original: {seg.rejected}</small>}
  {seg.flags.map((f,i)=><small key={i} className="writing-flag">Check {f.kind.replace('-',' ')}: {f.detail}</small>)}
  {changed&&<button className="secondary" onClick={onToggle}>{seg.accepted?'Undo':'Accept'}</button>}
 </article>;
}
export function WritingView(){
 const [text,setText]=useState(''),[title,setTitle]=useState(''),[docId,setDocId]=useState<string|null>(null);
 const [segments,setSegments]=useState<Segment[]>([]),[source,setSource]=useState('');
 const [mode,setMode]=useState<Mode>('rules'),[useRules,setUseRules]=useState(true),[panel,setPanel]=useState<'server'|'history'|''>('');
 const [url,setUrl]=useState(''),[token,setToken]=useState(''),[lockedText,setLockedText]=useState('');
 const [lexicon,setLexicon]=useState<LexRow[]>([]),[docs,setDocs]=useState<Doc[]>([]);
 const [kind,setKind]=useState<'dipper'|'humanizer'|''>('');
 const [probe,setProbe]=useState(0);
 const [server,setServer]=useState<{status:ServerStatus|null;at:string|null}>({status:null,at:null}),[now,setNow]=useState(()=>Date.now());
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[scores,setScores]=useState<{before?:Score;after?:Score}>({});
 const chars=useMemo(()=>inspectChars(text).filter(f=>f.action!=='keep'),[text]);
 const links=useMemo(()=>inspectLinks(text),[text]);
 const result=useMemo(()=>compose(segments),[segments]);
 const current=MODES.find(m=>m.key===mode)!,useModel=mode!=='rules',plain=kind==='humanizer';
 const loadDocs=useCallback(async()=>{if(!supabase)return;const {data}=await supabase.from('writing_documents').select('id,title,updated_at').order('updated_at',{ascending:false}).limit(50);setDocs((data??[]) as Doc[]);},[]);
 useEffect(()=>{if(!supabase)return;void(async()=>{
  const [s,l]=await Promise.all([supabase.from('writing_settings').select('server_url,server_token').maybeSingle(),supabase.from('writing_lexicon').select('phrase,replacements,locked')]);
  if(s.data){setUrl(s.data.server_url??'');setToken(s.data.server_token??'');}
  if(l.data)setLexicon(l.data as LexRow[]);
  if(s.error||l.error)setStatus('Writing tables are not set up yet. Apply supabase/writing.sql to save work.');
  await loadDocs();
 })();},[loadDocs]);
 useEffect(()=>{
  setKind('');
  if(!/^https:\/\//.test(url.trim()))return;
  const stop=new AbortController();
  fetch(url.trim().replace(/\/+$/,'')+'/health',{signal:stop.signal}).then(r=>r.ok?r.json():null).then((d:{kind?:string}|null)=>{if(d?.kind==='dipper'||d?.kind==='humanizer')setKind(d.kind);}).catch(()=>{});
  return()=>stop.abort();
 },[url,probe]);
 // The notebook writes a new address and token at every start, and a progress message about every 45 seconds.
 const reconnect=useCallback(async(quiet=false)=>{
  if(supabase){
   const {data,error}=await supabase.from('writing_settings').select('server_url,server_token,server_status,server_status_at').maybeSingle();
   if(error){if(!quiet)setStatus(error.message);return;}
   setUrl(data?.server_url??'');setToken(data?.server_token??'');
   setServer({status:(data?.server_status??null) as ServerStatus|null,at:data?.server_status_at??null});
  }
  setNow(Date.now());
  if(!quiet)setProbe(n=>n+1);
 },[]);
 const serverView=useMemo(()=>describeServer(server.status,server.at,now),[server,now]);
 // While the panel is open or the server is starting, keep the progress line current without a click.
 const watching=!!supabase&&(panel==='server'||serverView.state==='starting');
 useEffect(()=>{
  if(!watching)return;
  void reconnect(true);
  const id=setInterval(()=>void reconnect(true),15000);
  return()=>clearInterval(id);
 },[watching,reconnect]);
 // The address only answers once the server says it is ready, so probe again at that moment.
 useEffect(()=>{if(serverView.state==='ready')setProbe(n=>n+1);},[serverView.state]);
 const locked=useMemo(()=>[...lockedText.split(',').map(s=>s.trim()).filter(Boolean),...lexicon.filter(r=>r.locked).map(r=>r.phrase)],[lockedText,lexicon]);
 const personal=useMemo<LexiconEntry[]>(()=>lexicon.filter(r=>!r.locked&&r.replacements.length).map(r=>({from:r.phrase,to:r.replacements})),[lexicon]);
 const run=async()=>{
  if(!text.trim())return;
  if(useModel&&(!url.trim()||!token.trim())){setPanel('server');setStatus('Standard and Strong need a paraphrase server. Add its address and token, or use Rules only.');return;}
  setBusy(true);setStatus('');setScores({});
  try{
   const backend=useModel?dipperBackend(url.trim(),token.trim()):null;
   const out=await rewrite(text,backend,{lexical:current.lexical,order:current.order,locked,lexicon:personal,rules:useRules,protection:plain?'verify':'placeholder'},(d,t)=>setStatus(`Rewriting paragraph ${d} of ${t}`));
   setSegments(out);setSource(text);
   const kept=out.filter(s=>s.rejected).length;
   setStatus(kept?`${kept} paragraph${kept>1?'s':''} kept as written because protected content did not survive.`:'Rewrite ready. Review each change.');
  }catch(e){setStatus(message(e));}finally{setBusy(false);}
 };
 const clean=()=>{setText(cleanLinks(cleanChars(text)));setStatus('Removed hidden characters and tracking parameters.');};
 const score=async()=>{
  if(!url.trim()||!token.trim()){setPanel('server');setStatus('Scoring needs the paraphrase server.');return;}
  setBusy(true);setStatus('Scoring');
  try{
   const one=async(t:string)=>{const r=await fetch(url.trim().replace(/\/+$/,'')+'/score',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token.trim()},body:JSON.stringify({text:t})});if(!r.ok)throw new Error(`Scoring server returned ${r.status}`);return await r.json() as Score;};
   const before=await one(source),after=await one(result);
   setScores({before,after});setStatus('');
  }catch(e){setStatus(message(e));}finally{setBusy(false);}
 };
 const saveSettings=async()=>{if(!supabase)return;const {error}=await supabase.from('writing_settings').upsert({server_url:url.trim(),server_token:token.trim(),updated_at:new Date().toISOString()});setStatus(error?error.message:'Server settings saved.');};
 const save=async()=>{
  if(!supabase||!segments.length)return;
  setBusy(true);
  try{
   let id=docId;
   const name=title.trim()||source.trim().slice(0,60)||'Untitled';
   if(id){const {error}=await supabase.from('writing_documents').update({title:name,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;}
   else{const {data,error}=await supabase.from('writing_documents').insert({title:name}).select('id').single();if(error)throw error;id=data.id as string;setDocId(id);}
   const {error}=await supabase.from('writing_versions').insert({document_id:id,original:source,revised:result,
    settings:{mode,model:useModel?kind||'unknown':null,rules:useRules,lexical:current.lexical,order:current.order},flags:segments.flatMap(s=>s.accepted?s.flags:[]),scores});
   if(error)throw error;
   setStatus('Saved as a new version.');await loadDocs();
  }catch(e){setStatus(message(e));}finally{setBusy(false);}
 };
 const open=async(d:Doc)=>{
  if(!supabase)return;
  const {data,error}=await supabase.from('writing_versions').select('original,revised').eq('document_id',d.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error||!data){setStatus(error?.message??'This document has no saved version.');return;}
  setDocId(d.id);setTitle(d.title);setText(data.original);setSource(data.original);setScores({});setPanel('');
  setSegments([{original:data.original,revised:data.revised,accepted:true,flags:[]}]);
 };
 const reset=()=>{setDocId(null);setTitle('');setText('');setSource('');setSegments([]);setScores({});setStatus('');};
 const copy=(t:string)=>void navigator.clipboard.writeText(t).then(()=>setStatus('Copied.'));
 const download=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([result],{type:'text/markdown'}));a.download=(title.trim()||'rewrite')+'.md';a.click();URL.revokeObjectURL(a.href);};
 const toggle=(i:number)=>setSegments(list=>list.map((s,j)=>j===i&&!s.rejected?{...s,accepted:!s.accepted}:s));
 const serverLabel=kind?`${kind==='dipper'?'DIPPER':'Humanizer'} connected`:serverView.state==='starting'?'Server starting…':url.trim()?'Server not reachable':'No server';
 return <div className="writing">
  <div className="writing-bar">
   <div className="writing-modes" role="group" aria-label="Rewrite strength">{MODES.map(m=><button key={m.key} className={mode===m.key?'active':''} aria-pressed={mode===m.key} title={m.hint} onClick={()=>setMode(m.key)}>{m.label}</button>)}</div>
   <label className="writing-check"><input type="checkbox" checked={useRules} onChange={e=>setUseRules(e.target.checked)}/> Phrase rules</label>
   <span className="writing-hint">{useModel&&plain?'This model has one strength; Standard and Strong give the same rewrite.':current.hint}</span>
   <div className="writing-bar-end">
    <button className={'secondary'+(panel==='server'?' active':'')} aria-expanded={panel==='server'} onClick={()=>setPanel(p=>p==='server'?'':'server')}><Server size={14}/> {serverLabel}</button>
    {supabase&&<button className={'secondary'+(panel==='history'?' active':'')} aria-expanded={panel==='history'} onClick={()=>setPanel(p=>p==='history'?'':'history')}><History size={14}/> History</button>}
   </div>
  </div>
  {panel==='server'&&<div className="writing-panel">
   <input className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://… address printed by the notebook" aria-label="Server address"/>
   <input className="input" type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Token" aria-label="Server token"/>
   {supabase&&<button className="secondary" onClick={()=>void saveSettings()}>Save</button>}
   <button className="secondary" onClick={()=>void reconnect()}><RefreshCw size={14}/> Reconnect</button>
   {supabase&&<p className={'writing-server-status '+serverView.state} role="status">{serverView.text}</p>}
  </div>}
  {panel==='history'&&<div className="writing-panel writing-history">
   {docs.length?docs.map(d=><button key={d.id} className={docId===d.id?'active':''} onClick={()=>void open(d)}><span>{d.title||'Untitled'}</span><small>{new Date(d.updated_at).toLocaleDateString()}</small></button>):<small>No saved documents yet.</small>}
  </div>}
  <div className="writing-panes">
   <section className="writing-pane">
    <header><h2>Original text</h2><button className="icon-button" title="Copy" aria-label="Copy original" disabled={!text} onClick={()=>copy(text)}><Copy size={15}/></button><button className="icon-button" title="Clear" aria-label="Clear" disabled={!text&&!segments.length} onClick={reset}><Trash2 size={15}/></button></header>
    <textarea className="writing-input" value={text} onChange={e=>setText(e.target.value)} placeholder="Paste the text to clean or rewrite…"/>
    {(chars.length>0||links.length>0)&&<div className="writing-findings">
     {chars.length>0&&<small>{chars.length} hidden character{chars.length>1?'s':''}: {[...new Set(chars.map(c=>`${c.name} (${codePoint(c.code)})`))].join(', ')}</small>}
     {links.filter(l=>l.removed.length).map(l=><small key={l.index}>Tracking parameter {l.removed.join(', ')} in {l.original}</small>)}
     {links.filter(l=>l.sharedChat).map(l=><small key={'c'+l.index}>Shared chat link, not a reference: {l.original}</small>)}
     <button className="secondary" onClick={clean}>Clean</button>
    </div>}
    <footer><span>{count(text)} words</span><button className="primary" disabled={busy||!text.trim()} onClick={()=>void run()}>{busy?'Working…':'Rewrite'}</button></footer>
   </section>
   <section className="writing-pane">
    <header><h2>Rewritten text</h2><button className="icon-button" title="Copy" aria-label="Copy rewrite" disabled={!segments.length} onClick={()=>copy(result)}><Copy size={15}/></button><button className="icon-button" title="Download" aria-label="Download rewrite" disabled={!segments.length} onClick={download}><Download size={15}/></button></header>
    <div className="writing-output">{segments.length?segments.map((s,i)=>isBreak(s.original)?null:<SegmentCard key={i} seg={s} onToggle={()=>toggle(i)}/>):<p className="writing-empty">Your rewrite will appear here.</p>}</div>
    <footer><span>{count(result)} words</span>{segments.length>0&&<><button className="secondary" disabled={busy} onClick={()=>void score()}>Score</button>{supabase&&<button className="primary" disabled={busy} onClick={()=>void save()}>Save version</button>}</>}</footer>
   </section>
  </div>
  {status&&<p className="writing-status" role="status">{status}</p>}
  {segments.length>0&&<><Metrics label="Original" text={source} score={scores.before}/><Metrics label="Rewrite" text={result} score={scores.after}/></>}
  <div className="writing-options">
   <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title for saving" aria-label="Title"/>
   <input className="input" value={lockedText} onChange={e=>setLockedText(e.target.value)} placeholder="Terms to keep exactly, comma-separated" aria-label="Terms to keep exactly"/>
  </div>
 </div>;
}
