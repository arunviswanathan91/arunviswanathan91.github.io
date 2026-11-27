import { useRef, type PointerEvent } from "react";
import { Minus } from "lucide-react";
import { num } from "../calc.ts";
import { CHAMBER_SQUARES, squareLabel } from "../model.ts";

/** Where a tap landed in its square, as fractions of the square. Kept for the session only, never saved. */
export interface Dot { x: number; y: number; dead: boolean }
/** The taps of each counted square, keyed by its place on the chamber (0 to 8). */
export type Dots = Record<number, Dot[]>;
export type CellKind = "live" | "dead";

const bad = (v: string) => v.trim() !== "" && num(v) === null;
/** A count as shown on the chamber: nothing counted reads 0. */
export const shown = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : "0");

export function DotLayer({ dots }: { dots: Dot[] | undefined }) {
  if (!dots?.length) return null;
  return (
    <span className="hc-dots" aria-hidden>
      {dots.map((p, k) => <i key={k} data-dead={p.dead || undefined} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />)}
    </span>
  );
}

/**
 * The counting chamber: nine large squares, of which the counted ones are open and labelled.
 * `view` decides what a counted square holds: a tap surface, number boxes, or a switch that
 * takes it in or out of the count.
 */
export function Chamber({ view, counted, live, dead, countDead, kind, dots, onTap, onRemove, onCount, onToggle }: {
  view: "tap" | "square" | "pick";
  counted: number[];
  live: string[]; dead: string[];
  countDead: boolean;
  kind: CellKind;
  dots: Dots;
  /** A cell was counted in square `k` (its place among the counted squares); `at` is null from the keyboard. */
  onTap: (k: number, at: { x: number; y: number } | null) => void;
  onRemove: (k: number) => void;
  onCount: (key: CellKind, k: number, value: string) => void;
  onToggle: (square: number) => void;
}) {
  // A tap counts when the finger lifts: a touch that turns into scrolling the page is cancelled first and adds nothing.
  const down = useRef(new Set<number>());
  function lift(e: PointerEvent<HTMLButtonElement>, k: number) {
    if (!down.current.delete(e.pointerId)) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onTap(k, { x, y });
  }
  return (
    <div className="hc-chamber" data-view={view} role="group" aria-label="Counting chamber">
      {Array.from({ length: CHAMBER_SQUARES }, (_, square) => {
        const k = counted.indexOf(square);
        const name = k < 0 ? "" : squareLabel(k);
        if (view === "pick") {
          return (
            <button key={square} type="button" className={`hc-cell hc-pick ${k < 0 ? "off" : "on"}`} aria-pressed={k >= 0} data-square={name || undefined}
              aria-label={k < 0 ? `Square ${square + 1}: not counted` : `Square ${square + 1}: counted as ${name}`} onClick={() => onToggle(square)}>
              {k >= 0 && <span className="hc-label">{name}</span>}
            </button>
          );
        }
        if (k < 0) return <div key={square} className="hc-cell off" aria-hidden />;
        const l = live[k] ?? "";
        const d = dead[k] ?? "";
        if (view === "square") {
          return (
            <div key={square} className="hc-cell on hc-typed" data-square={name} data-dead={countDead || undefined} role="group" aria-label={name}>
              <span className="hc-label">{name}</span>
              <div className="hc-row">
                {countDead && <span aria-hidden>Live</span>}
                <input inputMode="numeric" autoComplete="off" data-testid={`count-${name}`} aria-label={`${name}: ${countDead ? "live cells" : "cells"}`} aria-invalid={bad(l) || undefined}
                  placeholder={countDead ? undefined : "Count"} value={l} onChange={(e) => onCount("live", k, e.target.value)} />
              </div>
              {countDead && (
                <div className="hc-row">
                  <span aria-hidden>Dead</span>
                  <input inputMode="numeric" autoComplete="off" data-testid={`dead-${name}`} aria-label={`${name}: dead cells`} aria-invalid={bad(d) || undefined}
                    value={d} onChange={(e) => onCount("dead", k, e.target.value)} />
                </div>
              )}
            </div>
          );
        }
        const none = (num(kind === "dead" ? d : l) ?? 0) <= 0;
        return (
          <div key={square} className="hc-cell on" data-square={name} data-empty={l.trim() === "" || undefined} role="group" aria-label={name}>
            <button type="button" className="hc-tap" aria-label={`Add one ${countDead ? `${kind} cell` : "cell"} to ${name}`}
              onPointerDown={(e) => { if (e.button === 0) down.current.add(e.pointerId); }}
              onPointerUp={(e) => lift(e, k)}
              onPointerCancel={(e) => { down.current.delete(e.pointerId); }}
              onClick={(e) => { if (e.detail === 0) onTap(k, null); }} />
            <DotLayer dots={dots[square]} />
            <span className="hc-label">{name}</span>
            <span className="hc-count">
              <strong className="num" data-testid={`count-${name}`}>{shown(l)}</strong>
              {countDead && <span className="hc-dead"><span className="num" data-testid={`dead-${name}`}>{shown(d)}</span> dead</span>}
            </span>
            <button type="button" className="hc-minus" aria-label="Remove one" aria-disabled={none || undefined} onClick={() => { if (!none) onRemove(k); }}>
              <span><Minus size={16} aria-hidden /></span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Live or Dead: what the next tap counts. */
export function KindSwitch({ kind, onKind }: { kind: CellKind; onKind: (kind: CellKind) => void }) {
  return (
    <div className="hc-kind" role="group" aria-label="A tap counts">
      <button type="button" className={kind === "live" ? "on" : ""} aria-pressed={kind === "live"} onClick={() => onKind("live")}><i className="hc-key" aria-hidden /> Live</button>
      <button type="button" className={kind === "dead" ? "on" : ""} aria-pressed={kind === "dead"} onClick={() => onKind("dead")}><i className="hc-key" data-dead aria-hidden /> Dead</button>
    </div>
  );
}
