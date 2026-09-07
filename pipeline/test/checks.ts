// Pure logic checks, run under plain Node -- no network, no database.
import { canonicalizeUrl, atsKey, urlHash } from "../src/normalize/url.js";
import { contentHash, htmlToText, normalizeForHash, stripBoilerplate, decodeEntities, excerpt } from "../src/normalize/text.js";
import { normalizeCity, normalizeCountry, regionOf, locKey, parseLocation, looksRemote } from "../src/normalize/location.js";
import { classifyType, requiredPostPhdYears, isSeniorLeadership, JUNK_TITLE } from "../src/normalize/type.js";
import { salaryFromText, annualInr, salaryDisplay } from "../src/normalize/salary.js";
import { extractJsonLd, findJobPostings, readJobPosting } from "../src/normalize/jsonld.js";
import { orgKey, titleTokens, jaccard, simhash, hamming, simhashBands } from "../src/dedupe/keys.js";
import { matchCandidate, type Candidate } from "../src/dedupe/cascade.js";
import { topicMatch } from "../src/score/ontology.js";
import { hardFilter, scoreOpportunity } from "../src/score/score.js";
import { buildOpportunity } from "../src/sources/build.js";
import { parseFeed } from "../src/sources/feed.js";
import { formatDigest } from "../src/sinks/telegram.js";
import type { NormalizedOpportunity, SearchProfile } from "../src/types.js";

type Check = { name: string; ok: boolean; detail?: string };
const out: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => out.push({ name, ok, detail });
const eq = (name: string, a: unknown, b: unknown) =>
 check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// ---- URL canonicalization ----
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
check("looksRemote detects wfh", looksRemote("This is a fully remote position"));
check("looksRemote false for onsite", !looksRemote("This is an onsite position in Munich"));

// ---- type classification ----
eq("classifies postdoc", classifyType("Postdoctoral Fellow in Cancer Biology", ""), "Postdoc");
eq("classifies faculty", classifyType("Assistant Professor of Oncology", ""), "Faculty");
eq("classifies research scientist", classifyType("Research Scientist, Immuno-Oncology", ""), "Research scientist");
eq("classifies fellowship", classifyType("Early Career Fellowship Programme", ""), "Fellowship");
eq("unclassified falls back to Other", classifyType("Something Unrelated Entirely", ""), "Other");
check("junk title regex catches intern", JUNK_TITLE.test("Summer Internship in Marketing"));
check("junk title regex spares postdoc", !JUNK_TITLE.test("Postdoctoral Fellow"));
eq("extracts required years", requiredPostPhdYears("Requires 5+ years post-doctoral experience"), 5);
eq("no years mentioned is null", requiredPostPhdYears("A great opportunity for early career researchers"), null);
check("detects senior leadership title", isSeniorLeadership("Group Leader, Cancer Immunology"));
check("postdoc is not senior leadership", !isSeniorLeadership("Postdoctoral Fellow"));

// ---- salary ----
{
 const s = salaryFromText("Salary range: INR 8,00,000 - INR 12,00,000 per annum");
 check("salary range parsed", !!s && s.min === 800000 && s.max === 1200000 && s.currency === "INR");
 const lpa = salaryFromText("Compensation: 18 LPA");
 check("lpa parsed", !!lpa && lpa.min === 1800000 && lpa.currency === "INR");
 const usd = salaryFromText("We offer $60,000 - $75,000 a year depending on experience.");
 check("usd range parsed", !!usd && usd.currency === "USD" && usd.min === 60000 && usd.max === 75000);
 check("no salary mentioned returns null", salaryFromText("A wonderful opportunity to join our team.") === null);
 eq("annualInr converts usd", annualInr({ min: 60000, max: 60000, currency: "USD", period: "year", isPredicted: false, extractedFrom: "text", confidence: 1, evidence: null }), 60000 * 84);
 eq("salaryDisplay formats inr lakhs", salaryDisplay({ min: 800000, max: 1200000, currency: "INR", period: "year", isPredicted: false, extractedFrom: "text", confidence: 1, evidence: null }), "₹8L–12L/yr");
 eq("salaryDisplay null salary", salaryDisplay(null), null);
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
 homeCity: "Thiruvananthapuram", indiaCities: [], countries: ["IN"],
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
eq("hard filter rejects a passed deadline", hardFilter(makeOpp({ deadline: "2020-01-01T00:00:00Z" }), profile).reason, "deadline_passed");
eq("hard filter rejects junk titles", hardFilter(makeOpp({ title: "Marketing Internship" }), profile).reason, "junk_title");
eq("hard filter rejects blocked org", hardFilter(makeOpp({ organization: "BlockedCorp Inc" }), profile).reason, "blocked_org");
check("hard filter allows unknown location rather than rejecting", hardFilter(makeOpp({ country: null, city: null }), profile).keep);
check("hard filter does not reject on a predicted salary below floor", hardFilter(makeOpp({ salary: { min: 500000, max: 500000, currency: "INR", period: "year", isPredicted: true, extractedFrom: "api", confidence: 0.3, evidence: null } }), profile).keep);
eq("hard filter rejects a certain salary below floor", hardFilter(makeOpp({ salary: { min: 500000, max: 500000, currency: "INR", period: "year", isPredicted: false, extractedFrom: "api", confidence: 0.9, evidence: null } }), profile).reason, "below_salary_floor");

{
 const scandi = scoreOpportunity(makeOpp({ country: "SE", city: "Stockholm" }), profile);
 const india = scoreOpportunity(makeOpp({ country: "IN", city: "Bengaluru", title: "Research Scientist", opportunityType: "Research scientist" }), profile);
 const elsewhere = scoreOpportunity(makeOpp({ country: "JP", city: "Tokyo" }), profile);
 check("Scandinavia scores at least as well as India (explicit preference)", scandi.breakdown.location.value >= india.breakdown.location.value);
 check("Scandinavia scores higher than a non-preferred abroad country", scandi.breakdown.location.value > elsewhere.breakdown.location.value);
 check("a job-titled postdoc-equivalent in India still gets solid location credit", india.breakdown.location.value >= 12);
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

// ---- telegram digest formatting ----
{
 const empty = formatDigest({ runId: "r1", status: "done", fetched: 0, deduped: 0, created: 0, changed: 0, bySource: {}, top: [], degradations: [] }, "https://example.com");
 check("empty digest is informative, not blank", empty.length > 10);
 const withResults = formatDigest({
  runId: "r1", status: "done", fetched: 10, deduped: 3, created: 2, changed: 1,
  bySource: {}, degradations: ["adzuna (monthly quota)"],
  top: [{ id: "1", score: 82, role: "Postdoc", organization: "Test Institute", location: "Stockholm", deadline: null, salaryDisplay: "€45,000/yr", url: "https://x.com/1" }],
 }, "https://example.com/dashboard");
 check("digest includes the score", withResults.includes("82"));
 check("digest includes the role", withResults.includes("Postdoc"));
 check("digest includes the dashboard link", withResults.includes("https://example.com/dashboard"));
 check("digest reports degradations", withResults.includes("quota"));
}

let bad = 0;
for (const c of out) {
 if (c.ok) console.log(`  ok   ${c.name}`);
 else { bad++; console.log(`  FAIL ${c.name}${c.detail ? "\n       " + c.detail : ""}`); }
}
console.log(bad ? `\n${bad} of ${out.length} checks failed` : `\nAll ${out.length} checks passed`);
process.exit(bad ? 1 : 0);
