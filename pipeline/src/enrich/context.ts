import type { Env } from "../config.js";
import type { ContextCandidate } from "../db.js";
import type { Http } from "../http.js";
import { HttpResponseError } from "../http.js";
import { conversionBetween, type ExchangeRateSnapshot } from "../currency.js";
import { excerpt } from "../normalize/text.js";
import { assessmentInstructions, assessmentPreferences, assessmentSchema, normalizeAssessment, type AssessmentPreferences, type DecisionBrief, type Evidence } from "./assessment.js";
import { collectDecisionEvidence, type OfficialReference } from "./evidence.js";

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
export type ContextProvider = "gemini" | "groq" | "openrouter";

export function contextProviders(env: Env): ContextProvider[] {
 // OpenRouter's free router selects a currently available zero-cost model that
 // supports the requested structured-output features. Groq and Gemini remain
 // fallbacks when the free route is busy or unavailable.
 return (["openrouter", "groq", "gemini"] as const).filter(provider =>
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
export function createContextFallback<T>(
 providers: ContextProvider[],
 onSwitch: (from: ContextProvider, to: ContextProvider, error: unknown) => void,
 maxAttempts = Infinity,
) {
 const disabled = new Set<ContextProvider>();
 const consecutiveFailures = new Map<ContextProvider, number>();
 let preferred = 0;
 let attempts = 0;
 return async (attempt: (provider: ContextProvider) => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let offset = 0; offset < providers.length; offset++) {
   const index = (preferred + offset) % providers.length;
   const provider = providers[index]!;
   if (disabled.has(provider)) continue;
   if (attempts >= maxAttempts) throw new ContextProvidersUnavailable("AI call cap reached; remaining assessments stay pending");
   attempts++;
   try {
    const result = await attempt(provider);
    consecutiveFailures.set(provider, 0);
    preferred = index;
    return result;
   } catch (error) {
    lastError = error;
    const failures = (consecutiveFailures.get(provider) ?? 0) + 1;
    consecutiveFailures.set(provider, failures);
    const message = error instanceof Error ? error.message : String(error);
    if ((error instanceof HttpResponseError && [401, 402, 403, 404, 429, 503].includes(error.status))
     || (error instanceof HttpResponseError && error.status === 400 && /json|schema|structured/i.test(error.responseBody))
     || /aborted due to timeout|timed?\s*out/i.test(message)
     || failures >= 2)
     disabled.add(provider);
    const next = Array.from({ length: providers.length - offset - 1 }, (_, i) =>
     providers[(preferred + offset + i + 1) % providers.length]!).find(p => !disabled.has(p));
    if (next) onSwitch(provider, next, error);
   }
  }
  if (disabled.size === providers.length) {
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
 let model = provider === "gemini" ? env.geminiModel : provider === "groq" ? env.groqModel : env.openrouterModel;
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

/** Fetch evidence once per card, even when more than one model is tried. */
export async function enrichWithFallback(
 env: Env, http: Http, candidate: ContextCandidate,
 fallback: ReturnType<typeof createContextFallback<OpportunityContext>>,
 prefs: AssessmentPreferences = assessmentPreferences({}),
 exchangeRates?: ExchangeRateSnapshot | null,
 comparisonCurrency?: string | null,
) {
 const { evidence, references } = await collectDecisionEvidence(http, candidate);
 const result = await fallback(provider => enrichOpportunityContext(
  env, http, candidate, provider, evidence, prefs, exchangeRates, comparisonCurrency,
 ));
 return { ...result, references };
}
