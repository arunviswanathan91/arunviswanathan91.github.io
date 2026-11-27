import type { LibraryEntry, LibraryKind, LibraryVersion } from "../../lib/types.ts";

/** What differs between the two kinds: where they live and what their fields are called. */
export const LIBRARY = {
  protocol: {
    section: "protocols", plural: "Protocols", add: "Protocol", untitled: "Untitled protocol", field: "technique", fieldLabel: "Technique",
    body: "Steps", materials: "Reagents and materials", notes: "Notes and troubleshooting",
  },
  code: {
    section: "code", plural: "Code", add: "Snippet", untitled: "Untitled snippet", field: "language", fieldLabel: "Language",
    body: "Code", materials: "Needs", notes: "How to run",
  },
} as const satisfies Record<LibraryKind, object>;

/** Languages offered as suggestions; anything typed is kept as is. */
export const LANGUAGES = ["R", "Python", "Bash", "SQL", "JavaScript", "TypeScript", "MATLAB", "Julia"];

type VersionText = Pick<LibraryVersion, "body" | "materials" | "notes">;

/** The number the next saved version gets: one more than the highest so far, starting at 1. */
export function nextVersion(versions: Pick<LibraryVersion, "version">[]): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

/** Nothing written in it yet (a version just created with its entry). */
export function isBlankVersion(v: VersionText): boolean {
  return !v.body.trim() && !v.materials.trim() && !v.notes.trim();
}

/** An entry that has never been filled in: no version, or only an empty version 1.
 *  Its first save becomes version 1 instead of adding version 2. */
export function isUnwritten(versions: LibraryVersion[]): boolean {
  return versions.length === 0 || (versions.length === 1 && versions[0].version === 1 && isBlankVersion(versions[0]));
}

/** The entry's current version when it is newer than the one in use, else null. */
export function newerVersion(entry: Pick<LibraryEntry, "id" | "current_version_id">, usedVersion: LibraryVersion | null | undefined, versions: LibraryVersion[]): LibraryVersion | null {
  if (!usedVersion || usedVersion.entry_id !== entry.id) return null;
  const current = versions.find((v) => v.id === entry.current_version_id && v.entry_id === entry.id);
  return current && current.version > usedVersion.version ? current : null;
}

const EXTENSIONS: Record<string, string> = {
  r: ".R", python: ".py", py: ".py", bash: ".sh", shell: ".sh", sh: ".sh", sql: ".sql", javascript: ".js", js: ".js",
  typescript: ".ts", ts: ".ts", matlab: ".m", julia: ".jl",
};

/** A download name from the title, with the extension its language calls for:
 *  "Bayesian BMI model" in R gives "Bayesian-BMI-model.R". Letters, digits, dot, dash and underscore only. */
export function fileNameFor(entry: Pick<LibraryEntry, "title" | "language">): string {
  const ext = EXTENSIONS[entry.language.trim().toLowerCase()] ?? ".txt";
  const base = entry.title.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "untitled";
  return base.toLowerCase().endsWith(ext.toLowerCase()) ? base : `${base}${ext}`;
}

/** Pinned first, then most recently updated. */
export function sortEntries<T extends Pick<LibraryEntry, "pinned" | "updated_at">>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

/** A protocol version as text for an experiment's own protocol: the steps, then the reagents if any. */
export function protocolText(v: Pick<LibraryVersion, "body" | "materials">): string {
  const reagents = v.materials.trim();
  return [v.body.trim(), reagents && `Reagents: ${reagents}`].filter(Boolean).join("\n\n");
}
