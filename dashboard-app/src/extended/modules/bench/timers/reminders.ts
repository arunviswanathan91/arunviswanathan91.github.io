// Telegram backup for timers. A running timer has a row in the core `reminders` table due at
// its end time; the server job that delivers reminders sends it to Telegram, which is what
// reaches a locked phone or a closed app. Everything here fails quietly: a timer must keep
// working with no connection, signed out, or with the database refusing the write.
import { supabase } from "../../../../lib/supabase";
import type { WantedReminder } from "./logic.ts";

const keyOf = (timerId: string) => `timer:${timerId}`;

let userId: string | null = null;
/** The signed-in user the rows belong to (set by the host; null stops all writes). */
export function setReminderUser(id: string | null) { userId = id; }

// One write at a time, in order: a row is deleted before it is written again with a new time
// (there is one row per user and key), and a pause straight after a start cannot overtake it.
let queue: Promise<void> = Promise.resolve();
function enqueue(job: () => Promise<void>) {
  queue = queue.then(job).catch(() => { /* offline or refused: the in-app alert still works */ });
}

async function removeRow(uid: string, timerId: string) {
  await supabase?.from("reminders").delete().eq("user_id", uid).eq("nudge_key", keyOf(timerId));
}

export function removeReminder(timerId: string) {
  const uid = userId;
  if (!supabase || !uid) return;
  enqueue(() => removeRow(uid, timerId));
}

export function putReminder(timerId: string, wanted: WantedReminder) {
  const uid = userId;
  if (!supabase || !uid) return;
  enqueue(async () => {
    await removeRow(uid, timerId);
    await supabase?.from("reminders").insert({ user_id: uid, title: wanted.title, body: wanted.body, remind_at: new Date(wanted.at).toISOString(), done: false, nudge_key: keyOf(timerId) });
  });
}

/** Rows left behind by timers that were never acknowledged on this device (a cleared
 *  browser, another phone): drop those more than a day past. */
export function removeStaleReminders() {
  const uid = userId;
  if (!supabase || !uid) return;
  enqueue(async () => {
    await supabase?.from("reminders").delete().eq("user_id", uid).like("nudge_key", "timer:%").lt("remind_at", new Date(Date.now() - 86_400_000).toISOString());
  });
}
