import { useEffect, useRef, useState } from "react";
import { ask } from "../../../lib/dialogs.tsx";
import { ArrowLeft, Search, ChevronDown, ChevronRight, ChevronUp, Download, Eye, EyeOff, Minus, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { getOne, update, useLoad } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { Modal } from "../../components/Modal.tsx";
import { ErrorText, SaveIndicator, Loading } from "../../components/ui.tsx";
import {
  ACCENTS, ACCENT_TARGETS, DEFAULT_STYLE, FONTS, HEADING_STYLES, LAYOUT_TYPES, SECTION_ORDER, layoutFor, SECTION_TYPES, moveBy, newItem, newSection, normalizeResume, pdfFilename,
  type DisplayMode, type FontKey, type HeadingStyle, type SectionLayout, type ItemField, type ResumeData, type ResumeStyle, type ResumeItem, type ResumeSection, type SectionType,
} from "./model.ts";
import { ResumePreview } from "./ResumePreview.tsx";
import { loadResumeFonts } from "./fonts.ts";
import { itemFromMeta } from "./doi.ts";
import { lookupPaper } from "../papers/lookup.ts";

interface Row { id: string; title: string; data: unknown }

export function ResumeEditor({ id }: { id: string }) {
  useEffect(loadResumeFonts, []); // the font picker shows each typeface by name
  const { data: row, error, loading } = useLoad(() => getOne<Row>("resumes", id), [id]);
  if (error) return <ErrorText error={error} />;
  if (loading && !row) return <Loading rows={8} />;
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

  // The PDF is generated directly (real text, embedded fonts, page numbers); no browser print dialog.
  const [making, setMaking] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const download = async () => {
    if (making) return;
    setMaking(true); setPdfError("");
    try {
      await flush();
      const { downloadResumePdf } = await import("./pdf/make.tsx"); // loaded on first use: it is a large library
      await downloadResumePdf(data, title);
    } catch (e) { setPdfError((e as Error).message || "Could not create the PDF"); }
    finally { setMaking(false); }
  };
  // "Download PDF" in the gallery opens the editor with ?print=1 and starts the download.
  const autoPrint = useRef(/[?&]print=1\b/.test(window.location.hash));
  useEffect(() => {
    if (!autoPrint.current) return;
    autoPrint.current = false;
    history.replaceState(null, "", window.location.hash.replace(/[?&]print=1\b/, ""));
    void download();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <button className="primary" disabled={making} onClick={() => void download()}><Download size={15} /> {making ? "Creating PDF…" : "Download PDF"}</button>
      </div>
      {pdfError && <ErrorText error={`PDF failed: ${pdfError}. Check your connection (fonts are fetched when the PDF is made) and try again.`} />}
      <div className="rb-body">
        <div className="rb-editor">
          {tab === "content" ? (
            <>
              <ProfileCard data={data} onChange={edit} />
              {data.sections.map((s, n) => (
                <SectionCard key={s.id} s={s} first={n === 0} last={n === data.sections.length - 1}
                  onChange={(f) => setSection(s.id, f)}
                  onMove={(d) => edit({ ...data, sections: moveBy(data.sections, n, d) })}
                  onDelete={async () => { if ((await ask(`Delete the “${s.title}” section and its ${s.items.length} entries?`))) edit({ ...data, sections: data.sections.filter((x) => x.id !== s.id) }); }} />
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
        <button className="rb-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong className="rb-ell">{s.title || def.label}</strong><span className="muted small">{s.items.length}</span></button>
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
                <button className="rb-toggle" onClick={() => setOpenItem(openItem === it.id ? null : it.id)} title={it.title || it.subtitle}><span className="rb-ell">{it.title || it.subtitle || <em className="muted">Untitled</em>}</span></button>
                <span className="rb-actions">
                  <button className="icon" aria-label="Move up" disabled={n === 0} onClick={() => onChange((x) => ({ ...x, items: moveBy(x.items, n, -1) }))}><ChevronUp size={14} /></button>
                  <button className="icon" aria-label="Move down" disabled={n === s.items.length - 1} onClick={() => onChange((x) => ({ ...x, items: moveBy(x.items, n, 1) }))}><ChevronDown size={14} /></button>
                  <button className="icon" aria-label={it.hidden ? "Show entry" : "Hide entry"} onClick={() => setItem(it.id, { hidden: !it.hidden })}>{it.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  <button className="icon" aria-label="Delete entry" onClick={async () => { if ((await ask("Delete this entry?"))) onChange((x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) })); }}><Trash2 size={14} /></button>
                </span>
              </div>
              {openItem === it.id && <ItemForm type={s.type} item={it} onChange={(p) => setItem(it.id, p)} />}
            </div>
          ))}
          {s.type === "publications" && (
            <DoiFetch label="Add a publication from DOI, PubMed id or arXiv id" onFill={(p) => {
              const it = newItem(p);
              if (it.link && s.items.some((x) => x.link === it.link)) return; // already listed
              onChange((x) => ({ ...x, items: [...x.items, it] })); setOpenItem(it.id);
            }} />
          )}
          <button onClick={addItem}><Plus size={14} /> Add {def.label.toLowerCase()} entry</button>
        </div>
      )}
    </div>
  );
}

/** "Fetch from DOI": same lookup as adding a paper (Crossref, Europe PMC, DataCite). */
function DoiFetch({ onFill, label = "Fetch from DOI, PubMed id or arXiv id" }: { onFill: (item: Partial<ResumeItem>) => void; label?: string }) {
  const [ident, setIdent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true); setMsg("");
    try {
      onFill(itemFromMeta(await lookupPaper(ident)));
      setIdent(""); setMsg("Details filled in. Check and edit anything before downloading.");
    } catch (e) { setMsg(`${(e as Error).message}. You can enter the details by hand.`); }
    finally { setBusy(false); }
  };
  return (
    <div className="lookup">
      <label className="rb-field"><span>{label}</span>
        <div className="rb-link-row rb-doi-row">
          <input value={ident} placeholder="10.1038/… · 34265844 · 2401.12345 · or paste a link" onChange={(e) => setIdent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void run())} />
          <button type="button" onClick={() => void run()} disabled={busy || !ident.trim()}><Search size={14} /> {busy ? "Looking up…" : "Fetch"}</button>
        </div>
      </label>
      {msg && <p className="small muted">{msg}</p>}
    </div>
  );
}

function ItemForm({ type, item, onChange }: { type: SectionType; item: ResumeItem; onChange: (p: Partial<ResumeItem>) => void }) {
  const L = SECTION_TYPES[type].labels;
  const has = (f: ItemField) => L[f] !== undefined;
  return (
    <div className="rb-item-form">
      {type === "publications" && <DoiFetch onFill={(p) => onChange(p)} />}
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

/** A scrollable list where every font is shown in its own typeface. */
function FontList<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <div className="rb-field"><span>{label}</span>
      <div className="rb-fontlist" role="listbox" aria-label={label}>
        {options.map(([k, name, stack]) => (
          <button key={k} role="option" aria-selected={value === k} className={value === k ? "on" : ""} style={{ fontFamily: stack }} onClick={() => onChange(k)}>
            <span>{name}</span>{value === k && <span aria-hidden>✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionsPanel({ data, onChange }: { data: ResumeData; onChange: (d: ResumeData) => void }) {
  const st = data.style;
  const set = (patch: Partial<ResumeStyle>) => onChange({ ...data, style: { ...st, ...patch } });
  const setLayout = (type: SectionType, patch: Partial<SectionLayout>) => set({ layouts: { ...st.layouts, [type]: { ...st.layouts[type], ...patch } } });
  const has = (t: SectionType) => data.sections.some((s) => s.type === t && s.items.length > 0);
  return (
    <>
      <div className="rb-opt"><h4>Summary</h4>
        <label className="toggle"><input type="checkbox" checked={st.summaryInHeader} onChange={(e) => set({ summaryInHeader: e.target.checked })} /> Display summary as part of header</label>
        <label className="toggle"><input type="checkbox" checked={st.summaryHeading} disabled={st.summaryInHeader} onChange={(e) => set({ summaryHeading: e.target.checked })} /> Show summary heading</label>
      </div>
      <div className="rb-opt"><h4>Education</h4>
        <Seg label="Title & subtitle order" value={st.swapEducation ? "b" : "a"} options={[["a", "Degree, School"], ["b", "School, Degree"]]} onChange={(v) => set({ swapEducation: v === "b" })} />
      </div>
      <div className="rb-opt"><h4>Work Experience</h4>
        <Seg label="Title / subtitle order" value={st.swapExperience ? "b" : "a"} options={[["a", "Job Title – Employer"], ["b", "Employer – Job Title"]]} onChange={(v) => set({ swapExperience: v === "b" })} />
        <label className="toggle"><input type="checkbox" checked={st.groupPromotions} onChange={(e) => set({ groupPromotions: e.target.checked })} /> Group promotions (consecutive roles at one employer share a heading)</label>
      </div>
      {LAYOUT_TYPES.map((t) => {
        const L = layoutFor(st, t);
        return (
          <div className="rb-opt" key={t}><h4>{SECTION_TYPES[t].label}</h4>
            {!has(t) ? <p className="muted small">To see design options, add {SECTION_TYPES[t].label.toLowerCase()}.</p> : <>
              <Seg<DisplayMode> label="Display" value={L.mode} options={[["grid", "Grid"], ["rows", "Rows"], ["compact", "Compact"], ["bubble", "Bubble"]]} onChange={(v) => setLayout(t, { mode: v })} />
              {L.mode === "grid" && <Seg label="Columns" value={String(L.cols)} options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(v) => setLayout(t, { cols: Number(v) as SectionLayout["cols"] })} />}
              {L.mode === "compact" && <Seg label="Separator" value={L.sep} options={[["bullet", "Bullet"], ["pipe", "Pipe"], ["comma", "Comma"]]} onChange={(v) => setLayout(t, { sep: v })} />}
              {L.mode !== "grid" && <Seg label="Subinfo style" value={L.subinfo} options={[["colon", ": Colon"], ["dash", "– Dash"], ["bracket", "( ) Bracket"]]} onChange={(v) => setLayout(t, { subinfo: v })} />}
            </>}
          </div>
        );
      })}
    </>
  );
}

const CUSTOM_GROUPS = ["Document", "Font size", "Spacing", "Entries", "Headings", "Font", "Colors", "Header", "Sections"] as const;

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
          <p className="muted small">The PDF is created directly: real selectable text, your chosen font embedded, and page numbers if the footer is on. Fonts are fetched from the web when you press Download.</p>
          <label className="toggle"><input type="checkbox" checked={st.footer} onChange={(e) => set({ footer: e.target.checked })} /> Footer with your email and page numbers (PDF)</label>
          <button onClick={() => onChange({ ...data, style: { ...DEFAULT_STYLE, accentOn: { ...DEFAULT_STYLE.accentOn } } })}>Reset all styling</button>
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
        </>}
        {group === "Headings" && <>
          <Seg<HeadingStyle> label="Style" value={st.headingStyle} options={HEADING_STYLES} onChange={(v) => set({ headingStyle: v })} />
          <Seg label="Capitalization" value={st.caps} options={[["capitalize", "Capitalize"], ["uppercase", "Uppercase"]]} onChange={(v) => set({ caps: v })} />
        </>}
        {group === "Font" && <>
          <FontList<FontKey> label="Body font" value={st.font} options={(Object.keys(FONTS) as FontKey[]).map((k) => [k, FONTS[k].label, FONTS[k].stack])} onChange={(v) => set({ font: v })} />
          <FontList<FontKey | "same"> label="Name font" value={st.nameFont} options={[["same", "Same as body font", FONTS[st.font].stack], ...(Object.keys(FONTS) as FontKey[]).map((k): [FontKey, string, string] => [k, FONTS[k].label, FONTS[k].stack])]} onChange={(v) => set({ nameFont: v })} />
        </>}
        {group === "Sections" && <SectionsPanel data={data} onChange={onChange} />}
        {group === "Header" && <>
          <Seg label="Text alignment" value={st.align} options={[["left", "Left"], ["center", "Center"]]} onChange={(v) => set({ align: v })} />
          <Seg label="Job title" value={st.headlinePos} options={[["inline", "Next to name"], ["below", "Below name"]]} onChange={(v) => set({ headlinePos: v })} />
          <Seg label="Details separator" value={st.separator} options={[["bar", "Bar"], ["bullet", "Bullet"], ["none", "None"]]} onChange={(v) => set({ separator: v })} />
        </>}
        {group === "Colors" && <div className="rb-field"><span>Accent colour (headings and rules)</span>
          <div className="rb-swatches">{ACCENTS.map((c) => <button key={c} aria-label={c} className={st.accent === c ? "on" : ""} style={{ background: c }} onClick={() => set({ accent: c })} />)}<input type="color" aria-label="Custom colour" value={st.accent} onChange={(e) => set({ accent: e.target.value })} /></div>
        </div>}
        {group === "Colors" && <div className="rb-field"><span>Apply accent colour to</span>
          <div className="rb-checks">{ACCENT_TARGETS.map(([k, l]) => <label key={k} className="toggle"><input type="checkbox" checked={st.accentOn[k]} onChange={(e) => set({ accentOn: { ...st.accentOn, [k]: e.target.checked } })} /> {l}</label>)}</div>
        </div>}
      </div></div>
    </div>
  );
}
