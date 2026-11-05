import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, ClipboardPaste, Pin, Plus, Repeat2, Trash2, X } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { useData } from "../../../lib/store";
import { DateInput } from "../../../components/ui/DateInput";
import { getOne, list, trash, update, useLoad } from "../../lib/db.ts";
import { fmtDateTime } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { EXPERIMENT_OUTCOME, EXPERIMENT_STATUS, type Experiment, type ExperimentOutcome, type ExperimentSample, type ExperimentStatus } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { MarkdownEditor } from "../../components/Markdown.tsx";
import { ProjectSelect, projectName, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { Empty, ErrorText, Loading, SaveIndicator } from "../../components/ui.tsx";
import { createExperiment } from "./create.ts";
import { dateSpan } from "./ExperimentRows.tsx";
import { parseSamples, repeatOf, samplesSummary, techniqueOptions } from "./logic.ts";

export function ExperimentPage({ id }: { id: string }) {
  const { data: experiment, error, loading } = useLoad(() => getOne<Experiment>("experiments", id), [id]);
  if (error) return <ErrorText error={error} />;
  // Moving straight from one record to another, the previous one is still on hand while the
  // next loads: never build the editor from it, or its text could be saved into the new record.
  if ((loading && !experiment) || (experiment && experiment.id !== id)) return <Loading rows={8} />;
  if (!experiment) return <Empty>This experiment doesn’t exist (it may have been deleted). <a href={href("experiments")}>Back to experiments</a></Empty>;
  // Remount per experiment; after this the editor owns the state (remote reloads must not clobber typing).
  return <ExperimentEditor key={id} initial={experiment} />;
}

const today = () => new Date().toISOString().slice(0, 10);

function ExperimentEditor({ initial }: { initial: Experiment }) {
  const [e, setE] = useState(initial);
  const { projects } = useProjects();
  const publications = useData().tables.publications.rows;
  // Other runs: technique suggestions, the run this one repeats, and the runs that repeat it.
  const { data: others = [] } = useLoad(() => list<Experiment>("experiments", { order: [["updated_at", false]] }), []);
  const parent = e.repeat_of ? others.find((o) => o.id === e.repeat_of) : undefined;
  const repeats = others.filter((o) => o.repeat_of === e.id);
  const autosave = useAutosave<Experiment>(async (patch) => {
    const row = await update<Experiment>("experiments", e.id, patch, true);
    setE((x) => ({ ...x, updated_at: row.updated_at }));
  });

  function change(patch: Partial<Experiment>) {
    setE((x) => ({ ...x, ...patch }));
    autosave.change(patch);
  }
  // Moving the status fills the obvious dates, without overwriting ones already set.
  function setStatus(status: ExperimentStatus) {
    const patch: Partial<Experiment> = { status };
    if ((status === "running" || status === "analysing" || status === "done") && !e.started_on) patch.started_on = today();
    if (status === "done" && !e.ended_on) patch.ended_on = today();
    change(patch);
  }

  async function del() {
    if (!(await ask(`Move “${e.title}” to Trash? You can restore it from Trash.`))) return;
    await autosave.flush();
    await trash("experiments", e.id);
    go("experiments");
  }
  async function repeat() {
    await autosave.flush();
    await createExperiment(repeatOf(e));
  }

  const blur = () => void autosave.flush();
  const pub = publications.find((p) => p.id === e.publication_id);

  return (
    <section className="detail experiment">
      <a className="back" href={href("experiments")}><ArrowLeft size={14} /> Experiments</a>
      <header className="detail-head note-head">
        <input className="title-input" aria-label="Title" value={e.title} placeholder="Untitled experiment" onChange={(ev) => change({ title: ev.target.value })} onBlur={blur} />
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          <button onClick={() => void repeat()} title="Start a new planned run with the same protocol and samples"><Repeat2 size={15} /> Repeat</button>
          <button className={`icon ${e.pinned ? "on" : ""}`} aria-pressed={e.pinned} aria-label={e.pinned ? "Unpin" : "Pin"} onClick={() => change({ pinned: !e.pinned })}><Pin size={16} /></button>
          <button className="icon" aria-label={e.archived_at ? "Unarchive" : "Archive"} onClick={() => change({ archived_at: e.archived_at ? null : new Date().toISOString() })}>
            {e.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button className="icon danger" aria-label="Delete experiment" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>
      {e.archived_at && <p className="notice">This experiment is archived. It’s hidden from lists and search until you unarchive it.</p>}

      <div className="note-props">
        <label className="field">
          <span>Status</span>
          <select value={e.status} onChange={(ev) => setStatus(ev.target.value as ExperimentStatus)}>
            {Object.entries(EXPERIMENT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Outcome</span>
          <select value={e.outcome ?? ""} onChange={(ev) => change({ outcome: (ev.target.value || null) as ExperimentOutcome | null })}>
            <option value="">Not yet</option>
            {Object.entries(EXPERIMENT_OUTCOME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Technique</span>
          <input list="experiment-techniques" value={e.technique} placeholder="e.g. Flow cytometry" onChange={(ev) => change({ technique: ev.target.value })} onBlur={blur} />
          <datalist id="experiment-techniques">{techniqueOptions(others.map((o) => o.technique)).map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="field">
          <span>Started</span>
          <DateInput type="date" value={e.started_on ?? ""} onChange={(ev) => change({ started_on: ev.target.value || null })} />
        </label>
        <label className="field">
          <span>Finished</span>
          <DateInput type="date" value={e.ended_on ?? ""} min={e.started_on ?? undefined} onChange={(ev) => change({ ended_on: ev.target.value || null })} />
        </label>
        <label className="field">
          <span>Project</span>
          <ProjectSelect value={e.project_id} onChange={(project_id) => change({ project_id })} />
        </label>
        <label className="field">
          <span>Feeds manuscript</span>
          <select value={e.publication_id ?? ""} onChange={(ev) => change({ publication_id: ev.target.value || null })}>
            <option value="">No manuscript</option>
            {publications.map((p) => <option key={p.id} value={p.id}>{String(p.title ?? "Untitled").slice(0, 80)}</option>)}
          </select>
        </label>
        <div className="field grow">
          <span>Tags</span>
          <TagInput value={e.tags} onChange={(tags) => change({ tags })} />
        </div>
      </div>
      <div className="link-row small">
        {e.project_id && <a href={href(`projects/${e.project_id}`)}>→ {projectName(projects, e.project_id)}</a>}
        {pub && <a href={`#/publication/${pub.id}`}>→ {String(pub.title ?? "Manuscript")}</a>}
        {parent && <a href={href(`experiments/${parent.id}`)}><Repeat2 size={12} /> Repeat of {parent.title}{dateSpan(parent) ? ` (${dateSpan(parent)})` : ""}</a>}
        {repeats.map((r) => <a key={r.id} href={href(`experiments/${r.id}`)}><Repeat2 size={12} /> Repeated: {r.title}{dateSpan(r) ? ` (${dateSpan(r)})` : ""}</a>)}
      </div>

      <div className="experiment-grid">
        <div className="card pad">
          <MarkdownEditor editIfEmpty label="Aim / hypothesis" value={e.aim} rows={3} placeholder="What question does this answer? What do you expect?" onChange={(aim) => change({ aim })} onBlur={blur} />
        </div>
        <div className="card pad">
          <MarkdownEditor editIfEmpty label="Protocol" value={e.protocol} rows={10} placeholder="Steps, reagents and lot numbers, antibody panel and dilutions, instrument settings…" onChange={(protocol) => change({ protocol })} onBlur={blur} />
        </div>
        <div className="card pad">
          <SamplesEditor samples={e.samples} onChange={(samples) => change({ samples })} onBlur={blur} />
        </div>
        <div className="card pad">
          <MarkdownEditor editIfEmpty label="Results" value={e.results} rows={8} placeholder="What you observed: numbers, gating, plots (attach files below)…" onChange={(results) => change({ results })} onBlur={blur} />
        </div>
        <div className="card pad">
          <MarkdownEditor editIfEmpty label="Conclusion" value={e.conclusion} rows={3} placeholder="What it means, and how sure you are." onChange={(conclusion) => change({ conclusion })} onBlur={blur} />
        </div>
        <div className="card pad">
          <MarkdownEditor editIfEmpty label="Next steps" value={e.next_steps} rows={3} placeholder="Repeat with n = 6, try a different clone, send to Hari…" onChange={(next_steps) => change({ next_steps })} onBlur={blur} />
        </div>
        <div className="card pad">
          <Attachments owner={{ experiment_id: e.id }} title="Data & images" />
        </div>
      </div>
      <p className="small muted">Last saved {fmtDateTime(e.updated_at)}</p>
    </section>
  );
}

/** Samples, mice, wells or conditions: one row each, editable, or pasted from a spreadsheet. */
function SamplesEditor({ samples, onChange, onBlur }: { samples: ExperimentSample[]; onChange: (s: ExperimentSample[]) => void; onBlur: () => void }) {
  const set = (i: number, patch: Partial<ExperimentSample>) => onChange(samples.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const preview = parseSamples(pasted);
  function addPasted() {
    if (preview.length) { onChange([...samples, ...preview]); onBlur(); }
    setPasted(""); setPasting(false);
  }
  return (
    <section className="samples">
      <div className="section-head">
        <h3>Samples {samples.length > 0 && <span className="muted small">{samplesSummary(samples)}</span>}</h3>
        <span className="row">
          <button type="button" aria-expanded={pasting} onClick={() => setPasting((v) => !v)}><ClipboardPaste size={14} /> Paste rows</button>
          <button type="button" onClick={() => onChange([...samples, { label: `S${samples.length + 1}`, group: samples.at(-1)?.group ?? "", notes: "" }])}><Plus size={14} /> Sample</button>
        </span>
      </div>
      {pasting && (
        <div className="samples-paste">
          <textarea
            autoFocus
            rows={5}
            aria-label="Rows to paste"
            placeholder={"Copy cells from Excel or Google Sheets and paste here, one sample per row:\nM1\tHFD\ttumour 0.4 g\nM2\tChow"}
            value={pasted}
            onChange={(ev) => setPasted(ev.target.value)}
          />
          <div className="row">
            <button type="button" className="primary" disabled={!preview.length} onClick={addPasted}>Add {preview.length || ""} sample{preview.length === 1 ? "" : "s"}</button>
            <button type="button" onClick={() => { setPasted(""); setPasting(false); }}>Cancel</button>
            <span className="muted small">Columns: sample, group, notes.</span>
          </div>
        </div>
      )}
      {samples.length === 0 ? (
        <p className="muted small">No samples yet. Add mice, wells, patients or conditions, or paste them from a spreadsheet.</p>
      ) : (
        <div className="table-scroll">
          <table className="samples-table">
            <thead><tr><th>Sample</th><th>Group</th><th>Notes</th><th aria-label="Remove" /></tr></thead>
            <tbody>
              {samples.map((s, i) => (
                <tr key={i}>
                  <td><input aria-label={`Sample ${i + 1} label`} value={s.label} onChange={(ev) => set(i, { label: ev.target.value })} onBlur={onBlur} /></td>
                  <td><input aria-label={`Sample ${i + 1} group`} value={s.group} placeholder="e.g. HFD" onChange={(ev) => set(i, { group: ev.target.value })} onBlur={onBlur} /></td>
                  <td><input aria-label={`Sample ${i + 1} notes`} value={s.notes} onChange={(ev) => set(i, { notes: ev.target.value })} onBlur={onBlur} /></td>
                  <td><button type="button" className="icon" aria-label={`Remove sample ${s.label || i + 1}`} onClick={() => { onChange(samples.filter((_, j) => j !== i)); onBlur(); }}><X size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
