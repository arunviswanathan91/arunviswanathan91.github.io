import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CELL_UNITS, FOLD_UNIT, MASSVOL_UNITS, MOLAR_UNITS, PERCENT_UNIT, VOLUME_UNITS, dimensionOf, fmt, fmtQ, masterMix, num, type MixLine } from "./calc.ts";
import { mixData, newMixRow, toQ, type MixData, type MixRow, type QText } from "./model.ts";
import { CopyButton, Instruction, NumField, Panel, Quantity, Reason, TextField, ToolFrame, guard, type ToolProps } from "./parts.tsx";

const CONC_UNITS = [...MOLAR_UNITS, PERCENT_UNIT, FOLD_UNIT, ...MASSVOL_UNITS, ...CELL_UNITS];
const typed = (q: QText) => { const v = num(q.value); return v === null ? "…" : fmtQ({ value: v, unit: q.unit }, 6, false); };

export function MasterMixTool({ item }: ToolProps) {
  const [d, setD] = useState(() => mixData(item?.data));
  const [ticked, setTicked] = useState<Set<number>>(new Set()); // while pipetting; not saved
  const set = (patch: Partial<MixData>) => setD((x) => ({ ...x, ...patch }));
  const setRow = (k: number, patch: Partial<MixRow>) => set({ reagents: d.reagents.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  const rows = (reagents: MixRow[]) => { set({ reagents }); setTicked(new Set()); };
  /** Stock and final concentration stay in the same kind of unit. */
  function setStock(k: number, stock: QText) {
    const r = d.reagents[k];
    setRow(k, { stock, final: dimensionOf(stock.unit) === dimensionOf(r.final.unit) ? r.final : { ...r.final, unit: stock.unit } });
  }
  const tick = (k: number) => setTicked((t) => { const next = new Set(t); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  const out = guard(
    masterMix({
      reactions: num(d.reactions),
      reactionVolume: toQ(d.volume),
      overage: { mode: d.overageMode, value: num(d.overage) },
      fill: d.fill,
      // Only the way a reagent is entered counts: a volume left over from before is not used.
      reagents: d.reagents.map((r) => (r.byConc ? { name: r.name, stock: toQ(r.stock), final: toQ(r.final) } : { name: r.name, perReaction: toQ(r.per) })),
    }),
    d.reactions, d.volume.value, d.overage,
  );
  const m = out.result;
  const unread = (r: MixRow) => (r.byConc ? [r.stock.value, r.final.value] : [r.per.value]).some((v) => v.trim() !== "" && num(v) === null);
  const anyUnread = d.reagents.some(unread);
  const EMPTY: MixLine = { name: "", perReaction: null, total: null, reason: "" };
  const lines: MixLine[] = d.reagents.map((r, k) => (unread(r) ? { ...EMPTY, reason: "One of the values is not a number." } : m?.lines[k] ?? EMPTY));
  const fill = anyUnread ? EMPTY : m?.fill ?? null;
  const totals = anyUnread ? null : m;
  const name = (r: MixRow, k: number) => r.name.trim() || `Reagent ${k + 1}`;
  const fillName = d.fillName.trim() || "Water";
  const extra = num(d.overage) ?? 0;
  const setup = m ? `${fmt(num(d.reactions), 6)} reactions${extra > 0 ? (d.overageMode === "percent" ? ` + ${fmt(extra, 6)} %` : ` + ${fmt(extra, 6)} extra`) : ""}` : "";

  const text = [
    `${d.name.trim() || "Master mix"}${m ? `: ${setup}, ${typed(d.volume)} each` : ""}`,
    ...d.reagents.map((r, k) => `- ${name(r, k)}: ${lines[k].total ? fmtQ(lines[k].total) : "?"} (${lines[k].perReaction ? fmtQ(lines[k].perReaction) : "?"} per reaction${r.byConc ? `, ${typed(r.final)} from ${typed(r.stock)}` : ""})`),
    ...(d.fill ? [`- ${fillName}: ${fill?.total ? fmtQ(fill.total) : "?"} (${fill?.perReaction ? fmtQ(fill.perReaction) : "?"} per reaction)`] : []),
    `Total: ${totals?.total ? fmtQ(totals.total) : "?"} (${totals?.perReaction ? fmtQ(totals.perReaction) : "?"} per reaction)`,
  ].join("\n");

  return (
    <ToolFrame tool="mastermix" item={item} data={d} suggestedTitle={d.name}>
      <Panel title="Reactions">
        <div className="bench-fields">
          <TextField label="Name" value={d.name} placeholder="e.g. qPCR, SYBR" onChange={(v) => set({ name: v })} />
          <NumField label="Number of reactions" whole value={d.reactions} placeholder="24" onChange={(reactions) => set({ reactions })} />
          <Quantity label="Volume per reaction" units={VOLUME_UNITS} value={d.volume} placeholder="20" onChange={(volume) => set({ volume })} />
          <div className="field bench-qty">
            <span>Extra to prepare</span>
            <span className="bench-qty-row">
              <input inputMode="decimal" autoComplete="off" aria-label="Extra to prepare" aria-invalid={(d.overage.trim() !== "" && num(d.overage) === null) || undefined} value={d.overage} placeholder="0" onChange={(e) => set({ overage: e.target.value })} />
              <select aria-label="Extra to prepare: as" value={d.overageMode} onChange={(e) => set({ overageMode: e.target.value as MixData["overageMode"] })}>
                <option value="percent">% extra</option>
                <option value="reactions">extra reactions</option>
              </select>
            </span>
          </div>
        </div>
        <div className="row wrap bench-actions">
          <label className="toggle"><input type="checkbox" checked={d.fill} onChange={(e) => set({ fill: e.target.checked })} /> Fill each reaction to its volume with</label>
          <input className="bench-inline-input" aria-label="Solvent to fill with" disabled={!d.fill} value={d.fillName} placeholder="Water" onChange={(e) => set({ fillName: e.target.value })} />
        </div>
      </Panel>

      <Panel title="Reagents">
        <ul className="bench-rows">
          {d.reagents.map((r, k) => (
            <li key={k}>
              <div className="bench-fields">
                <TextField label={`Reagent ${k + 1}`} value={r.name} placeholder="e.g. 2× master mix" onChange={(v) => setRow(k, { name: v })} />
                <label className="field">
                  <span>Entered as</span>
                  <select value={r.byConc ? "conc" : "volume"} onChange={(e) => setRow(k, { byConc: e.target.value === "conc" })}>
                    <option value="volume">Volume per reaction</option>
                    <option value="conc">Stock and final concentration</option>
                  </select>
                </label>
                {r.byConc ? (
                  <>
                    <Quantity label="Stock concentration" units={CONC_UNITS} value={r.stock} onChange={(stock) => setStock(k, stock)} />
                    <Quantity label="Final concentration" units={CONC_UNITS} value={r.final} onChange={(final) => setRow(k, { final })} />
                  </>
                ) : (
                  <Quantity label="Volume per reaction" units={VOLUME_UNITS} value={r.per} onChange={(per) => setRow(k, { per })} />
                )}
              </div>
              <div className="bench-row-foot">
                <span className={lines[k].reason ? "neg" : ""}>
                  {lines[k].perReaction && lines[k].total ? <>→ {fmtQ(lines[k].perReaction)} each, <strong className="num">{fmtQ(lines[k].total)}</strong> in the mix</> : lines[k].reason || <span className="muted">→ …</span>}
                </span>
                <button type="button" className="icon danger" aria-label={`Remove ${name(r, k)}`} onClick={() => rows(d.reagents.filter((_, j) => j !== k))}><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => rows([...d.reagents, newMixRow()])}><Plus size={14} /> Add reagent</button>
      </Panel>

      <Panel title="Pipetting" className="bench-results">
        <Reason outcome={out} />
        {m && (
          <>
            {m.reason && !anyUnread && <p className="error" role="alert">{m.reason}</p>}
            <table className="bench-table bench-checklist">
              <thead><tr><th aria-label="Done" /><th>Reagent</th><th className="num">Per reaction</th><th className="num">In the mix</th></tr></thead>
              <tbody>
                {d.reagents.map((r, k) => (
                  <tr key={k} className={ticked.has(k) ? "done" : undefined}>
                    <td><input type="checkbox" className="check" aria-label={`${name(r, k)} added`} checked={ticked.has(k)} onChange={() => tick(k)} /></td>
                    <td><span className="bench-line-name">{name(r, k)}</span>{r.byConc && <span className="muted small bench-line-how">{typed(r.final)} from {typed(r.stock)}</span>}</td>
                    <td className="num">{lines[k].perReaction ? fmtQ(lines[k].perReaction) : "—"}</td>
                    <td className="num"><strong>{lines[k].total ? fmtQ(lines[k].total) : "—"}</strong></td>
                  </tr>
                ))}
                {d.fill && (
                  <tr className={ticked.has(-1) ? "done" : undefined}>
                    <td><input type="checkbox" className="check" aria-label={`${fillName} added`} checked={ticked.has(-1)} onChange={() => tick(-1)} /></td>
                    <td><span className="bench-line-name">{fillName}</span><span className="muted small bench-line-how">fills the reaction</span></td>
                    <td className="num">{fill?.perReaction ? fmtQ(fill.perReaction) : "—"}</td>
                    <td className="num"><strong>{fill?.total ? fmtQ(fill.total) : "—"}</strong></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td><strong>Total</strong></td>
                  <td className="num">{totals?.perReaction ? fmtQ(totals.perReaction) : "—"}</td>
                  <td className="num"><strong>{totals?.total ? fmtQ(totals.total) : "—"}</strong></td>
                </tr>
              </tfoot>
            </table>
            {totals?.perReaction && totals.total && (
              <Instruction>
                Mix {fmtQ(totals.total)} in all: enough for {fmt(m.portions)} reactions ({setup}). Dispense {fmtQ(totals.perReaction)} per reaction.
              </Instruction>
            )}
          </>
        )}
        <div className="row wrap bench-actions">
          <CopyButton text={text} />
          {ticked.size > 0 && <button type="button" onClick={() => setTicked(new Set())}>Untick all</button>}
        </div>
      </Panel>
    </ToolFrame>
  );
}
