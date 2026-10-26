import { SECTIONS } from "../../lib/sections.ts";
import { href } from "../../lib/route.ts";
import { PAPER_STATUS, type Paper } from "../../lib/types.ts";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty, Stars } from "../../components/ui.tsx";
import { authorLine } from "./lookup.ts";

export const paperTone = (s: Paper["status"]) => ({ to_read: "", reading: "accent", read: "pos", to_cite: "warn", archived: "quiet" })[s];

export function PaperRows({ papers, empty = "No papers.", trailing }: { papers: Paper[]; empty?: string; trailing?: (p: Paper) => React.ReactNode }) {
  if (!papers.length) return <Empty icon={SECTIONS.papers.icon}>{empty}</Empty>;
  return (
    <ul className="paper-list">
      {papers.map((p) => (
        <li key={p.id}>
          <a className="paper-main" href={href(`papers/${p.id}`)}>
            <span className="paper-title">{p.title}</span>
            <span className="muted small">
              {[authorLine(p.authors), p.year, p.publication].filter(Boolean).join(" · ")}
            </span>
            <span className="paper-meta">
              <Badge tone={paperTone(p.status)}>{PAPER_STATUS[p.status]}</Badge>
              {p.priority === "high" && <Badge tone="warn">High priority</Badge>}
              {p.rating ? <Stars value={p.rating} /> : null}
              <TagList tags={p.tags} />
            </span>
          </a>
          {trailing?.(p)}
        </li>
      ))}
    </ul>
  );
}

