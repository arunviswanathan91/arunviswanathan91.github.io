// Print-optimised documents. The browser's "Save as PDF" turns them into multi-page PDFs with
// real, selectable text. Nothing here changes data.
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { getOne, list, useLoad } from "../../lib/db.ts";
import { fmtDate, fmtDateTime, fmtTime } from "../../lib/dates.ts";
import {
  DEADLINE_CATEGORY, DEADLINE_STATUS, MEETING_TYPE, NOTE_TYPE, PAPER_STATUS, PROJECT_AREA, PROJECT_STATUS, TASK_STATUS,
  type ActionItem, type ContactRow, type Deadline, type Meeting, type MeetingParticipant, type MeetingProject, type Note,
  type Paper, type Project, type ProjectPaper, type Task,
} from "../../lib/types.ts";
import { MarkdownView } from "../../components/Markdown.tsx";
import { authorLine } from "../papers/lookup.ts";

function PrintShell({ title, ready, children }: { title: string; ready: boolean; children: ReactNode }) {
  const printed = useRef(false);
  useEffect(() => {
    document.title = title;
    if (ready && !printed.current) {
      printed.current = true;
      // let fonts and layout settle before opening the print dialog
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [ready, title]);
  useEffect(() => () => void (document.title = "Workspace · Arun Viswanathan"), []);
  return (
    <div className="print-page">
      <div className="print-toolbar">
        <button onClick={() => history.back()}><ArrowLeft size={15} /> Back</button>
        <span className="muted small">Choose “Save as PDF” as the printer. The original stays in your workspace.</span>
        <button className="primary" onClick={() => window.print()}><Printer size={15} /> Print / Save as PDF</button>
      </div>
      <article className="print-doc">{ready ? children : <p className="muted">Preparing…</p>}</article>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <section className="print-section">
      <h3>{title}</h3>
      <MarkdownView text={text} />
    </section>
  );
}

export function PrintMeetings({ ids }: { ids: string[] }) {
  const { data } = useLoad(async () => {
    const [meetings, items, mp, people, projects, contacts] = await Promise.all([
      list<Meeting>("meetings", { in: ["id", ids], order: [["starts_at"]] }),
      list<ActionItem>("meeting_action_items", { in: ["meeting_id", ids], order: [["position"], ["created_at"]] }),
      list<MeetingProject>("meeting_projects", { in: ["meeting_id", ids] }),
      list<MeetingParticipant>("meeting_participants", { in: ["meeting_id", ids] }),
      list<Project>("projects"),
      list<ContactRow>("contacts"),
    ]);
    return { meetings, items, mp, people, projects, contacts };
  }, [ids.join(",")]);

  const many = (data?.meetings.length ?? 0) > 1;
  const title = data?.meetings.length === 1 ? `${data.meetings[0].title} — ${fmtDate(data.meetings[0].starts_at)}` : `Meetings (${data?.meetings.length ?? ""})`;

  return (
    <PrintShell title={title} ready={!!data}>
      {data && many && (
        <header className="print-cover">
          <h1>Meeting notes</h1>
          <p>{data.meetings.length} meetings · {fmtDate(data.meetings[0].starts_at)} – {fmtDate(data.meetings.at(-1)!.starts_at)}</p>
          <ol>{data.meetings.map((m) => <li key={m.id}>{fmtDate(m.starts_at)} — {m.title}</li>)}</ol>
        </header>
      )}
      {data?.meetings.map((m) => {
        const items = data.items.filter((i) => i.meeting_id === m.id);
        const projectNames = data.mp.filter((l) => l.meeting_id === m.id).map((l) => data.projects.find((p) => p.id === l.project_id)?.title).filter(Boolean);
        const people = [
          ...data.people.filter((l) => l.meeting_id === m.id).map((l) => data.contacts.find((c) => c.id === l.contact_id)?.name),
          m.other_participants,
        ].filter(Boolean);
        return (
          <div className={`print-meeting ${many ? "page-break" : ""}`} key={m.id}>
            <h1>{m.title}</h1>
            <table className="print-meta">
              <tbody>
                <tr><th>Date</th><td>{fmtDateTime(m.starts_at)}{m.ends_at ? ` – ${fmtTime(m.ends_at)}` : ""}</td></tr>
                <tr><th>Type</th><td>{MEETING_TYPE[m.type]}</td></tr>
                {m.location && <tr><th>Location</th><td>{m.location}</td></tr>}
                {people.length > 0 && <tr><th>Participants</th><td>{people.join(", ")}</td></tr>}
                {projectNames.length > 0 && <tr><th>Projects</th><td>{projectNames.join(", ")}</td></tr>}
              </tbody>
            </table>
            <Section title="Agenda" text={m.agenda} />
            <Section title="Discussion" text={m.discussion} />
            <Section title="Decisions" text={m.decisions} />
            {items.length > 0 && (
              <section className="print-section">
                <h3>Action items</h3>
                <ul className="print-checklist">
                  {items.map((i) => <li key={i.id}>{i.done ? "☑" : "☐"} {i.text}{i.owner ? ` — ${i.owner}` : ""}</li>)}
                </ul>
              </section>
            )}
            <Section title="Next steps" text={m.next_steps} />
          </div>
        );
      })}
    </PrintShell>
  );
}

export function PrintProject({ id }: { id: string }) {
  const { data } = useLoad(async () => {
    const [project, tasks, links, notes, mp, deadlines] = await Promise.all([
      getOne<Project>("projects", id),
      list<Task>("tasks", { eq: { project_id: id }, order: [["due_date"]] }),
      list<ProjectPaper>("project_papers", { eq: { project_id: id } }),
      list<Note>("notes", { eq: { project_id: id }, order: [["updated_at", false]] }),
      list<MeetingProject>("meeting_projects", { eq: { project_id: id } }),
      list<Deadline>("deadlines", { eq: { project_id: id }, order: [["due_date"]] }),
    ]);
    const [papers, meetings] = await Promise.all([
      list<Paper>("papers", { in: ["id", links.map((l) => l.paper_id)], order: [["year", false]] }),
      list<Meeting>("meetings", { in: ["id", mp.map((l) => l.meeting_id)], order: [["starts_at", false]] }),
    ]);
    return { project, tasks, papers, notes: notes.filter((n) => !n.archived_at), meetings, deadlines };
  }, [id]);
  const p = data?.project;
  const open = data?.tasks.filter((t) => t.status === "todo" || t.status === "in_progress") ?? [];
  const done = data?.tasks.filter((t) => t.status === "done") ?? [];

  return (
    <PrintShell title={p ? `${p.title} — project summary` : "Project"} ready={!!data}>
      {p && data && (
        <>
          <h1>{p.title}</h1>
          <table className="print-meta">
            <tbody>
              <tr><th>Status</th><td>{PROJECT_STATUS[p.status]} · {PROJECT_AREA[p.area]}</td></tr>
              {(p.start_date || p.target_date) && <tr><th>Dates</th><td>{[p.start_date && `Start ${fmtDate(p.start_date)}`, p.target_date && `Target ${fmtDate(p.target_date)}`, p.completed_on && `Completed ${fmtDate(p.completed_on)}`].filter(Boolean).join(" · ")}</td></tr>}
              {p.tags.length > 0 && <tr><th>Tags</th><td>{p.tags.map((t) => `#${t}`).join(" ")}</td></tr>}
              {p.links.length > 0 && <tr><th>Links</th><td>{p.links.map((l) => `${l.label} (${l.url})`).join(", ")}</td></tr>}
              <tr><th>Summary date</th><td>{fmtDate(new Date().toISOString())}</td></tr>
            </tbody>
          </table>
          <Section title="Description" text={p.description} />
          {data.deadlines.length > 0 && (
            <section className="print-section">
              <h3>Deadlines & milestones</h3>
              <ul>{data.deadlines.map((d) => <li key={d.id}>{fmtDate(d.due_date)} — {d.title} ({DEADLINE_CATEGORY[d.category]}, {DEADLINE_STATUS[d.status]})</li>)}</ul>
            </section>
          )}
          <section className="print-section">
            <h3>Open tasks ({open.length})</h3>
            {open.length ? <ul className="print-checklist">{open.map((t) => <li key={t.id}>☐ {t.title}{t.due_date ? ` — due ${fmtDate(t.due_date)}` : ""}{t.status === "in_progress" ? ` (${TASK_STATUS[t.status]})` : ""}</li>)}</ul> : <p>None.</p>}
          </section>
          {done.length > 0 && (
            <section className="print-section">
              <h3>Completed tasks ({done.length})</h3>
              <ul className="print-checklist">{done.slice(0, 50).map((t) => <li key={t.id}>☑ {t.title}</li>)}</ul>
            </section>
          )}
          {data.papers.length > 0 && (
            <section className="print-section">
              <h3>Papers ({data.papers.length})</h3>
              <ol className="print-refs">
                {data.papers.map((pa) => (
                  <li key={pa.id}>
                    {authorLine(pa.authors)} {pa.year ? `(${pa.year})` : ""}. <strong>{pa.title}</strong>. {pa.publication ? <em>{pa.publication}</em> : null}
                    {pa.doi ? ` doi:${pa.doi}` : ""} — {PAPER_STATUS[pa.status]}
                    {pa.summary && <div className="print-small">{pa.summary}</div>}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {data.meetings.length > 0 && (
            <section className="print-section">
              <h3>Meetings ({data.meetings.length})</h3>
              <ul>{data.meetings.map((m) => <li key={m.id}>{fmtDate(m.starts_at)} — {m.title} ({MEETING_TYPE[m.type]}){m.decisions.trim() && <div className="print-small"><MarkdownView text={m.decisions} /></div>}</li>)}</ul>
            </section>
          )}
          {data.notes.length > 0 && (
            <section className="print-section">
              <h3>Notes ({data.notes.length})</h3>
              {data.notes.map((n) => (
                <div key={n.id} className="print-note">
                  <h4>{n.title} <span className="print-small">· {NOTE_TYPE[n.type]} · {fmtDate(n.updated_at)}</span></h4>
                  <MarkdownView text={n.body} />
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </PrintShell>
  );
}

