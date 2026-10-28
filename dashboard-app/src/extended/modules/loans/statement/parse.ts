// Reads a credit-card statement from its text lines (see lines.ts). Works on the layouts of the
// Indian bank statements we have seen (ICICI, Axis) and falls back to label search for others.
// Everything runs in the browser; the PDF never leaves the device.

export type RowKind = "spend" | "fee" | "payment" | "refund";

export interface StatementRow {
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // always positive, in the statement currency
  credit: boolean;
  kind: RowKind;
}

export interface ParsedStatement {
  bank: string | null;
  cardLast4: string[];
  statementDate: string | null;
  dueDate: string | null;
  totalDue: number | null;
  minimumDue: number | null;
  creditLimit: number | null;
  availableCredit: number | null;
  previousBalance: number | null;
  purchases: number | null;
  paymentsCredits: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  rows: StatementRow[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const monthOf = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

const AMOUNT = String.raw`[\`₹]?\s?(\d{1,3}(?:,\d{2,3})*\.\d{2})`;
const DATE_FORMS = [
  String.raw`\d{1,2}\/\d{1,2}\/\d{4}`, // 12/10/2026
  String.raw`\d{1,2}-\d{1,2}-\d{4}`, // 12-10-2026
  String.raw`\d{1,2}[ -][A-Za-z]{3}[ -]'?\d{2,4}`, // 15 Oct '26, 15-Oct-2026
  String.raw`[A-Za-z]{3,9} \d{1,2}, \d{4}`, // October 12, 2026
];
const TOKEN = new RegExp(`(${DATE_FORMS.join("|")})|${AMOUNT}|\\b([A-Za-z]{3}) (\\d{4})\\b`, "g");

export const toAmount = (s: string) => Number(s.replace(/[^\d.]/g, ""));

/** Any of the date forms above, as yyyy-mm-dd. Day-first for numeric dates (Indian and European banks). */
export function toISODate(s: string): string | null {
  const t = s.trim().replace(/'/g, "");
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{2,4})$/);
  if (m) return iso(fullYear(m[3]), monthOf(m[2]), Number(m[1]));
  m = t.match(/^([A-Za-z]{3,9}) (\d{1,2}), (\d{4})$/);
  if (m) return iso(Number(m[3]), monthOf(m[1]), Number(m[2]));
  return null;
}

type Token = { date?: string; amount?: number; month?: string };

function tokens(line: string): Token[] {
  const out: Token[] = [];
  for (const m of line.matchAll(TOKEN)) {
    if (m[1]) {
      const d = toISODate(m[1]);
      if (d) out.push({ date: d });
    } else if (m[2]) out.push({ amount: toAmount(m[2]) });
    else if (m[3] && monthOf(m[3]) > 0) out.push({ month: `${m[4]}-${pad(monthOf(m[3]))}` });
  }
  return out;
}

const LABELS: [keyof ParsedStatement, RegExp][] = [
  ["totalDue", /total (amount|payment) due|total dues|total outstanding/i],
  ["minimumDue", /minimum (amount|payment) due|min\.? amount due/i],
  ["dueDate", /due date/i],
  ["statementDate", /statement date/i],
  ["availableCredit", /available credit/i],
  ["creditLimit", /^credit limit/i],
  ["previousBalance", /previous balance|opening balance/i],
  ["purchases", /purchases/i],
  ["paymentsCredits", /payments?\s*\/\s*credits/i],
];

/**
 * Summary boxes are a header line of labels followed by a line (or a few) of values in the same
 * column order. Map each recognised label to the value at its position.
 */
function readSummary(lines: string[], out: ParsedStatement) {
  lines.forEach((line, i) => {
    const labels = line.split(/\s{2,}/).map((l) => l.trim()).filter(Boolean);
    const hits = labels.map((l) => LABELS.find(([, re]) => re.test(l))?.[0] ?? null);
    if (!hits.some(Boolean)) return;
    const found: Token[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 6) && found.length < labels.length; j++) {
      // The next box's header line (two or more labels) means this box's values have ended.
      if (lines[j].split(/\s{2,}/).filter((l) => LABELS.some(([, re]) => re.test(l))).length >= 2) break;
      found.push(...tokens(lines[j]));
    }
    const fields = out as unknown as Record<string, string | number | null>;
    hits.forEach((key, k) => {
      const t = found[k];
      if (!key || !t || fields[key] != null) return;
      if (key === "dueDate" || key === "statementDate") {
        if (t.date) fields[key] = t.date;
      } else if (t.amount != null) fields[key] = t.amount;
    });
  });
}

const PAYMENT = /payment received|payment recd|payment - thank|thank you|bbps|autopay|auto pay|auto debit|neft|imps/i;
const FEE = /interest|finance charge|\bgst\b|igst|cgst|sgst|\bfee\b|dcc|late|surcharge|annual|charges|penal/i;

export function classify(description: string, credit: boolean): RowKind {
  if (credit) return PAYMENT.test(description) ? "payment" : "refund";
  return FEE.test(description) ? "fee" : "spend";
}

/** Leading text columns of a split line, before the first purely numeric/currency column. */
function textColumns(cols: string[]): string {
  const out: string[] = [];
  for (const c of cols) {
    if (/^-?[\d,]+(\.\d+)?(\s+[A-Z]{3})?$/.test(c)) break;
    out.push(c);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function readRows(lines: string[]): StatementRow[] {
  const rows: StatementRow[] = [];
  // ICICI style: 01/02/2026  12345678901  Merchant name  0  [10.00 USD]  1,000.00 [CR]
  const slash = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:\d{6,}\s+)?(.+?)\s+(\d{1,3}(?:,\d{2,3})*\.\d{2})(\s*(?:CR|Cr|DR|Dr))?\s*$/;
  // Axis style: 01 Feb '26  Merchant name  ₹ 1,000.00  Debit
  const named = /(\d{1,2} [A-Za-z]{3} '?\d{2,4})\s+(.*?)\s*₹?\s*(\d{1,3}(?:,\d{2,3})*\.\d{2})\s+(Debit|Credit|Dr|Cr)\b/i;
  lines.forEach((line, i) => {
    let m = line.match(named);
    if (m) {
      const date = toISODate(m[1]);
      if (!date) return;
      let description = m[2].trim();
      // A long description wraps around the date line: "BBPS Payment Received -" / date / reference.
      if (!description && i > 0 && !named.test(lines[i - 1])) description = lines[i - 1].replace(/\s*-\s*$/, "").trim();
      const credit = /^c/i.test(m[4]);
      rows.push({ date, description, amount: toAmount(m[3]), credit, kind: classify(description, credit) });
      return;
    }
    m = line.match(slash);
    if (m) {
      const date = toISODate(m[1]);
      if (!date) return;
      const description = textColumns(m[2].split(/\s{2,}/));
      if (!description) return;
      const credit = /cr/i.test(m[4] ?? "");
      rows.push({ date, description, amount: toAmount(m[3]), credit, kind: classify(description, credit) });
    }
  });
  return rows;
}

export function parseStatement(lines: string[]): ParsedStatement {
  const text = lines.join("\n");
  const out: ParsedStatement = {
    bank: /icici/i.test(text) ? "ICICI Bank" : /axis bank/i.test(text) ? "Axis Bank" : /hdfc/i.test(text) ? "HDFC Bank" : /\bsbi\b|sbi card/i.test(text) ? "SBI Card" : null,
    cardLast4: [], statementDate: null, dueDate: null, totalDue: null, minimumDue: null, creditLimit: null,
    availableCredit: null, previousBalance: null, purchases: null, paymentsCredits: null, periodFrom: null, periodTo: null, rows: [],
  };
  readSummary(lines, out);
  const period = text.match(/statement period\s*:?\s*(.+?)\s+to\s+(.+?\d{4})/i);
  if (period) {
    out.periodFrom = toISODate(period[1]);
    out.periodTo = toISODate(period[2]);
  }
  out.cardLast4 = [...new Set([...text.matchAll(/\b\d{4}[Xx*]{4,8}(\d{4})\b/g)].filter((m) => !m[0].startsWith("0000")).map((m) => m[1]))];
  out.rows = readRows(lines);
  // Banks that print no statement date: the period end, else the last transaction.
  out.statementDate ??= out.periodTo ?? (out.rows.length ? out.rows.map((r) => r.date).sort().at(-1)! : null);
  return out;
}
