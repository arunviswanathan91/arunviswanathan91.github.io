import type { OpportunityKind } from "../types.js";

/** Titles that are never worth surfacing for a PhD-level search. */
export const JUNK_TITLE =
 /\b(intern(ship)?|trainee|apprentice|summer (student|school)|master'?s? (thesis|student)|bachelor|b\.?tech project|lab (assistant|technician)|data entry|field (worker|officer)|sales executive|business development|customer support|delivery)\b/i;

const RULES: [RegExp, OpportunityKind][] = [
 [/\b(post[- ]?doc(toral)?|postdoctoral (fellow|researcher|associate|scientist)|pdra?)\b/i, "Postdoc"],
 [/\b(phd|doctoral (student|candidate)|research scholar|jrf|srf)\b/i, "Other"],
 [/\b(professor|group leader|principal investigator|faculty|lecturer|reader|chair)\b/i, "Faculty"],
 [/\b(fellowship|fellow programme|early career (award|fellow))\b/i, "Fellowship"],
 [/\b(staff scientist|senior scientist|research staff)\b/i, "Staff scientist"],
 [/\b(scientist|research (scientist|associate|officer)|computational biologist|bioinformatician)\b/i, "Research scientist"],
 [/\b(r&d|research and development|principal scientist|drug discovery|translational)\b/i, "Industry R&D"],
];

export function classifyType(title: string, description: string): OpportunityKind {
 const hay = title + " \n " + description.slice(0, 1200);
 for (const [re, kind] of RULES) if (re.test(hay)) return kind;
 return "Other";
}

/**
 * Years of *post-PhD* experience an advert demands, if it says so plainly.
 * Used only to reject postings far above the candidate's level.
 */
export function requiredPostPhdYears(description: string): number | null {
 const m = description.match(
  /(\d+)\s*\+?\s*years?[^.]{0,40}?(post[- ]?doc(toral)?|after (the )?ph\.?d|post[- ]ph\.?d)/i
 );
 return m ? parseInt(m[1], 10) : null;
}

const SENIOR_TITLE = /\b(professor|group leader|principal investigator|director|head of|dean)\b/i;
export const isSeniorLeadership = (title: string) => SENIOR_TITLE.test(title);
