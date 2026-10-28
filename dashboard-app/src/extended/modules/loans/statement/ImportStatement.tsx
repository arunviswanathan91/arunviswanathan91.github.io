import { useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import { supabase } from "../../../lib/supabase.ts";
import { emitChange, insertMany } from "../../../lib/db.ts";
import type { BudgetCategory } from "../../../lib/types.ts";
import { formatMoney, type Charge, type Loan, type Payment } from "../balance.ts";
import { parseStatement, type ParsedStatement, type RowKind } from "./parse.ts";
import { balanceOn, planImport, statementAddsUp, type ImportRow } from "./plan.ts";
import { PdfPasswordError, readPdfLines } from "./readPdf.ts";
import { DateInput } from "../../../../components/ui/DateInput";
import { fmtDate } from "../../../lib/dates.ts";

const KIND_LABEL: Record<RowKind, string> = { spend: "Purchase", fee: "Interest / fee", payment: "Payment", refund: "Refund / credit" };
const KIND_TONE: Record<RowKind, string> = { spend: "", fee: "warn", payment: "pos", refund: "pos" };

/**
 * Read a card statement PDF on the device, show what it found, and add what's missing:
 * purchases and fees as card spending, refunds as card credits, bill payments as repayments,
 * and the statement's totals and dates on the card.
 */
export function ImportStatement({ loan, charges, payments, categories, onDone }: {
  loan: Loan;
  charges: Charge[];
  payments: Payment[];
  categories: BudgetCategory[];
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const cardCharges = useMemo(() => charges.filter((c) => c.loan_id === loan.id), [charges, loan.id]);
  const cardPayments = useMemo(() => payments.filter((p) => p.loan_id === loan.id), [payments, loan.id]);

  async function read(e?: FormEvent) {
    e?.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = parseStatement(await readPdfLines(file, password || undefined));
      if (!result.rows.length && result.totalDue == null) throw new Error("No statement details found in this PDF. Is it a credit-card statement?");
      setParsed(result);
    } catch (err) {
      if (err instanceof PdfPasswordError) setNeedsPassword(true);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (parsed) return <Preview loan={loan} parsed={parsed} charges={cardCharges} payments={cardPayments} categories={categories} onBack={() => setParsed(null)} onDone={onDone} />;

  return (
    <form className="form" onSubmit={read}>
      <p className="muted small">
        Choose the statement PDF from your bank. It is read in this browser and never uploaded. You can check every line before anything is saved.
      </p>
      <button type="button" onClick={() => input.current?.click()}><FileUp size={15} /> {file ? file.name : "Choose statement PDF…"}</button>
      <input ref={input} type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); setNeedsPassword(false); }} />
      {needsPassword && (
        <label>PDF password<input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Usually set by the bank, e.g. name + date of birth" /></label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={!file || busy || (needsPassword && !password)}>{busy ? "Reading…" : "Read statement"}</button>
      </div>
    </form>
  );
}

function Preview({ loan, parsed, charges, payments, categories, onBack, onDone }: {
  loan: Loan;
  parsed: ParsedStatement;
  charges: Charge[];
  payments: Payment[];
  categories: BudgetCategory[];
  onBack: () => void;
  onDone: () => void;
}) {
  const money = (n: number) => formatMoney(n, loan.currency);
  const [rows, setRows] = useState<ImportRow[]>(() => planImport(parsed, loan, charges, payments, categories));
  const [totalDue, setTotalDue] = useState(parsed.totalDue?.toFixed(2) ?? "");
  const [minimumDue, setMinimumDue] = useState(parsed.minimumDue?.toFixed(2) ?? "");
  const [statementOn, setStatementOn] = useState(parsed.statementDate ?? "");
  const [dueOn, setDueOn] = useState(parsed.dueDate ?? "");
  const [creditLimit, setCreditLimit] = useState(parsed.creditLimit?.toFixed(2) ?? (loan.credit_limit != null ? String(loan.credit_limit) : ""));
  const [updateCard, setUpdateCard] = useState(parsed.totalDue != null);
  const [adjust, setAdjust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const expense = categories.filter((c) => c.kind === "expense" && !c.archived_at);
  const addsUp = statementAddsUp(parsed);
  const otherCard = loan.card_last4 && parsed.cardLast4.length > 0 && !parsed.cardLast4.includes(loan.card_last4) ? parsed.cardLast4.join(", ") : null;
  const ticked = rows.filter((r) => r.include);
  const dupes = rows.filter((r) => r.skip === "duplicate").length;
  const early = rows.filter((r) => r.skip === "before_tracking").length;

  // How far the card would be from the statement after this import.
  const due = totalDue === "" ? null : Number(totalDue);
  // Only meaningful when the card was being tracked by the statement date; a card added later
  // starts from a balance that is already newer than the statement.
  const after = statementOn && loan.issued_on <= statementOn ? balanceOn(statementOn, loan, charges, payments, rows) : null;
  const gap = due != null && after != null ? Math.round((due - after) * 100) / 100 : 0;

  const set = (key: number, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const label = `${loan.account_name || "Card"}${loan.card_last4 ? ` ••${loan.card_last4}` : ""}`;
  const note = `From statement${statementOn ? ` ${statementOn}` : ""}`;

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const spending = ticked.filter((r) => r.kind !== "payment").map((r) => ({
        kind: r.credit ? "income" : "expense",
        description: r.description,
        amount: r.amount,
        currency: loan.currency,
        category_id: r.categoryId,
        occurred_on: r.date,
        payment_method: label,
        notes: note,
        loan_id: loan.id,
      }));
      if (adjust && Math.abs(gap) >= 0.01 && statementOn) {
        spending.push({ kind: gap > 0 ? "expense" : "income", description: "Adjustment to match the statement", amount: Math.abs(gap), currency: loan.currency, category_id: null, occurred_on: statementOn, payment_method: label, notes: note, loan_id: loan.id });
      }
      await insertMany("transactions", spending);
      const paid = ticked.filter((r) => r.kind === "payment").map((r) => ({ loan_id: loan.id, amount: r.amount, paid_on: r.date, note }));
      if (paid.length) {
        const { error: e } = await supabase.from("loan_payments").insert(paid);
        if (e) throw new Error(e.message);
      }
      if (updateCard) {
        const { error: e } = await supabase.from("loans").update({
          statement_amount: due,
          minimum_due: minimumDue === "" ? null : Number(minimumDue),
          statement_on: statementOn || null,
          statement_due_on: dueOn || null,
          credit_limit: creditLimit === "" ? loan.credit_limit ?? null : Number(creditLimit),
          card_last4: loan.card_last4 || (parsed.cardLast4.length === 1 ? parsed.cardLast4[0] : null),
        }).eq("id", loan.id);
        if (e) throw new Error(e.message);
      }
      emitChange();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="form statement-import">
      <p className="small">
        <strong>{parsed.bank ?? "Statement"}</strong>
        {parsed.cardLast4.length > 0 && <> · card ••{parsed.cardLast4.join(", ••")}</>}
        {parsed.periodFrom && parsed.periodTo && <> · {fmtDate(parsed.periodFrom)} to {fmtDate(parsed.periodTo)}</>}
      </p>
      {otherCard && <p className="notice warn-notice"><TriangleAlert size={14} /> This statement is for card ••{otherCard}, but this card is ••{loan.card_last4}. Check you picked the right card.</p>}
      {addsUp && (addsUp.ok
        ? <p className="small pos"><CheckCircle2 size={14} /> All transactions found: previous balance {money(parsed.previousBalance!)} + purchases − credits = total amount due {money(addsUp.expected)}.</p>
        : <p className="small neg"><TriangleAlert size={14} /> The transactions found add up to {money(addsUp.listed)}, not the total amount due {money(addsUp.expected)}. Some lines may not have been read; check against the PDF.</p>)}

      <div className="form-group" role="group" aria-label="Statement summary">
        <label className="row-check"><input type="checkbox" checked={updateCard} onChange={(e) => setUpdateCard(e.target.checked)} /> Update the card with this statement</label>
        <div className="grid-2">
          <label>Total amount due<input type="number" step="0.01" min="0" value={totalDue} disabled={!updateCard} onChange={(e) => setTotalDue(e.target.value)} /></label>
          <label>Minimum amount due<input type="number" step="0.01" min="0" value={minimumDue} disabled={!updateCard} onChange={(e) => setMinimumDue(e.target.value)} /></label>
          <label>Statement date<DateInput type="date" value={statementOn} disabled={!updateCard} onChange={(e) => setStatementOn(e.target.value)} /></label>
          <label>Payment due date<DateInput type="date" value={dueOn} min={statementOn} disabled={!updateCard} onChange={(e) => setDueOn(e.target.value)} /></label>
          <label>Credit limit<input type="number" step="0.01" min="0" value={creditLimit} disabled={!updateCard} onChange={(e) => setCreditLimit(e.target.value)} /></label>
          {parsed.availableCredit != null && <p className="small muted">Available credit on the statement: {money(parsed.availableCredit)}</p>}
        </div>
      </div>

      <p className="small muted">
        {rows.length} transactions · {ticked.length} ticked to add
        {dupes > 0 && <> · {dupes} already in the dashboard</>}
        {early > 0 && <> · {early} from before you added this card (already in its starting balance)</>}
      </p>
      <div className="table-scroll">
        <table className="statement-rows">
          <thead><tr><th aria-label="Add" /><th>Date</th><th>Transaction details</th><th>Type</th><th className="num">Amount</th><th>Budget category</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.include ? "" : "muted"}>
                <td><input type="checkbox" className="check" aria-label={`Add ${r.description}`} checked={r.include} onChange={(e) => set(r.key, { include: e.target.checked })} /></td>
                <td className="date">{fmtDate(r.date)}</td>
                <td>{r.description}{r.skip && <div className="small muted">{r.skip === "duplicate" ? "Already in the dashboard" : "Before you added this card"}</div>}</td>
                <td><span className={`badge ${KIND_TONE[r.kind]}`}>{KIND_LABEL[r.kind]}</span></td>
                <td className="num">{money(r.amount)}{r.credit && " CR"}</td>
                <td>
                  {r.credit ? <span className="muted small">{r.kind === "payment" ? "Recorded as a bill payment" : "Lowers the card balance"}</span> : (
                    <select aria-label={`Category for ${r.description}`} value={r.categoryId ?? ""} onChange={(e) => set(r.key, { categoryId: e.target.value || null })}>
                      <option value="">No category</option>
                      {expense.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {after != null && due != null && (
        <div className="form-group" role="group" aria-label="Balance check">
          <p className="small">Card balance on {fmtDate(statementOn)} after this import: <strong>{money(after)}</strong> · statement total amount due: <strong>{money(due)}</strong></p>
          {Math.abs(gap) >= 0.01 ? (
            <label className="row-check"><input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} /> Add a {money(Math.abs(gap))} {gap > 0 ? "charge" : "credit"} so the card matches the statement</label>
          ) : <p className="small pos"><CheckCircle2 size={14} /> The card will match the statement.</p>}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={onBack}>Choose another PDF</button>
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : `Add ${ticked.length} ${ticked.length === 1 ? "entry" : "entries"}${updateCard ? " and update the card" : ""}`}
        </button>
      </div>
    </div>
  );
}
