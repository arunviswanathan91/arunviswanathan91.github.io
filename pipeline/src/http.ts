export interface HttpOptions {
 userAgent: string;
 minHostIntervalMs: number;
 timeoutMs: number;
 maxRetries: number;
}

export const DEFAULT_HTTP: HttpOptions = {
 userAgent: "arun-discovery/1.0 (+https://arunviswanathan91.github.io; personal job search)",
 minHostIntervalMs: 1500,
 timeoutMs: 15000,
 maxRetries: 3,
};

export interface FetchResult {
 ok: boolean;
 status: number;
 body: string;
 headers: Record<string, string>;
 notModified: boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * A polite HTTP client: one request at a time per host, robots.txt respected and
 * cached, retries that honour Retry-After, and a hard request budget so a run can
 * never wander off crawling the open web.
 */
export class Http {
 private lastHit = new Map<string, number>();
 private robots = new Map<string, string[]>();   // host -> disallowed path prefixes
 private used = 0;

 constructor(private opts: HttpOptions = DEFAULT_HTTP, private budget = Infinity) {}

 get requestsUsed() { return this.used; }
 get budgetRemaining() { return this.budget - this.used; }

 private async throttle(host: string) {
  const last = this.lastHit.get(host) ?? 0;
  const wait = this.opts.minHostIntervalMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  this.lastHit.set(host, Date.now());
 }

 private async loadRobots(origin: string, host: string) {
  if (this.robots.has(host)) return;
  this.robots.set(host, []);                      // optimistic, so a failure never blocks
  try {
   await this.throttle(host);
   const res = await fetch(origin + "/robots.txt", {
    headers: { "user-agent": this.opts.userAgent },
    signal: AbortSignal.timeout(this.opts.timeoutMs),
   });
   if (!res.ok) return;
   const text = await res.text();
   const disallow: string[] = [];
   let applies = false;
   for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (/^user-agent:/i.test(t)) {
     const agent = t.split(":")[1]?.trim() ?? "";
     applies = agent === "*" || this.opts.userAgent.toLowerCase().includes(agent.toLowerCase());
    } else if (applies && /^disallow:/i.test(t)) {
     const p = t.slice(t.indexOf(":") + 1).trim();
     if (p) disallow.push(p);
    }
   }
   this.robots.set(host, disallow);
  } catch { /* a missing robots.txt means no restrictions */ }
 }

 async allowed(url: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  await this.loadRobots(u.origin, u.hostname);
  const rules = this.robots.get(u.hostname) ?? [];
  return !rules.some(prefix => u.pathname.startsWith(prefix));
 }

 async get(url: string, extraHeaders: Record<string, string> = {}): Promise<FetchResult> {
  if (this.used >= this.budget) throw new Error("http budget exhausted");
  const u = new URL(url);
  if (!(await this.allowed(url))) {
   return { ok: false, status: 999, body: "", headers: {}, notModified: false };
  }

  let attempt = 0;
  for (;;) {
   await this.throttle(u.hostname);
   this.used++;
   try {
    const res = await fetch(url, {
     headers: { "user-agent": this.opts.userAgent, accept: "*/*", ...extraHeaders },
     redirect: "follow",
     signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    if (res.status === 304) return { ok: true, status: 304, body: "", headers, notModified: true };
    if ((res.status === 429 || res.status >= 500) && attempt < this.opts.maxRetries) {
     const retryAfter = Number(res.headers.get("retry-after"));
     await sleep(isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
     attempt++;
     continue;
    }
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : "", headers, notModified: false };
   } catch (e) {
    if (attempt >= this.opts.maxRetries) throw e;
    await sleep(1000 * 2 ** attempt);
    attempt++;
   }
  }
 }

 async getJson<T = unknown>(url: string, extraHeaders: Record<string, string> = {}): Promise<T | null> {
  const res = await this.get(url, { accept: "application/json", ...extraHeaders });
  if (!res.ok || !res.body) return null;
  try { return JSON.parse(res.body) as T; } catch { return null; }
 }

 /** Same throttling, budget and retry behaviour as get(), for POST-only APIs. */
 async postJson<T = unknown>(url: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T | null> {
  if (this.used >= this.budget) throw new Error("http budget exhausted");
  const u = new URL(url);
  let attempt = 0;
  for (;;) {
   await this.throttle(u.hostname);
   this.used++;
   try {
    const res = await fetch(url, {
     method: "POST",
     headers: { "user-agent": this.opts.userAgent, "content-type": "application/json", ...extraHeaders },
     body: JSON.stringify(body),
     signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < this.opts.maxRetries) {
     const retryAfter = Number(res.headers.get("retry-after"));
     await new Promise(r => setTimeout(r, isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
     attempt++;
     continue;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
   } catch (e) {
    if (attempt >= this.opts.maxRetries) throw e;
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    attempt++;
   }
  }
 }
}
