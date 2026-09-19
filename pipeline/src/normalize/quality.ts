import type { NormalizedOpportunity } from "../types.js";
import { parseLocation } from "./location.js";

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
 if (/\b(product|account|sales) manager\b/i.test(o.title)) {
  issues.push({ field: "opportunityType", reason: "non_research_role", evidence: o.title });
 }
 return issues;
}
