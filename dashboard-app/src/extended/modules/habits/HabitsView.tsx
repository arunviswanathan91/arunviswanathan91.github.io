import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { insert, list, remove, update, upsert, useLoad } from "../../lib/db.ts";
import { addDays, fmtDate, startOfWeek, today } from "../../lib/dates.ts";
import { WEEKDAYS, type Habit, type HabitCheckin } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { confirmDanger, Empty, ErrorText, Field, PageHeader } from "../../components/ui.tsx";
import { describeSchedule, formatAmount, isDue, planFor, planRate, planStreak, type DayPlan } from "./logic.ts";

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

/** Set the total done on a day. A quantity habit stores the amount; zero removes the check-in. */
export async function logAmount(habitId: string, day: string, amount: number) {
  if (amount <= 0) await remove("habit_checkins", { habit_id: habitId, day });
  else await upsert("habit_checkins", { habit_id: habitId, day, amount }, "habit_id,day");
}

const planOn = (plan: DayPlan[], day: string) => plan.find((p) => p.day === day);

/** Today's habits as a checklist (used on the dashboard too). A shortfall carried from yesterday raises today's amount. */
export function TodayHabits({ habits, checkins }: { habits: Habit[]; checkins: HabitCheckin[] }) {
  const now = today();
  const rows = habits
    .filter((h) => !h.archived_at)
    .map((h) => {
      const plan = planFor(h, checkins, now);
      return { h, plan, day: planOn(plan, now) };
    })
    .filter((r) => r.day && r.day.required > 0);
  const [error, setError] = useState("");
  const [logging, setLogging] = useState<{ h: Habit; day: DayPlan } | null>(null);
  if (!rows.length) return <Empty>No habits scheduled today.</Empty>;
  return (
    <>
      <ErrorText error={error} />
      <ul className="habit-today">
        {rows.map(({ h, plan, day }) => {
          const d = day!;
          const done = d.state === "done";
          const s = planStreak(plan);
          return (
            <li key={h.id} className={done ? "closed" : ""}>
              {h.target ? (
                <>
                  <span>
                    {h.name} <span className="muted small">{formatAmount(d.logged, h.unit)} / {formatAmount(d.required, h.unit)}</span>
                    {d.carried > 0 && <span className="badge open" title="Not finished yesterday, added to today"> +{formatAmount(d.carried, h.unit)} carried</span>}
                  </span>
                  <button className="small" onClick={() => setLogging({ h, day: d })}>{done ? "Edit" : "Log"}</button>
                </>
              ) : (
                <label>
                  <input type="checkbox" className="check" checked={done} onChange={() => void toggleCheckin(h.id, now, done).catch((e) => setError(e.message))} />
                  <span>{h.name}</span>
                </label>
              )}
              {s > 0 && <span className="streak" title={`${s}-day streak`}><Flame size={13} /> {s}</span>}
            </li>
          );
        })}
      </ul>
      {logging && (
        <Modal title={`Log ${logging.h.name}`} onClose={() => setLogging(null)}>
          <LogForm habit={logging.h} day={logging.day} onDone={() => setLogging(null)} />
        </Modal>
      )}
    </>
  );
}

/** Enter the total done on one day. Falling short is fine: if the habit carries over, the rest is added to the next day. */
function LogForm({ habit, day, onDone }: { habit: Habit; day: DayPlan; onDone: () => void }) {
  const [amount, setAmount] = useState(String(day.logged || day.required));
  const [error, setError] = useState("");
  const value = Number(amount);
  const short = Math.max(0, day.required - value);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await logAmount(habit.id, day.day, value);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">
        {fmtDate(day.day, { weekday: "long", day: "numeric", month: "short" })} · needed {formatAmount(day.required, habit.unit)}
        {day.carried > 0 && ` (${formatAmount(day.base, habit.unit)} + ${formatAmount(day.carried, habit.unit)} carried over)`}
      </p>
      <Field label={`Total done${habit.unit ? ` (${habit.unit})` : ""}`}>
        <input required autoFocus type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {short > 0 && day.day < today() && habit.carry_over && <p className="muted small">{formatAmount(short, habit.unit)} short; the next day will ask for it as well.</p>}
      {short > 0 && day.day === today() && habit.carry_over && <p className="muted small">If you stop here, {formatAmount(short, habit.unit)} is added to tomorrow.</p>}
      <ErrorText error={error} />
      <div className="form-actions"><button className="primary" disabled={!(value >= 0)}>Save</button></div>
    </form>
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
  const planOf = (h: Habit) => planFor(h, checkins, now);
  const [logging, setLogging] = useState<{ h: Habit; day: DayPlan } | null>(null);

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
                      const plan = planOf(h);
                      return (
                        <tr key={h.id}>
                          <td>{h.name}</td>
                          {days.map((d) => {
                            const p = planOn(plan, d);
                            const future = d > now;
                            const show = future ? isDue(h, d) : !!p && (p.required > 0 || p.logged > 0);
                            const isDone = p?.state === "done" || p?.state === "made_up";
                            const cls = p?.state === "made_up" ? "done" : p?.state === "missed" ? "miss" : isDone ? "done" : "";
                            return (
                              <td key={d} className={d === now ? "today" : ""}>
                                {show ? (
                                  <button
                                    className={`cell ${cls}`}
                                    disabled={future}
                                    aria-label={`${h.name} on ${d}: ${isDone ? "done" : "not done"}`}
                                    aria-pressed={isDone}
                                    title={p && h.target ? `${formatAmount(p.logged, h.unit)} of ${formatAmount(p.required, h.unit)}${p.carried ? ` (incl. ${formatAmount(p.carried, h.unit)} carried)` : ""}` : undefined}
                                    onClick={() => (h.target && p ? setLogging({ h, day: p }) : void toggleCheckin(h.id, d, isDone))}
                                  >
                                    {h.target && p ? (p.logged > 0 ? Math.round(p.logged * 10) / 10 : "") : isDone ? "✓" : ""}
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
                  const plan = planOf(h);
                  const r = planRate(plan, 30);
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
                      <span className="muted small">{describeSchedule(h)}{h.target ? ` · ${formatAmount(h.target, h.unit)} a day${h.carry_over ? ", shortfall carries to next day" : ""}` : ""} · <Flame size={12} /> {planStreak(plan)} streak · {pct}% of last 30 days</span>
                      <History habit={h} plan={plan} />
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
                        <span>{h.name} <span className="muted small">· {checkins.filter((c) => c.habit_id === h.id).length} check-ins kept</span></span>
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
      {logging && (
        <Modal title={`Log ${logging.h.name}`} onClose={() => setLogging(null)}>
          <LogForm habit={logging.h} day={logging.day} onDone={() => setLogging(null)} />
        </Modal>
      )}
      {editing && (
        <Modal title={editing === "new" ? "New habit" : "Edit habit"} onClose={() => setEditing(null)}>
          <HabitForm habit={editing === "new" ? undefined : editing} position={habits.length} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

const heat = (s: DayPlan["state"] | undefined) => (s === "done" || s === "made_up" ? "on" : s === "missed" ? "miss" : s === "open" || s === "carried" ? "miss" : "off");

/** Last 12 weeks as a small grid: one column per week, Monday at the top. */
function History({ habit, plan }: { habit: Habit; plan: DayPlan[] }) {
  const now = today();
  const start = addDays(startOfWeek(now), -77);
  const state = new Map(plan.map((p) => [p.day, p.state]));
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="heatmap" aria-label={`${habit.name}, last 12 weeks`}>
      {weeks.map((days, i) => (
        <div key={i} className="heat-col">
          {days.map((d) => (
            <span key={d} title={d} className={`heat ${d > now ? "future" : heat(state.get(d))}`} />
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
  const [target, setTarget] = useState(habit?.target == null ? "" : String(habit.target));
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [carry, setCarry] = useState(habit?.carry_over ?? false);
  const [maxCarry, setMaxCarry] = useState(habit?.max_carry == null ? "" : String(habit.max_carry));
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const values = { name: name.trim(), description: description.trim() || null, frequency, weekdays: frequency === "daily" ? [] : weekdays, start_date: start,
      target: target === "" ? null : Number(target),
      unit: target === "" ? null : unit.trim() || null,
      carry_over: target !== "" && carry,
      max_carry: target !== "" && carry && maxCarry !== "" ? Number(maxCarry) : null,
    };
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
      <div className="grid-2">
        <Field label="Daily amount (optional)"><input type="number" min="0.01" step="any" value={target} placeholder="e.g. 30" onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Unit"><input value={unit} disabled={target === ""} placeholder="e.g. min, pages" onChange={(e) => setUnit(e.target.value)} /></Field>
      </div>
      {target !== "" && (
        <>
          <label className="check-row"><input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} /> Carry a shortfall over to the next day</label>
          {carry && <Field label="Carry at most (optional)"><input type="number" min="0" step="any" value={maxCarry} placeholder="default: one day’s amount" onChange={(e) => setMaxCarry(e.target.value)} /></Field>}
        </>
      )}
      <ErrorText error={error || (frequency === "weekdays" && !weekdays.length ? "Pick at least one weekday" : "")} />
      <div className="form-actions"><button className="primary" disabled={frequency === "weekdays" && !weekdays.length}>{habit ? "Save" : "Add habit"}</button></div>
    </form>
  );
}

