import { supabase } from "../../lib/supabase.ts";
import type { Contact, Loan } from "./balance.ts";
export { findByName, uniqueByName } from "./balance.ts";

/** Names with no loans and no meetings: left behind by deleted loans. Meetings share these names, so they are kept. */
export async function unusedContacts(contacts: Contact[], loans: Loan[]): Promise<Contact[]> {
  if (!supabase) return [];
  const candidates = contacts.filter((c) => !loans.some((l) => l.contact_id === c.id));
  if (!candidates.length) return [];
  const { data, error } = await supabase.from("meeting_participants").select("contact_id").in("contact_id", candidates.map((c) => c.id));
  if (error) throw new Error(error.message);
  const inMeetings = new Set((data ?? []).map((r: { contact_id: string }) => r.contact_id));
  return candidates.filter((c) => !inMeetings.has(c.id));
}

export async function deleteContacts(ids: string[]): Promise<void> {
  if (!supabase || !ids.length) return;
  const { error } = await supabase.from("contacts").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
