import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownWideNarrow, ChevronDown, ChevronRight, ChevronUp, ExternalLink, Eye, History, Plus, Search, Trash2, Upload } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { currentUserId, list, onLoadCacheClear, sb, upsert, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { ErrorText, Loading, PageHeader } from "../../components/ui.tsx";
import { PublicationPicker, isListed, publicationLink, type OwnPublication } from "../../components/PublicationPicker.tsx";
import { lookupPaper } from "../papers/lookup.ts";
import { moveBy } from "../resumes/model.ts";
import {
  BLANK_ENTRY, BLANK_PRESENTATION, BLANK_PUBLICATION, LINK_KEYS, LINK_LABELS, cleanSite, normalizeSite, siteProblems,
  type SiteContent, type SitePublication,
} from "./model.ts";

interface Row { user_id: string; content: unknown; previous: unknown; updated_at: string }
const BUCKET = "site";
const SITE_URL = `${window.location.origin}/`;

const setupError = (error: string) =>
  /ws_site|schema cache|does not exist/i.test(error) ? "This page needs its database table: run supabase/website.sql in the Supabase SQL Editor, then reload." : error;

// Edits not yet published survive moving to another page of the workspace and back.
let kept: SiteContent | null = null;
// The public page reads this (only at ?preview=1, in this browser) to show edits before they are published.
const PREVIEW_KEY = "site-content:preview";
const forgetPreview = () => { try { localStorage.removeItem(PREVIEW_KEY); } catch { /* storage blocked */ } };
onLoadCacheClear(() => { kept = null; forgetPreview(); }); // signing out: the next account must not inherit them

export function WebsiteView() {
  const { data, error } = useLoad(async () => {
    const [rows, uid] = await Promise.all([list<Row>("site"), currentUserId()]);
    return { row: rows[0] ?? null, uid };
  }, []);
  const opened = data;
  return (
    <section className={!opened && !error ? "is-loading" : undefined} aria-busy={(!opened && !error) || undefined}>
      {!opened ? (
        <>
          <PageHeader section="website" title="Website" subtitle="What your public profile page says." />
          {error ? <ErrorText error={setupError(error)} /> : <Loading rows={8} />}
        </>
      ) : <Editor row={opened.row} uid={opened.uid} />}
    </section>
  );
}

function Editor({ row, uid }: { row: Row | null; uid: string }) {
  // A row with nothing in it only reserves the website for its owner: nothing is published yet.
  const live = (r: Row | null) => (r && r.content && Object.keys(r.content as object).length ? { json: JSON.stringify(cleanSite(normalizeSite(r.content))), at: r.updated_at } : null);
  const [published, setPublished] = useState(() => live(row));
  const [draft, setDraft] = useState<SiteContent>(() => kept ?? normalizeSite(row?.content));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const readOnly = !!row && row.user_id !== uid;

  const clean = cleanSite(draft);
  const dirty = JSON.stringify(clean) !== published?.json;
  const set = (patch: Partial<SiteContent>) => { const next = { ...draft, ...patch }; kept = next; setDraft(next); };

  // A newer published copy arrived (first load showed a saved one, or it was published from
  // another device): take it, unless there are edits here that it would wipe out.
  useEffect(() => {
    if (kept) return;
    setPublished(live(row));
    setDraft(normalizeSite(row?.content));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.updated_at]);

  // Keep the preview tab (if one is open) showing exactly what Publish would send.
  const cleanJson = JSON.stringify(clean);
  useEffect(() => {
    try { localStorage.setItem(PREVIEW_KEY, cleanJson); } catch { /* storage blocked: preview shows the live page */ }
  }, [cleanJson]);

  const previous = row?.previous && Object.keys(row.previous as object).length ? normalizeSite(row.previous) : null;
  const canRestore = !readOnly && !!previous && JSON.stringify(cleanSite(previous)) !== cleanJson;
  async function restorePrevious() {
    if (!previous || !(await ask("Load the version that was live before your last publish? Nothing changes on the site until you publish it."))) return;
    kept = previous; setDraft(previous); setProblems([]);
  }

  useEffect(() => {
    if (!dirty || !published) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, published]);

  async function publish() {
    const found = siteProblems(draft);
    setProblems(found);
    if (found.length) return;
    setBusy(true); setError("");
    try {
      await upsert("site", { id: true, content: clean }, "id");
      setPublished({ json: JSON.stringify(clean), at: new Date().toISOString() });
      kept = null;
      void pruneFiles(uid, clean).catch(() => undefined); // tidy-up only: a leftover file harms nothing
    } catch (e) {
      const msg = (e as Error).message;
      setError(/row-level security/i.test(msg) ? "This website belongs to another account, so it cannot be changed from this one." : setupError(msg));
    } finally { setBusy(false); }
  }

  async function discard() {
    if (!(await ask("Discard the changes you have not published?"))) return;
    kept = null;
    setDraft(normalizeSite(published ? JSON.parse(published.json) : undefined));
    setProblems([]);
  }

  const status = readOnly ? "Managed from another account"
    : !published ? "Not published yet: the site shows the text built into the page"
    : dirty ? "Changes not published" : `Live · published ${fmtDate(published.at, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <>
      <PageHeader section="website" title="Website" subtitle="What your public profile page says. Nothing changes on the site until you publish."
        actions={
          <span className="row">
            {canRestore && <button onClick={() => void restorePrevious()} disabled={busy} title="Load the version that was live before your last publish"><History size={15} /> Previous version</button>}
            {!readOnly && <a className="button-link" href={`${SITE_URL}?preview=1`} target="site-preview" title="Opens your site with these edits. It updates as you type and is visible only to you."><Eye size={15} /> Preview</a>}
            <a className="button-link" href={SITE_URL} target="_blank" rel="noopener"><ExternalLink size={15} /> View site</a>
          </span>
        } />
      <fieldset className="site-editor" disabled={readOnly || busy}>
        <Card title="About" hint="The top of the page: the line under your name, where you are, and your bio.">
          <Input label="Tagline" value={draft.tagline} onChange={(v) => set({ tagline: v })} />
          <Input label="Location" value={draft.location} onChange={(v) => set({ location: v })} />
          <Input label="Bio (leave an empty line between paragraphs)" area rows={7} value={draft.bio} onChange={(v) => set({ bio: v })} />
        </Card>

        <Card title="Photo and CV" hint="Upload a new file to replace the one on the site. It goes live when you publish.">
          <div className="site-files">
            <FilePick label="Profile photo" accept="image/jpeg,image/png,image/webp" kind="photo" uid={uid} url={draft.photo_url}
              onChange={(photo_url) => set({ photo_url })} onError={setError} />
            <FilePick label="CV (PDF)" accept="application/pdf" kind="cv" uid={uid} url={draft.cv_url}
              onChange={(cv_url) => set({ cv_url })} onError={setError} />
          </div>
        </Card>

        <Card title="Research interests" hint="One per line. Each becomes a tag.">
          <Lines label="Interests" value={draft.interests} onChange={(interests) => set({ interests })} />
        </Card>

        <Card title="Publications" hint="Shown in this order. Wrap your name in **two stars** to make it bold.">
          <PublicationLookup onFound={(p) => set({ publications: [p, ...draft.publications] })} />
          <PublicationPicker existing={draft.publications.map((p) => ({ link: p.url, title: p.title }))}
            onPick={(rows) => set({ publications: [...rows.filter((p) => !isListed(p, draft.publications.map((x) => ({ link: x.url, title: x.title })))).map(siteFromOwn), ...draft.publications] })} />
          {draft.publications.some((p, n) => n > 0 && yearOf(p) > yearOf(draft.publications[n - 1])) && (
            <button type="button" className="site-add" onClick={() => set({ publications: [...draft.publications].sort((a, b) => yearOf(b) - yearOf(a)) })}><ArrowDownWideNarrow size={14} /> Sort newest first</button>
          )}
          <Rows items={draft.publications} blank={BLANK_PUBLICATION} noun="publication" onChange={(publications) => set({ publications })}
            summary={(p) => [p.year, p.title].filter(Boolean).join(" · ")}
            fields={[["title", "Title", { area: true }], ["authors", "Authors", { placeholder: "Smith J, **Viswanathan A**, Lee K." }], ["venue", "Journal, volume, pages"], ["year", "Year"], ["url", "Link (optional)", { placeholder: "https://…" }], ["badge", "Badge (optional)", { placeholder: "Preprint" }]]} />
        </Card>

        <Card title="Conference presentations">
          <Rows items={draft.presentations} blank={BLANK_PRESENTATION} noun="presentation" onChange={(presentations) => set({ presentations })}
            summary={(p) => [p.year, p.title].filter(Boolean).join(" · ")}
            fields={[["title", "Title"], ["venue", "Where"], ["year", "Year"], ["url", "Link (optional)", { placeholder: "https://…" }], ["note", "Note (optional)", { placeholder: "Travel award, oral presentation…" }]]} />
        </Card>

        <Card title="Honors and awards" hint="One per line.">
          <Lines label="Awards" value={draft.awards} onChange={(awards) => set({ awards })} />
        </Card>

        <Card title="Experience">
          <Rows items={draft.experience} blank={BLANK_ENTRY} noun="position" onChange={(experience) => set({ experience })}
            summary={(e) => [e.role, e.date].filter(Boolean).join(" · ")}
            fields={[["role", "Role"], ["org", "Organisation"], ["date", "Dates", { placeholder: "2022 – present" }]]} />
        </Card>

        <Card title="Education">
          <Rows items={draft.education} blank={BLANK_ENTRY} noun="degree" onChange={(education) => set({ education })}
            summary={(e) => [e.role, e.date].filter(Boolean).join(" · ")}
            fields={[["role", "Degree"], ["org", "Institution"], ["date", "Dates", { placeholder: "2014 – 2016" }]]} />
        </Card>

        <Card title="Contact and profiles" hint="The first email is the one behind the envelope icon. Leave a profile empty to hide its icon.">
          <Lines label="Email addresses (one per line)" rows={2} value={draft.emails} onChange={(emails) => set({ emails })} />
          <Input label="Address" value={draft.address} onChange={(v) => set({ address: v })} />
          <div className="site-grid">
            {LINK_KEYS.map((k) => (
              <Input key={k} label={LINK_LABELS[k]} placeholder="https://…" value={draft.links[k]} onChange={(v) => set({ links: { ...draft.links, [k]: v } })} />
            ))}
          </div>
        </Card>
      </fieldset>

      <div className="site-bar" role="region" aria-label="Publish">
        <div className="site-bar-text">
          <span className={`site-status${dirty && published ? " dirty" : ""}`} role="status">{busy ? "Publishing…" : status}</span>
          {problems.map((p) => <p key={p} className="error small" role="alert">{p}</p>)}
          <ErrorText error={error} />
        </div>
        {!readOnly && (
          <span className="row">
            {dirty && published && <button onClick={() => void discard()} disabled={busy}>Discard</button>}
            <button className="primary" onClick={() => void publish()} disabled={busy || !dirty}>{published ? "Publish changes" : "Publish"}</button>
          </span>
        )}
      </div>
    </>
  );
}

/** A manuscript from the Publications tracker as a website entry. Authors and year stay to be typed in. */
const siteFromOwn = (p: OwnPublication): SitePublication => ({
  year: "", authors: "", title: p.title ?? "", venue: p.venue ?? "", url: publicationLink(p),
  badge: p.stage === "Published" ? "" : p.stage === "Accepted" ? "Accepted" : p.stage === "Under Review" || p.stage === "Revision Requested" ? "Under review" : "In preparation",
});

const yearOf = (p: SitePublication) => Number(p.year.match(/\d{4}/)?.[0] ?? 0);

/** Remove uploaded files the published page no longer points at. */
async function pruneFiles(uid: string, c: SiteContent) {
  const store = sb().storage.from(BUCKET);
  const { data } = await store.list(uid);
  const stale = (data ?? []).map((f) => `${uid}/${f.name}`).filter((path) => !c.cv_url.includes(path) && !c.photo_url.includes(path));
  if (stale.length) await store.remove(stale);
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rb-card site-card">
      <div className="site-card-head"><h2>{title}</h2>{hint && <p className="muted small">{hint}</p>}</div>
      <div className="rb-card-body">{children}</div>
    </div>
  );
}

function Input({ label, value, onChange, area, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; rows?: number; placeholder?: string }) {
  return (
    <label className="rb-field">
      <span>{label}</span>
      {area ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

/** A list of short texts, typed one per line. */
function Lines({ label, value, onChange, rows }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  return (
    <label className="rb-field">
      <span className="sr-only">{label}</span>
      <textarea aria-label={label} rows={rows ?? Math.max(3, value.length + 1)} value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
    </label>
  );
}

type FieldDef<T> = [keyof T & string, string, { area?: boolean; placeholder?: string }?];

/** Entries with several fields each: reorder, edit in place, add and delete. */
function Rows<T extends object>({ items, blank, fields, summary, noun, onChange }: {
  items: T[]; blank: T; fields: FieldDef<T>[]; summary: (item: T) => string; noun: string; onChange: (items: T[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (n: number, d: number) => { onChange(moveBy(items, n, d)); setOpen(open === n ? n + d : open === n + d ? n : open); };
  return (
    <>
      {items.map((item, n) => {
        const text = summary(item);
        return (
          <div key={n} className="rb-item">
            <div className="rb-item-head">
              <button type="button" className="rb-toggle" aria-expanded={open === n} onClick={() => setOpen(open === n ? null : n)} title={text}>
                {open === n ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span className="rb-ell">{text || <em className="muted">New {noun}</em>}</span>
              </button>
              <span className="rb-actions">
                <button type="button" className="icon" aria-label="Move up" disabled={n === 0} onClick={() => move(n, -1)}><ChevronUp size={14} /></button>
                <button type="button" className="icon" aria-label="Move down" disabled={n === items.length - 1} onClick={() => move(n, 1)}><ChevronDown size={14} /></button>
                <button type="button" className="icon" aria-label={`Delete ${noun}`} onClick={async () => {
                  if (text && !(await ask(`Remove “${text.slice(0, 80)}” from the website?`))) return;
                  onChange(items.filter((_, k) => k !== n)); setOpen(null);
                }}><Trash2 size={14} /></button>
              </span>
            </div>
            {open === n && (
              <div className="rb-item-form">
                {fields.map(([key, label, opts]) => (
                  <Input key={key} label={label} area={opts?.area} placeholder={opts?.placeholder} value={item[key] as string}
                    onChange={(v) => onChange(items.map((x, k) => (k === n ? { ...x, [key]: v } : x)))} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="site-add" onClick={() => { onChange([...items, { ...blank }]); setOpen(items.length); }}><Plus size={14} /> Add {noun}</button>
    </>
  );
}

/** Fill a new publication from its DOI, PubMed id or arXiv id. */
function PublicationLookup({ onFound }: { onFound: (p: SitePublication) => void }) {
  const [ident, setIdent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true); setMsg("");
    try {
      const m = await lookupPaper(ident);
      onFound({
        year: m.year ? String(m.year) : "", authors: (m.authors ?? []).join(", "), title: m.title ?? "",
        venue: m.publication ?? "", url: m.url ?? (m.doi ? `https://doi.org/${m.doi}` : ""), badge: m.arxiv_id ? "Preprint" : "",
      });
      setIdent(""); setMsg("Added at the top of the list. Check the authors and journal line before publishing.");
    } catch (e) { setMsg(`${(e as Error).message}. You can add it by hand below.`); }
    finally { setBusy(false); }
  };
  return (
    <div className="lookup">
      <label className="rb-field"><span>Add a publication from its DOI, PubMed id or arXiv id</span>
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

function FilePick({ label, accept, kind, uid, url, onChange, onError }: {
  label: string; accept: string; kind: "photo" | "cv"; uid: string; url: string; onChange: (url: string) => void; onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); onError("");
    try {
      if (!accept.split(",").includes(file.type)) throw new Error(kind === "cv" ? "The CV must be a PDF" : "The photo must be a JPEG, PNG or WebP image");
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB`);
      const ext = kind === "cv" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${uid}/${kind}-${Date.now()}.${ext}`; // a new name each time: browsers keep the old file for a long while
      const store = sb().storage.from(BUCKET);
      const up = await store.upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (up.error) throw new Error(/bucket not found/i.test(up.error.message) ? "Uploads need the latest database setup: run supabase/website.sql in the Supabase SQL Editor." : up.error.message);
      onChange(store.getPublicUrl(path, kind === "cv" ? { download: "Arun_Viswanathan_CV.pdf" } : undefined).data.publicUrl);
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="site-file">
      {kind === "photo" && <img src={url || `${SITE_URL}assets/img/profile.jpg`} alt="" />}
      <div>
        <strong>{label}</strong>
        <p className="muted small">{url ? <a href={url} target="_blank" rel="noopener">Uploaded file</a> : "The file that ships with the site"}</p>
        <span className="row">
          <button type="button" onClick={() => input.current?.click()} disabled={busy}><Upload size={14} /> {busy ? "Uploading…" : "Upload new"}</button>
          {url && <button type="button" onClick={() => onChange("")}>Use the original</button>}
        </span>
        <input ref={input} type="file" hidden accept={accept} onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}
