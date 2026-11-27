// Timers are device state: they live in localStorage as end timestamps, so they survive
// moving between pages, a reload and the app being reopened, and every open tab of the app
// sees the same list. This module is the only place that reads or writes them.
import { useEffect, useState, useSyncExternalStore } from "react";
import { load, loadRaw, save } from "../../../../lib/persist";
import { closeTimerNotification, showTimerNotification, unlockAudio } from "./alerts.ts";
import {
  STALE_ALERT_MS, STOPWATCH_ZERO, advance, createTimer, due, reminderChanges, ringing, start, startLoaded, timersFromSet, wantedReminders,
  type Stopwatch, type Timer, type TimerSetData,
} from "./logic.ts";
import { putReminder, removeReminder } from "./reminders.ts";

const TIMERS = "bench-timers";
const STOPWATCH = "bench-stopwatch";
const SETTINGS = "bench-timer-settings";

export interface TimerSettings {
  /** Also send a Telegram message when a timer of two minutes or more ends. */
  telegram: boolean;
  /** Keep the screen awake while a timer runs. */
  keepAwake: boolean;
}
const DEFAULT_SETTINGS: TimerSettings = { telegram: true, keepAwake: false };

export interface TimerState {
  timers: Timer[];
  stopwatch: Stopwatch;
  settings: TimerSettings;
}

export function newId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

/** This tab, kept across a reload: the tab that raised an alert is the one that sounds it. */
export const TAB = (() => {
  try {
    const kept = sessionStorage.getItem("dash.v1.bench-tab");
    if (kept) return kept;
    const id = newId();
    sessionStorage.setItem("dash.v1.bench-tab", id);
    return id;
  } catch { return newId(); }
})();

function readTimers(): Timer[] {
  const raw = loadRaw<unknown>(TIMERS, []);
  return Array.isArray(raw) ? (raw as Timer[]).filter((t) => t && typeof t.id === "string" && typeof t.seconds === "number") : [];
}
function readStopwatch(): Stopwatch {
  const w = load<Stopwatch>(STOPWATCH, STOPWATCH_ZERO);
  return { ...w, laps: Array.isArray(w.laps) ? w.laps : [] };
}
const readSettings = () => load<TimerSettings>(SETTINGS, DEFAULT_SETTINGS);
const readAll = (): TimerState => ({ timers: readTimers(), stopwatch: readStopwatch(), settings: readSettings() });

let state: TimerState = readAll();
const listeners = new Set<() => void>();
function refresh() {
  state = readAll();
  listeners.forEach((fn) => fn());
}
// Another tab of the app changed something.
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === null || e.key.includes(".bench-")) refresh(); });

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useTimers(): TimerState {
  return useSyncExternalStore(subscribe, () => state);
}

/** The current time, refreshed every `ms` while `active`. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

/** After the list changed in this tab: bring the Telegram reminder rows and the system
 *  notifications in line with it. */
function settle(before: Timer[], after: Timer[], telegramBefore: boolean, telegramAfter: boolean) {
  const { remove, put } = reminderChanges(wantedReminders(before, telegramBefore), wantedReminders(after, telegramAfter));
  remove.forEach(removeReminder);
  put.forEach(([id, wanted]) => putReminder(id, wanted));
  const still = new Set(ringing(after).map((t) => t.id));
  for (const t of ringing(before)) if (!still.has(t.id)) void closeTimerNotification(t.id);
}

/** Change the list. `fn` gets the stored list as it is now (another tab may have changed it) and the time. */
export function changeTimers(fn: (timers: Timer[], now: number) => Timer[]) {
  const before = readTimers();
  const after = fn(before, Date.now());
  if (after === before) return;
  save(TIMERS, after);
  const { telegram } = readSettings();
  settle(before, after, telegram, telegram);
  refresh();
}

/** Change one timer. */
export function changeTimer(id: string, fn: (t: Timer, now: number) => Timer) {
  changeTimers((timers, now) => timers.map((t) => (t.id === id ? fn(t, now) : t)));
}

/** Start one timer or several. Always called from a tap, which is what lets the alarm sound later. */
export function startTimers(fn: (timers: Timer[], now: number) => Timer[]) {
  unlockAudio();
  changeTimers(fn);
}

export function addTimer(name: string, seconds: number, color: string | undefined, startNow: boolean) {
  if (startNow) unlockAudio();
  changeTimers((timers, now) => {
    const t = createTimer(newId(), name, seconds, color);
    return [...timers, startNow ? start(t, now) : t];
  });
}

/** Put a saved set on the list, replacing what is there or after it, and optionally start it. */
export function loadSet(title: string, data: TimerSetData, opts: { replace: boolean; start: boolean }) {
  if (opts.start) unlockAudio();
  changeTimers((timers, now) => {
    const loaded = timersFromSet(data, title, newId);
    const all = [...(opts.replace ? [] : timers), ...loaded];
    return opts.start ? startLoaded(all, loaded, now) : all;
  });
}

export function changeSettings(patch: Partial<TimerSettings>) {
  const before = readSettings();
  const after = { ...before, ...patch };
  save(SETTINGS, after);
  const timers = readTimers();
  settle(timers, timers, before.telegram, after.telegram);
  refresh();
}

export function changeStopwatch(fn: (w: Stopwatch, now: number) => Stopwatch) {
  save(STOPWATCH, fn(readStopwatch(), Date.now()));
  refresh();
}

function fireDue() {
  const before = readTimers();
  const now = Date.now();
  const { timers, fired } = advance(before, now);
  if (!fired.length) return;
  // One found long after it ended (the app was closed) is shown but not sounded.
  const loud = new Set(fired.filter((f) => now - f.endedAt < STALE_ALERT_MS).map((f) => f.id));
  const after = timers.map((t) => (t.status === "done" && loud.has(t.id) ? { ...t, alertedBy: TAB } : t));
  save(TIMERS, after);
  const { telegram } = readSettings();
  settle(before, after, telegram, telegram);
  refresh();
  for (const f of fired) if (loud.has(f.id)) void showTimerNotification(f);
}

/**
 * Finish the timers whose time is up, and raise their alerts. Every open tab calls this, but
 * a timer fires in one tab only: whichever gets there first marks it done (and itself as the
 * tab that alerted) in the shared storage, and the others then find nothing due. Where the
 * browser has locks, the check and the write happen under one, so two tabs cannot both win.
 */
export function tick() {
  if (!due(readTimers(), Date.now()).length) return;
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks) void locks.request("dash-bench-timers", fireDue).catch(() => {});
  else fireDue();
}
