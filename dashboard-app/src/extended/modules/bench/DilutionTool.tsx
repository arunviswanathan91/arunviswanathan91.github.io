import { useState } from "react";
import { Tabs } from "../../components/ui.tsx";
import { VOLUME_UNITS, dilution, fmt, fmtQ, num, serialDilution, type DilutionField, type DilutionResult, type Outcome } from "./calc.ts";
import { CONC_DEFAULT, CONC_TYPES, CONC_UNITS, concTypeOf, dilutionData, toQ, type ConcType, type DilutionData, type QText } from "./model.ts";
import { Instruction, NumField, Panel, Quantity, Reason, Result, Stat, ToolFrame, guard, type ToolProps } from "./parts.tsx";

const TABS: [DilutionData["tab"], string][] = [["single", "Dilution"], ["serial", "Serial dilution"]];

export function DilutionTool({ item }: ToolProps) {
  const [d, setD] = useState(() => dilutionData(item?.data));
  const set = (patch: Partial<DilutionData>) => setD((x) => ({ ...x, ...patch }));
  const type = concTypeOf(d.c1.unit);
  const units = CONC_UNITS[type];
  /** Switching the kind of concentration keeps the numbers and swaps the units. */
  function setType(next: ConcType) {
    if (next === type) return;
    const [stock, final] = CONC_DEFAULT[next];
    set({ c1: { ...d.c1, unit: stock }, c2: { ...d.c2, unit: final }, start: { ...d.start, unit: stock } });
  }
  const out = guard(dilution({ c1: toQ(d.c1), v1: toQ(d.v1), c2: toQ(d.c2), v2: toQ(d.v2) }), d.c1.value, d.v1.value, d.c2.value, d.v2.value);

  return (
    <ToolFrame tool="dilution" item={item} data={d}>
      <Tabs value={d.tab} options={TABS} onChange={(tab) => set({ tab })} />
      <div className="chip-filter bench-types" role="group" aria-label="Concentration in">
        {CONC_TYPES.map(([id, label]) => <button key={id} type="button" aria-pressed={type === id} className={type === id ? "on" : ""} onClick={() => setType(id)}>{label}</button>)}
      </div>
      {d.tab === "single" ? (
        <div className="bench-grid">
          <Panel title="Solution">
            <p className="muted small">Fill in any three. The one you leave blank is calculated.</p>
            <FourFields labels={SOLUTION_LABELS} units={units} value={d} onChange={set} out={out} />
          </Panel>
          <FourResult labels={SOLUTION_LABELS} out={out} stock="stock" diluent="diluent" />
        </div>
      ) : (
        <Serial d={d} set={set} units={units} />
      )}
    </ToolFrame>
  );
}

export interface FourLabels { c1: string; v1: string; c2: string; v2: string }
const SOLUTION_LABELS: FourLabels = { c1: "Stock concentration (C1)", v1: "Volume of stock (V1)", c2: "Final concentration (C2)", v2: "Final volume (V2)" };
type Four = Record<DilutionField, QText>;

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
  return <div className="bench-fields">{field("c1")}{field("v1")}{field("c2")}{field("v2")}</div>;
}

/** The answer, the diluent, and what to do, or why it cannot be done. */
export function FourResult({ labels, out, stock, diluent }: { labels: FourLabels; out: Outcome<DilutionResult>; stock: string; diluent: string }) {
  const r = out.result;
  return (
    <Panel title="Result" className="bench-results">
      <Reason outcome={out} />
      {r && (
        <>
          <Result strong label={labels[r.solved]} q={r[r.solved]} />
          <Result label={`Volume of ${diluent}`} q={r.diluent} />
          <Stat label="Dilution" value={`1 in ${fmt(r.fold)}`} />
          <Instruction>
            {r.diluent.value > 0
              ? `Add ${fmtQ(r.v1)} of ${stock} to ${fmtQ(r.diluent)} of ${diluent}: ${fmtQ(r.v2)} at ${fmtQ(r.c2, 4, false)}.`
              : `Use ${fmtQ(r.v1)} of ${stock} as it is: it is already at ${fmtQ(r.c2, 4, false)}.`}
          </Instruction>
        </>
      )}
    </Panel>
  );
}

function Serial({ d, set, units }: { d: DilutionData; set: (patch: Partial<DilutionData>) => void; units: string[] }) {
  const out = guard(serialDilution({ start: toQ(d.start), factor: num(d.factor), steps: num(d.steps), volume: toQ(d.tubeVolume) }), d.start.value, d.factor, d.steps, d.tubeVolume.value);
  const r = out.result;
  return (
    <div className="bench-grid">
      <Panel title="Series">
        <div className="bench-fields">
          <Quantity label="Starting concentration" units={units} value={d.start} onChange={(start) => set({ start })} />
          <NumField label="Dilution factor" value={d.factor} placeholder="10" suffix="-fold" onChange={(factor) => set({ factor })} />
          <NumField label="Number of tubes" whole value={d.steps} placeholder="6" onChange={(steps) => set({ steps })} />
          <Quantity label="Volume per tube, after mixing" units={VOLUME_UNITS} value={d.tubeVolume} onChange={(tubeVolume) => set({ tubeVolume })} />
        </div>
      </Panel>
      <Panel title="Result" className="bench-results">
        <Reason outcome={out} />
        {r && (
          <>
            <Result strong label="Transfer into each tube" q={r.transfer} />
            <Result label="Diluent in each tube" q={r.diluent} />
            <Instruction>
              Put {fmtQ(r.diluent)} of diluent in each of {r.tubes.length} tube{r.tubes.length > 1 ? "s" : ""}. Add {fmtQ(r.transfer)} of the starting solution to tube 1 and mix
              {r.tubes.length > 1 ? `, then carry ${fmtQ(r.transfer)} from each tube into the next, mixing every time.` : "."}
            </Instruction>
            <table className="bench-table">
              <thead><tr><th>Tube</th><th>Dilution</th><th className="num">Concentration</th></tr></thead>
              <tbody>
                {r.tubes.map((t) => (
                  <tr key={t.tube}>
                    <td>{t.tube}</td>
                    <td>1 in {fmt(t.fold)}</td>
                    <td className="num">{fmtQ(t.concentration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Each tube keeps {fmtQ(r.diluent)} after the transfer; the last one keeps the full volume.</p>
          </>
        )}
      </Panel>
    </div>
  );
}
