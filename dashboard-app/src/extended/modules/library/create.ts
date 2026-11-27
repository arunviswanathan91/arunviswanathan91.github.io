import { insert, remove, update } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import type { LibraryEntry, LibraryKind, LibraryVersion } from "../../lib/types.ts";
import { LIBRARY, isUnwritten, nextVersion } from "./logic.ts";

export type VersionContent = Pick<LibraryVersion, "body" | "materials" | "notes">;

/** A new entry with its version 1 (empty unless `content` is given), already set as current. */
export async function newEntry(kind: LibraryKind, values: Partial<LibraryEntry> = {}, content: Partial<VersionContent> = {}) {
  const created = await insert<LibraryEntry>("library_entries", { title: LIBRARY[kind].untitled, ...values, kind });
  const version = await insert<LibraryVersion>("library_versions", { entry_id: created.id, version: 1, ...content });
  const entry = await update<LibraryEntry>("library_entries", created.id, { current_version_id: version.id });
  return { entry, version };
}

/** Create an entry and open it. */
export async function createEntry(kind: LibraryKind, values: Partial<LibraryEntry> = {}) {
  const { entry } = await newEntry(kind, values);
  go(`${LIBRARY[kind].section}/${entry.id}`);
}

/**
 * Save `content` as the entry's next version and make it current. Saved versions are frozen,
 * so an entry that was never filled in has its empty version 1 replaced, not edited.
 */
export async function saveVersion(entryId: string, versions: LibraryVersion[], content: VersionContent, change_note: string): Promise<LibraryVersion> {
  const first = isUnwritten(versions);
  if (first) for (const v of versions) await remove("library_versions", { id: v.id });
  const version = await insert<LibraryVersion>("library_versions", { entry_id: entryId, version: first ? 1 : nextVersion(versions), ...content, change_note: change_note.trim() });
  await update<LibraryEntry>("library_entries", entryId, { current_version_id: version.id });
  return version;
}
