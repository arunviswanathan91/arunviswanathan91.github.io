import { useState } from "react";
import { AMOUNT_UNITS, CELL_UNITS, MASSVOL_UNITS, MASS_UNITS, MOLAR_UNITS, VOLUME_UNITS, convert, dimensionOf, fmt, num, unitLabel } from "./calc.ts";
import { NumField, Panel, ToolFrame, type ToolProps } from "./parts.tsx";

type Kind = "volume" | "mass" | "molar" | "massvol" | "molar-massvol" | "amount" | "cells";
const KINDS: { id: Kind; label: string; units: string[]; from: string; to: string }[] = [
  { id: "volume", label: "Volume", units: VOLUME_UNITS, from: "mL", to: "µL" },
  { id: "mass", label: "Mass", units: MASS_UNITS, from: "mg", to: "µg" },
  { id: "molar", label: "Molar concentration", units: MOLAR_UNITS, from: "mM", to: "µM" },
  { id: "massvol", label: "Mass per volume", units: MASSVOL_UNITS, from: "mg/mL", to: "µg/mL" },
  { id: "molar-massvol", label: "Molar ↔ mass per volume", units: [...MOLAR_UNITS, ...MASSVOL_UNITS], from: "µM", to: "µg/mL" },
  { id: "amount", label: "Amount (moles)", units: AMOUNT_UNITS, from: "mmol", to: "µmol" },
  { id: "cells", label: "Cells per volume", units: CELL_UNITS, from: "e6 cells/mL", to: "cells/µL" },
];

/** Not saved: there is nothing to keep. */
export function ConvertTool({ item }: ToolProps) {
  const [kind, setKind] = useState<Kind>("volume");
  const [value, setValue] = useState("");
  const [from, setFrom] = useState("mL");
  const [to, setTo] = useState("µL");
  const [mw, setMw] = useState("");
  const K = KINDS.find((k) => k.id === kind) ?? KINDS[0];
  const v = num(value);
  const needsMw = dimensionOf(from) !== dimensionOf(to);
  const out = convert(v, from, to, num(mw));
  const reason = value.trim() === "" ? "" : v === null ? "That is not a number." : v < 0 ? "The value cannot be negative." : out === null && needsMw ? (num(mw) === null ? "Enter the molecular weight to convert between molar and mass per volume." : "The molecular weight must be greater than zero.") : "";
  function pick(id: Kind) {
    const next = KINDS.find((k) => k.id === id) ?? KINDS[0];
    setKind(next.id); setFrom(next.from); setTo(next.to);
  }
  // The same value in every unit it can be written in.
  const others = v === null ? [] : K.units.filter((u) => u !== from).map((u) => ({ unit: u, value: convert(v, from, u, num(mw)) })).filter((o): o is { unit: string; value: number } => o.value !== null);

  return (
    <ToolFrame tool="convert" item={item} data={{}}>
      <div className="bench-grid">
        <Panel title="Convert">
          <div className="bench-fields">
            <label className="field">
              <span>Quantity</span>
              <select value={kind} onChange={(e) => pick(e.target.value as Kind)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <NumField label="Value" value={value} placeholder="0" onChange={setValue} />
            <label className="field">
              <span>From</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>{K.units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}</select>
            </label>
            <label className="field">
              <span>To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)}>{K.units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}</select>
            </label>
            {kind === "molar-massvol" && <NumField label="Molecular weight" value={mw} placeholder="Needed between molar and mass per volume" suffix="g/mol" onChange={setMw} />}
          </div>
        </Panel>
        <Panel title="Result" className="bench-results">
          {reason && <p className="error" role="alert">{reason}</p>}
          {value.trim() === "" && <p className="muted bench-hint">Enter a value to convert.</p>}
          {v !== null && out !== null && (
            <>
              <div className="bench-result strong">
                <span className="bench-result-label">{fmt(v, 6)} {unitLabel(from)} =</span>
                <span className="bench-result-value"><strong className="num">{fmt(out, 6)}</strong> <span>{unitLabel(to)}</span></span>
              </div>
              {others.length > 0 && (
                <table className="bench-table">
                  <tbody>
                    {others.map((o) => <tr key={o.unit}><td className="num">{fmt(o.value, 6)}</td><td>{unitLabel(o.unit)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </>
          )}
        </Panel>
      </div>
    </ToolFrame>
  );
}
