import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./config.js";
import type { SearchProfile, SourceOutcome } from "./types.js";
import type { Candidate } from "./dedupe/cascade.js";

export interface SourceRow {
 id: string;
 source_key: string;
 kind: string;
 enabled: boolean;
 precedence: number;
 config: Record<string, unknown>;
 cursor: Record<string, unknown>;
 consecutive_failures: number;
 disabled_until: string | null;
}

/** Thin wrapper over the service-role client: every query in one place. */
export class Db {
 readonly client: SupabaseClient;
 constructor(env: Env) {
  this.client = createClient(env.supabaseUrl, env.serviceRoleKey, {
   auth: { persistSession: false, autoRefreshToken: false },
  });
 }

 async resolveUserId(explicit: string | null): Promise<string> {
  if (explicit) return explicit;
  const { data } = await this.client.from("discovery_profiles").select("user_id").eq("active", true).limit(1).maybeSingle();
  if (data?.user_id) return String(data.user_id);
  const { data: prof } = await this.client.from("profiles").select("id").limit(1).maybeSingle();
  if (prof?.id) return String(prof.id);
  throw new Error("Could not determine a user id — set DISCOVERY_USER_ID");
 }

 async loadProfile(userId: string): Promise<SearchProfile> {
  const { data } = await this.client
   .from("discovery_profiles").select("*")
   .eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
  const d = (data ?? {}) as Record<string, any>;
  return {
   id: d.id ?? null,
   userId,
   terms: d.terms?.length ? d.terms : ["pancreatic cancer postdoc", "cancer immunology postdoctoral", "tumour microenvironment researcher"],
   types: d.types?.length ? d.types : ["Postdoc", "Research scientist", "Industry R&D", "Fellowship"],
   homeCity: d.home_city ?? "Thiruvananthapuram",
   indiaCities: d.india_cities ?? [],
   countries: d.countries?.length ? d.countries : ["IN"],
   remoteOk: d.remote_ok ?? true,
   facultyOk: d.faculty_ok ?? false,
   yearsExperience: d.years_experience ?? 0,
   salaryFloorInr: d.salary_floor_inr ?? null,
   rejectBelowFloor: d.reject_below_floor ?? false,
   blockedOrgs: d.blocked_orgs ?? [],
   maxLlmCalls: d.max_llm_calls ?? 40,
   maxCrawlPages: d.max_crawl_pages ?? 120,
   maxHttpRequests: d.max_http_requests ?? 250,
  };
 }

 async loadSources(userId: string): Promise<SourceRow[]> {
  const { data, error } = await this.client
   .from("discovery_sources").select("*")
   .eq("user_id", userId).eq("enabled", true).order("precedence");
  if (error) throw new Error("loadSources: " + error.message);
  return (data ?? []) as SourceRow[];
 }

 async createRun(userId: string, profileId: string | null, trigger: string, query: string | null, chatId: number | null): Promise<string | null> {
  const { data, error } = await this.client.from("discovery_runs")
   .insert({ user_id: userId, profile_id: profileId, trigger, status: "running", query, chat_id: chatId, started_at: new Date().toISOString() })
   .select("id").maybeSingle();
  if (error) return null;
  return data?.id ? String(data.id) : null;
 }

 /**
  * Claims a queued run created by an interactive trigger. Zero rows means the
  * token was already used, which makes the endpoint replay-safe.
  */
 async claimRun(runId: string, token: string) {
  const { data } = await this.client.from("discovery_runs")
   .update({ status: "running", started_at: new Date().toISOString(), claim_token: null })
   .eq("id", runId).eq("claim_token", token).eq("status", "queued")
   .gt("expires_at", new Date().toISOString())
   .select("user_id,profile_id,query,chat_id,trigger").maybeSingle();
  return data ?? null;
 }

 async finishRun(runId: string | null, status: string, stats: unknown, error?: string) {
  if (!runId) return;
  await this.client.from("discovery_runs")
   .update({ status, finished_at: new Date().toISOString(), stats, error: error ?? null })
   .eq("id", runId);
 }

 async recordSourceOutcome(runId: string | null, userId: string, o: SourceOutcome) {
  if (!runId) return;
  await this.client.from("discovery_run_sources").upsert({
   run_id: runId, user_id: userId, source_key: o.sourceKey, status: o.status,
   items_fetched: o.itemsFetched, items_new: o.itemsNew, pages: o.pages,
   api_calls: o.apiCalls, duration_ms: o.durationMs, error: o.error ?? null,
  }, { onConflict: "run_id,source_key" });
 }

 async markSourceSuccess(id: string, cursor: unknown) {
  await this.client.from("discovery_sources")
   .update({ cursor, last_success_at: new Date().toISOString(), consecutive_failures: 0, last_error: null, disabled_until: null })
   .eq("id", id);
 }

 /** Three strikes opens a 24h circuit breaker so one broken site can't dominate a run. */
 async markSourceFailure(id: string, failures: number, error: string) {
  const next = failures + 1;
  await this.client.from("discovery_sources").update({
   consecutive_failures: next,
   last_error: error.slice(0, 500),
   disabled_until: next >= 3 ? new Date(Date.now() + 86400000).toISOString() : null,
  }).eq("id", id);
 }

 /**
  * Insert-if-new. The unique constraint on (user, source, external_id, content_hash)
  * means an unchanged listing conflicts and returns nothing, so the number of rows
  * returned here is exactly the number of things that changed.
  */
 async insertRawItems(rows: Record<string, unknown>[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const { data, error } = await this.client.from("discovery_raw_items")
   .upsert(rows, { onConflict: "user_id,source_key,external_id,content_hash", ignoreDuplicates: true })
   .select("content_hash");
  if (error) throw new Error("insertRawItems: " + error.message);
  return new Set((data ?? []).map(r => String((r as any).content_hash)));
 }

 async loadCandidates(userId: string): Promise<Candidate[]> {
  const { data, error } = await this.client
   .from("opportunities")
   .select("id,org_key,title_key,role,city,country,is_remote,posted_at,simhash,deadline,status")
   .eq("user_id", userId).neq("status", "Dismissed").limit(2000);
  if (error) throw new Error("loadCandidates: " + error.message);

  const { data: srcs } = await this.client
   .from("opportunity_sources").select("opportunity_id,url_hash,ats_key").eq("user_id", userId).limit(5000);

  const byOpp = new Map<string, { urlHash: string; atsKey: string | null }[]>();
  for (const s of (srcs ?? []) as any[]) {
   const list = byOpp.get(s.opportunity_id) ?? [];
   list.push({ urlHash: s.url_hash, atsKey: s.ats_key });
   byOpp.set(s.opportunity_id, list);
  }

  const out: Candidate[] = [];
  for (const row of (data ?? []) as any[]) {
   const links = byOpp.get(row.id) ?? [];
   out.push({
    id: row.id,
    urlHash: links[0]?.urlHash ?? "",
    atsKey: links.find(l => l.atsKey)?.atsKey ?? null,
    orgKey: row.org_key,
    titleKey: row.title_key,
    title: row.role ?? "",
    locKey: row.is_remote ? "REMOTE" : (row.city ?? row.country ?? null),
    postedAt: row.posted_at,
    simhash: row.simhash === null || row.simhash === undefined ? null : BigInt(row.simhash),
    deadline: row.deadline,
    status: row.status,
   });
   // Extra URL aliases so T1 matches whichever source found it first.
   for (const l of links.slice(1)) {
    out.push({ ...out[out.length - 1], urlHash: l.urlHash, atsKey: l.atsKey });
   }
  }
  return out;
 }

 async prune(userId: string, keep = 200) {
  const { data } = await this.client.rpc("discovery_prune", { p_user_id: userId, p_keep: keep });
  return data ?? null;
 }
}
