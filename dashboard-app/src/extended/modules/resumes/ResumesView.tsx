import { Copy, Download, FilePlus2, FileText, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { askText } from "../../../lib/dialogs.tsx";
import { ask } from "../../../lib/dialogs.tsx";
import { insert, list, trash, update, useLoad } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { ErrorText, PageHeader } from "../../components/ui.tsx";
import { ago, cloneResume, emptyResume, normalizeResume, type ResumeData } from "./model.ts";
import { ResumePreview } from "./ResumePreview.tsx";
import { starterResume, teachingResume } from "./starter.ts";

interface Row { id: string; title: string; data: unknown; created_at: string; updated_at: string }

async function create(title: string, data: ResumeData) {
  const r = await insert<Row>("resumes", { title, data });
  go(`resumes/${r.id}`);
}

export function ResumesView() {
  const { data, error } = useLoad(() => list<Row>("resumes", { order: [["updated_at", false]] }), []);
  const duplicate = async (r: Row) => { await insert("resumes", { title: `${r.title} (copy)`, data: cloneResume(normalizeResume(r.data)) }); };
  const rename = async (r: Row) => { const t = (await askText("Resume name", r.title))?.trim(); if (t) await update("resumes", r.id, { title: t }); };
  const del = async (r: Row) => { if ((await ask(`Move “${r.title}” to Trash? You can restore it from Trash.`))) await trash("resumes", r.id); };
  const close = (e: React.MouseEvent) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={!data && !error || undefined}>
      <PageHeader section="resumes" title="My Resumes" subtitle="Editable resumes and CVs. Keep as many versions as you like and download any of them as a PDF whenever you need it." />
      <ErrorText error={error} />
      <div className="rb-gallery">
        <button className="rb-new" onClick={() => void create("Untitled resume", emptyResume())}><Plus size={26} /><span>New resume</span></button>
        {data?.map((r) => {
          const d = normalizeResume(r.data);
          return (
            <div key={r.id} className="rb-gcard">
              <a className="rb-thumb" href={`#/tools/resumes/${r.id}`} aria-label={`Open ${r.title}`}><div className="rb-thumb-in"><ResumePreview data={d} /></div></a>
              <div className="rb-gmeta">
                <div><strong>{r.title}</strong><div className="muted small">edited {ago(r.updated_at)} · {d.style.pageFormat === "A4" ? "A4" : "US Letter"}</div></div>
                <details className="rb-menu">
                  <summary aria-label={`Actions for ${r.title}`}><MoreVertical size={16} /></summary>
                  <div className="rb-menu-list" onClick={close}>
                    <a href={`#/tools/resumes/${r.id}`}><Pencil size={14} /> Edit</a>
                    <a href={`#/tools/resumes/${r.id}?print=1`}><Download size={14} /> Download PDF</a>
                    <button onClick={() => void rename(r)}><FileText size={14} /> Rename</button>
                    <button onClick={() => void duplicate(r)}><Copy size={14} /> Duplicate</button>
                    <button className="danger" onClick={() => void del(r)}><Trash2 size={14} /> Delete</button>
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
      {data && (
        <p className="muted small rb-starters">
          Start from existing content:{" "}
          <button className="link-button" onClick={() => void create("Research Resume", starterResume())}><FilePlus2 size={13} /> My research resume</button>{" · "}
          <button className="link-button" onClick={() => void create("Teaching CV", teachingResume())}><FilePlus2 size={13} /> My teaching CV</button>
        </p>
      )}
    </section>
  );
}
