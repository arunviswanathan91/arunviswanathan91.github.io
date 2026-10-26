import { test } from "node:test";
import assert from "node:assert/strict";
import { prepAgenda } from "../src/extended/modules/meetings/prep.ts";
import { firstOn } from "../src/extended/modules/budget/recurring.ts";
import { combine, toBase, type Fx } from "../src/extended/lib/fx.ts";
import { readingHabit } from "../src/extended/modules/papers/reading.ts";
import type { Habit } from "../src/extended/lib/types.ts";

test("meeting prep lists what changed, what is open (overdue first) and what is coming", () => {
  const md = prepAgenda({
    since: "2026-10-12T09:00:00Z", sinceLabel: "the last supervisor meeting (12 Oct)", today: "2026-10-26",
    done: [{ title: "Rerun DESeq2 with batch" }],
    open: [{ title: "Write methods", due_date: "2026-10-30", priority: "medium" }, { title: "Fix figure 2", due_date: "2026-10-20", priority: "high" }],
    stageChanges: [{ title: "STAT3 paper", from: "Drafting", to: "Under Review" }],
    papersRead: [], deadlines: [{ title: "ISMB abstract", due_date: "2026-11-02" }],
  });
  assert.match(md, /^## Since the last supervisor meeting \(12 Oct\)\n### Done\n- Rerun DESeq2 with batch\n### Manuscripts\n- STAT3 paper: Drafting → Under Review/);
  assert.ok(md.indexOf("Fix figure 2 (due 2026-10-20, overdue) · high") < md.indexOf("Write methods (due 2026-10-30)"));
  assert.match(md, /## Coming up \(30 days\)\n- ISMB abstract — 2026-11-02/);
  assert.doesNotMatch(md, /Papers read/);
  assert.match(prepAgenda({ since: "", sinceLabel: "x", today: "2026-10-26", done: [], open: [], stageChanges: [], papersRead: [], deadlines: [] }), /- _nothing recorded_/);
});

test("recurring items land on their day of month, clamped to short months", () => {
  assert.equal(firstOn("2026-10-26", 28), "2026-10-28");
  assert.equal(firstOn("2026-10-26", 5), "2026-11-05");
  assert.equal(firstOn("2026-02-10", 31), "2026-02-28");
  assert.equal(firstOn("2026-12-31", 1), "2027-01-01");
  assert.equal(firstOn("2026-11-30", 31), "2026-11-30");
});

test("currency totals convert through the default currency and give up when a rate is missing", () => {
  const fx: Fx = { base: "INR", date: "2026-10-26", rates: { sek: 0.125, usd: 0.012 } };
  assert.equal(toBase(100, "SEK", fx), 800);
  assert.equal(toBase(50, "INR", fx), 50);
  assert.equal(combine({ INR: 1000, SEK: 100 }, fx), 1800);
  assert.equal(combine({ INR: 1000, XYZ: 1 }, fx), null);
});

test("reading time goes to a minutes habit named Read, else any minutes habit", () => {
  const h = (name: string, unit: string | null, target: number | null = 30): Habit => ({ id: name, name, unit, target, description: null, frequency: "daily", weekdays: [], start_date: "2026-01-01", archived_at: null, position: 0, carry_over: false, max_carry: null, period: "day" });
  assert.equal(readingHabit([h("Meditate", "min"), h("Read papers", "min"), h("Run", "km")])!.name, "Read papers");
  assert.equal(readingHabit([h("Meditate", "minutes"), h("Run", "km")])!.name, "Meditate");
  assert.equal(readingHabit([h("Read", null, null)]), undefined);
});
