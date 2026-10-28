import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase.ts";
import { todayISO, type Contact, type Direction, type Loan } from "./balance.ts";

import { useSettings } from "../../lib/settings.ts";
import { CURRENCIES } from "../../lib/types.ts";
import { findByName } from "./contacts.ts";
const NEW = "__new__";

export function LoanForm({ contacts, defaultContactId, loan, onDone }: { contacts: Contact[]; defaultContactId?: string; loan?: Loan; onDone: () => void }) {
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
  const [stmtAmount,setStmtAmount]=useState(loan?.statement_amount == null ? "" : String(loan.statement_amount));
  const [stmtOn,setStmtOn]=useState(loan?.statement_on ?? "");
  const [stmtDue,setStmtDue]=useState(loan?.statement_due_on ?? "");
  const hasEmi = accountType !== "credit_card" && (accountType === "bank" || direction === "borrowed");
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
      emi_amount:hasEmi && emiAmount !== "" ? Number(emiAmount) : null,
      emi_first_on:hasEmi && emiAmount !== "" ? emiFirst || null : null,
      emi_tenure:hasEmi && emiAmount !== "" && tenure !== "" ? Number(tenure) : null,
      interest_rate:hasEmi && rate !== "" ? Number(rate) : null,
      statement_amount:accountType === "credit_card" && stmtAmount !== "" && stmtOn ? Number(stmtAmount) : null,
      statement_on:accountType === "credit_card" && stmtAmount !== "" ? stmtOn || null : null,
      statement_due_on:accountType === "credit_card" && stmtAmount !== "" ? stmtDue || null : null,
    };
    const {error}=loan ? await supabase.from("loans").update(values).eq("id",loan.id) : await supabase.from("loans").insert(values);
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
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
          <div className="grid-2"><label>Total amount due<input type="number" min="0" step="0.01" value={stmtAmount} onChange={e=>setStmtAmount(e.target.value)}/></label><label>Statement date<input type="date" required={stmtAmount !== ""} value={stmtOn} onChange={e=>setStmtOn(e.target.value)}/></label></div>
          <label>Payment due date<input type="date" min={stmtOn} value={stmtDue} onChange={e=>setStmtDue(e.target.value)}/></label>
          <p className="muted small">Use the figures printed on the bill. Payments dated on or after the statement date count towards the total and minimum amount due. Each month, import the statement PDF or enter it by hand.</p>
        </div>
        <p className="muted small">Balance = starting balance + spending added with “Add spend” (or a Budget expense paid with this card) − bill payments. Enter 0 for a new card. Interest and fees can be added as spending. Only the last four digits are needed.</p>
      </>}
      {hasEmi && <div className="form-group" role="group" aria-label="EMI"><strong className="form-group-title">EMI (optional)</strong>
        <div className="grid-2"><label>EMI amount<input type="number" min="0.01" step="0.01" value={emiAmount} onChange={e=>setEmiAmount(e.target.value)}/></label><label>Number of EMIs<input type="number" min="1" step="1" value={tenure} onChange={e=>setTenure(e.target.value)}/></label></div>
        <div className="grid-2"><label>First EMI date<input type="date" required={emiAmount !== ""} value={emiFirst} onChange={e=>setEmiFirst(e.target.value)}/></label><label>Interest rate % (optional)<input type="number" min="0" step="0.001" value={rate} onChange={e=>setRate(e.target.value)}/></label></div>
        <p className="muted small">EMIs repeat monthly on the same date. Repayments are matched to them in order; an unpaid EMI past its date marks the loan overdue. Amount above is the total you repay, including interest.</p>
      </div>}
      <div className="row">
        <label className="grow">
          Date
          <input required type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </label>
        <label className="grow">
          Due (optional)
          <input type="date" min={issuedOn} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
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

