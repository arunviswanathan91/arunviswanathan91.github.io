// Pure habit rules. Days are YYYY-MM-DD strings; weekdays are ISO (1 = Mon … 7 = Sun).
import { addDays, isoWeekday, startOfMonth, startOfWeek } from "../../lib/dates.ts";
import type { Habit, HabitPause } from "../../lib/types.ts";

type HabitRule = Pick<Habit, "frequency" | "weekdays" | "start_date">;

/** Is the habit scheduled on this day? (Archiving doesn’t change history, so it isn’t checked here.) */
export function isDue(h: HabitRule, day: string): boolean {
  if (day < h.start_date) return false;
  return h.frequency === "daily" || h.weekdays.includes(isoWeekday(day));
}

type QuantityRule = Partial<Pick<Habit, "target" | "carry_over" | "max_carry" | "period">>;
type PlanRule = HabitRule & QuantityRule;

/** Pauses that apply to this habit (its own and the ones for every habit). */
export function pausesFor(pauses: HabitPause[], habitId: string): HabitPause[] {
  return pauses.filter((p) => !p.habit_id || p.habit_id === habitId);
}

export const isPaused = (pauses: HabitPause[], day: string): boolean => pauses.some((p) => p.from <= day && day <= p.to);

/**
 * How one day stands.
 * - off: nothing required.   - done: requirement met.   - open: today, not met yet.
 * - made_up: fell short, but the next day (which carried the shortfall) was completed.
 * - carried: fell short and the shortfall is waiting in today's requirement.
 * - missed: fell short and was not made up.   - paused: inside a pause; nothing required, carry is kept.
 */
export type DayState = "off" | "done" | "open" | "made_up" | "carried" | "missed" | "paused";

export interface DayPlan {
  day: string;
  /** The habit's own quantity for the day (0 when not scheduled). */
  base: number;
  /** Shortfall brought in from the day before. */
  carried: number;
  required: number;
  logged: number;
  state: DayState;
}

/** True when a shortfall on this habit rolls into the next day (or period). */
export const carries = (h: QuantityRule): boolean => !!h.carry_over && !!h.target;

/**
 * Walk the days from the habit's start (or `from`) to `today`. `logged` maps a day to the amount done;
 * a null amount means the whole requirement. A shortfall on a past day is added to the next day's requirement
 * (up to max_carry, default one day's amount); it can only be made up on that next day. Paused days require
 * nothing and hold any carry until the pause ends.
 */
export function buildPlan(h: PlanRule, logged: Map<string, number | null>, today: string, from = h.start_date, pauses: HabitPause[] = []): DayPlan[] {
  const days: DayPlan[] = [];
  const target = h.target ?? 1;
  const cap = h.max_carry ?? target; // by default at most one extra day's worth stacks onto a day
  let carry = 0;
  for (let day = from < h.start_date ? h.start_date : from; day <= today; day = addDays(day, 1)) {
    const entry = logged.get(day);
    if (isPaused(pauses, day)) {
      days.push({ day, base: 0, carried: 0, required: 0, logged: entry ?? 0, state: "paused" });
      continue;
    }
    const base = isDue(h, day) ? target : 0;
    const carried = Math.min(carry, cap);
    const required = base + carried;
    const done = entry === undefined ? 0 : entry ?? required;
    // The day's own amount counts first; only that part's shortfall moves on, so an old miss never snowballs.
    carry = day < today && carries(h) ? Math.max(0, base - done) : 0;
    const state: DayState = day === today
      ? required === 0 ? "off" : done >= required ? "done" : "open"
      : base === 0 ? "off" : done >= base ? "done" : "missed";
    days.push({ day, base, carried, required, logged: done, state });
  }
  if (carries(h)) resolveCarry(days, today);
  return days;
}

/** A short day is made up when the next active day covers its own amount plus the carry; still open when that day is today. */
function resolveCarry(rows: { state: DayState; logged: number; required: number; carried: number }[], _today: string) {
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].state !== "missed") continue;
    let j = i + 1;
    while (j < rows.length && rows[j].state === "paused") j++; // the make-up day is the first one after a pause
    const next = rows[j];
    if (!next || next.carried === 0) continue;
    if (next.logged >= next.required) rows[i].state = "made_up";
    else if (next.state === "open") rows[i].state = "carried";
  }
}

/** Plan lookup by day, for the checkin rows as stored. */
export function loggedMap(rows: { day: string; amount?: number | null }[]): Map<string, number | null> {
  return new Map(rows.map((r) => [r.day, r.amount ?? null]));
}

/** Consecutive scheduled days completed (or made up), counting back from today (today may still be open). */
export function planStreak(days: { state: DayState }[]): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const s = days[i].state;
    if (s === "done" || s === "made_up") n++;
    else if (s === "missed") break;
  }
  return n;
}

/** Scheduled days completed or made up in the `window` days ending today. */
export function planRate(days: DayPlan[], window = 30): { done: number; due: number } {
  let due = 0;
  let hit = 0;
  for (const d of days.slice(-window)) {
    if (d.base === 0) continue;
    due++;
    if (d.state === "done" || d.state === "made_up") hit++;
  }
  return { done: hit, due };
}

type Checkin = { habit_id: string; day: string; amount?: number | null };

/** Plan for one habit from the loaded check-ins (about 400 days are loaded, so start there). */
export function planFor(h: PlanRule & { id: string }, checkins: Checkin[], today: string, pauses: HabitPause[] = []): DayPlan[] {
  return buildPlan(h, loggedMap(checkins.filter((c) => c.habit_id === h.id)), today, addDays(today, -400), pausesFor(pauses, h.id));
}

// ── Weekly and monthly targets ──────────────────────────────────────────────

export interface PeriodPlan {
  start: string;
  /** Last day of the period (may be after today for the current one). */
  end: string;
  /** Target for the period, reduced for days before the start date or paused. */
  base: number;
  carried: number;
  required: number;
  logged: number;
  state: DayState;
}

const periodStart = (period: "week" | "month", day: string) => (period === "week" ? startOfWeek(day) : startOfMonth(day));
const nextPeriod = (period: "week" | "month", start: string) => (period === "week" ? addDays(start, 7) : startOfMonth(addDays(start, 31)));

/**
 * One row per week or month from the habit's start to the current period. Any day counts; null amounts count
 * as the whole target. A shortfall carries into the next period when carry_over is on (capped like days).
 */
export function buildPeriodPlan(h: PlanRule & { period: "week" | "month"; target: number }, logged: Map<string, number | null>, today: string, from = h.start_date, pauses: HabitPause[] = []): PeriodPlan[] {
  const out: PeriodPlan[] = [];
  const cap = h.max_carry ?? h.target;
  let carry = 0;
  for (let start = periodStart(h.period, from < h.start_date ? h.start_date : from); start <= today; start = nextPeriod(h.period, start)) {
    const end = addDays(nextPeriod(h.period, start), -1);
    let total = 0;
    let active = 0;
    let done = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      total++;
      if (d >= h.start_date && !isPaused(pauses, d)) active++;
      if (d <= today && logged.has(d)) done += logged.get(d) ?? h.target;
    }
    const base = Math.round((h.target * active * 100) / total) / 100;
    const carried = base > 0 ? Math.min(carry, cap) : 0;
    const required = base + carried;
    const current = end >= today;
    // A paused period keeps the carry for the next active one; otherwise only its own shortfall moves on.
    if (base > 0) carry = !current && carries(h) ? Math.max(0, base - done) : 0;
    const state: DayState = base === 0 ? "paused" : current ? (done >= required ? "done" : "open") : done >= base ? "done" : "missed";
    out.push({ start, end, base, carried, required, logged: done, state });
  }
  if (carries(h)) resolveCarry(out, today);
  return out;
}

// ── One summary for any habit, used by the views ────────────────────────────

export interface HabitSummary {
  /** What is asked of you now: today for daily habits, the current week or month otherwise. */
  now: { required: number; logged: number; carried: number; base: number; state: DayState } | null;
  /** "today", "this week" or "this month". */
  scope: string;
  streak: number;
  /** "day", "week" or "month", for labels such as "4-week streak". */
  streakUnit: string;
  rate: { done: number; due: number; label: string };
  /** State per day, for the history grid. */
  dayState: Map<string, DayState>;
}

export function summarise(h: Habit, checkins: Checkin[], today: string, pauses: HabitPause[] = []): HabitSummary {
  const mine = pausesFor(pauses, h.id);
  const logged = loggedMap(checkins.filter((c) => c.habit_id === h.id));
  if (h.period === "week" || h.period === "month") {
    const periods = buildPeriodPlan({ ...h, period: h.period, target: h.target ?? 1 }, logged, today, addDays(today, -400), mine);
    const cur = periods.at(-1) ?? null;
    const recent = periods.slice(h.period === "week" ? -8 : -6);
    const counted = recent.filter((p) => p.base > 0);
    const dayState = new Map<string, DayState>();
    for (let d = addDays(today, -120); d <= today; d = addDays(d, 1)) dayState.set(d, isPaused(mine, d) ? "paused" : logged.has(d) ? "done" : "off");
    return {
      now: cur,
      scope: h.period === "week" ? "this week" : "this month",
      streak: planStreak(periods),
      streakUnit: h.period,
      rate: { done: counted.filter((p) => p.state === "done" || p.state === "made_up").length, due: counted.filter((p) => p.state !== "open").length, label: h.period === "week" ? "of the last 8 weeks" : "of the last 6 months" },
      dayState,
    };
  }
  const days = buildPlan(h, logged, today, addDays(today, -400), mine);
  const r = planRate(days, 30);
  return {
    now: days.at(-1) ?? null,
    scope: "today",
    streak: planStreak(days),
    streakUnit: "day",
    rate: { ...r, label: "of the last 30 days" },
    dayState: new Map(days.map((d) => [d.day, d.state])),
  };
}

const doneMap = (done: Set<string>) => new Map([...done].map((d) => [d, null] as [string, null]));

/** Consecutive scheduled days completed, counting back from today (today may still be open). */
export function streak(h: PlanRule, done: Set<string>, today: string): number {
  return planStreak(buildPlan(h, doneMap(done), today));
}

/** Share of scheduled days completed in the `days` days ending today. */
export function completionRate(h: PlanRule, done: Set<string>, today: string, days = 30): { done: number; due: number } {
  return planRate(buildPlan(h, doneMap(done), today, addDays(today, 1 - days)), days);
}

/** "30 min" style label for a quantity. */
export function formatAmount(n: number, unit: string | null | undefined): string {
  const v = Math.round(n * 100) / 100;
  return unit ? `${v} ${unit}` : String(v);
}

export function describeSchedule(h: Pick<Habit, "frequency" | "weekdays"> & Partial<Pick<Habit, "period">>): string {
  if (h.period === "week") return "Weekly target, any days";
  if (h.period === "month") return "Monthly target, any days";
  if (h.frequency === "daily") return "Every day";
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [...h.weekdays].sort();
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "6,7") return "Weekends";
  return days.map((d) => names[d]).join(", ");
}
