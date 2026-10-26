import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

/**
 * Debounced autosave. Call `change(patch)` on every edit; patches are merged and saved after
 * `delay` ms of quiet, on blur via `flush()`, when leaving the page, and on unmount.
 * Closing the tab with unsaved changes asks for confirmation.
 */
export function useAutosave<T extends object>(save: (patch: Partial<T>) => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const pending = useRef<Partial<T>>({});
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    await inFlight.current;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus("saving");
    inFlight.current = saveRef.current(patch).then(
      () => {
        setStatus(Object.keys(pending.current).length ? "unsaved" : "saved");
        setError("");
      },
      (e: Error) => {
        pending.current = { ...patch, ...pending.current }; // keep it for the next try
        setStatus("error");
        setError(e.message);
      },
    );
    await inFlight.current;
  }, []);

  const change = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("unsaved");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        void flush();
        e.preventDefault();
      }
    };
    const onHide = () => void flush();
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("hashchange", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("hashchange", onHide);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  return { status, error, change, flush };
}

