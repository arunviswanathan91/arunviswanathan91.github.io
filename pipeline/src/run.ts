import { Db, type SourceRow } from "./db.js";
import { Http, DEFAULT_HTTP } from "./http.js";
import { RunLogger } from "./log.js";
import { readEnv, FIRECRAWL_MAX_PER_RUN, SCHEDULE_CAPS, INTERACTIVE_CAPS } from "./config.js";
import { makeRenderer } from "./sources/firecrawl.js";
import { makeAdapter } from "./sources/registry.js";
import { SourceConfigError } from "./sources/types.js";
import { hardFilter, scoreOpportunity } from "./score/score.js";
import { queryDisposition, queryRelevance } from "./score/query.js";
import { matchCandidate, type Candidate } from "./dedupe/cascade.js";
import { orgKey, simhash, simhashBands, titleKey } from "./dedupe/keys.js";
import { normalizeForHash, excerpt } from "./normalize/text.js";
import { locKey } from "./normalize/location.js";
import { salaryDisplay, salarySourceLabel, annualInr, salaryCurrencyConversion } from "./normalize/salary.js";
import { loadInrExchangeRates } from "./currency.js";
import { ensureDefaultSources } from "./sources/catalog/defaults.js";
import { isFreshSearch, shouldEvaluate, shouldPersistRunItem, termsForDiscovery, termsForRun } from "./search/query.js";
import { contextProviders, createContextFallback, ContextProvidersUnavailable, enrichWithFallback, type OpportunityContext } from "./enrich/context.js";
import { enrichMetadataWithOpenRouter } from "./enrich/metadata.js";
import { assessmentPreferences } from "./enrich/assessment.js";
import type {
 EnrichmentStats, MetadataStats, NormalizedOpportunity, OpportunitySummary, RunCaps, RunMode, RunResult, SearchProfile, SourceOutcome,
} from "./types.js";

export interface RunOptions {
 userId?: string | null;
 runId?: string | null;
 /** If set alongside runId, the run is atomically claimed before executing --
  *  a zero-row claim (already used, or expired) skips the run rather than
  *  duplicating one that's already in flight or done. */
 claimToken?: string | null;
 trigger?: "schedule" | "telegram" | "manual";
 mode?: RunMode | "discover";
 query?: string | null;
 chatId?: number | null;
 caps?: Partial<RunCaps>;
 dryRun?: boolean;
 quiet?: boolean;
 contextBatchSize?: number;
 refreshContext?: boolean;
}

const SOURCE_TIMEOUT_MS = { api: 90_000, feed: 90_000, crawl: 180_000 } as const;
type AcceptedOpportunity = {
 o: NormalizedOpportunity;
 /** Stable profile score stored on the shared opportunity. */
 score: ReturnType<typeof scoreOpportunity>;
 /** Query-specific score stored only on this run's result ledger. */
 runScore: ReturnType<typeof scoreOpportunity>;
 queryMatched: boolean;
};
interface SourceExecution { outcome: SourceOutcome; accepted: AcceptedOpportunity[] }

const emptyEnrichment = (requested = 0): EnrichmentStats => ({
 requested, candidates: 0, attempted: 0, succeeded: 0, failed: 0,
 skipped: 0, pending: 0, requestsUsed: 0,
});
const emptyMetadata = (): MetadataStats => ({
 candidates: 0, deterministic: 0, aiBatches: 0, aiUpdated: 0, unresolved: 0, backfilled: 0,
});

function candidateToOpportunity(candidate: import("./db.js").ContextCandidate): NormalizedOpportunity {
 return {
  sourceKey: "backfill", externalId: candidate.id, url: candidate.url ?? "https://invalid.example/",
  urlCanon: candidate.url ?? "", urlHash: "", applyUrl: null, atsKey: null,
  title: candidate.role, organization: candidate.organization, organizationUrl: candidate.organization_url,
  department: null, locationRaw: candidate.location, city: candidate.city, region: "Other",
  country: candidate.country, isRemote: false, postedAt: null, deadline: null,
  employmentType: null, opportunityType: "Other",
  descriptionText: candidate.description_excerpt ?? candidate.summary ?? "", salary: null,
  contentHash: candidate.id, completeness: 0,
 };
}

const boundedBatchSize = (value: number | undefined, fallback: number) => {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : fallback;
};

/** The single orchestration path. cli.ts and server.ts only translate into this. */
export async function runDiscovery(opts: RunOptions = {}): Promise<RunResult> {
 const log = new RunLogger(opts.quiet);
 const env = readEnv();
 const db = new Db(env);
 const trigger = opts.trigger ?? "schedule";
 const queryText = opts.query?.trim() || null;
 const mode: RunMode = opts.mode === "backfill" ? "backfill"
  : opts.mode === "search" || (!opts.mode && queryText) ? "search" : "discovery";
 const backfill = mode === "backfill";
 const focusedSearch = mode === "search";
 const freshSearch = focusedSearch || (!backfill && isFreshSearch(trigger));
 const caps: RunCaps = {
  ...(trigger === "schedule" || backfill ? SCHEDULE_CAPS : INTERACTIVE_CAPS),
  ...opts.caps,
 };
 const startedAt = Date.now();
 const deadlineAt = startedAt + caps.maxRuntimeMs;

 const userId = await db.resolveUserId(opts.userId ?? env.userId ?? null);
 const profile = await db.loadProfile(userId);
 const preferences = assessmentPreferences(profile.assessmentPreferences, profile.terms);
 profile.terms = focusedSearch
  ? termsForRun(preferences.interests.length ? preferences.interests : profile.terms, queryText)
  : termsForDiscovery();

 // Normal runs self-heal databases seeded by an older release. Existing rows
 // are never overwritten, so user-disabled sources and cursors are preserved.
 if (!opts.dryRun && !backfill) {
  const registered = await ensureDefaultSources(db, userId);
  if (registered.length) log.info("registered new discovery sources", { sources: registered });
 }

 let runId = opts.runId ?? null;
 if (!runId && !opts.dryRun) {
  runId = await db.createRun(userId, profile.id, trigger, mode, queryText, opts.chatId ?? null);
 } else if (runId && opts.claimToken && !opts.dryRun) {
  // An Edge Function pre-created this row for its own busy-check. Claiming it
  // atomically means a retried Cloud Run request skips instead of executing the
  // pipeline twice or leaving a second orphaned run row behind.
  const claimed = await db.claimRun(runId, opts.claimToken);
  if (!claimed) {
   log.info("run already claimed or expired, skipping", { runId });
   return {
    runId, status: "done", mode, query: queryText,
    fetched: 0, evaluated: 0, filtered: 0, matched: 0, deduped: 0,
    created: 0, changed: 0, persistenceFailures: 0, filterReasons: {},
    bySource: {}, top: [], degradations: [], metadata: emptyMetadata(), enrichment: emptyEnrichment(),
   };
  }
 } else if (runId && !opts.dryRun) {
  await db.client.from("discovery_runs")
   .update({ status: "running", started_at: new Date().toISOString() })
   .eq("id", runId).eq("status", "queued");
 }

 if (!opts.dryRun) await db.updateRunProgress(runId, {
  phase: "starting", mode, query: queryText,
 });

 const sources = backfill ? [] : await db.loadSources(userId);
 log.info("run starting", {
  userId, trigger, mode,
  query: queryText, sources: sources.length, dryRun: !!opts.dryRun,
 });

 const http = new Http(DEFAULT_HTTP, caps.maxHttpRequests);
 // One shared budget for the whole run, so N crawl sources each hitting a
 // JS-rendered seed can't multiply into N x FIRECRAWL_MAX_PER_RUN calls.
 const renderer = makeRenderer(env.firecrawlApiKey, FIRECRAWL_MAX_PER_RUN);
 const bySource: Record<string, SourceOutcome> = {};
 const degradations: string[] = [];
 const metadata = emptyMetadata();
 const metadataHttp = new Http({ ...DEFAULT_HTTP, timeoutMs: 45_000, maxRetries: 1 }, 18);
 profile.comparisonCurrency = preferences.displayCurrency;
 profile.exchangeRates = await loadInrExchangeRates(new Http(
  { ...DEFAULT_HTTP, minHostIntervalMs: 0, timeoutMs: 8_000, maxRetries: 0 }, 2,
 ));
 if (profile.exchangeRates) {
  log.info("currency rates loaded", {
   provider: "fawazahmed0/exchange-api", asOf: profile.exchangeRates.asOf,
   comparisonCurrency: profile.comparisonCurrency,
  });
 } else {
  degradations.push("currency conversion unavailable");
  log.warn("currency conversion skipped", { reason: "both exchange-api endpoints failed validation" });
 }
 const accepted: AcceptedOpportunity[] = [];
 let fetched = 0, evaluated = 0, filtered = 0;
 const filterReasons: Record<string, number> = {};

 for (const row of sources) {
  if (Date.now() > deadlineAt) { degradations.push("runtime cap"); break; }
  const execution = await runSource(row, {
   db, http, renderer, profile, caps, deadlineAt, log, userId, runId,
   dryRun: !!opts.dryRun, freshSearch, focusedSearch, queryText,
   env, metadataHttp, metadata,
  });
  const outcome = execution.outcome;
  bySource[row.source_key] = outcome;
  fetched += outcome.itemsFetched;
  evaluated += outcome.itemsEvaluated;
  filtered += outcome.itemsFiltered;
  for (const [reason, count] of Object.entries(outcome.filterReasons)) {
   filterReasons[reason] = (filterReasons[reason] ?? 0) + count;
  }
  if (outcome.status === "skipped_config") degradations.push(`${row.source_key} (not configured)`);
  if (outcome.status === "skipped_circuit") degradations.push(`${row.source_key} (temporarily disabled)`);
  if (outcome.status === "failed") degradations.push(`${row.source_key} (failed)`);
  for (const item of execution.accepted) accepted.push(item);
  await db.recordSourceOutcome(runId, userId, outcome);
  await db.updateRunProgress(runId, {
   phase: "discovering", mode, query: queryText, currentSource: row.source_key,
   fetched, evaluated, filtered,
   matched: Object.values(bySource).reduce((sum, source) => sum + source.itemsMatched, 0),
   filterReasons, bySource, metadata,
  });
 }

 if (backfill && !opts.dryRun && Date.now() < deadlineAt) {
  const batch = boundedBatchSize(opts.contextBatchSize, 5);
  const candidates = await db.loadMetadataCandidates(userId, batch, !!opts.refreshContext);
  for (let offset = 0; offset < candidates.length; offset += 20) {
   const chunk = candidates.slice(offset, offset + 20);
   const normalized = chunk.map(candidateToOpportunity);
   const repaired = await enrichMetadataWithOpenRouter(env, metadataHttp, normalized, metadata, !!opts.refreshContext);
   for (let i = 0; i < repaired.length; i++) {
    const before = normalized[i]!, after = repaired[i]!, candidate = chunk[i]!;
    if (before.country !== after.country || before.organization !== after.organization || before.city !== after.city) {
     await db.saveOpportunityMetadata(candidate, after);
     metadata.backfilled++;
    }
   }
  }
 }

 // Dedup and persist. Candidates are loaded once; matches are resolved in memory
 // because at a few thousand rows that is faster than a query per item.
 const candidates: Candidate[] = opts.dryRun || backfill ? [] : await db.loadCandidates(userId);
 let created = 0, changed = 0, deduped = 0, persistenceFailures = 0;
 const summaries: OpportunitySummary[] = [];
 const summaryIds = new Set<string>();

 for (const { o, score, runScore, queryMatched } of accepted) {
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
   if (!opts.dryRun) await linkSource(
    db, userId, match.candidate.id, profile, o, score, match.signal, match.confidence, !focusedSearch,
   );
   if (!opts.dryRun) {
    const auditError = await db.linkRunItem(runId, o, match.candidate.id);
    if (auditError) log.warn("run-item opportunity link unavailable", { error: auditError });
   }
   // A person asking interactively wants useful current matches, including a
   // listing already found last night. Scheduled digests remain new-only.
   if (freshSearch && queryMatched && !summaryIds.has(match.candidate.id)) {
    summaries.push(toSummary(match.candidate.id, o, runScore.score, profile));
    summaryIds.add(match.candidate.id);
   }
   continue;
  }

  if (opts.dryRun) {
   created++;
   const dryId = `dry-run:${o.sourceKey}:${o.externalId}`;
   if (queryMatched) {
    summaries.push(toSummary(dryId, o, runScore.score, profile));
    summaryIds.add(dryId);
   }
   continue;
  }

  const inserted = await insertOpportunity(db, userId, runId, profile, o, score, probe.simhash);
  const id = inserted.id;
  if (id) {
   created++;
   const auditError = await db.linkRunItem(runId, o, id);
   if (auditError) log.warn("run-item opportunity link unavailable", { error: auditError });
   candidates.push({ ...probe, id, titleKey: titleKey(o.title), deadline: o.deadline, status: "New" });
   if (queryMatched) {
    summaries.push(toSummary(id, o, runScore.score, profile));
    summaryIds.add(id);
   }
  } else {
   persistenceFailures++;
   log.warn("opportunity insert failed", { source: o.sourceKey, error: inserted.error ?? "no row returned" });
  }
  if (created >= caps.maxNewOpportunities) { degradations.push("new-opportunity cap"); break; }
 }

 if (persistenceFailures) degradations.push(`${persistenceFailures} database insert(s) failed`);

 // Context enrichment has a separate request budget. Crawlers can use their
 // entire allowance without silently preventing an AI provider afterward.
 // A decision brief is intentionally substantial. Small resumable backfills
 // stay inside free-provider rate limits and the Cloud Run execution window.
 const defaultContextLimit = backfill ? 5 : trigger === "schedule" ? 5 : 8;
 const requestedContext = boundedBatchSize(opts.contextBatchSize, defaultContextLimit);
 const llmCallLimit = Math.max(0, Math.min(caps.maxLlmCalls, profile.maxLlmCalls) - metadata.aiBatches);
 const contextLimit = Math.min(llmCallLimit, requestedContext);
 const enrichment = emptyEnrichment(contextLimit);
 const providers = contextProviders(env);
 if (!opts.dryRun && providers.length && Date.now() < deadlineAt) {
  const loaded = await db.loadContextCandidates(
   userId, contextLimit, !!opts.refreshContext, preferences, backfill ? null : runId,
  );
  enrichment.candidates = loaded.candidates.length;
  enrichment.pending = loaded.total;
  const contextHttp = new Http(
   { ...DEFAULT_HTTP, timeoutMs: 50_000, maxRetries: 1 },
   Math.max(16, contextLimit * 10 + 4),
  );
  const fallback = createContextFallback<OpportunityContext>(providers, (from, to, error) =>
   log.warn("switching opportunity context provider", {
    from, to, error: error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700),
   }), llmCallLimit);
  log.info("opportunity context providers", { providers, openrouterModel: env.openrouterModel });
  for (const candidate of loaded.candidates) {
   if (Date.now() > deadlineAt) {
    enrichment.skipped = loaded.candidates.length - enrichment.attempted;
    degradations.push("context enrichment runtime cap");
    break;
   }
   enrichment.attempted++;
   try {
    const context = await enrichWithFallback(
     env, contextHttp, candidate, fallback, preferences, profile.exchangeRates, profile.comparisonCurrency,
    );
    await db.saveOpportunityContext(candidate, context as unknown as Record<string, unknown>);
    enrichment.succeeded++;
    log.info("opportunity context saved", { id: candidate.id, provider: context.provider, model: context.model });
   } catch (error) {
    enrichment.failed++;
    log.warn("opportunity context enrichment failed", {
     id: candidate.id,
     error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof ContextProvidersUnavailable) {
     enrichment.skipped = loaded.candidates.length - enrichment.attempted;
     degradations.push(error.message);
     break;
    }
   }
  }
  enrichment.pending = Math.max(0, loaded.total - enrichment.succeeded);
  enrichment.requestsUsed = contextHttp.requestsUsed;
 } else if (!opts.dryRun && !providers.length) {
  degradations.push("context enrichment unavailable (GEMINI_API_KEY, GROQ_API_KEY and OPENROUTER_API_KEY missing)");
  log.warn("opportunity context enrichment skipped", { reason: "no AI provider key configured" });
 }
 if (!opts.dryRun) log.info("opportunity context enrichment summary", { ...enrichment });

 if (enrichment.failed) degradations.push(`${enrichment.failed} context enrichment failure(s)`);

 if (!opts.dryRun && !backfill) await db.prune(userId);

 const anyOk = Object.values(bySource).some(s => s.status === "ok" || s.status === "partial");
 const status: RunResult["status"] = backfill
  ? ((!providers.length) || (enrichment.attempted > 0 && enrichment.succeeded === 0 && enrichment.failed > 0)
   ? "failed" : enrichment.failed || enrichment.skipped ? "partial" : "done")
  : anyOk ? (degradations.length ? "partial" : "done") : (sources.length ? "failed" : "done");

 const result: RunResult = {
  runId, status, mode, query: queryText,
  fetched, evaluated, filtered, matched: summaries.length, deduped, created, changed,
  persistenceFailures, filterReasons,
  bySource,
  top: summaries.sort((a, b) => b.score - a.score).slice(0, 5),
  degradations, metadata, enrichment,
 };

 if (!opts.dryRun) await db.finishRun(runId, status, {
  phase: "complete", mode: result.mode, query: queryText, fetched, evaluated, filtered,
  matched: result.matched, deduped, created, changed, persistenceFailures,
  filterReasons, bySource, durationMs: Date.now() - startedAt, degradations, metadata, enrichment,
 });
 log.info("run finished", {
  status, mode: result.mode, fetched, evaluated, filtered,
  matched: result.matched, deduped, created, enrichment, durationMs: Date.now() - startedAt,
 });
 return result;
}

// --- source execution, isolated so one bad site never fails the run ----------

interface SourceCtx {
 db: Db; http: Http; renderer: ((url: string) => Promise<string | null>) | null;
 profile: SearchProfile; caps: RunCaps; deadlineAt: number;
 log: RunLogger; userId: string; runId: string | null; dryRun: boolean; freshSearch: boolean;
 focusedSearch: boolean; queryText: string | null;
 env: ReturnType<typeof readEnv>; metadataHttp: Http; metadata: MetadataStats;
}

async function runSource(row: SourceRow, c: SourceCtx): Promise<SourceExecution> {
 const t0 = Date.now();
 const base: SourceOutcome = {
  sourceKey: row.source_key, status: "ok", itemsFetched: 0, itemsNew: 0,
  itemsEvaluated: 0, itemsFiltered: 0, itemsMatched: 0, itemsUnchanged: 0,
  filterReasons: {},
  pages: 0, apiCalls: 0, durationMs: 0,
 };
 const kept: AcceptedOpportunity[] = [];
 // Always return the outcome and its accepted rows together. Previously the
 // rows lived in a WeakMap keyed by `base`, but every `{ ...base }` return made
 // a new key and silently discarded every filter-passing opportunity.
 const finish = (patch: Partial<SourceOutcome> = {}): SourceExecution => ({
  outcome: { ...base, ...patch }, accepted: kept,
 });

 if (row.disabled_until && new Date(row.disabled_until) > new Date()) {
  return finish({ status: "skipped_circuit", durationMs: Date.now() - t0 });
 }

 const adapter = makeAdapter(row.source_key);
 if (!adapter) return finish({ status: "failed", error: "no adapter", durationMs: Date.now() - t0 });

 try {
  adapter.configure(row.config ?? {}, process.env);
 } catch (e) {
  if (e instanceof SourceConfigError) {
   c.log.warn(`${row.source_key} skipped`, { reason: e.message });
   return finish({ status: "skipped_config", durationMs: Date.now() - t0 });
  }
  throw e;
 }

 const timeout = SOURCE_TIMEOUT_MS[adapter.kind];
 const perSourceRequestCap = c.freshSearch
  ? (adapter.kind === "api" ? 20 : adapter.kind === "crawl" ? c.caps.maxPagesPerHost : 1)
  : c.caps.maxCrawlPages;
 const window = {
  maxItems: c.caps.maxItemsPerSource,
  maxRequests: Math.max(0, Math.min(perSourceRequestCap, c.http.budgetRemaining)),
  maxPages: c.caps.maxPagesPerHost,
  deadlineAt: Math.min(c.deadlineAt, Date.now() + timeout),
 };
 const storedCursor = row.cursor ?? {};
 const cursorIn = c.freshSearch ? {} : storedCursor;
 const query = {
  terms: c.profile.terms,
  countries: c.profile.countries,
  cities: c.profile.indiaCities,
  remoteOk: c.profile.remoteOk,
  since: !c.freshSearch && storedCursor.lastSuccessIso ? new Date(String(storedCursor.lastSuccessIso)) : null,
 };
 const ctx = {
  http: c.http,
  renderer: c.renderer,
  cursorIn,
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
   if (!c.dryRun && (base.pages === 1 || base.pages % 3 === 0)) {
    await c.db.updateRunProgress(c.runId, {
     phase: "fetching", currentSource: row.source_key,
     sourceProgress: { pages: base.pages, fetched: base.itemsFetched, apiCalls: base.apiCalls },
    });
   }
   if (base.itemsFetched >= window.maxItems || Date.now() > window.deadlineAt) break;
   if (page.exhausted) break;
  }

  // Written before anything is judged, so a crash later costs no re-fetching.
  // The set that comes back is exactly what is new or changed.
  const changedHashes = c.dryRun ? new Set(parsed.map(p => p.contentHash)) : await c.db.insertRawItems(rawRows);
  base.itemsNew = changedHashes.size;
  base.itemsUnchanged = Math.max(0, parsed.length - changedHashes.size);

  const toEvaluate = parsed.filter(o => shouldEvaluate(c.freshSearch, changedHashes.has(o.contentHash)));
  const enriched = await enrichMetadataWithOpenRouter(c.env, c.metadataHttp, toEvaluate, c.metadata);
  const audit: Array<{
   opportunity: NormalizedOpportunity; disposition: "accepted" | "ranked_low" | "excluded";
   reason: string | null; score: number | null; metadata?: Record<string, unknown>;
  }> = [];
  for (const o of enriched) {
   base.itemsEvaluated++;
   const verdict = hardFilter(o, c.profile);
   if (!verdict.keep) {
    base.itemsFiltered++;
    const reason = verdict.reason ?? "unknown";
    base.filterReasons[reason] = (base.filterReasons[reason] ?? 0) + 1;
    audit.push({ opportunity: o, disposition: "excluded", reason, score: null });
    continue;
   }
   const activeQuery = c.focusedSearch ? c.queryText : null;
   const queryVerdict = queryRelevance(o, activeQuery);
   const runScore = scoreOpportunity(o, c.profile, 0, activeQuery);
   const score = scoreOpportunity(o, c.profile, 0, null);
   if (queryVerdict.keep) base.itemsMatched++;
   if (shouldPersistRunItem(c.focusedSearch, queryVerdict.keep)) {
    kept.push({ o, score, runScore, queryMatched: queryVerdict.keep });
   }
   audit.push({
    opportunity: o, disposition: queryDisposition(queryVerdict),
    reason: queryVerdict.keep ? null : queryVerdict.note, score: runScore.score,
    metadata: {
     ...(o.locationMetadata ? { location: o.locationMetadata } : {}),
     fit_reason: runScore.reason,
     score_breakdown: scoreBreakdownWithCurrency(runScore, o, c.profile),
    },
   });
  }
  if (!c.dryRun) {
   const auditError = await c.db.recordRunItems(c.runId, c.userId, audit);
   if (auditError) c.log.warn("run-item audit unavailable", { error: auditError });
  }

  // A focused interactive run must not advance the nightly cursor: its narrow
  // result window cannot prove that unrelated new listings were inspected.
  if (!c.dryRun) await c.db.markSourceSuccess(row.id, c.freshSearch ? storedCursor : cursorOut);
  return finish({ durationMs: Date.now() - t0 });
 } catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  c.log.warn(`${row.source_key} failed`, { error: msg });
  if (!c.dryRun) await c.db.markSourceFailure(row.id, row.consecutive_failures ?? 0, msg);
  return finish({ status: "failed", error: msg, durationMs: Date.now() - t0 });
 }
}

// --- persistence -------------------------------------------------------------

function toSummary(id: string, o: NormalizedOpportunity, score: number, profile: SearchProfile): OpportunitySummary {
 const original = salaryDisplay(o.salary);
 const converted = salaryCurrencyConversion(o.salary, profile.comparisonCurrency, profile.exchangeRates);
 return {
  id, score, role: o.title, organization: o.organization,
  location: o.locationRaw, deadline: o.deadline,
  salaryDisplay: [original, converted?.display].filter(Boolean).join(" · ") || null, url: o.url,
 };
}

function scoreBreakdownWithCurrency(
 score: ReturnType<typeof scoreOpportunity>, o: NormalizedOpportunity, profile: SearchProfile,
 context?: unknown,
) {
 const conversion = salaryCurrencyConversion(o.salary, profile.comparisonCurrency, profile.exchangeRates);
 return {
  ...score.breakdown,
  ...(conversion ? { currency_conversion: conversion } : {}),
  ...(o.locationMetadata ? { metadata: o.locationMetadata } : {}),
  ...(context ? { context } : {}),
 };
}

async function insertOpportunity(
 db: Db, userId: string, runId: string | null, profile: SearchProfile,
 o: NormalizedOpportunity, score: ReturnType<typeof scoreOpportunity>, hash: bigint | null,
): Promise<{ id: string | null; error: string | null }> {
 const bands = hash === null ? [null, null, null, null] : simhashBands(hash);
 const { data, error } = await db.client.from("opportunities").insert({
  user_id: userId, profile_id: profile.id, run_id: runId,
  status: "New", role: o.title, organization: o.organization,
  organization_url: o.organizationUrl, department: o.department,
  opportunity_type: o.opportunityType,
  location: o.locationRaw, city: o.city, region: o.region, country: o.country, is_remote: o.isRemote,
  posted_at: o.postedAt, deadline: o.deadline,
  match_score: score.score, fit_reason: score.reason, score_breakdown: scoreBreakdownWithCurrency(score, o, profile),
  salary_min: o.salary?.min ?? null, salary_max: o.salary?.max ?? null,
  salary_currency: o.salary?.currency ?? null, salary_period: o.salary?.period ?? null,
  salary_is_predicted: o.salary?.isPredicted ?? null,
  salary_annual_inr: annualInr(o.salary, profile.exchangeRates),
  salary_display: salaryDisplay(o.salary), salary_source: salarySourceLabel(o.salary),
  url: o.url, apply_url: o.applyUrl, source_count: 1, sources_summary: o.sourceKey,
  summary: excerpt(o.descriptionText, 400),
  description_excerpt: excerpt(o.descriptionText, 12000),
  org_key: orgKey(o.organization), title_key: titleKey(o.title),
  simhash: hash === null ? null : hash.toString(),
  simhash_b0: bands[0], simhash_b1: bands[1], simhash_b2: bands[2], simhash_b3: bands[3],
  content_hash: o.contentHash, enrichment: o.completeness < 0.6 ? "deferred" : "none",
 }).select("id").maybeSingle();

 if (error || !data) return { id: null, error: error?.message ?? "insert returned no row" };
 const id = String(data.id);
 await db.client.from("opportunity_sources").upsert({
  user_id: userId, opportunity_id: id, source_key: o.sourceKey, external_id: o.externalId,
  url: o.url, url_canon: o.urlCanon, url_hash: o.urlHash, ats_key: o.atsKey,
  is_primary: true, match_signal: "url", match_confidence: 1, content_hash: o.contentHash,
 }, { onConflict: "user_id,source_key,external_id" });
 return { id, error: null };
}

/** A second sighting adds a source row and extends the deadline, never shrinks it. */
async function linkSource(
 db: Db, userId: string, opportunityId: string,
 profile: SearchProfile,
 o: NormalizedOpportunity, score: ReturnType<typeof scoreOpportunity>,
 signal: string, confidence: number, updateRanking: boolean,
) {
 await db.client.from("opportunity_sources").upsert({
  user_id: userId, opportunity_id: opportunityId, source_key: o.sourceKey, external_id: o.externalId,
  url: o.url, url_canon: o.urlCanon, url_hash: o.urlHash, ats_key: o.atsKey,
  is_primary: false, match_signal: signal, match_confidence: confidence,
  content_hash: o.contentHash, last_seen_at: new Date().toISOString(),
 }, { onConflict: "user_id,source_key,external_id" });

 const { count } = await db.client.from("opportunity_sources")
  .select("id", { count: "exact", head: true }).eq("opportunity_id", opportunityId);

 const now = new Date().toISOString();
 const { data: current } = await db.client.from("opportunities")
  .select("deadline,score_breakdown").eq("id", opportunityId).maybeSingle();
 const existingScore = current?.score_breakdown && typeof current.score_breakdown === "object"
  ? current.score_breakdown as Record<string, unknown> : {};
 const existingContext = existingScore.context;
 const patch: Record<string, unknown> = {
  last_seen_at: now, source_count: count ?? 1,
  ...(updateRanking ? {
   match_score: score.score, fit_reason: score.reason,
   score_breakdown: scoreBreakdownWithCurrency(score, o, profile, existingContext),
  } : {}),
 };
 // Same-listing matches can safely refresh presentation fields. This also
 // repairs titles imported before repeated HTML entities were handled.
 if (signal === "url" || signal === "ats") {
  patch.role = o.title;
  if (o.organization) patch.organization = o.organization;
  if (o.organizationUrl) patch.organization_url = o.organizationUrl;
  if (o.locationRaw) patch.location = o.locationRaw;
  if (o.city) patch.city = o.city;
  if (o.country) patch.country = o.country;
  if (o.region) patch.region = o.region;
  if (o.descriptionText) {
   patch.summary = excerpt(o.descriptionText, 400);
   patch.description_excerpt = excerpt(o.descriptionText, 12000);
  }
  if (o.salary) {
   patch.salary_min = o.salary.min;
   patch.salary_max = o.salary.max;
   patch.salary_currency = o.salary.currency;
   patch.salary_period = o.salary.period;
   patch.salary_is_predicted = o.salary.isPredicted;
   patch.salary_annual_inr = annualInr(o.salary, profile.exchangeRates);
   patch.salary_display = salaryDisplay(o.salary);
   patch.salary_source = salarySourceLabel(o.salary);
  }
 }
 if (o.deadline) {
  const existing = current?.deadline ? new Date(current.deadline).getTime() : 0;
  if (new Date(o.deadline).getTime() > existing) {
   patch.deadline = o.deadline;
   patch.last_changed_at = now;
  }
 }
 await db.client.from("opportunities").update(patch).eq("id", opportunityId);
}
