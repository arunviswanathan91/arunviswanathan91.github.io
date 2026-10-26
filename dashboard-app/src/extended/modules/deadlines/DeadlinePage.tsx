import { useState } from "react";
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { getOne, list, remove, update, useLoad } from "../../lib/db.ts";
import { fmtDate, relDay } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { DEADLINE_CATEGORY, DEADLINE_STATUS, PRIORITY, type Deadline, type Task } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { LinksView } from "../../components/LinksEditor.tsx";
import { MarkdownEditor, MarkdownView } from "../../components/Markdown.tsx";
import { Modal } from "../../components/Modal.tsx";
import { projectName, useProjects } from "../../components/pickers.tsx";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, confirmDanger, Empty, ErrorText, SaveIndicator } from "../../components/ui.tsx";
import { sortTasks } from "../tasks/logic.ts";
import { TaskForm } from "../tasks/TaskForm.tsx";
import { TaskList } from "../tasks/TaskList.tsx";
import { DeadlineForm } from "./DeadlineForm.tsx";
import { deadlineTone, isOpenDeadline } from "./DeadlineRows.tsx";

export function DeadlinePage({ id }: { id: string }) {
  const { data, error } = useLoad(async () => {
    const [deadline, tasks] = await Promise.all([getOne<Deadline>("deadlines", id), list<Task>("tasks", { eq: { deadline_id: id } })]);
    return { deadline, tasks };
  }, [id]);
  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  if (!data.deadline) return <Empty>This deadline doesn’t exist (it may have been deleted). <a href={href("deadlines")}>Back</a></Empty>;
  return <DeadlineDetail key={id} d={data.deadline} tasks={data.tasks} />;
}

function DeadlineDetail({ d, tasks }: { d: Deadline; tasks: Task[] }) {
  const { projects } = useProjects();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState(d.notes);
  const autosave = useAutosave<Deadline>((patch) => update("deadlines", d.id, patch, true).then(() => undefined));
  const open = isOpenDeadline(d);

  async function del() {
    if (!confirmDanger(`Delete “${d.title}”? Preparation tasks are kept. This cannot be undone.`)) return;
    await remove("deadlines", { id: d.id });
    go("deadlines");
  }

  return (
    <section className="detail">
      <a className="back" href={href("deadlines")}><ArrowLeft size={14} /> Deadlines</a>
      <header className="detail-head">
        <div>
          <h1>{d.title}</h1>
          <p className="deadline-headline">
            <Badge tone={deadlineTone(d)}>{DEADLINE_STATUS[d.status]}</Badge>
            <strong>{fmtDate(d.due_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{d.due_time ? `, ${d.due_time.slice(0, 5)}` : ""}</strong>
            {open && <span className="muted">({relDay(d.due_date)})</span>}
          </p>
          <p className="muted small">
            {DEADLINE_CATEGORY[d.category]} · {PRIORITY[d.priority]} priority
            {d.project_id && <> · <a href={href(`projects/${d.project_id}`)}>{projectName(projects, d.project_id)}</a></>}
          </p>
          <TagList tags={d.tags} />
        </div>
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          {open && <button className="primary" onClick={() => void update("deadlines", d.id, { status: "done", completed_at: new Date().toISOString() })}><Check size={15} /> Mark done</button>}
          {!open && <button onClick={() => void update("deadlines", d.id, { status: "upcoming", completed_at: null })}>Reopen</button>}
          <button onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
          <button className="icon danger" aria-label="Delete deadline" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          {d.description && <div className="card pad"><MarkdownView text={d.description} /></div>}
          <div className="card pad">
            <div className="section-head">
              <h2 className="section-title">Preparation tasks</h2>
              <button onClick={() => setAdding(true)}><Plus size={14} /> Task</button>
            </div>
            <TaskList tasks={sortTasks(tasks, "all")} projects={projects} empty="No preparation tasks yet." />
          </div>
          <div className="card pad">
            <MarkdownEditor label="Notes" value={notes} rows={8} onChange={(v) => { setNotes(v); autosave.change({ notes: v }); }} onBlur={() => void autosave.flush()} />
          </div>
        </div>
        <aside className="detail-side">
          {d.links.length > 0 && <div className="card pad"><h3>Links</h3><LinksView links={d.links} /></div>}
          <div className="card pad"><Attachments owner={{ deadline_id: d.id }} /></div>
        </aside>
      </div>

      {editing && (
        <Modal title="Edit deadline" onClose={() => setEditing(false)}>
          <DeadlineForm deadline={d} onDone={() => setEditing(false)} />
        </Modal>
      )}
      {adding && (
        <Modal title="New preparation task" onClose={() => setAdding(false)}>
          <TaskForm preset={{ deadline_id: d.id, project_id: d.project_id }} onDone={() => setAdding(false)} />
        </Modal>
      )}
    </section>
  );
}

