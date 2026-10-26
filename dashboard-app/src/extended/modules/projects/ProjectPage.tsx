import { useState } from "react";
import { ArrowLeft, FileDown, Link2, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { getOne, insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { fmtDate, today } from "../../lib/dates.ts";
import { go, href, setQuery, type Route } from "../../lib/route.ts";
import {
  PROJECT_AREA, PROJECT_STATUS, type Deadline, type Meeting, type MeetingProject, type Note, type Paper, type Project,
  type ProjectPaper, type Task,
} from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { LinksView } from "../../components/LinksEditor.tsx";
import { MarkdownView } from "../../components/Markdown.tsx";
import { Modal } from "../../components/Modal.tsx";
import { useProjects } from "../../components/pickers.tsx";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, confirmDanger, Empty, ErrorText, Tabs } from "../../components/ui.tsx";
import { DeadlineForm } from "../deadlines/DeadlineForm.tsx";
import { DeadlineRows, isOpenDeadline } from "../deadlines/DeadlineRows.tsx";
import { MeetingForm } from "../meetings/MeetingForm.tsx";
import { MeetingRows } from "../meetings/MeetingRows.tsx";
import { createNote } from "../notes/NotesView.tsx";
import { NoteRows } from "../notes/NoteRows.tsx";
import { PaperForm } from "../papers/PaperForm.tsx";
import { PaperRows } from "../papers/PaperRows.tsx";
import { inView, isOpen, sortTasks } from "../tasks/logic.ts";
import { TaskForm } from "../tasks/TaskForm.tsx";
import { TaskList } from "../tasks/TaskList.tsx";
import { ProjectForm } from "./ProjectForm.tsx";
import { statusTone } from "./ProjectsView.tsx";

type Tab = "overview" | "tasks" | "papers" | "notes" | "meetings" | "deadlines" | "files";

export function ProjectPage({ id, route }: { id: string; route: Route }) {
  const tab = (route.query.get("tab") as Tab) || "overview";
  const [modal, setModal] = useState<"edit" | "task" | "paper" | "link-paper" | "meeting" | "deadline" | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const { projects } = useProjects();
  const { data, error } = useLoad(async () => {
    const [project, tasks, pp, notes, mp, deadlines] = await Promise.all([
      getOne<Project>("projects", id),
      list<Task>("tasks", { eq: { project_id: id } }),
      list<ProjectPaper>("project_papers", { eq: { project_id: id } }),
      list<Note>("notes", { eq: { project_id: id }, order: [["updated_at", false]] }),
      list<MeetingProject>("meeting_projects", { eq: { project_id: id } }),
      list<Deadline>("deadlines", { eq: { project_id: id }, order: [["due_date"]] }),
    ]);
    const [papers, meetings] = await Promise.all([
      list<Paper>("papers", { in: ["id", pp.map((l) => l.paper_id)], order: [["created_at", false]] }),
      list<Meeting>("meetings", { in: ["id", mp.map((l) => l.meeting_id)], order: [["starts_at", false]] }),
    ]);
    return { project, tasks, papers, notes: notes.filter((n) => !n.archived_at), meetings, deadlines };
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  const p = data.project;
  if (!p) return <Empty>This project doesn’t exist (it may have been deleted). <a href={href("projects")}>Back to projects</a></Empty>;

  const now = today();
  const openTasks = sortTasks(data.tasks.filter(isOpen), "all");
  const doneTasks = sortTasks(data.tasks.filter((t) => !isOpen(t)), "completed");
  const overdue = data.tasks.filter((t) => inView(t, "overdue", now)).length;
  const upcomingDeadlines = data.deadlines.filter((d) => isOpenDeadline(d));
  const nowIso = new Date().toISOString();

  async function del() {
    if (!confirmDanger(`Delete the project “${p!.title}”? Its tasks, notes and deadlines are kept but unlinked; paper links and project files are removed. Consider archiving instead. This cannot be undone.`)) return;
    await remove("projects", { id: p!.id });
    go("projects");
  }

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["tasks", `Tasks${openTasks.length ? ` (${openTasks.length})` : ""}`],
    ["papers", `Papers${data.papers.length ? ` (${data.papers.length})` : ""}`],
    ["notes", `Notes${data.notes.length ? ` (${data.notes.length})` : ""}`],
    ["meetings", `Meetings${data.meetings.length ? ` (${data.meetings.length})` : ""}`],
    ["deadlines", `Deadlines${upcomingDeadlines.length ? ` (${upcomingDeadlines.length})` : ""}`],
    ["files", "Files"],
  ];

  return (
    <section className="detail">
      <a className="back" href={href("projects")}><ArrowLeft size={14} /> Projects</a>
      <header className="detail-head">
        <div>
          <div className="project-card-head">
            <Badge tone={statusTone(p.status)}>{PROJECT_STATUS[p.status]}</Badge>
            <span className="muted small">{PROJECT_AREA[p.area]}</span>
          </div>
          <h1>{p.title}</h1>
          <p className="muted small">
            {[p.start_date && `Started ${fmtDate(p.start_date)}`, p.target_date && `Target ${fmtDate(p.target_date)}`, p.completed_on && `Completed ${fmtDate(p.completed_on)}`].filter(Boolean).join(" · ")}
          </p>
          <TagList tags={p.tags} />
        </div>
        <div className="page-actions"><a href={`#/project/${p.id}`}>Work board & publications</a>
          <button className={`icon ${p.pinned ? "on" : ""}`} aria-pressed={p.pinned} aria-label={p.pinned ? "Unpin" : "Pin"} onClick={() => void update("projects", p.id, { pinned: !p.pinned })}><Pin size={16} /></button>
          <button onClick={() => go("print/project", { id: p.id })}><FileDown size={15} /> PDF summary</button>
          <button onClick={() => setModal("edit")}><Pencil size={14} /> Edit</button>
          <button className="icon danger" aria-label="Delete project" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>

      <Tabs value={tab} options={tabs} onChange={(v) => setQuery("tab", v === "overview" ? undefined : v)} />

      {tab === "overview" && (
        <div className="detail-grid">
          <div className="detail-main">
            <div className="card pad">
              {p.description ? <MarkdownView text={p.description} /> : <p className="muted">No description yet. <button className="link" onClick={() => setModal("edit")}>Add one</button></p>}
              <LinksView links={p.links} />
            </div>
            <div className="card pad">
              <div className="section-head">
                <h2 className="section-title">Next tasks {overdue > 0 && <span className="neg small">· {overdue} overdue</span>}</h2>
                <button onClick={() => setModal("task")}><Plus size={14} /> Task</button>
              </div>
              <TaskList tasks={openTasks.slice(0, 6)} projects={projects} showProject={false} empty="No open tasks." />
              {openTasks.length > 6 && <button className="link small" onClick={() => setQuery("tab", "tasks")}>All {openTasks.length} tasks →</button>}
            </div>
          </div>
          <aside className="detail-side">
            <div className="card pad">
              <h3>Upcoming deadlines</h3>
              <DeadlineRows deadlines={upcomingDeadlines.slice(0, 4)} empty="None." />
            </div>
            <div className="card pad">
              <h3>Recent notes</h3>
              <NoteRows notes={data.notes.slice(0, 3)} empty="None." />
            </div>
            <div className="card pad">
              <h3>Next meeting</h3>
              <MeetingRows meetings={data.meetings.filter((m) => m.starts_at >= nowIso).slice(-1)} empty="None scheduled." />
            </div>
            <div className="card pad">
              <h3>Reading</h3>
              <PaperRows papers={data.papers.filter((x) => x.status === "reading")} empty="Nothing in progress." />
            </div>
          </aside>
        </div>
      )}

      {tab === "tasks" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Open tasks</h2>
            <button className="primary" onClick={() => setModal("task")}><Plus size={14} /> Task</button>
          </div>
          <TaskList tasks={openTasks} projects={projects} showProject={false} empty="No open tasks." />
          {doneTasks.length > 0 && (
            <div className="pad-x">
              <button className="link small" onClick={() => setShowDoneTasks(!showDoneTasks)}>{showDoneTasks ? "Hide" : "Show"} {doneTasks.length} completed</button>
            </div>
          )}
          {showDoneTasks && <TaskList tasks={doneTasks} projects={projects} showProject={false} />}
        </div>
      )}

      {tab === "papers" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Papers</h2>
            <span className="row">
              <button onClick={() => setModal("link-paper")}><Link2 size={14} /> Link existing</button>
              <button className="primary" onClick={() => setModal("paper")}><Plus size={14} /> New paper</button>
            </span>
          </div>
          <PaperRows
            papers={data.papers}
            empty="No papers linked. Papers stay in your global library and can belong to several projects."
            trailing={(paper) => (
              <button className="icon" aria-label={`Unlink ${paper.title}`} title="Unlink from this project (keeps the paper)" onClick={() => void remove("project_papers", { project_id: p.id, paper_id: paper.id })}>
                <X size={15} />
              </button>
            )}
          />
        </div>
      )}

      {tab === "notes" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Notes</h2>
            <button className="primary" onClick={() => void createNote({ project_id: p.id, type: "research_idea" })}><Plus size={14} /> Note</button>
          </div>
          <NoteRows notes={data.notes} empty="No notes for this project yet." />
        </div>
      )}

      {tab === "meetings" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Meetings</h2>
            <span className="row">
              {data.meetings.length > 0 && <button onClick={() => go("print/meetings", { ids: [...data.meetings].reverse().map((m) => m.id).join(",") })}><FileDown size={14} /> Export all</button>}
              <button className="primary" onClick={() => setModal("meeting")}><Plus size={14} /> Meeting</button>
            </span>
          </div>
          <MeetingRows meetings={data.meetings} empty="No meetings linked to this project." />
        </div>
      )}

      {tab === "deadlines" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Deadlines & milestones</h2>
            <button className="primary" onClick={() => setModal("deadline")}><Plus size={14} /> Deadline</button>
          </div>
          <DeadlineRows deadlines={data.deadlines} empty="No deadlines for this project." />
        </div>
      )}

      {tab === "files" && <div className="card pad"><Attachments owner={{ project_id: p.id }} /></div>}

      {modal === "edit" && <Modal title="Edit project" onClose={() => setModal(null)}><ProjectForm project={p} onDone={() => setModal(null)} /></Modal>}
      {modal === "task" && <Modal title="New task" onClose={() => setModal(null)}><TaskForm preset={{ project_id: p.id }} onDone={() => setModal(null)} /></Modal>}
      {modal === "paper" && <Modal title="Add paper" wide onClose={() => setModal(null)}><PaperForm presetProjectId={p.id} onDone={() => setModal(null)} /></Modal>}
      {modal === "link-paper" && <Modal title="Link a paper from your library" onClose={() => setModal(null)}><LinkPaper projectId={p.id} linked={data.papers.map((x) => x.id)} onDone={() => setModal(null)} /></Modal>}
      {modal === "meeting" && <Modal title="New meeting" onClose={() => setModal(null)}><MeetingForm presetProjectId={p.id} onDone={() => setModal(null)} /></Modal>}
      {modal === "deadline" && <Modal title="New deadline" onClose={() => setModal(null)}><DeadlineForm presetProjectId={p.id} onDone={() => setModal(null)} /></Modal>}
    </section>
  );
}

function LinkPaper({ projectId, linked, onDone }: { projectId: string; linked: string[]; onDone: () => void }) {
  const { data: papers = [] } = useLoad(() => list<Paper>("papers", { order: [["title"]] }), []);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const options = papers.filter((p) => !linked.includes(p.id) && (!q || `${p.title} ${p.authors.join(" ")} ${p.doi ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="form">
      <input autoFocus placeholder="Search your library" aria-label="Search papers" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorText error={error} />
      <ul className="pick-list">
        {options.slice(0, 50).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => void insert("project_papers", { project_id: projectId, paper_id: p.id }).then(onDone, (e: Error) => setError(e.message))}>
              <strong>{p.title}</strong>
              <span className="muted small">{[p.authors[0], p.year].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="muted small">{papers.length ? "No matching papers that aren’t already linked." : "Your library is empty."}</li>}
      </ul>
    </div>
  );
}

