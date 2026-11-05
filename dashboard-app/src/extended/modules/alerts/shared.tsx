import { useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import { supabase as original } from "../../../lib/supabase";
import { emitChange } from "../../lib/db.ts";
import { saveSettings } from "../../lib/settings.ts";
import type { Settings } from "../../lib/types.ts";

/** Until supabase/alerts.sql has been run, say so instead of showing a database error. */
export const alertsSetupError = (error: string) =>
  /ws_paper_alerts|ws_funding_calls|paper_alert_topics|funding_topics|briefing_time|schema cache|does not exist/i.test(error)
    ? "This needs its database tables: run supabase/alerts.sql in the Supabase SQL Editor, then reload." : error;

/** Run the daily check now (papers and funding), through the research-alerts Edge Function. */
export async function checkNow(): Promise<string> {
  if (!original) return "Not connected.";
  const { data, error } = await original.functions.invoke<{ ok: boolean; papers: number; funding: number; errors: string[]; error?: string }>("research-alerts", { body: {} });
  if (error) return /not found|404|Failed to send/i.test(error.message) ? "The research-alerts function is not deployed yet; it deploys with the next push to main." : error.message;
  if (!data?.ok) return data?.error ?? "The check did not finish.";
  emitChange();
  const found = `Found ${data.papers} new paper${data.papers === 1 ? "" : "s"} and ${data.funding} new funding call${data.funding === 1 ? "" : "s"}.`;
  return data.errors?.length ? `${found} Some sources failed: ${data.errors.join("; ")}` : found;
}

/** Editable list of topic lines (or feed URLs), saved to settings. */
export function TopicsEditor({ field, values, placeholder, hint, onError }: { field: keyof Pick<Settings, "paper_alert_topics" | "funding_topics" | "funding_feeds">; values: string[]; placeholder: string; hint: React.ReactNode; onError: (e: string) => void }) {
  // Follow the saved list (it arrives after the first render); a local copy only while a save is in flight.
  const [pending, setPending] = useState<string[] | null>(null);
  const list = pending ?? values;
  const [draft, setDraft] = useState("");
  const save = async (next: string[]) => {
    setPending(next); onError("");
    try { await saveSettings({ [field]: next } as Partial<Settings>); }
    catch (e) { onError(alertsSetupError((e as Error).message)); }
    finally { setPending(null); }
  };
  return (
    <div className="topics-editor">
      <ul className="topic-chips">
        {list.map((t, i) => (
          <li key={`${t}-${i}`}><span>{t}</span><button className="icon" aria-label={`Remove ${t}`} onClick={() => void save(list.filter((_, k) => k !== i))}><X size={13} /></button></li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v && !list.includes(v)) void save([...list, v]); setDraft(""); }}>
        <input aria-label="Add" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" disabled={!draft.trim()}><Plus size={14} /> Add</button>
      </form>
      <p className="muted small">{hint}</p>
    </div>
  );
}

export function CheckNowButton({ onResult }: { onResult: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={() => { setBusy(true); void checkNow().then(onResult).finally(() => setBusy(false)); }}>
      <RefreshCw size={14} className={busy ? "spin" : ""} /> {busy ? "Checking…" : "Check now"}
    </button>
  );
}
