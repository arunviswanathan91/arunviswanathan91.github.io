import { test } from "node:test";
import assert from "node:assert/strict";
import { balancesByContact, loanStatus, remaining, totalsByCurrency, type Contact, type Loan, type Payment } from "../src/extended/modules/loans/balance.ts";

const anna: Contact = { id: "c1", name: "Anna", phone: null, email: null, notes: null };
const ben: Contact = { id: "c2", name: "Ben", phone: null, email: null, notes: null };

const loan = (id: string, contact_id: string, direction: "lent" | "borrowed", amount: number, currency = "SEK", due_on: string | null = null): Loan =>
  ({ id, contact_id, direction, amount, currency, issued_on: "2026-01-01", due_on, note: null });
const pay = (loan_id: string, amount: number): Payment => ({ id: `p-${loan_id}-${amount}`, loan_id, amount, paid_on: "2026-02-01", note: null });

test("remaining subtracts payments without float drift", () => {
  const l = loan("l1", "c1", "lent", 100.3);
  assert.equal(remaining(l, [pay("l1", 0.1), pay("l1", 0.2)]), 100);
});

test("overpayment counts as settled, not negative", () => {
  const l = loan("l1", "c1", "lent", 50);
  assert.equal(remaining(l, [pay("l1", 80)]), 0);
  assert.equal(loanStatus(l, [pay("l1", 80)], "2026-03-01"), "settled");
});

test("status is overdue only after the due date while money is outstanding", () => {
  const l = loan("l1", "c1", "lent", 50, "SEK", "2026-03-01");
  assert.equal(loanStatus(l, [], "2026-03-01"), "open");
  assert.equal(loanStatus(l, [], "2026-03-02"), "overdue");
});

test("totals are kept per currency and split by direction", () => {
  const loans = [loan("l1", "c1", "lent", 500), loan("l2", "c2", "borrowed", 200), loan("l3", "c1", "lent", 1000, "INR")];
  const t = totalsByCurrency(loans, [pay("l1", 100)]);
  assert.deepEqual(t.SEK, { owedToMe: 400, iOwe: 200, net: 200 });
  assert.deepEqual(t.INR, { owedToMe: 1000, iOwe: 0, net: 1000 });
});

test("per-person net nets lending against borrowing with the same person", () => {
  const loans = [loan("l1", "c1", "lent", 500), loan("l2", "c1", "borrowed", 300), loan("l3", "c2", "lent", 50)];
  const rows = balancesByContact([anna, ben], loans, [pay("l3", 50)], "2026-03-01");
  assert.deepEqual(rows.find((r) => r.contact.id === "c1")!.net, { SEK: 200 });
  assert.deepEqual(rows.find((r) => r.contact.id === "c2")!.net, {});
  assert.equal(rows[0].contact.id, "c1");
});


// ── EMI and credit-card statements ───────────────────────────────────────────
import { addMonthsClamped, cardUsage, emiPlan, statementPlan } from "../src/extended/modules/loans/balance.ts";

const emiLoan: Loan = { ...loan("e1", "c1", "borrowed", 12000, "INR"), account_type: "bank", emi_amount: 1000, emi_first_on: "2026-01-31", emi_tenure: 12 };
const payOn = (loan_id: string, amount: number, paid_on: string): Payment => ({ id: `${loan_id}-${paid_on}`, loan_id, amount, paid_on, note: null });

test("months are added keeping the day of month, clamped to month end", () => {
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsClamped("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonthsClamped("2026-11-15", 3), "2027-02-15");
});

test("EMI plan matches repayments to instalments and finds the next due date", () => {
  const p = emiPlan(emiLoan, [payOn("e1", 1000, "2026-01-31"), payOn("e1", 1000, "2026-02-28")], "2026-03-10")!;
  assert.equal(p.covered, 2);
  assert.equal(p.left, 10);
  assert.equal(p.nextDue, "2026-03-31");
  assert.equal(p.overdueCount, 0);
  assert.equal(p.finalDate, "2026-12-31");
});

test("an unpaid EMI past its date makes the loan overdue", () => {
  const paid = [payOn("e1", 1000, "2026-01-31")];
  assert.equal(emiPlan(emiLoan, paid, "2026-03-15")!.overdueCount, 1);
  assert.equal(emiPlan(emiLoan, paid, "2026-03-15")!.dueNow, 1000);
  assert.equal(loanStatus(emiLoan, paid, "2026-02-28"), "open");
  assert.equal(loanStatus(emiLoan, paid, "2026-03-15"), "overdue");
});

test("clearing the loan completes the EMI schedule", () => {
  const p = emiPlan(emiLoan, [payOn("e1", 12000, "2026-02-01")], "2026-06-01")!;
  assert.equal(p.left, 0);
  assert.equal(p.nextDue, null);
});

const card: Loan = { ...loan("k1", "c1", "borrowed", 20000, "INR"), account_type: "credit_card", credit_limit: 50000, minimum_due: 1000,
  statement_amount: 15000, statement_on: "2026-10-01", statement_due_on: "2026-10-20" };

test("card statement tracks minimum due, statement balance and new spending", () => {
  let s = statementPlan(card, [], "2026-10-10")!;
  assert.equal(s.state, "due");
  assert.equal(s.statementLeft, 15000);
  assert.equal(s.unbilled, 5000);
  s = statementPlan(card, [payOn("k1", 1000, "2026-10-05")], "2026-10-10")!;
  assert.equal(s.state, "minimum_paid");
  assert.equal(s.minimumLeft, 0);
  s = statementPlan(card, [payOn("k1", 15000, "2026-10-05")], "2026-10-10")!;
  assert.equal(s.state, "paid");
  assert.equal(s.unbilled, 5000);
});

test("payments before the statement date do not count, and a missed minimum is overdue", () => {
  const early = [payOn("k1", 1000, "2026-09-25")];
  assert.equal(statementPlan(card, early, "2026-10-10")!.paid, 0);
  assert.equal(statementPlan(card, early, "2026-10-21")!.state, "overdue");
  assert.equal(loanStatus(card, early, "2026-10-21"), "overdue");
  const minOnly = [payOn("k1", 1000, "2026-10-15")];
  const s = statementPlan(card, minOnly, "2026-10-21")!;
  assert.equal(s.state, "minimum_paid");
  assert.equal(s.interestRisk, true);
});

test("card usage is the tracked balance against the limit", () => {
  const u = cardUsage(card, [payOn("k1", 5000, "2026-10-05")])!;
  assert.equal(u.used, 15000);
  assert.equal(u.available, 35000);
  assert.equal(u.utilization, 0.3);
});

// ── Card spending, amortisation, next statement ─────────────────────────────
import { amortisation, chargedByLoan, nextStatementDefaults, totalOwed } from "../src/extended/modules/loans/balance.ts";
import { toCsv } from "../src/extended/lib/download.ts";

test("card spending adds to the balance and refunds lower it", () => {
  const charged = chargedByLoan([
    { id: "t1", loan_id: "k1", kind: "expense", description: "Food", amount: 300.1, occurred_on: "2026-10-12" },
    { id: "t2", loan_id: "k1", kind: "income", description: "Refund", amount: 0.1, occurred_on: "2026-10-13" },
  ]);
  const withSpend = { ...card, charged: charged.k1 };
  assert.equal(totalOwed(withSpend), 20300);
  assert.equal(remaining(withSpend, [payOn("k1", 300, "2026-10-14")]), 20000);
  assert.equal(statementPlan(withSpend, [], "2026-10-10")!.unbilled, 5300);
});

test("amortisation derives the principal from EMI, rate and tenure", () => {
  // ₹1,00,000 at 12 % for 12 months has an EMI of about 8,884.88.
  const l: Loan = { ...emiLoan, amount: 106618.56, emi_amount: 8884.88, emi_tenure: 12, interest_rate: 12 };
  const a = amortisation(l, [], "2026-01-01")!;
  assert.ok(Math.abs(a.principal - 100000) < 1);
  assert.ok(Math.abs(a.totalInterest - 6618.56) < 1);
  assert.equal(a.rows.at(-1)!.balance, 0);
  assert.equal(a.rows[0].interest, 1000);
  const later = amortisation(l, [payOn("e1", 8884.88 * 6, "2026-06-30")], "2026-07-01")!;
  assert.ok(later.outstandingPrincipal > 50000 && later.outstandingPrincipal < 52000);
  assert.ok(later.prepaySaving > 1000);
  assert.equal(amortisation({ ...l, interest_rate: null }, [], "2026-01-01"), null);
});

test("next statement is a month on, for the balance owed now, with about 5 % minimum", () => {
  const d = nextStatementDefaults(card, [payOn("k1", 15000, "2026-10-15")], "2026-11-05");
  assert.deepEqual(d, { statement_on: "2026-11-01", statement_due_on: "2026-11-20", statement_amount: 5000, minimum_due: 250 });
  assert.equal(nextStatementDefaults(card, [], "2026-10-26").statement_on, "2026-11-01"); // upcoming date kept
});

test("CSV quotes commas, quotes and new lines", () => {
  assert.equal(toCsv([["a,b", 'say "hi"', "x\ny", null, 3]]), '﻿"a,b","say ""hi""","x\ny",,3\r\n');
});

test("a blank minimum amount due is never reported as paid", () => {
  const noMin = { ...card, minimum_due: null };
  const s = statementPlan(noMin, [], "2026-10-10")!;
  assert.equal(s.minimumKnown, false);
  assert.equal(s.state, "due");
  assert.equal(statementPlan(noMin, [], "2026-10-21")!.state, "overdue");
});

test("with spending entries, new purchases are real and a balance that disagrees with the bill is flagged", () => {
  // Starting balance 20,000 on 2026-09-01; the bill says 15,000, so 5,000 of payments/credits are missing.
  const tracked = { ...card, issued_on: "2026-09-01" };
  let s = statementPlan(tracked, [], "2026-10-10", [])!;
  assert.equal(s.unbilled, 0);
  assert.equal(s.mismatch, 5000);
  const charges = [
    { id: "t1", loan_id: "k1", kind: "income" as const, description: "Refund", amount: 5000, occurred_on: "2026-09-20" },
    { id: "t2", loan_id: "k1", kind: "expense" as const, description: "Food", amount: 300, occurred_on: "2026-10-05" },
  ];
  const withCharges = { ...tracked, charged: chargedByLoan(charges).k1 };
  s = statementPlan(withCharges, [payOn("k1", 1000, "2026-10-06")], "2026-10-10", charges)!;
  assert.equal(s.unbilled, 300);
  assert.equal(s.mismatch, 0);
});

// ── Lender names ────────────────────────────────────────────────────────────
import { findByName, uniqueByName } from "../src/extended/modules/loans/balance.ts";

test("lender names are reused and shown once", () => {
  const people = [{ id: "a", name: "Axis Bank" }, { id: "b", name: "axis  bank " }, { id: "c", name: "Slice" }] as Contact[];
  assert.equal(findByName(people, " AXIS bank")?.id, "a");
  const used = [{ ...loan("l", "b", "borrowed", 1, "INR") }];
  assert.deepEqual(uniqueByName(people, used).map((c) => c.id), ["b", "c"]);
  assert.deepEqual(uniqueByName(people, [], "b").map((c) => c.id), ["b", "c"]);
});

// ── EMIs that are not all the same ──────────────────────────────────────────
import { monthlySchedule } from "../src/extended/modules/loans/balance.ts";

const creditBee = (): Loan => ({ ...loan("cb", "c1", "borrowed", 51437, "INR"), emi_amount: 6162, emi_tenure: 9, emi_first_on: "2026-06-08" });
const emis = (n: number) => Array.from({ length: n }, (_, i) => payOn("cb", 6162, `2026-${String(6 + i).padStart(2, "0")}-08`));

test("same EMI every month: a short last EMI asks only for what is left", () => {
  let p = emiPlan(creditBee(), emis(5), "2026-10-29")!;
  assert.equal(p.nextDue, "2026-11-08");
  assert.equal(p.nextAmount, 6162);
  assert.equal(p.finalDate, "2027-02-08");
  const upToJan = [...emis(5), payOn("cb", 18486, "2027-01-08")];
  p = emiPlan(creditBee(), upToJan, "2027-01-10")!;
  assert.equal(p.nextDue, "2027-02-08");
  assert.equal(p.nextAmount, 2141);
  assert.equal(emiPlan(creditBee(), upToJan, "2027-02-09")!.dueNow, 2141);
});

test("monthly fill caps the last EMI at the loan amount", () => {
  const s = monthlySchedule("2026-06-08", 6162, 9, 51437);
  assert.equal(s.length, 9);
  assert.deepEqual(s.at(-1), { on: "2027-02-08", amount: 2141 });
  assert.equal(s[1].on, "2026-07-08");
});

test("EMIs entered one by one are covered in date order", () => {
  // A bigger first EMI, then equal ones, then a short last one.
  const schedule = [
    { on: "2026-06-08", amount: 8000 },
    { on: "2026-08-08", amount: 5000 },
    { on: "2026-07-08", amount: 5000 },
    { on: "2026-09-08", amount: 1500 },
  ];
  const l: Loan = { ...loan("sl", "c1", "borrowed", 19500, "INR"), emi_schedule: schedule };
  let p = emiPlan(l, [payOn("sl", 8000, "2026-06-08"), payOn("sl", 2000, "2026-07-08")], "2026-07-20")!;
  assert.equal(p.covered, 1);
  assert.equal(p.tenure, 4);
  assert.equal(p.nextDue, "2026-07-08");
  assert.equal(p.nextAmount, 3000); // rest of the July EMI
  assert.equal(p.overdueCount, 1);
  assert.equal(p.dueNow, 3000);
  assert.equal(p.finalDate, "2026-09-08");
  p = emiPlan(l, [payOn("sl", 18000, "2026-08-08")], "2026-08-20")!;
  assert.equal(p.nextDue, "2026-09-08");
  assert.equal(p.nextAmount, 1500);
  p = emiPlan(l, [payOn("sl", 19500, "2026-09-08")], "2026-09-20")!;
  assert.equal(p.nextDue, null);
  assert.equal(p.left, 0);
});

// ── Spending for a friend ───────────────────────────────────────────────────
import { friendBalances, friendSummary } from "../src/extended/modules/budget/friends.ts";

test("a friend owes their spends minus what they paid back, and the note lists them by category", () => {
  const tx = (id: string, kind: "expense" | "income", amount: number, on: string, category_id: string | null, description: string) =>
    ({ id, kind, amount, currency: "INR", category_id, occurred_on: on, payment_method: null, notes: null, description, for_contact_id: "j" });
  const txs = [
    tx("1", "expense", 500, "2026-10-03", "food", "Swiggy"),
    tx("2", "expense", 1200.5, "2026-10-09", "travel", "Uber"),
    tx("3", "income", 700, "2026-10-20", null, "Paid back by Justin"),
    { ...tx("4", "expense", 999, "2026-10-04", "food", "My lunch"), for_contact_id: null },
  ];
  assert.deepEqual(friendBalances(txs).get("j"), { INR: 1000.5 });
  assert.equal(friendBalances(txs).size, 1);
  const cats = [{ id: "food", name: "Food", kind: "expense" as const, color: null, archived_at: null }, { id: "travel", name: "Travel", kind: "expense" as const, color: null, archived_at: null }];
  const note = friendSummary("Justin", "October 2026", txs.filter((t) => t.for_contact_id === "j"), cats, { INR: 1000.5 });
  assert.match(note, /^Hi Justin, your share for October 2026:/);
  assert.match(note, /Food:\n  03 Oct 2026 · Swiggy · ₹500\.00/);
  assert.match(note, /Travel:\n  09 Oct 2026 · Uber · ₹1,200\.50/);
  assert.match(note, /Paid back 20 Oct 2026: ₹700\.00/);
  assert.match(note, /Total you owe: ₹1,000\.50$/);
});
