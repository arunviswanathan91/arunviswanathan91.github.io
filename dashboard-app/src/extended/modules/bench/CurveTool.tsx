import { useState, type ClipboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { fmt, linearFit, niceTicks, num, parsePairs, predictX, predictY, type Fit, type Point } from "./calc.ts";
import { curveData, type CurveData, type CurveUnknown } from "./model.ts";
import { Panel, TextField, ToolFrame, type ToolProps } from "./parts.tsx";

const bad = (text: string) => text.trim() !== "" && num(text) === null;

export function CurveTool({ item }: ToolProps) {
  const [d, setD] = useState(() => curveData(item?.data));
  const set = (patch: Partial<CurveData>) => setD((x) => ({ ...x, ...patch }));
  const setStandard = (k: number, patch: Partial<{ x: string; y: string }>) => set({ standards: d.standards.map((s, j) => (j === k ? { ...s, ...patch } : s)) });
  const setUnknown = (k: number, patch: Partial<CurveUnknown>) => set({ unknowns: d.unknowns.map((u, j) => (j === k ? { ...u, ...patch } : u)) });

  const points: Point[] = d.standards.flatMap((s) => { const x = num(s.x), y = num(s.y); return x !== null && y !== null ? [{ x, y }] : []; });
  const started = d.standards.filter((s) => s.x.trim() !== "" || s.y.trim() !== "").length;
  const fit = linearFit(points, d.origin);
  const xName = d.xLabel.trim() || "x", yName = d.yLabel.trim() || "y";
  /** Each unknown as a point on the line: the typed value and the one read off. */
  const solved = d.unknowns.map((u) => {
    const v = num(u.value);
    const other = u.given === "y" ? predictX(fit, v) : predictY(fit, v);
    return v === null || other === null ? null : u.given === "y" ? { x: other, y: v } : { x: v, y: other };
  });

  /** Two columns copied from a spreadsheet fill the table from the row they are pasted into. */
  function paste(e: ClipboardEvent<HTMLInputElement>, k: number) {
    const pairs = parsePairs(e.clipboardData.getData("text"));
    if (pairs.length === 0) return;
    e.preventDefault();
    const next = d.standards.slice(0, k);
    for (const p of pairs) next.push({ x: String(p.x), y: String(p.y) });
    set({ standards: [...next, ...d.standards.slice(k + pairs.length)] });
  }

  return (
    <ToolFrame tool="curve" item={item} data={d}>
      <div className="bench-grid">
        <Panel title="Standards">
          <div className="bench-fields">
            <TextField label="X axis" value={d.xLabel} placeholder="e.g. BSA (mg/mL)" onChange={(xLabel) => set({ xLabel })} />
            <TextField label="Y axis" value={d.yLabel} placeholder="e.g. A595" onChange={(yLabel) => set({ yLabel })} />
          </div>
          <table className="bench-table bench-entry">
            <thead><tr><th>{xName}</th><th>{yName}</th><th aria-label="Remove" /></tr></thead>
            <tbody>
              {d.standards.map((s, k) => (
                <tr key={k}>
                  <td><input inputMode="decimal" autoComplete="off" aria-label={`Standard ${k + 1}: ${xName}`} aria-invalid={bad(s.x) || undefined} value={s.x} onChange={(e) => setStandard(k, { x: e.target.value })} onPaste={(e) => paste(e, k)} /></td>
                  <td><input inputMode="decimal" autoComplete="off" aria-label={`Standard ${k + 1}: ${yName}`} aria-invalid={bad(s.y) || undefined} value={s.y} onChange={(e) => setStandard(k, { y: e.target.value })} onPaste={(e) => paste(e, k)} /></td>
                  <td><button type="button" className="icon" aria-label={`Remove standard ${k + 1}`} disabled={d.standards.length <= 1} onClick={() => set({ standards: d.standards.filter((_, j) => j !== k) })}><X size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row wrap bench-actions">
            <button type="button" onClick={() => set({ standards: [...d.standards, { x: "", y: "" }] })}><Plus size={14} /> Add standard</button>
            <label className="toggle"><input type="checkbox" checked={d.origin} onChange={(e) => set({ origin: e.target.checked })} /> Force through origin</label>
          </div>
          <p className="muted small">Paste two columns from a spreadsheet into any cell to fill the table.</p>
        </Panel>

        <Panel title="Fit" className="bench-results">
          {fit ? (
            <>
              <p className="bench-equation num">{equation(fit, xName, yName)}</p>
              <p className="muted small">R² = {fit.r2 === null ? "—" : fmt(fit.r2, 5)} · {fit.n} standard{fit.n === 1 ? "" : "s"}{started > fit.n ? ` (${started - fit.n} left out: not two numbers)` : ""} · linear least squares{fit.throughOrigin ? ", through the origin" : ""}</p>
            </>
          ) : (
            <p className="muted bench-hint">{d.origin ? "Enter at least one standard away from zero." : "Enter at least two standards with different x values."}</p>
          )}
          <CurvePlot fit={fit} standards={points} unknowns={solved.filter((p): p is Point => p !== null)} xLabel={xName} yLabel={yName} />
        </Panel>
      </div>

      <Panel title="Unknowns">
        <p className="muted small">Type a reading ({yName}) to get {xName}, or type {xName} to get the expected {yName}.</p>
        <table className="bench-table bench-entry">
          <thead><tr><th>Sample</th><th>{yName}</th><th>{xName}</th><th aria-label="Remove" /></tr></thead>
          <tbody>
            {d.unknowns.map((u, k) => {
              const p = solved[k];
              // The typed side shows what was typed; the other side shows what the line gives.
              const cell = (axis: "x" | "y") => (
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  className={u.given === axis ? "" : "bench-computed"}
                  aria-label={`Unknown ${k + 1}: ${axis === "x" ? xName : yName}${u.given === axis ? "" : " (calculated)"}`}
                  aria-invalid={(u.given === axis && bad(u.value)) || undefined}
                  value={u.given === axis ? u.value : p ? fmt(p[axis]) : ""}
                  placeholder={u.given === axis ? "" : "—"}
                  onFocus={(e) => { if (u.given !== axis) e.target.select(); }}
                  onChange={(e) => setUnknown(k, { given: axis, value: e.target.value })}
                />
              );
              return (
                <tr key={k}>
                  <td><input aria-label={`Unknown ${k + 1}: name`} value={u.name} placeholder={`Sample ${k + 1}`} onChange={(e) => setUnknown(k, { name: e.target.value })} /></td>
                  <td>{cell("y")}</td>
                  <td>{cell("x")}</td>
                  <td><button type="button" className="icon" aria-label={`Remove unknown ${k + 1}`} disabled={d.unknowns.length <= 1} onClick={() => set({ unknowns: d.unknowns.filter((_, j) => j !== k) })}><X size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row wrap bench-actions">
          <button type="button" onClick={() => set({ unknowns: [...d.unknowns, { name: "", given: "y", value: "" }] })}><Plus size={14} /> Add unknown</button>
        </div>
        {fit && points.length > 0 && solved.some((p) => p && outside(p.x, points)) && (
          <p className="notice bench-warn" role="status">An unknown lies outside the range of the standards. The line is only known to hold between them: dilute the sample or extend the standards.</p>
        )}
      </Panel>
    </ToolFrame>
  );
}

function outside(x: number, standards: Point[]): boolean {
  const xs = standards.map((p) => p.x);
  return x < Math.min(...xs) || x > Math.max(...xs);
}

function equation(fit: Fit, x: string, y: string): string {
  const b = fit.intercept;
  return `${y} = ${fmt(fit.slope, 5)} × ${x}${fit.throughOrigin || b === 0 ? "" : b < 0 ? ` − ${fmt(-b, 5)}` : ` + ${fmt(b, 5)}`}`;
}

// ── Plot ─────────────────────────────────────────────────────────────────────

const W = 360, H = 250, LEFT = 50, RIGHT = 14, TOP = 12, BOTTOM = 40;

/** Scatter of the standards with the fitted line, and each unknown marked where it sits on the line. */
function CurvePlot({ fit, standards, unknowns, xLabel, yLabel }: { fit: Fit | null; standards: Point[]; unknowns: Point[]; xLabel: string; yLabel: string }) {
  const all = [...standards, ...unknowns];
  if (all.length === 0) return null;
  const xt = niceTicks(Math.min(...all.map((p) => p.x), fit?.throughOrigin ? 0 : Infinity), Math.max(...all.map((p) => p.x)));
  const yt = niceTicks(Math.min(...all.map((p) => p.y), fit?.throughOrigin ? 0 : Infinity), Math.max(...all.map((p) => p.y)));
  if (xt.length < 2 || yt.length < 2) return null;
  const [x0, x1] = [xt[0], xt[xt.length - 1]], [y0, y1] = [yt[0], yt[yt.length - 1]];
  const sx = (x: number) => LEFT + ((x - x0) / (x1 - x0)) * (W - LEFT - RIGHT);
  const sy = (y: number) => H - BOTTOM - ((y - y0) / (y1 - y0)) * (H - TOP - BOTTOM);
  const ok = (n: number) => Number.isFinite(n);
  const lineY0 = fit ? fit.intercept + fit.slope * x0 : NaN, lineY1 = fit ? fit.intercept + fit.slope * x1 : NaN;
  return (
    <svg className="bench-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}: ${standards.length} standards${fit ? " with the fitted line" : ""}${unknowns.length ? ` and ${unknowns.length} unknown${unknowns.length === 1 ? "" : "s"}` : ""}`}>
      <defs><clipPath id="bench-plot-area"><rect x={LEFT} y={TOP} width={W - LEFT - RIGHT} height={H - TOP - BOTTOM} /></clipPath></defs>
      {yt.map((t) => (
        <g key={`y${t}`}>
          <line className="grid" x1={LEFT} x2={W - RIGHT} y1={sy(t)} y2={sy(t)} />
          <text className="tick" x={LEFT - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle">{fmt(t, 3)}</text>
        </g>
      ))}
      {xt.map((t) => (
        <g key={`x${t}`}>
          <line className="grid" x1={sx(t)} x2={sx(t)} y1={TOP} y2={H - BOTTOM} />
          <text className="tick" x={sx(t)} y={H - BOTTOM + 14} textAnchor="middle">{fmt(t, 3)}</text>
        </g>
      ))}
      <line className="axis" x1={LEFT} x2={W - RIGHT} y1={H - BOTTOM} y2={H - BOTTOM} />
      <line className="axis" x1={LEFT} x2={LEFT} y1={TOP} y2={H - BOTTOM} />
      <text className="label" x={(LEFT + W - RIGHT) / 2} y={H - 6} textAnchor="middle">{xLabel}</text>
      <text className="label" transform={`translate(12 ${(TOP + H - BOTTOM) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      <g clipPath="url(#bench-plot-area)">
        {ok(lineY0) && ok(lineY1) && <line className="fit" x1={sx(x0)} y1={sy(lineY0)} x2={sx(x1)} y2={sy(lineY1)} />}
        {unknowns.map((p, k) => (
          <g key={`u${k}`}>
            <polyline className="guide" points={`${LEFT},${sy(p.y)} ${sx(p.x)},${sy(p.y)} ${sx(p.x)},${H - BOTTOM}`} />
            <rect className="unknown" x={sx(p.x) - 4} y={sy(p.y) - 4} width={8} height={8} transform={`rotate(45 ${sx(p.x)} ${sy(p.y)})`}><title>{`Unknown: ${fmt(p.x)}, ${fmt(p.y)}`}</title></rect>
          </g>
        ))}
        {standards.map((p, k) => <circle key={`s${k}`} className="standard" cx={sx(p.x)} cy={sy(p.y)} r={3.5}><title>{`Standard: ${fmt(p.x)}, ${fmt(p.y)}`}</title></circle>)}
      </g>
      <g className="legend" transform={`translate(${LEFT + 8} ${TOP + 10})`}>
        <circle className="standard" cx={0} cy={0} r={3.5} /><text className="tick" x={8} y={0} dominantBaseline="middle">Standards</text>
        {unknowns.length > 0 && <><rect className="unknown" x={-4} y={10} width={8} height={8} transform="rotate(45 0 14)" /><text className="tick" x={8} y={14} dominantBaseline="middle">Unknowns</text></>}
      </g>
    </svg>
  );
}
