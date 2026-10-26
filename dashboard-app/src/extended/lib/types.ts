// Row shapes for every table (see supabase/migrations). Labels for every enum-like value.

export interface Link {
  label: string;
  url: string;
}

export type ProjectStatus = "idea" | "planned" | "active" | "paused" | "completed" | "archived";
export type ProjectArea = "research" | "personal" | "teaching" | "administration" | "career" | "other";
export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  area: ProjectArea;
  start_date: string | null;
  target_date: string | null;
  completed_on: string | null;
  tags: string[];
  links: Link[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export interface Recurrence {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  weekdays?: number[];
  until?: string;
}
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  project_id: string | null;
  meeting_id: string | null;
  deadline_id: string | null;
  tags: string[];
  recurrence: Recurrence | null;
  series_id: string | null;
  previous_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaperStatus = "to_read" | "reading" | "read" | "to_cite" | "archived";
export interface PageRef {
  page: string;
  note: string;
}
export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  publication: string | null;
  abstract: string | null;
  doi: string | null;
  arxiv_id: string | null;
  pmid: string | null;
  url: string | null;
  status: PaperStatus;
  rating: number | null;
  priority: "low" | "medium" | "high";
  tags: string[];
  summary: string | null;
  research_question: string | null;
  methods: string | null;
  findings: string | null;
  strengths: string | null;
  limitations: string | null;
  relevance: string | null;
  ideas: string | null;
  page_refs: PageRef[];
  started_on: string | null;
  finished_on: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProjectPaper {
  project_id: string;
  paper_id: string;
}

export type NoteType = "research_idea" | "literature" | "daily_log" | "lab_notebook" | "meeting_prep" | "general" | "personal";
export interface Note {
  id: string;
  title: string;
  body: string;
  type: NoteType;
  project_id: string | null;
  paper_id: string | null;
  tags: string[];
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MeetingType = "supervisor" | "lab" | "research_discussion" | "collaboration" | "administration" | "other";
export interface Meeting {
  id: string;
  title: string;
  type: MeetingType;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  other_participants: string | null;
  agenda: string;
  discussion: string;
  decisions: string;
  next_steps: string;
  tags: string[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface MeetingProject {
  meeting_id: string;
  project_id: string;
}
export interface MeetingParticipant {
  meeting_id: string;
  contact_id: string;
}
export interface ActionItem {
  id: string;
  meeting_id: string;
  text: string;
  owner: string | null;
  done: boolean;
  task_id: string | null;
  position: number;
}

export type DeadlineCategory =
  | "conference" | "abstract_submission" | "paper_submission" | "course" | "credits" | "isp"
  | "half_time_review" | "dissertation" | "administration" | "personal" | "other";
export type DeadlineStatus = "upcoming" | "in_progress" | "done" | "missed" | "cancelled";
export interface Deadline {
  id: string;
  title: string;
  description: string | null;
  category: DeadlineCategory;
  due_date: string;
  due_time: string | null;
  status: DeadlineStatus;
  priority: Priority;
  project_id: string | null;
  links: Link[];
  tags: string[];
  notes: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
  archived_at: string | null;
}
export interface Transaction {
  id: string;
  kind: "income" | "expense" | "transfer";
  description: string;
  amount: number;
  currency: string;
  category_id: string | null;
  occurred_on: string;
  payment_method: string | null;
  notes: string | null;
  /** Credit card this was paid with (or refunded to). */
  loan_id?: string | null;
}
export interface MonthlyBudget {
  id: string;
  category_id: string;
  month: string;
  amount: number;
  currency: string;
}
export interface BudgetLine {
  category_id: string;
  category: string;
  kind: "income" | "expense";
  currency: string;
  budgeted: number;
  actual: number;
  remaining: number;
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  frequency: "daily" | "weekdays";
  weekdays: number[];
  start_date: string;
  archived_at: string | null;
  position: number;
  /** Daily quantity (e.g. 30 with unit "min"). Null for a plain done / not done habit. */
  target: number | null;
  unit: string | null;
  /** A shortfall rolls into the next day's requirement. */
  carry_over: boolean;
  /** Most that can be carried into one day (or period); null = one day's (period's) amount. */
  max_carry: number | null;
  /** The target is per day (on the scheduled days), per ISO week or per calendar month (any days). */
  period: "day" | "week" | "month";
}
/** A break from habits, inclusive dates. No habit_id means every habit. Stored in settings.habit_pauses. */
export interface HabitPause {
  from: string;
  to: string;
  habit_id?: string | null;
  note?: string | null;
}
export interface HabitCheckin {
  habit_id: string;
  day: string;
  /** Quantity done that day; null means the full requirement. */
  amount: number | null;
}

export interface Attachment {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  project_id: string | null;
  paper_id: string | null;
  note_id: string | null;
  meeting_id: string | null;
  deadline_id: string | null;
  created_at: string;
}

export interface ContactRow {
  id: string;
  name: string;
  affiliation: string | null;
  email: string | null;
}

export interface Settings {
  user_id: string;
  default_currency: string;
  timezone: string;
  habit_pauses?: HabitPause[];
  /** "HH:MM" local time for the Telegram "habits still open" nudge; null = off. */
  habit_nudge_time?: string | null;
  /** Secret for the calendar feed; null = feed off. */
  calendar_token?: string | null;
  /** Remind to chase a paper under review after this many days; null = off. */
  publication_followup_days?: number | null;
}

export interface SearchHit {
  kind: "project" | "task" | "paper" | "note" | "meeting" | "deadline" | "publication" | "document" | "job" | "read" | "reminder" | "clipping";
  id: string;
  title: string;
  snippet: string;
  project_id: string | null;
  updated_at: string;
}

// ── Labels ───────────────────────────────────────────────────────────────────

export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  idea: "Idea", planned: "Planned", active: "Active", paused: "Paused", completed: "Completed", archived: "Archived",
};
export const PROJECT_AREA: Record<ProjectArea, string> = {
  research: "Research", personal: "Personal", teaching: "Teaching", administration: "Administration", career: "Career", other: "Other",
};
export const TASK_STATUS: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
export const PRIORITY: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export const PAPER_STATUS: Record<PaperStatus, string> = { to_read: "To read", reading: "Reading", read: "Read", to_cite: "To cite", archived: "Archived" };
export const NOTE_TYPE: Record<NoteType, string> = {
  research_idea: "Research idea", literature: "Literature note", daily_log: "Daily log", lab_notebook: "Lab notebook",
  meeting_prep: "Meeting prep", general: "General", personal: "Personal",
};
export const MEETING_TYPE: Record<MeetingType, string> = {
  supervisor: "Supervisor", lab: "Lab meeting", research_discussion: "Research discussion", collaboration: "Collaboration",
  administration: "Administration", other: "Other",
};
export const DEADLINE_CATEGORY: Record<DeadlineCategory, string> = {
  conference: "Conference", abstract_submission: "Abstract submission", paper_submission: "Paper submission", course: "Course",
  credits: "Credits", isp: "ISP", half_time_review: "Half-time review", dissertation: "Dissertation",
  administration: "Administration", personal: "Personal", other: "Other",
};
export const DEADLINE_STATUS: Record<DeadlineStatus, string> = {
  upcoming: "Upcoming", in_progress: "In progress", done: "Done", missed: "Missed", cancelled: "Cancelled",
};
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // ISO 1..7

export const CURRENCIES = ["SEK", "EUR", "INR", "USD", "GBP"];

