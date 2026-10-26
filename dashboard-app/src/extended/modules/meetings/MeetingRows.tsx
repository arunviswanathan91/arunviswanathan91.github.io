import { SECTIONS } from "../../lib/sections.ts";
import { CalendarDays } from "lucide-react";
import { fmtDateTime } from "../../lib/dates.ts";
import { href } from "../../lib/route.ts";
import { MEETING_TYPE, type Meeting } from "../../lib/types.ts";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty } from "../../components/ui.tsx";

export function MeetingRows({ meetings, empty = "No meetings.", selected, onToggle }: {
  meetings: Meeting[];
  empty?: string;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  if (!meetings.length) return <Empty icon={SECTIONS.meetings.icon}>{empty}</Empty>;
  const now = new Date().toISOString();
  return (
    <ul className="meeting-list">
      {meetings.map((m) => (
        <li key={m.id}>
          {onToggle && <input type="checkbox" className="check" aria-label={`Select ${m.title}`} checked={selected?.has(m.id) ?? false} onChange={() => onToggle(m.id)} />}
          <a href={href(`meetings/${m.id}`)}>
            <span className="meeting-title">{m.title}</span>
            <span className="meeting-meta">
              <span className={m.starts_at >= now ? "accent" : "muted"}><CalendarDays size={12} /> {fmtDateTime(m.starts_at)}</span>
              <Badge tone={m.type === "supervisor" ? "accent" : "quiet"}>{MEETING_TYPE[m.type]}</Badge>
              <TagList tags={m.tags} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

