/**
 * A sliding-window limit per person, held in memory.
 *
 * On a serverless host each running instance keeps its own count, so this is
 * a guard against runaway use rather than an exact quota. The hard ceiling
 * on spend is the monthly limit set in the model provider's console.
 */

export interface RateLimiter {
  /** Records one use and returns true, or returns false when the limit is reached. */
  take: (key: string, now?: number) => boolean;
}

export function rateLimiter(limit: number, windowMs: number): RateLimiter {
  const uses = new Map<string, number[]>();
  return {
    take(key, now = Date.now()) {
      const recent = (uses.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= limit) {
        uses.set(key, recent);
        return false;
      }
      recent.push(now);
      uses.set(key, recent);
      return true;
    },
  };
}
