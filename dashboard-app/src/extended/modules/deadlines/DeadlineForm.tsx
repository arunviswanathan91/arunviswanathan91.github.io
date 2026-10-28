import { useState, type FormEvent } from "react";
import { insert, update } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { DEADLINE_CATEGORY, DEADLINE_STATUS, PRIORITY, type Deadline, type DeadlineCategory, type DeadlineStatus, type Link, type Priority } from "../../lib/types.ts";
import { LinksEditor } from "../../components/LinksEditor.tsx";
import { ProjectSelect } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { ErrorText, Field } from "../../components/ui.tsx";
import { DateInput } from "../../../components/ui/DateInput";

export function DeadlineForm({ deadline, presetProjectId, presetDate, onDone }: { deadline?: Deadline; presetProjectId?: string; presetDate?: string; onDone: () => void }) {
  const [title, setTitle] = useState(deadline?.title ?? "");
  const [description, setDescription] = useState(deadline?.description ?? "");
  const [category, setCategory] = useState<DeadlineCategory>(deadline?.category ?? "conference");
  const [due, setDue] = useState(deadline?.due_date ?? presetDate ?? "");
  const [time, setTime] = useState(deadline?.due_time?.slice(0, 5) ?? "");
  const [status, setStatus] = useState<DeadlineStatus>(deadline?.status ?? "upcoming");
  const [priority, setPriority] = useState<Priority>(deadline?.priority ?? "medium");
  const [projectId, setProjectId] = useState<string | null>(deadline?.project_id ?? presetProjectId ?? null);
  const [links, setLinks] = useState<Link[]>(deadline?.links ?? []);
  const [tags, setTags] = useState<string[]>(deadline?.tags ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      due_date: due,
      due_time: time || null,
      status,
      priority,
      project_id: projectId,
      links,
      tags,
      completed_at: status === "done" ? (deadline?.completed_at ?? new Date().toISOString()) : null,
    };
    try {
      if (deadline) {
        await update("deadlines", deadline.id, values);
        onDone();
      } else {
        const row = await insert<Deadline>("deadlines", values);
        onDone();
        go(`deadlines/${row.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Title">
        <input required autoFocus value={title} placeholder="e.g. ISMB 2027 abstract" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as DeadlineCategory)}>
            {Object.entries(DEADLINE_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Due date">
          <DateInput required type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Time (optional)">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as DeadlineStatus)}>
            {Object.entries(DEADLINE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Project">
          <ProjectSelect value={projectId} onChange={setProjectId} />
        </Field>
      </div>
      <Field label="Description">
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Links">
        <LinksEditor value={links} onChange={setLinks} />
      </Field>
      <Field label="Tags">
        <TagInput value={tags} onChange={setTags} />
      </Field>
      <ErrorText error={error} />
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : deadline ? "Save" : "Add deadline"}</button>
      </div>
    </form>
  );
}

