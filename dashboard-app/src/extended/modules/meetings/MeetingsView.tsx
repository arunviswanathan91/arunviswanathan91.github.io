import { useState } from "react";
import { FileDown, Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { go, setQuery, type Route } from "../../lib/route.ts";
import type { Meeting, MeetingProject } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { useProjects } from "../../components/pickers.tsx";
import { ErrorText, PageHeader, SearchBox, Select, Tabs } from "../../components/ui.tsx";
import { MeetingForm } from "./MeetingForm.tsx";
import { MeetingRows } from "./MeetingRows.tsx";
import { DateInput } from "../../../components/ui/DateInput";

type View = "upcoming" | "past" | "all" | "supervisor" | "lab";

export function MeetingsView({ route }: { route: Route }) {
  const view = (route.query.get("view") as View) || "upcoming";
  const project = route.query.get("project") ?? "";
  const from = route.query.get("from") ?? "";
  const to = route.query.get("to") ?? "";
  const search = route.query.get("q") ?? "";
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { projects } = useProjects();
  const { data, error } = useLoad(async () => {
    const [meetings, links] = await Promise.all([list<Meeting>("meetings", { order: [["starts_at"]] }), list<MeetingProject>("meeting_projects")]);
    return { meetings, links };
  }, []);

  const now = new Date().toISOString();
  let shown = (data?.meetings ?? [])
    .filter((m) => !m.archived_at)
    .filter((m) => (view === "upcoming" ? m.starts_at >= now : view === "past" ? m.starts_at < now : view === "supervisor" ? m.type === "supervisor" : view === "lab" ? m.type === "lab" : true))
    .filter((m) => !project || data!.links.some((l) => l.meeting_id === m.id && l.project_id === project))
    .filter((m) => (!from || m.starts_at.slice(0, 10) >= from) && (!to || m.starts_at.slice(0, 10) <= to))
    .filter((m) => !search || [m.title, m.agenda, m.discussion, m.decisions, m.next_steps, m.tags.join(" ")].join(" ").toLowerCase().includes(search.toLowerCase()));
  if (view !== "upcoming") shown = [...shown].reverse(); // most recent first

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function exportPdf(ids: string[]) {
    go("print/meetings", { ids: ids.join(",") });
  }

  const chosen = shown.filter((m) => selected.has(m.id)).map((m) => m.id);

  return (
    <section>
      <PageHeader
        section="meetings"
        title="Meetings"
        subtitle="Supervisor and lab meetings, discussions and collaborations — any date, any time."
        actions={
          <>
            <button disabled={!shown.length} onClick={() => exportPdf(chosen.length ? chosen : [...shown].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((m) => m.id))}>
              <FileDown size={15} /> {chosen.length ? `Export ${chosen.length} selected` : `Export ${shown.length} to PDF`}
            </button>
            <button className="primary" onClick={() => setAdding(true)}><Plus size={16} /> Meeting</button>
          </>
        }
      />
      <Tabs value={view} options={[["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"], ["supervisor", "Supervisor"], ["lab", "Lab"]]} onChange={(v) => setQuery("view", v)} />
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search meetings" />
        <Select label="Project" allLabel="Any project" value={project} options={projects.map((p) => [p.id, p.title] as [string, string])} onChange={(v) => setQuery("project", v)} />
        <label className="inline small">From <DateInput type="date" value={from} onChange={(e) => setQuery("from", e.target.value)} /></label>
        <label className="inline small">To <DateInput type="date" value={to} onChange={(e) => setQuery("to", e.target.value)} /></label>
      </div>
      <ErrorText error={error} />
      <div className="card list-card">
        {data && <MeetingRows meetings={shown} selected={selected} onToggle={toggle} empty={view === "upcoming" ? "No upcoming meetings." : "No meetings here."} />}
      </div>
      {adding && (
        <Modal title="New meeting" onClose={() => setAdding(false)}>
          <MeetingForm presetProjectId={project || undefined} onDone={() => setAdding(false)} />
        </Modal>
      )}
    </section>
  );
}

