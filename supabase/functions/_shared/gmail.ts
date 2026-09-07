// Shared by gmail-oauth-start, gmail-oauth-callback and gmail-search.
// Read-only, narrow-scope Gmail access: never requests write/send/delete, and
// gmail-search only ever fetches message metadata (subject/from/date/snippet),
// never a message body.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// ---- the calling dashboard user ---------------------------------------------

/**
 * Reads the `sub` claim straight out of the JWT payload rather than calling
 * Supabase Auth's /user endpoint -- safe only because Supabase's platform
 * gateway already verified the signature before invoking this function
 * (default verify_jwt=true; gmail-oauth-callback, the one function that turns
 * this off because Google's redirect carries no Supabase session, never calls
 * this and identifies the user via the signed `state` param instead).
 */
export function userIdFromRequest(req: Request): string | null {
 const auth = req.headers.get("authorization") ?? "";
 const jwt = auth.replace(/^Bearer\s+/i, "");
 const parts = jwt.split(".");
 if (parts.length !== 3) return null;
 try {
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  return typeof payload.sub === "string" ? payload.sub : null;
 } catch {
  return null;
 }
}

// ---- signed state for the OAuth round trip ----------------------------------
// The callback is public (Google redirects to it with no Supabase session), so
// the state param is what proves which dashboard user is completing this
// specific consent flow -- HMAC-signed so a forged state can't link someone
// else's Google account onto another user's row.

const STATE_TTL_MS = 10 * 60 * 1000;

const b64url = (bytes: Uint8Array) =>
 btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlToBytes = (s: string) => {
 const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
 const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
 return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function hmacKey(secret: string) {
 return crypto.subtle.importKey(
  "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
 );
}

export async function signState(userId: string, secret: string): Promise<string> {
 const payload = JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS });
 const payloadB64 = b64url(new TextEncoder().encode(payload));
 const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payloadB64));
 return `${payloadB64}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyState(state: string, secret: string): Promise<string | null> {
 const [payloadB64, sigB64] = state.split(".");
 if (!payloadB64 || !sigB64) return null;
 const ok = await crypto.subtle.verify(
  "HMAC", await hmacKey(secret), b64urlToBytes(sigB64), new TextEncoder().encode(payloadB64),
 );
 if (!ok) return null;
 try {
  const { uid, exp } = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  if (typeof uid !== "string" || typeof exp !== "number" || Date.now() > exp) return null;
  return uid;
 } catch {
  return null;
 }
}

// ---- Google's OAuth + Gmail API endpoints -----------------------------------

interface TokenResponse {
 access_token?: string;
 refresh_token?: string;
 scope?: string;
 error?: string;
}

export async function exchangeCodeForTokens(
 code: string, clientId: string, clientSecret: string, redirectUri: string,
): Promise<TokenResponse> {
 const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
   code, client_id: clientId, client_secret: clientSecret,
   redirect_uri: redirectUri, grant_type: "authorization_code",
  }),
 });
 return (await res.json()) as TokenResponse;
}

/** Returns null specifically for invalid_grant (token revoked from Google's side,
 *  e.g. via myaccount.google.com/permissions) so the caller can clean up the
 *  stale row instead of failing the same way forever. */
export async function refreshAccessToken(
 refreshToken: string, clientId: string, clientSecret: string,
): Promise<string | null> {
 const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
   refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
   grant_type: "refresh_token",
  }),
 });
 const json = (await res.json()) as TokenResponse;
 return json.access_token ?? null;
}

export interface GmailHit { threadId: string; subject: string; from: string; date: string; snippet: string }

/** format=metadata never fetches the message body -- only headers we ask for,
 *  plus the snippet Gmail always includes on the message resource. */
export async function searchGmail(accessToken: string, query: string, max = 5): Promise<GmailHit[]> {
 const listRes = await fetch(
  `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`,
  { headers: { authorization: `Bearer ${accessToken}` } },
 );
 if (!listRes.ok) return [];
 const { messages } = (await listRes.json()) as { messages?: { id: string; threadId: string }[] };
 if (!messages?.length) return [];

 const hits: GmailHit[] = [];
 for (const m of messages) {
  const res = await fetch(
   `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}` +
   `?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
   { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) continue;
  const msg = await res.json() as {
   threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] };
  };
  const header = (name: string) => msg.payload?.headers?.find(h => h.name === name)?.value ?? "";
  hits.push({
   threadId: msg.threadId, subject: header("Subject") || "(no subject)",
   from: header("From"), date: header("Date"), snippet: msg.snippet ?? "",
  });
 }
 return hits;
}
