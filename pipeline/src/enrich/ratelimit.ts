/** Keeps each free-tier provider under its requests-per-minute ceiling by
 * waiting out the remainder of its minimum interval before the next call,
 * instead of finding the limit via a 429 and burning a retry. Clock and
 * sleep are injectable so this is testable without real waiting. */
export class ProviderRateLimiter {
 private readonly lastCallAt = new Map<string, number>();
 constructor(
  private readonly minIntervalMs: Partial<Record<string, number>>,
  private readonly now: () => number = Date.now,
  private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
 ) {}

 async wait(provider: string): Promise<void> {
  const interval = this.minIntervalMs[provider] ?? 0;
  if (interval <= 0) return;
  const last = this.lastCallAt.get(provider);
  const nowMs = this.now();
  if (last !== undefined) {
   const elapsed = nowMs - last;
   if (elapsed < interval) await this.sleep(interval - elapsed);
  }
  this.lastCallAt.set(provider, this.now());
 }
}
