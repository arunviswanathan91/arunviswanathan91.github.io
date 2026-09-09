import type { RunResult } from "../types.js";

const fmtDate = (iso: string | null) =>
 iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

const FILTER_LABELS: Record<string, string> = {
 deadline_passed: "deadline already passed",
 junk_title: "not a research role",
 type_excluded: "role type excluded by profile",
 faculty_excluded: "faculty role excluded",
 location_excluded: "location excluded by profile",
 too_senior: "too much required experience",
 leadership_role: "senior leadership role",
 below_salary_floor: "confirmed salary below floor",
 blocked_org: "blocked organisation",
 unknown: "other filter",
};

const quoted = (value: string) => `“${value.replace(/[“”]/g, "\"").slice(0, 120)}”`;

function diagnosticLine(r: RunResult): string {
 const parts = [`Fetched ${r.fetched}`, `evaluated ${r.evaluated}`, `filtered ${r.filtered}`];
 if (r.deduped) parts.push(`already known/duplicate ${r.deduped}`);
 if (r.persistenceFailures) parts.push(`database failures ${r.persistenceFailures}`);
 return parts.join(" · ");
}

function filterLine(r: RunResult): string | null {
 const entries = Object.entries(r.filterReasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
 if (!entries.length) return null;
 return "Main filters: " + entries.map(([reason, count]) => `${FILTER_LABELS[reason] ?? reason} ${count}`).join(" · ");
}

export function formatDigest(r: RunResult, dashboardUrl: string): string {
 if (!r.top.length) {
  const subject = r.query ? ` for ${quoted(r.query)}` : "";
  const nothing = r.fetched === 0
   ? (r.mode === "fresh" ? `No listings were returned${subject}.` : "Nothing new was published since the last run.")
   : `No matching opportunities were found${subject}.`;
  const details = [nothing, diagnosticLine(r), filterLine(r)].filter(Boolean);
  if (r.degradations.length) details.push(`Source issues: ${r.degradations.join(", ")}.`);
  return details.join("\n\n");
 }

 const lines: string[] = [];
 if (r.mode === "fresh") {
  const subject = r.query ? ` for ${quoted(r.query)}` : "";
  lines.push(`Found ${r.matched} current match${r.matched === 1 ? "" : "es"}${subject}.`);
  lines.push(`${r.created} new · ${Math.max(0, r.matched - r.created)} already in your workspace`);
 } else {
  lines.push(`Found ${r.created} new${r.changed ? `, ${r.changed} updated` : ""}.`);
 }
 lines.push("");

 r.top.forEach((o, i) => {
  lines.push(`${i + 1}. ${o.score} · ${o.role}`);
  const meta = [o.organization, o.location].filter(Boolean).join(" · ");
  const tail = [fmtDate(o.deadline) ? `deadline ${fmtDate(o.deadline)}` : null, o.salaryDisplay].filter(Boolean).join(" · ");
  if (meta) lines.push(`   ${meta}`);
  if (tail) lines.push(`   ${tail}`);
  lines.push(`   ${o.url}`);
 });

 if (r.degradations.length) { lines.push(""); lines.push(`Source issues: ${r.degradations.join(", ")}.`); }
 lines.push("");
 lines.push(dashboardUrl);
 return lines.join("\n");
}

export async function sendTelegram(botToken: string, chatId: number, text: string): Promise<boolean> {
 try {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
   method: "POST",
   headers: { "content-type": "application/json" },
   body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
 } catch { return false; }
}
