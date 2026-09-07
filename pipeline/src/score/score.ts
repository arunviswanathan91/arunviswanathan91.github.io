import { topicMatch } from "./ontology.js";
import { annualInr } from "../normalize/salary.js";
import { isKerala, isMetro, normalizeCity } from "../normalize/location.js";
import { isSeniorLeadership, JUNK_TITLE, requiredPostPhdYears } from "../normalize/type.js";
import type { NormalizedOpportunity, Scored, SearchProfile } from "../types.js";

const ABROAD_ALLOW = new Set(["DE","NL","SE","CH","GB","US","SG","AU","CA","FR","BE","DK","NO","FI","AT","IE","JP"]);

export interface FilterVerdict { keep: boolean; reason?: string }

/**
 * Deterministic gate, run before anything expensive. Everything here is a fact
 * about the posting, never a judgement about relevance.
 */
export function hardFilter(o: NormalizedOpportunity, p: SearchProfile): FilterVerdict {
 if (o.deadline) {
  const d = new Date(o.deadline).getTime();
  if (!isNaN(d) && d < Date.now() - 86400000) return { keep: false, reason: "deadline_passed" };
 }
 if (JUNK_TITLE.test(o.title)) return { keep: false, reason: "junk_title" };
 if (!p.types.includes(o.opportunityType) && o.opportunityType !== "Other") {
  return { keep: false, reason: "type_excluded" };
 }
 if (o.opportunityType === "Faculty" && !p.facultyOk) return { keep: false, reason: "faculty_excluded" };

 const locationOk =
  o.isRemote ||
  (o.country === "IN") ||
  (o.country !== null && (p.countries.includes(o.country) || ABROAD_ALLOW.has(o.country))) ||
  o.country === null;                       // unknown location is not a rejection
 if (!locationOk) return { keep: false, reason: "location_excluded" };

 const years = requiredPostPhdYears(o.descriptionText);
 if (years !== null && years > p.yearsExperience + 3) return { keep: false, reason: "too_senior" };
 if (isSeniorLeadership(o.title) && !p.facultyOk) return { keep: false, reason: "leadership_role" };

 // A salary only ever rejects when it is certain. Academic posts routinely omit
 // pay, and a predicted figure is not evidence of anything.
 if (p.rejectBelowFloor && p.salaryFloorInr && o.salary && !o.salary.isPredicted) {
  const annual = annualInr(o.salary);
  if (annual !== null && annual < p.salaryFloorInr) return { keep: false, reason: "below_salary_floor" };
 }

 const org = (o.organization ?? "").toLowerCase();
 if (p.blockedOrgs.some(b => b && org.includes(b.toLowerCase()))) {
  return { keep: false, reason: "blocked_org" };
 }
 return { keep: true };
}

const ROLE_POINTS: Record<string, number> = {
 "Postdoc": 20, "Research scientist": 18, "Industry R&D": 16, "Fellowship": 15,
 "Staff scientist": 12, "Other": 8, "Faculty": 6,
};

const SCANDINAVIA = new Set(["SE", "NO", "DK", "FI"]);
const EUROPE_PREFERRED = new Set(["DE", "NL", "CH", "GB", "FR", "BE", "AT", "IE"]);

/**
 * Scored by location alone, not by opportunity type: a genuine postdoc in
 * Europe is frequently advertised under a plain "job"/"scientist" title, so
 * gating on the (unreliable) type classification would miss exactly the
 * postings this is meant to surface. Scandinavia is weighted highest per an
 * explicit preference; India is scored well across the board since a role
 * there is visa-free, while a Scandinavian/European posting is the one
 * worth crossing a border for.
 */
function locationScore(o: NormalizedOpportunity, p: SearchProfile): { value: number; note: string } {
 const city = normalizeCity(o.city);
 const home = normalizeCity(p.homeCity);

 if (o.country && SCANDINAVIA.has(o.country)) return { value: 15, note: o.locationRaw ?? o.country };
 if (city && home && city === home) return { value: 14, note: o.city! };
 if (isKerala(o.city)) return { value: 14, note: o.city! };
 if (o.country && EUROPE_PREFERRED.has(o.country)) return { value: 13, note: o.locationRaw ?? o.country };
 if (o.country === "IN") return { value: 13, note: o.locationRaw ?? "India" };
 if (o.isRemote) return { value: 12, note: "remote" };
 if (isMetro(o.city)) return { value: 12, note: o.city! };
 if (o.country && p.countries.includes(o.country)) return { value: 9, note: o.locationRaw ?? o.country };
 if (o.country) return { value: 6, note: o.locationRaw ?? o.country };
 return { value: 6, note: "location not stated" };
}

function compensationScore(o: NormalizedOpportunity, p: SearchProfile): { value: number; note: string } {
 if (!o.salary) return { value: 4, note: "not stated" };
 const annual = annualInr(o.salary);
 if (annual === null) return { value: 4, note: "not comparable" };
 const floor = p.salaryFloorInr;
 if (!floor) return { value: o.salary.isPredicted ? 5 : 7, note: o.salary.isPredicted ? "estimated" : "stated" };
 if (o.salary.isPredicted) return { value: annual >= floor ? 5 : 3, note: "estimated" };
 if (annual >= floor * 1.5) return { value: 10, note: "well above target" };
 if (annual >= floor) return { value: 7, note: "meets target" };
 if (annual >= floor * 0.85) return { value: 2, note: "slightly below target" };
 return { value: 0, note: "below target" };
}

function recencyScore(o: NormalizedOpportunity): { value: number; note: string } {
 let value = 0;
 const notes: string[] = [];
 if (o.postedAt) {
  const days = (Date.now() - new Date(o.postedAt).getTime()) / 86400000;
  if (days <= 7) { value += 6; notes.push(`posted ${Math.max(0, Math.round(days))}d ago`); }
  else if (days <= 21) { value += 4; notes.push("posted this month"); }
  else if (days <= 45) { value += 2; notes.push("posted recently"); }
 }
 if (o.deadline) {
  const days = (new Date(o.deadline).getTime() - Date.now()) / 86400000;
  if (days >= 8 && days <= 45) { value += 4; notes.push("deadline comfortable"); }
  else if (days >= 3) { value += 2; notes.push("deadline soon"); }
  else if (days >= 0) { value += 1; notes.push("closing imminently"); }
 } else value += 1;
 return { value: Math.min(value, 10), note: notes.join(", ") || "no dates" };
}

const NON_ENGLISH = /\b(wir suchen|stellenangebot|arbeitgeber|mitarbeiter|forschungsgruppe|nous recherchons|offre d'emploi)\b/i;

export function scoreOpportunity(
 o: NormalizedOpportunity,
 p: SearchProfile,
 feedbackBias = 0,
): Scored {
 const topic = topicMatch(o.title, o.descriptionText);
 const topicValue = Math.round(45 * (1 - Math.exp(-topic.raw / 2.5)));

 const roleValue = ROLE_POINTS[o.opportunityType] ?? 8;
 const loc = locationScore(o, p);
 const comp = compensationScore(o, p);
 const rec = recencyScore(o);
 const languagePenalty = NON_ENGLISH.test(o.descriptionText.slice(0, 3000)) ? -6 : 0;

 const breakdown = {
  topic: { value: topicValue, hits: topic.hits },
  role_fit: { value: roleValue, note: o.opportunityType.toLowerCase() },
  location: { value: loc.value + languagePenalty, note: loc.note + (languagePenalty ? ", non-English posting" : "") },
  compensation: { value: comp.value, note: comp.note },
  recency: { value: rec.value, note: rec.note },
  feedback: { value: feedbackBias, note: feedbackBias ? "learned from your triage" : "" },
 };

 const total = topicValue + roleValue + breakdown.location.value + comp.value + rec.value + feedbackBias;
 const score = Math.max(0, Math.min(100, Math.round(total)));
 const fit = score >= 70 ? "Strong" : score >= 50 ? "Good" : score >= 30 ? "Maybe" : "Weak";

 // Deterministic and always available. An LLM blurb could invent a requirement
 // the posting never made, which is worse than no explanation at all.
 const parts = [
  `Topic ${topicValue}/45${topic.labels.length ? ` (${topic.labels.slice(0, 3).join(", ")})` : " (no overlap found)"}`,
  `Role ${roleValue}/20 ${o.opportunityType.toLowerCase()}`,
  `Location ${breakdown.location.value}/15 ${loc.note}`,
  `Salary ${comp.value}/10 ${comp.note}`,
  `Recency ${rec.value}/10 ${rec.note}`,
 ];
 if (feedbackBias) parts.push(`Your triage ${feedbackBias > 0 ? "+" : ""}${feedbackBias}`);

 return { score, fit, breakdown, reason: parts.join(" · ") };
}
