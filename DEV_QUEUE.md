# pco-agent Development Queue

> **For new sessions:** Read this file FIRST to understand current project state. Then read `CLAUDE.md` for architecture context and `AGENTS.md` for development patterns.

## Project Status

**Phase:** ALL PLANS COMPLETE + 4 REVIEW ROUNDS DONE — hardening pass next
**Last Updated:** 2026-04-07
**Last Session Summary:** Built all 5 plans (31 tasks), ran 4 rounds of reviews (comprehensive 6-reviewer audit, E2E bug hunting, final sign-off), fixed 50+ issues, added request tracing + MCP connection pooling. 15 known issues remain — see `docs/KNOWN_ISSUES.md`.

---

## In Progress

_(none)_

## Backlog

- [ ] **Known Issues Hardening** — 15 items in `docs/KNOWN_ISSUES.md`. Work through them by category: Security first, then Auth, Data, Operations, Schema. Each item has status, impact, and fix instructions.

## Done

- [x] **Project Setup** — Spec, README, CLAUDE.md, AGENTS.md, TEAM.md, Makefile (2026-04-06)
- [x] **Plan 1 Written** — 8 tasks covering Next.js init, Prisma schema, Fernet crypto, PCO OAuth, login page, authenticated layout, Docker config (2026-04-06)
- [x] **Plan 1: Scaffolding + Auth + Database** — Next.js 16, PCO OAuth, Prisma 7 (agent schema), Fernet crypto, sidebar layout, Docker config. Two milestone reviews (5 reviewers each). See `docs/features/scaffolding-auth-db/SUMMARY.md` (2026-04-07)
- [x] **Plan 2: AI Provider + MCP + Chat** — Multi-provider AI chat (Anthropic/OpenAI/Google), MCP connector to pco-mcp, streaming chat UI, settings page, conversation persistence. See `docs/features/ai-provider-mcp-chat/SUMMARY.md` (2026-04-07)
- [x] **Plan 3: Rules System** — Three-layer rules (system/org/user), per-user toggle overrides, rules CRUD API, rules list + editor UI, rule assembly into system prompts. See `docs/features/rules-system/SUMMARY.md` (2026-04-07)
- [x] **Plan 4: Memory System** — Dual-scoped key-value fact store (org + user), auto-extraction via cheapest model after each response, memory injected into system prompt, admin memory management UI. See `docs/features/memory-system/SUMMARY.md` (2026-04-07)
- [x] **Plan 5: Setup Wizard + UX Polish** — First-time onboarding wizard (welcome → provider pick → API key → success), setup detection + redirect, page metadata for all routes. See `docs/features/setup-wizard-ux/SUMMARY.md` (2026-04-07)

---

## Session History

### 2026-04-07: Comprehensive Review + Polish (pco-agent)

**pco-agent (~/projects/pco-agent) — branch: `fix/buff-and-polish`**

Full codebase audit and polish pass resolving all Known Limitations flagged across Plans 1–5. 22 issues fixed:

**Security fixes:**
- Cross-org rule access → added `orgId` checks on all rules API routes
- Conversation injection → added ownership verification before returning/modifying conversations
- Settings auth check → added session guard to settings and memory API routes

**Correctness fixes:**
- Admin race condition → wrapped first-user org creation in `$transaction`
- PCO token refresh → implemented in NextAuth `jwt` callback
- Memory NULL uniqueness → `upsertMemory` now uses `findFirst` pattern for `userId=null` case
- MCP client leak → wrapped in try/catch with proper resource cleanup
- `DRY getDefaultModelId` → removed duplicate; unified through `getDefaultModel()`
- Sequential queries → parallelized with `Promise.all` in rules and settings routes

**New features/capabilities:**
- Conversation deletion → `DELETE /api/conversations/[id]` + inline confirm in sidebar (`src/components/conversation-item.tsx`)
- Health check → `GET /api/health` returns app + DB status (`src/app/api/health/route.ts`)
- Test connection → `POST /api/settings/test` + button on API key form (`src/app/api/settings/test/route.ts`)
- Mobile nav → hamburger drawer added (`src/components/mobile-nav.tsx`)
- Structured logging → `src/lib/logger.ts` created; `src/instrumentation.ts` registers at startup
- HTTP security headers → added in `next.config.ts`
- `maxDuration` → added to chat route

**UX fixes:**
- `RuleEditor` error swallowing → save failures now show a user-facing error message
- Delete confirmations → `confirm()` dialogs added to rules and conversation delete actions
- Inline rule editing → rules can now be edited in place (no delete-and-recreate)
- `/memory` page → now shows user's personal memories in addition to org memories
- Memory source labels → friendly display names instead of raw `auto`/`manual` strings
- Auto-resize textarea + example prompts → added to empty chat state
- Auto-title → improved to use first meaningful assistant sentence

### 2026-04-07: Plan 5 Execution (pco-agent)

**pco-agent (~/projects/pco-agent) — Plan 5 COMPLETE:**
- Task 1: Setup detection (`src/lib/setup.ts`) — `needsSetup(userId)` checks apiProvider + apiKeyEnc
- Task 2: Chat page redirect — redirects unconfigured users to `/setup` before rendering chat
- Task 3: Setup wizard (`src/components/setup/setup-wizard.tsx`) — 4-step wizard: welcome, provider pick, API key entry, success
- Task 4: Setup page (`src/app/(app)/setup/page.tsx`) — page container for the wizard
- Task 5: Page metadata — added `export const metadata` to all 6 routes (login, chat, settings, rules, memory, setup)
- Task 6: Documentation + dev queue update
- Bug fix: pre-existing TypeScript error in `src/lib/memory/queries.ts` (null vs string in Prisma unique where)

### 2026-04-07: Plan 4 Execution (pco-agent)

**pco-agent (~/projects/pco-agent) — Plan 4 COMPLETE:**
- Task 1: Memory queries (`src/lib/memory/queries.ts`) — getOrgMemories, getUserMemories, getAllMemoriesForUser, upsertMemory, updateMemory, deleteMemory
- Task 2: Memory extraction (`src/lib/memory/extract.ts`) — extractAndSaveMemories() using cheapest model per provider, fire-and-forget
- Task 3: Memory retrieval (`src/lib/memory/retrieve.ts`) — getMemoryPrompt() with dual org/user sections
- Task 4: Memory API routes (`src/app/api/memory/route.ts`, `[id]/route.ts`) — CRUD with admin-only writes
- Task 5: MemoryList component (`src/components/memory/memory-list.tsx`) — org fact list with add form and delete (admin-gated)
- Task 6: Documentation + dev queue update

### 2026-04-07: Plan 3 Execution (pco-agent)

**pco-agent (~/projects/pco-agent) — Plan 3 COMPLETE:**
- Task 1: Rules queries (`src/lib/rules/queries.ts`) — listRulesForOrg, createRule, updateRule, deleteRule, toggleRule, getUserRuleSettings
- Task 2: Rule assembly (`src/lib/rules/assemble.ts`) — assembleRules() with default-on/off logic, formatAsPrompt option
- Task 3: Rules API routes (`src/app/api/rules/route.ts`, `[id]/route.ts`, `toggle/route.ts`) — CRUD + toggle with auth + ownership checks
- Task 4: RuleList component (`src/components/rules/rule-list.tsx`) — grouped sections, toggle switches, optimistic UI
- Task 5: RuleEditor component (`src/components/rules/rule-editor.tsx`) — inline form, scope selector (admin only)
- Task 6: Documentation + dev queue update

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

**Next task: Work through the 15 known issues in `docs/KNOWN_ISSUES.md`.**

1. Read this file (you're here)
2. Read `CLAUDE.md` for architecture + session checklist
3. Read `docs/KNOWN_ISSUES.md` — **this is your work list**. Each item has status, impact, and specific fix instructions
4. Read `TEAM.md` for quality gates + review protocol
5. Create a branch `fix/known-issues-hardening`
6. Work through items by category priority: Security → Auth → Data → Operations → Schema
7. Use `superpowers:subagent-driven-development` for execution
8. After fixing all items, run a final team review to verify
