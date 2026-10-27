import { useState } from "react";
import { FileDown, Link2, Plus, X } from "lucide-react";
import { insert, list, remove, useLoad } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { type Deadline, type Meeting, type MeetingProject, type Note, type Paper, type ProjectPaper } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { Modal } from "../../components/Modal.tsx";
import { ErrorText } from "../../components/ui.tsx";
import { DeadlineForm } from "../deadlines/DeadlineForm.tsx";
import { DeadlineRows } from "../deadlines/DeadlineRows.tsx";
import { MeetingForm } from "../meetings/MeetingForm.tsx";
import { MeetingRows } from "../meetings/MeetingRows.tsx";
import { createNote } from "../notes/NotesView.tsx";
import { NoteRows } from "../notes/NoteRows.tsx";
import { PaperForm } from "../papers/PaperForm.tsx";
import { PaperRows } from "../papers/PaperRows.tsx";

export type ProjectSectionTab = "papers" | "notes" | "meetings" | "deadlines" | "files";

/** The library-side parts of a project (papers, notes, meetings, deadlines, files), shown as tabs on the one project page. */
export function ProjectSection({ id, tab }: { id: string; tab: ProjectSectionTab }) {
  const [modal, setModal] = useState<"paper" | "link-paper" | "meeting" | "deadline" | null>(null);
  const { data, error } = useLoad(async () => {
    const [pp, notes, mp, deadlines] = await Promise.all([
      list<ProjectPaper>("project_papers", { eq: { project_id: id } }),
      list<Note>("notes", { eq: { project_id: id }, order: [["updated_at", false]] }),
      list<MeetingProject>("meeting_projects", { eq: { project_id: id } }),
      list<Deadline>("deadlines", { eq: { project_id: id }, order: [["due_date"]] }),
    ]);
    const [papers, meetings] = await Promise.all([
      list<Paper>("papers", { in: ["id", pp.map((l) => l.paper_id)], order: [["created_at", false]] }),
      list<Meeting>("meetings", { in: ["id", mp.map((l) => l.meeting_id)], order: [["starts_at", false]] }),
    ]);
    return { papers, notes: notes.filter((n) => !n.archived_at), meetings, deadlines };
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

