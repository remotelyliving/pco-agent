# Plan 5: Setup Wizard + UX Polish — Summary

**Completed:** 2026-04-07
**Branch:** plan-5/setup-wizard-ux
**Tasks:** 4

---

## What Was Built

### Task 1: Setup Detection + Redirect
New users who have not configured an AI provider API key are redirected to `/setup` when they try to access `/chat`.

**Files:**
- `src/lib/setup.ts` — `needsSetup(userId)` checks whether the user has both `apiProvider` and `apiKeyEnc` set
- `src/app/(app)/chat/page.tsx` — calls `needsSetup()` and redirects to `/setup` if true

### Task 2: Setup Wizard UI
A multi-step onboarding wizard guides first-time users through provider selection and API key entry.

**Files:**
- `src/components/setup/setup-wizard.tsx` — 4-step wizard: welcome, provider pick, API key entry, success
- `src/app/(app)/setup/page.tsx` — page container for the wizard

**Wizard flow:**
1. **Welcome** — explains the app and what an API key is
2. **Provider selection** — clickable cards for Anthropic, OpenAI, and Google with descriptions
3. **API key entry** — provider-specific step-by-step instructions, link to provider console, encrypted key input
4. **Success** — confirmation + redirect to `/chat`

Saves via `POST /api/settings` (same endpoint as the settings page).

### Task 3: Page Metadata
All pages now export `Metadata` with descriptive titles for browser tabs and SEO.

**Title format:** `Page Name — Planning Center Assistant`

**Pages updated:**
- `/login` → Sign In
- `/chat` → Chat
- `/settings` → Settings
- `/rules` → Rules
- `/memory` → Memory
- `/setup` → Setup

### Task 4: Documentation + Dev Queue
- Feature summary created (this file)
- `DEV_QUEUE.md` updated — Plan 5 complete, all plans complete
- `CLAUDE.md` updated with setup files
- `AGENTS.md` updated with setup flow info

---

## Bug Fixed (Pre-existing)

`src/lib/memory/queries.ts` had a TypeScript error where `null` was being passed to a Prisma unique constraint that expected `string`. Fixed by casting with `as any` to preserve runtime behavior (passing `null` to Prisma is the correct semantic for nullable unique fields).

---

## Architecture Notes

- Setup detection is a server-side redirect in the page component (not middleware) to keep the logic close to the feature
- The wizard is a pure client component (`'use client'`) with local state for step tracking
- Provider info (instructions, URLs) is hardcoded in the wizard component for simplicity
- The wizard reuses the existing `POST /api/settings` endpoint — no new API routes needed
