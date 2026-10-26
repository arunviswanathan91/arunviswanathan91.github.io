import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWhen, understand } from "../../supabase/functions/telegram-webhook/intent.ts";
import { parseDate } from "../../supabase/functions/telegram-webhook/parse.ts";

const ctx = { habits: ["Read", "Gym", "Run", "Meditate before bed"], loans: ["Slice", "Amazon Pay ICICI"] };
const cmd = (s: string) => understand(s, ctx)?.command ?? null;

test("time phrases come off the end and the date parser can read them", () => {
  const cases: [string, string, string | null][] = [
    ["call Anna tomorrow at 9am", "call Anna", "tomorrow 9am"],
    ["submit the form by Friday", "submit the form", "friday"],
    ["book flights next tue", "book flights", "next tuesday"],
    ["water plants in 2h", "water plants", "in 2h"],
    ["send report at 5pm", "send report", "today 5pm"],
    ["renew visa on 2026-11-30", "renew visa", "2026-11-30"],
    ["think about methods", "think about methods", null],
  ];
  for (const [input, text, when] of cases) {
    assert.deepEqual(extractWhen(input), { text, when }, input);
    if (when) assert.ok(parseDate(when, "Asia/Kolkata"), `parseDate("${when}")`);
  }
});

test("everyday sentences map to commands", () => {
  const cases: [string, string | null][] = [
    ["hi", "/hello"],
    ["What can you do?", "/hello"],
    ["what's due?", "/due"],
    ["anything coming up", "/due"],
    ["how's my week", "/week"],
    ["how much do I owe", "/loans"],
    ["my habits", "/habits"],
    ["what should I do today", "/today"],
    ["show my jobs", "/list jobs"],
    ["find STAT3", "/find stat3"],
    ["where is the protocol", "/find the protocol"],
    ["spent 450 on groceries", "/spend 450 groceries"],
    ["450 for lunch with amazon card", "/spend 450 lunch card:amazon"],
    ["bought shoes 2k", "/spend 2000 shoes"],
    ["spent ₹1,250 at BigBasket", "/spend 1250 INR BigBasket"],
    ["got paid 52000 salary", "/income 52000 salary"],
    ["paid slice 6557", "/paid Slice 6557"],
    ["paid 1200 to amazon card bill", "/paid Amazon Pay ICICI 1200"],
    ["read 30 min", "/habit Read 30"],
    ["reading for 1.5 hours", "/habit Read 90"],
    ["did gym", "/habit Gym"],
    ["ran 5 km", "/habit Run 5"],
    ["meditated", "/habit Meditate before bed"],
    ["remind me to call Anna tomorrow 9am", '/remind call Anna due:"tomorrow 9am"'],
    ["remind me about the seminar", "/x ask-remind the seminar"],
    ["deadline for grant application", "/deadline grant application"],
    ["ISMB abstract deadline friday", '/deadline ISMB abstract due:"friday"'],
    ["note: try SCENIC on CAF subset #idea", "/note try SCENIC on CAF subset #idea"],
    ["idea - batch-correct before clustering", "/note batch-correct before clustering"],
    ["I need to revise the intro by friday", '/add revise the intro due:"friday"'],
    ["todo: email Maya", "/add email Maya"],
    ["done with revise the intro", "/complete revise the intro"],
    ["10.1038/s41586-020-2649-2", "/paper 10.1038/s41586-020-2649-2"],
    ["thanks!", "/thanks"],
    ["the weather is nice", null],
    ["hmm", null],
  ];
  for (const [input, expected] of cases) assert.equal(cmd(input), expected, input);
});
