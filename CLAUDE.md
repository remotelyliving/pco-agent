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
- Next.js 16, TypeScript, React
- Vercel AI SDK v6 (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google, @ai-sdk/mcp)
- NextAuth.js with custom PCO OAuth provider
- Prisma + PostgreSQL
- Tailwind CSS + shadcn/ui
- Fernet encryption for API keys at rest

## Project Structure
```
src/
  app/
    page.tsx          # Root page — redirects to /chat or /login
    layout.tsx        # Root layout
    (auth)/
      login/
        page.tsx      # PCO OAuth sign-in page
    (app)/
      layout.tsx      # Authenticated layout with sidebar
      chat/
        page.tsx      # Skeleton chat page
    api/
      auth/
        [...nextauth]/
          route.ts    # NextAuth API handler
  components/
    sidebar.tsx       # Sidebar with nav, user info, sign out
    ui/               # shadcn/ui components
  lib/
    auth.ts           # NextAuth config + PCO OAuth provider
    crypto.ts         # Fernet encryption for API keys
    db.ts             # Prisma client singleton
    env.ts            # Environment variable validation
    utils.ts          # shadcn/ui utility (cn function)
  middleware.ts       # Route protection — redirects to /login if unauthenticated
prisma/
  schema.prisma       # Agent schema (7 models)
  seed.ts             # System default rules seeder
```

## Session Startup Checklist
1. Read `DEV_QUEUE.md` — understand current project state and what's in progress
2. Read this file — architecture and patterns
3. Read `TEAM.md` — team structure, quality gates, review protocol
4. Read the latest feature `SUMMARY.md` if continuing work on a feature
5. Check `AGENTS.md` if you need development patterns or common task guides

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

## Testing & Quality Gates
- Vitest for unit tests — **90% coverage required**
- Playwright for E2E tests
- Stryker for mutation testing — **80% score on business logic**
- ESLint + TypeScript strict — **0 errors**
- 5 reviewer subagents after each feature (see TEAM.md)

## Development Workflow
1. Pick task from DEV_QUEUE.md (move to In Progress)
2. Implement with TDD
3. Self-review, commit
4. Dispatch 5 review subagents in parallel (Sr. Engineer, SRE, Security, UX/PM, Docs)
5. Fix findings, re-review if needed
6. Architect final approval
7. Update feature SUMMARY.md + DEV_QUEUE.md
8. Move task to Done

## Important Patterns
- API keys are Fernet-encrypted before DB storage, decrypted only server-side when making AI calls
- Rules are plain English text assembled into the system prompt — not executable code
- PCO OAuth token obtained during pco-agent login is used to authenticate MCP calls to pco-mcp
- Memory extraction runs as a cheap follow-up AI call (cheapest model) after each assistant response
- The `user_rule_settings` table handles per-user opt-in/opt-out without duplicating rules
