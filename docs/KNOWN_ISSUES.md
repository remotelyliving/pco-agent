# Known Issues & Accepted Deferrals

> **For agents and developers:** These are known limitations accepted for the initial launch. Do not flag these in reviews — they are tracked here intentionally. Each item includes context on why it was deferred and what the fix looks like.

**Last Updated:** 2026-04-07

---

## Security

### Rate Limiting
**Status:** Deferred — needs Redis infrastructure
**Impact:** An authenticated user can spam `/api/chat` without throttling, consuming their own API key credits and generating unbounded DB writes + MCP connections.
**Fix:** Add per-user rate limiting via `@upstash/ratelimit` with Redis, or an in-memory token bucket keyed on `userId`. Apply to `/api/chat` at minimum, ideally all mutation endpoints.

### Stale JWT Role
**Status:** Deferred — needs per-request DB lookup or shorter JWT TTL
**Impact:** If an admin is demoted in the database, they retain admin privileges until their JWT expires (NextAuth default: 30 days). There is no admin demotion UI, so this requires direct DB access to trigger.
**Fix:** In the `jwt` callback, on subsequent requests (`!user`), re-query the user's current role from DB and update `token.role`. Can be cached with a short TTL (e.g., 5 minutes) to avoid a DB hit per request.

### Content Security Policy
**Status:** Deferred — needs tuning for Next.js inline scripts
**Impact:** No `Content-Security-Policy` header. Other security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) are present.
**Fix:** Add CSP to `next.config.ts` headers. Next.js uses inline scripts that need `nonce` or `strict-dynamic` — requires testing to avoid breaking the app.

---

## Authentication

### PCO Role-Based Admin Mapping
**Status:** Deferred — needs PCO API research
**Impact:** Admin role is assigned via first-user-is-admin heuristic (wrapped in `$transaction`). PCO's actual permissions (Administrator, Editor, Viewer) are not checked.
**Fix:** Call PCO's `/people/v2/me` permissions endpoint during sign-in callback. Map PCO Administrator/Editor to `admin`, Viewer to `member`. Requires testing with real PCO accounts to verify the API response shape.

### Admin Race Condition (SERIALIZABLE)
**Status:** Mitigated, not fully resolved
**Impact:** The `$transaction` wrapping count+upsert uses Postgres default `READ COMMITTED` isolation. Two truly simultaneous first-logins for the same org could theoretically both get admin. Extremely rare in practice.
**Fix:** Add `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }` to the `$transaction` call. Has a minor performance cost.

---

## Data & Storage

### Memory Partial Unique Index
**Status:** Deferred — needs raw SQL migration
**Impact:** The `@@unique([orgId, userId, key])` constraint doesn't enforce uniqueness when `userId IS NULL` (PostgreSQL: NULL != NULL). Handled at app level with `findFirst` + `create` pattern, but a race under concurrent extraction could create duplicate org-scoped memories.
**Fix:** Add a partial unique index via raw SQL migration:
```sql
CREATE UNIQUE INDEX memory_org_key_null_user
  ON agent.memory (org_id, key)
  WHERE user_id IS NULL;
```

### Prisma Migrations Directory
**Status:** Deferred — needs running DB to generate
**Impact:** No `prisma/migrations/` directory. Schema managed via `db push`. Not suitable for production schema changes — no rollback, no history.
**Fix:** Run `npx prisma migrate dev --name init` against a running database to generate the initial migration. Then use `prisma migrate deploy` in production.

### Message Content Unbounded
**Status:** Accepted
**Impact:** `Message.content` is unbounded TEXT. Tool call results (e.g., large PCO people lists) are stored verbatim. No TTL or archival.
**Fix:** Consider `@db.VarChar(65536)` ceiling, or application-layer truncation. Add conversation/message archival for old data.

### Memory TTL / Expiry
**Status:** Deferred
**Impact:** Auto-extracted facts persist indefinitely. No cap on per-org memory count (API response limited to 100, but DB accumulates).
**Fix:** Add a `LIMIT` to the memory write path (e.g., max 200 per org). Consider TTL-based expiry or relevance scoring for retrieval.

### Conversation / Message Pagination
**Status:** Deferred
**Impact:** Sidebar shows max 50 conversations. Messages per conversation are unbounded on load. Long conversations may cause slow page loads.
**Fix:** Add cursor-based pagination to `getMessages`. Add "load more" to sidebar.

---

## Operations

### MCP Per-Request Timeout
**Status:** Deferred
**Impact:** MCP pool clients have a 5-minute TTL, but individual tool calls have no timeout. A hung pco-mcp tool call blocks the stream until `maxDuration` (120s).
**Fix:** Pass `AbortSignal.timeout(30000)` to the MCP transport or wrap tool calls with a timeout.

### Token Refresh Fetch Timeout
**Status:** Deferred
**Impact:** The PCO token refresh fetch in the `jwt` callback has no `AbortSignal.timeout()`. A hung PCO OAuth server blocks middleware for that user.
**Fix:** Add `signal: AbortSignal.timeout(5000)` to the refresh fetch call in `src/lib/auth.ts`.

### Token Usage Tracking
**Status:** Deferred — feature request
**Impact:** No tracking of AI API token consumption per user/conversation. Users have no visibility into their API key usage through the app.
**Fix:** Store `usage.totalTokens` from `streamText` `onFinish` callback. Add a usage dashboard.

---

## Schema Constraints

### Enum-like String Fields
**Status:** Accepted
**Impact:** `User.role`, `Rule.ruleType`, `Rule.visibility`, `Memory.source`, `Message.role` are all free-form strings with no CHECK constraints or Prisma enums. Invalid values are only caught at application logic, not DB level.
**Fix:** Convert to Prisma enums or add CHECK constraints via raw SQL migration.

### Rule sortOrder
**Status:** Accepted
**Impact:** `sortOrder` has no uniqueness constraint and no range limit. Duplicate or negative values are allowed. No reorder UI exists.
**Fix:** Add UI for drag-and-drop reorder. Consider unique constraint per (orgId, sortOrder).

---

## How to Use This File

- **During reviews:** Check this file before flagging an issue. If it's listed here, it's known and accepted.
- **When picking up work:** Items here are good candidates for post-launch improvement tickets.
- **When fixing an item:** Remove it from this file and update the relevant feature summary in `docs/features/`.
