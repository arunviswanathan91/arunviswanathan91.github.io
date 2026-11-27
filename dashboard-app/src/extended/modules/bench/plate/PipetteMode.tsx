import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, MessageSquarePlus, Redo2, RotateCcw, SlidersHorizontal, Undo2 } from "lucide-react";
import { SlideToExit } from "../focus/SlideToExit.tsx";
import { gridVars } from "./PlateGrid.tsx";
import {
  WHOLE_PLATE_WELLS, channelChoices, componentText, formatDuration, isLabelled, markStep, nextOpenStep, parseWellId, passCount, planPass, rowLabel, stepDone, stepLabel,
  stepsDone, undoLastStep, upcomingSteps, viewSize, wellId, zoomWindow, type Channels, type Order, type Plate, type Progress,
} from "./logic.ts";

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
const CHANNEL_NAMES: Record<Channels, string> = { 1: "Single channel", 8: "8-channel, a column at a time", 12: "12-channel, a row at a time" };

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
  const { order, channels, snake, labelledOnly, steps } = useMemo(() => planPass(plate), [plate]);
  const done = useMemo(() => new Set(p.done), [p.done]);
  const inRun = useMemo(() => new Set(steps.flat()), [steps]);
  const count = passCount(steps, done);
  const finished = count.total > 0 && count.done === count.total;

  // The step in hand is remembered by its first well; with none remembered it is the first one still to do.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const found = currentId ? steps.findIndex((s) => s.includes(currentId)) : -1;
  const firstOpen = steps.length ? nextOpenStep(steps, done, steps.length - 1) : -1;
  const cursor = found >= 0 ? found : Math.max(0, firstOpen);
  const current = steps[cursor] ?? [];
  const currentDone = current.length > 0 && stepDone(current, done);
  const nextIndex = finished ? undefined : upcomingSteps(steps, done, cursor, 1)[0];
  const currentSet = new Set(finished ? [] : current);
  const nextSet = new Set(nextIndex === undefined ? [] : steps[nextIndex]);
  const openSteps = steps.length - stepsDone(steps, done);

  const dialog = useRef<HTMLDialogElement>(null);
  const mainButton = useRef<HTMLButtonElement>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    mainButton.current?.focus();
  }, []);
  useScreenAwake();

  // Steps taken back, most recent last, so they can be put on again. A new action empties it.
  const [redoStack, setRedoStack] = useState<string[][]>([]);
  const [options, setOptions] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [noting, setNoting] = useState(false);
  const [noteText, setNoteText] = useState("");
  // A part of a large plate looked at by hand; the view goes back to the well in hand when that changes.
  const [peek, setPeek] = useState<{ row: number; col: number } | null>(null);
  useEffect(() => { setNoting(false); setPeek(null); }, [current[0]]);

  const save = (patch: Partial<Progress>) => onProgress({ ...p, order, ...patch });
  // Changing the order (or snake, labelled-only, channels) continues at the first well still to do
  // in the new order, so switching from rows to columns after A1–A3 goes to B1, not past it.
  function setup(patch: Partial<Progress>) {
    setCurrentId(null);
    setRedoStack([]);
    save(patch);
  }
  function goTo(index: number) {
    if (index >= 0 && index < steps.length) setCurrentId(steps[index][0]);
  }
  function pipetted() {
    if (!current.length || finished) return;
    if (currentDone) { goTo(nextOpenStep(steps, done, cursor)); return; }
    const marked = markStep(p.done, current);
    const next = nextOpenStep(steps, new Set(marked), cursor);
    const now = Date.now();
    try { navigator.vibrate?.(10); } catch { /* not supported */ }
    setRedoStack([]);
    save({ done: marked, startedAt: p.startedAt ?? now, ...(next < 0 ? { finishedAt: now } : {}) });
    if (next >= 0) setCurrentId(steps[next][0]);
  }
  /** Leave this step open and move on; it comes round again after the ones that follow. */
  function skip() {
    if (!current.length || finished) return;
    goTo(nextOpenStep(steps, done, cursor));
  }
  function undo() {
    const back = undoLastStep(steps, p.done);
    if (back.done.length === p.done.length) return;
    const kept = new Set(back.done);
    setRedoStack((s) => [...s, p.done.filter((id) => !kept.has(id))]);
    const next: Progress = { ...p, order, done: back.done };
    delete next.finishedAt;
    if (!back.done.length) delete next.startedAt;
    onProgress(next);
    if (back.index >= 0) setCurrentId(steps[back.index][0]);
  }
  function redo() {
    const wells = redoStack[redoStack.length - 1];
    if (!wells) return;
    setRedoStack((s) => s.slice(0, -1));
    const marked = markStep(p.done, wells);
    const at = steps.findIndex((s) => s.includes(wells[0]));
    const next = nextOpenStep(steps, new Set(marked), Math.max(0, at));
    const now = Date.now();
    save({ done: marked, startedAt: p.startedAt ?? now, ...(next < 0 ? { finishedAt: now } : {}) });
    if (next >= 0) setCurrentId(steps[next][0]);
  }
  function reset() {
    setConfirmReset(false);
    setRedoStack([]);
    const next: Progress = { ...p, order, done: [] };
    delete next.startedAt;
    delete next.finishedAt;
    onProgress(next);
    setCurrentId(null);
  }
  function closeOptions() {
    setOptions(false);
    setConfirmReset(false);
    (mainButton.current ?? optionsButton.current)?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLDialogElement>) {
    const target = e.target as HTMLElement;
    // Escape is taken here, before the app's own shortcut handler, which would swallow it.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (options) closeOptions(); else if (noting) setNoting(false); else onClose();
      return;
    }
    if (options || target.closest("input, textarea, select")) return;
    const ownAction = target.closest("button") && !target.closest(".pp-well, .pp-main");
    if (e.key === " " || e.key === "Enter") {
      if (ownAction) return; // a focused button does its own thing
      e.preventDefault();
      if (!e.repeat) pipetted();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goTo(cursor + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goTo(cursor - 1); }
    else if (e.key === "Backspace") { e.preventDefault(); undo(); }
    else if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); skip(); }
  }

  // A large plate is shown a part at a time: the part that holds the well in hand.
  const view = viewSize(rows, cols, channels);
  const zoomed = rows * cols > WHOLE_PLATE_WELLS && (view.rows < rows || view.cols < cols);
  const at = parseWellId(current[0] ?? "A1") ?? { row: 0, col: 0 };
  const win = zoomed ? peek ?? zoomWindow(rows, cols, at.row, at.col, view.rows, view.cols) : { row: 0, col: 0 };
  function pickPart(e: MouseEvent<HTMLButtonElement>) {
    const box = e.currentTarget.querySelector("svg")?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    // A press without a position (keyboard) steps to the part after this one.
    const pointed = e.clientX !== 0 || e.clientY !== 0;
    const col = pointed ? ((e.clientX - box.left) / box.width) * cols : win.col + view.cols < cols ? win.col + view.cols : 0;
    const row = pointed ? ((e.clientY - box.top) / box.height) * rows : win.col + view.cols < cols ? win.row : win.row + view.rows < rows ? win.row + view.rows : 0;
    setPeek(zoomWindow(rows, cols, row, col, view.rows, view.cols));
  }

  const single = current.length === 1 ? plate.wells[current[0]] : undefined;
  const named = (id: string) => {
    const w = plate.wells[id];
    return [w?.title, ...(w?.components ?? []).filter((c) => c.name.trim()).map(componentText)].filter(Boolean).join(", ");
  };
  const stateOf = (id: string): string => {
    if (!inRun.has(id)) return "out";
    const ring = currentSet.has(id) ? "current " : nextSet.has(id) ? "next " : "";
    return ring + (done.has(id) ? "done" : "open");
  };
  const announce = !steps.length ? "No wells to pipette."
    : finished ? "All done."
    : `${current.length > 1 ? `Wells ${stepLabel(current)}` : `Well ${[current[0], named(current[0])].filter(Boolean).join(", ")}`}${currentDone ? ", already done" : ""}.`;
  const label = stepLabel(current);
  const groupLabelled = current.some((id) => isLabelled(plate.wells[id]));

  return (
    <dialog ref={dialog} className="pp" aria-label={`Pipette mode: ${mapTitle ? `${mapTitle}, ` : ""}${plate.name}`} onKeyDown={onKey} onClose={onClose}
      // A close request that is not the Escape key (the back gesture on a phone) shuts the options first.
      onCancel={(e) => { if (options) { e.preventDefault(); closeOptions(); } }}
      // Space activates a button when the key comes up; that click would mark a second step.
      onKeyUp={(e) => { if (e.key === " " && (e.target as HTMLElement).closest(".pp-well, .pp-main")) e.preventDefault(); }}>
      <header className="pp-top">
        <div className="pp-history">
          <button type="button" className="pp-icon" aria-label="Undo" disabled={!p.done.length} onClick={undo}><Undo2 size={20} aria-hidden /></button>
          <button type="button" className="pp-icon" aria-label="Redo" disabled={!redoStack.length} onClick={redo}><Redo2 size={20} aria-hidden /></button>
        </div>
        <strong className="pp-count" data-testid="pp-progress">{count.done} of {count.total} done</strong>
        <button ref={optionsButton} type="button" className="pp-btn pp-options-open" aria-haspopup="dialog" aria-expanded={options} onClick={() => setOptions(true)}><SlidersHorizontal size={16} aria-hidden /> Options</button>
      </header>

      <div className="pm-seg pp-order" role="radiogroup" aria-label="Order">
        {(["row", "column"] as Order[]).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={order === o} disabled={channels !== 1} className={order === o ? "on" : ""} onClick={() => setup({ order: o })}>{o === "row" ? "By row" : "By column"}</button>
        ))}
      </div>

      <div className="pp-mid">
        {zoomed && (
          <div className="pp-map">
            <button type="button" className="pp-map-plate" aria-label={`Whole plate. Showing ${wellId(win.row, win.col)} to ${wellId(win.row + view.rows - 1, win.col + view.cols - 1)}. Show another part.`} onClick={pickPart}>
              <svg viewBox={`-0.5 -0.5 ${cols + 1} ${rows + 1}`} style={{ width: `${Math.min(220, (cols + 1) * 4)}px` }} aria-hidden>
                {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
                  const id = wellId(r, c);
                  const s = stateOf(id);
                  return <rect key={id} x={c + 0.14} y={r + 0.14} width={0.72} height={0.72} rx={0.36} data-s={s.startsWith("current") ? "current" : s.replace("next ", "")} />;
                }))}
                <rect className="pp-map-window" x={win.col - 0.2} y={win.row - 0.2} width={view.cols + 0.4} height={view.rows + 0.4} rx={0.7} />
              </svg>
            </button>
            <span className="pp-map-text">Showing {wellId(win.row, win.col)} to {wellId(win.row + view.rows - 1, win.col + view.cols - 1)}</span>
          </div>
        )}

        <div className="pp-plate" data-dense={view.cols > 12 || undefined} data-group={current.length > 1 || undefined} style={gridVars(view.rows, view.cols)}>
          <div className="pp-grid" role="group" aria-label={`${plate.name}: ${rows * cols} wells`}>
            <span className="pp-head" aria-hidden />
            {Array.from({ length: view.cols }, (_, c) => <span key={c} className="pp-head" aria-hidden>{win.col + c + 1}</span>)}
            {Array.from({ length: view.rows }, (_, i) => {
              const r = win.row + i;
              return [
                <span key={`h${r}`} className="pp-head" aria-hidden>{rowLabel(r)}</span>,
                ...Array.from({ length: view.cols }, (_, k) => {
                  const id = wellId(r, win.col + k);
                  const well = plate.wells[id];
                  const state = stateOf(id);
                  const name = [id, well?.title, state.replace("open", "").replace("out", "not in this pass").trim().replace(" ", ", ")].filter(Boolean).join(", ");
                  return (
                    <button key={id} type="button" className="pp-well" data-well={id} data-state={state} data-tone={well?.color || undefined}
                      aria-label={name} aria-current={state.startsWith("current") ? "step" : undefined} disabled={state === "out"} tabIndex={-1} onClick={() => setCurrentId(id)}>
                      {state.endsWith("done") && <svg className="pp-tick" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                    </button>
                  );
                }),
              ];
            })}
          </div>
        </div>

        <p className="pp-live" aria-live="polite" aria-atomic="true">{announce}</p>

        {!steps.length ? (
          <div className="pp-now">
            <h2 className="pp-now-title">No wells to pipette</h2>
            <p className="pp-now-quiet">“Labelled wells only” is on and no well has a label yet. Label some wells, or turn it off in Options.</p>
          </div>
        ) : finished ? (
          <div className="pp-now pp-finished" role="status">
            <span className="pp-now-well" data-finished aria-hidden><Check size={44} strokeWidth={2.5} /></span>
            <h2 className="pp-now-title">All done</h2>
            <p className="pp-now-text">
              {count.total} {count.total === 1 ? "well" : "wells"} pipetted
              {p.startedAt && p.finishedAt ? <> in <strong>{formatDuration(p.finishedAt - p.startedAt)}</strong></> : null}.
            </p>
          </div>
        ) : (
          <div key={current[0]} className="pp-now" data-done={currentDone || undefined}>
            <span className="pp-now-well" data-tone={single?.color || undefined} data-long={label.length > 3 ? (label.length > 5 ? "2" : "1") : undefined}>{label}</span>
            {current.length === 1 ? (
              <div className="pp-now-body">
                {single?.title && <h2 className="pp-now-title">{single.title}</h2>}
                {single?.note && <p className="pp-now-text pp-now-note">{single.note}</p>}
                {!!single?.components?.some((c) => c.name.trim()) && (
                  <ul className="pp-components">
                    {single.components.filter((c) => c.name.trim()).map((c, i) => <li key={i}><span>{c.name}</span><strong>{[c.amount, c.unit].filter(Boolean).join(" ")}</strong></li>)}
                  </ul>
                )}
                {single?.group && <p className="pp-now-quiet">Group: {single.group}</p>}
                {!isLabelled(single) && <p className="pp-now-quiet">No label on this well.</p>}
                {currentDone && <p className="pp-now-quiet">Already pipetted.</p>}
              </div>
            ) : (
              <div className="pp-now-body">
                <h2 className="pp-now-title">{current.length} wells together</h2>
                {groupLabelled ? (
                  <ul className="pp-many">
                    {current.map((id) => <li key={id}><b>{id}</b> <span>{named(id) || "no label"}</span>{plate.wells[id]?.note ? <i> · {plate.wells[id].note}</i> : null}</li>)}
                  </ul>
                ) : <p className="pp-now-quiet">No label on these wells.</p>}
                {currentDone && <p className="pp-now-quiet">Already pipetted.</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pp-actions">
        {steps.length > 0 && !finished && (noting ? (
          <form className="pp-note-form" onSubmit={(e) => { e.preventDefault(); onNote(current, noteText.trim()); setNoting(false); }}>
            <textarea aria-label={`Note for ${label}`} rows={2} maxLength={500} autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <div className="pp-row">
              <button type="button" className="pp-btn" onClick={() => setNoting(false)}>Cancel</button>
              <button type="submit" className="pp-btn pp-primary">Save note</button>
            </div>
          </form>
        ) : (
          <>
            <div className="pp-row pp-do">
              <button type="button" className="pp-btn pp-skip" disabled={openSteps <= 1 && !currentDone} onClick={skip}>Skip</button>
              <button ref={mainButton} type="button" className="pp-btn pp-primary pp-main" onClick={pipetted}>
                {currentDone ? "Next open well" : <><Check size={22} aria-hidden /> Pipetted</>}
              </button>
            </div>
            <button type="button" className="pp-btn pp-note-open" onClick={() => { setNoteText(current.length === 1 ? single?.note ?? "" : ""); setNoting(true); }}>
              <MessageSquarePlus size={18} aria-hidden /> {single?.note ? "Edit note" : "Add note"}
            </button>
          </>
        ))}
        <SlideToExit onExit={onClose} />
      </div>

      {options && (
        <div className="pp-sheet-back" onClick={(e) => { if (e.target === e.currentTarget) closeOptions(); }}>
          <div className="pp-sheet" role="dialog" aria-label="Options">
            <div className="pp-sheet-head">
              <h2>Options</h2>
              <button type="button" className="pp-btn pp-primary" autoFocus onClick={closeOptions}>Done</button>
            </div>
            <label className="pp-opt">
              <span><b>Snake order</b><small>{channels === 1 ? "Turn round at the end of each row or column." : "Only with a single-channel pipette."}</small></span>
              <input type="checkbox" role="switch" className="pm-switch" checked={snake && channels === 1} disabled={channels !== 1} onChange={(e) => setup({ snake: e.target.checked })} />
            </label>
            <label className="pp-opt">
              <span><b>Labelled wells only</b><small>Leave out wells with no label.</small></span>
              <input type="checkbox" role="switch" className="pm-switch" checked={labelledOnly} onChange={(e) => setup({ labelledOnly: e.target.checked })} />
            </label>
            {choices.length > 1 && (
              <div className="pp-opt-set" role="radiogroup" aria-label="Pipette">
                <b>Pipette</b>
                {choices.map((c) => (
                  <label key={c} className="pp-radio">
                    <input type="radio" name="pp-channels" checked={channels === c} onChange={() => setup({ channels: c })} /> <span>{CHANNEL_NAMES[c]}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="pp-opt-reset">
              {confirmReset ? (
                <>
                  <p>Clear all {p.done.length} ticks and start again?</p>
                  <div className="pp-row">
                    <button type="button" className="pp-btn" onClick={() => setConfirmReset(false)}>Keep them</button>
                    <button type="button" className="pp-btn pp-danger" onClick={() => { reset(); closeOptions(); }}>Reset</button>
                  </div>
                </>
              ) : (
                <button type="button" className="pp-btn" disabled={!p.done.length} onClick={() => setConfirmReset(true)}><RotateCcw size={18} aria-hidden /> Reset progress</button>
              )}
            </div>
            {!saved && <p className="pp-sheet-note">This map is not saved yet: progress is kept only while this page stays open. Save the map to resume on another device.</p>}
            <p className="pp-sheet-note pp-keys">Keys: Space or Enter for pipetted, S to skip, arrow keys to move, Backspace to undo.</p>
          </div>
        </div>
      )}
    </dialog>
  );
}
