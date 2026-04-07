# pco-agent — Claude Code Context

## What This Is
A web-based AI agent for church staff to interact with Planning Center Online through natural language. Built with Next.js, Vercel AI SDK v6, and connected to the pco-mcp server for PCO data access.

## Key Architecture Decisions
- **Multi-provider**: Supports Anthropic, OpenAI, and Google via Vercel AI SDK v6. Users bring their own API key.
- **MCP integration**: Connects to pco-mcp (separate service at ~/projects/pco-mcp) as an MCP client. pco-mcp handles all PCO API communication.
- **Auth**: PCO OAuth via NextAuth. PCO is source of truth for user identity and roles. Roles synced on every login.
- **Database**: PostgreSQL shared with pco-mcp, using separate `agent` schema. ORM: Prisma.
- **Rules system**: Three layers — system defaults (shipped by us), org rules (admin-created), user rules (personal). Per-user toggle overrides via `user_rule_settings` table.
- **Memory**: Conversation history in Postgres + org-level key-value facts auto-extracted after each response.
- **Deployment**: Docker on homelab (Cloudflare tunnel), Vercel-ready.

## Tech Stack
- Next.js 15, TypeScript, React
- Vercel AI SDK v6 (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, @ai-sdk/mcp)
- NextAuth.js with custom PCO OAuth provider
- Prisma + PostgreSQL
- Tailwind CSS + shadcn/ui
- Fernet encryption for API keys at rest

## Project Structure
```
src/
  app/              # Next.js App Router pages
    (auth)/         # Login, setup wizard
    (app)/          # Chat, settings (authenticated)
    api/            # API routes (chat, auth, rules, memory)
  components/       # React components
  lib/              # Server-side utilities
    ai/             # AI provider routing, MCP config
    auth/           # NextAuth config, PCO OAuth provider
    db/             # Prisma client, queries
    rules/          # Rule assembly logic
    memory/         # Memory extraction + retrieval
    crypto/         # Fernet encryption for API keys
  prisma/           # Prisma schema + migrations
```

## Related Projects
- **pco-mcp** (~/projects/pco-mcp): The MCP server this agent connects to. Python, FastMCP, FastAPI. 25 tools for People + Services modules.

## Commands
- `make dev` — Start development server
- `make build` — Production build
- `make test` — Run tests
- `make lint` — Lint + type check
- `make db-push` — Push Prisma schema to DB
- `make db-migrate` — Create + apply migration
- `make docker-build` — Build Docker image
- `make docker-up` — Start via Docker Compose
- `make seed` — Seed system default rules

## Testing
- Vitest for unit tests
- Playwright for E2E tests
- Target: 90% coverage on server-side code

## Important Patterns
- API keys are Fernet-encrypted before DB storage, decrypted only server-side when making AI calls
- Rules are plain English text assembled into the system prompt — not executable code
- PCO OAuth token obtained during pco-agent login is used to authenticate MCP calls to pco-mcp
- Memory extraction runs as a cheap follow-up AI call (cheapest model) after each assistant response
- The `user_rule_settings` table handles per-user opt-in/opt-out without duplicating rules
