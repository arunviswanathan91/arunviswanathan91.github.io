import type { Db } from "../../db.js";
import { FEED_SEEDS } from "./feeds.js";
import { CRAWL_SEEDS } from "./sites.js";

export interface DefaultSourceRow {
 user_id: string;
 source_key: string;
 kind: "api" | "feed" | "crawl";
 enabled: boolean;
 quota_provider: string;
 precedence: number;
 config: Record<string, unknown>;
}

/** The canonical catalog used by both seed.ts and normal runs. */
export function defaultSourceRows(userId: string): DefaultSourceRow[] {
 const feeds = FEED_SEEDS.map((f, i): DefaultSourceRow => ({
  user_id: userId, source_key: f.key, kind: "feed", enabled: true,
  quota_provider: "none", precedence: 6 + i,
  config: { url: f.url, organization: f.organization ?? null },
 }));
 const crawls = CRAWL_SEEDS.map((c, i): DefaultSourceRow => ({
  user_id: userId, source_key: c.key, kind: "crawl", enabled: true,
  quota_provider: "none", precedence: 12 + i,
  config: {
   seedUrls: c.seedUrls, organization: c.organization,
   allowPathRe: c.allowPathRe, maxPages: c.maxPages ?? 15,
  },
 }));
 return [
  ...feeds,
  ...crawls,
  { user_id: userId, source_key: "euraxess", kind: "crawl", enabled: true, quota_provider: "none", precedence: 20, config: {} },
  { user_id: userId, source_key: "adzuna", kind: "api", enabled: true, quota_provider: "adzuna", precedence: 40, config: {} },
  { user_id: userId, source_key: "jooble", kind: "api", enabled: true, quota_provider: "jooble", precedence: 45, config: {} },
 ];
}

/**
 * Registers newly shipped sources without overwriting an existing row. In
 * particular, a source the user disabled stays disabled and its cursor stays
 * intact. This repairs databases that were seeded before newer adapters were
 * added to the repository.
 */
export async function ensureDefaultSources(db: Db, userId: string): Promise<string[]> {
 const rows = defaultSourceRows(userId);
 const { data, error } = await db.client.from("discovery_sources")
  .upsert(rows, { onConflict: "user_id,source_key", ignoreDuplicates: true })
  .select("source_key");
 if (error) throw new Error("ensureDefaultSources: " + error.message);
 return (data ?? []).map(r => String((r as { source_key: string }).source_key));
}

/** Explicit seeding refreshes catalog configuration, matching seed.ts's
 * historic behaviour. It is safe because the user deliberately invoked it. */
export async function refreshDefaultSources(db: Db, userId: string): Promise<string[]> {
 const rows = defaultSourceRows(userId);
 const { data, error } = await db.client.from("discovery_sources")
  .upsert(rows, { onConflict: "user_id,source_key" })
  .select("source_key");
 if (error) throw new Error("refreshDefaultSources: " + error.message);
 return (data ?? []).map(r => String((r as { source_key: string }).source_key));
}
