// Pure habit rules. Days are YYYY-MM-DD strings; weekdays are ISO (1 = Mon … 7 = Sun).
import { addDays, isoWeekday } from "../../lib/dates.ts";
import type { Habit } from "../../lib/types.ts";

type HabitRule = Pick<Habit, "frequency" | "weekdays" | "start_date">;

/** Is the habit scheduled on this day? (Archiving doesn’t change history, so it isn’t checked here.) */
export function isDue(h: HabitRule, day: string): boolean {
  if (day < h.start_date) return false;
  return h.frequency === "daily" || h.weekdays.includes(isoWeekday(day));
}

/** Consecutive scheduled days completed, counting back from today (today may still be open). */
export function streak(h: HabitRule, done: Set<string>, today: string): number {
  let n = 0;
  let day = today;
  if (isDue(h, day) && !done.has(day)) day = addDays(day, -1); // today not done yet doesn't break the streak
  for (let i = 0; i < 3660 && day >= h.start_date; i++, day = addDays(day, -1)) {
    if (!isDue(h, day)) continue;
    if (!done.has(day)) break;
    n++;
  }
  return n;
}

/** Share of scheduled days completed in the `days` days ending today. */
export function completionRate(h: HabitRule, done: Set<string>, today: string, days = 30): { done: number; due: number } {
  let due = 0;
  let hit = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (!isDue(h, day)) continue;
    due++;
    if (done.has(day)) hit++;
  }
  return { done: hit, due };
}

export function describeSchedule(h: Pick<Habit, "frequency" | "weekdays">): string {
  if (h.frequency === "daily") return "Every day";
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [...h.weekdays].sort();
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "6,7") return "Weekends";
  return days.map((d) => names[d]).join(", ");
}

