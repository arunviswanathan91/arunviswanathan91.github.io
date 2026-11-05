import { Pin, Repeat2 } from "lucide-react";
import { fmtDate } from "../../lib/dates.ts";
import { href } from "../../lib/route.ts";
import { SECTIONS } from "../../lib/sections.ts";
import { EXPERIMENT_OUTCOME, EXPERIMENT_STATUS, type Experiment, type ExperimentOutcome, type ExperimentStatus } from "../../lib/types.ts";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty } from "../../components/ui.tsx";
import { samplesSummary } from "./logic.ts";
import { noteExcerpt } from "../notes/NoteRows.tsx";

export const statusTone = (s: ExperimentStatus) =>
  s === "running" || s === "analysing" ? "accent" : s === "done" ? "pos" : s === "abandoned" ? "quiet" : undefined;
export const outcomeTone = (o: ExperimentOutcome) => (o === "worked" ? "pos" : o === "failed" ? "danger" : o === "partial" ? "warn" : "quiet");

/** "1 Nov – 4 Nov 2026", "from 1 Nov 2026", or "" */
export function dateSpan(e: Pick<Experiment, "started_on" | "ended_on">): string {
  if (e.started_on && e.ended_on && e.started_on !== e.ended_on) return `${fmtDate(e.started_on, { day: "numeric", month: "short" })} – ${fmtDate(e.ended_on)}`;
  if (e.started_on) return fmtDate(e.started_on);
  return e.ended_on ? `until ${fmtDate(e.ended_on)}` : "";
}

export function ExperimentRows({ experiments, empty = "No experiments.", projectLabel }: { experiments: Experiment[]; empty?: string; projectLabel?: (id: string | null) => string }) {
  if (!experiments.length) return <Empty icon={SECTIONS.experiments.icon}>{empty}</Empty>;
  return (
    <ul className="note-list">
      {experiments.map((e) => (
        <li key={e.id}>
          <a href={href(`experiments/${e.id}`)}>
            <span className="note-title">
              {e.pinned && <Pin size={12} aria-label="Pinned" />} {e.repeat_of && <Repeat2 size={12} aria-label="Repeat run" />} {e.title || "Untitled experiment"}
            </span>
            <span className="muted small clamp">{noteExcerpt(e.conclusion || e.aim) || samplesSummary(e.samples) || "No aim written yet"}</span>
            <span className="note-meta">
              <Badge tone={statusTone(e.status)}>{EXPERIMENT_STATUS[e.status]}</Badge>
              {e.outcome && <Badge tone={outcomeTone(e.outcome)}>{EXPERIMENT_OUTCOME[e.outcome]}</Badge>}
              {e.technique && <Badge tone="quiet">{e.technique}</Badge>}
              {dateSpan(e) && <span className="muted small">{dateSpan(e)}</span>}
              {projectLabel && e.project_id && <span className="muted small">{projectLabel(e.project_id)}</span>}
              {e.archived_at && <Badge tone="quiet">Archived</Badge>}
              <TagList tags={e.tags} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
