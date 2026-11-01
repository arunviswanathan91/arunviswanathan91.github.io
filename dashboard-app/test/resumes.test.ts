import assert from "node:assert/strict";
import { test } from "node:test";
import { bullets, cloneResume, dateRange, emptyResume, moveBy, newItem, newSection, normalizeResume, pdfFilename, visibleSections, DEFAULT_STYLE } from "../src/extended/modules/resumes/model.ts";
import { starterResume } from "../src/extended/modules/resumes/starter.ts";

test("bullets: one per line, markers and blanks dropped", () => {
  assert.deepEqual(bullets("- a\n• b\n\n  * c  \nd"), ["a", "b", "c", "d"]);
});
test("dateRange handles open and single dates", () => {
  assert.equal(dateRange({ start: "Feb 2020", end: "present" }), "Feb 2020 – present");
  assert.equal(dateRange({ start: "", end: "2016" }), "2016");
  assert.equal(dateRange({ start: "", end: "" }), "");
});
test("moveBy swaps and stays in bounds", () => {
  assert.deepEqual(moveBy([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveBy([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moveBy([1, 2, 3], 2, 1), [1, 2, 3]);
});
test("hidden sections, hidden items and empty sections are not rendered", () => {
  const d = emptyResume();
  d.sections = [
    newSection("education", { items: [newItem({ title: "A" }), newItem({ title: "B", hidden: true })] }),
    newSection("skills", { hidden: true, items: [newItem({ title: "S" })] }),
    newSection("awards", { items: [newItem({ title: "gone", hidden: true })] }),
  ];
  const v = visibleSections(d);
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].items.map((i) => i.title), ["A"]);
});
test("normalizeResume repairs junk and fills newer style fields", () => {
  const d = normalizeResume({ sections: [{ type: "nonsense", items: [{ title: "x" }] }], style: { font: "sans" } });
  assert.equal(d.sections[0].type, "custom");
  assert.equal(d.sections[0].items[0].title, "x");
  assert.equal(d.style.font, "sans");
  assert.equal(d.style.pageFormat, DEFAULT_STYLE.pageFormat);
  assert.equal(normalizeResume(null).sections.length, 3);
});
test("cloneResume gives fresh ids and no shared references", () => {
  const a = starterResume();
  const b = cloneResume(a);
  assert.notEqual(a.sections[0].id, b.sections[0].id);
  assert.notEqual(a.sections[0].items[0].id, b.sections[0].items[0].id);
  b.sections[0].items[0].title = "changed";
  assert.notEqual(a.sections[0].items[0].title, "changed");
});
test("starter resume keeps the hidden skill groups hidden", () => {
  const skills = starterResume().sections.find((s) => s.type === "skills")!;
  assert.deepEqual(skills.items.filter((i) => i.hidden).map((i) => i.title), ["Teaching Skills", "Project Management & Consulting"]);
});
test("pdfFilename falls back and strips illegal characters", () => {
  assert.equal(pdfFilename("Research/CV: v2", "Arun"), "Research CV v2");
  assert.equal(pdfFilename(" ", "Arun"), "Arun");
  assert.equal(pdfFilename("", ""), "Resume");
});
