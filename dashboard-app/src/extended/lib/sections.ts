// Each section's name, icon and colour, used by the menu, page headers, badges, cards and search.
// Colours are CSS variables (see styles.css: --sec-<id>, --sec-<id>-soft, --sec-<id>-ink).
import {
  CalendarClock, CalendarDays, CheckSquare, ClipboardCheck, FileText, FileUser, FlaskConical, GraduationCap, Landmark, Plane, Target, Folder, HandCoins, Home, NotebookPen, Repeat, Search, Settings, TrendingUp, Users, Wallet, type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "home" | "agenda" | "review" | "projects" | "tasks" | "papers" | "notes" | "experiments" | "thesis" | "trips" | "funding" | "goals" | "meetings" | "deadlines" | "budget" | "loans" | "networth" | "habits" | "resumes" | "search" | "settings";

export interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /** CSS colour family; budget and loans share one. */
  tone: string;
}

export const SECTIONS: Record<SectionId, Section> = {
  home: { id: "home", label: "Dashboard", icon: Home, tone: "home" },
  agenda: { id: "agenda", label: "Agenda", icon: CalendarDays, tone: "deadlines" },
  review: { id: "review", label: "Weekly review", icon: ClipboardCheck, tone: "home" },
  projects: { id: "projects", label: "Projects", icon: Folder, tone: "projects" },
  tasks: { id: "tasks", label: "Tasks", icon: CheckSquare, tone: "tasks" },
  papers: { id: "papers", label: "Papers", icon: FileText, tone: "papers" },
  notes: { id: "notes", label: "Notes", icon: NotebookPen, tone: "notes" },
  experiments: { id: "experiments", label: "Experiments", icon: FlaskConical, tone: "lab" },
  thesis: { id: "thesis", label: "Thesis", icon: GraduationCap, tone: "projects" },
  trips: { id: "trips", label: "Conferences & trips", icon: Plane, tone: "deadlines" },
  goals: { id: "goals", label: "Goals", icon: Target, tone: "home" },
  funding: { id: "funding", label: "Funding", icon: Landmark, tone: "money" },
  meetings: { id: "meetings", label: "Meetings", icon: Users, tone: "meetings" },
  deadlines: { id: "deadlines", label: "Deadlines", icon: CalendarClock, tone: "deadlines" },
  budget: { id: "budget", label: "Budget", icon: Wallet, tone: "money" },
  loans: { id: "loans", label: "Loans & cards", icon: HandCoins, tone: "money" },
  networth: { id: "networth", label: "Net worth", icon: TrendingUp, tone: "money" },
  habits: { id: "habits", label: "Habits", icon: Repeat, tone: "habits" },
  resumes: { id: "resumes", label: "Resumes", icon: FileUser, tone: "papers" },
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

