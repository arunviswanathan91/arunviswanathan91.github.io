import { useState } from "react";
import { ArrowDown, ArrowUp, CalendarPlus, Check, MessageSquarePlus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { ask } from "../../../lib/dialogs.tsx";
import { useData } from "../../../lib/store";
import { DateInput } from "../../../components/ui/DateInput";
import { insert, list, remove, trash, update, upsert, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { go, href } from "../../lib/route.ts";
import { addDays } from "../../lib/dates.ts";
import { CHAPTER_STATUS, FEEDBACK_SOURCE, type ChapterStatus, type Deadline, type FeedbackSource, type Thesis, type ThesisChapter, type ThesisFeedback } from "../../lib/types.ts";
import { Badge, Empty, ErrorText, PageHeader } from "../../components/ui.tsx";
import { SECTIONS } from "../../lib/sections.ts";
import { todayISO } from "../loans/balance.ts";
import { moveChapter, relativeDays, thesisProgress, wordsPerDay } from "./logic.ts";
import { Progress } from "./Progress.tsx";
import { useOptimistic } from "./optimistic.ts";

/** Deadline categories that are thesis milestones (they also show in the agenda and Telegram reminders). */
const MILESTONE_CATEGORIES = ["dissertation", "half_time_review", "isp"];
const fmtN = (n: number) => new Intl.NumberFormat("en-IN").format(n);

export function ThesisView() {
  const today = todayISO();
  const { data, error, reload } = useLoad(async () => {
    const [thesis, chapters, feedback, milestones] = await Promise.all([
      list<Thesis>("thesis"),
      list<ThesisChapter>("thesis_chapters", { order: [["position"], ["created_at"]] }),
      list<ThesisFeedback>("thesis_feedback", { order: [["given_on", false], ["created_at", false]] }),
      list<Deadline>("deadlines", { in: ["category", MILESTONE_CATEGORIES], order: [["due_date"]] }),
    ]);
    return { thesis: thesis[0] ?? null, chapters, feedback, milestones };
  }, []);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } };

  const thesis = data?.thesis;
  // Edits show at once and save in the background (undone with a message if a save fails).
  const [chapters, applyChapter] = useOptimistic(data?.chapters);
  const [feedbackRows, applyFeedback] = useOptimistic(data?.feedback);
  const patchChapter = (id: string, patch: Partial<ThesisChapter>) => void applyChapter(id, patch, () => update("thesis_chapters", id, patch)).then(setErr);
  const patchFeedback = (id: string, patch: Partial<ThesisFeedback>) => void applyFeedback(id, patch, () => update("thesis_feedback", id, patch)).then(setErr);
  const progress = thesisProgress(chapters, thesis?.target_words ?? null);
  const pace = wordsPerDay(progress, today, thesis?.submission_on ?? null);
  const openFeedback = feedbackRows.filter((f) => !f.addressed_at);
  const saveThesis = (patch: Partial<Thesis>) => run(() => upsert("thesis", { ...(thesis ? { id: thesis.id } : {}), ...patch }, "user_id"));
  const nextMilestone = (data?.milestones ?? []).find((m) => m.status !== "done" && m.status !== "cancelled" && m.due_date >= today);

  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader
        section="thesis"
        title="Thesis"
        subtitle="Chapters, word counts, supervisor and DAC feedback, and the road to submission."
        actions={<button className="primary" onClick={() => void run(async () => { await insert("thesis_chapters", { title: `Chapter ${chapters.length + 1}`, position: chapters.length + 1 }); })}><Plus size={16} /> Chapter</button>}
      />
      <ErrorText error={setupError(error) || err} />
      {data && (
        <>
          <div className="thesis-top">
            <div className="card pad thesis-summary">
              <textarea className="thesis-title" rows={2} aria-label="Thesis title" placeholder="Working title of your thesis" defaultValue={thesis?.title ?? ""}
                onBlur={(e) => e.target.value !== (thesis?.title ?? "") && void saveThesis({ title: e.target.value })} />
              <div className="thesis-figures">
                <div>
                  <span className="muted small">Submission</span>
                  <strong>{thesis?.submission_on ? relativeDays(today, thesis.submission_on) : "Not set"}</strong>
                  <DateInput type="date" aria-label="Submission date" value={thesis?.submission_on ?? ""} onChange={(e) => void saveThesis({ submission_on: e.target.value || null })} />
                </div>
                <div>
                  <span className="muted small">Words</span>
                  <strong>{fmtN(progress.words)}{progress.target ? <span className="muted"> / {fmtN(progress.target)}</span> : null}</strong>
                  <label className="small muted inline-field">Target <input type="number" min={1} step={1000} defaultValue={thesis?.target_words ?? ""} placeholder="e.g. 60000"
                    onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (thesis?.target_words ?? null)) void saveThesis({ target_words: v }); }} /></label>
                </div>
                <div>
                  <span className="muted small">Chapters final</span>
                  <strong>{progress.final} / {progress.chapters}</strong>
                  {pace != null && <span className="small muted">{fmtN(pace)} words a day to finish on time</span>}
                </div>
              </div>
              <Progress share={progress.share} label="Thesis words written" />
            </div>
            <div className="card pad">
              <div className="section-head">
                <h2 className="section-title">Milestones</h2>
                <button className="small" onClick={() => void run(async () => {
                  const d = await insert<Deadline>("deadlines", { title: "DAC meeting", category: "dissertation", due_date: addDays(today, 30), priority: "high" });
                  go(`deadlines/${d.id}`);
                })}><CalendarPlus size={14} /> Add</button>
              </div>
              {data.milestones.length === 0 ? (
                <p className="muted small">DAC meetings, synopsis, pre-submission seminar: add them as deadlines in the “Dissertation” category and they show here, in the agenda and in Telegram reminders.</p>
              ) : (
                <ul className="milestone-list">
                  {data.milestones.map((m) => (
                    <li key={m.id} className={m.status === "done" ? "done" : m === nextMilestone ? "next" : ""}>
                      <a href={href(`deadlines/${m.id}`)}>{m.title}</a>
                      <span className="muted small">{fmtDate(m.due_date)}{m.status !== "done" && m.due_date >= today ? ` · ${relativeDays(today, m.due_date)}` : m.status === "done" ? " · done" : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card list-card">
            <div className="section-head pad-x">
              <h2 className="section-title">Chapters</h2>
              {openFeedback.length > 0 && <Badge tone="warn">{openFeedback.length} open feedback</Badge>}
            </div>
            {chapters.length === 0 ? (
              <Empty icon={SECTIONS.thesis.icon}>No chapters yet. Add your chapters (Introduction, Review of literature, Methods, Results…) with “+ Chapter”.</Empty>
            ) : (
              <ul className="chapter-list">
                {chapters.map((c, i) => {
                  const fb = feedbackRows.filter((f) => f.chapter_id === c.id);
                  const pending = fb.filter((f) => !f.addressed_at).length;
                  const share = c.target_words ? Math.min(1, c.words / c.target_words) : null;
                  return (
                    <li key={c.id} className={open === c.id ? "open" : ""}>
                      <div className="chapter-row">
                        <span className="row chapter-move">
                          <button className="icon" aria-label={`Move ${c.title} up`} disabled={i === 0} onClick={() => void run(() => Promise.all(moveChapter(chapters, c.id, -1).map((m) => update("thesis_chapters", m.id, { position: m.position }))))}><ArrowUp size={14} /></button>
                          <button className="icon" aria-label={`Move ${c.title} down`} disabled={i === chapters.length - 1} onClick={() => void run(() => Promise.all(moveChapter(chapters, c.id, 1).map((m) => update("thesis_chapters", m.id, { position: m.position }))))}><ArrowDown size={14} /></button>
                        </span>
                        <input className="chapter-title" aria-label="Chapter title" defaultValue={c.title} onBlur={(e) => e.target.value.trim() && e.target.value !== c.title && void run(() => update("thesis_chapters", c.id, { title: e.target.value.trim() }))} />
                        <select aria-label={`Status of ${c.title}`} value={c.status} onChange={(e) => patchChapter(c.id, { status: e.target.value as ChapterStatus })}>
                          {Object.entries(CHAPTER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <label className="inline-field small"><span className="sr-only">Words in {c.title}</span>
                          <input type="number" min={0} step={100} defaultValue={c.words} key={`w${c.words}`} onBlur={(e) => Number(e.target.value) !== c.words && void run(() => update("thesis_chapters", c.id, { words: Math.max(0, Number(e.target.value) || 0) }))} />
                          <span className="muted">/</span>
                          <input type="number" min={1} step={500} placeholder="target" aria-label={`Word target for ${c.title}`} defaultValue={c.target_words ?? ""} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== c.target_words) void run(() => update("thesis_chapters", c.id, { target_words: v })); }} />
                        </label>
                        <span className="chapter-bar"><Progress share={share} label={`${c.title}: words against target`} /></span>
                        <button className={`chip-toggle ${pending ? "warn" : ""}`} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                          {fb.length ? `${pending ? `${pending} open` : "All addressed"} · ${fb.length} feedback` : "Feedback & notes"}
                        </button>
                      </div>
                      {open === c.id && <ChapterDetail chapter={c} feedback={fb} patch={(p) => patchChapter(c.id, p)} patchFeedback={patchFeedback} onError={setErr} onChanged={() => void reload()} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {feedbackRows.some((f) => !f.chapter_id) && (
            <div className="card pad"><FeedbackList items={feedbackRows.filter((f) => !f.chapter_id)} title="Feedback on the whole thesis" patch={patchFeedback} onError={setErr} /></div>
          )}
        </>
      )}
    </section>
  );
}

export const setupError = (error: string) =>
  /ws_thesis|ws_goals|ws_trips|schema cache|does not exist/i.test(error) ? "This page needs its database tables: run supabase/planning.sql in the Supabase SQL Editor, then reload." : error;

function ChapterDetail({ chapter, feedback, patch, patchFeedback, onError, onChanged }: { chapter: ThesisChapter; feedback: ThesisFeedback[]; patch: (p: Partial<ThesisChapter>) => void; patchFeedback: (id: string, p: Partial<ThesisFeedback>) => void; onError: (e: string) => void; onChanged: () => void }) {
  const publications = useData().tables.publications.rows;
  const [source, setSource] = useState<FeedbackSource>("supervisor");
  const [body, setBody] = useState("");
  const run = async (fn: () => Promise<unknown>) => { onError(""); try { await fn(); } catch (e) { onError((e as Error).message); } };
  return (
    <div className="chapter-detail">
      <div className="note-props">
        <label className="field"><span>Due</span><DateInput type="date" value={chapter.due_on ?? ""} onChange={(e) => patch({ due_on: e.target.value || null })} /></label>
        <label className="field"><span>Built on manuscript</span>
          <select value={chapter.publication_id ?? ""} onChange={(e) => patch({ publication_id: e.target.value || null })}>
            <option value="">None</option>
            {publications.map((p) => <option key={p.id} value={p.id}>{String(p.title ?? "Untitled").slice(0, 70)}</option>)}
          </select>
        </label>
        <label className="field grow"><span>Notes</span>
          <textarea rows={2} defaultValue={chapter.notes} placeholder="Structure, figures to make, what is missing…" onBlur={(e) => e.target.value !== chapter.notes && void run(() => update("thesis_chapters", chapter.id, { notes: e.target.value }))} />
        </label>
      </div>
      <FeedbackList items={feedback} title="Feedback" patch={patchFeedback} onError={onError} />
      <form className="feedback-add" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; void run(async () => { await insert("thesis_feedback", { chapter_id: chapter.id, source, body: body.trim() }); setBody(""); }); }}>
        <select aria-label="Feedback from" value={source} onChange={(e) => setSource(e.target.value as FeedbackSource)}>
          {Object.entries(FEEDBACK_SOURCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input aria-label="New feedback" value={body} placeholder="e.g. Add a schematic of the HFD model to Fig 1" onChange={(e) => setBody(e.target.value)} />
        <button type="submit" disabled={!body.trim()}><MessageSquarePlus size={14} /> Add</button>
      </form>
      <div className="row">
        <button className="danger small" onClick={() => void run(async () => { if (await ask(`Move “${chapter.title}” and its feedback to Trash? You can restore it from Trash.`)) { await trash("thesis_chapters", chapter.id); onChanged(); } })}><Trash2 size={14} /> Delete chapter</button>
      </div>
    </div>
  );
}

function FeedbackList({ items, title, patch, onError }: { items: ThesisFeedback[]; title: string; patch: (id: string, p: Partial<ThesisFeedback>) => void; onError: (e: string) => void }) {
  const run = async (fn: () => Promise<unknown>) => { onError(""); try { await fn(); } catch (e) { onError((e as Error).message); } };
  if (!items.length) return <p className="muted small">No feedback yet.</p>;
  return (
    <div>
      <h3 className="md-label small-label">{title}</h3>
      <ul className="feedback-list">
        {items.map((f) => (
          <li key={f.id} className={f.addressed_at ? "addressed" : ""}>
            <Badge tone={f.source === "dac" || f.source === "examiner" ? "warn" : "quiet"}>{FEEDBACK_SOURCE[f.source]}</Badge>
            <span className="feedback-body">{f.body}</span>
            <span className="muted small">{fmtDate(f.given_on)}</span>
            <button className="icon" aria-label={f.addressed_at ? "Mark as not addressed" : "Mark as addressed"} title={f.addressed_at ? `Addressed ${fmtDate(f.addressed_at)}` : "Mark as addressed"}
              onClick={() => patch(f.id, { addressed_at: f.addressed_at ? null : new Date().toISOString() })}>
              {f.addressed_at ? <RotateCcw size={14} /> : <Check size={14} />}
            </button>
            <button className="icon danger" aria-label="Delete feedback" onClick={() => void run(async () => { if (await ask("Delete this feedback? This cannot be undone.")) await remove("thesis_feedback", { id: f.id }); })}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
