import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, _resetBuckets } from '@/lib/rate-limit';

describe('rate limiter', () => {
  beforeEach(() => {
    _resetBuckets();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const result = checkRateLimit('user-1', 5);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it('blocks requests over the limit', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-1', 5);
    }
    const result = checkRateLimit('user-1', 5);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('isolates users from each other', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-1', 5);
    }
    const result = checkRateLimit('user-2', 5);
    expect(result.allowed).toBe(true);
  });

  it('refills tokens over time', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-1', 5);
    }
    expect(checkRateLimit('user-1', 5).allowed).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(checkRateLimit('user-1', 5).allowed).toBe(true);
  });

  it('calculates retryAfter in seconds', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-1', 5);
    }
    const result = checkRateLimit('user-1', 5);
    expect(result.allowed).toBe(false);
    expect(typeof result.retryAfter).toBe('number');
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it('resets buckets via _resetBuckets', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-1', 5);
    }
    _resetBuckets();
    expect(checkRateLimit('user-1', 5).allowed).toBe(true);
  });
});
