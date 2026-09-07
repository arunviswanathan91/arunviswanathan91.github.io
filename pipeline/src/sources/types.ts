import type { Http } from "../http.js";
import type { NormalizedOpportunity, QuotaProvider, RawItem, SourceKind } from "../types.js";

/** Thrown when credentials are absent. The runner records "skipped", never a failure. */
export class SourceConfigError extends Error {}

export interface SourceQuery {
 terms: string[];
 countries: string[];
 cities: string[];
 remoteOk: boolean;
 /** Incremental floor from the stored cursor: only look for things newer than this. */
 since: Date | null;
}

export interface FetchWindow {
 maxItems: number;
 maxRequests: number;
 maxPages: number;
 deadlineAt: number;      // epoch ms
}

export interface SourcePage {
 items: RawItem[];
 cursor: unknown | null;
 requestsUsed: number;
 exhausted: boolean;
}

export interface SourceContext {
 http: Http;
 cursorIn: Record<string, unknown>;
 now: Date;
 log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface SourceAdapter {
 readonly key: string;
 readonly kind: SourceKind;
 readonly quotaProvider: QuotaProvider;
 /** @throws SourceConfigError when required credentials are missing. */
 configure(config: Record<string, unknown>, env: NodeJS.ProcessEnv): void;
 fetch(q: SourceQuery, w: FetchWindow, ctx: SourceContext): AsyncGenerator<SourcePage>;
 /** Pure. Returning null drops the item. */
 normalize(item: RawItem, ctx: SourceContext): NormalizedOpportunity | null;
}

export type AdapterFactory = (sourceKey: string) => SourceAdapter;
