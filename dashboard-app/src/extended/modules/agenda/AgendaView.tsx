import { useState } from "react";
import { BriefcaseBusiness, CalendarClock, CalendarPlus, CheckSquare, Copy, CreditCard, Download, FileText, HandCoins, Repeat, Users, type LucideIcon } from "lucide-react";
import { rpc, useLoad } from "../../lib/db.ts";
import { addDays, fmtDate, fmtTime, relDay, today } from "../../lib/dates.ts";
import { downloadBlob } from "../../lib/download.ts";
import { buildIcs } from "../../lib/ics.ts";
import { saveSettings, useSettings } from "../../lib/settings.ts";
import { Empty, ErrorText, PageHeader } from "../../components/ui.tsx";

/** One dated item from ws_agenda (tasks, deadlines, meetings, papers, applications, EMIs, card bills, recurring). */
export interface AgendaRow {
  kind: "task" | "deadline" | "meeting" | "publication" | "opportunity" | "emi" | "card" | "recurring";
  ref_id: string;
  title: string;
  day: string;
  at: string | null;
  detail: string | null;
  /** Dashboard hash after "#/". */
  path: string;
  urgent: boolean;
}

export const KIND: Record<AgendaRow["kind"], { label: string; icon: LucideIcon }> = {
  task: { label: "Tasks", icon: CheckSquare },
  deadline: { label: "Deadlines", icon: CalendarClock },
  meeting: { label: "Meetings", icon: Users },
  publication: { label: "Papers", icon: FileText },
  opportunity: { label: "Applications", icon: BriefcaseBusiness },
  emi: { label: "EMIs", icon: HandCoins },
  card: { label: "Card bills", icon: CreditCard },
  recurring: { label: "Recurring", icon: Repeat },
};

/** Things still open in the past: meetings and recurring items never count as overdue. */
export const isOverdue = (r: AgendaRow, now: string) => r.day < now && r.kind !== "meeting" && r.kind !== "recurring";

export function useAgenda(from: string, to: string) {
  return useLoad(() => rpc<AgendaRow[]>("agenda", { p_from: from, p_to: to }), [from, to]);
}

export const toIcs = (rows: AgendaRow[], base = location.href.replace(/#.*$/, "")) =>
  buildIcs(rows.map((r) => ({ uid: `${r.kind}-${r.ref_id}-${r.day}`, title: r.title, day: r.day, at: r.at, detail: r.detail, url: `${base}#/${r.path}` })), "Arun’s workspace");

const RANGES = [7, 30, 90] as const;

export function AgendaView() {
  const now = today();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [hidden, setHidden] = useState<Set<AgendaRow["kind"]>>(new Set());
  const { data, error } = useAgenda(addDays(now, -60), addDays(now, days));
  const rows = (data ?? []).filter((r) => !hidden.has(r.kind) && (r.day >= now || isOverdue(r, now)));
  const overdue = rows.filter((r) => r.day < now);
  const upcoming = rows.filter((r) => r.day >= now);
  const byDay = new Map<string, AgendaRow[]>();
  for (const r of upcoming) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  const kinds = [...new Set((data ?? []).map((r) => r.kind))];

  function toggle(kind: AgendaRow["kind"]) {
    const next = new Set(hidden);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setHidden(next);
  }

  return (
    <section>
      <PageHeader
        section="agenda"
        title="Agenda"
        subtitle="Everything with a date, in one list: tasks, deadlines, meetings, papers, applications, EMIs, card bills and recurring payments."
        actions={<button onClick={() => downloadBlob(new Blob([toIcs(upcoming)], { type: "text/calendar" }), `agenda-${now}.ics`)} title="Open in Google, Apple or Outlook calendar"><Download size={15} /> .ics</button>}
      />
      <ErrorText error={error} />
      <div className="agenda-controls">
        <div className="segmented three" role="radiogroup" aria-label="Range">
          {RANGES.map((n) => <button key={n} type="button" role="radio" aria-checked={days === n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n} days</button>)}
        </div>
        <div className="chip-filter" aria-label="Show">
          {kinds.map((k) => {
            const Icon = KIND[k].icon;
            return <button key={k} type="button" aria-pressed={!hidden.has(k)} className={hidden.has(k) ? "" : "on"} onClick={() => toggle(k)}><Icon size={13} /> {KIND[k].label}</button>;
          })}
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          {data && rows.length === 0 && <div className="card pad"><Empty icon={CalendarClock}>Nothing dated in the next {days} days.</Empty></div>}
          {overdue.length > 0 && (
            <div className="card pad agenda-day overdue">
              <h2 className="section-title neg">Overdue</h2>
              <AgendaList rows={overdue} now={now} />
            </div>
          )}
          {[...byDay.entries()].map(([day, list]) => (
            <div className="card pad agenda-day" key={day}>
              <h2 className="section-title">{day === now ? "Today" : day === addDays(now, 1) ? "Tomorrow" : fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}</h2>
              <AgendaList rows={list} now={now} />
            </div>
          ))}
        </div>
        <aside className="detail-side">
          <FeedCard />
        </aside>
      </div>
    </section>
  );
}

export function AgendaList({ rows, now }: { rows: AgendaRow[]; now: string }) {
  return (
    <ul className="agenda-list">
      {rows.map((r) => {
        const Icon = KIND[r.kind].icon;
        return (
          <li key={`${r.kind}-${r.ref_id}-${r.day}`} className={r.urgent || isOverdue(r, now) ? "urgent" : ""}>
            <span className="agenda-icon" aria-hidden><Icon size={14} /></span>
            <a href={`#/${r.path}`} className="agenda-title">{r.title}</a>
            <span className="muted small agenda-meta">
              {r.at ? fmtTime(r.at) : r.day < now ? relDay(r.day, now) : ""}{r.detail ? `${r.at || r.day < now ? " · " : ""}${r.detail}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Subscribe link for Google / Apple Calendar, backed by the calendar-feed Edge Function. */
function FeedCard() {
  const settings = useSettings();
  const token = settings.calendar_token ?? null;
  const [state, setState] = useState("");
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
  const url = token && base ? `${base}/functions/v1/calendar-feed?token=${token}` : null;
  async function set(next: string | null) {
    try {
      await saveSettings({ calendar_token: next });
      setState(next ? "Feed link created." : "Feed link turned off; calendars using it stop updating.");
    } catch (e) {
      setState((e as Error).message);
    }
  }
  return (
    <div className="card pad">
      <h3><CalendarPlus size={14} /> Calendar feed</h3>
      <p className="muted small">Subscribe once in Google or Apple Calendar and the agenda stays in sync (calendars refresh every few hours). Anyone with the link can read it, so keep it private.</p>
      {url ? (
        <>
          <input readOnly aria-label="Calendar feed link" value={url} onFocus={(e) => e.target.select()} />
          <div className="row wrap">
            <button className="small" onClick={() => void navigator.clipboard?.writeText(url).then(() => setState("Copied."))}><Copy size={13} /> Copy</button>
            <a className="small button-link" target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(url.replace(/^https:/, "webcal:"))}`}>Add to Google Calendar</a>
            <button className="small" onClick={() => void set(crypto.randomUUID())}>New link</button>
            <button className="small" onClick={() => void set(null)}>Turn off</button>
          </div>
        </>
      ) : (
        <button className="primary" onClick={() => void set(crypto.randomUUID())}>Create feed link</button>
      )}
      {state && <p className="muted small">{state}</p>}
    </div>
  );
}
