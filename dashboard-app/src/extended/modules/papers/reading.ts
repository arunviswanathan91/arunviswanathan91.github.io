import type { Habit } from "../../lib/types.ts";

/** The habit reading time goes to by default: a minutes habit called "Read…", else any minutes habit. */
export function readingHabit(habits: Habit[]): Habit | undefined {
  const mins = habits.filter((h) => !h.archived_at && h.target && /^min/i.test(h.unit ?? ""));
  return mins.find((h) => /read/i.test(h.name)) ?? mins[0];
}
