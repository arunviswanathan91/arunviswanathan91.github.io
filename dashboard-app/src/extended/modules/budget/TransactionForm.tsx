import { useEffect, useState, type FormEvent } from "react";
import { insert, list, trash, update, useLoad } from "../../lib/db.ts";
import { fmtDate, today } from "../../lib/dates.ts";
import { CURRENCIES, type BudgetCategory, type SavingsAccount, type Transaction } from "../../lib/types.ts";
import { useRateOn } from "../../lib/fx.ts";
import { formatMoney } from "../loans/balance.ts";
import { accountLabel, selectableAccounts } from "./accounts.ts";
import { confirmDanger, ErrorText, Field } from "../../components/ui.tsx";
import { ForSelect, usePeople } from "./ForSelect.tsx";
import { DateInput } from "../../../components/ui/DateInput";
import { CategorySelect } from "./CategorySelect.tsx";

interface Card {
  id: string;
  account_name: string | null;
  card_last4: string | null;
  currency: string;
}

export function TransactionForm({ tx, categories, currency, presetKind = "expense", presetLoanId, presetFor, presetDescription, presetAccountId, onDone }: {
  tx?: Transaction;
  categories: BudgetCategory[];
  currency: string;
  presetKind?: Transaction["kind"];
  /** Pre-select a credit card, e.g. from the card's "Add spend" button. */
  presetLoanId?: string;
  /** Pre-select the friend, e.g. from "Justin paid back". */
  presetFor?: string;
  presetDescription?: string;
  /** Pre-select a savings account. */
  presetAccountId?: string;
  onDone: () => void;
}) {
  const { data: cards } = useLoad(() => list<Card>("loans", { eq: { account_type: "credit_card" }, order: [["account_name"]] }), []);
  const { data: accounts } = useLoad(() => list<SavingsAccount>("savings_accounts", { order: [["bank_name"], ["name"]] }), []);
  const [accountId, setAccountId] = useState(tx?.account_id ?? presetAccountId ?? "");
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id ?? "");
  const [toAmount, setToAmount] = useState(tx?.to_amount != null ? String(tx.to_amount) : "");
  const [toTouched, setToTouched] = useState(tx?.to_amount != null);
  const [baseAmount, setBaseAmount] = useState(tx?.base_amount != null && tx.base_currency === currency ? String(tx.base_amount) : "");
  const [baseTouched, setBaseTouched] = useState(tx?.base_amount != null && tx.base_currency === currency);
  const account = accounts?.find((a) => a.id === accountId);
  const toAccount = accounts?.find((a) => a.id === toAccountId);
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
  // A savings account fixes the currency too (its balance is kept in that currency).
  useEffect(() => { if (account && account.currency !== cur) setCur(account.currency); }, [account, cur]);
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? "");
  const [date, setDate] = useState(tx?.occurred_on ?? today());
  const [method, setMethod] = useState(tx?.payment_method ?? "");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cats = categories.filter((c) => c.kind === kind && (!c.archived_at || c.id === categoryId));

  // Foreign-currency income/spending is stored with its value in the default currency (INR) at that day's rate.
  const foreign = kind !== "transfer" && cur !== currency;
  const rate = useRateOn(cur, currency, date, foreign);
  useEffect(() => {
    if (!foreign) { setBaseAmount(""); setBaseTouched(false); return; }
    const n = Number(amount);
    if (rate.rate && !baseTouched && n > 0) setBaseAmount(String(Math.round(n * rate.rate * 100) / 100));
  }, [foreign, rate.rate, amount, baseTouched]);
  // A transfer into an account in another currency needs the amount that arrived.
  const crossTransfer = kind === "transfer" && !!toAccount && toAccount.currency !== cur;
  const rateTo = useRateOn(cur, toAccount?.currency ?? cur, date, crossTransfer);
  useEffect(() => {
    if (!crossTransfer) return;
    const n = Number(amount);
    if (rateTo.rate && !toTouched && n > 0) setToAmount(String(Math.round(n * rateTo.rate * 100) / 100));
  }, [crossTransfer, rateTo.rate, amount, toTouched]);
  const baseNote = rate.loading ? "Fetching the exchange rate…"
    : rate.rate ? `1 ${cur} = ${formatMoney(rate.rate, currency)} at the rate of ${rate.date ? fmtDate(rate.date) : "today"}${rate.exact ? "" : " (that day’s rate wasn’t available, so the latest is used)"}. Change it if your bank charged a different amount.`
    : `No exchange rate available right now. Enter the amount in ${currency} yourself, or leave it empty and it will be estimated from the rate of the day you view it.`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "transfer" && accountId && accountId === toAccountId) return setError("Choose two different accounts.");
    if (crossTransfer && !(Number(toAmount) > 0)) return setError(`Enter the amount that arrived in ${toAccount!.currency}.`);
    setBusy(true);
    const baseValue = foreign && Number(baseAmount) > 0 ? Number(baseAmount) : null;
    const values = {
      kind,
      description: description.trim(),
      amount: Number(amount),
      currency: cur,
      category_id: kind === "transfer" ? null : categoryId || null,
      occurred_on: date,
      payment_method: method.trim() || (card ? cardLabel(card) : null),
      notes: notes.trim() || null,
      loan_id: kind === "transfer" || accountId ? null : loanId || null,
      account_id: accountId || null,
      to_account_id: kind === "transfer" ? toAccountId || null : null,
      to_amount: crossTransfer ? Number(toAmount) : null,
      base_currency: baseValue ? currency : null,
      base_amount: baseValue,
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
    if (!tx || !confirmDanger(`Move “${tx.description}” to Trash? You can restore it from Trash.`)) return;
    await trash("transactions", tx.id);
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
          <input required type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setBaseTouched(false); setToTouched(false); }} />
        </Field>
        <Field label="Currency">
          <select value={cur} disabled={!!card || !!account} title={card ? "Card spending uses the card's currency" : account ? "This account is in " + account.currency : undefined} onChange={(e) => { setCur(e.target.value); setBaseTouched(false); }}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        {kind !== "transfer" && (
          <Field label="Category">
            <CategorySelect value={categoryId} categories={categories} kind={kind === "income" ? "income" : "expense"} onChange={(id) => setCategoryId(id ?? "")} />
          </Field>
        )}
        <Field label="Date">
          <DateInput required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {(accounts?.length ?? 0) > 0 && (
          <Field label={kind === "income" ? "Into account (optional)" : kind === "transfer" ? "From account" : "Paid from account (optional)"}>
            <select value={accountId} onChange={(e) => { setAccountId(e.target.value); if (e.target.value) setLoanId(""); }}>
              <option value="">{kind === "transfer" ? "Not from a tracked account" : "No savings account"}</option>
              {selectableAccounts(accounts!, tx?.account_id).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} ({a.currency})</option>)}
            </select>
          </Field>
        )}
        {kind === "transfer" && (accounts?.length ?? 0) > 0 && (
          <Field label="To account">
            <select value={toAccountId} onChange={(e) => { setToAccountId(e.target.value); setToTouched(false); }}>
              <option value="">Not to a tracked account</option>
              {selectableAccounts(accounts!, tx?.to_account_id).filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} ({a.currency})</option>)}
            </select>
          </Field>
        )}
        {crossTransfer && (
          <Field label={`Amount received (${toAccount!.currency})`}>
            <input required type="number" inputMode="decimal" min="0.01" step="0.01" value={toAmount} placeholder={rateTo.loading ? "Fetching rate…" : ""} onChange={(e) => { setToAmount(e.target.value); setToTouched(true); }} />
          </Field>
        )}
        {kind !== "transfer" && !accountId && (cards?.length ?? 0) > 0 && (
          <Field label={kind === "income" ? "Refund to card (optional)" : "Paid with card (optional)"}>
            <select value={loanId} onChange={(e) => { setLoanId(e.target.value); if (e.target.value) setAccountId(""); const c = cards?.find((x) => x.id === e.target.value); if (c) setCur(c.currency); }}>
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
      {foreign && (
        <div className="fx-box">
          <Field label={`Amount in ${currency}`}>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={baseAmount} placeholder={rate.loading ? "Fetching rate…" : ""} onChange={(e) => { setBaseAmount(e.target.value); setBaseTouched(true); }} />
          </Field>
          <p className="muted small">{baseNote}</p>
        </div>
      )}
      {account && <p className="muted small">{kind === "income" ? "Adds to" : "Comes out of"} {accountLabel(account)} ({account.currency}).</p>}
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
