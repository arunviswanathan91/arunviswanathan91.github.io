import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Check, Copy, Download, ExternalLink, FlaskConical, Pencil, Pin, Printer, Trash2 } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { useData } from "../../../lib/store";
import { getOne, list, remove, trash, update, useLoad } from "../../lib/db.ts";
import { fmtDate, fmtDateTime } from "../../lib/dates.ts";
import { downloadBlob } from "../../lib/download.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import type { Experiment, LibraryEntry, LibraryKind, LibraryVersion, Paper } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { MarkdownEditor, MarkdownView } from "../../components/Markdown.tsx";
import { ProjectSelect, projectName, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { Badge, Empty, ErrorText, Loading, SaveIndicator } from "../../components/ui.tsx";
import { dateSpan } from "../experiments/ExperimentRows.tsx";
import { techniqueOptions } from "../experiments/logic.ts";
import { saveVersion, type VersionContent } from "./create.ts";
import { LIBRARY, fileNameFor, isBlankVersion, isUnwritten, languageOptions, nextVersion } from "./logic.ts";

/** One protocol or one piece of code. `kind` is the section it was opened from; the page follows the entry's own kind. */
export function LibraryPage({ kind, id }: { kind: LibraryKind; id: string }) {
  const { data: entry, error, loading, fresh } = useLoad(() => getOne<LibraryEntry>("library_entries", id), [id]);
  if (error) return <ErrorText error={error} />;
  // Wait for the record itself, not the remembered copy of it: the editor keeps what it starts with.
  if (!fresh) return <Loading rows={8} />;
  if ((loading && !entry) || (entry && entry.id !== id)) return <Loading rows={8} />;
  if (!entry) return <Empty>This entry doesn’t exist (it may have been deleted). <a href={href(LIBRARY[kind].section)}>Back to {LIBRARY[kind].plural.toLowerCase()}</a></Empty>;
  // Remount per entry; after this the editor owns the state (remote reloads must not clobber typing).
  return <EntryEditor key={id} initial={entry} />;
}

const EMPTY: VersionContent = { body: "", materials: "", notes: "" };
const PLACEHOLDER: Record<LibraryKind, VersionContent> = {
  protocol: {
    body: "1. Lyse cells in RIPA with inhibitors, 20 min on ice…",
    materials: "Antibodies with clone, supplier and dilution; buffers; kits and lot numbers…",
    notes: "What goes wrong and how to fix it, timings that matter, safe stopping points…",
  },
  code: { body: "", materials: "brms 2.21\nR ≥ 4.3", notes: "Where the input comes from, how to call it, what comes out…" },
};

function EntryEditor({ initial }: { initial: LibraryEntry }) {
  const [e, setE] = useState(initial);
  const kind = e.kind;
  const L = LIBRARY[kind];
  const { projects } = useProjects();
  const publications = useData().tables.publications.rows;
  // Protocols name the paper they came from; code names its manuscript instead.
  const { data: papers = [] } = useLoad(() => (kind === "protocol" ? list<Paper>("papers", { order: [["title"]] }) : Promise.resolve([])), [kind]);
  // Other entries of this kind: technique or language suggestions.
  const { data: others = [] } = useLoad(() => list<LibraryEntry>("library_entries", { eq: { kind } }), [kind]);
  // Every version, newest first, and the experiments that followed one of them.
  const { data: history, error, fresh } = useLoad(async () => {
    const versions = await list<LibraryVersion>("library_versions", { eq: { entry_id: e.id }, order: [["version", false]] });
    const used = await list<Experiment>("experiments", { in: ["protocol_version_id", versions.map((v) => v.id)], order: [["updated_at", false]] });
    return { versions, used };
  }, [e.id]);
  const autosave = useAutosave<LibraryEntry>(async (patch) => {
    const row = await update<LibraryEntry>("library_entries", e.id, patch, true);
    setE((x) => ({ ...x, updated_at: row.updated_at }));
  });

  const [viewId, setViewId] = useState<string | null>(null);
  const [draft, setDraft] = useState<(VersionContent & { change_note: string }) | null>(null);
  const [base, setBase] = useState<VersionContent>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  const versions = history?.versions ?? [];
  const used = history?.used ?? [];
  const current = versions.find((v) => v.id === e.current_version_id) ?? null;
  const shown = versions.find((v) => v.id === viewId) ?? current ?? versions[0] ?? null;
  const unwritten = isUnwritten(versions);
  const dirty = !!draft && (draft.body !== base.body || draft.materials !== base.materials || draft.notes !== base.notes || !!draft.change_note.trim());

  function change(patch: Partial<LibraryEntry>) {
    setE((x) => ({ ...x, ...patch }));
    autosave.change(patch);
  }
  function startEdit() {
    const from: VersionContent = current ?? shown ?? EMPTY;
    setBase({ body: from.body, materials: from.materials, notes: from.notes });
    setDraft({ body: from.body, materials: from.materials, notes: from.notes, change_note: "" });
    setProblem("");
  }
  // An entry just created has nothing to read yet: open it ready to write.
  const opened = useRef(false);
  useEffect(() => {
    if (!fresh || !history || opened.current) return;
    opened.current = true;
    if (isUnwritten(history.versions)) startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, history]);
  // A draft is not saved until "Save": warn before the tab closes with one open.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function cancelEdit() {
    if (dirty && !(await ask("Discard this draft? What you typed will be lost.", "Discard"))) return;
    setDraft(null);
    setProblem("");
  }
  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!draft || saving) return;
    if (isBlankVersion(draft)) { setProblem("Write something first."); return; }
    if (!unwritten && !draft.change_note.trim()) { setProblem("Say in one line what changed."); return; }
    setSaving(true);
    setProblem("");
    try {
      const v = await saveVersion(e.id, versions, { body: draft.body, materials: draft.materials, notes: draft.notes }, unwritten ? "" : draft.change_note);
      setE((x) => ({ ...x, current_version_id: v.id }));
      setDraft(null);
      setViewId(null);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function makeCurrent(v: LibraryVersion) {
    setProblem("");
    try {
      await update<LibraryEntry>("library_entries", e.id, { current_version_id: v.id });
      setE((x) => ({ ...x, current_version_id: v.id }));
      setViewId(null);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }
  async function delVersion(v: LibraryVersion) {
    if (!(await ask(`Delete v${v.version} of “${e.title}”? This cannot be undone.`, "Delete"))) return;
    setProblem("");
    try {
      await remove("library_versions", { id: v.id });
      if (viewId === v.id) setViewId(null);
    } catch (err) {
      setProblem((err as Error).message);
    }
  }
  async function del() {
    if (dirty && !(await ask("Discard the draft you are writing?", "Discard"))) return;
    if (!(await ask(`Move “${e.title}” to Trash? Its versions go with it. You can restore it from Trash.`))) return;
    await autosave.flush();
    await trash("library_entries", e.id);
    go(L.section);
  }

  const blur = () => void autosave.flush();
  const pub = publications.find((p) => p.id === e.publication_id);
  const paper = papers.find((p) => p.id === e.paper_id);
  const sourceUrl = /^https?:\/\//i.test(e.source_url ?? "") ? (e.source_url as string) : "";
  const suggestions = kind === "protocol" ? techniqueOptions(others.map((o) => o.technique)) : languageOptions(others.map((o) => o.language));
  const isCurrent = (v: LibraryVersion) => v.id === e.current_version_id;
  const deletable = (v: LibraryVersion) => !isCurrent(v) && !used.some((x) => x.protocol_version_id === v.id);

  return (
    <section className="detail library-entry">
      <a className="back" href={href(L.section)}><ArrowLeft size={14} /> {L.plural}</a>
      <header className="detail-head note-head">
        <input className="title-input" aria-label="Title" value={e.title} placeholder={L.untitled} onChange={(ev) => change({ title: ev.target.value })} onBlur={blur} />
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          <button className={`icon ${e.pinned ? "on" : ""}`} aria-pressed={e.pinned} aria-label={e.pinned ? "Unpin" : "Pin"} onClick={() => change({ pinned: !e.pinned })}><Pin size={16} /></button>
          <button className="icon" aria-label={e.archived_at ? "Unarchive" : "Archive"} onClick={() => change({ archived_at: e.archived_at ? null : new Date().toISOString() })}>
            {e.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button className="icon danger" aria-label={`Delete ${kind === "protocol" ? "protocol" : "snippet"}`} onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>
      {e.archived_at && <p className="notice">This entry is archived. It’s hidden from lists and search until you unarchive it.</p>}

      <div className="note-props">
        <label className="field">
          <span>{L.fieldLabel}</span>
          <input list="library-kinds" value={e[L.field]} placeholder={kind === "protocol" ? "e.g. Western blot" : "e.g. R"} onChange={(ev) => change({ [L.field]: ev.target.value })} onBlur={blur} />
          <datalist id="library-kinds">{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="field">
          <span>Project</span>
          <ProjectSelect value={e.project_id} onChange={(project_id) => change({ project_id })} />
        </label>
        {kind === "protocol" ? (
          <label className="field">
            <span>Source paper</span>
            <select value={e.paper_id ?? ""} onChange={(ev) => change({ paper_id: ev.target.value || null })}>
              <option value="">No paper</option>
              {papers.map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 80)}{p.year ? ` (${p.year})` : ""}</option>)}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Manuscript</span>
            <select value={e.publication_id ?? ""} onChange={(ev) => change({ publication_id: ev.target.value || null })}>
              <option value="">No manuscript</option>
              {publications.map((p) => <option key={p.id} value={p.id}>{String(p.title ?? "Untitled").slice(0, 80)}</option>)}
            </select>
          </label>
        )}
        <div className="field grow">
          <span>Source URL</span>
          <span className="row">
            <input aria-label="Source URL" type="url" inputMode="url" value={e.source_url ?? ""} placeholder={kind === "protocol" ? "https://www.protocols.io/…" : "https://github.com/…"} onChange={(ev) => change({ source_url: ev.target.value.trim() || null })} onBlur={blur} />
            {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" title="Open the source in a new tab"><ExternalLink size={14} /> Open</a>}
          </span>
        </div>
        <label className="field grow">
          <span>Purpose</span>
          <input value={e.purpose} placeholder={kind === "protocol" ? "What it is for, in one line" : "What it does, in one line"} onChange={(ev) => change({ purpose: ev.target.value })} onBlur={blur} />
        </label>
        <div className="field grow">
          <span>Tags</span>
          <TagInput value={e.tags} onChange={(tags) => change({ tags })} />
        </div>
      </div>
      <div className="link-row small">
        {e.project_id && <a href={href(`projects/${e.project_id}`)}>→ {projectName(projects, e.project_id)}</a>}
        {paper && <a href={href(`papers/${paper.id}`)}>→ From: {paper.title}</a>}
        {pub && <a href={`#/publication/${pub.id}`}>→ {String(pub.title ?? "Manuscript")}</a>}
      </div>

      <ErrorText error={error || (draft ? "" : problem)} />
      <div className="library-grid">
        {draft ? (
          <form className="card pad library-edit" onSubmit={(ev) => void save(ev)}>
            <div className="section-head">
              <h3>{unwritten ? "Version 1" : `New version (v${nextVersion(versions)})`}</h3>
              {!unwritten && current && <span className="muted small">Starts from v{current.version}, which stays in the history unchanged.</span>}
            </div>
            {kind === "protocol" ? (
              <MarkdownEditor startInEdit label={L.body} value={draft.body} rows={14} placeholder={PLACEHOLDER.protocol.body} onChange={(body) => setDraft((d) => d && { ...d, body })} />
            ) : (
              <label className="field">
                <span>{L.body}</span>
                <textarea
                  className="code-input"
                  aria-label={L.body}
                  rows={18}
                  wrap="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  value={draft.body}
                  onChange={(ev) => setDraft((d) => d && { ...d, body: ev.target.value })}
                  onKeyDown={(ev) => insertTab(ev, draft.body, (body) => setDraft((d) => d && { ...d, body }))}
                />
              </label>
            )}
            {kind === "protocol" ? (
              <MarkdownEditor startInEdit label={L.materials} value={draft.materials} rows={5} placeholder={PLACEHOLDER.protocol.materials} onChange={(materials) => setDraft((d) => d && { ...d, materials })} />
            ) : (
              <label className="field">
                <span>{L.materials} <span className="muted">(packages and versions)</span></span>
                <textarea className="code-input" rows={4} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={draft.materials} placeholder={PLACEHOLDER.code.materials} onChange={(ev) => setDraft((d) => d && { ...d, materials: ev.target.value })} />
              </label>
            )}
            <MarkdownEditor startInEdit label={L.notes} value={draft.notes} rows={5} placeholder={PLACEHOLDER[kind].notes} onChange={(notes) => setDraft((d) => d && { ...d, notes })} />
            {!unwritten && (
              <label className="field">
                <span>What changed</span>
                <input required maxLength={200} value={draft.change_note} placeholder={kind === "protocol" ? "e.g. Block in BSA instead of milk for phospho antibodies" : "e.g. Fixed the random-effects term"} onChange={(ev) => setDraft((d) => d && { ...d, change_note: ev.target.value })} />
              </label>
            )}
            <ErrorText error={problem} />
            <div className="row wrap">
              <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : unwritten ? "Save" : `Save as v${nextVersion(versions)}`}</button>
              <button type="button" disabled={saving} onClick={() => void cancelEdit()}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="card pad library-version">
            <div className="section-head">
              <h3>{shown ? `Version ${shown.version}` : "No version yet"}</h3>
              <span className="row wrap">
                {shown && !isCurrent(shown) && current && <button type="button" onClick={() => setViewId(null)}>Back to v{current.version}</button>}
                {shown && !isCurrent(shown) && <button type="button" onClick={() => void makeCurrent(shown)}>Make current</button>}
                {kind === "protocol" && shown && !isBlankVersion(shown) && (
                  <button type="button" title="A print-ready copy of this version for the bench" onClick={() => void autosave.flush().then(() => go("print/protocol", { id: shown.id }))}><Printer size={14} /> Bench copy</button>
                )}
                <button type="button" className="primary" disabled={!history} onClick={startEdit}><Pencil size={14} /> {unwritten ? "Write" : "Edit / new version"}</button>
              </span>
            </div>
            {shown && (
              <p className="muted small version-line">
                {isCurrent(shown) ? <Badge tone="pos">Current</Badge> : <Badge tone="warn">Not current</Badge>} Saved {fmtDate(shown.created_at)}{shown.change_note ? ` · ${shown.change_note}` : ""}
              </p>
            )}
            {!history ? <Loading rows={5} card={false} /> : shown && !isBlankVersion(shown) ? <VersionBody entry={e} version={shown} /> : <p className="muted">Nothing written yet.</p>}
          </div>
        )}

        <div className="card pad">
          <div className="section-head"><h3>Version history</h3></div>
          {versions.length === 0 ? (
            <p className="muted small">No versions yet.</p>
          ) : (
            <ul className="version-list">
              {versions.map((v) => {
                const runs = used.filter((x) => x.protocol_version_id === v.id);
                return (
                  <li key={v.id} className={v.id === shown?.id ? "on" : undefined}>
                    <div className="version-row">
                      <button type="button" className="version-pick" aria-current={v.id === shown?.id || undefined} disabled={!!draft} title={draft ? "Save or cancel the draft to read another version" : "Show this version"} onClick={() => setViewId(isCurrent(v) ? null : v.id)}>
                        <strong>v{v.version}</strong>
                        <span className="muted small">{fmtDate(v.created_at)}</span>
                        <span className="version-note">{v.change_note || (v.version === 1 ? "First version" : "")}</span>
                      </button>
                      {isCurrent(v) ? <Badge tone="pos">Current</Badge> : <button type="button" className="small" onClick={() => void makeCurrent(v)}>Make current</button>}
                      {deletable(v) && <button type="button" className="icon danger" aria-label={`Delete v${v.version}`} onClick={() => void delVersion(v)}><Trash2 size={14} /></button>}
                    </div>
                    {runs.length > 0 && (
                      <div className="version-used small">
                        <span className="muted">Used in</span>
                        {runs.map((x) => <a key={x.id} href={href(`experiments/${x.id}`)}><FlaskConical size={12} /> {x.title || "Untitled experiment"}{dateSpan(x) ? ` (${dateSpan(x)})` : ""}</a>)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="card pad">
          <Attachments owner={{ library_entry_id: e.id }} />
        </div>
      </div>
      <p className="small muted">Last saved {fmtDateTime(e.updated_at)}</p>
    </section>
  );
}

/** Tab types a tab instead of leaving the box. */
function insertTab(ev: KeyboardEvent<HTMLTextAreaElement>, value: string, onChange: (v: string) => void) {
  if (ev.key !== "Tab" || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  ev.preventDefault();
  const t = ev.currentTarget;
  const { selectionStart: s, selectionEnd: end } = t;
  onChange(value.slice(0, s) + "\t" + value.slice(end));
  requestAnimationFrame(() => t.setSelectionRange(s + 1, s + 1));
}

/** One version, read-only. Protocol: steps, reagents, notes. Code: the code, what it needs, how to run it. */
function VersionBody({ entry, version }: { entry: LibraryEntry; version: LibraryVersion }) {
  const L = LIBRARY[entry.kind];
  const code = entry.kind === "code";
  return (
    <div className="library-body">
      {code ? <CodeBlock entry={entry} code={version.body} /> : <MarkdownView text={version.body} />}
      {version.materials.trim() && (
        <section>
          <h4>{L.materials}</h4>
          {code ? <p className="library-plain">{version.materials}</p> : <MarkdownView text={version.materials} />}
        </section>
      )}
      {version.notes.trim() && (
        <section>
          <h4>{L.notes}</h4>
          <MarkdownView text={version.notes} />
        </section>
      )}
    </div>
  );
}

/** Code exactly as saved: whitespace kept, long lines scroll inside the block. */
function CodeBlock({ entry, code }: { entry: LibraryEntry; code: string }) {
  const [copied, setCopied] = useState<"" | "yes" | "failed">("");
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(""), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  if (!code) return null;
  const name = fileNameFor(entry);
  return (
    <div className="code-block">
      <div className="code-actions">
        <span className="muted small">{name}</span>
        <button type="button" className="small" onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied("yes"), () => setCopied("failed"))}>
          {copied === "yes" ? <Check size={14} /> : <Copy size={14} />} <span role="status">{copied === "yes" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy"}</span>
        </button>
        <button type="button" className="small" onClick={() => downloadBlob(new Blob([code], { type: "text/plain;charset=utf-8" }), name)}><Download size={14} /> Download</button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  );
}
