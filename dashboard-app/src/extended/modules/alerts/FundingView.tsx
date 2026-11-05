import { useState } from "react";
import { CalendarPlus, ExternalLink, Plus, X } from "lucide-react";
import { insert, list, remove, update, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { href, setQuery, type Route } from "../../lib/route.ts";
import { useSettings } from "../../lib/settings.ts";
import { FUNDING_KIND, FUNDING_STATUS, type Deadline, type FundingCall, type FundingKind, type FundingStatus } from "../../lib/types.ts";
import { Badge, Empty, ErrorText, PageHeader, Tabs } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { ask } from "../../../lib/dialogs.tsx";
import { todayISO } from "../loans/balance.ts";
import { daysBetween, relativeDays } from "../planning/logic.ts";
import { useOptimistic } from "../planning/optimistic.ts";
import { CheckNowButton, TopicsEditor, alertsSetupError } from "./shared.tsx";

type View = "new" | "tracking" | "closed";
const TRACKING: FundingStatus[] = ["interested", "applying", "submitted"];
const inView = (c: FundingCall, v: View, today: string) =>
  v === "new" ? c.status === "new" && (!c.closes_on || c.closes_on >= today)
  : v === "tracking" ? TRACKING.includes(c.status)
  : c.status === "awarded" || c.status === "rejected" || (c.status !== "dismissed" && !TRACKING.includes(c.status) && !!c.closes_on && c.closes_on < today);

export function FundingView({ route }: { route: Route }) {
  const view = (route.query.get("view") as View) || "new";
  const today = todayISO();
  const settings = useSettings();
  const { data, error } = useLoad(() => list<FundingCall>("funding_calls", { order: [["closes_on"], ["created_at", false]], limit: 500 }), []);
  const [calls, apply] = useOptimistic(data);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showSources, setShowSources] = useState(false);
  const patch = (c: FundingCall, p: Partial<FundingCall>) => void apply(c.id, p, () => update("funding_calls", c.id, p)).then(setErr);
  const counts = { new: calls.filter((c) => inView(c, "new", today)).length, tracking: calls.filter((c) => inView(c, "tracking", today)).length };
  const shown = calls.filter((c) => inView(c, view, today));
  const noSources = !(settings.funding_topics?.length || settings.funding_feeds?.length);

  async function track(c: FundingCall) {
    setErr(""); setMsg("");
    try {
      let deadline_id = c.deadline_id;
      if (!deadline_id && c.closes_on) {
        const d = await insert<Deadline>("deadlines", {
          title: `Apply: ${c.title}`.slice(0, 200), category: "other", due_date: c.closes_on, priority: "high",
          links: c.url ? [{ label: c.funder || "Call", url: c.url }] : [],
        });
        deadline_id = d.id;
      }
      await update("funding_calls", c.id, { status: "interested", deadline_id });
      setMsg(c.closes_on ? `Tracking “${c.title.slice(0, 50)}”: its closing date is in your Deadlines, agenda and Telegram reminders.` : `Tracking “${c.title.slice(0, 50)}”. It has no closing date; add one to get reminders.`);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section="funding"
        title="Funding"
        subtitle="Grants, fellowships and travel awards that match your work, found every morning, plus any you add yourself."
        actions={<span className="row">
          <button onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>Sources</button>
          <CheckNowButton onResult={setMsg} />
          <button className="primary" onClick={() => void insert("funding_calls", { title: "New funding call", source: "manual", status: "interested" }).then(() => setQuery("view", "tracking")).catch((e) => setErr((e as Error).message))}><Plus size={16} /> Add</button>
        </span>}
      />
      {(showSources || noSources) && (
        <div className="card pad alerts-settings">
          <h2 className="section-title">What to look for</h2>
          <TopicsEditor field="funding_topics" values={settings.funding_topics ?? []} onError={setErr} placeholder="e.g. pancreatic cancer, tumor immunology, obesity"
            hint="Searched daily in Grants.gov (US federal: NIH, NSF, DoD…) and used to filter the feeds below." />
          <h3 className="md-label small-label">Feeds</h3>
          <TopicsEditor field="funding_feeds" values={settings.funding_feeds ?? []} onError={setErr} placeholder="https://… (an RSS or Atom feed of funding calls)"
            hint="Any funder, society or research office that publishes calls as RSS or Atom (for example a university research office, a society’s news feed or a funder’s announcements). Only items mentioning one of your topics are kept." />
          {settings.funding_checked_on && <p className="muted small">Last checked {fmtDate(settings.funding_checked_on)}.</p>}
        </div>
      )}
      <Tabs value={view} options={[["new", "New"], ["tracking", "Tracking"], ["closed", "Closed & decided"]]} counts={counts} onChange={(v) => setQuery("view", v === "new" ? undefined : v)} />
      <ErrorText error={alertsSetupError(error || err)} />
      {msg && <p className="muted small" role="status">{msg}</p>}
      {data && shown.length === 0 && <div className="card pad"><Empty icon={SECTIONS.funding.icon}>{view === "new" ? (noSources ? "Add a topic or a feed above, then press Check now." : "Nothing new. New calls arrive each morning.") : view === "tracking" ? "Track a call from New, or add one yourself." : "Nothing here yet."}</Empty></div>}
      <div className="funding-list">
        {shown.map((c) => {
          const soon = c.closes_on && c.closes_on >= today && daysBetween(today, c.closes_on) <= 14;
          return (
            <article key={c.id} className="card pad funding-call">
              <header className="funding-head">
                {c.source === "manual" ? (
                  <input className="chapter-title" aria-label="Title" defaultValue={c.title} onBlur={(e) => e.target.value.trim() && e.target.value !== c.title && patch(c, { title: e.target.value.trim() })} />
                ) : <strong>{c.title}</strong>}
                <span className="row">
                  <Badge tone="quiet">{FUNDING_KIND[c.kind]}</Badge>
                  {c.closes_on && <Badge tone={soon ? "warn" : undefined}>{c.closes_on < today ? "Closed" : `Closes ${relativeDays(today, c.closes_on)}`}</Badge>}
                </span>
              </header>
              <span className="muted small">{[c.funder, c.closes_on ? `closes ${fmtDate(c.closes_on)}` : "no closing date given", c.amount].filter(Boolean).join(" · ")}</span>
              {c.summary && <span className="small clamp">{c.summary}</span>}
              {c.topics.length > 0 && <span className="note-meta">{c.topics.map((t) => <Badge key={t} tone="quiet">{t}</Badge>)}</span>}
              {c.source === "manual" && (
                <div className="note-props">
                  <label className="field"><span>Funder</span><input defaultValue={c.funder} onBlur={(e) => e.target.value !== c.funder && patch(c, { funder: e.target.value })} /></label>
                  <label className="field"><span>Kind</span><select value={c.kind} onChange={(e) => patch(c, { kind: e.target.value as FundingKind })}>{Object.entries(FUNDING_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="field"><span>Closes</span><input type="date" value={c.closes_on ?? ""} onChange={(e) => patch(c, { closes_on: e.target.value || null })} /></label>
                  <label className="field"><span>Amount</span><input defaultValue={c.amount} placeholder="₹10 lakh / 3 years" onBlur={(e) => e.target.value !== c.amount && patch(c, { amount: e.target.value })} /></label>
                  <label className="field grow"><span>Link</span><input type="url" defaultValue={c.url ?? ""} placeholder="https://" onBlur={(e) => (e.target.value || null) !== c.url && patch(c, { url: e.target.value || null })} /></label>
                </div>
              )}
              <div className="row wrap funding-actions">
                {c.url && <a className="button-like small" href={c.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open call</a>}
                {c.status === "new" ? (
                  <>
                    <button className="small primary" onClick={() => void track(c)}><CalendarPlus size={13} /> Track</button>
                    <button className="small" onClick={() => patch(c, { status: "dismissed" })}><X size={13} /> Not for me</button>
                  </>
                ) : (
                  <>
                    <select aria-label="Status" value={c.status} onChange={(e) => patch(c, { status: e.target.value as FundingStatus })}>{Object.entries(FUNDING_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    {c.deadline_id ? <a className="small" href={href(`deadlines/${c.deadline_id}`)}>Deadline</a> : c.closes_on && <button className="small" onClick={() => void track(c)}><CalendarPlus size={13} /> Add deadline</button>}
                    {c.source === "manual" && <button className="icon danger" aria-label="Delete" onClick={() => void (async () => { if (await ask(`Delete “${c.title}”? This cannot be undone.`)) await remove("funding_calls", { id: c.id }).catch((e) => setErr((e as Error).message)); })()}><X size={14} /></button>}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
