import type { Contact, Loan, Payment } from "../loans/balance.ts";
import type { Transaction } from "../../lib/types.ts";

const cents = (n: number) => Math.round(Number(n) * 100);

export interface OutItem { date: string; label: string; amount: number }
export interface OutGroup { key: string; title: string; total: number; items: OutItem[] }
export interface MoneyOut {
  /** What actually left your accounts this month. */
  groups: OutGroup[];
  total: number;
  /** Bought on a card this month and not paid from your account yet (it leaves with the card bill). */
  onCards: number;
}

/**
 * Money that left your accounts in a month, in one currency: spending paid directly, card bills and
 * loan EMIs/repayments. Card purchases are not counted here; they leave your account when the bill is paid.
 */
export function moneyOut(month: string, nextMonth: string, currency: string, txs: Transaction[], loans: Loan[], payments: Payment[], contacts: Contact[]): MoneyOut {
  const inMonth = (d: string) => d >= month && d < nextMonth;
  const name = (l: Loan) => l.account_name || contacts.find((c) => c.id === l.contact_id)?.name || "Loan";
  const groups: OutGroup[] = [];
  const add = (key: string, title: string, item: OutItem) => {
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, title, total: 0, items: [] }));
    g.items.push(item);
    g.total = (cents(g.total) + cents(item.amount)) / 100;
  };

  for (const t of txs) {
    if (t.kind !== "expense" || t.currency !== currency || !inMonth(t.occurred_on) || t.loan_id) continue;
    add("direct", "Spending paid directly", { date: t.occurred_on, label: t.description, amount: Number(t.amount) });
  }
  for (const p of payments) {
    const l = loans.find((x) => x.id === p.loan_id);
    if (!l || l.direction !== "borrowed" || l.currency !== currency || !inMonth(p.paid_on)) continue;
    const card = l.account_type === "credit_card";
    add(`${card ? "card" : "loan"}:${l.id}`, card ? `Card bill · ${name(l)}` : `${l.emi_amount || l.emi_schedule?.length ? "EMI" : "Repayment"} · ${name(l)}`, { date: p.paid_on, label: p.note || (card ? "Bill payment" : "Repayment"), amount: Number(p.amount) });
  }
  // Direct spending first, then card bills, then loans; biggest first within each.
  const rank = (g: OutGroup) => (g.key === "direct" ? 0 : g.key.startsWith("card") ? 1 : 2);
  groups.sort((a, b) => rank(a) - rank(b) || b.total - a.total);
  for (const g of groups) g.items.sort((a, b) => a.date.localeCompare(b.date));
  const onCards = txs
    .filter((t) => t.loan_id && t.currency === currency && inMonth(t.occurred_on) && t.kind !== "transfer")
    .reduce((s, t) => s + (t.kind === "expense" ? cents(t.amount) : -cents(t.amount)), 0) / 100;
  return { groups, total: groups.reduce((s, g) => s + cents(g.total), 0) / 100, onCards };
}
