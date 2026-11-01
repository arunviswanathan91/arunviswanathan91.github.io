import assert from "node:assert/strict";
import { test } from "node:test";
import { ago, bullets, cloneResume, dateRange, emptyResume, moveBy, newItem, newSection, normalizeResume, pdfFilename, visibleSections, DEFAULT_STYLE } from "../src/extended/modules/resumes/model.ts";
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
import { teachingResume } from "../src/extended/modules/resumes/starter.ts";
test("teaching CV starter normalizes unchanged and keeps its look", () => {
  const t = teachingResume();
  assert.deepEqual(normalizeResume(JSON.parse(JSON.stringify(t))).style, t.style);
  assert.equal(t.style.align, "center");
  assert.ok(t.sections.length >= 9);
});
test("normalizeResume merges partial accentOn", () => {
  assert.equal(normalizeResume({ style: { accentOn: { name: true } } }).style.accentOn.headings, true);
});
test("ago reads like the gallery label", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(ago("2026-11-01T12:00:00Z", now), "4 days ago");
  assert.equal(ago("2026-11-05T11:00:00Z", now), "1 hour ago");
  assert.equal(ago("2026-11-05T11:59:50Z", now), "just now");
});
import { groupRuns, layoutFor, withSubinfo } from "../src/extended/modules/resumes/model.ts";
test("groupRuns joins only consecutive roles at the same employer", () => {
  const r = groupRuns([{ subtitle: "RGCB" }, { subtitle: "rgcb " }, { subtitle: "Other" }, { subtitle: "RGCB" }, { subtitle: "" }, { subtitle: "" }]);
  assert.deepEqual(r.map((x) => x.length), [2, 1, 1, 1, 1]);
});
test("layoutFor layers defaults, type defaults and overrides", () => {
  assert.equal(layoutFor({ layouts: {} }, "certification").cols, 3);
  assert.equal(layoutFor({ layouts: {} }, "languages").mode, "compact");
  assert.equal(layoutFor({ layouts: { skills: { cols: 2 } } }, "skills").cols, 2);
  assert.equal(layoutFor({ layouts: {} }, "skills").mode, "grid");
});
test("withSubinfo styles", () => {
  assert.equal(withSubinfo("R", "expert", "colon"), "R: expert");
  assert.equal(withSubinfo("R", "expert", "dash"), "R – expert");
  assert.equal(withSubinfo("R", "expert", "bracket"), "R (expert)");
  assert.equal(withSubinfo("R", " ", "dash"), "R");
});
test("old twoColumnSkills is migrated into the skills layout", () => {
  const d = normalizeResume({ style: { twoColumnSkills: true } });
  assert.equal(layoutFor(d.style, "skills").cols, 2);
  assert.ok(!("twoColumnSkills" in d.style));
});
import { itemFromMeta } from "../src/extended/modules/resumes/doi.ts";
test("itemFromMeta maps a looked-up paper onto a publication entry", () => {
  const i = itemFromMeta({ title: "  A  title\nwith breaks ", publication: "Cell Death Discovery", year: 2026, doi: "10.1038/x", authors: ["Uttroside B", "Lee C"] });
  assert.equal(i.title, "A title with breaks");
  assert.equal(i.subtitle, "Cell Death Discovery");
  assert.equal(i.link, "https://doi.org/10.1038/x");
  assert.equal(i.start, "2026");
  assert.equal(i.body, "Uttroside B, Lee C");
  assert.equal(itemFromMeta({ arxiv_id: "2401.12345", title: "T" }).link, "https://arxiv.org/abs/2401.12345");
  assert.equal(itemFromMeta({ title: "T" }).link, "");
});
