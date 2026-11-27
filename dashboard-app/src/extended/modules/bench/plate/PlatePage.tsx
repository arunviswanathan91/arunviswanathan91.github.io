import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, ArrowLeft, ClipboardList, CopyPlus, Download, FlaskConical, Pin, Pipette, Plus, Redo2, Save, Settings2, Trash2, Undo2 } from "lucide-react";
import { ask } from "../../../../lib/dialogs.tsx";
import { insert, list, trash, update, useLoad } from "../../../lib/db.ts";
import { fmtDateTime } from "../../../lib/dates.ts";
import { go, href, type Route } from "../../../lib/route.ts";
import { useAutosave } from "../../../lib/useAutosave.ts";
import type { Experiment, LibraryEntry } from "../../../lib/types.ts";
import { Modal } from "../../../components/Modal.tsx";
import { ProjectSelect, projectName, useProjects } from "../../../components/pickers.tsx";
import { TagInput } from "../../../components/TagInput.tsx";
import { ErrorText, Field, PageHeader, SaveIndicator, Tabs } from "../../../components/ui.tsx";
import { ExportDialog } from "./ExportDialog.tsx";
import {
  FORMATS, MAX_COLS, MAX_ROWS, allWellIds, formatLabel, formatOf, legend, lostOnResize, mapSummary, newPlate, parsePlateMap, passCount, patchWells, planPass, resizePlate, tableRows,
  type Plate, type PlateMapData, type Progress, type Well,
} from "./logic.ts";
import { PipetteMode } from "./PipetteMode.tsx";
import { PlateGrid } from "./PlateGrid.tsx";
import { WellPanel, useNarrow } from "./WellPanel.tsx";
import "./plate.css";

/** A saved plate map: a row of bench_items of kind "plate". */
export interface PlateRow {
  id: string;
  kind: string;
  title: string;
  data: unknown;
  notes: string | null;
  tags: string[] | null;
  project_id: string | null;
  library_entry_id: string | null;
  experiment_id: string | null;
  pinned: boolean;
  archived_at: string | null;
  updated_at: string;
}

const KIND = "plate";
const itemPath = (id: string) => `bench/item/${id}`;
const protocols = () => list<LibraryEntry>("library_entries", { eq: { kind: "protocol" }, order: [["title"]] });
const experiments = () => list<Experiment>("experiments", { order: [["updated_at", false]] });

// ── Undo and redo ────────────────────────────────────────────────────────────

interface History { past: PlateMapData[]; present: PlateMapData; future: PlateMapData[]; tag: string }
/** Undo brings back the wells, not the pipetting: progress made since stays with its plate. */
function keepProgress(target: PlateMapData, now: PlateMapData): PlateMapData {
  return {
    plates: target.plates.map((p, i) => {
      const live = now.plates[i];
      const { progress: _old, ...rest } = p;
      return live && live.rows === p.rows && live.cols === p.cols && live.progress ? { ...rest, progress: live.progress } : rest;
    }),
  };
}
function useHistory(initial: () => PlateMapData) {
  const [h, setH] = useState<History>(() => ({ past: [], present: initial(), future: [], tag: "" }));
  /** An edit. Edits that share a tag and follow one another (typing in one field) undo together. */
  const commit = useCallback((next: (d: PlateMapData) => PlateMapData, tag = "") => setH((s) => {
    const present = next(s.present);
    if (present === s.present) return s;
    return tag && tag === s.tag ? { ...s, present, future: [] } : { past: [...s.past.slice(-99), s.present], present, future: [], tag };
  }), []);
  /** A change that is not an edit (pipetting progress): no undo step. */
  const quiet = useCallback((next: (d: PlateMapData) => PlateMapData) => setH((s) => ({ ...s, present: next(s.present) })), []);
  const undo = useCallback(() => setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: keepProgress(s.past[s.past.length - 1], s.present), future: [s.present, ...s.future], tag: "" } : s)), []);
  const redo = useCallback(() => setH((s) => (s.future.length ? { past: [...s.past, s.present], present: keepProgress(s.future[0], s.present), future: s.future.slice(1), tag: "" } : s)), []);
  return { data: h.present, canUndo: h.past.length > 0, canRedo: h.future.length > 0, commit, quiet, undo, redo };
}

// ── The page ─────────────────────────────────────────────────────────────────

/** The plate-map editor. With `item` it edits a saved map and saves as you go; without, it is a new map until "Save". */
export function PlatePage({ item, route }: { item?: PlateRow; route: Route }) {
  const { data, canUndo, canRedo, commit, quiet, undo, redo } = useHistory(() => parsePlateMap(item?.data));
  const [e, setE] = useState<PlateRow | undefined>(item);
  const [index, setIndex] = useState(0);
  const cur = Math.min(index, data.plates.length - 1);
  const plate = data.plates[cur];
  const [selectedRaw, setSelected] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [view, setView] = useState<"wells" | "table">("wells");
  // On a phone the plate is always on show, with the labelled wells listed under the well card.
  const narrow = useNarrow();
  const showWells = narrow || view === "wells";
  const [clip, setClip] = useState<Well | null>(null);
  const [open, setOpen] = useState<"" | "pipette" | "export" | "add" | "settings" | "save">("");
  const [problem, setProblem] = useState("");
  const { projects } = useProjects();
  const { data: protocolList = [] } = useLoad(protocols, []);
  const { data: experimentList = [] } = useLoad(experiments, []);

  const inPlate = new Set(allWellIds(plate.rows, plate.cols));
  const selected = selectedRaw.filter((id) => inPlate.has(id));

  // A saved map saves itself: the wells and the pipetting progress with them.
  const autosave = useAutosave<PlateRow>(async (patch) => {
    if (!e) return;
    const row = await update<PlateRow>("bench_items", e.id, patch, true);
    setE((x) => (x ? { ...x, updated_at: row.updated_at } : x));
  });
  const firstData = useRef(data);
  useEffect(() => {
    if (!item || data === firstData.current) return;
    firstData.current = data;
    autosave.change({ data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  // A new map with work in it: ask before the tab is closed.
  useEffect(() => {
    if (item || !canUndo) return;
    const beforeUnload = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [item, canUndo]);

  function change(patch: Partial<PlateRow>) {
    setE((x) => (x ? { ...x, ...patch } : x));
    autosave.change(patch);
  }
  const blur = () => void autosave.flush();

  const setPlate = (next: Plate, tag?: string) => commit((d) => ({ plates: d.plates.map((p, i) => (i === cur ? next : p)) }), tag ? `${cur}:${tag}` : "");
  const setProgress = (progress: Progress | undefined) => quiet((d) => ({
    plates: d.plates.map((p, i) => {
      if (i !== cur) return p;
      const { progress: _old, ...rest } = p;
      return progress ? { ...rest, progress } : rest;
    }),
  }));

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, while no dialog is open. The item's own title and notes keep the browser's undo.
  useEffect(() => {
    if (open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.key.toLowerCase() !== "z") return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest("input, textarea, select") && !target.closest(".pm-panel")) return;
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, undo, redo]);

  function pickPlate(i: number) {
    setIndex(i);
    setSelected([]);
  }
  async function duplicate() {
    if (!e) return;
    setProblem("");
    try {
      await autosave.flush();
      // The copy starts fresh: the wells without the pipetting progress.
      const copy = await insert<PlateRow>("bench_items", {
        kind: KIND, title: `${e.title || "Plate map"} (copy)`.slice(0, 200), data: { plates: data.plates.map(({ progress: _p, ...rest }) => rest) }, notes: e.notes ?? "", tags: e.tags ?? [],
        project_id: e.project_id, library_entry_id: e.library_entry_id, experiment_id: e.experiment_id,
      });
      go(itemPath(copy.id));
    } catch (err) {
      setProblem((err as Error).message);
    }
  }
  async function del() {
    if (!e || !(await ask(`Move “${e.title}” to Trash? You can restore it from Trash.`, "Move to Trash"))) return;
    try {
      await autosave.flush();
      await trash("bench_items", e.id);
      go("bench/plate");
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  const groups = legend(plate);
  const rows = tableRows(plate);
  const pass = plate.progress ? passCount(planPass(plate).steps, new Set(plate.progress.done)) : { done: 0, total: 0 };
  const title = e ? e.title : "";
  const protocol = protocolList.find((p) => p.id === e?.library_entry_id);
  const experiment = experimentList.find((x) => x.id === e?.experiment_id);

  return (
    <section className={`pm-page ${e ? "detail" : ""}`}>
      <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
      {e ? (
        <header className="detail-head note-head">
          <div>
            <span className="kicker">Plate map</span>
            <input className="title-input" aria-label="Title" value={e.title} maxLength={200} placeholder="Untitled plate map" onChange={(ev) => change({ title: ev.target.value })} onBlur={blur} />
          </div>
          <div className="page-actions">
            <SaveIndicator status={autosave.status} error={autosave.error} />
            <button onClick={() => void duplicate()}><CopyPlus size={14} /> Duplicate</button>
            <button className={`icon ${e.pinned ? "on" : ""}`} aria-pressed={e.pinned} aria-label={e.pinned ? "Unpin" : "Pin"} onClick={() => change({ pinned: !e.pinned })}><Pin size={16} /></button>
            <button className="icon" aria-label={e.archived_at ? "Unarchive" : "Archive"} onClick={() => change({ archived_at: e.archived_at ? null : new Date().toISOString() })}>
              {e.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
            <button className="icon danger" aria-label="Move to Trash" onClick={() => void del()}><Trash2 size={16} /></button>
          </div>
        </header>
      ) : (
        <PageHeader section="bench" title="Plate map" subtitle="Label the wells of a plate, then work through it well by well in pipette mode."
          actions={<button className="primary" onClick={() => setOpen("save")}><Save size={16} /> Save</button>} />
      )}
      {e?.archived_at && <p className="notice">This item is archived. It’s hidden from the Bench list until you unarchive it.</p>}
      <ErrorText error={problem} />

      <div className="pm-bar">
        <div className="pm-plates" role="tablist" aria-label="Plates">
          {data.plates.map((p, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === cur} className={i === cur ? "on" : ""} onClick={() => pickPlate(i)}>{p.name}</button>
          ))}
        </div>
        <button type="button" onClick={() => setOpen("add")}><Plus size={14} aria-hidden /> Add plate</button>
        <button type="button" onClick={() => setOpen("settings")}><Settings2 size={14} aria-hidden /> {formatLabel(plate.rows, plate.cols)}</button>
        <label className="pm-multi">
          <input type="checkbox" role="switch" className="pm-switch" checked={multi} onChange={(ev) => setMulti(ev.target.checked)} /> <span>Multi-select</span>
        </label>
      </div>

      <div className="pm-bar pm-tools">
        {!narrow && <Tabs<"wells" | "table"> value={view} options={[["wells", "Wells"], ["table", "Table"]]} onChange={setView} counts={{ table: rows.length }} />}
        <span className="pm-undo">
          <button type="button" className="icon" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={18} /></button>
          <button type="button" className="icon" aria-label="Redo" title="Redo (Shift+Ctrl/Cmd+Z)" disabled={!canRedo} onClick={redo}><Redo2 size={18} /></button>
        </span>
        <span className="pm-go">
          <button type="button" onClick={() => setOpen("export")}><Download size={15} aria-hidden /> Download</button>
          <button type="button" className="primary pm-pipette" onClick={() => setOpen("pipette")}>
            <Pipette size={16} aria-hidden /> {pass.done > 0 && pass.done < pass.total ? `Resume pipetting (${pass.done} of ${pass.total})` : "Pipette mode"}
          </button>
        </span>
      </div>

      <div className="pm-layout">
        <div className="pm-main">
          <div className="card pm-card">
            {showWells ? (
              <PlateGrid plate={plate} selected={selected} multi={multi} onSelect={setSelected} />
            ) : rows.length ? (
              <div className="table-scroll">
                <table className="pm-table">
                  <thead><tr><th>Well</th><th>Title</th><th>Group</th><th>Components</th><th>Note</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.well} data-on={selected.includes(r.well) || undefined}>
                        <td><button type="button" className="link" aria-label={`Select well ${r.well}`} aria-pressed={selected.includes(r.well)} onClick={() => setSelected([r.well])}>{r.well}</button></td>
                        <td>{r.title}</td><td>{r.group}</td><td>{r.components}</td><td>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted pm-empty">No labelled wells yet. Switch to “Wells”, select some and give them a title.</p>}
          </div>
          <p className="muted small pm-status" role="status">
            {selected.length ? `${selected.length} well${selected.length === 1 ? "" : "s"} selected` : "Nothing selected"}
            {selected.length > 0 && <> · <button type="button" className="link" onClick={() => setSelected([])}>Clear selection</button></>}
          </p>
          {groups.length > 0 && (
            <ul className="pm-legend" aria-label="Groups">
              {groups.map((g) => (
                <li key={g.group}>
                  <button type="button" title={`Select the wells of ${g.group}`} onClick={() => { setView("wells"); setSelected(allWellIds(plate.rows, plate.cols).filter((id) => plate.wells[id]?.group?.trim() === g.group)); }}>
                    <i className="pm-dot" data-tone={g.color || undefined} aria-hidden /> <span>{g.group}</span> <b>{g.count} well{g.count === 1 ? "" : "s"}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <WellPanel plate={plate} selected={selected} clip={clip} onCopy={setClip} change={setPlate} />
        {narrow && (
          <div className="card pad pm-list">
            <h3>Labelled wells</h3>
            {rows.length ? (
              <ul>
                {rows.map((r) => (
                  <li key={r.well}>
                    <button type="button" aria-label={`Select well ${r.well}`} aria-pressed={selected.includes(r.well)} data-on={selected.includes(r.well) || undefined}
                      onClick={() => { setSelected([r.well]); document.querySelector(".pm-panel")?.scrollIntoView({ block: "nearest" }); }}>
                      <b>{r.well}</b>
                      <i className="pm-dot" data-tone={plate.wells[r.well]?.color || undefined} aria-hidden />
                      <span className="pm-list-text"><strong>{r.title || "No title"}</strong>{r.note ? <small>{r.note}</small> : null}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">No labelled wells yet. Tap a well and give it a title.</p>}
          </div>
        )}
      </div>

      {e ? (
        <>
          <div className="card pad bench-details">
            <h3>Details</h3>
            <div className="note-props">
              <label className="field">
                <span>Project</span>
                <ProjectSelect value={e.project_id} onChange={(project_id) => change({ project_id })} />
              </label>
              <label className="field">
                <span>Protocol</span>
                <select value={e.library_entry_id ?? ""} onChange={(ev) => change({ library_entry_id: ev.target.value || null })}>
                  <option value="">No protocol</option>
                  {protocolList.filter((p) => !p.archived_at || p.id === e.library_entry_id).map((p) => <option key={p.id} value={p.id}>{(p.title || "Untitled protocol").slice(0, 80)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Experiment</span>
                <select value={e.experiment_id ?? ""} onChange={(ev) => change({ experiment_id: ev.target.value || null })}>
                  <option value="">No experiment</option>
                  {experimentList.filter((x) => !x.archived_at || x.id === e.experiment_id).map((x) => <option key={x.id} value={x.id}>{(x.title || "Untitled experiment").slice(0, 80)}</option>)}
                </select>
              </label>
              <div className="field grow">
                <span>Tags</span>
                <TagInput value={e.tags ?? []} onChange={(tags) => change({ tags })} />
              </div>
            </div>
            <div className="link-row small bench-links">
              {e.project_id && <a href={href(`projects/${e.project_id}`)}>→ {projectName(projects, e.project_id)}</a>}
              {protocol && <a href={href(`protocols/${protocol.id}`)}>→ {protocol.title || "Protocol"}</a>}
              {experiment && <a href={href(`experiments/${experiment.id}`)}>→ {experiment.title || "Experiment"}</a>}
            </div>
            <label className="field">
              <span>Notes</span>
              <textarea rows={4} value={e.notes ?? ""} placeholder="Cell line, passage, lot numbers, what the plate is for…" onChange={(ev) => change({ notes: ev.target.value })} onBlur={blur} />
            </label>
          </div>
          <p className="small muted">Last saved {fmtDateTime(e.updated_at)}</p>
        </>
      ) : <SavedMaps />}

      {open === "pipette" && (
        <PipetteMode plate={plate} mapTitle={title} saved={!!e} onProgress={setProgress} onClose={() => { setOpen(""); if (e) void autosave.flush(); }}
          onNote={(ids, note) => setPlate(patchWells(plate, ids, { note }))} />
      )}
      {open === "export" && <ExportDialog title={title || "Plate map"} notes={e?.notes ?? ""} plates={data.plates} current={cur} onClose={() => setOpen("")} />}
      {open === "add" && (
        <PlateForm title="Add plate" initial={newPlate(`Plate ${data.plates.length + 1}`, plate.rows, plate.cols)} onClose={() => setOpen("")}
          onSubmit={(p) => { commit((d) => ({ plates: [...d.plates, p] })); pickPlate(data.plates.length); setOpen(""); }} />
      )}
      {open === "settings" && (
        <PlateForm title="Plate settings" initial={plate} existing onClose={() => setOpen("")}
          onSubmit={(p) => { setPlate(p.rows === plate.rows && p.cols === plate.cols ? { ...plate, name: p.name } : { ...resizePlate(plate, p.rows, p.cols), name: p.name }); setOpen(""); }}
          onDelete={data.plates.length > 1 ? () => { commit((d) => ({ plates: d.plates.filter((_, i) => i !== cur) })); pickPlate(Math.max(0, cur - 1)); setOpen(""); } : undefined} />
      )}
      {open === "save" && <SaveForm data={data} protocolId={route.query.get("protocol")} experimentId={route.query.get("experiment")} onClose={() => setOpen("")} />}
    </section>
  );
}

// ── Adding a plate, changing its size ────────────────────────────────────────

function PlateForm({ title, initial, existing, onSubmit, onDelete, onClose }: { title: string; initial: Plate; existing?: boolean; onSubmit: (p: Plate) => void; onDelete?: () => void; onClose: () => void }) {
  const [name, setName] = useState(initial.name);
  const known = formatOf(initial.rows, initial.cols);
  const [format, setFormat] = useState(known ? String(known.wells) : "custom");
  const [rowsText, setRowsText] = useState(String(initial.rows));
  const [colsText, setColsText] = useState(String(initial.cols));
  const picked = FORMATS.find((f) => String(f.wells) === format);
  const whole = (text: string, max: number) => (/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= max ? Number(text) : null);
  const rows = picked ? picked.rows : whole(rowsText, MAX_ROWS);
  const cols = picked ? picked.cols : whole(colsText, MAX_COLS);
  const lost = existing && rows && cols ? lostOnResize(initial, rows, cols) : 0;
  const resized = existing && (rows !== initial.rows || cols !== initial.cols);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!rows || !cols) return;
    onSubmit({ ...initial, name: name.trim().slice(0, 60) || initial.name, rows, cols });
  }
  async function del() {
    if (onDelete && (await ask(`Delete “${initial.name}” from this map? Undo brings it back.`, "Delete plate"))) onDelete();
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Name"><input value={name} maxLength={60} onChange={(ev) => setName(ev.target.value)} /></Field>
        <Field label="Format">
          <select value={format} onChange={(ev) => setFormat(ev.target.value)}>
            {FORMATS.map((f) => <option key={f.wells} value={f.wells}>{f.wells} wells ({f.rows} × {f.cols})</option>)}
            <option value="custom">Custom rows × columns</option>
          </select>
        </Field>
        {!picked && (
          <div className="pm-two">
            <Field label={`Rows (1 to ${MAX_ROWS})`}><input inputMode="numeric" autoComplete="off" value={rowsText} aria-invalid={rows === null || undefined} onChange={(ev) => setRowsText(ev.target.value)} /></Field>
            <Field label={`Columns (1 to ${MAX_COLS})`}><input inputMode="numeric" autoComplete="off" value={colsText} aria-invalid={cols === null || undefined} onChange={(ev) => setColsText(ev.target.value)} /></Field>
          </div>
        )}
        {resized && <p className="muted small">{lost > 0 ? `${lost} labelled or coloured well${lost === 1 ? "" : "s"} outside the new size will be removed. ` : ""}Changing the size clears this plate’s pipetting progress. Undo brings the wells back.</p>}
        <div className="form-actions">
          {onDelete && <button type="button" className="danger-btn" onClick={() => void del()}><Trash2 size={14} aria-hidden /> Delete plate</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!rows || !cols}>{existing ? "Apply" : "Add plate"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Saving a new map, and the saved ones ─────────────────────────────────────

function SaveForm({ data, protocolId, experimentId, onClose }: { data: PlateMapData; protocolId: string | null; experimentId: string | null; onClose: () => void }) {
  const { data: protocolList = [] } = useLoad(protocols, []);
  const { data: experimentList = [] } = useLoad(experiments, []);
  const [title, setTitle] = useState("");
  const [protocol, setProtocol] = useState(protocolId ?? "");
  const [experiment, setExperiment] = useState(experimentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await insert<PlateRow>("bench_items", { kind: KIND, title: (title.trim() || "Untitled plate map").slice(0, 200), data, library_entry_id: protocol || null, experiment_id: experiment || null });
      go(itemPath(row.id));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Save plate map" onClose={onClose}>
      <form className="form" onSubmit={(ev) => void submit(ev)}>
        <Field label="Name"><input value={title} maxLength={200} placeholder="e.g. MTT assay, gemcitabine dose response" onChange={(ev) => setTitle(ev.target.value)} /></Field>
        <Field label="Protocol (optional)">
          <select value={protocol} onChange={(ev) => setProtocol(ev.target.value)}>
            <option value="">No protocol</option>
            {protocolList.filter((x) => !x.archived_at || x.id === protocol).map((x) => <option key={x.id} value={x.id}>{(x.title || "Untitled protocol").slice(0, 80)}</option>)}
          </select>
        </Field>
        <Field label="Experiment (optional)">
          <select value={experiment} onChange={(ev) => setExperiment(ev.target.value)}>
            <option value="">No experiment</option>
            {experimentList.filter((x) => !x.archived_at || x.id === experiment).map((x) => <option key={x.id} value={x.id}>{(x.title || "Untitled experiment").slice(0, 80)}</option>)}
          </select>
        </Field>
        <p className="muted small">{mapSummary(data)}. Once saved, edits and pipetting progress are saved as you go, so you can carry on from another device.</p>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Saved plate maps: open, duplicate, move to Trash. */
function SavedMaps() {
  const { data: maps, error } = useLoad(() => list<PlateRow>("bench_items", { eq: { kind: "plate", archived_at: null }, order: [["pinned", false], ["updated_at", false]] }), []);
  const { data: protocolList = [] } = useLoad(protocols, []);
  const { data: experimentList = [] } = useLoad(experiments, []);
  const [actionError, setActionError] = useState("");
  async function run(job: () => Promise<unknown>) {
    setActionError("");
    try { await job(); } catch (err) { setActionError((err as Error).message); }
  }
  const duplicate = (m: PlateRow) => run(() => insert("bench_items", {
    kind: KIND, title: `${m.title} (copy)`.slice(0, 200), data: { plates: parsePlateMap(m.data).plates.map(({ progress: _p, ...rest }) => rest) },
    notes: m.notes ?? "", tags: m.tags ?? [], project_id: m.project_id, library_entry_id: m.library_entry_id, experiment_id: m.experiment_id,
  }));
  async function del(m: PlateRow) {
    if (await ask(`Move “${m.title}” to Trash? You can restore it from Trash.`, "Move to Trash")) await run(() => trash("bench_items", m.id));
  }
  return (
    <div className="card pad pm-saved">
      <div className="section-head"><h3>Saved plate maps</h3></div>
      <ErrorText error={error || actionError} />
      {maps && maps.length === 0 && <p className="muted small">No saved plate maps yet. Label a plate above and choose “Save” to keep it and to resume pipetting on another device.</p>}
      <ul className="pm-saved-list">
        {(maps ?? []).map((m) => {
          const protocol = protocolList.find((x) => x.id === m.library_entry_id);
          const experiment = experimentList.find((x) => x.id === m.experiment_id);
          return (
            <li key={m.id}>
              <div className="pm-saved-text">
                <a href={href(itemPath(m.id))}><strong>{m.title || "Untitled plate map"}</strong></a>
                <span className="muted small">{mapSummary(parsePlateMap(m.data))} · {fmtDateTime(m.updated_at)}</span>
                {protocol && <a className="small" href={href(`protocols/${protocol.id}`)}><ClipboardList size={12} aria-hidden /> {protocol.title}</a>}
                {experiment && <a className="small" href={href(`experiments/${experiment.id}`)}><FlaskConical size={12} aria-hidden /> {experiment.title}</a>}
              </div>
              <div className="pm-saved-actions">
                <a className="pm-open" href={href(itemPath(m.id))}>Open</a>
                <button type="button" className="icon" aria-label={`Duplicate ${m.title}`} onClick={() => void duplicate(m)}><CopyPlus size={17} /></button>
                <button type="button" className="icon danger" aria-label={`Move ${m.title} to Trash`} onClick={() => void del(m)}><Trash2 size={17} /></button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
