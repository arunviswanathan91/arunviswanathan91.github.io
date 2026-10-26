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
  return "open";
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

