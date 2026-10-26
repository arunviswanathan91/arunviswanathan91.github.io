// Pure task rules (views, ordering, recurrence wording). No React, no Supabase.
import type { Recurrence, Task } from "../../lib/types.ts";

export type TaskView = "inbox" | "today" | "upcoming" | "overdue" | "all" | "completed" | "by_project";

export const isOpen = (t: Pick<Task, "status">) => t.status === "todo" || t.status === "in_progress";

export function inView(t: Task, view: TaskView, today: string): boolean {
  switch (view) {
    case "inbox":
      return isOpen(t) && !t.project_id && !t.due_date;
    case "today":
      return isOpen(t) && t.due_date === today;
    case "upcoming":
      return isOpen(t) && !!t.due_date && t.due_date > today;
    case "overdue":
      return isOpen(t) && !!t.due_date && t.due_date < today;
    case "all":
    case "by_project":
      return isOpen(t);
    case "completed":
      return t.status === "done" || t.status === "cancelled";
  }
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

/** Open tasks: overdue/soonest first, then priority. Completed: most recent first. */
export function sortTasks(tasks: Task[], view: TaskView): Task[] {
  const copy = [...tasks];
  if (view === "completed") {
    return copy.sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));
  }
  return copy.sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.created_at.localeCompare(b.created_at);
  });
}

export function viewCounts(tasks: Task[], today: string): Record<TaskView, number> {
  const views: TaskView[] = ["inbox", "today", "upcoming", "overdue", "all", "completed", "by_project"];
  return Object.fromEntries(views.map((v) => [v, tasks.filter((t) => inView(t, v, today)).length])) as Record<TaskView, number>;
}

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return "";
  const n = Math.max(r.interval ?? 1, 1);
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.freq];
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (r.freq === "weekly" && r.weekdays?.length) text += ` on ${[...r.weekdays].sort().map((d) => DAY[d]).join(", ")}`;
  if (r.until) text += ` until ${r.until}`;
  return text;
}

