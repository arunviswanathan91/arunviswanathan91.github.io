// Browser-invoked (default JWT verification applies -- this must stay ON for
// this function, unlike gmail-oauth-callback). Returns the Google consent URL
// to open in a new tab; the dashboard never talks to Google directly.
import { signState, GMAIL_SCOPE, userIdFromRequest } from "../_shared/gmail.ts";

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

 const userId = userIdFromRequest(req);
 if (!userId) return json({ error: "unauthenticated" }, 401);

 const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
 const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
 const stateSecret = Deno.env.get("GMAIL_OAUTH_STATE_SECRET");
 if (!clientId || !redirectUri || !stateSecret) return json({ error: "gmail_not_configured" }, 500);

 const state = await signState(userId, stateSecret);
 const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.searchParams.set("client_id", clientId);
 url.searchParams.set("redirect_uri", redirectUri);
 url.searchParams.set("response_type", "code");
 url.searchParams.set("scope", GMAIL_SCOPE);
 url.searchParams.set("access_type", "offline");   // required to get a refresh_token back
 url.searchParams.set("prompt", "consent");         // forces one even on a re-connect
 url.searchParams.set("state", state);

 return json({ url: url.toString() });
});
