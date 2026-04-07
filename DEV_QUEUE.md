# pco-agent Development Queue

> **For new sessions:** Read this file FIRST to understand current project state. Then read `CLAUDE.md` for architecture context and `AGENTS.md` for development patterns.

## Project Status

**Phase:** Pre-implementation (spec approved, planning next)
**Last Updated:** 2026-04-06
**Last Session Summary:** Initial project setup — spec, README, CLAUDE.md, AGENTS.md, Makefile, team structure committed.

---

## Backlog

- [ ] **Sub-project 1: Core Chat App** — Next.js scaffolding, PCO OAuth auth, multi-provider AI routing, MCP connector to pco-mcp, chat UI with streaming, conversation persistence
- [ ] **Sub-project 2: Rules System** — System default rules, org rules, user rules, per-user toggle overrides, rules editor UI, rule assembly into system prompts
- [ ] **Sub-project 3: Memory System** — Org-level key-value facts, auto-extraction after responses, memory in system prompt, admin memory management UI
- [ ] **Sub-project 4: Setup Wizard** — First-time onboarding flow, API key setup with provider-specific how-to guides, test connection
- [ ] **Sub-project 5: Settings Pages** — AI provider settings, rules management, org admin panel
- [ ] **Sub-project 6: Billing (future)** — Stripe integration, subscription tiers, usage tracking

## In Progress

_(none)_

## In Review

_(none)_

## Done

- [x] **Project Setup** — Spec, README, CLAUDE.md, AGENTS.md, Makefile, team structure (2026-04-06)

---

## How to Use This File

### Starting a new session
1. Read this file to understand what's in progress
2. Read the latest feature summary in the relevant `docs/features/` folder
3. Pick up the next item from "In Progress" or move one from "Backlog"

### During development
- Move tasks between columns as work progresses
- Update "Last Updated" and "Last Session Summary" after each session
- After each commit, update the feature summary document

### After completing a feature
- Move to "In Review"
- Dispatch all 5 review subagents
- After reviews pass, move to "Done" with completion date

### Format for task entries
```
- [ ] **Task Name** — Brief description. Assigned to: [agent/human]. Status notes.
```
