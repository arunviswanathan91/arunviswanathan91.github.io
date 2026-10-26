// The single place the app talks to Supabase. Every helper throws on error, so callers can
// rely on try/catch, and every write announces a change so open views reload themselves.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.ts";

export function sb() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

const CHANGED = "ws:changed";
export function emitChange() {
  window.dispatchEvent(new Event(CHANGED));
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export interface ListOptions {
  eq?: Record<string, string | number | boolean | null>;
  in?: [string, (string | number)[]];
  gte?: [string, string];
  lt?: [string, string];
  order?: [string, boolean?][]; // [column, ascending = true]
  limit?: number;
}

export async function list<T>(table: string, opts: ListOptions = {}): Promise<T[]> {
  let q = sb().from(table).select("*");
  for (const [k, v] of Object.entries(opts.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
  if (opts.in) {
    if (opts.in[1].length === 0) return [];
    q = q.in(opts.in[0], opts.in[1]);
  }
  if (opts.gte) q = q.gte(opts.gte[0], opts.gte[1]);
  if (opts.lt) q = q.lt(opts.lt[0], opts.lt[1]);
  for (const [col, asc = true] of opts.order ?? []) q = q.order(col, { ascending: asc, nullsFirst: false });
  if (opts.limit) q = q.limit(opts.limit);
  return check(await q) as T[];
}

export async function getOne<T>(table: string, id: string): Promise<T | null> {
  return check(await sb().from(table).select("*").eq("id", id).maybeSingle()) as T | null;
}

export async function insert<T>(table: string, values: object): Promise<T> {
  const row = check(await sb().from(table).insert(values).select().single()) as T;
  emitChange();
  return row;
}

export async function insertMany(table: string, values: object[]): Promise<void> {
  if (!values.length) return;
  check(await sb().from(table).insert(values));
  emitChange();
}

/** Insert or replace rows that share the `onConflict` key columns. */
export async function upsert(table: string, values: object | object[], onConflict: string, quiet = false): Promise<void> {
  check(await sb().from(table).upsert(values, { onConflict }));
  if (!quiet) emitChange();
}

export async function update<T>(table: string, id: string, values: object, quiet = false): Promise<T> {
  const row = check(await sb().from(table).update(values).eq("id", id).select().single()) as T;
  if (!quiet) emitChange();
  return row;
}

export async function remove(table: string, match: Record<string, string>): Promise<void> {
  check(await sb().from(table).delete().match(match));
  emitChange();
}

export async function rpc<T>(fn: string, args: object = {}): Promise<T> {
  return check(await sb().rpc(fn, args)) as T;
}

/** Load data, reload when anything in the workspace changes. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => {
    setLoading(true);
    void reload();
    const on = () => void reload();
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, [reload]);
  return { data, error, loading, reload };
}

// ── Files ────────────────────────────────────────────────────────────────────

export const BUCKET = "workspace-files";

export async function currentUserId(): Promise<string> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function uploadFile(file: File, owner: Record<string, string>): Promise<void> {
  const uid = await currentUserId();
  const safe = file.name.replace(/[^\w.\- ]+/g, "_");
  const path = `${uid}/${crypto.randomUUID()}/${safe}`;
  const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  try {
    await insert("attachments", { storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, ...owner });
  } catch (e) {
    await sb().storage.from(BUCKET).remove([path]);
    throw e;
  }
}

export async function fileUrl(path: string): Promise<string> {
  const res = await sb().storage.from(BUCKET).createSignedUrl(path, 300);
  if (res.error) throw new Error(res.error.message);
  return res.data.signedUrl;
}

export async function downloadFile(path: string): Promise<Blob> {
  const res = await sb().storage.from(BUCKET).download(path);
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function deleteFile(id: string, path: string): Promise<void> {
  const res = await sb().storage.from(BUCKET).remove([path]);
  if (res.error) throw new Error(res.error.message);
  await remove("attachments", { id });
}

