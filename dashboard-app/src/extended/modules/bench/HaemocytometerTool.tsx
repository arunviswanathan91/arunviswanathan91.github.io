import { useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { go } from "../../lib/route.ts";
import { COUNT_RANGE, VOLUME_UNITS, bestUnit, fmt, haemocytometer, num } from "./calc.ts";
import { haemoData, toQ, type HaemoData } from "./model.ts";
import { NumField, Panel, Quantity, Reason, Result, Stat, ToolFrame, type ToolProps } from "./parts.tsx";

const MAX_SQUARES = 25;

export function HaemocytometerTool({ item }: ToolProps) {
  const [d, setD] = useState(() => haemoData(item?.data));
  const set = (patch: Partial<HaemoData>) => setD((x) => ({ ...x, ...patch }));
  const setCount = (key: "live" | "dead", k: number, value: string) => set({ [key]: d[key].map((v, j) => (j === k ? value : v)) });
  const out = haemocytometer({
    live: d.live.map(num),
    dead: d.countDead ? d.dead.map(num) : undefined,
    dilution: num(d.dilution),
    volume: toQ(d.volume),
  });
  const r = out.result;
  // A count that is typed but not a number is not silently left out of the mean.
  const unread = [...d.live, ...(d.countDead ? d.dead : [])].some((v) => v.trim() !== "" && num(v) === null);
  function useInDilution() {
    if (!r || !(r.livePerMl > 0)) return;
    const best = bestUnit(r.livePerMl, "cells/mL");
    go("bench/cells", { c1: String(Number(best.value.toPrecision(6))), c1u: best.unit });
  }

  return (
    <ToolFrame tool="haemocytometer" item={item} data={d}>
      <div className="bench-grid">
        <Panel title="Counts">
          <p className="muted small">Cells in each large square (1 mm × 1 mm). Leave a square blank to leave it out.</p>
          <div className="bench-squares">
            {d.live.map((v, k) => (
              <div key={k} className="bench-square">
                <span className="bench-square-head">
                  <span>Square {k + 1}</span>
                  {d.live.length > 1 && (
                    <button type="button" className="icon" aria-label={`Remove square ${k + 1}`} onClick={() => set({ live: d.live.filter((_, j) => j !== k), dead: d.dead.filter((_, j) => j !== k) })}><X size={14} /></button>
                  )}
                </span>
                <input inputMode="numeric" autoComplete="off" aria-label={`Square ${k + 1}: ${d.countDead ? "live cells" : "cells"}`} aria-invalid={(v.trim() !== "" && num(v) === null) || undefined} placeholder={d.countDead ? "Live" : "Count"} value={v} onChange={(e) => setCount("live", k, e.target.value)} />
                {d.countDead && (
                  <input inputMode="numeric" autoComplete="off" aria-label={`Square ${k + 1}: dead cells`} aria-invalid={(d.dead[k].trim() !== "" && num(d.dead[k]) === null) || undefined} placeholder="Dead" value={d.dead[k] ?? ""} onChange={(e) => setCount("dead", k, e.target.value)} />
                )}
              </div>
            ))}
          </div>
          <div className="row wrap bench-actions">
            <button type="button" disabled={d.live.length >= MAX_SQUARES} onClick={() => set({ live: [...d.live, ""], dead: [...d.dead, ""] })}><Plus size={14} /> Add square</button>
            <label className="toggle">
              <input type="checkbox" checked={d.countDead} onChange={(e) => set({ countDead: e.target.checked })} /> Count dead cells (stained)
            </label>
          </div>
          <div className="bench-fields">
            <NumField label="Dilution factor" value={d.dilution} placeholder="2 for 1:1 trypan blue, 1 if undiluted" onChange={(dilution) => set({ dilution })} />
            <Quantity label="Suspension volume (optional)" units={VOLUME_UNITS} value={d.volume} onChange={(volume) => set({ volume })} />
          </div>
        </Panel>
        <Panel title="Result" className="bench-results">
          {unread ? <p className="error" role="alert">One of the counts is not a number.</p> : <Reason outcome={out} />}
          {r && !unread && (
            <>
              <Result strong label="Live cells" q={{ value: r.livePerMl, unit: "cells/mL" }} />
              {r.deadPerMl !== null && <Result label="All cells (live + dead)" q={{ value: r.totalPerMl, unit: "cells/mL" }} />}
              {d.countDead && <Stat label="Viability" value={r.viability === null ? "—" : `${fmt(r.viability, 3)} %`} />}
              <Stat label={`Mean per square (${r.squares} counted)`} value={r.meanDead === null ? fmt(r.meanLive) : `${fmt(r.meanLive)} live, ${fmt(r.meanDead)} dead`} />
              {r.totalLiveCells !== null && <Stat label="Live cells in the suspension" value={fmt(r.totalLiveCells)} />}
              {r.totalCells !== null && r.deadPerMl !== null && <Stat label="All cells in the suspension" value={fmt(r.totalCells)} />}
              {r.warning && (
                <p className="notice bench-warn" role="status">
                  {r.warning === "low"
                    ? `Fewer than ${COUNT_RANGE.min} cells per square on average: the count is unreliable. Count more squares or use a more concentrated sample.`
                    : `More than ${COUNT_RANGE.max} cells per square on average: the count is unreliable. Dilute the sample and count again.`}
                </p>
              )}
              <p className="muted small">Live cells/mL = mean live count × dilution × 10⁴ (each square holds 0.1 µL).</p>
              <div className="row wrap bench-actions">
                <button type="button" disabled={!(r.livePerMl > 0)} onClick={useInDilution}>Use in cell dilution <ArrowRight size={14} /></button>
              </div>
            </>
          )}
        </Panel>
      </div>
    </ToolFrame>
  );
}
