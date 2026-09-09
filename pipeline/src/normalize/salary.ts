import type { SalaryEvidence } from "../types.js";

/** Rough, deliberately conservative. Only used to compare against a floor. */
const TO_INR: Record<string, number> = {
 INR: 1, USD: 84, EUR: 92, GBP: 107, CHF: 96, SGD: 62, AUD: 55, CAD: 61, SEK: 8, DKK: 12, NOK: 8, JPY: 0.56,
};
const PER_YEAR: Record<string, number> = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

export function annualInr(s: SalaryEvidence | null): number | null {
 if (!s) return null;
 const value = s.max != null && s.max > 0 ? s.max : s.min != null && s.min > 0 ? s.min : null;
 if (value == null) return null;
 const rate = TO_INR[(s.currency ?? "INR").toUpperCase()];
 if (!rate) return null;
 return Math.round(value * rate * PER_YEAR[s.period ?? "year"]);
}

const CURRENCY_SIGNS: Record<string, string> = { "₹": "INR", "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };

const PERIOD_RE = /\b(per\s+)?(hour|hourly|day|daily|week|weekly|month|monthly|annum|year|yearly|p\.?a\.?|lpa)\b/i;
function periodOf(text: string): SalaryEvidence["period"] {
 const m = text.match(PERIOD_RE);
 if (!m) return null;
 const w = m[2].toLowerCase();
 if (w.startsWith("hour")) return "hour";
 if (w.startsWith("day") || w === "daily") return "day";
 if (w.startsWith("week")) return "week";
 if (w.startsWith("month")) return "month";
 return "year";
}

const num = (s: string) => Number(s.replace(/[,\s]/g, ""));

/**
 * Pulls a salary out of prose. Conservative on purpose: a wrong number is worse
 * than no number, so anything ambiguous returns null and the UI says "not stated".
 */
export function salaryFromText(text: string): SalaryEvidence | null {
 const window = text.slice(0, 6000);

 // "₹8,00,000 - ₹12,00,000 per annum" / "$60,000–$75,000 a year"
 const range = window.match(
  /([₹$€£¥]|INR|USD|EUR|GBP|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|—|to)\s*([₹$€£¥]|INR|USD|EUR|GBP|Rs\.?)?\s*([\d,]+(?:\.\d+)?)[^.\n]{0,30}/i
 );
 if (range) {
  const sign = range[1];
  const currency = CURRENCY_SIGNS[sign] ?? (/^rs/i.test(sign) ? "INR" : sign.toUpperCase());
  const min = num(range[2]), max = num(range[4]);
  if (min > 0 && max >= min && max < 1e10) {
   return {
    min, max, currency, period: periodOf(range[0]) ?? "year",
    isPredicted: false, extractedFrom: "text", confidence: 0.7, evidence: range[0].trim(),
   };
  }
 }

 // "18 LPA" / "12.5 lakhs per annum"
 const lpa = window.match(/([\d.]+)\s*(?:-|–|to)?\s*([\d.]+)?\s*(lpa|lakhs?\s*(?:per\s*annum|p\.?a\.?)?)/i);
 if (lpa) {
  const a = Number(lpa[1]), b = lpa[2] ? Number(lpa[2]) : null;
  if (a > 0 && a < 500) {
   return {
    min: Math.round(a * 100000), max: Math.round((b ?? a) * 100000),
    currency: "INR", period: "year", isPredicted: false,
    extractedFrom: "text", confidence: 0.65, evidence: lpa[0].trim(),
   };
  }
 }

 // Single figure: "Salary: ₹75,000 per month"
 const single = window.match(
  /(?:salary|stipend|remuneration|fellowship amount)[^.\n]{0,40}?([₹$€£¥]|INR|USD|EUR|GBP|Rs\.?)\s*([\d,]+(?:\.\d+)?)[^.\n]{0,20}/i
 );
 if (single) {
  const sign = single[1];
  const currency = CURRENCY_SIGNS[sign] ?? (/^rs/i.test(sign) ? "INR" : sign.toUpperCase());
  const v = num(single[2]);
  if (v > 0 && v < 1e10) {
   return {
    min: v, max: v, currency, period: periodOf(single[0]) ?? "month",
    isPredicted: false, extractedFrom: "text", confidence: 0.5, evidence: single[0].trim(),
   };
  }
 }
 return null;
}

const fmt = (n: number, currency: string) =>
 currency === "INR" && n >= 100000
  ? (n / 100000).toFixed(n % 100000 === 0 ? 0 : 1) + "L"
  : n.toLocaleString("en-US");

export function salaryDisplay(s: SalaryEvidence | null): string | null {
 if (!s) return null;
 const min = s.min != null && s.min > 0 ? s.min : null;
 const max = s.max != null && s.max > 0 ? s.max : null;
 if (min == null && max == null) return null;
 const cur = s.currency ?? "";
 const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : "";
 const unit = sym || (cur ? cur + " " : "");
 const body = min != null && max != null && min !== max
  ? `${unit}${fmt(min, cur)}–${fmt(max, cur)}`
  : `${unit}${fmt((max ?? min)!, cur)}`;
 const per = s.period && s.period !== "year" ? `/${s.period}` : s.period === "year" ? "/yr" : "";
 return body + per + (s.isPredicted ? " (est.)" : "");
}

export function salarySourceLabel(s: SalaryEvidence | null): string {
 if (!s) return "Not stated";
 if (s.extractedFrom === "api") return s.isPredicted ? "Predicted (API)" : "Stated (API)";
 if (s.extractedFrom === "jsonld") return "JSON-LD";
 if (s.extractedFrom === "llm") return "From text";
 return "From text";
}
