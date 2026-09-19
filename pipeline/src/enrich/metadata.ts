import type { Env } from "../config.js";
import type { Http } from "../http.js";
import { countryMention, normalizeCountry, parseLocation, regionOf } from "../normalize/location.js";
import { excerpt } from "../normalize/text.js";
import type { MetadataStats, NormalizedOpportunity } from "../types.js";

interface OpenRouterResponse {
 model?: string;
 error?: { message?: string };
 choices?: { message?: { content?: string } }[];
}

interface MetadataAnswer {
 index?: unknown;
 country?: unknown;
 city?: unknown;
 organization?: unknown;
 confidence?: unknown;
 evidence?: unknown;
}

const TLD_COUNTRIES: Record<string, string> = {
 uk:"GB", de:"DE", nl:"NL", se:"SE", no:"NO", dk:"DK", fi:"FI", ch:"CH", fr:"FR", be:"BE",
 at:"AT", ie:"IE", es:"ES", it:"IT", pt:"PT", pl:"PL", cz:"CZ", gr:"GR", ee:"EE", lv:"LV",
 lt:"LT", si:"SI", sk:"SK", hr:"HR", hu:"HU", ro:"RO", bg:"BG", is:"IS", in:"IN", jp:"JP",
 cn:"CN", kr:"KR", hk:"HK", tw:"TW", sg:"SG", my:"MY", th:"TH", au:"AU", nz:"NZ", za:"ZA",
 ca:"CA", mx:"MX", br:"BR", il:"IL", ae:"AE",
};

function countryFromUrl(value: string | null | undefined): string | null {
 try {
  const host = new URL(value ?? "").hostname.toLowerCase();
  return TLD_COUNTRIES[host.split(".").at(-1) ?? ""] ?? null;
 } catch { return null; }
}

/** Source fields win. Deterministic repairs are deliberately conservative and
 * happen before any model call. */
export function enrichMetadataLocally(o: NormalizedOpportunity): NormalizedOpportunity {
 if (o.country) {
  return { ...o, region: regionOf(o.city, o.country, o.isRemote), locationMetadata: {
   method: "source", confidence: 1, evidence: o.locationRaw ?? o.country,
  } };
 }
 const parsed = parseLocation(o.locationRaw);
 const country = parsed.country
  ?? countryMention(o.locationRaw)
  ?? countryMention(o.organization)
  ?? countryMention(o.title)
  ?? countryMention(excerpt(o.descriptionText, 1600))
  ?? countryFromUrl(o.organizationUrl)
  ?? countryFromUrl(o.url);
 if (!country) return o;
 const city = o.city ?? parsed.city;
 return {
  ...o, city, country, region: regionOf(city, country, o.isRemote),
  locationMetadata: {
   method: "deterministic", confidence: 0.9,
   evidence: o.locationRaw ?? o.organizationUrl ?? o.url,
  },
 };
}

const clean = (value: unknown, max = 180) => typeof value === "string"
 ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** One structured model request repairs a batch, so metadata enrichment does
 * not consume one API call per vacancy. Low-confidence answers remain unknown. */
export async function enrichMetadataWithOpenRouter(
 env: Env, http: Http, rows: NormalizedOpportunity[], stats: MetadataStats, verifyExisting = false,
): Promise<NormalizedOpportunity[]> {
 // Bound normal discovery too, not only backfills. Preserve input ordering.
 if (rows.length > 5) {
  const output: NormalizedOpportunity[] = [];
  for (let offset = 0; offset < rows.length; offset += 5) {
   output.push(...await enrichMetadataWithOpenRouter(env, http, rows.slice(offset, offset + 5), stats, verifyExisting));
  }
  return output;
 }
 const local = rows.map(enrichMetadataLocally);
 stats.deterministic += local.filter((o, i) => !rows[i]!.country && !!o.country).length;
 const candidates = local.map((o, index) => ({ o, index })).filter(({ o }) =>
  !o.country || !o.organization || !o.city || verifyExisting);
 stats.candidates += candidates.length;
 if (!candidates.length || !env.openrouterApiKey) {
  stats.unresolved += candidates.filter(({ o }) => !o.country).length;
  return local;
 }

 const prompt = `Resolve missing vacancy metadata. This is classification, not a summary. Use the institute, explicit location, vacancy text and URL/domain together. Never use the researcher's citizenship or residence. Return null when the country cannot be supported. Country must be ISO-3166 alpha-2. Do not guess from the research topic. Confidence must reflect the supplied evidence.\nINPUT=${JSON.stringify(candidates.map(({ o, index }) => ({
  index, title:o.title, organization:o.organization, organization_url:o.organizationUrl,
  location:o.locationRaw, url:o.url, excerpt:excerpt(o.descriptionText, 800),
 })))}\nReturn only JSON: {"items":[{"index":0,"country":"GB or null","city":"city or null","organization":"name or null","confidence":0.0,"evidence":"short basis"}]}.`;
 try {
  const response = await http.postJson<OpenRouterResponse>(
   "https://openrouter.ai/api/v1/chat/completions",
   {
    model: env.openrouterModel,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 2200,
    provider: { require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 } },
   },
   { authorization: `Bearer ${env.openrouterApiKey}` },
  );
  if (response?.error) throw new Error(response.error.message ?? "OpenRouter metadata error");
  const text = response?.choices?.[0]?.message?.content;
  const payload = text ? JSON.parse(text) as { items?: MetadataAnswer[] } : null;
  const answers = Array.isArray(payload?.items) ? payload.items : [];
  const output = [...local];
  for (const answer of answers) {
   const index = Number(answer.index);
   const confidence = Number(answer.confidence);
   const country = normalizeCountry(clean(answer.country, 80));
   if (!Number.isInteger(index) || !candidates.some(c => c.index === index) || !country || confidence < 0.75) continue;
   const existing = output[index]!;
   // Correcting a populated source value needs substantially stronger model
   // evidence than filling a blank field.
   if (existing.country && existing.country !== country && (confidence < 0.92 || !clean(answer.evidence, 300))) continue;
   const city = clean(answer.city) || existing.city;
   const organization = clean(answer.organization) || existing.organization;
   if (country === existing.country && city === existing.city && organization === existing.organization) continue;
   output[index] = {
    ...existing, country, city, organization,
    region: regionOf(city, country, existing.isRemote),
    locationMetadata: {
     method: "ai", confidence: Math.min(1, confidence),
     evidence: clean(answer.evidence, 300) || "Institute/location evidence supplied to the model",
     model: response?.model ?? env.openrouterModel,
    },
   };
   stats.aiUpdated++;
  }
  stats.aiBatches++;
  stats.unresolved += output.filter(o => !o.country).length;
  return output;
 } catch {
  stats.unresolved += candidates.filter(({ o }) => !o.country).length;
  return local;
 }
}
