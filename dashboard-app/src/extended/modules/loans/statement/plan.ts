// Turns a parsed statement into the rows to add to one card: skips what the dashboard already has,
// guesses a budget category, and works out how far the card balance is from the statement.
import type { ParsedStatement, StatementRow } from "./parse.ts";

export interface ExistingCharge { kind: "income" | "expense" | "transfer"; amount: number; occurred_on: string }
export interface ExistingPayment { amount: number; paid_on: string }
export interface CategoryLike { id: string; name: string; kind: "income" | "expense"; archived_at: string | null }
export interface CardLike { amount: number; issued_on: string; card_last4?: string | null }

export interface ImportRow extends StatementRow {
  key: number;
  include: boolean;
  /** Why a row starts unticked. */
  skip: "duplicate" | "before_tracking" | null;
  categoryId: string | null;
  /** Friend this spend was for (a shared card); null for your own. */
  forId?: string | null;
}

const cents = (n: number) => Math.round(n * 100);
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

// Merchant words → words that commonly name the budget category for them.
const CATEGORY_HINTS: [RegExp, string[]][] = [
  [/uber ?eats|swiggy|zomato|wolt|foodpanda|domino|mcdonald|kfc|starbucks|restaurant|cafe|eats/i, ["food", "dining", "eating", "restaurant"]],
  [/blinkit|bigbasket|zepto|instamart|dmart|grocer|supermarket|lidl|\bica\b|coop|willys|hemk/i, ["grocer", "food"]],
  [/uber|\bola\b|rapido|irctc|makemytrip|goibibo|indigo|air ?india|airline|flight|metro|rail|taxi|bolt|\bsj\b|\bsl\b/i, ["travel", "transport", "commute"]],
  [/google|openai|netflix|spotify|prime video|youtube|apple\.com|icloud|notion|github|subscr|adobe|microsoft/i, ["subscription", "software", "apps", "tools"]],
  [/hospital|health|pharma|medic|clinic|doctor/i, ["health", "medical"]],
  [/amazon|flipkart|myntra|ajio|meesho|ikea|h&m/i, ["shopping"]],
  [/paytm|wallet|phonepe/i, ["wallet", "transfer"]],
];
const FEE_HINTS = ["fee", "interest", "bank charge", "charges"];

export function guessCategory(row: StatementRow, categories: CategoryLike[]): string | null {
  const open = categories.filter((c) => !c.archived_at && c.kind === "expense");
  const words = row.kind === "fee" ? FEE_HINTS : CATEGORY_HINTS.find(([re]) => re.test(row.description))?.[1] ?? [];
  for (const w of words) {
    const hit = open.find((c) => c.name.toLowerCase().includes(w));
    if (hit) return hit.id;
  }
  return null;
}

export function planImport(
  parsed: ParsedStatement,
  card: CardLike,
  charges: ExistingCharge[],
  payments: ExistingPayment[],
  categories: CategoryLike[],
): ImportRow[] {
  // Each existing entry can only account for one statement row.
  const freeCharges = charges.filter((c) => c.kind !== "transfer").map((c) => ({ ...c, used: false }));
  const freePayments = payments.map((p) => ({ ...p, used: false }));
  return parsed.rows.map((row, key) => {
    let skip: ImportRow["skip"] = null;
    if (row.kind === "payment") {
      const hit = freePayments.find((p) => !p.used && cents(p.amount) === cents(row.amount) && days(p.paid_on, row.date) <= 3);
      if (hit) (hit.used = true), (skip = "duplicate");
    } else {
      const kind = row.credit ? "income" : "expense";
      const hit = freeCharges.find((c) => !c.used && c.kind === kind && cents(c.amount) === cents(row.amount) && days(c.occurred_on, row.date) <= 1);
      if (hit) (hit.used = true), (skip = "duplicate");
    }
    // The starting balance already contains everything before the card was added.
    if (!skip && row.date < card.issued_on) skip = "before_tracking";
    return { ...row, key, include: !skip, skip, // Refunds are budget income with no category, so they never distort a spending category.
    categoryId: row.credit ? null : guessCategory(row, categories) };
  });
}

/** Card balance on a date: starting balance + spending − refunds − payments, plus the ticked import rows. */
export function balanceOn(date: string, card: CardLike, charges: ExistingCharge[], payments: ExistingPayment[], rows: ImportRow[]): number {
  let total = cents(card.amount);
  for (const c of charges) if (c.occurred_on <= date) total += c.kind === "expense" ? cents(c.amount) : c.kind === "income" ? -cents(c.amount) : 0;
  for (const p of payments) if (p.paid_on <= date) total -= cents(p.amount);
  for (const r of rows) if (r.include && r.date <= date) total += r.credit ? -cents(r.amount) : cents(r.amount);
  return total / 100;
}

/** Previous balance + debits − credits should equal the total due; anything else means rows were missed. */
export function statementAddsUp(parsed: ParsedStatement): { expected: number; listed: number; ok: boolean } | null {
  if (parsed.totalDue == null || parsed.previousBalance == null) return null;
  const net = parsed.rows.reduce((s, r) => s + (r.credit ? -cents(r.amount) : cents(r.amount)), 0);
  const listed = (cents(parsed.previousBalance) + net) / 100;
  return { expected: parsed.totalDue, listed, ok: Math.abs(listed - parsed.totalDue) < 0.01 };
}
