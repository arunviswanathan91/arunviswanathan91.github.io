import { runDiscovery, type RunOptions } from "./run.js";
import { formatDigest, sendTelegram } from "./sinks/telegram.js";

const DASHBOARD = "https://arunviswanathan91.github.io/dashboard/#/opportunities";

function parseArgs(argv: string[]): RunOptions & { help: boolean } {
 const out: RunOptions & { help: boolean } = { help: false };
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  switch (a) {
   case "--help": case "-h": out.help = true; break;
   case "--dry-run": out.dryRun = true; break;
   case "--quiet": out.quiet = true; break;
   case "--trigger": out.trigger = next() as RunOptions["trigger"]; break;
   case "--query": { const v = next(); out.query = v && v !== "null" ? v : null; break; }
   case "--user": out.userId = next(); break;
   case "--run-id": { const v = next(); out.runId = v && v !== "null" ? v : null; break; }
   case "--claim-token": { const v = next(); out.claimToken = v && v !== "null" ? v : null; break; }
   case "--chat-id": { const v = next(); const n = Number(v); out.chatId = isFinite(n) && n !== 0 ? n : null; break; }
   case "--max-llm": out.caps = { ...out.caps, maxLlmCalls: Number(next()) }; break;
   case "--max-http": out.caps = { ...out.caps, maxHttpRequests: Number(next()) }; break;
   default: break;                                     // ignore the leading "run" verb
  }
 }
 return out;
}

const HELP = `
Discovery pipeline

  node dist/src/cli.js run [options]

  --dry-run           parse and score, write nothing
  --trigger <t>       schedule | telegram | manual   (default: schedule)
  --query <text>      extra search terms for this run
  --chat-id <id>      Telegram chat to send the digest to
  --user <uuid>       override DISCOVERY_USER_ID
  --run-id <uuid>     attach to a run row created elsewhere
  --claim-token <t>   atomically claim that run before executing
  --max-llm <n>       cap LLM calls
  --max-http <n>      cap HTTP requests
  --quiet             suppress debug lines
`;

async function main() {
 const opts = parseArgs(process.argv.slice(2));
 if (opts.help) { console.log(HELP.trim()); return; }

 const result = await runDiscovery(opts);

 const digest = formatDigest(result, DASHBOARD);
 console.log("\n" + digest + "\n");

 const token = process.env.TELEGRAM_BOT_TOKEN;
 if (opts.chatId && token && !opts.dryRun) {
  const sent = await sendTelegram(token, opts.chatId, digest);
  if (!sent) console.error("warning: telegram digest could not be delivered");
 }

 // A partial run still produced value, so only a total failure is a non-zero exit.
 process.exit(result.status === "failed" ? 1 : 0);
}

main().catch(e => {
 console.error(JSON.stringify({ level: "fatal", msg: e instanceof Error ? e.message : String(e) }));
 process.exit(1);
});
