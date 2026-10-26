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
  statement_amount?: number | null;
  statement_on?: string | null;
  statement_due_on?: string | null;
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

/** What is still outstanding on a loan, never below zero. */
export function remaining(loan: Loan, payments: Payment[]): number {
  return Math.max(0, cents(loan.amount) - paidCents(loan, payments)) / 100;
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
  /** Date of the last instalment, when the tenure is known. */
  finalDate: string | null;
}

/** Match repayments to a fixed monthly EMI schedule. Null when the loan has no EMI set. */
export function emiPlan(loan: Loan, payments: Payment[], today: string): EmiPlan | null {
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
  const dueNow = Math.max(0, dueCount * emi - Math.max(0, spill)) / 100;
  return {
    emi: emi / 100,
    covered,
    tenure,
    left: tenure === null ? null : Math.max(0, tenure - covered),
    nextDue,
    overdueCount,
    dueNow,
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
  /** Tracked balance that is not on the statement (spending after it was generated). */
  unbilled: number;
  state: StatementState;
  /** Past the due date with part of the statement unpaid, so interest is likely. */
  interestRisk: boolean;
}

/** Current-statement view of a credit card. Null when no statement has been entered. */
export function statementPlan(loan: Loan, payments: Payment[], today: string): StatementPlan | null {
  if (loan.account_type !== "credit_card" || loan.statement_amount == null || !loan.statement_on) return null;
  const statement = cents(loan.statement_amount);
  const minimum = Math.min(statement, cents(loan.minimum_due ?? 0));
  const statementOn = loan.statement_on;
  const paid = payments
    .filter((p) => p.loan_id === loan.id && p.paid_on >= statementOn)
    .reduce((sum, p) => sum + cents(p.amount), 0);
  const statementLeft = Math.max(0, statement - paid);
  const minimumLeft = Math.max(0, minimum - paid);
  const dueOn = loan.statement_due_on ?? null;
  const pastDue = dueOn !== null && today > dueOn;
  const state: StatementState = statementLeft === 0 ? "paid" : pastDue && minimumLeft > 0 ? "overdue" : minimumLeft === 0 ? "minimum_paid" : "due";
  return {
    statement: statement / 100,
    statementOn,
    dueOn,
    paid: paid / 100,
    statementLeft: statementLeft / 100,
    minimumDue: minimum / 100,
    minimumLeft: minimumLeft / 100,
    unbilled: Math.max(0, cents(remaining(loan, payments)) - statementLeft) / 100,
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

