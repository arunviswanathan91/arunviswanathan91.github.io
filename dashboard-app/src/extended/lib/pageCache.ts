// What the workspace pages remember between visits, and which pages a save affects.
//
// 1. Each page loader's last result is kept (in memory, and in localStorage per
//    user), so opening a page again, or reloading the browser, draws it at once
//    while a fresh copy loads in the background.
// 2. Every save says which table it wrote. A page reloads only when that table
//    is in the same group as one it reads. Groups (not single tables) because
//    database triggers write across tables: a task update can change reminders
//    and follow-ups, a transaction can change loan reminders, and so on.
//
// Anything uncertain falls back to the old behaviour, reloading on every save:
// a loader whose source names no known table (it calls a database function or
// a helper), or a save that names no table.

/** Tables that change together, directly or through triggers. A table may sit in several. */
export const GROUPS: Record<string, readonly string[]> = {
  money: ["goals", "trips", "transactions", "budget_categories", "monthly_budgets", "savings_accounts", "recurring", "loans", "loan_payments", "contacts"],
  work: [
    "tasks", "projects", "papers", "project_papers", "deadlines", "notes", "experiments", "thesis", "thesis_chapters", "thesis_feedback", "goals", "trips", "paper_alerts", "funding_calls", "meetings", "meeting_projects",
    "meeting_action_items", "meeting_participants", "attachments", "publications", "publication_stage_events", "contacts",
  ],
  habits: ["habits", "habit_checkins"],
  resumes: ["resumes"],
};
/** Database functions whose reads are known to stay inside a group. Others mean "everything". */
const RPC_GROUPS: Record<string, string> = { account_balances: "money" };

/** null means "every group": reload on any save (or a save that touches anything). */
export type Groups = ReadonlySet<string> | null;

const tableGroups = new Map<string, string[]>();
for (const [g, tables] of Object.entries(GROUPS)) for (const t of tables) tableGroups.set(t, [...(tableGroups.get(t) ?? []), g]);

/** Groups a write to `table` affects; null (everything) for a table outside the map. */
export function groupsOfTable(table?: string): Groups {
  const g = table ? tableGroups.get(table) : undefined;
  return g ? new Set(g) : null;
}

/** Database functions the app calls whose reads span groups: a loader using one reloads on every save. */
const WIDE_RPCS = new Set(["agenda", "all_tags", "search_workspace", "backup_data"]);

/**
 * Groups a loader reads, from the string literals in its source (table names
 * survive minification). Other literals, such as column names, simply match
 * nothing. Matching too much only costs an extra reload; the risk is matching
 * too little, so a loader naming no known table, or calling a wide database
 * function, gets null: reload on every save.
 */
export function groupsRead(source: string): Groups {
  const found = new Set<string>();
  for (const m of source.matchAll(/["'`]([a-z_]+)["'`]/g)) {
    const name = m[1];
    if (WIDE_RPCS.has(name)) return null;
    for (const g of tableGroups.get(name) ?? []) found.add(g);
    if (RPC_GROUPS[name]) found.add(RPC_GROUPS[name]);
  }
  return found.size ? found : null;
}

/** Whether a page reading `reads` should reload after a save touching `changed`. */
export function affects(reads: Groups, changed: Groups): boolean {
  if (!reads || !changed) return true;
  for (const g of changed) if (reads.has(g)) return true;
  return false;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const LIMIT = 150;
const cache = new Map<string, unknown>();

/** Short stable key for a loader: its source plus its deps (FNV-1a, 52 bits). */
export function cacheKey(source: string, deps: unknown[]): string {
  let text: string;
  try { text = `${source}|${JSON.stringify(deps)}`; } catch { return ""; }
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${(h2 & 0xfffff).toString(36)}:${text.length}`;
}

export const peek = (key: string) => cache.get(key);
export const has = (key: string) => !!key && cache.has(key);
export function put(key: string, value: unknown) {
  if (!key) return;
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value as string);
  schedulePersist();
}

// ── Saved copy in the browser ──────────────────────────────────────────────

const STORE = "ws.pages.v1";
const MAX_BYTES = 3_500_000; // localStorage holds ~5 MB per site; leave room for the sign-in token
let user = "";
let build = "";
let timer: ReturnType<typeof setTimeout> | undefined;

const storage = (): Storage | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

/** JSON that comes back exactly as it went in, or undefined if it would not (Map, Date, class instances…). */
export function toSafeJson(value: unknown): string | undefined {
  let ok = true;
  const text = JSON.stringify(value, function (this: Record<string, unknown>, k, v) {
    const raw = this[k];
    if (raw instanceof Date || raw instanceof Map || raw instanceof Set || typeof raw === "function") ok = false;
    else if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null) ok = false;
    return v;
  });
  return ok ? text : undefined;
}

/** Load this user's saved pages. Call once per sign-in, before the pages render. */
let listening = false;
export function hydrate(userId: string, buildId: string) {
  user = userId; build = buildId;
  if (!listening && typeof window !== "undefined") {
    listening = true;
    // Write anything still waiting on the timer when the tab closes or is hidden.
    window.addEventListener("pagehide", () => { if (timer) { clearTimeout(timer); persist(); } });
  }
  const s = storage(); if (!s) return;
  try {
    const raw = s.getItem(STORE);
    if (!raw) return;
    const saved = JSON.parse(raw) as { user: string; build: string; entries: [string, unknown][] };
    // Another account, or an older version of the app (its loaders, and so its keys, differ).
    if (saved.user !== userId || saved.build !== buildId) { s.removeItem(STORE); return; }
    for (const [k, v] of saved.entries) if (!cache.has(k)) cache.set(k, v);
  } catch { s.removeItem(STORE); }
}

function schedulePersist() {
  if (!user || timer) return;
  timer = setTimeout(persist, 1200);
}

export function persist() {
  timer = undefined;
  const s = storage(); if (!s || !user) return;
  // Newest last in the Map; keep the newest entries that fit under the size cap.
  const parts: string[] = [];
  let bytes = 0;
  for (const [k, v] of [...cache.entries()].reverse()) {
    const json = toSafeJson(v);
    if (json === undefined || json.length > MAX_BYTES / 4) continue;
    if (bytes + json.length > MAX_BYTES) break;
    parts.unshift(`[${JSON.stringify(k)},${json}]`);
    bytes += json.length;
  }
  try {
    s.setItem(STORE, `{"user":${JSON.stringify(user)},"build":${JSON.stringify(build)},"entries":[${parts.join(",")}]}`);
  } catch {
    try { s.removeItem(STORE); } catch { /* storage full or blocked: memory cache still works */ }
  }
}

/** Forget everything, in memory and in the browser (sign-out). */
export function clear() {
  cache.clear();
  if (timer) clearTimeout(timer);
  timer = undefined;
  user = "";
  try { storage()?.removeItem(STORE); } catch { /* ignore */ }
}
