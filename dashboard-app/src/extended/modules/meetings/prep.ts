// Builds a meeting agenda from what changed since the previous meeting of the same type. Pure, so it is testable.

export interface PrepInput {
  since: string;
  sinceLabel: string;
  done: { title: string }[];
  open: { title: string; due_date: string | null; priority: string }[];
  stageChanges: { title: string; from: string | null; to: string }[];
  papersRead: { title: string }[];
  deadlines: { title: string; due_date: string }[];
  today: string;
}

const bullets = (items: string[], empty: string) => (items.length ? items.map((s) => `- ${s}`) : [`- _${empty}_`]);

export function prepAgenda(p: PrepInput): string {
  const open = [...p.open].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return [
    `## Since ${p.sinceLabel}`,
    "### Done",
    ...bullets(p.done.map((t) => t.title), "nothing recorded"),
    ...(p.stageChanges.length ? ["### Manuscripts", ...p.stageChanges.map((c) => `- ${c.title}: ${c.from ? `${c.from} → ` : ""}${c.to}`)] : []),
    ...(p.papersRead.length ? ["### Papers read", ...p.papersRead.map((x) => `- ${x.title}`)] : []),
    "",
    "## Open and blocked",
    ...bullets(open.map((t) => `${t.title}${t.due_date ? ` (due ${t.due_date}${t.due_date < p.today ? ", overdue" : ""})` : ""}${t.priority === "urgent" || t.priority === "high" ? ` · ${t.priority}` : ""}`), "nothing urgent"),
    "",
    "## Coming up (30 days)",
    ...bullets(p.deadlines.map((d) => `${d.title} — ${d.due_date}`), "no deadlines"),
    "",
    "## Questions / decisions needed",
    "- ",
  ].join("\n");
}
