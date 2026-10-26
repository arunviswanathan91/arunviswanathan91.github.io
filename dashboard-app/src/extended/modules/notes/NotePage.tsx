import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Download, Pin, Trash2 } from "lucide-react";
import { getOne, list, remove, update, useLoad } from "../../lib/db.ts";
import { fmtDateTime } from "../../lib/dates.ts";
import { downloadNotes } from "../../lib/download.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { NOTE_TYPE, type Note, type NoteType, type Paper } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { MarkdownEditor } from "../../components/Markdown.tsx";
import { ProjectSelect, projectName, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { confirmDanger, Empty, ErrorText, SaveIndicator } from "../../components/ui.tsx";

export function NotePage({ id }: { id: string }) {
  const { data: note, error, loading } = useLoad(() => getOne<Note>("notes", id), [id]);
  if (error) return <ErrorText error={error} />;
  if (loading && !note) return null;
  if (!note) return <Empty>This note doesn’t exist (it may have been deleted). <a href={href("notes")}>Back to notes</a></Empty>;
  return <NoteEditor key={id} initial={note} />;
}

function NoteEditor({ initial }: { initial: Note }) {
  const [note, setNote] = useState(initial);
  const { projects } = useProjects();
  const { data: papers = [] } = useLoad(() => list<Paper>("papers", { order: [["title"]] }), []);
  const autosave = useAutosave<Note>(async (patch) => {
    const row = await update<Note>("notes", note.id, patch, true);
    setNote((n) => ({ ...n, updated_at: row.updated_at }));
  });

  function change(patch: Partial<Note>) {
    setNote((n) => ({ ...n, ...patch }));
    autosave.change(patch);
  }

  async function del() {
    if (!confirmDanger(`Delete “${note.title}”? This cannot be undone. Consider archiving instead.`)) return;
    await remove("notes", { id: note.id });
    go("notes");
  }

  async function exportMd() {
    await autosave.flush();
    downloadNotes([note], { project: (pid) => projectName(projects, pid), paper: (pid) => papers.find((p) => p.id === pid)?.title ?? "" });
  }

  return (
    <section className="detail">
      <a className="back" href={href("notes")}><ArrowLeft size={14} /> Notes</a>
      <header className="detail-head note-head">
        <input
          className="title-input"
          aria-label="Title"
          value={note.title}
          placeholder="Untitled"
          onChange={(e) => change({ title: e.target.value })}
          onBlur={() => void autosave.flush()}
        />
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          <button className={`icon ${note.pinned ? "on" : ""}`} aria-pressed={note.pinned} aria-label={note.pinned ? "Unpin" : "Pin"} onClick={() => change({ pinned: !note.pinned })}><Pin size={16} /></button>
          <button className="icon" aria-label="Download as markdown" onClick={() => void exportMd()}><Download size={16} /></button>
          <button className="icon" aria-label={note.archived_at ? "Unarchive" : "Archive"} onClick={() => change({ archived_at: note.archived_at ? null : new Date().toISOString() })}>
            {note.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button className="icon danger" aria-label="Delete note" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>
      {note.archived_at && <p className="notice">This note is archived. It’s hidden from lists and search until you unarchive it.</p>}

      <div className="note-props">
        <label className="field">
          <span>Type</span>
          <select value={note.type} onChange={(e) => change({ type: e.target.value as NoteType })}>
            {Object.entries(NOTE_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Project</span>
          <ProjectSelect value={note.project_id} onChange={(project_id) => change({ project_id })} />
        </label>
        <label className="field">
          <span>Paper</span>
          <select value={note.paper_id ?? ""} onChange={(e) => change({ paper_id: e.target.value || null })}>
            <option value="">No paper</option>
            {papers.map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 80)}</option>)}
          </select>
        </label>
        <div className="field grow">
          <span>Tags</span>
          <TagInput value={note.tags} onChange={(tags) => change({ tags })} />
        </div>
      </div>
      <div className="link-row small">
        {note.project_id && <a href={href(`projects/${note.project_id}`)}>→ {projectName(projects, note.project_id)}</a>}
        {note.paper_id && <a href={href(`papers/${note.paper_id}`)}>→ {papers.find((p) => p.id === note.paper_id)?.title ?? "Paper"}</a>}
      </div>

      <MarkdownEditor value={note.body} rows={22} onChange={(body) => change({ body })} onBlur={() => void autosave.flush()} />
      <p className="small muted">Last saved {fmtDateTime(note.updated_at)}</p>

      <div className="card pad">
        <Attachments owner={{ note_id: note.id }} />
      </div>
    </section>
  );
}

