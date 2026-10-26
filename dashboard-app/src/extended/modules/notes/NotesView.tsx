import { Download, Plus } from "lucide-react";
import { insert, list, useLoad } from "../../lib/db.ts";
import { downloadNotes } from "../../lib/download.ts";
import { go, setQuery, type Route } from "../../lib/route.ts";
import { NOTE_TYPE, type Note, type NoteType, type Paper } from "../../lib/types.ts";
import { projectName, useProjects } from "../../components/pickers.tsx";
import { useAllTags } from "../../components/TagInput.tsx";
import { ErrorText, PageHeader, SearchBox, Select } from "../../components/ui.tsx";
import { NoteRows } from "./NoteRows.tsx";

export async function createNote(values: Partial<Note> = {}) {
  const n = await insert<Note>("notes", { title: "Untitled", ...values });
  go(`notes/${n.id}`);
}

export function NotesView({ route }: { route: Route }) {
  const type = (route.query.get("type") ?? "") as NoteType | "";
  const project = route.query.get("project") ?? "";
  const tag = route.query.get("tag") ?? "";
  const search = route.query.get("q") ?? "";
  const archived = route.query.get("archived") === "1";
  const { projects } = useProjects();
  const tags = useAllTags();
  const { data, error } = useLoad(async () => {
    const [notes, papers] = await Promise.all([list<Note>("notes", { order: [["updated_at", false]] }), list<Paper>("papers")]);
    return { notes, papers };
  }, []);

  const shown = (data?.notes ?? [])
    .filter((n) => (archived ? !!n.archived_at : !n.archived_at))
    .filter((n) => (!type || n.type === type) && (!project || n.project_id === project) && (!tag || n.tags.includes(tag)))
    .filter((n) => !search || `${n.title} ${n.body} ${n.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <section>
      <PageHeader
        section="notes"
        title="Notes"
        subtitle="Ideas, literature notes, daily logs and your lab notebook."
        actions={
          <>
            <button disabled={!shown.length} onClick={() => downloadNotes(shown, { project: (id) => projectName(projects, id), paper: (id) => data?.papers.find((p) => p.id === id)?.title ?? "" })}>
              <Download size={15} /> Export {shown.length > 1 ? `${shown.length} as .md` : ".md"}
            </button>
            <button className="primary" onClick={() => void createNote({ type: type || "general", project_id: project || null, tags: tag ? [tag] : [] })}>
              <Plus size={16} /> Note
            </button>
          </>
        }
      />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search notes" />
        <Select label="Type" allLabel="Any type" value={type} options={Object.entries(NOTE_TYPE) as [NoteType, string][]} onChange={(v) => setQuery("type", v)} />
        <Select label="Project" allLabel="Any project" value={project} options={projects.map((p) => [p.id, p.title] as [string, string])} onChange={(v) => setQuery("project", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
        <label className="toggle">
          <input type="checkbox" checked={archived} onChange={(e) => setQuery("archived", e.target.checked ? "1" : undefined)} /> Archived
        </label>
      </div>
      <ErrorText error={error} />
      <div className="card list-card">
        {data && <NoteRows notes={shown} empty={data.notes.length ? "No notes match these filters." : "No notes yet. Start one with “+ Note”."} />}
      </div>
    </section>
  );
}

