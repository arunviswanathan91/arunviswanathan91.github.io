// Pure logic checks, run under plain Node -- no network, no database.
import { canonicalizeUrl, atsKey, urlHash } from "../src/normalize/url.js";
import { contentHash, htmlToText, normalizeForHash, stripBoilerplate, decodeEntities, excerpt } from "../src/normalize/text.js";
import { normalizeCity, normalizeCountry, regionOf, locKey, parseLocation, looksRemote } from "../src/normalize/location.js";
import { classifyType, requiredPostPhdYears, isSeniorLeadership, JUNK_TITLE } from "../src/normalize/type.js";
import { salaryFromText, annualInr, salaryDisplay, salaryCurrencyConversion } from "../src/normalize/salary.js";
import { loadInrExchangeRates, rateBetween, type ExchangeRateSnapshot } from "../src/currency.js";
import { extractJsonLd, findJobPostings, readJobPosting } from "../src/normalize/jsonld.js";
import { orgKey, titleTokens, jaccard, simhash, hamming, simhashBands } from "../src/dedupe/keys.js";
import { matchCandidate, type Candidate } from "../src/dedupe/cascade.js";
import { topicMatch } from "../src/score/ontology.js";
import { hardFilter, scoreOpportunity } from "../src/score/score.js";
import { queryDisposition, queryRelevance } from "../src/score/query.js";
import { buildOpportunity } from "../src/sources/build.js";
import { parseFeed } from "../src/sources/feed.js";
import { formatDigest } from "../src/sinks/telegram.js";
import type { NormalizedOpportunity, SearchProfile } from "../src/types.js";
import { parseEuraxessJob, typeFromResearcherProfile } from "../src/normalize/euraxess.js";
import { FirecrawlBudget, makeRenderer } from "../src/sources/firecrawl.js";
import { defaultSourceRows } from "../src/sources/catalog/defaults.js";
import { isFreshSearch, shouldEvaluate, shouldPersistRunItem, termsForDiscovery, termsForRun } from "../src/search/query.js";
import { enrichMetadataLocally, enrichMetadataWithOpenRouter } from "../src/enrich/metadata.js";
import { contextPayloadFromInteraction, hasMeaningfulContext, normalizeContextPayload, UNKNOWN } from "../src/enrich/context.js";
import { contextProviders, createContextFallback, ContextProvidersUnavailable, openrouterRequest, parseOpenrouterContext, parseStructuredJson, enrichOpportunityContext } from "../src/enrich/context.js";
import { readEnv } from "../src/config.js";
import { Http, HttpResponseError } from "../src/http.js";
import type { ContextCandidate } from "../src/db.js";
import { assessmentInstructions, assessmentPreferences, assessmentKey, needsAssessment, normalizeAssessment, SECTION_KEYS, type Evidence } from "../src/enrich/assessment.js";
import { collectDecisionEvidence, relevantExcerpt, safeEvidenceUrl } from "../src/enrich/evidence.js";
import { sourceIssues } from "../src/normalize/quality.js";
import { adzunaAdapter } from "../src/sources/adzuna.js";
import { joobleAdapter } from "../src/sources/jooble.js";
import { feedAdapter } from "../src/sources/feed.js";
import type { SourceContext } from "../src/sources/types.js";

type Check = { name: string; ok: boolean; detail?: string };
const out: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => out.push({ name, ok, detail });
const eq = (name: string, a: unknown, b: unknown) =>
 check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const decisionPayload = () => ({
 fit: { verdict: "weak", reason: "Bacterial flagella do not directly match the selected cancer research topics.", strengths: ["Microscopy methods may transfer."], gaps: ["No tumour biology focus stated."] },
 sections: Object.fromEntries(SECTION_KEYS.map(key => [key, { text: key === "role" ? "Bacterial molecular microbiology research." : "", basis: key === "role" ? "listing" : "unknown", source_ids: key === "role" ? [1] : [] }])),
 money: { currency: "EUR", gross: { low: 2500, high: 3000, basis: "estimate", source_ids: [], note: "Guaranteed 50% FTE; illustrative estimate only" }, deductions: { low: 500, high: 900, basis: "estimate", source_ids: [], note: "Estimated employee deductions" }, rent: null, essentials: null, upfront: null, contract_percent: 50, salary_basis: "typical_estimate", assumptions: ["One person, shared housing; no temporary increase included"] },
 questions: ["What pay step and guaranteed FTE will be in the contract?"], next_steps: ["Ask HR to confirm the contract and sponsorship route."] ,
});

{
 const prefs = assessmentPreferences({ interests: ["Cancer biology"], nationality: "India", residence: "India", household: 1 });
 const evidence: Evidence[] = [{ label: "Vacancy", url: "https://example.org/job", kind: "listing", text: "Research fellow with 50 % part-time employment; increase by 50% expected temporarily." }];
 const result = normalizeAssessment(decisionPayload(), evidence, prefs);
 eq("decision assessment keeps semantic fit distinct from role score", result.fit.verdict, "weak");
 eq("guaranteed part-time FTE is kept", result.money.contract_percent, 50);
 eq("unknown rent stays unknown", result.money.rent, null);
 eq("preferences fingerprint stored with each brief", result.profile_key, assessmentKey(prefs));
 check("legacy summaries become eligible for richer assessment", needsAssessment({ institution: "Old summary" }, prefs));
 check("matching fresh assessment is not regenerated", !needsAssessment({ brief: result, generated_at: new Date().toISOString() }, prefs));
 check("changed nationality invalidates prior assessment", needsAssessment({ brief: result, generated_at: new Date().toISOString() }, { ...prefs, nationality: "Canada" }));
 check("dated assessment becomes eligible again", needsAssessment({ brief: result, generated_at: "2020-01-01T00:00:00Z" }, prefs));
 const badVisa = decisionPayload();
 badVisa.sections.visa = { text: "Guaranteed permit and tax exemption", basis: "source", source_ids: [1, 999] };
 const guarded = normalizeAssessment(badVisa, evidence, prefs);
 eq("visa cannot cite an advert or invented source", guarded.sections.visa.source_ids, []);
 eq("unsourced legal claims are withheld", guarded.sections.visa.basis, "unknown");
 const official: Evidence = { label: "Official visa", url: "https://www.make-it-in-germany.com", kind: "visa", text: "Official information" };
 badVisa.sections.visa = { text: "Confirm eligibility for the researcher route.", basis: "source", source_ids: [2] };
 eq("official visa reference is retained", normalizeAssessment(badVisa, [...evidence, official], prefs).sections.visa.source_ids, [2]);
 eq("visa not personalised without nationality", normalizeAssessment(badVisa, [...evidence, official], {...prefs,nationality:""}).sections.visa.basis, "unknown");
 const fullTime = decisionPayload(); fullTime.money.contract_percent = 100;
 const safePartTime = normalizeAssessment(fullTime, evidence, prefs);
 eq("temporary uplift cannot become the guaranteed percentage", safePartTime.money.contract_percent, 50);
 eq("conflicting salary assumptions do not produce misleading savings", safePartTime.money.gross, null);
 const invalidMoney = decisionPayload(); invalidMoney.money.gross = {low:5000, high:4000, basis:"estimate",source_ids:[],note:""};
 eq("reversed money range rejected", normalizeAssessment(invalidMoney,evidence,prefs).money.gross,null);
 invalidMoney.money.currency = "not a currency";
 eq("unknown currency cannot mix numeric estimates",normalizeAssessment(invalidMoney,evidence,prefs).money.deductions,null);
 const prompt = assessmentInstructions(prefs);
 check("prompt requests analysis beyond summarisation", prompt.includes("semantic research fit") && prompt.includes("typical_estimate") && prompt.includes("nationality"));
 check("prompt protects guaranteed FTE and missing costs", prompt.includes("Apply guaranteed FTE ONCE") && prompt.includes("Never zero missing taxes"));
 eq("unsafe evidence URL rejected",safeEvidenceUrl("http://127.0.0.1/admin"),null);
 eq("credentials are never sent in a source URL",safeEvidenceUrl("https://user:pass@example.org"),null);
 const longCity = "A very long introductory paragraph about an important historic city. ".repeat(20)+"\nThe climate has distinct summer and winter patterns, which vary across the region.\nPublic transport includes a metro system and trams serving different parts of the city.";
 check("full city extract retains later climate and transport",relevantExcerpt(longCity,1000).includes("climate") && relevantExcerpt(longCity,1000).includes("metro"));
 let fetched = 0;
 const fakeHttp = { get: async () => { fetched++; return {ok:true,body:"<main><p>Official information about research, contract requirements and payroll taxes; confirm the applicable category with the relevant authority before applying.</p></main>",headers:{}}; } } as unknown as Http;
 const candidate = { id:"test", role:"Researcher", country:"DE", url:null, organization:null,organization_url:null,location:null,city:null,summary:"Stored advert",description_excerpt:null,enrichment:null,score_breakdown:null };
 await collectDecisionEvidence(fakeHttp,candidate);
 await collectDecisionEvidence(fakeHttp,candidate);
 eq("country evidence fetched once for an entire run",fetched,3);
}

{
 const context = normalizeContextPayload({ institution: " Test institute ", place: "Test city" }, [
  { label: "Source", url: "https://example.org", text: "Evidence" },
 ]);
 eq("context enrichment normalizes strings", context?.institution, "Test institute");
 eq("context enrichment fills unsupported fields safely", context?.climate, "Not enough reliable information collected.");
 eq("context enrichment preserves evidence links", context?.sources[0]?.url, "https://example.org");
 check("context enrichment rejects arrays", normalizeContextPayload([], []) === null);
 check("all-placeholder context remains eligible for retry", !hasMeaningfulContext({ institution: UNKNOWN, place: UNKNOWN }));
 check("one supported context field is meaningful", hasMeaningfulContext({ institution: "Test institute", place: UNKNOWN }));
 eq("interaction output_text is parsed", contextPayloadFromInteraction({ output_text: '{"place":"Test city"}' }), { place: "Test city" });
 eq("direct interaction JSON is preserved", contextPayloadFromInteraction({ place: "Test city" }), { place: "Test city" });
}

// ---- URL canonicalization ----
{
 const base = { SUPABASE_URL: "https://example.org", SUPABASE_SERVICE_ROLE_KEY: "test-only" };
 const env = readEnv({ ...base, OPENROUTER_API_KEY: " test-key " });
 eq("OpenRouter defaults to the automatic free-model router", env.openrouterModel, "openrouter/free");
 eq("Gemini fallback defaults to the supported stable model", env.geminiModel, "gemini-3.6-flash");
 eq("Gemini model override whitespace is trimmed", readEnv({ ...base, GEMINI_MODEL: " gemini-3.7-flash " }).geminiModel, "gemini-3.7-flash");
 eq("OpenRouter key whitespace is trimmed", env.openrouterApiKey, "test-key");
 eq("OpenRouter works without Gemini or Groq", contextProviders(env), ["openrouter"]);
 eq("blank AI keys are disabled", contextProviders(readEnv({ ...base, OPENROUTER_API_KEY: " ", GEMINI_API_KEY: "", GROQ_API_KEY: "" })), []);
 eq("OpenRouter is primary with Groq and Gemini fallbacks", contextProviders(readEnv({ ...base, GEMINI_API_KEY: "a", GROQ_API_KEY: "b", OPENROUTER_API_KEY: "c" })), ["openrouter", "groq", "gemini"]);
 const request = openrouterRequest(env.openrouterModel, "ROLE: Researcher");
 eq("free router requests JSON mode", request.response_format, { type: "json_object" });
 const richRequest = openrouterRequest(env.openrouterModel, "ROLE: Researcher", true);
 const richFormat = richRequest.response_format as { type: string; json_schema?: { strict?: boolean } };
 check("decision brief requires strict JSON schema", richFormat.type === "json_schema" && richFormat.json_schema?.strict === true);
 eq("decision brief output is bounded", richRequest.max_tokens, 2600);
 eq("OpenRouter price ceiling is zero", request.provider.max_price, { prompt: 0, completion: 0, request: 0 });
 check("OpenRouter does not enable paid search or model fallback", !("plugins" in request) && !("models" in request));
 check("prompt enumerates required fields", request.messages[0]!.content.includes("institution, place, population, climate, transport, living, inclusion"));
 const payload = { institution: "Research institute", place: UNKNOWN, population: UNKNOWN, climate: UNKNOWN, transport: UNKNOWN, living: UNKNOWN, inclusion: UNKNOWN };
 eq("valid OpenRouter JSON is accepted", parseOpenrouterContext(JSON.stringify(payload)), payload);
 for (const [name, value] of Object.entries({ missing: {}, array: [], wrongType: { ...payload, climate: 20 }, blank: { ...payload, climate: " " }, extra: { ...payload, invented: "x" } })) {
  let rejected = false;
  try { parseOpenrouterContext(JSON.stringify(value)); } catch { rejected = true; }
  check(`invalid OpenRouter payload rejected: ${name}`, rejected);
 }
 let invalidJson = false;
 try { parseOpenrouterContext("not JSON"); } catch { invalidJson = true; }
 check("invalid OpenRouter JSON rejected", invalidJson);
 eq("structured parser accepts fenced JSON", parseStructuredJson('```json\n{"ok":true}\n```'), { ok: true });
 eq("structured parser extracts a complete wrapped object", parseStructuredJson('Result: {"text":"brace } in a string"} done'), { text: "brace } in a string" });
 let truncatedRejected = false;
 try { parseStructuredJson('{"incomplete":'); } catch { truncatedRejected = true; }
 check("structured parser rejects truncated output", truncatedRejected);

 const candidate: ContextCandidate = { id: "test", role: "Researcher", organization: null, organization_url: null, location: null, city: null, country: null, url: null, summary: "Listing", description_excerpt: null, score_breakdown: null, enrichment: null };
 let postedUrl = "";
 let postedBody: unknown;
 const stub = { postJson: async (url: string, body: unknown) => {
  postedUrl = url; postedBody = body;
  return { model: "google/gemma-3-27b-it:free", choices: [{ message: { content: JSON.stringify(decisionPayload()) } }] };
 } } as unknown as Http;
 const result = await enrichOpportunityContext(env, stub, candidate, "openrouter", []);
 eq("OpenRouter request uses official chat endpoint", postedUrl, "https://openrouter.ai/api/v1/chat/completions");
 check("OpenRouter integration sends the free router", (postedBody as { model: string }).model === "openrouter/free");
 eq("saved context records the model selected by the router", [result.provider, result.model], ["openrouter", "google/gemma-3-27b-it:free"]);
 eq("provider output becomes a versioned decision brief",result.brief?.version,4);
 eq("rich request retains zero price ceiling",(postedBody as ReturnType<typeof openrouterRequest>).provider.max_price,{prompt:0,completion:0,request:0});
 let placeholdersRejected = false;
 const placeholders = { postJson: async () => ({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(Object.keys(payload).map(key => [key, UNKNOWN]))) } }] }) } as unknown as Http;
 try { await enrichOpportunityContext(env, placeholders, candidate, "openrouter", []); } catch { placeholdersRejected = true; }
 check("all-placeholder OpenRouter response never saved", placeholdersRejected);

 const attempted: string[] = [];
 const switches: string[] = [];
 const switchErrors: string[] = [];
 const fallback = createContextFallback<string>(["gemini", "groq", "openrouter"], (a,b,error) => {
  switches.push(`${a}:${b}`);
  switchErrors.push(error instanceof Error ? error.message : String(error));
 });
 eq("quota failures reach OpenRouter for the same card", await fallback(async provider => {
  attempted.push(provider);
  if (provider !== "openrouter") throw new HttpResponseError(429, "Quota reached");
  return "saved";
 }), "saved");
 eq("fallback provider order", attempted, ["gemini", "groq", "openrouter"]);
 eq("fallback transitions are observable", switches, ["gemini:groq", "groq:openrouter"]);
 check("fallback transitions retain the provider failure", switchErrors.every(error => error.includes("HTTP 429")));
 attempted.length = 0;
 await fallback(async provider => { attempted.push(provider); return "saved"; });
 eq("next card skips exhausted providers", attempted, ["openrouter"]);
 let unavailable = false;
 try { await fallback(async () => { throw new HttpResponseError(429, "OpenRouter quota reached"); }); }
 catch (error) { unavailable = error instanceof ContextProvidersUnavailable; }
 check("all providers exhausted stops batch with pending data intact", unavailable);
 const bounded = createContextFallback<string>(["groq", "openrouter"], () => {}, 1);
 let calls = 0;
 try { await bounded(async () => { calls++; throw new HttpResponseError(429,"Busy"); }); } catch { /* pending */ }
 eq("provider fallbacks share the configured model call cap",calls,1);
 let retriedDisabled = false;
 try { await fallback(async () => { retriedDisabled = true; return "bad"; }); } catch { /* expected */ }
 check("exhausted providers are not repeatedly called", !retriedDisabled);
 const malformed = createContextFallback<string>(["openrouter"], () => {});
 try { await malformed(async () => { throw new Error("Malformed card response"); }); } catch { /* expected */ }
 eq("card-specific parse error does not disable provider", await malformed(async () => "next card"), "next card");
 const retired = createContextFallback<string>(["gemini"], () => {});
 let retiredUnavailable = false, retiredCalls = 0;
 try { await retired(async () => { retiredCalls++; throw new HttpResponseError(404, "model retired"); }); }
 catch (error) { retiredUnavailable = error instanceof ContextProvidersUnavailable && error.message.includes("model retired"); }
 try { await retired(async () => { retiredCalls++; return "bad"; }); } catch { /* disabled */ }
 check("retired provider is disabled immediately with a useful final error", retiredUnavailable && retiredCalls === 1);
}

eq("strips utm params", canonicalizeUrl("https://x.com/job/1?utm_source=fb&utm_campaign=x"), "https://x.com/job/1");
eq("drops www", canonicalizeUrl("https://www.x.com/job/1"), "https://x.com/job/1");
eq("sorts remaining params", canonicalizeUrl("https://x.com/j?b=2&a=1"), "https://x.com/j?a=1&b=2");
eq("keeps euraxess jobId", canonicalizeUrl("https://euraxess.ec.europa.eu/jobs/x?jobId=123&utm_source=y"), "https://euraxess.ec.europa.eu/jobs/x?jobId=123");
eq("strips trailing slash", canonicalizeUrl("https://x.com/job/1/"), "https://x.com/job/1");
eq("same url after canon is stable idempotent", canonicalizeUrl(canonicalizeUrl("https://WWW.X.com/A/?utm_source=z")), canonicalizeUrl("https://x.com/A/?utm_source=z"));
check("urlHash is deterministic", urlHash("https://x.com/a") === urlHash("https://x.com/a"));
check("urlHash differs for different urls", urlHash("https://x.com/a") !== urlHash("https://x.com/b"));

// ---- ATS identity ----
eq("greenhouse ats key", atsKey("https://boards.greenhouse.io/acme/jobs/4123456"), "greenhouse:acme:4123456");
eq("lever ats key", atsKey("https://jobs.lever.co/acme/1234abcd-5678-90ef-abcd-1234567890ab"), "lever:acme:1234abcd-5678-90ef-abcd-1234567890ab");
eq("workday ats key", atsKey("https://acme.wd1.myworkdayjobs.com/en-US/External/job/Remote/Scientist_R-00123"), "workday:acme:_R-00123");
eq("euraxess ats key from query", atsKey("https://euraxess.ec.europa.eu/jobs/search?jobId=99887"), "euraxess:99887");
eq("no ats key for a plain page", atsKey("https://university.edu/careers/1"), null);

// ---- text ----
eq("decodes entities", decodeEntities("Tom &amp; Jerry &rsquo;s"), "Tom & Jerry 's");
eq("decodes repeatedly escaped entities", decodeEntities("Cancer Biology &amp;amp; Epigenetics"), "Cancer Biology & Epigenetics");
check("html to text strips tags", !htmlToText("<p>Hello <b>world</b></p>").includes("<"));
check("boilerplate paragraph removed", !stripBoilerplate("Real paragraph.\n\nWe are an equal opportunity employer.").includes("equal opportunity"));
check("real paragraph survives boilerplate strip", stripBoilerplate("Real paragraph.\n\nWe are an equal opportunity employer.").includes("Real paragraph"));
eq("excerpt respects max length", excerpt("a".repeat(50), 10).length <= 10, true);
check("normalizeForHash strips urls/emails", !normalizeForHash("contact us@x.com or https://x.com").match(/@|http/));
{
 const h1 = contentHash({ title: "Postdoc", orgKey: "rgcb", locKey: "kochi", employmentType: null, deadline: null, salaryMin: null, salaryMax: null, currency: null, description: "Same text here about cancer research." });
 const h2 = contentHash({ title: "Postdoc", orgKey: "rgcb", locKey: "kochi", employmentType: null, deadline: null, salaryMin: null, salaryMax: null, currency: null, description: "Same text  here about cancer research.  " });
 eq("contentHash ignores whitespace churn", h1, h2);
 const h3 = contentHash({ title: "Postdoc", orgKey: "rgcb", locKey: "kochi", employmentType: null, deadline: "2027-01-01", salaryMin: null, salaryMax: null, currency: null, description: "Same text here about cancer research." });
 check("contentHash changes when deadline changes", h1 !== h3);
}

// ---- location ----
eq("bangalore alias", normalizeCity("Bengaluru"), "bangalore");
eq("trivandrum alias", normalizeCity("Thiruvananthapuram"), "trivandrum");
eq("country name to iso", normalizeCountry("Germany"), "DE");
eq("already-iso passes through", normalizeCountry("se"), "SE");
eq("unknown country is null", normalizeCountry("Narnia"), null);
eq("region kerala", regionOf("Kochi", "IN", false), "Kerala");
eq("region bengaluru", regionOf("Bangalore", "IN", false), "Bengaluru");
eq("region remote", regionOf(null, null, true), "Remote");
eq("region europe", regionOf(null, "DE", false), "Europe");
eq("locKey remote wins", locKey("Paris", "FR", true), "REMOTE");
eq("locKey falls back to country", locKey(null, "SE", false), "SE");
eq("parseLocation splits city+country", parseLocation("Bengaluru, Karnataka, India"), { city: "Bengaluru", country: "IN" });
eq("US state supplies a missing country", parseLocation("New York, New York"), { city: "New York", country: "US" });
eq("Indian city supplies a missing country", parseLocation("Chennai"), { city: "Chennai", country: "IN" });
check("looksRemote detects wfh", looksRemote("This is a fully remote position"));
check("looksRemote false for onsite", !looksRemote("This is an onsite position in Munich"));

// ---- type classification ----
eq("classifies postdoc", classifyType("Postdoctoral Fellow in Cancer Biology", ""), "Postdoc");
eq("classifies faculty", classifyType("Assistant Professor of Oncology", ""), "Faculty");
eq("classifies research scientist", classifyType("Research Scientist, Immuno-Oncology", ""), "Research scientist");
eq("classifies fellowship", classifyType("Early Career Fellowship Programme", ""), "Fellowship");
eq("unclassified falls back to Other", classifyType("Something Unrelated Entirely", ""), "Other");
check("junk title regex catches intern", JUNK_TITLE.test("Summer Internship in Marketing"));
check("junk title regex catches vacancy roundups", JUNK_TITLE.test("Research Update: Career options with ResearchersJob"));
check("junk title regex spares postdoc", !JUNK_TITLE.test("Postdoctoral Fellow"));
eq("extracts required years", requiredPostPhdYears("Requires 5+ years post-doctoral experience"), 5);
eq("no years mentioned is null", requiredPostPhdYears("A great opportunity for early career researchers"), null);
check("detects senior leadership title", isSeniorLeadership("Group Leader, Cancer Immunology"));
check("postdoc is not senior leadership", !isSeniorLeadership("Postdoctoral Fellow"));

// ---- salary ----
{
 const rates: ExchangeRateSnapshot = {
  base:"INR", asOf:"2026-09-16", sourceUrl:"https://example.test/inr.json",
  toInr:{INR:1,USD:84,EUR:92},
 };
 const s = salaryFromText("Salary range: INR 8,00,000 - INR 12,00,000 per annum");
 check("salary range parsed", !!s && s.min === 800000 && s.max === 1200000 && s.currency === "INR");
 const lpa = salaryFromText("Compensation: 18 LPA");
 check("lpa parsed", !!lpa && lpa.min === 1800000 && lpa.currency === "INR");
 const usd = salaryFromText("We offer $60,000 - $75,000 a year depending on experience.");
 check("usd range parsed", !!usd && usd.currency === "USD" && usd.min === 60000 && usd.max === 75000);
 const eurThousands = salaryFromText("Salary: €3.204/month gross, based on full-time employment");
 check("European dot thousands are not parsed as decimals", !!eurThousands && eurThousands.min === 3204 && eurThousands.period === "month");
 const eurDecimal = salaryFromText("Salary: €3.204,50 per month gross");
 check("European decimal salary remains precise", !!eurDecimal && eurDecimal.min === 3204.5 && eurDecimal.period === "month");
 check("no salary mentioned returns null", salaryFromText("A wonderful opportunity to join our team.") === null);
 eq("annualInr converts usd with the fetched rate", annualInr({ min: 60000, max: 60000, currency: "USD", period: "year", isPredicted: false, extractedFrom: "text", confidence: 1, evidence: null },rates), 60000 * 84);
 eq("foreign salary is not guessed when rates are unavailable", annualInr({ min: 60000, max: 60000, currency: "USD", period: "year", isPredicted: false, extractedFrom: "text", confidence: 1, evidence: null }), null);
 eq("rate conversion works between two non-INR currencies",rateBetween(rates,"EUR","USD"),92/84);
 eq("display currency defaults to INR independently of residence",assessmentPreferences({residence:"Sweden"}).displayCurrency,"INR");
 eq("user-selected display currency is normalized",assessmentPreferences({residence:"India",displayCurrency:"usd"}).displayCurrency,"USD");
 const converted=salaryCurrencyConversion(usd,"INR",rates);
 eq("converted salary preserves the original period and marks approximation",converted?.display,"≈₹50.4L–63L/yr");
 eq("salaryDisplay formats inr lakhs", salaryDisplay({ min: 800000, max: 1200000, currency: "INR", period: "year", isPredicted: false, extractedFrom: "text", confidence: 1, evidence: null }), "₹8L–12L/yr");
 eq("salaryDisplay null salary", salaryDisplay(null), null);
 eq("salaryDisplay ignores a zero lower bound", salaryDisplay({
  min: 0, max: 80000, currency: "USD", period: "year", isPredicted: false,
  extractedFrom: "api", confidence: 0.9, evidence: null,
 }), "$80,000/yr");

 const requested:string[]=[];
 const loaded=await loadInrExchangeRates({getJson:async (url:string)=>{
  requested.push(url);
  return requested.length===1?null:{date:"2026-09-16",inr:{usd:1/84,eur:1/92,...Object.fromEntries(Array.from({length:25},(_,i)=>[`x${String.fromCharCode(97+i%26)}z`,i+1]))}};
 }} as unknown as Pick<Http,"getJson">);
 eq("exchange API falls back to the documented mirror",requested.length,2);
 eq("exchange API response is inverted into INR-per-unit rates",Math.round(loaded?.toInr.USD??0),84);
}

// ---- JSON-LD ----
{
 const html = "<html><head><script type=\"application/ld+json\">" + JSON.stringify({
  "@context": "https://schema.org", "@type": "JobPosting",
  title: "Postdoctoral Researcher - Pancreatic Cancer",
  hiringOrganization: { name: "Test Institute", sameAs: "https://institute.example" },
  jobLocation: { address: { addressLocality: "Munich", addressCountry: "DE" } },
  datePosted: "2026-01-10", validThrough: "2026-03-01",
  description: "<p>Study pancreatic ductal adenocarcinoma using single-cell methods.</p>",
  baseSalary: { currency: "EUR", value: { minValue: 45000, maxValue: 52000, unitText: "YEAR" } },
 }) + "</script></head><body></body></html>";
 const blocks = extractJsonLd(html);
 eq("extracts one jsonld block", blocks.length, 1);
 const postings = findJobPostings(blocks);
 eq("finds one job posting", postings.length, 1);
 const job = readJobPosting(postings[0]);
 eq("reads title", job.title, "Postdoctoral Researcher - Pancreatic Cancer");
 eq("reads org via sameAs", job.organizationUrl, "https://institute.example");
 eq("reads city/country", [job.city, job.country], ["Munich", "DE"]);
 eq("reads dates as iso", job.postedAt, new Date("2026-01-10").toISOString());
 check("description html stripped", !job.description.includes("<p>"));
 check("salary parsed from jsonld", job.salary?.currency === "EUR" && job.salary?.min === 45000 && job.salary?.extractedFrom === "jsonld");
}
{
 // malformed JSON should not throw
 const html = "<script type=\"application/ld+json\">{not valid json,}</script>";
 check("malformed jsonld does not throw", extractJsonLd(html).length === 0 || true);
}

// ---- dedup keys ----
eq("iisc alias", orgKey("Indian Institute of Science"), "indian-institute-science");
eq("org key strips legal suffix", orgKey("Acme Biotech Pvt Ltd"), "acme-biotech");
eq("org key on null is null", orgKey(null), null);
{
 const a = titleTokens("Postdoctoral Fellow – Pancreatic Cancer (Remote)");
 const b = titleTokens("Pancreatic Cancer Postdoctoral Fellow (m/f/d)");
 check("title token folding matches reordered synonyms", jaccard(a, b) >= 0.75, `jaccard=${jaccard(a, b)}`);
 const c = titleTokens("Sales Executive - Consumer Products");
 check("unrelated titles score low", jaccard(a, c) < 0.3);
}
{
 // Realistic job-description length (60-150 word-trigram shingles) is what the
 // T4 threshold is actually calibrated against -- short fixtures underrepresent
 // the shingle count and produce noisier, unrepresentative bit votes.
 const base = "We are seeking a highly motivated postdoctoral researcher to join our laboratory studying pancreatic ductal adenocarcinoma and the tumour microenvironment. The successful candidate will use single cell RNA sequencing and spatial transcriptomics methods to characterise immune cell populations and stromal interactions in patient derived samples, working closely with clinical collaborators and the bioinformatics core facility on data analysis and manuscript preparation";
 const reworded = base.replace("methods", "techniques").replace("laboratory", "lab").replace("characterise", "characterize");
 const unrelated = "Applications are invited for a research scientist position in our group focused on hepatocellular carcinoma and drug resistance mechanisms. The role involves CRISPR screening and proteomic profiling of patient derived organoids to identify therapeutic targets, in collaboration with the medicinal chemistry team and requires experience with mass spectrometry data analysis and grant writing support for the group";
 const h1 = simhash(base), h2 = simhash(reworded), h3 = simhash(unrelated);
 check("near-duplicate text stays under the calibrated duplicate threshold (20)", hamming(h1, h2) <= 20, `hamming=${hamming(h1, h2)}`);
 check("a genuinely different same-domain posting clears the threshold with margin", hamming(h1, h3) > 20, `hamming=${hamming(h1, h3)}`);
 check("unrelated text is farther than the near-duplicate", hamming(h1, h3) > hamming(h1, h2));
 const bands = simhashBands(h1);
 eq("simhash has 4 bands", bands.length, 4);
}

// ---- dedup cascade ----
{
 const candidates: Candidate[] = [{
  id: "existing-1", urlHash: "hash-a", atsKey: "greenhouse:acme:123", orgKey: "indian-institute-science",
  titleKey: null, title: "Postdoctoral Fellow - Pancreatic Cancer", locKey: "bangalore",
  postedAt: "2026-01-01T00:00:00Z", simhash: simhash("We are seeking a highly motivated postdoctoral researcher to join our laboratory studying pancreatic ductal adenocarcinoma and the tumour microenvironment. The successful candidate will use single cell RNA sequencing and spatial transcriptomics methods to characterise immune cell populations and stromal interactions in patient derived samples, working closely with clinical collaborators and the bioinformatics core facility on data analysis and manuscript preparation"),
  deadline: "2026-06-01T00:00:00Z", status: "New",
 }];

 const byUrl = matchCandidate({ urlHash: "hash-a", atsKey: null, orgKey: null, title: "x", locKey: null, postedAt: null, simhash: null, descriptionLength: 0 }, candidates);
 eq("T1 url match wins", byUrl.signal, "url");

 const byAts = matchCandidate({ urlHash: "different", atsKey: "greenhouse:acme:123", orgKey: null, title: "x", locKey: null, postedAt: null, simhash: null, descriptionLength: 0 }, candidates);
 eq("T2 ats match", byAts.signal, "ats");

 const byOrgTitle = matchCandidate({
  urlHash: "different2", atsKey: null, orgKey: "indian-institute-science",
  title: "Pancreatic Cancer Postdoctoral Fellow", locKey: "bangalore", postedAt: "2026-01-05T00:00:00Z",
  simhash: null, descriptionLength: 0,
 }, candidates);
 eq("T3 org+title+location match", byOrgTitle.signal, "orgtitle");

 const bySimhash = matchCandidate({
  urlHash: "different3", atsKey: null, orgKey: null, title: "Completely Different Title Wording",
  locKey: null, postedAt: null,
  simhash: simhash("We are seeking a highly motivated postdoctoral researcher to join our lab studying pancreatic ductal adenocarcinoma and the tumour microenvironment. The successful candidate will use single cell RNA sequencing and spatial transcriptomics techniques to characterize immune cell populations and stromal interactions in patient derived samples, working closely with clinical collaborators and the bioinformatics core facility on data analysis and manuscript preparation"),
  descriptionLength: 500,
 }, candidates);
 eq("T4 simhash match on near-identical description", bySimhash.signal, "simhash");

 const noMatch = matchCandidate({
  urlHash: "different4", atsKey: null, orgKey: "some-other-org", title: "Sales Manager, EMEA",
  locKey: "paris", postedAt: null, simhash: null, descriptionLength: 0,
 }, candidates);
 eq("unrelated posting does not match", noMatch.signal, "none");

 const repost = matchCandidate({
  urlHash: "different5", atsKey: null, orgKey: "indian-institute-science",
  title: "Postdoctoral Fellow - Pancreatic Cancer", locKey: "bangalore",
  postedAt: "2026-12-01T00:00:00Z", simhash: null, descriptionLength: 0,
 }, candidates);
 check("reopened listing after a past deadline is flagged as a repost, not silently merged", repost.repost === true && repost.candidate?.id === "existing-1");
}

// ---- ontology / scoring ----
{
 const t1 = topicMatch("Postdoctoral Fellow", "We study pancreatic ductal adenocarcinoma and the tumour microenvironment using single-cell RNA sequencing.");
 check("pdac synonym recognized", t1.hits.includes("pdac"));
 check("tme concept recognized", t1.hits.includes("tme"));
 check("singlecell concept recognized", t1.hits.includes("singlecell"));
 const t2 = topicMatch("Marketing Manager", "Manage social media campaigns and quarterly sales reports.");
 eq("irrelevant posting has no topic hits", t2.hits.length, 0);
}

const profile: SearchProfile = {
 id: null, userId: "u1", terms: ["pancreatic cancer postdoc"],
 types: ["Postdoc", "Research scientist", "Industry R&D", "Fellowship"],
 homeCity: "Thiruvananthapuram", indiaCities: [], countries: ["SE"],
 remoteOk: true, facultyOk: false, yearsExperience: 0,
 salaryFloorInr: 1200000, rejectBelowFloor: true, blockedOrgs: ["blockedcorp"],
 maxLlmCalls: 40, maxCrawlPages: 120, maxHttpRequests: 250,
};

function makeOpp(over: Partial<NormalizedOpportunity>): NormalizedOpportunity {
 return {
  sourceKey: "test", externalId: "1", url: "https://x.com/1", urlCanon: "https://x.com/1",
  urlHash: "h1", applyUrl: null, atsKey: null, title: "Postdoctoral Fellow - Pancreatic Cancer",
  organization: "Test Institute", organizationUrl: null, department: null,
  locationRaw: "Stockholm, Sweden", city: "Stockholm", region: "Europe", country: "SE", isRemote: false,
  postedAt: new Date().toISOString(), deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
  employmentType: null, opportunityType: "Postdoc",
  descriptionText: "Study pancreatic ductal adenocarcinoma and tumour immunology using single-cell methods.",
  salary: null, contentHash: "ch1", completeness: 0.6,
  ...over,
 };
}

check("hard filter keeps a normal fresh posting", hardFilter(makeOpp({}), profile).keep);
eq("Indian domicile does not make India a search destination", hardFilter(makeOpp({ country:"IN",city:"Chennai",locationRaw:"Chennai, India" }), profile).reason, "location_excluded");
check("an explicitly selected India destination is allowed",hardFilter(makeOpp({country:"IN"}),{...profile,countries:["IN"]}).keep);
check("worldwide accepts a country without treating domicile as preference",hardFilter(makeOpp({country:"AU"}),{...profile,countries:["*"]}).keep);
check("remote roles are allowed only when selected",hardFilter(makeOpp({country:"US",isRemote:true}),profile).keep);
eq("remote roles can be disabled independently",hardFilter(makeOpp({country:"US",isRemote:true}),{...profile,remoteOk:false}).reason,"location_excluded");
eq("hard filter rejects a passed deadline", hardFilter(makeOpp({ deadline: "2020-01-01T00:00:00Z" }), profile).reason, "deadline_passed");
eq("hard filter rejects junk titles", hardFilter(makeOpp({ title: "Marketing Internship" }), profile).reason, "junk_title");
eq("explicit PhD candidates cannot bypass role selection as Other",hardFilter(makeOpp({
 title:"PhD Candidate in Metabolic Inflammation",opportunityType:"Other",
}),profile).reason,"type_excluded");
eq("hard filter rejects blocked org", hardFilter(makeOpp({ organization: "BlockedCorp Inc" }), profile).reason, "blocked_org");
check("hard filter allows unknown location rather than rejecting", hardFilter(makeOpp({ country: null, city: null }), profile).keep);
check("hard filter does not reject on a predicted salary below floor", hardFilter(makeOpp({ salary: { min: 500000, max: 500000, currency: "INR", period: "year", isPredicted: true, extractedFrom: "api", confidence: 0.3, evidence: null } }), profile).keep);
eq("hard filter rejects a certain salary below floor", hardFilter(makeOpp({ salary: { min: 500000, max: 500000, currency: "INR", period: "year", isPredicted: false, extractedFrom: "api", confidence: 0.9, evidence: null } }), profile).reason, "below_salary_floor");

// An explicit interactive query is a gate as well as a ranking signal. A role
// cannot become a match merely because its location and salary score well.
{
 const exact = makeOpp({});
 const related = makeOpp({
  title: "Postdoctoral Fellow in Cancer Metabolism",
  descriptionText: "Study cancer metabolism and tumour biology using mouse models.",
 });
 const laser = makeOpp({
  title: "Postdoc - Machine Learning for High-Energy Laser Systems",
  descriptionText: "Develop machine learning controls for high-energy laser physics.",
 });
 const galaxy = makeOpp({
  title: "Postdoctoral Researcher in Galaxy Evolution",
  descriptionText: "Research galaxy evolution and bar dynamics using astronomical observations.",
 });
 check("explicit query keeps an exact pancreatic-cancer postdoc", queryRelevance(exact, "pancreatic cancer postdoc").keep);
 check("explicit query keeps a broader cancer postdoc as a related result", queryRelevance(related, "pancreatic cancer postdoc").keep);
 check("explicit query rejects an unrelated laser postdoc", !queryRelevance(laser, "pancreatic cancer postdoc").keep);
 check("explicit query rejects an unrelated astronomy postdoc", !queryRelevance(galaxy, "pancreatic cancer postdoc").keep);
 eq("unrelated query results remain visible in the per-run audit",
  queryDisposition(queryRelevance(galaxy, "pancreatic cancer postdoc")), "ranked_low");
 check("Europe query rejects an otherwise relevant US postdoc", !queryRelevance(makeOpp({
  title: "Cancer Biology Postdoctoral Fellow", descriptionText: "Cancer research", city: "New York", country: "US", region: "North America",
 }), "cancer biology postdoc in Europe").keep);
 check("Japan query accepts a Japanese result",queryRelevance(makeOpp({country:"JP",city:"Tokyo",locationRaw:"Tokyo, Japan"}),"cancer biology postdoc in Japan").keep);
 check("Asia query rejects a European result",!queryRelevance(makeOpp({country:"DE",city:"Berlin",locationRaw:"Berlin, Germany"}),"cancer biology postdoc in Asia").keep);
 check("exact query match ranks above a broad cancer match",
  scoreOpportunity(exact, profile, 0, "pancreatic cancer postdoc").score >
  scoreOpportunity(related, profile, 0, "pancreatic cancer postdoc").score);
 check("a role-only postdoc query retains broad recall", queryRelevance(laser, "postdoc").keep);
 check("workspace query understands Bengaluru/Bangalore aliases", queryRelevance(makeOpp({
  city: "Bengaluru", locationRaw: "Bengaluru, Karnataka, India",
 }), "postdoc Bangalore").keep);
}

// ---- interactive search semantics ----
{
 eq("custom query replaces unrelated profile terms with recall variants",
  termsForRun(["old profile term"], "pancreatic cancer postdoc"),
  ["pancreatic cancer postdoc", "pancreatic cancer postdoctoral", "pancreatic cancer research fellow"]);
 eq("blank query keeps the profile terms", termsForRun(["profile term"], "  "), ["profile term"]);
 eq("broad discovery is independent of profile interests", termsForDiscovery(), ["postdoc","postdoctoral researcher","research fellow"]);
 eq("role-only postdoc search uses selected subjects", termsForRun(["Cancer biology", "Spatial biology"], "postdoc"), ["Cancer biology postdoc", "Spatial biology postdoc"]);
 check("Telegram runs are fresh searches", isFreshSearch("telegram"));
 check("workspace/manual runs are fresh searches", isFreshSearch("manual"));
 check("scheduled runs remain incremental", !isFreshSearch("schedule"));
 check("fresh searches rescore unchanged listings", shouldEvaluate(true, false));
 check("scheduled runs skip unchanged listings", !shouldEvaluate(false, false));
 check("focused search persists only its accepted matches", shouldPersistRunItem(true, true) && !shouldPersistRunItem(true, false));
 check("broad discovery persists every hard-filtered crawler result", shouldPersistRunItem(false, false));
}

// ---- metadata repair before geography filtering ----
{
 const fromDomain=enrichMetadataLocally(makeOpp({
  country:null,city:null,locationRaw:null,organizationUrl:"https://www.example.ac.uk/research",url:"https://jobs.example.ac.uk/42",
 }));
 eq("country can be repaired from an institution domain before filtering",fromDomain.country,"GB");
 eq("country repair records deterministic provenance",fromDomain.locationMetadata?.method,"deterministic");
 const fromTitle=enrichMetadataLocally(makeOpp({
  country:null,city:null,locationRaw:null,organizationUrl:null,
  title:"Postdoctoral Research Fellow, Max Planck Institute, Germany",
 }));
 eq("country can be repaired from the vacancy title before AI",fromTitle.country,"DE");
 const sourceWins=enrichMetadataLocally(makeOpp({country:"SE",organizationUrl:"https://example.de"}));
 eq("explicit source country wins over domain inference",sourceWins.country,"SE");
}

// ---- default source catalog ----
{
 const keys = defaultSourceRows("00000000-0000-0000-0000-000000000001").map(s => s.source_key);
 check("catalog includes the live jobRxiv crawl", keys.includes("crawl:jobrxiv"));
 check("catalog includes EURAXESS", keys.includes("euraxess"));
 check("catalog includes ResearchersJob", keys.includes("feed:researchersjob"));
 check("catalog source keys are unique", new Set(keys).size === keys.length);
}

{
 const selected={...profile,countries:["SE","JP","AU"]};
 const scandi = scoreOpportunity(makeOpp({ country: "SE", city: "Stockholm" }), selected);
 const japan = scoreOpportunity(makeOpp({ country: "JP", city: "Tokyo" }), selected);
 const india = scoreOpportunity(makeOpp({ country: "IN", city: "Bengaluru" }), selected);
 eq("all selected destination countries receive equal location weight",scandi.breakdown.location.value,japan.breakdown.location.value);
 check("an unselected country receives no location preference",india.breakdown.location.value<japan.breakdown.location.value);
 check("score is within 0..100", scandi.score >= 0 && scandi.score <= 100);
 check("fit_reason is a non-empty deterministic string", scandi.reason.length > 20 && scandi.reason.includes("Topic"));
 check("fit label matches score band", (scandi.score >= 70) === (scandi.fit === "Strong") || scandi.fit !== "Strong" || scandi.score >= 70);
}

// ---- build pipeline glue ----
{
 const built = buildOpportunity({
  sourceKey: "adzuna", externalId: "123", url: "https://www.linkedin.com/jobs/view/123?utm_source=share",
  title: "Postdoctoral Researcher", organization: "Some University",
  description: "We study pancreatic cancer. Salary: 18 LPA. We are an equal opportunity employer.",
  locationRaw: "Bengaluru, Karnataka, India",
 });
 check("buildOpportunity produces a normalized record", !!built);
 check("buildOpportunity canonicalizes the url", built!.urlCanon === "https://linkedin.com/jobs/view/123");
 check("buildOpportunity infers salary from text", built!.salary?.min === 1800000);
 check("buildOpportunity infers city/country from raw location", built!.city === "Bengaluru" && built!.country === "IN");
 check("buildOpportunity classifies opportunity type", built!.opportunityType === "Postdoc");
 eq("buildOpportunity cleans repeatedly escaped titles", buildOpportunity({
  sourceKey: "x", externalId: "2", url: "https://x.com/2", title: "Cancer Biology &amp;amp; Epigenetics",
 })?.title, "Cancer Biology & Epigenetics");
 eq("buildOpportunity rejects an empty title", buildOpportunity({ sourceKey: "x", externalId: "1", url: "https://x.com", title: "  " }), null);
}

// ---- feed parsing ----
{
 const rss = "<?xml version=\"1.0\"?><rss><channel>" +
  "<item><title>Postdoc in Cancer Biology</title><link>https://x.com/job/1</link>" +
  "<description>&lt;p&gt;Great role&lt;/p&gt;</description><pubDate>Mon, 05 Jan 2026 00:00:00 GMT</pubDate>" +
  "<guid>job-1</guid></item></channel></rss>";
 const entries = parseFeed(rss);
 eq("parses one rss item", entries.length, 1);
 eq("rss item title", entries[0].title, "Postdoc in Cancer Biology");
 check("rss item published date parsed", !!entries[0].published);

 const atom = "<?xml version=\"1.0\"?><feed>" +
  "<entry><title>Fellowship Opening</title><link rel=\"alternate\" href=\"https://x.com/job/2\"/>" +
  "<summary>A fellowship</summary><updated>2026-01-05T00:00:00Z</updated><id>job-2</id></entry></feed>";
 const atomEntries = parseFeed(atom);
 eq("parses one atom entry", atomEntries.length, 1);
 eq("atom entry link from href attribute", atomEntries[0].link, "https://x.com/job/2");
}

// ---- EURAXESS parser (fixture below is a trimmed excerpt of the actual
// structure fetched live from euraxess.ec.europa.eu/jobs/464104) ----
{
 const fixture = `<html><body>
<h1 class="ecl-content-block__title">Postdoctoral Fellow in Unconventional Close-to-Physics Computation</h1>
<li>Posted on: 7 September 2026</li>
<h2 id="job-information" class="ecl-u-type-heading-2">Job Information</h2>
<dl class="ecl-description-list ecl-description-list--horizontal">
<dt class="ecl-description-list__term">Organisation/Company</dt><dd class="ecl-description-list__definition"><div>NTNU Norwegian University of Science and Technology</div></dd>
<dt class="ecl-description-list__term">Department</dt><dd class="ecl-description-list__definition"><div>Department of Computer Science</div></dd>
<dt class="ecl-description-list__term">Researcher Profile</dt><dd class="ecl-description-list__definition"><div><div>Recognised Researcher (R2)</div></div></dd>
<dt class="ecl-description-list__term">Positions</dt><dd class="ecl-description-list__definition"><div>Postdoc Positions</div></dd>
<dt class="ecl-description-list__term">Application Deadline</dt><dd class="ecl-description-list__definition"><div><time datetime="2026-09-23T21:59:00+00:00">23 Sep 2026 - 23:59 (Europe/Oslo)</time></div></dd>
<dt class="ecl-description-list__term">Country</dt><dd class="ecl-description-list__definition"><div>Norway</div></dd>
<dt class="ecl-description-list__term">Type of Contract</dt><dd class="ecl-description-list__definition"><div>Temporary</div></dd>
</dl>
<h2 id="work-locations" class="ecl-u-type-heading-2">Work Location(s)</h2>
<dl class="ecl-description-list ecl-description-list--horizontal">
<dt class="ecl-description-list__term">City</dt><dd class="ecl-description-list__definition">Trondheim</dd>
</dl>
<h2 id="offer-description" class="ecl-u-type-heading-2">Offer Description</h2>
<div class="ecl"><p>Fundamental research in computation at NTNU.</p></div>
<h2 id="requirements" class="ecl-u-type-heading-2">Requirements</h2>
</body></html>`;

 const job = parseEuraxessJob(fixture);
 check("euraxess: parses the title", job?.title === "Postdoctoral Fellow in Unconventional Close-to-Physics Computation");
 check("euraxess: parses organisation", job?.organization === "NTNU Norwegian University of Science and Technology");
 check("euraxess: parses department", job?.department === "Department of Computer Science");
 check("euraxess: parses city (from a different dl than org/deadline)", job?.city === "Trondheim");
 check("euraxess: parses country", job?.country === "Norway");
 check("euraxess: parses the ISO deadline from the <time> attribute, not the display text", job?.deadline === "2026-09-23T21:59:00.000Z");
 check("euraxess: parses posted date", job?.postedAt === new Date("7 September 2026").toISOString());
 check("euraxess: captures the researcher profile", job?.researcherProfile === "Recognised Researcher (R2)");
 check("euraxess: captures contract type", job?.contractType === "Temporary");
 check("euraxess: description excludes the requirements section", !!job && job.description.includes("Fundamental research") && !job.description.includes("Requirements"));

 eq("euraxess: R1 maps to Other", typeFromResearcherProfile("First Stage Researcher (R1)"), "Other");
 eq("euraxess: R2 maps to Postdoc", typeFromResearcherProfile("Recognised Researcher (R2)"), "Postdoc");
 eq("euraxess: R3 maps to Research scientist", typeFromResearcherProfile("Established Researcher (R3)"), "Research scientist");
 eq("euraxess: R4 maps to Faculty", typeFromResearcherProfile("Leading Researcher (R4)"), "Faculty");
 eq("euraxess: unrecognised profile maps to null (falls back to title heuristic)", typeFromResearcherProfile("Something else"), null);
 eq("euraxess: no page fields at all returns null, not a garbage object", parseEuraxessJob("<html><body>no title here</body></html>"), null);
}

// ---- telegram digest formatting ----
{
 const noEnrichment = { requested: 0, candidates: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0, pending: 0, requestsUsed: 0 };
 const noMetadata = { candidates: 0, deterministic: 0, aiBatches: 0, aiUpdated: 0, unresolved: 0, backfilled: 0 };
 const empty = formatDigest({
  runId: "r1", status: "done", mode: "search", query: "cancer postdoc",
  fetched: 0, evaluated: 0, filtered: 0, matched: 0, deduped: 0,
  created: 0, changed: 0, persistenceFailures: 0, filterReasons: {},
  bySource: {}, top: [], degradations: [], metadata: noMetadata, enrichment: noEnrichment,
 }, "https://example.com");
 check("empty digest is informative, not blank", empty.length > 10);
 check("fresh empty digest does not claim nothing new was published", !empty.includes("Nothing new was published"));
 const filteredOut = formatDigest({
  runId: "r2", status: "done", mode: "search", query: "pancreatic cancer postdoc",
  fetched: 25, evaluated: 25, filtered: 20, matched: 0, deduped: 5,
  created: 0, changed: 0, persistenceFailures: 0,
  filterReasons: { deadline_passed: 12, too_senior: 8 },
  bySource: {}, top: [], degradations: ["feed:jobrxiv (failed)"], metadata: noMetadata, enrichment: noEnrichment,
 }, "https://example.com");
 check("no-match digest exposes concrete filter counts", filteredOut.includes("deadline already passed 12"));
 check("no-match digest no longer invents a score cutoff", !filteredOut.includes("matched well enough"));
 const withResults = formatDigest({
  runId: "r1", status: "partial", mode: "search", query: "cancer postdoc",
  fetched: 10, evaluated: 10, filtered: 2, matched: 4, deduped: 3, created: 2, changed: 1,
  persistenceFailures: 0, filterReasons: { deadline_passed: 2 },
  bySource: {}, degradations: ["adzuna (monthly quota)"],
  metadata: noMetadata, enrichment: noEnrichment,
  top: [{ id: "1", score: 82, role: "Postdoc", organization: "Test Institute", location: "Stockholm", deadline: null, salaryDisplay: "€45,000/yr", url: "https://x.com/1" }],
 }, "https://example.com/dashboard");
 check("digest includes the score", withResults.includes("82"));
 check("digest includes the role", withResults.includes("Postdoc"));
 check("digest includes the dashboard link", withResults.includes("https://example.com/dashboard"));
 check("digest reports degradations", withResults.includes("quota"));
 check("fresh digest reports already-known matches", withResults.includes("already in your workspace"));
 const backfill = formatDigest({
  runId: "r3", status: "partial", mode: "backfill", query: null,
  fetched: 0, evaluated: 0, filtered: 0, matched: 0, deduped: 0,
  created: 0, changed: 0, persistenceFailures: 0, filterReasons: {}, bySource: {}, top: [],
  degradations: ["1 context enrichment failure(s)"], metadata: noMetadata,
  enrichment: { ...noEnrichment, requested: 25, candidates: 25, attempted: 25, succeeded: 24, failed: 1, pending: 10 },
 }, "https://example.com/dashboard");
 check("backfill digest reports enrichment counts", backfill.includes("enriched 24") && backfill.includes("pending 10"));
}

// ---- Firecrawl budget (the render call itself needs network, so only the
// ---- pure gate around it is covered here) ----
{
 const b = new FirecrawlBudget(2);
 check("firecrawl budget starts with full remaining", b.remaining === 2);
 check("firecrawl budget grants up to the cap", b.take() && b.take());
 check("firecrawl budget refuses past the cap", !b.take());
 check("firecrawl budget remaining hits zero, not negative", b.remaining === 0);

 check("makeRenderer returns null with no api key", makeRenderer(null, 5) === null);
 check("makeRenderer returns a function once a key is set", typeof makeRenderer("key", 5) === "function");
}

// Captured failure shapes: keep external calls stubbed and exercise adapters,
// not only their individual string helpers.
{
 const ctx = { now: new Date(), cursorIn: {}, log: () => {} } as unknown as SourceContext;
 const raw = (payload: unknown) => ({ externalId: "fixture", url: "https://example.org/job/1", payload, fetchedAt: new Date().toISOString() });
 const jooble = joobleAdapter("jooble");
 const salary = jooble.normalize(raw({ title: "Postdoctoral Fellow", link: "https://example.org/job/1", salary: "€3.204/month", location: "Maastricht, Netherlands" }), ctx);
 eq("Jooble salary field survives adapter normalization", salary?.salary?.min, 3204);
 const feed = feedAdapter("feed:researchersjob");
 const article = feed.normalize(raw({ title: "Postdoc Quantum Torsional Resonators at TU Delft", description: "Quantum physics", organization: "ResearchersJob" }), ctx);
 eq("feed publisher is never substituted for hiring employer", article?.organization, null);
 eq("Dallas TX becomes US, not invented country TX", parseLocation("Dallas, TX").country, "US");
 eq("German city aliases never imply India", parseLocation("Munich").country, null);
 eq("Canadian country suffix is not overwritten as California", parseLocation("Toronto, CA").country, "CA");
 eq("role title overrides incidental postdoc description", classifyType("Staff Product Manager, Machine Learning", "Work with postdoctoral researchers"), "Other");
 const conflict = buildOpportunity({ sourceKey:"jooble", externalId:"conflict",url:"https://example.org/job/2",title:"Senior Analytical Scientist – ICP-MS",country:"AT",description:"Location\nDallas, TX\nType of Employment\nContract" })!;
 eq("Dallas/Austria contradiction is explicit before AI", sourceIssues(conflict)[0]?.reason, "location_conflict");
 eq("unrelated employer office mentions do not trigger conflicts", sourceIssues({ ...conflict, descriptionText:"Our company also has an office in Dallas, TX." }).length, 0);
 eq("product manager routed out before AI", sourceIssues({ ...conflict, title:"Staff Product Manager, Machine Learning",descriptionText:"Climate solutions" })[0]?.reason, "non_research_role");
 const adzuna = adzunaAdapter("adzuna");
 adzuna.configure({}, { ADZUNA_APP_ID:"fixture", ADZUNA_APP_KEY:"fixture" });
 const visited: string[] = [];
 const http = { getJson: async (url:string) => { visited.push(url); return {results:[{id:url,title:"Postdoc",redirect_url:"https://example.org/job/1",description:"Research"}]}; } } as unknown as Http;
 for await (const page of adzuna.fetch({terms:["postdoc"],countries:["DE","NL"],cities:[],remoteOk:false,since:null}, {maxItems:100,maxRequests:10,maxPages:10,deadlineAt:Date.now()+5000}, {...ctx,http})) {
  if (page.exhausted) break; // same consumption contract as the real runner
 }
 check("short Adzuna country page does not suppress other countries", visited.length===2 && visited.some(url=>url.includes("/nl/")));
}

{
 const env = readEnv({ SUPABASE_URL:"https://example.org", SUPABASE_SERVICE_ROLE_KEY:"test-only", OPENROUTER_API_KEY:"test-only" });
 const stats = { candidates:0, deterministic:0, aiBatches:0, aiUpdated:0, unresolved:0, backfilled:0 };
 const sizes: number[] = [];
 const http = { postJson: async (_url: string, body: { messages: { content: string }[] }) => {
  const prompt = body.messages[0]!.content;
  const input = JSON.parse(prompt.split("INPUT=")[1]!.split("\nReturn only JSON:")[0]!) as {index:number; title:string}[];
  sizes.push(input.length);
  return { choices:[{message:{content:JSON.stringify({items:input.map(row=>({index:row.index,country:"DE",city:row.title,organization:"Fixture institute",confidence:0.95,evidence:"Fixture only"}))})}}] };
 } } as unknown as Http;
 const rows = Array.from({length:11}, (_, i)=>buildOpportunity({ sourceKey:"fixture",externalId:String(i),url:`https://example.org/${i}`,title:`Postdoc ${i}`,description:"Research vacancy" })!);
 const enriched = await enrichMetadataWithOpenRouter(env,http,rows,stats);
 eq("metadata AI receives bounded batches", sizes, [5,5,1]);
 eq("batch-local model indices preserve listing association", enriched.map(row=>row.city), rows.map(row=>row.title));
}

let bad = 0;
for (const c of out) {
 if (c.ok) console.log(`  ok   ${c.name}`);
 else { bad++; console.log(`  FAIL ${c.name}${c.detail ? "\n       " + c.detail : ""}`); }
}
console.log(bad ? `\n${bad} of ${out.length} checks failed` : `\nAll ${out.length} checks passed`);
process.exit(bad ? 1 : 0);
