import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { num } from "../calc.ts";
import { CHAMBER_SQUARES, squareLabel } from "../model.ts";
import { SlideToExit } from "../focus/SlideToExit.tsx";
import { DotLayer, KindSwitch, shown, type CellKind, type Dots } from "./Chamber.tsx";

/**
 * Counting with eyes on the microscope: one square fills the screen and every touch on it is a cell.
 * Leaving takes a slide, so a stray touch cannot close it.
 */
export function FocusCount({ counted, at, onAt, live, dead, countDead, kind, onKind, dots, onTap, onRemove, onClose }: {
  counted: number[];
  /** The square being counted, as its place among the counted squares. */
  at: number;
  onAt: (k: number) => void;
  live: string[]; dead: string[];
  countDead: boolean;
  kind: CellKind;
  onKind: (kind: CellKind) => void;
  dots: Dots;
  onTap: (k: number, at: { x: number; y: number } | null) => void;
  onRemove: (k: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => { if (el?.open) el.close(); };
  }, []);
  const name = squareLabel(at);
  const active = kind === "dead" && countDead ? "dead" : "live";
  const value = active === "dead" ? dead[at] : live[at];
  const none = (num(value ?? "") ?? 0) <= 0;
  const step = (by: number) => { const k = at + by; if (k >= 0 && k < counted.length) onAt(k); };

  function tap(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    onTap(at, { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
    navigator.vibrate?.(10);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  }
  return (
    <dialog ref={dialog} className="hc-focus" aria-label={`Focus mode: square ${name}`} onClose={onClose} onKeyDown={onKey}>
      <header className="hc-focus-top">
        <span className="hc-map" aria-hidden>
          {Array.from({ length: CHAMBER_SQUARES }, (_, square) => <i key={square} data-on={counted.includes(square) || undefined} data-now={counted[at] === square || undefined} />)}
        </span>
        <span className="hc-focus-name">
          <strong>{name}</strong>
          <span>Square {at + 1} of {counted.length}</span>
        </span>
        <button type="button" className="hc-step" aria-label="Previous square" disabled={at <= 0} onClick={() => step(-1)}><ChevronLeft size={22} aria-hidden /></button>
        <button type="button" className="hc-step" aria-label="Next square" disabled={at >= counted.length - 1} onClick={() => step(1)}><ChevronRight size={22} aria-hidden /></button>
      </header>
      <div className="hc-focus-area">
        <button type="button" className="hc-focus-tap" data-testid="focus-tap" aria-label={`Add one ${countDead ? `${active} cell` : "cell"} to ${name}`}
          onPointerDown={tap} onClick={(e) => { if (e.detail === 0) onTap(at, null); }} />
        <DotLayer dots={dots[counted[at]]} />
        <div className="hc-focus-read" role="status">
          <strong className="num" data-testid="focus-count">{shown(value)}</strong>
          <span>{countDead ? `${active} cells in ${name}` : `cells in ${name}`}</span>
          {countDead && <span className="hc-focus-other">{active === "dead" ? `${shown(live[at])} live` : `${shown(dead[at])} dead`}</span>}
        </div>
      </div>
      <footer className="hc-focus-foot">
        <div className="hc-focus-tools">
          {countDead ? <KindSwitch kind={kind} onKind={onKind} /> : <span>Touch anywhere above to count a cell.</span>}
          <button type="button" className="hc-focus-minus" aria-label="Remove one" disabled={none} onClick={() => onRemove(at)}><Minus size={22} aria-hidden /></button>
        </div>
        <SlideToExit onExit={onClose} />
      </footer>
    </dialog>
  );
}
