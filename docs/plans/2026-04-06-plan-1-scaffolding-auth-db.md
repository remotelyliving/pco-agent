# Plan 1: Project Scaffolding + Auth + Database

> **Execution Notes (2026-04-06):**
> - Next.js 16 installed (plan written for 15) — `create-next-app@latest` resolved to v16
> - Prisma 7 installed — `url` moved from schema.prisma to prisma.config.ts
> - Tailwind v4 installed — no `tailwind.config.ts` (uses CSS-first config in globals.css)
> - Seed IDs changed from index-based to stable named IDs (e.g., `system-scheduling-blockout`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Next.js project with PCO OAuth authentication, Prisma database (agent schema), and a skeleton authenticated layout so users can sign in with Planning Center and see their org.

**Architecture:** Next.js 16 App Router with TypeScript. NextAuth v5 handles PCO OAuth. Prisma manages the `agent` schema in the shared PostgreSQL instance. Tailwind + shadcn/ui for styling. Docker for homelab deployment.

**Tech Stack:** Next.js 16, TypeScript, NextAuth v5, Prisma 7, PostgreSQL, Tailwind CSS v4, shadcn/ui, fernet-nodejs, Docker

---

## File Structure (this plan only)

```
pco-agent/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── next.config.ts
├── package.json
├── tsconfig.json
├── # tailwind.config.ts    # Not needed in Tailwind v4 (CSS-first config in globals.css)
├── postcss.config.mjs
├── components.json           # shadcn/ui config
├── prisma/
│   ├── schema.prisma         # agent schema models
│   └── seed.ts               # system default rules seeder
├── src/
│   ├── app/
│   │   ├── layout.tsx        # root layout
│   │   ├── page.tsx          # redirect to /chat or /login
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── [...nextauth]/
│   │   │           └── route.ts
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   └── (app)/
│   │       ├── layout.tsx    # authenticated layout with sidebar
│   │       └── chat/
│   │           └── page.tsx  # placeholder chat page
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   └── sidebar.tsx
│   ├── lib/
│   │   ├── auth.ts           # NextAuth config + PCO provider
│   │   ├── db.ts             # Prisma client singleton
│   │   └── crypto.ts         # Fernet encrypt/decrypt
│   └── middleware.ts         # NextAuth middleware for route protection
├── tests/
│   ├── lib/
│   │   ├── auth.test.ts
│   │   ├── db.test.ts
│   │   └── crypto.test.ts
│   └── setup.ts              # Vitest setup
├── vitest.config.ts
├── DEV_QUEUE.md              # (already exists)
├── CLAUDE.md                 # (already exists)
├── AGENTS.md                 # (already exists)
├── TEAM.md                   # (already exists)
├── README.md                 # (already exists)
└── Makefile                  # (already exists, update)
```

---

## Task 1: Next.js Project Initialization

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `vitest.config.ts`, `tests/setup.ts`

- [x] **Step 1: Initialize Next.js with TypeScript + Tailwind**

```bash
cd /Users/christian/projects/pco-agent
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Accept defaults. This creates the full Next.js project structure.

- [x] **Step 2: Install core dependencies**

```bash
npm install next-auth@beta ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google @ai-sdk/mcp prisma @prisma/client fernet-nodejs
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [x] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label tabs textarea separator avatar dropdown-menu scroll-area badge switch
```

- [x] **Step 4: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      thresholds: { lines: 90 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [x] **Step 5: Create tests/setup.ts**

```typescript
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [x] **Step 6: Create .env.example**

```bash
# PostgreSQL (shared with pco-mcp)
DATABASE_URL="postgresql://pco:changeme@localhost:5432/pco_mcp?schema=agent"

# Planning Center OAuth
PCO_CLIENT_ID=""
PCO_CLIENT_SECRET=""

# NextAuth
NEXTAUTH_SECRET=""  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

# pco-mcp server URL
PCO_MCP_URL="https://pco-mcp.com/mcp"

# Fernet encryption key for API keys at rest
ENCRYPTION_KEY=""  # Generate with: node -e "const f=require('fernet-nodejs');console.log(f.generateKey())"
```

- [x] **Step 7: Update .gitignore**

Append to the generated .gitignore:
```
.env
.env.local
prisma/generated/
```

- [x] **Step 8: Add test scripts to package.json**

Add to `scripts` in package.json:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [x] **Step 9: Verify project starts**

```bash
npm run dev
# Should start at http://localhost:3000
```

- [x] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js project with TypeScript, Tailwind, shadcn/ui, Vitest"
```

---

## Task 2: Prisma Schema + Database

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`
- Create: `tests/lib/db.test.ts`

- [x] **Step 1: Initialize Prisma**

```bash
npx prisma init
```

- [x] **Step 2: Write prisma/schema.prisma**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["agent"]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

model Organization {
  id        String   @id @default(uuid())
  pcoOrgId  String   @unique @map("pco_org_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  users   User[]
  rules   Rule[]
  memory  Memory[]

  @@map("organizations")
  @@schema("agent")
}

model User {
  id             String   @id @default(uuid())
  orgId          String   @map("org_id")
  pcoPersonId    BigInt   @map("pco_person_id")
  name           String?
  email          String?
  role           String   @default("member")
  apiProvider    String?  @map("api_provider")
  apiKeyEnc      Bytes?   @map("api_key_enc")
  preferredModel String?  @map("preferred_model")
  createdAt      DateTime @default(now()) @map("created_at")

  org            Organization @relation(fields: [orgId], references: [id])
  conversations  Conversation[]
  rules          Rule[]       @relation("CreatedBy")
  ruleSettings   UserRuleSetting[]

  @@unique([orgId, pcoPersonId])
  @@map("users")
  @@schema("agent")
}

model Conversation {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  title     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user     User      @relation(fields: [userId], references: [id])
  messages Message[]

  @@map("conversations")
  @@schema("agent")
}

model Message {
  id             String   @id @default(uuid())
  conversationId String   @map("conversation_id")
  role           String
  content        String
  toolCalls      Json?    @map("tool_calls")
  createdAt      DateTime @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@map("messages")
  @@schema("agent")
}

model Rule {
  id         String   @id @default(uuid())
  orgId      String?  @map("org_id")
  createdById String? @map("created_by")
  content    String
  category   String?
  ruleType   String   @map("rule_type")
  visibility String   @default("private")
  sortOrder  Int      @default(0) @map("sort_order")
  createdAt  DateTime @default(now()) @map("created_at")

  org        Organization?  @relation(fields: [orgId], references: [id])
  createdBy  User?          @relation("CreatedBy", fields: [createdById], references: [id])
  settings   UserRuleSetting[]

  @@map("rules")
  @@schema("agent")
}

model UserRuleSetting {
  id      String  @id @default(uuid())
  userId  String  @map("user_id")
  ruleId  String  @map("rule_id")
  enabled Boolean

  user User @relation(fields: [userId], references: [id])
  rule Rule @relation(fields: [ruleId], references: [id])

  @@unique([userId, ruleId])
  @@map("user_rule_settings")
  @@schema("agent")
}

model Memory {
  id        String   @id @default(uuid())
  orgId     String   @map("org_id")
  key       String
  value     String
  source    String   @default("auto")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, key])
  @@map("memory")
  @@schema("agent")
}
```

- [x] **Step 3: Create Prisma client singleton**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [x] **Step 4: Create seed file for system default rules**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_RULES = [
  {
    content: 'Always check a person\'s blockout dates before scheduling them for a service.',
    category: 'scheduling',
  },
  {
    content: 'Confirm with the user before creating, updating, or removing any records.',
    category: 'general',
  },
  {
    content: 'When scheduling volunteers, check when they last served to distribute fairly.',
    category: 'scheduling',
  },
  {
    content: 'When planning songs for a service, check when each song was last used to avoid repeating too soon.',
    category: 'scheduling',
  },
  {
    content: 'Use plain, friendly language. Avoid technical jargon.',
    category: 'general',
  },
  {
    content: 'When showing lists of people, include their role and contact info when available.',
    category: 'people',
  },
  {
    content: 'If you\'re unsure about something, say so rather than guessing.',
    category: 'general',
  },
];

async function main() {
  console.log('Seeding system default rules...');

  for (const rule of SYSTEM_RULES) {
    await prisma.rule.upsert({
      where: {
        id: `system-${rule.category}-${SYSTEM_RULES.indexOf(rule)}`,
      },
      update: { content: rule.content },
      create: {
        id: `system-${rule.category}-${SYSTEM_RULES.indexOf(rule)}`,
        content: rule.content,
        category: rule.category,
        ruleType: 'system',
        visibility: 'org',
      },
    });
  }

  console.log(`Seeded ${SYSTEM_RULES.length} system rules.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Add to package.json:
```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

- [x] **Step 5: Write db test**

```typescript
// tests/lib/db.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    })),
  };
});

describe('db', () => {
  it('exports a prisma client instance', async () => {
    const { prisma } = await import('@/lib/db');
    expect(prisma).toBeDefined();
    expect(prisma.$connect).toBeDefined();
  });
});
```

- [x] **Step 6: Push schema to database**

```bash
# Create the agent schema first (Prisma doesn't auto-create schemas)
# If sharing the pco-mcp postgres:
docker exec pco-mcp-db psql -U pco -d pco_mcp -c "CREATE SCHEMA IF NOT EXISTS agent;"

npx prisma db push
npx prisma generate
```

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema with agent schema, seed file, and db client"
```

---

## Task 3: Fernet Encryption Module

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `tests/lib/crypto.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/lib/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, generateKey } from '@/lib/crypto';

describe('crypto', () => {
  it('generates a valid fernet key', () => {
    const key = generateKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('encrypts and decrypts a roundtrip', () => {
    const key = generateKey();
    const plaintext = 'sk-ant-api03-secret-key-here';
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('decrypt with wrong key throws', () => {
    const key1 = generateKey();
    const key2 = generateKey();
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it('encrypt returns a string (base64)', () => {
    const key = generateKey();
    const result = encrypt('test', key);
    expect(typeof result).toBe('string');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/crypto.test.ts
```

- [x] **Step 3: Implement crypto.ts**

```typescript
// src/lib/crypto.ts
import { Fernet } from 'fernet-nodejs';

export function generateKey(): string {
  return Fernet.generateKey();
}

export function encrypt(plaintext: string, key: string): string {
  const f = new Fernet(key);
  return f.encrypt(plaintext);
}

export function decrypt(encrypted: string, key: string): string {
  const f = new Fernet(key);
  return f.decrypt(encrypted);
}
```

- [x] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/crypto.test.ts
```

- [x] **Step 5: Commit**

```bash
git add src/lib/crypto.ts tests/lib/crypto.test.ts
git commit -m "feat: add Fernet encryption module for API key storage"
```

---

## Task 4: PCO OAuth Provider (NextAuth)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Create: `tests/lib/auth.test.ts`

- [x] **Step 1: Implement auth.ts**

```typescript
// src/lib/auth.ts
import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import { prisma } from '@/lib/db';

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: 'planning-center',
      name: 'Planning Center',
      type: 'oauth',
      clientId: process.env.PCO_CLIENT_ID!,
      clientSecret: process.env.PCO_CLIENT_SECRET!,
      authorization: {
        url: 'https://api.planningcenteronline.com/oauth/authorize',
        params: { scope: 'people services' },
      },
      token: 'https://api.planningcenteronline.com/oauth/token',
      userinfo: {
        url: 'https://api.planningcenteronline.com/people/v2/me',
        async request({ tokens }) {
          const res = await fetch(
            'https://api.planningcenteronline.com/people/v2/me',
            {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            }
          );
          const json = await res.json();
          const person = json.data;
          const org = json.meta?.parent;
          return {
            id: person.id,
            name: `${person.attributes.first_name} ${person.attributes.last_name}`,
            email: person.attributes.email_addresses?.[0]?.address,
            pcoPersonId: parseInt(person.id, 10),
            pcoOrgId: org?.id,
            pcoOrgName: org?.attributes?.name,
          };
        },
      },
      profile(profile: any) {
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
        };
      },
    },
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== 'planning-center') return false;

      const profile = user as any;
      if (!profile.pcoOrgId || !profile.pcoPersonId) return false;

      // Upsert organization
      const org = await prisma.organization.upsert({
        where: { pcoOrgId: String(profile.pcoOrgId) },
        update: { name: profile.pcoOrgName || 'Unknown' },
        create: {
          pcoOrgId: String(profile.pcoOrgId),
          name: profile.pcoOrgName || 'Unknown',
        },
      });

      // Determine role from PCO (TODO: call PCO permissions API)
      // For now, first user in org = admin, rest = member
      const existingUsers = await prisma.user.count({ where: { orgId: org.id } });
      const role = existingUsers === 0 ? 'admin' : 'member';

      // Upsert user with synced fields
      await prisma.user.upsert({
        where: {
          orgId_pcoPersonId: {
            orgId: org.id,
            pcoPersonId: BigInt(profile.pcoPersonId),
          },
        },
        update: {
          name: profile.name,
          email: profile.email,
          // Role sync will be enhanced in a future task to check PCO permissions
        },
        create: {
          orgId: org.id,
          pcoPersonId: BigInt(profile.pcoPersonId),
          name: profile.name,
          email: profile.email,
          role,
        },
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        const profile = user as any;
        // Look up the agent user to get their ID and role
        const org = await prisma.organization.findUnique({
          where: { pcoOrgId: String(profile.pcoOrgId) },
        });
        if (org) {
          const agentUser = await prisma.user.findUnique({
            where: {
              orgId_pcoPersonId: {
                orgId: org.id,
                pcoPersonId: BigInt(profile.pcoPersonId),
              },
            },
          });
          if (agentUser) {
            token.agentUserId = agentUser.id;
            token.orgId = org.id;
            token.role = agentUser.role;
            token.pcoAccessToken = account.access_token;
            token.pcoRefreshToken = account.refresh_token;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          agentUserId: token.agentUserId as string,
          orgId: token.orgId as string,
          role: token.role as string,
        },
        pcoAccessToken: token.pcoAccessToken as string,
      };
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

- [x] **Step 2: Create the API route**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

- [x] **Step 3: Create middleware for route protection**

```typescript
// src/middleware.ts
export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
};
```

- [x] **Step 4: Write auth test**

```typescript
// tests/lib/auth.test.ts
import { describe, it, expect } from 'vitest';
import { authConfig } from '@/lib/auth';

describe('auth config', () => {
  it('has planning-center provider', () => {
    const providers = authConfig.providers;
    expect(providers).toHaveLength(1);
    const pco = providers[0] as any;
    expect(pco.id).toBe('planning-center');
  });

  it('has correct authorization URL', () => {
    const pco = authConfig.providers[0] as any;
    expect(pco.authorization.url).toContain('planningcenteronline.com');
  });

  it('has signIn callback', () => {
    expect(authConfig.callbacks?.signIn).toBeDefined();
  });

  it('has jwt callback', () => {
    expect(authConfig.callbacks?.jwt).toBeDefined();
  });

  it('has session callback', () => {
    expect(authConfig.callbacks?.session).toBeDefined();
  });

  it('redirects to /login for sign in', () => {
    expect(authConfig.pages?.signIn).toBe('/login');
  });
});
```

- [x] **Step 5: Run tests**

```bash
npx vitest run
```

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PCO OAuth via NextAuth with user/org sync"
```

---

## Task 5: Login Page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [x] **Step 1: Create login page**

```tsx
// src/app/(auth)/login/page.tsx
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Planning Center Assistant
          </h1>
          <p className="mt-2 text-gray-600">
            Chat with your church data using AI. Search people, plan services,
            schedule volunteers — all through conversation.
          </p>
        </div>

        <form
          action={async () => {
            'use server';
            await signIn('planning-center', { redirectTo: '/chat' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-lg font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign in with Planning Center
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Uses your Planning Center account. No separate password needed.
        </p>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Update root page to redirect**

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function Home() {
  const session = await auth();
  if (session) {
    redirect('/chat');
  }
  redirect('/login');
}
```

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add login page with PCO sign-in button"
```

---

## Task 6: Authenticated Layout + Skeleton Chat Page

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/chat/page.tsx`
- Create: `src/components/sidebar.tsx`

- [x] **Step 1: Create sidebar component**

```tsx
// src/components/sidebar.tsx
import { auth, signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

export async function Sidebar() {
  const session = await auth();
  const user = session?.user;
  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="flex h-full w-64 flex-col border-r bg-gray-50">
      <div className="p-4">
        <h2 className="text-lg font-semibold">PCO Assistant</h2>
        <p className="text-sm text-gray-500">
          {(session as any)?.user?.role === 'admin' ? 'Admin' : 'Member'}
        </p>
      </div>

      <Separator />

      <div className="p-4">
        <Button asChild className="w-full" variant="outline">
          <Link href="/chat">+ New Chat</Link>
        </Button>
      </div>

      <ScrollArea className="flex-1 px-4">
        <p className="text-sm text-gray-400">No conversations yet</p>
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 truncate">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Create authenticated layout**

```tsx
// src/app/(app)/layout.tsx
import { Sidebar } from '@/components/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
```

- [x] **Step 3: Create skeleton chat page**

```tsx
// src/app/(app)/chat/page.tsx
export default function ChatPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome to your Planning Center Assistant
      </h1>
      <p className="mt-2 text-gray-500">
        Chat functionality coming soon. Try asking about your church&apos;s people or services.
      </p>
    </div>
  );
}
```

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add authenticated layout with sidebar and skeleton chat page"
```

---

## Task 7: Docker Configuration

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Add standalone output to next.config.ts**

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  pco-agent:
    build: .
    container_name: pco-agent
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3000:3000"
    depends_on:
      pco-mcp-db:
        condition: service_healthy
    networks:
      - internal
      - homelab-net
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/auth/session"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  # Reference the existing pco-mcp-db (if running in same compose)
  # Otherwise, point DATABASE_URL to the existing container on the shared network
  pco-mcp-db:
    image: postgres:16-alpine
    container_name: pco-mcp-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: pco
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: pco_mcp
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pco -d pco_mcp"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
    external: true
    name: pco-mcp_pgdata

networks:
  internal:
    driver: bridge
  homelab-net:
    external: true
```

- [ ] **Step 4: Update Makefile**

Replace the Makefile with updated commands that include Prisma and Docker properly. The existing Makefile already has the right structure — just verify `make docker-build` and `make docker-up` work with the new files.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Docker configuration for homelab deployment"
```

---

## Task 8: Feature Summary + Dev Queue Update

**Files:**
- Create: `docs/features/scaffolding-auth-db/SUMMARY.md`
- Modify: `DEV_QUEUE.md`

- [ ] **Step 1: Create feature summary**

```markdown
# Feature: Scaffolding + Auth + Database

**Status:** Complete
**Last Updated:** YYYY-MM-DD

## What It Does
Next.js 16 project with PCO OAuth authentication, Prisma 7 database (agent schema),
sidebar layout, and Docker deployment configuration.

## Key Files
- `src/lib/auth.ts` — NextAuth config with PCO OAuth provider, user/org sync
- `src/lib/db.ts` — Prisma client singleton
- `src/lib/crypto.ts` — Fernet encryption for API key storage
- `prisma/schema.prisma` — Full agent schema (orgs, users, conversations, messages, rules, memory)
- `prisma/seed.ts` — System default rules seeder
- `src/middleware.ts` — Route protection (redirect to /login if unauthenticated)
- `src/app/(auth)/login/page.tsx` — PCO sign-in page
- `src/app/(app)/layout.tsx` — Authenticated layout with sidebar

## Design Decisions
- Shared PostgreSQL with pco-mcp, separate `agent` schema (reduces ops)
- PCO is source of truth for roles (synced on every login)
- Fernet encryption for API keys at rest (same approach as pco-mcp)
- NextAuth JWT sessions (no server-side session store)
- standalone output mode for Docker deployment

## Known Limitations
- PCO role sync uses first-user-is-admin heuristic (should call PCO permissions API)
- No settings page yet (API key entry comes in Plan 2)
- Chat page is a placeholder
```

- [ ] **Step 2: Update DEV_QUEUE.md**

Move "Sub-project 1" to Done. Add note about next plan.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add feature summary and update dev queue"
```
