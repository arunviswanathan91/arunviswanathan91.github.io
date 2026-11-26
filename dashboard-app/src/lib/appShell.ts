// The installed-app side of the workspace: the service worker, the "new version" check,
// whether the device is online, and the browser's install prompt.
import { useEffect, useState, useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let installEvent: InstallPromptEvent | null = null;
let updateReady = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The script this page was started from, as named in index.html. */
const entryOf = (html: string) => /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1] ?? null;

/** A newer build is live when the published page names a different entry script from the one running. */
async function checkForUpdate() {
  if (updateReady || !navigator.onLine) return;
  try {
    const running = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src");
    const response = await fetch(import.meta.env.BASE_URL, { cache: "no-store" });
    if (!running || !response.ok) return;
    const published = entryOf(await response.text());
    if (published && published !== running) { updateReady = true; emit(); }
  } catch { /* offline or blocked: try again next time */ }
}

/** Called once at start-up. Does nothing in development, where there is no built worker. */
export function startAppShell() {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e as InstallPromptEvent; emit(); });
  window.addEventListener("appinstalled", () => { installEvent = null; emit(); });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", { scope: import.meta.env.BASE_URL }).then(() => navigator.serviceWorker.ready).then((reg) => {
      // Keeping the whole build is a few megabytes: skip it when the browser asks to save data.
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      if (!saveData) reg.active?.postMessage("precache");
    }).catch(() => { /* the app works without it */ });
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void checkForUpdate(); });
  window.setInterval(() => void checkForUpdate(), 30 * 60_000);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export const useUpdateReady = () => useSyncExternalStore(subscribe, () => updateReady);

/** Opened from the home screen rather than a browser tab. */
export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** iPhone and iPad have no install prompt: the app is added from the Share menu. */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** The browser's install prompt, when it has offered one. */
export function useInstall(): { canPrompt: boolean; install(): Promise<void> } {
  const event = useSyncExternalStore(subscribe, () => installEvent);
  return {
    canPrompt: Boolean(event),
    install: async () => { if (!event) return; await event.prompt(); await event.userChoice; installEvent = null; emit(); },
  };
}
