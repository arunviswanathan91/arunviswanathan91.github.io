// Google redirects the browser here directly -- there is no Supabase session on
// this request, so it MUST be deployed with --no-verify-jwt (see the README).
// The signed `state` param (see _shared/gmail.ts) is what ties this callback
// back to a specific dashboard user instead of Supabase's normal JWT check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exchangeCodeForTokens, verifyState } from "../_shared/gmail.ts";

const html = (body: string, status = 200) =>
 new Response(
  `<!doctype html><html><body style="font:16px system-ui;padding:2rem;text-align:center">${body}</body></html>`,
  { status, headers: { "content-type": "text/html" } },
 );

Deno.serve(async (req) => {
 const url = new URL(req.url);
 const code = url.searchParams.get("code");
 const state = url.searchParams.get("state");
 const err = url.searchParams.get("error");
 if (err) return html(`Gmail connection cancelled (${err}). You can close this tab.`);
 if (!code || !state) return html("Missing code or state.", 400);

 const stateSecret = Deno.env.get("GMAIL_OAUTH_STATE_SECRET")!;
 const userId = await verifyState(state, stateSecret);
 if (!userId) return html("This link expired or is invalid -- go back and try Connect Gmail again.", 400);

 const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
 const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
 const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI")!;
 const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
 if (!tokens.refresh_token) {
  // Google only issues a refresh_token on first consent for a given scope set
  // unless prompt=consent forces one -- gmail-oauth-start always sets it, so
  // landing here means the token exchange itself failed.
  return html("Could not complete the Gmail connection. Please try again.", 400);
 }

 const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const { error } = await db.from("google_accounts").upsert({
  user_id: userId, refresh_token: tokens.refresh_token, scope: tokens.scope ?? null,
  connected_at: new Date().toISOString(),
 }, { onConflict: "user_id" });
 if (error) return html(`Saved the connection but hit a database error: ${error.message}`, 500);

 return html("Gmail connected. You can close this tab and go back to the dashboard.");
});
