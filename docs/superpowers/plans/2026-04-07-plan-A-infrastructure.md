# Plan A: Infrastructure — Pino Logger + Middleware Rate Limiting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the console.log logger wrapper with pino and migrate rate limiting from per-route calls to centralized middleware via Next.js 16 proxy.ts.

**Architecture:** The logger rewrite preserves the existing `logger.info/warn/error/child` interface so all call sites remain unchanged. The middleware migration renames `middleware.ts` → `proxy.ts` to opt into Node.js runtime, then adds centralized auth enforcement and rate limiting with per-route limits keyed by `route:userId`. All per-route `checkRateLimit` calls are removed.

**Tech Stack:** pino, pino-pretty (dev), Next.js 16 proxy.ts (Node.js runtime middleware)

**Spec:** `docs/superpowers/specs/2026-04-07-audit-remediation-design.md` — Sections 2.1 and 2.2

---

### Task 1: Install pino dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install pino and pino-pretty**

```bash
npm install pino && npm install -D pino-pretty
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('pino')" && echo "pino OK"
```

Expected: `pino OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install pino and pino-pretty"
```

---

### Task 2: Rewrite logger with pino

**Files:**
- Modify: `src/lib/logger.ts`
- Test: `tests/lib/logger.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pino before importing logger
const mockChild = vi.hoisted(() => vi.fn());
const mockInfo = vi.hoisted(() => vi.fn());
const mockWarn = vi.hoisted(() => vi.fn());
const mockError = vi.hoisted(() => vi.fn());
const mockPino = vi.hoisted(() => vi.fn());

vi.mock('pino', () => ({
  default: mockPino,
}));

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockChild.mockReturnValue({ info: mockInfo, warn: mockWarn, error: mockError, child: mockChild });
    mockPino.mockReturnValue({ info: mockInfo, warn: mockWarn, error: mockError, child: mockChild });
  });

  it('creates a pino instance', async () => {
    await import('@/lib/logger');
    expect(mockPino).toHaveBeenCalledOnce();
  });

  it('exports info, warn, error, child methods', async () => {
    const { logger } = await import('@/lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('child returns a logger with same interface', async () => {
    const { logger } = await import('@/lib/logger');
    const child = logger.child({ requestId: '123' });
    expect(mockChild).toHaveBeenCalledWith({ requestId: '123' });
    expect(typeof child.info).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/logger.test.ts
```

Expected: FAIL — current logger doesn't import pino

- [ ] **Step 3: Write the pino-based logger**

Replace `src/lib/logger.ts` with:

```typescript
import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

export type Logger = pino.Logger;
export type LogContext = Record<string, unknown>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/logger.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npm test
```

Expected: All existing tests pass — `logger.info/warn/error/child` interface is preserved.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logger.ts tests/lib/logger.test.ts
git commit -m "feat: replace console.log logger with pino"
```

---

### Task 3: Fix health endpoint to use structured logger

**Files:**
- Modify: `src/app/api/health/route.ts`

- [ ] **Step 1: Replace console.error with logger**

Replace `src/app/api/health/route.ts` with:

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, '[health] Database check failed');
    return Response.json(
      { status: 'error', message: 'Database unavailable' },
      { status: 503 }
    );
  }
}
```

Note: Also replaced `$queryRawUnsafe` with `$queryRaw` tagged template (addresses MIN-1 from security audit).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "fix: health endpoint uses structured logger and safe query"
```

---

### Task 4: Rewrite rate limiter for middleware use

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Modify: `tests/lib/rate-limit.test.ts`

- [ ] **Step 1: Update the test file for new API**

The rate limiter keeps the same token bucket algorithm but changes:
1. Key is now `route:userId` (passed by caller)
2. Cleanup runs on a periodic `setInterval` instead of per-call O(n) scan
3. Exports `startPeriodicCleanup` and `stopPeriodicCleanup` for lifecycle management

Replace `tests/lib/rate-limit.test.ts`:

```typescript
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
    // Same user, different route — separate bucket
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
    // Advance past TTL + cleanup interval
    vi.advanceTimersByTime(180_000);
    // Stale entry evicted — should start fresh
    expect(checkRateLimit('api/chat:user-stale', 5).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/rate-limit.test.ts
```

Expected: FAIL — `startPeriodicCleanup` and `stopPeriodicCleanup` don't exist yet

- [ ] **Step 3: Rewrite rate-limit.ts**

Replace `src/lib/rate-limit.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts
git commit -m "refactor: rate limiter uses periodic cleanup, accepts composite key"
```

---

### Task 5: Migrate middleware.ts → proxy.ts with centralized rate limiting and auth

**Files:**
- Delete: `src/middleware.ts`
- Create: `src/proxy.ts`

- [ ] **Step 1: Create proxy.ts**

Create `src/proxy.ts`:

```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { checkRateLimit, startPeriodicCleanup } from '@/lib/rate-limit';

// Start periodic cleanup when middleware module is loaded
startPeriodicCleanup();

// Rate limit configuration: route pattern → requests per minute
const RATE_LIMITS: Record<string, number> = {
  '/api/chat': 20,
  '/api/settings/test': 5,
  '/api/settings': 10,
  '/api/rules': 60,
  '/api/rules/:id': 60,
  '/api/rules/toggle': 60,
  '/api/memory': 60,
  '/api/memory/:id': 60,
  '/api/conversations/:id': 60,
};
const DEFAULT_RATE_LIMIT = 60;

// Routes that skip auth and rate limiting
const PUBLIC_API_ROUTES = ['/api/auth', '/api/health'];

/**
 * Normalize a request path to a route pattern.
 * e.g., /api/rules/abc-123 → /api/rules/:id
 */
function normalizeRoute(pathname: string): string {
  // Match known patterns with dynamic segments
  if (/^\/api\/rules\/toggle$/.test(pathname)) return '/api/rules/toggle';
  if (/^\/api\/settings\/test$/.test(pathname)) return '/api/settings/test';
  if (/^\/api\/rules\/[^/]+$/.test(pathname)) return '/api/rules/:id';
  if (/^\/api\/memory\/[^/]+$/.test(pathname)) return '/api/memory/:id';
  if (/^\/api\/conversations\/[^/]+$/.test(pathname)) return '/api/conversations/:id';
  return pathname;
}

export default auth((req) => {
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const pathname = req.nextUrl.pathname;

  // Build CSP header
  const isDev = process.env.NODE_ENV === 'development';
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // --- Centralized auth + rate limiting for API routes ---
  if (pathname.startsWith('/api/')) {
    const isPublic = PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));

    if (!isPublic) {
      // Auth enforcement
      const userId = req.auth?.user?.agentUserId;
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Rate limiting
      const routePattern = normalizeRoute(pathname);
      const limit = RATE_LIMITS[routePattern] ?? DEFAULT_RATE_LIMIT;
      const key = `${routePattern}:${userId}`;
      const result = checkRateLimit(key, limit);

      if (!result.allowed) {
        return Response.json(
          { error: "You're sending requests too quickly. Please wait a moment and try again." },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
        );
      }
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
});

export const config = {
  matcher: [
    {
      source: '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
```

- [ ] **Step 2: Delete the old middleware.ts**

```bash
rm src/middleware.ts
```

- [ ] **Step 3: Verify the build succeeds**

```bash
npm run build
```

Expected: Build succeeds. Next.js 16 picks up `proxy.ts` as the middleware file with Node.js runtime.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git rm src/middleware.ts
git commit -m "feat: migrate to proxy.ts with centralized auth + rate limiting"
```

---

### Task 6: Remove per-route rate limiting calls

**Files:**
- Modify: `src/app/api/chat/route.ts` — remove lines 13, 42-49 (checkRateLimit import + call)
- Modify: `src/app/api/rules/route.ts` — remove lines 6, 40-46 (checkRateLimit import + call in POST)
- Modify: `src/app/api/rules/[id]/route.ts` — remove lines 6, 20-26, 75-81 (checkRateLimit import + calls in PATCH and DELETE)
- Modify: `src/app/api/memory/route.ts` — remove lines 6, 45-50 (checkRateLimit import + call in POST)

- [ ] **Step 1: Remove checkRateLimit from chat route**

In `src/app/api/chat/route.ts`, remove the import of `checkRateLimit` from `@/lib/rate-limit` and remove the rate limit check block (the `const rateLimit = checkRateLimit(...)` and the `if (!rateLimit.allowed)` block).

- [ ] **Step 2: Remove checkRateLimit from rules route**

In `src/app/api/rules/route.ts`, remove the import of `checkRateLimit` and the rate limit block in `POST`.

- [ ] **Step 3: Remove checkRateLimit from rules/[id] route**

In `src/app/api/rules/[id]/route.ts`, remove the import of `checkRateLimit` and the rate limit blocks in both `PATCH` and `DELETE`.

- [ ] **Step 4: Remove checkRateLimit from memory route**

In `src/app/api/memory/route.ts`, remove the import of `checkRateLimit` and the rate limit block in `POST`.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts src/app/api/rules/route.ts src/app/api/rules/\[id\]/route.ts src/app/api/memory/route.ts
git commit -m "refactor: remove per-route rate limiting (now centralized in proxy.ts)"
```

---

### Task 7: Add LOG_LEVEL to env validation

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add LOG_LEVEL as optional documented env var**

No validation needed (it's optional with a default). But add a getter for consistency:

In `src/lib/env.ts`, add after the existing functions:

```typescript
export function getLogLevel(): string {
  return process.env.LOG_LEVEL || 'info';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/env.ts
git commit -m "chore: add LOG_LEVEL env helper"
```
