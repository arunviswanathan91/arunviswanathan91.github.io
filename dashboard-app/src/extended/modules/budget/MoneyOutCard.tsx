import { useState } from "react";
import { fmtDate } from "../../lib/dates.ts";
import type { Transaction } from "../../lib/types.ts";
import { formatMoney } from "../loans/balance.ts";
import { useLoans } from "../loans/useLoans.ts";
import { moneyOut } from "./moneyOut.ts";

/** Where the month's money actually went: direct spending, card bills and loan EMIs, each opening to its payments. */
export function MoneyOutCard({ month, nextMonth, currency, txs }: { month: string; nextMonth: string; currency: string; txs: Transaction[] }) {
  const { loans, payments, contacts } = useLoans();
  const [open, setOpen] = useState<string | null>(null);
  const out = moneyOut(month, nextMonth, currency, txs, loans, payments, contacts);
  const money = (n: number) => formatMoney(n, currency);
  return (
    <div className="card pad money-out">
      <h3>Money out this month</h3>
      {out.groups.length === 0 ? <p className="muted small">Nothing paid out yet this month.</p> : (
        <ul className="money-out-groups">
          {out.groups.map((g) => (
            <li key={g.key}>
              <button className="money-out-row" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)}>
                <span>{g.title}<span className="muted small"> · {g.items.length}</span></span>
                <strong>{money(g.total)}</strong>
              </button>
              {open === g.key && (
                <ul className="money-out-items">
                  {g.items.map((it, i) => (
                    <li key={i}><span className="muted">{fmtDate(it.date)}</span><span className="clamp">{it.label}</span><span className="num">{money(it.amount)}</span></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="stat-line net"><span>Total out</span><strong className="neg">{money(out.total)}</strong></div>
      {out.onCards !== 0 && <p className="muted small">Also {money(out.onCards)} bought on cards this month: it leaves your account when you pay those card bills, so it is not counted twice.</p>}
      <p className="muted small">Card bills and EMIs are paid in Loans &amp; cards. Category totals above only count what you spent, not these payments.</p>
    </div>
  );
}
