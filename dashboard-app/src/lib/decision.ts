/** Persisted inside opportunities.score_breakdown.context.brief (version 2).
 * Keep this display contract aligned with pipeline/src/enrich/assessment.ts. */
export type Basis = "listing" | "source" | "general" | "estimate" | "unknown";
export interface Claim { text: string; basis: Basis; source_ids: number[] }
export interface MoneyRange { low: number; high: number; basis: Basis; source_ids: number[]; note: string }
export interface AssessmentPreferences {
 interests: string[]; avoid: string[]; nationality: string; residence: string;
 household: number; housing: "shared" | "private"; careerGoal: string;
}
export const moneyKeys = ["gross", "deductions", "rent", "essentials", "upfront"] as const;
export type MoneyKey = typeof moneyKeys[number];
export interface DecisionBrief {
 version: number;
 preferences: AssessmentPreferences;
 fit: { verdict: "direct" | "transferable" | "weak" | "unknown"; reason: string; strengths: string[]; gaps: string[] };
 sections: Record<string, Claim>;
 money: Record<MoneyKey, MoneyRange | null> & { currency: string | null; contract_percent: number | null; salary_basis: string; assumptions: string[] };
 questions: string[]; next_steps: string[];
}
export interface Range { low: number; high: number }
export const validRange = (r: Range | null | undefined): r is Range => Boolean(r && Number.isFinite(r.low) && Number.isFinite(r.high) && r.low >= 0 && r.high >= r.low);
/** Unknown is never zero. Bounds deliberately pair lower income with higher
 * costs; upfront relocation is kept separate from recurring savings. */
export function calculateBudget(input: Record<MoneyKey, Range | null>) {
 const { gross, deductions, rent, essentials, upfront } = input;
 const net = validRange(gross) && validRange(deductions) && deductions.high <= gross.high
  ? { low: gross.low - deductions.high, high: gross.high - deductions.low } : null;
 const savings = net && validRange(rent) && validRange(essentials)
  ? { low: net.low - rent.high - essentials.high, high: net.high - rent.low - essentials.low } : null;
 // First year assumes 12 months of the SAME contract, never a promised extension.
 const firstYear = savings && validRange(upfront)
  ? { low: savings.low * 12 - upfront.high, high: savings.high * 12 - upfront.low } : null;
 return { net, savings, firstYear };
}
export function parseBudgetRange(low: string, high: string): Range | null {
 if (!low.trim() || !high.trim()) return null;
 const range = { low: Number(low), high: Number(high) };
 return validRange(range) ? range : null;
}
export const fitLabels = { direct: "Direct research fit", transferable: "Transferable fit", weak: "Weak research fit", unknown: "Fit not assessed" };
export function includeResearchFit(verdict: string | undefined, filter: string): boolean {
 if (filter === "relevant") return verdict === "direct" || verdict === "transferable";
 if (filter === "pending") return !verdict || verdict === "unknown";
 if (filter === "weak") return verdict === "weak";
 return true;
}
