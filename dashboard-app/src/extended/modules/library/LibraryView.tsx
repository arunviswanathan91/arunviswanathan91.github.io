import { Pin, Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { href, setQuery, type Route } from "../../lib/route.ts";
import { SECTIONS } from "../../lib/sections.ts";
import type { LibraryEntry, LibraryKind, LibraryVersion } from "../../lib/types.ts";
import { projectName, useProjects } from "../../components/pickers.tsx";
import { TagList, useAllTags } from "../../components/TagInput.tsx";
import { Badge, Empty, ErrorText, PageHeader, SearchBox, Select } from "../../components/ui.tsx";
import { noteExcerpt } from "../notes/NoteRows.tsx";
import { createEntry } from "./create.ts";
import { LIBRARY, sortEntries } from "./logic.ts";

const SUBTITLE: Record<LibraryKind, string> = {
  protocol: "Your protocols, kept in versions: the steps, reagents and troubleshooting, and which experiments used which version.",
  code: "Scripts and snippets worth keeping, in versions: the code, what it needs and how to run it.",
};

/** The list of protocols, or of code, depending on `kind`. */
export function LibraryView({ kind, route }: { kind: LibraryKind; route: Route }) {
  const L = LIBRARY[kind];
  const sub = route.query.get(L.field) ?? "";
  const project = route.query.get("project") ?? "";
  const tag = route.query.get("tag") ?? "";
  const search = route.query.get("q") ?? "";
  const archived = route.query.get("archived") === "1";
  const { projects } = useProjects();
  const tags = useAllTags();
  const { data, error } = useLoad(async () => {
    const [entries, versions] = await Promise.all([
      list<LibraryEntry>("library_entries", { eq: { kind }, order: [["updated_at", false]] }),
      list<LibraryVersion>("library_versions"),
    ]);
    return { entries, versions };
  }, [kind]);

  const current = new Map((data?.versions ?? []).map((v) => [v.id, v]));
  const versionOf = (e: LibraryEntry) => (e.current_version_id ? current.get(e.current_version_id) : undefined);
  const live = (data?.entries ?? []).filter((e) => (archived ? !!e.archived_at : !e.archived_at));
  const subs = [...new Set(live.map((e) => e[L.field].trim()).filter(Boolean))].sort();
  const q = search.toLowerCase();
  const shown = sortEntries(
    live
      .filter((e) => (!sub || e[L.field] === sub) && (!project || e.project_id === project) && (!tag || e.tags.includes(tag)))
      .filter((e) => {
        if (!q) return true;
        const v = versionOf(e);
        return `${e.title} ${e[L.field]} ${e.purpose} ${e.tags.join(" ")} ${v ? `${v.body} ${v.materials} ${v.notes}` : ""}`.toLowerCase().includes(q);
      }),
  );

  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section={L.section}
        title={L.plural}
        subtitle={SUBTITLE[kind]}
        actions={
          <button className="primary" onClick={() => void createEntry(kind, { project_id: project || null, [L.field]: sub, tags: tag ? [tag] : [] })}>
            <Plus size={16} /> {L.add}
          </button>
        }
      />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder={kind === "protocol" ? "Search protocols, steps, reagents" : "Search code, packages, purpose"} />
        <Select label={L.fieldLabel} allLabel={`Any ${L.fieldLabel.toLowerCase()}`} value={sub} options={subs.map((t) => [t, t] as [string, string])} onChange={(v) => setQuery(L.field, v)} />
        <Select label="Project" allLabel="Any project" value={project} options={projects.map((p) => [p.id, p.title] as [string, string])} onChange={(v) => setQuery("project", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
        <label className="toggle">
          <input type="checkbox" checked={archived} onChange={(e) => setQuery("archived", e.target.checked ? "1" : undefined)} /> Archived
        </label>
      </div>
      <ErrorText error={error} />
      <div className="card list-card">
        {data && (shown.length === 0 ? (
          <Empty icon={SECTIONS[L.section].icon}>{live.length ? "Nothing matches these filters." : `Nothing here yet. Add your first with “+ ${L.add}”.`}</Empty>
        ) : (
          <ul className="note-list">
            {shown.map((e) => {
              const v = versionOf(e);
              return (
                <li key={e.id}>
                  <a href={href(`${L.section}/${e.id}`)}>
                    <span className="note-title">{e.pinned && <Pin size={12} aria-label="Pinned" />} {e.title || L.untitled}</span>
                    {(e.purpose || (kind === "protocol" && v?.body)) && <span className="muted small clamp">{e.purpose || noteExcerpt(v?.body ?? "")}</span>}
                    <span className="note-meta">
                      {e[L.field] && <Badge tone="quiet">{e[L.field]}</Badge>}
                      {v && <Badge>v{v.version}</Badge>}
                      {e.project_id && <span className="muted small">{projectName(projects, e.project_id)}</span>}
                      <span className="muted small">Updated {fmtDate(e.updated_at)}</span>
                      {e.archived_at && <Badge tone="quiet">Archived</Badge>}
                      <TagList tags={e.tags} />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </section>
  );
}
