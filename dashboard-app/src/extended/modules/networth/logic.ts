// Net worth at each month end, rebuilt from history already in the workspace:
// savings accounts (opening balance and every dated entry after it, as ws_account_balances
// computes today's balance) plus money you lent, minus loans and card balances you owe
// (amount from the day it started, card spending and repayments up to that date).
// Values in other currencies are converted at today's rates.

export interface NwAccount { id: string; currency: string; opening_balance: number; opening_on: string }
export interface NwTx {
  kind: "income" | "expense" | "transfer"; amount: number; occurred_on: string;
  account_id?: string | null; to_account_id?: string | null; to_amount?: number | null; loan_id?: string | null;
}
export interface NwLoan { id: string; direction: "lent" | "borrowed"; amount: number; currency: string; issued_on: string; draws?: { on: string; amount: number }[] | null }
export interface NwPayment { loan_id: string; amount: number; paid_on: string; account_id?: string | null }

export interface NwPoint {
  /** Month end (or today, for the current month). */
  date: string;
  /** Per currency. */
  accounts: Record<string, number>;
  owedToYou: Record<string, number>;
  debts: Record<string, number>;
}

const c = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
const add = (m: Record<string, number>, cur: string, cents: number) => { if (cents) m[cur] = (m[cur] ?? 0) + cents; };
const toMoney = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 0).map(([k, v]) => [k, v / 100]));

/** Account balance on `day`: same rule as ws_account_balances, limited to entries on or before `day`. */
export function accountBalanceOn(a: NwAccount, txs: NwTx[], payments: NwPayment[], day: string): number {
  if (day < a.opening_on) return 0;
  let cents = c(a.opening_balance);
  for (const t of txs) {
    if (t.occurred_on < a.opening_on || t.occurred_on > day) continue;
    if (t.account_id === a.id) cents += t.kind === "income" ? c(t.amount) : -c(t.amount);
    else if (t.to_account_id === a.id) cents += c(t.to_amount ?? t.amount);
  }
  for (const p of payments) if (p.account_id === a.id && p.paid_on >= a.opening_on && p.paid_on <= day) cents -= c(p.amount);
  return cents / 100;
}

/** What is still outstanding on a loan or card on `day` (never below zero), 0 before it started. */
export function loanRemainingOn(l: NwLoan, txs: NwTx[], payments: NwPayment[], day: string): number {
  if (day < l.issued_on) return 0;
  // A loan built up over time counts each amount from its own date.
  let cents = l.draws?.length ? l.draws.filter((d) => d.on <= day).reduce((s, d) => s + c(d.amount), 0) : c(l.amount);
  for (const t of txs) if (t.loan_id === l.id && t.occurred_on <= day) cents += t.kind === "income" ? -c(t.amount) : t.kind === "expense" ? c(t.amount) : 0;
  for (const p of payments) if (p.loan_id === l.id && p.paid_on <= day) cents -= c(p.amount);
  return Math.max(0, cents) / 100;
}

/** Last day of each month from `from`'s month to `today`'s (today itself for the current month). */
export function monthEnds(from: string, today: string, max = 36): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
  while (y < ty || (y === ty && m <= tm)) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    out.push(y === ty && m === tm ? today : last);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.slice(-max);
}

export function netWorthSeries(data: { accounts: NwAccount[]; txs: NwTx[]; loans: NwLoan[]; payments: NwPayment[] }, today: string, max = 36): NwPoint[] {
  const starts = [...data.accounts.map((a) => a.opening_on), ...data.loans.map((l) => l.issued_on)].filter(Boolean).sort();
  if (!starts.length) return [];
  return monthEnds(starts[0] < today ? starts[0] : today, today, max).map((date) => {
    const accounts: Record<string, number> = {}, owedToYou: Record<string, number> = {}, debts: Record<string, number> = {};
    for (const a of data.accounts) add(accounts, a.currency, c(accountBalanceOn(a, data.txs, data.payments, date)));
    for (const l of data.loans) add(l.direction === "lent" ? owedToYou : debts, l.currency, c(loanRemainingOn(l, data.txs, data.payments, date)));
    return { date, accounts: toMoney(accounts), owedToYou: toMoney(owedToYou), debts: toMoney(debts) };
  });
}

/** One number per point in `base`, using `convert` (null when a rate is missing). */
export function totals(p: NwPoint, convert: (amounts: Record<string, number>) => number | null) {
  const accounts = convert(p.accounts), owedToYou = convert(p.owedToYou), debts = convert(p.debts);
  const net = accounts === null || owedToYou === null || debts === null ? null : Math.round((accounts + owedToYou - debts) * 100) / 100;
  return { accounts, owedToYou, debts, net };
}
