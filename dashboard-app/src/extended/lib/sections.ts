// Each section's name, icon and colour, used by the menu, page headers, badges, cards and search.
// Colours are CSS variables (see styles.css: --sec-<id>, --sec-<id>-soft, --sec-<id>-ink).
import {
  CalendarClock, CheckSquare, FileText, Folder, HandCoins, Home, NotebookPen, Repeat, Search, Settings, Users, Wallet, type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "home" | "projects" | "tasks" | "papers" | "notes" | "meetings" | "deadlines" | "budget" | "loans" | "habits" | "search" | "settings";

export interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** CSS colour family; budget and loans share one. */
  tone: string;
}

export const SECTIONS: Record<SectionId, Section> = {
  home: { id: "home", label: "Dashboard", icon: Home, tone: "home" },
  projects: { id: "projects", label: "Projects", icon: Folder, tone: "projects" },
  tasks: { id: "tasks", label: "Tasks", icon: CheckSquare, tone: "tasks" },
  papers: { id: "papers", label: "Papers", icon: FileText, tone: "papers" },
  notes: { id: "notes", label: "Notes", icon: NotebookPen, tone: "notes" },
  meetings: { id: "meetings", label: "Meetings", icon: Users, tone: "meetings" },
  deadlines: { id: "deadlines", label: "Deadlines", icon: CalendarClock, tone: "deadlines" },
  budget: { id: "budget", label: "Budget", icon: Wallet, tone: "money" },
  loans: { id: "loans", label: "Loans & cards", icon: HandCoins, tone: "money" },
  habits: { id: "habits", label: "Habits", icon: Repeat, tone: "habits" },
  search: { id: "search", label: "Search", icon: Search, tone: "home" },
  settings: { id: "settings", label: "Settings", icon: Settings, tone: "home" },
};

/** Inline style that points the generic --tone variables at one section's colours. */
export function toneStyle(id: SectionId): React.CSSProperties {
  const t = SECTIONS[id].tone;
  return {
    ["--tone" as string]: `var(--sec-${t})`,
    ["--tone-soft" as string]: `var(--sec-${t}-soft)`,
    ["--tone-ink" as string]: `var(--sec-${t}-ink)`,
  };
}

