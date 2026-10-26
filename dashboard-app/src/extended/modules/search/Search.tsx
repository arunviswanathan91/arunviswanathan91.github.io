import { useEffect, useRef, useState } from "react";
import { CalendarClock, CheckSquare, FileText, Folder, NotebookPen, Search as SearchIcon, Users } from "lucide-react";
import { rpc } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { go, href, setQuery, type Route } from "../../lib/route.ts";
import type { SearchHit } from "../../lib/types.ts";
import { Empty, ErrorText, PageHeader, SearchBox } from "../../components/ui.tsx";

export const KIND = {
  publication: {label:"Publication",icon:FileText,path:(h:SearchHit)=>`#/publication/${h.id}`},
  document: {label:"Document",icon:FileText,path:()=>"#/documents"},
  job: {label:"Job",icon:FileText,path:()=>"#/jobs"},
  read: {label:"Read",icon:FileText,path:()=>"#/reads"},
  reminder: {label:"Reminder",icon:CalendarClock,path:()=>"#/reminders"},
  clipping: {label:"Clipping",icon:FileText,path:()=>"#/clippings"},
  project: { label: "Project", icon: Folder, path: (h: SearchHit) => `projects/${h.id}` },
  task: { label: "Task", icon: CheckSquare, path: (h: SearchHit) => (h.project_id ? `projects/${h.project_id}?tab=tasks` : "tasks?view=all") },
  paper: { label: "Paper", icon: FileText, path: (h: SearchHit) => `papers/${h.id}` },
  note: { label: "Note", icon: NotebookPen, path: (h: SearchHit) => `notes/${h.id}` },
  meeting: { label: "Meeting", icon: Users, path: (h: SearchHit) => `meetings/${h.id}` },
  deadline: { label: "Deadline", icon: CalendarClock, path: (h: SearchHit) => `deadlines/${h.id}` },
};

export function useSearch(q: string) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      rpc<SearchHit[]>("search_workspace", { q: q.trim(), max_results: 40 }).then(
        (r) => !cancelled && (setHits(r), setError("")),
        (e: Error) => !cancelled && setError(e.message),
      );
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);
  return { hits, error };
}

function Hits({ hits, active, onPick }: { hits: SearchHit[]; active?: number; onPick?: () => void }) {
  return (
    <ul className="search-hits" role="listbox">
      {hits.map((h, i) => {
        const k = KIND[h.kind];
        const Icon = k.icon;
        return (
          <li key={`${h.kind}-${h.id}`} role="option" aria-selected={i === active}>
            <a href={resultHref(h)} className={i === active ? "active" : ""} onClick={onPick}>
              <Icon size={15} className="muted" />
              <span className="hit-body">
                <span className="hit-title">{h.title}</span>
                {/* ts_headline marks matches with <b>; show plain text without those tags or markdown symbols */}
                {h.snippet && h.snippet !== h.title && <span className="muted small clamp">{h.snippet.replace(/<\/?b>/g, "").replace(/[#*_`>|]+/g, " ").replace(/\s+/g, " ").trim()}</span>}
              </span>
              <span className="muted small">{k.label} · {fmtDate(h.updated_at, { day: "numeric", month: "short" })}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function SearchView({ route }: { route: Route }) {
  const q = route.query.get("q") ?? "";
  const { hits, error } = useSearch(q);
  return (
    <section>
      <PageHeader section="search" title="Search" subtitle="Search research, work boards, papers, notes, meetings, deadlines and clippings." />
      <div className="filters"><SearchBox value={q} onChange={(v) => setQuery("q", v)} placeholder="Search everything" /></div>
      <ErrorText error={error} />
      <div className="card list-card">
        {q.trim().length < 2 ? <Empty>Type at least two characters.</Empty> : hits && (hits.length ? <Hits hits={hits} /> : <Empty>No results for “{q}”.</Empty>)}
      </div>
    </section>
  );
}

/** ⌘K / Ctrl+K palette available everywhere. */
export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const { hits } = useSearch(q);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ws:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ws:search", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => setActive(0), [hits]);

  if (!open) return null;
  const close = () => setOpen(false);
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Search">
        <label className="palette-input">
          <SearchIcon size={17} aria-hidden />
          <input
            ref={input}
            value={q}
            placeholder="Search everything…"
            aria-label="Search everything"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (!hits?.length) return;
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, hits.length - 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
              if (e.key === "Enter") {
                const h = hits[active];
                window.location.hash=resultHref(h);
                close();
              }
            }}
          />
          <kbd>esc</kbd>
        </label>
        {q.trim().length >= 2 && hits && (hits.length ? <Hits hits={hits.slice(0, 12)} active={active} onPick={close} /> : <p className="muted pad">No results.</p>)}
        {q.trim().length >= 2 && hits && hits.length > 12 && <a className="small pad" href={href("search", { q })} onClick={close}>All {hits.length} results →</a>}
      </div>
    </div>
  );
}


export function resultHref(hit:SearchHit){const path=KIND[hit.kind].path(hit);return path.startsWith("#")?path:href(path)}
