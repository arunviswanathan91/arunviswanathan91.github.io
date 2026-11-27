import { Play, Plus } from "lucide-react";
import { list, useLoad } from "../../../lib/db.ts";
import { go, href } from "../../../lib/route.ts";
import { parseSetData } from "./logic.ts";
import { loadSet } from "./store.ts";
import { setSummary, type BenchItemRow } from "./TimerSets.tsx";
import "./timers.css";

const KIND_LABEL: Record<string, string> = {
  dilution: "Dilution", cell_dilution: "Cell dilution", haemocytometer: "Cell count", molarity: "Molarity",
  recipe: "Recipe", master_mix: "Master mix", curve: "Standard curve", timer_set: "Timer set", plate: "Plate map",
};

function BenchRows({ items }: { items: BenchItemRow[] }) {
  function startTimers(item: BenchItemRow) {
    // Added after anything already on the page, so a running timer is never lost.
    loadSet(item.title, parseSetData(item.data), { replace: false, start: true });
    go("bench/timers");
  }
  return (
    <ul className="bt-links">
      {items.map((item) => {
        const set = item.kind === "timer_set" ? parseSetData(item.data) : null;
        return (
          <li key={item.id}>
            <a href={href(`bench/item/${item.id}`)}>{item.title}</a>
            <span className="muted small">{KIND_LABEL[item.kind] ?? item.kind}{set ? ` · ${setSummary(set)}` : ""}</span>
            {set && set.timers.length > 0 && <button type="button" className="bt-btn bt-primary" onClick={() => startTimers(item)}><Play size={15} aria-hidden /> Start timers</button>}
          </li>
        );
      })}
    </ul>
  );
}

/** On a protocol's page: the bench items saved under it, and a way to add a timer set for it. */
export function ProtocolBench({ protocolId }: { protocolId: string }) {
  const { data: items = [] } = useLoad(() => list<BenchItemRow>("bench_items", { eq: { library_entry_id: protocolId, archived_at: null }, order: [["updated_at", false]] }), [protocolId]);
  return (
    <div className="card pad">
      <div className="section-head">
        <h3>Bench</h3>
        <span className="row wrap">
          <a className="small" href={href("bench/recipe", { protocol: protocolId })}><Plus size={13} aria-hidden /> New recipe for this protocol</a>
          <a className="small" href={href("bench/timers", { protocol: protocolId })}><Plus size={13} aria-hidden /> New timer set for this protocol</a>
        </span>
      </div>
      {items.length > 0 && <BenchRows items={items} />}
    </div>
  );
}

/** On an experiment's page: the bench items made for this run. Nothing is drawn when there are none. */
export function ExperimentBench({ experimentId }: { experimentId: string }) {
  const { data: items = [] } = useLoad(() => list<BenchItemRow>("bench_items", { eq: { experiment_id: experimentId, archived_at: null }, order: [["updated_at", false]] }), [experimentId]);
  if (!items.length) return null;
  return (
    <div className="card pad">
      <div className="section-head"><h3>Bench</h3></div>
      <BenchRows items={items} />
    </div>
  );
}
