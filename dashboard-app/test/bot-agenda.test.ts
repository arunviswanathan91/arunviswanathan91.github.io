import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayIn, matchByName, parseHabit, parseSpend } from "../../supabase/functions/telegram-webhook/money.ts";
import { buildIcs } from "../src/extended/lib/ics.ts";

test("spend: amount first, then currency, card, category and date tokens", () => {
  assert.deepEqual(parseSpend("₹1,250.50 BigBasket groceries card:amazon cat:food date:yesterday"), {
    amount: 1250.5, currency: null, description: "BigBasket groceries", card: "amazon", category: "food", date: "yesterday",
  });
  assert.deepEqual(parseSpend("45 SEK fika yesterday"), { amount: 45, currency: "SEK", description: "fika", card: null, category: null, date: "yesterday" });
  assert.deepEqual(parseSpend('300 cat:"eating out"'), { amount: 300, currency: null, description: "eating out", card: null, category: "eating out", date: null });
  assert.ok("error" in parseSpend("groceries 450"));
  assert.ok("error" in parseSpend("0 nothing"));
});

test("habit: name with an optional amount; hours become minutes", () => {
  assert.deepEqual(parseHabit("read 30"), { name: "read", amount: 30 });
  assert.deepEqual(parseHabit("deep work 1.5h"), { name: "deep work", amount: 90 });
  assert.deepEqual(parseHabit("gym"), { name: "gym", amount: null });
  assert.deepEqual(parseHabit("run 5 km"), { name: "run", amount: 5 });
  assert.deepEqual(parseHabit("run 5km"), { name: "run", amount: 5 });
});

test("names match exactly, then by prefix, then anywhere", () => {
  const rows = [{ name: "Read papers" }, { name: "Read" }, { name: "Meditate before bed" }];
  assert.equal(matchByName(rows, "read")!.name, "Read");
  assert.equal(matchByName(rows, "read p")!.name, "Read papers");
  assert.equal(matchByName(rows, "bed")!.name, "Meditate before bed");
  assert.equal(matchByName(rows, "swim"), null);
  assert.equal(dayIn("Asia/Kolkata", new Date("2026-10-26T20:00:00Z")), "2026-10-27");
});

test("ics: all-day and timed events, escaped text, folded lines, CRLF", () => {
  const ics = buildIcs([
    { uid: "emi-1-2026-11-05", title: "EMI · Slice, bike", day: "2026-11-05", at: null, detail: "₹6,557.17", url: "https://x/#/tools/loans" },
    { uid: "meeting-2", title: "Supervisor; weekly", day: "2026-11-06", at: "2026-11-06T09:30:00.000Z", detail: null },
  ], "Arun’s workspace", new Date("2026-10-26T00:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106/);
  assert.match(ics, /SUMMARY:EMI · Slice\\, bike/);
  assert.match(ics, /DTSTART:20261106T093000Z\r\nDTEND:20261106T100000Z/);
  assert.match(ics, /SUMMARY:Supervisor\; weekly/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
});

test("the calendar feed function uses the same ics builder as the dashboard", () => {
  const app = readFileSync(new URL("../src/extended/lib/ics.ts", import.meta.url), "utf8");
  const fn = readFileSync(new URL("../../supabase/functions/calendar-feed/ics.ts", import.meta.url), "utf8");
  assert.equal(fn, app);
});

import { pointTitle, reviewPoints } from "../src/lib/reviewPoints.ts";

test("reviewer comments split into points; headings dropped", () => {
  const text = `Reviewer 1:
1. The sample size is small. Please justify the power calculation.
2) Figure 3 lacks error bars
   and the legend is unclear.

Reviewer 2
- Discuss batch effects in the scRNA-seq data.
• Typo on page 4.

The discussion overstates the clinical relevance of STAT3 inhibition in this cohort.`;
  assert.deepEqual(reviewPoints(text), [
    "The sample size is small. Please justify the power calculation.",
    "Figure 3 lacks error bars and the legend is unclear.",
    "Discuss batch effects in the scRNA-seq data.",
    "Typo on page 4.",
    "The discussion overstates the clinical relevance of STAT3 inhibition in this cohort.",
  ]);
  assert.equal(pointTitle("The sample size is small. Please justify the power calculation."), "The sample size is small.");
  assert.equal(pointTitle("x".repeat(150)).length, 100);
});

import { MENU, parseDeadline, parseNote, parsePaid, parsePaper } from "../../supabase/functions/telegram-webhook/workspace.ts";

test("deadline: title, due date, priority and category", () => {
  assert.deepEqual(parseDeadline("ISMB abstract due:2026-11-02 !high cat:abstract"), { title: "ISMB abstract", due: "2026-11-02", priority: "high", category: "abstract_submission" });
  assert.deepEqual(parseDeadline('Half-time seminar due:"next friday"'), { title: "Half-time seminar", due: "next friday", priority: null, category: null });
  assert.equal((parseDeadline("Thesis !urgent cat:nonsense due:friday") as { category: string }).category, "other");
  assert.ok("error" in parseDeadline("due:friday"));
});

test("note: first line is the title, hashtags become tags", () => {
  assert.deepEqual(parseNote("Try SCENIC on the CAF subset #idea #scRNA"), { title: "Try SCENIC on the CAF subset", body: "Try SCENIC on the CAF subset", tags: ["idea", "scrna"] });
  assert.equal((parseNote("x".repeat(120)) as { title: string }).title.length, 80);
  assert.ok("error" in parseNote("#only"));
});

test("paper: DOI, arXiv id or link, otherwise a title", () => {
  assert.deepEqual(parsePaper("10.1038/s41586-020-2649-2"), { doi: "10.1038/s41586-020-2649-2", arxiv: null, url: null, title: null });
  assert.deepEqual(parsePaper("https://doi.org/10.1101/2024.01.02.573925."), { doi: "10.1101/2024.01.02.573925", arxiv: null, url: null, title: null });
  assert.deepEqual(parsePaper("https://arxiv.org/abs/2401.01234v2"), { doi: null, arxiv: "2401.01234", url: null, title: null });
  assert.deepEqual(parsePaper("Attention is all you need"), { doi: null, arxiv: null, url: null, title: "Attention is all you need" });
});

test("paid: the last number is the amount", () => {
  assert.deepEqual(parsePaid("slice 6,557.17"), { loan: "slice", amount: 6557.17, date: null });
  assert.deepEqual(parsePaid("amazon card ₹1200 date:yesterday"), { loan: "amazon card", amount: 1200, date: "yesterday" });
  assert.ok("error" in parsePaid("6557"));
});

test("the Telegram menu follows Telegram's rules", () => {
  assert.ok(MENU.length <= 100);
  for (const m of MENU) {
    assert.match(m.command, /^[a-z0-9_]{1,32}$/);
    assert.ok(m.description.length >= 3 && m.description.length <= 256);
  }
});
