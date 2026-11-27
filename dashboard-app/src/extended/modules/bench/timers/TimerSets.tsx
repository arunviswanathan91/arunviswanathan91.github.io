import { useState, type FormEvent } from "react";
import { ClipboardList, Copy, ListOrdered, Pencil, Play, Trash2 } from "lucide-react";
import { ask, askText } from "../../../../lib/dialogs.tsx";
import { insert, list, trash, update, useLoad } from "../../../lib/db.ts";
import { href } from "../../../lib/route.ts";
import type { LibraryEntry } from "../../../lib/types.ts";
import { Modal } from "../../../components/Modal.tsx";
import { ErrorText, Field } from "../../../components/ui.tsx";
import { describeSeconds, parseSetData, toSetData, type Timer, type TimerSetData } from "./logic.ts";
import { loadSet } from "./store.ts";

/** A saved bench item, as far as the timers need it. */
export interface BenchItemRow {
  id: string;
  kind: string;
  title: string;
  data: unknown;
  library_entry_id: string | null;
  experiment_id: string | null;
  archived_at: string | null;
  updated_at: string;
}

const protocols = () => list<LibraryEntry>("library_entries", { eq: { kind: "protocol" }, order: [["title"]] });

export function setSummary(data: TimerSetData): string {
  const n = data.timers.length;
  const total = data.timers.reduce((sum, t) => sum + t.seconds, 0);
  return `${n} timer${n === 1 ? "" : "s"} · ${data.sequential ? `${describeSeconds(total)} in order` : data.timers.map((t) => describeSeconds(t.seconds)).slice(0, 4).join(", ") + (n > 4 ? "…" : "")}`;
}

/** Saved sets: load, start, rename, duplicate, move to Trash. */
export function TimerSets({ hasTimers }: { hasTimers: boolean }) {
  const { data: sets, error } = useLoad(() => list<BenchItemRow>("bench_items", { eq: { kind: "timer_set", archived_at: null }, order: [["pinned", false], ["updated_at", false]] }), []);
  const { data: entries = [] } = useLoad(protocols, []);
  // The set waiting for "replace or add" (asked only when there are timers on screen).
  const [pending, setPending] = useState<{ set: BenchItemRow; start: boolean } | null>(null);
  const [actionError, setActionError] = useState("");

  function use(set: BenchItemRow, start: boolean) {
    if (hasTimers) setPending({ set, start });
    else loadSet(set.title, parseSetData(set.data), { replace: false, start });
  }
  function choose(replace: boolean) {
    if (pending) loadSet(pending.set.title, parseSetData(pending.set.data), { replace, start: pending.start });
    setPending(null);
  }
  async function run(job: () => Promise<unknown>) {
    setActionError("");
    try { await job(); } catch (e) { setActionError((e as Error).message); }
  }
  async function rename(set: BenchItemRow) {
    const title = (await askText("Name of this set", set.title))?.trim();
    if (title && title !== set.title) await run(() => update("bench_items", set.id, { title }));
  }
  const duplicate = (set: BenchItemRow) => run(() => insert("bench_items", { kind: "timer_set", title: `${set.title} (copy)`.slice(0, 200), data: set.data, library_entry_id: set.library_entry_id, experiment_id: set.experiment_id }));
  async function del(set: BenchItemRow) {
    if (await ask(`Move “${set.title}” to Trash? You can restore it from Trash.`, "Move to Trash")) await run(() => trash("bench_items", set.id));
  }

  return (
    <div className="card pad bt-sets">
      <div className="section-head"><h3>Saved sets</h3></div>
      <ErrorText error={error || actionError} />
      {sets && sets.length === 0 && <p className="muted small">No saved sets yet. Add the timers of a protocol above (block, washes, incubations) and choose “Save as set” to reuse them.</p>}
      <ul className="bt-set-list">
        {(sets ?? []).map((set) => {
          const data = parseSetData(set.data);
          const protocol = entries.find((x) => x.id === set.library_entry_id);
          return (
            <li key={set.id}>
              <div className="bt-set-text">
                <strong>{set.title}</strong>
                <span className="muted small">{data.sequential && <ListOrdered size={13} aria-hidden />} {setSummary(data)}</span>
                {protocol && <a className="small" href={href(`protocols/${protocol.id}`)}><ClipboardList size={12} aria-hidden /> {protocol.title}</a>}
              </div>
              <div className="bt-set-actions">
                <button type="button" className="bt-btn bt-primary" disabled={!data.timers.length} onClick={() => use(set, true)}><Play size={16} aria-hidden /> Start</button>
                <button type="button" className="bt-btn" disabled={!data.timers.length} onClick={() => use(set, false)}>Load</button>
                <button type="button" className="bt-icon" aria-label={`Rename ${set.title}`} onClick={() => void rename(set)}><Pencil size={17} /></button>
                <button type="button" className="bt-icon" aria-label={`Duplicate ${set.title}`} onClick={() => void duplicate(set)}><Copy size={17} /></button>
                <button type="button" className="bt-icon bt-danger" aria-label={`Move ${set.title} to Trash`} onClick={() => void del(set)}><Trash2 size={17} /></button>
              </div>
            </li>
          );
        })}
      </ul>
      {pending && (
        <Modal title={`${pending.start ? "Start" : "Load"} “${pending.set.title}”`} onClose={() => setPending(null)}>
          <p>There are timers on the page already. Replace them with this set, or add the set below them?</p>
          <div className="bt-choice">
            <button type="button" className="bt-btn bt-primary" onClick={() => choose(false)}>Add below</button>
            <button type="button" className="bt-btn" onClick={() => choose(true)}>Replace current timers</button>
            <button type="button" className="bt-btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** "Save as set": keep the timers on screen as a reusable set, optionally under a protocol. */
export function SaveSetForm({ timers, protocolId, onClose, onSaved }: { timers: Timer[]; protocolId: string | null; onClose: () => void; onSaved: () => void }) {
  const { data: entries = [] } = useLoad(protocols, []);
  const [title, setTitle] = useState(timers.find((t) => t.setTitle)?.setTitle ?? "");
  const [protocol, setProtocol] = useState(protocolId ?? "");
  const [sequential, setSequential] = useState(timers.some((t) => t.seq));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = entries.filter((x) => !x.archived_at || x.id === protocol);
  const fallback = entries.find((x) => x.id === protocol)?.title ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await insert("bench_items", { kind: "timer_set", title: (title.trim() || fallback || "Timer set").slice(0, 200), data: toSetData(timers, sequential), library_entry_id: protocol || null });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Save as set" onClose={onClose}>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <Field label="Name">
          <input value={title} maxLength={200} placeholder={fallback || "e.g. Western blot: block and washes"} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Protocol (optional)">
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            <option value="">No protocol</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.title.slice(0, 80)}</option>)}
          </select>
        </Field>
        <label className="bt-setting bt-toggle">
          <input type="checkbox" className="check" checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
          <div><strong>Run one after another</strong><p>Each timer starts by itself when the one before it ends, with its own alert.</p></div>
        </label>
        <p className="muted small">{timers.length} timer{timers.length === 1 ? "" : "s"}: {timers.map((t) => `${t.name} (${describeSeconds(t.seconds)})`).join(", ")}</p>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || !timers.length}>{busy ? "Saving…" : "Save set"}</button>
        </div>
      </form>
    </Modal>
  );
}
