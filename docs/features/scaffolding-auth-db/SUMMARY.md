# Feature: Scaffolding + Auth + Database

**Status:** Complete
**Last Updated:** 2026-04-07

## What It Does
Next.js 16 project with PCO OAuth authentication, Prisma 7 database (agent schema),
sidebar layout, and Docker deployment configuration.

## Key Files
- `src/lib/auth.ts` — NextAuth config with PCO OAuth provider, user/org sync
- `src/lib/db.ts` — Prisma client singleton with driver adapter (pg)
- `src/lib/crypto.ts` — Fernet encryption for API key storage
- `src/lib/env.ts` — Environment variable validation (lazy, fail-fast)
- `prisma/schema.prisma` — Full agent schema (orgs, users, conversations, messages, rules, memory)
- `prisma/seed.ts` — System default rules seeder with production guard
- `src/middleware.ts` — Route protection (redirect to /login if unauthenticated)
- `src/app/(auth)/login/page.tsx` — PCO sign-in page with error display
- `src/app/(app)/layout.tsx` — Authenticated layout with sidebar
- `src/components/sidebar.tsx` — Responsive sidebar with nav, user info, sign out
- `Dockerfile` — Multi-stage build for standalone deployment
- `docker-compose.yml` — App + shared Postgres for homelab

## Design Decisions
- Shared PostgreSQL with pco-mcp, separate `agent` schema (reduces ops)
- PCO is source of truth for identity (synced on every login)
- First-user-is-admin heuristic for role assignment (PCO role mapping planned for future)
- Fernet encryption for API keys at rest (same approach as pco-mcp)
- NextAuth JWT sessions (no server-side session store)
- PCO access token kept in JWT only, not exposed to client session
- standalone output mode for Docker deployment
- Prisma 7 with pg driver adapter (no Rust engine)

## Review Findings
- [2026-04-07] Milestone 1 (5 reviewers): Fixed seed ID stability, env validation, Prisma logging, schema type mismatch, docs accuracy
- [2026-04-07] Milestone 2 (5 reviewers): Fixed access token exposure, redundant DB queries, error handling, responsive sidebar, auth error display, AGENTS.md accuracy

## Known Limitations
- Admin role assignment uses first-user heuristic with race condition (needs $transaction)
- No PCO token refresh logic (access tokens expire in ~2 hours)
- Auth callback tests verify structure only, not behavior
- No health check API endpoint
- No HTTP security headers in next.config.ts
- No structured logging (console.error only)
- Mobile sidebar is hidden, no drawer/hamburger yet
