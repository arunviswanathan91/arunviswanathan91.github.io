import { useState, type FormEvent } from "react";
import { insert, insertMany } from "../../lib/db.ts";
import { fromLocalInput, toLocalInput } from "../../lib/dates.ts";
import { go } from "../../lib/route.ts";
import { MEETING_TYPE, type Meeting, type MeetingType } from "../../lib/types.ts";
import { ProjectSelect } from "../../components/pickers.tsx";
import { ErrorText, Field } from "../../components/ui.tsx";

function nextHour(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

/** Quick create: title, type, date & time. Everything else is edited on the meeting page. */
export function MeetingForm({ presetProjectId, onDone }: { presetProjectId?: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MeetingType>("supervisor");
  const [starts, setStarts] = useState(nextHour());
  const [projectId, setProjectId] = useState<string | null>(presetProjectId ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const m = await insert<Meeting>("meetings", { title: title.trim(), type, starts_at: fromLocalInput(starts) });
      if (projectId) await insertMany("meeting_projects", [{ meeting_id: m.id, project_id: projectId }]);
      onDone();
      go(`meetings/${m.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Title">
        <input required autoFocus value={title} placeholder="e.g. Supervisor meeting with Janne" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as MeetingType)}>
            {Object.entries(MEETING_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Date & time">
          <input required type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
      </div>
      <Field label="Project (optional, more can be added later)">
        <ProjectSelect value={projectId} onChange={setProjectId} />
      </Field>
      <ErrorText error={error} />
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? "Creating…" : "Create meeting"}</button>
      </div>
    </form>
  );
}

