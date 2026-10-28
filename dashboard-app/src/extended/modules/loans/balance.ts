// Pure loan arithmetic, kept free of React and Supabase so it can be unit tested.
// Money is handled in cents to avoid floating point drift.

export type Direction = "lent" | "borrowed";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Loan {
  account_type?: "personal" | "bank" | "credit_card";
  account_name?: string | null;
  card_last4?: string | null;
  credit_limit?: number | null;
  minimum_due?: number | null;
  emi_amount?: number | null;
  emi_first_on?: string | null;
  emi_tenure?: number | null;
  interest_rate?: number | null;
  /** EMIs entered one by one (date and amount), when they are not all the same. */
  emi_schedule?: EmiInstalment[] | null;
  statement_amount?: number | null;
  statement_on?: string | null;
  statement_due_on?: string | null;
  /** Net card spending recorded in the budget (expenses minus refunds), added to the balance. */
  charged?: number;
  id: string;
  contact_id: string;
  direction: Direction;
  amount: number;
  currency: string;
  issued_on: string;
  due_on: string | null;
  note: string | null;
}

export interface Payment {
  id: string;
  loan_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
}

export type LoanStatus = "open" | "overdue" | "settled";

const cents = (n: number) => Math.round(Number(n) * 100);

export function paidCents(loan: Loan, payments: Payment[]): number {
  return payments.filter((p) => p.loan_id === loan.id).reduce((sum, p) => sum + cents(p.amount), 0);
}

/** Starting amount plus card spending: everything that has been owed on this account. */
export function totalOwed(loan: Loan): number {
  return (cents(loan.amount) + cents(loan.charged ?? 0)) / 100;
}

/** What is still outstanding on a loan, never below zero. */
export function remaining(loan: Loan, payments: Payment[]): number {
  return Math.max(0, cents(totalOwed(loan)) - paidCents(loan, payments)) / 100;
}

/** Card spending entries (budget transactions linked to a card). */
export interface Charge {
  id: string;
  loan_id: string;
  kind: "income" | "expense" | "transfer";
  description: string;
  amount: number;
  occurred_on: string;
}

/** Net spending per card in cents: expenses add, refunds (income) subtract. */
export function chargedByLoan(charges: Charge[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of charges) {
    const sign = c.kind === "expense" ? 1 : c.kind === "income" ? -1 : 0;
    out[c.loan_id] = (out[c.loan_id] ?? 0) + sign * cents(c.amount);
  }
  for (const k of Object.keys(out)) out[k] /= 100;
  return out;
}

export function loanStatus(loan: Loan, payments: Payment[], today: string): LoanStatus {
  if (remaining(loan, payments) === 0) return "settled";
  if (loan.due_on && loan.due_on < today) return "overdue";
  if ((emiPlan(loan, payments, today)?.overdueCount ?? 0) > 0) return "overdue";
  if (statementPlan(loan, payments, today)?.state === "overdue") return "overdue";
  return "open";
}

/** Add whole months to a YYYY-MM-DD day, keeping the day of month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsClamped(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export interface EmiInstalment {
  on: string;
  amount: number;
}

export interface EmiPlan {
  emi: number;
  /** Instalments fully covered by the money paid so far. */
  covered: number;
  tenure: number | null;
  /** Instalments left to pay, when the tenure is known. */
  left: number | null;
  /** Date of the first uncovered instalment; null when all are covered. */
  nextDue: string | null;
  /** Instalment dates before today that are not yet covered. */
  overdueCount: number;
  /** Amount behind the schedule as of today (instalments due on or before today). */
  dueNow: number;
  /** What the next instalment needs: the EMI, less any part already paid, and never more than is left (a short last EMI). */
  nextAmount: number;
  /** Date of the last instalment, when the tenure is known. */
  finalDate: string | null;
}

/** Match repayments to a fixed monthly EMI schedule. Null when the loan has no EMI set. */
/** Instalments in date order, as the list the user entered. */
export function sortedSchedule(schedule: EmiInstalment[]): EmiInstalment[] {
  return schedule.filter((e) => e.on && e.amount > 0).slice().sort((a, b) => a.on.localeCompare(b.on));
}

/** EMIs entered one by one: payments cover them in date order, whatever their amounts. */
function schedulePlan(loan: Loan, schedule: EmiInstalment[], payments: Payment[], today: string): EmiPlan {
  const list = sortedSchedule(schedule);
  const paid = paidCents(loan, payments);
  const left = cents(remaining(loan, payments));
  let upto = 0;
  let covered = 0;
  let nextDue: string | null = null;
  let nextAmount = 0;
  let overdueCount = 0;
  let dueByToday = 0;
  for (const e of list) {
    const before = upto;
    upto += cents(e.amount);
    if (e.on <= today) dueByToday = upto;
    if (upto <= paid) {
      covered++;
      continue;
    }
    if (left === 0) break;
    if (!nextDue) {
      nextDue = e.on;
      nextAmount = Math.min(left, upto - Math.max(paid, before));
    }
    if (e.on < today) overdueCount++;
  }
  return {
    emi: list[covered]?.amount ?? list.at(-1)?.amount ?? 0,
    covered: left === 0 ? list.length : covered,
    tenure: list.length,
    left: left === 0 ? 0 : list.length - covered,
    nextDue: left === 0 ? null : nextDue,
    overdueCount,
    dueNow: Math.min(left, Math.max(0, dueByToday - paid)) / 100,
    nextAmount: left === 0 ? 0 : nextAmount / 100,
    finalDate: list.at(-1)?.on ?? null,
  };
}

/** Same EMI every month from the first EMI date, to fill an editable schedule. */
export function monthlySchedule(first: string, amount: number, count: number, total?: number): EmiInstalment[] {
  const out: EmiInstalment[] = [];
  let leftCents = total === undefined ? Infinity : cents(total);
  for (let i = 0; i < count && leftCents > 0; i++) {
    const c = Math.min(cents(amount), leftCents);
    out.push({ on: addMonthsClamped(first, i), amount: c / 100 });
    leftCents -= c;
  }
  return out;
}

export function emiPlan(loan: Loan, payments: Payment[], today: string): EmiPlan | null {
  if (loan.emi_schedule?.length) return schedulePlan(loan, loan.emi_schedule, payments, today);
  if (!loan.emi_amount || !loan.emi_first_on) return null;
  const emi = cents(loan.emi_amount);
  const tenure = loan.emi_tenure ?? null;
  const settled = remaining(loan, payments) === 0;
  let covered = settled ? (tenure ?? Math.floor(paidCents(loan, payments) / emi)) : Math.floor(paidCents(loan, payments) / emi);
  if (tenure !== null) covered = Math.min(covered, tenure);
  const has = (i: number) => tenure === null || i < tenure;
  const nextDue = settled || !has(covered) ? null : addMonthsClamped(loan.emi_first_on, covered);
  let overdueCount = 0;
  let dueCount = 0;
  if (!settled) {
    for (let i = covered; has(i); i++) {
      const date = addMonthsClamped(loan.emi_first_on, i);
      if (date > today) break;
      dueCount++;
      if (date < today) overdueCount++;
    }
  }
  // Money already paid beyond the covered instalments counts towards the next one.
  const spill = paidCents(loan, payments) - covered * emi;
  const left = cents(remaining(loan, payments));
  const dueNow = Math.min(left, Math.max(0, dueCount * emi - Math.max(0, spill))) / 100;
  const nextAmount = nextDue ? Math.min(left, emi - Math.max(0, spill)) / 100 : 0;
  return {
    emi: emi / 100,
    covered,
    tenure,
    left: tenure === null ? null : Math.max(0, tenure - covered),
    nextDue,
    overdueCount,
    dueNow,
    nextAmount,
    finalDate: tenure === null ? null : addMonthsClamped(loan.emi_first_on, tenure - 1),
  };
}

export type StatementState = "paid" | "minimum_paid" | "due" | "overdue";

export interface StatementPlan {
  statement: number;
  statementOn: string;
  dueOn: string | null;
  /** Paid since the statement was generated. */
  paid: number;
  statementLeft: number;
  minimumDue: number;
  minimumLeft: number;
  /** False when no minimum amount due was entered (it is then not reported as paid). */
  minimumKnown: boolean;
  /** Spending after the statement was generated. */
  unbilled: number;
  /** Card balance on the statement date minus the statement's total; null when not checkable. */
  mismatch: number | null;
  state: StatementState;
  /** Past the due date with part of the statement unpaid, so interest is likely. */
  interestRisk: boolean;
}

/** Current-statement view of a credit card. Null when no statement has been entered. */
/**
 * Where the card stands against its latest statement. Pass the card's spending entries to get real
 * spending since the statement and a check that the tracked balance matches the bill; without them
 * everything owed beyond the statement counts as new spending.
 */
export function statementPlan(loan: Loan, payments: Payment[], today: string, charges?: Charge[]): StatementPlan | null {
  if (loan.account_type !== "credit_card" || loan.statement_amount == null || !loan.statement_on) return null;
  const statement = cents(loan.statement_amount);
  const minimumKnown = loan.minimum_due != null;
  const minimum = Math.min(statement, cents(loan.minimum_due ?? 0));
  const statementOn = loan.statement_on;
  const paid = payments
    .filter((p) => p.loan_id === loan.id && p.paid_on >= statementOn)
    .reduce((sum, p) => sum + cents(p.amount), 0);
  const statementLeft = Math.max(0, statement - paid);
  const minimumLeft = Math.max(0, minimum - paid);
  const dueOn = loan.statement_due_on ?? null;
  const pastDue = dueOn !== null && today > dueOn;
  const minimumMet = minimumKnown && minimumLeft === 0;
  const state: StatementState = statementLeft === 0 ? "paid" : pastDue && !minimumMet ? "overdue" : minimumMet ? "minimum_paid" : "due";
  const owed = cents(remaining(loan, payments));
  let unbilled = Math.max(0, owed - statementLeft);
  let mismatch: number | null = null;
  if (charges) {
    unbilled = charges
      .filter((c) => c.loan_id === loan.id && c.occurred_on > statementOn)
      .reduce((sum, c) => sum + (c.kind === "expense" ? cents(c.amount) : c.kind === "income" ? -cents(c.amount) : 0), 0);
    // Only checkable when the card was tracked by the statement date.
    if (loan.issued_on <= statementOn) mismatch = owed + paid - unbilled - statement;
  }
  return {
    statement: statement / 100,
    statementOn,
    dueOn,
    paid: paid / 100,
    statementLeft: statementLeft / 100,
    minimumDue: minimum / 100,
    minimumLeft: minimumLeft / 100,
    minimumKnown,
    unbilled: Math.max(0, unbilled) / 100,
    mismatch: mismatch === null ? null : mismatch / 100,
    state,
    interestRisk: pastDue && statementLeft > 0,
  };
}

/** Credit-limit usage: tracked balance against the limit. Null without a limit. */
export function cardUsage(loan: Loan, payments: Payment[]): { used: number; available: number; utilization: number } | null {
  if (loan.account_type !== "credit_card" || !loan.credit_limit) return null;
  const used = remaining(loan, payments);
  return { used, available: Math.max(0, loan.credit_limit - used), utilization: used / loan.credit_limit };
}

export interface CurrencyTotals {
  owedToMe: number;
  iOwe: number;
  net: number;
}

/** Outstanding totals per currency. Currencies are never mixed or converted. */
export function totalsByCurrency(loans: Loan[], payments: Payment[]): Record<string, CurrencyTotals> {
  const acc: Record<string, { owedToMe: number; iOwe: number }> = {};
  for (const loan of loans) {
    const left = cents(remaining(loan, payments));
    if (left === 0) continue;
    const t = (acc[loan.currency] ??= { owedToMe: 0, iOwe: 0 });
    if (loan.direction === "lent") t.owedToMe += left;
    else t.iOwe += left;
  }
  const out: Record<string, CurrencyTotals> = {};
  for (const [cur, t] of Object.entries(acc)) {
    out[cur] = { owedToMe: t.owedToMe / 100, iOwe: t.iOwe / 100, net: (t.owedToMe - t.iOwe) / 100 };
  }
  return out;
}

export interface ContactBalance {
  contact: Contact;
  /** Positive: they owe you. Negative: you owe them. Only non-zero currencies. */
  net: Record<string, number>;
  openLoans: number;
  overdueLoans: number;
}

export function balancesByContact(contacts: Contact[], loans: Loan[], payments: Payment[], today: string): ContactBalance[] {
  return contacts
    .map((contact) => {
      const mine = loans.filter((l) => l.contact_id === contact.id);
      const totals = totalsByCurrency(mine, payments);
      const net: Record<string, number> = {};
      for (const [cur, t] of Object.entries(totals)) if (t.net !== 0) net[cur] = t.net;
      const statuses = mine.map((l) => loanStatus(l, payments, today));
      return {
        contact,
        net,
        openLoans: statuses.filter((s) => s !== "settled").length,
        overdueLoans: statuses.filter((s) => s === "overdue").length,
      };
    })
    .sort((a, b) => b.openLoans - a.openLoans || a.contact.name.localeCompare(b.contact.name));
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function todayISO(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}


export interface AmortisationRow {
  n: number;
  date: string;
  emi: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface Amortisation {
  principal: number;
  totalInterest: number;
  rows: AmortisationRow[];
  /** Principal still owed after the instalments covered so far. */
  outstandingPrincipal: number;
  /** Interest saved by paying the outstanding principal now instead of the remaining EMIs. */
  prepaySaving: number;
}

/**
 * Reducing-balance schedule implied by the EMI, annual rate and tenure. The principal is derived from
 * the EMI (P = EMI × (1 − (1 + r)^−n) / r), so it works whatever the loan's tracked amount includes.
 */
export function amortisation(loan: Loan, payments: Payment[], today: string): Amortisation | null {
  const plan = emiPlan(loan, payments, today);
  // The interest split assumes equal EMIs, so it is skipped for EMIs entered one by one.
  if (!plan || loan.emi_schedule?.length || !loan.emi_tenure || loan.interest_rate == null || !loan.emi_first_on) return null;
  const n = loan.emi_tenure;
  const r = loan.interest_rate / 1200;
  const principal = r === 0 ? plan.emi * n : (plan.emi * (1 - Math.pow(1 + r, -n))) / r;
  const rows: AmortisationRow[] = [];
  let balance = principal;
  for (let i = 0; i < n; i++) {
    const interest = balance * r;
    const part = i === n - 1 ? balance : plan.emi - interest;
    balance = Math.max(0, balance - part);
    rows.push({ n: i + 1, date: addMonthsClamped(loan.emi_first_on, i), emi: round2(interest + part), interest: round2(interest), principal: round2(part), balance: round2(balance) });
  }
  const outstandingPrincipal = plan.covered === 0 ? round2(principal) : rows[plan.covered - 1]?.balance ?? 0;
  const remainingEmis = rows.slice(plan.covered).reduce((sum, row) => sum + row.emi, 0);
  return {
    principal: round2(principal),
    totalInterest: round2(rows.reduce((sum, row) => sum + row.interest, 0)),
    rows,
    outstandingPrincipal,
    prepaySaving: round2(Math.max(0, remainingEmis - outstandingPrincipal)),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Suggested values for the next month's statement: a month after the current one (same gap to the due date), for the balance owed now. */
export function nextStatementDefaults(loan: Loan, payments: Payment[], today: string): { statement_on: string; statement_due_on: string; statement_amount: number; minimum_due: number } {
  const statementOn = loan.statement_on ? addMonthsClamped(loan.statement_on, 1) : today;
  const gap = loan.statement_on && loan.statement_due_on ? daysBetween(loan.statement_on, loan.statement_due_on) : 20;
  const amount = remaining(loan, payments);
  return {
    statement_on: statementOn,
    statement_due_on: addDaysISO(statementOn, gap),
    statement_amount: amount,
    // Indian issuers commonly ask for about 5 %; the user edits it to match the bill.
    minimum_due: Math.min(amount, Math.ceil(amount * 0.05)),
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

function addDaysISO(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

// ── Lender names ──
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** The existing person or bank with this name, so adding "Axis Bank" twice reuses the first one. */
export function findByName(contacts: Contact[], name: string): Contact | undefined {
  return contacts.find((c) => nameKey(c.name) === nameKey(name));
}

/** One entry per name for pickers, preferring the copy that loans already use (and always keeping `keep`). */
export function uniqueByName(contacts: Contact[], loans: Loan[], keep?: string): Contact[] {
  const used = new Set(loans.map((l) => l.contact_id));
  const out = new Map<string, Contact>();
  for (const c of contacts) {
    const k = nameKey(c.name);
    const have = out.get(k);
    if (!have || (have.id !== keep && (c.id === keep || (!used.has(have.id) && used.has(c.id))))) out.set(k, c);
  }
  return [...out.values()];
}

