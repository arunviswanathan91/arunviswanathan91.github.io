import { useEffect, useState, type FormEvent } from "react";
import { insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { today } from "../../lib/dates.ts";
import { CURRENCIES, type BudgetCategory, type Transaction } from "../../lib/types.ts";
import { confirmDanger, ErrorText, Field } from "../../components/ui.tsx";
import { ForSelect, usePeople } from "./ForSelect.tsx";
import { DateInput } from "../../../components/ui/DateInput";

interface Card {
  id: string;
  account_name: string | null;
  card_last4: string | null;
  currency: string;
}

export function TransactionForm({ tx, categories, currency, presetKind = "expense", presetLoanId, presetFor, presetDescription, onDone }: {
  tx?: Transaction;
  categories: BudgetCategory[];
  currency: string;
  presetKind?: Transaction["kind"];
  /** Pre-select a credit card, e.g. from the card's "Add spend" button. */
  presetLoanId?: string;
  /** Pre-select the friend, e.g. from "Justin paid back". */
  presetFor?: string;
  presetDescription?: string;
  onDone: () => void;
}) {
  const { data: cards } = useLoad(() => list<Card>("loans", { eq: { account_type: "credit_card" }, order: [["account_name"]] }), []);
  const [loanId, setLoanId] = useState(tx?.loan_id ?? presetLoanId ?? "");
  const card = cards?.find((c) => c.id === loanId);
  const [kind, setKind] = useState<Transaction["kind"]>(tx?.kind ?? presetKind);
  const [description, setDescription] = useState(tx?.description ?? presetDescription ?? "");
  const people = usePeople();
  const [forId, setForId] = useState<string | null>(tx?.for_contact_id ?? presetFor ?? null);
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [cur, setCur] = useState(tx?.currency ?? currency);
  // Card spending is always in the card's currency (also when the card was preset).
  useEffect(() => { if (card && card.currency !== cur) setCur(card.currency); }, [card, cur]);
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
      payment_method: method.trim() || (card ? cardLabel(card) : null),
      notes: notes.trim() || null,
      loan_id: kind === "transfer" ? null : loanId || null,
      for_contact_id: kind === "transfer" ? null : forId,
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
          <select value={cur} disabled={!!card} title={card ? "Card spending uses the card's currency" : undefined} onChange={(e) => setCur(e.target.value)}>
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
          <DateInput required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {kind !== "transfer" && (cards?.length ?? 0) > 0 && (
          <Field label={kind === "income" ? "Refund to card (optional)" : "Paid with card (optional)"}>
            <select value={loanId} onChange={(e) => { setLoanId(e.target.value); const c = cards?.find((x) => x.id === e.target.value); if (c) setCur(c.currency); }}>
              <option value="">Not a credit card</option>
              {cards!.map((c) => <option key={c.id} value={c.id}>{cardLabel(c)}</option>)}
            </select>
          </Field>
        )}
        {kind !== "transfer" && (
          <Field label={kind === "income" ? "From (a friend paying you back)" : "For (who it was for)"}>
            <ForSelect value={forId} people={people} onChange={setForId} />
          </Field>
        )}
        <Field label="Payment method (optional)">
          <input value={method} list="payment-methods" placeholder="Card, Swish, cash…" onChange={(e) => setMethod(e.target.value)} />
          <datalist id="payment-methods">{["Card", "Swish", "Cash", "Bank transfer", "Autogiro"].map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
      </div>
      {forId && <p className="muted small">{kind === "income" ? "Lowers what" : "Adds to what"} {people.find((p) => p.id === forId)?.name ?? "they"} {kind === "income" ? "owes you" : "owes you, and stays out of your own budget"}.</p>}
      {card && <p className="muted small">{kind === "income" ? "Lowers" : "Adds to"} the balance of {cardLabel(card)} in Loans &amp; cards. Pay the card bill there, not as a budget expense, so it isn’t counted twice.</p>}
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


function cardLabel(c: Card): string {
  return `${c.account_name || "Card"}${c.card_last4 ? ` ••${c.card_last4}` : ""}`;
}
