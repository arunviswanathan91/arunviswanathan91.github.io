import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildIcs } from "./ics.ts";

// Read-only calendar feed for Google/Apple Calendar: GET ?token=<ws_settings.calendar_token>.
// Deployed with --no-verify-jwt because calendar apps can't send a Supabase session; the
// unguessable token is the credential and can be revoked from the dashboard.
Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return new Response("Not found", { status: 404 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: owner } = await db.from("ws_settings").select("user_id").eq("calendar_token", token).maybeSingle();
  if (!owner) return new Response("Not found", { status: 404 });
  const { data, error } = await db.rpc("ws_calendar_feed", { p_token: token });
  if (error) return new Response("Unavailable", { status: 503 });
  const base = (Deno.env.get("DASHBOARD_URL") ?? "https://arunviswanathan91.github.io/dashboard/").replace(/#.*$/, "").replace(/\/$/, "");
  const events = (data ?? []).map((r: { kind: string; ref_id: string; title: string; day: string; at: string | null; detail: string | null; path: string }) => ({
    uid: `${r.kind}-${r.ref_id}-${r.day}`,
    title: r.title,
    day: r.day,
    at: r.at,
    detail: r.detail,
    url: `${base}/#/${r.path}`,
  }));
  return new Response(buildIcs(events, "Arun’s workspace"), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900" },
  });
});
