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

export type ExperimentStatus = "planned" | "running" | "analysing" | "done" | "abandoned";
export const EXPERIMENT_STATUS: Record<ExperimentStatus, string> = { planned: "Planned", running: "Running", analysing: "Analysing", done: "Done", abandoned: "Abandoned" };
export type ExperimentOutcome = "worked" | "partial" | "failed" | "inconclusive";
export const EXPERIMENT_OUTCOME: Record<ExperimentOutcome, string> = { worked: "Worked", partial: "Partly worked", failed: "Failed", inconclusive: "Inconclusive" };
/** One sample, mouse, well or condition in an experiment. */
export interface ExperimentSample { label: string; group: string; notes: string }
export interface Experiment {
  id: string;
  title: string;
  status: ExperimentStatus;
  outcome: ExperimentOutcome | null;
  technique: string;
  started_on: string | null;
  ended_on: string | null;
  project_id: string | null;
  /** The manuscript (Publications pipeline) this experiment feeds. */
  publication_id: string | null;
  /** The earlier run this one repeats. */
  repeat_of: string | null;
  aim: string;
  protocol: string;
  samples: ExperimentSample[];
  results: string;
  conclusion: string;
  next_steps: string;
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
  /** Friend this was paid for (or who paid you back); kept out of your own budget. */
  for_contact_id?: string | null;
  /** Savings account the money came from (expense, transfer) or went into (income). */
  account_id?: string | null;
  /** Transfers: the receiving account, and what arrived there when its currency differs. */
  to_account_id?: string | null;
  to_amount?: number | null;
  /** Value in the default currency (INR) when the transaction was saved; set for foreign-currency entries. */
  base_currency?: string | null;
  base_amount?: number | null;
}
export interface SavingsAccount {
  id: string;
  name: string;
  bank_name: string;
  currency: string;
  opening_balance: number;
  opening_on: string;
  notes: string | null;
  archived_at: string | null;
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
  /** "HH:MM" local time for the Telegram morning briefing; null = off (alerts.sql). */
  briefing_time?: string | null;
  /** Topic lines searched daily for new papers (Europe PMC query syntax: AND, OR, quotes). */
  paper_alert_topics?: string[];
  paper_alerts_checked_on?: string | null;
  funding_topics?: string[];
  /** RSS or Atom feed URLs of funders and research offices. */
  funding_feeds?: string[];
  funding_checked_on?: string | null;
}

export interface PaperAlert {
  id: string; source: "pubmed" | "preprint"; external_id: string; pmid: string | null; doi: string | null; title: string; authors: string[];
  journal: string | null; published_on: string | null; abstract: string | null; url: string | null; topics: string[]; score: number;
  status: "new" | "saved" | "dismissed"; paper_id: string | null; created_at: string;
}
export type FundingStatus = "new" | "interested" | "applying" | "submitted" | "awarded" | "rejected" | "dismissed";
export const FUNDING_STATUS: Record<FundingStatus, string> = { new: "New", interested: "Interested", applying: "Applying", submitted: "Submitted", awarded: "Awarded", rejected: "Not funded", dismissed: "Dismissed" };
export type FundingKind = "grant" | "fellowship" | "travel" | "award" | "other";
export const FUNDING_KIND: Record<FundingKind, string> = { grant: "Grant", fellowship: "Fellowship", travel: "Travel award", award: "Award", other: "Other" };
export interface FundingCall {
  id: string; source: "grants_gov" | "feed" | "manual"; external_id: string | null; title: string; funder: string; kind: FundingKind; url: string | null;
  amount: string; opens_on: string | null; closes_on: string | null; summary: string; topics: string[]; status: FundingStatus; deadline_id: string | null;
  notes: string; created_at: string; updated_at: string;
}

export interface SearchHit {
  kind: "project" | "task" | "paper" | "note" | "experiment" | "trip" | "goal" | "meeting" | "deadline" | "publication" | "document" | "job" | "read" | "reminder" | "clipping";
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


// ── Thesis, goals, trips (supabase/planning.sql) ───────────────────────────
export interface Thesis { id: string; title: string; submission_on: string | null; target_words: number | null; notes: string; updated_at: string }
export type ChapterStatus = "not_started" | "outlining" | "drafting" | "revising" | "with_supervisor" | "final";
export const CHAPTER_STATUS: Record<ChapterStatus, string> = {
  not_started: "Not started", outlining: "Outlining", drafting: "Drafting", revising: "Revising", with_supervisor: "With supervisor", final: "Final",
};
export interface ThesisChapter {
  id: string; position: number; title: string; status: ChapterStatus; words: number; target_words: number | null;
  due_on: string | null; publication_id: string | null; notes: string; created_at: string; updated_at: string;
  /** Sections, subsections and figures with done toggles (thesis-outline.sql). */
  outline?: import("../modules/planning/outline.ts").OutlineItem[];
}
export type FeedbackSource = "supervisor" | "dac" | "examiner" | "peer" | "other";
export const FEEDBACK_SOURCE: Record<FeedbackSource, string> = { supervisor: "Supervisor", dac: "DAC", examiner: "Examiner", peer: "Peer", other: "Other" };
export interface ThesisFeedback { id: string; chapter_id: string | null; source: FeedbackSource; given_on: string; body: string; addressed_at: string | null; created_at: string }

export type GoalArea = "research" | "career" | "learning" | "health" | "money" | "personal";
export const GOAL_AREA: Record<GoalArea, string> = { research: "Research", career: "Career", learning: "Learning", health: "Health", money: "Money", personal: "Personal" };
export type GoalMeasure = "manual" | "milestones" | "project" | "habit" | "savings";
export const GOAL_MEASURE: Record<GoalMeasure, string> = {
  manual: "A number I update", milestones: "A checklist", project: "A project’s tasks", habit: "Days a habit was done", savings: "A savings account’s balance",
};
export interface Milestone { label: string; done: boolean }
export interface Goal {
  id: string; year: number; title: string; area: GoalArea; measure: GoalMeasure; target: number | null; current: number; unit: string;
  milestones: Milestone[]; project_id: string | null; habit_id: string | null; account_id: string | null; due_on: string | null;
  status: "active" | "achieved" | "dropped"; notes: string; position: number; created_at: string; updated_at: string;
}

export type TripStatus = "considering" | "abstract_submitted" | "accepted" | "registered" | "booked" | "attended" | "cancelled";
export const TRIP_STATUS: Record<TripStatus, string> = {
  considering: "Considering", abstract_submitted: "Abstract submitted", accepted: "Accepted", registered: "Registered", booked: "Travel booked", attended: "Attended", cancelled: "Cancelled",
};
export type TripKind = "conference" | "workshop" | "course" | "lab_visit" | "other";
export const TRIP_KIND: Record<TripKind, string> = { conference: "Conference", workshop: "Workshop", course: "Course", lab_visit: "Lab visit", other: "Other" };
export type Presentation = "none" | "poster" | "oral" | "invited" | "attending";
export const PRESENTATION: Record<Presentation, string> = { none: "Not decided", poster: "Poster", oral: "Oral talk", invited: "Invited talk", attending: "Attending only" };
export interface TripCost { label: string; amount: number; paid: boolean; transaction_id?: string | null }
export interface TripFunding { source: string; amount: number; status: "applied" | "awarded" | "declined"; due_on?: string | null }
export interface Trip {
  id: string; title: string; kind: TripKind; status: TripStatus; location: string; url: string | null; starts_on: string | null; ends_on: string | null;
  abstract_due: string | null; registration_due: string | null; presentation: Presentation; abstract_title: string; abstract: string;
  project_id: string | null; publication_id: string | null; currency: string; costs: TripCost[]; funding: TripFunding[]; checklist: Milestone[];
  notes: string; created_at: string; updated_at: string;
}
