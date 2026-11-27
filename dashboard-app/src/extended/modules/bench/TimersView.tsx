import type { Route } from "../../lib/route.ts";
import type { BenchItem } from "../../lib/types.ts";
import { TimersView as TimersPage } from "./timers/TimersPage.tsx";

/** The multi-timer. A saved timer set opened from Bench or search lands here too: the page lists
 *  the saved sets, where it can be loaded or started (opening it never starts a timer by itself). */
export function TimersView({ route }: { route?: Route; item?: BenchItem }) {
  return <TimersPage route={route} />;
}
