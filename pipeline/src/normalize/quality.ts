import type { NormalizedOpportunity } from "../types.js";
import { parseLocation } from "./location.js";

/** General-purpose job search engines, as opposed to academic job boards. */
const AGGREGATORS = new Set(["jooble", "adzuna"]);
const RESEARCH_SIGNAL = /post-?\s?doc|research|scien(ce|tist|tific)|fellow|ph\.?\s?d|doctora|laborator|investigator|professor|lecturer|universit|institut|academ|biolog|chemi|physic|genom|bioinformat|data\s+analy|engineer/i;

export interface SourceIssue { field: string; reason: string; evidence: string }

/** Only explicit labelled workplace text is used: an employer biography may
 * mention offices elsewhere without contradicting the vacancy's location. */
export function sourceIssues(o: NormalizedOpportunity): SourceIssue[] {
 const issues: SourceIssue[] = [];
 const labelled = o.descriptionText.match(/(?:^|\n)\s*(?:job |work )?location\s*:?\s*\n?([^\n]+)/i)?.[1]?.trim();
 const stated = labelled ? parseLocation(labelled) : null;
 if (stated?.country && o.country && stated.country !== o.country) {
  issues.push({ field: "country", reason: "location_conflict", evidence: `${o.country} conflicts with Location: ${labelled}` });
 }
 if (/\b(product|account|sales|marketing|production|project|office|store|operations) manager\b/i.test(o.title)) {
  issues.push({ field: "opportunityType", reason: "non_research_role", evidence: o.title });
 } else if (AGGREGATORS.has(o.sourceKey) && !RESEARCH_SIGNAL.test(`${o.title}\n${o.descriptionText.slice(0, 1500)}`)) {
  // General job search engines match "fellow" or "research" loosely and return
  // dental coordinators and recruiters. Academic boards are trusted as they are.
  issues.push({ field: "opportunityType", reason: "non_research_role", evidence: o.title });
 }
 return issues;
}
