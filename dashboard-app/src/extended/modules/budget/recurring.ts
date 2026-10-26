// Date rule for recurring transactions (mirrors ws_private.next_monthly in SQL).

/** First date on or after `from` that falls on `day` of the month (clamped to the month's end). */
export function firstOn(from: string, day: number): string {
  const [y, m, d] = from.split("-").map(Number);
  const at = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const here = at(y, m);
  if (Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate()) >= d) return here;
  return m === 12 ? at(y + 1, 1) : at(y, m + 1);
}
