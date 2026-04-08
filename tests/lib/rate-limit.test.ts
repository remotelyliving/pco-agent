import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, _resetBuckets, startPeriodicCleanup, stopPeriodicCleanup } from '@/lib/rate-limit';

describe('rate limiter', () => {
  beforeEach(() => {
    _resetBuckets();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopPeriodicCleanup();
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const result = checkRateLimit('api/chat:user-1', 5);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it('blocks requests over the limit', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('api/chat:user-1', 5);
    }
    const result = checkRateLimit('api/chat:user-1', 5);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('isolates different route:user combos', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('api/chat:user-1', 5);
    }
    const result = checkRateLimit('api/rules:user-1', 5);
    expect(result.allowed).toBe(true);
  });

  it('isolates different users on same route', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('api/chat:user-1', 5);
    }
    const result = checkRateLimit('api/chat:user-2', 5);
    expect(result.allowed).toBe(true);
  });

  it('refills tokens over time', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('api/chat:user-1', 5);
    }
    expect(checkRateLimit('api/chat:user-1', 5).allowed).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(checkRateLimit('api/chat:user-1', 5).allowed).toBe(true);
  });

  it('calculates retryAfter in seconds', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('api/chat:user-1', 5);
    }
    const result = checkRateLimit('api/chat:user-1', 5);
    expect(result.allowed).toBe(false);
    expect(typeof result.retryAfter).toBe('number');
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it('periodic cleanup evicts stale entries', () => {
    startPeriodicCleanup();
    checkRateLimit('api/chat:user-stale', 5);
    vi.advanceTimersByTime(180_000);
    expect(checkRateLimit('api/chat:user-stale', 5).allowed).toBe(true);
  });
});
