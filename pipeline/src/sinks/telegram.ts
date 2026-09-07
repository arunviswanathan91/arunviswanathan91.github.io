import type { RunResult } from "../types.js";

const fmtDate = (iso: string | null) =>
 iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

export function formatDigest(r: RunResult, dashboardUrl: string): string {
 if (!r.top.length) {
  const nothing = r.fetched === 0
   ? "Nothing new was published since the last run."
   : `Looked at ${r.fetched} listings, none of them matched well enough to show you.`;
  return nothing + (r.degradations.length ? `\n\nSkipped: ${r.degradations.join(", ")}.` : "");
 }

 const lines: string[] = [];
 lines.push(`Found ${r.created} new${r.changed ? `, ${r.changed} updated` : ""}.`);
 lines.push("");

 r.top.forEach((o, i) => {
  lines.push(`${i + 1}. ${o.score} · ${o.role}`);
  const meta = [o.organization, o.location].filter(Boolean).join(" · ");
  const tail = [fmtDate(o.deadline) ? `deadline ${fmtDate(o.deadline)}` : null, o.salaryDisplay].filter(Boolean).join(" · ");
  if (meta) lines.push(`   ${meta}`);
  if (tail) lines.push(`   ${tail}`);
  lines.push(`   ${o.url}`);
 });

 if (r.degradations.length) { lines.push(""); lines.push(`Skipped: ${r.degradations.join(", ")}.`); }
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
