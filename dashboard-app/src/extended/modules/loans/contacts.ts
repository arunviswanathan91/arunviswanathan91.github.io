import { supabase } from "../../lib/supabase.ts";
import type { Contact, Loan } from "./balance.ts";
export { findByName, uniqueByName } from "./balance.ts";

/** Names with no loans, meetings or friend spending: left behind by deleted loans. */
export async function unusedContacts(contacts: Contact[], loans: Loan[]): Promise<Contact[]> {
  if (!supabase) return [];
  const candidates = contacts.filter((c) => !loans.some((l) => l.contact_id === c.id));
  if (!candidates.length) return [];
  const ids = candidates.map((c) => c.id);
  const [meetings, spends] = await Promise.all([
    supabase.from("meeting_participants").select("contact_id").in("contact_id", ids),
    supabase.from("transactions").select("for_contact_id").in("for_contact_id", ids),
  ]);
  const error = meetings.error ?? spends.error;
  if (error) throw new Error(error.message);
  const used = new Set([
    ...(meetings.data ?? []).map((r: { contact_id: string }) => r.contact_id),
    ...(spends.data ?? []).map((r: { for_contact_id: string }) => r.for_contact_id),
  ]);
  return candidates.filter((c) => !used.has(c.id));
}

export async function deleteContacts(ids: string[]): Promise<void> {
  if (!supabase || !ids.length) return;
  const { error } = await supabase.from("contacts").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
