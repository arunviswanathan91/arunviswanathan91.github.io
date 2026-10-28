import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase.ts";
import { formatMoney, monthlySchedule, sortedSchedule, todayISO, type Contact, type Direction, type EmiInstalment, type Loan, type Payment } from "./balance.ts";

import { useSettings } from "../../lib/settings.ts";
import { CURRENCIES } from "../../lib/types.ts";
import { findByName } from "./contacts.ts";
import { DateInput } from "../../../components/ui/DateInput";
const NEW = "__new__";

type EmiRow = { on: string; amount: string; paid: boolean };
const toCents = (n: number) => Math.round(n * 100);

/** Which rows the repayments already cover, taking the EMIs in date order. */
function markCovered(rows: EmiRow[], paidCents: number): EmiRow[] {
  const order = rows.map((r, i) => i).sort((a, b) => rows[a].on.localeCompare(rows[b].on));
  const out = rows.map((r) => ({ ...r }));
  let upto = 0;
  for (const i of order) {
    upto += toCents(Number(rows[i].amount) || 0);
    if (upto <= paidCents) out[i].paid = true;
  }
  return out;
}

export function LoanForm({ contacts, defaultContactId, loan, payments = [], onDone }: { contacts: Contact[]; defaultContactId?: string; loan?: Loan; payments?: Payment[]; onDone: () => void }) {
  const [contactId, setContactId] = useState(loan?.contact_id ?? defaultContactId ?? NEW);
  const [newName, setNewName] = useState("");
  const [direction, setDirection] = useState<Direction>(loan?.direction ?? "borrowed");
  const [amount, setAmount] = useState(loan ? String(loan.amount) : "");
  const settings = useSettings();
  const [currency, setCurrency] = useState(loan?.currency ?? settings.default_currency);
  useEffect(() => {if(!loan)setCurrency(settings.default_currency)}, [settings.default_currency,loan]);
  const [issuedOn, setIssuedOn] = useState(loan?.issued_on ?? todayISO());
  const [dueOn, setDueOn] = useState(loan?.due_on ?? "");
  const [note, setNote] = useState(loan?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [accountType,setAccountType]=useState<"personal"|"bank"|"credit_card">(loan?.account_type ?? "personal");
  const [accountName,setAccountName]=useState(loan?.account_name ?? "");
  const [last4,setLast4]=useState(loan?.card_last4 ?? "");
  const [creditLimit,setCreditLimit]=useState(loan?.credit_limit == null ? "" : String(loan.credit_limit));
  const [minimumDue,setMinimumDue]=useState(loan?.minimum_due == null ? "" : String(loan.minimum_due));
  const [emiAmount,setEmiAmount]=useState(loan?.emi_amount == null ? "" : String(loan.emi_amount));
  const [emiFirst,setEmiFirst]=useState(loan?.emi_first_on ?? "");
  const [tenure,setTenure]=useState(loan?.emi_tenure == null ? "" : String(loan.emi_tenure));
  const [rate,setRate]=useState(loan?.interest_rate == null ? "" : String(loan.interest_rate));
  // EMIs that differ (a short last one, a bigger first one) are entered one by one.
  const [emiMode,setEmiMode]=useState<"same"|"each">(loan?.emi_schedule?.length ? "each" : "same");
  // Money already repaid on this loan; EMIs it covers start ticked and stay ticked.
  const alreadyPaid = loan ? payments.filter((p) => p.loan_id === loan.id).reduce((sum, p) => sum + toCents(p.amount), 0) : 0;
  const [rows,setRowsRaw]=useState<EmiRow[]>(() => markCovered((loan?.emi_schedule ?? []).map((e) => ({ on: e.on, amount: String(e.amount), paid: false })), alreadyPaid));
  const setRows = (next: EmiRow[]) => setRowsRaw(markCovered(next, alreadyPaid));
  const locked = markCovered(rows.map((r) => ({ ...r, paid: false })), alreadyPaid).map((r) => r.paid);
  // Ticking an EMI ticks every earlier one (payments cover EMIs in date order); unticking clears the later ones.
  const tick = (i: number, on: boolean) =>
    setRowsRaw(rows.map((r, j) => (locked[j] ? r : { ...r, paid: on ? r.paid || (r.on !== "" && r.on <= rows[i].on) : r.paid && r.on < rows[i].on })));
  const [stmtAmount,setStmtAmount]=useState(loan?.statement_amount == null ? "" : String(loan.statement_amount));
  const [stmtOn,setStmtOn]=useState(loan?.statement_on ?? "");
  const [stmtDue,setStmtDue]=useState(loan?.statement_due_on ?? "");
  const hasEmi = accountType !== "credit_card" && (accountType === "bank" || direction === "borrowed");
  const schedule: EmiInstalment[] = sortedSchedule(rows.map((r) => ({ on: r.on, amount: Number(r.amount) })));
  const scheduleTotal = schedule.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
  const useSchedule = hasEmi && emiMode === "each" && schedule.length > 0;
  function fillMonthly() {
    if (!emiAmount || !emiFirst) return setError("Enter the EMI amount and first EMI date to fill the list.");
    setError("");
    const count = tenure ? Number(tenure) : Math.ceil(Number(amount) / Number(emiAmount)) || 12;
    setRows(monthlySchedule(emiFirst, Number(emiAmount), count, amount ? Number(amount) : undefined).map((e) => ({ on: e.on, amount: String(e.amount), paid: false })));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    let cid = contactId;
    // A name that already exists is reused rather than added a second time.
    const existing = cid === NEW ? findByName(contacts, newName) : undefined;
    if (existing) cid = existing.id;
    else if (cid === NEW) {
      const { data, error } = await supabase.from("contacts").insert({ name: newName.trim() }).select("id").single();
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      cid = data.id;
      setContactId(cid);
    }
    const values = {
      contact_id: cid,
      direction: accountType === "personal" ? direction : "borrowed",
      amount: Number(amount),
      currency,
      issued_on: issuedOn,
      due_on: dueOn || null,
      note: note.trim() || null,
      account_type:accountType,account_name:accountName.trim() || null,
      card_last4:accountType === "credit_card" ? last4 || null : null,
      credit_limit:accountType === "credit_card" && creditLimit !== "" ? Number(creditLimit) : null,
      minimum_due:accountType === "credit_card" && minimumDue !== "" ? Number(minimumDue) : null,
      // With a list, the plain EMI fields mirror it (first amount and date, count) for anything that reads them.
      emi_amount:useSchedule ? schedule[0].amount : hasEmi && emiMode === "same" && emiAmount !== "" ? Number(emiAmount) : null,
      emi_first_on:useSchedule ? schedule[0].on : hasEmi && emiMode === "same" && emiAmount !== "" ? emiFirst || null : null,
      emi_tenure:useSchedule ? schedule.length : hasEmi && emiMode === "same" && emiAmount !== "" && tenure !== "" ? Number(tenure) : null,
      emi_schedule:useSchedule ? schedule : null,
      interest_rate:hasEmi && rate !== "" ? Number(rate) : null,
      statement_amount:accountType === "credit_card" && stmtAmount !== "" && stmtOn ? Number(stmtAmount) : null,
      statement_on:accountType === "credit_card" && stmtAmount !== "" ? stmtOn || null : null,
      statement_due_on:accountType === "credit_card" && stmtAmount !== "" ? stmtDue || null : null,
    };
    const saved = loan ? await supabase.from("loans").update(values).eq("id", loan.id).select("id").single() : await supabase.from("loans").insert(values).select("id").single();
    if (saved.error) {
      setBusy(false);
      return setError(saved.error.message);
    }
    // EMIs ticked as paid become repayments on their dates (only the part not repaid already).
    if (useSchedule) {
      const ordered = rows.map((r, i) => ({ ...r, i })).filter((r) => r.on && Number(r.amount) > 0).sort((a, b) => a.on.localeCompare(b.on));
      const repay: { loan_id: string; amount: number; paid_on: string; note: string }[] = [];
      let upto = 0;
      for (const r of ordered) {
        const before = upto;
        upto += toCents(Number(r.amount));
        if (!r.paid || locked[r.i]) continue;
        const part = upto - Math.max(alreadyPaid, before);
        if (part > 0) repay.push({ loan_id: saved.data.id, amount: part / 100, paid_on: r.on, note: "EMI" });
      }
      if (repay.length) {
        const { error } = await supabase.from("loan_payments").insert(repay);
        if (error) {
          setBusy(false);
          return setError(error.message);
        }
      }
    }
    setBusy(false);
    onDone();
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Account type<select aria-label="Account type" value={accountType} onChange={e=>{setAccountType(e.target.value as typeof accountType);if(e.target.value!=="personal")setDirection("borrowed")}}><option value="personal">Personal loan</option><option value="bank">Bank / lender loan</option><option value="credit_card">Credit card</option></select></label>
      <label>{accountType === "credit_card" ? "Card name" : "Loan name (optional)"}<input required={accountType === "credit_card"} value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder={accountType === "credit_card" ? "e.g. Amazon Pay ICICI or Axis Flipkart" : "e.g. Loan to Justin"}/></label>
      {accountType === "personal" && <div className="segmented" role="radiogroup" aria-label="Direction">
        <button type="button" role="radio" aria-checked={direction === "lent"} className={direction === "lent" ? "on" : ""} onClick={() => setDirection("lent")}>
          I lent money
        </button>
        <button type="button" role="radio" aria-checked={direction === "borrowed"} className={direction === "borrowed" ? "on" : ""} onClick={() => setDirection("borrowed")}>
          I borrowed money
        </button>
      </div>}
      <label>
        {accountType !== "personal" ? "Bank / lender" : direction === "lent" ? "Lent to" : "Borrowed from"}
        <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value={NEW}>+ Add new person / bank…</option>
        </select>
      </label>
      {contactId === NEW && (
        <label>
          {accountType === "personal" ? "Person’s name" : "Bank / lender name"}
          <input placeholder={accountType === "personal" ? "Enter the person’s name" : "e.g. ICICI Bank"} required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
      )}
      <div className="row">
        <label className="grow">
          {accountType === "credit_card" ? "Starting balance (0 if new)" : "Amount"}
          <input required type="number" inputMode="decimal" min={accountType === "credit_card" ? "0" : "0.01"} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {accountType === "credit_card" && <>
        <label>Last four digits (optional)<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={last4} onChange={e=>setLast4(e.target.value.replace(/\D/g,""))} placeholder="1234"/></label>
        <div className="grid-2"><label>Credit limit (optional)<input type="number" min="0" step="0.01" value={creditLimit} onChange={e=>setCreditLimit(e.target.value)}/></label><label>Minimum amount due (optional)<input type="number" min="0" step="0.01" value={minimumDue} onChange={e=>setMinimumDue(e.target.value)}/></label></div>
        <div className="form-group" role="group" aria-label="Current statement"><strong className="form-group-title">Current statement (optional)</strong>
          <div className="grid-2"><label>Total amount due<input type="number" min="0" step="0.01" value={stmtAmount} onChange={e=>setStmtAmount(e.target.value)}/></label><label>Statement date<DateInput type="date" required={stmtAmount !== ""} value={stmtOn} onChange={e=>setStmtOn(e.target.value)}/></label></div>
          <label>Payment due date<DateInput type="date" min={stmtOn} value={stmtDue} onChange={e=>setStmtDue(e.target.value)}/></label>
          <p className="muted small">Use the figures printed on the bill. Payments dated on or after the statement date count towards the total and minimum amount due. Each month, import the statement PDF or enter it by hand.</p>
        </div>
        <p className="muted small">Balance = starting balance + spending added with “Add spend” (or a Budget expense paid with this card) − bill payments. Enter 0 for a new card. Interest and fees can be added as spending. Only the last four digits are needed.</p>
      </>}
      {hasEmi && <div className="form-group" role="group" aria-label="EMI"><strong className="form-group-title">EMI (optional)</strong>
        <div className="segmented" role="radiogroup" aria-label="EMI amounts">
          <button type="button" role="radio" aria-checked={emiMode === "same"} className={emiMode === "same" ? "on" : ""} onClick={() => setEmiMode("same")}>Same EMI every month</button>
          <button type="button" role="radio" aria-checked={emiMode === "each"} className={emiMode === "each" ? "on" : ""} onClick={() => { setEmiMode("each"); if (!rows.length && emiAmount && emiFirst) fillMonthly(); }}>Enter each EMI</button>
        </div>
        <div className="grid-2"><label>EMI amount<input type="number" min="0.01" step="0.01" value={emiAmount} onChange={e=>setEmiAmount(e.target.value)}/></label><label>Number of EMIs<input type="number" min="1" step="1" value={tenure} onChange={e=>setTenure(e.target.value)}/></label></div>
        <div className="grid-2"><label>First EMI date<DateInput type="date" required={emiMode === "same" && emiAmount !== ""} value={emiFirst} onChange={e=>setEmiFirst(e.target.value)}/></label><label>Interest rate % (optional)<input type="number" min="0" step="0.001" value={rate} onChange={e=>setRate(e.target.value)}/></label></div>
        {emiMode === "same" ? (
          <p className="muted small">EMIs repeat monthly on the same date. Repayments are matched to them in order; an unpaid EMI past its date marks the loan overdue. Amount above is the total you repay, including interest.</p>
        ) : (
          <>
            <div className="row wrap">
              <button type="button" className="small" onClick={fillMonthly}>Fill monthly from the fields above</button>
              <button type="button" className="small" onClick={() => setRows([...rows, { on: rows.length ? "" : emiFirst, amount: emiAmount, paid: false }])}>+ Add EMI</button>
            </div>
            {rows.length > 0 && (
              <ol className="emi-rows">
                {rows.map((r, i) => (
                  <li key={i}>
                    <span className="muted small">{i + 1}</span>
                    <DateInput type="date" aria-label={`EMI ${i + 1} date`} required value={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.value } : x)))} />
                    <input type="number" aria-label={`EMI ${i + 1} amount`} required min="0.01" step="0.01" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    <label className={`emi-paid ${r.paid ? "on" : ""}`} title={locked[i] ? "Covered by repayments already recorded. Delete the repayment to undo." : "Tick if this EMI is already paid"}>
                      <input type="checkbox" checked={r.paid} disabled={locked[i] || !r.on} onChange={(e) => tick(i, e.target.checked)} /> {r.paid ? "✓ Paid" : "Paid"}
                    </label>
                    <button type="button" className="icon" aria-label={`Remove EMI ${i + 1}`} disabled={locked[i]} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                  </li>
                ))}
              </ol>
            )}
            <p className="muted small">
              {schedule.length} EMIs, {formatMoney(scheduleTotal, currency)} in total.
              {amount !== "" && Math.abs(scheduleTotal - Number(amount)) >= 0.01 && <> Amount above is {formatMoney(Number(amount), currency)}. <button type="button" className="link small" onClick={() => setAmount(String(scheduleTotal))}>Use {formatMoney(scheduleTotal, currency)} as the amount</button></>}
              {" "}Tick the EMIs you have already paid; saving records them as repayments on their dates. An unpaid EMI past its date marks the loan overdue.
            </p>
          </>
        )}
      </div>}
      <div className="row">
        <label className="grow">
          Date
          <DateInput required type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </label>
        <label className="grow">
          Due (optional)
          <DateInput type="date" min={issuedOn} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
      </div>
      <label>
        Note (optional)
        <input value={note} placeholder="What it was for" onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : loan ? "Save changes" : "Save account"}</button>
    </form>
  );
}

