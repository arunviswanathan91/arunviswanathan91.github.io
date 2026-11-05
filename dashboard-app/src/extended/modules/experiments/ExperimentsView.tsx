import { Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { setQuery, type Route } from "../../lib/route.ts";
import { createExperiment } from "./create.ts";
import { EXPERIMENT_STATUS, type Experiment, type ExperimentStatus } from "../../lib/types.ts";
import { projectName, useProjects } from "../../components/pickers.tsx";
import { useAllTags } from "../../components/TagInput.tsx";
import { ErrorText, PageHeader, SearchBox, Select, Tabs } from "../../components/ui.tsx";
import { ExperimentRows } from "./ExperimentRows.tsx";
import { sortExperiments } from "./logic.ts";

/** Until supabase/experiments.sql has been run, say so instead of showing a database error. */
export const setupError = (error: string) =>
  /ws_experiments|schema cache|does not exist/i.test(error) ? "The experiment log needs its database table: run supabase/experiments.sql in the Supabase SQL Editor, then reload." : error;

type View = "active" | "planned" | "done" | "all";
const VIEWS: [View, string][] = [["active", "On the bench"], ["planned", "Planned"], ["done", "Finished"], ["all", "All"]];
const inView = (e: Experiment, v: View) =>
  v === "all" ? true : v === "active" ? e.status === "running" || e.status === "analysing" : v === "planned" ? e.status === "planned" : e.status === "done" || e.status === "abandoned";

export function ExperimentsView({ route }: { route: Route }) {
  const view = (route.query.get("view") as View) || "all";
  const status = (route.query.get("status") ?? "") as ExperimentStatus | "";
  const technique = route.query.get("technique") ?? "";
  const project = route.query.get("project") ?? "";
  const tag = route.query.get("tag") ?? "";
  const search = route.query.get("q") ?? "";
  const archived = route.query.get("archived") === "1";
  const { projects } = useProjects();
  const tags = useAllTags();
  const { data, error } = useLoad(() => list<Experiment>("experiments", { order: [["updated_at", false]] }), []);

  const live = (data ?? []).filter((e) => (archived ? !!e.archived_at : !e.archived_at));
  const techniques = [...new Set(live.map((e) => e.technique.trim()).filter(Boolean))].sort();
  const counts = Object.fromEntries(VIEWS.map(([v]) => [v, live.filter((e) => inView(e, v)).length])) as Record<View, number>;
  const q = search.toLowerCase();
  const shown = sortExperiments(
    live
      .filter((e) => inView(e, view))
      .filter((e) => (!status || e.status === status) && (!technique || e.technique === technique) && (!project || e.project_id === project) && (!tag || e.tags.includes(tag)))
      .filter((e) => !q || `${e.title} ${e.technique} ${e.aim} ${e.protocol} ${e.results} ${e.conclusion} ${e.tags.join(" ")} ${e.samples.map((s) => `${s.label} ${s.group}`).join(" ")}`.toLowerCase().includes(q)),
  );

  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section="experiments"
        title="Experiments"
        subtitle="Your experiment log: aim, protocol, samples, results and what comes next, linked to projects and manuscripts."
        actions={
          <button className="primary" onClick={() => void createExperiment({ project_id: project || null, technique, tags: tag ? [tag] : [] })}>
            <Plus size={16} /> Experiment
          </button>
        }
      />
      <Tabs value={view} options={VIEWS} counts={counts} onChange={(v) => setQuery("view", v === "all" ? undefined : v)} />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search experiments, samples, results" />
        <Select label="Status" allLabel="Any status" value={status} options={Object.entries(EXPERIMENT_STATUS) as [ExperimentStatus, string][]} onChange={(v) => setQuery("status", v)} />
        <Select label="Technique" allLabel="Any technique" value={technique} options={techniques.map((t) => [t, t] as [string, string])} onChange={(v) => setQuery("technique", v)} />
        <Select label="Project" allLabel="Any project" value={project} options={projects.map((p) => [p.id, p.title] as [string, string])} onChange={(v) => setQuery("project", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
        <label className="toggle">
          <input type="checkbox" checked={archived} onChange={(e) => setQuery("archived", e.target.checked ? "1" : undefined)} /> Archived
        </label>
      </div>
      <ErrorText error={setupError(error)} />
      <div className="card list-card">
        {data && (
          <ExperimentRows
            experiments={shown}
            projectLabel={(id) => projectName(projects, id)}
            empty={live.length ? "No experiments match these filters." : "No experiments yet. Log your first one with “+ Experiment”."}
          />
        )}
      </div>
    </section>
  );
}
