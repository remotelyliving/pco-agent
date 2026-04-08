interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

const BUCKET_TTL_MS = 120_000; // 2 minutes

export function checkRateLimit(
  userId: string,
  limitPerMinute: number,
): { allowed: true; retryAfter?: undefined } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const refillRate = limitPerMinute / 60;

  // Lazy cleanup: remove stale entries (older than 2 minutes)
  if (buckets.size > 0) {
    for (const [key, b] of buckets) {
      if (now - b.lastRefill > BUCKET_TTL_MS) {
        buckets.delete(key);
      }
    }
  }

  let bucket = buckets.get(userId);
  if (!bucket) {
    bucket = { tokens: limitPerMinute, lastRefill: now };
    buckets.set(userId, bucket);
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

export function _resetBuckets(): void {
  buckets.clear();
}
