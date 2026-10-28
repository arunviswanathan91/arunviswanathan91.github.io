import { useState, type FormEvent } from "react";
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { fmtDate, today } from "../../lib/dates.ts";
import { CURRENCIES, type BudgetCategory } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { confirmDanger, ErrorText, Field } from "../../components/ui.tsx";
import { formatMoney } from "../loans/balance.ts";
import { firstOn } from "./recurring.ts";
import { DateInput } from "../../../components/ui/DateInput";
import { CategorySelect } from "./CategorySelect.tsx";

export interface Recurring {
  id: string;
  kind: "income" | "expense";
  description: string;
  amount: number;
  currency: string;
  category_id: string | null;
  loan_id: string | null;
  payment_method: string | null;
  day_of_month: number;
  interval_months: number;
  next_on: string;
  ends_on: string | null;
  paused: boolean;
}

interface Card { id: string; account_name: string | null; card_last4: string | null; currency: string }

/** Rent, salary, subscriptions: posted to the budget automatically on their day each month. */
export function RecurringCard({ categories, currency }: { categories: BudgetCategory[]; currency: string }) {
  const { data, error } = useLoad(() => list<Recurring>("recurring", { order: [["next_on"]] }), []);
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const rows = data ?? [];
  return (
    <div className="card pad">
      <div className="section-head">
        <h3><Repeat size={14} /> Recurring</h3>
        <button className="small" onClick={() => setEditing("new")}><Plus size={13} /> Add</button>
      </div>
      <ErrorText error={error} />
      {rows.length === 0 ? <p className="muted small">Rent, salary, subscriptions and EMIs paid by auto-debit can be added here; they are posted on their day each month.</p> : (
        <ul className="mini-list recurring-list">
          {rows.map((r) => (
            <li key={r.id} className={r.paused ? "muted" : ""}>
              <span className="recurring-name">
                <strong>{r.description}</strong>
                <span className="muted small">{r.kind === "income" ? "+" : ""}{formatMoney(Number(r.amount), r.currency)} · day {r.day_of_month}{r.interval_months > 1 ? ` every ${r.interval_months} months` : ""} · {r.paused ? "paused" : `next ${fmtDate(r.next_on, { day: "numeric", month: "short" })}`}</span>
              </span>
              <span className="row">
                <button className="icon" aria-label={r.paused ? `Resume ${r.description}` : `Pause ${r.description}`} onClick={() => void update("recurring", r.id, { paused: !r.paused, next_on: r.paused && r.next_on < today() ? firstOn(today(), r.day_of_month) : r.next_on })}>{r.paused ? <Play size={13} /> : <Pause size={13} />}</button>
                <button className="icon" aria-label={`Edit ${r.description}`} onClick={() => setEditing(r)}><Pencil size={13} /></button>
                <button className="icon danger" aria-label={`Delete ${r.description}`} onClick={() => confirmDanger(`Stop “${r.description}”? Transactions already posted are kept.`) && void remove("recurring", { id: r.id })}><Trash2 size={13} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Modal wide title={editing === "new" ? "New recurring item" : "Edit recurring item"} onClose={() => setEditing(null)}>
          <RecurringForm item={editing === "new" ? undefined : editing} categories={categories} currency={currency} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function RecurringForm({ item, categories, currency, onDone }: { item?: Recurring; categories: BudgetCategory[]; currency: string; onDone: () => void }) {
  const { data: cards } = useLoad(() => list<Card>("loans", { eq: { account_type: "credit_card" } }), []);
  const [kind, setKind] = useState<Recurring["kind"]>(item?.kind ?? "expense");
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [cur, setCur] = useState(item?.currency ?? currency);
  const [categoryId, setCategoryId] = useState(item?.category_id ?? "");
  const [loanId, setLoanId] = useState(item?.loan_id ?? "");
  const [day, setDay] = useState(String(item?.day_of_month ?? Number(today().slice(8))));
  const [every, setEvery] = useState(String(item?.interval_months ?? 1));
  const [starts, setStarts] = useState(item?.next_on ?? today());
  const [ends, setEnds] = useState(item?.ends_on ?? "");
  const [error, setError] = useState("");
  const card = cards?.find((c) => c.id === loanId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const dom = Math.min(31, Math.max(1, Math.round(Number(day))));
    const values = {
      kind, description: description.trim(), amount: Number(amount), currency: card ? card.currency : cur,
      category_id: categoryId || null, loan_id: kind === "expense" ? loanId || null : null,
      day_of_month: dom, interval_months: Math.min(12, Math.max(1, Math.round(Number(every)))),
      next_on: firstOn(starts, dom), ends_on: ends || null,
    };
    try {
      if (item) await update("recurring", item.id, values);
      else await insert("recurring", values);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="segmented" role="radiogroup" aria-label="Type">
        {(["expense", "income"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setCategoryId(""); }}>{k === "expense" ? "Expense" : "Income"}</button>)}
      </div>
      <Field label="Description"><input required autoFocus value={description} placeholder={kind === "income" ? "e.g. Salary" : "e.g. Rent, Netflix"} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="Amount"><input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Currency">
          <select value={card ? card.currency : cur} disabled={!!card} onChange={(e) => setCur(e.target.value)}>
            {[...new Set([cur, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <CategorySelect value={categoryId} categories={categories} kind={kind === "income" ? "income" : "expense"} onChange={(id) => setCategoryId(id ?? "")} />
        </Field>
        {kind === "expense" && (cards?.length ?? 0) > 0 && (
          <Field label="Charged to card (optional)">
            <select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
              <option value="">Not a credit card</option>
              {cards!.map((c) => <option key={c.id} value={c.id}>{c.account_name || "Card"}{c.card_last4 ? ` ••${c.card_last4}` : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Day of month"><input required type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Every (months)"><input required type="number" min="1" max="12" value={every} onChange={(e) => setEvery(e.target.value)} /></Field>
        <Field label="First on or after"><DateInput required type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
        <Field label="Ends (optional)"><DateInput type="date" min={starts} value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
      </div>
      <p className="muted small">Posted to the budget on day {Math.min(31, Math.max(1, Number(day) || 1))} (or the month’s last day) from {fmtDate(firstOn(starts, Math.min(31, Math.max(1, Number(day) || 1))), { day: "numeric", month: "short", year: "numeric" })}. A past start date posts the missed months (at most 24) the next time the budget loads.</p>
      <ErrorText error={error} />
      <div className="form-actions"><button className="primary">{item ? "Save" : "Add"}</button></div>
    </form>
  );
}
