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

/** Rates for a past day (the API publishes one snapshot per date); falls back to the latest rates. `exact` says which. */
export async function loadFxOn(base: string, date: string): Promise<{ fx: Fx; exact: boolean } | null> {
  const b = base.toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= day) {
    const fx = await loadFx(base);
    return fx ? { fx, exact: date >= day } : null;
  }
  const key = `ws:fx:${b}:on:${date}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) return { fx: JSON.parse(hit) as Fx, exact: true };
  } catch { /* storage unavailable */ }
  for (const url of [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${b}.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/${b}.json`,
  ]) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j[b] || typeof j[b] !== "object") continue;
      const fx: Fx = { base: base.toUpperCase(), date: String(j.date), rates: j[b] };
      try { localStorage.setItem(key, JSON.stringify(fx)); } catch { /* ignore */ }
      return { fx, exact: true };
    } catch { /* try the next mirror */ }
  }
  const latest = await loadFx(base);
  return latest ? { fx: latest, exact: false } : null;
}

/** How many units of `to` one unit of `from` is worth, using rates whose base is `to`; null when unknown. */
export function rateFromBase(from: string, fx: Fx): number | null {
  if (from.toUpperCase() === fx.base) return 1;
  const r = fx.rates[from.toLowerCase()];
  return r > 0 ? 1 / r : null;
}

/** The pieces of a transaction needed to value it in the default currency. */
export interface Valued { amount: number; currency: string; base_currency?: string | null; base_amount?: number | null }

/** Value in `base`: as entered when already in `base`; else the amount stored with the transaction when it was
 *  saved (same base); else an estimate at the supplied rates; null when no rate is known. */
export function inBase(t: Valued, base: string, fx: Fx | null): number | null {
  const amount = Number(t.amount);
  if (t.currency.toUpperCase() === base.toUpperCase()) return amount;
  if (t.base_amount != null && t.base_currency?.toUpperCase() === base.toUpperCase()) return Number(t.base_amount);
  return fx ? toBase(amount, t.currency, fx) : null;
}

/** True when some transaction needs today's rates to be valued in `base`. */
export function needsFx(txs: Valued[], base: string): boolean {
  return txs.some((t) => t.currency.toUpperCase() !== base.toUpperCase() && !(t.base_amount != null && t.base_currency?.toUpperCase() === base.toUpperCase()));
}

/** Rate (units of `to` per 1 `from`) on a date, for the transaction form. */
export function useRateOn(from: string, to: string, date: string, enabled: boolean) {
  const [state, setState] = useState<{ rate: number | null; date: string; exact: boolean; loading: boolean }>({ rate: null, date: "", exact: true, loading: false });
  useEffect(() => {
    if (!enabled || from.toUpperCase() === to.toUpperCase()) { setState({ rate: from.toUpperCase() === to.toUpperCase() ? 1 : null, date: "", exact: true, loading: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    void loadFxOn(to, date).then((r) => {
      if (!live) return;
      setState(r ? { rate: rateFromBase(from, r.fx), date: r.fx.date, exact: r.exact, loading: false } : { rate: null, date: "", exact: true, loading: false });
    });
    return () => { live = false; };
  }, [from, to, date, enabled]);
  return state;
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
