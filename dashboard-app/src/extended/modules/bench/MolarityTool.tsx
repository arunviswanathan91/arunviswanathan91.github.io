import { useState } from "react";
import { Tabs } from "../../components/ui.tsx";
import { MASS_UNITS, MOLAR_UNITS, VOLUME_UNITS, concentrationFrom, fmt, fmtQ, massToWeigh, molesFromMass, num } from "./calc.ts";
import { molarityData, toQ, type MolarityData } from "./model.ts";
import { Instruction, NumField, Panel, Quantity, Reason, Result, ToolFrame, guard, type ToolProps } from "./parts.tsx";

const TABS: [MolarityData["tab"], string][] = [["mass", "Mass to weigh"], ["moles", "Moles"], ["conc", "Concentration"]];

export function MolarityTool({ item }: ToolProps) {
  const [d, setD] = useState(() => molarityData(item?.data));
  const set = (patch: Partial<MolarityData>) => setD((x) => ({ ...x, ...patch }));
  const mw = num(d.mw);
  const weigh = guard(massToWeigh({ concentration: toQ(d.conc), volume: toQ(d.volume), mw }), d.mw, d.conc.value, d.volume.value);
  const moles = guard(molesFromMass({ mass: toQ(d.mass), mw }), d.mw, d.mass.value);
  const conc = guard(concentrationFrom({ mass: toQ(d.mass), volume: toQ(d.volume), mw }), d.mw, d.mass.value, d.volume.value);
  const mwField = <NumField label="Molecular weight" value={d.mw} placeholder="58.44" suffix="g/mol" onChange={(v) => set({ mw: v })} />;
  const volume = toQ(d.volume), concentration = toQ(d.conc);

  return (
    <ToolFrame tool="molarity" item={item} data={d}>
      <Tabs value={d.tab} options={TABS} onChange={(tab) => set({ tab })} />
      <div className="bench-grid">
        <Panel title={d.tab === "mass" ? "Solution to make" : d.tab === "moles" ? "Substance" : "Solution made"}>
          <div className="bench-fields">
            {mwField}
            {d.tab === "mass" && <Quantity label="Concentration" units={MOLAR_UNITS} value={d.conc} onChange={(v) => set({ conc: v })} />}
            {d.tab !== "mass" && <Quantity label="Mass" units={MASS_UNITS} value={d.mass} onChange={(mass) => set({ mass })} />}
            {d.tab !== "moles" && <Quantity label="Volume" units={VOLUME_UNITS} value={d.volume} onChange={(v) => set({ volume: v })} />}
          </div>
        </Panel>
        <Panel title="Result" className="bench-results">
          {d.tab === "mass" && (
            <>
              <Reason outcome={weigh} />
              {weigh.result && (
                <>
                  <Result strong label="Mass to weigh" q={weigh.result.mass} />
                  <Result label="Amount" q={weigh.result.moles} />
                  {volume.value !== null && concentration.value !== null && (
                    <Instruction>Weigh {fmtQ(weigh.result.mass)}, dissolve it, and make up to {fmtQ({ value: volume.value, unit: volume.unit }, 4, false)} for {fmtQ({ value: concentration.value, unit: concentration.unit }, 4, false)}.</Instruction>
                  )}
                  <p className="muted small">Mass = concentration × volume × molecular weight{mw !== null ? ` (${fmt(mw, 6)} g/mol)` : ""}.</p>
                </>
              )}
            </>
          )}
          {d.tab === "moles" && (
            <>
              <Reason outcome={moles} />
              {moles.result && (
                <>
                  <Result strong label="Amount" q={moles.result} />
                  <p className="muted small">Moles = mass ÷ molecular weight.</p>
                </>
              )}
            </>
          )}
          {d.tab === "conc" && (
            <>
              <Reason outcome={conc} />
              {conc.result && (
                <>
                  <Result strong label="Molar concentration" q={conc.result.molar} />
                  <Result label="Mass per volume" q={conc.result.massvol} />
                  <p className="muted small">Concentration = mass ÷ molecular weight ÷ volume.</p>
                </>
              )}
            </>
          )}
        </Panel>
      </div>
    </ToolFrame>
  );
}
