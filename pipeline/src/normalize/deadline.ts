const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|" +
 "sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

// "15th", "1st", "22nd" -- the ordinal suffix trips up Date's month-name parser.
const stripOrdinals = (s: string) => s.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");

// "15 October 2026" / "October 15, 2026" / "2026-10-15", in that preference
// order -- the first two are how a deadline sentence is actually written; the
// ISO form is a fallback for a source that already writes it that way.
const DATE_PATTERNS = [
 new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?\\s+\\d{4}\\b`, "i"),
 new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "i"),
 /\b\d{4}-\d{2}-\d{2}\b/,
];

// Phrases that introduce an application deadline specifically -- never a
// start date, a posted date, or a contract end date, which read very
// differently but sit in the same kind of listing text.
const DEADLINE_PHRASE = /\b(?:application\s+deadline|deadline\s+for\s+applications?|closing\s+date|"?apply\s+by"?|"?applications?\s+(?:close|closes|must\s+be\s+(?:received|submitted))\s+(?:by|on)?|submission\s+deadline)\b[^.\n]{0,40}/gi;

/**
 * A best-effort fallback for when a source's structured data has no
 * `validThrough` (most job boards never set it). Only ever reads a sentence
 * that names a deadline explicitly -- never inferred from a posted date or a
 * generic date elsewhere in the text -- so a wrong extraction is rare at the
 * cost of leaving many genuinely-undated listings as null, same as before
 * this existed.
 */
export function extractDeadlineFact(text: string): string | null {
 if (!text) return null;
 const matches = text.match(DEADLINE_PHRASE);
 if (!matches) return null;

 for (const phrase of matches) {
  const clean = stripOrdinals(phrase);
  for (const pattern of DATE_PATTERNS) {
   const hit = clean.match(pattern);
   if (!hit) continue;
   const d = new Date(hit[0]);
   if (isNaN(d.getTime())) continue;
   // A deadline more than a decade out either way is the parser
   // misreading an unrelated number as a year -- discard rather than
   // storing a nonsense date.
   const yearsAway = (d.getTime() - Date.now()) / (365 * 86400000);
   if (Math.abs(yearsAway) > 10) continue;
   return d.toISOString();
  }
 }
 return null;
}
