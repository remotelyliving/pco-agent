# pco-agent Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Goal:** A turnkey web-based AI agent that lets non-technical church staff interact with Planning Center Online through natural language. Multi-provider (Anthropic/OpenAI/Google), persistent memory, org-level and user-level custom rules, BYO API key.

---

## 1. Architecture

```
[Browser]
  Next.js App (React + Vercel AI SDK v6)
    ├── Chat UI (streaming)
    ├── Settings (API key, rules, org)
    └── Setup Wizard (first-time onboarding)
        │
[Server Layer - Next.js API Routes]
    ├── AI Provider Router (Vercel AI SDK)
    │     └── MCP Connector → pco-mcp (existing MCP server)
    ├── Auth (NextAuth + PCO OAuth)
    ├── Memory Manager (conversation history + key-value facts)
    └── Rules Assembler (system + org + user rules → system prompt)
        │
[PostgreSQL] (shared instance with pco-mcp, separate `agent` schema)
```

**Stack:**
- Next.js 15 + TypeScript
- Vercel AI SDK v6 (multi-provider + MCP)
- NextAuth.js (PCO OAuth provider)
- PostgreSQL (shared with pco-mcp, `agent` schema)
- Prisma (ORM)
- Tailwind CSS + shadcn/ui (UI components)
- Docker (homelab deployment, Vercel-ready)

---

## 2. Auth Flow (Sign in with PCO)

1. User clicks "Sign in with Planning Center"
2. Redirect to PCO OAuth authorize
3. PCO callback → call `/people/v2/me` for person_id, org_id, name, email
4. Call PCO API to get user's organization-level permissions
5. Upsert `agent.organizations` by `pco_org_id`
6. Upsert `agent.users` by `(org_id, pco_person_id)`:
   - If PCO role is Administrator or Editor → `role = 'admin'`
   - Otherwise → `role = 'member'`
   - **Always sync** name, email, role on every login (PCO is source of truth)
7. Set NextAuth JWT session cookie
8. If first login → redirect to `/setup`; otherwise → `/chat`

Multiple admins per org. Role changes in PCO reflect immediately on next login.

---

## 3. Data Model (agent schema in shared PostgreSQL)

### organizations
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| pco_org_id | TEXT UNIQUE | From PCO /me |
| name | TEXT | Org name from PCO |
| created_at | TIMESTAMPTZ | |

### users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK → organizations | |
| pco_person_id | BIGINT | |
| name | TEXT | Synced from PCO |
| email | TEXT | Synced from PCO |
| role | TEXT | 'admin' or 'member' (synced from PCO) |
| api_provider | TEXT | 'anthropic', 'openai', 'google' |
| api_key_enc | BYTEA | Fernet encrypted |
| preferred_model | TEXT | 'claude-haiku', 'gpt-4o-mini', etc. |
| created_at | TIMESTAMPTZ | |
| UNIQUE | (org_id, pco_person_id) | |

### conversations
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| title | TEXT | Auto-generated or user-set |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| conversation_id | UUID FK → conversations | |
| role | TEXT | 'user', 'assistant', 'tool' |
| content | TEXT | |
| tool_calls | JSONB | Tool invocations if any |
| created_at | TIMESTAMPTZ | |

### rules
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK → organizations NULL | NULL = system default |
| created_by | UUID FK → users NULL | NULL = system |
| content | TEXT | Plain English rule |
| category | TEXT | 'scheduling', 'people', 'general' |
| rule_type | TEXT | 'system', 'org', 'user' |
| visibility | TEXT | 'org', 'public', 'private' |
| sort_order | INT | |
| created_at | TIMESTAMPTZ | |

### user_rule_settings (per-user overrides)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| rule_id | UUID FK → rules | |
| enabled | BOOLEAN | Opt-in or opt-out |
| UNIQUE | (user_id, rule_id) | |

### memory (org-level persistent facts)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK → organizations | |
| key | TEXT | e.g., 'senior_pastor' |
| value | TEXT | e.g., 'Pastor Mike' |
| source | TEXT | 'auto' or 'manual' |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| UNIQUE | (org_id, key) | |

---

## 4. Rules System

### Three rule types

**System defaults** (`rule_type='system'`, `org_id=NULL`):
- Shipped with the app, same for every org
- Enabled for all users by default
- Any user can opt-out for themselves via `user_rule_settings`
- Examples: "Always check blockout dates before scheduling", "Confirm before making changes to service plans"

**Org rules** (`rule_type='org'`, `visibility='org'`):
- Created by admins
- Applied to all users in the org by default
- Users can opt-out for themselves

**User rules** (`rule_type='user'`):
- Created by any user for themselves
- `visibility='private'`: only the creator sees/uses them
- `visibility='public'`: appears in org's rule library, other admins can see and opt-in
- Public user rules are OFF by default for everyone except the creator

### Rule resolution per chat session

```
effective_rules = (
    system_defaults WHERE user has NOT opted out
    + org rules WHERE user has NOT opted out
    + public rules from other users WHERE user has opted IN
    + user's own rules WHERE user has NOT disabled
)
```

Assembled into the system prompt as a numbered list.

---

## 5. Memory System

### Conversation persistence
- Full message history stored in `agent.messages`
- Resuming a conversation loads the last 50 messages as context
- Old conversations always accessible in sidebar

### Org-level memory (key-value facts)
- Extracted automatically after each assistant response
- A lightweight follow-up call (cheapest model) asks: "Did this conversation reveal any new facts about the church worth remembering?"
- If yes, upserts to `agent.memory`
- Included at the top of every new conversation's system prompt
- Admins can view/edit/delete memory facts in Settings
- Examples: `senior_pastor → "Pastor Mike"`, `worship_style → "contemporary"`, `service_times → "9:00 AM and 11:00 AM"`

### System prompt assembly

```
[System instructions — who you are, what you can do]
[Effective rules for this user — numbered list]
[Org memory facts — bulleted list]
[Conversation history — last N messages]
```

---

## 6. AI Provider Integration

### BYO Key model
- User provides their own API key for Anthropic, OpenAI, or Google
- Key encrypted with Fernet, stored in `users.api_key_enc`
- Decrypted server-side only when making AI calls
- Never sent back to browser after initial storage

### Provider routing (Vercel AI SDK v6)
- AI SDK provides a unified interface: `generateText()`, `streamText()`
- Provider swapped at runtime based on `user.api_provider`
- MCP connector configured with pco-mcp URL + user's PCO OAuth token

### Model options
| Provider | Models | Approx. cost/mo |
|----------|--------|-----------------|
| Anthropic | Haiku 4.5, Sonnet 4.6 | $8-23 |
| OpenAI | GPT-4o-mini, GPT-4o | $1-17 |
| Google | Gemini Flash 2.5, Gemini Pro 2.5 | $3-13 |

### MCP connection
- Vercel AI SDK v6 has native `@ai-sdk/mcp` package
- Connect to `https://pco-mcp.com/mcp` (or homelab URL)
- Auth: user's PCO OAuth token (obtained during pco-agent login)
- AI SDK handles tool discovery, invocation, and result parsing

---

## 7. UI Pages

### `/login`
- Single button: "Sign in with Planning Center"
- Brief explanation of what pco-agent does
- Clean, branded, trustworthy

### `/setup` (first-time wizard)
- **Step 1: Choose AI Provider** — 3 cards (Anthropic, OpenAI, Google) with logos, brief description, price range. Each card links to "How to get an API key" with step-by-step screenshots.
- **Step 2: Enter API Key** — Paste field with "What's an API key?" explainer tooltip. Provider-specific instructions (e.g., "Go to platform.openai.com → API Keys → Create new key").
- **Step 3: Choose Model** — Dropdown filtered by provider. Each option shows name + approx cost/mo. Default: cheapest.
- **Step 4: Test Connection** — Button sends a test message through pco-mcp. Shows "Connected to [Org Name]'s Planning Center!" on success.
- **Step 5: Done** → redirect to `/chat`

### `/chat` (main experience)
- Left sidebar: conversation list, "New Chat" button, user avatar + settings link
- Center: streaming chat with markdown rendering
- Tool calls shown inline as collapsible cards ("Searched for people...", "Found 3 results")
- Mobile responsive

### `/settings` (tabbed)
- **AI Provider** tab (all users): change provider, key, model. Test connection.
- **My Rules** tab (all users): your private/public rules. Toggle system defaults and org rules on/off for yourself. Browse public rules from other admins.
- **Organization** tab (admin only): org-level rules (visibility: org). View members. View/edit org memory facts.

---

## 8. Deployment

### Homelab (primary)
- Docker Compose alongside pco-mcp
- Shares the existing PostgreSQL container (agent schema)
- Cloudflare tunnel for HTTPS

### Vercel (future scale)
- Standard Next.js deployment
- External PostgreSQL (Neon, Supabase, or Railway)
- Environment variables for config

### Docker setup
```yaml
# Added to pco-mcp's docker-compose.yml or standalone
services:
  pco-agent:
    build: .
    container_name: pco-agent
    environment:
      - DATABASE_URL=postgresql://...
      - PCO_CLIENT_ID=...
      - PCO_CLIENT_SECRET=...
      - NEXTAUTH_SECRET=...
      - NEXTAUTH_URL=https://agent.pco-mcp.com
      - PCO_MCP_URL=https://pco-mcp.com/mcp
      - ENCRYPTION_KEY=...
    ports:
      - "3000:3000"
    networks:
      - internal
      - homelab-net
```

---

## 9. Security

- API keys encrypted at rest (Fernet)
- PCO OAuth tokens scoped per-user (never shared across org)
- NextAuth JWT sessions (no server-side session store needed)
- All AI API calls server-side (keys never reach browser)
- HTTPS enforced (Cloudflare tunnel)
- Role sync from PCO on every login
- Rules can't execute code — they're plain text injected into system prompts

---

## 10. System Default Rules (shipped with app)

Initial set:
1. "Always check a person's blockout dates before scheduling them for a service."
2. "Confirm with the user before creating, updating, or removing any records."
3. "When scheduling volunteers, check when they last served to distribute fairly."
4. "When planning songs for a service, check when each song was last used to avoid repeating too soon."
5. "Use plain, friendly language. Avoid technical jargon."
6. "When showing lists of people, include their role and contact info when available."
7. "If you're unsure about something, say so rather than guessing."

Admins can toggle these off for themselves. The set ships as seed data on first deploy.

---

## 11. Future (Not in v1)

- Managed API key option (we proxy, user pays subscription instead of BYO key)
- Stripe billing integration
- Skills marketplace (shareable prompt templates across orgs)
- Additional PCO modules (Giving, Groups, Check-Ins, Calendar)
- Claude Desktop / Cursor support via MCPB packaging
- Webhooks for real-time PCO notifications
- Voice input for hands-free use during rehearsals
