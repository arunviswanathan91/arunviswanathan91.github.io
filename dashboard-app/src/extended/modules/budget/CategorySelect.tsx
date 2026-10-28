import { useState } from "react";
import { insert, update } from "../../lib/db.ts";
import type { BudgetCategory } from "../../lib/types.ts";

const NEW = "__new__";

/**
 * A budget category picker with "+ New category…" at the bottom: the typed name is created (or an
 * existing one with that name reused, unarchived if needed) and selected straight away.
 */
export function CategorySelect({ value, categories, kind = "expense", onChange, className, label = "Category", emptyLabel = "Uncategorised" }: {
  value: string | null | undefined;
  categories: BudgetCategory[];
  kind?: "income" | "expense";
  onChange: (id: string | null) => void;
  className?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const options = categories.filter((c) => c.kind === kind && (!c.archived_at || c.id === value));
  const missing = value && !options.some((c) => c.id === value) ? (created?.id === value ? created : { id: value, name: "…" }) : null;

  async function pick(v: string) {
    if (v !== NEW) return onChange(v || null);
    const name = prompt(`New ${kind === "income" ? "income" : "spending"} category name`)?.trim();
    if (!name) return;
    try {
      const existing = categories.find((c) => c.kind === kind && c.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        if (existing.archived_at) await update("budget_categories", existing.id, { archived_at: null });
        return onChange(existing.id);
      }
      const row = await insert<BudgetCategory>("budget_categories", { name, kind });
      setCreated({ id: row.id, name: row.name });
      onChange(row.id);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <select className={className} aria-label={label} value={value ?? ""} onChange={(e) => void pick(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      {missing && <option value={missing.id}>{missing.name}</option>}
      <option value={NEW}>+ New category…</option>
    </select>
  );
}
