import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { docxBlocks, mergeOutline, outlineProgress, parseOutline, sectionProgress, toggleItem } from "../src/extended/modules/planning/outline.ts";

// A made-up writing plan in the same shape as a real one (Word XML, trimmed to what matters).
const p = (text: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const table = (rows: string[][]) => `<w:tbl><w:tblPr/>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr/>${c.split(" / ").map((x) => p(x)).join("")}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
const head = ["Section", "Paras", "What to cover", "Notes"];
const XML = `<?xml version="1.0"?><w:document><w:body>
  ${p("Results chapter: Structure and Writing Plan")}${p("Effects of diet on tumour growth")}
  ${p("3.1 Tumour growth (6 paragraphs – 40%)", "Heading1")}
  ${table([head, ["3.1.1 Growth curves", "2", "Weekly calliper measurements &amp; volumes", "Done"], ["3.1.2 Endpoint weights", "1.5", "Tumour and organ weights", "Figure 3"], ["3.1.3 Histology", "2.5", "H&amp;E grading", ""]])}
  ${p("3.2 Immune infiltration (5 paragraphs)", "Heading1")}
  ${p("Keep the gating strategy in Methods.")}
  ${table([head, ["3.2.1 Flow cytometry", "3", "CD45, CD3, CD8", "Done (Figures)"], ["3.2.2 IHC", "2", "CD8 density", "Keep minimal"]])}
  ${p("3.3 Summary of findings (2 paragraphs)", "Heading1")}
  ${table([head, ["3.3 Summary", "2", "What the chapter shows", "No new data"]])}
  ${p("Summary", "Heading1")}
  ${table([head, ["3.1 Tumour growth", "6", "Growth", "46 per cent"], ["Total", "13", "About 2,000 words", ""]])}
  ${p("Figures and tables to prepare")}${p("Figure 1. Growth curves by diet")}${p("Table 1. Endpoint weights")}
</w:body></w:document>`;

test("a Word writing plan becomes sections, subsections and figures", () => {
  const o = parseOutline(docxBlocks(XML));
  assert.equal(o.title, "Results chapter: Structure and Writing Plan");
  assert.equal(o.subtitle, "Effects of diet on tumour growth");
  assert.equal(o.total, "13 paragraphs · About 2,000 words");
  assert.deepEqual(o.items.map((i) => i.number || i.kind), ["3.1", "3.1.1", "3.1.2", "3.1.3", "3.2", "3.2.1", "3.2.2", "3.3", "figure", "figure"]);
  const s31 = o.items[0], s32 = o.items[4], s33 = o.items[7];
  assert.deepEqual([s31.title, s31.paras], ["Tumour growth", 6]);
  assert.equal(s32.notes, "Keep the gating strategy in Methods.");
  assert.deepEqual([s33.cover, s33.paras], ["What the chapter shows", 2]); // a section with no subsections takes its own row
  const sub = o.items[1];
  assert.deepEqual([sub.title, sub.paras, sub.cover, sub.done], ["Growth curves", 2, "Weekly calliper measurements & volumes", true]);
  assert.equal(o.items[2].paras, 1.5);
  assert.equal(o.items[2].done, false, "“Figure 3” is a note, not done");
  assert.equal(o.items[5].done, true, "“Done (Figures)” counts as done");
  assert.deepEqual(o.items.filter((i) => i.kind === "figure").map((i) => i.title), ["Figure 1. Growth curves by diet", "Table 1. Endpoint weights"]);
});

test("progress counts paragraphs; a section without subsections counts itself", () => {
  const o = parseOutline(docxBlocks(XML));
  const pr = outlineProgress(o.items);
  assert.deepEqual([pr.done, pr.total, pr.parasDone, pr.parasTotal, pr.figures], [2, 6, 5, 13, 2]);
  assert.ok(Math.abs(pr.share! - 5 / 13) < 1e-9);
  assert.deepEqual(sectionProgress(o.items, o.items[0]), { done: 1, total: 3, parasDone: 2, parasTotal: 6 });
});

test("ticking a section ticks its subsections; ticking again clears them", () => {
  const o = parseOutline(docxBlocks(XML));
  const s31 = o.items[0];
  const on = toggleItem(o.items, s31.id);
  assert.ok(on.filter((i) => i.number.startsWith("3.1.")).every((i) => i.done));
  const off = toggleItem(on, s31.id);
  assert.ok(off.filter((i) => i.number.startsWith("3.1.")).every((i) => !i.done));
  assert.equal(off.find((i) => i.number === "3.2.1")!.done, true, "other sections untouched");
  const one = toggleItem(o.items, o.items[3].id);
  assert.equal(one.find((i) => i.number === "3.1.3")!.done, true);
});

test("updating from a newer plan keeps what is ticked", () => {
  const first = parseOutline(docxBlocks(XML)).items;
  const ticked = toggleItem(toggleItem(first, first[3].id), first.find((i) => i.kind === "figure")!.id);
  const revised = parseOutline(docxBlocks(XML.replace("3.1.3 Histology", "3.1.3 Histology and grading").replace("Table 1. Endpoint weights", "Table 2. New table"))).items;
  const merged = mergeOutline(ticked, revised);
  assert.equal(merged.find((i) => i.number === "3.1.3")!.done, true);
  assert.equal(merged.find((i) => i.number === "3.1.3")!.title, "Histology and grading", "new wording is taken");
  assert.equal(merged.find((i) => i.title.startsWith("Figure 1"))!.done, true);
  assert.equal(merged.find((i) => i.title.startsWith("Table 2"))!.done, false);
  assert.equal(merged.find((i) => i.number === "3.1.1")!.id, first[1].id, "ids are kept");
});

test("documents without a plan give nothing; entities and breaks are read", () => {
  assert.deepEqual(parseOutline(docxBlocks(`<w:body>${p("Just a letter")}</w:body>`)).items, []);
  assert.equal((docxBlocks(`<w:body><w:p><w:r><w:t>A&amp;B</w:t><w:tab/><w:t>C</w:t></w:r></w:p></w:body>`)[0] as { text: string }).text, "A&B C");
});

test("the outline column: a list, defaulting empty, safe to rerun", async () => {
  const root = new URL("../../supabase/", import.meta.url);
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table public.ws_thesis_chapters(id uuid primary key default gen_random_uuid(), title text);`);
    const mig = readFileSync(new URL("thesis-outline.sql", root), "utf8");
    await db.exec(mig); await db.exec(mig);
    await db.exec(`insert into ws_thesis_chapters(title) values('Review of literature')`);
    assert.deepEqual((await db.query<{ outline: unknown }>(`select outline from ws_thesis_chapters`)).rows[0].outline, []);
    await assert.rejects(db.exec(`update ws_thesis_chapters set outline='{"a":1}'`), /outline_is_list/);
  } finally { await db.close(); }
});
