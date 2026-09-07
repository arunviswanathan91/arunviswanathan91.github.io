// Shared shapes for the discovery pipeline.

export type OpportunityKind =
 | "Postdoc" | "Research scientist" | "Industry R&D"
 | "Fellowship" | "Staff scientist" | "Faculty" | "Other";

export type SourceKind = "api" | "feed" | "crawl";
export type QuotaProvider = "adzuna" | "jooble" | "rapidapi" | "groq" | "gemini" | "none";

export interface SalaryEvidence {
 min: number | null;
 max: number | null;
 currency: string | null;          // ISO-4217
 period: "hour" | "day" | "week" | "month" | "year" | null;
 isPredicted: boolean;
 extractedFrom: "api" | "jsonld" | "text" | "llm";
 confidence: number;               // 0..1
 evidence: string | null;          // the substring we matched, for auditability
}

/** One vacancy, normalized to a common shape regardless of which source found it. */
export interface NormalizedOpportunity {
 sourceKey: string;
 externalId: string;
 url: string;
 urlCanon: string;
 urlHash: string;
 applyUrl: string | null;
 atsKey: string | null;
 title: string;
 organization: string | null;
 organizationUrl: string | null;
 department: string | null;
 locationRaw: string | null;
 city: string | null;
 region: string | null;
 country: string | null;           // ISO-3166 alpha-2
 isRemote: boolean;
 postedAt: string | null;          // ISO
 deadline: string | null;          // ISO
 employmentType: string | null;
 opportunityType: OpportunityKind;
 descriptionText: string;
 salary: SalaryEvidence | null;
 contentHash: string;
 /** 0..1 — how many core fields we recovered deterministically. Drives the LLM gate. */
 completeness: number;
}

/** A raw item as fetched, before parsing. Written to the DB first so a crash loses nothing. */
export interface RawItem {
 externalId: string;
 url: string;
 payload: unknown;
 jsonLd?: unknown[];
 fetchedAt: string;
}

export interface SearchProfile {
 id: string | null;
 userId: string;
 terms: string[];
 types: string[];
 homeCity: string;
 indiaCities: string[];
 countries: string[];
 remoteOk: boolean;
 facultyOk: boolean;
 yearsExperience: number;
 salaryFloorInr: number | null;
 rejectBelowFloor: boolean;
 blockedOrgs: string[];
 maxLlmCalls: number;
 maxCrawlPages: number;
 maxHttpRequests: number;
}

export interface ScoreBreakdown {
 topic: { value: number; hits: string[] };
 role_fit: { value: number; note: string };
 location: { value: number; note: string };
 compensation: { value: number; note: string };
 recency: { value: number; note: string };
 feedback: { value: number; note: string };
}

export interface Scored {
 score: number;
 fit: "Strong" | "Good" | "Maybe" | "Weak";
 breakdown: ScoreBreakdown;
 reason: string;
}

export interface RunCaps {
 maxHttpRequests: number;
 maxCrawlPages: number;
 maxPagesPerHost: number;
 maxItemsPerSource: number;
 maxLlmCalls: number;
 maxRuntimeMs: number;
 maxNewOpportunities: number;
}

export interface SourceOutcome {
 sourceKey: string;
 status: "ok" | "skipped_config" | "skipped_quota" | "skipped_circuit" | "partial" | "failed";
 itemsFetched: number;
 itemsNew: number;
 pages: number;
 apiCalls: number;
 durationMs: number;
 error?: string;
}

export interface OpportunitySummary {
 id: string;
 score: number;
 role: string;
 organization: string | null;
 location: string | null;
 deadline: string | null;
 salaryDisplay: string | null;
 url: string;
}

export interface RunResult {
 runId: string | null;
 status: "done" | "partial" | "failed";
 fetched: number;
 deduped: number;
 created: number;
 changed: number;
 bySource: Record<string, SourceOutcome>;
 top: OpportunitySummary[];
 degradations: string[];
}
