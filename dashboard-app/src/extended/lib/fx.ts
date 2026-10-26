// Exchange rates for "≈ total in <default currency>" lines. Free daily rates (fawazahmed0/exchange-api, the
// same source the opportunities feature uses), cached per day in this browser. Totals stay per currency;
// the converted figure is only an estimate shown next to them.
import { useEffect, useState } from "react";

export interface Fx {
  base: string;
  date: string;
  /** 1 base = rates[x] units of currency x (lower-case codes). */
  rates: Record<string, number>;
}

const urls = (b: string) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${b}.json`,
  `https://latest.currency-api.pages.dev/v1/currencies/${b}.json`,
];

export async function loadFx(base: string): Promise<Fx | null> {
  const b = base.toLowerCase();
  const key = `ws:fx:${b}:${new Date().toISOString().slice(0, 10)}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) return JSON.parse(hit) as Fx;
  } catch { /* storage unavailable */ }
  for (const url of urls(b)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      const fx: Fx = { base: base.toUpperCase(), date: String(j.date), rates: j[b] };
      if (!fx.rates || typeof fx.rates !== "object") continue;
      try { localStorage.setItem(key, JSON.stringify(fx)); } catch { /* ignore */ }
      return fx;
    } catch { /* try the next mirror */ }
  }
  return null;
}

/** Amount in `from` expressed in the base currency, or null when no rate is known. */
export function toBase(amount: number, from: string, fx: Fx): number | null {
  if (from.toUpperCase() === fx.base) return amount;
  const r = fx.rates[from.toLowerCase()];
  return r > 0 ? Math.round((amount / r) * 100) / 100 : null;
}

/** Sum of per-currency amounts in the base currency; null if any rate is missing. */
export function combine(amounts: Record<string, number>, fx: Fx): number | null {
  let total = 0;
  for (const [cur, v] of Object.entries(amounts)) {
    const x = toBase(v, cur, fx);
    if (x === null) return null;
    total += x;
  }
  return Math.round(total * 100) / 100;
}

/** Rates for `base`, fetched only when `needed` (i.e. more than one currency is on screen). */
export function useFx(base: string, needed: boolean): Fx | null {
  const [fx, setFx] = useState<Fx | null>(null);
  useEffect(() => {
    if (!needed) return;
    let live = true;
    void loadFx(base).then((r) => live && setFx(r));
    return () => { live = false; };
  }, [base, needed]);
  return needed ? fx : null;
}
