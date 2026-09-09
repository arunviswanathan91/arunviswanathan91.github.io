import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Phase = "idle" | "starting" | "queued" | "running" | "done" | "failed";
interface StartResponse {
 run_id?: string;
 status?: "queued" | "running";
 query?: string | null;
 already_running?: boolean;
 error?: string;
}
interface RunStats {
 matched?: number;
 created?: number;
 fetched?: number;
 evaluated?: number;
 filtered?: number;
}
interface RunRow {
 status: "queued" | "running" | "done" | "partial" | "failed";
 query: string | null;
 stats: RunStats | null;
 error: string | null;
}

const active = (phase: Phase) => phase === "starting" || phase === "queued" || phase === "running";

export function OpportunityDiscovery({ onComplete }: { onComplete(): void }) {
 const [query, setQuery] = useState("");
 const [phase, setPhase] = useState<Phase>("idle");
 const [message, setMessage] = useState("Search job and postdoc sources using your profile filters.");
 const timer = useRef<number | null>(null);
 const generation = useRef(0);

 useEffect(() => () => {
  generation.current++;
  if (timer.current !== null) window.clearTimeout(timer.current);
 }, []);

 const follow = (runId: string, current: number, startedAt: number) => {
  const poll = async () => {
   if (generation.current !== current || !supabase) return;
   const { data, error } = await supabase.from("discovery_runs")
    .select("status,query,stats,error").eq("id", runId).single();
   if (generation.current !== current) return;
   if (error || !data) {
    setPhase("failed");
    setMessage(error?.message ?? "Could not read discovery progress.");
    return;
   }

   const row = data as RunRow;
   if (row.status === "queued" || row.status === "running") {
    setPhase(row.status);
    setMessage(row.status === "queued"
     ? "Search queued — waiting for the discovery worker."
     : "Searching live sources — you can leave this page while it finishes.");
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
   setPhase("done");
   setMessage(matched
    ? `Found ${matched} match${matched === 1 ? "" : "es"} · ${created} new${row.status === "partial" ? " · some sources had issues" : ""}.`
    : `No matching results in ${checked} checked listing${checked === 1 ? "" : "s"}${row.status === "partial" ? "; some sources had issues" : ""}.`);
   onComplete();
  };
  void poll();
 };

 const submit = async (event: FormEvent) => {
  event.preventDefault();
  const requested = query.trim().replace(/\s+/g, " ");
  if (!requested || active(phase)) return;
  if (!supabase) {
   setPhase("failed");
   setMessage("Discovery requires the connected Supabase workspace.");
   return;
  }

  if (timer.current !== null) window.clearTimeout(timer.current);
  const current = ++generation.current;
  setPhase("starting");
  setMessage("Starting a protected workspace search…");
  const { data, error } = await supabase.functions.invoke<StartResponse>("opportunity-discover", {
   body: { query: requested },
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
   : `Searching for “${requested}” — results will appear here automatically.`);
  follow(data.run_id, current, Date.now());
 };

 const Icon = phase === "done" ? CheckCircle2 : phase === "failed" ? TriangleAlert : active(phase) ? LoaderCircle : Search;
 return <section className={`discovery-search discovery-${phase}`}>
  <div className="discovery-heading">
   <span className="discovery-icon"><Icon className={active(phase) ? "spin" : ""}/></span>
   <div>
    <h2>Find opportunities</h2>
    <p>Search live job and postdoc sources. New matches are added to this workspace.</p>
   </div>
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
  </form>
  <p className="discovery-status" role="status" aria-live="polite">{message}</p>
 </section>;
}
