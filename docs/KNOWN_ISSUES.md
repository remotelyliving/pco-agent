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

## UX

### Message Pagination — No "Load Earlier" UI
**Status:** Deferred — backend ready, frontend not wired up
**Impact:** Conversations load the last 100 messages. Users with longer conversations see a truncated thread with no indication older messages exist and no way to load them.
**Fix:** Add a banner at the top of truncated conversations ("Showing the last 100 messages") and a "Load earlier messages" button that calls `getMessages` with cursor pagination. The backend `getMessages(conversationId, { take, cursor })` already supports this.

### Conversation List — `hasMore` Not Surfaced
**Status:** Deferred — backend ready, frontend not wired up
**Impact:** `listConversations` returns `{ conversations, hasMore }` but the sidebar ignores `hasMore`. Users with 50+ conversations see exactly 50 with no indicator.
**Fix:** Show a "View all" or "Load more" link in the sidebar when `hasMore` is true.

### Memory Cap Eviction Not Visible to Admins
**Status:** Deferred
**Impact:** When `enforceMemoryCap` evicts old auto-extracted memories, there is no user-facing signal. Admins may notice facts disappearing without understanding why.
**Fix:** Add a note on the `/memory` page explaining the memory caps (200 org-level and 100 per-user for auto-extracted memories). Optionally log which memories were evicted.

---

## Security

### MCP Pool Uses Raw Access Token as Map Key
**Status:** Accepted — pre-existing, low risk
**Impact:** The PCO access token is used directly as the pool Map key. In a heap dump or memory profiler, tokens would be visible as Map keys.
**Fix:** Hash the token before using as key: `crypto.createHash('sha256').update(accessToken).digest('hex')`.

### No CSRF Protection on Mutation Endpoints
**Status:** Accepted — mitigated by CSP + same-origin cookies
**Impact:** Mutation endpoints accept JSON without CSRF tokens. Mitigated by CSP `connect-src 'self'` and same-origin auth cookies, but older browsers may not fully enforce CSP on fetch.
**Fix:** Add CSRF token validation if the app is ever exposed to untrusted origins. Low risk for a homelab behind Cloudflare.

---

## Operations

### Prisma Migrations — Only Partial Index Migration Exists
**Status:** Deferred — needs running DB to generate baseline
**Impact:** The spec called for 4 migrations (init, enums, partial index, tokenCount). Only the partial unique index migration was created. Enum and tokenCount changes were applied via `db push`. A fresh deployment using `prisma migrate deploy` alone won't create the full schema.
**Fix:** Run `npx prisma migrate dev --name init` against a running database to generate the baseline migration. Then `prisma migrate deploy` will work end-to-end. Until then, first-time deployments need `db push` followed by `migrate deploy` for the partial index.

### Migration Failure Troubleshooting Not Documented
**Status:** Deferred
**Impact:** The Docker entrypoint runs `prisma migrate deploy` automatically. If it fails (e.g., schema already exists from `db push`), the container exits with no guidance.
**Fix:** Add a troubleshooting row to README: "Container exits with migration error → Check logs. If migrating from `db push`, baseline with `npx prisma migrate resolve --applied init`."

### Mobile Nav — No Focus Trap or Keyboard Dismiss
**Status:** Deferred
**Impact:** The mobile nav overlay backdrop can only be dismissed by tapping it. Keyboard users cannot press Escape to close the drawer, and focus is not trapped — tabbing can reach content behind the overlay.
**Fix:** Add `onKeyDown` handler for Escape, trap focus within the drawer when open, use `<dialog>` semantics or `role="dialog"` with `aria-modal`.


### needsSetup Adds DB Query to Chat Page Loads
**Status:** Deferred — low impact for homelab
**Impact:** The `needsSetup()` check runs a Prisma query on every `/chat` and `/chat/[id]` page load to verify the user has an API key configured. This is an additional sequential DB round-trip on the hot path.
**Fix:** Cache setup status in the JWT token (set a flag on login and when settings are saved) to avoid per-request DB hits.

---

## Testing

### Playwright E2E Tests Use Mocked Backends
**Status:** Accepted — by design
**Impact:** E2E tests run against MSW-mocked API responses, not a real database or PCO OAuth. UI regressions are caught, but integration issues between frontend and real backend are not.
**Fix:** Set up a test database + test OAuth app for full integration testing. Low priority for homelab deployment.

---

## Resolved in This Hardening Pass

The following items were resolved and removed from this file on 2026-04-07:

- **Rate Limiting** — In-memory token bucket (20 req/min on /api/chat)
- **Stale JWT Role** — Re-synced from DB every 15 minutes
- **Content Security Policy** — Nonce-based CSP via middleware
- **PCO Role-Based Admin Mapping** — site_administrator + people_permissions synced on login
- **Admin Race Condition** — SERIALIZABLE transaction isolation
- **Memory Partial Unique Index** — Partial unique index on (org_id, key) WHERE user_id IS NULL
- **Prisma Migrations Directory** — Migration infrastructure + db-deploy Makefile target
- **Message Content Unbounded** — Application-layer 64KB cap
- **Memory TTL / Expiry** — 200 per-org cap, evict oldest auto-extracted
- **Conversation / Message Pagination** — Last 100 messages on load, cursor-based getMessages
- **MCP Per-Request Timeout** — 15s connection + 30s total setup timeout
- **Token Refresh Fetch Timeout** — 10s AbortSignal.timeout
- **Token Usage Tracking** — tokenCount stored in Message model
- **Enum-Like String Fields** — Prisma enums with DB CHECK constraints

---

## How to Use This File

- **During reviews:** Check this file before flagging an issue. If it's listed here, it's known and accepted.
- **When picking up work:** Items here are good candidates for post-launch improvement tickets.
- **When fixing an item:** Remove it from this file and update the relevant feature summary in `docs/features/`.
