import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { DateInput } from "../../../components/ui/DateInput";
import { insert, list, rpc, trash, update, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { setQuery, type Route } from "../../lib/route.ts";
import { GOAL_AREA, GOAL_MEASURE, type Goal, type GoalArea, type GoalMeasure, type Habit, type Milestone, type SavingsAccount } from "../../lib/types.ts";
import { ProjectSelect, projectName, useProjects } from "../../components/pickers.tsx";
import { Badge, Empty, ErrorText, PageHeader } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { formatMoney, todayISO } from "../loans/balance.ts";
import { balanceMap } from "../budget/accounts.ts";
import { expectedShare, goalProgress, toggleMilestone } from "./logic.ts";
import { Progress } from "./Progress.tsx";
import { useOptimistic } from "./optimistic.ts";
import { setupError } from "./ThesisView.tsx";

export function GoalsView({ route }: { route: Route }) {
  const today = todayISO();
  const year = Number(route.query.get("year")) || Number(today.slice(0, 4));
  const { projects } = useProjects();
  const { data, error } = useLoad(async () => {
    const [goals, tasks, habits, checkins, accounts, balances] = await Promise.all([
      list<Goal>("goals", { eq: { year }, order: [["position"], ["created_at"]] }),
      list<{ project_id: string | null; status: string }>("tasks"),
      list<Habit>("habits", { order: [["position"]] }),
      list<{ habit_id: string; day: string }>("habit_checkins", { gte: ["day", `${year}-01-01`], lt: ["day", `${year + 1}-01-01`] }),
      list<SavingsAccount>("savings_accounts", { order: [["name"]] }),
      rpc<{ account_id: string; balance: number | string }[]>("account_balances").catch(() => []),
    ]);
    return { goals, tasks, habits, checkins, accounts, balances: balanceMap(balances) };
  }, [year]);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } };

  const [goals, applyGoal] = useOptimistic(data?.goals);
  // Every edit shows at once and saves in the background (undone with a message if it fails).
  const save = (id: string, patch: Partial<Goal>) => void applyGoal(id, patch, () => update("goals", id, patch)).then((e) => setErr(e));
  const live = goals.filter((g) => g.status !== "dropped");
  const achieved = goals.filter((g) => g.status === "achieved").length;
  const inputs = { tasks: data?.tasks ?? [], checkins: data?.checkins ?? [], balances: data?.balances ?? new Map<string, number>() };
  const thisYear = year === Number(today.slice(0, 4));
  const areas = (Object.keys(GOAL_AREA) as GoalArea[]).filter((a) => goals.some((g) => g.area === a));

  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section="goals"
        title={`Goals ${year}`}
        subtitle={live.length ? `${achieved} of ${live.length} achieved${thisYear ? ` · ${Math.round(expectedShare({ year, due_on: null }, today) * 100)}% of the year gone` : ""}` : "What you want this year to add up to: papers, skills, savings, health."}
        actions={
          <span className="row">
            <button className="icon" aria-label="Previous year" onClick={() => setQuery("year", String(year - 1))}><ChevronLeft size={16} /></button>
            {!thisYear && <button className="small" onClick={() => setQuery("year", undefined)}>This year</button>}
            <button className="icon" aria-label="Next year" onClick={() => setQuery("year", String(year + 1))}><ChevronRight size={16} /></button>
            <button className="primary" onClick={() => void run(async () => { const g = await insert<Goal>("goals", { title: "New goal", year, position: goals.length }); setEditing(g.id); })}><Plus size={16} /> Goal</button>
          </span>
        }
      />
      <ErrorText error={setupError(error) || err} />
      {data && goals.length === 0 && (
        <div className="card pad"><Empty icon={SECTIONS.goals.icon}>No goals for {year} yet. Try “Submit 2 first-author papers”, “Read 30 minutes on 200 days” or “Emergency fund of ₹1,00,000”.</Empty></div>
      )}
      {areas.map((area) => (
        <div key={area} className="goal-area">
          <h2 className="section-title">{GOAL_AREA[area]}</h2>
          <div className="goal-grid">
            {goals.filter((g) => g.area === area).map((g) => {
              const p = goalProgress(g, inputs);
              const expected = thisYear && g.status === "active" ? expectedShare(g, today) : undefined;
              const label = g.measure === "savings" ? `${formatMoney(p.value, data!.accounts.find((a) => a.id === g.account_id)?.currency ?? "INR")}${p.target ? ` of ${formatMoney(p.target, data!.accounts.find((a) => a.id === g.account_id)?.currency ?? "INR")}` : ""}` : p.label;
              return (
                <article key={g.id} className={`card pad goal ${g.status}`}>
                  <header className="goal-head">
                    <strong>{g.title}</strong>
                    {g.status === "achieved" ? <Badge tone="pos">Achieved</Badge> : g.status === "dropped" ? <Badge tone="quiet">Dropped</Badge> : p.share === 1 ? <Badge tone="pos">Target reached</Badge> : null}
                  </header>
                  <Progress share={p.share} expected={expected} label={`${g.title}: progress`} />
                  <span className="small muted">{label}{g.due_on ? ` · by ${fmtDate(g.due_on, { day: "numeric", month: "short" })}` : ""}{g.measure === "project" && g.project_id ? ` · ${projectName(projects, g.project_id)}` : ""}</span>
                  {g.measure === "milestones" && g.milestones.length > 0 && (
                    <ul className="goal-milestones">
                      {g.milestones.map((m, i) => (
                        <li key={i}><label><input type="checkbox" checked={m.done} onChange={() => save(g.id, { milestones: toggleMilestone(g.milestones, i) })} /> {m.label}</label></li>
                      ))}
                    </ul>
                  )}
                  {g.measure === "manual" && g.status === "active" && (
                    <span className="row goal-step">
                      <button className="small" onClick={() => save(g.id, { current: Number(g.current) + 1 })}>+1{g.unit ? ` ${g.unit}` : ""}</button>
                    </span>
                  )}
                  <button className="link-button small" aria-expanded={editing === g.id} onClick={() => setEditing(editing === g.id ? null : g.id)}>{editing === g.id ? "Done editing" : "Edit"}</button>
                  {editing === g.id && <GoalEditor goal={g} habits={data!.habits} accounts={data!.accounts} save={(patch) => save(g.id, patch)} onError={setErr} onClose={() => setEditing(null)} />}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function GoalEditor({ goal: g, habits, accounts, save, onError, onClose }: { goal: Goal; habits: Habit[]; accounts: SavingsAccount[]; save: (patch: Partial<Goal>) => void; onError: (e: string) => void; onClose: () => void }) {
  const [item, setItem] = useState("");
  const addItem = () => { if (item.trim()) { save({ milestones: [...g.milestones, { label: item.trim(), done: false } as Milestone] }); setItem(""); } };
  return (
    <div className="goal-editor">
      <label className="field"><span>Goal</span><input defaultValue={g.title} onBlur={(e) => e.target.value.trim() && e.target.value !== g.title && save({ title: e.target.value.trim() })} /></label>
      <div className="note-props">
        <label className="field"><span>Area</span>
          <select value={g.area} onChange={(e) => save({ area: e.target.value as GoalArea })}>{Object.entries(GOAL_AREA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field"><span>Measured by</span>
          <select value={g.measure} onChange={(e) => save({ measure: e.target.value as GoalMeasure })}>{Object.entries(GOAL_MEASURE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        {g.measure !== "milestones" && (
          <label className="field"><span>Target{g.measure === "habit" ? " (days)" : g.measure === "project" ? " (tasks, optional)" : ""}</span>
            <input type="number" min={0} defaultValue={g.target ?? ""} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== g.target) save({ target: v && v > 0 ? v : null }); }} />
          </label>
        )}
        {g.measure === "manual" && (
          <>
            <label className="field"><span>So far</span><input type="number" defaultValue={g.current} key={`c${g.current}`} onBlur={(e) => Number(e.target.value) !== Number(g.current) && save({ current: Number(e.target.value) || 0 })} /></label>
            <label className="field"><span>Unit</span><input defaultValue={g.unit} placeholder="papers, talks, km…" onBlur={(e) => e.target.value !== g.unit && save({ unit: e.target.value })} /></label>
          </>
        )}
        {g.measure === "project" && <label className="field"><span>Project</span><ProjectSelect value={g.project_id} onChange={(project_id) => save({ project_id })} /></label>}
        {g.measure === "habit" && (
          <label className="field"><span>Habit</span>
            <select value={g.habit_id ?? ""} onChange={(e) => save({ habit_id: e.target.value || null })}><option value="">Choose…</option>{habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          </label>
        )}
        {g.measure === "savings" && (
          <label className="field"><span>Account</span>
            <select value={g.account_id ?? ""} onChange={(e) => save({ account_id: e.target.value || null })}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.bank_name ? `${a.bank_name} · ` : ""}{a.name}</option>)}</select>
          </label>
        )}
        <label className="field"><span>By</span><DateInput type="date" value={g.due_on ?? ""} onChange={(e) => save({ due_on: e.target.value || null })} /></label>
        <label className="field"><span>Status</span>
          <select value={g.status} onChange={(e) => save({ status: e.target.value as Goal["status"] })}><option value="active">Active</option><option value="achieved">Achieved</option><option value="dropped">Dropped</option></select>
        </label>
      </div>
      {g.measure === "milestones" && (
        <div className="goal-items">
          {g.milestones.map((m, i) => (
            <span key={i} className="row"><span className="grow">{m.label}</span><button className="icon" aria-label={`Remove ${m.label}`} onClick={() => save({ milestones: g.milestones.filter((_, k) => k !== i) })}><X size={14} /></button></span>
          ))}
          <form className="row" onSubmit={(e) => { e.preventDefault(); addItem(); }}>
            <input aria-label="New checklist item" value={item} placeholder="e.g. First draft to supervisor" onChange={(e) => setItem(e.target.value)} />
            <button type="submit" disabled={!item.trim()}><Plus size={14} /> Add</button>
          </form>
        </div>
      )}
      <label className="field"><span>Notes</span><textarea rows={2} defaultValue={g.notes} onBlur={(e) => e.target.value !== g.notes && save({ notes: e.target.value })} /></label>
      <div className="row">
        <button onClick={onClose}>Done</button>
        <button className="danger" onClick={() => void (async () => { if (await ask(`Move “${g.title}” to Trash? You can restore it from Trash.`)) { try { await trash("goals", g.id); } catch (e) { onError((e as Error).message); } } })()}><Trash2 size={14} /> Delete</button>
      </div>
    </div>
  );
}
