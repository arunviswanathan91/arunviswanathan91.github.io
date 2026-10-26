// Pure parsing for the money and habit commands — no Deno or database access, so it can be tested directly.

export interface SpendCommand {
  amount: number;
  /** ISO code typed after the amount, if any. */
  currency: string | null;
  description: string;
  /** Text after card: — matched against card names or last four digits. */
  card: string | null;
  /** Text after cat: — matched against budget category names. */
  category: string | null;
  /** Text after date: (or a bare "yesterday"/"today"), resolved by the caller. */
  date: string | null;
}

/** "/spend 450 Groceries at BigBasket card:amazon cat:food date:yesterday" (amount first; ₹, commas and decimals allowed). */
export function parseSpend(input: string): SpendCommand | { error: string } {
  let rest = input.trim();
  const amountMatch = rest.match(/^[₹$€£]?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*/);
  if (!amountMatch) return { error: "Start with the amount, e.g. /spend 450 Groceries card:amazon cat:food" };
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!(amount > 0)) return { error: "The amount must be more than zero." };
  rest = rest.slice(amountMatch[0].length);
  let currency: string | null = null;
  const cur = rest.match(/^([A-Za-z]{3})\b\s*/);
  if (cur && /^(INR|SEK|EUR|USD|GBP|NOK|DKK|CHF|JPY|AUD|CAD|SGD|AED)$/i.test(cur[1])) {
    currency = cur[1].toUpperCase();
    rest = rest.slice(cur[0].length);
  }
  const take = (key: string): string | null => {
    const m = rest.match(new RegExp(`(?:^|\\s)${key}:(?:"([^"]+)"|(\\S+))`, "i"));
    if (!m) return null;
    rest = (rest.slice(0, m.index) + rest.slice((m.index ?? 0) + m[0].length)).trim();
    return (m[1] ?? m[2]).replace(/_/g, " ");
  };
  const card = take("card");
  const category = take("cat") ?? take("category");
  let date = take("date");
  const bare = rest.match(/(?:^|\s)(yesterday|today)\s*$/i);
  if (!date && bare) {
    date = bare[1].toLowerCase();
    rest = rest.slice(0, bare.index).trim();
  }
  const description = rest.replace(/\s+/g, " ").trim() || category || "Expense";
  return { amount, currency, description, card, category, date };
}

export interface HabitCommand {
  name: string;
  /** Amount to add; null means "mark done". */
  amount: number | null;
}

/** "/habit read 30", "/habit read 1.5h" (hours become minutes for a min habit by the caller), "/habit gym". */
export function parseHabit(input: string): HabitCommand | { error: string } {
  const text = input.trim();
  if (!text) return { error: "Use: /habit <name> [amount], e.g. /habit read 30" };
  const m = text.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*([a-z]*)$/i);
  if (!m || !m[1].trim()) return { name: text, amount: null };
  const n = Number(m[2]);
  const unit = m[3].toLowerCase();
  return { name: m[1].trim(), amount: unit === "h" || unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours" ? n * 60 : n };
}

/** Best match by name: exact, then starts with, then contains (case-insensitive). */
export function matchByName<T extends { name: string }>(rows: T[], query: string): T | null {
  const q = query.trim().toLowerCase();
  return rows.find((r) => r.name.toLowerCase() === q) ?? rows.find((r) => r.name.toLowerCase().startsWith(q)) ?? rows.find((r) => r.name.toLowerCase().includes(q)) ?? null;
}

/** YYYY-MM-DD for an instant in a time zone. */
export function dayIn(tz: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
