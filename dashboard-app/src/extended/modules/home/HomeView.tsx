import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckSquare, CreditCard, HandCoins, Repeat, Users, Wallet } from "lucide-react";
import { list, useLoad } from "../../lib/db.ts";
import { addDays, fmtDateTime, relDay, startOfMonth, today } from "../../lib/dates.ts";
import { href } from "../../lib/route.ts";
import { SECTIONS, toneStyle, type SectionId } from "../../lib/sections.ts";
import { useSettings } from "../../lib/settings.ts";
import { combine, useFx } from "../../lib/fx.ts";
import type { Deadline, Habit, HabitCheckin, Meeting, MonthlyBudget, Note, Paper, Project, Task, Transaction } from "../../lib/types.ts";
import { openQuick, QUICK_ACTIONS } from "../../components/QuickAdd.tsx";
import { Ring } from "../../components/Ring.tsx";
import { Empty, ErrorText } from "../../components/ui.tsx";
import { DeadlineRows, isOpenDeadline } from "../deadlines/DeadlineRows.tsx";
import { summarise } from "../habits/logic.ts";
import { TodayHabits } from "../habits/HabitsView.tsx";
import { emiPlan, formatMoney, loanStatus, statementPlan, totalsByCurrency, type Loan, type Payment } from "../loans/balance.ts";
import { useLoans } from "../loans/useLoans.ts";
import { MeetingRows } from "../meetings/MeetingRows.tsx";
import { NoteRows } from "../notes/NoteRows.tsx";
import { PaperRows } from "../papers/PaperRows.tsx";
import { inView, isOpen, sortTasks } from "../tasks/logic.ts";
import { TaskList } from "../tasks/TaskList.tsx";

function Card({ title, section, link, linkLabel = "View all", children }: { title: string; section: SectionId; link: string; linkLabel?: string; children: ReactNode }) {
  const Icon = SECTIONS[section].icon;
  return (
    <div className="card pad home-card" style={toneStyle(section)}>
      <div className="section-head">
        <h2 className="section-title"><span className="sec-chip sm" aria-hidden><Icon size={13} /></span> {title}</h2>
        <a href={link}>{linkLabel} →</a>
      </div>
      {children}
    </div>
  );
}

function RingStat({ section, value, label, title, detail, link }: { section: SectionId; value: number; label: string; title: string; detail: string; link: string }) {
  return (
    <a className="ring-wrap" href={link} style={toneStyle(section)}>
      <Ring value={value} label={label} />
      <span className="ring-text"><strong>{title}</strong><span>{detail}</span></span>
    </a>
  );
}

const cents = (n: number) => Math.round(Number(n) * 100);

interface AttentionItem {
  key: string;
  icon: typeof CheckSquare;
  text: string;
  href: string;
  urgent: boolean;
}

/** One line of chips for what needs doing soon; hidden when there is nothing. */
function Attention({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="attention" aria-label="Needs attention">
      {items.map(({ key, icon: Icon, text, href: link, urgent }) => (
        <li key={key} style={{ maxWidth: "100%" }}>
          <a href={link} className={urgent ? "urgent" : ""} title={text}>
            {urgent ? <AlertTriangle size={14} /> : <Icon size={14} />}<span>{text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** EMIs and card bills that are overdue or due within a week. */
function moneyAttention(loans: Loan[], payments: Payment[], now: string): AttentionItem[] {
  const week = addDays(now, 7);
  const out: AttentionItem[] = [];
  for (const l of loans) {
    const name = l.account_name || "Loan";
    const emi = emiPlan(l, payments, now);
    if (emi?.nextDue && emi.nextDue <= week) {
      out.push({ key: `e${l.id}`, icon: HandCoins, text: `${emi.overdueCount ? "EMI overdue" : "EMI"} ${formatMoney(emi.dueNow || emi.nextAmount, l.currency)} · ${name} · ${relDay(emi.nextDue, now)}`, href: href("loans"), urgent: emi.overdueCount > 0 });
      continue;
    }
    const st = statementPlan(l, payments, now);
    if (st && st.dueOn && st.statementLeft > 0 && st.dueOn <= week && (st.dueOn >= now || st.state === "overdue")) {
      const amount = st.minimumLeft > 0 ? `minimum amount due ${formatMoney(st.minimumLeft, l.currency)}` : `total amount due ${formatMoney(st.statementLeft, l.currency)}`;
      out.push({ key: `c${l.id}`, icon: CreditCard, text: `${name}: ${amount} · ${relDay(st.dueOn, now)}`, href: href("loans"), urgent: st.state === "overdue" });
    }
  }
  return out;
}

export function HomeView() {
  const now = today();
  const settings = useSettings();
  const cur = settings.default_currency;
  const { data, error } = useLoad(async () => {
    const startOfToday = new Date(`${now}T00:00:00`).toISOString();
    const [projects, tasks, doneToday, deadlines, papers, notes, meetings, habits, checkins, txs, budgets] = await Promise.all([
      list<Project>("projects", { order: [["updated_at", false]] }),
      list<Task>("tasks"),
      list<Task>("tasks", { eq: { status: "done" }, gte: ["completed_at", startOfToday] }),
      list<Deadline>("deadlines", { in: ["status", ["upcoming", "in_progress"]], order: [["due_date"]] }),
      list<Paper>("papers", { eq: { status: "reading" }, order: [["updated_at", false]], limit: 5 }),
      list<Note>("notes", { order: [["updated_at", false]], limit: 8 }),
      list<Meeting>("meetings", { gte: ["starts_at", new Date(Date.now() - 2 * 3600e3).toISOString()], order: [["starts_at"]], limit: 5 }),
      list<Habit>("habits"),
      list<HabitCheckin>("habit_checkins", { gte: ["day", addDays(now, -400)] }),
      list<Transaction>("transactions", { gte: ["occurred_on", startOfMonth(now)], eq: { kind: "expense" } }),
      list<MonthlyBudget>("monthly_budgets", { eq: { month: startOfMonth(now) } }),
    ]);
    return { projects, tasks, doneToday, deadlines, papers, notes: notes.filter((n) => !n.archived_at).slice(0, 5), meetings: meetings.filter((m) => !m.archived_at), habits, checkins, txs, budgets };
  }, []);
  const { loans, payments } = useLoans();

  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const open = data?.tasks.filter(isOpen) ?? [];
  const dueToday = open.filter((t) => inView(t, "today", now));
  const overdue = open.filter((t) => inView(t, "overdue", now));
  const todays = sortTasks([...overdue, ...dueToday], "all");
  const doneToday = data?.doneToday.length ?? 0;
  const deadlines = data?.deadlines.filter((d) => isOpenDeadline(d) && d.due_date <= addDays(now, 30)) ?? [];
  const nextDeadline = data?.deadlines.find((d) => isOpenDeadline(d) && d.due_date >= now);
  const nextMeeting = data?.meetings.find((m) => m.starts_at >= new Date().toISOString());
  const active = data?.projects.filter((p) => p.status === "active").sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 6) ?? [];

  const habitNow = (data?.habits ?? []).filter((h) => !h.archived_at).map((h) => ({ h, n: summarise(h, data!.checkins, now, settings.habit_pauses ?? []).now })).filter((x) => x.n && x.n.required > 0 && x.n.state !== "paused");
  const habitsDue = habitNow;
  const habitsDone = habitNow.filter((x) => x.n!.state === "done").length;

  const spent = (data?.txs ?? []).filter((t) => t.currency === cur).reduce((s, t) => s + cents(t.amount), 0);
  const budgeted = (data?.budgets ?? []).filter((b) => b.currency === cur).reduce((s, b) => s + cents(b.amount), 0);
  const loanTotals = totalsByCurrency(loans, payments);
  const overdueLoans = loans.filter((l) => loanStatus(l, payments, now) === "overdue").length;
  const fx = useFx(cur, Object.keys(loanTotals).length > 1);
  const loansNetAll = fx ? combine(Object.fromEntries(Object.entries(loanTotals).map(([c, t]) => [c, t.net])), fx) : null;

  return (
    <section>
      <header className="home-hero">
        <div>
          <div className="kicker">{dateLabel}</div>
          <h1>{greeting}, Arun</h1>
          {data && (
            <p className="summary-line">
              <span><CheckSquare size={15} /> <strong>{dueToday.length}</strong> due today{overdue.length > 0 && <>, <strong className="neg">{overdue.length}</strong> overdue</>}</span>
              {nextDeadline && <span><CalendarClock size={15} /> <strong>{nextDeadline.title}</strong> {relDay(nextDeadline.due_date, now)}</span>}
              {nextMeeting && <span><Users size={15} /> <strong>{nextMeeting.title}</strong> {fmtDateTime(nextMeeting.starts_at).replace(/,? \d{4}/, "")}</span>}
            </p>
          )}
        </div>
        {data && (
          <div className="rings">
            <RingStat
              section="tasks"
              link={href("tasks", { view: "today" })}
              value={doneToday + todays.length ? doneToday / (doneToday + todays.length) : 0}
              label={`${doneToday}`}
              title="Tasks"
              detail={todays.length ? `${todays.length} to go` : doneToday ? "all done" : "nothing due"}
            />
            {habitsDue.length > 0 && (
              <RingStat section="habits" link={href("habits")} value={habitsDone / habitsDue.length} label={`${habitsDone}/${habitsDue.length}`} title="Habits" detail="today" />
            )}
            {budgeted > 0 && (
              <RingStat section="budget" link={href("budget")} value={spent / budgeted} label={`${Math.round((100 * spent) / budgeted)}%`} title="Budget" detail={`${formatMoney((budgeted - spent) / 100, cur)} left`} />
            )}
          </div>
        )}
      </header>
      <ErrorText error={error} />
      {data && (
        <Attention
          items={[
            ...moneyAttention(loans, payments, now),
            ...(overdue.length ? [{ key: "tasks", icon: CheckSquare, text: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`, href: href("tasks", { view: "overdue" }), urgent: true }] : []),
            ...deadlines.filter((d) => d.due_date <= addDays(now, 3)).map((d) => ({ key: `d${d.id}`, icon: CalendarClock, text: `${d.title} · ${relDay(d.due_date, now)}`, href: href(`deadlines/${d.id}`), urgent: d.due_date <= now })),
            ...(habitsDue.length - habitsDone > 0 ? [{ key: "habits", icon: Repeat, text: `${habitsDue.length - habitsDone} habit${habitsDue.length - habitsDone > 1 ? "s" : ""} still open: ${habitNow.filter((x) => x.n!.state !== "done").map((x) => x.h.name).join(", ")}`, href: href("habits"), urgent: false }] : []),
            ...(budgeted > 0 && spent > budgeted ? [{ key: "budget", icon: Wallet, text: `Over budget by ${formatMoney((spent - budgeted) / 100, cur)}`, href: href("budget"), urgent: true }] : []),
          ]}
        />
      )}

      <div className="quick-actions" aria-label="Quick add">
        {QUICK_ACTIONS.map(({ kind, label, icon: Icon, section }) => (
          <button key={kind} style={toneStyle(section)} onClick={() => openQuick(kind)}>
            <span className="sec-chip" aria-hidden><Icon size={16} /></span>
            {label}
          </button>
        ))}
      </div>

      {data && (
        <div className="home-grid">
          <Card title="Today" section="tasks" link={href("tasks", { view: "today" })}>
            <TaskList tasks={todays} projects={data.projects} empty="Nothing due today. Enjoy it." />
          </Card>

          <Card title="Upcoming deadlines" section="deadlines" link={href("deadlines")}>
            <DeadlineRows deadlines={deadlines.slice(0, 5)} empty="Nothing in the next 30 days." />
          </Card>

          <Card title="Upcoming meetings" section="meetings" link={href("meetings")}>
            <MeetingRows meetings={data.meetings} empty="No meetings scheduled." />
          </Card>

          <Card title="Habits today" section="habits" link={href("habits")}>
            <TodayHabits habits={data.habits} checkins={data.checkins} />
          </Card>

          <Card title="Active projects" section="projects" link={href("projects")}>
            {active.length === 0 ? (
              <Empty icon={SECTIONS.projects.icon} action={<button className="small" onClick={() => openQuick("project")}>Create a project</button>}>No active projects.</Empty>
            ) : (
              <ul className="mini-list">
                {active.map((p) => {
                  const all = data.tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
                  const done = all.filter((t) => t.status === "done").length;
                  const left = all.length - done;
                  return (
                    <li key={p.id}>
                      <a href={href(`projects/${p.id}`)}>{p.title}</a>
                      <span className="row small muted">
                        {left} open
                        <span className="bar" title={`${done} of ${all.length} tasks done`}><span style={{ width: `${all.length ? (100 * done) / all.length : 0}%` }} /></span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Reading" section="papers" link={href("papers", { status: "reading" })}>
            <PaperRows papers={data.papers} empty="No papers in progress." />
          </Card>

          <Card title="Recent notes" section="notes" link={href("notes")}>
            <NoteRows notes={data.notes} empty="No notes yet." />
          </Card>

          <Card title="Money" section="budget" link={href("budget")} linkLabel="Budget">
            <div className="stat-line"><span>Spent this month</span><strong>{formatMoney(spent / 100, cur)}</strong></div>
            {budgeted > 0 && (
              <>
                <div className={`bar ${spent > budgeted ? "over" : ""}`}><span style={{ width: `${Math.min(100, (100 * spent) / budgeted)}%` }} /></div>
                <p className="small muted" style={{ margin: "4px 0 6px" }}>of {formatMoney(budgeted / 100, cur)} budgeted</p>
              </>
            )}
            {Object.entries(loanTotals).map(([c, t]) => (
              <div className="stat-line" key={c}><span>Loans net {c}</span><strong className={t.net >= 0 ? "pos" : "neg"}>{formatMoney(t.net, c)}</strong></div>
            ))}
            {loansNetAll !== null && <div className="stat-line"><span>Loans net, all ≈ {cur}</span><strong className={loansNetAll >= 0 ? "pos" : "neg"}>{formatMoney(loansNetAll, cur)}</strong></div>}
            {overdueLoans > 0 && <a className="small neg" href={href("loans")}>{overdueLoans} overdue loan{overdueLoans > 1 ? "s" : ""} →</a>}
          </Card>
        </div>
      )}
    </section>
  );
}

