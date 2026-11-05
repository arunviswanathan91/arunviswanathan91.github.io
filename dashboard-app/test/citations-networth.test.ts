import { test } from "node:test";
import assert from "node:assert/strict";
import { citeKey, invertName, toBibTeX, toRIS } from "../src/extended/modules/papers/citations.ts";
import { accountBalanceOn, loanRemainingOn, monthEnds, netWorthSeries, totals } from "../src/extended/modules/networth/logic.ts";

const paper = (o: object) => ({ id: "p", title: "Paper", authors: [], year: null, publication: null, doi: null, arxiv_id: null, pmid: null, url: null, abstract: null, ...o });

test("author names are written surname first", () => {
  assert.equal(invertName("Arun Viswanathan"), "Viswanathan, Arun");
  assert.equal(invertName("Viswanathan A"), "Viswanathan, A.");
  assert.equal(invertName("Harikumar KB"), "Harikumar, K. B.");
  assert.equal(invertName("Viswanathan, Arun"), "Viswanathan, Arun");
  assert.equal(invertName("Plato"), "Plato");
});

test("BibTeX: keys are unique, specials escaped, acronyms protected, preprints are @misc", () => {
  const a = paper({ title: "The STAT3 axis & obesity in PDAC", authors: ["Viswanathan A", "Harikumar KB"], year: 2026, publication: "Cell Death Discovery", doi: "10.1038/x_1" });
  const b = paper({ title: "STAT3 again", authors: ["Viswanathan A"], year: 2026, publication: "bioRxiv" });
  const bib = toBibTeX([a, a, b]);
  assert.match(bib, /@article\{viswanathan2026stat3,/);
  assert.match(bib, /@article\{viswanathan2026stat3a,/);
  assert.match(bib, /@misc\{viswanathan2026stat3b,/);
  assert.match(bib, /title = \{The \{STAT3\} axis \\& obesity in \{PDAC\}\}/);
  assert.match(bib, /author = \{Viswanathan, A\. and Harikumar, K\. B\.\}/);
  assert.match(bib, /doi = \{10\.1038\/x_1\}/); // DOIs are not escaped
  assert.match(bib, /publisher = \{bioRxiv\}/);
  assert.doesNotMatch(bib, /pmid|eprint/); // empty fields are left out
});

test("RIS: one tagged line per field, ER closes each record", () => {
  const ris = toRIS([paper({ title: "T", authors: ["Arun Viswanathan"], year: 2024, publication: "J Adv Res", pmid: "123", abstract: "Line one\nline two" })]);
  const lines = ris.split("\r\n");
  assert.deepEqual(lines.slice(0, 7), ["TY  - JOUR", "TI  - T", "AU  - Viswanathan, Arun", "JO  - J Adv Res", "PY  - 2024", "AN  - PMID:123", "AB  - Line one line two"]);
  assert.equal(lines[7], "ER  -");
});

test("cite keys fall back sensibly", () => {
  assert.equal(citeKey(paper({ title: "A study of the role" }), new Set()), "anonndpaper");
});

const acc = { id: "a1", currency: "INR", opening_balance: 1000, opening_on: "2026-01-10" };
const txs = [
  { kind: "income" as const, amount: 500, occurred_on: "2026-02-01", account_id: "a1" },
  { kind: "expense" as const, amount: 200, occurred_on: "2026-03-05", account_id: "a1" },
  { kind: "expense" as const, amount: 300, occurred_on: "2025-12-31", account_id: "a1" }, // before opening: ignored
  { kind: "expense" as const, amount: 150, occurred_on: "2026-02-10", loan_id: "card" }, // card spend
  { kind: "income" as const, amount: 50, occurred_on: "2026-02-20", loan_id: "card" }, // refund
];
const loans = [
  { id: "card", direction: "borrowed" as const, amount: 0, currency: "INR", issued_on: "2026-01-01" },
  { id: "lent", direction: "lent" as const, amount: 400, currency: "USD", issued_on: "2026-02-15" },
];
const payments = [{ loan_id: "card", amount: 60, paid_on: "2026-03-01", account_id: "a1" }];

test("balances on a date follow the same rules as the database", () => {
  assert.equal(accountBalanceOn(acc, txs, payments, "2026-01-09"), 0); // not opened yet
  assert.equal(accountBalanceOn(acc, txs, payments, "2026-01-31"), 1000);
  assert.equal(accountBalanceOn(acc, txs, payments, "2026-02-28"), 1500);
  assert.equal(accountBalanceOn(acc, txs, payments, "2026-03-31"), 1240); // −200 spend, −60 card payment
  assert.equal(loanRemainingOn(loans[0], txs, payments, "2026-02-28"), 100);
  assert.equal(loanRemainingOn(loans[0], txs, payments, "2026-03-31"), 40);
  assert.equal(loanRemainingOn(loans[1], txs, payments, "2026-02-14"), 0);
});

test("month ends run to today and net worth combines currencies", () => {
  assert.deepEqual(monthEnds("2025-11-20", "2026-02-07"), ["2025-11-30", "2025-12-31", "2026-01-31", "2026-02-07"]);
  assert.deepEqual(monthEnds("2024-02-01", "2024-03-01"), ["2024-02-29", "2024-03-01"]); // leap year
  const s = netWorthSeries({ accounts: [acc], txs, loans, payments }, "2026-03-15");
  assert.deepEqual(s.map((p) => p.date), ["2026-01-31", "2026-02-28", "2026-03-15"]);
  const rate = (m: Record<string, number>) => Object.entries(m).reduce((t, [cur, v]) => t + (cur === "USD" ? v * 80 : v), 0);
  assert.deepEqual(totals(s[1], rate), { accounts: 1500, owedToYou: 32000, debts: 100, net: 33400 });
  assert.equal(totals(s[1], () => null).net, null); // a missing rate never shows a wrong total
});
