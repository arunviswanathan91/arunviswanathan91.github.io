import { ArrowLeftRight, Beaker, ChartLine, Droplets, FlaskConical, Grid3x3, Pin, Scale, TestTubes, Timer, type LucideIcon } from "lucide-react";
import { getOne, list, useLoad } from "../../lib/db.ts";
import { fmtDate } from "../../lib/dates.ts";
import { href, setQuery, type Route } from "../../lib/route.ts";
import type { BenchItem, BenchKind, LibraryEntry } from "../../lib/types.ts";
import { projectName, useProjects } from "../../components/pickers.tsx";
import { TagList } from "../../components/TagInput.tsx";
import { Badge, Empty, ErrorText, Loading, PageHeader, SearchBox, Select } from "../../components/ui.tsx";
import { sortEntries } from "../library/logic.ts";
import { TOOLS, TOOL_ORDER, isTool, toolOfKind, type ToolId } from "./model.ts";
import type { ToolProps } from "./parts.tsx";
import { CellsTool } from "./CellsTool.tsx";
import { ConvertTool } from "./ConvertTool.tsx";
import { CurveTool } from "./CurveTool.tsx";
import { DilutionTool } from "./DilutionTool.tsx";
import { HaemocytometerTool } from "./HaemocytometerTool.tsx";
import { MasterMixTool } from "./MasterMixTool.tsx";
import { MolarityTool } from "./MolarityTool.tsx";
import { RecipeTool } from "./RecipeTool.tsx";
import { TimersView } from "./TimersView.tsx";

const ICONS: Record<ToolId, LucideIcon> = {
  dilution: Droplets, cells: FlaskConical, haemocytometer: Grid3x3, molarity: Scale, convert: ArrowLeftRight,
  recipe: Beaker, mastermix: TestTubes, curve: ChartLine, timers: Timer,
};

/**
 * Everything under #/tools/bench:
 *   bench              the tools and the saved items
 *   bench/<tool>       a fresh, unsaved tool
 *   bench/item/<id>    a saved item, opened in its tool
 */
export function BenchView({ route }: { route: Route }) {
  const [, sub, id] = route.path;
  if (!sub) return <BenchHome route={route} />;
  if (sub === "item" && id) return <BenchItemPage id={id} route={route} />;
  // Remount per tool, so one tool's numbers never carry into another.
  if (isTool(sub)) return <Tool key={sub} tool={sub} route={route} />;
  return <Empty>There is no bench tool at this address. <a href={href("bench")}>Back to Bench</a></Empty>;
}

function Tool({ tool, ...props }: ToolProps & { tool: ToolId }) {
  switch (tool) {
    case "dilution": return <DilutionTool {...props} />;
    case "cells": return <CellsTool {...props} />;
    case "haemocytometer": return <HaemocytometerTool {...props} />;
    case "molarity": return <MolarityTool {...props} />;
    case "convert": return <ConvertTool {...props} />;
    case "recipe": return <RecipeTool {...props} />;
    case "mastermix": return <MasterMixTool {...props} />;
    case "curve": return <CurveTool {...props} />;
    // Timers: a placeholder until the multi-timer is built (see TimersView.tsx).
    case "timers": return <TimersView item={props.item} />;
  }
}

function BenchItemPage({ id, route }: { id: string; route: Route }) {
  const { data: item, error, loading, fresh } = useLoad(() => getOne<BenchItem>("bench_items", id), [id]);
  if (error) return <ErrorText error={error} />;
  // Wait for the record itself, not the remembered copy of it: the tool keeps what it starts with.
  if (!fresh || (loading && !item) || (item && item.id !== id)) return <Loading rows={8} />;
  if (!item) return <Empty>This item doesn’t exist (it may have been deleted). <a href={href("bench")}>Back to Bench</a></Empty>;
  return <Tool key={id} tool={toolOfKind(item.kind)} item={item} route={route} />;
}

function BenchHome({ route }: { route: Route }) {
  const search = route.query.get("q") ?? "";
  const kind = route.query.get("kind") ?? "";
  const tag = route.query.get("tag") ?? "";
  const archived = route.query.get("archived") === "1";
  const { projects } = useProjects();
  const { data, error } = useLoad(async () => {
    const [items, protocols] = await Promise.all([
      list<BenchItem>("bench_items", { order: [["updated_at", false]] }),
      list<LibraryEntry>("library_entries", { eq: { kind: "protocol" } }),
    ]);
    return { items, protocols };
  }, []);

  const protocolTitle = new Map((data?.protocols ?? []).map((p) => [p.id, p.title]));
  const live = (data?.items ?? []).filter((e) => (archived ? !!e.archived_at : !e.archived_at));
  const kinds = [...new Set(live.map((e) => e.kind))].map((k) => [k, TOOLS[toolOfKind(k)].label] as [BenchKind, string]).sort((a, b) => a[1].localeCompare(b[1]));
  const tags = [...new Set(live.flatMap((e) => e.tags ?? []))].sort();
  const q = search.toLowerCase();
  const shown = sortEntries(
    live
      .filter((e) => (!kind || e.kind === kind) && (!tag || (e.tags ?? []).includes(tag)))
      // The inputs are searched too, so a recipe is found by one of its components.
      .filter((e) => !q || `${e.title} ${e.notes ?? ""} ${(e.tags ?? []).join(" ")} ${TOOLS[toolOfKind(e.kind)].label} ${JSON.stringify(e.data ?? {})}`.toLowerCase().includes(q)),
  );

  return (
    <section className={!data && !error ? "is-loading" : undefined} aria-busy={(!data && !error) || undefined}>
      <PageHeader section="bench" title="Bench" subtitle="Calculators for the lab. Results update as you type; save the ones you will use again." />
      <div className="bench-tools">
        {TOOL_ORDER.map((id) => {
          const Icon = ICONS[id];
          return (
            <a key={id} className="card bench-tile" href={href(`bench/${id}`)}>
              <span className="sec-chip" aria-hidden><Icon size={18} /></span>
              <span className="bench-tile-text">
                <strong>{TOOLS[id].label}</strong>
                <span className="muted small">{TOOLS[id].blurb}</span>
              </span>
            </a>
          );
        })}
      </div>

      <h2 className="section-title bench-saved-title">Saved</h2>
      <div className="filters">
        <SearchBox value={search} onChange={(v) => setQuery("q", v)} placeholder="Search saved items" />
        <Select label="Tool" allLabel="Any tool" value={kind} options={kinds} onChange={(v) => setQuery("kind", v)} />
        <Select label="Tag" allLabel="Any tag" value={tag} options={tags.map((t) => [t, `#${t}`] as [string, string])} onChange={(v) => setQuery("tag", v)} />
        <label className="toggle">
          <input type="checkbox" checked={archived} onChange={(e) => setQuery("archived", e.target.checked ? "1" : undefined)} /> Archived
        </label>
      </div>
      <ErrorText error={error} />
      <div className="card list-card">
        {data && (shown.length === 0 ? (
          <Empty icon={Beaker}>{live.length ? "Nothing matches these filters." : archived ? "Nothing archived." : "Nothing saved yet. Open a tool and press Save to keep its numbers."}</Empty>
        ) : (
          <ul className="note-list">
            {shown.map((e) => (
              <li key={e.id}>
                <a href={href(`bench/item/${e.id}`)}>
                  <span className="note-title">{e.pinned && <Pin size={12} aria-label="Pinned" />} {e.title || `Untitled ${TOOLS[toolOfKind(e.kind)].label.toLowerCase()}`}</span>
                  {e.notes && <span className="muted small clamp">{e.notes}</span>}
                  <span className="note-meta">
                    <Badge tone="quiet">{TOOLS[toolOfKind(e.kind)].label}</Badge>
                    {e.library_entry_id && protocolTitle.has(e.library_entry_id) && <span className="muted small">{protocolTitle.get(e.library_entry_id) || "Protocol"}</span>}
                    {e.project_id && <span className="muted small">{projectName(projects, e.project_id)}</span>}
                    <span className="muted small">Updated {fmtDate(e.updated_at)}</span>
                    {e.archived_at && <Badge tone="quiet">Archived</Badge>}
                    <TagList tags={e.tags ?? []} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
