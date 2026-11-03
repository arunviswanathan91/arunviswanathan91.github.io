import type { SavingsAccount } from "../../lib/types.ts";

/** "SEB · Sparkonto" (the bank is optional). */
export function accountLabel(a: Pick<SavingsAccount, "name" | "bank_name">): string {
  return [a.bank_name?.trim(), a.name.trim()].filter(Boolean).join(" · ");
}

/** Accounts a new transaction can use: active ones, plus the one it already has even if archived. */
export function selectableAccounts(accounts: SavingsAccount[], keepId?: string | null): SavingsAccount[] {
  return accounts.filter((a) => !a.archived_at || a.id === keepId);
}

/** Balances come back from the database as numbers-in-strings. */
export function balanceMap(rows: { account_id: string; balance: number | string }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.account_id, Number(r.balance)]));
}

/** What a failed delete means to the user: accounts with transactions can only be archived. */
export function deleteAccountError(message: string): string {
  return /foreign key|violates|restrict/i.test(message) ? "This account has transactions, so it can’t be deleted. Archive it instead." : message;
}
