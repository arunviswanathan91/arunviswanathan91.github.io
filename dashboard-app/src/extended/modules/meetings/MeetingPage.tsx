import { useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare, FileDown, Plus, Trash2, UserPlus } from "lucide-react";
import { emitChange, getOne, insert, list, remove, rpc, update, useLoad } from "../../lib/db.ts";
import { fromLocalInput, toLocalInput } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { MEETING_TYPE, type ActionItem, type ContactRow, type Meeting, type MeetingParticipant, type MeetingProject, type MeetingType, type Task } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { MarkdownEditor } from "../../components/Markdown.tsx";
import { MultiPicker, useContacts, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { confirmDanger, Empty, ErrorText, SaveIndicator } from "../../components/ui.tsx";

const SECTIONS: [keyof Meeting, string, string][] = [
  ["agenda", "Agenda", "Topics to cover…"],
  ["discussion", "Discussion notes", "What was discussed. Use headings if helpful."],
  ["decisions", "Decisions", "What was agreed"],
  ["next_steps", "Next steps", "What happens next, next meeting, etc."],
];

export function MeetingPage({ id }: { id: string }) {
  const { data: meeting, error, loading } = useLoad(() => getOne<Meeting>("meetings", id), [id]);
  if (error) return <ErrorText error={error} />;
  if (loading && !meeting) return null;
  if (!meeting) return <Empty>This meeting doesn’t exist (it may have been deleted). <a href={href("meetings")}>Back to meetings</a></Empty>;
  return <MeetingEditor key={id} initial={meeting} />;
}

function MeetingEditor({ initial }: { initial: Meeting }) {
  const [m, setM] = useState(initial);
  const [error, setError] = useState("");
  const { projects } = useProjects();
  const contacts = useContacts();
  const { data: links } = useLoad(async () => {
    const [proj, people] = await Promise.all([
      list<MeetingProject>("meeting_projects", { eq: { meeting_id: m.id } }),
      list<MeetingParticipant>("meeting_participants", { eq: { meeting_id: m.id } }),
    ]);
    return { proj, people };
  }, [m.id]);
  const autosave = useAutosave<Meeting>((patch) => update("meetings", m.id, patch, true).then(() => undefined));

  function change(patch: Partial<Meeting>) {
    setM((x) => ({ ...x, ...patch }));
    autosave.change(patch);
  }

  const run = (p: Promise<unknown>) => p.catch((e: Error) => setError(e.message));

  async function addPerson() {
    const name = window.prompt("Name of the new person");
    if (!name?.trim()) return;
    const c = await insert<ContactRow>("contacts", { name: name.trim() });
    await insert("meeting_participants", { meeting_id: m.id, contact_id: c.id });
  }

  async function del() {
    if (!confirmDanger(`Delete “${m.title}” with its notes and action items? Tasks created from it are kept. This cannot be undone.`)) return;
    await remove("meetings", { id: m.id });
    go("meetings");
  }

  async function exportPdf() {
    await autosave.flush();
    go("print/meetings", { ids: m.id });
  }

  return (
    <section className="detail">
      <a className="back" href={href("meetings")}><ArrowLeft size={14} /> Meetings</a>
      <header className="detail-head">
        <input className="title-input" aria-label="Title" value={m.title} onChange={(e) => change({ title: e.target.value })} onBlur={() => void autosave.flush()} />
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          <button onClick={() => void exportPdf()}><FileDown size={15} /> PDF</button>
          <button className="icon" aria-label={m.archived_at ? "Unarchive" : "Archive"} onClick={() => change({ archived_at: m.archived_at ? null : new Date().toISOString() })}>
            {m.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button className="icon danger" aria-label="Delete meeting" onClick={() => void run(del())}><Trash2 size={16} /></button>
        </div>
      </header>
      <ErrorText error={error} />
      {m.archived_at && <p className="notice">This meeting is archived and hidden from meeting lists.</p>}

      <div className="detail-grid">
        <div className="detail-main">
          {SECTIONS.map(([k, label, hint]) => (
            <div className="card pad" key={k}>
              <MarkdownEditor label={label} value={m[k] as string} placeholder={hint} rows={k === "discussion" ? 12 : 5} onChange={(v) => change({ [k]: v } as Partial<Meeting>)} onBlur={() => void autosave.flush()} />
            </div>
          ))}
          <div className="card pad">
            <ActionItems meeting={m} projectIds={links?.proj.map((l) => l.project_id) ?? []} />
          </div>
        </div>

        <aside className="detail-side">
          <div className="card pad side-fields">
            <label className="field">
              <span>Type</span>
              <select value={m.type} onChange={(e) => change({ type: e.target.value as MeetingType })}>
                {Object.entries(MEETING_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Starts</span>
              <input type="datetime-local" required value={toLocalInput(m.starts_at)} onChange={(e) => e.target.value && change({ starts_at: fromLocalInput(e.target.value)! })} />
            </label>
            <label className="field">
              <span>Ends (optional)</span>
              <input type="datetime-local" value={toLocalInput(m.ends_at)} min={toLocalInput(m.starts_at)} onChange={(e) => change({ ends_at: fromLocalInput(e.target.value) })} />
            </label>
            <label className="field">
              <span>Location / link</span>
              <input value={m.location ?? ""} placeholder="Room, Zoom link…" onChange={(e) => change({ location: e.target.value || null })} />
            </label>
            <div className="field">
              <span>Projects</span>
              <MultiPicker
                selected={links?.proj.map((l) => l.project_id) ?? []}
                options={projects.map((p) => ({ id: p.id, label: p.title }))}
                onAdd={(project_id) => void run(insert("meeting_projects", { meeting_id: m.id, project_id }))}
                onRemove={(project_id) => void run(remove("meeting_projects", { meeting_id: m.id, project_id }))}
                placeholder="Link to project…"
              />
            </div>
            <div className="field">
              <span>Participants</span>
              <MultiPicker
                selected={links?.people.map((l) => l.contact_id) ?? []}
                options={contacts.map((c) => ({ id: c.id, label: c.name }))}
                onAdd={(contact_id) => void run(insert("meeting_participants", { meeting_id: m.id, contact_id }))}
                onRemove={(contact_id) => void run(remove("meeting_participants", { meeting_id: m.id, contact_id }))}
                placeholder="Add person…"
              />
              <button type="button" className="link small" onClick={() => void run(addPerson())}><UserPlus size={13} /> New person</button>
            </div>
            <label className="field">
              <span>Other participants</span>
              <input value={m.other_participants ?? ""} placeholder="Free text" onChange={(e) => change({ other_participants: e.target.value || null })} />
            </label>
            <div className="field">
              <span>Tags</span>
              <TagInput value={m.tags} onChange={(tags) => change({ tags })} />
            </div>
          </div>
          <div className="card pad">
            <Attachments owner={{ meeting_id: m.id }} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function ActionItems({ meeting, projectIds }: { meeting: Meeting; projectIds: string[] }) {
  const { data } = useLoad(async () => {
    const items = await list<ActionItem>("meeting_action_items", { eq: { meeting_id: meeting.id }, order: [["position"], ["created_at"]] });
    const tasks = await list<Task>("tasks", { in: ["id", items.map((i) => i.task_id).filter((x): x is string => !!x)] });
    return { items, tasks };
  }, [meeting.id]);
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [converting, setConverting] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const items = data?.items ?? [];

  async function add() {
    if (!text.trim()) return;
    try {
      await insert("meeting_action_items", { meeting_id: meeting.id, text: text.trim(), owner: owner.trim() || null, position: items.length });
      setText("");
      setOwner("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function convert(item: ActionItem) {
    try {
      await rpc("convert_action_item", { item_id: item.id, due: due || null, project: projectIds.length === 1 ? projectIds[0] : null });
      emitChange();
      setConverting(null);
      setDue("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="action-items">
      <h3 className="md-label">Action items</h3>
      <ErrorText error={error} />
      {items.length === 0 && <p className="muted small">Nothing yet. Add what needs doing; turn items into tasks to track them.</p>}
      <ul>
        {items.map((it) => {
          const task = data?.tasks.find((t) => t.id === it.task_id);
          return (
            <li key={it.id} className={it.done ? "closed" : ""}>
              <input type="checkbox" className="check" aria-label={`Done: ${it.text}`} checked={it.done} onChange={() => void update("meeting_action_items", it.id, { done: !it.done })} />
              <input
                className="inline-edit"
                aria-label="Action item"
                defaultValue={it.text}
                onBlur={(e) => e.target.value.trim() && e.target.value !== it.text && void update("meeting_action_items", it.id, { text: e.target.value.trim() })}
              />
              <input
                className="inline-edit owner"
                aria-label="Responsible"
                placeholder="Who"
                defaultValue={it.owner ?? ""}
                onBlur={(e) => e.target.value !== (it.owner ?? "") && void update("meeting_action_items", it.id, { owner: e.target.value.trim() || null })}
              />
              {it.task_id ? (
                <a className="small" href={href("tasks", { view: task && (task.status === "done" || task.status === "cancelled") ? "completed" : "all" })}>
                  <CheckSquare size={13} /> Task{task ? (task.status === "done" ? " (done)" : task.due_date ? ` · due ${task.due_date}` : "") : ""}
                </a>
              ) : converting === it.id ? (
                <span className="row">
                  <input type="date" aria-label="Task due date" value={due} onChange={(e) => setDue(e.target.value)} />
                  <button type="button" className="primary" onClick={() => void convert(it)}>Create task</button>
                  <button type="button" onClick={() => setConverting(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="small" onClick={() => setConverting(it.id)}>→ Task</button>
              )}
              <button
                type="button"
                className="icon danger"
                aria-label={`Delete ${it.text}`}
                onClick={() => confirmDanger("Delete this action item? A task created from it is kept.") && void remove("meeting_action_items", { id: it.id })}
              >
                <Trash2 size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row add-row">
        <input placeholder="New action item" aria-label="New action item" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())} />
        <input placeholder="Who (optional)" aria-label="Responsible" className="owner" value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())} />
        <button type="button" onClick={() => void add()}><Plus size={15} /> Add</button>
      </div>
    </div>
  );
}

