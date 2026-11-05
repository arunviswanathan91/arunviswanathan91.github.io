import { useState } from "react";
import { BookmarkPlus, ExternalLink, X } from "lucide-react";
import { insert, list, update, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { href } from "../../lib/route.ts";
import { useSettings } from "../../lib/settings.ts";
import type { Paper, PaperAlert } from "../../lib/types.ts";
import { Badge, Empty, ErrorText } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { useOptimistic } from "../planning/optimistic.ts";
import { CheckNowButton, TopicsEditor, alertsSetupError } from "./shared.tsx";

/** Papers → Alerts: new papers and preprints matching your topics, found each morning. */
export function PaperAlerts() {
  const settings = useSettings();
  const { data, error } = useLoad(() => list<PaperAlert>("paper_alerts", { eq: { status: "new" }, order: [["score", false], ["published_on", false]], limit: 200 }), []);
  const [alerts, apply] = useOptimistic(data);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const topics = settings.paper_alert_topics ?? [];
  const shown = alerts.filter((a) => a.status === "new");

  async function save(a: PaperAlert) {
    setErr("");
    const e = await apply(a.id, { status: "saved" }, async () => {
      const p = await insert<Paper>("papers", {
        title: a.title, authors: a.authors, year: a.published_on ? Number(a.published_on.slice(0, 4)) : null, publication: a.journal,
        doi: a.doi, pmid: a.pmid, url: a.url, abstract: a.abstract, status: "to_read", tags: [],
      });
      await update("paper_alerts", a.id, { status: "saved", paper_id: p.id });
    });
    setErr(e);
    if (!e) setMsg(`Saved “${a.title.slice(0, 60)}${a.title.length > 60 ? "…" : ""}” to your library (To read).`);
  }
  const dismiss = async (a: PaperAlert) => setErr(await apply(a.id, { status: "dismissed" }, () => update("paper_alerts", a.id, { status: "dismissed" }, true)));
  const dismissAll = async () => { for (const a of shown) await dismiss(a); };

  return (
    <div className="alerts">
      <div className="card pad alerts-settings">
        <div className="section-head">
          <h2 className="section-title">Your topics</h2>
          <span className="row"><CheckNowButton onResult={setMsg} /></span>
        </div>
        <TopicsEditor
          field="paper_alert_topics" values={topics} onError={setErr}
          placeholder={'e.g. obesity AND "pancreatic cancer"'}
          hint={<>Checked every morning in PubMed and preprint servers (bioRxiv, medRxiv…), in titles and abstracts. Use AND, OR and "quotes"; AUTH:"Harikumar KB" follows an author.{settings.paper_alerts_checked_on ? ` Last checked ${fmtDate(settings.paper_alerts_checked_on)}.` : ""}</>}
        />
      </div>
      <ErrorText error={alertsSetupError(error || err)} />
      {msg && <p className="muted small" role="status">{msg}</p>}
      <div className="card list-card">
        <div className="section-head pad-x">
          <h2 className="section-title">New for you {shown.length > 0 && <span className="muted small">{shown.length}</span>}</h2>
          {shown.length > 1 && <button className="small" onClick={() => void dismissAll()}>Dismiss all</button>}
        </div>
        {data && shown.length === 0 && <Empty icon={SECTIONS.papers.icon}>{topics.length ? "Nothing new. New matches arrive each morning." : "Add a topic above and new papers on it will appear here every morning."}</Empty>}
        <ul className="alert-list">
          {shown.map((a) => (
            <li key={a.id}>
              <div className="alert-main">
                <button className="link-button alert-title" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{a.title}</button>
                <span className="muted small">
                  {a.authors.slice(0, 3).join(", ")}{a.authors.length > 3 ? " et al." : ""}{a.journal ? ` · ${a.journal}` : ""}{a.published_on ? ` · ${fmtDate(a.published_on)}` : ""}
                </span>
                <span className="note-meta">
                  {a.source === "preprint" && <Badge tone="warn">Preprint</Badge>}
                  {a.topics.map((t) => <Badge key={t} tone="quiet">{t}</Badge>)}
                </span>
                {open === a.id && <p className="small alert-abstract">{a.abstract || "No abstract available."}</p>}
              </div>
              <span className="row alert-actions">
                {a.url && <a className="icon button-like" href={a.url} target="_blank" rel="noreferrer" aria-label="Open the paper"><ExternalLink size={15} /></a>}
                <button className="small primary" onClick={() => void save(a)}><BookmarkPlus size={14} /> Save</button>
                <button className="icon" aria-label={`Dismiss ${a.title}`} onClick={() => void dismiss(a)}><X size={15} /></button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted small">Saved papers go to your <a href={href("papers", { status: "to_read" })}>To read</a> list.</p>
    </div>
  );
}
