import { useEffect, useState } from "react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { list, update, useLoad } from "../../lib/db.ts";
import { today } from "../../lib/dates.ts";
import type { Habit, HabitCheckin, Paper } from "../../lib/types.ts";
import { logAmount } from "../habits/HabitsView.tsx";
import { readingHabit } from "./reading.ts";

interface Clock {
  /** Epoch ms when the current run started; null while paused. */
  startedAt: number | null;
  /** Time already counted from earlier runs. */
  elapsed: number;
}

const key = (paperId: string) => `ws:reading:${paperId}`;
const read = (paperId: string): Clock => {
  try {
    const raw = localStorage.getItem(key(paperId));
    if (raw) return JSON.parse(raw) as Clock;
  } catch { /* storage unavailable */ }
  return { startedAt: null, elapsed: 0 };
};
const write = (paperId: string, c: Clock) => {
  try {
    if (!c.startedAt && !c.elapsed) localStorage.removeItem(key(paperId));
    else localStorage.setItem(key(paperId), JSON.stringify(c));
  } catch { /* ignore */ }
};

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Times a reading session (kept across reloads) and adds the minutes to a reading habit for today. */
export function ReadingTimer({ paper }: { paper: Paper }) {
  const { data: habits } = useLoad(() => list<Habit>("habits", { order: [["position"]] }), []);
  const [clock, setClock] = useState<Clock>(() => read(paper.id));
  const [, tick] = useState(0);
  const [habitId, setHabitId] = useState("");
  const [msg, setMsg] = useState("");
  const minutesHabits = (habits ?? []).filter((h) => !h.archived_at && h.target && /^min/i.test(h.unit ?? ""));
  const chosen = minutesHabits.find((h) => h.id === habitId) ?? readingHabit(habits ?? []);
  const elapsed = clock.elapsed + (clock.startedAt ? Date.now() - clock.startedAt : 0);

  useEffect(() => {
    if (!clock.startedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [clock.startedAt]);

  const set = (c: Clock) => {
    setClock(c);
    write(paper.id, c);
  };

  async function stop() {
    const minutes = Math.max(1, Math.round(elapsed / 60000));
    set({ startedAt: null, elapsed: 0 });
    if (!chosen) {
      setMsg(`Read ${minutes} min. Add a habit measured in minutes (e.g. “Read”, 30 min) to log it automatically.`);
      return;
    }
    try {
      const day = today();
      const [row] = await list<HabitCheckin>("habit_checkins", { eq: { habit_id: chosen.id, day } });
      const before = row ? row.amount ?? chosen.target ?? 0 : 0;
      await logAmount(chosen.id, day, Number(before) + minutes);
      if (paper.status === "to_read") await update("papers", paper.id, { status: "reading", started_on: paper.started_on ?? day });
      setMsg(`Logged ${minutes} min to ${chosen.name} (today: ${Number(before) + minutes} min).`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="card pad reading-timer">
      <h3><Timer size={14} /> Reading timer</h3>
      <div className="reading-clock" aria-live="polite">{fmt(elapsed)}</div>
      <div className="row wrap">
        {clock.startedAt ? (
          <button onClick={() => set({ startedAt: null, elapsed })}><Pause size={14} /> Pause</button>
        ) : (
          <button className="primary" onClick={() => { setMsg(""); set({ startedAt: Date.now(), elapsed: clock.elapsed }); }}><Play size={14} /> {elapsed ? "Resume" : "Start"}</button>
        )}
        {elapsed >= 1000 && <button onClick={() => void stop()}><Square size={13} /> Stop &amp; log</button>}
      </div>
      {minutesHabits.length > 1 && (
        <label className="field">
          <span>Log to</span>
          <select value={chosen?.id ?? ""} onChange={(e) => setHabitId(e.target.value)}>
            {minutesHabits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}
      {minutesHabits.length === 1 && <p className="muted small">Logs to “{chosen?.name}”.</p>}
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}
