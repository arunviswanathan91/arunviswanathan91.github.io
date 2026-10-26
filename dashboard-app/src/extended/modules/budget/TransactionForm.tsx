import { useState, type FormEvent } from "react";
import { insert, remove, update } from "../../lib/db.ts";
import { today } from "../../lib/dates.ts";
import { CURRENCIES, type BudgetCategory, type Transaction } from "../../lib/types.ts";
import { confirmDanger, ErrorText, Field } from "../../components/ui.tsx";

export function TransactionForm({ tx, categories, currency, presetKind = "expense", onDone }: {
  tx?: Transaction;
  categories: BudgetCategory[];
  currency: string;
  presetKind?: Transaction["kind"];
  onDone: () => void;
}) {
  const [kind, setKind] = useState<Transaction["kind"]>(tx?.kind ?? presetKind);
  const [description, setDescription] = useState(tx?.description ?? "");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [cur, setCur] = useState(tx?.currency ?? currency);
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? "");
  const [date, setDate] = useState(tx?.occurred_on ?? today());
  const [method, setMethod] = useState(tx?.payment_method ?? "");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cats = categories.filter((c) => c.kind === kind && (!c.archived_at || c.id === categoryId));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = {
      kind,
      description: description.trim(),
      amount: Number(amount),
      currency: cur,
      category_id: kind === "transfer" ? null : categoryId || null,
      occurred_on: date,
      payment_method: method.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (tx) await update("transactions", tx.id, values);
      else await insert("transactions", values);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function del() {
    if (!tx || !confirmDanger(`Delete “${tx.description}”?`)) return;
    await remove("transactions", { id: tx.id });
    onDone();
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented three" role="radiogroup" aria-label="Type">
        {(["expense", "income", "transfer"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setCategoryId(""); }}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <Field label="Description">
        <input required autoFocus value={description} placeholder={kind === "transfer" ? "e.g. To savings account" : "e.g. ICA groceries"} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Amount">
          <input required type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Currency">
          <select value={cur} onChange={(e) => setCur(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        {kind !== "transfer" && (
          <Field label="Category">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorised</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date">
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Payment method (optional)">
          <input value={method} list="payment-methods" placeholder="Card, Swish, cash…" onChange={(e) => setMethod(e.target.value)} />
          <datalist id="payment-methods">{["Card", "Swish", "Cash", "Bank transfer", "Autogiro"].map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="form-actions">
        {tx && <button type="button" className="danger-btn" onClick={() => void del()}>Delete</button>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : tx ? "Save" : "Add"}</button>
      </div>
    </form>
  );
}

