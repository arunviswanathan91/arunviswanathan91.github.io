import { test } from "node:test";
import assert from "node:assert/strict";
import { piecesToLines } from "../src/extended/modules/loans/statement/lines.ts";
import { parseStatement, toISODate } from "../src/extended/modules/loans/statement/parse.ts";
import { balanceOn, planImport, statementAddsUp } from "../src/extended/modules/loans/statement/plan.ts";

// Made-up statements in the two layouts the importer reads (no real card data).
const SLASH_LAYOUT = [
  "CREDIT CARD STATEMENT  Example Bank",
  "STATEMENT DATE",
  "March 12, 2026  l Some notice text",
  "PAYMENT DUE DATE  l To update mobile number",
  "March 30, 2026",
  "Total Amount due  Previous Balance  Purchases / Charges  Cash Advances  Payments / Credits",
  "=  +  +  -",
  "`1,600.00",
  "`1,000.00  `1,700.00  `0.00  `1,100.00",
  "Minimum Amount due  CREDIT SUMMARY",
  "`200.00",
  "Credit Limit (Including cash)  Available Credit (Including cash)  Cash Limit  Available Cash",
  "Interest will be charged if your",
  "total amount due is not paid",
  "`1,50,000.00  `1,48,400.00  `10,000.00  `10,000.00",
  "1234XXXXXXXX9876",
  "40%  12/02/2026  11111111111  COFFEE PLACE CITY IN  2  500.00",
  "14/02/2026  11111111112  RIDE APP HELP.EXAMPLE NL*  0  65 SEK  600.00",
  "15/02/2026  11111111113  RIDE APP PENDING  0  65 SEK  100.00 CR",
  "20/02/2026  11111111114  BBPS Payment received  0  1,000.00 CR",
  "21/02/2026  11111111115  DCC Fee  0  20.00",
  "12/03/2026  11111111116  Interest Charges  0  580.00",
  "Statement period : February 13, 2026 to March 12, 2026",
];

const NAMED_LAYOUT = [
  "Example Bank Visa Credit Card Monthly Statement",
  "TOWN 000000  Credit Card Number: 4400XXXXXXXX1111",
  "Total Payment Due  Minimum Payment Due  Payment Due Date",
  "₹ 950.00  ₹ 100.00  04 Apr '26",
  "Selected Statement Month  Credit Limit  Opening Balance",
  "Mar 2026  ₹ 30,000.00  ₹ 1,000.00",
  "Date  Transaction Details  Amount (INR)  Debit/Credit",
  "15 Mar '26  Debit Interest  ₹ 50.00  Debit",
  "11 Mar '26  Cashback credit  ₹ 100.00  Credit",
  "BBPS Payment Received -",
  "04 Mar '26  ₹ 200.00  Credit",
  "REF0001",
  "03 Mar '26  CLOUD SERVICE,CITY  ₹ 200.00  Debit",
];

test("dates in every printed form become ISO dates", () => {
  assert.equal(toISODate("12/03/2026"), "2026-03-12");
  assert.equal(toISODate("04 Apr '26"), "2026-04-04");
  assert.equal(toISODate("October 30, 2026"), "2026-10-30");
  assert.equal(toISODate("15-Oct-2026"), "2026-10-15");
  assert.equal(toISODate("31/13/2026"), null);
});

test("pdf text pieces become lines with columns kept apart", () => {
  const lines = piecesToLines([
    { str: "Total", x: 10, y: 700, width: 20 },
    { str: "Due", x: 32, y: 700.5, width: 15 },
    { str: "₹ 950.00", x: 120, y: 699, width: 40 },
    { str: "next line", x: 10, y: 680, width: 40 },
  ]);
  assert.deepEqual(lines, ["Total Due  ₹ 950.00", "next line"]);
});

test("slash-date statements: summary boxes and transactions", () => {
  const p = parseStatement(SLASH_LAYOUT);
  assert.equal(p.statementDate, "2026-03-12");
  assert.equal(p.dueDate, "2026-03-30");
  assert.equal(p.totalDue, 1600);
  assert.equal(p.previousBalance, 1000);
  assert.equal(p.minimumDue, 200);
  assert.equal(p.creditLimit, 150000); // not cut short by "total amount due is not paid"
  assert.equal(p.availableCredit, 148400);
  assert.deepEqual(p.cardLast4, ["9876"]);
  assert.equal(p.periodFrom, "2026-02-13");
  assert.deepEqual(p.rows.map((r) => [r.date, r.description, r.amount, r.credit, r.kind]), [
    ["2026-02-12", "COFFEE PLACE CITY IN", 500, false, "spend"],
    ["2026-02-14", "RIDE APP HELP.EXAMPLE NL*", 600, false, "spend"],
    ["2026-02-15", "RIDE APP PENDING", 100, true, "refund"],
    ["2026-02-20", "BBPS Payment received", 1000, true, "payment"],
    ["2026-02-21", "DCC Fee", 20, false, "fee"],
    ["2026-03-12", "Interest Charges", 580, false, "fee"],
  ]);
  assert.deepEqual(statementAddsUp(p), { expected: 1600, listed: 1600, ok: true });
});

test("named-date statements: wrapped payment description and no statement date", () => {
  const p = parseStatement(NAMED_LAYOUT);
  assert.equal(p.totalDue, 950);
  assert.equal(p.minimumDue, 100);
  assert.equal(p.dueDate, "2026-04-04");
  assert.equal(p.creditLimit, 30000);
  assert.equal(p.previousBalance, 1000);
  assert.deepEqual(p.cardLast4, ["1111"]);
  assert.equal(p.statementDate, "2026-03-15"); // last transaction when none is printed
  const payment = p.rows.find((r) => r.kind === "payment");
  assert.deepEqual(payment && [payment.date, payment.description, payment.amount], ["2026-03-04", "BBPS Payment Received", 200]);
  assert.equal(p.rows.find((r) => r.description === "Cashback credit")?.kind, "refund");
  assert.equal(statementAddsUp(p)?.ok, true);
});

test("import plan skips what is already recorded and what predates the card", () => {
  const p = parseStatement(SLASH_LAYOUT);
  const card = { amount: 0, issued_on: "2026-02-13" };
  const charges = [{ kind: "expense" as const, amount: 600, occurred_on: "2026-02-15" }];
  const payments = [{ amount: 1000, paid_on: "2026-02-21" }];
  const categories = [
    { id: "c-food", name: "Food & dining", kind: "expense" as const, archived_at: null },
    { id: "c-travel", name: "Travel", kind: "expense" as const, archived_at: null },
    { id: "c-fees", name: "Bank fees", kind: "expense" as const, archived_at: null },
  ];
  const rows = planImport(p, card, charges, payments, categories);
  const by = (d: string) => rows.find((r) => r.description.startsWith(d))!;
  assert.equal(by("COFFEE").skip, "before_tracking");
  assert.equal(by("RIDE APP HELP").skip, "duplicate");
  assert.equal(by("BBPS").skip, "duplicate");
  assert.equal(by("RIDE APP PENDING").include, true);
  assert.equal(by("DCC").categoryId, "c-fees");
  assert.equal(by("RIDE APP PENDING").categoryId, null); // credits carry no spending category
  // 0 start + 600 existing − 1000 paid − 100 refund + 20 + 580 ticked = 100
  assert.equal(balanceOn("2026-03-12", card, charges, payments, rows), 100);
});
