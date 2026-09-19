const POSTDOC_ROLE = /\b(post[ -]?doc(?:toral)?|research fellow(?:ship)?)\b/gi;
const HAS_POSTDOC_ROLE = /\b(post[ -]?doc(?:toral)?|research fellow(?:ship)?)\b/i;

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

/** Broad discovery is intentionally independent of the research-interest
 * profile. Interests rank the resulting postdocs; they must never determine
 * which postdocs the source APIs are allowed to return. */
export const BROAD_DISCOVERY_TERMS = [
 "postdoc",
 "postdoctoral researcher",
 "research fellow",
];

export function termsForDiscovery(): string[] {
 return [...BROAD_DISCOVERY_TERMS];
}

/**
 * A custom search should spend its API budget on that search, rather than on
 * the profile's unrelated default terms. Small role variants improve recall
 * without turning a focused request into an open-ended crawl.
 */
export function termsForRun(profileTerms: string[], query: string | null | undefined): string[] {
 const requested = clean(query ?? "");
 if (!requested) return profileTerms;

 const topic = clean(requested.replace(POSTDOC_ROLE, " "));
 // A role-only search still means postdocs in the user's selected subjects.
 if (!topic && HAS_POSTDOC_ROLE.test(requested) && profileTerms.length) {
  return [...new Set(profileTerms.map(term => clean(`${term.replace(POSTDOC_ROLE, " ")} postdoc`)))].slice(0, 6);
 }
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

/** Broad discovery owns the durable opportunity corpus. A focused query gets
 * its own result ledger and must not add unrelated crawler results to that
 * corpus merely because a source returned a wide page. */
export const shouldPersistRunItem = (focusedSearch: boolean, queryMatched: boolean) =>
 !focusedSearch || queryMatched;
