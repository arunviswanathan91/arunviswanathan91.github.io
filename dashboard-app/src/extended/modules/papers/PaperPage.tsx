import { useState } from "react";
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { getOne, insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { today } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { PAPER_STATUS, type Note, type PageRef, type Paper, type PaperStatus, type ProjectPaper } from "../../lib/types.ts";
import { Attachments } from "../../components/Attachments.tsx";
import { Modal } from "../../components/Modal.tsx";
import { MultiPicker, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { confirmDanger, Empty, ErrorText, SaveIndicator, Stars } from "../../components/ui.tsx";
import { NoteRows } from "../notes/NoteRows.tsx";
import { PaperForm } from "./PaperForm.tsx";
import { ReadingTimer } from "./ReadingTimer.tsx";

const NOTE_FIELDS: [keyof Paper, string, string][] = [
  ["summary", "Summary", "What is this paper about, in a few sentences?"],
  ["research_question", "Research question", "What question does it try to answer?"],
  ["methods", "Methods", "Data, models, experimental setup…"],
  ["findings", "Findings", "Key results"],
  ["strengths", "Strengths", ""],
  ["limitations", "Limitations", ""],
  ["relevance", "Relevance to my research", "How does this connect to my work?"],
  ["ideas", "Questions & ideas", "Follow-ups, things to try, open questions"],
];

function Authors({ authors }: { authors: string[] }) {
  const [all, setAll] = useState(false);
  const max = 8;
  if (authors.length <= max || all) return <p className="muted">{authors.join(", ")}</p>;
  return (
    <p className="muted">
      {authors.slice(0, max).join(", ")}, … <button className="link" onClick={() => setAll(true)}>+{authors.length - max} more</button>
    </p>
  );
}

export function PaperPage({ id }: { id: string }) {
  const { data, error } = useLoad(async () => {
    const [paper, links, notes] = await Promise.all([
      getOne<Paper>("papers", id),
      list<ProjectPaper>("project_papers", { eq: { paper_id: id } }),
      list<Note>("notes", { eq: { paper_id: id }, order: [["updated_at", false]] }),
    ]);
    return { paper, links, notes };
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  if (!data.paper) return <Empty>This paper doesn’t exist (it may have been deleted). <a href={href("papers")}>Back to papers</a></Empty>;
  return <PaperDetail key={id} paper={data.paper} links={data.links} notes={data.notes} />;
}

function PaperDetail({ paper, links, notes }: { paper: Paper; links: ProjectPaper[]; notes: Note[] }) {
  const { projects } = useProjects();
  const [editing, setEditing] = useState(false);
  const [editingNotes,setEditingNotes]=useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState(() => Object.fromEntries(NOTE_FIELDS.map(([k]) => [k, (paper[k] as string | null) ?? ""])) as Record<string, string>);
  const [refs, setRefs] = useState<PageRef[]>(paper.page_refs ?? []);
  const autosave = useAutosave<Paper>((patch) => update("papers", paper.id, patch, true).then(() => undefined));

  const set = async (patch: Partial<Paper>) => {
    try {
      await update("papers", paper.id, patch);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  function changeStatus(s: PaperStatus) {
    const patch: Partial<Paper> = { status: s };
    if (s === "reading" && !paper.started_on) patch.started_on = today();
    if ((s === "read" || s === "to_cite") && !paper.finished_on) patch.finished_on = today();
    void set(patch);
  }

  function setRef(i: number, patch: Partial<PageRef>) {
    const next = refs.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setRefs(next);
    autosave.change({ page_refs: next });
  }

  async function del() {
    if (!confirmDanger(`Delete “${paper.title}” and its reading notes? Linked notes are kept. This cannot be undone.`)) return;
    await remove("papers", { id: paper.id });
    go("papers");
  }

  async function newNote() {
    const n = await insert<Note>("notes", { title: `Notes on ${paper.title}`, type: "literature", paper_id: paper.id, project_id: links.length === 1 ? links[0].project_id : null });
    go(`notes/${n.id}`);
  }

  const ids = [
    paper.doi && { label: `DOI ${paper.doi}`, url: `https://doi.org/${paper.doi}` },
    paper.arxiv_id && { label: `arXiv ${paper.arxiv_id}`, url: `https://arxiv.org/abs/${paper.arxiv_id}` },
    paper.pmid && { label: `PubMed ${paper.pmid}`, url: `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` },
    paper.url && !paper.doi && { label: "Link", url: paper.url },
  ].filter(Boolean) as { label: string; url: string }[];

  return (
    <section className="detail">
      <a className="back" href={href("papers")}><ArrowLeft size={14} /> Papers</a>
      <header className="detail-head">
        <div>
          <h1 className="paper-h1">{paper.title}</h1>
          <Authors authors={paper.authors} />
          <p className="muted small">{[paper.publication, paper.year].filter(Boolean).join(" · ")}</p>
          <div className="id-links">
            {ids.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {l.label}</a>)}
          </div>
        </div>
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          <button onClick={() => setEditing(true)}><Pencil size={14} /> Edit details</button>
          <button className="icon danger" aria-label="Delete paper" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>
      <ErrorText error={error} />

      <div className="detail-grid">
        <div className="detail-main">
          {paper.abstract && (
            <details className="card pad abstract" open={!text.summary}>
              <summary>Abstract</summary>
              <p>{paper.abstract}</p>
            </details>
          )}

          <div className="card pad notebook">
            <div className="section-head"><h2 className="section-title">Reading notes</h2><button onClick={()=>{void autosave.flush();setEditingNotes(!editingNotes)}}>{editingNotes?"Done":"Edit"}</button></div>
            <div className="reading-notes">
              {NOTE_FIELDS.map(([k, label, hint]) => (
                <label key={k} className="field">
                  <span>{label}</span>
                  {editingNotes ? <textarea
                    rows={k === "summary" ? 4 : 3}
                    placeholder={hint}
                    value={text[k]}
                    onChange={(e) => {
                      setText({ ...text, [k]: e.target.value });
                      autosave.change({ [k]: e.target.value || null } as Partial<Paper>);
                    }}
                    onBlur={() => void autosave.flush()}
                  /> : <p style={{whiteSpace:"pre-wrap"}}>{text[k] || "—"}</p>}
                </label>
              ))}
            </div>
          </div>

          <div className="card pad">
            <div className="section-head">
              <h2 className="section-title">Page references</h2>
              <button type="button" onClick={() => setRefs([...refs, { page: "", note: "" }])}><Plus size={14} /> Add</button>
            </div>
            {refs.length === 0 ? <p className="muted small">Useful pages, figures or tables to come back to.</p> : (
              <ul className="page-refs">
                {refs.map((r, i) => (
                  <li key={i}>
                    <input aria-label="Page" placeholder="p. 4 / Fig. 2" value={r.page} onChange={(e) => setRef(i, { page: e.target.value })} />
                    <input aria-label="Note" placeholder="What’s there" value={r.note} onChange={(e) => setRef(i, { note: e.target.value })} />
                    <button type="button" className="icon danger" aria-label="Remove reference" onClick={() => { const next = refs.filter((_, j) => j !== i); setRefs(next); autosave.change({ page_refs: next }); }}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card pad">
            <div className="section-head">
              <h2 className="section-title">Notes</h2>
              <button type="button" onClick={() => void newNote()}><Plus size={14} /> Literature note</button>
            </div>
            <NoteRows notes={notes} empty="No notes linked to this paper yet." />
          </div>
        </div>

        <aside className="detail-side">
          <ReadingTimer paper={paper} />
          <div className="card pad side-fields">
            <label className="field">
              <span>Status</span>
              <select value={paper.status} onChange={(e) => changeStatus(e.target.value as PaperStatus)}>
                {Object.entries(PAPER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <div className="field">
              <span>Rating</span>
              <Stars value={paper.rating} onChange={(rating) => void set({ rating })} />
            </div>
            <label className="field">
              <span>Priority</span>
              <select value={paper.priority} onChange={(e) => void set({ priority: e.target.value as Paper["priority"] })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <div className="field">
              <span>Projects</span>
              <MultiPicker
                selected={links.map((l) => l.project_id)}
                options={projects.map((p) => ({ id: p.id, label: p.title }))}
                onAdd={(project_id) => void insert("project_papers", { project_id, paper_id: paper.id }).catch((e) => setError(e.message))}
                onRemove={(project_id) => void remove("project_papers", { project_id, paper_id: paper.id })}
                placeholder="Link to project…"
              />
            </div>
            <div className="field">
              <span>Tags</span>
              <TagInput value={paper.tags} onChange={(tags) => void set({ tags })} />
            </div>
            {(paper.started_on || paper.finished_on) && (
              <p className="small muted">
                {paper.started_on && <>Started {paper.started_on}. </>}
                {paper.finished_on && <>Finished {paper.finished_on}.</>}
              </p>
            )}
          </div>
          <div className="card pad">
            <Attachments owner={{ paper_id: paper.id }} title="PDF & files" accept="application/pdf,.pdf,*/*" />
          </div>
        </aside>
      </div>

      {editing && (
        <Modal title="Edit paper details" wide onClose={() => setEditing(false)}>
          <PaperForm paper={paper} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </section>
  );
}

