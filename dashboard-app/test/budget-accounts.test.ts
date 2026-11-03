import assert from "node:assert/strict";
import { test } from "node:test";
import { inBase, loadFxOn, needsFx, rateFromBase, type Fx } from "../src/extended/lib/fx.ts";
import { accountLabel, balanceMap, deleteAccountError, selectableAccounts } from "../src/extended/modules/budget/accounts.ts";

const fx: Fx = { base: "INR", date: "2026-11-03", rates: { sek: 0.1135, usd: 0.0119 } }; // 1 INR = 0.1135 SEK

test("rateFromBase: units of the base currency per one unit of the other", () => {
  assert.ok(Math.abs(rateFromBase("SEK", fx)! - 1 / 0.1135) < 1e-9);
  assert.equal(rateFromBase("INR", fx), 1);
  assert.equal(rateFromBase("XXX", fx), null);
});
test("inBase prefers the amount saved with the transaction, then the live estimate", () => {
  assert.equal(inBase({ amount: 100, currency: "INR" }, "INR", null), 100);
  assert.equal(inBase({ amount: 200, currency: "SEK", base_currency: "INR", base_amount: 1650 }, "INR", fx), 1650);
  assert.equal(inBase({ amount: 200, currency: "SEK", base_currency: "INR", base_amount: 1650 }, "INR", null), 1650);
  assert.equal(inBase({ amount: 200, currency: "SEK" }, "INR", fx), 1762.11); // 200 / 0.1135
  assert.equal(inBase({ amount: 200, currency: "SEK" }, "INR", null), null);
  // a value saved against another default currency is not reused
  assert.equal(inBase({ amount: 200, currency: "SEK", base_currency: "EUR", base_amount: 18 }, "INR", fx), 1762.11);
});
test("needsFx only when something has no saved value in the base currency", () => {
  assert.equal(needsFx([{ amount: 1, currency: "INR" }], "INR"), false);
  assert.equal(needsFx([{ amount: 1, currency: "SEK", base_currency: "INR", base_amount: 8 }], "INR"), false);
  assert.equal(needsFx([{ amount: 1, currency: "SEK" }], "INR"), true);
});
test("loadFxOn asks for the transaction's own date, then falls back to the latest rates", async () => {
  const urls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string) => {
    urls.push(String(u));
    if (String(u).includes("@2026-01-05")) return { ok: true, json: async () => ({ date: "2026-01-05", inr: { sek: 0.12 } }) };
    if (String(u).includes("@2025-01-01") || String(u).includes("2025-01-01.currency")) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ date: "2026-11-03", inr: { sek: 0.1135 } }) };
  }) as never;
  try {
    const hit = await loadFxOn("INR", "2026-01-05");
    assert.equal(hit?.exact, true);
    assert.equal(hit?.fx.date, "2026-01-05");
    assert.ok(urls[0].includes("currency-api@2026-01-05/v1/currencies/inr.json"));
    const miss = await loadFxOn("INR", "2025-01-01");
    assert.equal(miss?.exact, false);
    assert.equal(miss?.fx.rates.sek, 0.1135);
  } finally { globalThis.fetch = real; }
});
test("account helpers", () => {
  assert.equal(accountLabel({ name: "Salary", bank_name: "HDFC Bank" }), "HDFC Bank · Salary");
  assert.equal(accountLabel({ name: "Cash", bank_name: " " }), "Cash");
  const list = [{ id: "a", archived_at: null }, { id: "b", archived_at: "2026-01-01" }] as never[];
  assert.deepEqual(selectableAccounts(list).map((x: { id: string }) => x.id), ["a"]);
  assert.deepEqual(selectableAccounts(list, "b").map((x: { id: string }) => x.id), ["a", "b"]);
  assert.equal(balanceMap([{ account_id: "a", balance: "12.50" }]).get("a"), 12.5);
  assert.match(deleteAccountError('violates foreign key constraint "ws_transactions_account_id_fkey"'), /Archive it instead/);
  assert.equal(deleteAccountError("Authentication required"), "Authentication required");
});
