// Browser-invoked (default JWT verification applies). Body: {"query": "..."}.
// Returns up to 5 metadata-only hits, or a 409 {error:"not_connected"} the
// picker UI turns into a "Connect Gmail" prompt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refreshAccessToken, searchGmail, userIdFromRequest } from "../_shared/gmail.ts";

const corsHeaders = {
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
 new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json" },
 });

Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

 const userId = userIdFromRequest(req);
 if (!userId) return json({ error: "unauthenticated" }, 401);

 let query = "";
 try { ({ query } = await req.json()); } catch { /* falls through to the empty-query check */ }
 if (!query || !query.trim()) return json({ error: "empty_query" }, 400);

 const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const { data: account } = await db.from("google_accounts")
  .select("refresh_token").eq("user_id", userId).maybeSingle();
 if (!account?.refresh_token) return json({ error: "not_connected" }, 409);

 const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
 const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
 const accessToken = await refreshAccessToken(account.refresh_token, clientId, clientSecret);
 if (!accessToken) {
  // Almost always invalid_grant: access was revoked from Google's side
  // (myaccount.google.com/permissions). Clear the stale row so the next
  // attempt cleanly asks to reconnect instead of failing the same way forever.
  await db.from("google_accounts").delete().eq("user_id", userId);
  return json({ error: "not_connected" }, 409);
 }

 const hits = await searchGmail(accessToken, query.trim());
 return json({ hits });
});
