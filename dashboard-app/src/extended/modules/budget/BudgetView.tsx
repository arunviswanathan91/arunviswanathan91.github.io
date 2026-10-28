import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Settings2, Trash2 } from "lucide-react";
import { insert, list, remove, rpc, update, upsert, useLoad } from "../../lib/db.ts";
import { addMonths, fmtDate, startOfMonth, today } from "../../lib/dates.ts";
import { friendBalances, friendSummary } from "./friends.ts";
import { MoneyOutCard } from "./MoneyOutCard.tsx";
import type { Person } from "./ForSelect.tsx";
import { setQuery, type Route } from "../../lib/route.ts";
import { useSettings } from "../../lib/settings.ts";
import type { BudgetCategory, BudgetLine, MonthlyBudget, Transaction } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { Badge, confirmDanger, Empty, ErrorText, PageHeader, Select } from "../../components/ui.tsx";
import { formatMoney } from "../loans/balance.ts";
import { TransactionForm } from "./TransactionForm.tsx";
import { RecurringCard } from "./Recurring.tsx";
import { combine, useFx } from "../../lib/fx.ts";
import { CategorySelect } from "./CategorySelect.tsx";

const cents = (n: number) => Math.round(Number(n) * 100);

// Post recurring items that are due (rent, salary, subscriptions) once a day per session, not on
// every reload; the scheduled sweep covers the rest. A no-op until the migration runs.
let postedOn = "";
async function postRecurringOnce() {
  const day = new Date().toDateString();
  if (postedOn === day) return;
  postedOn = day;
  await rpc<number>("post_recurring").catch(() => 0);
}

export function BudgetView({ route }: { route: Route }) {
  const month = route.query.get("month") ?? startOfMonth(today());
  const kindFilter = (route.query.get("kind") ?? "") as Transaction["kind"] | "";
  const catFilter = route.query.get("category") ?? "";
  const settings = useSettings();
  const forFilter = route.query.get("for") ?? "";
  const [modal, setModal] = useState<Transaction | "new" | "categories" | { paidBack: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const { data, error: loadError } = useLoad(async () => {
    await postRecurringOnce();
    const [categories, txs, budgets, lines, friendTxs, people] = await Promise.all([
      list<BudgetCategory>("budget_categories", { order: [["kind"], ["name"]] }),
      list<Transaction>("transactions", { gte: ["occurred_on", month], lt: ["occurred_on", addMonths(month, 1)], order: [["occurred_on", false], ["created_at", false]] }),
      list<MonthlyBudget>("monthly_budgets", { eq: { month } }),
      rpc<BudgetLine[]>("budget_month", { month_start: month }),
      list<Transaction>("transactions", { notNull: ["for_contact_id"], order: [["occurred_on"]] }),
      list<Person>("contacts", { order: [["name"]] }),
    ]);
    return { categories, txs: txs.map((t) => ({ ...t, amount: Number(t.amount) })), budgets, lines, friendTxs: friendTxs.map((t) => ({ ...t, amount: Number(t.amount) })), people };
  }, [month]);

  const categories = data?.categories ?? [];
  const txs = data?.txs ?? [];
  const cur = settings.default_currency;

  // Totals per currency
  const totals = new Map<string, { income: number; expense: number }>();
  // Your own money: spends for a friend (and their paying back) are kept apart.
  const mine = txs.filter((t) => !t.for_contact_id);
  for (const t of mine) {
    if (t.kind === "transfer") continue;
    const x = totals.get(t.currency) ?? { income: 0, expense: 0 };
    x[t.kind] += cents(t.amount);
    totals.set(t.currency, x);
  }
  if (!totals.size) totals.set(cur, { income: 0, expense: 0 });
  const fx = useFx(cur, totals.size > 1);
  const combined = fx && {
    income: combine(Object.fromEntries([...totals].map(([c, t]) => [c, t.income / 100])), fx),
    expense: combine(Object.fromEntries([...totals].map(([c, t]) => [c, t.expense / 100])), fx),
  };

  // Budget vs actual for expense categories in the default currency (plus uncategorised spending)
  const expenseCats = categories.filter((c) => c.kind === "expense" && (!c.archived_at || mine.some((t) => t.category_id === c.id)));
  const rows = expenseCats.map((c) => {
    const budget = data?.budgets.find((b) => b.category_id === c.id && b.currency === cur);
    const actual = mine.filter((t) => t.kind === "expense" && t.category_id === c.id && t.currency === cur).reduce((s, t) => s + cents(t.amount), 0);
    return { c, budget, budgeted: budget ? cents(budget.amount) : 0, actual };
  });
  const uncategorised = mine.filter((t) => t.kind === "expense" && !t.category_id && t.currency === cur).reduce((s, t) => s + cents(t.amount), 0);
  // Budget vs actual only counts categories that have a budget this month.
  const totalBudget = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = rows.filter((r) => r.budgeted > 0).reduce((s, r) => s + r.actual, 0);
  const otherCurrencyLines = (data?.lines ?? []).filter((l) => l.currency !== cur && l.kind === "expense");

  const shown = txs.filter((t) => (!kindFilter || t.kind === kindFilter) && (!catFilter || t.category_id === catFilter) && (!forFilter || t.for_contact_id === forFilter));
  const people = data?.people ?? [];
  const personName = (id: string | null | undefined) => people.find((p) => p.id === id)?.name ?? "Friend";
  const owed = friendBalances(data?.friendTxs ?? []);
  const monthLabel = fmtDate(month, { month: "long", year: "numeric" });
  async function recategorise(t: Transaction, categoryId: string) {
    try {
      await update("transactions", t.id, { category_id: categoryId || null });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copyNote(id: string) {
    const text = friendSummary(personName(id), monthLabel, txs.filter((t) => t.for_contact_id === id), categories, owed.get(id) ?? {});
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      prompt("Copy this note:", text);
    }
  }
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorised";

  async function setBudget(categoryId: string, value: string, existing?: MonthlyBudget) {
    try {
      if (value === "" && existing) await remove("monthly_budgets", { id: existing.id });
      else if (value !== "") await upsert("monthly_budgets", { category_id: categoryId, month, currency: cur, amount: Number(value) }, "category_id,month,currency");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copyLastMonth() {
    const prev = await list<MonthlyBudget>("monthly_budgets", { eq: { month: addMonths(month, -1) } });
    if (!prev.length) return setError("No budgets set last month.");
    await upsert("monthly_budgets", prev.map((b) => ({ category_id: b.category_id, month, currency: b.currency, amount: b.amount })), "category_id,month,currency");
  }

  return (
    <section>
      <PageHeader
        section="budget"
        title="Budget"
        subtitle="Income, expenses and transfers, with monthly budgets per category."
        actions={
          <>
            <button onClick={() => setModal("categories")}><Settings2 size={15} /> Categories</button>
            <button className="primary" onClick={() => setModal("new")}><Plus size={16} /> Transaction</button>
          </>
        }
      />
      <div className="month-nav">
        <button className="icon" aria-label="Previous month" onClick={() => setQuery("month", addMonths(month, -1))}><ChevronLeft size={18} /></button>
        <h2>{fmtDate(month, { month: "long", year: "numeric" })}</h2>
        <button className="icon" aria-label="Next month" onClick={() => setQuery("month", addMonths(month, 1))}><ChevronRight size={18} /></button>
        {month !== startOfMonth(today()) && <button className="small" onClick={() => setQuery("month", undefined)}>This month</button>}
      </div>
      <ErrorText error={loadError || error} />

      <div className="stats">
        {[...totals].map(([c, t]) => (
          <div className="card stat" key={c}>
            <span className="stat-cur">{c}</span>
            <div className="stat-line"><span>Income</span><strong className="pos">{formatMoney(t.income / 100, c)}</strong></div>
            <div className="stat-line"><span>Expenses</span><strong className="neg">{formatMoney(t.expense / 100, c)}</strong></div>
            <div className="stat-line net"><span>Net</span><strong className={t.income - t.expense >= 0 ? "pos" : "neg"}>{formatMoney((t.income - t.expense) / 100, c)}</strong></div>
          </div>
        ))}
        <div className="card stat">
          <span className="stat-cur">Budget · {cur}</span>
          <div className="stat-line"><span>Budgeted</span><strong>{formatMoney(totalBudget / 100, cur)}</strong></div>
          <div className="stat-line"><span>Spent in budgeted categories</span><strong>{formatMoney(totalActual / 100, cur)}</strong></div>
          <div className="stat-line net"><span>Remaining</span><strong className={totalBudget - totalActual >= 0 ? "pos" : "neg"}>{formatMoney((totalBudget - totalActual) / 100, cur)}</strong></div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="card list-card">
            <div className="section-head pad-x">
              <h2 className="section-title">Transactions</h2>
              <span className="row">
                <Select label="Type" allLabel="All types" value={kindFilter} options={[["expense", "Expenses"], ["income", "Income"], ["transfer", "Transfers"]]} onChange={(v) => setQuery("kind", v)} />
                <Select label="Category" allLabel="All categories" value={catFilter} options={categories.map((c) => [c.id, c.name] as [string, string])} onChange={(v) => setQuery("category", v)} />
              </span>
            </div>
            {shown.length === 0 ? <Empty>No transactions this month.</Empty> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th></tr></thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id} className="clickable" onClick={() => setModal(t)}>
                        <td className="date">{fmtDate(t.occurred_on, { day: "2-digit", month: "short" })}</td>
                        <td>
                          {t.description}
                          {t.for_contact_id && <> <Badge tone="accent">{t.kind === "income" ? "from" : "for"} {personName(t.for_contact_id)}</Badge></>}
                          {t.payment_method && <div className="muted small">{t.payment_method}</div>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {t.kind === "transfer" ? <Badge tone="quiet">Transfer</Badge> : (
                            <CategorySelect className="inline-select" label={`Category for ${t.description}`} value={t.category_id} categories={categories} kind={t.kind === "income" ? "income" : "expense"} onChange={(id) => void recategorise(t, id ?? "")} />
                          )}
                        </td>
                        <td className={`num ${t.kind === "income" ? "pos" : t.kind === "expense" ? "neg" : "muted"}`}>
                          {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{formatMoney(t.amount, t.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="detail-side">
          <MoneyOutCard month={month} nextMonth={addMonths(month, 1)} currency={cur} txs={txs} />
          {owed.size > 0 && (
            <div className="card pad friends-card">
              <h3>Spent for friends</h3>
              {[...owed].map(([id, per]) => {
                const month = txs.filter((t) => t.for_contact_id === id && t.kind === "expense").reduce((s, t) => s + cents(t.amount), 0);
                const due = Object.entries(per).filter(([, v]) => Math.abs(v) >= 0.01);
                return (
                  <div key={id} className="friend-row">
                    <div className="stat-line">
                      <span><strong>{personName(id)}</strong>{month > 0 && <span className="muted small"> · {formatMoney(month / 100, cur)} this month</span>}</span>
                      <strong className={due.length ? "pos" : "muted"}>{due.length ? `owes ${due.map(([c, v]) => formatMoney(v, c)).join(" + ")}` : "settled"}</strong>
                    </div>
                    <div className="row wrap">
                      <button className="small" onClick={() => setQuery("for", forFilter === id ? undefined : id)}>{forFilter === id ? "Show everyone" : "Show spends"}</button>
                      <button className="small" onClick={() => void copyNote(id)}>{copied === id ? "Copied ✓" : "Copy note to send"}</button>
                      <button className="small" onClick={() => setModal({ paidBack: id })}>{personName(id)} paid back</button>
                    </div>
                  </div>
                );
              })}
              <p className="muted small">Spends marked “for” someone stay on the card but out of your own budget.</p>
            </div>
          )}
          {combined && combined.income !== null && combined.expense !== null && (
            <div className="card pad">
              <h3>All currencies ≈ {cur}</h3>
              <div className="stat-line"><span>Income</span><strong className="pos">{formatMoney(combined.income, cur)}</strong></div>
              <div className="stat-line"><span>Spent</span><strong>{formatMoney(combined.expense, cur)}</strong></div>
              <p className="muted small">Estimate at rates of {fmtDate(fx!.date)}; totals above stay in their own currencies.</p>
            </div>
          )}
          <div className="card pad">
            <div className="section-head">
              <h3>Budget vs actual ({cur})</h3>
              <button className="small" title="Copy last month's budgets" onClick={() => void copyLastMonth()}><Copy size={13} /> Copy last month</button>
            </div>
            {rows.length === 0 ? <p className="muted small">Add expense categories to set budgets.</p> : (
              <ul className="budget-rows">
                {rows.map(({ c, budget, budgeted, actual }) => {
                  const pct = budgeted ? Math.min(100, Math.round((100 * actual) / budgeted)) : actual ? 100 : 0;
                  const over = budgeted > 0 && actual > budgeted;
                  return (
                    <li key={c.id}>
                      <div className="budget-row-head">
                        <span>{c.name}</span>
                        <input
                          key={`${c.id}-${budget?.amount ?? ""}-${month}`}
                          type="number"
                          min="0"
                          step="1"
                          className="budget-input"
                          aria-label={`Budget for ${c.name}`}
                          placeholder="No budget"
                          defaultValue={budget ? String(budget.amount) : ""}
                          onBlur={(e) => e.target.value !== (budget ? String(budget.amount) : "") && void setBudget(c.id, e.target.value, budget)}
                        />
                      </div>
                      <div className={`bar ${over ? "over" : ""}`}><span style={{ width: `${pct}%` }} /></div>
                      <span className={`small ${over ? "neg" : "muted"}`}>
                        {formatMoney(actual / 100, cur)} spent{budgeted ? ` · ${over ? `${formatMoney((actual - budgeted) / 100, cur)} over` : `${formatMoney((budgeted - actual) / 100, cur)} left`}` : ""}
                      </span>
                    </li>
                  );
                })}
                {uncategorised > 0 && <li className="small muted">Uncategorised: {formatMoney(uncategorised / 100, cur)}</li>}
              </ul>
            )}
            {otherCurrencyLines.length > 0 && (
              <p className="small muted">
                Other currencies: {otherCurrencyLines.map((l) => `${l.category} ${formatMoney(Number(l.actual), l.currency)}`).join(", ")}
              </p>
            )}
          </div>
          <RecurringCard categories={categories} currency={cur} />
        </aside>
      </div>

      {modal && typeof modal === "object" && "paidBack" in modal && (
        <Modal title={`${personName(modal.paidBack)} paid you back`} onClose={() => setModal(null)}>
          <TransactionForm categories={categories} currency={cur} presetKind="income" presetFor={modal.paidBack} presetDescription={`Paid back by ${personName(modal.paidBack)}`} onDone={() => setModal(null)} />
        </Modal>
      )}
      {(modal === "new" || (modal && typeof modal === "object" && !("paidBack" in modal))) && (
        <Modal title={modal === "new" ? "New transaction" : "Edit transaction"} onClose={() => setModal(null)}>
          <TransactionForm tx={modal === "new" ? undefined : (modal as Transaction)} categories={categories} currency={cur} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === "categories" && (
        <Modal title="Categories" onClose={() => setModal(null)}>
          <CategoryManager categories={categories} />
        </Modal>
      )}
    </section>
  );
}

function CategoryManager({ categories }: { categories: BudgetCategory[] }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BudgetCategory["kind"]>("expense");
  const [error, setError] = useState("");
  const run = (p: Promise<unknown>) => p.catch((e: Error) => setError(e.message.includes("duplicate") ? "That category already exists" : e.message));

  return (
    <div className="form">
      {(["expense", "income"] as const).map((k) => (
        <div key={k}>
          <h3>{k === "expense" ? "Expense categories" : "Income categories"}</h3>
          <ul className="category-list">
            {categories.filter((c) => c.kind === k).map((c) => (
              <li key={c.id} className={c.archived_at ? "closed" : ""}>
                <input className="inline-edit" aria-label="Category name" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void run(update("budget_categories", c.id, { name: e.target.value.trim() }))} />
                <button className="small" onClick={() => void run(update("budget_categories", c.id, { archived_at: c.archived_at ? null : new Date().toISOString() }))}>{c.archived_at ? "Restore" : "Archive"}</button>
                <button
                  className="icon danger"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => confirmDanger(`Delete “${c.name}”? Only possible if no transactions use it — archive it otherwise.`) && void run(remove("budget_categories", { id: c.id }))}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form className="category-create" onSubmit={e=>{e.preventDefault();if(name.trim())void run(insert("budget_categories",{name:name.trim(),kind}).then(()=>setName("")))}}>
        <label>Category name<input required placeholder="e.g. Groceries or Card repayments" aria-label="New category" value={name} onChange={e=>setName(e.target.value)} /></label>
        <label>Category type<select value={kind} onChange={e=>setKind(e.target.value as BudgetCategory["kind"])}><option value="expense">Expense</option><option value="income">Income</option></select></label>
        <button type="submit" disabled={!name.trim()}><Plus size={15}/> Add category</button>
      </form>
      <ErrorText error={error} />
    </div>
  );
}

