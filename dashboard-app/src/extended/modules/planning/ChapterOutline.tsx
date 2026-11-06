import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileUp } from "lucide-react";
import { strFromU8, unzipSync } from "fflate";
import { ask } from "../../../lib/dialogs.tsx";
import type { ThesisChapter } from "../../lib/types.ts";
import { Progress } from "./Progress.tsx";
import { childrenOf, docxBlocks, mergeOutline, outlineProgress, parseOutline, sectionProgress, toggleItem, type OutlineItem } from "./outline.ts";

const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** A chapter's outline: sections and subsections with done toggles, and the figures to prepare. */
export function ChapterOutline({ chapter, patch, onError }: { chapter: ThesisChapter; patch: (p: Partial<ThesisChapter>) => void; onError: (e: string) => void }) {
  const items = chapter.outline ?? [];
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const p = outlineProgress(items);
  const save = (outline: OutlineItem[]) => patch({ outline });
  const sections = items.filter((i) => i.kind === "section");
  const figures = items.filter((i) => i.kind === "figure");
  const loose = items.filter((i) => i.kind === "subsection" && !sections.some((s) => i.number.startsWith(s.number + ".")));

  async function importDocx(f: File | undefined) {
    if (!f) return;
    onError(""); setMsg("");
    try {
      const files = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => x.name === "word/document.xml" });
      const xml = files["word/document.xml"];
      if (!xml) throw new Error("This is not a Word (.docx) document.");
      const parsed = parseOutline(docxBlocks(strFromU8(xml)));
      if (!parsed.items.length) throw new Error("No numbered sections (like “2.1 Cancer”) or Section/Paras tables were found in this document.");
      if (items.length && !(await ask(`Update this chapter’s outline from “${f.name}”? Sections and figures that are already ticked stay ticked.`))) return;
      const merged = mergeOutline(items, parsed.items);
      const extra = parsed.subtitle && !chapter.notes ? { notes: [parsed.subtitle, parsed.total].filter(Boolean).join("\n") } : {};
      patch({ outline: merged, ...extra });
      const q = outlineProgress(merged);
      setMsg(`Imported ${q.total} sections and ${q.figures} figures and tables (${n(q.parasTotal)} paragraphs).`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  const row = (i: OutlineItem) => (hideDone && i.done ? null : (
    <li key={i.id} className={`outline-item ${i.done ? "done" : ""}`}>
      <label className="outline-check">
        <input type="checkbox" checked={i.done} onChange={() => save(toggleItem(items, i.id))} aria-label={`${i.number} ${i.title} done`} />
        <span className="outline-num">{i.number}</span>
        <span className="outline-title">{i.title}</span>
      </label>
      {i.paras != null && <span className="outline-paras" title="Target paragraphs">{n(i.paras)} ¶</span>}
      {(i.cover || i.notes) && (
        <span className="outline-detail">
          {i.cover && <span className="muted small">{i.cover}</span>}
          {i.notes && <span className="outline-note small">{i.notes}</span>}
        </span>
      )}
    </li>
  ));

  return (
    <section className="chapter-outline">
      <div className="section-head">
        <h3 className="md-label small-label">Outline</h3>
        <span className="row">
          {items.length > 0 && <label className="toggle"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done</label>}
          <button className="small" onClick={() => file.current?.click()} title="Read sections, paragraph targets and figures from a Word writing plan"><FileUp size={14} /> {items.length ? "Update from Word" : "Import from Word"}</button>
          <input ref={file} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => void importDocx(e.target.files?.[0])} />
        </span>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}
      {items.length === 0 ? (
        <p className="muted small">Import a writing plan from Word: numbered headings (“2.1 Cancer (28 paragraphs)”) and a Section | Paras | What to cover | Notes table under each. Each section then gets a done toggle.</p>
      ) : (
        <>
          <div className="outline-summary">
            <Progress share={p.share} label="Outline done" />
            <span className="small">
              <strong>{n(p.parasDone)}</strong> of {n(p.parasTotal)} paragraphs · {p.done} of {p.total} sections done
              {p.figures > 0 && <> · {p.figuresDone} of {p.figures} figures &amp; tables</>}
            </span>
          </div>
          <ul className="outline-sections">
            {sections.map((s) => {
              const kids = childrenOf(items, s);
              const sp = sectionProgress(items, s);
              const all = sp.total > 0 && sp.done === sp.total;
              const isClosed = closed.has(s.id);
              if (hideDone && all) return null;
              const over = s.paras != null && kids.length > 0 && Math.abs(sp.parasTotal - s.paras) >= 1;
              return (
                <li key={s.id} className={`outline-section ${all ? "done" : ""}`}>
                  <div className="outline-section-head">
                    <button className="icon" aria-expanded={!isClosed} aria-label={isClosed ? `Show ${s.title}` : `Hide ${s.title}`} onClick={() => setClosed((c) => { const x = new Set(c); if (x.has(s.id)) x.delete(s.id); else x.add(s.id); return x; })}>
                      {isClosed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <label className="outline-check">
                      <input type="checkbox" checked={all} onChange={() => save(toggleItem(items, s.id))} aria-label={`${s.number} ${s.title} done`} />
                      <span className="outline-num">{s.number}</span>
                      <strong className="outline-title">{s.title}</strong>
                    </label>
                    <span className="muted small outline-section-meta">
                      {kids.length > 0 && `${sp.done}/${sp.total} · `}{n(sp.parasDone)}/{n(sp.parasTotal)} ¶
                      {over && <span className="warn-text" title="The subsections’ paragraphs do not add up to the section’s target"> (target {n(s.paras!)})</span>}
                    </span>
                  </div>
                  {s.notes && !isClosed && <p className="outline-note small">{s.notes}</p>}
                  {!isClosed && kids.length > 0 && <ul className="outline-items">{kids.map(row)}</ul>}
                  {!isClosed && kids.length === 0 && s.cover && <p className="muted small outline-cover">{s.cover}</p>}
                </li>
              );
            })}
          </ul>
          {loose.length > 0 && <ul className="outline-items">{loose.map(row)}</ul>}
          {figures.length > 0 && (
            <div className="outline-figures">
              <h4 className="small-label">Figures and tables to prepare <span className="muted small">{p.figuresDone}/{p.figures}</span></h4>
              <ul className="outline-items">{figures.map(row)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
