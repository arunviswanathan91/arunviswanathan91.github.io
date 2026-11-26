import { useState } from "react";
import { FileDown, Link2, Plus, X } from "lucide-react";
import { insert, list, remove, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { GOAL_AREA, TRIP_KIND, TRIP_STATUS, type Deadline, type Experiment, type Goal, type Meeting, type MeetingProject, type Note, type Paper, type ProjectPaper, type Trip } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { Modal } from "../../components/Modal.tsx";
import { Badge, Empty, ErrorText } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { DeadlineForm } from "../deadlines/DeadlineForm.tsx";
import { DeadlineRows } from "../deadlines/DeadlineRows.tsx";
import { MeetingForm } from "../meetings/MeetingForm.tsx";
import { MeetingRows } from "../meetings/MeetingRows.tsx";
import { createNote } from "../notes/NotesView.tsx";
import { NoteRows } from "../notes/NoteRows.tsx";
import { PaperForm } from "../papers/PaperForm.tsx";
import { PaperRows } from "../papers/PaperRows.tsx";
import { CitationExport } from "../papers/CitationExport.tsx";
import { ExperimentRows } from "../experiments/ExperimentRows.tsx";
import { createExperiment } from "../experiments/create.ts";
import { sortExperiments } from "../experiments/logic.ts";
import { createTrip, tripSpan } from "../planning/TripsView.tsx";

export type ProjectSectionTab = "papers" | "notes" | "experiments" | "meetings" | "deadlines" | "trips" | "goals" | "files";

/** The library-side parts of a project (papers, notes, meetings, deadlines, trips, goals, files), shown as tabs on the one project page. */
export function ProjectSection({ id, tab }: { id: string; tab: ProjectSectionTab }) {
  const [modal, setModal] = useState<"paper" | "link-paper" | "meeting" | "deadline" | null>(null);
  const { data, error } = useLoad(async () => {
    const [pp, notes, mp, deadlines, experiments, trips, goals] = await Promise.all([
      list<ProjectPaper>("project_papers", { eq: { project_id: id } }),
      list<Note>("notes", { eq: { project_id: id }, order: [["updated_at", false]] }),
      list<MeetingProject>("meeting_projects", { eq: { project_id: id } }),
      list<Deadline>("deadlines", { eq: { project_id: id }, order: [["due_date"]] }),
      list<Experiment>("experiments", { eq: { project_id: id }, order: [["updated_at", false]] }),
      list<Trip>("trips", { eq: { project_id: id }, order: [["starts_on"], ["created_at"]] }),
      list<Goal>("goals", { eq: { project_id: id }, order: [["year", false], ["position"]] }),
    ]);
    const [papers, meetings] = await Promise.all([
      list<Paper>("papers", { in: ["id", pp.map((l) => l.paper_id)], order: [["created_at", false]] }),
      list<Meeting>("meetings", { in: ["id", mp.map((l) => l.meeting_id)], order: [["starts_at", false]] }),
    ]);
    return { papers, notes: notes.filter((n) => !n.archived_at), meetings, deadlines, experiments: sortExperiments(experiments.filter((e) => !e.archived_at)), trips, goals };
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!data) return null;

  return (
    <div className="extension-workspace project-section">
      {tab === "papers" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Papers</h2>
            <span className="row">
              <CitationExport papers={data.papers} name="project-papers" />
              <button onClick={() => setModal("link-paper")}><Link2 size={14} /> Link existing</button>
              <button className="primary" onClick={() => setModal("paper")}><Plus size={14} /> New paper</button>
            </span>
          </div>
          <PaperRows
            papers={data.papers}
            empty="No papers linked. Papers stay in your global library and can belong to several projects."
            trailing={(paper) => (
              <button className="icon" aria-label={`Unlink ${paper.title}`} title="Unlink from this project (keeps the paper)" onClick={() => void remove("project_papers", { project_id: id, paper_id: paper.id })}>
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
            <button className="primary" onClick={() => void createNote({ project_id: id, type: "research_idea" })}><Plus size={14} /> Note</button>
          </div>
          <NoteRows notes={data.notes} empty="No notes for this project yet." />
        </div>
      )}

      {tab === "experiments" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Experiments</h2>
            <button className="primary" onClick={() => void createExperiment({ project_id: id })}><Plus size={14} /> Experiment</button>
          </div>
          <ExperimentRows experiments={data.experiments} empty="No experiments logged for this project yet." />
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

      {tab === "trips" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Conferences & trips</h2>
            <button className="primary" onClick={() => void createTrip({ project_id: id })}><Plus size={14} /> Trip</button>
          </div>
          {data.trips.length === 0 && <Empty icon={SECTIONS.trips.icon}>No conferences or trips linked to this project.</Empty>}
          <ul className="note-list">
            {data.trips.map((t) => (
              <li key={t.id}>
                <a href={href(`trips/${t.id}`)}>
                  <span className="note-title">{t.title}</span>
                  <span className="note-meta">
                    <Badge tone={t.status === "cancelled" ? "quiet" : t.status === "attended" ? "pos" : t.status === "considering" ? undefined : "accent"}>{TRIP_STATUS[t.status]}</Badge>
                    <span className="muted small">{TRIP_KIND[t.kind]} · {tripSpan(t)}{t.location ? ` · ${t.location}` : ""}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "goals" && (
        <div className="card list-card">
          <div className="section-head pad-x">
            <h2 className="section-title">Goals</h2>
            <a href={href("goals")}>All goals</a>
          </div>
          {data.goals.length === 0 && <Empty icon={SECTIONS.goals.icon}>No goals linked to this project. Link one from the Goals page.</Empty>}
          <ul className="note-list">
            {data.goals.map((g) => (
              <li key={g.id}>
                <a href={href("goals", { year: String(g.year) })}>
                  <span className="note-title">{g.title}</span>
                  <span className="note-meta">
                    <Badge tone={g.status === "achieved" ? "pos" : g.status === "dropped" ? "quiet" : "accent"}>{g.status === "achieved" ? "Achieved" : g.status === "dropped" ? "Dropped" : "Active"}</Badge>
                    <span className="muted small">{GOAL_AREA[g.area]} · {g.year}{g.due_on ? ` · due ${fmtDate(g.due_on)}` : ""}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "files" && <div className="card pad"><Attachments owner={{ project_id: id }} /></div>}

      {modal === "paper" && <Modal title="Add paper" wide onClose={() => setModal(null)}><PaperForm presetProjectId={id} onDone={() => setModal(null)} /></Modal>}
      {modal === "link-paper" && <Modal title="Link a paper from your library" onClose={() => setModal(null)}><LinkPaper projectId={id} linked={data.papers.map((x) => x.id)} onDone={() => setModal(null)} /></Modal>}
      {modal === "meeting" && <Modal title="New meeting" onClose={() => setModal(null)}><MeetingForm presetProjectId={id} onDone={() => setModal(null)} /></Modal>}
      {modal === "deadline" && <Modal title="New deadline" onClose={() => setModal(null)}><DeadlineForm presetProjectId={id} onDone={() => setModal(null)} /></Modal>}
    </div>
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

