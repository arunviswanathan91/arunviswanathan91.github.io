import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronLeft, ChevronRight, MessageSquarePlus, RotateCcw, Undo2, X } from "lucide-react";
import {
  channelChoices, componentText, formatDuration, isLabelled, markStep, nextOpenStep, rowLabel, stepBox, stepDone, stepLabel, stepsDone, undoLastStep, upcomingSteps,
  visitSteps, wellId, type Channels, type Order, type Plate, type Progress,
} from "./logic.ts";
import { gridVars } from "./PlateGrid.tsx";

/** Keep the screen on while this view is open. The browser drops the lock when the page is hidden, so it is taken again on return. */
function useScreenAwake() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let closed = false;
    const acquire = async () => {
      if (closed || lock || document.visibilityState !== "visible") return;
      try {
        const got = await navigator.wakeLock.request("screen");
        if (closed) { void got.release().catch(() => {}); return; }
        lock = got;
        got.addEventListener("release", () => { if (lock === got) lock = null; });
      } catch { /* refused (low battery, not visible): tried again when the page is next shown */ }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}

const EMPTY: Progress = { order: "row", done: [] };
const HINTS = 3;

/** Position of something on the grid, in wells from A1 (fractions allowed). */
const at = (row: number, col: number, more: Record<string, string | number> = {}): CSSProperties => ({ "--r": row, "--c": col, ...more } as CSSProperties);

/**
 * Working through a plate at the bench: one step at a time, in a chosen order. Progress goes
 * back to the editor through `onProgress` on every change, which saves it with the plate.
 */
export function PipetteMode({ plate, mapTitle, saved, onProgress, onNote, onClose }: {
  plate: Plate;
  mapTitle: string;
  /** False for a map that has not been saved: progress then lives only on this page. */
  saved: boolean;
  onProgress: (p: Progress | undefined) => void;
  onNote: (ids: string[], note: string) => void;
  onClose: () => void;
}) {
  const { rows, cols } = plate;
  const p = plate.progress ?? EMPTY;
  const choices = channelChoices(rows, cols);
  const channels: Channels = p.channels && choices.includes(p.channels) ? p.channels : 1;
  const order: Order = channels === 8 ? "column" : channels === 12 ? "row" : p.order;
  const labelled = useMemo(() => new Set(Object.keys(plate.wells).filter((id) => isLabelled(plate.wells[id]))), [plate.wells]);
  const steps = useMemo(
    () => visitSteps(rows, cols, { order, snake: !!p.snake, channels, only: p.labelledOnly ? (id) => labelled.has(id) : undefined }),
    [rows, cols, order, p.snake, channels, p.labelledOnly, labelled],
  );
  const done = useMemo(() => new Set(p.done), [p.done]);
  const doneCount = stepsDone(steps, done);
  const finished = steps.length > 0 && doneCount === steps.length;

  // The step in hand is remembered by its first well, so it stays put when the order changes.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const found = currentId ? steps.findIndex((s) => s.includes(currentId)) : -1;
  const firstOpen = steps.length ? nextOpenStep(steps, done, steps.length - 1) : -1;
  const cursor = found >= 0 ? found : Math.max(0, firstOpen);
  const current = steps[cursor] ?? [];
  const upcoming = finished ? [] : upcomingSteps(steps, done, cursor, HINTS);
  const currentDone = stepDone(current, done) && current.length > 0;

  const dialog = useRef<HTMLDialogElement>(null);
  const mainButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    mainButton.current?.focus();
  }, []);
  useScreenAwake();
  // A wide plate scrolls inside its box: keep the well in hand in view.
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!current[0]) return;
    dialog.current?.querySelector<HTMLElement>(`[data-well="${current[0]}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current[0]]);

  const [noting, setNoting] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { setNoting(false); }, [current[0]]);
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  const save = (patch: Partial<Progress>) => onProgress({ ...p, order, ...patch });
  function setup(patch: Partial<Progress>) {
    setCurrentId(current[0] ?? null);
    save(patch);
  }
  function pipetted() {
    if (!current.length || finished) return;
    if (currentDone) { goTo(nextOpenStep(steps, done, cursor)); return; }
    const marked = markStep(p.done, current);
    const set = new Set(marked);
    const next = nextOpenStep(steps, set, cursor);
    const now = Date.now();
    try { navigator.vibrate?.(10); } catch { /* not supported */ }
    save({ done: marked, startedAt: p.startedAt ?? now, ...(next < 0 ? { finishedAt: now } : {}) });
    if (next >= 0) setCurrentId(steps[next][0]);
  }
  function goTo(index: number) {
    if (index >= 0 && index < steps.length) setCurrentId(steps[index][0]);
  }
  function undo() {
    const back = undoLastStep(steps, p.done);
    if (back.done.length === p.done.length) return;
    const next: Progress = { ...p, order, done: back.done };
    delete next.finishedAt;
    if (!back.done.length) delete next.startedAt;
    onProgress(next);
    if (back.index >= 0) setCurrentId(steps[back.index][0]);
  }
  function reset() {
    if (!confirmReset && p.done.length) { setConfirmReset(true); return; }
    setConfirmReset(false);
    const next: Progress = { ...p, order, done: [] };
    delete next.startedAt;
    delete next.finishedAt;
    onProgress(next);
    setCurrentId(steps[0]?.[0] ?? null);
  }

  function onKey(e: KeyboardEvent<HTMLDialogElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    const ownAction = target.closest("button") && !target.closest(".pp-well, .pp-main");
    if (e.key === " " || e.key === "Enter") {
      if (ownAction) return; // a focused button does its own thing
      e.preventDefault();
      if (!e.repeat) pipetted();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goTo(cursor + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goTo(cursor - 1); }
    else if (e.key === "Backspace") { e.preventDefault(); undo(); }
  }

  const box = stepBox(current);
  const nextBox = upcoming.length ? stepBox(steps[upcoming[0]]) : null;
  const centre = (step: string[]) => { const b = stepBox(step); return { row: b.row + (b.rows - 1) / 2, col: b.col + (b.cols - 1) / 2 }; };
  const trail = finished || !current.length ? [] : [cursor, ...upcoming].map((i) => centre(steps[i]));
  const currentSet = new Set(finished ? [] : current);
  const nextSet = new Set(upcoming.length ? steps[upcoming[0]] : []);

  const single = current.length === 1 ? plate.wells[current[0]] : undefined;
  const describe = (id: string) => {
    const w = plate.wells[id];
    return [id, w?.title, ...(w?.components ?? []).filter((c) => c.name.trim()).map(componentText)].filter(Boolean).join(", ");
  };
  const announce = !steps.length ? "No wells to pipette."
    : finished ? "All wells pipetted."
    : `${current.length > 1 ? `Wells ${stepLabel(current)}` : `Well ${describe(current[0])}`}${currentDone ? ", already done" : ""}. Step ${cursor + 1} of ${steps.length}.`;

  return (
    <dialog ref={dialog} className="pp" aria-label={`Pipette mode: ${plate.name}`} onClose={onClose} onKeyDown={onKey}
      // Space activates a button when the key comes up; that click would mark a second step.
      onKeyUp={(e) => { if (e.key === " " && (e.target as HTMLElement).closest(".pp-well, .pp-main")) e.preventDefault(); }}>
      <div className="pp-inner">
        <header className="pp-top">
          <div className="pp-title">
            <span className="kicker">Pipette mode</span>
            <strong>{mapTitle ? `${mapTitle} · ` : ""}{plate.name}</strong>
          </div>
          <button type="button" className="pp-icon" aria-label="Close pipette mode" onClick={onClose}><X size={22} /></button>
        </header>

        <div className="pp-options">
          <div className="pm-seg" role="radiogroup" aria-label="Order">
            {(["row", "column"] as Order[]).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={order === o} disabled={channels !== 1} className={order === o ? "on" : ""} onClick={() => setup({ order: o })}>{o === "row" ? "By row" : "By column"}</button>
            ))}
          </div>
          {channels === 1 && <label className="pm-check"><input type="checkbox" className="check" checked={!!p.snake} onChange={(e) => setup({ snake: e.target.checked })} /> <span>Snake</span></label>}
          <label className="pm-check"><input type="checkbox" className="check" checked={!!p.labelledOnly} onChange={(e) => setup({ labelledOnly: e.target.checked })} /> <span>Labelled wells only</span></label>
          {choices.length > 1 && (
            <label className="pp-channels">
              <span>Pipette</span>
              <select value={channels} onChange={(e) => setup({ channels: Number(e.target.value) as Channels })}>
                <option value={1}>Single channel</option>
                {choices.includes(8) && <option value={8}>8-channel (a column at a time)</option>}
                {choices.includes(12) && <option value={12}>12-channel (a row at a time)</option>}
              </select>
            </label>
          )}
        </div>

        <div className="pp-progress">
          <div className="pp-bar" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}><span style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} /></div>
          <strong>{doneCount} of {steps.length}</strong>
        </div>

        <div className="pm-scroll pp-scroll">
          <div className="pm-plate pp-plate" data-dense={cols > 12 || undefined} data-roomy={cols <= 6 || undefined} style={{ ...gridVars(rows, cols), minWidth: cols > 12 ? `${(cols + 1) * 24}px` : undefined }}>
            <div className="pm-grid" data-step={current.length > 1 ? "many" : undefined} role="group" aria-label={`${plate.name}: ${rows * cols} wells`}>
              <span className="pm-head" aria-hidden />
              {Array.from({ length: cols }, (_, c) => <span key={c} className="pm-head" aria-hidden>{c + 1}</span>)}
              {Array.from({ length: rows }, (_, r) => [
                <span key={`h${r}`} className="pm-head" aria-hidden>{rowLabel(r)}</span>,
                ...Array.from({ length: cols }, (_, c) => {
                  const id = wellId(r, c);
                  const well = plate.wells[id];
                  const isDone = done.has(id);
                  const state = currentSet.has(id) ? "current" : nextSet.has(id) ? "next" : undefined;
                  const inPass = !p.labelledOnly || labelled.has(id);
                  const name = [id, well?.title, state === "current" ? "current" : state === "next" ? "next" : "", isDone ? "done" : inPass ? "" : "not in this pass"].filter(Boolean).join(", ");
                  return (
                    <button key={id} type="button" className="pm-well pp-well" data-well={id} data-tone={well?.color || undefined} data-state={state} data-done={isDone || undefined} data-skip={!inPass || undefined}
                      aria-label={name} aria-current={state === "current" ? "step" : undefined} disabled={!inPass} tabIndex={-1} onClick={() => setCurrentId(id)}>
                      {isDone
                        ? <svg className="pp-tick" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} /></svg>
                        : well?.title ? <span className="pm-well-text" aria-hidden>{well.title}</span> : null}
                    </button>
                  );
                }),
              ])}
              {/* Drawn over the wells: the path through the next few steps, the dashed ring on the next one, and the ring on the one in hand. */}
              {trail.slice(0, -1).map((from, i) => {
                const to = trail[i + 1];
                const dr = to.row - from.row, dc = to.col - from.col;
                return <span key={`seg${i}`} className="pp-seg" aria-hidden style={at(from.row, from.col, { "--len": Math.hypot(dr, dc), "--deg": `${(Math.atan2(dr, dc) * 180) / Math.PI}deg`, "--fade": 1 - i * 0.28 })} />;
              })}
              {trail.slice(1).map((t, i) => <span key={`hint${i}`} className="pp-hint" aria-hidden style={at(t.row, t.col)}>{i + 2}</span>)}
              {nextBox && <span className="pp-ring pp-ring-next" aria-hidden style={at(nextBox.row, nextBox.col, { "--sr": nextBox.rows, "--sc": nextBox.cols })} />}
              {!finished && current.length > 0 && <span className="pp-ring" aria-hidden data-done={currentDone || undefined} style={at(box.row, box.col, { "--sr": box.rows, "--sc": box.cols })} />}
            </div>
          </div>
        </div>

        <p className="pp-live" aria-live="polite" aria-atomic="true">{announce}</p>

        {!steps.length ? (
          <div className="pp-card">
            <h2>No wells to pipette</h2>
            <p className="muted">“Labelled wells only” is on and no well has a title, group, note or component yet. Label some wells, or turn the option off.</p>
          </div>
        ) : finished ? (
          <div className="pp-card pp-finished" role="status">
            <span className="pp-finished-mark" aria-hidden><Check size={28} /></span>
            <h2>Plate finished</h2>
            <p>
              All {steps.length} {channels === 1 ? "wells" : "steps"} pipetted
              {p.startedAt && p.finishedAt ? <> in <strong>{formatDuration(p.finishedAt - p.startedAt)}</strong> (first to last)</> : null}.
            </p>
            <div className="pp-finished-actions">
              <button type="button" className="pp-btn" onClick={undo}><Undo2 size={18} aria-hidden /> Undo last</button>
              <button type="button" className="pp-btn" onClick={reset}><RotateCcw size={18} aria-hidden /> {confirmReset ? "Tap again to reset" : "Reset"}</button>
              <button type="button" className="pp-btn pp-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <div className="pp-card" data-done={currentDone || undefined}>
            <div className="pp-card-head">
              <h2>{stepLabel(current)}</h2>
              <span className="muted">Step {cursor + 1} of {steps.length}{currentDone ? " · done" : ""}</span>
            </div>
            {single ? (
              <>
                {single.title && <p className="pp-card-title">{single.title}</p>}
                {single.group && <p className="muted">Group: {single.group}</p>}
                {!!single.components?.some((c) => c.name.trim()) && (
                  <ul className="pp-components">
                    {single.components.filter((c) => c.name.trim()).map((c, i) => <li key={i}><span>{c.name}</span><strong>{[c.amount, c.unit].filter(Boolean).join(" ")}</strong></li>)}
                  </ul>
                )}
                {single.note && <p className="pp-note">{single.note}</p>}
              </>
            ) : current.length === 1 ? (
              <p className="muted">Not labelled.</p>
            ) : (
              <ul className="pp-many">
                {current.map((id) => <li key={id}><b>{id}</b> <span>{describe(id).slice(id.length + 2) || "not labelled"}</span>{plate.wells[id]?.note ? <i> · {plate.wells[id].note}</i> : null}</li>)}
              </ul>
            )}
            {noting ? (
              <form className="pp-note-form" onSubmit={(e) => { e.preventDefault(); onNote(current, noteText.trim()); setNoting(false); }}>
                <textarea aria-label={`Note for ${stepLabel(current)}`} rows={2} maxLength={500} autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <div>
                  <button type="button" className="pp-btn" onClick={() => setNoting(false)}>Cancel</button>
                  <button type="submit" className="pp-btn pp-primary">Save note</button>
                </div>
              </form>
            ) : (
              <div className="pp-card-tools">
                <button type="button" className="pp-btn" onClick={() => { setNoteText(current.length === 1 ? single?.note ?? "" : ""); setNoting(true); }}>
                  <MessageSquarePlus size={18} aria-hidden /> {single?.note ? "Edit note" : "Add note"}
                </button>
                <button type="button" className="pp-btn" disabled={!p.done.length} onClick={undo}><Undo2 size={18} aria-hidden /> Undo last</button>
                <button type="button" className="pp-btn" disabled={!p.done.length} onClick={reset}><RotateCcw size={18} aria-hidden /> {confirmReset ? "Tap again to reset" : "Reset progress"}</button>
              </div>
            )}
            {!saved && <p className="muted small">This map is not saved yet: progress is kept only while this page stays open. Save the map to resume on another device.</p>}
            <p className="muted small pp-keys">Space or Enter: pipetted · arrow keys: move · Backspace: undo the last one</p>
          </div>
        )}
      </div>

      {steps.length > 0 && !finished && (
        <div className="pp-bottom">
          <button type="button" className="pp-btn pp-arrow" aria-label="Previous" disabled={cursor <= 0} onClick={() => goTo(cursor - 1)}><ChevronLeft size={26} /></button>
          <button ref={mainButton} type="button" className="pp-btn pp-primary pp-main" onClick={pipetted}>
            <Check size={24} aria-hidden /> {currentDone ? "Done · go to next" : "Pipetted"}
          </button>
          <button type="button" className="pp-btn pp-arrow" aria-label="Next" disabled={cursor >= steps.length - 1} onClick={() => goTo(cursor + 1)}><ChevronRight size={26} /></button>
        </div>
      )}
    </dialog>
  );
}
