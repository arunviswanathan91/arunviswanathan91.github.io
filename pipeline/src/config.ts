import type { RunCaps } from "./types.js";

export interface Env {
 supabaseUrl: string;
 serviceRoleKey: string;
 telegramBotToken: string | null;
 userId: string | null;
 firecrawlApiKey: string | null;
 geminiApiKey: string | null;
 geminiModel: string;
 groqApiKey: string | null;
 groqModel: string;
 openrouterApiKey: string | null;
 openrouterModel: string;
 cerebrasApiKey: string | null;
 cerebrasModel: string;
 /** Minimum milliseconds between calls to each free-tier provider, derived
  *  from a conservative requests-per-minute assumption. Waiting this out
  *  ahead of a call is cheaper than discovering the limit via a 429. */
 rateLimitMs: Record<"openrouter" | "groq" | "gemini" | "cerebras", number>;
}

/** `value` is a requests-per-minute override; falls back to a conservative
 *  free-tier assumption when unset or not a positive number. */
function rpmToMinIntervalMs(value: string | undefined, fallbackRpm: number): number {
 const rpm = Number(value);
 const effective = Number.isFinite(rpm) && rpm > 0 ? rpm : fallbackRpm;
 return Math.ceil(60_000 / effective);
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
  geminiApiKey: env.GEMINI_API_KEY ?? null,
  // Gemini rejects 2.5 Flash for newly provisioned API users and directs them
  // to this stable model. Keep the exact model override available for future
  // endpoint migrations without another code change.
  geminiModel: env.GEMINI_MODEL?.trim() || "gemini-3.6-flash",
  groqApiKey: env.GROQ_API_KEY ?? null,
  groqModel: env.GROQ_MODEL ?? "openai/gpt-oss-20b",
  openrouterApiKey: env.OPENROUTER_API_KEY?.trim() || null,
  openrouterModel: env.OPENROUTER_MODEL?.trim() || "openrouter/free",
  // Cerebras: OpenAI-compatible chat completions, generous free tier, no
  // cost guard needed since there is no paid tier to accidentally hit.
  cerebrasApiKey: env.CEREBRAS_API_KEY?.trim() || null,
  cerebrasModel: env.CEREBRAS_MODEL?.trim() || "llama3.1-8b",
  rateLimitMs: {
   openrouter: rpmToMinIntervalMs(env.OPENROUTER_RPM, 12),
   // A live run hit Groq's free-tier tokens-per-minute cap (8,000 TPM) well
   // before its request-count RPM limit, since a single decision-brief call
   // can use several thousand tokens on its own. Spacing calls further apart
   // gives the rolling TPM window room to drain between them -- this is a
   // coarse mitigation (ProviderRateLimiter only paces request count, not
   // token volume), not a real token-bucket, but meaningfully reduces
   // bursting without a bigger rework.
   groq: rpmToMinIntervalMs(env.GROQ_RPM, 6),
   gemini: rpmToMinIntervalMs(env.GEMINI_RPM, 10),
   cerebras: rpmToMinIntervalMs(env.CEREBRAS_RPM, 20),
  },
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
