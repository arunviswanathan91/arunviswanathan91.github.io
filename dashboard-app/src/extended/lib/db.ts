// The single place the app talks to Supabase. Every helper throws on error, so callers can
// rely on try/catch, and every write announces a change so open views reload themselves.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.ts";
import * as pages from "./pageCache.ts";
import { affects, groupsOfTable, groupsRead, type Groups } from "./pageCache.ts";

export function sb() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export const CHANGED = "ws:changed";
/** Announce a save. Name the table so only pages reading that part of the workspace
 *  reload; with no table every open page reloads (use that when unsure). */
let saves = 0; // counts saves, so a reload never reuses a request sent before one
export function emitChange(table?: string) {
  saves++;
  window.dispatchEvent(new CustomEvent<Groups>(CHANGED, { detail: groupsOfTable(table) }));
}
/** Groups a CHANGED event touched (null: everything). */
export const changedGroups = (e: Event): Groups => (e instanceof CustomEvent ? (e.detail as Groups) ?? null : null);

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
  emitChange(table);
  return row;
}

export async function insertMany(table: string, values: object[]): Promise<void> {
  if (!values.length) return;
  check(await sb().from(table).insert(values));
  emitChange(table);
}

/** Insert or replace rows that share the `onConflict` key columns. */
export async function upsert(table: string, values: object | object[], onConflict: string, quiet = false): Promise<void> {
  check(await sb().from(table).upsert(values, { onConflict }));
  if (!quiet) emitChange(table);
}

export async function update<T>(table: string, id: string, values: object, quiet = false): Promise<T> {
  const row = check(await sb().from(table).update(values).eq("id", id).select().single()) as T;
  if (!quiet) emitChange(table);
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
  emitChange(table);
  window.dispatchEvent(new CustomEvent("dash:trash-changed")); // refresh the Trash list
}

export async function remove(table: string, match: Record<string, string>): Promise<void> {
  check(await sb().from(table).delete().match(match));
  emitChange(table);
}

export async function rpc<T>(fn: string, args: object = {}): Promise<T> {
  return check(await sb().rpc(fn, args)) as T;
}

const cacheClearers = new Set<() => void>();
/** Lets a hook with its own state (such as useLoans) be cleared with the rest. */
export function onLoadCacheClear(fn: () => void) { cacheClearers.add(fn); }
/** Forget every cached page, in memory and in the browser (on sign-out). */
export function clearLoadCache() { pages.clear(); cacheClearers.forEach((fn) => fn()); }
/** Restore this user's saved pages; call before the workspace renders. */
export const hydrateLoadCache = (userId: string) => pages.hydrate(userId, __BUILD_ID__);

// Several open components often ask for the same thing at once (the project
// picker, say); they share one request instead of each sending their own.
// A request sent before the latest save is never reused: it may predate the change.
const inFlight = new Map<string, { p: Promise<unknown>; saves: number }>();
function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!key) return load();
  const running = inFlight.get(key);
  if (running && running.saves === saves) return running.p as Promise<T>;
  const entry = { p: load(), saves };
  inFlight.set(key, entry);
  void entry.p.finally(() => { if (inFlight.get(key) === entry) inFlight.delete(key); }).catch(() => {});
  return entry.p as Promise<T>;
}

/**
 * Load data for a page. The last result is shown at once on later visits (and
 * after a browser reload) while a fresh copy loads, and the page reloads after
 * saves that touch the tables its loader reads (see pageCache.ts).
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const source = load.toString();
  const key = pages.cacheKey(source, deps);
  const [data, setData] = useState<T | undefined>(() => pages.peek(key) as T | undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => !pages.has(key));
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  keyRef.current = key;
  const readsRef = useRef<Groups>(null);
  readsRef.current = groupsRead(source);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    // Only the newest request may write: a slow earlier one (say, the previous
    // id when switching quickly) must not overwrite what is now on screen.
    const mine = ++seq.current;
    const k = keyRef.current;
    try {
      const value = await shared(k, () => loadRef.current());
      if (mine !== seq.current) return;
      pages.put(k, value);
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
    if (pages.has(keyRef.current)) { setData(pages.peek(keyRef.current) as T); setLoading(false); }
    else setLoading(true);
    void reload();
    const on = (e: Event) => { if (affects(readsRef.current, changedGroups(e))) void reload(); };
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

