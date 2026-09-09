import { createHash } from "node:crypto";

const ENTITIES: Record<string, string> = {
 amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-",
 rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "...", eacute: "e", uuml: "u",
};

export function decodeEntities(s: string): string {
 let value = s;
 // Feeds sometimes escape an already escaped title (`&amp;amp;`). A bounded
 // repeat cleans that safely without risking an unending replacement loop.
 for (let i = 0; i < 3; i++) {
  const decoded = value
   .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
   .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[String(name).toLowerCase()] ?? m);
  if (decoded === value) break;
  value = decoded;
 }
 return value;
}

/** HTML/XML to readable plain text. Deliberately dependency-free. */
export function htmlToText(html: string): string {
 return decodeEntities(
  html
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
   .replace(/<!--[\s\S]*?-->/g, " ")
   .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
   .replace(/<br\s*\/?>/gi, "\n")
   .replace(/<[^>]+>/g, " ")
 ).replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Paragraphs that appear in every advert and carry no signal. */
const BOILERPLATE =
 /(equal opportunit|we (are|value) (an? )?divers|about (us|the (company|university))|our benefits|how to apply|privacy (policy|notice)|cookie|reasonable accommodation|applications from|we encourage applications)/i;

export function stripBoilerplate(text: string): string {
 return text
  .split(/\n{2,}/)
  .filter(p => !BOILERPLATE.test(p))
  .join("\n\n");
}

/** Canonical text used for hashing and fingerprinting, so whitespace churn is invisible. */
export function normalizeForHash(text: string): string {
 return stripBoilerplate(text)
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, " ")
  .replace(/[\w.+-]+@[\w.-]+\.\w+/g, " ")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 4000);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Identity of a listing's *content*. Re-seeing the same advert produces the same
 * hash, which is what makes a repeat run cost zero parsing and zero LLM calls.
 */
export function contentHash(parts: {
 title: string; orgKey: string | null; locKey: string | null;
 employmentType: string | null; deadline: string | null;
 salaryMin: number | null; salaryMax: number | null; currency: string | null;
 description: string;
}): string {
 return sha256([
  parts.title.toLowerCase().trim(),
  parts.orgKey ?? "", parts.locKey ?? "", parts.employmentType ?? "",
  parts.deadline ?? "", String(parts.salaryMin ?? ""), String(parts.salaryMax ?? ""),
  parts.currency ?? "",
  sha256(normalizeForHash(parts.description)),
 ].join(""));
}

export const excerpt = (text: string, max: number) =>
 text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
