import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase.ts";
import { formatMoney, todayISO, type Loan, type Payment } from "./balance.ts";
import { DateInput } from "../../../components/ui/DateInput";
import type { SavingsAccount } from "../../lib/types.ts";
import { accountLabel, selectableAccounts } from "../budget/accounts.ts";
import { ForSelect, usePeople } from "../budget/ForSelect.tsx";

export interface QuickAmount {
  label: string;
  amount: number;
}

/** Record a repayment, or change one already recorded (`payment`). */
export function PaymentForm({ loan, left, quick = [], payment, onDone }: { loan: Loan; left: number; quick?: QuickAmount[]; payment?: Payment; onDone: () => void }) {
  const [amount, setAmount] = useState(String(payment?.amount ?? quick[0]?.amount ?? left));
  const [paidOn, setPaidOn] = useState(payment?.paid_on ?? todayISO());
  const [note, setNote] = useState(payment?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [accountId, setAccountId] = useState(payment?.account_id ?? "");
  const [paidBy, setPaidBy] = useState<string | null>(payment?.for_contact_id ?? null);
  const people = usePeople();
  const borrowed = loan.direction === "borrowed";
  // When editing, the payment's own amount is still available to re-enter.
  const max = Math.round((left + (payment?.amount ?? 0)) * 100) / 100;

  // Only a borrowed loan or card is paid out of your own money, and only from an account in the same currency.
  useEffect(() => {
    if (!supabase || !borrowed) return;
    void supabase.from("savings_accounts").select("*").order("bank_name").order("name").then(({ data }) => {
      setAccounts(selectableAccounts((data ?? []) as SavingsAccount[]).filter((a) => a.currency === loan.currency));
    });
  }, [borrowed, loan.currency]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const row = {
      amount: Number(amount),
      paid_on: paidOn,
      note: note.trim() || null,
      account_id: paidBy ? null : accountId || null,
      // Only sent when set, so recording a payment still works before friend-card-payments.sql has run.
      ...(paidBy || payment?.for_contact_id ? { for_contact_id: paidBy } : {}),
    };
    const { error } = payment
      ? await supabase.from("loan_payments").update(row).eq("id", payment.id)
      : await supabase.from("loan_payments").insert({ loan_id: loan.id, ...row });
    setBusy(false);
    if (error) setError(/for_contact_id/.test(error.message) ? "Run supabase/friend-card-payments.sql to record payments made by a friend." : error.message);
    else onDone();
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">Outstanding: <strong>{formatMoney(left, loan.currency)}</strong></p>
      {quick.length > 0 && !payment && (
        <div className="segmented" role="group" aria-label="Quick amounts">
          {quick.map((q) => (
            <button key={q.label} type="button" className={Number(amount) === q.amount ? "on" : ""} onClick={() => setAmount(String(q.amount))}>
              {q.label} · {formatMoney(q.amount, loan.currency)}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <label className="grow">
          Amount ({loan.currency})
          <input required autoFocus type="number" inputMode="decimal" min="0.01" max={max} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="grow">
          Date
          <DateInput required type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
      </div>
      <label>
        Note (optional)
        <input value={note} placeholder="e.g. Swish, bank transfer" onChange={(e) => setNote(e.target.value)} />
      </label>
      {borrowed && (
        <label>
          Paid by
          <ForSelect label="Paid by" value={paidBy} people={people} onChange={setPaidBy} />
          {paidBy && <span className="muted small">Counts as {people.find((p) => p.id === paidBy)?.name ?? "them"} paying you back: it comes off what they owe in Budget → Spent for friends, and is not your own money out.</span>}
        </label>
      )}
      {accounts.length > 0 && !paidBy && (
        <label>
          Paid from savings account (optional)
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Not from a tracked account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} ({a.currency})</option>)}
          </select>
          <span className="muted small">Lowers that account’s balance. It is a payment, not a budget expense, so it is not added to what you spent.</span>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : payment ? "Save changes" : "Record payment"}</button>
    </form>
  );
}
