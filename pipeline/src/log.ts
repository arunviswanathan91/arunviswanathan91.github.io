/**
 * Logs go to stdout, and stdout of a public repository's Actions run is world
 * readable. Anything that looks like a JWT or an API key is redacted before it
 * can be printed.
 */
const SECRET_RE = /(eyJ[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,})/g;

export const redact = (s: string) => s.replace(SECRET_RE, "[redacted]");

export class RunLogger {
 private t0 = Date.now();
 constructor(private quiet = false) {}

 private emit(level: string, msg: string, extra?: Record<string, unknown>) {
  if (this.quiet && level === "debug") return;
  const line = {
   t: ((Date.now() - this.t0) / 1000).toFixed(1) + "s",
   level,
   msg: redact(msg),
   ...(extra ? JSON.parse(redact(JSON.stringify(extra))) : {}),
  };
  console.log(JSON.stringify(line));
 }

 debug(msg: string, extra?: Record<string, unknown>) { this.emit("debug", msg, extra); }
 info(msg: string, extra?: Record<string, unknown>) { this.emit("info", msg, extra); }
 warn(msg: string, extra?: Record<string, unknown>) { this.emit("warn", msg, extra); }
 error(msg: string, extra?: Record<string, unknown>) { this.emit("error", msg, extra); }
}
