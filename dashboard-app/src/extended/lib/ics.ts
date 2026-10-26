// iCalendar (RFC 5545) for agenda items. Kept dependency-free: the same file is copied to
// supabase/functions/calendar-feed/ics.ts for the subscribable feed (a test keeps them identical).

export interface IcsEvent {
  uid: string;
  title: string;
  /** YYYY-MM-DD; used as an all-day event when `at` is null. */
  day: string;
  /** Exact start time (ISO) for timed events. */
  at: string | null;
  detail?: string | null;
  url?: string | null;
}

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (day: string) => day.replace(/-/g, "");
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** Lines longer than 75 characters continue on the next line after a space. */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? " " : "") + line.slice(i, i + 73));
  return parts.join("\r\n");
}

export function buildIcs(events: IcsEvent[], name: string, now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Arun workspace//Agenda//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escape(name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@arun-workspace`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${escape(e.title)}`);
    if (e.at) {
      const start = new Date(e.at);
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 30 * 60000))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.day)}`, `DTEND;VALUE=DATE:${dateOnly(nextDay(e.day))}`, "TRANSP:TRANSPARENT");
    }
    if (e.detail) lines.push(`DESCRIPTION:${escape(e.detail + (e.url ? `\n${e.url}` : ""))}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
