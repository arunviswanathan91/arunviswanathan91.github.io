import { insert } from "../../lib/db.ts";
import { go } from "../../lib/route.ts";
import type { Experiment } from "../../lib/types.ts";

/** Create an experiment and open it. (Kept apart so the project page can use it without the list page.) */
export async function createExperiment(values: Partial<Experiment> = {}) {
  const e = await insert<Experiment>("experiments", { title: "Untitled experiment", ...values });
  go(`experiments/${e.id}`);
}
