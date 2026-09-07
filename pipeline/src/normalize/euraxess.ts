import { decodeEntities, htmlToText } from "./text.js";
import type { OpportunityKind } from "../types.js";

export interface EuraxessJob {
 title: string;
 organization: string | null;
 department: string | null;
 country: string | null;
 city: string | null;
 deadline: string | null;         // ISO, from the <time datetime> attribute
 postedAt: string | null;         // ISO, from "Posted on: <date>"
 researcherProfile: string | null; // "First Stage Researcher (R1)" .. "Leading Researcher (R4)"
 contractType: string | null;
 description: string;
}

/**
 * EURAXESS has no JobPosting JSON-LD (only a BreadcrumbList, verified against a
 * live page) but every field is in a clean, consistent <dt>/<dd> description
 * list, so a plain label -> value map covers title, org, location, deadline
 * and the EU's own researcher career-stage classification in one pass.
 */
function fieldMap(html: string): Map<string, string> {
 const map = new Map<string, string>();
 const re = /<dt[^>]*class="ecl-description-list__term"[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*class="ecl-description-list__definition"[^>]*>([\s\S]*?)<\/dd>/gi;
 let m: RegExpExecArray | null;
 while ((m = re.exec(html))) {
  const label = htmlToText(m[1]).trim();
  const value = htmlToText(m[2]).trim();
  if (label && value && !map.has(label)) map.set(label, value);
 }
 return map;
}

/** R1-R4 is the EU's own career-stage framework -- more reliable than guessing
 *  from a title, since EURAXESS assigns it directly. R2 ("Recognised
 *  Researcher") is the EU's definition of postdoc-equivalent. */
function typeFromResearcherProfile(profile: string | null): OpportunityKind | null {
 if (!profile) return null;
 if (/\(R1\)/.test(profile)) return "Other";
 if (/\(R2\)/.test(profile)) return "Postdoc";
 if (/\(R3\)/.test(profile)) return "Research scientist";
 if (/\(R4\)/.test(profile)) return "Faculty";
 return null;
}

export function parseEuraxessJob(html: string): EuraxessJob | null {
 const titleMatch = html.match(/class="ecl-content-block__title"[^>]*>([\s\S]*?)<\/h1>/i);
 const title = titleMatch ? decodeEntities(htmlToText(titleMatch[1])).trim() : "";
 if (!title) return null;

 const fields = fieldMap(html);

 const deadlineMatch = html.match(/Application Deadline[\s\S]{0,300}?<time\s+datetime="([^"]+)"/i);
 const deadline = deadlineMatch ? new Date(deadlineMatch[1]).toISOString() : null;

 const postedMatch = html.match(/Posted on:\s*([^<]+)</i);
 const postedAt = postedMatch ? (() => {
  const d = new Date(postedMatch[1].trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
 })() : null;

 const descMatch = html.match(/id="offer-description"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?:<h2|<\/section)/i);
 const description = descMatch ? htmlToText(descMatch[1]) : "";

 return {
  title,
  organization: fields.get("Organisation/Company") ?? null,
  department: fields.get("Department") ?? null,
  country: fields.get("Country") ?? null,
  city: fields.get("City") ?? null,
  deadline,
  postedAt,
  researcherProfile: fields.get("Researcher Profile") ?? null,
  contractType: fields.get("Type of Contract") ?? null,
  description,
 };
}

export { typeFromResearcherProfile };
