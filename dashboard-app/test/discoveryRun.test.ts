import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDiscoveryRunScope, buildDiscoveryRunScope } from "../src/lib/discoveryRun.ts";

test("run scope keeps only linked results and deduplicates crawler sightings", () => {
 const scope = buildDiscoveryRunScope("run-1", "search", "cancer postdoc", [
  { opportunity_id: "opp-1", score: 61, metadata: { fit_reason: "first" } },
  { opportunity_id: null, score: 99, metadata: {} },
  { opportunity_id: "opp-1", score: 78, metadata: { fit_reason: "best" } },
  { opportunity_id: "opp-2", score: 55, metadata: {} },
 ]);
 assert.deepEqual(scope.items.map(item => [item.id, item.score]), [["opp-1", 78], ["opp-2", 55]]);
 assert.equal(scope.items[0]?.fitReason, "best");
});

test("run ranking overlays the view while preserving canonical AI context", () => {
 const scope = buildDiscoveryRunScope("run-1", "search", "cancer postdoc", [{
  opportunity_id: "opp-1", score: 82,
  metadata: { fit_reason: "Query 40/45", score_breakdown: { topic: { value: 40 } } },
 }]);
 const rows = applyDiscoveryRunScope([
  { id: "opp-1", match_score: 44, fit_reason: "Profile score", score_breakdown: { topic: { value: 10 }, context: { brief: { version: 4 } } } },
  { id: "opp-2", match_score: 90, score_breakdown: {} },
 ], scope);
 assert.equal(rows.length, 1);
 assert.equal(rows[0]?.match_score, 82);
 assert.equal(rows[0]?.fit_reason, "Query 40/45");
 assert.deepEqual(rows[0]?.score_breakdown.context, { brief: { version: 4 } });
 assert.deepEqual(rows[0]?.score_breakdown.topic, { value: 40 });
});

test("clearing a run scope restores the complete canonical list", () => {
 const rows = [{ id: "opp-1" }, { id: "opp-2" }];
 assert.equal(applyDiscoveryRunScope(rows, null), rows);
});
