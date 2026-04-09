# pco-agent — Agent Development Guide

This file provides context for AI agents (Claude Code subagents, CI agents, etc.) working on this codebase.

## Project Overview

pco-agent is a Next.js web app that provides a turnkey AI chat interface for church staff to interact with Planning Center Online. It connects to the pco-mcp MCP server for data access and supports multiple AI providers (Anthropic, OpenAI, Google) via BYO API key.

## Architecture at a Glance

```
Browser → Next.js App → Vercel AI SDK → [Anthropic|OpenAI|Google] API
                                              ↓ (MCP connector)
                                         pco-mcp server (separate service)
                                              ↓
                                    Planning Center Online API
```

## Key Design Decisions (DO NOT CHANGE without discussion)

1. **Vercel AI SDK v6** is the AI abstraction layer. Do not add LangChain, LlamaIndex, or other agent frameworks.
2. **Prisma** is the ORM. Do not use raw SQL or another ORM.
3. **`agent` schema** in PostgreSQL. All tables are prefixed with `agent.` schema. Do not create tables in the public schema.
4. **PCO is source of truth for roles.** Do not add role management UI. Roles sync from PCO on login. Three roles: `admin`, `editor` (can manage rules via `canManageRules()` helper, not org memory), `member`.
5. **Rules are plain text.** They are injected into system prompts. They do not execute code, call APIs, or have logic beyond what the AI interprets.
6. **API keys are Fernet-encrypted.** Use `src/lib/crypto.ts` for all encrypt/decrypt. Never log or return decrypted keys.
7. **pco-mcp is a separate service.** Do not import pco-mcp code. Connect via MCP protocol only.

## File Organization

```
src/app/              → Pages (App Router)
src/components/       → React components (shadcn/ui based)
src/lib/              → Server-side business logic (flat files)
src/lib/auth.ts       → NextAuth config, PCO OAuth provider (with token refresh)
src/lib/crypto.ts     → Fernet encryption for API keys
src/lib/db.ts         → Prisma client singleton
src/lib/env.ts        → Environment variable validation (lazy, fail-fast)
src/lib/logger.ts     → Structured logger — use instead of console.log in server code
src/lib/ai/           → AI provider factory and model metadata
src/lib/chat/         → Conversation and message persistence
src/proxy.ts          → Centralized auth + rate limiting + CSP nonce + security headers (Node.js runtime)
src/lib/rate-limit.ts → In-memory token bucket rate limiter (used by proxy.ts middleware)
src/instrumentation.ts → Next.js instrumentation hook — registers logger at startup
prisma/               → Schema + seed (at project root)
prisma/seed.ts        → System default rules seeder

Key API routes added in polish pass:
src/app/api/health/route.ts             → GET /api/health — app + DB liveness check
src/app/api/settings/test/route.ts      → POST /api/settings/test — validate API key live
src/app/api/conversations/[id]/route.ts → PATCH (rename) + DELETE /api/conversations/[id] — owner-only

Key components added in polish pass:
src/components/mobile-nav.tsx           → Hamburger drawer for mobile screens
src/components/conversation-item.tsx    → Sidebar conversation item with inline rename + delete confirm
```

## How Rules Work

Rules are assembled into the system prompt per-user per-chat via `assembleRules(userId, orgId)` in `src/lib/rules/assemble.ts`.

**Rule types and default behavior:**

| ruleType | Default | Can opt out? | Can opt in? |
|----------|---------|-------------|-------------|
| `system` | ON | Admins only | N/A |
| `org` | ON | Yes | N/A |
| `user` (own) | ON | Yes | N/A |
| `user` (other user's, `visibility='org'`) | OFF | N/A | Yes |

**Assembly logic (pseudocode):**
```
effective_rules = allRules.filter(rule =>
  if rule.ruleType in ['system', 'org']:
    userRuleSettings[rule.id] !== false   // on unless explicitly opted out (system: admin-only toggle enforced at API layer in rules/toggle/route.ts)
  elif rule.createdById === userId:
    return userRuleSettings[rule.id] !== false  // user's own rules on unless opted out
  elif rule.ruleType === 'user' and rule.visibility === 'org':
    userRuleSettings[rule.id] === true    // off unless explicitly opted in
)
```

**Key files:**
- `src/lib/rules/assemble.ts` — `assembleRules(userId, orgId, options?)`. Pass `{ formatAsPrompt: true }` to get a numbered string for direct system prompt injection.
- `src/lib/rules/queries.ts` — `listRulesForOrg`, `createRule`, `updateRule`, `deleteRule`, `toggleRule`, `getUserRuleSettings`
- `prisma/schema.prisma` — `Rule` model + `UserRuleSetting` model (unique on `[userId, ruleId]`)

**Access control:**
- System rules: read-only everywhere. Only changeable via `prisma/seed.ts`.
- Org rules: admin can create/edit/delete. Members can only toggle.
- User rules: owner can create/edit/delete. Others can toggle if `visibility='org'`.

## How Memory Works

**Dual scoping:** The `agent.memory` table has an optional `userId` column.
- `userId = null` → org-level fact, shared across all users in the org
- `userId` set → user-level fact, visible only to that user

**Auto-extraction (fire-and-forget):**
1. After each assistant response, the chat route calls `extractAndSaveMemories()` without `await`
2. Extraction uses the cheapest available model for the user's configured provider (`claude-haiku-4-5`, `gpt-4o-mini`, or `gemini-2.0-flash`)
3. The model returns structured facts in two scopes: org facts (`userId=null`, shared across all users) and user facts (`userId` set, personal to that user)
4. Each fact is upserted via `@@unique([orgId, userId, key])` — same key updates in place
5. Separate caps are enforced: 200 org-level facts and 100 per-user facts. When a cap is exceeded, the oldest auto-extracted facts are evicted.
6. Failures are silently caught and never surface to the user

**Memory prompt injection:**
1. `getMemoryPrompt(orgId, userId)` fetches both org memories (`userId=null`) and personal memories for that user
2. Returns two labeled sections: `## Known facts about this church` and `## Your personal notes`
3. Returns an empty string if no memories exist (no prompt pollution)
4. Injected after the rules block in every conversation's system prompt

**Admin memory management:**
- Admins can view, add, and delete org-level facts at `/memory`
- `source` field distinguishes `"auto"` (extracted) from `"manual"` (admin-created), displayed as a badge
- Members can view org memories but cannot add or delete

**Key files:**
- `src/lib/memory/queries.ts` — `getOrgMemories`, `getUserMemories`, `getAllMemoriesForUser`, `upsertMemory`, `updateMemory`, `deleteMemory`
- `src/lib/memory/extract.ts` — `extractAndSaveMemories(orgId, userId, userMsg, assistantMsg, provider, apiKey)`
- `src/lib/memory/retrieve.ts` — `getMemoryPrompt(orgId, userId)`
- `src/app/api/memory/route.ts` — `GET` (list), `POST` (admin create)
- `src/app/api/memory/[id]/route.ts` — `PATCH` (admin update), `DELETE` (admin delete)

## How Auth Works

1. PCO OAuth flow via NextAuth
2. On callback: call PCO `/people/v2/me` for identity
3. Roles are derived from PCO permissions on every login: `site_administrator` → admin, `people_permissions: Manager` → admin, `Editor` → editor, `Viewer` or null → member. The `editor` role can manage rules but not org memory.
4. Roles synced on every login (PCO is source of truth)
5. First user from an org → org auto-created (wrapped in `$transaction` to prevent race conditions)
6. PCO access token is refreshed automatically in the NextAuth `jwt` callback when it expires

## How Setup Detection Works

New users who have not configured an AI provider are redirected to `/setup` automatically.

1. `/chat` page calls `needsSetup(userId)` from `src/lib/setup.ts`
2. `needsSetup` checks whether `User.apiProvider` and `User.apiKeyEnc` are both set
3. If either is missing, the user is redirected to `/setup`
4. `/setup` renders the `SetupWizard` component (`src/components/setup/setup-wizard.tsx`)
5. Wizard guides user through: welcome → provider selection → API key entry → success
6. On save, the wizard calls `POST /api/settings` (same endpoint as the settings page)
7. After success, the wizard redirects to `/chat`

**Key files:**
- `src/lib/setup.ts` — `needsSetup(userId): Promise<boolean>`
- `src/components/setup/setup-wizard.tsx` — client component, 5-step wizard (welcome, provider, model, API key, success)
- `src/app/(app)/setup/page.tsx` — page container

## How AI Provider Routing Works

1. User saves api_provider + API key via Settings page (/settings) or Setup wizard (/setup)
2. Key is Fernet-encrypted, stored in User.apiKeyEnc
3. On chat request: decrypt key, create provider via createModel() in src/lib/ai/providers.ts
4. Connect to pco-mcp via MCP pool (src/lib/mcp-pool.ts) with user's PCO access token from JWT
5. Stream response via streamText() in src/app/api/chat/route.ts
6. Persist conversation and messages via src/lib/chat/persist.ts

## Testing Patterns

- **Unit tests** (Vitest): test `lib/` functions in isolation with mocked DB/AI
- **Component tests** (Vitest + Testing Library): test React components
- **E2E tests** (Playwright): test full flows (login, chat, settings)
- **API route tests** (Vitest): test Next.js API routes with mocked providers

## Common Tasks for Agents

### Adding a new page
1. Create route in `src/app/(app)/pagename/page.tsx`
2. Add to navigation if needed in `src/components/sidebar.tsx`
3. Add E2E test in `tests/e2e/pagename.spec.ts`

### Adding a new rule category
1. Add the category `<option>` to the select in `src/components/rules/rule-editor.tsx`
2. Add seed rules with the new category in `prisma/seed.ts`
3. Update any category display logic in `src/components/rules/rule-list.tsx` if needed

### Adding a new AI provider
1. Install the AI SDK provider package: `@ai-sdk/providername`
2. Add to the provider map in `src/lib/ai/providers.ts`
3. Add model options in `src/lib/ai/models.ts`
4. Add to the provider selection UI in `src/components/settings/api-key-form.tsx` and `src/components/setup/setup-wizard.tsx`

### Modifying the database schema
1. Edit `prisma/schema.prisma`
2. Run `make db-migrate` to create a migration
3. Run `make db-push` to apply in development
4. Update any affected query helpers in `src/lib/`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| PCO_CLIENT_ID | Yes | Planning Center OAuth app client ID |
| PCO_CLIENT_SECRET | Yes | Planning Center OAuth app client secret |
| NEXTAUTH_SECRET | Yes | NextAuth session encryption key |
| NEXTAUTH_URL | Yes | Public URL of pco-agent (e.g., https://agent.pco-mcp.com) |
| PCO_MCP_URL | Yes (default: pco-mcp.com/mcp) | URL of the pco-mcp MCP server |
| ENCRYPTION_KEY | Yes | Fernet key for API key encryption at rest |
| LOG_LEVEL | No | Log level for pino (default: info) |
