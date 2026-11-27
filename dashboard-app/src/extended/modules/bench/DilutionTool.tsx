import { useId, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { downloadCsv } from "../../lib/download.ts";
import { Tabs } from "../../components/ui.tsx";
import {
  MASSVOL_UNITS, MAX_SERIAL_STEPS, MOLAR_UNITS, PERCENT_UNIT, VOLUME_UNITS, bestUnit, convert, dilution, dimensionOf, fmt, fmtQ, makeSolution, num, parseRatio,
  reverseDilution, serialSeries, stepFactor, stepsToReach, superscript, unitLabel,
  type DilutionField, type DilutionResult, type Outcome, type Qty, type SeriesResult, type SeriesTube,
} from "./calc.ts";
import { CONC_DEFAULT, CONC_TYPES, CONC_UNITS, concTypeOf, dilutionData, toQ, type ConcType, type DilutionData, type DilutionTab, type QText } from "./model.ts";
import { CopyButton, Instruction, NumField, Panel, Quantity, Reason, Result, RoundToggle, SIG, Stat, ToolFrame, Working, guard, type ToolProps } from "./parts.tsx";

const TABS: [DilutionTab, string][] = [["dilution", "Dilution"], ["serial", "Serial dilution"], ["reverse", "Reverse dilution"], ["make", "Make solution"]];
type Set = (patch: Partial<DilutionData>) => void;
/** A quantity exactly as it goes into a calculation: no rounding beyond floating-point noise, unit as typed. */
const exact = (q: Qty) => fmtQ(q, SIG.full, false);

export function DilutionTool({ item }: ToolProps) {
  const [d, setD] = useState(() => dilutionData(item?.data));
  const [round, setRound] = useState(true);
  const set: Set = (patch) => setD((x) => ({ ...x, ...patch }));
  const type = concTypeOf(d.c1.unit);
  const units = CONC_UNITS[type];
  /** Switching the kind of concentration keeps the numbers and swaps the units, on every tab that dilutes. */
  function setType(next: ConcType) {
    if (next === type) return;
    const [stock, final] = CONC_DEFAULT[next];
    set({ c1: { ...d.c1, unit: stock }, c2: { ...d.c2, unit: final }, start: { ...d.start, unit: stock }, target: { ...d.target, unit: final }, rc1: { ...d.rc1, unit: stock } });
  }
  const sig = round ? SIG.rounded : SIG.full;
  const shared = { d, set, units, sig, round: <RoundToggle round={round} onChange={setRound} /> };

  return (
    <ToolFrame tool="dilution" item={item} data={d} saveLabel="Save calculation">
      <Tabs value={d.tab} options={TABS} onChange={(tab) => set({ tab })} />
      {d.tab !== "make" && (
        <div className="chip-filter bench-types" role="group" aria-label="Concentration in">
          {CONC_TYPES.map(([id, label]) => <button key={id} type="button" aria-pressed={type === id} className={type === id ? "on" : ""} onClick={() => setType(id)}>{label}</button>)}
        </div>
      )}
      {d.tab === "dilution" && <Single {...shared} />}
      {d.tab === "serial" && <Serial {...shared} />}
      {d.tab === "reverse" && <Reverse {...shared} />}
      {d.tab === "make" && <Make {...shared} />}
    </ToolFrame>
  );
}

interface TabProps { d: DilutionData; set: Set; units: string[]; sig: number; round: ReactNode }

// ── Dilution: C1·V1 = C2·V2 ──────────────────────────────────────────────────

export interface FourLabels { c1: string; v1: string; c2: string; v2: string }
const SOLUTION_LABELS: FourLabels = { c1: "Stock concentration (C1)", v1: "Volume of stock (V1)", c2: "Target concentration (C2)", v2: "Final volume (V2)" };
type Four = Record<DilutionField, QText>;

function Single({ d, set, units, sig, round }: TabProps) {
  const out = guard(dilution({ c1: toQ(d.c1), v1: toQ(d.v1), c2: toQ(d.c2), v2: toQ(d.v2) }), d.c1.value, d.v1.value, d.c2.value, d.v2.value);
  return (
    <div className="bench-grid">
      <Panel title="Solution">
        <p className="muted small">Enter the stock and target concentrations and the final volume. Any one of the four can be the blank instead: it is calculated.</p>
        <FourFields labels={SOLUTION_LABELS} units={units} value={d} onChange={set} out={out} />
      </Panel>
      <FourResult labels={SOLUTION_LABELS} out={out} stock="stock" diluent="solvent" sig={sig} round={round} />
    </div>
  );
}

/** The four fields of C1·V1 = C2·V2. The blank one shows its answer as greyed text. */
export function FourFields({ labels, units, value, onChange, out }: { labels: FourLabels; units: string[]; value: Four; onChange: (patch: Partial<Four>) => void; out: Outcome<DilutionResult> }) {
  const field = (f: DilutionField) => (
    <Quantity
      label={labels[f]}
      units={f === "v1" || f === "v2" ? VOLUME_UNITS : units}
      value={value[f]}
      placeholder={out.result?.solved === f ? `= ${fmt(out.result[f].value)}` : undefined}
      onChange={(v) => onChange({ [f]: v })}
    />
  );
  return <div className="bench-fields">{field("c1")}{field("c2")}{field("v2")}{field("v1")}</div>;
}

const SOLVE: Record<DilutionField, [string, (r: DilutionResult) => string]> = {
  v1: ["V1 = C2 × V2 ÷ C1", (r) => `${exact(r.c2)} × ${exact(r.v2)} ÷ ${exact(r.c1)}`],
  v2: ["V2 = C1 × V1 ÷ C2", (r) => `${exact(r.c1)} × ${exact(r.v1)} ÷ ${exact(r.c2)}`],
  c2: ["C2 = C1 × V1 ÷ V2", (r) => `${exact(r.c1)} × ${exact(r.v1)} ÷ ${exact(r.v2)}`],
  c1: ["C1 = C2 × V2 ÷ V1", (r) => `${exact(r.c2)} × ${exact(r.v2)} ÷ ${exact(r.v1)}`],
};

/** The answer, the diluent, what to do, the two tubes and the working; or why it cannot be done. */
export function FourResult({ labels, out, stock, diluent, sig = SIG.rounded, round }: { labels: FourLabels; out: Outcome<DilutionResult>; stock: string; diluent: string; sig?: number; round?: ReactNode }) {
  const r = out.result;
  return (
    <Panel className="bench-results">
      <div className="section-head"><h3>Result</h3>{round}</div>
      <Reason outcome={out} />
      {r && (
        <>
          <Result strong label={labels[r.solved]} q={r[r.solved]} sig={sig} />
          {r.solved !== "v1" && <Result label={labels.v1} q={r.v1} sig={sig} />}
          <Result strong={r.solved === "v1"} label={`Volume of ${diluent}`} q={r.diluent} sig={sig} />
          <Stat label="Dilution" value={`1 in ${fmt(r.fold, sig)}`} />
          <Instruction>
            {r.diluent.value > 0
              ? `${fmtQ(r.v1, sig)} of ${stock} in ${fmtQ(r.diluent, sig)} of ${diluent}: ${fmtQ(r.v2, sig)} at ${fmtQ(r.c2, sig, false)}.`
              : `Use ${fmtQ(r.v1, sig)} of ${stock} as it is: it is already at ${fmtQ(r.c2, sig, false)}.`}
          </Instruction>
          <TwoTubes c1={fmtQ(r.c1, sig, false)} v1={fmtQ(r.v1, sig)} c2={fmtQ(r.c2, sig, false)} v2={fmtQ(r.v2, sig)} added={`+ ${fmtQ(r.diluent, sig)} ${diluent}`} share={1 / r.fold} />
          <Working lines={[
            "C1 × V1 = C2 × V2",
            `${SOLVE[r.solved][0]} = ${SOLVE[r.solved][1](r)} = ${exact(r[r.solved])}`,
            `${diluent[0].toUpperCase()}${diluent.slice(1)} = V2 − V1 = ${exact(r.v2)} − ${exact(r.v1)} = ${exact(r.diluent)}`,
          ]} />
        </>
      )}
    </Panel>
  );
}

// ── Reverse dilution ─────────────────────────────────────────────────────────

function Reverse({ d, set, units, sig, round }: TabProps) {
  const out = guard(reverseDilution({ c1: toQ(d.rc1), stock: toQ(d.rStock), solvent: toQ(d.rSolvent) }), d.rc1.value, d.rStock.value, d.rSolvent.value);
  const r = out.result;
  return (
    <div className="bench-grid">
      <Panel title="What is mixed">
        <div className="bench-fields">
          <Quantity label="Stock concentration (C1)" units={units} value={d.rc1} onChange={(rc1) => set({ rc1 })} />
          <Quantity label="Volume of stock (V1)" units={VOLUME_UNITS} value={d.rStock} onChange={(rStock) => set({ rStock })} />
          <Quantity label="Volume of solvent" units={VOLUME_UNITS} value={d.rSolvent} onChange={(rSolvent) => set({ rSolvent })} />
        </div>
      </Panel>
      <Panel className="bench-results">
        <div className="section-head"><h3>Result</h3>{round}</div>
        <Reason outcome={out} />
        {r && (
          <>
            <Result strong label="Final concentration (C2)" q={r.c2} sig={sig} />
            <Result strong label="Final volume (V2)" q={r.v2} sig={sig} />
            <Stat label="Dilution" value={`1 in ${fmt(r.fold, sig)}`} />
            <Instruction>Add {fmtQ(r.solvent, sig)} of solvent to {fmtQ(r.v1, sig)} of stock: {fmtQ(r.v2, sig)} at {fmtQ(r.c2, sig)}.</Instruction>
            <TwoTubes c1={fmtQ(r.c1, sig, false)} v1={fmtQ(r.v1, sig)} c2={fmtQ(r.c2, sig)} v2={fmtQ(r.v2, sig)} added={`+ ${fmtQ(r.solvent, sig)} solvent`} share={1 / r.fold} />
            <Working lines={[
              `V2 = V1 + solvent = ${exact(r.v1)} + ${exact(r.solvent)} = ${exact(r.v2)}`,
              `C2 = C1 × V1 ÷ V2 = ${exact(r.c1)} × ${exact(r.v1)} ÷ ${exact(r.v2)} = ${exact(r.c2)}`,
            ]} />
          </>
        )}
      </Panel>
    </div>
  );
}

// ── Make solution ────────────────────────────────────────────────────────────

const MAKE_UNITS = [...MOLAR_UNITS, ...MASSVOL_UNITS, PERCENT_UNIT];
const WV = { [PERCENT_UNIT]: "% (w/v)" };

function Make({ d, set, sig, round }: TabProps) {
  const dim = dimensionOf(d.mConc.unit);
  const molar = dim === "molar";
  const mw = molar ? num(d.mw) : null; // a molecular weight left in the box is not used where none is needed
  const out = guard(makeSolution({ mw, concentration: toQ(d.mConc), volume: toQ(d.mVolume) }), molar ? d.mw : "", d.mConc.value, d.mVolume.value);
  const r = out.result;
  const conc = toQ(d.mConc), volume = toQ(d.mVolume);
  const working = (): string[] => {
    if (!r || conc.value === null || volume.value === null) return [];
    const litres = `${fmt(convert(volume.value, volume.unit, "L"), SIG.full)} L`;
    if (molar) return ["Mass = concentration × volume × molecular weight", `= ${fmt(convert(conc.value, conc.unit, "M"), SIG.full)} mol/L × ${litres} × ${fmt(mw, SIG.full)} g/mol = ${exact(r.mass)}`];
    if (dim === "percent") return ["Mass = concentration × volume, with 1 % (w/v) = 10 g/L", `= ${fmt(conc.value * 10, SIG.full)} g/L × ${litres} = ${exact(r.mass)}`];
    return ["Mass = concentration × volume", `= ${fmt(convert(conc.value, conc.unit, "g/L"), SIG.full)} g/L × ${litres} = ${exact(r.mass)}`];
  };
  return (
    <div className="bench-grid">
      <Panel title="Solution to make">
        <div className="bench-fields">
          <Quantity label="Target concentration" units={MAKE_UNITS} names={WV} value={d.mConc} onChange={(mConc) => set({ mConc })} />
          {molar && <NumField label="Molecular weight" value={d.mw} placeholder="180.16" suffix="g/mol" onChange={(v) => set({ mw: v })} />}
          <Quantity label="Final volume" units={VOLUME_UNITS} value={d.mVolume} onChange={(mVolume) => set({ mVolume })} />
        </div>
        {!molar && <p className="muted small">No molecular weight is needed for {dim === "percent" ? "% (w/v)" : "mass per volume"}.</p>}
      </Panel>
      <Panel className="bench-results">
        <div className="section-head"><h3>Result</h3>{round}</div>
        <Reason outcome={out} />
        {r && volume.value !== null && (
          <>
            <Result strong label="Mass to weigh" q={r.mass} sig={sig} />
            {r.moles && <Result label="Amount" q={r.moles} sig={sig} />}
            <Instruction>Dissolve {fmtQ(r.mass, sig)} in solvent and make up to {fmtQ({ value: volume.value, unit: volume.unit }, sig, false)}.</Instruction>
            <p className="muted small">Dissolve in less than the final volume first, then top up: the solid takes up room too.</p>
            <Working lines={working()} />
          </>
        )}
      </Panel>
    </div>
  );
}

// ── Serial dilution ──────────────────────────────────────────────────────────

const RATIO_HELP = "Write the dilution as a ratio such as 1:10 (1 part in 10 in total) or as a factor such as 10.";
const badRatio = (text: string) => text.trim() !== "" && parseRatio(text) === null;
const stop = <T,>(reason: string, incomplete = false): Outcome<T> => ({ result: null, reason, incomplete });
const go = <T,>(result: T): Outcome<T> => ({ result, reason: "", incomplete: false });

/** The factor of every step, from whichever way the series is described. */
function stepFactors(d: DilutionData): Outcome<number[]> {
  if (d.by === "target" && d.find === "steps") {
    if (badRatio(d.ratio)) return stop(RATIO_HELP);
    const factor = parseRatio(d.ratio);
    const reach = stepsToReach({ start: toQ(d.start), target: toQ(d.target), factor });
    return reach.result && factor !== null ? go(Array<number>(reach.result.steps).fill(factor)) : stop(reach.reason, reach.incomplete);
  }
  const n = num(d.steps);
  if (d.by === "target") {
    const factor = stepFactor({ start: toQ(d.start), target: toQ(d.target), steps: n });
    return factor.result !== null && n !== null ? go(Array<number>(n).fill(factor.result)) : stop(factor.reason, factor.incomplete);
  }
  if (n === null) return stop("Enter the number of steps.", true);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SERIAL_STEPS) return stop(`The number of steps must be a whole number from 1 to ${MAX_SERIAL_STEPS}.`);
  const typed = d.perStep ? Array.from({ length: n }, (_, k) => d.ratios[k] ?? d.ratio) : Array<string>(n).fill(d.ratio);
  if (typed.some(badRatio)) return stop(RATIO_HELP);
  const factors = typed.map((t) => parseRatio(t));
  return factors.every((f): f is number => f !== null) ? go(factors) : stop("Enter the dilution for every step.", true);
}

/** "1:10²" while every step is the same round factor; otherwise the product, "1:200". */
function foldLabel(tubes: SeriesTube[], k: number, sig: number): string {
  const f = tubes[0].factor;
  const uniform = tubes.every((t) => t.factor === f) && String(f).length <= 5;
  return uniform ? `1:${f}${k > 0 ? superscript(k + 1) : ""}` : `1:${fmt(tubes[k].fold, sig)}`;
}

function Serial({ d, set, units, sig, round }: TabProps) {
  const factors = stepFactors(d);
  const findSteps = d.by === "target" && d.find === "steps";
  const series: Outcome<SeriesResult> = guard(
    factors.result ? serialSeries({ start: toQ(d.start), factors: factors.result, volume: toQ(d.volume), volumeIs: d.volumeIs }) : stop<SeriesResult>(factors.reason, factors.incomplete),
    d.start.value, d.volume.value, d.by === "target" ? d.target.value : "", findSteps ? "" : d.steps,
  );
  const r = series.result;
  const n = num(d.steps);
  const rows = d.by === "steps" && d.perStep && n !== null && Number.isInteger(n) && n >= 1 && n <= MAX_SERIAL_STEPS ? n : 0;
  const start = toQ(d.start);
  const startQty: Qty | null = start.value === null ? null : { value: start.value, unit: start.unit };
  const uniform = !!r && r.tubes.every((t) => t.factor === r.tubes[0].factor);
  /** "100 + 900 µL": transfer and diluent in one unit. */
  const pair = (t: SeriesTube) => { const b = bestUnit(t.mixed.value, t.mixed.unit); return `${fmt(convert(t.transfer.value, t.transfer.unit, b.unit), sig)} + ${fmt(convert(t.diluent.value, t.diluent.unit, b.unit), sig)} ${unitLabel(b.unit)}`; };

  const table = r ? r.tubes.map((t, k) => ({ tube: t.tube, dilution: foldLabel(r.tubes, k, sig), concentration: fmtQ(t.concentration, sig), transfer: fmtQ(t.transfer, sig), diluent: fmtQ(t.diluent, sig), left: fmtQ(t.left, sig) })) : [];
  const text = r ? [
    `Serial dilution from ${startQty ? fmtQ(startQty, sig, false) : "?"}: ${r.tubes.length} step${r.tubes.length === 1 ? "" : "s"}, final ${fmtQ(r.final, sig)}, ${fmtQ(r.totalDiluent, sig)} of diluent in all`,
    ...table.map((t) => `Tube ${t.tube}: ${t.dilution}, ${t.concentration} (${t.transfer} transfer + ${t.diluent} diluent; ${t.left} left)`),
  ].join("\n") : "";

  return (
    <div className="bench-grid">
      <Panel title="Series">
        <div className="bench-switch">
          <span className="muted small">Dilution by</span>
          <div className="chip-filter" role="group" aria-label="Dilution by">
            <button type="button" aria-pressed={d.by === "steps"} className={d.by === "steps" ? "on" : ""} onClick={() => set({ by: "steps" })}>Steps</button>
            <button type="button" aria-pressed={d.by === "target"} className={d.by === "target" ? "on" : ""} onClick={() => set({ by: "target" })}>Target conc.</button>
          </div>
        </div>
        <div className="bench-fields">
          <Quantity label="Starting concentration" units={units} value={d.start} onChange={(v) => set({ start: v })} />
          {d.by === "target" && <Quantity label="Target (final) concentration" units={units} value={d.target} onChange={(target) => set({ target })} />}
          {d.by === "target" && (
            <label className="field">
              <span>Work out</span>
              <select value={d.find} onChange={(e) => set({ find: e.target.value as DilutionData["find"] })}>
                <option value="factor">Dilution per step, from the number of steps</option>
                <option value="steps">Number of steps, from the dilution per step</option>
              </select>
            </label>
          )}
          {!findSteps && <NumField label="Number of steps" whole value={d.steps} placeholder="6" onChange={(steps) => set({ steps })} />}
          {((d.by === "steps" && !d.perStep) || findSteps) && <RatioField label="Dilution per step" value={d.ratio} onChange={(ratio) => set({ ratio })} />}
          <Quantity label={d.volumeIs === "transfer" ? "Transfer volume" : "Volume per tube"} units={VOLUME_UNITS} value={d.volume} placeholder="100" onChange={(volume) => set({ volume })} />
          <label className="field">
            <span>That volume is</span>
            <select value={d.volumeIs} onChange={(e) => set({ volumeIs: e.target.value as DilutionData["volumeIs"] })}>
              <option value="transfer">Carried over at each step</option>
              <option value="tube">In each tube after mixing</option>
            </select>
          </label>
        </div>
        {d.by === "steps" && (
          <div className="row wrap bench-actions">
            <label className="toggle"><input type="checkbox" checked={d.perStep} onChange={(e) => set({ perStep: e.target.checked })} /> Different dilution for every step</label>
          </div>
        )}
        {rows > 0 && (
          <div className="bench-fields bench-ratios">
            {Array.from({ length: rows }, (_, k) => (
              <RatioField key={k} label={`Step ${k + 1}`} value={d.ratios[k] ?? d.ratio} onChange={(v) => set({ ratios: Array.from({ length: Math.max(rows, d.ratios.length) }, (_, j) => (j === k ? v : d.ratios[j] ?? d.ratio)) })} />
            ))}
          </div>
        )}
        <p className="muted small bench-note">1:10 means 1 part carried into 10 parts in total (1 + 9). A plain factor such as 10 means the same.</p>
      </Panel>

      <Panel className="bench-results">
        <div className="section-head"><h3>Result</h3>{round}</div>
        <Reason outcome={series} />
        {r && (
          <>
            {d.by === "target" && !findSteps && <Stat strong label="Dilution per step" value={`1:${fmt(r.tubes[0].factor, sig)}`} />}
            {findSteps && <Stat strong label="Steps needed" value={r.tubes.length} />}
            <Result strong label={findSteps ? "Concentration reached" : "Final concentration"} q={r.final} sig={sig} />
            <Result label="Diluent needed in all" q={r.totalDiluent} sig={sig} />
            {uniform && <Stat label="Each step: transfer + diluent" value={pair(r.tubes[0])} />}
            <Instruction>
              {uniform
                ? `Put ${fmtQ(r.tubes[0].diluent, sig)} of diluent in each of ${r.tubes.length} tube${r.tubes.length === 1 ? "" : "s"}. Carry ${fmtQ(r.tubes[0].transfer, sig)} of the starting solution into tube 1 and mix${r.tubes.length > 1 ? `, then ${fmtQ(r.tubes[0].transfer, sig)} from each tube into the next, mixing every time.` : "."}`
                : "Put each tube’s diluent in first (see the table), then carry the transfer volume from the starting solution into tube 1 and on from tube to tube, mixing every time."}
            </Instruction>
            <SerialTubes start={startQty ? fmtQ(startQty, sig, false) : ""} tubes={r.tubes.map((t, k) => ({ fold: foldLabel(r.tubes, k, sig), concentration: fmtQ(t.concentration, sig), diluent: fmtQ(t.diluent, sig), transfer: fmtQ(t.transfer, sig) }))} />
            <div className="table-scroll">
              <table className="bench-table bench-series">
                <thead><tr><th>Tube</th><th>Dilution</th><th className="num">Concentration</th><th className="num">Transfer + diluent</th><th className="num">Left in tube</th></tr></thead>
                <tbody>
                  {r.tubes.map((t, k) => (
                    <tr key={t.tube}>
                      <td>{t.tube}</td>
                      <td>{table[k].dilution}</td>
                      <td className="num">{table[k].concentration}</td>
                      <td className="num">{pair(t)}</td>
                      <td className="num">{table[k].left}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small bench-note">Every tube except the last gives its transfer to the next one, so it ends with transfer + diluent − transfer; the last tube keeps its full volume.</p>
            <Working lines={[
              "Concentration in tube n = start ÷ (dilution of step 1 × … × dilution of step n)",
              ...(d.by === "target" && !findSteps ? [`Dilution per step = (start ÷ target)^(1 ÷ steps) = ${fmt(r.tubes[0].factor, SIG.full)}`] : []),
              d.volumeIs === "transfer" ? "Diluent per step = transfer × (dilution − 1)" : "Transfer = tube volume ÷ dilution; diluent = tube volume − transfer",
              ...r.tubes.slice(0, 3).map((t) => `Tube ${t.tube}: ${startQty ? exact(startQty) : "start"} ÷ ${fmt(t.fold, SIG.full)} = ${exact(t.concentration)}; ${exact(t.transfer)} + ${exact(t.diluent)}`),
              ...(r.tubes.length > 3 ? ["…"] : []),
            ]} />
            <div className="row wrap bench-actions">
              <CopyButton text={text} />
              <button type="button" onClick={() => downloadCsv("serial-dilution", [["Tube", "Dilution", "Concentration", "Transfer", "Diluent", "Left in tube"], ...table.map((t) => [t.tube, t.dilution, t.concentration, t.transfer, t.diluent, t.left])])}><Download size={14} /> CSV</button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function RatioField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input autoComplete="off" autoCapitalize="off" aria-invalid={badRatio(value) || undefined} value={value} placeholder="1:10" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ── Diagrams ─────────────────────────────────────────────────────────────────

/** A round-bottomed tube, open at the top. */
const tube = (x: number, y: number, w: number, h: number) => `M${x} ${y}V${y + h - w / 2}A${w / 2} ${w / 2} 0 0 0 ${x + w} ${y + h - w / 2}V${y}`;
const TUBE_W = 40, TUBE_H = 92, TUBE_Y = 16, FULL = 0.84;
/** How strong the colour is for a share of the starting strength: it fades, but never to nothing. */
const tint = (share: number) => Math.max(0.14, Math.min(0.9, 0.9 * Math.sqrt(Math.max(0, share))));

function Liquid({ id, x, level, opacity }: { id: string; x: number; level: number; opacity: number }) {
  const h = TUBE_H * FULL * Math.max(0.05, Math.min(1, level));
  return (
    <>
      <clipPath id={id}><path d={`${tube(x, TUBE_Y, TUBE_W, TUBE_H)}Z`} /></clipPath>
      <rect className="liquid" clipPath={`url(#${id})`} x={x} y={TUBE_Y + TUBE_H - h} width={TUBE_W} height={h} opacity={opacity} />
      <path className="glass" d={tube(x, TUBE_Y, TUBE_W, TUBE_H)} />
    </>
  );
}

/** Stock and diluted solution side by side: the stock's level is its share of the final volume. */
function TwoTubes({ c1, v1, c2, v2, added, share }: { c1: string; v1: string; c2: string; v2: string; added: string; share: number }) {
  const id = useId().replace(/:/g, "");
  const a = 50, b = 230;
  return (
    <svg className="bench-tubes" viewBox="0 0 320 160" role="img" aria-label={`${v1} of stock at ${c1} becomes ${v2} at ${c2}`}>
      <Liquid id={`${id}a`} x={a} level={share} opacity={0.9} />
      <Liquid id={`${id}b`} x={b} level={1} opacity={tint(share)} />
      <line className="arrow" x1={a + TUBE_W + 14} x2={b - 20} y1={66} y2={66} />
      <path className="arrowhead" d={`M${b - 20} 61l9 5l-9 5Z`} />
      <text className="note" x={(a + TUBE_W + b) / 2} y={56} textAnchor="middle">{added}</text>
      <text className="name" x={a + TUBE_W / 2} y={126} textAnchor="middle">Stock</text>
      <text className="value" x={a + TUBE_W / 2} y={139} textAnchor="middle">C1 {c1}</text>
      <text className="value" x={a + TUBE_W / 2} y={152} textAnchor="middle">V1 {v1}</text>
      <text className="name" x={b + TUBE_W / 2} y={126} textAnchor="middle">Diluted</text>
      <text className="value" x={b + TUBE_W / 2} y={139} textAnchor="middle">C2 {c2}</text>
      <text className="value" x={b + TUBE_W / 2} y={152} textAnchor="middle">V2 {v2}</text>
    </svg>
  );
}

const STEP = 124;

/** The series as a row of tubes, the colour fading with each dilution. Wider than a phone: it scrolls in its own box. */
function SerialTubes({ start, tubes }: { start: string; tubes: { fold: string; concentration: string; diluent: string; transfer: string }[] }) {
  const id = useId().replace(/:/g, "");
  const width = STEP * (tubes.length + 1);
  const x = (k: number) => k * STEP + (STEP - TUBE_W) / 2;
  return (
    <div className="bench-scroll" tabIndex={0} role="group" aria-label="The dilution series, tube by tube">
      <svg className="bench-tubes serial" width={width} height={170} viewBox={`0 0 ${width} 170`} role="img" aria-label={`Starting solution and ${tubes.length} dilution${tubes.length === 1 ? "" : "s"}`}>
        <Liquid id={`${id}s`} x={x(0)} level={1} opacity={0.9} />
        <text className="name" x={x(0) + TUBE_W / 2} y={126} textAnchor="middle">Start</text>
        <text className="value" x={x(0) + TUBE_W / 2} y={139} textAnchor="middle">{start}</text>
        {tubes.map((t, k) => {
          const cx = x(k + 1) + TUBE_W / 2;
          return (
            <g key={k}>
              <line className="arrow" x1={x(k) + TUBE_W + 8} x2={x(k + 1) - 16} y1={50} y2={50} />
              <path className="arrowhead" d={`M${x(k + 1) - 16} 45l9 5l-9 5Z`} />
              <text className="note" x={(x(k) + TUBE_W + x(k + 1)) / 2} y={40} textAnchor="middle">{t.transfer}</text>
              <Liquid id={`${id}t${k}`} x={x(k + 1)} level={1} opacity={tint(((tubes.length - k) / (tubes.length + 1)) ** 2)} />
              <text className="name" x={cx} y={126} textAnchor="middle">{t.fold}</text>
              <text className="value" x={cx} y={139} textAnchor="middle">{t.concentration}</text>
              <text className="value" x={cx} y={152} textAnchor="middle">+ {t.diluent}</text>
              <text className="note" x={cx} y={165} textAnchor="middle">diluent</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
