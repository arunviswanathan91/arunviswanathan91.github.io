import { strToU8, zipSync } from "fflate";
import type { Note } from "./types.ts";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(s: string, fallback = "untitled"): string {
  return (s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim() || fallback).slice(0, 80);
}

/** A note as a standalone markdown file with front matter. */
export function noteToMarkdown(n: Note, extra: Record<string, string | undefined> = {}): string {
  const meta: Record<string, string | undefined> = {
    title: JSON.stringify(n.title),
    type: n.type,
    tags: n.tags.length ? `[${n.tags.map((t) => JSON.stringify(t)).join(", ")}]` : undefined,
    created: n.created_at,
    updated: n.updated_at,
    ...extra,
  };
  const front = Object.entries(meta).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `---\n${front}\n---\n\n# ${n.title}\n\n${n.body}\n`;
}

export function downloadNotes(notes: Note[], names: { project?: (id: string) => string; paper?: (id: string) => string } = {}) {
  const md = (n: Note) => noteToMarkdown(n, { project: n.project_id ? JSON.stringify(names.project?.(n.project_id) ?? "") : undefined, paper: n.paper_id ? JSON.stringify(names.paper?.(n.paper_id) ?? "") : undefined });
  if (notes.length === 1) {
    downloadBlob(new Blob([md(notes[0])], { type: "text/markdown" }), `${safeFilename(notes[0].title)}.md`);
    return;
  }
  const files: Record<string, Uint8Array> = {};
  for (const n of notes) {
    let name = `${safeFilename(n.title)}.md`;
    for (let i = 2; files[name]; i++) name = `${safeFilename(n.title)} (${i}).md`;
    files[name] = strToU8(md(n));
  }
  downloadBlob(new Blob([new Uint8Array(zipSync(files)).buffer], { type: "application/zip" }), `notes-${new Date().toISOString().slice(0, 10)}.zip`);
}


/** RFC 4180 CSV with a BOM so Excel opens UTF-8 (₹, ö) correctly. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), `${safeFilename(name)}-${new Date().toISOString().slice(0, 10)}.csv`);
}
