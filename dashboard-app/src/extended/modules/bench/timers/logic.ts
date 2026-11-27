// Bench timers: every state change as a pure function over plain data, with the clock
// passed in. A running timer is stored as the moment it ends, so the time left is always
// `endsAt - now`: nothing counts down, and a sleeping phone or a throttled tab cannot drift.

export const MAX_SECONDS = 99 * 3600;
/** Shorter timers end before a Telegram message could usefully arrive. */
export const TELEGRAM_MIN_SECONDS = 120;
/** A timer found finished longer ago than this (the app was closed) is shown, not sounded. */
export const STALE_ALERT_MS = 5 * 60_000;

export const TIMER_COLORS = ["green", "blue", "amber", "red", "violet", "pink", "teal"] as const;
export const QUICK_SECONDS = [30, 60, 120, 300, 600, 900, 1800, 3600] as const;

export type TimerStatus = "idle" | "running" | "paused" | "done";

export interface Timer {
  id: string;
  name: string;
  /** The length it was set to; reset returns to this. */
  seconds: number;
  color?: string;
  status: TimerStatus;
  /** Running: the moment it ends (ms since epoch). */
  endsAt: number | null;
  /** Idle or paused: the time left. */
  remainingMs: number;
  /** Done: when it ended. */
  finishedAt?: number | null;
  /** Done: the alert was stopped. */
  acked?: boolean;
  /** Done: the tab that raised the alert and sounds it (null: shown without sound). */
  alertedBy?: string | null;
  /** Timers sharing this id run one after another, in list order. */
  seq?: string;
  /** The saved set it was loaded from. */
  setTitle?: string;
  /** Done, in a sequence: the step that started when this one ended. */
  startedNext?: string;
}

/** What a saved set keeps (the `data` of a `timer_set` bench item). */
export interface TimerSetData {
  timers: { name: string; seconds: number; color?: string }[];
  sequential?: boolean;
}

export interface Fired {
  id: string;
  name: string;
  setTitle?: string;
  endedAt: number;
  /** Sequence: the step that started as this one ended. */
  next?: string;
}

export const clampSeconds = (s: number) => (Number.isFinite(s) ? Math.min(MAX_SECONDS, Math.max(0, Math.floor(s))) : 0);

/** Seconds from the three typed fields. Blank fields count as zero and overflow carries
 *  ("90" minutes is 1 h 30). Null when there is nothing usable or a field is not a number. */
export function parseHms(h: string, m: string, s: string): number | null {
  let total = 0;
  for (const [text, unit] of [[h, 3600], [m, 60], [s, 1]] as const) {
    const t = text.trim().replace(",", ".");
    if (!t) continue;
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    total += Number(t) * unit;
  }
  const seconds = clampSeconds(Math.round(total));
  return seconds > 0 ? seconds : null;
}

export function splitHms(seconds: number): { h: number; m: number; s: number } {
  const t = clampSeconds(seconds);
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

const two = (n: number) => String(n).padStart(2, "0");

/** Time left as m:ss, or h:mm:ss from an hour up. Part seconds round up, so a timer shows
 *  0:01 until it has really ended. */
export function formatClock(ms: number): string {
  const { h, m, s } = splitHms(Math.ceil(Math.max(0, ms) / 1000));
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** Elapsed time with tenths, for the stopwatch. */
export function formatElapsed(ms: number): string {
  const whole = Math.max(0, Math.floor(ms));
  const { h, m, s } = splitHms(Math.floor(whole / 1000));
  return `${h ? `${h}:${two(m)}` : m}:${two(s)}.${Math.floor((whole % 1000) / 100)}`;
}

/** A length in words: "1 h 30 min", "45 s". */
export function describeSeconds(seconds: number): string {
  const { h, m, s } = splitHms(seconds);
  return [h && `${h} h`, m && `${m} min`, s && `${s} s`].filter(Boolean).join(" ") || "0 s";
}

export function createTimer(id: string, name: string, seconds: number, color?: string): Timer {
  const length = Math.max(1, clampSeconds(seconds));
  return { id, name: name.trim() || describeSeconds(length), seconds: length, ...(color ? { color } : {}), status: "idle", endsAt: null, remainingMs: length * 1000 };
}

/** Start, resume, or (once done) run again from the full length. */
export function start(t: Timer, now: number): Timer {
  if (t.status === "running") return t;
  const left = t.status === "done" || t.remainingMs <= 0 ? t.seconds * 1000 : t.remainingMs;
  return { ...t, status: "running", endsAt: now + left, remainingMs: left, finishedAt: null, acked: false, alertedBy: null, startedNext: undefined };
}

export function pause(t: Timer, now: number): Timer {
  if (t.status !== "running" || t.endsAt === null) return t;
  return { ...t, status: "paused", remainingMs: Math.max(0, t.endsAt - now), endsAt: null };
}

export const resume = start;

export function reset(t: Timer): Timer {
  return { ...t, status: "idle", endsAt: null, remainingMs: t.seconds * 1000, finishedAt: null, acked: false, alertedBy: null, startedNext: undefined };
}

/** Add time. A finished timer runs again for just the added time. */
export function addTime(t: Timer, ms: number, now: number): Timer {
  const cap = MAX_SECONDS * 1000;
  if (t.status === "running" && t.endsAt !== null) return { ...t, endsAt: Math.min(now + cap, Math.max(now, t.endsAt) + ms) };
  if (t.status === "done") return { ...t, status: "running", endsAt: now + Math.min(cap, ms), remainingMs: ms, finishedAt: null, acked: false, alertedBy: null, startedNext: undefined };
  return { ...t, remainingMs: Math.min(cap, t.remainingMs + ms) };
}

/** Stop the alert of a finished timer. */
export function acknowledge(t: Timer): Timer {
  return t.status === "done" ? { ...t, acked: true } : t;
}

export function remaining(t: Timer, now: number): number {
  if (t.status === "running") return Math.max(0, (t.endsAt ?? now) - now);
  return t.status === "done" ? 0 : t.remainingMs;
}

/** Running timers whose end has passed, earliest first. */
export function due(timers: Timer[], now: number): Timer[] {
  return timers.filter((t) => t.status === "running" && t.endsAt !== null && t.endsAt <= now).sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0));
}

/** The step of a sequence that follows `id`: the next one in the list still waiting. */
function nextStep(timers: Timer[], id: string): Timer | undefined {
  const i = timers.findIndex((t) => t.id === id);
  const seq = timers[i]?.seq;
  return seq ? timers.slice(i + 1).find((t) => t.seq === seq && t.status === "idle") : undefined;
}

/**
 * Move the clock to `now`: every timer whose end has passed becomes done, and in a sequence
 * the next step starts at the moment the previous one ended (not at `now`), so steps that
 * ended while the device slept are all accounted for at their true times.
 */
export function advance(timers: Timer[], now: number): { timers: Timer[]; fired: Fired[] } {
  let list = timers;
  const fired: Fired[] = [];
  for (;;) {
    const t = due(list, now)[0];
    if (!t) break;
    const endedAt = t.endsAt ?? now;
    const next = nextStep(list, t.id);
    list = list.map((x) =>
      x.id === t.id ? { ...x, status: "done" as const, endsAt: null, remainingMs: 0, finishedAt: endedAt, acked: false, alertedBy: null, startedNext: next?.name }
      : next && x.id === next.id ? start(x, endedAt)
      : x);
    fired.push({ id: t.id, name: t.name, endedAt, ...(t.setTitle ? { setTitle: t.setTitle } : {}), ...(next ? { next: next.name } : {}) });
  }
  return { timers: list, fired };
}

/** Finished timers whose alert has not been stopped yet. */
export const ringing = (timers: Timer[]) => timers.filter((t) => t.status === "done" && !t.acked);

/** The running timer that ends first. */
export function soonest(timers: Timer[]): Timer | undefined {
  return timers.filter((t) => t.status === "running" && t.endsAt !== null).sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0))[0];
}

/** When each timer will end if nothing is touched: running ones, and the waiting steps
 *  of a sequence behind a running step. */
export function projectedEnds(timers: Timer[]): Map<string, number> {
  const ends = new Map<string, number>();
  for (const t of timers) if (t.status === "running" && t.endsAt !== null) ends.set(t.id, t.endsAt);
  timers.forEach((t, i) => {
    if (t.status !== "running" || t.endsAt === null || !t.seq) return;
    let at = t.endsAt;
    for (const step of timers.slice(i + 1)) {
      if (step.seq !== t.seq || step.status !== "idle" || ends.has(step.id)) continue;
      at += step.remainingMs;
      ends.set(step.id, at);
    }
  });
  return ends;
}

export interface SequenceInfo {
  title?: string;
  steps: Timer[];
  /** The step running or paused now; when between steps, the next one waiting. */
  current?: Timer;
  /** 1-based position of `current`. */
  position: number;
  next?: Timer;
  finished: boolean;
}

export function sequenceInfo(timers: Timer[], seq: string): SequenceInfo {
  const steps = timers.filter((t) => t.seq === seq);
  const current = steps.find((t) => t.status === "running" || t.status === "paused") ?? steps.find((t) => t.status === "idle");
  const at = current ? steps.indexOf(current) : -1;
  return {
    title: steps[0]?.setTitle,
    steps,
    current,
    position: at + 1,
    next: at >= 0 ? steps.slice(at + 1).find((t) => t.status === "idle") : undefined,
    finished: steps.length > 0 && steps.every((t) => t.status === "done"),
  };
}

/** Start everything that can start: loose timers, and in each sequence only its current
 *  step (the rest follow by themselves). */
export function startAll(timers: Timer[], now: number): Timer[] {
  const first = new Set<string>();
  for (const seq of new Set(timers.map((t) => t.seq).filter((s): s is string => !!s))) {
    const steps = timers.filter((t) => t.seq === seq);
    if (steps.some((t) => t.status === "running")) continue;
    const step = steps.find((t) => t.status === "paused") ?? steps.find((t) => t.status === "idle");
    if (step) first.add(step.id);
  }
  return timers.map((t) => ((t.seq ? first.has(t.id) : t.status === "idle" || t.status === "paused") ? start(t, now) : t));
}

export const clearFinished = (timers: Timer[]) => timers.filter((t) => t.status !== "done");

/** Move a timer one place up (-1) or down (1). */
export function move(timers: Timer[], id: string, by: -1 | 1): Timer[] {
  const i = timers.findIndex((t) => t.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= timers.length) return timers;
  const out = [...timers];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Read a saved set defensively: it is JSON from the database. */
export function parseSetData(data: unknown): TimerSetData {
  const raw = (data ?? {}) as { timers?: unknown; sequential?: unknown };
  const timers = (Array.isArray(raw.timers) ? raw.timers : []).flatMap((x) => {
    const t = (x ?? {}) as { name?: unknown; seconds?: unknown; color?: unknown };
    const seconds = clampSeconds(Number(t.seconds));
    if (seconds <= 0) return [];
    return [{ name: typeof t.name === "string" ? t.name : "", seconds, ...(typeof t.color === "string" && t.color ? { color: t.color } : {}) }];
  });
  return { timers, sequential: raw.sequential === true };
}

/** What "Save as set" stores for the timers on screen. */
export function toSetData(timers: Timer[], sequential: boolean): TimerSetData {
  return { timers: timers.map((t) => ({ name: t.name, seconds: t.seconds, ...(t.color ? { color: t.color } : {}) })), sequential };
}

/** Fresh timers for a saved set. `newId` supplies ids; a sequential set shares one of them as its sequence. */
export function timersFromSet(data: TimerSetData, title: string, newId: () => string): Timer[] {
  const seq = data.sequential ? newId() : undefined;
  return data.timers.map((t) => ({ ...createTimer(newId(), t.name, t.seconds, t.color), setTitle: title, ...(seq ? { seq } : {}) }));
}

/** Start a set just loaded: all of it, or only the first step of a sequence. */
export function startLoaded(timers: Timer[], loaded: Timer[], now: number): Timer[] {
  const ids = new Set(loaded.map((t) => t.id));
  const firstStep = loaded[0]?.seq ? loaded[0].id : null;
  return timers.map((t) => (ids.has(t.id) && (firstStep ? t.id === firstStep : true) ? start(t, now) : t));
}

// ── Telegram backup ──────────────────────────────────────────────────────────

export interface WantedReminder {
  at: number;
  title: string;
  body: string | null;
}

/**
 * The reminder rows that should exist for these timers: one per timer of two minutes or
 * more that is running, queued behind a running step, or finished but not yet acknowledged
 * (the server may still be about to send that one).
 */
export function wantedReminders(timers: Timer[], enabled: boolean): Map<string, WantedReminder> {
  const out = new Map<string, WantedReminder>();
  if (!enabled) return out;
  const ends = projectedEnds(timers);
  for (const t of timers) {
    if (t.seconds < TELEGRAM_MIN_SECONDS) continue;
    const at = t.status === "done" ? (t.acked ? undefined : t.finishedAt ?? undefined) : ends.get(t.id);
    if (at === undefined) continue;
    const next = t.status === "done" ? t.startedNext : nextStep(timers, t.id)?.name;
    const body = [t.setTitle, next && `Next: ${next}`].filter(Boolean).join(" · ");
    out.set(t.id, { at, title: `Timer done: ${t.name}`, body: body || null });
  }
  return out;
}

/** Rows to delete and rows to (re)create when the timers change from `before` to `after`. */
export function reminderChanges(before: Map<string, WantedReminder>, after: Map<string, WantedReminder>): { remove: string[]; put: [string, WantedReminder][] } {
  const remove = [...before.keys()].filter((id) => !after.has(id));
  const put = [...after].filter(([id, w]) => before.get(id)?.at !== w.at);
  return { remove, put };
}

// ── Stopwatch ────────────────────────────────────────────────────────────────

export interface Stopwatch {
  /** Running since (ms since epoch); null when stopped. */
  startedAt: number | null;
  /** Time counted before the current run. */
  elapsedMs: number;
  /** Total elapsed time at each lap. */
  laps: number[];
}

export const STOPWATCH_ZERO: Stopwatch = { startedAt: null, elapsedMs: 0, laps: [] };

export const stopwatchElapsed = (w: Stopwatch, now: number) => w.elapsedMs + (w.startedAt === null ? 0 : Math.max(0, now - w.startedAt));
export const stopwatchStart = (w: Stopwatch, now: number): Stopwatch => (w.startedAt === null ? { ...w, startedAt: now } : w);
export const stopwatchStop = (w: Stopwatch, now: number): Stopwatch => (w.startedAt === null ? w : { ...w, startedAt: null, elapsedMs: stopwatchElapsed(w, now) });
export const stopwatchLap = (w: Stopwatch, now: number): Stopwatch => ({ ...w, laps: [...w.laps, stopwatchElapsed(w, now)] });
/** Each lap's own length, first lap first. */
export const lapTimes = (laps: number[]) => laps.map((total, i) => total - (i ? laps[i - 1] : 0));
