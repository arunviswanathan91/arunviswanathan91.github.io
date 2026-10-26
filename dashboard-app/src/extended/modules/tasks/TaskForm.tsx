import { useState, type FormEvent } from "react";
import { insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { PRIORITY, TASK_STATUS, WEEKDAYS, type Deadline, type Priority, type Recurrence, type Task, type TaskStatus } from "../../lib/types.ts";
import { ProjectSelect } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { confirmDanger, ErrorText, Field } from "../../components/ui.tsx";
import { href } from "../../lib/route.ts";

export interface TaskPreset {
  project_id?: string | null;
  deadline_id?: string | null;
  due_date?: string | null;
}

/** Create a task, or edit one when `task` is given. */
export function TaskForm({ task, preset, onDone }: { task?: Task; preset?: TaskPreset; onDone: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [due, setDue] = useState(task?.due_date ?? preset?.due_date ?? "");
  const [projectId, setProjectId] = useState<string | null>(task?.project_id ?? preset?.project_id ?? null);
  const [deadlineId, setDeadlineId] = useState<string | null>(task?.deadline_id ?? preset?.deadline_id ?? null);
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(task?.recurrence ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: deadlines = [] } = useLoad(() => list<Deadline>("deadlines", { order: [["due_date"]] }), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      due_date: due || null,
      project_id: projectId,
      deadline_id: deadlineId,
      tags,
      recurrence,
    };
    try {
      if (task) await update("tasks", task.id, values);
      else await insert("tasks", values);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function del() {
    if (!task || !confirmDanger(`Delete the task “${task.title}”?`)) return;
    await remove("tasks", { id: task.id });
    onDone();
  }

  const openDeadlines = deadlines.filter((d) => d.status === "upcoming" || d.status === "in_progress" || d.id === deadlineId);

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Title">
        <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Due date">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Project">
          <ProjectSelect value={projectId} onChange={setProjectId} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {Object.entries(TASK_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Preparation for deadline">
        <select value={deadlineId ?? ""} onChange={(e) => setDeadlineId(e.target.value || null)}>
          <option value="">None</option>
          {openDeadlines.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.due_date})</option>)}
        </select>
      </Field>
      <Field label="Tags">
        <TagInput value={tags} onChange={setTags} />
      </Field>
      <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
      {task?.meeting_id && <p className="small muted">Created from a <a href={href(`meetings/${task.meeting_id}`)}>meeting action item</a>.</p>}
      <ErrorText error={error} />
      <div className="form-actions">
        {task && <button type="button" className="danger-btn" onClick={() => void del()}>Delete</button>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : task ? "Save" : "Add task"}</button>
      </div>
    </form>
  );
}

export function RecurrenceEditor({ value, onChange }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void }) {
  const freq = value?.freq ?? "";
  const set = (patch: Partial<Recurrence>) => onChange({ freq: "weekly", ...value, ...patch } as Recurrence);
  return (
    <fieldset className="recurrence">
      <legend>Repeat</legend>
      <div className="row wrap">
        <select aria-label="Repeat" value={freq} onChange={(e) => onChange(e.target.value ? { ...value, freq: e.target.value as Recurrence["freq"] } : null)}>
          <option value="">Doesn’t repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        {value && (
          <>
            <label className="inline">
              every
              <input type="number" min={1} max={52} aria-label="Interval" value={value.interval ?? 1} onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
              {{ daily: "day(s)", weekly: "week(s)", monthly: "month(s)", yearly: "year(s)" }[value.freq]}
            </label>
            <label className="inline">
              until
              <input type="date" aria-label="Repeat until" value={value.until ?? ""} onChange={(e) => set({ until: e.target.value || undefined })} />
            </label>
          </>
        )}
      </div>
      {value?.freq === "weekly" && (
        <div className="weekday-picker" role="group" aria-label="Weekdays">
          {WEEKDAYS.map((d, i) => {
            const n = i + 1;
            const on = value.weekdays?.includes(n) ?? false;
            return (
              <button key={d} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => set({ weekdays: on ? value.weekdays!.filter((x) => x !== n) : [...(value.weekdays ?? []), n].sort() })}>
                {d}
              </button>
            );
          })}
        </div>
      )}
      {value && <p className="small muted">When you complete it, the next one is created automatically. The completed one stays in history.</p>}
    </fieldset>
  );
}

