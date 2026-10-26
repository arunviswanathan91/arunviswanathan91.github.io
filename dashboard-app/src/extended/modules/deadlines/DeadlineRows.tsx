import { SECTIONS } from "../../lib/sections.ts";
import { CalendarClock } from "lucide-react";
import { fmtDate, relDay, today } from "../../lib/dates.ts";
import { href } from "../../lib/route.ts";
import { DEADLINE_CATEGORY, DEADLINE_STATUS, PRIORITY, type Deadline } from "../../lib/types.ts";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty, priorityTone } from "../../components/ui.tsx";

export const isOpenDeadline = (d: Deadline) => d.status === "upcoming" || d.status === "in_progress";

export function deadlineTone(d: Deadline, now = today()): string {
  if (d.status === "done") return "pos";
  if (d.status === "missed" || (isOpenDeadline(d) && d.due_date < now)) return "danger";
  if (d.status === "cancelled") return "quiet";
  return d.due_date <= now ? "warn" : "";
}

export function DeadlineRows({ deadlines, empty = "No deadlines." }: { deadlines: Deadline[]; empty?: string }) {
  const now = today();
  if (!deadlines.length) return <Empty icon={SECTIONS.deadlines.icon}>{empty}</Empty>;
  return (
    <ul className="deadline-list">
      {deadlines.map((d) => {
        const open = isOpenDeadline(d);
        return (
          <li key={d.id}>
            <a href={href(`deadlines/${d.id}`)}>
              <span className={`deadline-date ${deadlineTone(d, now)}`}>
                <strong>{fmtDate(d.due_date, { day: "numeric" })}</strong>
                <span>{fmtDate(d.due_date, { month: "short" })}</span>
              </span>
              <span className="deadline-body">
                <span className="deadline-title">{d.title}</span>
                <span className="deadline-meta">
                  <Badge tone="quiet">{DEADLINE_CATEGORY[d.category]}</Badge>
                  {open ? (
                    <span className={d.due_date < now ? "neg" : "muted"}><CalendarClock size={12} /> {relDay(d.due_date, now)}{d.due_time ? ` · ${d.due_time.slice(0, 5)}` : ""}</span>
                  ) : (
                    <Badge tone={deadlineTone(d, now)}>{DEADLINE_STATUS[d.status]}</Badge>
                  )}
                  {d.priority !== "medium" && <Badge tone={priorityTone(d.priority)}>{PRIORITY[d.priority]}</Badge>}
                  <TagList tags={d.tags} />
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

