import { useState } from "react";
import { Tabs } from "../../components/ui.tsx";
import { CELL_UNITS, VOLUME_UNITS, cellDilution, dimensionOf, fmt, fmtQ, num, seeding } from "./calc.ts";
import { cellsData, toQ, type CellsData } from "./model.ts";
import { FourFields, FourResult, type FourLabels } from "./DilutionTool.tsx";
import { Instruction, NumField, Panel, Quantity, Reason, Result, Stat, ToolFrame, guard, type ToolProps } from "./parts.tsx";

const TABS: [CellsData["tab"], string][] = [["dilute", "Dilute cells"], ["seed", "Seed a plate"]];
const LABELS: FourLabels = { c1: "Cell suspension (C1)", v1: "Volume of suspension (V1)", c2: "Wanted concentration (C2)", v2: "Final volume (V2)" };

/** A fresh tool can be opened with a concentration already filled in (from the haemocytometer): ?c1=1.08&c1u=e6 cells/mL */
function initial(item: ToolProps["item"], route: ToolProps["route"]): CellsData {
  const d = cellsData(item?.data);
  if (item) return d;
  const value = route.query.get("c1") ?? "";
  const unit = route.query.get("c1u") ?? "";
  if (num(value) === null || dimensionOf(unit) !== "cells") return d;
  return { ...d, c1: { value, unit }, stock: { value, unit } };
}

export function CellsTool({ item, route }: ToolProps) {
  const [d, setD] = useState(() => initial(item, route));
  const set = (patch: Partial<CellsData>) => setD((x) => ({ ...x, ...patch }));
  const diluted = guard(cellDilution({ c1: toQ(d.c1), v1: toQ(d.v1), c2: toQ(d.c2), v2: toQ(d.v2) }), d.c1.value, d.v1.value, d.c2.value, d.v2.value);
  const seeded = guard(
    seeding({ cellsPerWell: num(d.cellsPerWell), wells: num(d.wells), overagePct: num(d.overage), volumePerWell: toQ(d.perWell), stock: toQ(d.stock) }),
    d.cellsPerWell, d.wells, d.overage, d.perWell.value, d.stock.value,
  );
  const s = seeded.result;

  return (
    <ToolFrame tool="cells" item={item} data={d}>
      <Tabs value={d.tab} options={TABS} onChange={(tab) => set({ tab })} />
      {d.tab === "dilute" ? (
        <div className="bench-grid">
          <Panel title="Cells">
            <p className="muted small">Fill in any three. The one you leave blank is calculated.</p>
            <FourFields labels={LABELS} units={CELL_UNITS} value={d} onChange={set} out={diluted} />
          </Panel>
          <FourResult labels={LABELS} out={diluted} stock="cell suspension" diluent="medium" />
        </div>
      ) : (
        <div className="bench-grid">
          <Panel title="Plate">
            <div className="bench-fields">
              <NumField label="Cells per well" value={d.cellsPerWell} placeholder="10000" onChange={(cellsPerWell) => set({ cellsPerWell })} />
              <NumField label="Number of wells" whole value={d.wells} placeholder="96" onChange={(wells) => set({ wells })} />
              <Quantity label="Volume per well" units={VOLUME_UNITS} value={d.perWell} placeholder="100" onChange={(perWell) => set({ perWell })} />
              <NumField label="Extra to prepare" value={d.overage} placeholder="10" suffix="%" onChange={(overage) => set({ overage })} />
              <Quantity label="Your cell suspension" units={CELL_UNITS} value={d.stock} onChange={(stock) => set({ stock })} />
            </div>
          </Panel>
          <Panel title="Seeding mix" className="bench-results">
            <Reason outcome={seeded} />
            {s && (
              <>
                <Result strong label="Cell suspension" q={s.suspension} />
                <Result strong label="Medium" q={s.medium} />
                <Result label="Total mix" q={s.totalVolume} />
                <Stat label="Cells needed" value={fmt(s.totalCells)} />
                <Result label="Mix concentration" q={s.mix} />
                <Instruction>
                  Mix {fmtQ(s.suspension)} of cell suspension with {fmtQ(s.medium)} of medium, then add {fmtQ(toQty(d))} to each well.
                  {" "}That is enough for {fmt(s.portions)} wells.
                </Instruction>
              </>
            )}
          </Panel>
        </div>
      )}
    </ToolFrame>
  );
}

function toQty(d: CellsData) {
  const q = toQ(d.perWell);
  return q.value === null ? null : { value: q.value, unit: q.unit };
}
