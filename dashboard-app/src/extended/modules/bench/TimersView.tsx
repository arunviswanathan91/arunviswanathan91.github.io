import { ArrowLeft, Timer } from "lucide-react";
import { href } from "../../lib/route.ts";
import type { BenchItem } from "../../lib/types.ts";
import { Empty, PageHeader } from "../../components/ui.tsx";

/**
 * PLACEHOLDER: the multi-timer tool goes here.
 *
 * BenchView renders this at #/tools/bench/timers (no item) and at #/tools/bench/item/<id>
 * for a saved item of kind "timer_set" (`item` is that record; its `data` holds the timers).
 * Nothing about timing is built yet.
 */
export function TimersView({ item }: { item?: BenchItem }) {
  return (
    <section className="bench-tool">
      <a className="back" href={href("bench")}><ArrowLeft size={14} /> Bench</a>
      <PageHeader section="bench" title={item?.title || "Multi-timer"} subtitle="Several named timers running side by side." />
      <div className="card list-card">
        <Empty icon={Timer}>Timers are coming soon.</Empty>
      </div>
    </section>
  );
}
