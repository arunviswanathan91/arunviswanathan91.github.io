import { useState } from "react";
import { ClipboardPaste, Copy, Eraser, Plus, X } from "lucide-react";
import {
  WELL_COLORS, clearWells, dilutionSeries, fillSeries, parseLabels, parseNumber, patchWells, replicates, sortIds, withComponent,
  type Order, type Plate, type Well, type WellComponent,
} from "./logic.ts";

const UNITS = ["µM", "nM", "mM", "M", "µg/mL", "ng/mL", "mg/mL", "µL", "mL", "%", "x", "cells"];

/** What the selected wells have in common: a value when all agree, otherwise "mixed". */
function common(wells: (Well | undefined)[], key: "title" | "note" | "group" | "color"): { value: string; mixed: boolean } {
  const first = wells[0]?.[key] ?? "";
  return wells.every((w) => (w?.[key] ?? "") === first) ? { value: first, mixed: false } : { value: "", mixed: true };
}

/** Which way a fill runs through the selection. */
function Direction({ value, onChange, name }: { value: Order; onChange: (v: Order) => void; name: string }) {
  return (
    <div className="pm-seg" role="radiogroup" aria-label={`${name}: direction`}>
      {(["row", "column"] as Order[]).map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{o === "row" ? "By row" : "By column"}</button>
      ))}
    </div>
  );
}

/**
 * Edits the selected wells: every change goes to all of them. `change` receives the new
 * plate and a tag; edits with the same tag in a row (typing in one field) undo as one step.
 */
export function WellPanel({ plate, selected, clip, onCopy, change }: {
  plate: Plate;
  selected: string[];
  clip: Well | null;
  onCopy: (well: Well) => void;
  change: (plate: Plate, tag?: string) => void;
}) {
  const wells = selected.map((id) => plate.wells[id]);
  const key = selected.join(",");
  const title = common(wells, "title"), note = common(wells, "note"), group = common(wells, "group"), color = common(wells, "color");
  const first = wells[0];
  const componentsMixed = wells.some((w) => JSON.stringify(w?.components ?? []) !== JSON.stringify(first?.components ?? []));
  const components = first?.components ?? [];

  const set = (patch: Partial<Well>, field: string) => change(patchWells(plate, selected, patch), `${field}:${key}`);
  function setComponents(next: WellComponent[], tag: string) {
    change(patchWells(plate, selected, { components: next }), `${tag}:${key}`);
  }
  const editComponent = (i: number, patch: Partial<WellComponent>, field: string) => setComponents(components.map((c, k) => (k === i ? { ...c, ...patch } : c)), `component-${i}-${field}`);

  if (!selected.length) {
    return (
      <aside className="card pad pm-panel" aria-label="Selected wells">
        <h3>No well selected</h3>
        <p className="muted small">Tap a well to label it. Drag across wells or use shift-click to select several; on a phone, turn on “Multi-select”. A row letter or column number selects the whole line.</p>
      </aside>
    );
  }
  const label = selected.length === 1 ? `Well ${selected[0]}` : `${selected.length} wells`;
  const sorted = sortIds(selected, "row");
  return (
    <aside className="card pad pm-panel" aria-label="Selected wells">
      <div className="section-head">
        <h3>{label}</h3>
        {selected.length > 1 && <span className="muted small pm-range">{sorted[0]} … {sorted[sorted.length - 1]}</span>}
      </div>
      <label className="field">
        <span>Title</span>
        <input value={title.value} maxLength={80} placeholder={title.mixed ? "Mixed" : "e.g. Sample 1"} onChange={(e) => set({ title: e.target.value }, "title")} />
      </label>
      <label className="field">
        <span>Group</span>
        <input value={group.value} maxLength={60} placeholder={group.mixed ? "Mixed" : "e.g. Controls"} onChange={(e) => set({ group: e.target.value }, "group")} />
      </label>
      <div className="field">
        <span id="pm-colour-label">Colour{color.mixed ? " (mixed)" : ""}</span>
        <div className="pm-colors" role="radiogroup" aria-labelledby="pm-colour-label">
          <button type="button" role="radio" aria-checked={!color.mixed && !color.value} aria-label="No colour" className="pm-swatch" onClick={() => set({ color: "" }, "color")} />
          {WELL_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color.value === c} aria-label={c} title={c} className="pm-swatch" data-tone={c} onClick={() => set({ color: c }, "color")} />
          ))}
        </div>
      </div>
      <div className="field">
        <span>Components</span>
        {componentsMixed && <p className="muted small pm-mixed">The selected wells differ. Showing {selected[0]}; an edit here replaces the components of all selected wells.</p>}
        <datalist id="pm-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        {components.map((c, i) => (
          <div key={i} className="pm-component">
            <input aria-label={`Component ${i + 1}: name`} placeholder="Name" value={c.name} maxLength={60} onChange={(e) => editComponent(i, { name: e.target.value }, "name")} />
            <input aria-label={`Component ${i + 1}: amount`} placeholder="Amount" inputMode="decimal" autoComplete="off" value={c.amount ?? ""} maxLength={20} onChange={(e) => editComponent(i, { amount: e.target.value }, "amount")} />
            <input aria-label={`Component ${i + 1}: unit`} placeholder="Unit" list="pm-units" autoCapitalize="off" value={c.unit ?? ""} maxLength={16} onChange={(e) => editComponent(i, { unit: e.target.value }, "unit")} />
            <button type="button" className="icon" aria-label={`Remove component ${c.name || i + 1}`} onClick={() => setComponents(components.filter((_, k) => k !== i), "component-remove")}><X size={16} /></button>
          </div>
        ))}
        <button type="button" className="pm-add" onClick={() => change(patchWells(plate, selected, { components: [...components, { name: "" }] }))}><Plus size={14} aria-hidden /> Add component</button>
      </div>
      <label className="field">
        <span>Note</span>
        <textarea rows={2} value={note.value} maxLength={500} placeholder={note.mixed ? "Mixed" : "Anything to remember at this well"} onChange={(e) => set({ note: e.target.value }, "note")} />
      </label>
      <div className="pm-row">
        <button type="button" disabled={!first} onClick={() => first && onCopy(first)}><Copy size={14} aria-hidden /> Copy{selected.length > 1 ? ` ${selected[0]}` : ""}</button>
        <button type="button" disabled={!clip} onClick={() => clip && change(patchWells(clearWells(plate, selected), selected, clip))}><ClipboardPaste size={14} aria-hidden /> Paste</button>
        <button type="button" disabled={wells.every((w) => !w)} onClick={() => change(clearWells(plate, selected))}><Eraser size={14} aria-hidden /> Clear</button>
      </div>

      {selected.length > 1 && <FillHelpers plate={plate} selected={selected} change={change} />}
    </aside>
  );
}

function FillHelpers({ plate, selected, change }: { plate: Plate; selected: string[]; change: (plate: Plate) => void }) {
  const [order, setOrder] = useState<Order>("row");
  const [pattern, setPattern] = useState("Sample 1");
  const [labels, setLabels] = useState("");
  const [times, setTimes] = useState("3");
  const [asGroup, setAsGroup] = useState(true);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [factor, setFactor] = useState("2");
  const [unit, setUnit] = useState("µM");
  const [restart, setRestart] = useState(true);

  const ids = sortIds(selected, order);
  const list = parseLabels(labels);
  const n = Math.floor(parseNumber(times) ?? 0);
  const startN = parseNumber(start), factorN = parseNumber(factor);
  const series = startN !== null && factorN !== null && factorN > 0 ? dilutionSeries(selected, { start: startN, factor: factorN, order, restart }) : null;
  const preview = (values: Record<string, string>) => ids.slice(0, 4).map((id) => values[id]).filter((v) => v !== undefined).join(", ") + (ids.length > 4 ? "…" : "");

  function applySeries() {
    const titles = fillSeries(ids, pattern);
    change(patchWells(plate, ids, (id) => ({ title: titles[id] })));
  }
  function applyReplicates() {
    const titles = replicates(ids, list, n);
    change(patchWells(plate, Object.keys(titles), (id) => ({ title: titles[id], ...(asGroup ? { group: titles[id] } : {}) })));
  }
  function applyDilution() {
    if (!series) return;
    const component = name.trim() || "Concentration";
    change(patchWells(plate, selected, (id, well) => ({ components: withComponent(well, { name: component, amount: series[id], ...(unit.trim() ? { unit: unit.trim() } : {}) }) })));
  }

  return (
    <div className="pm-fill">
      <div className="section-head">
        <h3>Fill {selected.length} wells</h3>
        <Direction value={order} onChange={setOrder} name="Fill" />
      </div>
      <details>
        <summary>Fill series</summary>
        <label className="field">
          <span>Title pattern</span>
          <input value={pattern} maxLength={60} onChange={(e) => setPattern(e.target.value)} />
        </label>
        <p className="muted small">The number counts up from well to well: {preview(fillSeries(ids, pattern))}</p>
        <button type="button" className="primary" onClick={applySeries}>Fill titles</button>
      </details>
      <details>
        <summary>Replicates</summary>
        <label className="field">
          <span>Labels (one per line, or separated by commas)</span>
          <textarea rows={3} value={labels} placeholder={"Control\nDrug A\nDrug B"} onChange={(e) => setLabels(e.target.value)} />
        </label>
        <label className="field">
          <span>Wells per label</span>
          <input inputMode="numeric" autoComplete="off" value={times} aria-invalid={n < 1 || undefined} onChange={(e) => setTimes(e.target.value)} />
        </label>
        <label className="pm-check"><input type="checkbox" className="check" checked={asGroup} onChange={(e) => setAsGroup(e.target.checked)} /> <span>Also set each label as the group</span></label>
        {list.length > 0 && n >= 1 && (
          <p className="muted small">
            {list.length} label{list.length === 1 ? "" : "s"} × {n} = {list.length * n} wells
            {list.length * n > ids.length ? `; only the first ${ids.length} fit the selection.` : list.length * n < ids.length ? `; ${ids.length - list.length * n} selected wells stay as they are.` : "."}
          </p>
        )}
        <button type="button" className="primary" disabled={!list.length || n < 1} onClick={applyReplicates}>Fill replicates</button>
      </details>
      <details>
        <summary>Dilution series</summary>
        <label className="field">
          <span>Component</span>
          <input value={name} maxLength={60} placeholder="e.g. Gemcitabine" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="pm-three">
          <label className="field"><span>Start</span><input inputMode="decimal" autoComplete="off" value={start} placeholder="100" aria-invalid={(start.trim() !== "" && startN === null) || undefined} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field"><span>Factor (1 in …)</span><input inputMode="decimal" autoComplete="off" value={factor} aria-invalid={factorN === null || factorN <= 0 || undefined} onChange={(e) => setFactor(e.target.value)} /></label>
          <label className="field"><span>Unit</span><input list="pm-units" autoCapitalize="off" value={unit} maxLength={16} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        <label className="pm-check"><input type="checkbox" className="check" checked={restart} onChange={(e) => setRestart(e.target.checked)} /> <span>Start again on every {order === "row" ? "row" : "column"}</span></label>
        {series && <p className="muted small">Amounts: {preview(series)}</p>}
        <button type="button" className="primary" disabled={!series} onClick={applyDilution}>Write amounts</button>
      </details>
    </div>
  );
}
