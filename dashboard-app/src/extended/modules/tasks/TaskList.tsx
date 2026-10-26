import { SECTIONS } from "../../lib/sections.ts";
import { useState } from "react";
import { CalendarClock, Flag, Repeat, Users } from "lucide-react";
import { update } from "../../lib/db.ts";
import { fmtDate, relDay, today } from "../../lib/dates.ts";
import { PRIORITY, type Project, type Task } from "../../lib/types.ts";
import { href } from "../../lib/route.ts";
import { Modal } from "../../components/Modal.tsx";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty, priorityTone } from "../../components/ui.tsx";
import { describeRecurrence, isOpen } from "./logic.ts";
import { TaskForm } from "./TaskForm.tsx";

export function TaskList({ tasks, projects, showProject = true, empty = "No tasks." }: { tasks: Task[]; projects: Project[]; showProject?: boolean; empty?: string }) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const now = today();

  async function toggle(t: Task) {
    try {
      await update("tasks", t.id, { status: isOpen(t) ? "done" : "todo" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!tasks.length) return <Empty icon={SECTIONS.tasks.icon}>{empty}</Empty>;
  return (
    <>
      {error && <p className="error">{error}</p>}
      <ul className="task-list">
        {tasks.map((t) => {
          const open = isOpen(t);
          const project = showProject && t.project_id ? projects.find((p) => p.id === t.project_id) : undefined;
          const overdue = open && t.due_date && t.due_date < now;
          return (
            <li key={t.id} className={`task ${open ? "" : "closed"}`}>
              <input type="checkbox" className="check" checked={!open} aria-label={open ? `Complete ${t.title}` : `Reopen ${t.title}`} onChange={() => void toggle(t)} />
              <button type="button" className="task-main" onClick={() => setEditing(t)}>
                <span className="task-title">{t.title}</span>
                <span className="task-meta">
                  {t.due_date && (
                    <span className={overdue ? "neg" : t.due_date === now ? "accent" : ""}>
                      <CalendarClock size={12} /> {fmtDate(t.due_date, { day: "numeric", month: "short" })}{open ? ` · ${relDay(t.due_date, now)}` : ""}
                    </span>
                  )}
                  {t.priority !== "medium" && <Badge tone={priorityTone(t.priority)}><Flag size={11} /> {PRIORITY[t.priority]}</Badge>}
                  {t.recurrence && <span title={describeRecurrence(t.recurrence)}><Repeat size={12} /> {describeRecurrence(t.recurrence)}</span>}
                  {t.meeting_id && <span><Users size={12} /> from meeting</span>}
                  {t.status === "in_progress" && <Badge tone="accent">In progress</Badge>}
                  {t.status === "cancelled" && <Badge tone="quiet">Cancelled</Badge>}
                  <TagList tags={t.tags} />
                </span>
              </button>
              {project && <a className="task-project" href={href(`projects/${project.id}`)}>{project.title}</a>}
            </li>
          );
        })}
      </ul>
      {editing && (
        <Modal title="Edit task" onClose={() => setEditing(null)}>
          <TaskForm task={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}

