import { Fragment, useMemo, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../lib/supabase.ts";
import { Modal } from "../../components/Modal.tsx";
import { PageHeader } from "../../components/ui.tsx";
import { list, useLoad } from "../../lib/db.ts";
import { downloadCsv } from "../../lib/download.ts";
import type { BudgetCategory } from "../../lib/types.ts";
import { TransactionForm } from "../budget/TransactionForm.tsx";
import { combine, useFx } from "../../lib/fx.ts";
import { useSettings } from "../../lib/settings.ts";
import { amortisation, balancesByContact, cardUsage, emiPlan, formatMoney, loanStatus, nextStatementDefaults, paidCents, remaining, statementPlan, todayISO, totalOwed, totalsByCurrency, type Charge, type Loan, type LoanStatus, type Payment, type StatementState } from "./balance.ts";
import { useLoans } from "./useLoans.ts";
import { LoanForm } from "./LoanForm.tsx";
import { PaymentForm, type QuickAmount } from "./PaymentForm.tsx";

type Filter = "active" | "overdue" | "settled" | "all";

export function LoansView() {
  const { contacts, loans, payments, charges, loading, error, reload } = useLoans();
  const { data: categories } = useLoad(() => list<BudgetCategory>("budget_categories", { order: [["name"]] }), []);
  const [spending, setSpending] = useState<Loan | null>(null);
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
    if (emi) out.push({ label: "EMI", amount: Math.min(emi.emi, left) });
    const st = statementPlan(loan, payments, today);
    if (st) {
      if (st.minimumLeft > 0) out.push({ label: "Minimum due", amount: Math.min(st.minimumLeft, left) });
      if (st.statementLeft > 0) out.push({ label: "Statement", amount: Math.min(st.statementLeft, left) });
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
            <span className="muted small">Rates of {fx!.date}</span>
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
                          <td className="date" data-label="Next due">{nextDate(loan) ?? <span className="muted">—</span>}</td>
                          <td data-label="Status"><StatusBadge status={status} card={loan.account_type === "credit_card"} /></td>
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            <button onClick={()=>setEditing(loan)}>Edit</button>
                            {loan.account_type === "credit_card" && <button onClick={() => setSpending(loan)}>Add spend</button>}
                            {status !== "settled" && <button onClick={() => setPaying(loan)}>{loan.account_type === "credit_card" ? "Pay bill" : loan.direction === "lent" ? "Got paid" : "Paid back"}</button>}
                          </td>
                        </tr>
                        {expanded === loan.id && (
                          <tr className="detail">
                            <td colSpan={7}><div className="detail-inner">
                              <p className="small muted">{loan.direction === "lent" ? "Lent" : "Borrowed"} on {loan.issued_on}</p>
                              <p className="small"><strong>Repayments</strong> · paid {formatMoney(paidCents(loan, payments) / 100, loan.currency)} of {formatMoney(totalOwed(loan), loan.currency)}</p>
                              {history.length === 0 && <p className="muted small">No repayments yet.</p>}
                              <ul className="history">
                                {history.map((p) => (
                                  <li key={p.id}>
                                    <span>{p.paid_on}</span>
                                    <span>{formatMoney(p.amount, loan.currency)}</span>
                                    <span className="muted">{p.note}</span>
                                    <button className="link danger small" onClick={() => remove("loan_payments", p.id, "repayment")}>Delete</button>
                                  </li>
                                ))}
                              </ul>
                              <EmiDetail loan={loan} payments={payments} today={today} />
                              <CardDetail loan={loan} payments={payments} today={today} onRoll={() => setRolling(loan)} />
                              <CardSpending charges={charges.filter((c) => c.loan_id === loan.id)} currency={loan.currency} />
                              <button className="link danger small" onClick={() => remove("loans", loan.id, "loan and its repayments")}>Delete loan</button>
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
        <Modal title={editing ? "Edit account" : "New loan or credit card"} onClose={() => {setAdding(false);setEditing(null)}}>
          <LoanForm loan={editing ?? undefined} contacts={contacts} defaultContactId={person ?? undefined} onDone={async () => { setAdding(false); setEditing(null); await reload(); }} />
        </Modal>
      )}
      {spending && (
        <Modal title={`Spend on ${spending.account_name || nameOf(spending.contact_id)}`} onClose={() => setSpending(null)}>
          <TransactionForm categories={categories ?? []} currency={spending.currency} presetLoanId={spending.id} onDone={async () => { setSpending(null); await reload(); }} />
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


function EmiDetail({ loan, payments, today }: { loan: Loan; payments: Payment[]; today: string }) {
  const plan = emiPlan(loan, payments, today);
  if (!plan) return null;
  return (
    <div className="small emi-detail">
      <p>
        <strong>EMI</strong> {formatMoney(plan.emi, loan.currency)} / month · {plan.covered}{plan.tenure ? ` of ${plan.tenure}` : ""} paid
        {plan.left !== null && ` · ${plan.left} left`}
        {plan.finalDate && ` · last EMI ${plan.finalDate}`}
        {loan.interest_rate != null && ` · ${loan.interest_rate}% interest`}
      </p>
      {plan.tenure && <progress max={plan.tenure} value={plan.covered} aria-label="EMIs paid" />}
      <AmortisationDetail loan={loan} payments={payments} today={today} />
      {plan.nextDue && (
        <p className={plan.overdueCount > 0 ? "neg" : ""}>
          {plan.overdueCount > 0 ? `${plan.overdueCount} EMI${plan.overdueCount > 1 ? "s" : ""} overdue · ` : "Next EMI "}
          {plan.nextDue}{plan.dueNow > 0 && ` · ${formatMoney(plan.dueNow, loan.currency)} due now`}
        </p>
      )}
    </div>
  );
}

const STATEMENT_LABEL: Record<StatementState, string> = { paid: "Statement paid", minimum_paid: "Minimum paid", due: "Payment due", overdue: "Overdue" };

function CardDetail({ loan, payments, today, onRoll }: { loan: Loan; payments: Payment[]; today: string; onRoll: () => void }) {
  if (loan.account_type !== "credit_card") return null;
  const st = statementPlan(loan, payments, today);
  const usage = cardUsage(loan, payments);
  const money = (n: number) => formatMoney(n, loan.currency);
  return (
    <div className="small card-detail">
      {st ? (
        <>
          <p>
            <strong>Statement {st.statementOn}</strong> <span className={`badge ${st.state === "overdue" ? "overdue" : st.state === "paid" ? "settled" : "open"}`}>{STATEMENT_LABEL[st.state]}</span>
          </p>
          <p>
            Statement {money(st.statement)} · paid since {money(st.paid)} · <strong>{money(st.statementLeft)} left</strong>
            {st.dueOn && ` · due ${st.dueOn}`}
          </p>
          <p>Minimum due {money(st.minimumDue)}{st.minimumLeft > 0 ? ` · ${money(st.minimumLeft)} still to pay` : " · covered"} · New spending since statement {money(st.unbilled)}</p>
          {st.interestRisk && <p className="neg">Past the due date with the statement unpaid, so interest is likely.</p>}
        </>
      ) : (
        <p>Minimum due: {loan.minimum_due == null ? "Not set" : money(Number(loan.minimum_due))}. No statement entered yet.</p>
      )}
      <button className="small" onClick={onRoll}>{st ? "Enter next statement" : "Enter statement"}</button>
      {usage && (
        <p>
          Limit {money(Number(loan.credit_limit))} · used {money(usage.used)} ({Math.round(usage.utilization * 100)}%) · available {money(usage.available)}
          {usage.utilization > 0.3 && <span className="muted"> · above 30% can hurt your credit score</span>}
        </p>
      )}
    </div>
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
                  <td>{r.n}</td><td className="date">{r.date}</td><td className="num">{money(r.emi)}</td><td className="num">{money(r.interest)}</td><td className="num">{money(r.principal)}</td><td className="num">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CardSpending({ charges, currency }: { charges: Charge[]; currency: string }) {
  if (!charges.length) return null;
  return (
    <div className="small card-detail">
      <p><strong>Card spending</strong> · from Budget (edit or delete it there)</p>
      <ul className="history">
        {charges.slice(0, 8).map((c) => (
          <li key={c.id}>
            <span>{c.occurred_on}</span>
            <span>{c.kind === "income" ? "−" : ""}{formatMoney(c.amount, currency)}</span>
            <span className="muted">{c.description}</span>
          </li>
        ))}
      </ul>
      {charges.length > 8 && <p className="muted">and {charges.length - 8} more</p>}
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
        <label>Statement amount<input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Minimum due<input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></label>
        <label>Statement date<input required type="date" value={on} onChange={(e) => setOn(e.target.value)} /></label>
        <label>Payment due date<input type="date" min={on} value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save statement"}</button>
    </form>
  );
}
