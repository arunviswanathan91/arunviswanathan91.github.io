import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { insert, insertMany, list, update } from "../../lib/db.ts";
import { go, href } from "../../lib/route.ts";
import { PAPER_STATUS, type Paper, type PaperStatus } from "../../lib/types.ts";
import { MultiPicker, useProjects } from "../../components/pickers.tsx";
import { TagInput } from "../../components/TagInput.tsx";
import { ErrorText, Field } from "../../components/ui.tsx";
import { lookupPaper, parseIdentifier, type PaperMeta } from "./lookup.ts";

/** Find an existing paper with the same DOI, arXiv id or PMID. */
async function findDuplicate(meta: PaperMeta, exceptId?: string): Promise<Paper | null> {
  for (const [col, val] of [["doi", meta.doi], ["arxiv_id", meta.arxiv_id], ["pmid", meta.pmid]] as const) {
    if (!val) continue;
    const [hit] = await list<Paper>("papers", { eq: { [col]: val } });
    if (hit && hit.id !== exceptId) return hit;
  }
  return null;
}

/** Add a paper (with identifier lookup) or edit an existing paper's details. */
export function PaperForm({ paper, presetProjectId, onDone }: { paper?: Paper; presetProjectId?: string; onDone: () => void }) {
  const [ident, setIdent] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const [title, setTitle] = useState(paper?.title ?? "");
  const [authors, setAuthors] = useState((paper?.authors ?? []).join("\n"));
  const [year, setYear] = useState(paper?.year ? String(paper.year) : "");
  const [publication, setPublication] = useState(paper?.publication ?? "");
  const [abstract, setAbstract] = useState(paper?.abstract ?? "");
  const [doi, setDoi] = useState(paper?.doi ?? "");
  const [arxiv, setArxiv] = useState(paper?.arxiv_id ?? "");
  const [pmid, setPmid] = useState(paper?.pmid ?? "");
  const [url, setUrl] = useState(paper?.url ?? "");
  const [status, setStatus] = useState<PaperStatus>(paper?.status ?? "to_read");
  const [priority, setPriority] = useState(paper?.priority ?? "medium");
  const [tags, setTags] = useState<string[]>(paper?.tags ?? []);
  const [projectIds, setProjectIds] = useState<string[]>(presetProjectId ? [presetProjectId] : []);
  const [duplicate, setDuplicate] = useState<Paper | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { projects } = useProjects();

  function apply(m: PaperMeta) {
    if (m.title) setTitle(m.title);
    if (m.authors?.length) setAuthors(m.authors.join("\n"));
    if (m.year) setYear(String(m.year));
    if (m.publication) setPublication(m.publication);
    if (m.abstract) setAbstract(m.abstract);
    if (m.doi) setDoi(m.doi);
    if (m.arxiv_id) setArxiv(m.arxiv_id);
    if (m.pmid) setPmid(m.pmid);
    if (m.url) setUrl(m.url);
  }

  async function lookup() {
    setLooking(true);
    setLookupMsg("");
    setDuplicate(null);
    try {
      const parsed = parseIdentifier(ident);
      if (parsed) {
        const dup = await findDuplicate({ [parsed.kind === "arxiv" ? "arxiv_id" : parsed.kind]: parsed.id });
        if (dup) {
          setDuplicate(dup);
          return;
        }
      }
      const meta = await lookupPaper(ident);
      apply(meta);
      setDuplicate(await findDuplicate(meta));
      setLookupMsg("Details filled in — check and edit anything before saving.");
    } catch (e) {
      setLookupMsg(`${(e as Error).message}. You can enter the details by hand.`);
    } finally {
      setLooking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = {
      title: title.trim(),
      authors: authors.split(/\n|;/).map((a) => a.trim()).filter(Boolean),
      year: year ? Number(year) : null,
      publication: publication.trim() || null,
      abstract: abstract.trim() || null,
      doi: doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "") || null,
      arxiv_id: arxiv.trim() || null,
      pmid: pmid.trim() || null,
      url: url.trim() || null,
      status,
      priority,
      tags,
    };
    try {
      const dup = await findDuplicate(values, paper?.id);
      if (dup) {
        setDuplicate(dup);
        throw new Error("This paper is already in your library");
      }
      if (paper) {
        await update("papers", paper.id, values);
        onDone();
      } else {
        const row = await insert<Paper>("papers", values);
        await insertMany("project_papers", projectIds.map((project_id) => ({ project_id, paper_id: row.id })));
        onDone();
        go(`papers/${row.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {!paper && (
        <div className="lookup">
          <label className="field">
            <span>DOI, arXiv id or PubMed id</span>
            <div className="row">
              <input
                autoFocus
                value={ident}
                placeholder="10.1038/… · 2401.12345 · 34265844 · or paste a link"
                onChange={(e) => setIdent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void lookup())}
              />
              <button type="button" onClick={() => void lookup()} disabled={looking || !ident.trim()}>
                <Search size={15} /> {looking ? "Looking up…" : "Look up"}
              </button>
            </div>
          </label>
          {lookupMsg && <p className="small muted">{lookupMsg}</p>}
        </div>
      )}
      {duplicate && (
        <p className="notice">
          Already in your library: <a href={href(`papers/${duplicate.id}`)} onClick={onDone}>{duplicate.title}</a>. Link it to more projects from its page instead of adding it again.
        </p>
      )}
      <Field label="Title">
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Authors (one per line)">
        <textarea rows={3} value={authors} onChange={(e) => setAuthors(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Year">
          <input type="number" min={1600} max={2200} value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        <Field label="Journal / venue">
          <input value={publication} onChange={(e) => setPublication(e.target.value)} />
        </Field>
        <Field label="DOI">
          <input value={doi} onChange={(e) => setDoi(e.target.value)} />
        </Field>
        <Field label="arXiv id">
          <input value={arxiv} onChange={(e) => setArxiv(e.target.value)} />
        </Field>
        <Field label="PubMed id">
          <input value={pmid} inputMode="numeric" pattern="[0-9]*" onChange={(e) => setPmid(e.target.value)} />
        </Field>
        <Field label="URL">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Reading status">
          <select value={status} onChange={(e) => setStatus(e.target.value as PaperStatus)}>
            {Object.entries(PAPER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Paper["priority"])}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>
      <Field label="Abstract">
        <textarea rows={5} value={abstract} onChange={(e) => setAbstract(e.target.value)} />
      </Field>
      <Field label="Tags">
        <TagInput value={tags} onChange={setTags} />
      </Field>
      {!paper && (
        <Field label="Projects">
          <MultiPicker
            selected={projectIds}
            options={projects.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, label: p.title }))}
            onAdd={(id) => setProjectIds([...projectIds, id])}
            onRemove={(id) => setProjectIds(projectIds.filter((x) => x !== id))}
            placeholder="Link to a project…"
          />
        </Field>
      )}
      <ErrorText error={error} />
      <div className="form-actions">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : paper ? "Save" : "Add paper"}</button>
      </div>
    </form>
  );
}

