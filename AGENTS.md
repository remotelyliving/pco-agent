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
src/lib/env.ts        → Environment variable validation
prisma/               → Schema + seed (at project root)
prisma/seed.ts        → System default rules seeder
```

## How Rules Work

Rules are assembled into the system prompt per-user per-chat:

```
effective_rules = (
    system defaults WHERE user has NOT opted out
    + org rules (visibility='org') WHERE user has NOT opted out
    + public rules from other users WHERE user has opted IN
    + user's own enabled rules
)
```

Resolved via `src/lib/rules/assembleRules.ts`. The `user_rule_settings` table stores per-user overrides (opt-in/opt-out).

## How Memory Works

1. After each assistant response, a cheap follow-up call extracts key-value facts
2. Facts stored in `agent.memory` (org-level, shared across all users in the org)
3. Facts included at the top of every conversation's system prompt
4. Extraction logic in `src/lib/memory/extract.ts`, retrieval in `src/lib/memory/retrieve.ts`

## How Auth Works

1. PCO OAuth flow via NextAuth
2. On callback: call PCO `/people/v2/me` for identity + `/people/v2/people/{id}` for permissions
3. PCO Administrator or Editor → `role = 'admin'` in pco-agent
4. Roles synced on every login (PCO is source of truth)
5. First user from an org → org auto-created

## How AI Provider Routing Works

1. User's `api_provider` and encrypted `api_key_enc` stored in DB
2. On chat request: decrypt key, create provider instance via AI SDK
3. Attach MCP connector pointing to pco-mcp server URL
4. Stream response back to client via AI SDK's `streamText()`

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
1. Add the category string to the `category` check in `src/lib/rules/assembleRules.ts`
2. Add seed rules in `prisma/seed.ts`
3. Update the category filter dropdown in `src/components/rules/rule-list.tsx`

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
