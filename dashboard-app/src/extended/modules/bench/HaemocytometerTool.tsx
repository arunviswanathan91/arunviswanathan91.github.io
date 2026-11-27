import { useEffect, useState } from "react";
import { ArrowRight, Maximize2 } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { go } from "../../lib/route.ts";
import { COUNT_RANGE, VOLUME_UNITS, bestUnit, fmt, haemocytometer, haemocytometerTotal, num } from "./calc.ts";
import { HAEMO_LAYOUTS, haemoData, layoutOf, recount, tally, toQ, totalsOf, type HaemoData, type HaemoLayout, type HaemoMode } from "./model.ts";
import { NumField, Panel, Quantity, Reason, Result, Stat, ToolFrame, guard, type ToolProps } from "./parts.tsx";
import { Chamber, KindSwitch, type CellKind, type Dots } from "./haemo/Chamber.tsx";
import { FocusCount } from "./haemo/FocusCount.tsx";
import "./haemo/haemo.css";

const MODES: [HaemoMode, string][] = [["tap", "Tap"], ["square", "Per square"], ["total", "Total"]];
const LAYOUTS: [HaemoLayout, string][] = [["corners", "4 corners"], ["centre", "4 corners + centre"], ["all", "All 9"]];
const HINT: Record<HaemoMode, string> = {
  tap: "Tap a square once for every cell you count in it.",
  square: "Type the cells counted in each square. A square left blank is left out.",
  total: "For a count kept on a tally counter: the cells in all the squares together.",
};
const blank = (v: string) => v.trim() === "";

export function HaemocytometerTool({ item }: ToolProps) {
  const [d, setD] = useState(() => haemoData(item?.data));
  const set = (patch: Partial<HaemoData>) => setD((x) => ({ ...x, ...patch }));
  // Where each tap landed: a picture of this sitting, not part of what is saved.
  const [dots, setDots] = useState<Dots>({});
  const [kind, setKind] = useState<CellKind>("live");
  const [picking, setPicking] = useState(false);
  const [setup, setSetup] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(d.countDead || !blank(d.volume.value));
  const active: CellKind = d.countDead ? kind : "live";

  const total = d.mode === "total";
  const deadTexts = d.countDead ? (total ? [d.totalDead] : d.dead) : [];
  // A count that is typed but not a number is not silently left out of the mean.
  const out = total
    ? guard(
      haemocytometerTotal({ total: num(d.total), squares: num(d.totalSquares), dead: d.countDead ? num(d.totalDead) : null, dilution: num(d.dilution), volume: toQ(d.volume) }),
      d.total, d.totalSquares, ...deadTexts, d.dilution, d.volume.value,
    )
    : guard(
      haemocytometer({ live: d.live.map(num), dead: d.countDead ? d.dead.map(num) : undefined, dilution: num(d.dilution), volume: toQ(d.volume) }),
      ...d.live, ...deadTexts, d.dilution, d.volume.value,
    );
  const r = out.result;
  const warnings = r ? Number(r.warning !== null) + Number(r.uneven) : 0;
  // The notes open by themselves when there is something to read, and can still be folded away.
  const [notes, setNotes] = useState<boolean | null>(null);
  useEffect(() => { setNotes(null); }, [warnings]);

  function tap(k: number, at: { x: number; y: number } | null) {
    setD((x) => tally(x, k, x.countDead ? kind : "live", 1));
    if (at) setDots((all) => ({ ...all, [d.counted[k]]: [...(all[d.counted[k]] ?? []), { ...at, dead: active === "dead" }] }));
  }
  function remove(k: number) {
    setD((x) => tally(x, k, x.countDead ? kind : "live", -1));
    setDots((all) => {
      const list = all[d.counted[k]] ?? [];
      const last = list.map((p) => p.dead).lastIndexOf(active === "dead");
      return last < 0 ? all : { ...all, [d.counted[k]]: list.filter((_, j) => j !== last) };
    });
  }
  function typed(key: CellKind, k: number, value: string) {
    setD((x) => ({ ...x, [key]: x[key].map((v, j) => (j === k ? value : v)) }));
    setDots((all) => ({ ...all, [d.counted[k]]: [] }));
  }
  function setMode(mode: HaemoMode) {
    setPicking(false);
    // Going to a total carries the squares over, unless a total is already there.
    setD((x) => (mode === "total" && x.mode !== "total" && blank(x.total) ? { ...x, mode, ...keep(totalsOf(x.live, x.dead), x) } : { ...x, mode }));
  }
  async function count(squares: number[]) {
    const lost = d.counted.some((s, k) => !squares.includes(s) && (!blank(d.live[k] ?? "") || !blank(d.dead[k] ?? "")));
    if (lost && !(await ask("Some of the squares you are leaving out have counts. Leave them out and clear their counts?", "Leave out"))) return;
    setD((x) => recount(x, squares));
    setDots((all) => Object.fromEntries(Object.entries(all).filter(([s]) => squares.includes(Number(s)))));
  }
  function toggle(square: number) {
    const next = d.counted.includes(square) ? d.counted.filter((s) => s !== square) : [...d.counted, square];
    if (next.length > 0) void count(next);
  }
  async function clear() {
    if (!(await ask("Clear all the counts? The squares, the dilution and the volume stay.", "Clear counts"))) return;
    setD((x) => ({ ...x, live: x.counted.map(() => ""), dead: x.counted.map(() => ""), total: "", totalDead: "" }));
    setDots({});
  }
  function useInDilution() {
    if (!r || !(r.livePerMl > 0)) return;
    const best = bestUnit(r.livePerMl, "cells/mL");
    go("bench/cells", { c1: String(Number(best.value.toPrecision(6))), c1u: best.unit });
  }

  const focusing = focus !== null && d.mode === "tap";
  const layout = picking ? null : layoutOf(d.counted);
  const anyCount = total ? !blank(d.total) || !blank(d.totalDead) : [...d.live, ...d.dead].some((v) => !blank(v));
  const squaresWord = (n: number) => `${n} ${n === 1 ? "square" : "squares"}`;
  return (
    <ToolFrame tool="haemocytometer" item={item} data={d}>
      {/* Behind focus mode the page cannot be reached; it is hidden from assistive technology as well. */}
      <div className="bench-grid hc" aria-hidden={focusing || undefined}>
        <Panel title="Count">
          <div className="segmented three hc-modes" role="group" aria-label="How to enter the count">
            {MODES.map(([id, label]) => <button key={id} type="button" className={d.mode === id ? "on" : ""} aria-pressed={d.mode === id} onClick={() => setMode(id)}>{label}</button>)}
          </div>
          <p className="muted small hc-hint">{picking ? "Tap a square to count it or to leave it out." : HINT[d.mode]}</p>

          {total ? (
            <div className="bench-fields">
              <NumField whole label="Total cells counted" value={d.total} placeholder={d.countDead ? "Live cells" : undefined} onChange={(v) => set({ total: v })} />
              {d.countDead && <NumField whole label="Total dead cells" value={d.totalDead} onChange={(v) => set({ totalDead: v })} />}
              <NumField whole label="Squares counted" value={d.totalSquares} onChange={(v) => set({ totalSquares: v })} />
            </div>
          ) : (
            <>
              {d.mode === "tap" && d.countDead && !picking && (
                <div className="hc-bar">
                  <span className="muted small">A tap counts</span>
                  <KindSwitch kind={kind} onKind={setKind} />
                </div>
              )}
              <Chamber view={picking ? "pick" : d.mode === "tap" ? "tap" : "square"} counted={d.counted} live={d.live} dead={d.dead} countDead={d.countDead} kind={active}
                dots={dots} onTap={tap} onRemove={remove} onCount={typed} onToggle={toggle} />
            </>
          )}

          <div className="row wrap bench-actions">
            {d.mode === "tap" && !picking && <button type="button" className="primary" onClick={() => setFocus(0)}><Maximize2 size={14} /> Focus mode</button>}
            {picking && <button type="button" className="primary" onClick={() => setPicking(false)}>Done</button>}
            <button type="button" disabled={!anyCount} onClick={() => void clear()}>Clear counts</button>
          </div>

          {!total && (
            <details className="hc-fold" open={setup} onToggle={(e) => { setSetup(e.currentTarget.open); if (!e.currentTarget.open) setPicking(false); }}>
              <summary>Count setup <span className="muted">{layout ? LAYOUTS.find(([id]) => id === layout)?.[1] : `Custom, ${squaresWord(d.counted.length)}`}</span></summary>
              <p className="muted small">Which of the nine large squares you count.</p>
              <div className="hc-chips" role="group" aria-label="Squares to count">
                {LAYOUTS.map(([id, label]) => (
                  <button key={id} type="button" className={layout === id ? "on" : ""} aria-pressed={layout === id} onClick={() => { setPicking(false); void count([...HAEMO_LAYOUTS[id]]); }}>{label}</button>
                ))}
                <button type="button" className={layout === null ? "on" : ""} aria-pressed={layout === null} onClick={() => setPicking(true)}>Custom</button>
              </div>
            </details>
          )}

          <div className="field bench-qty hc-dilution">
            <span>Dilution factor</span>
            <span className="hc-ratio">
              <span className="bench-unit-fixed" aria-hidden>1 :</span>
              <input inputMode="decimal" autoComplete="off" aria-label="Dilution factor" aria-invalid={(!blank(d.dilution) && num(d.dilution) === null) || undefined} value={d.dilution} placeholder="2" onChange={(e) => set({ dilution: e.target.value })} />
            </span>
            <span className="muted small">2 for one part cells to one part trypan blue, 1 if undiluted.</span>
          </div>

          <details className="hc-fold" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
            <summary>Advanced</summary>
            <label className="toggle hc-toggle">
              <input type="checkbox" checked={d.countDead} onChange={(e) => set({ countDead: e.target.checked })} /> Count dead cells (stained)
            </label>
            <Quantity label="Suspension volume (optional)" units={VOLUME_UNITS} value={d.volume} onChange={(volume) => set({ volume })} />
          </details>
        </Panel>

        <Panel title="Result" className="bench-results">
          <Reason outcome={out} />
          {r && (
            <>
              <Result strong label="Live cells" q={{ value: r.livePerMl, unit: "cells/mL" }} />
              <Stat label="Average per square" value={r.meanDead === null ? fmt(r.meanLive) : `${fmt(r.meanLive)} live, ${fmt(r.meanDead)} dead`} />
              <Stat label="Total counted" value={`${r.countedDead === null ? `${fmt(r.countedLive)} ${r.countedLive === 1 ? "cell" : "cells"}` : `${fmt(r.countedLive)} live, ${fmt(r.countedDead)} dead`} in ${squaresWord(r.squares)}`} />
              {r.deadPerMl !== null && <Result label="All cells (live + dead)" q={{ value: r.totalPerMl, unit: "cells/mL" }} />}
              {d.countDead && <Stat label="Viability" value={r.viability === null ? "—" : `${fmt(r.viability, 3)} %`} />}
              {r.totalLiveCells !== null && <Stat label="Live cells in the suspension" value={fmt(r.totalLiveCells)} />}
              {r.totalCells !== null && r.deadPerMl !== null && <Stat label="All cells in the suspension" value={fmt(r.totalCells)} />}
            </>
          )}
          <details className="hc-fold" open={notes ?? warnings > 0} onToggle={(e) => { if (e.currentTarget.open !== (notes ?? warnings > 0)) setNotes(e.currentTarget.open); }}>
            <summary>Counting notes {warnings > 0 && <span className="hc-badge">{warnings === 1 ? "1 warning" : `${warnings} warnings`}</span>}</summary>
            {r?.warning && (
              <p className="notice bench-warn" role="status">
                {r.warning === "low"
                  ? `Fewer than ${COUNT_RANGE.min} cells per square on average: the count is unreliable. Count more squares or use a more concentrated sample.`
                  : `More than ${COUNT_RANGE.max} cells per square on average: the count is unreliable. Dilute the sample and count again.`}
              </p>
            )}
            {r?.uneven && <p className="notice bench-warn" role="status">The squares differ a lot from each other: the suspension was probably not mixed evenly. Mix it and count again.</p>}
            <p className="muted small">Live cells/mL = average live count per square × dilution × 10⁴ (each large square holds 0.1 µL).</p>
            <p className="muted small">A count is most reliable at {COUNT_RANGE.min} to {COUNT_RANGE.max} cells per square.{total ? "" : " Squares with no count are left out of the average."}</p>
          </details>
          <div className="row wrap bench-actions">
            <button type="button" disabled={!r || !(r.livePerMl > 0)} onClick={useInDilution}>Use in cell dilution <ArrowRight size={14} /></button>
          </div>
        </Panel>
      </div>
      {focusing && focus !== null && (
        <FocusCount counted={d.counted} at={Math.min(focus, d.counted.length - 1)} onAt={setFocus} live={d.live} dead={d.dead} countDead={d.countDead}
          kind={active} onKind={setKind} dots={dots} onTap={tap} onRemove={remove} onClose={() => setFocus(null)} />
      )}
    </ToolFrame>
  );
}

/** The totals worked out from the squares, without wiping a field when there is nothing to put in it. */
function keep(sums: { total: string; totalDead: string; totalSquares: string }, d: HaemoData): Partial<HaemoData> {
  if (blank(sums.total)) return {};
  return { total: sums.total, totalSquares: sums.totalSquares, totalDead: blank(sums.totalDead) ? d.totalDead : sums.totalDead };
}
