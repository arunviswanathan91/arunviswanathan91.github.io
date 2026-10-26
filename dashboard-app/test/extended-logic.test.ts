import { test } from "node:test";
import assert from "node:assert/strict";
import { completionRate, describeSchedule, isDue, streak } from "../src/extended/modules/habits/logic.ts";
import { describeRecurrence, inView, sortTasks } from "../src/extended/modules/tasks/logic.ts";
import type { Task } from "../src/extended/lib/types.ts";

// 2026-10-26 is a Monday.
const gym = { frequency: "weekdays" as const, weekdays: [1, 3, 5], start_date: "2026-10-01" };
const daily = { frequency: "daily" as const, weekdays: [], start_date: "2026-10-20" };

test("habits are due on their schedule and never before they start", () => {
  assert.equal(isDue(gym, "2026-10-26"), true); // Mon
  assert.equal(isDue(gym, "2026-10-27"), false); // Tue
  assert.equal(isDue(daily, "2026-10-19"), false);
  assert.equal(isDue(daily, "2026-10-20"), true);
});

test("streak counts scheduled days only and tolerates today being unfinished", () => {
  const done = new Set(["2026-10-21", "2026-10-23", "2026-10-26"]); // Wed, Fri, Mon
  assert.equal(streak(gym, done, "2026-10-26"), 3);
  assert.equal(streak(gym, done, "2026-10-28"), 3); // Wed today, not done yet
  assert.equal(streak(gym, done, "2026-10-30"), 0); // missed Wed 28
  assert.equal(streak(daily, new Set(["2026-10-24", "2026-10-25"]), "2026-10-26"), 2);
});

test("completion rate is over scheduled days", () => {
  const done = new Set(["2026-10-21", "2026-10-26"]);
  assert.deepEqual(completionRate(gym, done, "2026-10-26", 7), { done: 2, due: 3 }); // Wed, Fri, Mon
});

test("schedule descriptions", () => {
  assert.equal(describeSchedule({ frequency: "weekdays", weekdays: [5, 1, 2, 3, 4] }), "Weekdays");
  assert.equal(describeSchedule({ frequency: "weekdays", weekdays: [1, 3] }), "Mon, Wed");
  assert.equal(describeSchedule({ frequency: "daily", weekdays: [] }), "Every day");
});

const task = (p: Partial<Task>): Task => ({
  id: Math.random().toString(), title: "t", description: null, status: "todo", priority: "medium", due_date: null, project_id: null,
  meeting_id: null, deadline_id: null, tags: [], recurrence: null, series_id: null, previous_id: null, completed_at: null,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...p,
});

test("task views", () => {
  const today = "2026-10-26";
  assert.equal(inView(task({}), "inbox", today), true);
  assert.equal(inView(task({ project_id: "p" }), "inbox", today), false);
  assert.equal(inView(task({ due_date: today }), "today", today), true);
  assert.equal(inView(task({ due_date: "2026-10-25" }), "overdue", today), true);
  assert.equal(inView(task({ due_date: "2026-10-27" }), "upcoming", today), true);
  assert.equal(inView(task({ due_date: today, status: "done" }), "today", today), false);
  assert.equal(inView(task({ status: "cancelled" }), "completed", today), true);
});

test("open tasks sort by date, then priority, undated last", () => {
  const a = task({ title: "undated" });
  const b = task({ title: "later", due_date: "2026-11-01" });
  const c = task({ title: "soon-low", due_date: "2026-10-27", priority: "low" });
  const d = task({ title: "soon-urgent", due_date: "2026-10-27", priority: "urgent" });
  assert.deepEqual(sortTasks([a, b, c, d], "all").map((t) => t.title), ["soon-urgent", "soon-low", "later", "undated"]);
});

test("recurrence descriptions", () => {
  assert.equal(describeRecurrence({ freq: "weekly", weekdays: [2] }), "Every week on Tue");
  assert.equal(describeRecurrence({ freq: "monthly", interval: 3, until: "2027-06-30" }), "Every 3 months until 2027-06-30");
  assert.equal(describeRecurrence(null), "");
});


// ── Habit carry-over ─────────────────────────────────────────────────────────
import { buildPlan, loggedMap, planStreak } from "../src/extended/modules/habits/logic.ts";

const reading = { frequency: "daily" as const, weekdays: [], start_date: "2026-10-20", target: 30, carry_over: true, max_carry: null };
const plan = (rows: { day: string; amount: number | null }[], today: string, h = reading) => buildPlan(h, loggedMap(rows), today);

test("a shortfall is added to the next day and checked there", () => {
  const days = plan([{ day: "2026-10-24", amount: 10 }], "2026-10-25", { ...reading, start_date: "2026-10-24" });
  const sat = days.at(-2)!, sun = days.at(-1)!;
  assert.equal(sat.state, "carried");
  assert.equal(sun.required, 50); // 30 + 20 not done on Saturday
  assert.equal(sun.carried, 20);
});

test("finishing the stacked amount makes the short day count towards the streak", () => {
  const rows = [20, 21, 22, 23].map((d) => ({ day: `2026-10-${d}`, amount: 30 }));
  const days = plan([...rows, { day: "2026-10-24", amount: 10 }, { day: "2026-10-25", amount: 50 }], "2026-10-26");
  assert.equal(days.find((d) => d.day === "2026-10-24")!.state, "made_up");
  assert.equal(planStreak(days), 6); // 20..25, today open
});

test("a shortfall not made up the next day is missed and breaks the streak", () => {
  const days = plan([{ day: "2026-10-23", amount: 30 }, { day: "2026-10-24", amount: 10 }, { day: "2026-10-25", amount: 30 }], "2026-10-26", { ...reading, start_date: "2026-10-23" });
  assert.equal(days.find((d) => d.day === "2026-10-24")!.state, "missed");
  assert.equal(days.find((d) => d.day === "2026-10-25")!.required, 50);
  assert.equal(planStreak(days), 0);
});

test("carry respects the cap (default one day's amount) and is off without carry_over", () => {
  assert.equal(plan([], "2026-10-25").at(-1)!.required, 60); // missing days never stack beyond one extra day
  assert.equal(plan([], "2026-10-21", { ...reading, max_carry: 15 }).at(-1)!.required, 45);
  assert.equal(plan([], "2026-10-21", { ...reading, carry_over: false }).at(-1)!.required, 30);
});

test("a check-in without an amount counts as the full requirement", () => {
  const days = plan([{ day: "2026-10-24", amount: 10 }, { day: "2026-10-25", amount: null }], "2026-10-25");
  assert.equal(days.at(-1)!.state, "done");
  assert.equal(days.at(-2)!.state, "made_up");
});
