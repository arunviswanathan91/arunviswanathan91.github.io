import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAlertsFor } from "../_shared/alerts.ts";

// "Check now" from the dashboard: fetch new papers and funding calls for the signed-in user.
// The daily run happens in telegram-reminder-sweep; this only lets the user ask early.
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const auth = req.headers.get("authorization") ?? "";
  // Who is asking: the user's own token, checked by Supabase Auth.
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { authorization: auth } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ ok: false, error: "Sign in required" }, 401);
  // Writes go through the user's own session, so row-level security still applies.
  const { data: settings, error } = await asUser.from("ws_settings").select("paper_alert_topics,funding_topics,funding_feeds,paper_alerts_checked_on").eq("user_id", user.id).maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500);
  // Same window as a daily run: from the last check (or a week back).
  const report = await runAlertsFor(asUser, user.id, settings ?? {});
  return json({ ok: true, ...report });
});
