import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase.ts";
import { formatMoney, todayISO, type Loan } from "./balance.ts";
import { DateInput } from "../../../components/ui/DateInput";
import type { SavingsAccount } from "../../lib/types.ts";
import { accountLabel, selectableAccounts } from "../budget/accounts.ts";

export interface QuickAmount {
  label: string;
  amount: number;
}

export function PaymentForm({ loan, left, quick = [], onDone }: { loan: Loan; left: number; quick?: QuickAmount[]; onDone: () => void }) {
  const [amount, setAmount] = useState(String(quick[0]?.amount ?? left));
  const [paidOn, setPaidOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [accountId, setAccountId] = useState("");

  // Only a borrowed loan or card is paid out of your own money, and only from an account in the same currency.
  useEffect(() => {
    if (!supabase || loan.direction !== "borrowed") return;
    void supabase.from("savings_accounts").select("*").order("bank_name").order("name").then(({ data }) => {
      setAccounts(selectableAccounts((data ?? []) as SavingsAccount[]).filter((a) => a.currency === loan.currency));
    });
  }, [loan.direction, loan.currency]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("loan_payments").insert({ loan_id: loan.id, amount: Number(amount), paid_on: paidOn, note: note.trim() || null, account_id: accountId || null });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">Outstanding: <strong>{formatMoney(left, loan.currency)}</strong></p>
      {quick.length > 0 && (
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
          <input required autoFocus type="number" inputMode="decimal" min="0.01" max={left} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
      {accounts.length > 0 && (
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
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
    </form>
  );
}

