import { test } from "node:test";
import assert from "node:assert/strict";
import { affects, cacheKey, clear, groupsOfTable, groupsRead, hydrate, peek, persist, put, toSafeJson } from "../src/extended/lib/pageCache.ts";

const set = (...g: string[]) => new Set(g);

test("a save names the groups its table belongs to", () => {
  assert.deepEqual(groupsOfTable("habit_checkins"), set("habits"));
  assert.deepEqual(groupsOfTable("contacts"), set("money", "work"));
  // Unknown table or no table: every page reloads.
  assert.equal(groupsOfTable("settings"), null);
  assert.equal(groupsOfTable(), null);
});

test("a loader's groups come from the table names in its source, minified or not", () => {
  const src = `async()=>{const[a,b]=await Promise.all([e("habits",{order:[["position"]]}),e("habit_checkins",{gte:["day",t]})]);return{a,b}}`;
  assert.deepEqual(groupsRead(src), set("habits"));
  assert.deepEqual(groupsRead(`()=>r("account_balances")`), set("money"));
  // Column names and values are ignored.
  assert.deepEqual(groupsRead(`()=>l("tasks",{eq:{status:"done"},order:[["due_date"]]})`), set("work"));
});

test("a loader that is uncertain reloads on every save", () => {
  assert.equal(groupsRead(`()=>r("agenda",{p_from:a,p_to:b})`), null); // database function reads anything
  assert.equal(groupsRead(`()=>l("tasks").then(()=>r("search_workspace",{q}))`), null);
  assert.equal(groupsRead(`()=>loadEverything()`), null); // names no table
});

test("a page reloads only when a save touches a group it reads", () => {
  assert.equal(affects(set("habits"), set("money")), false);
  assert.equal(affects(set("habits", "work"), set("work")), true);
  assert.equal(affects(null, set("money")), true);
  assert.equal(affects(set("habits"), null), true);
});

test("cache keys are short, stable and depend on deps", () => {
  const a = cacheKey("()=>l(\"tasks\")", [1]);
  assert.equal(a, cacheKey("()=>l(\"tasks\")", [1]));
  assert.notEqual(a, cacheKey("()=>l(\"tasks\")", [2]));
  assert.ok(a.length < 30);
});

test("only values that survive JSON unchanged are saved", () => {
  assert.equal(toSafeJson({ a: [1, { b: "x" }], c: null }), '{"a":[1,{"b":"x"}],"c":null}');
  assert.equal(toSafeJson({ m: new Map() }), undefined);
  assert.equal(toSafeJson({ d: new Date(0) }), undefined);
  assert.equal(toSafeJson([new (class X {})()]), undefined);
});

test("saved pages come back for the same user and build only", () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    hydrate("u1", "b1");
    put("k1", { rows: [1, 2] });
    put("k2", { m: new Map() }); // kept in memory, never written
    persist();
    clear();
    assert.equal(store.size, 0, "clear removes the saved copy");

    hydrate("u1", "b1");
    put("k1", { rows: [1, 2] });
    persist();
    // Simulate a fresh page load: memory empty, storage kept.
    const saved = store.get("ws.pages.v1")!;
    clear(); store.set("ws.pages.v1", saved);
    hydrate("u1", "b1");
    assert.deepEqual(peek("k1"), { rows: [1, 2] });

    clear(); store.set("ws.pages.v1", saved);
    hydrate("u2", "b1"); // another account
    assert.equal(peek("k1"), undefined);
    assert.equal(store.size, 0);

    store.set("ws.pages.v1", saved);
    hydrate("u1", "b2"); // newer build
    assert.equal(peek("k1"), undefined);
  } finally {
    clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
