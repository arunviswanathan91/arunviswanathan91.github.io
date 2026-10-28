import { formatMoney } from "../loans/balance.ts";
import { fmtDate } from "../../lib/dates.ts";
import type { BudgetCategory, Transaction } from "../../lib/types.ts";

const cents = (n: number) => Math.round(Number(n) * 100);

/** What each friend owes you: spends paid for them minus what they paid back, per currency. */
export function friendBalances(txs: Transaction[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const t of txs) {
    if (!t.for_contact_id || t.kind === "transfer") continue;
    const per = out.get(t.for_contact_id) ?? {};
    per[t.currency] = (per[t.currency] ?? 0) + (t.kind === "expense" ? cents(t.amount) : -cents(t.amount));
    out.set(t.for_contact_id, per);
  }
  for (const per of out.values()) for (const c of Object.keys(per)) per[c] /= 100;
  return out;
}

/** A plain-text note to send the friend: this month's spends by category and what is owed in total. */
export function friendSummary(name: string, monthLabel: string, monthTxs: Transaction[], categories: BudgetCategory[], owed: Record<string, number>): string {
  const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";
  const spends = monthTxs.filter((t) => t.kind === "expense").sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const paidBack = monthTxs.filter((t) => t.kind === "income");
  const groups = new Map<string, Transaction[]>();
  for (const t of spends) groups.set(cat(t.category_id), [...(groups.get(cat(t.category_id)) ?? []), t]);
  const lines = [`Hi ${name}, your share for ${monthLabel}:`];
  for (const [group, list] of groups) {
    lines.push("", `${group}:`);
    for (const t of list) lines.push(`  ${fmtDate(t.occurred_on)} · ${t.description} · ${formatMoney(Number(t.amount), t.currency)}`);
  }
  if (!spends.length) lines.push("", "No new spends this month.");
  for (const t of paidBack) lines.push("", `Paid back ${fmtDate(t.occurred_on)}: ${formatMoney(Number(t.amount), t.currency)}`);
  const total = Object.entries(owed).filter(([, v]) => Math.abs(v) >= 0.01);
  lines.push("", total.length ? `Total you owe: ${total.map(([c, v]) => formatMoney(v, c)).join(" + ")}` : "All settled. Thanks!");
  return lines.join("\n");
}
