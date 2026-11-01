// Resume document model. One resume = one JSON document: a profile block, an ordered list of
// sections (each with items) and a style. Everything here is pure so it can be unit-tested.

export interface ResumeLink { label: string; url: string }
export interface ResumeProfile {
  name: string; headline: string; email: string; phone: string; location: string;
  links: ResumeLink[]; summary: string;
}
/** One entry in a section. Which fields show depends on the section type (see SECTION_TYPES). */
export interface ResumeItem {
  id: string; hidden?: boolean;
  title: string;        // degree, job title, skill group, publication, award …
  subtitle: string;     // school, employer, issuer, level …
  link: string;
  start: string; end: string; location: string;
  body: string;         // one bullet per line
}
export type SectionType =
  | "education" | "experience" | "skills" | "languages" | "certification" | "interests" | "projects" | "courses"
  | "awards" | "volunteering" | "publications" | "references" | "conferences" | "scores" | "teaching" | "custom";
export interface ResumeSection { id: string; type: SectionType; title: string; hidden?: boolean; items: ResumeItem[] }
export type HeadingStyle = "underline" | "box" | "plain" | "bar" | "overline" | "dotted";
/** Customize tab. Font sizes are in pt; the *Size fields are offsets from the base size (as in the reference builder). */
export type DisplayMode = "grid" | "rows" | "compact" | "bubble";
export interface SectionLayout { mode: DisplayMode; cols: 1 | 2 | 3 | 4; subinfo: "colon" | "dash" | "bracket"; sep: "bullet" | "pipe" | "comma" }
/** Sections whose entries can be shown as a grid, rows, a compact line or bubbles. */
export const LAYOUT_TYPES: SectionType[] = ["skills", "languages", "interests", "certification", "courses", "awards", "scores"];
const BASE_LAYOUT: SectionLayout = { mode: "grid", cols: 1, subinfo: "colon", sep: "bullet" };
const TYPE_LAYOUT: Partial<Record<SectionType, Partial<SectionLayout>>> = {
  languages: { mode: "compact" }, interests: { mode: "compact", sep: "comma" }, certification: { cols: 3 }, scores: { mode: "compact", sep: "pipe", subinfo: "dash" },
};
export function layoutFor(style: Pick<ResumeStyle, "layouts">, type: SectionType): SectionLayout {
  return { ...BASE_LAYOUT, ...TYPE_LAYOUT[type], ...(style.layouts?.[type] ?? {}) };
}
/** "Title: sub", "Title – sub" or "Title (sub)". */
export function withSubinfo(title: string, sub: string, how: SectionLayout["subinfo"]): string {
  if (!sub.trim()) return title;
  return how === "dash" ? `${title} – ${sub}` : how === "bracket" ? `${title} (${sub})` : `${title}: ${sub}`;
}
/** Consecutive entries at the same employer (case-insensitive, non-empty) form one run. */
export function groupRuns<T extends { subtitle: string }>(items: T[]): T[][] {
  const key = (i: T) => i.subtitle.trim().toLowerCase();
  const runs: T[][] = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    if (last && key(it) && key(last[0]) === key(it)) last.push(it);
    else runs.push([it]);
  }
  return runs;
}

export type AccentTarget = "name" | "headline" | "headings" | "line" | "dates" | "entryTitle";
export const ACCENT_TARGETS: [AccentTarget, string][] = [["name", "Name"], ["headline", "Job title"], ["headings", "Headings"], ["line", "Headings line"], ["dates", "Dates"], ["entryTitle", "Entry title"]];
export interface ResumeStyle {
  pageFormat: "A4" | "Letter";
  font: FontKey; nameFont: FontKey | "same"; accent: string;
  accentOn: Record<AccentTarget, boolean>;
  align: "left" | "center"; headlinePos: "inline" | "below"; separator: "bar" | "bullet" | "none";
  baseSize: number; nameSize: number; titleSize: number; headingSize: number; entrySize: number;
  lineHeight: number; spacing: number;          // spacing = gap between entries, pt
  marginX: number; marginY: number;             // mm
  entryLayout: "columns" | "full"; datePos: "right" | "left"; subtitle: "same" | "below";
  headingStyle: HeadingStyle; caps: "capitalize" | "uppercase";
  /** Summary: shown inside the header block (no heading), and/or with its own "Summary" heading. */
  summaryInHeader: boolean; summaryHeading: boolean;
  /** Education/experience: show the school/employer first, then the degree/job title. */
  swapEducation: boolean; swapExperience: boolean;
  /** Consecutive roles at the same employer share one employer heading. */
  groupPromotions: boolean;
  /** Per-section display (see layoutFor). */
  layouts: Partial<Record<SectionType, Partial<SectionLayout>>>;
  /** Print footer: email on the left, page n/N on the right. */
  footer: boolean;
}
export interface ResumeData { profile: ResumeProfile; sections: ResumeSection[]; style: ResumeStyle }

export type ItemField = "title" | "subtitle" | "link" | "dates" | "location" | "body";
export interface SectionTypeDef {
  label: string; blurb: string; defaultTitle: string;
  /** Field labels; a field not listed is not shown for this type. */
  labels: Partial<Record<ItemField, string>>;
}

export const SECTION_TYPES: Record<SectionType, SectionTypeDef> = {
  education: { label: "Education", blurb: "Degrees and schools, with focus, honors or exchange terms.", defaultTitle: "Education", labels: { title: "Degree", subtitle: "School", link: "School link", dates: "Dates", location: "Location", body: "Description" } },
  experience: { label: "Research Experience", blurb: "Professional roles and employer history, including internships.", defaultTitle: "Research Experience", labels: { title: "Job title", subtitle: "Employer", link: "Employer link", dates: "Dates", location: "Location", body: "Description" } },
  skills: { label: "Skills", blurb: "Hard and soft skills, grouped by heading.", defaultTitle: "Skills", labels: { title: "Group", body: "Skills" } },
  languages: { label: "Languages", blurb: "Languages and proficiency level.", defaultTitle: "Languages", labels: { title: "Language", subtitle: "Proficiency" } },
  certification: { label: "Certification", blurb: "Industry certificates or licences, with issuer and date.", defaultTitle: "Certifications", labels: { title: "Certificate", subtitle: "Issuer", link: "Link", dates: "Dates", body: "Description" } },
  interests: { label: "Interests", blurb: "Personal interests that support your story.", defaultTitle: "Interests", labels: { title: "Interest" } },
  projects: { label: "Projects", blurb: "Key projects: your role, challenges and impact.", defaultTitle: "Projects", labels: { title: "Project", subtitle: "Role", link: "Link", dates: "Dates", body: "Description" } },
  courses: { label: "Courses", blurb: "Online or in-person courses and trainings completed.", defaultTitle: "Courses", labels: { title: "Course", subtitle: "Institution", link: "Link", dates: "Dates", body: "Description" } },
  awards: { label: "Awards", blurb: "Awards and recognitions from industry or academia.", defaultTitle: "Awards", labels: { title: "Award", subtitle: "Awarded by", dates: "Dates", body: "Description" } },
  volunteering: { label: "Volunteering and Community Involvement", blurb: "Memberships or volunteering, including your role.", defaultTitle: "Volunteering and Community Involvement", labels: { title: "Role", subtitle: "Organisation", link: "Link", dates: "Dates", location: "Location", body: "Description" } },
  publications: { label: "Publications", blurb: "Publications, articles or books you wrote or contributed to.", defaultTitle: "Publications", labels: { title: "Citation", subtitle: "Journal", link: "Link", dates: "Date", body: "Notes" } },
  references: { label: "References", blurb: "References from managers or coworkers, with contact details.", defaultTitle: "References", labels: { title: "Name", subtitle: "Position, organisation", body: "Contact details" } },
  conferences: { label: "Conferences", blurb: "Conferences attended or presented at.", defaultTitle: "Conferences", labels: { title: "Presentation or event", subtitle: "Conference", link: "Link", dates: "Dates", location: "Location", body: "Description" } },
  scores: { label: "Test Scores", blurb: "Exam and test results.", defaultTitle: "Test Scores", labels: { title: "Test", subtitle: "Score", dates: "Date" } },
  teaching: { label: "Additional Teaching Experience", blurb: "Teaching, mentoring and training.", defaultTitle: "Additional Teaching Experience", labels: { title: "Role", subtitle: "Institution", dates: "Dates", location: "Location", body: "Description" } },
  custom: { label: "Custom", blurb: "A custom section for anything else.", defaultTitle: "Custom section", labels: { title: "Title", subtitle: "Subtitle", link: "Link", dates: "Dates", location: "Location", body: "Description" } },
};
export const SECTION_ORDER = Object.keys(SECTION_TYPES) as SectionType[];

export const ACCENTS = ["#111111", "#455a64", "#527a80", "#3589a6", "#355c7d", "#3b6ea8", "#42246e", "#6b2d52", "#c4607a", "#f4606c", "#2f6b4f", "#b45309"];
export const DEFAULT_STYLE: ResumeStyle = {
  pageFormat: "A4", font: "serif", nameFont: "same", accent: "#111111",
  accentOn: { name: false, headline: false, headings: true, line: true, dates: false, entryTitle: false },
  align: "left", headlinePos: "inline", separator: "bar",
  baseSize: 9.5, nameSize: 8, titleSize: 2, headingSize: 1, entrySize: 0,
  lineHeight: 1.15, spacing: 4, marginX: 12, marginY: 12,
  entryLayout: "columns", datePos: "right", subtitle: "same",
  headingStyle: "underline", caps: "capitalize", summaryInHeader: false, summaryHeading: false, swapEducation: false, swapExperience: false, groupPromotions: true, layouts: {}, footer: false,
};
export const FONTS = {
  serif: { label: "Source Serif", stack: '"Source Serif 4", Georgia, "Times New Roman", serif' },
  amiri: { label: "Amiri", stack: 'Amiri, Georgia, serif' },
  vollkorn: { label: "Vollkorn", stack: 'Vollkorn, Georgia, serif' },
  lora: { label: "Lora", stack: 'Lora, Georgia, serif' },
  merriweather: { label: "Merriweather", stack: 'Merriweather, Georgia, serif' },
  garamond: { label: "EB Garamond", stack: '"EB Garamond", Garamond, Georgia, serif' },
  crimson: { label: "Crimson Pro", stack: '"Crimson Pro", Georgia, serif' },
  classic: { label: "Palatino", stack: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif' },
  sans: { label: "DM Sans", stack: '"DM Sans", system-ui, "Segoe UI", Arial, sans-serif' },
  inter: { label: "Inter", stack: 'Inter, system-ui, "Segoe UI", Arial, sans-serif' },
  lato: { label: "Lato", stack: 'Lato, system-ui, "Segoe UI", Arial, sans-serif' },
  opensans: { label: "Open Sans", stack: '"Open Sans", system-ui, "Segoe UI", Arial, sans-serif' },
  mono: { label: "Monospace", stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
} as const satisfies Record<string, { label: string; stack: string }>;
export type FontKey = keyof typeof FONTS;
export const fontStack = (k: string): string => (FONTS as Record<string, { stack: string }>)[k]?.stack ?? FONTS.serif.stack;
export const HEADING_STYLES: [HeadingStyle, string][] = [["underline", "Underline"], ["box", "Box"], ["plain", "Plain"], ["bar", "Side bar"], ["overline", "Overline"], ["dotted", "Dotted"]];
export const PAGES = { A4: { w: 210, h: 297 }, Letter: { w: 215.9, h: 279.4 } } as const;

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export function newItem(over: Partial<ResumeItem> = {}): ResumeItem {
  return { id: uid(), title: "", subtitle: "", link: "", start: "", end: "", location: "", body: "", ...over };
}
export function newSection(type: SectionType, over: Partial<ResumeSection> = {}): ResumeSection {
  return { id: uid(), type, title: SECTION_TYPES[type].defaultTitle, items: [], ...over };
}
export function emptyResume(): ResumeData {
  return {
    profile: { name: "", headline: "", email: "", phone: "", location: "", links: [], summary: "" },
    sections: [newSection("education"), newSection("experience"), newSection("skills")],
    style: { ...DEFAULT_STYLE },
  };
}

/** Fill gaps so documents saved by an older version (or hand-edited) always render. */
export function normalizeResume(raw: unknown): ResumeData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ResumeData>;
  const base = emptyResume();
  const sections = Array.isArray(r.sections) ? r.sections : base.sections;
  return {
    profile: { ...base.profile, ...(r.profile ?? {}), links: Array.isArray(r.profile?.links) ? r.profile!.links : [] },
    style: (() => {
      const old = (r.style ?? {}) as Partial<ResumeStyle> & { twoColumnSkills?: boolean };
      const layouts = { ...(old.layouts ?? {}) };
      if (old.twoColumnSkills && !layouts.skills) layouts.skills = { cols: 2 };
      const { twoColumnSkills: _drop, ...rest } = old;
      void _drop;
      return { ...DEFAULT_STYLE, ...rest, layouts, accentOn: { ...DEFAULT_STYLE.accentOn, ...(old.accentOn ?? {}) } };
    })(),
    sections: sections.map((s) => ({
      id: s.id || uid(),
      type: s.type in SECTION_TYPES ? s.type : "custom",
      title: s.title ?? SECTION_TYPES[(s.type in SECTION_TYPES ? s.type : "custom") as SectionType].defaultTitle,
      hidden: !!s.hidden,
      items: (Array.isArray(s.items) ? s.items : []).map((i) => newItem({ ...i, id: i.id || uid() })),
    })),
  };
}

/** Deep copy with fresh ids, so a duplicate never shares ids with its source. */
export function cloneResume(d: ResumeData): ResumeData {
  const c = normalizeResume(JSON.parse(JSON.stringify(d)));
  return { ...c, sections: c.sections.map((s) => ({ ...s, id: uid(), items: s.items.map((i) => ({ ...i, id: uid() })) })) };
}

export function moveBy<T>(arr: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= arr.length) return arr;
  const out = arr.slice();
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** Bullet lines: one per non-empty line; a leading "-", "•" or "*" is ignored. */
export function bullets(body: string): string[] {
  return body.split(/\r?\n/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}

export function dateRange(i: Pick<ResumeItem, "start" | "end">): string {
  const s = i.start.trim(), e = i.end.trim();
  return s && e ? `${s} – ${e}` : s || e;
}

/** What shows on the page: hidden sections and items are dropped, as are sections left empty. */
/** A freshly added, still-blank entry should not print an empty heading. */
export function hasContent(i: ResumeItem): boolean {
  return [i.title, i.subtitle, i.body, i.start, i.end, i.location, i.link].some((v) => v.trim());
}

export function visibleSections(d: ResumeData): ResumeSection[] {
  return d.sections
    .filter((s) => !s.hidden)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.hidden && hasContent(i)) }))
    .filter((s) => s.items.length > 0);
}

export function pdfFilename(title: string, name: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  return clean(title) || clean(name) || "Resume";
}

/** "edited 4 days ago" */
export function ago(ts: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(ts).getTime()) / 1000);
  const units: [number, string][] = [[86400 * 30, "month"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [n, name] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${name}${v > 1 ? "s" : ""} ago`; }
  return "just now";
}

