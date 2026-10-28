import { Fragment, useMemo, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../lib/supabase.ts";
import { Modal } from "../../components/Modal.tsx";
import { PageHeader } from "../../components/ui.tsx";
import { list, update, useLoad } from "../../lib/db.ts";
import { downloadCsv } from "../../lib/download.ts";
import type { BudgetCategory } from "../../lib/types.ts";
import { TransactionForm } from "../budget/TransactionForm.tsx";
import { combine, useFx } from "../../lib/fx.ts";
import { useSettings } from "../../lib/settings.ts";
import { sortedSchedule, type EmiInstalment, amortisation, balancesByContact, cardUsage, emiPlan, formatMoney, loanStatus, nextStatementDefaults, paidCents, remaining, statementPlan, todayISO, totalOwed, totalsByCurrency, type Charge, type Loan, type LoanStatus, type Payment, type StatementState } from "./balance.ts";
import { useLoans } from "./useLoans.ts";
import { ImportStatement } from "./statement/ImportStatement.tsx";
import { ForSelect, usePeople } from "../budget/ForSelect.tsx";
import { deleteContacts, uniqueByName, unusedContacts } from "./contacts.ts";
import { LoanForm } from "./LoanForm.tsx";
import { PaymentForm, type QuickAmount } from "./PaymentForm.tsx";
import { DateInput } from "../../../components/ui/DateInput";
import { fmtDate } from "../../lib/dates.ts";

type Filter = "active" | "overdue" | "settled" | "all";

export function LoansView() {
  const { contacts, loans, payments, charges, loading, error, reload } = useLoans();
  const { data: categories } = useLoad(() => list<BudgetCategory>("budget_categories", { order: [["name"]] }), []);
  const [spending, setSpending] = useState<Loan | null>(null);
  const [importing, setImporting] = useState<Loan | null>(null);
  const [rolling, setRolling] = useState<Loan | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [person, setPerson] = useState<string | null>(null);
  const [editing,setEditing]=useState<Loan|null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Loan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const today = todayISO();

  const totals = useMemo(() => totalsByCurrency(loans, payments), [loans, payments]);
  const base = useSettings().default_currency;
  const fx = useFx(base, Object.keys(totals).length > 1);
  const all = fx && {
    owedToMe: combine(Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.owedToMe])), fx),
    iOwe: combine(Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.iOwe])), fx),
  };
  // contacts is shared with meetings, so list only people you have loans with
  const people = useMemo(() => balancesByContact(contacts.filter((c) => loans.some((l) => l.contact_id === c.id)), loans, payments, today), [contacts, loans, payments, today]);
  // The date that matters next: the next EMI, the statement due date, or the plain due date.
  const nextDate = (loan: Loan) => emiPlan(loan, payments, today)?.nextDue ?? (statementPlan(loan, payments, today)?.statementLeft ? loan.statement_due_on : null) ?? loan.due_on;
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? "—";

  const rows = loans
    .map((loan) => ({ loan, status: loanStatus(loan, payments, today), left: remaining(loan, payments) }))
    .filter((r) => !person || r.loan.contact_id === person)
    // A card with nothing owed is still in use, so it stays under Active.
    .filter((r) => (filter === "all" ? true : filter === "active" ? r.status !== "settled" || r.loan.account_type === "credit_card" : r.status === filter));

  // One ledger row per opening balance, spend, refund and repayment, oldest first per account.
  function exportCsv() {
    const out: (string | number | null)[][] = [["Account", "Type", "Lender / person", "Date", "Entry", "Amount", "Currency", "Balance after", "Note"]];
    for (const loan of loans) {
      const type = loan.account_type === "credit_card" ? "Credit card" : loan.account_type === "bank" ? "Bank loan" : loan.direction === "lent" ? "Lent" : "Borrowed";
      const name = loan.account_name || nameOf(loan.contact_id);
      const entries = [
        { date: loan.issued_on, entry: loan.account_type === "credit_card" ? "Starting balance" : "Amount", amount: loan.amount, note: loan.note },
        ...charges.filter((c) => c.loan_id === loan.id).map((c) => ({ date: c.occurred_on, entry: c.kind === "income" ? "Refund" : "Spend", amount: c.kind === "income" ? -c.amount : c.amount, note: c.description })),
        ...payments.filter((p) => p.loan_id === loan.id).map((p) => ({ date: p.paid_on, entry: "Repayment", amount: -p.amount, note: p.note })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      let balance = 0;
      for (const e of entries) {
        balance = Math.round((balance + e.amount) * 100) / 100;
        out.push([name, type, nameOf(loan.contact_id), e.date, e.entry, e.amount, loan.currency, balance, e.note ?? ""]);
      }
    }
    downloadCsv("loans-and-cards", out);
  }

  async function remove(table: "loans" | "loan_payments", id: string, what: string) {
    if (!supabase || !confirm(`Delete this ${what}? This cannot be undone.`)) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) alert(error.message);
    await reload();
  }

  // Deleting a loan also removes its person/bank once nothing else uses the name.
  async function removeLoan(loan: Loan) {
    if (!supabase || !confirm("Delete this loan and its repayments? This cannot be undone.")) return;
    const { error } = await supabase.from("loans").delete().eq("id", loan.id);
    if (error) return alert(error.message);
    const rest = loans.filter((l) => l.id !== loan.id);
    const orphan = await unusedContacts(contacts.filter((c) => c.id === loan.contact_id), rest).catch(() => []);
    await deleteContacts(orphan.map((c) => c.id)).catch(() => undefined);
    if (orphan.length && person === loan.contact_id) setPerson(null);
    await reload();
  }

  async function cleanUpNames() {
    try {
      const unused = await unusedContacts(contacts, loans);
      if (!unused.length) return alert("Every name here is used by a loan or a meeting.");
      if (!confirm(`Remove ${unused.length} unused name${unused.length > 1 ? "s" : ""} (${unused.map((c) => c.name).join(", ")})? They have no loans, meetings or shared spending.`)) return;
      await deleteContacts(unused.map((c) => c.id));
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function removePerson(id: string) {
    if (!supabase) return;
    if (loans.some((l) => l.contact_id === id)) return alert("Delete this person’s loans first.");
    if (!confirm("Remove this person?")) return;
    await supabase.from("contacts").delete().eq("id", id);
    setPerson(null);
    await reload();
  }

  // Preset amounts for the repayment form: the EMI, or the card's minimum / statement / full balance.
  function quickAmounts(loan: Loan, left: number): QuickAmount[] {
    const out: QuickAmount[] = [];
    const emi = emiPlan(loan, payments, today);
    if (emi) out.push({ label: "EMI", amount: emi.nextAmount || Math.min(emi.emi, left) });
    const st = statementPlan(loan, payments, today, charges);
    if (st) {
      if (st.minimumLeft > 0) out.push({ label: "Minimum amount due", amount: Math.min(st.minimumLeft, left) });
      if (st.statementLeft > 0) out.push({ label: "Total amount due", amount: Math.min(st.statementLeft, left) });
    }
    if (out.length) out.push({ label: "Full balance", amount: left });
    return out.filter((q, i) => q.amount > 0 && out.findIndex((o) => o.amount === q.amount && o.label === q.label) === i);
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section>
      <PageHeader
        section="loans"
        title="Loans & credit cards"
        subtitle="Personal loans, bank loans and credit-card balances, with repayment history."
        actions={<>
          {loans.length > 0 && <button onClick={exportCsv} title="Download every loan, card spend and repayment as a spreadsheet"><Download size={15} /> CSV</button>}
          <button className="primary" onClick={() => setAdding(true)}>+ Add loan / card</button>
        </>}
      />
      {error && <p className="error">{error}</p>}

      <div className="stats">
        {Object.keys(totals).length === 0 && <div className="card stat"><span className="muted">Nothing outstanding</span></div>}
        {Object.entries(totals).map(([cur, t]) => (
          <div className="card stat" key={cur}>
            <span className="stat-cur">{cur}</span>
            <div className="stat-line"><span>Owed to you</span><strong className="pos">{formatMoney(t.owedToMe, cur)}</strong></div>
            <div className="stat-line"><span>You owe</span><strong className="neg">{formatMoney(t.iOwe, cur)}</strong></div>
            <div className="stat-line net"><span>Net</span><strong className={t.net >= 0 ? "pos" : "neg"}>{formatMoney(t.net, cur)}</strong></div>
          </div>
        ))}
        {all && all.owedToMe !== null && all.iOwe !== null && (
          <div className="card stat">
            <span className="stat-cur">All ≈ {base}</span>
            <div className="stat-line"><span>Owed to you</span><strong className="pos">{formatMoney(all.owedToMe, base)}</strong></div>
            <div className="stat-line"><span>You owe</span><strong className="neg">{formatMoney(all.iOwe, base)}</strong></div>
            <div className="stat-line net"><span>Net</span><strong className={all.owedToMe - all.iOwe >= 0 ? "pos" : "neg"}>{formatMoney(all.owedToMe - all.iOwe, base)}</strong></div>
            <span className="muted small">Rates of {fmtDate(fx!.date)}</span>
          </div>
        )}
      </div>

      <div className="loans-layout">
        <aside className="card people">
          <h3>People & lenders</h3>
          <button className={`person ${person === null ? "on" : ""}`} onClick={() => setPerson(null)}>
            <span>All people & lenders</span>
          </button>
          {people.map(({ contact, net, overdueLoans }) => (
            <button key={contact.id} className={`person ${person === contact.id ? "on" : ""}`} onClick={() => setPerson(contact.id)}>
              <span>
                {contact.name}
                {overdueLoans > 0 && <span className="badge overdue">{overdueLoans} overdue</span>}
              </span>
              <span className="person-net">
                {Object.keys(net).length === 0 && <span className="muted">settled</span>}
                {Object.entries(net).map(([cur, v]) => (
                  <span key={cur} className={v >= 0 ? "pos" : "neg"}>{v >= 0 ? "owes you " : "you owe "}{formatMoney(Math.abs(v), cur)}</span>
                ))}
              </span>
            </button>
          ))}
          {people.length === 0 && <p className="muted small">People appear here when you add a loan.</p>}
          {person && <button className="link danger small" onClick={() => removePerson(person)}>Remove this person</button>}
          {contacts.length > people.length && <button className="link small" onClick={() => void cleanUpNames()}>Remove unused names</button>}
        </aside>

        <div className="card table-card">
          <div className="tabs" role="tablist">
            {(["active", "overdue", "settled", "all"] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="muted empty">{loans.length === 0 ? "No loans yet. Add your first one with “+ Add loan / card”." : "Nothing here."}</p>
          ) : (
            <div className="table-scroll">
              <table className="loans-table">
                <thead>
                  <tr><th>Account / person</th><th>Type</th><th className="num">Amount</th><th className="num">Left</th><th>Due</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map(({ loan, status, left }) => {
                    const history = payments.filter((p) => p.loan_id === loan.id);
                    return (
                      <Fragment key={loan.id}>
                        <tr className="clickable" onClick={() => setExpanded(expanded === loan.id ? null : loan.id)}>
                          <td><strong>{loan.account_name || nameOf(loan.contact_id)}</strong>{loan.account_name && <div className="muted small">{nameOf(loan.contact_id)}</div>}{loan.card_last4 && <span className="small"> · •••• {loan.card_last4}</span>}{loan.note && <div className="muted small">{loan.note}</div>}</td>
                          <td data-label="Type"><span className={`badge ${loan.direction}`}>{loan.account_type === "credit_card" ? "Credit card" : loan.account_type === "bank" ? "Bank loan" : loan.direction === "lent" ? "Lent" : "Borrowed"}</span></td>
                          <td className="num" data-label={loan.account_type === "credit_card" ? "Owed in total" : "Amount"}>{formatMoney(totalOwed(loan), loan.currency)}</td>
                          <td className="num" data-label="Left"><strong>{formatMoney(left, loan.currency)}</strong></td>
                          <td className="date" data-label="Next due">{nextDate(loan) ? fmtDate(nextDate(loan)) : <span className="muted">—</span>}</td>
                          <td data-label="Status"><StatusBadge status={status} card={loan.account_type === "credit_card"} /></td>
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            <button onClick={()=>setEditing(loan)}>Edit</button>
                            {loan.account_type === "credit_card" && <><button onClick={() => setSpending(loan)}>Add spend</button><button onClick={() => setImporting(loan)}>Import statement</button></>}
                            {status !== "settled" && <button onClick={() => setPaying(loan)}>{loan.account_type === "credit_card" ? "Pay bill" : loan.direction === "lent" ? "Got paid" : "Paid back"}</button>}
                          </td>
                        </tr>
                        {expanded === loan.id && (
                          <tr className="detail">
                            <td colSpan={7}><div className="detail-inner">
                              <p className="small muted">{loan.direction === "lent" ? "Lent" : "Borrowed"} on {fmtDate(loan.issued_on)}</p>
                              <p className="small"><strong>Repayments</strong> · paid {formatMoney(paidCents(loan, payments) / 100, loan.currency)} of {formatMoney(totalOwed(loan), loan.currency)}</p>
                              {history.length === 0 && <p className="muted small">No repayments yet.</p>}
                              <ul className="history">
                                {history.map((p) => (
                                  <li key={p.id}>
                                    <span>{fmtDate(p.paid_on)}</span>
                                    <span>{formatMoney(p.amount, loan.currency)}</span>
                                    <span className="muted">{p.note}</span>
                                    <button className="link danger small" onClick={() => remove("loan_payments", p.id, "repayment")}>Delete</button>
                                  </li>
                                ))}
                              </ul>
                              <EmiDetail loan={loan} payments={payments} today={today} onChange={reload} />
                              <CardDetail loan={loan} payments={payments} charges={charges} today={today} onRoll={() => setRolling(loan)} onImport={() => setImporting(loan)} />
                              <CardSpending charges={charges.filter((c) => c.loan_id === loan.id)} currency={loan.currency} categories={categories ?? []} onChange={reload} />
                              <button className="link danger small" onClick={() => void removeLoan(loan)}>Delete loan</button>
                            </div></td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {(adding || editing) && (
        <Modal wide title={editing ? "Edit account" : "New loan or credit card"} onClose={() => {setAdding(false);setEditing(null)}}>
          <LoanForm loan={editing ?? undefined} payments={payments} contacts={uniqueByName(contacts, loans, editing?.contact_id)} defaultContactId={person ?? undefined} onDone={async () => { setAdding(false); setEditing(null); await reload(); }} />
        </Modal>
      )}
      {spending && (
        <Modal title={`Spend on ${spending.account_name || nameOf(spending.contact_id)}`} onClose={() => setSpending(null)}>
          <TransactionForm categories={categories ?? []} currency={spending.currency} presetLoanId={spending.id} onDone={async () => { setSpending(null); await reload(); }} />
        </Modal>
      )}
      {importing && (
        <Modal title={`Import statement · ${importing.account_name || nameOf(importing.contact_id)}`} wide onClose={() => setImporting(null)}>
          <ImportStatement loan={importing} charges={charges} payments={payments} categories={categories ?? []} onDone={async () => { setImporting(null); await reload(); }} />
        </Modal>
      )}
      {rolling && (
        <Modal title={`New statement · ${rolling.account_name || nameOf(rolling.contact_id)}`} onClose={() => setRolling(null)}>
          <StatementForm loan={rolling} payments={payments} today={today} onDone={async () => { setRolling(null); await reload(); }} />
        </Modal>
      )}
      {paying && (
        <Modal title={`${paying.direction === "lent" ? "Repayment from" : "Repayment to"} ${nameOf(paying.contact_id)}`} onClose={() => setPaying(null)}>
          <PaymentForm loan={paying} left={remaining(paying, payments)} quick={quickAmounts(paying, remaining(paying, payments))} onDone={async () => { setPaying(null); await reload(); }} />
        </Modal>
      )}
    </section>
  );
}

function StatusBadge({ status, card }: { status: LoanStatus; card?: boolean }) {
  return <span className={`badge ${status}`}>{status === "open" ? "Open" : status === "overdue" ? "Overdue" : card ? "Nothing owed" : "Settled"}</span>;
}


function EmiDetail({ loan, payments, today, onChange }: { loan: Loan; payments: Payment[]; today: string; onChange: () => Promise<void> }) {
  const plan = emiPlan(loan, payments, today);
  if (!plan) return null;
  return (
    <div className="small emi-detail">
      <p>
        <strong>EMI</strong> {loan.emi_schedule?.length ? "as listed" : `${formatMoney(plan.emi, loan.currency)} / month`} · {plan.covered}{plan.tenure ? ` of ${plan.tenure}` : ""} paid
        {plan.left !== null && ` · ${plan.left} left`}
        {plan.finalDate && ` · last EMI ${fmtDate(plan.finalDate)}`}
        {loan.interest_rate != null && ` · ${loan.interest_rate}% interest`}
      </p>
      {plan.tenure && <progress max={plan.tenure} value={plan.covered} aria-label="EMIs paid" />}
      <AmortisationDetail loan={loan} payments={payments} today={today} />
      {loan.emi_schedule?.length ? <ScheduleList loan={loan} schedule={loan.emi_schedule} payments={payments} today={today} onChange={onChange} /> : null}
      {plan.nextDue && (
        <p className={plan.overdueCount > 0 ? "neg" : ""}>
          {plan.overdueCount > 0 ? `${plan.overdueCount} EMI${plan.overdueCount > 1 ? "s" : ""} overdue · ` : "Next EMI "}
          {fmtDate(plan.nextDue)}{plan.dueNow > 0 ? ` · ${formatMoney(plan.dueNow, loan.currency)} due now` : ` · ${formatMoney(plan.nextAmount, loan.currency)}`}
        </p>
      )}
    </div>
  );
}

const STATEMENT_LABEL: Record<StatementState, string> = { paid: "Statement paid", minimum_paid: "Minimum paid", due: "Payment due", overdue: "Overdue" };

function CardDetail({ loan, payments, charges, today, onRoll, onImport }: { loan: Loan; payments: Payment[]; charges: Charge[]; today: string; onRoll: () => void; onImport: () => void }) {
  if (loan.account_type !== "credit_card") return null;
  const st = statementPlan(loan, payments, today, charges);
  const usage = cardUsage(loan, payments);
  const money = (n: number) => formatMoney(n, loan.currency);
  return (
    <div className="small card-detail">
      {st ? (
        <>
          <p>
            <strong>Statement {fmtDate(st.statementOn)}</strong> <span className={`badge ${st.state === "overdue" ? "overdue" : st.state === "paid" ? "settled" : "open"}`}>{STATEMENT_LABEL[st.state]}</span>
          </p>
          <p>
            Total amount due {money(st.statement)} · paid since {money(st.paid)} · <strong>{money(st.statementLeft)} left</strong>
            {st.dueOn && ` · payment due date ${fmtDate(st.dueOn)}`}
          </p>
          <p>
            {st.minimumKnown ? <>Minimum amount due {money(st.minimumDue)}{st.minimumLeft > 0 ? ` · ${money(st.minimumLeft)} still to pay` : " · covered"}</> : "Minimum amount due not entered"}
            {st.unbilled > 0 && ` · Purchases since the statement ${money(st.unbilled)}`}
          </p>
          {st.mismatch !== null && Math.abs(st.mismatch) >= 1 && (
            <p className="neg">
              The card balance on {fmtDate(st.statementOn)} is {money(st.statement + st.mismatch)}, but the statement says {money(st.statement)}.
              {st.mismatch > 0 ? " Payments or refunds from the statement are probably missing" : " Purchases or fees from the statement are probably missing"}: import the statement PDF to add them, or check the starting balance.
            </p>
          )}
          {st.state === "minimum_paid" && !st.interestRisk && (
            <p className="warn-text">Only the minimum is paid so far. Pay the remaining {money(st.statementLeft)}{st.dueOn ? ` by ${fmtDate(st.dueOn)}` : ""} to avoid interest; paying just the minimum keeps the card in good standing but the bank then charges interest, usually on the whole statement from the purchase dates.</p>
          )}
          {st.interestRisk && st.state === "minimum_paid" && (
            <p className="neg">Only the minimum was paid by the due date, so {money(st.statementLeft)} carries over to the next statement with interest and GST on it. Import the next statement PDF to add those charges.</p>
          )}
          {st.state === "overdue" && (
            <p className="neg">The minimum amount due was not paid by the due date: expect a late payment fee as well as interest. Paying at least the minimum now stops it getting worse.</p>
          )}
        </>
      ) : (
        <p>Minimum amount due: {loan.minimum_due == null ? "Not set" : money(Number(loan.minimum_due))}. No statement entered yet.</p>
      )}
      <div className="row wrap">
        <button className="small" onClick={onImport}>Import statement PDF</button>
        <button className="small" onClick={onRoll}>{st ? "Enter next statement by hand" : "Enter statement by hand"}</button>
      </div>
      {usage && (
        <p>
          Credit limit {money(Number(loan.credit_limit))} · used {money(usage.used)} ({Math.round(usage.utilization * 100)}%) · available credit {money(usage.available)}
          {usage.utilization > 0.3 && <span className="muted"> · above 30% can hurt your credit score</span>}
        </p>
      )}
    </div>
  );
}

/** EMIs entered one by one, each marked paid, part paid, due or overdue from the payments so far. */
function ScheduleList({ loan, schedule, payments, today, onChange }: { loan: Loan; schedule: EmiInstalment[]; payments: Payment[]; today: string; onChange: () => Promise<void> }) {
  const paid = paidCents(loan, payments);
  // Open straight away when something is overdue, so it can be ticked off.
  const [open, setOpen] = useState(() => { let u = 0; return sortedSchedule(schedule).some((e) => (u += Math.round(e.amount * 100)) > paid && e.on < today); });
  const [busy, setBusy] = useState(false);
  let upto = 0;
  const rows = sortedSchedule(schedule).map((e) => {
    const before = upto;
    upto += Math.round(e.amount * 100);
    const state = upto <= paid ? "paid" : before < paid ? "part paid" : e.on < today ? "overdue" : "due";
    return { ...e, before, upto, state };
  });
  // Marking an EMI paid records what is still owed on it and on any earlier unpaid EMI, each on its own date.
  async function markPaid(index: number) {
    if (!supabase) return;
    const repay = rows.slice(0, index + 1)
      .filter((r) => r.upto > paid)
      .map((r) => ({ loan_id: loan.id, amount: (r.upto - Math.max(paid, r.before)) / 100, paid_on: r.on, note: "EMI" }));
    const total = repay.reduce((sum, r) => sum + r.amount, 0);
    if (!repay.length || !confirm(`Record ${formatMoney(total, loan.currency)} as paid${repay.length > 1 ? ` (${repay.length} EMIs up to ${fmtDate(rows[index].on)})` : ` on ${fmtDate(rows[index].on)}`}?`)) return;
    setBusy(true);
    const { error } = await supabase.from("loan_payments").insert(repay);
    setBusy(false);
    if (error) return alert(error.message);
    await onChange();
  }
  return (
    <>
      <button className="link small" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} all {rows.length} EMIs</button>
      {open && (
        <ol className="emi-list">
          {rows.map((r, i) => (
            <li key={i}>
              <span>{fmtDate(r.on)}</span>
              <span className="num">{formatMoney(r.amount, loan.currency)}</span>
              {r.state === "paid"
                ? <span className="badge settled">✓ paid</span>
                : <button className="small" disabled={busy} title={`Mark this EMI${r.before > paid ? " and the earlier unpaid ones" : ""} as paid`} onClick={() => void markPaid(i)}>{r.state === "overdue" ? "Overdue · " : r.state === "part paid" ? "Part paid · " : ""}Mark paid</button>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function AmortisationDetail({ loan, payments, today }: { loan: Loan; payments: Payment[]; today: string }) {
  const [open, setOpen] = useState(false);
  const a = amortisation(loan, payments, today);
  if (!a) return null;
  const money = (n: number) => formatMoney(n, loan.currency);
  const covered = emiPlan(loan, payments, today)?.covered ?? 0;
  return (
    <>
      <p>
        Principal {money(a.principal)} · total interest {money(a.totalInterest)} · principal still owed {money(a.outstandingPrincipal)}
        {a.prepaySaving > 0 && <> · <strong>paying it off now saves about {money(a.prepaySaving)}</strong> in interest (before any prepayment fee)</>}
      </p>
      <button className="link small" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} EMI breakdown</button>
      {open && (
        <div className="table-scroll amort">
          <table>
            <thead><tr><th>#</th><th>Date</th><th className="num">EMI</th><th className="num">Interest</th><th className="num">Principal</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.n} className={r.n <= covered ? "muted" : ""}>
                  <td>{r.n}</td><td className="date">{fmtDate(r.date)}</td><td className="num">{money(r.emi)}</td><td className="num">{money(r.interest)}</td><td className="num">{money(r.principal)}</td><td className="num">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** The card's spending, with its budget category and who it was for editable in place (e.g. after a statement import). */
function CardSpending({ charges, currency, categories, onChange }: { charges: Charge[]; currency: string; categories: BudgetCategory[]; onChange: () => Promise<void> }) {
  const [all, setAll] = useState(false);
  const people = usePeople();
  if (!charges.length) return null;
  const set = async (c: Charge, patch: Partial<Charge>) => {
    try {
      await update("transactions", c.id, patch);
      await onChange();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const shown = all ? charges : charges.slice(0, 8);
  return (
    <div className="small card-detail">
      <p><strong>Card spending</strong> · change a category or who it was for here; edit or delete it in Budget</p>
      <ul className="card-spends">
        {shown.map((c) => (
          <li key={c.id}>
            <span>{fmtDate(c.occurred_on)}</span>
            <span className="num">{c.kind === "income" ? "−" : ""}{formatMoney(c.amount, currency)}</span>
            <span className="muted clamp">{c.description}</span>
            {c.kind === "expense" ? (
              <select className="inline-select" aria-label={`Category for ${c.description}`} value={c.category_id ?? ""} onChange={(e) => void set(c, { category_id: e.target.value || null })}>
                <option value="">Uncategorised</option>
                {categories.filter((x) => x.kind === "expense" && (!x.archived_at || x.id === c.category_id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            ) : <span className="muted">refund / credit</span>}
            <ForSelect label={`Who ${c.description} was for`} value={c.for_contact_id} people={people} onChange={(id) => void set(c, { for_contact_id: id })} />
          </li>
        ))}
      </ul>
      {charges.length > 8 && <button className="link small" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${charges.length}`}</button>}
    </div>
  );
}

/** Enter the next month's statement, prefilled from the current one and the balance owed now. */
function StatementForm({ loan, payments, today, onDone }: { loan: Loan; payments: Payment[]; today: string; onDone: () => void }) {
  const d = nextStatementDefaults(loan, payments, today);
  const [amount, setAmount] = useState(String(d.statement_amount));
  const [minimum, setMinimum] = useState(String(d.minimum_due));
  const [on, setOn] = useState(d.statement_on);
  const [due, setDue] = useState(d.statement_due_on);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("loans").update({ statement_amount: Number(amount), minimum_due: minimum === "" ? null : Number(minimum), statement_on: on, statement_due_on: due || null }).eq("id", loan.id);
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="muted small">Prefilled with the balance owed today and dates one month after the last statement. Change them to match the bill.</p>
      <div className="grid-2">
        <label>Total amount due<input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Minimum amount due<input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></label>
        <label>Statement date<DateInput required type="date" value={on} onChange={(e) => setOn(e.target.value)} /></label>
        <label>Payment due date<DateInput type="date" min={on} value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save statement"}</button>
    </form>
  );
}
