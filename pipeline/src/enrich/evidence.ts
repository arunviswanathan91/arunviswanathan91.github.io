import type { ContextCandidate } from "../db.js";
import type { Http } from "../http.js";
import { excerpt, htmlToText } from "../normalize/text.js";
import type { Evidence } from "./assessment.js";

export interface OfficialReference { label: string; url: string; kind: "visa" | "tax" | "pay" }
const guide = (label: string, url: string, kind: OfficialReference["kind"]): OfficialReference => ({ label, url, kind });
/** Entry points, not hardcoded visa rules/tax rates. Text is fetched on each
 * run; unsuccessful fetches remain references and cannot support AI claims. */
export const COUNTRY_GUIDES: Record<string, OfficialReference[]> = {
 DE: [guide("Germany: researcher residence", "https://www.make-it-in-germany.com/en/visa-residence/types/other/research", "visa"), guide("Germany: salary, tax and social contributions", "https://www.make-it-in-germany.com/en/working-in-germany/working-environment/salary-taxes-social-security", "tax"), guide("German states: collective pay agreements", "https://www.tdl-online.de/tarifvertraege/tv-l", "pay")],
 GB: [guide("UK: Skilled Worker route", "https://www.gov.uk/skilled-worker-visa", "visa"), guide("UK: income tax", "https://www.gov.uk/income-tax-rates", "tax")],
 FR: [guide("France: researcher visa", "https://www.campusfrance.org/en/the-researcher-talent-passport-long-stay-visa", "visa"), guide("France: international tax information", "https://www.impots.gouv.fr/international-particulier", "tax")],
 NL: [guide("Netherlands: researcher residence", "https://ind.nl/en/residence-permits/work/researcher-directive-eu-2016801", "visa"), guide("Netherlands: income tax", "https://www.government.nl/topics/income-tax", "tax")],
 FI: [guide("Finland: researcher permit", "https://migri.fi/en/researcher", "visa"), guide("Finland: tax on arrival", "https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/arriving_in_finland/", "tax")],
 SE: [guide("Sweden: work and research permits", "https://www.migrationsverket.se/en/you-want-to-apply/work.html", "visa"), guide("Sweden: moving to Sweden", "https://www.skatteverket.se/servicelankar/otherlanguages/inenglishengelska/individualsandemployees/movingtosweden.4.7be5268414bea064694c40c.html", "tax")],
 NO: [guide("Norway: work immigration", "https://www.udi.no/en/want-to-apply/work-immigration/", "visa"), guide("Norway: foreign employees", "https://www.skatteetaten.no/en/person/foreign/", "tax")],
 DK: [guide("Denmark: work permits", "https://www.nyidanmark.dk/en-GB/You-want-to-apply/Work", "visa"), guide("Denmark: working in Denmark", "https://skat.dk/en-us/individuals/cross-border-tax-matters/working-in-denmark", "tax")],
 CH: [guide("Switzerland: working as a foreign national", "https://www.ch.ch/en/foreign-nationals-in-switzerland/working-in-switzerland/", "visa"), guide("Switzerland: taxes", "https://www.ch.ch/en/taxes-and-finances/", "tax")],
 US: [guide("US: exchange researcher programme", "https://j1visa.state.gov/programs/professor-and-research-scholar/", "visa"), guide("US: taxation of foreign students and scholars", "https://www.irs.gov/individuals/international-taxpayers/foreign-students-scholars-teachers-researchers-and-exchange-visitors", "tax")],
 CA: [guide("Canada: work permits", "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html", "visa"), guide("Canada: income tax", "https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax.html", "tax")],
 AU: [guide("Australia: visa options", "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder", "visa"), guide("Australia: individual tax rates", "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents", "tax")],
 SG: [guide("Singapore: employment passes", "https://www.mom.gov.sg/passes-and-permits/employment-pass", "visa"), guide("Singapore: income tax rates", "https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates", "tax")],
 IN: [guide("India: visa information", "https://indianvisaonline.gov.in/", "visa"), guide("India: income tax guidance", "https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1", "tax")],
};

export const safeEvidenceUrl = (value: string | null | undefined) => {
 try {
  const url = new URL(value ?? "");
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  const h = url.hostname.toLowerCase();
  if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") || h.includes(":") || /^\d/.test(h)) return null;
  return url.toString();
 } catch { return null; }
};
const caches = new WeakMap<Http, Map<string, Promise<Evidence | null>>>();
async function cached(http: Http, key: string, fetcher: () => Promise<Evidence | null>) {
 let cache = caches.get(http);
 if (!cache) { cache = new Map(); caches.set(http, cache); }
 if (!cache.has(key)) cache.set(key, fetcher().catch(() => null));
 return cache.get(key)!;
}

/** Keep relevant paragraphs rather than truncating before climate/transport. */
export function relevantExcerpt(text: string, max: number): string {
 const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 65);
 const relevant = paragraphs.filter(p => /research|laborator|climat|temperature|transport|housing|population|rent|salary|remuneration|tax|visa|residen|permit|funding|contract|requirement|contribution|EUR|GBP|TV-L|E 13|employment/i.test(p));
 // Reserve room for later sections of a city article (a lead-only extract
 // was the reason climate and transport repeatedly came back empty).
 const themes = [/climat|temperature/i,/transport|metro|tram/i,/population/i,/housing|rent/i];
 const highlights = themes.flatMap(pattern => {
  const paragraph = paragraphs.find(p => pattern.test(p));
  return paragraph ? [excerpt(paragraph, Math.floor(max / 7))] : [];
 });
 return excerpt([...new Set([...highlights, ...paragraphs.slice(0, 2), ...relevant, ...paragraphs])].join("\n"), max);
}
async function pageEvidence(http: Http, reference: { label: string; url: string; kind: Evidence["kind"] }, max = 2400): Promise<Evidence | null> {
 const url = safeEvidenceUrl(reference.url);
 if (!url) return null;
 return cached(http, `${url}:${max}`, async () => {
  const response = await http.get(url, { accept: "text/html" });
  if (!response.ok || !response.body || /application\/pdf/i.test(response.headers["content-type"] ?? "")) return null;
  // Prefer article/main content to menu/cookie banners. No script execution.
  const body = response.body.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? response.body;
  const text = relevantExcerpt(htmlToText(body), max);
  if (text.length < 120 || /^(access denied|just a moment|enable javascript|page not found)/i.test(text)) return null;
  return { ...reference, url, text, checked_at: new Date().toISOString() };
 });
}

async function wikiEvidence(http: Http, query: string, kind: "institution" | "place") {
 if (!query.trim()) return null;
 return cached(http, `wiki:${query}`, async () => {
  const api = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" + encodeURIComponent(query)
   + "&gsrlimit=1&prop=extracts%7Cinfo&explaintext=1&inprop=url&format=json";
  const response = await http.getJson<{ query?: { pages?: Record<string, { title?: string; extract?: string; fullurl?: string }> } }>(api);
  const page = Object.values(response?.query?.pages ?? {})[0];
  const url = safeEvidenceUrl(page?.fullurl);
  if (!url || !page?.extract) return null;
  return { label: `${kind === "place" ? "City" : "Institution"}: ${page.title ?? query}`, url, kind,
   text: relevantExcerpt(page.extract, 3000), checked_at: new Date().toISOString() };
 });
}

/** A Wikipedia city article almost always states its population plainly
 *  ("population of 8,443,675", "population: 12.3 million (2021)"). Pulling
 *  it out with a regex is free and more reliable than spending a model call
 *  asking it to reread the same sentence -- used to skip (or fill) the
 *  "population" field of the institution-facts AI call whenever it hits. */
export function extractPopulationFact(text: string): string | null {
 // A year in parens can appear either right after "population" (infobox
 // style: "Population (2021) 8,443,675") or after the number ("population
 // of 677,381 (2011 census)"); either way it must not be mistaken for the
 // population figure itself, so it is matched and excluded explicitly.
 const match = text.match(/population\s*(?:\((\d{4})\))?[^\d]{0,20}([\d][\d,.\s]{2,}\d)(?:\s*(million|billion))?/i);
 if (!match) return null;
 const [full, leadingYear, numberRaw, scale] = match;
 const number = `${numberRaw!.trim().replace(/\s+/g, ",")}${scale ? ` ${scale}` : ""}`;
 const trailingYear = leadingYear
  ? null
  : text.slice(match.index!, match.index! + full!.length + 20).match(/\((\d{4})[^)]*\)/)?.[1];
 const year = leadingYear ?? trailingYear;
 return year ? `${number} (${year})` : number;
}

export async function collectDecisionEvidence(http: Http, candidate: ContextCandidate) {
 const evidence: Evidence[] = [];
 const add = (item: Evidence | null) => { if (item && !evidence.some(e => e.url === item.url && e.kind === item.kind)) evidence.push(item); };
 const listingUrl = safeEvidenceUrl(candidate.url);
 const storedText = [candidate.summary, candidate.description_excerpt, candidate.salary_display && `Crawler salary (${candidate.salary_is_predicted ? "predicted, NOT an employer quote" : "extracted; check advert"}): ${candidate.salary_display}`].filter(Boolean).join("\n");
 const listing = listingUrl ? await pageEvidence(http, { label: "Original vacancy", url: listingUrl, kind: "listing" }, 6500) : null;
 add(listing ?? (storedText ? { label: "Stored vacancy excerpt", url: listingUrl ?? "", text: storedText.slice(0, 6500), kind: "listing" } : null));
 const country = (candidate.country ?? "").toUpperCase();
 const references = COUNTRY_GUIDES[country === "UK" ? "GB" : country] ?? [];
 // These pages are shared by city/country within a run, so a batch of listings
 // does not repeatedly download the same immigration or tax document.
 for (const reference of references) add(await pageEvidence(http, reference));
 if (candidate.organization_url) add(await pageEvidence(http, { label: `${candidate.organization ?? "Institution"} website`, url: candidate.organization_url, kind: "institution" }));
 if (candidate.organization) add(await wikiEvidence(http, candidate.organization, "institution"));
 const city = candidate.city || candidate.location;
 if (city) add(await wikiEvidence(http, [city, candidate.country].filter(Boolean).join(", "), "place"));
 return { evidence, references };
}
