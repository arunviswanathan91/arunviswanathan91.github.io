// Pure calculations behind the thesis, goals and trips pages (tested in test/planning-logic.test.ts).
import type { Goal, Milestone, ThesisChapter, Trip, TripCost } from "../../lib/types.ts";

const DAY = 86_400_000;
/** Whole days from `from` to `to` (dates as YYYY-MM-DD); negative when `to` has passed. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);
}

/** "in 3 days", "today", "tomorrow", "2 days ago", "in 7 months" */
export function relativeDays(from: string, to: string): string {
  const d = daysBetween(from, to);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  const abs = Math.abs(d);
  const span = abs >= 60 ? `${Math.round(abs / 30.44)} months` : abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return d > 0 ? `in ${span}` : `${span} ago`;
}

// ── Thesis ───────────────────────────────────────────────────────────────
export interface ThesisProgress { words: number; target: number | null; share: number | null; final: number; chapters: number }
/** Words written against the thesis target (or the sum of chapter targets when no overall target is set). */
export function thesisProgress(chapters: ThesisChapter[], target: number | null): ThesisProgress {
  const words = chapters.reduce((t, c) => t + (c.words || 0), 0);
  const fromChapters = chapters.every((c) => c.target_words) && chapters.length ? chapters.reduce((t, c) => t + (c.target_words ?? 0), 0) : null;
  const goal = target ?? fromChapters;
  return { words, target: goal, share: goal ? Math.min(1, words / goal) : null, final: chapters.filter((c) => c.status === "final").length, chapters: chapters.length };
}

/** Words per day still needed to reach the target by the submission date (null when not computable or already there). */
export function wordsPerDay(p: ThesisProgress, today: string, submission: string | null): number | null {
  if (!p.target || !submission || p.words >= p.target) return null;
  const days = daysBetween(today, submission);
  return days > 0 ? Math.ceil((p.target - p.words) / days) : null;
}

/** Swap a chapter with its neighbour; returns the new positions to save ({id, position}). */
export function moveChapter(chapters: ThesisChapter[], id: string, dir: -1 | 1): { id: string; position: number }[] {
  const list = [...chapters].sort((a, b) => a.position - b.position);
  const i = list.findIndex((c) => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [];
  [list[i], list[j]] = [list[j], list[i]];
  return list.map((c, k) => ({ id: c.id, position: k + 1 })).filter((c) => chapters.find((x) => x.id === c.id)?.position !== c.position);
}

// ── Goals ────────────────────────────────────────────────────────────────
export interface GoalInputs {
  /** Tasks of linked projects: {project_id, done}. */
  tasks: { project_id: string | null; status: string }[];
  /** Habit check-in days in the goal's year. */
  checkins: { habit_id: string; day: string }[];
  /** Current balance per savings account. */
  balances: Map<string, number>;
}
export interface GoalProgress { value: number; target: number | null; share: number | null; label: string }

export function goalProgress(g: Goal, inputs: GoalInputs): GoalProgress {
  const pct = (value: number, target: number | null) => (target && target > 0 ? Math.max(0, Math.min(1, value / target)) : null);
  switch (g.measure) {
    case "milestones": {
      const done = g.milestones.filter((m) => m.done).length;
      return { value: done, target: g.milestones.length || null, share: pct(done, g.milestones.length), label: `${done} of ${g.milestones.length} done` };
    }
    case "project": {
      const ts = inputs.tasks.filter((t) => g.project_id && t.project_id === g.project_id);
      const done = ts.filter((t) => t.status === "done").length;
      const target = g.target ?? (ts.length || null);
      return { value: done, target, share: pct(done, target), label: `${done} of ${target ?? 0} tasks done` };
    }
    case "habit": {
      const days = inputs.checkins.filter((c) => c.habit_id === g.habit_id && c.day.startsWith(String(g.year))).length;
      return { value: days, target: g.target, share: pct(days, g.target), label: g.target ? `${days} of ${g.target} days` : `${days} days` };
    }
    case "savings": {
      const bal = g.account_id ? inputs.balances.get(g.account_id) ?? 0 : 0;
      return { value: bal, target: g.target, share: pct(bal, g.target), label: "" };
    }
    default:
      return { value: Number(g.current) || 0, target: g.target, share: pct(Number(g.current) || 0, g.target), label: `${fmtNum(Number(g.current) || 0)}${g.target ? ` of ${fmtNum(g.target)}` : ""}${g.unit ? ` ${g.unit}` : ""}` };
  }
}

/** Where a goal should be by now, if it ran evenly from 1 January to its due date (or 31 December). */
export function expectedShare(g: Pick<Goal, "year" | "due_on">, today: string): number {
  const start = `${g.year}-01-01`, end = g.due_on ?? `${g.year}-12-31`;
  const total = daysBetween(start, end);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, daysBetween(start, today) / total));
}

const fmtNum = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

export function toggleMilestone(list: Milestone[], i: number): Milestone[] {
  return list.map((m, k) => (k === i ? { ...m, done: !m.done } : m));
}

// ── Trips ────────────────────────────────────────────────────────────────
export interface TripMoney { total: number; paid: number; awarded: number; pending: number; outOfPocket: number }
export function tripMoney(t: Pick<Trip, "costs" | "funding">): TripMoney {
  const c = (n: number) => Math.round(Number(n || 0) * 100);
  const total = t.costs.reduce((s, x) => s + c(x.amount), 0);
  const paid = t.costs.filter((x) => x.paid).reduce((s, x) => s + c(x.amount), 0);
  const awarded = t.funding.filter((f) => f.status === "awarded").reduce((s, f) => s + c(f.amount), 0);
  const pending = t.funding.filter((f) => f.status === "applied").reduce((s, f) => s + c(f.amount), 0);
  return { total: total / 100, paid: paid / 100, awarded: awarded / 100, pending: pending / 100, outOfPocket: Math.max(0, total - awarded) / 100 };
}

/** The next date that matters for a trip, from today on. */
export function nextTripDate(t: Trip, today: string): { label: string; date: string } | null {
  const done = t.status === "attended" || t.status === "cancelled";
  if (done) return null;
  const candidates: { label: string; date: string | null | undefined }[] = [
    { label: "Abstract due", date: t.status === "considering" ? t.abstract_due : null },
    { label: "Registration due", date: ["considering", "abstract_submitted", "accepted"].includes(t.status) ? t.registration_due : null },
    ...t.funding.filter((f) => f.status === "applied" && f.due_on).map((f) => ({ label: `${f.source || "Funding"} due`, date: f.due_on })),
    { label: "Starts", date: t.starts_on },
  ];
  return candidates.filter((x): x is { label: string; date: string } => !!x.date && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** A sensible starting checklist for a trip, by kind. */
export function defaultChecklist(international: boolean): Milestone[] {
  return [
    "Submit abstract", "Apply for travel award", "Register", ...(international ? ["Passport valid 6+ months", "Visa"] : []),
    "Flights / train", "Accommodation", "Poster or slides ready", "Supervisor approval / leave", "Claim reimbursement",
  ].map((label) => ({ label, done: false }));
}

/** Costs not yet recorded in the budget. */
export const unrecorded = (costs: TripCost[]) => costs.filter((c) => !c.transaction_id && c.amount > 0);
