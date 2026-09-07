import type { RunCaps } from "./types.js";

export interface Env {
 supabaseUrl: string;
 serviceRoleKey: string;
 telegramBotToken: string | null;
 userId: string | null;
 firecrawlApiKey: string | null;
}

/** Fails loudly and early rather than half way through a run. */
export function readEnv(env: NodeJS.ProcessEnv = process.env): Env {
 const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "";
 const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
 const missing: string[] = [];
 if (!supabaseUrl) missing.push("SUPABASE_URL");
 if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
 if (missing.length) throw new Error(`Missing required environment: ${missing.join(", ")}`);
 return {
  supabaseUrl,
  serviceRoleKey,
  telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? null,
  userId: env.DISCOVERY_USER_ID ?? null,
  firecrawlApiKey: env.FIRECRAWL_API_KEY ?? null,
 };
}

/** Hard per-run ceiling on Firecrawl-rendered fetches, independent of the monthly
 *  free-tier allowance -- keeps one run from burning a big chunk of the month's
 *  quota on a single misbehaving site. */
export const FIRECRAWL_MAX_PER_RUN = 20;

export const SCHEDULE_CAPS: RunCaps = {
 maxHttpRequests: 250,
 maxCrawlPages: 120,
 maxPagesPerHost: 15,
 maxItemsPerSource: 300,
 maxLlmCalls: 40,
 maxRuntimeMs: 15 * 60 * 1000,
 maxNewOpportunities: 400,
};

/** Tighter, because someone is waiting for the reply. */
export const INTERACTIVE_CAPS: RunCaps = {
 maxHttpRequests: 90,
 maxCrawlPages: 40,
 maxPagesPerHost: 8,
 maxItemsPerSource: 100,
 maxLlmCalls: 12,
 maxRuntimeMs: 4 * 60 * 1000,
 maxNewOpportunities: 200,
};
