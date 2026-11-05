import { useState } from "react";
import { ArrowLeft, CalendarPlus, ExternalLink, Plus, Trash2, Wallet, X } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { useData } from "../../../lib/store";
import { DateInput } from "../../../components/ui/DateInput";
import { getOne, insert, trash, update, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { useAutosave } from "../../lib/useAutosave.ts";
import { PRESENTATION, TRIP_KIND, TRIP_STATUS, type Deadline, type Milestone, type Presentation, type Trip, type TripCost, type TripFunding, type TripKind, type TripStatus } from "../../lib/types.ts";
import { MarkdownEditor } from "../../components/Markdown.tsx";
import { ProjectSelect } from "../../components/pickers.tsx";
import { Empty, ErrorText, Loading, SaveIndicator } from "../../components/ui.tsx";
import { CURRENCY_OPTIONS } from "../../../lib/currencies";
import { formatMoney, todayISO } from "../loans/balance.ts";
import { nextTripDate, relativeDays, tripMoney, unrecorded } from "./logic.ts";
import { setupError } from "./ThesisView.tsx";

export function TripPage({ id }: { id: string }) {
  const { data: trip, error, loading } = useLoad(() => getOne<Trip>("trips", id), [id]);
  if (error) return <ErrorText error={setupError(error)} />;
  // Never build the editor from the previous trip while this one loads.
  if ((loading && !trip) || (trip && trip.id !== id)) return <Loading rows={8} />;
  if (!trip) return <Empty>This trip doesn’t exist (it may have been deleted). <a href={href("trips")}>Back to trips</a></Empty>;
  return <TripEditor key={id} initial={trip} />;
}

function TripEditor({ initial }: { initial: Trip }) {
  const [t, setT] = useState(initial);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const today = todayISO();
  const publications = useData().tables.publications.rows;
  const autosave = useAutosave<Trip>(async (patch) => {
    const row = await update<Trip>("trips", t.id, patch, true);
    setT((x) => ({ ...x, updated_at: row.updated_at }));
  });
  const change = (patch: Partial<Trip>) => { setT((x) => ({ ...x, ...patch })); autosave.change(patch); };
  const blur = () => void autosave.flush();
  const money = tripMoney(t);
  const next = nextTripDate(t, today);

  async function toDeadline(kind: "abstract" | "registration" | "trip") {
    setErr(""); setNote("");
    const date = kind === "abstract" ? t.abstract_due : kind === "registration" ? t.registration_due : t.starts_on;
    if (!date) return setErr(`Set the ${kind === "trip" ? "start" : kind} date first.`);
    try {
      await insert<Deadline>("deadlines", {
        title: kind === "abstract" ? `Abstract: ${t.title}` : kind === "registration" ? `Register: ${t.title}` : t.title,
        category: kind === "abstract" ? "abstract_submission" : "conference",
        due_date: date, priority: kind === "trip" ? "medium" : "high", project_id: t.project_id,
        links: [{ label: "Trip plan", url: `${location.origin}${location.pathname}#/tools/trips/${t.id}` }, ...(t.url ? [{ label: "Website", url: t.url }] : [])],
      });
      setNote(`Added to Deadlines: it now shows in your agenda and Telegram reminders.`);
    } catch (e) { setErr((e as Error).message); }
  }

  async function recordCost(i: number) {
    setErr(""); setNote("");
    const c = t.costs[i];
    try {
      const tx = await insert<{ id: string }>("transactions", {
        kind: "expense", description: `${t.title}: ${c.label}`.slice(0, 200), amount: c.amount, currency: t.currency,
        occurred_on: today, notes: "Recorded from the trip planner",
      });
      change({ costs: t.costs.map((x, k) => (k === i ? { ...x, paid: true, transaction_id: tx.id } : x)) });
      setNote(`Recorded “${c.label}” in Budget for today. Open Budget to set its category or account.`);
    } catch (e) { setErr((e as Error).message); }
  }

  async function del() {
    if (!(await ask(`Move “${t.title}” to Trash? You can restore it from Trash.`))) return;
    await autosave.flush();
    await trash("trips", t.id);
    go("trips");
  }

  const setCost = (i: number, patch: Partial<TripCost>) => change({ costs: t.costs.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const setFund = (i: number, patch: Partial<TripFunding>) => change({ funding: t.funding.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const setCheck = (list: Milestone[]) => change({ checklist: list });
  const [newCheck, setNewCheck] = useState("");

  return (
    <section className="detail trip">
      <a className="back" href={href("trips")}><ArrowLeft size={14} /> Conferences &amp; trips</a>
      <header className="detail-head note-head">
        <input className="title-input" aria-label="Title" value={t.title} onChange={(e) => change({ title: e.target.value })} onBlur={blur} />
        <div className="page-actions">
          <SaveIndicator status={autosave.status} error={autosave.error} />
          {t.url && <a className="button-like" href={t.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Website</a>}
          <button className="icon danger" aria-label="Delete trip" onClick={() => void del()}><Trash2 size={16} /></button>
        </div>
      </header>
      {next && <p className="notice">{next.label} {relativeDays(today, next.date)} ({fmtDate(next.date)}).</p>}
      <ErrorText error={err} />
      {note && <p className="muted small" role="status">{note}</p>}

      <div className="note-props">
        <label className="field"><span>Status</span>
          <select value={t.status} onChange={(e) => change({ status: e.target.value as TripStatus })}>{Object.entries(TRIP_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field"><span>Kind</span>
          <select value={t.kind} onChange={(e) => change({ kind: e.target.value as TripKind })}>{Object.entries(TRIP_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field"><span>Presenting</span>
          <select value={t.presentation} onChange={(e) => change({ presentation: e.target.value as Presentation })}>{Object.entries(PRESENTATION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="field"><span>Where</span><input value={t.location} placeholder="City, country" onChange={(e) => change({ location: e.target.value })} onBlur={blur} /></label>
        <label className="field"><span>Starts</span><DateInput type="date" value={t.starts_on ?? ""} onChange={(e) => change({ starts_on: e.target.value || null })} /></label>
        <label className="field"><span>Ends</span><DateInput type="date" value={t.ends_on ?? ""} min={t.starts_on ?? undefined} onChange={(e) => change({ ends_on: e.target.value || null })} /></label>
        <label className="field"><span>Abstract due</span><DateInput type="date" value={t.abstract_due ?? ""} onChange={(e) => change({ abstract_due: e.target.value || null })} /></label>
        <label className="field"><span>Registration due</span><DateInput type="date" value={t.registration_due ?? ""} onChange={(e) => change({ registration_due: e.target.value || null })} /></label>
        <label className="field"><span>Website</span><input type="url" value={t.url ?? ""} placeholder="https://" onChange={(e) => change({ url: e.target.value || null })} onBlur={blur} /></label>
        <label className="field"><span>Project</span><ProjectSelect value={t.project_id} onChange={(project_id) => change({ project_id })} /></label>
        <label className="field"><span>Presenting work from</span>
          <select value={t.publication_id ?? ""} onChange={(e) => change({ publication_id: e.target.value || null })}>
            <option value="">No manuscript</option>
            {publications.map((p) => <option key={p.id} value={p.id}>{String(p.title ?? "Untitled").slice(0, 70)}</option>)}
          </select>
        </label>
      </div>
      <div className="row wrap trip-deadline-buttons">
        <span className="muted small">Add to Deadlines (agenda + reminders):</span>
        <button className="small" onClick={() => void toDeadline("abstract")}><CalendarPlus size={14} /> Abstract</button>
        <button className="small" onClick={() => void toDeadline("registration")}><CalendarPlus size={14} /> Registration</button>
        <button className="small" onClick={() => void toDeadline("trip")}><CalendarPlus size={14} /> The trip</button>
      </div>

      <div className="experiment-grid">
        <div className="card pad">
          <label className="field"><span>Abstract title</span><input value={t.abstract_title} onChange={(e) => change({ abstract_title: e.target.value })} onBlur={blur} /></label>
          <MarkdownEditor editIfEmpty label="Abstract" value={t.abstract} rows={6} onChange={(abstract) => change({ abstract })} onBlur={blur} />
        </div>

        <div className="card pad">
          <div className="section-head">
            <h3 className="md-label">Costs</h3>
            <span className="row">
              <select aria-label="Currency" value={t.currency} onChange={(e) => change({ currency: e.target.value })}>{CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}</select>
              <button className="small" onClick={() => change({ costs: [...t.costs, { label: "", amount: 0, paid: false }] })}><Plus size={14} /> Cost</button>
            </span>
          </div>
          {t.costs.length === 0 ? <p className="muted small">Registration, flights, accommodation, visa, poster printing…</p> : (
            <div className="table-scroll"><table className="samples-table">
              <thead><tr><th>Item</th><th>Amount</th><th>Paid</th><th aria-label="Budget" /><th aria-label="Remove" /></tr></thead>
              <tbody>
                {t.costs.map((c, i) => (
                  <tr key={i}>
                    <td><input aria-label="Cost item" value={c.label} placeholder="Registration" onChange={(e) => setCost(i, { label: e.target.value })} onBlur={blur} /></td>
                    <td><input aria-label="Amount" type="number" min={0} value={c.amount || ""} onChange={(e) => setCost(i, { amount: Number(e.target.value) || 0 })} onBlur={blur} /></td>
                    <td><input aria-label="Paid" type="checkbox" checked={c.paid} onChange={(e) => setCost(i, { paid: e.target.checked })} /></td>
                    <td>{c.transaction_id ? <a className="small" href={href("budget")}>In budget</a> : <button className="small" disabled={!c.amount || !c.label.trim()} title="Add this as an expense in Budget, dated today" onClick={() => void recordCost(i)}><Wallet size={13} /> Record</button>}</td>
                    <td><button className="icon" aria-label={`Remove ${c.label || "cost"}`} onClick={() => change({ costs: t.costs.filter((_, k) => k !== i) })}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {money.total > 0 && (
            <p className="small trip-money">
              Total <strong>{formatMoney(money.total, t.currency)}</strong> · paid {formatMoney(money.paid, t.currency)}
              {money.awarded > 0 && <> · funded {formatMoney(money.awarded, t.currency)}</>}
              {money.pending > 0 && <> · {formatMoney(money.pending, t.currency)} applied for</>}
              {" "}· <strong>{formatMoney(money.outOfPocket, t.currency)}</strong> out of pocket
              {unrecorded(t.costs).length > 0 && <span className="muted"> · {unrecorded(t.costs).length} not yet in Budget</span>}
            </p>
          )}
        </div>

        <div className="card pad">
          <div className="section-head">
            <h3 className="md-label">Travel awards &amp; funding</h3>
            <button className="small" onClick={() => change({ funding: [...t.funding, { source: "", amount: 0, status: "applied", due_on: null }] })}><Plus size={14} /> Funding</button>
          </div>
          {t.funding.length === 0 ? <p className="muted small">Conference travel awards, DBT/ICMR/CSIR travel grants, institute support…</p> : (
            <div className="table-scroll"><table className="samples-table">
              <thead><tr><th>Source</th><th>Amount</th><th>Status</th><th>Due</th><th aria-label="Remove" /></tr></thead>
              <tbody>
                {t.funding.map((f, i) => (
                  <tr key={i}>
                    <td><input aria-label="Funding source" value={f.source} placeholder="AACR travel award" onChange={(e) => setFund(i, { source: e.target.value })} onBlur={blur} /></td>
                    <td><input aria-label="Amount" type="number" min={0} value={f.amount || ""} onChange={(e) => setFund(i, { amount: Number(e.target.value) || 0 })} onBlur={blur} /></td>
                    <td><select aria-label="Status" value={f.status} onChange={(e) => setFund(i, { status: e.target.value as TripFunding["status"] })}><option value="applied">Applied</option><option value="awarded">Awarded</option><option value="declined">Declined</option></select></td>
                    <td><input aria-label="Application due" type="date" value={f.due_on ?? ""} onChange={(e) => setFund(i, { due_on: e.target.value || null })} /></td>
                    <td><button className="icon" aria-label={`Remove ${f.source || "funding"}`} onClick={() => change({ funding: t.funding.filter((_, k) => k !== i) })}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="card pad">
          <h3 className="md-label">Checklist <span className="muted small">{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span></h3>
          <ul className="goal-milestones">
            {t.checklist.map((c, i) => (
              <li key={i} className="row">
                <label className="grow"><input type="checkbox" checked={c.done} onChange={() => setCheck(t.checklist.map((x, k) => (k === i ? { ...x, done: !x.done } : x)))} /> {c.label}</label>
                <button className="icon" aria-label={`Remove ${c.label}`} onClick={() => setCheck(t.checklist.filter((_, k) => k !== i))}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (newCheck.trim()) { setCheck([...t.checklist, { label: newCheck.trim(), done: false }]); setNewCheck(""); } }}>
            <input aria-label="New checklist item" value={newCheck} placeholder="e.g. Print poster (A0)" onChange={(e) => setNewCheck(e.target.value)} />
            <button type="submit" disabled={!newCheck.trim()}><Plus size={14} /> Add</button>
          </form>
        </div>

        <div className="card pad">
          <MarkdownEditor editIfEmpty label="Notes" value={t.notes} rows={4} placeholder="Sessions to attend, people to meet, hotel booking reference…" onChange={(notes) => change({ notes })} onBlur={blur} />
        </div>
      </div>
    </section>
  );
}
