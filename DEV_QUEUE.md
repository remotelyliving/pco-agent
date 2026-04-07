# pco-agent Development Queue

> **For new sessions:** Read this file FIRST to understand current project state. Then read `CLAUDE.md` for architecture context and `AGENTS.md` for development patterns.

## Project Status

**Phase:** Plan 1 ready for execution (scaffolding + auth + DB)
**Last Updated:** 2026-04-06
**Last Session Summary:** Complete design + planning session. Spec approved, Plan 1 written (8 tasks), all foundational docs committed. Ready to execute Task 1.

---

## In Progress

- [ ] **Plan 1: Scaffolding + Auth + Database** — 8 tasks in `docs/plans/2026-04-06-plan-1-scaffolding-auth-db.md`. Execute with subagent-driven-development. Start at Task 1.

## Backlog

- [ ] **Plan 2: AI Provider + MCP + Chat** — Vercel AI SDK, multi-provider routing, MCP connector, streaming chat UI. (Plan not yet written — write when Plan 1 is done)
- [ ] **Plan 3: Rules System** — System default rules, org rules, user rules, per-user toggle overrides, rules editor UI, rule assembly into system prompts
- [ ] **Plan 4: Memory System** — Org-level key-value facts, auto-extraction after responses, memory in system prompt, admin memory management UI
- [ ] **Plan 5: Setup Wizard + UX Polish** — First-time onboarding flow, API key setup with provider-specific how-to guides, test connection, settings pages

## Done

- [x] **Project Setup** — Spec, README, CLAUDE.md, AGENTS.md, TEAM.md, Makefile (2026-04-06)
- [x] **Plan 1 Written** — 8 tasks covering Next.js init, Prisma schema, Fernet crypto, PCO OAuth, login page, authenticated layout, Docker config (2026-04-06)

---

## Session History

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
4. Open `docs/plans/2026-04-06-plan-1-scaffolding-auth-db.md` — start executing Task 1
5. Use `superpowers:subagent-driven-development` skill for execution
