import { Fragment, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.ts";
import { Modal } from "../../components/Modal.tsx";
import { PageHeader } from "../../components/ui.tsx";
import { balancesByContact, formatMoney, loanStatus, paidCents, remaining, todayISO, totalsByCurrency, type Loan, type LoanStatus } from "./balance.ts";
import { useLoans } from "./useLoans.ts";
import { LoanForm } from "./LoanForm.tsx";
import { PaymentForm } from "./PaymentForm.tsx";

type Filter = "active" | "overdue" | "settled" | "all";

export function LoansView() {
  const { contacts, loans, payments, loading, error, reload } = useLoans();
  const [filter, setFilter] = useState<Filter>("active");
  const [person, setPerson] = useState<string | null>(null);
  const [editing,setEditing]=useState<Loan|null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Loan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const today = todayISO();

  const totals = useMemo(() => totalsByCurrency(loans, payments), [loans, payments]);
  // contacts is shared with meetings, so list only people you have loans with
  const people = useMemo(() => balancesByContact(contacts.filter((c) => loans.some((l) => l.contact_id === c.id)), loans, payments, today), [contacts, loans, payments, today]);
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? "—";

  const rows = loans
    .map((loan) => ({ loan, status: loanStatus(loan, payments, today), left: remaining(loan, payments) }))
    .filter((r) => !person || r.loan.contact_id === person)
    .filter((r) => (filter === "all" ? true : filter === "active" ? r.status !== "settled" : r.status === filter));

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

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section>
      <PageHeader
        section="loans"
        title="Loans & credit cards"
        subtitle="Personal loans, bank loans and credit-card balances, with repayment history."
        actions={<button className="primary" onClick={() => setAdding(true)}>+ Add loan / card</button>}
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
              <table>
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
                          <td><span className={`badge ${loan.direction}`}>{loan.account_type === "credit_card" ? "Credit card" : loan.account_type === "bank" ? "Bank loan" : loan.direction === "lent" ? "Lent" : "Borrowed"}</span></td>
                          <td className="num">{formatMoney(loan.amount, loan.currency)}</td>
                          <td className="num"><strong>{formatMoney(left, loan.currency)}</strong></td>
                          <td className="date">{loan.due_on ?? <span className="muted">—</span>}</td>
                          <td><StatusBadge status={status} /></td>
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            <button onClick={()=>setEditing(loan)}>Edit</button>
                            {status !== "settled" && <button onClick={() => setPaying(loan)}>{loan.direction === "lent" ? "Got paid" : "Paid back"}</button>}
                          </td>
                        </tr>
                        {expanded === loan.id && (
                          <tr className="detail">
                            <td colSpan={7}>
                              <p className="small muted">{loan.direction === "lent" ? "Lent" : "Borrowed"} on {loan.issued_on}</p>
                              <p className="small"><strong>Repayments</strong> · paid {formatMoney(paidCents(loan, payments) / 100, loan.currency)} of {formatMoney(loan.amount, loan.currency)}</p>
                              {history.length === 0 && <p className="muted small">No repayments yet.</p>}
                              {loan.account_type === "credit_card" && <p className="small">Minimum due: {loan.minimum_due == null ? "Not set" : formatMoney(Number(loan.minimum_due),loan.currency)} · Credit limit: {loan.credit_limit == null ? "Not set" : formatMoney(Number(loan.credit_limit),loan.currency)}</p>}
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
                              <button className="link danger small" onClick={() => remove("loans", loan.id, "loan and its repayments")}>Delete loan</button>
                            </td>
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
      {paying && (
        <Modal title={`${paying.direction === "lent" ? "Repayment from" : "Repayment to"} ${nameOf(paying.contact_id)}`} onClose={() => setPaying(null)}>
          <PaymentForm loan={paying} left={remaining(paying, payments)} onDone={async () => { setPaying(null); await reload(); }} />
        </Modal>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: LoanStatus }) {
  return <span className={`badge ${status}`}>{status === "open" ? "Open" : status === "overdue" ? "Overdue" : "Settled"}</span>;
}

