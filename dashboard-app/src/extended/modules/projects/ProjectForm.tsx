import { useState, type FormEvent } from "react";
import { insert, update } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { PROJECT_AREA, PROJECT_STATUS, type Link, type Project, type ProjectArea, type ProjectStatus } from "../../lib/types.ts";
import { LinksEditor } from "../../components/LinksEditor.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { ErrorText, Field } from "../../components/ui.tsx";
import { today } from "../../lib/dates.ts";
import { DateInput } from "../../../components/ui/DateInput";

export function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [area, setArea] = useState<ProjectArea>(project?.area ?? "research");
  const [start, setStart] = useState(project?.start_date ?? "");
  const [target, setTarget] = useState(project?.target_date ?? "");
  const [completed, setCompleted] = useState(project?.completed_on ?? "");
  const [tags, setTags] = useState<string[]>(project?.tags ?? []);
  const [links, setLinks] = useState<Link[]>(project?.links ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      area,
      start_date: start || null,
      target_date: target || null,
      completed_on: completed || (status === "completed" ? today() : null),
      tags,
      links,
    };
    try {
      if (project) {
        await update("projects", project.id, values);
        onDone();
      } else {
        const row = await insert<Project>("projects", values);
        onDone();
        go(`projects/${row.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Title">
        <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description (markdown)">
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {Object.entries(PROJECT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Area">
          <select value={area} onChange={(e) => setArea(e.target.value as ProjectArea)}>
            {Object.entries(PROJECT_AREA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Start date">
          <DateInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Target date">
          <DateInput type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        {(status === "completed" || completed) && (
          <Field label="Completed on">
            <DateInput type="date" value={completed} onChange={(e) => setCompleted(e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="Tags">
        <TagInput value={tags} onChange={setTags} />
      </Field>
      <Field label="Links">
        <LinksEditor value={links} onChange={setLinks} />
      </Field>
      <ErrorText error={error} />
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : project ? "Save" : "Create project"}</button>
      </div>
    </form>
  );
}

