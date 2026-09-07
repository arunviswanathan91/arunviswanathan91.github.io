import { Db, type SourceRow } from "./db.js";
import { Http, DEFAULT_HTTP } from "./http.js";
import { RunLogger } from "./log.js";
import { readEnv, SCHEDULE_CAPS, INTERACTIVE_CAPS } from "./config.js";
import { makeAdapter } from "./sources/registry.js";
import { SourceConfigError } from "./sources/types.js";
import { hardFilter, scoreOpportunity } from "./score/score.js";
import { matchCandidate, type Candidate } from "./dedupe/cascade.js";
import { orgKey, simhash, simhashBands, titleKey } from "./dedupe/keys.js";
import { normalizeForHash, excerpt } from "./normalize/text.js";
import { locKey } from "./normalize/location.js";
import { salaryDisplay, salarySourceLabel, annualInr } from "./normalize/salary.js";
import type {
 NormalizedOpportunity, OpportunitySummary, RunCaps, RunResult, SearchProfile, SourceOutcome,
} from "./types.js";

export interface RunOptions {
 userId?: string | null;
 runId?: string | null;
 /** If set alongside runId, the run is atomically claimed before executing --
  *  a zero-row claim (already used, or expired) skips the run rather than
  *  duplicating one that's already in flight or done. */
 claimToken?: string | null;
 trigger?: "schedule" | "telegram" | "manual";
 query?: string | null;
 chatId?: number | null;
 caps?: Partial<RunCaps>;
 dryRun?: boolean;
 quiet?: boolean;
}

const SOURCE_TIMEOUT_MS = { api: 90_000, feed: 90_000, crawl: 180_000 } as const;

/** The single orchestration path. cli.ts and server.ts only translate into this. */
export async function runDiscovery(opts: RunOptions = {}): Promise<RunResult> {
 const log = new RunLogger(opts.quiet);
 const env = readEnv();
 const db = new Db(env);
 const trigger = opts.trigger ?? "schedule";
 const caps: RunCaps = {
  ...(trigger === "telegram" ? INTERACTIVE_CAPS : SCHEDULE_CAPS),
  ...opts.caps,
 };
 const startedAt = Date.now();
 const deadlineAt = startedAt + caps.maxRuntimeMs;

 const userId = await db.resolveUserId(opts.userId ?? env.userId ?? null);
 const profile = await db.loadProfile(userId);
 if (opts.query) profile.terms = [opts.query, ...profile.terms].slice(0, 5);

 let runId = opts.runId ?? null;
 if (!runId && !opts.dryRun) {
  runId = await db.createRun(userId, profile.id, trigger, opts.query ?? null, opts.chatId ?? null);
 } else if (runId && opts.claimToken && !opts.dryRun) {
  // A caller (the Telegram webhook, via repository_dispatch) pre-created this row
  // for its own busy-check. Claiming it atomically means a duplicate dispatch --
  // GitHub's delivery is at-least-once -- skips instead of running the pipeline
  // twice or leaving a second orphaned run row behind.
  const claimed = await db.claimRun(runId, opts.claimToken);
  if (!claimed) {
   log.info("run already claimed or expired, skipping", { runId });
   return { runId, status: "done", fetched: 0, deduped: 0, created: 0, changed: 0, bySource: {}, top: [], degradations: [] };
  }
 } else if (runId && !opts.dryRun) {
  await db.client.from("discovery_runs")
   .update({ status: "running", started_at: new Date().toISOString() })
   .eq("id", runId).eq("status", "queued");
 }

 const sources = await db.loadSources(userId);
 log.info("run starting", { userId, trigger, sources: sources.length, dryRun: !!opts.dryRun });

 const http = new Http(DEFAULT_HTTP, caps.maxHttpRequests);
 const bySource: Record<string, SourceOutcome> = {};
 const degradations: string[] = [];
 const accepted: { o: NormalizedOpportunity; score: ReturnType<typeof scoreOpportunity> }[] = [];
 let fetched = 0;

 for (const row of sources) {
  if (Date.now() > deadlineAt) { degradations.push("runtime cap"); break; }
  const outcome = await runSource(row, { db, http, profile, caps, deadlineAt, log, userId, runId, dryRun: !!opts.dryRun });
  bySource[row.source_key] = outcome;
  fetched += outcome.itemsFetched;
  if (outcome.status === "skipped_config") degradations.push(`${row.source_key} (not configured)`);
  if (outcome.status === "skipped_circuit") degradations.push(`${row.source_key} (temporarily disabled)`);
  if (outcome.status === "failed") degradations.push(`${row.source_key} (failed)`);
  for (const item of outcome_items(outcome)) accepted.push(item);
  await db.recordSourceOutcome(runId, userId, outcome);
 }

 // Dedup and persist. Candidates are loaded once; matches are resolved in memory
 // because at a few thousand rows that is faster than a query per item.
 const candidates: Candidate[] = opts.dryRun ? [] : await db.loadCandidates(userId);
 let created = 0, changed = 0, deduped = 0;
 const summaries: OpportunitySummary[] = [];

 for (const { o, score } of accepted) {
  const probe = {
   urlHash: o.urlHash,
   atsKey: o.atsKey,
   orgKey: orgKey(o.organization),
   title: o.title,
   locKey: locKey(o.city, o.country, o.isRemote),
   postedAt: o.postedAt,
   simhash: o.descriptionText.length >= 400 ? simhash(normalizeForHash(o.descriptionText)) : null,
   descriptionLength: o.descriptionText.length,
  };
  const match = matchCandidate(probe, candidates);

  if (match.candidate && !match.repost) {
   deduped++;
   if (!opts.dryRun) await linkSource(db, userId, match.candidate.id, o, match.signal, match.confidence);
   continue;
  }

  if (opts.dryRun) {
   created++;
   summaries.push(toSummary("dry-run", o, score.score));
   continue;
  }

  const id = await insertOpportunity(db, userId, runId, profile, o, score, probe.simhash);
  if (id) {
   created++;
   candidates.push({ ...probe, id, titleKey: titleKey(o.title), deadline: o.deadline, status: "New" });
   summaries.push(toSummary(id, o, score.score));
  }
  if (created >= caps.maxNewOpportunities) { degradations.push("new-opportunity cap"); break; }
 }

 if (!opts.dryRun) await db.prune(userId);

 const anyOk = Object.values(bySource).some(s => s.status === "ok" || s.status === "partial");
 const status: RunResult["status"] = anyOk ? (degradations.length ? "partial" : "done") : (sources.length ? "failed" : "done");

 const result: RunResult = {
  runId, status, fetched, deduped, created, changed,
  bySource,
  top: summaries.sort((a, b) => b.score - a.score).slice(0, 5),
  degradations,
 };

 if (!opts.dryRun) await db.finishRun(runId, status, {
  fetched, deduped, created, changed, durationMs: Date.now() - startedAt, degradations,
 });
 log.info("run finished", { status, fetched, deduped, created, durationMs: Date.now() - startedAt });
 return result;
}

// --- source execution, isolated so one bad site never fails the run ----------

interface SourceCtx {
 db: Db; http: Http; profile: SearchProfile; caps: RunCaps; deadlineAt: number;
 log: RunLogger; userId: string; runId: string | null; dryRun: boolean;
}

const carried = new WeakMap<SourceOutcome, { o: NormalizedOpportunity; score: ReturnType<typeof scoreOpportunity> }[]>();
const outcome_items = (o: SourceOutcome) => carried.get(o) ?? [];

async function runSource(row: SourceRow, c: SourceCtx): Promise<SourceOutcome> {
 const t0 = Date.now();
 const base: SourceOutcome = {
  sourceKey: row.source_key, status: "ok", itemsFetched: 0, itemsNew: 0,
  pages: 0, apiCalls: 0, durationMs: 0,
 };
 const kept: { o: NormalizedOpportunity; score: ReturnType<typeof scoreOpportunity> }[] = [];
 carried.set(base, kept);

 if (row.disabled_until && new Date(row.disabled_until) > new Date()) {
  return { ...base, status: "skipped_circuit", durationMs: Date.now() - t0 };
 }

 const adapter = makeAdapter(row.source_key);
 if (!adapter) return { ...base, status: "failed", error: "no adapter", durationMs: Date.now() - t0 };

 try {
  adapter.configure(row.config ?? {}, process.env);
 } catch (e) {
  if (e instanceof SourceConfigError) {
   c.log.warn(`${row.source_key} skipped`, { reason: e.message });
   return { ...base, status: "skipped_config", durationMs: Date.now() - t0 };
  }
  throw e;
 }

 const timeout = SOURCE_TIMEOUT_MS[adapter.kind];
 const window = {
  maxItems: c.caps.maxItemsPerSource,
  maxRequests: Math.min(c.caps.maxCrawlPages, c.http.budgetRemaining),
  maxPages: c.caps.maxPagesPerHost,
  deadlineAt: Math.min(c.deadlineAt, Date.now() + timeout),
 };
 const query = {
  terms: c.profile.terms,
  countries: c.profile.countries,
  cities: c.profile.indiaCities,
  remoteOk: c.profile.remoteOk,
  since: row.cursor?.lastSuccessIso ? new Date(String(row.cursor.lastSuccessIso)) : null,
 };
 const ctx = {
  http: c.http,
  cursorIn: row.cursor ?? {},
  now: new Date(),
  log: (m: string, extra?: Record<string, unknown>) => c.log.debug(m, extra),
 };

 try {
  let cursorOut: unknown = row.cursor ?? {};
  const rawRows: Record<string, unknown>[] = [];
  const parsed: NormalizedOpportunity[] = [];

  for await (const page of adapter.fetch(query, window, ctx)) {
   base.pages++;
   base.apiCalls += page.requestsUsed;
   base.itemsFetched += page.items.length;
   if (page.cursor) cursorOut = page.cursor;

   for (const item of page.items) {
    const o = adapter.normalize(item, ctx);
    if (!o) continue;
    parsed.push(o);
    rawRows.push({
     user_id: c.userId, run_id: c.runId, source_key: o.sourceKey, external_id: o.externalId,
     url: o.url, url_canon: o.urlCanon, url_hash: o.urlHash, content_hash: o.contentHash,
     payload: item.payload as object, processed: false,
    });
   }
   if (base.itemsFetched >= window.maxItems || Date.now() > window.deadlineAt) break;
   if (page.exhausted) break;
  }

  // Written before anything is judged, so a crash later costs no re-fetching.
  // The set that comes back is exactly what is new or changed.
  const changedHashes = c.dryRun ? new Set(parsed.map(p => p.contentHash)) : await c.db.insertRawItems(rawRows);
  base.itemsNew = changedHashes.size;

  for (const o of parsed) {
   if (!changedHashes.has(o.contentHash)) continue;      // seen before: costs nothing
   const verdict = hardFilter(o, c.profile);
   if (!verdict.keep) continue;
   kept.push({ o, score: scoreOpportunity(o, c.profile) });
  }

  if (!c.dryRun) await c.db.markSourceSuccess(row.id, cursorOut);
  return { ...base, durationMs: Date.now() - t0 };
 } catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  c.log.warn(`${row.source_key} failed`, { error: msg });
  if (!c.dryRun) await c.db.markSourceFailure(row.id, row.consecutive_failures ?? 0, msg);
  return { ...base, status: "failed", error: msg, durationMs: Date.now() - t0 };
 }
}

// --- persistence -------------------------------------------------------------

function toSummary(id: string, o: NormalizedOpportunity, score: number): OpportunitySummary {
 return {
  id, score, role: o.title, organization: o.organization,
  location: o.locationRaw, deadline: o.deadline,
  salaryDisplay: salaryDisplay(o.salary), url: o.url,
 };
}

async function insertOpportunity(
 db: Db, userId: string, runId: string | null, profile: SearchProfile,
 o: NormalizedOpportunity, score: ReturnType<typeof scoreOpportunity>, hash: bigint | null,
): Promise<string | null> {
 const bands = hash === null ? [null, null, null, null] : simhashBands(hash);
 const { data, error } = await db.client.from("opportunities").insert({
  user_id: userId, profile_id: profile.id, run_id: runId,
  status: "New", role: o.title, organization: o.organization,
  organization_url: o.organizationUrl, department: o.department,
  opportunity_type: o.opportunityType,
  location: o.locationRaw, city: o.city, region: o.region, country: o.country, is_remote: o.isRemote,
  posted_at: o.postedAt, deadline: o.deadline,
  match_score: score.score, fit_reason: score.reason, score_breakdown: score.breakdown,
  salary_min: o.salary?.min ?? null, salary_max: o.salary?.max ?? null,
  salary_currency: o.salary?.currency ?? null, salary_period: o.salary?.period ?? null,
  salary_is_predicted: o.salary?.isPredicted ?? null,
  salary_annual_inr: annualInr(o.salary),
  salary_display: salaryDisplay(o.salary), salary_source: salarySourceLabel(o.salary),
  url: o.url, apply_url: o.applyUrl, source_count: 1, sources_summary: o.sourceKey,
  summary: excerpt(o.descriptionText, 400),
  description_excerpt: excerpt(o.descriptionText, 2000),
  org_key: orgKey(o.organization), title_key: titleKey(o.title),
  simhash: hash === null ? null : hash.toString(),
  simhash_b0: bands[0], simhash_b1: bands[1], simhash_b2: bands[2], simhash_b3: bands[3],
  content_hash: o.contentHash, enrichment: o.completeness < 0.6 ? "deferred" : "none",
 }).select("id").maybeSingle();

 if (error || !data) return null;
 const id = String(data.id);
 await db.client.from("opportunity_sources").upsert({
  user_id: userId, opportunity_id: id, source_key: o.sourceKey, external_id: o.externalId,
  url: o.url, url_canon: o.urlCanon, url_hash: o.urlHash, ats_key: o.atsKey,
  is_primary: true, match_signal: "url", match_confidence: 1, content_hash: o.contentHash,
 }, { onConflict: "user_id,source_key,external_id" });
 return id;
}

/** A second sighting adds a source row and extends the deadline, never shrinks it. */
async function linkSource(
 db: Db, userId: string, opportunityId: string,
 o: NormalizedOpportunity, signal: string, confidence: number,
) {
 await db.client.from("opportunity_sources").upsert({
  user_id: userId, opportunity_id: opportunityId, source_key: o.sourceKey, external_id: o.externalId,
  url: o.url, url_canon: o.urlCanon, url_hash: o.urlHash, ats_key: o.atsKey,
  is_primary: false, match_signal: signal, match_confidence: confidence,
  content_hash: o.contentHash, last_seen_at: new Date().toISOString(),
 }, { onConflict: "user_id,source_key,external_id" });

 const { count } = await db.client.from("opportunity_sources")
  .select("id", { count: "exact", head: true }).eq("opportunity_id", opportunityId);

 const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString(), source_count: count ?? 1 };
 if (o.deadline) {
  const { data: cur } = await db.client.from("opportunities").select("deadline").eq("id", opportunityId).maybeSingle();
  const existing = cur?.deadline ? new Date(cur.deadline).getTime() : 0;
  if (new Date(o.deadline).getTime() > existing) {
   patch.deadline = o.deadline;
   patch.last_changed_at = new Date().toISOString();
  }
 }
 await db.client.from("opportunities").update(patch).eq("id", opportunityId);
}
