// Dates are handled as local YYYY-MM-DD strings; timestamps only where time matters (meetings).

export function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function today(): string {
  return isoDate(new Date());
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(monthStart: string, n: number): string {
  const d = new Date(`${monthStart}T12:00:00`);
  d.setMonth(d.getMonth() + n, 1);
  return isoDate(d);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const w = new Date(`${day}T12:00:00`).getDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

export function fmtDate(day: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!day) return "";
  return new Date(day.length === 10 ? `${day}T12:00:00` : day).toLocaleDateString("en-GB", opts);
}

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "today", "tomorrow", "in 3 days", "2 days ago" for a YYYY-MM-DD date. */
export function relDay(day: string, now = today()): string {
  const diff = Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${now}T12:00:00`).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Value for <input type="datetime-local"> from a timestamp, in local time. */
export function toLocalInput(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function fmtBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

