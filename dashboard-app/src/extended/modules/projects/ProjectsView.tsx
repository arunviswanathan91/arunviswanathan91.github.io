import { useState } from "react";
import { CalendarClock, CheckSquare, FileText, Pin, Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { fmtDate, today } from "../../lib/dates.ts";
import { href, setQuery, type Route } from "../../lib/route.ts";
import { PROJECT_AREA, PROJECT_STATUS, type Project, type ProjectArea, type ProjectPaper, type ProjectStatus, type Task } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { TagList, useAllTags } from "../../components/TagInput.tsx";
import { Badge, Empty, ErrorText, PageHeader, SearchBox, Select } from "../../components/ui.tsx";
import { isOpen } from "../tasks/logic.ts";
import { noteExcerpt } from "../notes/NoteRows.tsx";
import { ProjectForm } from "./ProjectForm.tsx";

type StatusFilter = "current" | ProjectStatus | "all";
type Sort = "updated" | "title" | "target";

export const statusTone = (s: ProjectStatus) =>
  ({ active: "accent", idea: "quiet", planned: "", paused: "warn", completed: "pos", archived: "quiet" })[s];

export function ProjectsView({ route }: { route: Route }) {
  const status = (route.query.get("status") as StatusFilter) || "current";
  const area = (route.query.get("area") ?? "") as ProjectArea | "";
  const tag = route.query.get("tag") ?? "";
  const search = route.query.get("q") ?? "";
  const sort = (route.query.get("sort") as Sort) || "updated";
  const [adding, setAdding] = useState(false);
  const tags = useAllTags();

  const { data, error } = useLoad(async () => {
    const [projects, tasks, links] = await Promise.all([
      list<Project>("projects"),
      list<Task>("tasks", { in: ["status", ["todo", "in_progress"]] }),
      list<ProjectPaper>("project_papers"),
    ]);
    return { projects, tasks, links };
  }, []);

  const projects = (data?.projects ?? [])
    .filter((p) => (status === "all" ? true : status === "current" ? ["idea", "planned", "active", "paused"].includes(p.status) : p.status === status))
    .filter((p) => (!area || p.area === area) && (!tag || p.tags.includes(tag)))
    .filter((p) => !search || `${p.title} ${p.description ?? ""} ${p.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (sort === "title" ? a.title.localeCompare(b.title) : sort === "target" ? (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999") : b.updated_at.localeCompare(a.updated_at)),
    );
  const now = today();

  return (
    <section>
      <PageHeader
        section="projects"
        title="Projects"
        subtitle="The hub for your research and everything else."
        actions={<button className="primary" onClick={() => setAdding(true)}><Plus size={16} /> Project</button>}
      />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search projects" />
        <Select
          label="Status"
          value={status}
          options={[["current", "Current"], ...(Object.entries(PROJECT_STATUS) as [ProjectStatus, string][]), ["all", "All statuses"]] as [StatusFilter, string][]}
          onChange={(v) => setQuery("status", v || undefined)}
        />
        <Select label="Area" allLabel="Any area" value={area} options={Object.entries(PROJECT_AREA) as [ProjectArea, string][]} onChange={(v) => setQuery("area", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
        <Select label="Sort" value={sort} options={[["updated", "Recently updated"], ["title", "Title"], ["target", "Target date"]] as [Sort, string][]} onChange={(v) => setQuery("sort", v || undefined)} />
      </div>
      <ErrorText error={error} />
      {data && projects.length === 0 ? (
        <Empty>{data.projects.length ? "No projects match these filters." : "No projects yet. Create your first one."}</Empty>
      ) : (
        <div className="card-grid">
          {projects.map((p) => {
            const open = data!.tasks.filter((t) => t.project_id === p.id && isOpen(t));
            const overdue = open.filter((t) => t.due_date && t.due_date < now).length;
            const papers = data!.links.filter((l) => l.project_id === p.id).length;
            return (
              <a key={p.id} className="card project-card" href={href(`projects/${p.id}`)}>
                <div className="project-card-head">
                  <Badge tone={statusTone(p.status)}>{PROJECT_STATUS[p.status]}</Badge>
                  <span className="muted small">{PROJECT_AREA[p.area]}</span>
                  {p.pinned && <Pin size={13} className="muted" aria-label="Pinned" />}
                </div>
                <h3>{p.title}</h3>
                {p.description && <p className="muted small clamp">{noteExcerpt(p.description, 200)}</p>}
                <div className="project-card-meta">
                  <span><CheckSquare size={13} /> {open.length} open{overdue ? <span className="neg"> · {overdue} overdue</span> : null}</span>
                  <span><FileText size={13} /> {papers} papers</span>
                  {p.target_date && <span><CalendarClock size={13} /> {fmtDate(p.target_date)}</span>}
                </div>
                <TagList tags={p.tags} />
              </a>
            );
          })}
        </div>
      )}
      {adding && (
        <Modal title="New project" onClose={() => setAdding(false)}>
          <ProjectForm onDone={() => setAdding(false)} />
        </Modal>
      )}
    </section>
  );
}

