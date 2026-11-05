// The single place the app talks to Supabase. Every helper throws on error, so callers can
// rely on try/catch, and every write announces a change so open views reload themselves.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.ts";

export function sb() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export const CHANGED = "ws:changed";
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
  /** Columns that must have a value. */
  notNull?: string[];
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
  for (const k of opts.notNull ?? []) q = q.not(k, "is", null);
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

/** Move a record to Trash: recoverable from Trash until the retention period ends (30 days by default), then deleted. */
export async function trash(table: string, id: string): Promise<void> {
  try {
    await rpc("trash", { p_table: table, p_id: id });
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(/ws_trash|schema cache/i.test(msg) ? "Trash for this module needs the latest database setup: run supabase/trash-workspace.sql in the Supabase SQL Editor." : msg);
  }
  emitChange();
  window.dispatchEvent(new CustomEvent("dash:trash-changed")); // refresh the Trash list
}

export async function remove(table: string, match: Record<string, string>): Promise<void> {
  check(await sb().from(table).delete().match(match));
  emitChange();
}

export async function rpc<T>(fn: string, args: object = {}): Promise<T> {
  return check(await sb().rpc(fn, args)) as T;
}

/** Load data, reload when anything in the workspace changes. */
// Last result of each loader, so returning to a page shows what it showed before
// at once and refreshes it quietly, instead of blanking and popping back in.
// The key is the loader's source plus its deps: two call sites with the same
// text and deps run the same query. Bounded so long sessions don't grow it forever.
const loadCache = new Map<string, unknown>();
const CACHE_LIMIT = 150;
const cacheKey = (load: () => unknown, deps: unknown[]) => {
  try { return `${load.toString()}|${JSON.stringify(deps)}`; } catch { return ""; }
};
const remember = (key: string, value: unknown) => {
  if (!key) return;
  loadCache.delete(key);
  loadCache.set(key, value);
  if (loadCache.size > CACHE_LIMIT) loadCache.delete(loadCache.keys().next().value as string);
};
const cacheClearers = new Set<() => void>();
/** Lets a hook with its own cache (such as useLoans) be cleared with the rest. */
export function onLoadCacheClear(fn: () => void) { cacheClearers.add(fn); }
/** Forget every cached page (on sign-out, so another account never sees it). */
export function clearLoadCache() { loadCache.clear(); cacheClearers.forEach((fn) => fn()); }

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const key = cacheKey(load, deps);
  const [data, setData] = useState<T | undefined>(() => loadCache.get(key) as T | undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => !loadCache.has(key));
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  keyRef.current = key;
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    // Only the newest request may write: a slow earlier one (say, the previous
    // id when switching quickly) must not overwrite what is now on screen.
    const mine = ++seq.current;
    const k = keyRef.current;
    try {
      const value = await loadRef.current();
      if (mine !== seq.current) return;
      remember(k, value);
      setData(value);
      setError("");
    } catch (e) {
      if (mine !== seq.current) return;
      setError((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, deps);
  useEffect(() => {
    // Switching to deps already seen shows their cached result straight away.
    if (loadCache.has(keyRef.current)) { setData(loadCache.get(keyRef.current) as T); setLoading(false); }
    else setLoading(true);
    void reload();
    const on = () => void reload();
    window.addEventListener(CHANGED, on);
    return () => { seq.current++; window.removeEventListener(CHANGED, on); };
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

