import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Bell, BellOff, Flag, ListOrdered, Pause, Play, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { ask, askText } from "../../../../lib/dialogs.tsx";
import { href, setQuery, useRoute, type Route } from "../../../lib/route.ts";
import { Empty, PageHeader, Tabs } from "../../../components/ui.tsx";
import { askNotifyPermission, notifyState, wakeLockSupported, type NotifyState } from "./alerts.ts";
import {
  QUICK_SECONDS, STOPWATCH_ZERO, TELEGRAM_MIN_SECONDS, TIMER_COLORS, addTime, clearFinished, describeSeconds, formatClock, formatElapsed, lapTimes, move, parseHms, pause,
  remaining, reset, sequenceInfo, splitHms, start, startAll, stopwatchElapsed, stopwatchLap, stopwatchStart, stopwatchStop, type Timer,
} from "./logic.ts";
import { removeStaleReminders } from "./reminders.ts";
import { addTimer, changeSettings, changeStopwatch, changeTimer, changeTimers, startTimers, useNow, useTimers } from "./store.ts";
import { SaveSetForm, TimerSets } from "./TimerSets.tsx";
import "./timers.css";

type Tab = "timers" | "stopwatch";

/** #/tools/bench/timers — countdown timers that keep running on every page, saved sets, and a stopwatch. */
export function TimersView(props: { route?: Route }) {
  const current = useRoute();
  const route = props.route ?? current;
  const tab: Tab = route.query.get("tab") === "stopwatch" ? "stopwatch" : "timers";
  const protocolId = route.query.get("protocol");
  const { timers, stopwatch, settings } = useTimers();
  const [saving, setSaving] = useState(false);
  // Reminder rows that were never cleared from this device (see reminders.ts).
  useEffect(removeStaleReminders, []);

  const canStart = timers.some((t) => t.status === "idle" || t.status === "paused");
  const finished = timers.filter((t) => t.status === "done").length;

  return (
    <section className="bt-page">
      <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
      <PageHeader title="Timers" subtitle="They keep running while you use the rest of the app, and alert you on any page." />
      <Tabs<Tab> value={tab} options={[["timers", "Timers"], ["stopwatch", "Stopwatch"]]} onChange={(v) => setQuery("tab", v === "timers" ? undefined : v)}
        counts={{ timers: timers.filter((t) => t.status === "running").length }} />

      {tab === "stopwatch" ? <StopwatchPanel running={stopwatch.startedAt !== null} /> : (
        <>
          {protocolId && (
            <p className="notice">
              New timer set for a protocol: add its timers below, then <button type="button" className="link" disabled={!timers.length} onClick={() => setSaving(true)}>save them as a set</button>. The protocol is already chosen.
            </p>
          )}
          <AddTimer />
          {timers.length === 0 ? (
            <Empty>No timers yet. Add one above, or start a saved set below.</Empty>
          ) : (
            <>
              <div className="bt-toolbar">
                <button type="button" className="bt-btn bt-primary" disabled={!canStart} onClick={() => startTimers(startAll)}><Play size={16} aria-hidden /> Start all</button>
                <button type="button" className="bt-btn" disabled={!finished} onClick={() => changeTimers(clearFinished)}>Clear finished{finished ? ` (${finished})` : ""}</button>
                <button type="button" className="bt-btn" onClick={() => setSaving(true)}><Save size={16} aria-hidden /> Save as set</button>
              </div>
              <TimerList timers={timers} />
            </>
          )}
          <TimerSets hasTimers={timers.length > 0} />
          <AlertSettings telegram={settings.telegram} keepAwake={settings.keepAwake} />
        </>
      )}
      {saving && <SaveSetForm timers={timers} protocolId={protocolId} onClose={() => setSaving(false)} onSaved={() => { setSaving(false); if (protocolId) setQuery("protocol", undefined); }} />}
    </section>
  );
}

// ── Adding ───────────────────────────────────────────────────────────────────

const chipLabel = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);

function AddTimer() {
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [s, setS] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const seconds = parseHms(h, m, s);
  const typed = !!(h.trim() || m.trim() || s.trim());

  function fill(total: number) {
    const parts = splitHms(total);
    setH(parts.h ? String(parts.h) : "");
    setM(parts.m ? String(parts.m) : "");
    setS(parts.s ? String(parts.s) : "");
  }
  function add(startNow: boolean) {
    if (!seconds) return;
    addTimer(name, seconds, color || undefined, startNow);
    setName("");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    add(true);
  }
  const digits = (set: (v: string) => void) => (e: { target: { value: string } }) => set(e.target.value.replace(/[^\d.,]/g, "").slice(0, 4));

  return (
    <form className="card pad bt-add" onSubmit={submit}>
      <div className="bt-hms">
        <label><span>Hours</span><input inputMode="numeric" pattern="[0-9.,]*" autoComplete="off" placeholder="0" value={h} onChange={digits(setH)} /></label>
        <label><span>Minutes</span><input inputMode="numeric" pattern="[0-9.,]*" autoComplete="off" placeholder="0" value={m} onChange={digits(setM)} /></label>
        <label><span>Seconds</span><input inputMode="numeric" pattern="[0-9.,]*" autoComplete="off" placeholder="0" value={s} onChange={digits(setS)} /></label>
      </div>
      <div className="bt-quick" role="group" aria-label="Quick lengths">
        {QUICK_SECONDS.map((q) => <button key={q} type="button" className={`bt-btn bt-quick-chip ${seconds === q ? "on" : ""}`} aria-pressed={seconds === q} onClick={() => fill(q)}>{chipLabel(q)}</button>)}
      </div>
      <label className="bt-name-field"><span>Name (optional)</span><input value={name} maxLength={60} placeholder="e.g. Blocking, Wash 1, Spin" onChange={(e) => setName(e.target.value)} /></label>
      <div className="bt-colors" role="radiogroup" aria-label="Colour">
        <button type="button" role="radio" aria-checked={!color} aria-label="No colour" className="bt-swatch" onClick={() => setColor("")} />
        {TIMER_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className="bt-swatch" data-tone={c} onClick={() => setColor(c)} />)}
      </div>
      {typed && !seconds && <p className="error small" role="alert">Enter a length in numbers, for example 5 minutes.</p>}
      <div className="bt-add-actions">
        <button type="submit" className="bt-btn bt-primary" disabled={!seconds}><Play size={16} aria-hidden /> Start{seconds ? ` ${formatClock(seconds * 1000)}` : ""}</button>
        <button type="button" className="bt-btn" disabled={!seconds} onClick={() => add(false)}><Plus size={16} aria-hidden /> Add without starting</button>
      </div>
    </form>
  );
}

// ── The list ─────────────────────────────────────────────────────────────────

/** Timers in list order; the steps of a sequence are drawn together where its first step sits. */
function TimerList({ timers }: { timers: Timer[] }) {
  const now = useNow(timers.some((t) => t.status === "running"));
  const drawn = new Set<string>();
  const card = (t: Timer) => <TimerCard key={t.id} timer={t} now={now} first={timers[0]?.id === t.id} last={timers[timers.length - 1]?.id === t.id} />;
  return (
    <div className="bt-list">
      {timers.map((t) => {
        if (!t.seq) return card(t);
        if (drawn.has(t.seq)) return null;
        drawn.add(t.seq);
        const info = sequenceInfo(timers, t.seq);
        return (
          <section key={t.seq} className="bt-seq" aria-label={`${info.title ?? "Timers"}, in order`}>
            <header className="bt-seq-head">
              <strong><ListOrdered size={15} aria-hidden /> {info.title ?? "Sequence"}</strong>
              <span>
                {info.finished ? "All steps finished."
                  : info.current ? <>Step {info.position} of {info.steps.length}: <b>{info.current.name}</b>{info.current.status === "idle" ? " (not started)" : info.current.status === "paused" ? " (paused)" : ""}
                    {info.next ? <> · next: {info.next.name} ({describeSeconds(info.next.seconds)})</> : " · last step"}</>
                  : "No step waiting."}
              </span>
            </header>
            {info.steps.map(card)}
          </section>
        );
      })}
    </div>
  );
}

const STATUS_TEXT: Record<Timer["status"], string> = { idle: "Ready", running: "Running", paused: "Paused", done: "Finished" };

function TimerCard({ timer: t, now, first, last }: { timer: Timer; now: number; first: boolean; last: boolean }) {
  const left = remaining(t, now);
  const total = Math.max(t.seconds * 1000, left, 1);
  const endsAt = t.status === "running" && t.endsAt ? new Date(t.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  async function rename() {
    const name = await askText("Name this timer", t.name);
    if (name?.trim()) changeTimer(t.id, (x) => ({ ...x, name: name.trim().slice(0, 60) }));
  }
  async function del() {
    if ((t.status === "running" || t.status === "paused") && !(await ask(`Delete “${t.name}”? It still has ${formatClock(left)} left.`, "Delete"))) return;
    changeTimers((timers) => timers.filter((x) => x.id !== t.id));
  }

  return (
    <article className="bt-card" data-tone={t.color} data-status={t.status}>
      <div className="bt-card-top">
        <button type="button" className="bt-card-name" title="Rename" onClick={() => void rename()}>{t.name}</button>
        <span className="bt-card-tools">
          <button type="button" className="bt-icon" aria-label={`Move ${t.name} up`} disabled={first} onClick={() => changeTimers((timers) => move(timers, t.id, -1))}><ArrowUp size={18} /></button>
          <button type="button" className="bt-icon" aria-label={`Move ${t.name} down`} disabled={last} onClick={() => changeTimers((timers) => move(timers, t.id, 1))}><ArrowDown size={18} /></button>
          <button type="button" className="bt-icon bt-danger" aria-label={`Delete ${t.name}`} onClick={() => void del()}><Trash2 size={18} /></button>
        </span>
      </div>
      <div className="bt-digits" role="timer" aria-label={`${t.name}: ${formatClock(left)} left`}>{formatClock(left)}</div>
      <div className="bt-progress" aria-hidden><span style={{ width: `${Math.min(100, (left / total) * 100)}%` }} /></div>
      <p className="bt-card-meta">
        {STATUS_TEXT[t.status]} · {describeSeconds(t.seconds)}{endsAt && ` · ends ${endsAt}`}
        {t.status === "idle" && t.seq ? " · starts after the step before it" : ""}
      </p>
      <div className="bt-controls">
        {t.status === "running"
          ? <button type="button" className="bt-btn bt-primary" onClick={() => changeTimer(t.id, pause)}><Pause size={18} aria-hidden /> Pause</button>
          : <button type="button" className="bt-btn bt-primary" onClick={() => startTimers((timers, at) => timers.map((x) => (x.id === t.id ? start(x, at) : x)))}>
              <Play size={18} aria-hidden /> {t.status === "paused" ? "Resume" : t.status === "done" ? "Again" : "Start"}
            </button>}
        <button type="button" className="bt-btn" onClick={() => startTimers((timers, at) => timers.map((x) => (x.id === t.id ? addTime(x, 60_000, at) : x)))}><Plus size={18} aria-hidden /> 1 min</button>
        <button type="button" className="bt-btn" disabled={t.status === "idle" && left === t.seconds * 1000} onClick={() => changeTimer(t.id, reset)}><RotateCcw size={18} aria-hidden /> Reset</button>
      </div>
    </article>
  );
}

// ── Stopwatch ────────────────────────────────────────────────────────────────

function StopwatchPanel({ running }: { running: boolean }) {
  const { stopwatch: w } = useTimers();
  const now = useNow(running, 100);
  const elapsed = stopwatchElapsed(w, running ? Math.max(now, w.startedAt ?? 0) : now);
  const laps = lapTimes(w.laps);
  return (
    <div className="card pad bt-stopwatch">
      <div className="bt-digits" role="timer" aria-label="Stopwatch">{formatElapsed(elapsed)}</div>
      <div className="bt-controls">
        {running
          ? <button type="button" className="bt-btn bt-primary" onClick={() => changeStopwatch(stopwatchStop)}><Pause size={18} aria-hidden /> Stop</button>
          : <button type="button" className="bt-btn bt-primary" onClick={() => changeStopwatch(stopwatchStart)}><Play size={18} aria-hidden /> {elapsed ? "Resume" : "Start"}</button>}
        <button type="button" className="bt-btn" disabled={!running} onClick={() => changeStopwatch(stopwatchLap)}><Flag size={18} aria-hidden /> Lap</button>
        <button type="button" className="bt-btn" disabled={running || (!elapsed && !laps.length)} onClick={() => changeStopwatch(() => STOPWATCH_ZERO)}><RotateCcw size={18} aria-hidden /> Reset</button>
      </div>
      {laps.length > 0 && (
        <ol className="bt-laps" reversed>
          {laps.map((lap, i) => ({ lap, i })).reverse().map(({ lap, i }) => (
            <li key={i}><span>Lap {i + 1}</span><strong>{formatElapsed(lap)}</strong><span className="muted">{formatElapsed(w.laps[i])}</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── How the alert reaches you ────────────────────────────────────────────────

function AlertSettings({ telegram, keepAwake }: { telegram: boolean; keepAwake: boolean }) {
  const [state, setState] = useState<NotifyState>(notifyState);
  // The permission can be changed in the browser's own settings while the page is open.
  useEffect(() => {
    const check = () => setState(notifyState());
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  return (
    <div className="card pad bt-settings">
      <div className="section-head"><h3>When a timer ends</h3></div>
      <div className="bt-setting">
        {state === "granted" ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
        <div>
          {state === "granted" && <p><strong>Notifications are on.</strong> A finished timer also shows as a notification when the app is in the background.</p>}
          {state === "default" && (
            <>
              <p><strong>Notifications are off.</strong> Turn them on to be told when the app is open but in the background.</p>
              <button type="button" className="bt-btn bt-primary" onClick={() => void askNotifyPermission().then(setState)}><Bell size={16} aria-hidden /> Enable notifications</button>
            </>
          )}
          {state === "denied" && (
            <p><strong>Notifications are blocked for this app.</strong> To allow them, open the site settings (the icon to the left of the address, or the app’s info screen for an installed app),
              set Notifications to Allow, then reload this page.</p>
          )}
          {state === "unsupported" && (
            <p><strong>This browser cannot show notifications here.</strong> On an iPhone or iPad, add the app to the Home Screen first (Share, then Add to Home Screen) and open it from there.</p>
          )}
        </div>
      </div>
      {wakeLockSupported() && (
        <label className="bt-setting bt-toggle">
          <input type="checkbox" className="check" checked={keepAwake} onChange={(e) => changeSettings({ keepAwake: e.target.checked })} />
          <div><strong>Keep screen on</strong><p>The screen stays awake while a timer is running and this app is in front.</p></div>
        </label>
      )}
      <label className="bt-setting bt-toggle">
        <input type="checkbox" className="check" checked={telegram} onChange={(e) => changeSettings({ telegram: e.target.checked })} />
        <div><strong>Also alert me on Telegram</strong><p>For timers of {TELEGRAM_MIN_SECONDS / 60} minutes or longer. Needs a connection when the timer is started.</p></div>
      </label>
      <p className="bt-limits">
        <strong>What to expect.</strong> With the app open you get the full-screen alert with sound, on any page. With the app open in the background, the notification (if enabled) and the sound;
        browsers slow down hidden pages, so it can be late. With the phone locked or the app closed, the app cannot run: the Telegram message is what reaches you, about a minute after the timer ends.
        Timers shorter than {TELEGRAM_MIN_SECONDS / 60} minutes get no Telegram message.
      </p>
    </div>
  );
}
