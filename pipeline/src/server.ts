import { createServer } from "node:http";
import { runDiscovery } from "./run.js";
import { formatDigest, sendTelegram } from "./sinks/telegram.js";
import { Db } from "./db.js";
import { readEnv } from "./config.js";

const DASHBOARD = "https://arunviswanathan91.github.io/dashboard/#/opportunities";
const PORT = Number(process.env.PORT ?? 8080);

const readBody = (req: import("node:http").IncomingMessage): Promise<string> =>
 new Promise((resolve, reject) => {
  let body = "";
  req.on("data", c => { body += c; if (body.length > 1_000_000) req.destroy(); });
  req.on("end", () => resolve(body));
  req.on("error", reject);
 });

/**
 * Thin HTTP wrapper -- zero pipeline logic. Cloud Run's default (request-based)
 * CPU allocation gives the container no CPU once a response is sent, so the
 * entire run must finish before responding; there is no "202 then work in the
 * background" option here.
 */
const server = createServer(async (req, res) => {
 if (req.method !== "POST" || req.url !== "/discover") {
  res.writeHead(404).end();
  return;
 }
 if (req.headers["x-discovery-secret"] !== process.env.DISCOVERY_SHARED_SECRET) {
  res.writeHead(401).end();
  return;
 }

 let payload: { run_id?: string; claim_token?: string };
 try { payload = JSON.parse(await readBody(req)); }
 catch { res.writeHead(400).end("bad json"); return; }

 if (!payload.run_id || !payload.claim_token) {
  res.writeHead(400).end("run_id and claim_token required");
  return;
 }

 try {
  const env = readEnv();
  const db = new Db(env);
  const claimed = await db.claimRun(payload.run_id, payload.claim_token);
  if (!claimed) {
   // Not an error: the token was already used, or the run expired. Telegram
   // retries deliveries, so this makes the endpoint safe to call twice.
   res.writeHead(200).end("already claimed or expired");
   return;
  }

  const result = await runDiscovery({
   userId: claimed.user_id, runId: payload.run_id, trigger: "telegram",
   query: claimed.query ?? null, chatId: claimed.chat_id ?? null, quiet: true,
  });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (claimed.chat_id && token) {
   await sendTelegram(token, claimed.chat_id, formatDigest(result, DASHBOARD));
  }

  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
 } catch (e) {
  console.error(JSON.stringify({ level: "error", msg: e instanceof Error ? e.message : String(e) }));
  res.writeHead(500).end("run failed");
 }
});

server.listen(PORT, () => console.log(`discovery worker listening on ${PORT}`));
