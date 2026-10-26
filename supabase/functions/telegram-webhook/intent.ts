// Turns everyday sentences into the bot's commands, so nobody has to learn the syntax:
// "spent 450 on groceries", "read 30 min", "remind me to call Anna tomorrow 9am", "what's due?".
// Pure (no Deno or database access); the caller passes the user's habit and loan names.

export interface Ctx {
  habits: string[];
  loans: string[];
}

/** The command a sentence stands for. */
export interface Intent {
  command: string;
}

const DAYS: Record<string, string> = { mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday", sun: "sunday" };
const DAY = "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|rsday|urday)?";
const CLOCK = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}:\\d{2}";
const WHEN = new RegExp(
  `\\s+(?:(?:by|on|at|before|due|for)\\s+)?((?:today|tonight|tomorrow|(?:next\\s+)?${DAY}|in\\s+\\d+\\s*(?:m|min|mins|minutes?|h|hrs?|hours?|d|days?|w|weeks?)|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)(?:\\s+(?:at\\s+)?(?:${CLOCK}))?|(?:at\\s+)?(?:${CLOCK}))\\s*[.!]?$`,
  "i",
);

/** Splits a trailing time phrase off ("call Anna tomorrow at 9am" → "call Anna" + "tomorrow 9am"), in the parser's words. */
export function extractWhen(text: string): { text: string; when: string | null } {
  const m = text.match(WHEN);
  if (!m) return { text: text.trim(), when: null };
  let when = m[1].toLowerCase().replace(/\bat\s+/g, "").replace(/\s+/g, " ").trim();
  when = when.replace(new RegExp(`\\b${DAY}\\b`, "i"), (d: string) => DAYS[d.slice(0, 3).toLowerCase()] ?? d);
  if (/^\d/.test(when) && /am|pm|:/.test(when) && !/^\d{4}-|\//.test(when)) when = `today ${when}`;
  return { text: text.slice(0, m.index).trim(), when };
}

const AMOUNT = /(?:^|\s)(?:rs\.?\s*|inr\s*|[₹$€£]\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b|rs\b|inr\b|sek\b|eur\b|usd\b|gbp\b|kr\b|rupees?\b|bucks\b)?/i;
const CURRENCY: Record<string, string> = { rs: "INR", inr: "INR", rupee: "INR", rupees: "INR", sek: "SEK", kr: "SEK", eur: "EUR", usd: "USD", bucks: "USD", gbp: "GBP" };

function amountOf(text: string): { amount: number; currency: string | null; rest: string } | null {
  const m = text.match(AMOUNT);
  if (!m) return null;
  let amount = Number(m[1].replace(/,/g, ""));
  const unit = m[2]?.toLowerCase();
  if (unit === "k") amount *= 1000;
  const currency = unit && unit !== "k" ? CURRENCY[unit] ?? null : /₹/.test(m[0]) || /rs|inr/i.test(m[0]) ? "INR" : /€/.test(m[0]) ? "EUR" : /\$/.test(m[0]) ? "USD" : /£/.test(m[0]) ? "GBP" : null;
  return { amount, currency, rest: (text.slice(0, m.index) + " " + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim() };
}

const stem = (w: string) => {
  const irregular: Record<string, string> = { ran: "run", running: "run", swam: "swim", swimming: "swim", meditated: "meditate", meditating: "meditate", wrote: "write", writing: "write", read: "read", reading: "read", went: "go", walked: "walk", walking: "walk", studied: "study", studying: "study", practiced: "practice", practised: "practice", journaled: "journal", journaling: "journal", stretched: "stretch", stretching: "stretch" };
  const x = w.toLowerCase();
  return irregular[x] ?? x.replace(/(ing|ed|es|s)$/, "");
};

/** Habit named in a short message: "read 30 min", "did gym", "meditated", "ran 5 km". */
function habitIn(text: string, habits: string[]): { name: string; amount: number | null } | null {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}.\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8) return null;
  const stems = new Set(words.map(stem));
  const found = habits.find((h) => {
    const hw = h.toLowerCase().split(/\s+/);
    return stems.has(stem(hw[0])) || words.join(" ").includes(h.toLowerCase());
  });
  if (!found) return null;
  const n = text.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|km|pages?|k)?\b/i);
  let amount: number | null = null;
  if (n) {
    amount = Number(n[1]);
    if (/^h/i.test(n[2] ?? "")) amount *= 60;
  }
  const doneWords = /\b(did|done|finished|completed|went|ticked|had)\b/i.test(text);
  if (amount === null && !doneWords && words.length > 2) return null;
  return { name: found, amount };
}

const LIST: Record<string, string> = { job: "jobs", jobs: "jobs", application: "jobs", applications: "jobs", publication: "publications", publications: "publications", manuscript: "publications", manuscripts: "publications", document: "documents", documents: "documents", docs: "documents", reminder: "reminders", reminders: "reminders", read: "reads", reads: "reads", links: "reads", "reading list": "reads" };

const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);

export function understand(raw: string, ctx: Ctx): Intent | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const t = text.toLowerCase().replace(/[?!.]+$/, "");
  if (!t) return null;

  // Greetings and "what can you do"
  if (/^(hi|hello|hey|hej|hiya|yo|namaste|good (morning|afternoon|evening)|start|menu|help|what can you do|commands|how does this work|\?)$/.test(t)) return { command: "/hello" };
  if (/^(thanks|thank you|thx|ty|cheers|ok thanks)$/.test(t)) return { command: "/thanks" };

  // Papers by DOI or arXiv id
  if (/\b10\.\d{4,9}\/\S+/.test(text) || /arxiv(\.org\/(abs|pdf)\/|:\s*)\d{4}\.\d{4,5}/i.test(text)) return { command: `/paper ${text}` };

  // Questions
  if (/^(find|search( for)?|look up|lookup|where('s| is)|where are)\s+(.+)/.test(t)) return { command: `/find ${t.replace(/^(find|search( for)?|look up|lookup|where('s| is)|where are)\s+/, "")}` };
  if (/\b(this week|my week|weekly|week so far|how('s| is| was) (my|the) week)\b/.test(t) && !/\bdeadline\b/.test(t)) return { command: "/week" };
  if (/\b(what'?s|what is|anything|what do i have|whats) (due|coming( up)?|on|next|upcoming|planned)\b|\b(agenda|upcoming|due soon|what'?s due)\b/.test(t)) return { command: "/due" };
  if (!/\d/.test(t) && /\b(loans?|debts?|owe|emis?|balances?|card bills?|how much (do i|i) owe)\b/.test(t)) return { command: "/loans" };
  if (!/\d/.test(t) && /\b(my habits|habits|streaks?|how am i doing)\b/.test(t)) return { command: "/habits" };
  if (/^(what should i do( today)?|my tasks|tasks|to-?dos?|todo list|today|open tasks|what'?s on today)$/.test(t)) return { command: "/today" };
  const list = t.match(/^(?:show|list|see)\s+(?:me\s+)?(?:my\s+)?(.+)$/);
  if (list && LIST[list[1]]) return { command: `/list ${LIST[list[1]]}` };

  // Money in
  const income = t.match(/^(got paid|received|earned|salary|stipend|income|got)\b/);
  if (income) {
    const a = amountOf(text.slice(income[0].length));
    if (a) return { command: `/income ${a.amount}${a.currency ? " " + a.currency : ""} ${a.rest.replace(/^(of|from|as)\s+/i, "") || income[1]}` };
  }

  // Loan or card payment: "paid slice 6557", "paid 6557 to slice", "paid the amazon card bill 1200"
  if (/^(paid|pay|payed)\b/.test(t)) {
    const a = amountOf(text.replace(/^(paid|pay|payed)\s+/i, ""));
    if (a) {
      const target = a.rest.replace(/^(to|the|my|for)\s+/gi, "").replace(/\b(emi|bill|card bill|installment|instalment)\b/gi, "").trim().toLowerCase();
      const loan = ctx.loans.find((l) => target && (l.toLowerCase().includes(target) || target.includes(l.toLowerCase().split(" ")[0])));
      if (loan) return { command: `/paid ${loan} ${a.amount}` };
    }
  }

  // Spending: "spent 450 on groceries", "450 for lunch with amazon card", "bought shoes 2k"
  if (/\b(spent|spend|bought|paid|payed|cost|costs|purchase[ds]?)\b/.test(t) || /^[₹$€£]?\s*\d[\d,.]*\s*(k|rs|inr|sek|kr)?\s+(on|for|at)\s+/.test(t)) {
    const a = amountOf(text);
    if (a) {
      let rest = a.rest;
      let card: string | null = null;
      rest = rest.replace(/\b(?:with|using|on|via|by)\s+(?:my\s+|the\s+)?([\w ]+?)\s+card\b/i, (_m, c: string) => {
        card = c.trim();
        return " ";
      });
      const desc = rest.replace(/\b(i|just|spent|spend|bought|paid|payed|cost|costs|purchased?|on|for|at|some|a|an|the)\b/gi, " ").replace(/\s+/g, " ").trim();
      return { command: `/spend ${a.amount}${a.currency ? " " + a.currency : ""} ${desc || "Expense"}${card ? ` card:${quote(card)}` : ""}` };
    }
  }

  // Reminders: "remind me to call Anna tomorrow 9am"
  const remind = text.match(/^(?:please\s+)?remind me\s+(?:to\s+|about\s+|that\s+)?(.+)$/i);
  if (remind) {
    const w = extractWhen(remind[1]);
    // No time given: let the bot ask with buttons instead of guessing.
    return { command: w.when ? `/remind ${w.text} due:"${w.when}"` : `/x ask-remind ${w.text}` };
  }

  // Deadlines: "ISMB abstract deadline nov 2" / "deadline for the grant friday"
  if (/\bdeadline\b/.test(t)) {
    const w = extractWhen(text);
    const title = w.text.replace(/\b(the\s+)?deadline\s*(for|is|of|on)?\b/i, " ").replace(/\s+/g, " ").trim();
    if (title) return { command: `/deadline ${title}${w.when ? ` due:"${w.when}"` : ""}` };
  }

  // Notes: "note: …", "idea: …"
  const note = text.match(/^(?:note|idea|thought|remember that|jot down)\s*[:\-–]?\s+(.+)$/is);
  if (note) return { command: `/note ${note[1]}` };

  // Completing by name: "done with the methods draft", "finished revise intro"
  const finish = t.match(/^(?:done|finished|completed|complete|mark)\s+(?:with\s+)?(?:the\s+)?(.{3,})$/);
  if (finish && !/^\d+$/.test(finish[1]) && !habitIn(text, ctx.habits)) return { command: `/complete ${finish[1].replace(/\s+as done$/, "")}` };

  // Habits: "read 30 min", "did gym", "meditated"
  const habit = habitIn(text, ctx.habits);
  if (habit) return { command: `/habit ${habit.name}${habit.amount !== null ? " " + habit.amount : ""}` };

  // Tasks: "todo: …", "I need to … by friday", "add review the draft"
  const task = text.match(/^(?:todo|to do|task|add|new task|i need to|need to|i have to|have to|i must|must|don'?t forget to|i should|should)\s*[:\-–]?\s+(.+)$/i);
  if (task) {
    const w = extractWhen(task[1]);
    return { command: `/add ${w.text}${w.when ? ` due:"${w.when}"` : ""}` };
  }

  return null;
}

/** First words of a message, for "I'm not sure what to do with …". */
export const preview = (text: string) => (text.length > 60 ? text.slice(0, 57).trimEnd() + "…" : text);
