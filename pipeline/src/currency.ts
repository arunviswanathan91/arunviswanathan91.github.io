import type { Http } from "./http.js";

export const EXCHANGE_API_PRIMARY =
 "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/inr.min.json";
export const EXCHANGE_API_FALLBACK =
 "https://latest.currency-api.pages.dev/v1/currencies/inr.min.json";

export interface ExchangeRateSnapshot {
 base: "INR";
 asOf: string;
 sourceUrl: string;
 /** INR value of one unit of each ISO currency. */
 toInr: Record<string, number>;
}

export interface CurrencyConversion {
 fromCurrency: string;
 toCurrency: string;
 rate: number;
 asOf: string;
 sourceUrl: string;
 provider: "fawazahmed0/exchange-api";
}

type JsonClient = Pick<Http, "getJson">;

const record = (value: unknown): Record<string, unknown> | null =>
 value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/**
 * Loads the project's daily INR-base table. The upstream project explicitly
 * asks clients to fall back from jsDelivr to its Cloudflare Pages mirror.
 */
export async function loadInrExchangeRates(client: JsonClient): Promise<ExchangeRateSnapshot | null> {
 for (const sourceUrl of [EXCHANGE_API_PRIMARY, EXCHANGE_API_FALLBACK]) {
  try {
   const payload = record(await client.getJson<unknown>(sourceUrl));
   const quoted = record(payload?.inr);
   const asOf = typeof payload?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ? payload.date : null;
   if (!quoted || !asOf) continue;

   const toInr: Record<string, number> = { INR: 1 };
   for (const [code, value] of Object.entries(quoted)) {
    const inrToCurrency = Number(value);
    if (!/^[a-z]{3}$/i.test(code) || !Number.isFinite(inrToCurrency) || inrToCurrency <= 0) continue;
    toInr[code.toUpperCase()] = 1 / inrToCurrency;
   }
   if (!toInr.USD || !toInr.EUR || Object.keys(toInr).length < 20) continue;
   return { base: "INR", asOf, sourceUrl, toInr };
  } catch { /* try the documented mirror */ }
 }
 return null;
}

export function rateBetween(
 snapshot: ExchangeRateSnapshot | null | undefined,
 fromCurrency: string | null | undefined,
 toCurrency: string | null | undefined,
): number | null {
 const from = String(fromCurrency ?? "").toUpperCase();
 const to = String(toCurrency ?? "").toUpperCase();
 if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
 if (from === to) return 1;
 if (!snapshot) return null;
 const fromInr = snapshot.toInr[from], toInr = snapshot.toInr[to];
 if (!Number.isFinite(fromInr) || !Number.isFinite(toInr) || fromInr <= 0 || toInr <= 0) return null;
 return fromInr / toInr;
}

export function conversionBetween(
 snapshot: ExchangeRateSnapshot | null | undefined,
 fromCurrency: string | null | undefined,
 toCurrency: string | null | undefined,
): CurrencyConversion | null {
 const rate = rateBetween(snapshot, fromCurrency, toCurrency);
 if (rate === null || !snapshot) return null;
 return {
  fromCurrency: String(fromCurrency).toUpperCase(),
  toCurrency: String(toCurrency).toUpperCase(),
  rate, asOf: snapshot.asOf, sourceUrl: snapshot.sourceUrl,
  provider: "fawazahmed0/exchange-api",
 };
}
