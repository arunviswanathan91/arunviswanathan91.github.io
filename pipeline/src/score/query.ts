import { topicMatch } from "./ontology.js";
import type { NormalizedOpportunity, OpportunityKind } from "../types.js";

const STOP_WORDS = new Set([
 "a", "an", "and", "at", "based", "for", "from", "in", "of", "on", "or", "the", "to", "with",
 "job", "jobs", "opening", "openings", "opportunity", "opportunities", "position", "positions", "role", "roles",
 "postdoc", "postdoctoral", "doctoral", "fellow", "fellowship", "research", "researcher", "scientist",
]);

const POSTDOC = /\b(post[ -]?doc(?:toral)?|research fellow(?:ship)?)\b/i;
const STAFF_SCIENTIST = /\bstaff scientist\b/i;
const RESEARCH_SCIENTIST = /\bresearch scientist\b/i;
const INDUSTRY = /\b(industry|industrial|r\s*&\s*d)\b/i;
const FACULTY = /\b(faculty|professor|lecturer)\b/i;
const FELLOWSHIP = /\bfellowship\b/i;
const SCANDINAVIA = new Set(["SE","NO","DK","FI","IS"]);
// The EEA/UK/CH set research postdocs actually get advertised in -- the
// earlier 17-country list silently dropped Greece, Hungary, Romania and
// several others, so "in europe" excluded real European listings on
// location alone before the topic words were ever checked.
const EUROPE = new Set([
 "DE","NL","SE","CH","GB","FR","BE","DK","NO","FI","AT","IE","ES","IT","PT","PL","CZ",
 "GR","HU","RO","BG","HR","SI","SK","LU","IS","EE","LV","LT","MT","CY",
]);
const ASIA = new Set(["JP","CN","KR","HK","TW","SG","MY","TH","IN"]);
/** Phrases handled by roleIntent/locationIntent as their own structured
 *  signal. Stripped before extracting topic words so they don't also have
 *  to appear verbatim for lexical coverage -- "post doc" (two words,
 *  neither of which is the stopword "postdoc") used to survive into the
 *  topic-word list as two unmatchable tokens, and "europe" already has a
 *  dedicated, more accurate country-code check below. */
const LOCATION_PHRASES = [
 /\b(scandinavia|scandinavian|nordic)\b/i, /\beurope(an)?\b/i, /\b(india|indian)\b/i,
 /\b(usa|united states|america|american)\b/i, /\b(canada|canadian)\b/i, /\b(japan|japanese)\b/i,
 /\b(china|chinese)\b/i, /\basian?\b/i, /\baustralia(n)?\b/i, /\bnew zealand\b/i,
 /\bkerala\b/i, /\b(bangalore|bengaluru)\b/i, /\bremote\b/i,
];
const ROLE_PHRASES = [POSTDOC, STAFF_SCIENTIST, RESEARCH_SCIENTIST, INDUSTRY, FACULTY, FELLOWSHIP];
const stripIntentPhrases = (value: string) =>
 [...ROLE_PHRASES, ...LOCATION_PHRASES].reduce((acc, re) => acc.replace(re, " "), value);

const normalize = (value: string) => value
 .normalize("NFKD")
 .replace(/[\u0300-\u036f]/g, "")
 .toLowerCase()
 .replace(/tumours?/g, "tumor")
 .replace(/\bbengaluru\b/g, "bangalore")
 .replace(/\btrivandrum\b/g, "thiruvananthapuram")
 .replace(/\bcochin\b/g, "kochi")
 .replace(/[^a-z0-9]+/g, " ")
 .trim();

const token = (value: string) => {
 if (value.length > 4 && value.endsWith("ies")) return value.slice(0, -3) + "y";
 if (value.length > 4 && value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
 return value;
};

const tokens = (value: string) => normalize(value).split(/\s+/).filter(Boolean).map(token);
const topicTokens = (value: string) => [...new Set(tokens(value).filter(t => !STOP_WORDS.has(t)))];

function locationIntent(query: string, o: NormalizedOpportunity): {matches:boolean;label:string} {
 const q=normalize(query),city=normalize(o.city??"");
 if (/\b(scandinavia|scandinavian|nordic)\b/.test(q)) return {matches:!!o.country&&SCANDINAVIA.has(o.country),label:"Scandinavia"};
 if (/\beurope(an)?\b/.test(q)) return {matches:!!o.country&&EUROPE.has(o.country),label:"Europe"};
 if (/\b(india|indian)\b/.test(q)) return {matches:o.country==="IN",label:"India"};
 if (/\b(usa|united states|america|american)\b/.test(q)) return {matches:o.country==="US",label:"United States"};
 if (/\b(canada|canadian)\b/.test(q)) return {matches:o.country==="CA",label:"Canada"};
 if (/\b(japan|japanese)\b/.test(q)) return {matches:o.country==="JP",label:"Japan"};
 if (/\b(china|chinese)\b/.test(q)) return {matches:o.country==="CN",label:"China"};
 if (/\basian?\b/.test(q)) return {matches:!!o.country&&ASIA.has(o.country),label:"Asia"};
 if (/\baustralia(n)?\b/.test(q)) return {matches:o.country==="AU",label:"Australia"};
 if (/\bnew zealand\b/.test(q)) return {matches:o.country==="NZ",label:"New Zealand"};
 if (/\bkerala\b/.test(q)) return {matches:o.region==="Kerala",label:"Kerala"};
 if (/\b(bangalore|bengaluru)\b/.test(q)) return {matches:city==="bangalore"||o.region==="Bengaluru",label:"Bengaluru"};
 if (/\bremote\b/.test(q)) return {matches:o.isRemote,label:"remote"};
 return {matches:true,label:""};
}

function roleIntent(query: string): { label: string; allowed: OpportunityKind[] } | null {
 if (POSTDOC.test(query)) return { label: "postdoc", allowed: ["Postdoc", "Fellowship"] };
 if (STAFF_SCIENTIST.test(query)) return { label: "staff scientist", allowed: ["Staff scientist"] };
 if (RESEARCH_SCIENTIST.test(query)) return { label: "research scientist", allowed: ["Research scientist", "Staff scientist", "Industry R&D"] };
 if (INDUSTRY.test(query)) return { label: "industry R&D", allowed: ["Industry R&D"] };
 if (FACULTY.test(query)) return { label: "faculty", allowed: ["Faculty"] };
 if (FELLOWSHIP.test(query)) return { label: "fellowship", allowed: ["Fellowship", "Postdoc"] };
 return null;
}

export interface QueryRelevance {
 keep: boolean;
 value: number;
 hits: string[];
 labels: string[];
 note: string;
}

/** A focused query classifies presentation priority only. Source discovery is
 * never destroyed because a lexical/ontology matcher lacked overlap. */
export const queryDisposition = (relevance: QueryRelevance): "accepted" | "ranked_low" =>
 relevance.keep ? "accepted" : "ranked_low";

/**
 * Makes an explicit interactive query authoritative. The ontology supplies
 * scientific synonyms (for example PDAC -> pancreatic cancer), while lexical
 * overlap keeps this useful for arbitrary fields, institutions and places.
 * No model call is needed and unrelated results cannot score their way in on
 * location or salary alone.
 */
export function queryRelevance(o: NormalizedOpportunity, query: string | null | undefined): QueryRelevance {
 const requested = query?.trim() ?? "";
 const listingTopic = topicMatch(o.title, o.descriptionText);
 if (!requested) {
  const value = Math.round(45 * (1 - Math.exp(-listingTopic.raw / 2.5)));
  return { keep: true, value, hits: listingTopic.hits, labels: listingTopic.labels, note: "profile topics" };
 }

 const role = roleIntent(requested);
 const roleOk = !role || role.allowed.includes(o.opportunityType) ||
  (role.label === "postdoc" && POSTDOC.test(`${o.title} ${o.descriptionText.slice(0, 2500)}`));
 const location=locationIntent(requested,o);

 const wanted = topicTokens(stripIntentPhrases(requested));
 const title = new Set(tokens(o.title));
 const document = new Set(tokens([
 o.title, o.descriptionText, o.organization ?? "", o.locationRaw ?? "",
  o.region ?? "",
 ].join(" ")));
 const lexicalHits = wanted.filter(t => document.has(t));
 const titleHits = wanted.filter(t => title.has(t));

 const queryConcepts = topicMatch(requested, requested);
 const listingConcepts = new Set(listingTopic.hits);
 const conceptHits = queryConcepts.hits.filter(id => listingConcepts.has(id));
 const conceptLabels = queryConcepts.hits
  .map((id, i) => conceptHits.includes(id) ? queryConcepts.labels[i] : null)
  .filter((v): v is string => !!v);

 // A single overlapping word (or the catch-all "broad" concept, which fires
 // on bare words like "cancer"/"oncology") used to be enough to keep a
 // listing regardless of the rest of the query -- that's what made searches
 // like "pancreatic cancer postdoc Bangalore" return anything oncology-
 // adjacent. Require either majority lexical coverage of the query, a
 // specific (non-"broad") ontology concept match, or the query appearing as
 // a literal phrase (an unambiguous signal on its own, so it's checked
 // before -- not instead of -- the coverage bar).
 //
 // "cancer post doc in europe" (typed with "post doc" as two words) is why
 // this needed stripIntentPhrases rather than a looser coverage number:
 // "post"/"doc" individually aren't the stopword "postdoc", so they used to
 // survive into `wanted` as two tokens that can never realistically appear
 // verbatim in listing text (real postings say "postdoctoral"), and
 // "europe" was requiring both a country-code match AND its own literal
 // lexical hit. With 4 "topic" words but 2 of them structurally unmatchable,
 // >50% coverage was nearly impossible to clear regardless of the actual
 // topic overlap. Stripping role/location phrases before tokenizing (they're
 // already checked, more accurately, by roleIntent/locationIntent) fixes
 // that at the source instead of loosening the bar for every query.
 const specificConceptHits = conceptHits.filter(id => id !== "broad");
 const topicPhrase = normalize(stripIntentPhrases(requested));
 const phraseHit = topicPhrase.length > 3 && normalize(`${o.title} ${o.descriptionText}`).includes(topicPhrase);
 const coverage = wanted.length ? lexicalHits.length / wanted.length : 1;
 const topicOk = wanted.length === 0 || coverage > 0.5 || specificConceptHits.length > 0 || phraseHit;
 if (!roleOk || !topicOk || !location.matches) {
  return {
   keep: false, value: 0,
   hits: [...lexicalHits, ...conceptHits.map(id => `concept:${id}`)],
   labels: conceptLabels,
   note: !roleOk ? `requested ${role!.label} role not found` : !location.matches ? `outside requested ${location.label}` : "no query topic overlap",
  };
 }

 // A role-only query (for example just "postdoc") still ranks the accepted
 // roles against the owner's research profile through the existing ontology.
 if (!wanted.length) {
  const value = Math.round(45 * (1 - Math.exp(-listingTopic.raw / 2.5)));
  return {
   keep: true, value, hits: listingTopic.hits,
   labels: listingTopic.labels, note: role ? `${role.label}; profile-topic ranking` : "profile topics",
  };
 }

 const titleCoverage = titleHits.length / wanted.length;
 const value = Math.min(45, Math.round(
  10 + 18 * coverage + 8 * titleCoverage + Math.min(9, conceptHits.length * 5) + (phraseHit ? 5 : 0),
 ));
 const labels = [...new Set([...conceptLabels, ...lexicalHits])];
 return {
  keep: true, value,
  hits: [...lexicalHits, ...conceptHits.map(id => `concept:${id}`)],
  labels,
  note: labels.length ? labels.slice(0, 4).join(", ") : "query overlap",
 };
}
