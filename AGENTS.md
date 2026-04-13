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
2. Extraction uses the cheapest available model for the user's configured provider (`claude-haiku-4-5`, `gpt-4.1-nano`, or `gemini-2.5-flash-lite`)
3. All auto-extracted facts are **user-scoped only** (personal to the user who sent the message). Org-wide memories require manual admin creation. This prevents prompt injection from polluting shared org memory.
4. User and assistant messages are wrapped in XML tags (`<user_message>`, `<assistant_message>`) to mitigate prompt injection
5. Each fact is upserted via `@@unique([orgId, userId, key])` — same key updates in place
6. Cap enforcement: 100 per-user auto-extracted facts (oldest evicted). Only runs when facts were actually extracted.
7. Failures are silently caught and never surface to the user

**Memory prompt injection:**
1. `getMemoryPrompt(orgId, userId, userMessage?)` fetches both org memories (`userId=null`) and personal memories for that user
2. When `userMessage` is provided, memories are scored by keyword relevance (tokenize user message, match against memory key+value). Manual memories get a priority boost.
3. A **token budget of 16K characters (~4K tokens)** caps the memory section. Memories are added in relevance order until the budget is reached.
4. Returns two labeled sections: `## Known facts about this church` and `## Your personal notes`
5. Returns an empty string if no memories exist (no prompt pollution)
6. Injected after the rules block in every conversation's system prompt

**Admin memory management:**
- Admins can view, add, and delete org-level facts at `/memory`
- `source` field distinguishes `"auto"` (extracted) from `"manual"` (admin-created), displayed as a badge
- Members can view org memories but cannot add or delete

**Key files:**
- `src/lib/memory/queries.ts` — `getOrgMemories`, `getUserMemories`, `getAllMemoriesForUser`, `upsertMemory`, `updateMemory`, `deleteMemory`
- `src/lib/memory/extract.ts` — `extractAndSaveMemories(orgId, userId, userMsg, assistantMsg, provider, apiKey)` — user-scoped only
- `src/lib/memory/retrieve.ts` — `getMemoryPrompt(orgId, userId, userMessage?)` — token-budgeted, relevance-scored
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
5. Wizard guides user through: welcome → provider selection → model selection → API key entry → success
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

## How File Upload Works

Two categories of files with different processing paths:

**Data files** (CSV, TSV, XLS, XLSX):
1. User attaches file → client validates extension + size (10 MB max)
2. `POST /api/files` → server validates magic bytes + stores on disk + DB record
3. In chat route, data files are parsed to text via `parseFileToText()` and injected as text parts
4. The model sees a pipe-delimited text representation (capped at 500 rows)

**Image files** (PNG, JPEG, WebP):
1. User attaches image → client validates extension + size (5 MB max — Anthropic limit)
2. `POST /api/files` → server validates magic bytes (PNG 8-byte signature, JPEG SOI, WebP RIFF+WEBP) + stores on disk + DB record
3. In chat route, images are base64-encoded into data URLs and sent as `FileUIPart` (native vision support across all providers)
4. Images from older messages (beyond last 4 user messages) are replaced with `[Image: filename]` placeholders to bound memory
5. `MessageBubble` renders images as `<img>` tags with thumbnails

**Security:**
- MIME types derived from server-side extension lookup, never from user-supplied Content-Type
- Magic byte validation prevents spoofed extensions
- File resolution in chat route checks both `orgId` AND `userId` ownership
- GIF and SVG are explicitly excluded (animation/script attack surface)

**Limits:**
- 3 files per message, 10 MB per data file, 5 MB per image
- 500 MB per-user storage quota (enforced at upload time)
- Upload rate: 20 requests/minute

**Key files:**
- `src/lib/files/types.ts` — extensions, MIME maps, size constants
- `src/lib/files/validate.ts` — extension + magic byte validation
- `src/lib/files/parse.ts` — CSV/Excel to text conversion
- `src/lib/files/persist.ts` — DB CRUD + storage quota check
- `src/lib/files/store.ts` — local file storage interface
- `src/app/api/files/route.ts` — upload endpoint
- `src/app/api/chat/route.ts` — file processing in `processedMessages` block (~line 210)

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
| NEXTAUTH_URL | Production only | Public URL of pco-agent (e.g., https://agent.pco-mcp.com). NextAuth infers in dev. |
| PCO_MCP_URL | No | URL of the pco-mcp MCP server (default: https://pco-mcp.com/mcp) |
| ENCRYPTION_KEY | Yes | Fernet key for API key encryption at rest |
| LOG_LEVEL | No | Log level for pino (default: info) |
| FILE_STORE | No | File storage backend (default: "local") |
| UPLOAD_DIR | No | Directory for file uploads (default: "./uploads", set to /data/uploads in Docker) |
| MAX_UPLOAD_SIZE_MB | No | Max upload size in MB (default: 10) |
