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
  assert.deepEqual(skills.items.filter((i) => i.hidden).map((i) => i.title).sort(), ["Instructional Technology & Online Teaching Tools", "Multicolor Flowcytometry", "Project Management & Consulting", "Teaching Skills"]);
  assert.equal(starterResume().sections.find((s) => s.type === "publications")!.items.length, 7);
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
  assert.equal(i.authors, "Uttroside B, Lee C");
  assert.equal(i.body, undefined, "authors no longer go in the notes");
  assert.equal(itemFromMeta({ title: "T", publication: "bioRxiv" }).kind, "preprint");
  assert.equal(itemFromMeta({ arxiv_id: "2401.12345", title: "T" }).link, "https://arxiv.org/abs/2401.12345");
  assert.equal(itemFromMeta({ title: "T" }).link, "");
});
import { hasContent } from "../src/extended/modules/resumes/model.ts";
test("blank entries are not printed, so no empty headings", () => {
  const d = emptyResume();
  d.sections = [newSection("awards", { items: [newItem()] }), newSection("education", { items: [newItem({ title: "PhD" })] })];
  assert.equal(hasContent(newItem()), false);
  assert.deepEqual(visibleSections(d).map((s) => s.type), ["education"]);
});
import { roundRobin } from "../src/extended/modules/resumes/model.ts";
test("roundRobin deals items across columns like FlowCV skills", () => {
  assert.deepEqual(roundRobin(["comp", "exp", "pre", "add", "soft"], 2), [["comp", "pre", "soft"], ["exp", "add"]]);
  assert.deepEqual(roundRobin([1, 2, 3], 1), [[1, 2, 3]]);
  assert.deepEqual(roundRobin([], 3), [[], [], []]);
});

import { authorRuns, citationRuns, doiOf, isMe, linkText, pubGroups, pubKind, pubOptions, pubRole, shownLinks, sortNewestFirst, splitAuthors, DEFAULT_PUB } from "../src/extended/modules/resumes/pubs.ts";
import { newItem as item, normalizeResume as norm } from "../src/extended/modules/resumes/model.ts";

const ME = "Arun Viswanathan";
test("your name is recognised in the forms author lists use", () => {
  for (const a of ["Arun Viswanathan", "Viswanathan A", "Viswanathan, A.", "A. Viswanathan", "Viswanathan AG", "viswanathan arun", "Viswanathan A*"]) assert.equal(isMe(a, ME), true, a);
  for (const a of ["Viswanathan S", "Anand Viswa", "Arun Kumar", "Harikumar KB", ""]) assert.equal(isMe(a, ME), false, a);
  assert.equal(isMe("A. G. V.", ME, "A. G. V., Arun GV"), true, "an alias matches exactly");
  assert.deepEqual(splitAuthors("Smith J, Lee K and Viswanathan A, et al."), ["Smith J", "Lee K", "Viswanathan A"]);
  assert.deepEqual(splitAuthors("Smith, J.; Viswanathan, A."), ["Smith, J.", "Viswanathan, A."]);
});

test("long author lists are shortened but always keep your name", () => {
  const many = "A1 X, A2 X, A3 X, A4 X, A5 X, Viswanathan A, A7 X, A8 X";
  const text = (max: number, list = many) => authorRuns(list, ME, max).map((r) => (r.me ? `**${r.text}**` : r.text)).join(", ");
  assert.equal(text(0), "A1 X, A2 X, A3 X, A4 X, A5 X, **Viswanathan A**, A7 X, A8 X");
  assert.equal(text(6), "A1 X, A2 X, A3 X, A4 X, A5 X, **Viswanathan A**, et al.");
  assert.equal(text(3), "A1 X, A2 X, …, **Viswanathan A**, et al.");
  assert.equal(text(3, "A1 X, A2 X, A3 X, A4 X, Viswanathan A"), "A1 X, A2 X, …, **Viswanathan A**", "last author: nothing follows");
  assert.equal(text(3, "Viswanathan A, B X, C X, D X"), "**Viswanathan A**, B X, C X, et al.");
  assert.equal(text(3, "Viswanathan A, B X"), "**Viswanathan A**, B X");
});

test("a citation reads Authors. Title. Journal. Year;details. doi", () => {
  const cite = (over: object, o = DEFAULT_PUB) => citationRuns(item(over), o, ME).map((r) => (r.bold ? `**${r.text}**` : r.italic ? `_${r.text}_` : r.text)).join("");
  assert.equal(
    cite({ authors: "Vijayan Y, James S, Viswanathan A, Aparna JS", title: "Targeting acid ceramidase enhances antitumor immune response in colorectal cancer", subtitle: "Journal of Advanced Research", start: "21 Dec 2023", details: "65:73-87", link: "https://doi.org/10.1016/j.jare.2023.12.013" }),
    "Vijayan Y, James S, **Viswanathan A**, Aparna JS. Targeting acid ceramidase enhances antitumor immune response in colorectal cancer. _Journal of Advanced Research_. 2023;65:73-87. doi:10.1016/j.jare.2023.12.013",
  );
  assert.equal(cite({ title: "A title?", subtitle: "Cell.", start: "2026" }), "A title? _Cell_. 2026.", "no doubled full stops, and no authors is fine");
  assert.equal(cite({ authors: "Viswanathan A, Harikumar KB", title: "T", subtitle: "bioRxiv", role: "cofirst", link: "https://example.org/x" }), "**Viswanathan A**, Harikumar KB. T. _bioRxiv_. (co-first author)");
  assert.equal(cite({ authors: "Viswanathan A", title: "T", link: "https://doi.org/10.1/x" }, { ...DEFAULT_PUB, showDoi: false }), "**Viswanathan A**. T. ");
  assert.equal(cite({ title: "Conference Publication: STAT3 in PDAC", subtitle: "Cancer Research" }), "STAT3 in PDAC. _Cancer Research_.", "the label the sub-heading already gives is dropped");
  assert.equal(doiOf("https://doi.org/10.1038/s41420-026-1"), "10.1038/s41420-026-1");
  assert.equal(doiOf("https://pubmed.ncbi.nlm.nih.gov/1/"), "");
});

test("kind and role are guessed until you choose them", () => {
  assert.equal(pubKind(item({ title: "Uttroside B…", subtitle: "Cell Death Discovery" })), "article");
  assert.equal(pubKind(item({ title: "A workflow", subtitle: "Bioprotocol (in communication)" })), "submitted");
  assert.equal(pubKind(item({ title: "Uttroside B attenuates…", subtitle: "In communication" })), "submitted");
  assert.equal(pubKind(item({ title: "Conference Publication: STAT3-Mediated Immune Dysfunction", subtitle: "Cancer Research" })), "conference");
  assert.equal(pubKind(item({ title: "Abstract P29: STAT3…", subtitle: "Cancer Research, 86(13_Supplement)" })), "conference");
  assert.equal(pubKind(item({ title: "Overweight status drives…", subtitle: "bioRxiv" })), "preprint");
  assert.equal(pubKind(item({ title: "Meeting the challenge of abstract reasoning", subtitle: "Nature" })), "article", "words inside a title do not decide");
  assert.equal(pubKind(item({ title: "T", subtitle: "bioRxiv", kind: "article" })), "article", "your choice wins");
  assert.equal(pubRole(item({ authors: "Viswanathan A, Seby J" }), ME), "first");
  assert.equal(pubRole(item({ authors: "Mohammed S, Viswanathan A" }), ME), "co");
  assert.equal(pubRole(item({ authors: "Mohammed S, Viswanathan A", role: "cofirst" }), ME), "cofirst");
  assert.equal(pubRole(item({}), ME), null, "no author list and no choice: first authorship is never assumed");
});

test("entries are grouped under sub-headings, empty groups left out, order kept", () => {
  const items = [
    item({ id: "a", title: "A", subtitle: "Cell", authors: "Viswanathan A, X Y", start: "2024" }),
    item({ id: "b", title: "B", subtitle: "bioRxiv", authors: "Viswanathan A", start: "2026" }),
    item({ id: "c", title: "C", subtitle: "Nature", authors: "X Y, Viswanathan A", start: "2023" }),
    item({ id: "d", title: "Abstract P1: D", subtitle: "Cancer Research", start: "2025" }),
  ];
  const shape = (group: typeof DEFAULT_PUB.group) => pubGroups(items, { ...DEFAULT_PUB, group }, ME).map((g) => `${g.heading}=${g.items.map((i) => i.id).join("")}`);
  assert.deepEqual(shape("none"), ["null=abcd"]);
  assert.deepEqual(shape("kind"), ["Peer-reviewed articles=ac", "Preprints=b", "Conference papers and abstracts=d"]);
  assert.deepEqual(shape("role"), ["First-author publications=ab", "Co-author publications=c", "Other publications=d"]);
  assert.deepEqual(shape("both"), ["Peer-reviewed articles: first author=a", "Peer-reviewed articles: co-author=c", "Preprints=b", "Conference papers and abstracts=d"]);
  assert.deepEqual(sortNewestFirst(items).map((i) => i.id), ["b", "d", "a", "c"]);
  assert.deepEqual(pubOptions({}), DEFAULT_PUB);
});

test("older resumes pick up the new publication fields safely", () => {
  const old = norm({ sections: [
    { id: "s", type: "publications", title: "Publications", pub: { group: "role" }, items: [
      { id: "1", title: "T", link: "https://doi.org/10.1/x", body: "Arun Viswanathan, K B Harikumar" },     // authors left in notes by the old DOI fill
      { id: "2", title: "T", link: "https://doi.org/10.1/y", body: "Cover article. Cited 40 times, 2024" },  // real notes
      { id: "3", title: "T", link: "", body: "Smith J, Lee K" },                                             // typed by hand, no link: left alone
    ] },
    { id: "e", type: "experience", title: "X", items: [{ id: "4", title: "Fellow", link: "https://x.org", body: "Cells, mice" }] },
  ] });
  const [p, e] = old.sections;
  assert.equal(p.pub?.group, "role", "section options survive");
  assert.deepEqual([p.items[0].authors, p.items[0].body], ["Arun Viswanathan, K B Harikumar", ""]);
  assert.deepEqual([p.items[1].authors, p.items[1].body], [undefined, "Cover article. Cited 40 times, 2024"]);
  assert.equal(p.items[2].authors, undefined);
  assert.equal(e.items[0].body, "Cells, mice", "other sections are untouched");
});

test("research profile links", () => {
  assert.equal(linkText({ label: "ORCID", url: "https://orcid.org/0000-0002-5682-5170" }), "ORCID 0000-0002-5682-5170");
  assert.equal(linkText({ label: "Google Scholar", url: "https://scholar.google.com/citations?user=x" }), "Google Scholar");
  assert.deepEqual(shownLinks([{ label: "ORCID", url: "" }, { label: "Portfolio", url: "" }, { label: "GitHub", url: "https://github.com/x" }]).map((l) => l.label), ["Portfolio", "GitHub"]);
});
