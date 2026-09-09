const POSTDOC_ROLE = /\b(post[ -]?doc(?:toral)?|research fellow(?:ship)?)\b/gi;
const HAS_POSTDOC_ROLE = /\b(post[ -]?doc(?:toral)?|research fellow(?:ship)?)\b/i;

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * A custom search should spend its API budget on that search, rather than on
 * the profile's unrelated default terms. Small role variants improve recall
 * without turning a focused request into an open-ended crawl.
 */
export function termsForRun(profileTerms: string[], query: string | null | undefined): string[] {
 const requested = clean(query ?? "");
 if (!requested) return profileTerms;

 const topic = clean(requested.replace(POSTDOC_ROLE, " "));
 const variants = [requested];
 if (topic && HAS_POSTDOC_ROLE.test(requested)) {
  variants.push(`${topic} postdoctoral`, `${topic} research fellow`);
 }
 return [...new Set(variants.map(clean).filter(Boolean))].slice(0, 3);
}

/** Interactive requests answer "what matches now"; only the nightly schedule
 * is incremental. This also makes a workspace button behave like Telegram. */
export const isFreshSearch = (trigger: "schedule" | "telegram" | "manual") => trigger !== "schedule";

/** Unchanged rows are cheap to skip overnight, but must be rescored when a
 * person asks a fresh question because the query (and therefore relevance)
 * may have changed. */
export const shouldEvaluate = (freshSearch: boolean, changed: boolean) => freshSearch || changed;
