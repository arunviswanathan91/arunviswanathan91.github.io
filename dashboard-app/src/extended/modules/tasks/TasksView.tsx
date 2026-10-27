import { useState } from "react";
import { Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { today } from "../../lib/dates.ts";
import { go, setQuery, type Route } from "../../lib/route.ts";
import { PRIORITY, type Priority, type Task } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { projectName, useProjects } from "../../components/pickers.tsx";
import { useAllTags } from "../../components/TagInput.tsx";
import { ErrorText, PageHeader, SearchBox, Select, Tabs } from "../../components/ui.tsx";
import { inView, sortTasks, viewCounts, type TaskView } from "./logic.ts";
import { TaskForm } from "./TaskForm.tsx";
import { TaskList } from "./TaskList.tsx";

type Tab = TaskView | "board";
const VIEWS: [Tab, string][] = [
  ["today", "Today"], ["inbox", "Inbox"], ["upcoming", "Upcoming"], ["overdue", "Overdue"],
  ["all", "All open"], ["by_project", "By project"], ["completed", "Completed"], ["board", "Board"],
];

/** One Tasks page: the planner lists and the status board are tabs of the same page. */
export function TasksHeader({ view, counts, onAdd }: { view: Tab; counts?: Partial<Record<Tab, number>>; onAdd: () => void }) {
  return (
    <>
      <PageHeader
        section="tasks"
        title="Tasks"
        subtitle="Everything you need to do, across all projects."
        actions={<button className="primary" onClick={onAdd}><Plus size={16} /> Task</button>}
      />
      <Tabs value={view} options={VIEWS} counts={counts} onChange={(v) => (v === "board" ? (location.hash = "/tasks") : view === "board" ? go("tasks", { view: v }) : setQuery("view", v))} />
    </>
  );
}

export function TasksView({ route }: { route: Route }) {
  const view = (route.query.get("view") as TaskView) || "today";
  const search = route.query.get("q") ?? "";
  const priority = (route.query.get("priority") ?? "") as Priority | "";
  const tag = route.query.get("tag") ?? "";
  const [adding, setAdding] = useState(false);
  const { projects } = useProjects();
  const tags = useAllTags();
  const { data: tasks = [], error } = useLoad(() => list<Task>("tasks", { order: [["due_date"], ["created_at"]] }), []);
  const now = today();

  const filtered = tasks.filter(
    (t) =>
      (!priority || t.priority === priority) &&
      (!tag || t.tags.includes(tag)) &&
      (!search || `${t.title} ${t.description ?? ""}`.toLowerCase().includes(search.toLowerCase())),
  );
  const counts = viewCounts(filtered, now);
  const shown = sortTasks(filtered.filter((t) => inView(t, view, now)), view);

  return (
    <section>
      <TasksHeader view={view} counts={{ today: counts.today, inbox: counts.inbox, overdue: counts.overdue }} onAdd={() => setAdding(true)} />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search tasks" />
        <Select label="Priority" allLabel="Any priority" value={priority} options={Object.entries(PRIORITY) as [Priority, string][]} onChange={(v) => setQuery("priority", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
      </div>
      <ErrorText error={error} />
      {view === "by_project" ? (
        <ByProject tasks={shown} projects={projects} />
      ) : (
        <div className="card list-card">
          <TaskList
            tasks={shown}
            projects={projects}
            empty={{ today: "Nothing due today.", inbox: "Inbox zero — tasks without a project or date land here.", upcoming: "Nothing scheduled.", overdue: "Nothing overdue.", all: "No open tasks.", completed: "No completed tasks yet.", by_project: "" }[view]}
          />
        </div>
      )}
      {adding && (
        <Modal title="New task" onClose={() => setAdding(false)}>
          <TaskForm preset={{ due_date: view === "today" ? now : null }} onDone={() => setAdding(false)} />
        </Modal>
      )}
    </section>
  );
}

function ByProject({ tasks, projects }: { tasks: Task[]; projects: ReturnType<typeof useProjects>["projects"] }) {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.project_id ?? "";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const keys = [...groups.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : projectName(projects, a).localeCompare(projectName(projects, b))));
  if (!keys.length) return <div className="card list-card"><p className="empty muted">No open tasks.</p></div>;
  return (
    <div className="stack">
      {keys.map((k) => (
        <div className="card list-card" key={k || "none"}>
          <h3 className="group-title">{k ? <a href={`#/tools/projects/${k}`}>{projectName(projects, k)}</a> : "No project"}</h3>
          <TaskList tasks={groups.get(k)!} projects={projects} showProject={false} />
        </div>
      ))}
    </div>
  );
}

