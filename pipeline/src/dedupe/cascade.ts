import { hamming, jaccard, titleTokens } from "./keys.js";

export type MatchSignal = "url" | "ats" | "external_id" | "orgtitle" | "simhash" | "none";

export interface Candidate {
 id: string;
 urlHash: string;
 atsKey: string | null;
 orgKey: string | null;
 titleKey: string | null;
 title: string;
 locKey: string | null;
 postedAt: string | null;
 simhash: bigint | null;
 deadline: string | null;
 status: string;
}

export interface Probe {
 urlHash: string;
 atsKey: string | null;
 orgKey: string | null;
 title: string;
 locKey: string | null;
 postedAt: string | null;
 simhash: bigint | null;
 descriptionLength: number;
}

export interface MatchResult {
 candidate: Candidate | null;
 signal: MatchSignal;
 confidence: number;
 /** True when this looks like the same post advertised again in a later cycle. */
 repost: boolean;
}

const NO_MATCH: MatchResult = { candidate: null, signal: "none", confidence: 0, repost: false };

const daysApart = (a: string | null, b: string | null): number | null => {
 if (!a || !b) return null;
 const d = Math.abs(new Date(a).getTime() - new Date(b).getTime());
 return isNaN(d) ? null : d / 86400000;
};

/**
 * First tier that hits, wins. Tiers are ordered by how certain they are, so a
 * weaker signal can never override a stronger one.
 */
export function matchCandidate(probe: Probe, candidates: Candidate[]): MatchResult {
 // T1 — canonical URL. Exact and free.
 const byUrl = candidates.find(c => c.urlHash === probe.urlHash);
 if (byUrl) return { candidate: byUrl, signal: "url", confidence: 1, repost: false };

 // T2 — applicant-tracking-system identity. The same requisition syndicated
 // to three job boards keeps one ATS id even though every URL differs.
 if (probe.atsKey) {
  const byAts = candidates.find(c => c.atsKey && c.atsKey === probe.atsKey);
  if (byAts) return { candidate: byAts, signal: "ats", confidence: 1, repost: false };
 }

 // T3 — organisation + title + location.
 const probeTokens = titleTokens(probe.title);
 for (const c of candidates) {
  const orgOk =
   (probe.orgKey && c.orgKey && probe.orgKey === c.orgKey) ||
   (!probe.orgKey !== !c.orgKey);            // one side unknown is tolerated
  if (!orgOk) continue;
  if (jaccard(probeTokens, titleTokens(c.title)) < 0.75) continue;
  const locOk = !probe.locKey || !c.locKey || probe.locKey === c.locKey ||
   probe.locKey === "REMOTE" || c.locKey === "REMOTE";
  if (!locOk) continue;

  const gap = daysApart(probe.postedAt, c.postedAt);
  if (gap !== null && gap > 45) {
   // Same advert, long after the last one closed: an annual cycle reopening,
   // which is something you want to see again rather than have silently merged.
   const closed = c.deadline ? new Date(c.deadline).getTime() < Date.now() : false;
   if (closed) return { candidate: c, signal: "orgtitle", confidence: 0.9, repost: true };
   continue;
  }
  return { candidate: c, signal: "orgtitle", confidence: 0.9, repost: false };
 }

 // T4 — description fingerprint. Short aggregator stubs produce meaningless
 // fingerprints, so this tier is skipped unless there is real text to compare.
 //
 // Threshold calibrated empirically, not from the simhash literature's classic
 // guidance (that assumes corpora with hundreds+ of shingles): at typical job
 // description lengths (~60-150 word-trigram shingles) reworded near-duplicates
 // measured 7-14 bits apart, while genuinely different same-domain postings
 // measured 31-33 apart. 20 sits with a wide margin on both sides, favouring
 // the safer failure mode -- a missed merge costs a little manual triage, a
 // false merge would silently hide a real opportunity.
 const SIMHASH_DUPLICATE_THRESHOLD = 20;
 if (probe.simhash !== null && probe.descriptionLength >= 400) {
  for (const c of candidates) {
   if (c.simhash === null) continue;
   const orgCompatible = !probe.orgKey || !c.orgKey || probe.orgKey === c.orgKey;
   if (!orgCompatible) continue;
   if (hamming(probe.simhash, c.simhash) <= SIMHASH_DUPLICATE_THRESHOLD) {
    return { candidate: c, signal: "simhash", confidence: 0.85, repost: false };
   }
  }
 }

 return NO_MATCH;
}
