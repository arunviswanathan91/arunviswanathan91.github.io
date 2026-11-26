import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanChars, inspectChars } from "../src/lib/humanizer/inspect.ts";
import { cleanLinks, cleanUrl, inspectLinks } from "../src/lib/humanizer/links.ts";
import { protect, restore } from "../src/lib/humanizer/protect.ts";
import { humanize } from "../src/lib/humanizer/rules.ts";
import { checkFidelity } from "../src/lib/humanizer/fidelity.ts";
import { compose, wordDiff } from "../src/lib/humanizer/diff.ts";
import { styleMetrics } from "../src/lib/humanizer/metrics.ts";
import { dipperBackend, rewrite, verifySpans } from "../src/lib/humanizer/paraphrase.ts";
import { describeServer } from "../src/lib/humanizer/serverStatus.ts";

const SCI="CD8+ T cells from STAT3−/− mice showed reduced pSTAT3-Y705 after 2 µM inhibitor (P < 0.05) [3,4].";

test("hidden characters are removed and joiners survive",()=>{
 const malayalam="ന്‍",family="👨‍👩‍👧";
 const dirty=`a​b﻿ c­de f ${malayalam} ${family}‮`;
 const found=inspectChars(dirty);
 assert.deepEqual(found.filter(f=>f.action==="keep").length,3);
 const clean=cleanChars(dirty);
 assert.equal(clean,`ab cde f ${malayalam} ${family}`);
});

test("tracking parameters go, identifiers and functional queries stay",()=>{
 assert.equal(cleanUrl("https://pubmed.ncbi.nlm.nih.gov/12345678/?utm_source=chatgpt.com").cleaned,"https://pubmed.ncbi.nlm.nih.gov/12345678/");
 assert.equal(cleanUrl("https://example.org/search?q=PDAC&utm_medium=x&page=2").cleaned,"https://example.org/search?q=PDAC&page=2");
 assert.equal(cleanUrl("https://doi.org/10.1038/s41586-024-08025-4").cleaned,"https://doi.org/10.1038/s41586-024-08025-4");
 assert.equal(cleanLinks("See https://example.org/a?utm_source=x."),"See https://example.org/a.");
 assert.equal(inspectLinks("https://chatgpt.com/share/abc")[0].sharedChat,true);
});

test("scientific spans are protected and restored exactly",()=>{
 const p=protect(SCI);
 for(const span of ["CD8+","STAT3−/−","pSTAT3-Y705","2 µM","P < 0.05","[3,4]"])assert.ok(p.spans.includes(span),span);
 assert.equal(restore(p.text,p.spans).text,SCI);
 assert.ok(!/CD8|STAT3|0\.05/.test(p.text));
});

test("a lost or repeated placeholder is rejected",()=>{
 const p=protect("IL-6 rose 3-fold.");
 assert.equal(restore(p.text.replace("ZQX0Z",""),p.spans).ok,false);
 assert.equal(restore(p.text+" ZQX0Z",p.spans).ok,false);
});

test("rules rewrite stock phrases, keep protected spans and are reproducible",()=>{
 const text=`It is important to note that we utilize CD8+ T cells in order to measure pSTAT3-Y705. Moreover, 2 µM inhibitor was added (P < 0.05).`;
 const a=humanize(text,{seed:7}),b=humanize(text,{seed:7});
 assert.equal(a.text,b.text);
 assert.ok(a.text.startsWith("We use CD8+ T cells to measure pSTAT3-Y705."),a.text);
 for(const span of ["CD8+","pSTAT3-Y705","2 µM","P < 0.05"])assert.ok(a.text.includes(span),span);
 assert.ok(!/moreover/i.test(a.text));
 assert.deepEqual(checkFidelity(text,a.text),[]);
});

test("personal lexicon and locked terms are honoured",()=>{
 const out=humanize("We leverage the tumour microenvironment model.",{lexicon:[{from:"model",to:["system"]}],locked:["tumour microenvironment model"]});
 assert.equal(out.text,"We use the tumour microenvironment model.");
});

test("fidelity flags swapped values, lost negation and reversed direction",()=>{
 const kinds=(a:string,b:string)=>checkFidelity(a,b).map(f=>f.kind);
 assert.deepEqual(kinds("Controls had 12% and treated had 48%.","Controls had 48% and treated had 12%."),["number-order"]);
 assert.deepEqual(kinds("There was no change in viability.","There was a change in viability."),["negation"]);
 assert.deepEqual(kinds("IL-6 increased after treatment.","IL-6 decreased after treatment."),["direction"]);
 assert.deepEqual(kinds("Survival was 14 months [2].","Survival was 41 months."),["number-missing","number-added","citation"]);
 assert.deepEqual(kinds("Cells were treated for 24 h [2].","For 24 h, cells were treated [2]."),[]);
});

test("rewrite keeps the original when the back end drops protected content",async()=>{
 const text="IL-6 rose 3-fold in treated mice.\n\nSTAT3−/− mice did not respond.";
 const lossy=async(t:string)=>t.replace(/ZQX0Z\s*/,"");
 const segs=await rewrite(text,lossy,{lexical:60,order:60,rules:false});
 assert.equal(segs[0].accepted,false);
 assert.match(segs[0].rejected??"",/dropped/);
 assert.equal(compose(segs),text);
});

test("rewrite restores spans, flags meaning changes and supports undo",async()=>{
 const text="Tumour volume did not increase in STAT3−/− mice (P < 0.05).";
 const backend=async(t:string)=>t.replace("did not increase","increased");
 const segs=await rewrite(text,backend,{lexical:40,order:0,rules:false});
 assert.equal(segs[0].revised,"Tumour volume increased in STAT3−/− mice (P < 0.05).");
 assert.deepEqual(segs[0].flags.map(f=>f.kind),["negation"]);
 segs[0].accepted=false;
 assert.equal(compose(segs),text);
});

test("the server back end sends the documented request",async()=>{
 const calls:{url:string;auth:string;body:Record<string,unknown>}[]=[];
 const backend=dipperBackend("https://x.example/",  "secret",async(url,init)=>{calls.push({url,auth:init.headers.authorization,body:JSON.parse(init.body)});return {ok:true,status:200,json:async()=>({text:" ok "})};});
 assert.equal(await backend("hello",{lexical:60,order:20,prefix:"ctx"}),"ok");
 assert.deepEqual(calls,[{url:"https://x.example/paraphrase",auth:"Bearer secret",body:{text:"hello",lexical:60,order:20,prefix:"ctx",seed:null}}]);
 await assert.rejects(rewrite("a",null,{lexical:50,order:0}),/must be 0, 20/);
});

test("verify mode sends plain text and accepts a rewrite that keeps every span",async()=>{
 const seen:string[]=[];
 const backend=async(t:string)=>{seen.push(t);return "After 2 µM inhibitor, pSTAT3-Y705 fell in CD8+ T cells\nfrom STAT3−/− mice (P < 0.05) [3,4].";};
 const segs=await rewrite(SCI,backend,{lexical:60,order:60,rules:false,protection:"verify"});
 assert.deepEqual(seen,[SCI]);
 assert.equal(segs[0].accepted,true);
 assert.equal(segs[0].revised,"After 2 µM inhibitor, pSTAT3-Y705 fell in CD8+ T cells from STAT3−/− mice (P < 0.05) [3,4].");
});

test("verify mode retries, then keeps the original after three failures",async()=>{
 let calls=0;
 const second=async()=>++calls<2?"T cells showed reduced signal.":"Reduced pSTAT3-Y705 was seen in CD8+ T cells of STAT3−/− mice given 2 µM inhibitor (P < 0.05) [3,4].";
 const ok=await rewrite(SCI,second,{lexical:60,order:60,rules:false,protection:"verify"});
 assert.equal(calls,2);
 assert.equal(ok[0].accepted,true);
 calls=0;
 const never=async()=>{calls++;return "CD8+ T cells from STAT3−/− mice showed reduced pSTAT3-Y705 after 5 µM inhibitor (P < 0.05) [3,4].";};
 const bad=await rewrite(SCI,never,{lexical:60,order:60,rules:false,protection:"verify"});
 assert.equal(calls,3);
 assert.equal(bad[0].accepted,false);
 assert.match(bad[0].rejected??"",/dropped: 2 µM/);
 assert.equal(compose(bad),SCI);
});

test("verify rejects invented numbers and a change of language",()=>{
 assert.equal(verifySpans("IL-6 rose in treated mice.","Treated mice had higher IL-6."),undefined);
 assert.match(verifySpans("IL-6 rose in treated mice.","IL-6 rose 3-fold in treated mice.")??"",/added: 3-fold/);
 assert.match(verifySpans("IL-6 rose in treated mice.","IL-6 在小鼠中升高。")??"",/another language/);
});

test("word diff and style metrics",()=>{
 assert.deepEqual(wordDiff("a b c","a x c").filter(p=>p.type!=="same").map(p=>p.type+":"+p.text),["del:b","add:x"]);
 const m=styleMetrics("Short one. This sentence is quite a lot longer than the first one. However, it ends.");
 assert.equal(m.sentences,3);
 assert.ok(m.lengthVariation>0&&m.connectorRate>0.3);
});

test("server status line covers off, starting, ready, silent and stopped",()=>{
 const t0=Date.parse("2026-11-26T10:00:00Z"),at="2026-11-26T10:00:00Z";
 assert.equal(describeServer(null,null,t0).state,"off");
 assert.equal(describeServer({},at,t0).state,"off");
 const starting=describeServer({stage:"download",step:2,steps:4,label:"Downloading the model (10 GB)",since:"2026-11-26T09:58:00Z",expect_s:240,remaining_s:300},at,t0+30000);
 assert.equal(starting.state,"starting");
 assert.equal(starting.text,"Starting, step 2 of 4: Downloading the model (10 GB). 3 minutes so far; this step usually takes about 4 minutes. About 5 minutes left in total.");
 const ready=describeServer({stage:"ready",idle_minutes:30,stops_at:"2026-11-26T10:25:00Z"},at,t0+60000);
 assert.equal(ready.text,"Ready. It stops by itself after 30 minutes without a rewrite, in about 24 minutes if you do nothing.");
 const silent=describeServer({stage:"ready",idle_minutes:30},at,t0+600000);
 assert.equal(silent.state,"silent");
 assert.match(silent.text,/No message from the server for 10 minutes/);
 const stopped=describeServer({stage:"stopped",reason:"idle for 30 minutes"},at,t0+600000);
 assert.equal(stopped.state,"stopped");
 assert.match(stopped.text,/\(idle for 30 minutes\)/);
});
