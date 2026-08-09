type RateEntry = { count: number; resetAt: number };

declare global {
  var __medmindsRateLimits: Map<string, RateEntry> | undefined;
}

const limits = globalThis.__medmindsRateLimits ?? new Map<string, RateEntry>();
globalThis.__medmindsRateLimits = limits;

export function allowRequest(key: string, maximum = 20, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

