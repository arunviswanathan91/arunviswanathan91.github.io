import { insert, list, useLoad } from "../../lib/db.ts";

export interface Person { id: string; name: string }

const NEW = "__new__";

/** People (not banks or lenders) for "who was this for", each name once. */
export function usePeople(): Person[] {
  const { data = [] } = useLoad(async () => {
    const [contacts, lenders] = await Promise.all([
      list<Person>("contacts", { order: [["name"]] }),
      list<{ contact_id: string }>("loans", { in: ["account_type", ["bank", "credit_card"]] }),
    ]);
    const banks = new Set(lenders.map((l) => l.contact_id));
    const seen = new Set<string>();
    return contacts.filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (banks.has(c.id) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);
  return data;
}

/** "For: Me / Justin / + New person…". A new name is reused if it already exists. */
export function ForSelect({ value, people, onChange, label = "For" }: { value: string | null | undefined; people: Person[]; onChange: (id: string | null) => void; label?: string }) {
  async function pick(v: string) {
    if (v !== NEW) return onChange(v || null);
    const name = prompt("Who was this for? (e.g. Justin)")?.trim();
    if (!name) return;
    const existing = people.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    onChange(existing ? existing.id : (await insert<Person>("contacts", { name })).id);
  }
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => void pick(e.target.value)}>
      <option value="">Me</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      {value && !people.some((p) => p.id === value) && <option value={value}>Someone else</option>}
      <option value={NEW}>+ New person…</option>
    </select>
  );
}
