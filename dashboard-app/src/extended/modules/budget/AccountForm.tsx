import { useState, type FormEvent } from "react";
import { insert, trash, update } from "../../lib/db.ts";
import { today } from "../../lib/dates.ts";
import { CURRENCIES, type SavingsAccount } from "../../lib/types.ts";
import { confirmDanger, ErrorText, Field } from "../../components/ui.tsx";
import { DateInput } from "../../../components/ui/DateInput";
import { deleteAccountError } from "./accounts.ts";

const BANKS = ["HDFC Bank", "SBI", "ICICI Bank", "Axis Bank", "Kotak", "Federal Bank", "SEB", "Swedbank", "Nordea", "Handelsbanken"];

export function AccountForm({ account, currency, banks, onDone }: { account?: SavingsAccount; currency: string; banks: string[]; onDone: () => void }) {
  const [bank, setBank] = useState(account?.bank_name ?? "");
  const [name, setName] = useState(account?.name ?? "Savings account");
  const [cur, setCur] = useState(account?.currency ?? currency);
  const [opening, setOpening] = useState(account ? String(account.opening_balance) : "0");
  const [openingOn, setOpeningOn] = useState(account?.opening_on ?? today());
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = { bank_name: bank.trim(), name: name.trim(), currency: cur, opening_balance: Number(opening) || 0, opening_on: openingOn, notes: notes.trim() || null };
    try {
      if (account) await update("savings_accounts", account.id, values);
      else await insert("savings_accounts", values);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function archive() {
    if (!account) return;
    try {
      await update("savings_accounts", account.id, { archived_at: account.archived_at ? null : new Date().toISOString() });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function del() {
    if (!account || !confirmDanger(`Move “${account.name}” to Trash? Only possible while it has no transactions — archive it otherwise. You can restore it from Trash.`)) return;
    try {
      await trash("savings_accounts", account.id);
      onDone();
    } catch (err) {
      setError(deleteAccountError((err as Error).message));
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="grid-2">
        <Field label="Bank name">
          <input autoFocus value={bank} list="bank-names" placeholder="e.g. HDFC Bank" onChange={(e) => setBank(e.target.value)} />
          <datalist id="bank-names">{[...new Set([...banks, ...BANKS])].map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Account name">
          <input required value={name} placeholder="Savings account" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Currency">
          <select value={cur} disabled={!!account} title={account ? "An account keeps its currency" : undefined} onChange={(e) => setCur(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Opening balance">
          <input type="number" inputMode="decimal" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </Field>
        <Field label="Balance as of">
          <DateInput required type="date" value={openingOn} onChange={(e) => setOpeningOn(e.target.value)} />
        </Field>
      </div>
      <p className="muted small">The balance is the opening balance plus the income, spending and transfers you record from that date. Transactions dated earlier are not counted.</p>
      <Field label="Notes (optional)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="form-actions">
        {account && <button type="button" onClick={() => void archive()}>{account.archived_at ? "Unarchive" : "Archive"}</button>}
        {account && <button type="button" className="danger-btn" onClick={() => void del()}>Delete</button>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : account ? "Save" : "Add account"}</button>
      </div>
    </form>
  );
}
