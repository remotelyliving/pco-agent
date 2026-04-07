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
4. **PCO is source of truth for roles.** Do not add role management UI. Roles sync from PCO on login.
5. **Rules are plain text.** They are injected into system prompts. They do not execute code, call APIs, or have logic beyond what the AI interprets.
6. **API keys are Fernet-encrypted.** Use `src/lib/crypto.ts` for all encrypt/decrypt. Never log or return decrypted keys.
7. **pco-mcp is a separate service.** Do not import pco-mcp code. Connect via MCP protocol only.

## File Organization

```
src/app/              → Pages (App Router)
src/components/       → React components (shadcn/ui based)
src/lib/              → Server-side business logic (flat files)
src/lib/auth.ts       → NextAuth config, PCO OAuth provider
src/lib/crypto.ts     → Fernet encryption for API keys
src/lib/db.ts         → Prisma client singleton
src/lib/env.ts        → Environment variable validation (lazy, fail-fast)
src/lib/ai/           → AI provider factory and model metadata
src/lib/chat/         → Conversation and message persistence
src/middleware.ts     → Route protection middleware (NextAuth)
prisma/               → Schema + seed (at project root)
prisma/seed.ts        → System default rules seeder
```

## How Rules Work

Rules are assembled into the system prompt per-user per-chat via `assembleRules(userId, orgId)` in `src/lib/rules/assemble.ts`.

**Rule types and default behavior:**

| ruleType | Default | Can opt out? | Can opt in? |
|----------|---------|-------------|-------------|
| `system` | ON | Yes | N/A |
| `org` | ON | Yes | N/A |
| `user` (own) | ON | No | N/A |
| `user` (other user's, `visibility='org'`) | OFF | N/A | Yes |

**Assembly logic (pseudocode):**
```
effective_rules = allRules.filter(rule =>
  if rule.ruleType in ['system', 'org']:
    userRuleSettings[rule.id] !== false   // on unless explicitly opted out
  elif rule.createdById === userId:
    true                                  // user's own rules always active
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

1. After each assistant response, a cheap follow-up call extracts key-value facts
2. Facts stored in `agent.memory` (org-level, shared across all users in the org)
3. Facts included at the top of every conversation's system prompt
4. Extraction logic in `src/lib/memory/extract.ts`, retrieval in `src/lib/memory/retrieve.ts`

## How Auth Works

1. PCO OAuth flow via NextAuth
2. On callback: call PCO `/people/v2/me` for identity
3. First user in org gets `role = 'admin'`; all subsequent users get `role = 'member'`. PCO role-based mapping is planned but not yet implemented.
4. Roles synced on every login (PCO is source of truth)
5. First user from an org → org auto-created

> NOTE: The admin role assignment is a placeholder heuristic. A future task will implement proper PCO permissions checking.

## How AI Provider Routing Works

1. User saves api_provider + API key via Settings page (/settings)
2. Key is Fernet-encrypted, stored in User.apiKeyEnc
3. On chat request: decrypt key, create provider via createModel() in src/lib/ai/providers.ts
4. Connect to pco-mcp via @ai-sdk/mcp with user's PCO access token from JWT
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
4. Add to the provider selection UI in `src/components/settings/provider-select.tsx`

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
| PCO_MCP_URL | Yes | URL of the pco-mcp MCP server |
| ENCRYPTION_KEY | Yes | Fernet key for API key encryption at rest |
