# pco-agent — Claude Code Context

## What This Is
A web-based AI agent for church staff to interact with Planning Center Online through natural language. Built with Next.js, Vercel AI SDK v6, and connected to the pco-mcp server for PCO data access.

## Key Architecture Decisions
- **Multi-provider**: Supports Anthropic, OpenAI, and Google via Vercel AI SDK v6. Users bring their own API key.
- **MCP integration**: Connects to pco-mcp (separate service at ~/projects/pco-mcp) as an MCP client. pco-mcp handles all PCO API communication.
- **Auth**: PCO OAuth via NextAuth. PCO is source of truth for user identity and roles. Roles synced on every login.
- **Database**: PostgreSQL shared with pco-mcp, using separate `agent` schema. ORM: Prisma.
- **Rules system**: Three layers — system defaults (shipped by us), org rules (admin-created), user rules (personal). Per-user toggle overrides via `user_rule_settings` table.
- **Memory**: Conversation history in Postgres + org-level and user-level key-value facts auto-extracted after each response.
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
        page.tsx      # New conversation page
        [id]/
          page.tsx    # Conversation resume page
      settings/
        page.tsx      # API key + provider settings
      rules/
        page.tsx      # Rules management page
      memory/
        page.tsx      # Memory management page (admin view/add/delete org facts)
      setup/
        page.tsx      # First-time setup wizard page (redirected from /chat if no API key)
    api/
      auth/
        [...nextauth]/
          route.ts    # NextAuth API handler
      chat/
        route.ts      # Streaming chat endpoint (with maxDuration)
      conversations/
        [id]/
          route.ts    # Conversation rename (PATCH) + delete (DELETE, owner-only)
      files/
        route.ts        # File upload (POST — multipart/form-data)
        [id]/
          route.ts      # File download (GET) + delete (DELETE, owner-only)
      health/
        route.ts      # Health check endpoint (GET — returns app + DB status)
      settings/
        route.ts      # Settings API
        test/
          route.ts    # Test connection endpoint (POST — validates API key live)
      rules/
        route.ts      # Rules list + create
        [id]/
          route.ts    # Rule edit + delete (with orgId ownership check)
        toggle/
          route.ts    # Per-user rule toggle
      memory/
        route.ts      # Memory list (GET) + create (POST, admin only)
        [id]/
          route.ts    # Memory update (PATCH) + delete (DELETE, admin only)
  components/
    sidebar.tsx           # Sidebar with nav, user info, sign out
    mobile-nav.tsx        # Mobile hamburger drawer for small screens
    conversation-item.tsx # Sidebar conversation list item with inline rename + delete confirm
    ui/               # shadcn/ui components
    chat/
      chat-interface.tsx  # useChat() client component with auto-resize textarea + example prompts
      message-bubble.tsx  # Message display with tool call support
      file-chip.tsx     # Pre-send file preview chip with progress + remove
      file-card.tsx     # In-chat file display (upload + download cards)
    settings/
      api-key-form.tsx    # API key entry form with test connection button
    rules/
      rule-list.tsx   # Grouped rule list with toggle switches and inline edit
      rule-editor.tsx # Inline form for creating new rules (with error display)
    memory/
      memory-list.tsx # Org + user memory list with add form and delete (admin-gated)
    setup/
      setup-wizard.tsx  # 5-step wizard: welcome, provider pick, model selection, API key entry, success
  lib/
    auth.ts           # NextAuth config + PCO OAuth provider (with token refresh)
    crypto.ts         # Fernet encryption for API keys
    db.ts             # Prisma client singleton
    env.ts            # Environment variable validation
    logger.ts         # Structured JSON logger (pino)
    mcp-pool.ts       # MCP client connection pool with TTL and LRU eviction
    utils.ts          # shadcn/ui utility (cn function)
    ai/
      providers.ts    # Runtime AI provider factory
      models.ts       # Model options metadata
    chat/
      persist.ts      # Conversation/message CRUD
    rules/
      assemble.ts     # assembleRules() — builds effective rule list per user
      queries.ts      # Rules CRUD + toggle helpers
    memory/
      queries.ts      # Memory CRUD — getOrgMemories, getUserMemories, getAllMemoriesForUser, upsertMemory
      extract.ts      # extractAndSaveMemories() — fire-and-forget post-response fact extraction
      retrieve.ts     # getMemoryPrompt() — returns formatted org+user memory string for system prompt
    setup.ts          # needsSetup(userId) — returns true if user has no API key configured
    rate-limit.ts     # In-memory token bucket rate limiter
    request-context.ts # Request ID from headers
    files/
      types.ts          # File types, constants, limits
      validate.ts       # Extension, size, magic-byte validation
      store.ts          # FileStore interface + LocalFileStore
      parse.ts          # CSV/XLSX parsing to text for model context
      sanitize.ts       # Formula injection sanitization
      persist.ts        # File DB CRUD + deleteConversationWithFiles()
  proxy.ts          # Centralized auth + rate limiting + CSP nonce + security headers (Node.js runtime)
  instrumentation.ts  # Next.js instrumentation hook — registers logger at server startup
prisma/
  schema.prisma       # Agent schema (8 models)
  seed.ts             # System default rules seeder
entrypoint.sh        # Docker entrypoint — runs migrations before server start
```

## Known Issues & Deferrals
See [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) for the full list of accepted limitations and deferred work. Check this file before flagging issues in reviews — if it's listed there, it's known and tracked.

## Session Startup Checklist
1. Read `DEV_QUEUE.md` — understand current project state and what's in progress
2. Read this file — architecture and patterns
3. Read [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) — known limitations and accepted deferrals
4. Read `TEAM.md` — team structure, quality gates, review protocol
5. Read the latest feature `SUMMARY.md` if continuing work on a feature
6. Check `AGENTS.md` if you need development patterns or common task guides

## Related Projects
- **pco-mcp** (~/projects/pco-mcp): The MCP server this agent connects to. Python, FastMCP, FastAPI. 25 tools for People + Services modules.

## Commands
- `make install` — Install dependencies
- `make dev` — Start development server
- `make build` — Production build
- `make test` — Run tests
- `make test-mutation` — Run Stryker mutation testing
- `make test-e2e` — Run Playwright E2E tests
- `make lint` — Lint + type check
- `make db-push` — Push Prisma schema to DB
- `make db-migrate` — Create + apply migration
- `make docker-build` — Build Docker image
- `make docker-up` — Start via Docker Compose
- `make docker-down` — Stop Docker Compose
- `make docker-logs` — Tail container logs
- `make seed` — Seed system default rules (local)
- `make db-deploy` — Apply pending migrations (production)
- `make docker-db-push` — Push schema via container (DB on homelab-net)
- `make docker-db-deploy` — Apply migrations via container
- `make docker-seed` — Seed rules via container

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
5. Fix all Critical and Important findings, re-review if needed
6. **Memoize deferrals:** Any review finding or known issue that is intentionally deferred MUST be added to `docs/KNOWN_ISSUES.md` with Status, Impact, and Fix fields. This prevents knowledge loss across sessions. Never silently skip an issue — either fix it or write it down.
7. Architect final approval
8. Update feature SUMMARY.md + DEV_QUEUE.md
9. Move task to Done

## Important Patterns
- API keys are Fernet-encrypted before DB storage, decrypted only server-side when making AI calls
- Rules are plain English text assembled into the system prompt — not executable code
- PCO OAuth token obtained during pco-agent login is used to authenticate MCP calls to pco-mcp
- Memory extraction runs as a cheap follow-up AI call (cheapest model) after each assistant response
- The `user_rule_settings` table handles per-user opt-in/opt-out without duplicating rules
