/**
 * Seed RSS/Atom sources. Each becomes one row in discovery_sources -- adding a
 * feed is editing this list and re-running seed.ts, never writing an adapter.
 *
 * Every URL here has been checked against the live site rather than guessed.
 * Three plausible-looking candidates did NOT survive that check and are
 * deliberately left out rather than shipped as fabricated config:
 *   - EURAXESS: the jobs section offers no RSS/Atom feed at all.
 *   - Nature Careers: nature.com/naturecareers/jobs.rss returns 404.
 *   - FindAPostDoc: returns 403 Forbidden -- it blocks automated access, so
 *     it is respected rather than routed around.
 * jobRxiv is real and structurally valid, though empty of postings as of this
 * writing -- that's a content gap, not a broken source, so it stays.
 */
export interface FeedSeed { key: string; url: string; organization?: string }

export const FEED_SEEDS: FeedSeed[] = [
 { key: "feed:jobrxiv", url: "https://jobrxiv.org/feed/", organization: "jobRxiv" },
];
