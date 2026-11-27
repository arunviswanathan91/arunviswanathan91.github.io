import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CELL_UNITS, FOLD_UNIT, MASSVOL_UNITS, MOLAR_UNITS, PERCENT_UNIT, VOLUME_UNITS, dimensionOf, fmt, fmtQ, num, recipe, type RecipeLine } from "./calc.ts";
import { newRecipeRow, recipeData, toQ, type QText, type RecipeData, type RecipeRow } from "./model.ts";
import { CopyButton, Instruction, NumField, Panel, Quantity, TextField, ToolFrame, type ToolProps } from "./parts.tsx";

const STOCK_UNITS = [...MOLAR_UNITS, PERCENT_UNIT, FOLD_UNIT, ...MASSVOL_UNITS, ...CELL_UNITS];
const POWDER_UNITS = [...MOLAR_UNITS, ...MASSVOL_UNITS, PERCENT_UNIT];
const POWDER_NAMES = { [PERCENT_UNIT]: "% (w/v)" };
/** Molar and mass per volume can be mixed, given a molecular weight; anything else must match. */
const mixable = (a: string, b: string) => { const x = dimensionOf(a), y = dimensionOf(b); return (x === "molar" && y === "massvol") || (x === "massvol" && y === "molar"); };
const typed = (q: QText) => { const v = num(q.value); return v === null ? "…" : fmtQ({ value: v, unit: q.unit }, 6, false); };

/** How a line is made, for the table and the copied text. */
function how(c: RecipeRow): string {
  return c.mode === "stock" ? `${typed(c.desired)} from ${typed(c.stock)} stock` : `${typed(c.desired)}${dimensionOf(c.desired.unit) === "percent" ? " (w/v)" : ""}, weighed${needsMw(c) && num(c.mw) !== null ? ` (${fmt(num(c.mw), 6)} g/mol)` : ""}`;
}
function needsMw(c: RecipeRow): boolean {
  return c.mode === "powder" ? dimensionOf(c.desired.unit) === "molar" : mixable(c.desired.unit, c.stock.unit);
}

export function RecipeTool({ item, route }: ToolProps) {
  const [d, setD] = useState(() => recipeData(item?.data));
  const [ticked, setTicked] = useState<Set<number>>(new Set()); // while pipetting; not saved
  const set = (patch: Partial<RecipeData>) => setD((x) => ({ ...x, ...patch }));
  const setRow = (k: number, patch: Partial<RecipeRow>) => set({ components: d.components.map((c, j) => (j === k ? { ...c, ...patch } : c)) });
  const rows = (components: RecipeRow[]) => { set({ components }); setTicked(new Set()); };
  /** A new unit for the wanted concentration takes the stock's unit with it when the two no longer fit. */
  function setDesired(k: number, desired: QText) {
    const c = d.components[k];
    const fits = dimensionOf(desired.unit) === dimensionOf(c.stock.unit) || mixable(desired.unit, c.stock.unit);
    setRow(k, { desired, stock: fits ? c.stock : { ...c.stock, unit: desired.unit } });
  }
  function setMode(k: number, mode: RecipeRow["mode"]) {
    const c = d.components[k];
    setRow(k, { mode, desired: mode === "powder" && !POWDER_UNITS.includes(c.desired.unit) ? { ...c.desired, unit: "mM" } : c.desired });
  }
  const tick = (k: number) => setTicked((t) => { const next = new Set(t); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  const result = recipe({
    volume: toQ(d.volume),
    components: d.components.map((c) => ({ name: c.name, mode: c.mode, desired: toQ(c.desired), stock: c.mode === "stock" ? toQ(c.stock) : undefined, mw: needsMw(c) ? num(c.mw) : null })),
  });
  // Text that is not a number leaves its line (or the whole recipe) without an amount, and says so.
  const unread = (c: RecipeRow) => [c.desired.value, c.mode === "stock" ? c.stock.value : "", needsMw(c) ? c.mw : ""].some((v) => v.trim() !== "" && num(v) === null);
  const badVolume = d.volume.value.trim() !== "" && num(d.volume.value) === null;
  const lines: RecipeLine[] = result.lines.map((l, k) => (unread(d.components[k]) ? { ...l, amount: null, reason: "One of the values is not a number." } : l));
  const blocked = badVolume || d.components.some((c) => c.mode === "stock" && unread(c));
  const solvent = blocked ? null : result.solvent;
  const reason = badVolume ? "The final volume is not a number." : result.reason;
  const finalVolume = toQ(d.volume);
  const total = finalVolume.value !== null && !badVolume ? fmtQ({ value: finalVolume.value, unit: finalVolume.unit }, 6, false) : "";
  const solventName = d.solvent.trim() || "solvent";
  const anyPowder = d.components.some((c) => c.mode === "powder");

  const text = [
    `${d.name.trim() || "Recipe"}${total ? `: ${total}` : ""}`,
    ...d.components.map((c, k) => `- ${c.name.trim() || `Component ${k + 1}`}: ${lines[k].amount ? fmtQ(lines[k].amount) : "?"} (${how(c)})`),
    `- ${d.solvent.trim() || "Solvent"}: ${solvent ? (anyPowder ? `to ${total}` : fmtQ(solvent)) : "?"}${solvent && anyPowder ? ` (about ${fmtQ(solvent)})` : ""}`,
  ].join("\n");

  return (
    <ToolFrame tool="recipe" item={item} route={route} data={d} suggestedTitle={d.name} readable>
      {(editing) => <>
      {editing ? (
        <>
          <Panel title="Recipe">
            <div className="bench-fields">
              <TextField label="Name" value={d.name} placeholder="e.g. RIPA lysis buffer" onChange={(name) => set({ name })} />
              <Quantity label="Final volume" units={VOLUME_UNITS} value={d.volume} placeholder="50" onChange={(volume) => set({ volume })} />
              <TextField label="Solvent" value={d.solvent} placeholder="Water" onChange={(solvent) => set({ solvent })} />
            </div>
            <p className="muted small">Change the final volume to rescale the whole recipe.</p>
          </Panel>

          <Panel title="Components">
            <ul className="bench-rows">
              {d.components.map((c, k) => (
                <li key={k}>
                  <div className="bench-fields">
                    <TextField label={`Component ${k + 1}`} value={c.name} placeholder="e.g. NaCl" onChange={(name) => setRow(k, { name })} />
                    <label className="field">
                      <span>Added as</span>
                      <select value={c.mode} onChange={(e) => setMode(k, e.target.value as RecipeRow["mode"])}>
                        <option value="stock">From stock solution</option>
                        <option value="powder">From powder</option>
                      </select>
                    </label>
                    <Quantity label="Wanted concentration" units={c.mode === "stock" ? STOCK_UNITS : POWDER_UNITS} names={c.mode === "powder" ? POWDER_NAMES : undefined} value={c.desired} onChange={(v) => setDesired(k, v)} />
                    {c.mode === "stock" && <Quantity label="Stock concentration" units={STOCK_UNITS} value={c.stock} onChange={(stock) => setRow(k, { stock })} />}
                    {needsMw(c) && <NumField label="Molecular weight" value={c.mw} suffix="g/mol" onChange={(mw) => setRow(k, { mw })} />}
                  </div>
                  <div className="bench-row-foot">
                    <span className={lines[k].reason ? "neg" : ""}>{lines[k].amount ? <>→ <strong className="num">{fmtQ(lines[k].amount)}</strong></> : lines[k].reason || <span className="muted">→ …</span>}</span>
                    <button type="button" className="icon danger" aria-label={`Remove ${c.name.trim() || `component ${k + 1}`}`} onClick={() => rows(d.components.filter((_, j) => j !== k))}><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => rows([...d.components, newRecipeRow()])}><Plus size={14} /> Add component</button>
          </Panel>
        </>
      ) : (
        <Panel title="Recipe" className="bench-recipe-read">
          <div className="bench-fields bench-rescale">
            <Quantity label="Final volume" units={VOLUME_UNITS} value={d.volume} placeholder="50" onChange={(volume) => set({ volume })} />
          </div>
          <p className="muted small">Change the final volume to rescale the amounts below. Press Edit to change the components.</p>
          <ul className="bench-recipe-list">
            {d.components.map((c, k) => (
              <li key={k}>
                <span className="bench-line-name">{c.name.trim() || `Component ${k + 1}`}</span>
                <span className="muted small bench-line-how">{how(c)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={`To make${total ? ` ${total}` : ""}`} className="bench-results">
        {reason && <p className="error" role="alert">{reason}</p>}
        <table className="bench-table bench-checklist">
          <thead><tr><th aria-label="Done" /><th>Component</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {d.components.map((c, k) => (
              <tr key={k} className={ticked.has(k) ? "done" : undefined}>
                <td><input type="checkbox" className="check" aria-label={`${c.name.trim() || `Component ${k + 1}`} added`} checked={ticked.has(k)} onChange={() => tick(k)} /></td>
                <td><span className="bench-line-name">{c.name.trim() || `Component ${k + 1}`}</span><span className="muted small bench-line-how">{how(c)}</span></td>
                <td className="num"><strong>{lines[k].amount ? fmtQ(lines[k].amount) : "—"}</strong></td>
              </tr>
            ))}
            <tr className={ticked.has(-1) ? "done" : undefined}>
              <td><input type="checkbox" className="check" aria-label={`${solventName} added`} checked={ticked.has(-1)} onChange={() => tick(-1)} /></td>
              <td><span className="bench-line-name">{d.solvent.trim() || "Solvent"}</span><span className="muted small bench-line-how">{total ? `to ${total}` : "to the final volume"}</span></td>
              <td className="num"><strong>{solvent ? `${anyPowder ? "≈ " : ""}${fmtQ(solvent)}` : "—"}</strong></td>
            </tr>
          </tbody>
        </table>
        {solvent && total && (
          <Instruction>
            {anyPowder
              ? `Dissolve the powders in most of the ${solventName}, add the stock solutions, then make up to ${total} with ${solventName} (about ${fmtQ(solvent)} in all).`
              : `Add the stock solutions to ${fmtQ(solvent)} of ${solventName} for ${total}.`}
          </Instruction>
        )}
        <div className="row wrap bench-actions">
          <CopyButton text={text} />
          {ticked.size > 0 && <button type="button" onClick={() => setTicked(new Set())}>Untick all</button>}
        </div>
      </Panel>
      </>}
    </ToolFrame>
  );
}
