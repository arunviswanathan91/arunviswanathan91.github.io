// Pieces the bench tools share: the number-with-unit field, the results panel, and the frame
// around a tool that saves it and, once saved, shows its title, notes and links.
import { useEffect, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Check, Copy, CopyPlus, Pin, Save, Trash2 } from "lucide-react";
import { ask, askText } from "../../../lib/dialogs.tsx";
import { insert, list, trash, update, useLoad } from "../../lib/db.ts";
import { fmtDateTime } from "../../lib/dates.ts";
import { go, href, type Route } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import type { BenchItem, Experiment, LibraryEntry } from "../../lib/types.ts";
import { ProjectSelect, projectName, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { ErrorText, PageHeader, SaveIndicator } from "../../components/ui.tsx";
import { bestUnit, convert, dimensionOf, fmt, num, unitLabel, unitsOf, type Outcome, type Qty } from "./calc.ts";
import { TOOLS, type QText, type ToolId } from "./model.ts";

/** What every tool page is given: the saved item it was opened from (none for a fresh tool) and the route. */
export interface ToolProps { item?: BenchItem; route: Route }

/** Typed text that is not blank and not a number: the field is marked, and nothing is calculated from it. */
const invalid = (text: string) => text.trim() !== "" && num(text) === null;

/** A number paired with its unit. */
export function Quantity({ label, value, onChange, units, placeholder, names }: {
  label: string;
  value: QText;
  onChange: (v: QText) => void;
  units: string[];
  placeholder?: string;
  /** Other wording for a unit in the menu, e.g. "% (w/v)". */
  names?: Record<string, string>;
}) {
  const options = units.includes(value.unit) ? units : [value.unit, ...units];
  return (
    <div className="field bench-qty">
      <span>{label}</span>
      <span className="bench-qty-row">
        <input inputMode="decimal" autoComplete="off" aria-label={label} aria-invalid={invalid(value.value) || undefined} value={value.value} placeholder={placeholder} onChange={(e) => onChange({ ...value, value: e.target.value })} />
        {options.length > 1 ? (
          <select aria-label={`${label}: unit`} value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value })}>
            {options.map((u) => <option key={u} value={u}>{names?.[u] ?? unitLabel(u)}</option>)}
          </select>
        ) : (
          <span className="bench-unit-fixed">{names?.[value.unit] ?? unitLabel(value.unit)}</span>
        )}
      </span>
    </div>
  );
}

/** A plain number: a count, a factor, a molecular weight. */
export function NumField({ label, value, onChange, placeholder, whole, suffix }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; whole?: boolean; suffix?: string }) {
  return (
    <div className="field bench-qty">
      <span>{label}</span>
      <span className="bench-qty-row">
        <input inputMode={whole ? "numeric" : "decimal"} autoComplete="off" aria-label={label} aria-invalid={invalid(value) || undefined} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="bench-unit-fixed">{suffix}</span>}
      </span>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** A computed quantity, in the best unit unless another is picked from its menu. */
export function Result({ label, q, strong }: { label: string; q: Qty | null | undefined; strong?: boolean }) {
  const [unit, setUnit] = useState("");
  if (!q) return null;
  const dim = dimensionOf(q.unit);
  const best = bestUnit(q.value, q.unit);
  const picked = unit ? convert(q.value, q.unit, unit) : null;
  const shown = unit && picked !== null ? { value: picked, unit } : best;
  const options = dim ? unitsOf(dim) : [];
  const menu = [...new Set([best.unit, ...options])];
  return (
    <div className={`bench-result ${strong ? "strong" : ""}`}>
      <span className="bench-result-label">{label}</span>
      <span className="bench-result-value">
        <strong className="num">{fmt(shown.value)}</strong>
        {menu.length > 1 ? (
          <select className="bench-unit" aria-label={`${label}: unit`} value={unit && picked !== null ? unit : ""} onChange={(e) => setUnit(e.target.value)}>
            <option value="">{unitLabel(best.unit)}</option>
            {menu.filter((u) => u !== best.unit).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
          </select>
        ) : (
          <span>{unitLabel(shown.unit)}</span>
        )}
      </span>
    </div>
  );
}

/** A computed number with no unit to choose: a count, a percentage, a ratio. */
export function Stat({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`bench-result ${strong ? "strong" : ""}`}>
      <span className="bench-result-label">{label}</span>
      <span className="bench-result-value"><strong className="num">{value}</strong></span>
    </div>
  );
}

/** Why there is no result: a quiet prompt while something is blank, an error when it cannot be done. */
export function Reason({ outcome }: { outcome: Pick<Outcome<unknown>, "reason" | "incomplete"> }) {
  if (!outcome.reason) return null;
  return outcome.incomplete ? <p className="muted bench-hint">{outcome.reason}</p> : <p className="error" role="alert">{outcome.reason}</p>;
}

/** The plain-language line: what to do at the bench. */
export function Instruction({ children }: { children: ReactNode }) {
  return <p className="bench-say" role="status">{children}</p>;
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`card pad bench-panel ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function CopyButton({ text, label = "Copy as text" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState<"" | "yes" | "failed">("");
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(""), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button type="button" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied("yes"), () => setCopied("failed"))}>
      {copied === "yes" ? <Check size={14} /> : <Copy size={14} />} <span role="status">{copied === "yes" ? "Copied" : copied === "failed" ? "Could not copy" : label}</span>
    </button>
  );
}

// ── The frame around a tool ──────────────────────────────────────────────────

/**
 * Wraps a tool. Fresh: a header and "Save", which asks for a title and stores the inputs.
 * Saved: title, pin, archive, Trash and Duplicate, "Save changes" for the inputs, and the
 * item's notes, tags and links below the tool.
 */
export function ToolFrame({ tool, item, data, suggestedTitle, children }: { tool: ToolId; item?: BenchItem; data: object; suggestedTitle?: string; children: ReactNode }) {
  return item
    ? <SavedFrame tool={tool} item={item} data={data}>{children}</SavedFrame>
    : <FreshFrame tool={tool} data={data} suggestedTitle={suggestedTitle}>{children}</FreshFrame>;
}

function FreshFrame({ tool, data, suggestedTitle, children }: { tool: ToolId; data: object; suggestedTitle?: string; children: ReactNode }) {
  const T = TOOLS[tool];
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  async function save() {
    if (!T.kind || saving) return;
    const typed = await askText(`Save this ${T.label.toLowerCase()} as`, suggestedTitle?.trim() ?? "");
    if (typed === null) return;
    setSaving(true);
    setProblem("");
    try {
      const row = await insert<BenchItem>("bench_items", { kind: T.kind, title: typed.trim() || `Untitled ${T.label.toLowerCase()}`, data });
      go(`bench/item/${row.id}`);
    } catch (e) {
      setProblem((e as Error).message);
      setSaving(false);
    }
  }
  return (
    <section className="bench-tool">
      <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
      <PageHeader
        section="bench"
        title={T.label}
        subtitle={T.blurb}
        actions={T.kind && <button className="primary" disabled={saving} onClick={() => void save()}><Save size={16} /> {saving ? "Saving…" : "Save"}</button>}
      />
      <ErrorText error={problem} />
      {children}
    </section>
  );
}

function SavedFrame({ tool, item, data, children }: { tool: ToolId; item: BenchItem; data: object; children: ReactNode }) {
  const T = TOOLS[tool];
  const [e, setE] = useState(item);
  const { projects } = useProjects();
  const { data: protocols = [] } = useLoad(() => list<LibraryEntry>("library_entries", { eq: { kind: "protocol" }, order: [["title"]] }), []);
  const { data: experiments = [] } = useLoad(() => list<Experiment>("experiments", { order: [["updated_at", false]] }), []);
  const autosave = useAutosave<BenchItem>(async (patch) => {
    const row = await update<BenchItem>("bench_items", e.id, patch, true);
    setE((x) => ({ ...x, updated_at: row.updated_at }));
  });
  // The inputs are saved on request, not as you type: trying other numbers must not overwrite what was saved.
  const now = JSON.stringify(data);
  const [savedData, setSavedData] = useState(now);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const dirty = now !== savedData;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function change(patch: Partial<BenchItem>) {
    setE((x) => ({ ...x, ...patch }));
    autosave.change(patch);
  }
  const blur = () => void autosave.flush();
  async function saveData() {
    if (saving) return;
    setSaving(true);
    setProblem("");
    try {
      const row = await update<BenchItem>("bench_items", e.id, { data }, true);
      setE((x) => ({ ...x, updated_at: row.updated_at }));
      setSavedData(now);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function duplicate() {
    setProblem("");
    try {
      await autosave.flush();
      const copy = await insert<BenchItem>("bench_items", {
        kind: e.kind, title: `${e.title || T.label} (copy)`, data, notes: e.notes ?? "", tags: e.tags ?? [],
        project_id: e.project_id, library_entry_id: e.library_entry_id, experiment_id: e.experiment_id,
      });
      go(`bench/item/${copy.id}`);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }
  async function del() {
    if (!(await ask(`Move “${e.title}” to Trash? You can restore it from Trash.`))) return;
    try {
      await autosave.flush();
      await trash("bench_items", e.id);
      go("bench");
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  const protocol = protocols.find((p) => p.id === e.library_entry_id);
  const experiment = experiments.find((x) => x.id === e.experiment_id);
  return (
    <section className="detail bench-tool">
      <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
      <header className="detail-head note-head">
        <div>
          <span className="kicker">{T.label}</span>
          <input className="title-input" aria-label="Title" value={e.title} placeholder={`Untitled ${T.label.toLowerCase()}`} onChange={(ev) => change({ title: ev.target.value })} onBlur={blur} />
        </div>
        <div className="page-actions">
          <SaveIndicator status={dirty && autosave.status === "saved" ? "unsaved" : autosave.status} error={autosave.error} />
          <button className="primary" disabled={!dirty || saving} onClick={() => void saveData()}><Save size={16} /> {saving ? "Saving…" : "Save changes"}</button>
          <button onClick={() => void duplicate()}><CopyPlus size={14} /> Duplicate</button>
          <button className={`icon ${e.pinned ? "on" : ""}`} aria-pressed={e.pinned} aria-label={e.pinned ? "Unpin" : "Pin"} onClick={() => change({ pinned: !e.pinned })}><Pin size={16} /></button>
          <button className="icon" aria-label={e.archived_at ? "Unarchive" : "Archive"} onClick={() => change({ archived_at: e.archived_at ? null : new Date().toISOString() })}>
            {e.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button className="icon danger" aria-label="Move to Trash" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>
      {e.archived_at && <p className="notice">This item is archived. It’s hidden from the Bench list until you unarchive it.</p>}
      <ErrorText error={problem} />

      {children}

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
              {protocols.filter((p) => !p.archived_at || p.id === e.library_entry_id).map((p) => <option key={p.id} value={p.id}>{(p.title || "Untitled protocol").slice(0, 80)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Experiment</span>
            <select value={e.experiment_id ?? ""} onChange={(ev) => change({ experiment_id: ev.target.value || null })}>
              <option value="">No experiment</option>
              {experiments.filter((x) => !x.archived_at || x.id === e.experiment_id).map((x) => <option key={x.id} value={x.id}>{(x.title || "Untitled experiment").slice(0, 80)}</option>)}
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
          <textarea rows={4} value={e.notes ?? ""} placeholder="Lot numbers, what it was for, what to change next time…" onChange={(ev) => change({ notes: ev.target.value })} onBlur={blur} />
        </label>
      </div>
      <p className="small muted">Last saved {fmtDateTime(e.updated_at)}</p>
    </section>
  );
}
