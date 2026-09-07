import { adzunaAdapter } from "./adzuna.js";
import { crawlAdapter } from "./crawl.js";
import { euraxessAdapter } from "./euraxess.js";
import { joobleAdapter } from "./jooble.js";
import { feedAdapter } from "./feed.js";
import type { AdapterFactory, SourceAdapter } from "./types.js";

/**
 * Source keys are namespaced by adapter: "feed:jobrxiv", "crawl:iisc", "adzuna".
 * Adding a feed or a generic career page is therefore a row in discovery_sources,
 * not code. Dedicated adapters (adzuna, jooble, euraxess) exist for sources whose
 * data isn't in a generic shape a config-only crawl target could handle.
 */
const FACTORIES: Record<string, AdapterFactory> = {
 adzuna: adzunaAdapter,
 jooble: joobleAdapter,
 euraxess: euraxessAdapter,
 feed: feedAdapter,
 crawl: crawlAdapter,
};

export function makeAdapter(sourceKey: string): SourceAdapter | null {
 const prefix = sourceKey.includes(":") ? sourceKey.split(":")[0] : sourceKey;
 const factory = FACTORIES[prefix];
 return factory ? factory(sourceKey) : null;
}

export const knownAdapters = () => Object.keys(FACTORIES);
