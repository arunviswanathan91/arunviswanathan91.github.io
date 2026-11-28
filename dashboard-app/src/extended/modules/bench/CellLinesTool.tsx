import { useState, type ReactNode } from "react";
import { ArrowLeft, Bell, ChevronDown, Clock, Dna, FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import { Tabs } from "../../components/ui.tsx";
import { Loading } from "../../components/ui.tsx";
import { insert, list, useLoad } from "../../lib/db.ts";
import { go, href } from "../../lib/route.ts";
import type { BenchItem } from "../../lib/types.ts";
import { VESSELS, cellsForArea, confluenceOverTime, fmt, fmtQ, niceTicks, num, timeToConfluence, vessel, type Point } from "./calc.ts";
import { cellLineData, newPassage, type CellLineData, type PassageRecord } from "./model.ts";
import { CELL_LINES, PANELS, cellLineRef, type CellLineRef } from "./cellLines/catalog.ts";
import { Instruction, NumField, Panel, Reason, Stat, TextField, ToolFrame, guard, type ToolProps } from "./parts.tsx";
import { addTimer } from "./timers/store.ts";
import { putReminder } from "./timers/reminders.ts";

const TABS: [CellLineData["tab"], string][] = [
  ["overview", "Overview"], ["profile", "Profile"], ["seeding", "Seeding"], ["timer", "Timer"], ["passages", "Passages"],
];

/** The profile fields a catalogue entry fills in. */
function fromRef(r: CellLineRef): Partial<CellLineData> {
  return {
    reference: r.id, name: r.name, organism: r.organism, tissue: r.tissue, disease: r.disease, culture: r.culture,
    doublingTimeH: String(r.doublingTimeH), densityPerCm2: String(r.densityPerCm2), medium: r.medium,
    mutations: r.mutations.join("\n"), receptor: r.receptor ? `${r.receptor.subtype} · ER ${r.receptor.er} / PR ${r.receptor.pr} / HER2 ${r.receptor.her2}` : "",
  };
}

const cells = (n: number) => fmtQ({ value: n, unit: "cells" }, 4, false);

export function CellLinesTool({ item }: ToolProps) {
  // With no item we show the culture overview: the cell lines you are maintaining, and a way to add one.
  if (!item) return <CellLinesHome />;
  return <CellLineItem item={item} />;
}

function CellLineItem({ item }: { item: BenchItem }) {
  const [d, setD] = useState(() => cellLineData(item?.data));
  const set = (patch: Partial<CellLineData>) => setD((x) => ({ ...x, ...patch }));
  // Editing a profile value by hand means it is no longer that catalogue line.
  const edit = (patch: Partial<CellLineData>) => set({ ...patch, reference: "custom" });
  const setPassage = (id: string, patch: Partial<PassageRecord>) => set({ passages: d.passages.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const ref = cellLineRef(d.reference);
  const currentPassage = (num(d.startingPassage) ?? 0) + Math.max(0, d.passages.length - 1);
  const maxP = num(d.maxPassages);
  const overMax = maxP !== null && d.passages.length > 0 && currentPassage >= maxP;
  const lastSeeding = d.passages.map((p) => p.seedingDate).filter(Boolean).sort().at(-1) || "";

  return (
    <ToolFrame tool="cellLines" item={item} data={d} readable suggestedTitle={d.name || "Cell line"}>
      {(editing) => <>
        <Tabs value={d.tab} options={TABS} onChange={(tab) => set({ tab })} />

        {d.tab === "overview" && <Overview d={d} ref={ref} currentPassage={currentPassage} overMax={overMax} lastSeeding={lastSeeding} />}
        {d.tab === "profile" && <Profile d={d} editing={editing} set={set} edit={edit} />}
        {d.tab === "seeding" && <Seeding d={d} set={set} />}
        {d.tab === "timer" && <SplittingTimer d={d} set={set} />}
        {d.tab === "passages" && <Passages d={d} set={set} setPassage={setPassage} startingPassage={num(d.startingPassage) ?? 0} />}
      </>}
    </ToolFrame>
  );
}

// ── Culture overview (the cell lines you are maintaining) ────────────────────

function CellLinesHome() {
  const { data: items, error, fresh } = useLoad(() => list<BenchItem>("bench_items", { eq: { kind: "cell_line" }, order: [["updated_at", false]] }), []);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const live = (items ?? []).filter((it) => !it.archived_at);

  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      const ref = cellLineRef(choice);
      const base = cellLineData(undefined);
      const data = ref ? { ...base, ...fromRef(ref) } : { ...base, reference: "custom" };
      const row = await insert<BenchItem>("bench_items", { kind: "cell_line", title: ref ? ref.name : "New cell line", data });
      go(`bench/item/${row.id}`);
    } finally {
      setBusy(false);
    }
  }
  function quickTimer(name: string, td: number | null) {
    const out = timeToConfluence({ doublingTimeH: td, startPct: 20, targetPct: 90 });
    if (out.result) addTimer(name ? `Split ${name}` : "Split cells", Math.round(out.result.value * 3600), "violet", true);
  }

  return (
    <section className="detail bench-tool">
      <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
      <header className="detail-head note-head">
        <div><span className="kicker">Bench</span><h1 className="bench-read-title">Cell lines</h1></div>
      </header>
      <Panel title="Add a cell line to your cultures">
        <p className="muted small">Pick a line from the reference catalogue (ATCC / Cellosaurus) or start a custom one. You can edit everything after.</p>
        <div className="row wrap bench-actions">
          <select aria-label="Cell line to add" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose a cell line…</option>
            <option value="custom">Custom (blank)</option>
            {PANELS.map(([p, label]) => (
              <optgroup key={p} label={label}>
                {CELL_LINES.filter((c) => c.panel === p).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className="primary" disabled={!choice || busy} onClick={() => void add()}><Plus size={15} /> {busy ? "Adding…" : "Add cell line"}</button>
        </div>
      </Panel>

      {!fresh && !items ? <Loading rows={3} /> : error ? <p className="error">{String(error)}</p> : live.length === 0 ? (
        <div className="empty-state"><FlaskConical /><p>No cell lines yet. Add the cells you are maintaining above.</p></div>
      ) : (
        <div className="cl-grid">
          {live.map((it) => {
            const d = cellLineData(it.data);
            const start = num(d.startingPassage) ?? 0;
            const passage = start + Math.max(0, d.passages.length - 1);
            const maxP = num(d.maxPassages);
            const over = maxP !== null && d.passages.length > 0 && passage >= maxP;
            const td = num(d.doublingTimeH);
            const lastSeeding = d.passages.map((p) => p.seedingDate).filter(Boolean).sort().at(-1) || "";
            const ref = cellLineRef(d.reference);
            return (
              <article key={it.id} className="cl-card">
                <a className="cl-card-title" href={href(`bench/item/${it.id}`)}><FlaskConical size={15} /> {it.title || d.name || "Cell line"}</a>
                {(d.tissue || d.disease) && <p className="muted small cl-card-sub">{[d.tissue, d.disease].filter(Boolean).join(" · ")}</p>}
                <div className="cl-card-facts">
                  <span className="cap">{d.culture}</span>
                  <span className={over ? "cl-warn" : undefined}>P{passage}{over ? " · limit" : ""}</span>
                  {td !== null && <span>{d.doublingTimeH} h doubling</span>}
                  {lastSeeding && <span>seeded {lastSeeding}</span>}
                </div>
                {d.mutations.trim() && <p className="muted small cl-card-mut">{d.mutations.split("\n").filter(Boolean).slice(0, 2).join(" · ")}{d.mutations.split("\n").filter(Boolean).length > 2 ? " …" : ""}</p>}
                <div className="cl-card-actions">
                  <a className="small" href={href(`bench/item/${it.id}`)}>Open</a>
                  {td !== null && <button type="button" className="small" onClick={() => quickTimer(it.title || d.name, td)}><Clock size={13} /> Split timer</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Overview (read) ──────────────────────────────────────────────────────────

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div className="cl-fact"><span className="cl-fact-label">{label}</span><span className="cl-fact-value">{value}</span></div>;
}

function Overview({ d, ref, currentPassage, overMax, lastSeeding }: { d: CellLineData; ref?: CellLineRef; currentPassage: number; overMax: boolean; lastSeeding: string }) {
  const density = num(d.densityPerCm2);
  return (
    <div className="bench-grid">
      <Panel title="At a glance">
        <div className="cl-facts">
          <Fact label="Culture type" value={<span className="cap">{d.culture}</span>} />
          <Fact label="Doubling time" value={d.doublingTimeH ? `${d.doublingTimeH} h` : "—"} />
          <Fact label="Passage number" value={<span className={overMax ? "cl-warn" : undefined}>P{currentPassage}{overMax ? " · at your limit" : ""}</span>} />
          <Fact label="Last seeding" value={lastSeeding || "—"} />
          <Fact label="Cells at 100% confluency" value={density !== null ? `${cells(density)}/cm²` : "—"} />
          <Fact label="Passages recorded" value={d.passages.length} />
        </div>
        {d.details && <p className="cl-details">{d.details}</p>}
      </Panel>
      <Panel title="Reference">
        {d.organism || d.tissue || d.disease ? (
          <div className="cl-facts">
            {d.organism && <Fact label="Organism" value={d.organism} />}
            {d.tissue && <Fact label="Tissue / origin" value={d.tissue} />}
            {d.disease && <Fact label="Disease" value={d.disease} />}
            {d.medium && <Fact label="Recommended medium" value={d.medium} />}
            {d.receptor && <Fact label="Receptor status" value={d.receptor} />}
          </div>
        ) : <p className="muted small">No reference facts yet. Open Profile and pick a known cell line, or fill them in.</p>}
        {d.mutations.trim() && <div className="cl-mutations"><span className="cl-fact-label"><Dna size={13} /> Driver mutations</span>
          <ul>{d.mutations.split("\n").filter((m) => m.trim()).map((m, k) => <li key={k}>{m}</li>)}</ul></div>}
        {ref && <p className="muted small">Reference: {ref.name} · Cellosaurus {ref.cellosaurus}{ref.atcc ? ` · ATCC ${ref.atcc}` : ""}. Values vary between labs — verify against your own cells.</p>}
      </Panel>
    </div>
  );
}

// ── Profile (read → edit) + growth preview ───────────────────────────────────

function Profile({ d, editing, set, edit }: { d: CellLineData; editing: boolean; set: (p: Partial<CellLineData>) => void; edit: (p: Partial<CellLineData>) => void }) {
  function choose(id: string) {
    const r = cellLineRef(id);
    set(r ? fromRef(r) : { reference: id });
  }
  return (
    <>
      <Panel title="Cell line profile">
        {editing ? (
          <>
            <div className="bench-fields">
              <label className="field">
                <span>Culture type</span>
                <select value={d.culture} onChange={(e) => edit({ culture: e.target.value as CellLineData["culture"] })}>
                  <option value="adherent">Adherent</option>
                  <option value="suspension">Suspension</option>
                </select>
              </label>
              <label className="field">
                <span>Start from a known cell line</span>
                <select value={d.reference} onChange={(e) => choose(e.target.value)}>
                  <option value="custom">Custom</option>
                  {PANELS.map(([p, label]) => (
                    <optgroup key={p} label={label}>
                      {CELL_LINES.filter((c) => c.panel === p).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted small">Picking a line fills in the fields below from the reference catalogue. Change any of them and it becomes Custom. Verify against your own cells.</p>
            <div className="bench-fields">
              <TextField label="Name" value={d.name} placeholder="e.g. HEK293T" onChange={(name) => set({ name })} />
              <TextField label="Organism" value={d.organism} placeholder="Human" onChange={(organism) => edit({ organism })} />
              <TextField label="Tissue / origin" value={d.tissue} placeholder="Pancreas" onChange={(tissue) => edit({ tissue })} />
            </div>
            <div className="bench-fields">
              <TextField label="Disease" value={d.disease} placeholder="e.g. Ductal adenocarcinoma" onChange={(disease) => edit({ disease })} />
              <TextField label="Recommended medium" value={d.medium} placeholder="DMEM + 10% FBS" onChange={(medium) => edit({ medium })} />
              <TextField label="Receptor status (breast)" value={d.receptor} placeholder="e.g. Triple-negative" onChange={(receptor) => edit({ receptor })} />
            </div>
            <div className="bench-fields">
              <NumField label="Doubling time (h)" value={d.doublingTimeH} placeholder="24" onChange={(doublingTimeH) => edit({ doublingTimeH })} />
              <NumField label="Density at 100% confluency (cells/cm²)" value={d.densityPerCm2} placeholder="130000" onChange={(densityPerCm2) => edit({ densityPerCm2 })} />
            </div>
            <div className="bench-fields">
              <NumField label="Maximum passages" value={d.maxPassages} placeholder="20" whole onChange={(maxPassages) => set({ maxPassages })} />
              <NumField label="Starting passage" value={d.startingPassage} placeholder="0" whole onChange={(startingPassage) => set({ startingPassage })} />
            </div>
            <label className="field">
              <span>Driver mutations / markers (one per line)</span>
              <textarea rows={3} value={d.mutations} placeholder={"KRAS p.G12D\nTP53 p.R273H"} onChange={(e) => edit({ mutations: e.target.value })} />
            </label>
            <label className="field">
              <span>Details</span>
              <textarea rows={2} value={d.details} placeholder="Mycoplasma-tested clean. Keep below passage 30." onChange={(e) => set({ details: e.target.value })} />
            </label>
          </>
        ) : (
          <div className="cl-facts">
            <Fact label="Name" value={d.name || "—"} />
            <Fact label="Culture type" value={<span className="cap">{d.culture}</span>} />
            <Fact label="Doubling time" value={d.doublingTimeH ? `${d.doublingTimeH} h` : "—"} />
            <Fact label="Density at 100%" value={num(d.densityPerCm2) !== null ? `${cells(num(d.densityPerCm2)!)}/cm²` : "—"} />
            <Fact label="Medium" value={d.medium || "—"} />
            <Fact label="Max passages" value={d.maxPassages || "—"} />
            <p className="muted small" style={{ gridColumn: "1 / -1" }}>Press Edit to change the profile.</p>
          </div>
        )}
      </Panel>

      <Panel title="Growth preview">
        <div className="bench-fields">
          <NumField label="Seeded at (% confluent)" value={d.seedPct} placeholder="20" onChange={(seedPct) => set({ seedPct })} />
          <NumField label="Split at (% confluent)" value={d.targetPct} placeholder="90" onChange={(targetPct) => set({ targetPct })} />
        </div>
        <input className="cl-slider" type="range" min={5} max={95} step={5} value={num(d.seedPct) ?? 20} aria-label="Seeding confluency" onChange={(e) => set({ seedPct: e.target.value })} />
        <GrowthChart doublingTimeH={num(d.doublingTimeH)} seedPct={num(d.seedPct)} targetPct={num(d.targetPct)} />
        <p className="muted small">Confluency over time at {d.doublingTimeH || "—"} h doubling. The dashed line is your split point.</p>
      </Panel>
    </>
  );
}

const PW = 360, PH = 220, PL = 44, PR = 16, PT = 12, PB = 34;
function GrowthChart({ doublingTimeH, seedPct, targetPct }: { doublingTimeH: number | null; seedPct: number | null; targetPct: number | null }) {
  const pts = confluenceOverTime(doublingTimeH, seedPct);
  if (pts.length < 2) return <p className="muted small">Enter a doubling time and seeding confluency to see the curve.</p>;
  const maxX = pts[pts.length - 1].x;
  const xt = niceTicks(0, maxX), yt = [0, 25, 50, 75, 100];
  const x1 = xt[xt.length - 1];
  const sx = (x: number) => PL + (x / x1) * (PW - PL - PR);
  const sy = (y: number) => PH - PB - (y / 100) * (PH - PT - PB);
  const line = pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const split = targetPct !== null && targetPct > 0 && targetPct <= 100 ? timeToConfluence({ doublingTimeH, startPct: seedPct, targetPct }) : null;
  const tSplit = split?.result ? split.result.value : null;
  return (
    <svg className="bench-plot cl-plot" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={`Confluency over time; split near ${tSplit !== null ? fmt(tSplit) + " hours" : "the target"}`}>
      {yt.map((y) => <g key={y}><line className="grid" x1={PL} x2={PW - PR} y1={sy(y)} y2={sy(y)} /><text className="tick" x={PL - 6} y={sy(y) + 3} textAnchor="end">{y}%</text></g>)}
      {xt.map((x) => <text key={x} className="tick" x={sx(x)} y={PH - PB + 16} textAnchor="middle">{fmt(x / 24, 2)} d</text>)}
      <line className="axis" x1={PL} x2={PW - PR} y1={sy(0)} y2={sy(0)} />
      <line className="axis" x1={PL} x2={PL} y1={PT} y2={PH - PB} />
      <polyline className="fit" fill="none" points={line} />
      {tSplit !== null && tSplit <= x1 && <>
        <line className="guide" x1={PL} x2={sx(tSplit)} y1={sy(targetPct!)} y2={sy(targetPct!)} />
        <line className="guide" x1={sx(tSplit)} x2={sx(tSplit)} y1={sy(targetPct!)} y2={sy(0)} />
        <circle className="cl-split" cx={sx(tSplit)} cy={sy(targetPct!)} r={4} />
        <text className="cl-split-label" x={sx(tSplit)} y={sy(targetPct!) - 8} textAnchor="middle">{fmt(tSplit / 24, 2)} d</text>
      </>}
    </svg>
  );
}

// ── Seeding ──────────────────────────────────────────────────────────────────

function Seeding({ d, set }: { d: CellLineData; set: (p: Partial<CellLineData>) => void }) {
  const v = vessel(d.seedVessel);
  const count = num(d.seedCount);
  const density = num(d.seedDensity);
  const perVessel = guard(cellsForArea(density, v ? v.areaCm2 : null), d.seedDensity, d.seedCount);
  const totalCells = perVessel.result && count !== null && count > 0 ? perVessel.result.value * count : null;
  const stock = num(d.stockConc);
  const suspensionMl = totalCells !== null && stock !== null && stock > 0 ? totalCells / stock : null; // cells ÷ cells/mL
  const totalMediumMl = v && count !== null ? v.mediumMl * count : null;
  return (
    <div className="bench-grid">
      <Panel title="Seed a vessel">
        <div className="bench-fields">
          <NumField label="Seeding density (cells/cm²)" value={d.seedDensity} placeholder="15000" onChange={(seedDensity) => set({ seedDensity })} />
          <label className="field">
            <span>Vessel</span>
            <select value={d.seedVessel} onChange={(e) => set({ seedVessel: e.target.value })}>
              {VESSELS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <NumField label="How many" value={d.seedCount} placeholder="1" whole onChange={(seedCount) => set({ seedCount })} />
          <NumField label="Your cell concentration (cells/mL)" value={d.stockConc} placeholder="1000000" onChange={(stockConc) => set({ stockConc })} />
        </div>
        <p className="muted small">{v ? `${v.label}: ${fmt(v.areaCm2)} cm², about ${fmt(v.mediumMl)} mL medium.` : ""}</p>
      </Panel>
      <Panel title="What to pipette" className="bench-results">
        <Reason outcome={perVessel} />
        {perVessel.result && <>
          <Stat strong label="Cells per vessel" value={cells(perVessel.result.value)} />
          {totalCells !== null && count! > 1 && <Stat label={`Total for ${count}`} value={cells(totalCells)} />}
          {suspensionMl !== null ? <>
            <Stat strong label="Suspension to pipette" value={fmtQ({ value: suspensionMl, unit: "mL" })} />
            {totalMediumMl !== null && <Stat label="Medium to add" value={fmtQ({ value: Math.max(0, totalMediumMl - suspensionMl), unit: "mL" })} />}
            <Instruction>Pipette {fmtQ({ value: suspensionMl, unit: "mL" })} of your suspension{totalMediumMl !== null ? ` and make up to ${fmtQ({ value: totalMediumMl, unit: "mL" })} with medium` : ""}.</Instruction>
          </> : <p className="muted small">Enter your cell concentration to get the volume to pipette.</p>}
        </>}
      </Panel>
    </div>
  );
}

// ── Splitting timer ──────────────────────────────────────────────────────────

function SplittingTimer({ d, set }: { d: CellLineData; set: (p: Partial<CellLineData>) => void }) {
  const [done, setDone] = useState("");
  const out = guard(timeToConfluence({ doublingTimeH: num(d.doublingTimeH), startPct: num(d.seedPct), targetPct: num(d.targetPct) }), d.doublingTimeH, d.seedPct, d.targetPct);
  const hours = out.result ? out.result.value : null;
  function startTimer() {
    if (hours === null) return;
    addTimer(d.name ? `Split ${d.name}` : "Split cells", Math.round(hours * 3600), "violet", true);
    setDone("Timer started — it will alert when the cells should be ready to split.");
  }
  function setReminder() {
    const at = Date.parse(d.reminderAt);
    if (!Number.isFinite(at)) { setDone("Pick a date and time first."); return; }
    putReminder(`cellline:${item_key(d)}`, { at, title: d.name ? `Split ${d.name}` : "Split cells", body: d.details || null });
    setDone("Reminder set.");
  }
  return (
    <>
      <Tabs value={d.timerMode === "date" ? "date" : "calc"} options={[["calc", "Calculate"], ["date", "Pick a date"]]} onChange={(m) => set({ timerMode: m })} />
      <Panel title="Splitting timer">
        <p className="muted small">Set a reminder to split once the cells reach your target confluency. Time to split: t = Td · log₂(C_target / C_start).</p>
        {d.timerMode === "date" ? (
          <>
            <label className="field">
              <span>Remind me on</span>
              <input type="datetime-local" value={d.reminderAt} onChange={(e) => set({ reminderAt: e.target.value })} />
            </label>
            <div className="row wrap bench-actions"><button type="button" className="primary" onClick={setReminder}><Bell size={15} /> Set reminder</button></div>
          </>
        ) : (
          <>
            <div className="bench-fields">
              <NumField label="Doubling time (h)" value={d.doublingTimeH} placeholder="24" onChange={(doublingTimeH) => set({ doublingTimeH })} />
              <NumField label="Current confluency (%)" value={d.seedPct} placeholder="20" onChange={(seedPct) => set({ seedPct })} />
              <NumField label="Target confluency (%)" value={d.targetPct} placeholder="90" onChange={(targetPct) => set({ targetPct })} />
            </div>
            <Reason outcome={out} />
            {hours !== null && <>
              <Stat strong label="Time until splitting" value={`${fmt(hours, 3)} h`} />
              <Instruction>About {fmt(hours / 24, 2)} days at {d.doublingTimeH} h doubling.</Instruction>
              <div className="row wrap bench-actions"><button type="button" className="primary" onClick={startTimer}><Play size={15} /> Start splitting timer</button></div>
            </>}
          </>
        )}
        {done && <p className="notice" role="status">{done}</p>}
      </Panel>
    </>
  );
}
/** A stable-ish key for the reminder row, from the line name. */
function item_key(d: CellLineData): string {
  return (d.name || "cell-line").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
}

// ── Passages ─────────────────────────────────────────────────────────────────

function today(): string {
  const t = new Date();
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function Passages({ d, set, setPassage, startingPassage }: { d: CellLineData; set: (p: Partial<CellLineData>) => void; setPassage: (id: string, p: Partial<PassageRecord>) => void; startingPassage: number }) {
  const [open, setOpen] = useState<string | null>(d.passages.at(-1)?.id ?? null);
  function add() {
    const p = newPassage(today());
    const last = d.passages.at(-1);
    if (last) { p.medium = last.medium; p.antibiotic = last.antibiotic; p.incubation = last.incubation; }
    set({ passages: [...d.passages, p] });
    setOpen(p.id);
  }
  function remove(id: string) { set({ passages: d.passages.filter((x) => x.id !== id) }); }
  // Newest first, but the passage number counts up from the starting passage (oldest = P{start}).
  const rows = d.passages.map((p, i) => ({ p, label: `P${startingPassage + i}` })).reverse();
  return (
    <Panel title="Passages">
      <p className="muted small">Track your passages — record the conditions and keep a history of the line.</p>
      <div className="row wrap bench-actions"><button type="button" onClick={add}><Plus size={14} /> Passage</button></div>
      {rows.length === 0 ? <p className="muted">No passages yet. Add one when you seed the cells.</p> : (
        <ul className="cl-timeline">
          {rows.map(({ p, label }) => {
            const isOpen = open === p.id;
            return (
              <li key={p.id} className="cl-pass">
                <button type="button" className="cl-pass-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                  <strong>{label}</strong>
                  <span className="muted small">{p.seedingDate || "no date"}{p.medium ? ` · ${p.medium}` : ""}{p.antibiotic ? ` · ${p.antibiotic}` : ""}</span>
                  <ChevronDown size={16} className={isOpen ? "cl-flip" : undefined} />
                </button>
                {isOpen && (
                  <div className="cl-pass-body">
                    <label className="field"><span>Seeding date</span><input type="date" value={p.seedingDate} onChange={(e) => setPassage(p.id, { seedingDate: e.target.value })} /></label>
                    <TextField label="Culture medium" value={p.medium} placeholder="DMEM + 10% FBS" onChange={(medium) => setPassage(p.id, { medium })} />
                    <TextField label="Antibiotic" value={p.antibiotic} placeholder="Pen/Strep" onChange={(antibiotic) => setPassage(p.id, { antibiotic })} />
                    <TextField label="Incubation conditions" value={p.incubation} placeholder="37°C, 5% CO₂" onChange={(incubation) => setPassage(p.id, { incubation })} />
                    <label className="field"><span>Note</span><textarea rows={2} value={p.note} placeholder="Split 1:6 when confluence reaches target" onChange={(e) => setPassage(p.id, { note: e.target.value })} /></label>
                    <div className="row"><button type="button" className="icon danger" aria-label={`Delete ${label}`} onClick={() => remove(p.id)}><Trash2 size={15} /></button></div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
