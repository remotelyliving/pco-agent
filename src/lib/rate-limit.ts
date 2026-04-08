interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const BUCKET_TTL_MS = 120_000; // 2 minutes
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function checkRateLimit(
  key: string,
  limitPerMinute: number,
): { allowed: true; retryAfter?: undefined } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const refillRate = limitPerMinute / 60;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: limitPerMinute, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(limitPerMinute, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);
  return { allowed: false, retryAfter };
}

export function startPeriodicCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (now - b.lastRefill > BUCKET_TTL_MS) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

export function stopPeriodicCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export function _resetBuckets(): void {
  buckets.clear();
  stopPeriodicCleanup();
}
