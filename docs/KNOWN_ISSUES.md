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
