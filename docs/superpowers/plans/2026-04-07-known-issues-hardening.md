# Known Issues Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 15 known issues from `docs/KNOWN_ISSUES.md`, add deployment documentation, and harden the application for production use.

**Architecture:** Each fix is isolated to 1-3 files. Schema changes are batched into migrations applied in order. The `editor` role is a new concept threaded through auth + rules API. Rate limiting is a standalone module consumed by the chat route.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, NextAuth 5, Vercel AI SDK v6, Vitest

---

### Task 1: Rate Limiting — In-Memory Token Bucket

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `tests/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/rate-limit.test.ts
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

    // Advance 60 seconds — full refill for a 5/min limit
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/rate-limit.test.ts`
Expected: FAIL — module `@/lib/rate-limit` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rate-limit.ts

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Token bucket rate limiter. Checks whether a request from the given
 * userId is allowed under the specified limit (requests per minute).
 *
 * Returns { allowed: true } if the request can proceed, or
 * { allowed: false, retryAfter: seconds } if the user is rate-limited.
 */
export function checkRateLimit(
  userId: string,
  limitPerMinute: number,
): { allowed: true; retryAfter?: undefined } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  const refillRate = limitPerMinute / 60; // tokens per second

  let bucket = buckets.get(userId);
  if (!bucket) {
    bucket = { tokens: limitPerMinute, lastRefill: now };
    buckets.set(userId, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000; // seconds
  bucket.tokens = Math.min(limitPerMinute, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  // Calculate how long until 1 token is available
  const retryAfter = Math.ceil((1 - bucket.tokens) / refillRate);
  return { allowed: false, retryAfter };
}

// Exported for testing only
export function _resetBuckets(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/rate-limit.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts
git commit -m "feat: add in-memory token bucket rate limiter"
```

---

### Task 2: Integrate Rate Limiting into Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add rate limit import and check after auth**

In `src/app/api/chat/route.ts`, add the import at the top:

```typescript
import { checkRateLimit } from '@/lib/rate-limit';
```

Then add the rate limit check between the auth check and body parsing. Replace lines 39-41:

```typescript
// OLD:
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse request
```

```typescript
// NEW:
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 1b. Rate limit (20 requests/minute per user)
  const rateLimit = checkRateLimit(session.user.agentUserId, 20);
  if (!rateLimit.allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(rateLimit.retryAfter) },
    });
  }

  // 2. Parse request
```

- [ ] **Step 2: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: apply rate limiting to chat endpoint (20 req/min per user)"
```

---

### Task 3: Auth Hardening — Token Refresh Timeout + SERIALIZABLE + Stale JWT Role Re-Sync

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `tests/lib/auth.test.ts`

- [ ] **Step 1: Read the existing auth test file**

Run: `cat tests/lib/auth.test.ts` to understand the test setup and mock patterns before making changes.

- [ ] **Step 2: Add the token refresh timeout**

In `src/lib/auth.ts`, line 166, add `signal: AbortSignal.timeout(10000)` to the refresh fetch. Replace:

```typescript
            const response = await fetch('https://api.planningcenteronline.com/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: token.pcoRefreshToken as string,
                client_id: process.env.PCO_CLIENT_ID!,
                client_secret: process.env.PCO_CLIENT_SECRET!,
              }),
            });
```

With:

```typescript
            const response = await fetch('https://api.planningcenteronline.com/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: token.pcoRefreshToken as string,
                client_id: process.env.PCO_CLIENT_ID!,
                client_secret: process.env.PCO_CLIENT_SECRET!,
              }),
              signal: AbortSignal.timeout(10000),
            });
```

- [ ] **Step 3: Add SERIALIZABLE isolation level**

In `src/lib/auth.ts`, add Prisma import at the top:

```typescript
import { Prisma } from '@prisma/client';
```

Then update the `$transaction` call (currently line 107). Replace:

```typescript
        const agentUser = await prisma.$transaction(async (tx) => {
```

With:

```typescript
        const agentUser = await prisma.$transaction(async (tx) => {
```

And after the closing `});` of the transaction (line 132), add the options argument. The full replacement of lines 107-132 is:

```typescript
        const agentUser = await prisma.$transaction(async (tx) => {
          const existingUsers = await tx.user.count({
            where: { orgId: org.id },
          });
          const role = existingUsers === 0 ? 'admin' : 'member';

          return tx.user.upsert({
            where: {
              orgId_pcoPersonId: {
                orgId: org.id,
                pcoPersonId: BigInt(String(profile.pcoPersonId)),
              },
            },
            update: {
              name: profile.name as string,
              email: profile.email as string | null,
            },
            create: {
              orgId: org.id,
              pcoPersonId: BigInt(String(profile.pcoPersonId)),
              name: profile.name as string,
              email: profile.email as string | null,
              role,
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

- [ ] **Step 4: Add JWT type for roleCheckedAt**

In `src/lib/auth.ts`, update the JWT interface declaration (line 20-29). Replace:

```typescript
declare module '@auth/core/jwt' {
  interface JWT {
    agentUserId?: string;
    orgId?: string;
    role?: string;
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
    pcoAccessTokenExpires?: number;
  }
}
```

With:

```typescript
declare module '@auth/core/jwt' {
  interface JWT {
    agentUserId?: string;
    orgId?: string;
    role?: string;
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
    pcoAccessTokenExpires?: number;
    roleCheckedAt?: number;
  }
}
```

- [ ] **Step 5: Add stale JWT role re-sync in jwt callback**

In `src/lib/auth.ts`, in the `jwt` callback, after the token refresh block (after line 192 `}`) and before `return token;` (line 195), add:

```typescript
      // Re-sync role from DB every 15 minutes
      if (!user && token.agentUserId) {
        const now = Math.floor(Date.now() / 1000);
        const lastCheck = (token.roleCheckedAt as number) ?? 0;
        if (now - lastCheck > 900) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.agentUserId as string },
              select: { role: true },
            });
            if (dbUser) {
              token.role = dbUser.role;
            }
            token.roleCheckedAt = now;
          } catch (error) {
            logger.error('JWT role re-sync failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
```

- [ ] **Step 6: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Run existing auth tests**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: All existing tests PASS (the new behavior doesn't break existing tests since mocks handle the DB calls)

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix: add token refresh timeout (10s), SERIALIZABLE isolation, JWT role re-sync (15min)"
```

---

### Task 4: Content Security Policy — Nonce-Based Middleware

**Files:**
- Modify: `src/middleware.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Update middleware with CSP nonce generation**

Replace the entire contents of `src/middleware.ts` with:

```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

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

- [ ] **Step 2: Remove static security headers from next.config.ts**

Replace the entire contents of `next.config.ts` with:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 3: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts next.config.ts
git commit -m "feat: add nonce-based CSP header via middleware, remove static security headers from next.config"
```

---

### Task 5: PCO Role-Based Admin Mapping + Editor Role

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/api/rules/route.ts`
- Modify: `src/app/api/rules/[id]/route.ts`

- [ ] **Step 1: Add PCO permission fields to userinfo return**

In `src/lib/auth.ts`, update the userinfo `request` function return (lines 60-68). Replace:

```typescript
          return {
            id: person.id,
            name: `${person.attributes.first_name} ${person.attributes.last_name}`,
            email:
              person.attributes.email_addresses?.[0]?.address ?? null,
            pcoPersonId: person.id,
            pcoOrgId: org?.id,
            pcoOrgName: org?.attributes?.name,
          };
```

With:

```typescript
          return {
            id: person.id,
            name: `${person.attributes.first_name} ${person.attributes.last_name}`,
            email:
              person.attributes.email_addresses?.[0]?.address ?? null,
            pcoPersonId: person.id,
            pcoOrgId: org?.id,
            pcoOrgName: org?.attributes?.name,
            pcoSiteAdmin: person.attributes.site_administrator === true,
            pcoPeoplePermissions: person.attributes.people_permissions ?? null,
          };
```

- [ ] **Step 2: Add role mapping helper function**

In `src/lib/auth.ts`, add this function before the `authConfig` definition (before line 31):

```typescript
/**
 * Map PCO permissions to pco-agent role.
 * site_administrator → admin
 * people_permissions "Manager" → admin
 * people_permissions "Editor" → editor
 * everything else → member
 */
function mapPcoRole(profile: Record<string, unknown>): string {
  if (profile.pcoSiteAdmin === true) return 'admin';
  const perms = profile.pcoPeoplePermissions as string | null;
  if (perms === 'Manager') return 'admin';
  if (perms === 'Editor') return 'editor';
  return 'member';
}

/** Returns true if the role can manage rules (create, edit, delete org rules). */
export function canManageRules(role: string): boolean {
  return role === 'admin' || role === 'editor';
}
```

- [ ] **Step 3: Replace first-user heuristic with PCO role mapping**

In `src/lib/auth.ts`, replace the `$transaction` block (lines 106-132) with:

```typescript
        // Derive role from PCO permissions (synced on every login)
        const role = mapPcoRole(profile);

        const agentUser = await prisma.$transaction(async (tx) => {
          return tx.user.upsert({
            where: {
              orgId_pcoPersonId: {
                orgId: org.id,
                pcoPersonId: BigInt(String(profile.pcoPersonId)),
              },
            },
            update: {
              name: profile.name as string,
              email: profile.email as string | null,
              role,
            },
            create: {
              orgId: org.id,
              pcoPersonId: BigInt(String(profile.pcoPersonId)),
              name: profile.name as string,
              email: profile.email as string | null,
              role,
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

Note: The comment about "First user in org = admin" should also be removed (line 106).

- [ ] **Step 4: Update rules POST route to allow editor role**

In `src/app/api/rules/route.ts`, add the import at the top:

```typescript
import { canManageRules } from '@/lib/auth';
```

Replace line 51:

```typescript
  const effectiveRuleType = session.user.role === 'admin' ? (ruleType || 'org') : 'user';
```

With:

```typescript
  const effectiveRuleType = canManageRules(session.user.role) ? (ruleType || 'org') : 'user';
```

- [ ] **Step 5: Update rules PATCH/DELETE to allow editor role**

In `src/app/api/rules/[id]/route.ts`, add the import at the top:

```typescript
import { canManageRules } from '@/lib/auth';
```

In the `PATCH` function, replace line 31:

```typescript
    const isAdmin = session.user.role === 'admin';
```

With:

```typescript
    const isAdmin = canManageRules(session.user.role);
```

In the `DELETE` function, replace line 77:

```typescript
    const isAdmin = session.user.role === 'admin';
```

With:

```typescript
    const isAdmin = canManageRules(session.user.role);
```

- [ ] **Step 6: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Run existing tests**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: Existing tests PASS (mocks handle the new fields)

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts src/app/api/rules/route.ts src/app/api/rules/\[id\]/route.ts
git commit -m "feat: PCO role-based admin mapping (site_administrator + people_permissions) with editor role"
```

---

### Task 6: Schema Changes — Enums + Token Count

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Prisma enums and update model fields**

Replace the entire contents of `prisma/schema.prisma` with:

```prisma
datasource db {
  provider = "postgresql"
  schemas  = ["agent"]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

enum UserRole {
  admin
  editor
  member

  @@schema("agent")
}

enum RuleType {
  system
  org
  user

  @@schema("agent")
}

enum RuleVisibility {
  private
  org

  @@schema("agent")
}

enum MemorySource {
  auto
  manual

  @@schema("agent")
}

enum MessageRole {
  user
  assistant
  system
  tool

  @@schema("agent")
}

model Organization {
  id        String   @id @default(uuid())
  pcoOrgId  String   @unique @map("pco_org_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  users   User[]
  rules   Rule[]
  memory  Memory[]

  @@map("organizations")
  @@schema("agent")
}

model User {
  id             String   @id @default(uuid())
  orgId          String   @map("org_id")
  pcoPersonId    BigInt   @map("pco_person_id")
  name           String?
  email          String?
  role           UserRole @default(member)
  apiProvider    String?  @map("api_provider")
  apiKeyEnc      String?  @map("api_key_enc")
  preferredModel String?  @map("preferred_model")
  createdAt      DateTime @default(now()) @map("created_at")

  org            Organization @relation(fields: [orgId], references: [id])
  conversations  Conversation[]
  rules          Rule[]       @relation("CreatedBy")
  ruleSettings   UserRuleSetting[]
  memories       Memory[]

  @@unique([orgId, pcoPersonId])
  @@map("users")
  @@schema("agent")
}

model Conversation {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  title     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages Message[]

  @@index([userId, updatedAt])
  @@map("conversations")
  @@schema("agent")
}

model Message {
  id             String      @id @default(uuid())
  conversationId String      @map("conversation_id")
  role           MessageRole
  content        String
  toolCalls      Json?       @map("tool_calls")
  tokenCount     Int?        @map("token_count")
  createdAt      DateTime    @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("messages")
  @@schema("agent")
}

model Rule {
  id          String         @id @default(uuid())
  orgId       String?        @map("org_id")
  createdById String?        @map("created_by")
  content     String
  category    String?
  ruleType    RuleType       @map("rule_type")
  visibility  RuleVisibility @default(private)
  sortOrder   Int            @default(0) @map("sort_order")
  createdAt   DateTime       @default(now()) @map("created_at")

  org       Organization?     @relation(fields: [orgId], references: [id])
  createdBy User?             @relation("CreatedBy", fields: [createdById], references: [id])
  settings  UserRuleSetting[]

  @@index([orgId, ruleType])
  @@index([createdById, orgId])
  @@map("rules")
  @@schema("agent")
}

model UserRuleSetting {
  id      String  @id @default(uuid())
  userId  String  @map("user_id")
  ruleId  String  @map("rule_id")
  enabled Boolean

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  rule Rule @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@unique([userId, ruleId])
  @@map("user_rule_settings")
  @@schema("agent")
}

model Memory {
  id        String       @id @default(uuid())
  orgId     String       @map("org_id")
  userId    String?      @map("user_id")
  key       String
  value     String
  source    MemorySource @default(auto)
  createdAt DateTime     @default(now()) @map("created_at")
  updatedAt DateTime     @updatedAt @map("updated_at")

  org  Organization @relation(fields: [orgId], references: [id])
  user User?        @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([orgId, userId, key])
  @@map("memory")
  @@schema("agent")
}
```

- [ ] **Step 2: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success message

- [ ] **Step 3: Fix TypeScript errors from enum changes**

The enum changes will cause type errors in files that pass string literals like `'auto'`, `'manual'`, `'user'`, `'assistant'`, `'system'`, `'org'`, `'admin'`, `'member'`, `'editor'`. These are caught at compile time and need no code changes — Prisma enums accept their literal values. Verify:

Run: `npx tsc --noEmit`

If there are errors in files passing enum values as strings, update those files to pass the enum values directly. Common patterns that should still work since Prisma enums accept string literals matching their values.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS. If any tests pass string values that don't match enum names, update the test mocks.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: convert string fields to Prisma enums (UserRole, RuleType, RuleVisibility, MemorySource, MessageRole) + add tokenCount to Message"
```

---

### Task 7: Message Content Cap + Token Usage Tracking

**Files:**
- Modify: `src/lib/chat/persist.ts`
- Modify: `tests/lib/chat/persist.test.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Write failing tests for message content cap and tokenCount**

Add these tests to `tests/lib/chat/persist.test.ts` inside the existing `describe('chat persistence', ...)`:

```typescript
  it('truncates message content at 64KB', async () => {
    const longContent = 'x'.repeat(70000);
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-t', conversationId: 'conv-1', role: 'user', content: 'x'.repeat(65536) });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

    await saveMessage({ conversationId: 'conv-1', role: 'user', content: longContent });
    const createCall = mockPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.content.length).toBe(65536);
  });

  it('does not truncate content under 64KB', async () => {
    const shortContent = 'hello world';
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-s', conversationId: 'conv-1', role: 'user', content: shortContent });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

    await saveMessage({ conversationId: 'conv-1', role: 'user', content: shortContent });
    const createCall = mockPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.content).toBe(shortContent);
  });

  it('saves tokenCount when provided', async () => {
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-tc', tokenCount: 150 });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

    await saveMessage({ conversationId: 'conv-1', role: 'assistant', content: 'response', tokenCount: 150 });
    const createCall = mockPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.tokenCount).toBe(150);
  });

  it('saves without tokenCount when not provided', async () => {
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-nt' });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

    await saveMessage({ conversationId: 'conv-1', role: 'user', content: 'hello' });
    const createCall = mockPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.tokenCount).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/chat/persist.test.ts`
Expected: FAIL — new tests fail because `saveMessage` doesn't truncate or accept `tokenCount` yet

- [ ] **Step 3: Update saveMessage with truncation and tokenCount**

Replace `saveMessage` in `src/lib/chat/persist.ts` with:

```typescript
import { logger } from '@/lib/logger';

const MAX_CONTENT_LENGTH = 65536; // 64KB

export async function saveMessage(data: {
  conversationId: string;
  role: string;
  content: string;
  toolCalls?: unknown;
  tokenCount?: number | null;
}) {
  let content = data.content;
  if (content.length > MAX_CONTENT_LENGTH) {
    logger.warn('[persist] Message content truncated', {
      conversationId: data.conversationId,
      originalLength: content.length,
      truncatedTo: MAX_CONTENT_LENGTH,
    });
    content = content.slice(0, MAX_CONTENT_LENGTH);
  }

  const message = await prisma.message.create({
    data: {
      conversationId: data.conversationId,
      role: data.role,
      content,
      toolCalls: data.toolCalls ?? undefined,
      tokenCount: data.tokenCount ?? undefined,
    },
  });

  // Touch conversation to update updatedAt for sidebar sorting
  await prisma.conversation.update({
    where: { id: data.conversationId },
    data: { updatedAt: new Date() },
  });

  return message;
}
```

Also add the logger mock to the test file. At the top of `tests/lib/chat/persist.test.ts`, after the `mockPrisma` definition:

```typescript
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/chat/persist.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Update chat route to pass tokenCount from onFinish**

In `src/app/api/chat/route.ts`, update the `onFinish` callback. Replace line 153:

```typescript
      onFinish: async ({ text, toolCalls }) => {
```

With:

```typescript
      onFinish: async ({ text, toolCalls, usage }) => {
```

And update the `saveMessage` call inside it (lines 155-159). Replace:

```typescript
        await saveMessage({
          conversationId,
          role: 'assistant',
          content: text || '',
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        });
```

With:

```typescript
        await saveMessage({
          conversationId,
          role: 'assistant',
          content: text || '',
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
          tokenCount: usage?.totalTokens ?? null,
        });
```

- [ ] **Step 6: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/persist.ts tests/lib/chat/persist.test.ts src/app/api/chat/route.ts
git commit -m "feat: message content cap (64KB) + token usage tracking in onFinish"
```

---

### Task 8: Conversation / Message Pagination

**Files:**
- Modify: `src/lib/chat/persist.ts`
- Modify: `tests/lib/chat/persist.test.ts`

- [ ] **Step 1: Write failing tests for pagination**

Add these tests to `tests/lib/chat/persist.test.ts`:

```typescript
  it('getConversation loads last 100 messages in chronological order', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`, role: 'user', content: `msg ${i}`,
    }));
    // Prisma returns desc order (newest first), function reverses to asc
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1', messages: [...messages].reverse(),
    });
    const result = await getConversation('conv-1', 'user-1');
    expect(result).toBeDefined();
    expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
  });

  it('getMessages supports take and cursor params', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'msg-5', role: 'user', content: 'hi' },
    ]);
    await getMessages('conv-1', { take: 20, cursor: 'msg-4' });
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      skip: 1,
      cursor: { id: 'msg-4' },
    });
  });

  it('getMessages works without pagination options', async () => {
    mockPrisma.message.findMany.mockResolvedValue([]);
    await getMessages('conv-1');
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('listConversations returns hasMore indicator', async () => {
    const convos = Array.from({ length: 51 }, (_, i) => ({ id: `conv-${i}`, title: `Conv ${i}` }));
    mockPrisma.conversation.findMany.mockResolvedValue(convos);
    const result = await listConversations('user-1');
    expect(result.conversations).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it('listConversations returns hasMore=false when under limit', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1', title: 'Test' }]);
    const result = await listConversations('user-1');
    expect(result.conversations).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/chat/persist.test.ts`
Expected: FAIL — tests expect new signatures

- [ ] **Step 3: Update persist.ts with pagination support**

Replace `getConversation`, `listConversations`, and `getMessages` in `src/lib/chat/persist.ts`:

```typescript
export async function getConversation(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 100 } },
  });
  if (conv) {
    // Reverse to chronological order for the consumer
    conv.messages.reverse();
  }
  return conv;
}

export async function listConversations(userId: string) {
  const results = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 51,
  });
  const hasMore = results.length > 50;
  return {
    conversations: hasMore ? results.slice(0, 50) : results,
    hasMore,
  };
}
```

```typescript
export async function getMessages(
  conversationId: string,
  options?: { take?: number; cursor?: string },
) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    ...(options?.take ? { take: options.take } : {}),
    ...(options?.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });
}
```

- [ ] **Step 4: Fix any callers that depend on old listConversations return type**

Search for usages of `listConversations` to update consumers. The sidebar likely destructures the result as an array. Check:

Run: `grep -rn 'listConversations' src/`

Update any callers to use `result.conversations` instead of the raw array. For example, in sidebar or any page that calls `listConversations`, change:

```typescript
// OLD:
const conversations = await listConversations(userId);
// NEW:
const { conversations } = await listConversations(userId);
```

- [ ] **Step 5: Update existing tests that relied on old signatures**

The existing test `'listConversations returns user conversations'` needs updating. Replace:

```typescript
  it('listConversations returns user conversations', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1', title: 'Test' }]);
    const result = await listConversations('user-1');
    expect(result).toHaveLength(1);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  });
```

With:

```typescript
  it('listConversations returns user conversations', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1', title: 'Test' }]);
    const result = await listConversations('user-1');
    expect(result.conversations).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
      take: 51,
    });
  });
```

Also update the existing `getConversation` test:

```typescript
  it('getConversation returns conversation with messages', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1', messages: [{ id: 'msg-1', role: 'user', content: 'hello' }],
    });
    const result = await getConversation('conv-1', 'user-1');
    expect(result).toBeDefined();
    expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
  });
```

And the existing `getMessages` test:

```typescript
  it('getMessages returns ordered messages', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'hi' },
      { id: 'msg-2', role: 'assistant', content: 'hello' },
    ]);
    const result = await getMessages('conv-1');
    expect(result).toHaveLength(2);
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
    });
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/lib/chat/persist.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/persist.ts tests/lib/chat/persist.test.ts
git commit -m "feat: add message pagination (last 100 on load) + cursor support + hasMore indicator"
```

---

### Task 9: Memory Cap Enforcement

**Files:**
- Modify: `src/lib/memory/queries.ts`
- Modify: `src/lib/memory/extract.ts`
- Modify: `tests/lib/memory/queries.test.ts`

- [ ] **Step 1: Write failing tests for enforceMemoryCap**

Add to `tests/lib/memory/queries.test.ts`, add `count` and `deleteMany` to the mock:

Update the `mockPrisma` at the top to include:

```typescript
const mockPrisma = vi.hoisted(() => ({
  memory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
```

Add the new test section:

```typescript
  describe('enforceMemoryCap', () => {
    it('does nothing when under the cap', async () => {
      mockPrisma.memory.count.mockResolvedValue(150);
      await enforceMemoryCap('org-1', 200);
      expect(mockPrisma.memory.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.memory.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes oldest auto-sourced memories when over the cap', async () => {
      mockPrisma.memory.count.mockResolvedValue(210);
      mockPrisma.memory.findMany.mockResolvedValue([
        { id: 'old-1' },
        { id: 'old-2' },
        { id: 'old-3' },
        { id: 'old-4' },
        { id: 'old-5' },
        { id: 'old-6' },
        { id: 'old-7' },
        { id: 'old-8' },
        { id: 'old-9' },
        { id: 'old-10' },
      ]);
      mockPrisma.memory.deleteMany.mockResolvedValue({ count: 10 });

      await enforceMemoryCap('org-1', 200);

      expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', source: 'auto' },
        orderBy: { updatedAt: 'asc' },
        take: 10,
        select: { id: true },
      });
      expect(mockPrisma.memory.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2', 'old-3', 'old-4', 'old-5', 'old-6', 'old-7', 'old-8', 'old-9', 'old-10'] } },
      });
    });

    it('does nothing if no auto memories to delete', async () => {
      mockPrisma.memory.count.mockResolvedValue(205);
      mockPrisma.memory.findMany.mockResolvedValue([]);

      await enforceMemoryCap('org-1', 200);

      expect(mockPrisma.memory.deleteMany).not.toHaveBeenCalled();
    });

    it('uses default cap of 200', async () => {
      mockPrisma.memory.count.mockResolvedValue(150);
      await enforceMemoryCap('org-1');
      expect(mockPrisma.memory.count).toHaveBeenCalledWith({ where: { orgId: 'org-1' } });
    });
  });
```

Also add the import at the top:

```typescript
import {
  getOrgMemories,
  getUserMemories,
  getAllMemoriesForUser,
  upsertMemory,
  updateMemory,
  deleteMemory,
  enforceMemoryCap,
} from '@/lib/memory/queries';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/memory/queries.test.ts`
Expected: FAIL — `enforceMemoryCap` not found

- [ ] **Step 3: Add enforceMemoryCap to queries.ts**

Add to `src/lib/memory/queries.ts`:

```typescript
export async function enforceMemoryCap(orgId: string, maxCount: number = 200): Promise<void> {
  const count = await prisma.memory.count({ where: { orgId } });
  if (count <= maxCount) return;

  const excess = count - maxCount;
  const oldestAuto = await prisma.memory.findMany({
    where: { orgId, source: 'auto' },
    orderBy: { updatedAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (oldestAuto.length > 0) {
    await prisma.memory.deleteMany({
      where: { id: { in: oldestAuto.map((m) => m.id) } },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/memory/queries.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Integrate into extractAndSaveMemories**

In `src/lib/memory/extract.ts`, add the import:

```typescript
import { upsertMemory, enforceMemoryCap } from '@/lib/memory/queries';
```

And after the `for` loop that upserts facts (after line 55), add:

```typescript
    // Enforce per-org memory cap (evict oldest auto-extracted if over 200)
    await enforceMemoryCap(orgId);
```

So the relevant section becomes:

```typescript
    for (const fact of object.facts) {
      await upsertMemory(orgId, fact.key, fact.value, 'auto', undefined);
    }

    // Enforce per-org memory cap (evict oldest auto-extracted if over 200)
    await enforceMemoryCap(orgId);
  } catch {
    // best-effort: never throw
  }
```

- [ ] **Step 6: Run all memory tests**

Run: `npx vitest run tests/lib/memory/`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/memory/queries.ts src/lib/memory/extract.ts tests/lib/memory/queries.test.ts
git commit -m "feat: enforce 200-memory cap per org (evict oldest auto-extracted on overflow)"
```

---

### Task 10: MCP Per-Request Timeout

**Files:**
- Modify: `src/lib/mcp-pool.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add connection timeout to mcp-pool.ts**

In `src/lib/mcp-pool.ts`, add a timeout constant at the top:

```typescript
const CONNECTION_TIMEOUT_MS = 15_000; // 15 seconds
```

Then wrap the `createMCPClient` call with a timeout. Replace lines 76-84:

```typescript
  const client = await createMCPClient({
    transport: {
      type: 'sse',
      url: mcpUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
```

With:

```typescript
  const client = await Promise.race([
    createMCPClient({
      transport: {
        type: 'sse',
        url: mcpUrl,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MCP connection timeout')), CONNECTION_TIMEOUT_MS),
    ),
  ]);
```

- [ ] **Step 2: Add total MCP setup timeout in chat route**

In `src/app/api/chat/route.ts`, replace the MCP connection block (lines 112-127):

```typescript
    if (pcoAccessToken) {
      try {
        mcpClient = await getMCPClient(
          process.env.PCO_MCP_URL || 'https://pco-mcp.com/mcp',
          pcoAccessToken,
        );
        tools = await mcpClient.tools();
      } catch (error) {
        log.error('MCP connection failed', {
          userId: session.user.agentUserId,
          orgId: session.user.orgId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without MCP tools -- chat still works, just no PCO data access
      }
    }
```

With:

```typescript
    if (pcoAccessToken) {
      try {
        const mcpSetup = async () => {
          const client = await getMCPClient(
            process.env.PCO_MCP_URL || 'https://pco-mcp.com/mcp',
            pcoAccessToken,
          );
          const mcpTools = await client.tools();
          return { client, mcpTools };
        };

        const result = await Promise.race([
          mcpSetup(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('MCP setup timeout (30s)')), 30_000),
          ),
        ]);
        mcpClient = result.client;
        tools = result.mcpTools;
      } catch (error) {
        log.error('MCP connection failed', {
          userId: session.user.agentUserId,
          orgId: session.user.orgId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without MCP tools -- chat still works, just no PCO data access
      }
    }
```

- [ ] **Step 3: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run MCP pool tests**

Run: `npx vitest run tests/lib/mcp-pool.test.ts`
Expected: All tests PASS (the mock resolves immediately, so timeouts don't trigger)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-pool.ts src/app/api/chat/route.ts
git commit -m "fix: add MCP connection timeout (15s) + total setup timeout (30s)"
```

---

### Task 11: Prisma Migrations Init + Makefile + Docker Entrypoint

**Files:**
- Modify: `Makefile`
- Create: `entrypoint.sh`
- Modify: `Dockerfile`

Note: The actual `prisma migrate dev --name init` must be run against a live database. This task creates the infrastructure for migrations without requiring a running DB.

- [ ] **Step 1: Add db-deploy target to Makefile**

In `Makefile`, update the `.PHONY` line and add the target. Replace line 1:

```makefile
.PHONY: install dev build test lint db-push db-migrate db-deploy seed docker-build docker-up docker-down clean
```

Add after the `db-reset` target (after line 51):

```makefile
db-deploy:
	npx prisma migrate deploy
```

- [ ] **Step 2: Create entrypoint.sh**

Create `entrypoint.sh` at the project root:

```bash
#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy
echo "[entrypoint] Migrations complete. Starting server..."

exec node server.js
```

- [ ] **Step 3: Make entrypoint.sh executable**

Run: `chmod +x entrypoint.sh`

- [ ] **Step 4: Update Dockerfile to use entrypoint**

Replace the entire `Dockerfile` with:

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY entrypoint.sh ./

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["./entrypoint.sh"]
```

- [ ] **Step 5: Commit**

```bash
git add Makefile entrypoint.sh Dockerfile
git commit -m "feat: add db-deploy Makefile target + Docker entrypoint with auto-migration"
```

---

### Task 12: Memory Partial Unique Index Migration

**Files:**
- Create: `prisma/migrations/00000000000001_add_memory_partial_unique_index/migration.sql`

Note: This creates a manually-written migration. When you eventually run `prisma migrate dev --name init` against a live database, that will create the baseline `0000_init` migration. This migration should be applied after the baseline.

- [ ] **Step 1: Create the migration directory and SQL file**

```bash
mkdir -p prisma/migrations/00000000000001_add_memory_partial_unique_index
```

Create `prisma/migrations/00000000000001_add_memory_partial_unique_index/migration.sql`:

```sql
-- Add partial unique index for org-scoped memories where user_id IS NULL.
-- PostgreSQL does not enforce uniqueness on NULLs in composite unique constraints,
-- so this index prevents duplicate org-level memories with the same key.
CREATE UNIQUE INDEX IF NOT EXISTS "memory_org_key_null_user"
  ON "agent"."memory" ("org_id", "key")
  WHERE "user_id" IS NULL;
```

- [ ] **Step 2: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: add partial unique index for org-scoped memories (user_id IS NULL)"
```

---

### Task 13: Deployment Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md with comprehensive deployment docs**

Replace the entire contents of `README.md` with:

```markdown
# pco-agent

AI-powered assistant for Planning Center Online. Chat with your church data using natural language.

## What It Does

pco-agent gives church staff a simple chat interface to interact with Planning Center Online — search for people, plan services, schedule volunteers, and manage song libraries — all through conversation.

- **Multi-provider AI**: Choose Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini). Bring your own API key.
- **Smart memory**: Remembers facts about your church across conversations.
- **Custom rules**: Define how the AI assistant behaves for your organization.
- **Team-ready**: Multiple users per church. Roles sync automatically from Planning Center (Administrator, Manager, Editor, Viewer).

## Architecture

```
Browser → Next.js App → AI Provider API (your key)
                              ↓ MCP
                         pco-mcp server → Planning Center API
```

- **Next.js 16** + TypeScript
- **Vercel AI SDK v6** for multi-provider AI + MCP
- **NextAuth.js** with Planning Center OAuth
- **Prisma** + PostgreSQL
- **Tailwind CSS** + shadcn/ui

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- PostgreSQL (or use the Docker Compose setup)
- A [Planning Center developer account](https://api.planningcenteronline.com/oauth/applications) with an OAuth app configured

### Setup

```bash
git clone https://github.com/remotelyliving/pco-agent.git
cd pco-agent
cp .env.example .env    # Fill in your values (see Environment Variables below)
make install            # Install dependencies
make db-push            # Create database tables (development only)
make seed               # Load default rules
make dev                # Start dev server at http://localhost:3000
```

## Deploying to Docker / Homelab

Step-by-step guide for first-time deployment on a Docker host.

### 1. Prerequisites

- Docker and Docker Compose installed
- A domain name (optional — needed for HTTPS via Cloudflare Tunnel)
- Git

### 2. Create a Planning Center OAuth App

1. Go to [developer.planning.center](https://api.planningcenteronline.com/oauth/applications)
2. Click **New Application**
3. Set **Redirect URI** to `https://your-domain.com/api/auth/callback/planning-center`
   - For local testing use `http://localhost:3000/api/auth/callback/planning-center`
4. Copy the **Client ID** and **Client Secret** — you'll need these in the next step

### 3. Configure Environment

```bash
git clone https://github.com/remotelyliving/pco-agent.git
cd pco-agent
cp .env.example .env
```

Edit `.env` and fill in every value:

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://pco:<password>@pco-mcp-db:5432/pco_mcp?schema=agent` |
| `POSTGRES_PASSWORD` | Password for the PostgreSQL container | Pick a strong password |
| `PCO_CLIENT_ID` | From step 2 above | Planning Center developer portal |
| `PCO_CLIENT_SECRET` | From step 2 above | Planning Center developer portal |
| `NEXTAUTH_SECRET` | Session encryption key | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of your app | `https://your-domain.com` |
| `PCO_MCP_URL` | URL of the pco-mcp server | `https://pco-mcp.com/mcp` (or your own instance) |
| `ENCRYPTION_KEY` | Fernet key for API key encryption | See below |

**Generating a Fernet encryption key:**

```bash
node -e "const crypto = require('crypto'); console.log(crypto.randomBytes(32).toString('base64url'))"
```

### 4. Create the Docker Network and Volume

If this is your first time, create the shared network and volume:

```bash
docker network create homelab-net
docker volume create pco-mcp_pgdata
```

### 5. First-Time Database Setup

```bash
# Start PostgreSQL first
docker compose up -d pco-mcp-db

# Wait for it to be healthy
docker compose exec pco-mcp-db pg_isready -U pco -d pco_mcp

# Build and start the app (migrations run automatically on startup)
make docker-build
make docker-up
```

The entrypoint script runs `prisma migrate deploy` before starting the server, so your schema will be created automatically.

### 6. Seed Default Rules

On first deploy, seed the system default rules:

```bash
docker compose exec pco-agent node -e "require('./prisma/seed')"
```

Or from outside the container (if you have Node.js locally):

```bash
make seed
```

### 7. Verify It's Running

```bash
curl http://localhost:3000/api/health
```

Expected response: `{"status":"ok","database":"connected"}`

Then visit `https://your-domain.com` (or `http://localhost:3000`) and sign in with Planning Center.

### 8. Cloudflare Tunnel (Optional — HTTPS)

If you're exposing this to the internet:

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Create a tunnel
cloudflared tunnel create pco-agent

# Configure the tunnel to point to your local app
cloudflared tunnel route dns pco-agent your-domain.com

# Run it
cloudflared tunnel run --url http://localhost:3000 pco-agent
```

Make sure `NEXTAUTH_URL` in `.env` matches your public domain.

### 9. Updating / Upgrading

```bash
cd pco-agent
git pull
make docker-build
make docker-up    # Migrations run automatically on restart
```

### 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| Health check returns connection error | Check `DATABASE_URL` in `.env` — host should be `pco-mcp-db` (Docker service name), not `localhost` |
| OAuth redirect mismatch | Ensure `NEXTAUTH_URL` matches the Redirect URI in your PCO OAuth app |
| "No API key configured" after login | Each user needs to configure their own AI provider key at `/settings` or via the setup wizard |
| Container exits immediately | Check logs: `make docker-logs` |
| Port 3000 already in use | Change the port mapping in `docker-compose.yml`: `"3001:3000"` |

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development server |
| `make build` | Production build |
| `make test` | Run all tests |
| `make lint` | Lint + type check |
| `make db-push` | Push schema to database (dev only) |
| `make db-migrate` | Create a new Prisma migration (dev only) |
| `make db-deploy` | Apply pending migrations (production) |
| `make seed` | Seed system default rules |
| `make docker-build` | Build Docker image |
| `make docker-up` | Start via Docker Compose |
| `make docker-down` | Stop Docker Compose |
| `make docker-logs` | Tail container logs |

## How It Works

### For church staff (users)

1. Click "Sign in with Planning Center"
2. Set up your AI provider (paste an API key — we walk you through it)
3. Start chatting: "Who's available to serve this Sunday?" / "Add Amazing Grace to the July 13 service"

### For church admins

Everything above, plus:
- Define organization-level rules ("Always check blockout dates before scheduling")
- View and manage the AI's memory about your church

### Roles

Roles sync automatically from Planning Center on every login:

| PCO Permission | pco-agent Role | Capabilities |
|---------------|---------------|--------------|
| Site Administrator | admin | Full access — rules, memory, org settings |
| People Manager | admin | Full access |
| People Editor | editor | Manage rules, personal settings |
| People Viewer | member | Chat, personal rules |

## Related

- [pco-mcp](https://github.com/remotelyliving/pco-mcp) — The MCP server that connects to Planning Center's API. pco-agent uses this under the hood.

## License

Private. Not yet open source.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: comprehensive deployment guide for Docker/homelab + role mapping table"
```

---

### Task 14: Clean Up KNOWN_ISSUES.md

**Files:**
- Modify: `docs/KNOWN_ISSUES.md`

- [ ] **Step 1: Replace KNOWN_ISSUES.md with remaining items only**

Replace the entire contents of `docs/KNOWN_ISSUES.md` with:

```markdown
# Known Issues & Accepted Deferrals

> **For agents and developers:** These are known limitations accepted for the current release. Do not flag these in reviews — they are tracked here intentionally.

**Last Updated:** 2026-04-07

---

## Schema Constraints

### Rule sortOrder
**Status:** Accepted — no action planned
**Impact:** `sortOrder` has no uniqueness constraint and no range limit. Duplicate or negative values are allowed. No reorder UI exists.
**Rationale:** A uniqueness constraint without a reorder UI creates more problems than it solves. Will revisit when drag-and-drop reorder is implemented.

---

## Resolved in This Hardening Pass

The following items were resolved and removed from this file on 2026-04-07:

- **Rate Limiting** → In-memory token bucket (20 req/min on /api/chat)
- **Stale JWT Role** → Re-synced from DB every 15 minutes
- **Content Security Policy** → Nonce-based CSP via middleware
- **PCO Role-Based Admin Mapping** → site_administrator + people_permissions synced on login
- **Admin Race Condition** → SERIALIZABLE transaction isolation
- **Memory Partial Unique Index** → Partial unique index on (org_id, key) WHERE user_id IS NULL
- **Prisma Migrations Directory** → Migration infrastructure + db-deploy Makefile target
- **Message Content Unbounded** → Application-layer 64KB cap
- **Memory TTL / Expiry** → 200 per-org cap, evict oldest auto-extracted
- **Conversation / Message Pagination** → Last 100 messages on load, cursor-based getMessages
- **MCP Per-Request Timeout** → 15s connection + 30s total setup timeout
- **Token Refresh Fetch Timeout** → 10s AbortSignal.timeout
- **Token Usage Tracking** → tokenCount stored in Message model
- **Enum-Like String Fields** → Prisma enums with DB CHECK constraints

---

## How to Use This File

- **During reviews:** Check this file before flagging an issue. If it's listed here, it's known and accepted.
- **When picking up work:** Items here are good candidates for post-launch improvement tickets.
- **When fixing an item:** Remove it from this file and update the relevant feature summary in `docs/features/`.
```

- [ ] **Step 2: Update DEV_QUEUE.md**

Move the "Known Issues Hardening" task to Done in `DEV_QUEUE.md` and update the project status.

- [ ] **Step 3: Commit**

```bash
git add docs/KNOWN_ISSUES.md DEV_QUEUE.md
git commit -m "docs: update KNOWN_ISSUES.md (14 resolved, 1 remaining) + mark hardening done in DEV_QUEUE"
```

---

### Task 15: Final Verification + Lint + Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Fix any issues found in steps 1-3**

If there are failures, fix them and re-run.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/type/test issues from hardening pass"
```

---

## Task Dependency Graph

```
Task 1 (rate limit lib) → Task 2 (integrate into chat route)
Task 3 (auth hardening) → standalone
Task 4 (CSP middleware) → standalone
Task 5 (PCO role mapping) → depends on Task 3 (SERIALIZABLE already added)
Task 6 (schema enums) → standalone, but must run before Task 7 and Task 9
Task 7 (message cap + token tracking) → depends on Task 6 (tokenCount field)
Task 8 (pagination) → standalone
Task 9 (memory cap) → standalone
Task 10 (MCP timeout) → standalone
Task 11 (Makefile + Docker) → standalone
Task 12 (migration SQL) → standalone
Task 13 (README) → depends on Task 5 (role table) and Task 11 (db-deploy)
Task 14 (KNOWN_ISSUES cleanup) → depends on all other tasks
Task 15 (final verification) → depends on all other tasks
```

**Parallelizable groups:**
- Group A (no deps): Tasks 1, 3, 4, 6, 8, 10, 11, 12
- Group B (after Task 1): Task 2
- Group C (after Task 3): Task 5
- Group D (after Task 6): Tasks 7, 9
- Group E (after all): Tasks 13, 14, 15
