import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Download, Eye, EyeOff, Minus, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { getOne, update, useLoad } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { Modal } from "../../components/Modal.tsx";
import { confirmDanger, ErrorText, SaveIndicator } from "../../components/ui.tsx";
import {
  ACCENTS, DEFAULT_STYLE, FONTS, HEADING_STYLES, SECTION_ORDER, SECTION_TYPES, moveBy, newItem, newSection, normalizeResume, pdfFilename,
  type FontKey, type HeadingStyle, type ItemField, type ResumeData, type ResumeStyle, type ResumeItem, type ResumeSection, type SectionType,
} from "./model.ts";
import { ResumePreview } from "./ResumePreview.tsx";

interface Row { id: string; title: string; data: unknown }

export function ResumeEditor({ id }: { id: string }) {
  const { data: row, error, loading } = useLoad(() => getOne<Row>("resumes", id), [id]);
  if (error) return <ErrorText error={error} />;
  if (loading && !row) return <p className="muted">Loading…</p>;
  if (!row) return <p className="muted">This resume doesn’t exist. <a href="#/tools/resumes">Back to resumes</a></p>;
  // Remount per resume; after this the editor owns the state (remote reloads must not clobber typing).
  return <Editor key={row.id} row={row} />;
}

function Editor({ row }: { row: Row }) {
  const [title, setTitle] = useState(row.title);
  const [data, setData] = useState<ResumeData>(() => normalizeResume(row.data));
  const [tab, setTab] = useState<"content" | "customize">("content");
  const [adding, setAdding] = useState(false);
  const { status, error, change, flush } = useAutosave<{ title: string; data: ResumeData }>(async (patch) => {
    await update("resumes", row.id, patch, true); // quiet: the editor already holds the newest state
  });
  // Undo/redo: snapshots, one per burst of typing (edits within 1.2 s of each other share a step).
  const past = useRef<ResumeData[]>([]);
  const future = useRef<ResumeData[]>([]);
  const lastEdit = useRef(0);
  const [, bump] = useState(0);
  const apply = (next: ResumeData) => { setData(next); change({ data: next }); };
  const edit = (next: ResumeData) => {
    const now = Date.now();
    if (now - lastEdit.current > 1200 || !past.current.length) past.current = [...past.current.slice(-99), data];
    lastEdit.current = now; future.current = [];
    apply(next); bump((n) => n + 1);
  };
  const undo = () => { const prev = past.current.pop(); if (!prev) return; future.current.push(data); lastEdit.current = 0; apply(prev); bump((n) => n + 1); };
  const redo = () => { const nxt = future.current.pop(); if (!nxt) return; past.current.push(data); lastEdit.current = 0; apply(nxt); bump((n) => n + 1); };
  const setSection = (sid: string, f: (s: ResumeSection) => ResumeSection) => edit({ ...data, sections: data.sections.map((s) => (s.id === sid ? f(s) : s)) });

  const download = async () => {
    await flush();
    const prev = document.title;
    document.title = pdfFilename(title, data.profile.name); // becomes the PDF's file name
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };
  // Printing hides everything but the page (see styles.css).
  useEffect(() => {
    document.body.classList.add("resume-print");
    return () => document.body.classList.remove("resume-print");
  }, []);

  return (
    <div className="rb">
      <div className="rb-bar">
        <button onClick={() => { void flush(); go("resumes"); }}><ArrowLeft size={15} /> Resumes</button>
        <input className="rb-title" aria-label="Resume name" value={title} onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) change({ title: e.target.value }); }} />
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "content"} className={tab === "content" ? "on" : ""} onClick={() => setTab("content")}>Content</button>
          <button role="tab" aria-selected={tab === "customize"} className={tab === "customize" ? "on" : ""} onClick={() => setTab("customize")}>Customize</button>
        </div>
        <button className="icon" aria-label="Undo" title="Undo" disabled={!past.current.length} onClick={undo}><Undo2 size={16} /></button>
        <button className="icon" aria-label="Redo" title="Redo" disabled={!future.current.length} onClick={redo}><Redo2 size={16} /></button>
        <SaveIndicator status={status} error={error} />
        <button className="primary" onClick={() => void download()}><Download size={15} /> Download PDF</button>
      </div>
      <div className="rb-body">
        <div className="rb-editor">
          {tab === "content" ? (
            <>
              <ProfileCard data={data} onChange={edit} />
              {data.sections.map((s, n) => (
                <SectionCard key={s.id} s={s} first={n === 0} last={n === data.sections.length - 1}
                  onChange={(f) => setSection(s.id, f)}
                  onMove={(d) => edit({ ...data, sections: moveBy(data.sections, n, d) })}
                  onDelete={() => { if (confirmDanger(`Delete the “${s.title}” section and its ${s.items.length} entries?`)) edit({ ...data, sections: data.sections.filter((x) => x.id !== s.id) }); }} />
              ))}
              <button className="rb-add" onClick={() => setAdding(true)}><Plus size={16} /> Add content</button>
            </>
          ) : <CustomizePanel data={data} onChange={edit} />}
        </div>
        <div className="rb-preview"><div className="rb-sheet"><ResumePreview data={data} /></div></div>
      </div>
      {adding && (
        <Modal title="Add content" wide onClose={() => setAdding(false)}>
          <div className="rb-tiles">
            {SECTION_ORDER.map((t: SectionType) => (
              <button key={t} className="rb-tile" onClick={() => { edit({ ...data, sections: [...data.sections, newSection(t, { items: [newItem()] })] }); setAdding(false); }}>
                <strong>{SECTION_TYPES[t].label}</strong><span className="muted small">{SECTION_TYPES[t].blurb}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Input({ label, value, onChange, area, rows = 4, placeholder }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; rows?: number; placeholder?: string }) {
  return (
    <label className="rb-field">
      <span>{label}</span>
      {area ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function ProfileCard({ data, onChange }: { data: ResumeData; onChange: (d: ResumeData) => void }) {
  const [open, setOpen] = useState(true);
  const p = data.profile;
  const set = (patch: Partial<typeof p>) => onChange({ ...data, profile: { ...p, ...patch } });
  return (
    <div className="rb-card">
      <button className="rb-card-head" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong>Personal details &amp; summary</strong></button>
      {open && (
        <div className="rb-card-body">
          <Input label="Name" value={p.name} onChange={(v) => set({ name: v })} />
          <Input label="Headline" value={p.headline} onChange={(v) => set({ headline: v })} placeholder="PhD Candidate | Senior Research Fellow" />
          <Input label="Email" value={p.email} onChange={(v) => set({ email: v })} />
          <Input label="Phone" value={p.phone} onChange={(v) => set({ phone: v })} />
          <Input label="Location" value={p.location} onChange={(v) => set({ location: v })} />
          <div className="rb-field"><span>Links</span>
            {p.links.map((l, n) => (
              <div className="rb-link-row" key={n}>
                <input placeholder="Label (LinkedIn)" value={l.label} onChange={(e) => set({ links: p.links.map((x, k) => (k === n ? { ...x, label: e.target.value } : x)) })} />
                <input placeholder="https://…" value={l.url} onChange={(e) => set({ links: p.links.map((x, k) => (k === n ? { ...x, url: e.target.value } : x)) })} />
                <button className="icon" aria-label="Remove link" onClick={() => set({ links: p.links.filter((_, k) => k !== n) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => set({ links: [...p.links, { label: "", url: "" }] })}><Plus size={14} /> Link</button>
          </div>
          <Input label="Summary" area rows={5} value={p.summary} onChange={(v) => set({ summary: v })} />
        </div>
      )}
    </div>
  );
}

function SectionCard({ s, first, last, onChange, onMove, onDelete }: {
  s: ResumeSection; first: boolean; last: boolean; onChange: (f: (s: ResumeSection) => ResumeSection) => void; onMove: (d: number) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const def = SECTION_TYPES[s.type];
  const setItem = (iid: string, patch: Partial<ResumeItem>) => onChange((x) => ({ ...x, items: x.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }));
  const addItem = () => { const it = newItem(); onChange((x) => ({ ...x, items: [...x.items, it] })); setOpenItem(it.id); setOpen(true); };
  return (
    <div className={`rb-card${s.hidden ? " is-hidden" : ""}`}>
      <div className="rb-card-head">
        <button className="rb-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong>{s.title || def.label}</strong><span className="muted small">{s.items.length}</span></button>
        <span className="rb-actions">
          <button className="icon" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}><ChevronUp size={15} /></button>
          <button className="icon" aria-label="Move down" disabled={last} onClick={() => onMove(1)}><ChevronDown size={15} /></button>
          <button className="icon" aria-label={s.hidden ? "Show section" : "Hide section"} title={s.hidden ? "Hidden from the resume" : "Shown on the resume"} onClick={() => onChange((x) => ({ ...x, hidden: !x.hidden }))}>{s.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          <button className="icon" aria-label="Delete section" onClick={onDelete}><Trash2 size={15} /></button>
        </span>
      </div>
      {open && (
        <div className="rb-card-body">
          <Input label="Section heading" value={s.title} onChange={(v) => onChange((x) => ({ ...x, title: v }))} />
          {s.items.map((it, n) => (
            <div key={it.id} className={`rb-item${it.hidden ? " is-hidden" : ""}`}>
              <div className="rb-item-head">
                <button className="rb-toggle" onClick={() => setOpenItem(openItem === it.id ? null : it.id)}>{it.title || it.subtitle || <em className="muted">Untitled</em>}</button>
                <span className="rb-actions">
                  <button className="icon" aria-label="Move up" disabled={n === 0} onClick={() => onChange((x) => ({ ...x, items: moveBy(x.items, n, -1) }))}><ChevronUp size={14} /></button>
                  <button className="icon" aria-label="Move down" disabled={n === s.items.length - 1} onClick={() => onChange((x) => ({ ...x, items: moveBy(x.items, n, 1) }))}><ChevronDown size={14} /></button>
                  <button className="icon" aria-label={it.hidden ? "Show entry" : "Hide entry"} onClick={() => setItem(it.id, { hidden: !it.hidden })}>{it.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  <button className="icon" aria-label="Delete entry" onClick={() => { if (confirmDanger("Delete this entry?")) onChange((x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) })); }}><Trash2 size={14} /></button>
                </span>
              </div>
              {openItem === it.id && <ItemForm type={s.type} item={it} onChange={(p) => setItem(it.id, p)} />}
            </div>
          ))}
          <button onClick={addItem}><Plus size={14} /> Add {def.label.toLowerCase()} entry</button>
        </div>
      )}
    </div>
  );
}

function ItemForm({ type, item, onChange }: { type: SectionType; item: ResumeItem; onChange: (p: Partial<ResumeItem>) => void }) {
  const L = SECTION_TYPES[type].labels;
  const has = (f: ItemField) => L[f] !== undefined;
  return (
    <div className="rb-item-form">
      {has("title") && <Input label={L.title!} value={item.title} onChange={(v) => onChange({ title: v })} />}
      {has("subtitle") && <Input label={L.subtitle!} value={item.subtitle} onChange={(v) => onChange({ subtitle: v })} />}
      {has("link") && <Input label={L.link!} value={item.link} placeholder="https://…" onChange={(v) => onChange({ link: v })} />}
      {has("dates") && <div className="rb-dates"><Input label="Start" value={item.start} placeholder="Feb 2020" onChange={(v) => onChange({ start: v })} /><Input label="End" value={item.end} placeholder="present" onChange={(v) => onChange({ end: v })} /></div>}
      {has("location") && <Input label={L.location!} value={item.location} onChange={(v) => onChange({ location: v })} />}
      {has("body") && <Input label={`${L.body} (one bullet per line)`} area rows={6} value={item.body} onChange={(v) => onChange({ body: v })} />}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="rb-field"><span>{label}</span>
      <div className="tabs">{options.map(([v, l]) => <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>
    </div>
  );
}

/** Slider with − / + buttons, like the reference builder. */
function Stepper({ label, value, min, max, step, unit, signed, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; signed?: boolean; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const shown = `${signed && value > 0 ? "+" : ""}${Number(value.toFixed(2))}${unit}`;
  return (
    <div className="rb-field"><span className="rb-step-label"><span>{label}</span><span className="muted">{shown}</span></span>
      <div className="rb-step">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        <button className="icon" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}><Minus size={14} /></button>
        <button className="icon" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}><Plus size={14} /></button>
      </div>
    </div>
  );
}

const CUSTOM_GROUPS = ["Document", "Font size", "Spacing", "Entries", "Headings", "Font", "Colors"] as const;

function CustomizePanel({ data, onChange }: { data: ResumeData; onChange: (d: ResumeData) => void }) {
  const [group, setGroup] = useState<(typeof CUSTOM_GROUPS)[number]>("Document");
  const st = data.style;
  const set = (patch: Partial<ResumeStyle>) => onChange({ ...data, style: { ...st, ...patch } });
  return (
    <div className="rb-custom">
      <nav className="rb-subnav" aria-label="Customize">{CUSTOM_GROUPS.map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>)}</nav>
      <div className="rb-card"><div className="rb-card-body">
        {group === "Document" && <>
          <Seg label="Page format" value={st.pageFormat} options={[["A4", "A4"], ["Letter", "US Letter"]]} onChange={(v) => set({ pageFormat: v })} />
          <p className="muted small">When the print dialog opens, turn off “Headers and footers” so only the resume prints, and leave margins on Default.</p>
          <button onClick={() => onChange({ ...data, style: { ...DEFAULT_STYLE } })}>Reset all styling</button>
        </>}
        {group === "Font size" && <>
          <Stepper label="Base font size" value={st.baseSize} min={8} max={12} step={0.5} unit="pt" onChange={(v) => set({ baseSize: v })} />
          <Stepper label="Full name" value={st.nameSize} min={0} max={16} step={1} unit="pt" signed onChange={(v) => set({ nameSize: v })} />
          <Stepper label="Professional title" value={st.titleSize} min={0} max={8} step={1} unit="pt" signed onChange={(v) => set({ titleSize: v })} />
          <Stepper label="Section headings" value={st.headingSize} min={0} max={6} step={1} unit="pt" signed onChange={(v) => set({ headingSize: v })} />
          <Stepper label="Entry header" value={st.entrySize} min={0} max={4} step={1} unit="pt" signed onChange={(v) => set({ entrySize: v })} />
        </>}
        {group === "Spacing" && <>
          <Stepper label="Line height" value={st.lineHeight} min={1} max={1.6} step={0.05} unit="" onChange={(v) => set({ lineHeight: v })} />
          <Stepper label="Space between elements" value={st.spacing} min={0} max={16} step={1} unit="pt" onChange={(v) => set({ spacing: v })} />
          <Stepper label="Left & right margin" value={st.marginX} min={6} max={30} step={1} unit="mm" onChange={(v) => set({ marginX: v })} />
          <Stepper label="Top & bottom margin" value={st.marginY} min={6} max={30} step={1} unit="mm" onChange={(v) => set({ marginY: v })} />
        </>}
        {group === "Entries" && <>
          <Seg label="Structure" value={st.entryLayout} options={[["full", "Full width"], ["columns", "Columns"]]} onChange={(v) => set({ entryLayout: v })} />
          <Seg label="Date & location position" value={st.datePos} options={[["right", "Right"], ["left", "Left"]]} onChange={(v) => set({ datePos: v })} />
          <Seg label="Subtitle placement" value={st.subtitle} options={[["same", "Try same line"], ["below", "Below title"]]} onChange={(v) => set({ subtitle: v })} />
          <label className="toggle"><input type="checkbox" checked={st.twoColumnSkills} onChange={(e) => set({ twoColumnSkills: e.target.checked })} /> Skills in two columns</label>
        </>}
        {group === "Headings" && <>
          <Seg<HeadingStyle> label="Style" value={st.headingStyle} options={HEADING_STYLES} onChange={(v) => set({ headingStyle: v })} />
          <Seg label="Capitalization" value={st.caps} options={[["capitalize", "Capitalize"], ["uppercase", "Uppercase"]]} onChange={(v) => set({ caps: v })} />
        </>}
        {group === "Font" && <Seg<FontKey> label="Body font" value={st.font} options={(Object.keys(FONTS) as FontKey[]).map((k) => [k, FONTS[k].label])} onChange={(v) => set({ font: v })} />}
        {group === "Colors" && <div className="rb-field"><span>Accent colour (headings and rules)</span>
          <div className="rb-swatches">{ACCENTS.map((c) => <button key={c} aria-label={c} className={st.accent === c ? "on" : ""} style={{ background: c }} onClick={() => set({ accent: c })} />)}</div>
        </div>}
      </div></div>
    </div>
  );
}
