import { useEffect, useMemo, useRef } from "react";
import { BellRing, Plus, Square, Timer as TimerIcon } from "lucide-react";
import { href, useRoute } from "../../../lib/route.ts";
import { keepScreenOn, startRinging, stopRinging, unlockAudio } from "./alerts.ts";
import { acknowledge, addTime, formatClock, remaining, ringing, soonest, type Timer } from "./logic.ts";
import { setReminderUser } from "./reminders.ts";
import { TAB, changeTimer, changeTimers, startTimers, tick, useNow, useTimers } from "./store.ts";
import "./timers.css";

/**
 * Mounted once for the signed-in app, outside every page: it finishes timers when their
 * time is up, raises the alert wherever the user is, and shows the small running-timer chip.
 * It does nothing, and sets no clock, while no timer is running.
 */
export function TimerHost({ userId }: { userId: string }) {
  // Before any page's effects run, so a page that opens straight onto the timers can write reminders.
  useMemo(() => setReminderUser(userId), [userId]);
  useEffect(() => () => setReminderUser(null), []);

  const { timers, settings } = useTimers();
  const route = useRoute();
  const next = soonest(timers);
  const running = !!next;
  const alerts = ringing(timers);
  const now = useNow(running || alerts.length > 0, 1000);

  // Once a second while something runs, at the exact end of the soonest timer, and whenever
  // the page comes back (a sleeping phone or a hidden tab may not have ticked for a while).
  useEffect(() => {
    if (!running) return;
    tick();
    const id = window.setInterval(tick, 1000);
    const wake = () => tick();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [running]);
  const nextEnd = next?.endsAt ?? null;
  useEffect(() => {
    if (nextEnd === null) return;
    const id = window.setTimeout(tick, Math.max(0, nextEnd - Date.now()) + 15);
    return () => window.clearTimeout(id);
  }, [nextEnd]);

  // Sound, vibration and the flashing title come from one tab only: the one that raised the alert.
  const sounding = alerts.filter((t) => t.alertedBy === TAB).map((t) => t.name).join(", ");
  useEffect(() => {
    if (sounding) startRinging(`Timer done: ${sounding}`);
    else stopRinging();
  }, [sounding]);
  useEffect(() => stopRinging, []);

  // After a reload the browser wants a fresh tap before it plays sound: take the first one.
  const any = timers.length > 0;
  useEffect(() => {
    if (!any) return;
    document.addEventListener("pointerdown", unlockAudio, { passive: true });
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, [any]);

  const awake = settings.keepAwake && running;
  useEffect(() => { keepScreenOn(awake); }, [awake]);
  useEffect(() => () => keepScreenOn(false), []);

  // A tapped notification asks the app (through the service worker) to show the timers.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const on = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === "open-timers") window.location.hash = href("bench/timers"); };
    navigator.serviceWorker.addEventListener("message", on);
    return () => navigator.serviceWorker.removeEventListener("message", on);
  }, []);

  const onTimersPage = route.path[0] === "bench" && route.path[1] === "timers";
  const others = timers.filter((t) => t.status === "running").length - 1;
  return (
    <>
      {next && !onTimersPage && alerts.length === 0 && (
        <a className="bt-chip" href={href("bench/timers")} data-tone={next.color} aria-label={`Timer ${next.name}: ${formatClock(remaining(next, now))} left. Open timers`}>
          <TimerIcon size={16} aria-hidden />
          <span className="bt-chip-name">{next.name}</span>
          <strong>{formatClock(remaining(next, now))}</strong>
          {others > 0 && <span className="bt-chip-more">+{others}</span>}
        </a>
      )}
      {alerts.length > 0 && <AlertOverlay alerts={alerts} now={now} />}
    </>
  );
}

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Finished just now";
  if (min < 60) return `Finished ${min} min ago`;
  const h = Math.floor(min / 60);
  return `Finished ${h} h ${min % 60} min ago`;
}

/** Full screen and in the browser's top layer, so it covers any dialog that was open. */
function AlertOverlay({ alerts, now }: { alerts: Timer[]; now: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    try { dialog?.showModal(); } catch { dialog?.setAttribute("open", ""); }
    dialog?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  const stop = (id: string) => changeTimer(id, acknowledge);
  const more = (id: string) => startTimers((timers, at) => timers.map((t) => (t.id === id ? addTime(t, 60_000, at) : t)));
  return (
    // Escape does not dismiss it: an alarm stops only on a deliberate tap.
    <dialog ref={ref} className="bt-alert" aria-label="Timer finished" onCancel={(e) => e.preventDefault()}>
      <div className="bt-alert-inner">
        <BellRing className="bt-alert-bell" size={44} aria-hidden />
        <ul className="bt-alert-list">
          {alerts.map((t) => (
            <li key={t.id} data-tone={t.color}>
              <p className="bt-alert-kicker">{t.setTitle ? `${t.setTitle} · ` : ""}{ago(now - (t.finishedAt ?? now))}</p>
              <h2>{t.name}</h2>
              {t.startedNext && <p className="bt-alert-next">Next step started: <strong>{t.startedNext}</strong></p>}
              <div className="bt-alert-actions">
                <button type="button" className="bt-btn bt-stop" onClick={() => stop(t.id)}><Square size={18} aria-hidden /> Stop</button>
                <button type="button" className="bt-btn" onClick={() => more(t.id)}><Plus size={18} aria-hidden /> 1 min</button>
              </div>
            </li>
          ))}
        </ul>
        {alerts.length > 1 && <button type="button" className="bt-btn bt-stop-all" onClick={() => changeTimers((timers) => timers.map(acknowledge))}>Stop all {alerts.length}</button>}
        <a className="bt-alert-open" href={href("bench/timers")} onClick={() => changeTimers((timers) => timers.map(acknowledge))}>Stop and open timers</a>
      </div>
    </dialog>
  );
}
