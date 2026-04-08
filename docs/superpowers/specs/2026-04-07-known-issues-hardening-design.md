# Known Issues Hardening — Design Spec

**Status:** Approved
**Date:** 2026-04-07
**Scope:** All 15 known issues from `docs/KNOWN_ISSUES.md` + deployment documentation + Makefile improvements

---

## Overview

Work through every item in `docs/KNOWN_ISSUES.md`, grouped by priority: Security, Auth, Data, Operations, Schema. Two additional items: deployment documentation in README and a `db-deploy` Makefile target. Items are removed from KNOWN_ISSUES.md as they're resolved.

---

## 1. Security

### 1.1 Rate Limiting (In-Memory Token Bucket)

**New file:** `src/lib/rate-limit.ts`

In-memory sliding window rate limiter keyed on `agentUserId`. No external dependencies (no Redis). Resets on process restart — acceptable for single-instance homelab deployment.

**Limits:**
- `/api/chat`: 20 requests/minute per user
- Other mutation endpoints: 60 requests/minute per user

**Behavior:**
- Returns `429 Too Many Requests` with `Retry-After` header (seconds until next allowed request)
- Applied in `chat/route.ts` immediately after auth check, before any DB queries or AI calls
- Uses a Map of `{ tokens: number, lastRefill: number }` per user
- Token bucket algorithm: refill rate = limit/60 tokens per second, burst = limit

**Integration point:** `src/app/api/chat/route.ts` — add rate limit check between auth (line 37) and body parsing (line 42).

### 1.2 Stale JWT Role Re-Sync

**File:** `src/lib/auth.ts` — `jwt` callback

On subsequent requests (when `!user`), re-query the user's current role from the database every 15 minutes. Store a `roleCheckedAt` timestamp in the JWT token.

**Logic:**
```
if (!user && token.agentUserId) {
  const now = Math.floor(Date.now() / 1000)
  const lastCheck = token.roleCheckedAt ?? 0
  if (now - lastCheck > 900) {  // 15 minutes
    const dbUser = await prisma.user.findUnique({
      where: { id: token.agentUserId },
      select: { role: true },
    })
    if (dbUser) token.role = dbUser.role
    token.roleCheckedAt = now
  }
}
```

**JWT type update:** Add `roleCheckedAt?: number` to the `JWT` interface declaration.

### 1.3 Content Security Policy (Nonce-Based, Middleware)

**File:** `src/middleware.ts`

Move CSP into middleware for per-request nonce generation. The existing middleware already generates a UUID for request tracing — add nonce generation alongside it.

**CSP directives:**
```
default-src 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

- `style-src 'unsafe-inline'` — required for Tailwind CSS inline styles
- `connect-src 'self'` — all AI provider calls go through `/api/chat`, no client-side external requests
- Dev mode: add `'unsafe-eval'` to `script-src` for Next.js HMR/Fast Refresh (check `NODE_ENV`)
- Set `x-nonce` request header so server components can read it via `headers()`

**Integration note:** The current middleware uses NextAuth's `auth()` wrapper. CSP nonce generation and security headers must be set inside that wrapper callback, alongside the existing request-id logic. No separate middleware needed — it all stays in the same `auth((req) => { ... })` function.

**Cleanup:** Remove the static security headers from `next.config.ts` (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) — middleware now handles all security headers in one place.

**Matcher:** Update to exclude prefetches:
```
matcher: [
  {
    source: '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)',
    missing: [
      { type: 'header', key: 'next-router-prefetch' },
      { type: 'header', key: 'purpose', value: 'prefetch' },
    ],
  },
]
```

---

## 2. Authentication

### 2.1 PCO Role-Based Admin Mapping

**File:** `src/lib/auth.ts` — `signIn` callback + userinfo request

Extract `site_administrator` and `people_permissions` from the `/people/v2/me` response (already fetched during OAuth).

**Updated userinfo return shape:**
```typescript
return {
  id: person.id,
  name: `${person.attributes.first_name} ${person.attributes.last_name}`,
  email: person.attributes.email_addresses?.[0]?.address ?? null,
  pcoPersonId: person.id,
  pcoOrgId: org?.id,
  pcoOrgName: org?.attributes?.name,
  pcoSiteAdmin: person.attributes.site_administrator === true,
  pcoPeoplePermissions: person.attributes.people_permissions ?? null,
};
```

**Role mapping logic (in signIn callback):**
```
site_administrator === true         → "admin"
people_permissions === "Manager"    → "admin"
people_permissions === "Editor"     → "editor"
people_permissions === "Viewer"     → "member"
null / undefined / "No Access"     → "member"
```

**New role: `editor`** — Can manage rules (create, edit, delete org rules) but cannot manage org memory or perform other admin-only actions.

**Changes to user upsert:**
- The `update` branch now also sets `role` based on PCO permissions (currently it only updates name/email)
- Remove the first-user-is-admin heuristic (count check). Role is always derived from PCO.
- The `create` branch uses the PCO-derived role

**Access control updates:**
- Rules API routes (`src/app/api/rules/route.ts`, `[id]/route.ts`): Allow `admin` OR `editor` for create/edit/delete operations
- Memory API routes: Admin-only stays unchanged
- Add a helper: `canManageRules(role: string): boolean` → `role === 'admin' || role === 'editor'`

### 2.2 Admin Race Condition (SERIALIZABLE)

**File:** `src/lib/auth.ts` — `signIn` callback

Add SERIALIZABLE isolation to the `$transaction`:
```typescript
const agentUser = await prisma.$transaction(async (tx) => {
  // ... existing logic
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

With PCO role mapping, the first-user heuristic goes away, but SERIALIZABLE still protects the org upsert + user creation from race conditions during simultaneous first logins.

---

## 3. Data & Storage

### 3.1 Memory Partial Unique Index

**New migration file:** Raw SQL migration

```sql
CREATE UNIQUE INDEX IF NOT EXISTS memory_org_key_null_user
  ON agent.memory (org_id, key)
  WHERE user_id IS NULL;
```

The `findFirst` + `create/update` workaround in `upsertMemory` stays as defense-in-depth. The DB constraint makes it bulletproof under concurrent extraction.

### 3.2 Prisma Migrations Init

Generate `prisma/migrations/` directory by running `npx prisma migrate dev --name init`. This creates the baseline migration from the current schema. The partial unique index (3.1) becomes the second migration (`--name add_memory_partial_unique_index`).

**Makefile addition:**
```makefile
db-deploy:
	npx prisma migrate deploy
```

**Dockerfile update:** Add an entrypoint script that runs `prisma migrate deploy` before starting the app:
```dockerfile
COPY --from=builder /app/prisma ./prisma
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
```

**entrypoint.sh:**
```bash
#!/bin/sh
# Run migrations before starting the app
# prisma CLI is available via the copied node_modules
node ./node_modules/prisma/build/index.js migrate deploy
node server.js
```

**Dockerfile runner stage addition:** Copy the `prisma` package into the runner stage (it's needed for `migrate deploy`):
```dockerfile
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
```

### 3.3 Message Content Cap

**File:** `src/lib/chat/persist.ts` — `saveMessage()`

Add application-layer truncation at 64KB (65,536 characters):
```typescript
const MAX_CONTENT_LENGTH = 65536;
const content = data.content.length > MAX_CONTENT_LENGTH
  ? data.content.slice(0, MAX_CONTENT_LENGTH)
  : data.content;
```

Log a warning when truncation occurs. No schema change — TEXT column stays unbounded, ceiling is app-enforced.

### 3.4 Memory TTL / Cap

**File:** `src/lib/memory/extract.ts` + `src/lib/memory/queries.ts`

Cap at 200 memories per org. After upserting in `extractAndSaveMemories`, count org memories. If over 200, delete the oldest `auto`-sourced entries. Never delete `manual` entries.

**New function in queries.ts:**
```typescript
export async function enforceMemoryCap(orgId: string, maxCount: number = 200) {
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
      where: { id: { in: oldestAuto.map(m => m.id) } },
    });
  }
}
```

Called from `extractAndSaveMemories` after the upsert.

### 3.5 Conversation / Message Pagination

**File:** `src/lib/chat/persist.ts`

Update `getConversation()` to load only the last 100 messages:
```typescript
include: {
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 100,
  },
}
// Then reverse in application code for chronological order
```

Update `getMessages()` to accept optional `take` and `cursor` params:
```typescript
export async function getMessages(
  conversationId: string,
  options?: { take?: number; cursor?: string },
)
```

Update `listConversations()` to return a `hasMore` indicator by querying `take: 51` and checking length.

---

## 4. Operations

### 4.1 MCP Per-Request Timeout

**Files:** `src/lib/mcp-pool.ts`, `src/app/api/chat/route.ts`

Two timeout layers:

1. **Connection timeout (15s):** In `mcp-pool.ts`, wrap `createMCPClient` with `AbortSignal.timeout(15000)` on the SSE transport
2. **Total MCP setup timeout (30s):** In `chat/route.ts`, wrap the `getMCPClient()` + `mcpClient.tools()` sequence:
```typescript
const mcpTimeout = AbortSignal.timeout(30000);
mcpClient = await getMCPClient(mcpUrl, pcoAccessToken);
tools = await mcpClient.tools();
// If either exceeds 30s total, abort
```

Use `Promise.race` with a timeout promise if `AbortSignal` can't be threaded through the MCP client API directly.

### 4.2 Token Refresh Fetch Timeout

**File:** `src/lib/auth.ts` — `jwt` callback, line 166

Add `signal: AbortSignal.timeout(10000)` to the token refresh fetch:
```typescript
const response = await fetch('https://api.planningcenteronline.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ ... }),
  signal: AbortSignal.timeout(10000),
});
```

### 4.3 Token Usage Tracking

**Schema change:** Add nullable `tokenCount` field to `Message` model:
```prisma
tokenCount Int? @map("token_count")
```

**File:** `src/app/api/chat/route.ts` — `onFinish` callback

Capture usage from `streamText`'s `onFinish`:
```typescript
onFinish: async ({ text, toolCalls, usage }) => {
  await saveMessage({
    conversationId,
    role: 'assistant',
    content: text || '',
    toolCalls: toolCalls?.length > 0 ? toolCalls : undefined,
    tokenCount: usage?.totalTokens ?? null,
  });
}
```

**File:** `src/lib/chat/persist.ts` — Update `saveMessage` to accept optional `tokenCount`.

No dashboard — just capture the data for future use.

---

## 5. Schema Constraints

### 5.1 Enum-Like String Fields

**File:** `prisma/schema.prisma`

Convert free-form strings to Prisma enums:

```prisma
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
```

Update model fields to reference these enums. Generates CHECK constraints at the DB level via migration.

### 5.2 Rule sortOrder

**No action.** No reorder UI exists. A uniqueness constraint without a reorder mechanism creates more problems than it solves. Remove from KNOWN_ISSUES.md as "accepted — no change needed."

---

## 6. Additional Items

### 6.1 Deployment Documentation

**File:** `README.md`

Add a comprehensive "Deploying to Docker / Homelab" section covering:

1. **Prerequisites** — Docker, Docker Compose, a domain (optional, for Cloudflare tunnel)
2. **PCO OAuth App Setup** — Step-by-step: create app at developer.planning.center, set redirect URI to `https://your-domain.com/api/auth/callback/planning-center`, copy client ID + secret
3. **Environment Setup** — Copy `.env.example`, fill in all values with explanations for each
4. **Generate Encryption Key** — Command to generate a Fernet key
5. **First-Time Database Setup** — `make docker-up` (starts Postgres), `make db-deploy` (runs migrations), `make seed` (loads default rules)
6. **Start the App** — `make docker-up`, verify health at `/api/health`
7. **Cloudflare Tunnel Setup** — Brief instructions for exposing via `cloudflared`
8. **Updating / Upgrading** — `git pull`, `make docker-build`, `make docker-up` (migrations run automatically on startup)
9. **Troubleshooting** — Common issues (DB connection, OAuth redirect mismatch, health check failing)

### 6.2 Makefile `db-deploy`

```makefile
db-deploy:
	npx prisma migrate deploy
```

Add to the `.PHONY` list. Document in the Commands table in README.

---

## Migration Order

Migrations must be applied in this order:
1. **init** — Baseline from current schema (all tables)
2. **add_enums** — Convert string fields to enums (UserRole, RuleType, etc.)
3. **add_memory_partial_unique_index** — Partial unique index for org-scoped memories
4. **add_message_token_count** — Add `tokenCount` to Message model

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| `src/lib/rate-limit.ts` | **New** — in-memory token bucket |
| `src/lib/auth.ts` | **Modified** — PCO role mapping, stale JWT re-sync, SERIALIZABLE, refresh timeout |
| `src/middleware.ts` | **Modified** — CSP nonce generation + security headers |
| `next.config.ts` | **Modified** — remove static security headers |
| `src/app/api/chat/route.ts` | **Modified** — rate limiting, MCP timeout, token usage capture |
| `src/app/api/rules/route.ts` | **Modified** — allow editor role |
| `src/app/api/rules/[id]/route.ts` | **Modified** — allow editor role |
| `src/lib/mcp-pool.ts` | **Modified** — connection timeout |
| `src/lib/chat/persist.ts` | **Modified** — message cap, pagination, tokenCount |
| `src/lib/memory/queries.ts` | **Modified** — enforceMemoryCap function |
| `src/lib/memory/extract.ts` | **Modified** — call enforceMemoryCap after upsert |
| `prisma/schema.prisma` | **Modified** — enums, tokenCount field, editor role |
| `prisma/migrations/` | **New** — 4 migration files |
| `Makefile` | **Modified** — add db-deploy target |
| `Dockerfile` | **Modified** — entrypoint with prisma migrate deploy |
| `entrypoint.sh` | **New** — Docker entrypoint script |
| `README.md` | **Modified** — deployment documentation |
| `docs/KNOWN_ISSUES.md` | **Modified** — remove resolved items |
