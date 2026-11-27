// The ways a finished timer gets attention on this device: sound, vibration, the tab title,
// a system notification, and keeping the screen awake. Each is optional and guarded, since
// support differs between phones and browsers.
import { href } from "../../../lib/route.ts";
import type { Fired } from "./logic.ts";

// ── Sound ────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

/** Browsers only let a page make sound after the user has touched it. Call this from a tap
 *  (starting a timer does) so the alarm is allowed to play later. */
export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
  } catch { /* no audio on this device */ }
}

function beep(audio: AudioContext, at: number, hz: number, seconds: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = hz;
  // A short fade in and out, so the beep does not click.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.015);
  gain.gain.setValueAtTime(0.35, at + seconds - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

const VIBRATION = [400, 150, 400, 150, 400];
let ringTimer: number | null = null;
let titleTimer: number | null = null;
let plainTitle = "";

function ringOnce() {
  unlockAudio();
  try {
    if (ctx && ctx.state === "running") for (let i = 0; i < 3; i++) beep(ctx, ctx.currentTime + i * 0.24, i === 2 ? 1175 : 880, 0.16);
  } catch { /* keep the other signals going */ }
  try { navigator.vibrate?.(VIBRATION); } catch { /* unsupported */ }
}

/** Beep, vibrate and flash the title until stopRinging(). */
export function startRinging(label: string) {
  if (ringTimer === null) {
    ringOnce();
    ringTimer = window.setInterval(ringOnce, 1800);
  }
  if (titleTimer === null) plainTitle = document.title;
  else window.clearInterval(titleTimer);
  let on = false;
  const flash = () => { on = !on; document.title = on ? `⏰ ${label}` : plainTitle; };
  flash();
  titleTimer = window.setInterval(flash, 1000);
}

export function stopRinging() {
  if (ringTimer !== null) { window.clearInterval(ringTimer); ringTimer = null; }
  if (titleTimer !== null) { window.clearInterval(titleTimer); titleTimer = null; document.title = plainTitle; }
  try { navigator.vibrate?.(0); } catch { /* unsupported */ }
}

// ── System notifications ─────────────────────────────────────────────────────

export type NotifyState = NotificationPermission | "unsupported";

export function notifyState(): NotifyState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Ask for permission. Only ever called from a button press. */
export async function askNotifyPermission(): Promise<NotifyState> {
  if (typeof Notification === "undefined") return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

const tagOf = (timerId: string) => `timer:${timerId}`;

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  try { return "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined; } catch { return undefined; }
}

/** Show the system notification for a finished timer, if the user has allowed them. */
export async function showTimerNotification(f: Fired) {
  if (notifyState() !== "granted") return;
  const title = `Timer done: ${f.name}`;
  const body = [f.setTitle, f.next && `Next step started: ${f.next}`].filter(Boolean).join(" · ") || "Tap to open your timers.";
  // `vibrate` and `renotify` are not in every TypeScript DOM library, hence the wider type.
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body, tag: tagOf(f.id), requireInteraction: true, renotify: true, vibrate: VIBRATION,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, data: { url: href("bench/timers") },
  };
  try {
    const reg = await registration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options); // no worker (development): a plain page notification
  } catch { /* blocked or unsupported: the in-app alert is still showing */ }
}

export async function closeTimerNotification(timerId: string) {
  try {
    const reg = await registration();
    for (const n of (await reg?.getNotifications({ tag: tagOf(timerId) })) ?? []) n.close();
  } catch { /* nothing to close */ }
}

// ── Screen wake lock ─────────────────────────────────────────────────────────

export const wakeLockSupported = () => typeof navigator !== "undefined" && "wakeLock" in navigator;

let lock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== "visible" || !wakeLockSupported()) return;
  try {
    const got = await navigator.wakeLock.request("screen");
    got.addEventListener("release", () => { if (lock === got) lock = null; });
    if (wanted) lock = got;
    else void got.release().catch(() => {});
  } catch { /* refused (low battery, not visible): try again when the page is next shown */ }
}

/** Keep the screen on (or stop). The browser drops the lock whenever the page is hidden, so
 *  it is taken again each time the page comes back. */
export function keepScreenOn(on: boolean) {
  wanted = on;
  if (on) void acquire();
  else if (lock) { const held = lock; lock = null; void held.release().catch(() => {}); }
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void acquire(); });
