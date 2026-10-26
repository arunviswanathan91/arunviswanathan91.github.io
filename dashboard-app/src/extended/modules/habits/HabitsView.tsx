import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { addDays, fmtDate, startOfWeek, today } from "../../lib/dates.ts";
import { WEEKDAYS, type Habit, type HabitCheckin } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { confirmDanger, Empty, ErrorText, Field, PageHeader } from "../../components/ui.tsx";
import { completionRate, describeSchedule, isDue, streak } from "./logic.ts";

export function useHabits() {
  return useLoad(async () => {
    const [habits, checkins] = await Promise.all([
      list<Habit>("habits", { order: [["position"], ["created_at"]] }),
      list<HabitCheckin>("habit_checkins", { gte: ["day", addDays(today(), -400)] }),
    ]);
    return { habits, checkins };
  }, []);
}

export async function toggleCheckin(habitId: string, day: string, done: boolean) {
  if (done) await remove("habit_checkins", { habit_id: habitId, day });
  else await insert("habit_checkins", { habit_id: habitId, day });
}

/** Today's habits as a checklist (used on the dashboard too). */
export function TodayHabits({ habits, checkins }: { habits: Habit[]; checkins: HabitCheckin[] }) {
  const now = today();
  const due = habits.filter((h) => !h.archived_at && isDue(h, now));
  const [error, setError] = useState("");
  if (!due.length) return <Empty>No habits scheduled today.</Empty>;
  return (
    <>
      <ErrorText error={error} />
      <ul className="habit-today">
        {due.map((h) => {
          const done = checkins.some((c) => c.habit_id === h.id && c.day === now);
          const s = streak(h, new Set(checkins.filter((c) => c.habit_id === h.id).map((c) => c.day)), now);
          return (
            <li key={h.id} className={done ? "closed" : ""}>
              <label>
                <input type="checkbox" className="check" checked={done} onChange={() => void toggleCheckin(h.id, now, done).catch((e) => setError(e.message))} />
                <span>{h.name}</span>
              </label>
              {s > 0 && <span className="streak" title={`${s}-day streak`}><Flame size={13} /> {s}</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function HabitsView() {
  const { data, error } = useHabits();
  const [week, setWeek] = useState(startOfWeek(today()));
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const now = today();
  const habits = data?.habits ?? [];
  const checkins = data?.checkins ?? [];
  const active = habits.filter((h) => !h.archived_at);
  const archived = habits.filter((h) => h.archived_at);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const doneSet = (id: string) => new Set(checkins.filter((c) => c.habit_id === id).map((c) => c.day));

  return (
    <section>
      <PageHeader section="habits" title="Habits" subtitle="Small things, done regularly." actions={<button className="primary" onClick={() => setEditing("new")}><Plus size={16} /> Habit</button>} />
      <ErrorText error={error} />
      <div className="detail-grid">
        <div className="detail-main">
          <div className="card pad">
            <h2 className="section-title">Today · {fmtDate(now, { weekday: "long", day: "numeric", month: "long" })}</h2>
            {data && <TodayHabits habits={habits} checkins={checkins} />}
          </div>

          <div className="card pad">
            <div className="section-head">
              <h2 className="section-title">Week of {fmtDate(week, { day: "numeric", month: "short" })}</h2>
              <span className="row">
                <button className="icon" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={16} /></button>
                <button className="small" onClick={() => setWeek(startOfWeek(now))}>This week</button>
                <button className="icon" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={16} /></button>
              </span>
            </div>
            {active.length === 0 ? <Empty>No habits yet.</Empty> : (
              <div className="table-scroll">
                <table className="habit-week">
                  <thead>
                    <tr><th>Habit</th>{days.map((d, i) => <th key={d} className={d === now ? "today" : ""}>{WEEKDAYS[i]}<br /><span className="muted">{Number(d.slice(8))}</span></th>)}</tr>
                  </thead>
                  <tbody>
                    {active.map((h) => {
                      const done = doneSet(h.id);
                      return (
                        <tr key={h.id}>
                          <td>{h.name}</td>
                          {days.map((d) => {
                            const due = isDue(h, d);
                            const isDone = done.has(d);
                            const future = d > now;
                            return (
                              <td key={d} className={d === now ? "today" : ""}>
                                {due || isDone ? (
                                  <button
                                    className={`cell ${isDone ? "done" : ""}`}
                                    disabled={future}
                                    aria-label={`${h.name} on ${d}: ${isDone ? "done" : "not done"}`}
                                    aria-pressed={isDone}
                                    onClick={() => void toggleCheckin(h.id, d, isDone)}
                                  >
                                    {isDone ? "✓" : ""}
                                  </button>
                                ) : <span className="cell off" aria-hidden>·</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="detail-side">
          <div className="card pad">
            <h3>Progress</h3>
            {active.length === 0 ? <p className="muted small">Add a habit to see progress.</p> : (
              <ul className="habit-stats">
                {active.map((h) => {
                  const done = doneSet(h.id);
                  const r = completionRate(h, done, now, 30);
                  const pct = r.due ? Math.round((100 * r.done) / r.due) : 0;
                  return (
                    <li key={h.id}>
                      <div className="habit-stat-head">
                        <strong>{h.name}</strong>
                        <span className="row">
                          <button className="icon" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}><Pencil size={13} /></button>
                          <button className="icon" aria-label={`Archive ${h.name}`} onClick={() => void update("habits", h.id, { archived_at: new Date().toISOString() })}><Archive size={13} /></button>
                        </span>
                      </div>
                      <span className="muted small">{describeSchedule(h)} · <Flame size={12} /> {streak(h, done, now)} streak · {pct}% of last 30 days</span>
                      <History habit={h} done={done} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {archived.length > 0 && (
            <div className="card pad">
              <button className="link small" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide" : "Show"} {archived.length} archived</button>
              {showArchived && (
                <ul className="habit-stats">
                  {archived.map((h) => (
                    <li key={h.id}>
                      <div className="habit-stat-head">
                        <span>{h.name} <span className="muted small">· {doneSet(h.id).size} check-ins kept</span></span>
                        <span className="row">
                          <button className="icon" aria-label={`Restore ${h.name}`} onClick={() => void update("habits", h.id, { archived_at: null })}><ArchiveRestore size={13} /></button>
                          <button className="icon danger" aria-label={`Delete ${h.name}`} onClick={() => confirmDanger(`Permanently delete “${h.name}” and all its history?`) && void remove("habits", { id: h.id })}><Trash2 size={13} /></button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
      {editing && (
        <Modal title={editing === "new" ? "New habit" : "Edit habit"} onClose={() => setEditing(null)}>
          <HabitForm habit={editing === "new" ? undefined : editing} position={habits.length} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

/** Last 12 weeks as a small grid: one column per week, Monday at the top. */
function History({ habit, done }: { habit: Habit; done: Set<string> }) {
  const now = today();
  const start = addDays(startOfWeek(now), -77);
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="heatmap" aria-label={`${habit.name}, last 12 weeks`}>
      {weeks.map((days, i) => (
        <div key={i} className="heat-col">
          {days.map((d) => (
            <span key={d} title={d} className={`heat ${d > now ? "future" : done.has(d) ? "on" : isDue(habit, d) ? "miss" : "off"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HabitForm({ habit, position, onDone }: { habit?: Habit; position: number; onDone: () => void }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [frequency, setFrequency] = useState<Habit["frequency"]>(habit?.frequency ?? "daily");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(habit?.start_date ?? today());
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const values = { name: name.trim(), description: description.trim() || null, frequency, weekdays: frequency === "daily" ? [] : weekdays, start_date: start };
    try {
      if (habit) await update("habits", habit.id, values);
      else await insert("habits", { ...values, position });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Name"><input required autoFocus value={name} placeholder="e.g. Read 30 min" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Description (optional)"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="Frequency">
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Habit["frequency"])}>
            <option value="daily">Every day</option>
            <option value="weekdays">Selected weekdays</option>
          </select>
        </Field>
        <Field label="Start date"><input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      {frequency === "weekdays" && (
        <div className="weekday-picker" role="group" aria-label="Weekdays">
          {WEEKDAYS.map((d, i) => {
            const n = i + 1;
            const on = weekdays.includes(n);
            return <button key={d} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => setWeekdays((w) => (w.includes(n) ? w.filter((x) => x !== n) : [...w, n].sort()))}>{d}</button>;
          })}
        </div>
      )}
      <ErrorText error={error || (frequency === "weekdays" && !weekdays.length ? "Pick at least one weekday" : "")} />
      <div className="form-actions"><button className="primary" disabled={frequency === "weekdays" && !weekdays.length}>{habit ? "Save" : "Add habit"}</button></div>
    </form>
  );
}

