# pco-agent Development Queue

> **For new sessions:** Read this file FIRST to understand current project state. Then read `CLAUDE.md` for architecture context and `AGENTS.md` for development patterns.

## Project Status

**Phase:** Plan 2 complete — ready to write Plan 3 (Rules System)
**Last Updated:** 2026-04-07
**Last Session Summary:** Executed all 7 tasks in Plan 2. Multi-provider AI chat (Anthropic/OpenAI/Google), MCP connector to pco-mcp, streaming chat UI, settings page, conversation persistence all complete. Feature summary at `docs/features/ai-provider-mcp-chat/SUMMARY.md`.

---

## In Progress

_(none)_

## Backlog

- [ ] **Plan 3: Rules System** — System default rules, org rules, user rules, per-user toggle overrides, rules editor UI, rule assembly into system prompts
- [ ] **Plan 4: Memory System** — Org-level key-value facts, auto-extraction after responses, memory in system prompt, admin memory management UI
- [ ] **Plan 5: Setup Wizard + UX Polish** — First-time onboarding flow, API key setup with provider-specific how-to guides, test connection, settings pages

## Done

- [x] **Project Setup** — Spec, README, CLAUDE.md, AGENTS.md, TEAM.md, Makefile (2026-04-06)
- [x] **Plan 1 Written** — 8 tasks covering Next.js init, Prisma schema, Fernet crypto, PCO OAuth, login page, authenticated layout, Docker config (2026-04-06)
- [x] **Plan 1: Scaffolding + Auth + Database** — Next.js 16, PCO OAuth, Prisma 7 (agent schema), Fernet crypto, sidebar layout, Docker config. Two milestone reviews (5 reviewers each). See `docs/features/scaffolding-auth-db/SUMMARY.md` (2026-04-07)
- [x] **Plan 2: AI Provider + MCP + Chat** — Multi-provider AI chat (Anthropic/OpenAI/Google), MCP connector to pco-mcp, streaming chat UI, settings page, conversation persistence. See `docs/features/ai-provider-mcp-chat/SUMMARY.md` (2026-04-07)

---

## Session History

### 2026-04-07: Plan 2 Execution (pco-agent)

**pco-agent (~/projects/pco-agent) — Plan 2 COMPLETE:**
- Task 1: AI provider factory (`src/lib/ai/providers.ts`) + model metadata (`src/lib/ai/models.ts`)
- Task 2: Conversation/message persistence (`src/lib/chat/persist.ts`) with auto-title
- Task 3: Streaming chat API route (`src/app/api/chat/route.ts`) with MCP connector + graceful degradation
- Task 4: Settings API route (`src/app/api/settings/route.ts`) with Fernet key encryption
- Task 5: Chat UI components (`chat-interface.tsx`, `message-bubble.tsx`) with tool call display
- Task 6: Settings page + API key form (`src/app/(app)/settings/page.tsx`, `api-key-form.tsx`)
- Task 7: Feature summary + dev queue update

### 2026-04-07: Plan 1 Execution (pco-agent)

**pco-agent (~/projects/pco-agent) — Plan 1 COMPLETE:**
- Task 1: Next.js 16 project init (TypeScript, Tailwind, App Router)
- Task 2: Prisma 7 schema (orgs, users, conversations, messages, rules, memory) + seed
- Task 3: Fernet encryption library + env validation
- Task 4: PCO OAuth via NextAuth + user/org sync on login
- Task 5: Login page with error display + middleware route protection
- Task 6: Authenticated sidebar layout (responsive, user info, sign out)
- Task 7: Docker multi-stage build + docker-compose with shared Postgres
- Task 8: Feature summary + dev queue update
- Milestone 1 review (5 subagent reviewers): seed stability, env validation, Prisma logging, schema types, docs
- Milestone 2 review (5 subagent reviewers): access token exposure, redundant DB queries, error handling, sidebar, auth errors

### 2026-04-06: Monster Session (pco-mcp + pco-agent)

**pco-mcp (~/projects/pco-mcp) — COMPLETE:**
- Built from scratch: 25 MCP tools, dual OAuth, PCO API client
- 269 tests, 96% coverage
- 4 audits (Security, SRE, Code Quality, Monetization)
- All 3 tiers of fixes (security, stability, code quality)
- Deployed to homelab, live at pco-mcp.com
- Key debugging: Cloudflare bot protection was blocking ChatGPT (root cause of "RFC 7591" error)

**pco-agent (~/projects/pco-agent) — DESIGN COMPLETE:**
- Spec approved: Next.js + Vercel AI SDK v6 + PCO OAuth + Prisma
- Multi-provider (Anthropic/OpenAI/Google), BYO API key
- 3-layer rules system (system + org + user with per-user toggles)
- Persistent memory (conversations + key-value facts)
- 5-reviewer team defined (Sr. Engineer, SRE, Security, UX/PM, Docs)
- Plan 1 written and committed, ready for execution

## How to Resume

1. Read this file (you're here)
2. Read `CLAUDE.md` for architecture + session checklist
3. Read `TEAM.md` for quality gates + review protocol
4. Write Plan 3 (Rules System) — use `superpowers:writing-plans` skill
5. Then execute Plan 3 with `superpowers:subagent-driven-development` skill
