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

 const wanted = topicTokens(requested);
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

 const topicOk = wanted.length === 0 || lexicalHits.length > 0 || conceptHits.length > 0;
 if (!roleOk || !topicOk) {
  return {
   keep: false, value: 0,
   hits: [...lexicalHits, ...conceptHits.map(id => `concept:${id}`)],
   labels: conceptLabels,
   note: !roleOk ? `requested ${role!.label} role not found` : "no query topic overlap",
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

 const coverage = lexicalHits.length / wanted.length;
 const titleCoverage = titleHits.length / wanted.length;
 const topicPhrase = normalize(requested.replace(POSTDOC, " "));
 const phraseHit = topicPhrase.length > 3 && normalize(`${o.title} ${o.descriptionText}`).includes(topicPhrase);
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
