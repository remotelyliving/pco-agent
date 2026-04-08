# pco-agent

AI-powered assistant for Planning Center Online. Chat with your church data using natural language.

## What It Does

pco-agent gives church staff a simple chat interface to interact with Planning Center Online — search for people, plan services, schedule volunteers, and manage song libraries — all through conversation.

- **Multi-provider AI**: Choose Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini). Bring your own API key.
- **Smart memory**: Remembers facts about your church across conversations.
- **Custom rules**: Define how the AI assistant behaves for your organization.
- **Team-ready**: Multiple users per church. Roles sync automatically from Planning Center (Administrator, Manager, Editor, Viewer).

## Architecture

```
Browser → Next.js App → AI Provider API (your key)
                              ↓ MCP
                         pco-mcp server → Planning Center API
```

- **Next.js 16** + TypeScript
- **Vercel AI SDK v6** for multi-provider AI + MCP
- **NextAuth.js** with Planning Center OAuth
- **Prisma** + PostgreSQL
- **Tailwind CSS** + shadcn/ui

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- PostgreSQL (or use the Docker Compose setup)
- A [Planning Center developer account](https://api.planningcenteronline.com/oauth/applications) with an OAuth app configured

### Setup

```bash
git clone https://github.com/remotelyliving/pco-agent.git
cd pco-agent
cp .env.example .env    # Fill in your values (see Environment Variables below)
make install            # Install dependencies
make db-push            # Create database tables (development only)
make seed               # Load default rules
make dev                # Start dev server at http://localhost:3000
```

## Deploying to Docker / Homelab

Step-by-step guide for first-time deployment on a Docker host.

### 1. Prerequisites

- Docker and Docker Compose installed
- A domain name (optional — needed for HTTPS via Cloudflare Tunnel)
- Git

### 2. Create a Planning Center OAuth App

1. Go to [developer.planning.center](https://api.planningcenteronline.com/oauth/applications)
2. Click **New Application**
3. Set **Redirect URI** to `https://your-domain.com/api/auth/callback/planning-center`
   - For local testing use `http://localhost:3000/api/auth/callback/planning-center`
4. Copy the **Client ID** and **Client Secret** — you'll need these in the next step

### 3. Configure Environment

```bash
git clone https://github.com/remotelyliving/pco-agent.git
cd pco-agent
cp .env.example .env
```

Edit `.env` and fill in every value:

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://pco:<password>@pco-mcp-db:5432/pco_mcp?schema=agent` |
| `POSTGRES_PASSWORD` | Password for the PostgreSQL container | Pick a strong password |
| `PCO_CLIENT_ID` | From step 2 above | Planning Center developer portal |
| `PCO_CLIENT_SECRET` | From step 2 above | Planning Center developer portal |
| `NEXTAUTH_SECRET` | Session encryption key | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of your app | `https://your-domain.com` |
| `PCO_MCP_URL` | URL of the pco-mcp server | `https://pco-mcp.com/mcp` (or your own instance) |
| `ENCRYPTION_KEY` | Fernet key for API key encryption | See below |

**Generating a Fernet encryption key:**

```bash
node -e "const {Fernet}=require('fernet-nodejs');console.log(Fernet.generateKey())"
```

### 4. Create the Docker Network and Volume

If this is your first time, create the shared network and volume:

```bash
docker network create homelab-net
docker volume create pco-mcp_pgdata
```

### 5. First-Time Database Setup

```bash
# Start PostgreSQL first
docker compose up -d pco-mcp-db

# Wait for it to be healthy
docker compose exec pco-mcp-db pg_isready -U pco -d pco_mcp

# Build and start the app (migrations run automatically on startup)
make docker-build
make docker-up
```

The entrypoint script runs `prisma migrate deploy` before starting the server, so your schema will be created automatically.

### 6. Seed Default Rules

On first deploy, seed the system default rules:

```bash
docker compose exec pco-agent node -e "require('./prisma/seed')"
```

Or from outside the container (if you have Node.js locally):

```bash
make seed
```

### 7. Verify It's Running

```bash
curl http://localhost:3000/api/health
```

Expected response: `{"status":"ok","database":"connected"}`

Then visit `https://your-domain.com` (or `http://localhost:3000`) and sign in with Planning Center.

### 8. Cloudflare Tunnel (Optional — HTTPS)

If you're exposing this to the internet:

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Create a tunnel
cloudflared tunnel create pco-agent

# Configure the tunnel to point to your local app
cloudflared tunnel route dns pco-agent your-domain.com

# Run it
cloudflared tunnel run --url http://localhost:3000 pco-agent
```

Make sure `NEXTAUTH_URL` in `.env` matches your public domain.

### 9. Updating / Upgrading

```bash
cd pco-agent
git pull
make docker-build
make docker-up    # Migrations run automatically on restart
```

### 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| Health check returns connection error | Check `DATABASE_URL` in `.env` — host should be `pco-mcp-db` (Docker service name), not `localhost` |
| OAuth redirect mismatch | Ensure `NEXTAUTH_URL` matches the Redirect URI in your PCO OAuth app |
| "No API key configured" after login | Each user needs to configure their own AI provider key at `/settings` or via the setup wizard |
| Container exits immediately | Check logs: `make docker-logs` |
| Port 3000 already in use | Change the port mapping in `docker-compose.yml`: `"3001:3000"` |

## Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start development server |
| `make build` | Production build |
| `make test` | Run all tests |
| `make lint` | Lint + type check |
| `make db-push` | Push schema to database (dev only) |
| `make db-migrate` | Create a new Prisma migration (dev only) |
| `make db-deploy` | Apply pending migrations (production) |
| `make seed` | Seed system default rules |
| `make docker-build` | Build Docker image |
| `make docker-up` | Start via Docker Compose |
| `make docker-down` | Stop Docker Compose |
| `make docker-logs` | Tail container logs |

## How It Works

### For church staff (users)

1. Click "Sign in with Planning Center"
2. Set up your AI provider (paste an API key — we walk you through it)
3. Start chatting: "Who's available to serve this Sunday?" / "Add Amazing Grace to the July 13 service"

### For church admins

Everything above, plus:
- Define organization-level rules ("Always check blockout dates before scheduling")
- View and manage the AI's memory about your church

### Roles

Roles sync automatically from Planning Center on every login:

| PCO Permission | pco-agent Role | Capabilities |
|---------------|---------------|--------------|
| Site Administrator | admin | Full access — rules, memory, org settings |
| People Manager | admin | Full access |
| People Editor | editor | Manage rules, personal settings |
| People Viewer | member | Chat, personal rules |

## Related

- [pco-mcp](https://github.com/remotelyliving/pco-mcp) — The MCP server that connects to Planning Center's API. pco-agent uses this under the hood.

## License

Private. Not yet open source.
