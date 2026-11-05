import { useState } from "react";
import { saveSettings, useSettings } from "../../lib/settings.ts";
import { alertsSetupError } from "./shared.tsx";

/** Settings → Telegram: the time of the morning briefing (or off). */
export function BriefingSetting({ linked }: { linked: boolean }) {
  const settings = useSettings();
  const current = settings.briefing_time?.slice(0, 5) ?? "";
  const [time, setTime] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const value = time ?? current;
  async function save(next: string | null) {
    setTime(next ?? ""); setMsg("");
    try {
      await saveSettings({ briefing_time: next });
      setMsg(next ? `Every day at ${next} (${settings.timezone}).` : "Morning briefing is off.");
    } catch (e) { setMsg(alertsSetupError((e as Error).message)); }
  }
  return (
    <div className="briefing-setting">
      <h3>Morning briefing</h3>
      <p className="muted-note">
        A Telegram message each morning: tasks due and overdue, today’s meetings, deadlines in the next three days,
        experiments on the bench, new papers on your topics and funding calls closing soon.
      </p>
      <div className="row">
        <label className="briefing-toggle">
          <input type="checkbox" checked={!!value} disabled={!linked} onChange={(e) => void save(e.target.checked ? value || "07:30" : null)} /> Send it
        </label>
        <input type="time" className="input input-compact" aria-label="Briefing time" value={value} disabled={!linked || !value} onChange={(e) => e.target.value && void save(e.target.value)} />
      </div>
      {!linked && <p className="muted-note">Link Telegram above first.</p>}
      {msg && <p className="muted-note" role="status">{msg}</p>}
    </div>
  );
}
