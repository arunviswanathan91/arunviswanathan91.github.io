import { useState } from "react";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { supabase as original } from "../../../lib/supabase";
import { insert, list, useLoad } from "../../lib/db.ts";
import { addDays, fmtDate, startOfMonth, startOfWeek, today } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { useSettings } from "../../lib/settings.ts";
import type { BudgetCategory, Habit, HabitCheckin, MonthlyBudget, Note, Paper, Task, Transaction } from "../../lib/types.ts";
import { Empty, ErrorText, PageHeader } from "../../components/ui.tsx";
import { AgendaList, useAgenda } from "../agenda/AgendaView.tsx";
import { formatAmount, summarise } from "../habits/logic.ts";
import { formatMoney } from "../loans/balance.ts";

interface Publication {
  id: string;
  title: string;
  stage: string;
  next_action: string | null;
  updated_at: string;
}

const cents = (n: number) => Math.round(Number(n) * 100);

/** Monday–Sunday look back: what got done, habits, money, what is coming and what is stuck. */
export function ReviewView() {
  const now = today();
  const [weekStart, setWeekStart] = useState(startOfWeek(now));
  const weekEnd = addDays(weekStart, 6);
  const last = weekEnd > now ? now : weekEnd;
  const settings = useSettings();
  const cur = settings.default_currency;
  const { data, error } = useLoad(async () => {
    const [done, tasks, habits, checkins, txs, budgets, categories, papers, pubs] = await Promise.all([
      list<Task>("tasks", { eq: { status: "done" }, gte: ["completed_at", new Date(`${weekStart}T00:00:00`).toISOString()], lt: ["completed_at", new Date(`${addDays(weekEnd, 1)}T00:00:00`).toISOString()] }),
      list<Task>("tasks", { in: ["status", ["todo", "in_progress"]] }),
      list<Habit>("habits", { order: [["position"]] }),
      list<HabitCheckin>("habit_checkins", { gte: ["day", addDays(now, -400)] }),
      list<Transaction>("transactions", { gte: ["occurred_on", weekStart < startOfMonth(weekStart) ? weekStart : startOfMonth(weekStart)], lt: ["occurred_on", addDays(weekEnd, 1)] }),
      list<MonthlyBudget>("monthly_budgets", { eq: { month: startOfMonth(weekEnd) } }),
      list<BudgetCategory>("budget_categories"),
      list<Paper>("papers", { in: ["status", ["reading", "read", "to_cite"]] }),
      original ? original.from("publications").select("id,title,stage,next_action,updated_at").is("deleted_at", null).not("stage", "in", "(Published,Rejected)") : Promise.resolve({ data: [] }),
    ]);
    return { done, tasks, habits, checkins, txs, budgets, categories, papers, pubs: ((pubs as { data: Publication[] | null }).data ?? []) as Publication[] };
  }, [weekStart, weekEnd]);
  const { data: coming } = useAgenda(addDays(last, 1), addDays(last, 7));

  const overdue = data?.tasks.filter((t) => t.due_date && t.due_date < now) ?? [];
  const week = (data?.txs ?? []).filter((t) => t.occurred_on >= weekStart && t.currency === cur);
  const spent = week.filter((t) => t.kind === "expense").reduce((s, t) => s + cents(t.amount), 0);
  const income = week.filter((t) => t.kind === "income").reduce((s, t) => s + cents(t.amount), 0);
  const byCat = new Map<string, number>();
  for (const t of week.filter((x) => x.kind === "expense")) byCat.set(t.category_id ?? "", (byCat.get(t.category_id ?? "") ?? 0) + cents(t.amount));
  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const monthSpent = (data?.txs ?? []).filter((t) => t.kind === "expense" && t.currency === cur && t.occurred_on >= startOfMonth(weekEnd)).reduce((s, t) => s + cents(t.amount), 0);
  const monthBudget = (data?.budgets ?? []).filter((b) => b.currency === cur).reduce((s, b) => s + cents(b.amount), 0);

  const habitRows = (data?.habits ?? []).filter((h) => !h.archived_at).map((h) => {
    const s = summarise(h, data!.checkins, last, settings.habit_pauses ?? []);
    let due = 0;
    let hit = 0;
    for (let d = weekStart; d <= last; d = addDays(d, 1)) {
      const st = s.dayState.get(d);
      if (h.period === "week" || h.period === "month" || !st || st === "off" || st === "paused") continue;
      due++;
      if (st === "done" || st === "made_up") hit++;
    }
    return { h, s, due, hit };
  });

  const finished = data?.papers.filter((p) => p.finished_on && p.finished_on >= weekStart && p.finished_on <= weekEnd) ?? [];
  const reading = data?.papers.filter((p) => p.status === "reading") ?? [];
  const stale = (data?.pubs ?? []).filter((p) => !p.next_action?.trim() || p.updated_at.slice(0, 10) < addDays(now, -30));

  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState("");
  async function saveNote() {
    const lines = [
      `## Done (${data?.done.length ?? 0})`, ...(data?.done ?? []).map((t) => `- ${t.title}`),
      "", "## Habits", ...habitRows.map(({ h, s, due, hit }) => `- ${h.name}: ${h.period === "day" || !h.period ? `${hit}/${due} days` : `${formatAmount(s.now?.logged ?? 0, h.unit)} of ${formatAmount(s.now?.required ?? 0, h.unit)} ${s.scope}`}`),
      "", "## Money", `- Spent ${formatMoney(spent / 100, cur)}, income ${formatMoney(income / 100, cur)}`,
      ...(finished.length ? ["", "## Papers finished", ...finished.map((p) => `- ${p.title}`)] : []),
      "", "## Reflection", reflection || "_(none)_",
    ];
    try {
      const n = await insert<Note>("notes", { title: `Weekly review · ${fmtDate(weekStart, { day: "numeric", month: "short" })}–${fmtDate(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`, type: "daily_log", body: lines.join("\n") });
      go(`notes/${n.id}`);
    } catch (e) {
      setSaving((e as Error).message);
    }
  }

  return (
    <section>
      <PageHeader
        section="review"
        title="Weekly review"
        subtitle={`${fmtDate(weekStart, { day: "numeric", month: "short" })} – ${fmtDate(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`}
        actions={<span className="row">
          <button className="icon" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
          <button className="small" disabled={weekStart === startOfWeek(now)} onClick={() => setWeekStart(startOfWeek(now))}>This week</button>
          <button className="icon" aria-label="Next week" disabled={weekStart >= startOfWeek(now)} onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
        </span>}
      />
      <ErrorText error={error} />
      {data && (
        <div className="review-grid">
          <div className="card pad">
            <h2 className="section-title">Done · {data.done.length}</h2>
            {data.done.length === 0 ? <Empty>No tasks completed this week.</Empty> : (
              <ul className="mini-list">{data.done.slice(0, 12).map((t) => <li key={t.id}>{t.title}</li>)}</ul>
            )}
            {data.done.length > 12 && <p className="muted small">and {data.done.length - 12} more</p>}
            {overdue.length > 0 && <a className="small neg" href={href("tasks", { view: "overdue" })}>{overdue.length} task{overdue.length > 1 ? "s" : ""} overdue →</a>}
          </div>

          <div className="card pad">
            <h2 className="section-title">Habits</h2>
            {habitRows.length === 0 ? <Empty>No habits.</Empty> : (
              <ul className="mini-list">
                {habitRows.map(({ h, s, due, hit }) => (
                  <li key={h.id}>
                    <span>{h.name}</span>
                    <span className="muted small">
                      {h.period === "week" || h.period === "month" ? `${formatAmount(s.now?.logged ?? 0, h.unit)} / ${formatAmount(s.now?.required ?? 0, h.unit)} ${s.scope}` : `${hit} of ${due} day${due === 1 ? "" : "s"}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card pad">
            <h2 className="section-title">Money · {cur}</h2>
            <div className="stat-line"><span>Spent this week</span><strong>{formatMoney(spent / 100, cur)}</strong></div>
            <div className="stat-line"><span>Income this week</span><strong className="pos">{formatMoney(income / 100, cur)}</strong></div>
            {monthBudget > 0 && <div className="stat-line"><span>Month so far</span><strong className={monthSpent > monthBudget ? "neg" : ""}>{formatMoney(monthSpent / 100, cur)} of {formatMoney(monthBudget / 100, cur)}</strong></div>}
            {byCat.size > 0 && (
              <ul className="mini-list">
                {[...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => <li key={id}><span>{catName(id)}</span><span className="muted small">{formatMoney(v / 100, cur)}</span></li>)}
              </ul>
            )}
          </div>

          <div className="card pad">
            <h2 className="section-title">Next 7 days</h2>
            {coming && coming.length > 0 ? <AgendaList rows={coming} now={now} /> : <Empty>Nothing dated.</Empty>}
            <a className="small" href={href("agenda")}>Full agenda →</a>
          </div>

          <div className="card pad">
            <h2 className="section-title">Papers</h2>
            {finished.length > 0 && <p className="small"><strong>Finished:</strong> {finished.map((p) => p.title).join("; ")}</p>}
            {reading.length > 0 ? <p className="small"><strong>Reading:</strong> {reading.map((p) => p.title).join("; ")}</p> : <p className="muted small">Nothing in progress.</p>}
          </div>

          <div className="card pad">
            <h2 className="section-title">Manuscripts needing a next step</h2>
            {stale.length === 0 ? <p className="muted small">Every active manuscript has a next action and moved in the last 30 days.</p> : (
              <ul className="mini-list">
                {stale.map((p) => (
                  <li key={p.id}>
                    <a href={`#/publication/${p.id}`}>{p.title}</a>
                    <span className="muted small">{p.stage}{!p.next_action?.trim() ? " · no next action" : ` · untouched since ${fmtDate(p.updated_at.slice(0, 10), { day: "numeric", month: "short" })}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card pad review-wide">
            <h2 className="section-title">Reflection</h2>
            <textarea rows={4} value={reflection} placeholder="What went well, what got in the way, what to change next week" onChange={(e) => setReflection(e.target.value)} />
            <div className="form-actions">
              {saving && <span className="error small">{saving}</span>}
              <button className="primary" onClick={() => void saveNote()}><NotebookPen size={15} /> Save as note</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
