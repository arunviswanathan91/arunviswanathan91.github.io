import type { Experiment, ExperimentSample, ExperimentStatus } from "../../lib/types.ts";

/** Common techniques offered as suggestions; anything typed is kept as is. */
export const TECHNIQUES = [
  "Flow cytometry", "Western blot", "qPCR", "ELISA", "Immunohistochemistry", "Immunofluorescence", "Multiplex IF",
  "Cell culture", "Cell viability assay", "Migration / invasion assay", "In vivo (mouse)", "Histology",
  "Spatial transcriptomics", "scRNA-seq", "Bulk RNA-seq", "LC-MS/MS proteomics", "Metabolomics", "Lipidomics",
  "Image analysis", "Bioinformatics", "Statistical modelling",
];

/** Suggestions: the common list plus techniques already used, most used first, no duplicates. */
export function techniqueOptions(used: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of used.map((t) => t.trim()).filter(Boolean)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const mine = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const seen = new Set(mine.map((t) => t.toLowerCase()));
  return [...mine, ...TECHNIQUES.filter((t) => !seen.has(t.toLowerCase()))];
}

const ORDER: Record<ExperimentStatus, number> = { running: 0, analysing: 1, planned: 2, done: 3, abandoned: 4 };

/** Pinned first, then what is on the bench now, then what is next, then finished work (newest first). */
export function sortExperiments(list: Experiment[]): Experiment[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
    if (a.status === "planned") return (a.started_on ?? "9999").localeCompare(b.started_on ?? "9999");
    const da = a.ended_on ?? a.started_on ?? a.updated_at, db = b.ended_on ?? b.started_on ?? b.updated_at;
    return db.localeCompare(da);
  });
}

/** A new planned run with the same set-up as `e`: protocol and samples copied, results left empty. */
export function repeatOf(e: Experiment): Partial<Experiment> {
  const base = e.title.replace(/\s*\(repeat(?: \d+)?\)$/i, "");
  return {
    title: `${base} (repeat)`,
    status: "planned",
    technique: e.technique,
    project_id: e.project_id,
    publication_id: e.publication_id,
    repeat_of: e.id,
    aim: e.aim,
    protocol: e.protocol,
    samples: e.samples.map((s) => ({ ...s, notes: "" })),
    tags: e.tags,
  };
}

/** "6 samples · HFD 3, Chow 3" */
export function samplesSummary(samples: ExperimentSample[]): string {
  if (!samples.length) return "";
  const groups = new Map<string, number>();
  for (const s of samples) if (s.group.trim()) groups.set(s.group.trim(), (groups.get(s.group.trim()) ?? 0) + 1);
  const n = `${samples.length} sample${samples.length === 1 ? "" : "s"}`;
  return groups.size ? `${n} · ${[...groups].map(([g, c]) => `${g} ${c}`).join(", ")}` : n;
}

/** Parse pasted rows (from Excel or Sheets: tab-separated; or comma-separated) into samples. */
export function parseSamples(text: string): ExperimentSample[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
      return { label: cells[0] ?? "", group: cells[1] ?? "", notes: cells.slice(2).join(", ") };
    })
    .filter((s) => s.label);
}
