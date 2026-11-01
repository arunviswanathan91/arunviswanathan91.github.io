import { Copy, FilePlus2, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { fmtDateTime } from "../../lib/dates.ts";
import { confirmDanger, Empty, ErrorText, PageHeader } from "../../components/ui.tsx";
import { cloneResume, emptyResume, normalizeResume, type ResumeData } from "./model.ts";
import { starterResume, teachingResume } from "./starter.ts";

interface Row { id: string; title: string; data: unknown; created_at: string; updated_at: string }

async function create(title: string, data: ResumeData) {
  const r = await insert<Row>("resumes", { title, data });
  go(`resumes/${r.id}`);
}

export function ResumesView() {
  const { data, error } = useLoad(() => list<Row>("resumes", { order: [["updated_at", false]] }), []);
  const duplicate = async (r: Row) => { await insert("resumes", { title: `${r.title} (copy)`, data: cloneResume(normalizeResume(r.data)) }); };
  const rename = async (r: Row) => { const t = prompt("Resume name", r.title)?.trim(); if (t) await update("resumes", r.id, { title: t }); };
  const del = async (r: Row) => { if (confirmDanger(`Delete “${r.title}”? This can’t be undone.`)) await remove("resumes", { id: r.id }); };
  return (
    <section>
      <PageHeader section="papers" title="Resumes" subtitle="Build resumes and CVs, keep as many versions as you like, and download any of them as a PDF."
        actions={<>
          <button onClick={() => void create("Research Resume", starterResume())}><FilePlus2 size={15} /> From my research resume</button>
          <button onClick={() => void create("Teaching CV", teachingResume())}><FilePlus2 size={15} /> From my teaching CV</button>
          <button className="primary" onClick={() => void create("Untitled resume", emptyResume())}><Plus size={16} /> New resume</button>
        </>} />
      <ErrorText error={error} />
      {data && (data.length === 0
        ? <Empty icon={FileText} action={<button className="primary" onClick={() => void create("Research Resume", starterResume())}>Start from my research resume</button>}>No resumes yet.</Empty>
        : <div className="rb-grid">{data.map((r) => {
            const d = normalizeResume(r.data);
            return (
              <div key={r.id} className="card rb-doc">
                <a className="rb-doc-main" href={`#/tools/resumes/${r.id}`}>
                  <FileText size={20} />
                  <strong>{r.title}</strong>
                  <span className="muted small">{d.profile.name || "No name yet"} · {d.sections.length} sections</span>
                  <span className="muted small">Edited {fmtDateTime(r.updated_at)}</span>
                </a>
                <div className="rb-actions">
                  <button className="icon" aria-label="Rename" title="Rename" onClick={() => void rename(r)}><Pencil size={15} /></button>
                  <button className="icon" aria-label="Duplicate" title="Duplicate" onClick={() => void duplicate(r)}><Copy size={15} /></button>
                  <button className="icon" aria-label="Delete" title="Delete" onClick={() => void del(r)}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}</div>)}
    </section>
  );
}
