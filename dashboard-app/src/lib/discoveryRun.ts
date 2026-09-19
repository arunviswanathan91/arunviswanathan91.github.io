import type { Row } from "../entities/types";

export type InteractiveRunMode = "discovery" | "search";

export interface DiscoveryRunItemRow {
 opportunity_id: string | null;
 score: number | null;
 metadata: unknown;
}

export interface DiscoveryRunItem {
 id: string;
 score: number | null;
 fitReason: string | null;
 scoreBreakdown: Record<string, unknown> | null;
}

export interface DiscoveryRunScope {
 runId: string;
 mode: InteractiveRunMode;
 query: string | null;
 items: DiscoveryRunItem[];
}

const record = (value: unknown): Record<string, unknown> | null =>
 value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

/** Build one deterministic result set from the audit ledger. A vacancy may be
 * seen by several crawlers in the same run, so the highest run score wins. */
export function buildDiscoveryRunScope(
 runId: string, mode: InteractiveRunMode, query: string | null, rows: DiscoveryRunItemRow[],
): DiscoveryRunScope {
 const byOpportunity = new Map<string, DiscoveryRunItem>();
 for (const row of rows) {
  if (!row.opportunity_id) continue;
  const metadata = record(row.metadata);
  const next: DiscoveryRunItem = {
   id: row.opportunity_id,
   score: Number.isFinite(Number(row.score)) ? Number(row.score) : null,
   fitReason: typeof metadata?.fit_reason === "string" ? metadata.fit_reason : null,
   scoreBreakdown: record(metadata?.score_breakdown),
  };
  const current = byOpportunity.get(next.id);
  if (!current || (next.score ?? -1) > (current.score ?? -1)) byOpportunity.set(next.id, next);
 }
 return {
  runId, mode, query,
  items: [...byOpportunity.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
 };
}

/** Apply run-specific ranking without replacing durable opportunity data or
 * the AI context already saved on the canonical row. */
export function applyDiscoveryRunScope(rows: Row[], scope: DiscoveryRunScope | null): Row[] {
 if (!scope) return rows;
 const byId = new Map(scope.items.map(item => [item.id, item]));
 return rows.filter(row => byId.has(row.id)).map(row => {
  const item = byId.get(row.id)!;
  const globalBreakdown = record(row.score_breakdown) ?? {};
  return {
   ...row,
   ...(item.score === null ? {} : { match_score: item.score }),
   ...(item.fitReason ? { fit_reason: item.fitReason } : {}),
   ...(item.scoreBreakdown ? { score_breakdown: { ...globalBreakdown, ...item.scoreBreakdown } } : {}),
  };
 });
}
