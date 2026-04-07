# pco-agent

AI-powered assistant for Planning Center Online. Chat with your church data using natural language.

## What It Does

pco-agent gives church staff a simple chat interface to interact with Planning Center Online — search for people, plan services, schedule volunteers, and manage song libraries — all through conversation.

- **Multi-provider AI**: Choose Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini). Bring your own API key — costs as low as $1/month.
- **Smart memory**: Remembers facts about your church across conversations.
- **Custom rules**: Define how the AI assistant behaves for your organization.
- **Team-ready**: Multiple users per church. Admins manage org-level settings. Roles sync automatically from Planning Center.

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- PostgreSQL (or use the Docker Compose setup)
- A [Planning Center developer account](https://api.planningcenteronline.com/oauth/applications) with an OAuth app configured

### Setup

```bash
git clone https://github.com/remotelyliving/pco-agent.git
cd pco-agent
cp .env.example .env    # Fill in your values
make install            # Install dependencies
make db-push            # Create database tables
make seed               # Load default rules
make dev                # Start dev server at http://localhost:3000
```

### Environment Variables

See `.env.example` for all required variables and descriptions.

## Docker (Homelab / Production)

```bash
cp .env.example .env    # Fill in your values
make docker-build
make docker-up          # Starts pco-agent on port 3000
```

If running alongside pco-mcp, both services share the same PostgreSQL instance (pco-agent uses the `agent` schema).

## Architecture

```
Browser → Next.js App → AI Provider API (your key)
                              ↓ MCP
                         pco-mcp server → Planning Center API
```

- **Next.js 15** + TypeScript
- **Vercel AI SDK v6** for multi-provider AI + MCP
- **NextAuth.js** with Planning Center OAuth
- **Prisma** + PostgreSQL
- **Tailwind CSS** + shadcn/ui

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development server |
| `make build` | Production build |
| `make test` | Run all tests |
| `make lint` | Lint + type check |
| `make db-push` | Push schema to database |
| `make db-migrate` | Create + apply Prisma migration |
| `make seed` | Seed system default rules |
| `make docker-build` | Build Docker image |
| `make docker-up` | Start via Docker Compose |
| `make docker-down` | Stop Docker Compose |

## How It Works

### For church staff (users)

1. Click "Sign in with Planning Center"
2. Set up your AI provider (paste an API key — we walk you through it)
3. Start chatting: "Who's available to serve this Sunday?" / "Add Amazing Grace to the July 13 service"

### For church admins

Everything above, plus:
- Define organization-level rules ("Always check blockout dates before scheduling")
- View and manage the AI's memory about your church
- See team members and their roles

## Related

- [pco-mcp](https://github.com/remotelyliving/pco-mcp) — The MCP server that connects to Planning Center's API. pco-agent uses this under the hood.

## License

Private. Not yet open source.
