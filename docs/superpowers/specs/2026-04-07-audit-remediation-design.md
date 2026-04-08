# Audit Remediation — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Scope:** 33 work items across 6 sections, addressing all findings from the 5-reviewer e2e audit

---

## Context

A full application audit was conducted by 5 parallel reviewer agents (Senior Engineer, SRE, Security, UX/PM, Documentation) tracing actual code paths end-to-end. This spec addresses all Critical, Important, and Minor findings. See the audit reports in the session history for full detail.

**Excluded by design decision:**
- API key requirement for users (product constraint — accepted)
- Prompt injection via rules/memories (architectural tradeoff — rules are intentionally plain text)
- MCP pool token as Map key (accepted in KNOWN_ISSUES.md)
- customFetch stale closure (low impact, React handles correctly)
- Conversation list hasMore (already in KNOWN_ISSUES.md)
- Double MCP timeout (works correctly, just redundant)
- saveMessage sequential queries (correct behavior, minor perf)

---

## Section 1: Critical Fixes

### 1.1 — onFinish Error Handling

**Finding:** SRE-CRIT-1 — `onFinish` callback in chat route performs message persistence, auto-titling, and memory extraction. If any throw, errors are silently swallowed. User sees the streamed response but it's never saved.

**Fix:** Wrap the entire `onFinish` body in try/catch. Log with `conversationId` and `userId`. The response is already streamed, so this is about preventing silent data loss — not user-facing errors.

**File:** `src/app/api/chat/route.ts:180-216`

### 1.2 — Dockerfile chmod

**Finding:** SRE-CRIT-2 — `entrypoint.sh` is copied but never made executable. Container may fail to start with "permission denied."

**Fix:** Add `RUN chmod +x entrypoint.sh` before the `USER nextjs` line in the Dockerfile.

**File:** `Dockerfile`

### 1.3 — Token Refresh Recovery

**Finding:** SRE-CRIT-3 — When PCO token refresh fails, the JWT callback returns the original token with an expired `pcoAccessToken`. All subsequent MCP calls fail silently.

**Fix:**
- When refresh fails, set `token.pcoAccessToken = undefined` in the JWT callback
- Chat route already checks `pcoAccessToken` existence before MCP connection — it will skip MCP gracefully
- Add a check: if `pcoAccessToken` is missing AND the token was previously set (indicating expiry, not first login), return a user-facing error: "Your Planning Center session has expired. Please sign out and sign back in."

**File:** `src/lib/auth.ts:186-214`, `src/app/api/chat/route.ts`

### 1.4 — Markdown Rendering

**Finding:** UX-CRIT-2 — AI responses display as raw text. Markdown formatting (`**bold**`, `- bullets`, tables) is not rendered.

**Fix:**
- Install `react-markdown` and `remark-gfm`
- In `MessageBubble`, render assistant text parts through `<ReactMarkdown remarkPlugins={[remarkGfm]}>` 
- User messages stay as plain `whitespace-pre-wrap` text
- Add Tailwind `prose` class for consistent typography on rendered markdown

**File:** `src/components/chat/message-bubble.tsx`

### 1.5 — Error Boundary, Not Found, Loading

**Finding:** UX-CRIT-3 — No `error.tsx`, `not-found.tsx`, or `loading.tsx` exist. Unhandled errors show raw Next.js pages.

**Fix:** Create three files:
- `src/app/error.tsx` — client error boundary with "Something went wrong" message, retry button, and link to `/chat`
- `src/app/not-found.tsx` — "Page not found" with link back to `/chat`
- `src/app/(app)/loading.tsx` — simple spinner/skeleton for route transitions within the authenticated layout

### 1.6 — System Rule Toggle Restriction

**Finding:** SEC-OBS-9 + user clarification — any user can toggle system rules off. Only admins should be able to.

**Fix:**
- **Backend** (`src/app/api/rules/toggle/route.ts`): If `rule.ruleType === 'system'` and user role is not `admin`, return 403 "Only administrators can modify system rules"
- **Frontend** (`src/components/rules/rule-list.tsx`): Disable the `Switch` component and show a lock icon or "Admin only" text for system rules when user is not admin
- Pass `isAdmin` (already available) into `RuleSection` to control this behavior

**Files:** `src/app/api/rules/toggle/route.ts`, `src/components/rules/rule-list.tsx`

### 1.7 — Rule List isEnabled Fix

**Finding:** SE-CRIT-1 — `isEnabled()` in rule-list.tsx returns `true` unconditionally for own rules, but backend `assembleRules` allows toggling them off via `override !== false`. UI and backend disagree.

**Fix:** Change line 57 from `if (rule.createdById === userId) return true;` to `return override !== false;`

**File:** `src/components/rules/rule-list.tsx:57`

---

## Section 2: Infrastructure

### 2.1 — Middleware-Based Rate Limiting (proxy.ts Migration)

**Finding:** SE-IMP-3, SEC-IMP-4 — Rate limiter uses shared bucket across endpoints; several mutation endpoints have no rate limiting at all.

**Design:**

Rename `middleware.ts` → `proxy.ts` to opt into Next.js 16 Node.js runtime for middleware. This gives us in-memory state, full Node.js APIs, and centralized request processing.

**Rate limit config map:**
```typescript
const RATE_LIMITS: Record<string, number> = {
  '/api/chat': 20,
  '/api/settings/test': 5,
  '/api/settings': 10,
  '/api/rules': 60,
  '/api/rules/toggle': 60,
  '/api/memory': 60,
  '/api/conversations': 60,
};
const DEFAULT_LIMIT = 60;
```

**Key format:** `${normalizedRoute}:${userId}`

Route normalization: use a static map of known route patterns. Match incoming paths against patterns like `/api/rules/:id`, `/api/conversations/:id`, `/api/memory/:id`. Unmatched `/api/` paths fall through to the default limit. This avoids regex-based dynamic segment detection and keeps the mapping explicit and auditable.

**Middleware flow:**
1. Generate requestId + CSP nonce (existing logic, unchanged)
2. Set security headers (existing logic, unchanged)
3. For `/api/` routes (except `/api/auth`, `/api/health`):
   a. Check `req.auth` — if missing, return 401 (centralized auth enforcement)
   b. Resolve rate limit for this route pattern
   c. Check bucket for `${route}:${userId}` — if exhausted, return 429 with `Retry-After` and friendly message
4. Pass through to route handler

**Memory safety:**
- Replace per-call O(n) eviction with `setInterval` cleanup every 60s, `.unref()` to avoid blocking Node exit
- TTL stays at 2 minutes (bucket entries older than 2min are stale)
- At homelab scale (~10 users), the Map will never exceed a few hundred entries

**Cleanup in routes:**
- Remove all `checkRateLimit` calls from individual API routes
- Keep auth checks in routes as defense-in-depth (they become redundant but harmless)
- Delete or simplify `src/lib/rate-limit.ts` — the token bucket logic moves into a middleware-specific module

**Files:** `src/middleware.ts` → `src/proxy.ts`, `src/lib/rate-limit.ts`, all API routes

### 2.2 — Replace Logger with Pino

**Finding:** SRE-IMP-3, DOC-IMP-1 — Logger is a console.log wrapper, not pino/winston as documented.

**Design:**
- Install `pino` (production dep) + `pino-pretty` (dev dep)
- Rewrite `src/lib/logger.ts`:
  - Export same interface: `logger.info/warn/error/child` — zero changes to call sites
  - Wrap pino instance with `level` from `LOG_LEVEL` env var (default: `'info'`)
  - Dev: use `pino-pretty` transport for human-readable output
  - Production: raw JSON to stdout (Docker log driver collects)
  - Adds automatically: `pid`, `hostname`, `timestamp` (ISO), proper log level filtering
- Replace `console.error` in `src/app/api/health/route.ts` with `logger.error`
- Add `LOG_LEVEL` to env docs (optional, defaults to `info`)

**Files:** `src/lib/logger.ts`, `src/app/api/health/route.ts`, `src/lib/env.ts`, docs

### 2.3 — Stryker Mutation Testing

**Design:**

Install:
```bash
npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

Create `stryker.config.mjs`:
```javascript
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.test.ts',
    '!src/lib/**/*.spec.ts',
  ],
  checkers: ['typescript'],
  reporters: ['clear-text', 'html'],
  thresholds: { high: 80, low: 60, break: 80 },
  tempDirName: '.stryker-tmp',
};
```

Add to Makefile:
```makefile
test-mutation:
	npx stryker run
```

Add to package.json scripts:
```json
"test:mutation": "stryker run"
```

**Scoping rationale:** Only `src/lib/**/*.ts` is mutated — this covers rules assembly, memory extraction/retrieval/queries, crypto, rate limiting, chat persistence, auth helpers, setup detection, env validation. API routes and React components are excluded (tested by integration/E2E, not mutation).

### 2.4 — Playwright Setup with MSW

**Design:**

Install:
```bash
npm i -D @playwright/test msw
npx playwright install chromium
```

Create `playwright.config.ts`:
```typescript
export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:3000' },
});
```

Create MSW handlers in `tests/e2e/mocks/handlers.ts`:
- Mock `/api/auth/session` — return a test session
- Mock `/api/chat` — return a streamed response
- Mock `/api/rules` — return sample rules
- Mock `/api/settings` — return settings with API key configured
- Mock `/api/memory` — return sample memories

Create foundational tests in `tests/e2e/`:
- `auth.spec.ts` — unauthenticated user redirected to `/login`
- `setup.spec.ts` — user without API key redirected to `/setup`, wizard completion redirects to `/chat`
- `chat.spec.ts` — send message, see response, tool call indicators
- `rules.spec.ts` — toggle rule, create rule, admin vs member view

Add to Makefile:
```makefile
test-e2e:
	npx playwright test
```

**Files:** `playwright.config.ts`, `tests/e2e/`, Makefile, package.json

---

## Section 3: Code Quality

### 3.1 — req.json() Error Handling

**Finding:** SE-IMP-5, SRE-IMP-5 — Several API routes call `req.json()` outside their try/catch blocks. Malformed bodies cause unhandled 500s.

**Fix:** In each API route, move `req.json()` inside the existing try/catch block. Catch `SyntaxError` specifically and return 400 "Invalid request body."

**Files:** `src/app/api/settings/route.ts`, `src/app/api/rules/route.ts`, `src/app/api/rules/[id]/route.ts`, `src/app/api/rules/toggle/route.ts`, `src/app/api/memory/route.ts`

### 3.2 — Memory Extraction Error Fix

**Finding:** SRE-IMP-7 — Inner `catch {}` in `extractAndSaveMemories` swallows all errors, preventing the outer `.catch()` in the chat route from logging them.

**Fix:** Remove the inner `catch {}` block entirely (lines 60-62 of `extract.ts`). The chat route's `.catch((err) => log.error(...))` handles error logging.

**File:** `src/lib/memory/extract.ts:60-62`

### 3.3 — Input Length Validation

**Finding:** SEC-IMP-2 — No maximum length validation on rule content, memory keys, or memory values.

**Fix:** Add server-side validation before DB writes:
- Rule content: max 2,000 characters
- Memory key: max 200 characters
- Memory value: max 2,000 characters
- Return 400 with clear message (e.g., "Rule content must be under 2,000 characters")

**Files:** `src/app/api/rules/route.ts`, `src/app/api/memory/route.ts`

### 3.4 — User-Scoped Memory Extraction

**Finding:** SE-CRIT-2 — Memory extraction always saves org-scoped. `userId` is accepted but never used.

**Design:**

Update the extraction schema to include scope classification:
```typescript
const factsSchema = z.object({
  facts: z.array(z.object({
    key: z.string().describe('A short snake_case key'),
    value: z.string().describe('The value of the fact'),
    scope: z.enum(['org', 'user']).describe(
      'org = about the church (names, times, policies). user = about this specific person (preferences, role, style)'
    ),
  })),
});
```

Update the extraction prompt:
```
Extract facts from this conversation.
- Org facts (scope: "org"): things about the church that any staff member would find useful
  (names, schedules, policies, team structure, event details)
- User facts (scope: "user"): things specific to THIS user's preferences or working style
  (communication preferences, role duties, personal workflows, how they like information presented)

Only extract clear, objective facts. Return an empty facts array if nothing useful is found.
```

Update the save loop:
```typescript
for (const fact of object.facts) {
  const factUserId = fact.scope === 'user' ? userId : undefined;
  await upsertMemory(orgId, fact.key, fact.value, MemorySource.auto, factUserId);
}
```

Update memory caps:
- `enforceMemoryCap(orgId)` → scope to org-only: `where: { orgId, userId: null, source: 'auto' }`, cap at 200
- Add `enforceUserMemoryCap(orgId, userId)` → `where: { orgId, userId, source: 'auto' }`, cap at 100
- Call both after extraction

Rename `_userId` parameter to `userId` in the function signature.

**Files:** `src/lib/memory/extract.ts`, `src/lib/memory/queries.ts`

---

## Section 4: UX Fixes

### 4.1 — Mobile Nav Sign-Out

Add sign-out form/button in mobile drawer footer, matching desktop sidebar pattern.

**File:** `src/components/mobile-nav.tsx`

### 4.2 — Mobile Nav Editor Role

Fix ternary at line 28: `userRole === 'admin' ? 'Admin' : userRole === 'editor' ? 'Editor' : 'Member'`

**File:** `src/components/mobile-nav.tsx:28`

### 4.3 — Loading States for Rules/Memory

Add loading skeleton shown while initial fetch is in-flight. Use a `null` initial state to distinguish "loading" from "empty array."

**Files:** `src/components/rules/rule-list.tsx`, `src/components/memory/memory-list.tsx`

### 4.4 — Chat Error Message Mapping

Map common provider errors to friendly messages in `chat-interface.tsx`:
- 401/invalid key → "Your API key appears to be invalid. Check your key in Settings."
- 429 from provider → "The AI service is busy — try again in a moment."
- Network/fetch error → "Couldn't reach the AI service. Check your connection."
- Fallback → "Something went wrong. Please try again."

**File:** `src/components/chat/chat-interface.tsx`

### 4.5 — confirm() → shadcn AlertDialog

Replace all three `window.confirm()` calls with shadcn `AlertDialog`:
- Conversation delete in `conversation-item.tsx`
- Rule delete in `rule-list.tsx`
- Memory delete in `memory-list.tsx`

Create a reusable `ConfirmDialog` component wrapping `AlertDialog` to avoid duplication.

**Files:** `src/components/ui/confirm-dialog.tsx` (new), `src/components/conversation-item.tsx`, `src/components/rules/rule-list.tsx`, `src/components/memory/memory-list.tsx`

---

## Section 5: Documentation

Single pass updating all docs to match reality after code changes.

**CLAUDE.md:**
- Logger description → "Structured JSON logger (pino)"
- Add `mcp-pool.ts` to project structure with description
- Add `make install`, `make test-mutation`, `make test-e2e`, `make docker-down`, `make docker-logs` to commands
- Memory description → "org-level and user-level key-value facts"
- Quality gates → Stryker and Playwright configured
- Note `middleware.ts` renamed to `proxy.ts`

**AGENTS.md:**
- Rules pseudocode: own rules `return override !== false`
- Rules table: own rules "Can opt out? Yes"
- System rules: "Can opt out? Admins only"
- Remove `provider-select.tsx` → replace with `api-key-form.tsx` and `setup-wizard.tsx`
- Rate limit description → middleware-based, `route:userId` key
- Provider routing → mention MCP pool layer
- Memory injection order → memory before rules (matches actual code)
- Env var table → `PCO_MCP_URL` has default fallback, add `LOG_LEVEL` (optional)

**README.md:**
- Add `make test-mutation`, `make test-e2e` to commands table
- Add note near Docker seed step about TypeScript compilation

**TEAM.md:**
- Quality gates → Stryker and Playwright now configured with targets

**Feature summaries:**
- `docs/features/memory-system/SUMMARY.md` → remove "no memory TTL" (resolved), add user-scoped extraction
- `docs/features/ai-provider-mcp-chat/SUMMARY.md` → remove "no token tracking" and "no rate limiting" (resolved)
- `docs/features/scaffolding-auth-db/SUMMARY.md` → update "first-user-is-admin" to "PCO role mapping implemented"

**KNOWN_ISSUES.md:**
- Add: "Playwright E2E tests use mocked backends via MSW — not full integration tests against real DB/OAuth"
- Remove any items resolved by this remediation

---

## Section 6: Minor Polish

### 6.1 — Setup Wizard Progress Dots
Show 4 dots instead of 3 to represent all steps including the success state.

**File:** `src/components/setup/setup-wizard.tsx`

### 6.2 — Mobile Nav Backdrop Transition
Add `transition-opacity duration-200` to the `bg-black/50` overlay for fade-in/out.

**File:** `src/components/mobile-nav.tsx`

### 6.3 — Conversation Delete on Touch
Replace `hidden group-hover:block` with always-visible compact icon button (small trash icon, low visual weight). Works on both hover and touch.

**File:** `src/components/conversation-item.tsx`

### 6.4 — Memory Value Expand
Add click-to-expand on truncated memory values. Clicking a truncated row expands to show the full value. Click again to collapse.

**File:** `src/components/memory/memory-list.tsx`

### 6.5 — Native Selects → shadcn Select
Replace `<select>` elements with shadcn `Select` component for visual consistency.

**Files:** `src/components/settings/api-key-form.tsx`, `src/components/rules/rule-editor.tsx`

### 6.6 — MemoryTable Extraction
Extract the `MemoryTable` component from inside `MemoryList`'s render to a standalone component or memoize it.

**File:** `src/components/memory/memory-list.tsx`

### 6.7 — Thinking Indicator Animation
Add animated dots or pulse to the "Thinking..." indicator while waiting for the first token.

**File:** `src/components/chat/chat-interface.tsx`

### 6.8 — Example Prompt Caveat
Add subtle note under example prompts: "Available actions depend on your Planning Center modules."

**File:** `src/components/chat/chat-interface.tsx`

---

## Implementation Order

Recommended execution sequence (dependencies flow top-down):

1. **Infrastructure first** — pino logger (2.2), then proxy.ts migration (2.1) since later work depends on both
2. **Critical fixes** — 1.1 through 1.7 (independent, can be parallelized)
3. **Code quality** — 3.1 through 3.4 (3.4 depends on 3.2)
4. **Testing infrastructure** — Stryker (2.3), then Playwright (2.4)
5. **UX fixes** — 4.1 through 4.5 (independent, can be parallelized)
6. **Minor polish** — 6.1 through 6.8 (independent, can be parallelized)
7. **Documentation** — Section 5 last (captures final state of everything)

---

## Success Criteria

- All 33 items implemented and verified
- `make test` passes with existing coverage maintained
- `make test-mutation` passes with 80%+ mutation score on `src/lib/`
- `make test-e2e` passes with mocked backends
- `make lint` passes with 0 errors
- All 5 audit categories improve to at minimum "ADEQUATE" rating
- Documentation matches actual code behavior
