// Pure parsing for the workspace commands (/deadline, /note, /paper, /paid) — no Deno or database access.

/** Pull `key:value` (or key:"two words") out of text; returns the value and the text without it. */
export function takeToken(text: string, keys: string[]): { value: string | null; rest: string } {
  const re = new RegExp(`(?:^|\\s)(?:${keys.join("|")}):(?:"([^"]+)"|(\\S+))`, "i");
  const m = text.match(re);
  if (!m) return { value: null, rest: text };
  return { value: (m[1] ?? m[2]).replace(/_/g, " "), rest: (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim() };
}

const PRIORITY: Record<string, string> = { low: "low", l: "low", medium: "medium", med: "medium", m: "medium", high: "high", h: "high", hi: "high", urgent: "urgent", u: "urgent" };
export const DEADLINE_CATEGORIES = ["conference", "abstract_submission", "paper_submission", "course", "credits", "isp", "half_time_review", "dissertation", "administration", "personal", "other"];

export interface DeadlineCommand { title: string; due: string | null; priority: string | null; category: string | null }

/** "/deadline ISMB abstract due:2026-11-02 !high cat:abstract" */
export function parseDeadline(input: string): DeadlineCommand | { error: string } {
  let rest = input.trim();
  const due = takeToken(rest, ["due", "on", "by"]);
  rest = due.rest;
  const cat = takeToken(rest, ["cat", "category", "kind"]);
  rest = cat.rest;
  let priority: string | null = null;
  rest = rest.replace(/(?:^|\s)!(\w+)/, (m, p: string) => {
    const v = PRIORITY[p.toLowerCase()];
    if (!v) return m;
    priority = v;
    return " ";
  }).replace(/\s+/g, " ").trim();
  if (!rest) return { error: "Give the deadline a title: /deadline ISMB abstract due:2026-11-02 !high" };
  const wanted = cat.value?.toLowerCase().replace(/\s+/g, "_") ?? null;
  const category = wanted ? DEADLINE_CATEGORIES.find((c) => c === wanted) ?? DEADLINE_CATEGORIES.find((c) => c.startsWith(wanted)) ?? "other" : null;
  return { title: rest, due: due.value, priority, category };
}

export interface NoteCommand { title: string; body: string; tags: string[] }

/** "/note Idea: try SCENIC on the CAF subset #idea #scrna" — first line (≤ 80 chars) is the title. */
export function parseNote(input: string): NoteCommand | { error: string } {
  const tags: string[] = [];
  const text = input.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, t: string) => {
    tags.push(t.toLowerCase());
    return " ";
  }).replace(/[ \t]+/g, " ").trim();
  if (!text) return { error: "Send the note after the command: /note Try SCENIC on the CAF subset #idea" };
  const first = text.split("\n")[0].trim();
  const title = first.length > 80 ? first.slice(0, 79).trimEnd() + "…" : first;
  return { title, body: text, tags: [...new Set(tags)] };
}

export interface PaperCommand { doi: string | null; arxiv: string | null; url: string | null; title: string | null }

/** "/paper 10.1038/s41586-024-07000-1", a doi.org / arxiv link, an arXiv id, or a plain title. */
export function parsePaper(input: string): PaperCommand | { error: string } {
  const text = input.trim();
  if (!text) return { error: "Send a DOI, arXiv id, link or title: /paper 10.1038/s41586-020-2649-2" };
  const doi = text.match(/\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;)])/i)?.[1] ?? null;
  const arxiv = text.match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*|^)(\d{4}\.\d{4,5})(?:v\d+)?/i)?.[1] ?? null;
  const url = text.match(/https?:\/\/\S+/)?.[0] ?? null;
  const title = !doi && !arxiv && !url ? text : null;
  return { doi, arxiv, url: doi || arxiv ? null : url, title };
}

export interface PaidCommand { loan: string; amount: number; date: string | null }

/** "/paid slice 6557" or "/paid amazon card 1200 date:yesterday" — the last number is the amount. */
export function parsePaid(input: string): PaidCommand | { error: string } {
  const d = takeToken(input.trim(), ["date"]);
  const m = d.rest.match(/^(.*?)\s+[₹$€£]?(\d[\d,]*(?:\.\d{1,2})?)\s*$/);
  if (!m || !m[1].trim()) return { error: "Use: /paid <loan or card> <amount>, e.g. /paid slice 6557" };
  return { loan: m[1].trim(), amount: Number(m[2].replace(/,/g, "")), date: d.value };
}

/** Telegram's command menu (setMyCommands). Descriptions must be 3–256 characters. */
export const MENU: { command: string; description: string }[] = [
  { command: "today", description: "Open tasks, numbered" },
  { command: "due", description: "Everything due in the next 7 days" },
  { command: "week", description: "This week so far: done, spent, habits, coming up" },
  { command: "add", description: "New task: /add Draft intro @Thesis due:friday" },
  { command: "deadline", description: "New deadline: /deadline ISMB abstract due:2026-11-02" },
  { command: "note", description: "Quick note: /note idea text #tag" },
  { command: "paper", description: "Add a paper to read: /paper <DOI, arXiv id or title>" },
  { command: "spend", description: "Log spending: /spend 450 Groceries card:amazon" },
  { command: "income", description: "Log income: /income 52000 Salary" },
  { command: "paid", description: "Record a loan or card payment: /paid slice 6557" },
  { command: "loans", description: "What you owe and what is next due" },
  { command: "habit", description: "Log a habit: /habit read 30" },
  { command: "habits", description: "Today's habits and progress" },
  { command: "remind", description: "Reminder: /remind Call PI in 2h" },
  { command: "find", description: "Search everything: /find intro" },
  { command: "list", description: "List a module: /list jobs" },
  { command: "done", description: "Complete item N from the last list" },
  { command: "help", description: "All commands with examples" },
];
