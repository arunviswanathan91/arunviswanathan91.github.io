import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, expectedShare, goalProgress, moveChapter, nextTripDate, relativeDays, thesisProgress, tripMoney, wordsPerDay } from "../src/extended/modules/planning/logic.ts";
import type { Goal, ThesisChapter, Trip } from "../src/extended/lib/types.ts";

const ch = (o: Partial<ThesisChapter>): ThesisChapter => ({ id: "c", position: 1, title: "C", status: "drafting", words: 0, target_words: null, due_on: null, publication_id: null, notes: "", created_at: "", updated_at: "", ...o });
const goal = (o: Partial<Goal>): Goal => ({ id: "g", year: 2026, title: "G", area: "research", measure: "manual", target: null, current: 0, unit: "", milestones: [], project_id: null, habit_id: null, account_id: null, due_on: null, status: "active", notes: "", position: 0, created_at: "", updated_at: "", ...o });

test("days and relative wording", () => {
  assert.equal(daysBetween("2026-11-05", "2026-11-08"), 3);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2); // across a DST change elsewhere
  assert.equal(relativeDays("2026-11-05", "2026-11-05"), "today");
  assert.equal(relativeDays("2026-11-05", "2026-11-06"), "tomorrow");
  assert.equal(relativeDays("2026-11-05", "2027-06-30"), "in 8 months");
  assert.equal(relativeDays("2026-11-05", "2026-10-22"), "2 weeks ago");
});

test("thesis progress and the pace needed", () => {
  const chapters = [ch({ id: "a", words: 12000, target_words: 12000, status: "final" }), ch({ id: "b", words: 3000, target_words: 15000 })];
  const p = thesisProgress(chapters, null); // target from chapter targets
  assert.deepEqual(p, { words: 15000, target: 27000, share: 15000 / 27000, final: 1, chapters: 2 });
  assert.equal(thesisProgress(chapters, 60000).target, 60000);
  assert.equal(wordsPerDay(thesisProgress(chapters, 60000), "2026-11-05", "2026-11-15"), 4500);
  assert.equal(wordsPerDay(thesisProgress(chapters, 10000), "2026-11-05", "2026-11-15"), null); // already there
  assert.equal(thesisProgress([ch({ words: 10 }), ch({ words: 5, target_words: 100 })], null).target, null); // some chapters have no target
});

test("moving a chapter renumbers only what changed", () => {
  const list = [ch({ id: "a", position: 1 }), ch({ id: "b", position: 2 }), ch({ id: "c", position: 3 })];
  assert.deepEqual(moveChapter(list, "c", -1), [{ id: "c", position: 2 }, { id: "b", position: 3 }]);
  assert.deepEqual(moveChapter(list, "a", -1), []);
});

test("goal progress for each measure", () => {
  const inputs = {
    tasks: [{ project_id: "p", status: "done" }, { project_id: "p", status: "todo" }, { project_id: "q", status: "done" }],
    checkins: [{ habit_id: "h", day: "2026-01-02" }, { habit_id: "h", day: "2026-05-02" }, { habit_id: "h", day: "2025-12-31" }],
    balances: new Map([["acc", 25000]]),
  };
  assert.equal(goalProgress(goal({ measure: "milestones", milestones: [{ label: "a", done: true }, { label: "b", done: false }] }), inputs).share, 0.5);
  assert.equal(goalProgress(goal({ measure: "project", project_id: "p" }), inputs).label, "1 of 2 tasks done");
  assert.equal(goalProgress(goal({ measure: "habit", habit_id: "h", target: 100 }), inputs).value, 2); // only this year's days
  assert.equal(goalProgress(goal({ measure: "savings", account_id: "acc", target: 100000 }), inputs).share, 0.25);
  assert.equal(goalProgress(goal({ current: 3, target: 2, unit: "papers" }), inputs).share, 1); // capped
  assert.equal(goalProgress(goal({ current: 3, unit: "talks" }), inputs).share, null); // no target, no bar
});

test("expected share runs evenly through the year", () => {
  assert.equal(expectedShare({ year: 2026, due_on: null }, "2026-01-01"), 0);
  assert.ok(Math.abs(expectedShare({ year: 2026, due_on: null }, "2026-07-02") - 0.5) < 0.01);
  assert.equal(expectedShare({ year: 2026, due_on: "2026-06-30" }, "2026-11-05"), 1);
});

test("trip money and the next date that matters", () => {
  const t = { costs: [{ label: "Registration", amount: 450, paid: true }, { label: "Flights", amount: 900, paid: false }], funding: [{ source: "AACR travel award", amount: 1000, status: "awarded" as const }, { source: "DBT", amount: 500, status: "applied" as const, due_on: "2026-12-01" }] };
  assert.deepEqual(tripMoney(t), { total: 1350, paid: 450, awarded: 1000, pending: 500, outOfPocket: 350 });
  const trip = { ...t, status: "considering", abstract_due: "2026-11-20", registration_due: "2027-01-10", starts_on: "2027-04-16" } as unknown as Trip;
  assert.deepEqual(nextTripDate(trip, "2026-11-05"), { label: "Abstract due", date: "2026-11-20" });
  assert.deepEqual(nextTripDate({ ...trip, status: "accepted" }, "2026-11-05"), { label: "DBT due", date: "2026-12-01" });
  assert.equal(nextTripDate({ ...trip, status: "cancelled" }, "2026-11-05"), null);
});
