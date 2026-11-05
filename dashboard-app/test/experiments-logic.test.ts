import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSamples, repeatOf, samplesSummary, sortExperiments, techniqueOptions } from "../src/extended/modules/experiments/logic.ts";
import type { Experiment } from "../src/extended/lib/types.ts";

const exp = (o: Partial<Experiment>): Experiment => ({
  id: "e", title: "Run", status: "planned", outcome: null, technique: "", started_on: null, ended_on: null,
  project_id: null, publication_id: null, repeat_of: null, aim: "", protocol: "", samples: [], results: "",
  conclusion: "", next_steps: "", tags: [], pinned: false, archived_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", ...o,
});

test("experiments sort: pinned, then on the bench, then next up, then finished newest first", () => {
  const list = [
    exp({ id: "done-old", status: "done", ended_on: "2026-01-10" }),
    exp({ id: "planned-late", status: "planned", started_on: "2026-12-01" }),
    exp({ id: "running", status: "running" }),
    exp({ id: "done-new", status: "done", ended_on: "2026-10-10" }),
    exp({ id: "planned-soon", status: "planned", started_on: "2026-11-10" }),
    exp({ id: "pinned-done", status: "done", pinned: true }),
  ];
  assert.deepEqual(sortExperiments(list).map((e) => e.id), ["pinned-done", "running", "planned-soon", "planned-late", "done-new", "done-old"]);
});

test("repeating a run copies the set-up, not the results", () => {
  const e = exp({ id: "a", title: "CD8 flow (repeat)", status: "done", outcome: "worked", protocol: "Stain", results: "Down in HFD",
    samples: [{ label: "M1", group: "HFD", notes: "tumour 0.4 g" }], technique: "Flow cytometry", tags: ["flow"] });
  const r = repeatOf(e);
  assert.equal(r.title, "CD8 flow (repeat)"); // no "(repeat) (repeat)"
  assert.equal(r.repeat_of, "a");
  assert.equal(r.status, "planned");
  assert.equal(r.protocol, "Stain");
  assert.equal("results" in r, false);
  assert.deepEqual(r.samples, [{ label: "M1", group: "HFD", notes: "" }]);
});

test("samples: pasted rows from a spreadsheet, and a one-line summary", () => {
  const s = parseSamples("M1\tHFD\t0.4 g\nM2\tHFD\nM3\tChow\n\n,ignored\nM4, Chow, small");
  assert.deepEqual(s.map((x) => [x.label, x.group, x.notes]), [["M1", "HFD", "0.4 g"], ["M2", "HFD", ""], ["M3", "Chow", ""], ["M4", "Chow", "small"]]);
  assert.equal(samplesSummary(s), "4 samples · HFD 2, Chow 2");
  assert.equal(samplesSummary([]), "");
});

test("technique suggestions put your own first and never repeat one", () => {
  const opts = techniqueOptions(["qPCR", "Seahorse", "qPCR", " "]);
  assert.deepEqual(opts.slice(0, 2), ["qPCR", "Seahorse"]);
  assert.equal(opts.filter((t) => t.toLowerCase() === "qpcr").length, 1);
});
