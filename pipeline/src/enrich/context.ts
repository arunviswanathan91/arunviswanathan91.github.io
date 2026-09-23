import type { Env } from "../config.js";
import type { ContextCandidate } from "../db.js";
import type { Http } from "../http.js";
import { HttpResponseError } from "../http.js";
import { conversionBetween, type ExchangeRateSnapshot } from "../currency.js";
import { excerpt } from "../normalize/text.js";
import {
 assessmentInstructions, assessmentPreferences, assessmentSchema, normalizeAssessment,
 cityFactsInstructions, personalBriefInstructions, citySchema, personalAssessmentSchema,
 schemaObject, claimSchema, CITY_SECTION_KEYS,
 type AssessmentPreferences, type DecisionBrief, type Evidence,
} from "./assessment.js";
import { collectDecisionEvidence, extractPopulationFact, type OfficialReference } from "./evidence.js";
import { ProviderRateLimiter } from "./ratelimit.js";

export interface OpportunityContext {
 institution?: string;
 place?: string;
 population?: string;
 climate?: string;
 transport?: string;
 living?: string;
 inclusion?: string;
 sources: { label: string; url: string }[];
 generated_at: string;
 provider?: string;
 model?: string;
 brief?: DecisionBrief;
 references?: OfficialReference[];
}

interface GroqResponse {
 model?: string;
 error?: { message?: string };
 choices?: { message?: { content?: string } }[];
}
export const UNKNOWN = "Not enough reliable information collected.";
const FIELDS = ["institution", "place", "population", "climate", "transport", "living", "inclusion"] as const;
export type ContextProvider = "gemini" | "groq" | "openrouter" | "cerebras" | "deepseek";

export function contextProviders(env: Env): ContextProvider[] {
 // OpenRouter's free router selects a currently available zero-cost model that
 // supports the requested structured-output features. Groq, Gemini and
 // Cerebras remain free fallbacks when the free route is busy or unavailable.
 // DeepSeek is paid (not free-tier), so it's ordered last: only reached once
 // every free option has failed or is unconfigured.
 return (["openrouter", "groq", "gemini", "cerebras", "deepseek"] as const).filter(provider =>
  Boolean(env[`${provider}ApiKey`]?.trim()));
}

export function openrouterRequest(model: string, prompt: string, decisionBrief = false) {
 return {
  model,
  messages: [{ role: "user", content: decisionBrief ? prompt : `${prompt}\nJSON must contain exactly these string fields: ${FIELDS.join(", ")}.` }],
  response_format: decisionBrief
   ? { type: "json_schema", json_schema: { name: "opportunity_context", strict: true, schema: assessmentSchema } }
   : { type: "json_object" },
  max_tokens: decisionBrief ? 2600 : 2048,
  // The route is already free; this is a second guard against paid providers.
  provider: { require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 } },
 };
}

/** Accept a plain JSON response as well as the harmless wrappers some routed
 * models add despite JSON mode. Truncated JSON still fails and is never saved. */
export function parseStructuredJson(text: string): unknown {
 const trimmed = text.trim();
 if (!trimmed) throw new Error("empty structured response");
 try { return JSON.parse(trimmed); } catch { /* try a wrapped object below */ }
 const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
 if (fenced) {
  try { return JSON.parse(fenced); } catch { /* continue */ }
 }
 const start = trimmed.indexOf("{");
 if (start >= 0) {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < trimmed.length; i++) {
   const char = trimmed[i]!;
   if (quoted) {
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') quoted = false;
    continue;
   }
   if (char === '"') quoted = true;
   else if (char === "{") depth++;
   else if (char === "}" && --depth === 0) {
    try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { break; }
   }
  }
 }
 throw new Error("invalid structured JSON");
}

export function parseOpenrouterContext(text: string): Record<string, string> {
 const payload: unknown = JSON.parse(text);
 if (!payload || typeof payload !== "object" || Array.isArray(payload))
  throw new Error("OpenRouter returned a non-object context");
 const value = payload as Record<string, unknown>;
 if (Object.keys(value).length !== FIELDS.length || FIELDS.some(field =>
  typeof value[field] !== "string" || !(value[field] as string).trim()))
  throw new Error("OpenRouter context must contain exactly seven nonempty string fields");
 return value as Record<string, string>;
}

/** A failed provider is skipped for the rest of this run. The next provider
 * retries the same card. Stop the batch if every provider is unavailable. */
export class ContextProvidersUnavailable extends Error {}

/** Disablement, backoff and the attempt budget, factored out of the closure
 *  so two independently-typed fallback callables (city facts vs personal
 *  brief) can share one provider-health picture and one call budget instead
 *  of each getting their own, which would silently double the effective cap. */
export interface ContextProviderState {
 disabled: Set<ContextProvider>;
 consecutiveFailures: Map<ContextProvider, number>;
 preferred: number;
 attempts: number;
}
export function createProviderState(): ContextProviderState {
 return { disabled: new Set(), consecutiveFailures: new Map(), preferred: 0, attempts: 0 };
}

export function createContextFallback<T>(
 providers: ContextProvider[],
 onSwitch: (from: ContextProvider, to: ContextProvider, error: unknown) => void,
 maxAttempts = Infinity,
 state: ContextProviderState = createProviderState(),
 rateLimiter?: ProviderRateLimiter,
) {
 return async (attempt: (provider: ContextProvider) => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let offset = 0; offset < providers.length; offset++) {
   const index = (state.preferred + offset) % providers.length;
   const provider = providers[index]!;
   if (state.disabled.has(provider)) continue;
   if (state.attempts >= maxAttempts) throw new ContextProvidersUnavailable("AI call cap reached; remaining assessments stay pending");
   state.attempts++;
   try {
    if (rateLimiter) await rateLimiter.wait(provider);
    const result = await attempt(provider);
    state.consecutiveFailures.set(provider, 0);
    state.preferred = index;
    return result;
   } catch (error) {
    lastError = error;
    const failures = (state.consecutiveFailures.get(provider) ?? 0) + 1;
    state.consecutiveFailures.set(provider, failures);
    const message = error instanceof Error ? error.message : String(error);
    if ((error instanceof HttpResponseError && [401, 402, 403, 404, 429, 503].includes(error.status))
     || (error instanceof HttpResponseError && error.status === 400 && /json|schema|structured/i.test(error.responseBody))
     || /aborted due to timeout|timed?\s*out/i.test(message)
     || failures >= 2)
     state.disabled.add(provider);
    const next = Array.from({ length: providers.length - offset - 1 }, (_, i) =>
     providers[(state.preferred + offset + i + 1) % providers.length]!).find(p => !state.disabled.has(p));
    if (next) onSwitch(provider, next, error);
   }
  }
  if (state.disabled.size === providers.length) {
   const detail = lastError instanceof Error ? ` Last failure: ${lastError.message.slice(0, 500)}` : "";
   throw new ContextProvidersUnavailable(`All configured AI providers are unavailable; remaining context stays pending.${detail}`);
  }
  throw lastError ?? new Error("No context provider succeeded");
 };
}

const compact = (value: unknown, max = 900) => {
 const text = String(value ?? "").replace(/\s+/g, " ").trim();
 return text ? excerpt(text, max) : UNKNOWN;
};

/** Kept pure and exported so malformed model output can be tested without a network call. */
export function normalizeContextPayload(value: unknown, evidence: Evidence[]): OpportunityContext | null {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const source = value as Record<string, unknown>;
 const context: OpportunityContext = {
  sources: evidence.map(item => ({ label: item.label, url: item.url })),
  generated_at: new Date().toISOString(),
 };
 for (const field of FIELDS) context[field] = compact(source[field]);
 return context;
}

export function hasMeaningfulContext(value: unknown): boolean {
 if (!value || typeof value !== "object" || Array.isArray(value)) return false;
 const source = value as Record<string, unknown>;
 return FIELDS.some(field => {
  const text = String(source[field] ?? "").trim();
  return Boolean(text && text !== UNKNOWN);
 });
}

/** Accept the current Interactions REST response plus SDK-shaped wrappers so a
 * future response-envelope change fails with a useful message, not silence. */
export function contextPayloadFromInteraction(value: unknown): unknown {
 if (!value || typeof value !== "object" || Array.isArray(value)) return value;
 const response = value as Record<string, unknown>;
 const nested = response.interaction && typeof response.interaction === "object"
  ? response.interaction as Record<string, unknown> : null;
 const output = response.output_text ?? response.outputText ?? nested?.output_text ?? nested?.outputText;
 if (typeof output !== "string") return value;
 try { return parseStructuredJson(output); }
 catch { throw new Error("Gemini returned invalid JSON in output_text"); }
}

export function decisionPrompt(candidate: ContextCandidate, evidence: Evidence[], prefs: AssessmentPreferences, provider: ContextProvider = "openrouter") {
 // Keep the entire request inside free-tier token budgets. The schema is sent
 // through each provider's native structured-output field, so duplicating it in
 // the prompt wastes tokens and makes truncation substantially more likely.
 const totalBudget = provider === "groq" ? 7_500 : 12_000;
 const listingBudget = provider === "groq" ? 2_800 : 4_000;
 const sourceBudget = provider === "groq" ? 900 : 1_500;
 let remaining = totalBudget;
 const facts: string[] = [];
 for (let index = 0; index < evidence.length && remaining > 120; index++) {
  const item = evidence[index]!;
  const heading = `SOURCE ${index + 1} (${item.kind ?? "background"}): ${item.label}\n`;
  const allowed = Math.min(item.kind === "listing" ? listingBudget : sourceBudget, Math.max(0, remaining - heading.length));
  if (allowed < 80) break;
  const fact = `${heading}${excerpt(item.text, allowed)}`;
  facts.push(fact);
  remaining -= fact.length + 2;
 }
 return `${assessmentInstructions(prefs, false)}\nVACANCY: ${JSON.stringify({ role: candidate.role, organisation: candidate.organization, city: candidate.city, location: candidate.location, country: candidate.country, salary: candidate.salary_display, salary_predicted: candidate.salary_is_predicted })}\nEVIDENCE:\n${facts.join("\n\n") || "No sources could be fetched; do not claim source verification."}`;
}

export async function enrichOpportunityContext(
 env: Env,
 http: Http,
 candidate: ContextCandidate,
 provider: ContextProvider = "gemini",
 suppliedEvidence?: Evidence[],
 prefs: AssessmentPreferences = assessmentPreferences({}),
 exchangeRates?: ExchangeRateSnapshot | null,
 comparisonCurrency?: string | null,
): Promise<OpportunityContext> {
 const evidence = suppliedEvidence ?? (await collectDecisionEvidence(http, candidate)).evidence;
 const schema = assessmentSchema;
 const prompt = decisionPrompt(candidate, evidence, prefs, provider);
 let payload: unknown;
 let model = provider === "gemini" ? env.geminiModel : provider === "groq" ? env.groqModel
  : provider === "cerebras" ? env.cerebrasModel : provider === "deepseek" ? env.deepseekModel : env.openrouterModel;
 if (provider === "openrouter") {
  if (!env.openrouterApiKey) throw new Error("OPENROUTER_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://openrouter.ai/api/v1/chat/completions",
   openrouterRequest(env.openrouterModel, prompt, true),
   { authorization: `Bearer ${env.openrouterApiKey}` },
  );
  if (response?.error) throw new Error("OpenRouter returned an API error");
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned an empty response");
  try { payload = parseStructuredJson(text); }
  catch { throw new Error("OpenRouter returned invalid assessment JSON"); }
  model = response?.model ?? model;
 } else if (provider === "groq") {
  if (!env.groqApiKey) throw new Error("GROQ_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.groq.com/openai/v1/chat/completions",
   {
    model: env.groqModel,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "opportunity_context", strict: true, schema } },
    max_completion_tokens: 2200,
   },
   { authorization: `Bearer ${env.groqApiKey}` },
  );
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty structured response");
  try { payload = parseStructuredJson(text); }
  catch { throw new Error("Groq returned invalid JSON"); }
 } else if (provider === "cerebras") {
  if (!env.cerebrasApiKey) throw new Error("CEREBRAS_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.cerebras.ai/v1/chat/completions",
   {
    model: env.cerebrasModel,
    messages: [{ role: "user", content: prompt }],
    // Cerebras' structured-output support is inconsistent across models;
    // json_object plus our own tolerant parser is the safe common ground.
    response_format: { type: "json_object" },
    max_tokens: 2600,
   },
   { authorization: `Bearer ${env.cerebrasApiKey}` },
  );
  if (response?.error) throw new Error("Cerebras returned an API error");
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Cerebras returned an empty response");
  try { payload = parseStructuredJson(text); }
  catch { throw new Error("Cerebras returned invalid JSON"); }
  model = response?.model ?? model;
 } else if (provider === "deepseek") {
  if (!env.deepseekApiKey) throw new Error("DEEPSEEK_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.deepseek.com/chat/completions",
   {
    model: env.deepseekModel,
    messages: [{ role: "user", content: prompt }],
    // Like Cerebras, treated as best-effort JSON mode rather than a
    // strictly-enforced schema.
    response_format: { type: "json_object" },
    max_tokens: 2600,
   },
   { authorization: `Bearer ${env.deepseekApiKey}` },
  );
  if (response?.error) throw new Error("DeepSeek returned an API error");
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek returned an empty response");
  try { payload = parseStructuredJson(text); }
  catch { throw new Error("DeepSeek returned invalid JSON"); }
  model = response?.model ?? model;
 } else {
  if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY missing");
  const response = await http.postJson<Record<string, unknown>>(
   "https://generativelanguage.googleapis.com/v1beta/interactions",
   {
    model: env.geminiModel,
    input: prompt,
    response_format: { type: "text", mime_type: "application/json", schema },
   },
   { "x-goog-api-key": env.geminiApiKey },
  );
  payload = contextPayloadFromInteraction(response);
 }
 const brief = normalizeAssessment(payload, evidence, prefs);
 if (brief.money.currency && comparisonCurrency && brief.money.currency !== comparisonCurrency) {
  const conversion = conversionBetween(exchangeRates, brief.money.currency, comparisonCurrency);
  if (conversion) brief.currency_conversion = conversion;
 }
 if (!Object.values(brief.sections).some(claim => claim.text && claim.basis !== "unknown"))
  throw new Error(`${provider} returned no useful assessment; leaving the card pending`);
 const context: OpportunityContext = {
  brief, provider, model, generated_at: new Date().toISOString(),
  sources: evidence.map(({ text: _text, ...source }) => source),
 };
 // Keep old clients readable during a frontend/worker deployment overlap.
 for (const field of FIELDS) context[field] = brief.sections[field].text;
 return context;
}

async function requestJsonCompletion(
 env: Env, http: Http, provider: ContextProvider, prompt: string, schema: Record<string, unknown>, maxTokens: number,
): Promise<{ payload: unknown; model: string }> {
 let model = provider === "gemini" ? env.geminiModel : provider === "groq" ? env.groqModel
  : provider === "cerebras" ? env.cerebrasModel : provider === "deepseek" ? env.deepseekModel : env.openrouterModel;
 if (provider === "openrouter") {
  if (!env.openrouterApiKey) throw new Error("OPENROUTER_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://openrouter.ai/api/v1/chat/completions",
   {
    model: env.openrouterModel,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "opportunity_context", strict: true, schema } },
    max_tokens: maxTokens,
    provider: { require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 } },
   },
   { authorization: `Bearer ${env.openrouterApiKey}` },
  );
  if (response?.error) throw new Error("OpenRouter returned an API error");
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned an empty response");
  return { payload: parseStructuredJson(text), model: response?.model ?? model };
 }
 if (provider === "deepseek") {
  if (!env.deepseekApiKey) throw new Error("DEEPSEEK_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.deepseek.com/chat/completions",
   { model: env.deepseekModel, messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }, max_tokens: maxTokens },
   { authorization: `Bearer ${env.deepseekApiKey}` },
  );
  if (response?.error) throw new Error("DeepSeek returned an API error");
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek returned an empty response");
  return { payload: parseStructuredJson(text), model: response?.model ?? model };
 }
 if (provider === "groq") {
  if (!env.groqApiKey) throw new Error("GROQ_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.groq.com/openai/v1/chat/completions",
   {
    model: env.groqModel,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "opportunity_context", strict: true, schema } },
    max_completion_tokens: maxTokens,
   },
   { authorization: `Bearer ${env.groqApiKey}` },
  );
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty structured response");
  return { payload: parseStructuredJson(text), model };
 }
 if (provider === "cerebras") {
  if (!env.cerebrasApiKey) throw new Error("CEREBRAS_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.cerebras.ai/v1/chat/completions",
   { model: env.cerebrasModel, messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }, max_tokens: maxTokens },
   { authorization: `Bearer ${env.cerebrasApiKey}` },
  );
  if (response?.error) throw new Error("Cerebras returned an API error");
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Cerebras returned an empty response");
  return { payload: parseStructuredJson(text), model: response?.model ?? model };
 }
 if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY missing");
 const response = await http.postJson<Record<string, unknown>>(
  "https://generativelanguage.googleapis.com/v1beta/interactions",
  { model: env.geminiModel, input: prompt, response_format: { type: "text", mime_type: "application/json", schema } },
  { "x-goog-api-key": env.geminiApiKey },
 );
 return { payload: contextPayloadFromInteraction(response), model };
}

function evidenceFacts(evidence: Evidence[], totalBudget: number, listingBudget: number, sourceBudget: number): string {
 let remaining = totalBudget;
 const facts: string[] = [];
 for (let index = 0; index < evidence.length && remaining > 120; index++) {
  const item = evidence[index]!;
  const heading = `SOURCE ${index + 1} (${item.kind ?? "background"}): ${item.label}\n`;
  const allowed = Math.min(item.kind === "listing" ? listingBudget : sourceBudget, Math.max(0, remaining - heading.length));
  if (allowed < 80) break;
  const fact = `${heading}${excerpt(item.text, allowed)}`;
  facts.push(fact);
  remaining -= fact.length + 2;
 }
 return facts.join("\n\n") || "No sources could be fetched; do not claim source verification.";
}

/** Groups an opportunity by the institution it's actually at -- the unit
 *  institution facts are cached and reused by. Returns null when there's
 *  not enough identity (no organization and no city) to key a shared cache
 *  entry safely; such candidates always regenerate. */
export function institutionCacheKey(candidate: Pick<ContextCandidate, "organization" | "city" | "country">): string | null {
 const organization = (candidate.organization ?? "").trim().toLowerCase();
 const city = (candidate.city ?? "").trim().toLowerCase();
 const country = (candidate.country ?? "").trim().toLowerCase();
 if (!organization && !city) return null;
 return `${organization}|${city}|${country}`;
}

export interface CityFactsResult { sections: Record<string, unknown>; provider: ContextProvider; model: string }

/** The shared, profile-independent half of the old single decision-brief
 *  call: institution/place/population/climate/transport only. A confident
 *  regex read of population (see extractPopulationFact) is asked for by
 *  name only when it failed, so a model never re-derives a fact already
 *  sitting in the fetched Wikipedia text. */
async function enrichCityFacts(
 env: Env, http: Http, candidate: ContextCandidate, provider: ContextProvider, evidence: Evidence[],
): Promise<CityFactsResult> {
 const placeEvidence = evidence.find(e => e.kind === "place");
 const presetPopulation = placeEvidence ? extractPopulationFact(placeEvidence.text) : null;
 const requestedKeys = CITY_SECTION_KEYS.filter(key => key !== "population" || !presetPopulation);
 const schema = requestedKeys.length === CITY_SECTION_KEYS.length
  ? citySchema
  : schemaObject({ sections: schemaObject(Object.fromEntries(requestedKeys.map(key => [key, claimSchema]))) });
 const facts = evidenceFacts(evidence.filter(e => e.kind !== "visa" && e.kind !== "tax"), 4_000, 1_600, 1_200);
 const prompt = `${cityFactsInstructions(requestedKeys.includes("population"))}\nEMPLOYER: ${JSON.stringify({ organisation: candidate.organization, city: candidate.city, location: candidate.location, country: candidate.country })}\nEVIDENCE:\n${facts}\nReturn exactly the JSON shape described by this schema: ${JSON.stringify(schema)}`;
 // A live run showed OpenRouter and Groq returning genuinely empty
 // completions at 700 tokens, not malformed JSON -- Groq's free
 // openai/gpt-oss-20b is a reasoning model, and hidden reasoning tokens are
 // charged against the same max_completion_tokens budget, so a tight cap
 // sized for the visible 5-field answer can be consumed entirely before any
 // output is ever emitted. 1,800 leaves headroom for that even though the
 // schema itself is small.
 const { payload, model } = await requestJsonCompletion(env, http, provider, prompt, schema, 1_800);
 const rawSections = payload && typeof payload === "object" && !Array.isArray(payload)
  && typeof (payload as Record<string, unknown>).sections === "object"
  ? (payload as Record<string, unknown>).sections as Record<string, unknown> : {};
 if (!requestedKeys.some(key => rawSections[key]) && !presetPopulation)
  throw new Error(`${provider} returned no usable institution facts`);
 const sections: Record<string, unknown> = { ...rawSections };
 if (presetPopulation) {
  const placeIndex = evidence.indexOf(placeEvidence!);
  sections.population = { text: presetPopulation, basis: "source", source_ids: placeIndex >= 0 ? [placeIndex + 1] : [] };
 }
 return { sections, provider, model };
}

export interface PersonalBriefResult { payload: unknown; provider: ContextProvider; model: string }

/** The per-opportunity, per-user half: institution facts are merged in
 *  separately by enrichWithFallback, so this schema and prompt never ask a
 *  model to regenerate them. */
async function enrichPersonalBrief(
 env: Env, http: Http, candidate: ContextCandidate, provider: ContextProvider, evidence: Evidence[], prefs: AssessmentPreferences,
): Promise<PersonalBriefResult> {
 const totalBudget = provider === "groq" ? 7_500 : 12_000;
 const listingBudget = provider === "groq" ? 2_800 : 4_000;
 const sourceBudget = provider === "groq" ? 900 : 1_500;
 const facts = evidenceFacts(evidence, totalBudget, listingBudget, sourceBudget);
 const prompt = `${personalBriefInstructions(prefs)}\nVACANCY: ${JSON.stringify({ role: candidate.role, organisation: candidate.organization, city: candidate.city, location: candidate.location, country: candidate.country, salary: candidate.salary_display, salary_predicted: candidate.salary_is_predicted })}\nEVIDENCE:\n${facts}`;
 const { payload, model } = await requestJsonCompletion(env, http, provider, prompt, personalAssessmentSchema, provider === "groq" ? 1_800 : 2_000);
 if (!payload || typeof payload !== "object" || Array.isArray(payload))
  throw new Error(`${provider} returned a non-object personal brief`);
 return { payload, provider, model };
}

/** A durable, cross-run cache for institution facts, structurally matched
 *  by Db (see db.ts) so no import from this module into db.ts is needed.
 *  Optional: enrichWithFallback works, just without cross-run reuse, when
 *  no store is supplied or its table hasn't been migrated in yet. */
export interface InstitutionFactsStore {
 loadInstitutionFacts(key: string): Promise<Record<string, unknown> | null>;
 saveInstitutionFacts(key: string, sections: Record<string, unknown>, provider: string, model: string): Promise<void>;
}

/** Cached institution facts are reused for other candidates whose evidence
 *  is fetched in a different order, so their source_ids would misattribute
 *  a citation to the wrong source. Cached copies are stripped of source_ids
 *  (normalizeAssessment safely downgrades those claims to basis "general"),
 *  while the candidate that generated them keeps its own accurate ones. */
function sanitizeForCache(sections: Record<string, unknown>): Record<string, unknown> {
 return Object.fromEntries(Object.entries(sections).map(([key, value]) => {
  const claim = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return [key, { ...claim, source_ids: [] }];
 }));
}

/** Fetch evidence once per card, even when more than one model is tried.
 *
 * Institution facts (institution/place/population/climate/transport) are
 * generated once per (organization, city, country) -- via `cache` for the
 * lifetime of this run, and via `store` across runs and users -- instead of
 * regenerated from scratch for every single opportunity. Only the
 * personalized half of the old single mega-prompt still runs per candidate,
 * against a schema roughly 40% smaller than before. See docs/PR description
 * for the token-budget accounting. */
export async function enrichWithFallback(
 env: Env, http: Http, candidate: ContextCandidate,
 cityFallback: ReturnType<typeof createContextFallback<CityFactsResult>>,
 personalFallback: ReturnType<typeof createContextFallback<PersonalBriefResult>>,
 prefs: AssessmentPreferences = assessmentPreferences({}),
 exchangeRates?: ExchangeRateSnapshot | null,
 comparisonCurrency?: string | null,
 cache?: Map<string, { sections: Record<string, unknown>; provider: ContextProvider; model: string }>,
 store?: InstitutionFactsStore,
) {
 const { evidence, references } = await collectDecisionEvidence(http, candidate);
 const cacheKey = institutionCacheKey(candidate);
 let cityFacts = cacheKey ? cache?.get(cacheKey) ?? null : null;
 if (!cityFacts && cacheKey && store) {
  const stored = await store.loadInstitutionFacts(cacheKey).catch(() => null);
  if (stored) cityFacts = { sections: stored, provider: "openrouter", model: "cached" };
 }
 if (!cityFacts) {
  const result = await cityFallback(provider => enrichCityFacts(env, http, candidate, provider, evidence));
  cityFacts = { sections: result.sections, provider: result.provider, model: result.model };
  if (cacheKey) {
   const sanitized = sanitizeForCache(result.sections);
   cache?.set(cacheKey, { sections: sanitized, provider: result.provider, model: result.model });
   if (store) await store.saveInstitutionFacts(cacheKey, sanitized, result.provider, result.model).catch(() => {});
  }
 }
 const personal = await personalFallback(provider => enrichPersonalBrief(env, http, candidate, provider, evidence, prefs));
 const personalPayload = personal.payload as Record<string, unknown>;
 const merged = {
  ...personalPayload,
  // City facts win on overlap. personalAssessmentSchema's strict json_schema
  // mode already keeps a compliant model from emitting institution/place/
  // etc, but this stays correct even against a provider that doesn't
  // enforce additionalProperties:false.
  sections: { ...(personalPayload.sections as Record<string, unknown> | undefined ?? {}), ...cityFacts.sections },
 };
 const brief = normalizeAssessment(merged, evidence, prefs);
 if (brief.money.currency && comparisonCurrency && brief.money.currency !== comparisonCurrency) {
  const conversion = conversionBetween(exchangeRates, brief.money.currency, comparisonCurrency);
  if (conversion) brief.currency_conversion = conversion;
 }
 if (!Object.values(brief.sections).some(claim => claim.text && claim.basis !== "unknown"))
  throw new Error(`${personal.provider} returned no useful assessment; leaving the card pending`);
 const context: OpportunityContext = {
  brief, provider: personal.provider, model: personal.model, generated_at: new Date().toISOString(),
  sources: evidence.map(({ text: _text, ...source }) => source),
 };
 for (const field of FIELDS) context[field] = brief.sections[field].text;
 return { ...context, references };
}
