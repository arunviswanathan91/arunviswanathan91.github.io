import { SECTIONS } from "../../lib/sections.ts";
import { Pin } from "lucide-react";
import { fmtDate } from "../../lib/dates.ts";
import { href } from "../../lib/route.ts";
import { NOTE_TYPE, type Note } from "../../lib/types.ts";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty } from "../../components/ui.tsx";

export function noteExcerpt(body: string, len = 140): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]|-]+/g, " ")
    .replace(/\(https?:[^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, len);
}

export function NoteRows({ notes, empty = "No notes." }: { notes: Note[]; empty?: string }) {
  if (!notes.length) return <Empty icon={SECTIONS.notes.icon}>{empty}</Empty>;
  return (
    <ul className="note-list">
      {notes.map((n) => (
        <li key={n.id}>
          <a href={href(`notes/${n.id}`)}>
            <span className="note-title">
              {n.pinned && <Pin size={12} aria-label="Pinned" />} {n.title || "Untitled"}
            </span>
            <span className="muted small clamp">{noteExcerpt(n.body) || "Empty note"}</span>
            <span className="note-meta">
              <Badge tone="quiet">{NOTE_TYPE[n.type]}</Badge>
              <span className="muted small">{fmtDate(n.updated_at)}</span>
              {n.archived_at && <Badge tone="quiet">Archived</Badge>}
              <TagList tags={n.tags} />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

