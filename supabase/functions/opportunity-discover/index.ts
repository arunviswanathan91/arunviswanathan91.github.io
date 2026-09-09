import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { userIdFromRequest } from "../_shared/gmail.ts";

const corsHeaders = {
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
 status,
 headers: { ...corsHeaders, "content-type": "application/json" },
});

const failRun = async (db: ReturnType<typeof createClient>, runId: string, error: string) => {
 await db.from("discovery_runs").update({
  status: "failed", error: error.slice(0, 500), finished_at: new Date().toISOString(),
 }).eq("id", runId);
};

Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

 // The Supabase gateway verifies the caller's JWT for this function. The user
 // id comes from that verified token, never from the request body.
 const userId = userIdFromRequest(req);
 if (!userId) return json({ error: "unauthenticated" }, 401);

 let body: { query?: unknown };
 try { body = await req.json(); }
 catch { return json({ error: "invalid_json" }, 400); }
 const query = typeof body.query === "string" ? body.query.trim().replace(/\s+/g, " ") : "";
 if (!query) return json({ error: "Enter what you want to find." }, 400);
 if (query.length > 180) return json({ error: "Keep the search under 180 characters." }, 400);

 const supabaseUrl = Deno.env.get("SUPABASE_URL");
 const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const discoveryUrl = Deno.env.get("DISCOVERY_URL");
 const sharedSecret = Deno.env.get("DISCOVERY_SHARED_SECRET");
 if (!supabaseUrl || !serviceKey || !discoveryUrl || !sharedSecret) {
  return json({ error: "Discovery is not configured on this deployment." }, 503);
 }
 const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
 });

 // Attach the workspace to an existing run instead of starting competing work.
 const { data: busy } = await db.from("discovery_runs")
  .select("id,status,query")
  .eq("user_id", userId)
  .in("status", ["queued", "running"])
  .gt("expires_at", new Date().toISOString())
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
 if (busy) return json({
  run_id: busy.id, status: busy.status, query: busy.query, already_running: true,
 });

 const { data: profile } = await db.from("discovery_profiles")
  .select("id").eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
 const claimToken = crypto.randomUUID();
 const { data: run, error: insertError } = await db.from("discovery_runs").insert({
  user_id: userId,
  profile_id: profile?.id ?? null,
  trigger: "manual",
  status: "queued",
  query,
  chat_id: null,
  claim_token: claimToken,
  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
 }).select("id").single();
 if (insertError || !run) return json({ error: "Could not create the discovery run." }, 500);

 const execute = async () => {
  try {
   const response = await fetch(discoveryUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-discovery-secret": sharedSecret },
    body: JSON.stringify({ run_id: run.id, claim_token: claimToken }),
   });
   if (!response.ok) await failRun(db, run.id, `Discovery worker returned HTTP ${response.status}.`);
  } catch (error) {
   await failRun(db, run.id, error instanceof Error ? error.message : "Discovery worker request failed.");
  }
 };

 // Cloud Run must keep its request open while it searches, but this browser
 // endpoint returns immediately. The workspace follows progress from the run row.
 EdgeRuntime.waitUntil(execute());
 return json({ run_id: run.id, status: "queued", query }, 202);
});
