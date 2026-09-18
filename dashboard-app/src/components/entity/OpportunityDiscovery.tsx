import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Radar, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AssessmentPreferences } from "./AssessmentPreferences";
import { useConfirmDialog } from "../ui/ConfirmDialog";

type Phase = "idle" | "starting" | "queued" | "running" | "done" | "failed";
interface StartResponse {
 run_id?: string;
 status?: "queued" | "running";
 query?: string | null;
 mode?: "discovery" | "search";
 already_running?: boolean;
 error?: string;
}
interface RunStats {
 phase?: string;
 dispatchTarget?: "github_actions"|"cloud_run";
 currentSource?: string;
 sourceProgress?: {pages?:number;fetched?:number;apiCalls?:number};
 matched?: number;
 created?: number;
 fetched?: number;
 evaluated?: number;
 filtered?: number;
 degradations?: string[];
 bySource?: Record<string,{itemsFetched?:number;itemsEvaluated?:number;itemsFiltered?:number;itemsMatched?:number;status?:string}>;
 metadata?: {deterministic?:number;aiUpdated?:number;unresolved?:number;backfilled?:number};
 enrichment?: {requested?:number;attempted?:number;succeeded?:number;failed?:number;pending?:number};
}
interface RunRow {
 status: "queued" | "running" | "done" | "partial" | "failed";
 query: string | null;
 run_mode?: "discovery" | "search" | "backfill";
 stats: RunStats | null;
 error: string | null;
}
interface RestartResponse {archived?:number;batch_id?:string|null;runs_cleared?:number}

const active = (phase: Phase) => phase === "starting" || phase === "queued" || phase === "running";

export function OpportunityDiscovery({ onComplete, currentCount }: { onComplete(): void; currentCount:number }) {
 const [query, setQuery] = useState("");
 const [phase, setPhase] = useState<Phase>("idle");
 const [restarting,setRestarting]=useState(false);
 const [message, setMessage] = useState("Search job and postdoc sources using your profile filters.");
 const [lastStats,setLastStats]=useState<RunStats|null>(null);
 const timer = useRef<number | null>(null);
 const generation = useRef(0);
 const preferenceSaver = useRef<(()=>Promise<boolean>)|null>(null);
 const registerPreferenceSaver=useCallback((save:()=>Promise<boolean>)=>{preferenceSaver.current=save},[]);
 const {ask,confirmation}=useConfirmDialog();

 useEffect(() => () => {
  generation.current++;
  if (timer.current !== null) window.clearTimeout(timer.current);
 }, []);

 const follow = (runId: string, current: number, startedAt: number) => {
  const poll = async () => {
   if (generation.current !== current || !supabase) return;
   const { data, error } = await supabase.from("discovery_runs")
    .select("status,query,run_mode,stats,error").eq("id", runId).single();
   if (generation.current !== current) return;
   if (error || !data) {
    setPhase("failed");
    setMessage(error?.message ?? "Could not read discovery progress.");
    return;
   }

   const row = data as RunRow;
   setLastStats(row.stats ?? null);
   if (row.status === "queued" || row.status === "running") {
    setPhase(row.status);
    const stats=row.stats??{};
    const checked=Number(stats.evaluated??0),matched=Number(stats.matched??0);
    const source=stats.currentSource??(stats.bySource?Object.keys(stats.bySource).at(-1):null);
    setMessage(row.status === "queued"
     ? `Run queued — waiting for ${stats.dispatchTarget==="github_actions"?"GitHub Actions":"the discovery worker"}.`
     : `${row.run_mode==="search"?"Focused search":"Broad discovery"} is checking live sources${source?` · ${source}`:""}${checked?` · ${checked} evaluated · ${matched} matched`:""}.`);
    if (Date.now() - startedAt > 20 * 60 * 1000) {
     setPhase("failed");
     setMessage("The search is taking unusually long. Check the latest Cloud Run revision and logs.");
     return;
    }
    timer.current = window.setTimeout(poll, 2500);
    return;
   }

   if (row.status === "failed") {
    setPhase("failed");
    setMessage(row.error || "Discovery failed. Check the Cloud Run logs and try again.");
    return;
   }

   const stats = row.stats ?? {};
   const matched = Number(stats.matched ?? 0);
   const created = Number(stats.created ?? 0);
   const checked = Number(stats.evaluated ?? stats.fetched ?? 0);
   const enriched=Number(stats.enrichment?.succeeded??0);
   const pending=Number(stats.enrichment?.pending??0);
   const contextUnavailable=stats.degradations?.some(item=>item.includes("context enrichment unavailable"));
   const contextNote=contextUnavailable?" · AI context unavailable on the worker"
    :enriched?` · ${enriched} AI brief${enriched===1?"":"s"}${pending?` · ${pending} pending`:""}`
    :pending?` · ${pending} AI brief${pending===1?"":"s"} pending`:"";
   setPhase("done");
   setMessage(matched
    ? `Found ${matched} match${matched === 1 ? "" : "es"} from ${checked} checked · ${created} new${contextNote}${row.status === "partial" && !contextUnavailable ? " · some sources had issues" : ""}.`
    : `No strong query matches in ${checked} checked listing${checked === 1 ? "" : "s"}; lower-ranked discoveries were retained for review${row.status === "partial" ? "; some sources had issues" : ""}.`);
   onComplete();
  };
  void poll();
 };

 const start = async (mode:"discovery"|"search",event?:FormEvent) => {
  event?.preventDefault();
  const requested = query.trim().replace(/\s+/g, " ");
  if ((mode==="search"&&!requested) || active(phase)) return;
  if (!supabase) {
   setPhase("failed");
   setMessage("Discovery requires the connected Supabase workspace.");
   return;
  }

  setPhase("starting");
  setLastStats(null);
  setMessage("Saving research and relocation preferences…");
  if (preferenceSaver.current && !await preferenceSaver.current()) {
   setPhase("failed");
   setMessage("Your research and relocation preferences could not be saved. Review that section, then try the search again.");
   return;
  }

  if (timer.current !== null) window.clearTimeout(timer.current);
  const current = ++generation.current;
  setMessage("Starting a protected workspace search…");
  const { data, error } = await supabase.functions.invoke<StartResponse>("opportunity-discover", {
   body: { mode, query: mode==="search"?requested:null },
  });
  if (generation.current !== current) return;
  if (error || !data?.run_id) {
   setPhase("failed");
   setMessage(data?.error || error?.message || "Could not start discovery.");
   return;
  }

  if (data.query) setQuery(data.query);
  setPhase(data.status ?? "queued");
  setMessage(data.already_running
   ? `A search${data.query ? ` for “${data.query}”` : ""} is already running — following it here.`
   : mode==="search"
    ? `Searching for “${requested}” — ranked results will appear automatically.`
    : "Broad discovery started — all configured crawlers will be checked independently of the typed search.");
  follow(data.run_id, current, Date.now());
 };

 const submit=(event:FormEvent)=>void start("search",event);

 const restart=()=>ask({
  title:"Restart Opportunity discovery?",
  message:`This will move ${currentCount} current opportunit${currentCount===1?"y":"ies"} into one recoverable Trash group and clear crawler history so unchanged listings can be discovered again. Your search profile, ranking feedback, AI cache and quota limits will be kept.`,
  confirmLabel:"Archive and restart",
 },async()=>{
  if(!supabase)return;
  generation.current++;
  if(timer.current!==null)window.clearTimeout(timer.current);
  setRestarting(true);setMessage("Archiving the current discovery set…");
  const {data,error}=await supabase.rpc("restart_opportunity_discovery");
  if(error){setPhase("failed");setMessage(error.message);setRestarting(false);return}
  const result=(data??{}) as RestartResponse;
  const archived=Number(result.archived??0);
  setQuery("");setPhase("idle");setRestarting(false);
  setMessage(archived
   ?`Archived ${archived} opportunit${archived===1?"y":"ies"} as one Trash group. Enter a query to start a clean search.`
   :"Discovery history was reset. Enter a query to start a clean search.");
  onComplete();window.dispatchEvent(new CustomEvent("dash:trash-changed"));
 });

 const Icon = phase === "done" ? CheckCircle2 : phase === "failed" ? TriangleAlert : active(phase) ? LoaderCircle : Search;
 return <section className={`discovery-search discovery-${phase}`}>
 <div className="discovery-heading">
   <span className="discovery-icon"><Icon className={active(phase) ? "spin" : ""}/></span>
   <div>
    <h2>Find opportunities</h2>
    <p>Search live job and postdoc sources. New matches are added to this workspace.</p>
   </div>
   <button type="button" className="secondary discovery-restart" disabled={active(phase)||restarting} onClick={restart}>
    {restarting?<LoaderCircle className="spin"/>:<RotateCcw/>}{restarting?"Restarting":"Restart discovery"}
   </button>
  </div>
  <form onSubmit={submit} className="discovery-form">
   <input className="input" value={query} maxLength={180} disabled={active(phase)}
    onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
    placeholder="e.g. pancreatic cancer postdoc or research scientist Bangalore"
    aria-label="Opportunity discovery search"/>
   <button className="primary" type="submit" disabled={!query.trim() || active(phase)}>
    {active(phase) ? <LoaderCircle className="spin"/> : <Search/>}
    {active(phase) ? "Searching" : "Search sources"}
   </button>
   <button className="secondary" type="button" disabled={active(phase)} onClick={()=>void start("discovery")}>
    {active(phase)?<LoaderCircle className="spin"/>:<Radar/>}Discover all postdocs
   </button>
  </form>
  <p className="discovery-status" role="status" aria-live="polite">{message}</p>
  {lastStats?.bySource&&Object.keys(lastStats.bySource).length>0&&<div className="discovery-monitor" aria-label="Discovery run details">
   <strong>Run monitor</strong>
   <div className="discovery-monitor-grid">
    {Object.entries(lastStats.bySource).map(([source,value])=><span key={source}>
     {source}: {Number(value.itemsEvaluated??0)} checked · {Number(value.itemsMatched??0)} matched · {Number(value.itemsFiltered??0)} excluded
    </span>)}
   </div>
  </div>}
  <AssessmentPreferences disabled={active(phase)} registerSave={registerPreferenceSaver}/>
  {confirmation}
 </section>;
}
