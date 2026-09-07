import { htmlToText } from "./text.js";
import type { SalaryEvidence } from "../types.js";

/**
 * Pulls every JSON-LD block out of a page. Google requires schema.org/JobPosting
 * markup for a vacancy to appear in Google for Jobs, so most institutional and
 * corporate listings publish their own structured data — which is both free to
 * read and more reliable than asking a model to infer fields from prose.
 */
export function extractJsonLd(html: string): unknown[] {
 const out: unknown[] = [];
 const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
 let m: RegExpExecArray | null;
 while ((m = re.exec(html))) {
  const body = m[1].trim().replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  if (!body) continue;
  try { out.push(JSON.parse(body)); }
  catch {
   // Some sites emit multiple concatenated objects or trailing commas; try a repair.
   try { out.push(JSON.parse(body.replace(/,\s*([}\]])/g, "$1"))); } catch { /* skip */ }
  }
 }
 return out;
}

const typesOf = (node: any): string[] => {
 const t = node?.["@type"];
 return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
};

/** Walks arrays and @graph containers to find every JobPosting node. */
export function findJobPostings(blocks: unknown[]): any[] {
 const found: any[] = [];
 const visit = (node: any, depth: number) => {
  if (!node || typeof node !== "object" || depth > 6) return;
  if (Array.isArray(node)) { for (const n of node) visit(n, depth + 1); return; }
  if (typesOf(node).some(t => /JobPosting/i.test(t))) found.push(node);
  if (Array.isArray(node["@graph"])) for (const n of node["@graph"]) visit(n, depth + 1);
  for (const k of ["itemListElement", "mainEntity", "item"]) {
   if (node[k]) visit(node[k], depth + 1);
  }
 };
 for (const b of blocks) visit(b, 0);
 return found;
}

const text = (v: unknown): string | null => {
 if (typeof v === "string") return v.trim() || null;
 if (typeof v === "number") return String(v);
 if (v && typeof v === "object") {
  const o = v as any;
  return text(o.name ?? o["@value"] ?? o.value ?? null);
 }
 return null;
};

const isoDate = (v: unknown): string | null => {
 const s = text(v);
 if (!s) return null;
 const d = new Date(s);
 return isNaN(d.getTime()) ? null : d.toISOString();
};

function addressOf(node: any): { locationRaw: string | null; city: string | null; country: string | null } {
 const loc = Array.isArray(node.jobLocation) ? node.jobLocation[0] : node.jobLocation;
 const addr = loc?.address ?? loc;
 if (!addr || typeof addr !== "object") {
  const raw = text(loc);
  return { locationRaw: raw, city: null, country: null };
 }
 const city = text(addr.addressLocality);
 const region = text(addr.addressRegion);
 const country = text(addr.addressCountry);
 const raw = [city, region, country].filter(Boolean).join(", ") || null;
 return { locationRaw: raw, city, country };
}

function salaryOf(node: any): SalaryEvidence | null {
 const bs = node.baseSalary ?? node.estimatedSalary;
 if (!bs) return null;
 const value = bs.value ?? bs;
 const currency = text(bs.currency ?? bs.salaryCurrency) ?? null;
 const min = Number(value?.minValue ?? value?.value ?? NaN);
 const max = Number(value?.maxValue ?? value?.value ?? NaN);
 const unitRaw = (text(value?.unitText) ?? "").toUpperCase();
 const period =
  unitRaw === "HOUR" ? "hour" : unitRaw === "DAY" ? "day" : unitRaw === "WEEK" ? "week" :
  unitRaw === "MONTH" ? "month" : unitRaw === "YEAR" ? "year" : null;
 if (!isFinite(min) && !isFinite(max)) return null;
 return {
  min: isFinite(min) ? min : null,
  max: isFinite(max) ? max : (isFinite(min) ? min : null),
  currency: currency ? currency.toUpperCase() : null,
  period,
  isPredicted: !!node.estimatedSalary && !node.baseSalary,
  extractedFrom: "jsonld",
  confidence: 0.95,
  evidence: null,
 };
}

export interface JsonLdJob {
 title: string | null;
 organization: string | null;
 organizationUrl: string | null;
 description: string;
 locationRaw: string | null;
 city: string | null;
 country: string | null;
 isRemote: boolean;
 postedAt: string | null;
 deadline: string | null;
 employmentType: string | null;
 identifier: string | null;
 applyUrl: string | null;
 salary: SalaryEvidence | null;
}

export function readJobPosting(node: any): JsonLdJob {
 const org = node.hiringOrganization;
 const { locationRaw, city, country } = addressOf(node);
 const employmentType = Array.isArray(node.employmentType)
  ? node.employmentType.map(String).join(", ")
  : text(node.employmentType);
 const identifier = text(node.identifier) ?? text(node["@id"]);
 const remoteFlag =
  !!node.jobLocationType && /TELECOMMUTE/i.test(String(node.jobLocationType));

 return {
  title: text(node.title) ?? text(node.name),
  organization: text(org),
  organizationUrl: text(org?.sameAs) ?? text(org?.url),
  description: htmlToText(String(node.description ?? "")),
  locationRaw, city, country,
  isRemote: remoteFlag,
  postedAt: isoDate(node.datePosted),
  deadline: isoDate(node.validThrough),
  employmentType,
  identifier,
  applyUrl: text(node.url) ?? text(node.applicationContact?.url) ?? null,
  salary: salaryOf(node),
 };
}
