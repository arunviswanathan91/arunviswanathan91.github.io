import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { addDays, addMonths, fmtDate, isoWeekday, startOfMonth, today } from "../../lib/dates.ts";
import { href, setQuery, type Route } from "../../lib/route.ts";
import { DEADLINE_CATEGORY, WEEKDAYS, type Deadline, type DeadlineCategory, type Meeting } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { useProjects } from "../../components/pickers.tsx";
import { ErrorText, PageHeader, Select, Tabs } from "../../components/ui.tsx";
import { DeadlineForm } from "./DeadlineForm.tsx";
import { DeadlineRows, deadlineTone, isOpenDeadline } from "./DeadlineRows.tsx";

type View = "upcoming" | "overdue" | "completed" | "all" | "calendar";

export function DeadlinesView({ route }: { route: Route }) {
  const view = (route.query.get("view") as View) || "upcoming";
  const category = (route.query.get("category") ?? "") as DeadlineCategory | "";
  const project = route.query.get("project") ?? "";
  const [adding, setAdding] = useState<string | null>(null); // preset date or ""
  const { projects } = useProjects();
  const { data, error } = useLoad(async () => {
    const [deadlines, meetings] = await Promise.all([list<Deadline>("deadlines", { order: [["due_date"]] }), list<Meeting>("meetings", { order: [["starts_at"]] })]);
    return { deadlines, meetings };
  }, []);
  const now = today();

  const base = (data?.deadlines ?? []).filter((d) => (!category || d.category === category) && (!project || d.project_id === project));
  const byView = {
    upcoming: base.filter((d) => isOpenDeadline(d) && d.due_date >= now),
    overdue: base.filter((d) => isOpenDeadline(d) && d.due_date < now),
    completed: base.filter((d) => !isOpenDeadline(d)).reverse(),
    all: base,
    calendar: base,
  };

  return (
    <section>
      <PageHeader
        section="deadlines"
        title="Deadlines & milestones"
        subtitle="Conferences, submissions, courses, ISP, half-time review and everything with a date."
        actions={<button className="primary" onClick={() => setAdding("")}><Plus size={16} /> Deadline</button>}
      />
      <Tabs
        value={view}
        options={[["upcoming", "Upcoming"], ["overdue", "Overdue"], ["completed", "Completed"], ["all", "All"], ["calendar", "Calendar"]]}
        counts={{ overdue: byView.overdue.length }}
        onChange={(v) => setQuery("view", v)}
      />
      <div className="filters">
        <Select label="Category" allLabel="Any category" value={category} options={Object.entries(DEADLINE_CATEGORY) as [DeadlineCategory, string][]} onChange={(v) => setQuery("category", v)} />
        <Select label="Project" allLabel="Any project" value={project} options={projects.map((p) => [p.id, p.title] as [string, string])} onChange={(v) => setQuery("project", v)} />
      </div>
      <ErrorText error={error} />
      {view === "calendar" ? (
        <Calendar month={route.query.get("month") ?? startOfMonth(now)} deadlines={base} meetings={data?.meetings ?? []} onAdd={(d) => setAdding(d)} />
      ) : (
        <div className="card list-card">
          {data && <DeadlineRows deadlines={byView[view]} empty={{ upcoming: "Nothing coming up.", overdue: "Nothing overdue.", completed: "Nothing completed yet.", all: "No deadlines yet.", calendar: "" }[view]} />}
        </div>
      )}
      {adding !== null && (
        <Modal title="New deadline" onClose={() => setAdding(null)}>
          <DeadlineForm presetProjectId={project || undefined} presetDate={adding || undefined} onDone={() => setAdding(null)} />
        </Modal>
      )}
    </section>
  );
}

function Calendar({ month, deadlines, meetings, onAdd }: { month: string; deadlines: Deadline[]; meetings: Meeting[]; onAdd: (day: string) => void }) {
  const now = today();
  const first = addDays(month, 1 - isoWeekday(month)); // Monday on or before the 1st
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const weeks = days.slice(35).every((d) => d.slice(0, 7) !== month.slice(0, 7)) ? days.slice(0, 35) : days;

  return (
    <div className="card calendar">
      <div className="calendar-head">
        <button className="icon" aria-label="Previous month" onClick={() => setQuery("month", addMonths(month, -1))}><ChevronLeft size={18} /></button>
        <h2>{fmtDate(month, { month: "long", year: "numeric" })}</h2>
        <button className="icon" aria-label="Next month" onClick={() => setQuery("month", addMonths(month, 1))}><ChevronRight size={18} /></button>
        <button className="small" onClick={() => setQuery("month", startOfMonth(now))}>Today</button>
      </div>
      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((d) => <div key={d} className="calendar-dow" role="columnheader">{d}</div>)}
        {weeks.map((day) => {
          const items = deadlines.filter((d) => d.due_date === day);
          const meets = meetings.filter((m) => !m.archived_at && m.starts_at.slice(0, 10) === day);
          return (
            <div key={day} role="gridcell" className={`calendar-day ${day.slice(0, 7) !== month.slice(0, 7) ? "other" : ""} ${day === now ? "today" : ""}`}>
              <button className="calendar-num" aria-label={`Add deadline on ${day}`} onClick={() => onAdd(day)}>{Number(day.slice(8))}</button>
              {items.map((d) => <a key={d.id} href={href(`deadlines/${d.id}`)} className={`cal-item ${deadlineTone(d, now)}`} title={d.title}>{d.title}</a>)}
              {meets.map((m) => <a key={m.id} href={href(`meetings/${m.id}`)} className="cal-item meeting" title={m.title}>{m.title}</a>)}
            </div>
          );
        })}
      </div>
      <p className="small muted calendar-legend">Click a day number to add a deadline. Meetings are shown in pink.</p>
    </div>
  );
}

