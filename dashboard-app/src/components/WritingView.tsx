import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {cleanChars,codePoint,inspectChars} from '../lib/humanizer/inspect';
import {cleanLinks,inspectLinks} from '../lib/humanizer/links';
import {compose,isBreak,wordDiff,type Segment} from '../lib/humanizer/diff';
import {styleMetrics} from '../lib/humanizer/metrics';
import {LEVELS,dipperBackend,rewrite} from '../lib/humanizer/paraphrase';
import type {LexiconEntry} from '../lib/humanizer/rules';
type Doc={id:string;title:string;updated_at:string};
type LexRow={phrase:string;replacements:string[];locked:boolean};
type Score={phd:number;tokens:number};
const fmt=(n:number,d=2)=>Number.isFinite(n)?n.toFixed(d):'–';
const message=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Something went wrong';
function Metrics({label,text,score}:{label:string;text:string;score?:Score}){
 const m=useMemo(()=>styleMetrics(text),[text]);
 return <div className="writing-metrics"><strong>{label}</strong><span>{m.words} words</span><span>{m.sentences} sentences</span><span>mean length {fmt(m.meanLength,1)}</span><span>length variation {fmt(m.lengthVariation)}</span><span>type–token {fmt(m.typeTokenRatio)}</span>{score&&<span title="Intrinsic dimension (PHD) of RoBERTa embeddings. Human English text is usually 9–10; generated text is usually near 8. Unreliable on short text.">PHD {fmt(score.phd)} ({score.tokens} tokens)</span>}</div>;
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
 const [lexical,setLexical]=useState(60),[order,setOrder]=useState(60),[useModel,setUseModel]=useState(true),[useRules,setUseRules]=useState(true);
 const [url,setUrl]=useState(''),[token,setToken]=useState(''),[lockedText,setLockedText]=useState('');
 const [lexicon,setLexicon]=useState<LexRow[]>([]),[docs,setDocs]=useState<Doc[]>([]);
 const [kind,setKind]=useState<'dipper'|'humanizer'|''>('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[scores,setScores]=useState<{before?:Score;after?:Score}>({});
 const chars=useMemo(()=>inspectChars(text).filter(f=>f.action!=='keep'),[text]);
 const links=useMemo(()=>inspectLinks(text),[text]);
 const result=useMemo(()=>compose(segments),[segments]);
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
 },[url]);
 const plain=kind==='humanizer';
 const locked=useMemo(()=>[...lockedText.split(',').map(s=>s.trim()).filter(Boolean),...lexicon.filter(r=>r.locked).map(r=>r.phrase)],[lockedText,lexicon]);
 const personal=useMemo<LexiconEntry[]>(()=>lexicon.filter(r=>!r.locked&&r.replacements.length).map(r=>({from:r.phrase,to:r.replacements})),[lexicon]);
 const run=async()=>{
  if(!text.trim())return;
  if(useModel&&(!url.trim()||!token.trim())){setStatus('Add the paraphrase server address and token, or switch the model off.');return;}
  setBusy(true);setStatus('');setScores({});
  try{
   const backend=useModel?dipperBackend(url.trim(),token.trim()):null;
   const out=await rewrite(text,backend,{lexical,order,locked,lexicon:personal,rules:useRules,protection:plain?'verify':'placeholder'},(d,t)=>setStatus(`Rewriting paragraph ${d} of ${t}`));
   setSegments(out);setSource(text);
   const kept=out.filter(s=>s.rejected).length;
   setStatus(kept?`${kept} paragraph${kept>1?'s':''} kept as written because protected content did not survive.`:'Rewrite ready. Review each change.');
  }catch(e){setStatus(message(e));}finally{setBusy(false);}
 };
 const clean=()=>{setText(cleanLinks(cleanChars(text)));setStatus('Removed hidden characters and tracking parameters.');};
 const score=async()=>{
  if(!url.trim()||!token.trim()){setStatus('Scoring needs the paraphrase server.');return;}
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
    settings:{model:useModel?kind||'unknown':null,rules:useRules,lexical,order},flags:segments.flatMap(s=>s.accepted?s.flags:[]),scores});
   if(error)throw error;
   setStatus('Saved as a new version.');await loadDocs();
  }catch(e){setStatus(message(e));}finally{setBusy(false);}
 };
 const open=async(d:Doc)=>{
  if(!supabase)return;
  const {data,error}=await supabase.from('writing_versions').select('original,revised').eq('document_id',d.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error||!data){setStatus(error?.message??'This document has no saved version.');return;}
  setDocId(d.id);setTitle(d.title);setText(data.original);setSource(data.original);setScores({});
  setSegments([{original:data.original,revised:data.revised,accepted:true,flags:[]}]);
 };
 const download=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([result],{type:'text/markdown'}));a.download=(title.trim()||'rewrite')+'.md';a.click();URL.revokeObjectURL(a.href);};
 const toggle=(i:number)=>setSegments(list=>list.map((s,j)=>j===i&&!s.rejected?{...s,accepted:!s.accepted}:s));
 return <div className="writing">
  <div className="writing-toolbar">
   <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title"/>
   {docs.length>0&&<select className="input" value={docId??''} onChange={e=>{const d=docs.find(x=>x.id===e.target.value);if(d)void open(d);else{setDocId(null);setTitle('');setText('');setSegments([]);}}}><option value="">New document</option>{docs.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select>}
  </div>
  <textarea className="input writing-input" value={text} onChange={e=>setText(e.target.value)} placeholder="Paste the text to clean or rewrite"/>
  {(chars.length>0||links.length>0)&&<div className="writing-findings">
   {chars.length>0&&<small>{chars.length} hidden character{chars.length>1?'s':''}: {[...new Set(chars.map(c=>`${c.name} (${codePoint(c.code)})`))].join(', ')}</small>}
   {links.filter(l=>l.removed.length).map(l=><small key={l.index}>Tracking parameter {l.removed.join(', ')} in {l.original}</small>)}
   {links.filter(l=>l.sharedChat).map(l=><small key={'c'+l.index}>Shared chat link, not a reference: {l.original}</small>)}
   <button className="secondary" onClick={clean}>Clean</button>
  </div>}
  <div className="writing-controls">
   <label><input type="checkbox" checked={useModel} onChange={e=>setUseModel(e.target.checked)}/> Paraphrase model</label>
   <label><input type="checkbox" checked={useRules} onChange={e=>setUseRules(e.target.checked)}/> Phrase rules</label>
   <label>Word change<select className="input" value={lexical} disabled={!useModel||plain} onChange={e=>setLexical(Number(e.target.value))}>{LEVELS.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <label>Reordering<select className="input" value={order} disabled={!useModel||plain} onChange={e=>setOrder(Number(e.target.value))}>{LEVELS.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <button className="primary" disabled={busy||!text.trim()} onClick={()=>void run()}>{busy?'Working…':'Rewrite'}</button>
  </div>
  <input className="input" value={lockedText} onChange={e=>setLockedText(e.target.value)} placeholder="Terms to keep exactly, comma-separated"/>
  <details className="writing-server"><summary>Paraphrase server{kind&&`: ${kind==='dipper'?'DIPPER':'Humanizer'} running`}</summary>
   <input className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://… address printed by the notebook"/>
   <input className="input" type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Token"/>
   {supabase&&<button className="secondary" onClick={()=>void saveSettings()}>Save</button>}
  </details>
  {status&&<p className="writing-status" role="status">{status}</p>}
  {segments.length>0&&<>
   <Metrics label="Original" text={source} score={scores.before}/>
   <Metrics label="Rewrite" text={result} score={scores.after}/>
   <div className="writing-segments">{segments.map((s,i)=>isBreak(s.original)?null:<SegmentCard key={i} seg={s} onToggle={()=>toggle(i)}/>)}</div>
   <div className="writing-controls">
    <button className="secondary" onClick={()=>void navigator.clipboard.writeText(result).then(()=>setStatus('Copied.'))}>Copy</button>
    <button className="secondary" onClick={download}>Download</button>
    <button className="secondary" disabled={busy} onClick={()=>void score()}>Score</button>
    {supabase&&<button className="primary" disabled={busy} onClick={()=>void save()}>Save version</button>}
   </div>
  </>}
 </div>;
}
