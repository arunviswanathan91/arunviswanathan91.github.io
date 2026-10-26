// Pure habit rules. Days are YYYY-MM-DD strings; weekdays are ISO (1 = Mon … 7 = Sun).
import { addDays, isoWeekday } from "../../lib/dates.ts";
import type { Habit } from "../../lib/types.ts";

type HabitRule = Pick<Habit, "frequency" | "weekdays" | "start_date">;

/** Is the habit scheduled on this day? (Archiving doesn’t change history, so it isn’t checked here.) */
export function isDue(h: HabitRule, day: string): boolean {
  if (day < h.start_date) return false;
  return h.frequency === "daily" || h.weekdays.includes(isoWeekday(day));
}

type QuantityRule = Partial<Pick<Habit, "target" | "carry_over" | "max_carry">>;
type PlanRule = HabitRule & QuantityRule;

/**
 * How one day stands.
 * - off: nothing required.   - done: requirement met.   - open: today, not met yet.
 * - made_up: fell short, but the next day (which carried the shortfall) was completed.
 * - carried: fell short yesterday-style and the shortfall is waiting in today's requirement.
 * - missed: fell short and was not made up.
 */
export type DayState = "off" | "done" | "open" | "made_up" | "carried" | "missed";

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

/** True when a shortfall on this habit rolls into the next day. */
export const carries = (h: QuantityRule): boolean => !!h.carry_over && !!h.target;

/**
 * Walk the days from the habit's start (or `from`) to `today`. `logged` maps a day to the amount done;
 * a null amount means the whole requirement. A shortfall on a past day is added to the next day's requirement
 * (up to max_carry, default one day's amount); it can only be made up on that next day.
 */
export function buildPlan(h: PlanRule, logged: Map<string, number | null>, today: string, from = h.start_date): DayPlan[] {
  const days: DayPlan[] = [];
  const target = h.target ?? 1;
  const cap = h.max_carry ?? target; // by default at most one extra day's worth stacks onto a day
  let carry = 0;
  for (let day = from < h.start_date ? h.start_date : from; day <= today; day = addDays(day, 1)) {
    const base = isDue(h, day) ? target : 0;
    const carried = Math.min(carry, cap);
    const required = base + carried;
    const entry = logged.get(day);
    const done = entry === undefined ? 0 : entry ?? required;
    const met = required > 0 && done >= required;
    const short = required > 0 && !met ? required - done : 0;
    carry = day < today && carries(h) ? short : 0;
    days.push({ day, base, carried, required, logged: done, state: required === 0 ? "off" : met ? "done" : day === today ? "open" : "missed" });
  }
  if (carries(h)) {
    for (let i = 0; i < days.length - 1; i++) {
      if (days[i].state !== "missed") continue;
      const next = days[i + 1];
      if (next.state === "done") days[i].state = "made_up";
      else if (next.day === today && next.state === "open") days[i].state = "carried";
    }
  }
  return days;
}

/** Plan lookup by day, for the checkin rows as stored. */
export function loggedMap(rows: { day: string; amount?: number | null }[]): Map<string, number | null> {
  return new Map(rows.map((r) => [r.day, r.amount ?? null]));
}

/** Consecutive scheduled days completed (or made up), counting back from today (today may still be open). */
export function planStreak(days: DayPlan[]): number {
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

/** Plan for one habit from the loaded check-ins (about 400 days are loaded, so start there). */
export function planFor(h: PlanRule & { id: string }, checkins: { habit_id: string; day: string; amount?: number | null }[], today: string): DayPlan[] {
  return buildPlan(h, loggedMap(checkins.filter((c) => c.habit_id === h.id)), today, addDays(today, -400));
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

export function describeSchedule(h: Pick<Habit, "frequency" | "weekdays">): string {
  if (h.frequency === "daily") return "Every day";
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [...h.weekdays].sort();
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "6,7") return "Weekends";
  return days.map((d) => names[d]).join(", ");
}

