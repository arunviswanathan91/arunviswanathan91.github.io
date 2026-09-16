import type { Env } from "../config.js";
import type { ContextCandidate } from "../db.js";
import type { Http } from "../http.js";
import { excerpt, htmlToText } from "../normalize/text.js";

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
}

interface Evidence { label: string; url: string; text: string }
interface WikiResponse {
 query?: { pages?: Record<string, { title?: string; extract?: string; fullurl?: string }> };
}
interface GroqResponse {
 choices?: { message?: { content?: string } }[];
}
export const UNKNOWN = "Not enough reliable information collected.";
const FIELDS = ["institution", "place", "population", "climate", "transport", "living", "inclusion"] as const;
export type ContextProvider = "gemini" | "groq";

const safeHttpUrl = (value: string | null | undefined) => {
 try {
  const url = new URL(value ?? "");
  return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
 } catch { return null; }
};

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
 try { return JSON.parse(output); }
 catch { throw new Error("Gemini returned invalid JSON in output_text"); }
}

async function wikipediaEvidence(http: Http, query: string, label: string): Promise<Evidence | null> {
 const term = query.trim();
 if (!term) return null;
 const api = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="
  + encodeURIComponent(term) + "&gsrlimit=1&prop=extracts%7Cinfo&exintro=1&explaintext=1&inprop=url&format=json&origin=*";
 const response = await http.getJson<WikiResponse>(api);
 const page = Object.values(response?.query?.pages ?? {})[0];
 const url = safeHttpUrl(page?.fullurl);
 const text = compact(page?.extract, 4500);
 if (!page || !url || text === UNKNOWN) return null;
 return { label: `${label}: ${page.title ?? term}`, url, text };
}

async function siteEvidence(http: Http, candidate: ContextCandidate): Promise<Evidence | null> {
 const url = safeHttpUrl(candidate.organization_url);
 if (!url) return null;
 try {
  const response = await http.get(url, { accept: "text/html" });
  if (!response.ok || !response.body) return null;
  const text = compact(htmlToText(response.body), 4500);
  return text === UNKNOWN ? null : { label: `${candidate.organization ?? "Institution"} website`, url, text };
 } catch { return null; }
}

async function collectEvidence(http: Http, candidate: ContextCandidate): Promise<Evidence[]> {
 const evidence: Evidence[] = [];
 const institution = candidate.organization
  ? await wikipediaEvidence(http, candidate.organization, "Institution") : null;
 if (institution) evidence.push(institution);
 const placeName = candidate.city ?? candidate.location;
 const placeQuery = [placeName, candidate.country].filter(Boolean).join(", ");
 const place = placeQuery ? await wikipediaEvidence(http, placeQuery, "Place") : null;
 if (place && place.url !== institution?.url) evidence.push(place);
 const climate = placeQuery ? await wikipediaEvidence(http, `${placeQuery} climate`, "Climate") : null;
 if (climate && !evidence.some(item => item.url === climate.url)) evidence.push(climate);
 const transport = placeQuery ? await wikipediaEvidence(http, `${placeQuery} public transport`, "Transport") : null;
 if (transport && !evidence.some(item => item.url === transport.url)) evidence.push(transport);
 const site = await siteEvidence(http, candidate);
 if (site && !evidence.some(item => item.url === site.url)) evidence.push(site);
 return evidence;
}

function promptFor(candidate: ContextCandidate, evidence: Evidence[]) {
 const listing = [candidate.summary, candidate.description_excerpt].filter(Boolean).join("\n").slice(0, 5000);
 const facts = evidence.map((item, index) => `SOURCE ${index + 1} — ${item.label}\nURL: ${item.url}\n${item.text}`).join("\n\n");
 return `Create concise decision context for a researcher considering this opportunity.

ROLE: ${candidate.role}
ORGANISATION: ${candidate.organization ?? "Unknown"}
LOCATION: ${candidate.location ?? ([candidate.city, candidate.country].filter(Boolean).join(", ") || "Unknown")}
LISTING EXCERPT: ${listing || "Unavailable"}

EVIDENCE:
${facts || "No external evidence was collected."}

Return only the requested JSON. Use the listing and supplied evidence. Never invent facts. External claims about the institution or place must be supported by the evidence. If the supplied material does not support a field, write exactly "${UNKNOWN}" Population must identify whether it is city or metro when the evidence does. Climate should be a short general pattern, not a forecast. Living should state practical evidence-backed advantages only. Inclusion must be careful and neutral: summarize documented inclusion, international-community, support, or safety context if present; never label a population as racist or not racist, and never infer attitudes from demographics. Keep each field below 90 words.`;
}

export async function enrichOpportunityContext(
 env: Env,
 http: Http,
 candidate: ContextCandidate,
 provider: ContextProvider = "gemini",
): Promise<OpportunityContext> {
 const evidence = await collectEvidence(http, candidate);
 const schema = {
  type: "object",
  properties: Object.fromEntries(FIELDS.map(field => [field, { type: "string" }])),
  required: [...FIELDS],
  additionalProperties: false,
 };
 let payload: unknown;
 if (provider === "groq") {
  if (!env.groqApiKey) throw new Error("GROQ_API_KEY missing");
  const response = await http.postJson<GroqResponse>(
   "https://api.groq.com/openai/v1/chat/completions",
   {
    model: env.groqModel,
    messages: [{ role: "user", content: promptFor(candidate, evidence) }],
    response_format: { type: "json_schema", json_schema: { name: "opportunity_context", strict: true, schema } },
   },
   { authorization: `Bearer ${env.groqApiKey}` },
  );
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty structured response");
  try { payload = JSON.parse(text); }
  catch { throw new Error("Groq returned invalid JSON"); }
 } else {
  if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY missing");
  const response = await http.postJson<Record<string, unknown>>(
   "https://generativelanguage.googleapis.com/v1beta/interactions",
   {
    model: env.geminiModel,
    input: promptFor(candidate, evidence),
    response_format: { type: "text", mime_type: "application/json", schema },
   },
   { "x-goog-api-key": env.geminiApiKey },
  );
  payload = contextPayloadFromInteraction(response);
 }
 const context = normalizeContextPayload(payload, evidence);
 if (!context) throw new Error(`${provider} returned an unexpected structured-output shape`);
 if (!hasMeaningfulContext(context)) throw new Error(`${provider} returned fallback text for every context field`);
 return context;
}
