import { useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, BellRing, ChevronLeft, ChevronRight, Download, Flame, Pause, Pencil, Plus, Trash2 } from "lucide-react";
import { insert, list, remove, update, upsert, useLoad } from "../../lib/db.ts";
import { addDays, fmtDate, startOfWeek, today } from "../../lib/dates.ts";
import { downloadCsv } from "../../lib/download.ts";
import { saveSettings, useSettings } from "../../lib/settings.ts";
import { WEEKDAYS, type Habit, type HabitCheckin, type HabitPause } from "../../lib/types.ts";
import { Modal } from "../../components/Modal.tsx";
import { confirmDanger, Empty, ErrorText, Field, PageHeader } from "../../components/ui.tsx";
import { describeSchedule, formatAmount, isDue, isPaused, pausesFor, planFor, summarise, type DayPlan, type DayState } from "./logic.ts";
import { DateInput } from "../../../components/ui/DateInput";

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

const isPeriod = (h: Habit) => h.period === "week" || h.period === "month";
const loggedOn = (checkins: HabitCheckin[], h: Habit, day: string) => {
  const c = checkins.find((x) => x.habit_id === h.id && x.day === day);
  return c ? c.amount ?? h.target ?? 1 : 0;
};

/** What the log dialog needs: the day, what is logged on it and a sentence about what is asked. */
interface LogTarget {
  habit: Habit;
  day: string;
  logged: number;
  /** Prefilled amount. */
  suggest: number;
  hint: string;
  /** Shown when the entered total falls short of `required`. */
  required: number;
}

/** Log target for a day of a daily habit (carry included). */
function dayTarget(h: Habit, p: DayPlan): LogTarget {
  const hint = `Needed ${formatAmount(p.required, h.unit)}${p.carried > 0 ? ` (${formatAmount(p.base, h.unit)} + ${formatAmount(p.carried, h.unit)} carried over)` : ""}`;
  return { habit: h, day: p.day, logged: p.logged, suggest: p.logged || p.required, hint, required: p.required };
}

/** Log target for a day of a weekly or monthly habit: the day's own amount, with the period's progress as context. */
function periodTarget(h: Habit, checkins: HabitCheckin[], day: string, pauses: HabitPause[]): LogTarget {
  const s = summarise(h, checkins, day, pauses);
  const n = s.now;
  const todayAmount = loggedOn(checkins, h, day);
  const left = n ? Math.max(0, n.required - n.logged) : 0;
  const hint = n ? `${s.scope === "this week" ? "Week" : "Month"} so far: ${formatAmount(n.logged, h.unit)} of ${formatAmount(n.required, h.unit)}${n.carried > 0 ? ` (incl. ${formatAmount(n.carried, h.unit)} carried over)` : ""}` : "";
  return { habit: h, day, logged: todayAmount, suggest: todayAmount || left || h.target || 1, hint, required: todayAmount + left };
}

/** Today's habits as a checklist (used on the dashboard too). A shortfall carried from yesterday raises today's amount. */
export function TodayHabits({ habits, checkins }: { habits: Habit[]; checkins: HabitCheckin[] }) {
  const now = today();
  const pauses = useSettings().habit_pauses ?? [];
  const rows = habits
    .filter((h) => !h.archived_at)
    .map((h) => ({ h, s: summarise(h, checkins, now, pauses) }))
    .filter((r) => r.s.now && r.s.now.required > 0 && r.s.now.state !== "paused");
  const [error, setError] = useState("");
  const [logging, setLogging] = useState<LogTarget | null>(null);
  if (!rows.length) return <Empty>No habits scheduled today.</Empty>;
  return (
    <>
      <ErrorText error={error} />
      <ul className="habit-today">
        {rows.map(({ h, s }) => {
          const n = s.now!;
          const done = n.state === "done";
          return (
            <li key={h.id} className={done ? "closed" : ""}>
              {h.target ? (
                <>
                  <span className="habit-today-name">
                    {h.name} <span className="muted small">{formatAmount(n.logged, h.unit)} / {formatAmount(n.required, h.unit)}{s.scope !== "today" && ` ${s.scope}`}</span>
                    {n.carried > 0 && <span className="badge open" title="Not finished before, added on top"> +{formatAmount(n.carried, h.unit)} carried</span>}
                  </span>
                  <button className="small" onClick={() => {
                    const plan = isPeriod(h) ? null : planFor(h, checkins, now, pauses).at(-1);
                    setLogging(plan ? dayTarget(h, plan) : periodTarget(h, checkins, now, pauses));
                  }}>{done ? "Edit" : "Log"}</button>
                </>
              ) : (
                <label>
                  <input type="checkbox" className="check" checked={done} onChange={() => void toggleCheckin(h.id, now, done).catch((e) => setError(e.message))} />
                  <span>{h.name}</span>
                </label>
              )}
              {s.streak > 0 && <span className="streak" title={`${s.streak}-${s.streakUnit} streak`}><Flame size={13} /> {s.streak}</span>}
            </li>
          );
        })}
      </ul>
      {logging && (
        <Modal title={`Log ${logging.habit.name}`} onClose={() => setLogging(null)}>
          <LogForm target={logging} onDone={() => setLogging(null)} />
        </Modal>
      )}
    </>
  );
}

/** Enter the total done on one day. Falling short is fine: if the habit carries over, the rest moves on. */
function LogForm({ target, onDone }: { target: LogTarget; onDone: () => void }) {
  const { habit, day } = target;
  const [amount, setAmount] = useState(String(target.suggest));
  const [error, setError] = useState("");
  const value = Number(amount);
  const short = Math.max(0, target.required - value);
  const next = habit.period === "week" ? "next week" : habit.period === "month" ? "next month" : day === today() ? "tomorrow" : "the next day";
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await logAmount(habit.id, day, value);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">{fmtDate(day, { weekday: "long", day: "numeric", month: "short" })} · {target.hint}</p>
      <Field label={`Total done on this day${habit.unit ? ` (${habit.unit})` : ""}`}>
        <input required autoFocus type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {short > 0 && habit.carry_over && <p className="muted small">If it stays at this, {formatAmount(short, habit.unit)} is added to {next}.</p>}
      <ErrorText error={error} />
      <div className="form-actions"><button className="primary" disabled={!(value >= 0)}>Save</button></div>
    </form>
  );
}

export function HabitsView() {
  const { data, error } = useHabits();
  const settings = useSettings();
  const pauses = settings.habit_pauses ?? [];
  const [week, setWeek] = useState(startOfWeek(today()));
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [pausing, setPausing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [logging, setLogging] = useState<LogTarget | null>(null);
  const now = today();
  const habits = data?.habits ?? [];
  const checkins = data?.checkins ?? [];
  const active = habits.filter((h) => !h.archived_at);
  const archived = habits.filter((h) => h.archived_at);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  function exportCsv() {
    const rows: (string | number | null)[][] = [["Habit", "Target per", "Date", "Done", "Required", "Unit", "Status"]];
    for (const h of habits) {
      if (isPeriod(h)) {
        for (const c of checkins.filter((x) => x.habit_id === h.id).sort((a, b) => a.day.localeCompare(b.day))) {
          rows.push([h.name, h.period, c.day, c.amount ?? h.target, "", h.unit ?? "", "logged"]);
        }
        continue;
      }
      for (const p of planFor(h, checkins, now, pauses)) {
        if (p.state === "off" && !p.logged) continue;
        rows.push([h.name, "day", p.day, p.logged, p.required, h.unit ?? "", STATE_LABEL[p.state]]);
      }
    }
    downloadCsv("habits", rows);
  }

  return (
    <section>
      <PageHeader section="habits" title="Habits" subtitle="Small things, done regularly." actions={<>
        {habits.length > 0 && <button onClick={exportCsv} title="Download every logged day as a spreadsheet"><Download size={15} /> CSV</button>}
        <button onClick={() => setPausing(true)}><Pause size={15} /> Break</button>
        <button className="primary" onClick={() => setEditing("new")}><Plus size={16} /> Habit</button>
      </>} />
      <ErrorText error={error} />
      {isPaused(pauses.filter((p) => !p.habit_id), now) && <p className="card pad small">On a break today: nothing is required and carried amounts wait until it ends.</p>}
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
                      const mine = pausesFor(pauses, h.id);
                      const plan = isPeriod(h) ? [] : planFor(h, checkins, now, pauses);
                      return (
                        <tr key={h.id}>
                          <td>{h.name}{isPeriod(h) && <div className="muted small">{h.period === "week" ? "weekly" : "monthly"} target</div>}</td>
                          {days.map((d) => {
                            const future = d > now;
                            const paused = isPaused(mine, d);
                            if (isPeriod(h)) {
                              const amount = loggedOn(checkins, h, d);
                              return (
                                <td key={d} className={d === now ? "today" : ""}>
                                  {d < h.start_date ? <span className="cell off" aria-hidden>·</span> : (
                                    <button className={`cell ${amount > 0 ? "done" : paused ? "paused" : ""}`} disabled={future} aria-label={`${h.name} on ${d}: ${formatAmount(amount, h.unit)}`}
                                      onClick={() => setLogging(periodTarget(h, checkins, d, pauses))}>
                                      {amount > 0 ? Math.round(amount * 10) / 10 : ""}
                                    </button>
                                  )}
                                </td>
                              );
                            }
                            const p = plan.find((x) => x.day === d);
                            const show = future ? isDue(h, d) && !paused : !!p && (p.required > 0 || p.logged > 0 || p.state === "paused");
                            const isDone = p?.state === "done" || p?.state === "made_up";
                            const cls = p?.state === "paused" ? "paused" : p?.state === "missed" ? "miss" : isDone ? "done" : "";
                            return (
                              <td key={d} className={d === now ? "today" : ""}>
                                {show ? (
                                  <button
                                    className={`cell ${cls}`}
                                    disabled={future || p?.state === "paused"}
                                    aria-label={`${h.name} on ${d}: ${p?.state === "paused" ? "on a break" : isDone ? "done" : "not done"}`}
                                    aria-pressed={isDone}
                                    title={p?.state === "paused" ? "On a break" : p && h.target ? `${formatAmount(p.logged, h.unit)} of ${formatAmount(p.required, h.unit)}${p.carried ? ` (incl. ${formatAmount(p.carried, h.unit)} carried)` : ""}` : undefined}
                                    onClick={() => (h.target && p ? setLogging(dayTarget(h, p)) : void toggleCheckin(h.id, d, isDone))}
                                  >
                                    {p?.state === "paused" ? "‖" : h.target && p ? (p.logged > 0 ? Math.round(p.logged * 10) / 10 : "") : isDone ? "✓" : ""}
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
                  const s = summarise(h, checkins, now, pauses);
                  const pct = s.rate.due ? Math.round((100 * s.rate.done) / s.rate.due) : 0;
                  const per = h.period === "week" ? "a week" : h.period === "month" ? "a month" : "a day";
                  const next = h.period === "week" ? "next week" : h.period === "month" ? "next month" : "next day";
                  return (
                    <li key={h.id}>
                      <div className="habit-stat-head">
                        <strong>{h.name}</strong>
                        <span className="row">
                          <button className="icon" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}><Pencil size={13} /></button>
                          <button className="icon" aria-label={`Archive ${h.name}`} onClick={() => void update("habits", h.id, { archived_at: new Date().toISOString() })}><Archive size={13} /></button>
                        </span>
                      </div>
                      <span className="muted small">
                        {describeSchedule(h)}{h.target ? ` · ${formatAmount(h.target, h.unit)} ${per}${h.carry_over ? `, shortfall carries to ${next}` : ""}` : ""} · <Flame size={12} /> {s.streak} {s.streakUnit} streak · {pct}% {s.rate.label}
                      </span>
                      <History habit={h} state={s.dayState} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <BreaksCard pauses={pauses} habits={habits} onAdd={() => setPausing(true)} />
          <NudgeCard time={settings.habit_nudge_time ?? null} />
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
        <Modal title={`Log ${logging.habit.name}`} onClose={() => setLogging(null)}>
          <LogForm target={logging} onDone={() => setLogging(null)} />
        </Modal>
      )}
      {pausing && (
        <Modal title="Take a break" onClose={() => setPausing(false)}>
          <PauseForm pauses={pauses} habits={active} onDone={() => setPausing(false)} />
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

const STATE_LABEL: Record<DayState, string> = { off: "not scheduled", done: "done", open: "open", made_up: "made up next day", carried: "carried to today", missed: "missed", paused: "break" };

const heat = (s: DayState | undefined) => (s === "done" || s === "made_up" ? "on" : s === "missed" || s === "open" || s === "carried" ? "miss" : s === "paused" ? "paused" : "off");

/** Last 12 weeks as a small grid: one column per week, Monday at the top. */
function History({ habit, state }: { habit: Habit; state: Map<string, DayState> }) {
  const now = today();
  const start = addDays(startOfWeek(now), -77);
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="heatmap" aria-label={`${habit.name}, last 12 weeks`}>
      {weeks.map((days, i) => (
        <div key={i} className="heat-col">
          {days.map((d) => (
            <span key={d} title={`${d}: ${STATE_LABEL[state.get(d) ?? "off"]}`} className={`heat ${d > now ? "future" : heat(state.get(d))}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Current and upcoming breaks (and the last few past ones), with delete. */
function BreaksCard({ pauses, habits, onAdd }: { pauses: HabitPause[]; habits: Habit[]; onAdd: () => void }) {
  const now = today();
  const [error, setError] = useState("");
  const shown = pauses.map((p, i) => ({ p, i })).filter(({ p }) => p.to >= addDays(now, -30)).sort((a, b) => a.p.from.localeCompare(b.p.from));
  const nameOf = (id?: string | null) => (id ? habits.find((h) => h.id === id)?.name ?? "Deleted habit" : "All habits");
  async function del(i: number) {
    try {
      await saveSettings({ habit_pauses: pauses.filter((_, j) => j !== i) });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="card pad">
      <div className="habit-stat-head"><h3>Breaks</h3><button className="small" onClick={onAdd}><Pause size={13} /> Add</button></div>
      <p className="muted small">Travel or sick days: nothing is required, streaks don’t break, and carried amounts wait until you’re back.</p>
      <ErrorText error={error} />
      {shown.length > 0 && (
        <ul className="habit-stats">
          {shown.map(({ p, i }) => (
            <li key={i}><div className="habit-stat-head">
              <span className="small">
                <strong>{fmtDate(p.from, { day: "numeric", month: "short" })} – {fmtDate(p.to, { day: "numeric", month: "short" })}</strong> · {nameOf(p.habit_id)}
                {p.note && <span className="muted"> · {p.note}</span>}
                {p.from <= now && now <= p.to && <span className="badge open"> now</span>}
              </span>
              <button className="icon danger" aria-label="Delete break" onClick={() => void del(i)}><Trash2 size={13} /></button>
            </div></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PauseForm({ pauses, habits, onDone }: { pauses: HabitPause[]; habits: Habit[]; onDone: () => void }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [habitId, setHabitId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await saveSettings({ habit_pauses: [...pauses, { from, to, habit_id: habitId || null, note: note.trim() || null }] });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="grid-2">
        <Field label="From"><DateInput type="date" required value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
        <Field label="To (inclusive)"><DateInput type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Field label="Habit">
        <select value={habitId} onChange={(e) => setHabitId(e.target.value)}>
          <option value="">All habits</option>
          {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)"><input value={note} placeholder="e.g. Conference in Lisbon" onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorText error={error} />
      <div className="form-actions"><button className="primary">Save break</button></div>
    </form>
  );
}

/** Evening Telegram nudge for habits that are still open (sent by the reminder sweep). */
function NudgeCard({ time }: { time: string | null }) {
  const [value, setValue] = useState((time ?? "").slice(0, 5));
  const [state, setState] = useState("");
  async function save(next: string) {
    setValue(next);
    try {
      await saveSettings({ habit_nudge_time: next || null });
      setState(next ? `Saved: reminder at ${next}` : "Reminder off");
    } catch (e) {
      setState((e as Error).message);
    }
  }
  return (
    <div className="card pad">
      <h3><BellRing size={14} /> Evening reminder</h3>
      <p className="muted small">If any habit is still open at this time, Telegram sends you one message listing them (needs Telegram linked in Settings).</p>
      <div className="row">
        <input type="time" aria-label="Reminder time" value={value} onChange={(e) => void save(e.target.value)} />
        {value && <button className="small" onClick={() => void save("")}>Turn off</button>}
      </div>
      {state && <p className="muted small">{state}</p>}
    </div>
  );
}

function HabitForm({ habit, position, onDone }: { habit?: Habit; position: number; onDone: () => void }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [period, setPeriod] = useState<Habit["period"]>(habit?.period ?? "day");
  const [frequency, setFrequency] = useState<Habit["frequency"]>(habit?.frequency ?? "daily");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(habit?.start_date ?? today());
  const [target, setTarget] = useState(habit?.target == null ? "" : String(habit.target));
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [carry, setCarry] = useState(habit?.carry_over ?? false);
  const [maxCarry, setMaxCarry] = useState(habit?.max_carry == null ? "" : String(habit.max_carry));
  const [error, setError] = useState("");
  const perDay = period === "day";
  const word = period === "week" ? "week" : period === "month" ? "month" : "day";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const values = {
      name: name.trim(),
      description: description.trim() || null,
      period,
      frequency: perDay ? frequency : "daily",
      weekdays: perDay && frequency === "weekdays" ? weekdays : [],
      start_date: start,
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

  const invalid = perDay && frequency === "weekdays" && !weekdays.length;
  return (
    <form className="form" onSubmit={submit}>
      <Field label="Name"><input required autoFocus value={name} placeholder="e.g. Read 30 min" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Description (optional)"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="Target per">
          <select value={period} onChange={(e) => setPeriod(e.target.value as Habit["period"])}>
            <option value="day">Day (on scheduled days)</option>
            <option value="week">Week (any days)</option>
            <option value="month">Month (any days)</option>
          </select>
        </Field>
        <Field label="Start date"><DateInput type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        {perDay && (
          <Field label="Frequency">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Habit["frequency"])}>
              <option value="daily">Every day</option>
              <option value="weekdays">Selected weekdays</option>
            </select>
          </Field>
        )}
      </div>
      {perDay && frequency === "weekdays" && (
        <div className="weekday-picker" role="group" aria-label="Weekdays">
          {WEEKDAYS.map((d, i) => {
            const n = i + 1;
            const on = weekdays.includes(n);
            return <button key={d} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => setWeekdays((w) => (w.includes(n) ? w.filter((x) => x !== n) : [...w, n].sort()))}>{d}</button>;
          })}
        </div>
      )}
      <div className="grid-2">
        <Field label={perDay ? "Daily amount (optional)" : `Amount per ${word}`}><input type="number" required={!perDay} min="0.01" step="any" value={target} placeholder={perDay ? "e.g. 30" : "e.g. 150"} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Unit"><input value={unit} disabled={target === ""} placeholder="e.g. min, pages, km" onChange={(e) => setUnit(e.target.value)} /></Field>
      </div>
      {target !== "" && (
        <>
          <label className="check-row"><input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} /> Carry a shortfall over to the next {word}</label>
          {carry && <Field label="Carry at most (optional)"><input type="number" min="0" step="any" value={maxCarry} placeholder={`default: one ${word}’s amount`} onChange={(e) => setMaxCarry(e.target.value)} /></Field>}
        </>
      )}
      <ErrorText error={error || (invalid ? "Pick at least one weekday" : "")} />
      <div className="form-actions"><button className="primary" disabled={invalid}>{habit ? "Save" : "Add habit"}</button></div>
    </form>
  );
}
