import { adzunaAdapter } from "./adzuna.js";
import { crawlAdapter } from "./crawl.js";
import { joobleAdapter } from "./jooble.js";
import { feedAdapter } from "./feed.js";
import type { AdapterFactory, SourceAdapter } from "./types.js";

/**
 * Source keys are namespaced by adapter: "feed:euraxess", "crawl:iisc", "adzuna".
 * Adding a feed or a career page is therefore a row in discovery_sources, not code.
 */
const FACTORIES: Record<string, AdapterFactory> = {
 adzuna: adzunaAdapter,
 jooble: joobleAdapter,
 feed: feedAdapter,
 crawl: crawlAdapter,
};

export function makeAdapter(sourceKey: string): SourceAdapter | null {
 const prefix = sourceKey.includes(":") ? sourceKey.split(":")[0] : sourceKey;
 const factory = FACTORIES[prefix];
 return factory ? factory(sourceKey) : null;
}

export const knownAdapters = () => Object.keys(FACTORIES);
