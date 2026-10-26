import { useEffect, useState } from "react";
import { CalendarClock, CheckSquare, FileText, FolderPlus, NotebookPen, Receipt, Repeat, Users } from "lucide-react";
import { list, useLoad } from "../lib/db.ts";
import type { SectionId } from "../lib/sections.ts";
import { useSettings } from "../lib/settings.ts";
import type { BudgetCategory } from "../lib/types.ts";
import { TransactionForm } from "../modules/budget/TransactionForm.tsx";
import { DeadlineForm } from "../modules/deadlines/DeadlineForm.tsx";
import { TodayHabits, useHabits } from "../modules/habits/HabitsView.tsx";
import { MeetingForm } from "../modules/meetings/MeetingForm.tsx";
import { createNote } from "../modules/notes/NotesView.tsx";
import { PaperForm } from "../modules/papers/PaperForm.tsx";
import { ProjectForm } from "../modules/projects/ProjectForm.tsx";
import { TaskForm } from "../modules/tasks/TaskForm.tsx";
import { today } from "../lib/dates.ts";
import { Modal } from "./Modal.tsx";

export type QuickKind = "project" | "task" | "paper" | "note" | "meeting" | "deadline" | "expense" | "habit";

export const QUICK_ACTIONS: { kind: QuickKind; label: string; icon: typeof CheckSquare; section: SectionId }[] = [
  { kind: "task", label: "Task", icon: CheckSquare, section: "tasks" },
  { kind: "project", label: "Project", icon: FolderPlus, section: "projects" },
  { kind: "paper", label: "Paper", icon: FileText, section: "papers" },
  { kind: "note", label: "Note", icon: NotebookPen, section: "notes" },
  { kind: "meeting", label: "Meeting", icon: Users, section: "meetings" },
  { kind: "deadline", label: "Deadline", icon: CalendarClock, section: "deadlines" },
  { kind: "expense", label: "Expense", icon: Receipt, section: "budget" },
  { kind: "habit", label: "Habit check-in", icon: Repeat, section: "habits" },
];

export function openQuick(kind: QuickKind) {
  if (kind === "note") {
    void createNote({ type: "general" });
    return;
  }
  window.dispatchEvent(new CustomEvent("ws:quick", { detail: kind }));
}

/** Mounted once in the app shell; shows the right form for any quick action. */
export function QuickAddHost() {
  const [kind, setKind] = useState<QuickKind | null>(null);
  useEffect(() => {
    const on = (e: Event) => setKind((e as CustomEvent<QuickKind>).detail);
    window.addEventListener("ws:quick", on);
    return () => window.removeEventListener("ws:quick", on);
  }, []);
  if (!kind) return null;
  const close = () => setKind(null);
  const title = { project: "New project", task: "New task", paper: "Add paper", note: "", meeting: "New meeting", deadline: "New deadline", expense: "New transaction", habit: "Today’s habits" }[kind];
  return (
    <Modal title={title} wide={kind === "paper"} onClose={close}>
      {kind === "project" && <ProjectForm onDone={close} />}
      {kind === "task" && <TaskForm preset={{ due_date: today() }} onDone={close} />}
      {kind === "paper" && <PaperForm onDone={close} />}
      {kind === "meeting" && <MeetingForm onDone={close} />}
      {kind === "deadline" && <DeadlineForm onDone={close} />}
      {kind === "expense" && <QuickExpense onDone={close} />}
      {kind === "habit" && <QuickHabits />}
    </Modal>
  );
}

function QuickExpense({ onDone }: { onDone: () => void }) {
  const settings = useSettings();
  const { data: categories } = useLoad(() => list<BudgetCategory>("budget_categories", { order: [["name"]] }), []);
  if (!categories) return null;
  return <TransactionForm categories={categories} currency={settings.default_currency} onDone={onDone} />;
}

function QuickHabits() {
  const { data } = useHabits();
  if (!data) return null;
  return <TodayHabits habits={data.habits} checkins={data.checkins} />;
}

