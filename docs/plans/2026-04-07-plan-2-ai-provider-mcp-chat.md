# Plan 2: AI Provider + MCP + Chat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working chat interface where users can converse with an AI that has access to their Planning Center data via MCP tools — using their own API key with a choice of provider.

**Architecture:** Next.js API route handler receives chat messages, decrypts the user's stored API key, creates a provider-specific model instance via Vercel AI SDK v6, connects to pco-mcp via `@ai-sdk/mcp`, and streams the response back. The React client uses `useChat()` from `@ai-sdk/react`. Conversations and messages are persisted to Prisma. A settings page lets users enter their API key and choose a provider/model.

**Tech Stack:** Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/mcp`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`), Next.js 16 App Router, Prisma 7, React Server Components + Client Components

---

## File Structure (this plan only)

```
src/
  lib/
    ai/
      providers.ts       # createModel() — runtime provider factory using user's API key
      models.ts          # MODEL_OPTIONS constant — provider/model metadata for UI
    chat/
      persist.ts         # saveUserMessage(), saveAssistantMessage() — DB persistence
  app/
    api/
      chat/
        route.ts         # POST handler — streamText + MCP + persistence
    (app)/
      chat/
        page.tsx         # Chat page — useChat() client component wrapper
        [id]/
          page.tsx       # Conversation page — loads history, resumes chat
      settings/
        page.tsx         # Settings page — API key entry, provider/model selection
  components/
    chat/
      chat-interface.tsx # Client component — useChat(), message list, input
      message-bubble.tsx # Single message display (user/assistant/tool)
    settings/
      api-key-form.tsx   # Client component — API key entry form
tests/
  lib/
    ai/
      providers.test.ts  # Provider factory tests
      models.test.ts     # Model options tests
    chat/
      persist.test.ts    # Persistence tests
  api/
    chat.test.ts         # Chat route handler tests
```

---

## Task 1: Install `@ai-sdk/react` + Create Provider Factory

**Files:**
- Create: `src/lib/ai/providers.ts`
- Create: `src/lib/ai/models.ts`
- Create: `tests/lib/ai/providers.test.ts`
- Create: `tests/lib/ai/models.test.ts`

- [ ] **Step 1: Install missing dependency**

```bash
npm install @ai-sdk/react
```

- [ ] **Step 2: Write failing test for provider factory**

```typescript
// tests/lib/ai/providers.test.ts
import { describe, it, expect } from 'vitest';
import { createModel, SUPPORTED_PROVIDERS } from '@/lib/ai/providers';

describe('createModel', () => {
  it('creates an anthropic model', () => {
    const model = createModel('anthropic', 'claude-sonnet-4-5-20250514', 'sk-ant-test-key');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude-sonnet-4-5-20250514');
  });

  it('creates an openai model', () => {
    const model = createModel('openai', 'gpt-4o', 'sk-test-key');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('gpt-4o');
  });

  it('creates a google model', () => {
    const model = createModel('google', 'gemini-2.0-flash', 'test-key');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('gemini-2.0-flash');
  });

  it('throws for unknown provider', () => {
    expect(() => createModel('unknown', 'model', 'key')).toThrow('Unsupported provider');
  });

  it('exports SUPPORTED_PROVIDERS list', () => {
    expect(SUPPORTED_PROVIDERS).toContain('anthropic');
    expect(SUPPORTED_PROVIDERS).toContain('openai');
    expect(SUPPORTED_PROVIDERS).toContain('google');
    expect(SUPPORTED_PROVIDERS).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/lib/ai/providers.test.ts
```

- [ ] **Step 4: Implement providers.ts**

```typescript
// src/lib/ai/providers.ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function createModel(
  provider: string,
  modelId: string,
  apiKey: string,
): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/lib/ai/providers.test.ts
```

- [ ] **Step 6: Write failing test for model options**

```typescript
// tests/lib/ai/models.test.ts
import { describe, it, expect } from 'vitest';
import { MODEL_OPTIONS, getDefaultModel } from '@/lib/ai/models';

describe('MODEL_OPTIONS', () => {
  it('has entries for all three providers', () => {
    const providers = MODEL_OPTIONS.map((m) => m.provider);
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('google');
  });

  it('each option has required fields', () => {
    for (const opt of MODEL_OPTIONS) {
      expect(opt.id).toBeTruthy();
      expect(opt.provider).toBeTruthy();
      expect(opt.name).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });
});

describe('getDefaultModel', () => {
  it('returns a default for anthropic', () => {
    const model = getDefaultModel('anthropic');
    expect(model).toBeDefined();
    expect(model?.provider).toBe('anthropic');
  });

  it('returns undefined for unknown provider', () => {
    expect(getDefaultModel('unknown')).toBeUndefined();
  });
});
```

- [ ] **Step 7: Implement models.ts**

```typescript
// src/lib/ai/models.ts
export interface ModelOption {
  id: string;
  provider: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-5-20250514',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.5',
    description: 'Fast and capable, great for most tasks',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-5-20250414',
    provider: 'anthropic',
    name: 'Claude Opus 4.5',
    description: 'Most capable, best for complex reasoning',
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'Fast and capable multimodal model',
    isDefault: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'Affordable and fast for simple tasks',
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Fast and efficient, good for most tasks',
    isDefault: true,
  },
];

export function getDefaultModel(provider: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.provider === provider && m.isDefault);
}
```

- [ ] **Step 8: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/ tests/lib/ai/ package.json package-lock.json
git commit -m "feat: add AI provider factory and model options"
```

---

## Task 2: Chat Persistence Layer

**Files:**
- Create: `src/lib/chat/persist.ts`
- Create: `tests/lib/chat/persist.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/chat/persist.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  conversation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  message: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  createConversation,
  getConversation,
  listConversations,
  saveMessage,
  getMessages,
} from '@/lib/chat/persist';

describe('chat persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createConversation calls prisma with userId', async () => {
    mockPrisma.conversation.create.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createConversation('user-1');
    expect(result.id).toBe('conv-1');
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: { userId: 'user-1' },
    });
  });

  it('getConversation returns conversation with messages', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'hello' }],
    });

    const result = await getConversation('conv-1', 'user-1');
    expect(result).toBeDefined();
    expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  });

  it('listConversations returns user conversations', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: 'conv-1', title: 'Test' },
    ]);

    const result = await listConversations('user-1');
    expect(result).toHaveLength(1);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  });

  it('saveMessage creates a message record', async () => {
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'hello',
    });

    const result = await saveMessage({
      conversationId: 'conv-1',
      role: 'user',
      content: 'hello',
    });
    expect(result.id).toBe('msg-1');
  });

  it('saveMessage stores toolCalls as JSON', async () => {
    const toolCalls = [{ name: 'search', args: { q: 'test' } }];
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-2',
      toolCalls,
    });

    await saveMessage({
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'result',
      toolCalls,
    });

    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toolCalls }),
    });
  });

  it('getMessages returns ordered messages', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'hi' },
      { id: 'msg-2', role: 'assistant', content: 'hello' },
    ]);

    const result = await getMessages('conv-1');
    expect(result).toHaveLength(2);
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/chat/persist.test.ts
```

- [ ] **Step 3: Implement persist.ts**

```typescript
// src/lib/chat/persist.ts
import { prisma } from '@/lib/db';

export async function createConversation(userId: string) {
  return prisma.conversation.create({
    data: { userId },
  });
}

export async function getConversation(conversationId: string, userId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
}

export async function saveMessage(data: {
  conversationId: string;
  role: string;
  content: string;
  toolCalls?: unknown;
}) {
  return prisma.message.create({
    data: {
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls ?? undefined,
    },
  });
}

export async function getMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { title },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/chat/persist.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/ tests/lib/chat/
git commit -m "feat: add chat persistence layer"
```

---

## Task 3: Chat API Route Handler

**Files:**
- Create: `src/app/api/chat/route.ts`

This task is integration-heavy (AI SDK + MCP + Prisma + auth). No unit test — the route will be tested via E2E and manual testing. The provider factory and persistence layer are already unit-tested.

- [ ] **Step 1: Create the chat route handler**

```typescript
// src/app/api/chat/route.ts
import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createModel } from '@/lib/ai/providers';
import { decrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import {
  createConversation,
  saveMessage,
  updateConversationTitle,
} from '@/lib/chat/persist';

export async function POST(req: Request) {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse request
  const body = await req.json();
  const { messages, conversationId: existingConvId } = body as {
    messages: UIMessage[];
    conversationId?: string;
  };

  if (!messages || messages.length === 0) {
    return new Response('No messages provided', { status: 400 });
  }

  // 3. Load user with API key
  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
  });

  if (!user?.apiProvider || !user?.apiKeyEnc) {
    return new Response(
      JSON.stringify({ error: 'No API key configured. Go to Settings to add one.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 4. Decrypt API key
  const apiKey = decrypt(user.apiKeyEnc, getEncryptionKey());
  const modelId = user.preferredModel || getDefaultModelId(user.apiProvider);

  // 5. Create or reuse conversation
  const conversationId = existingConvId || (await createConversation(session.user.agentUserId)).id;

  // 6. Save the user message
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === 'user') {
    await saveMessage({
      conversationId,
      role: 'user',
      content: typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content),
    });
  }

  // 7. Connect to MCP server (using PCO access token from JWT)
  // Get the JWT token to extract pcoAccessToken
  const token = await getJwtToken();
  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  let tools = {};

  if (token?.pcoAccessToken) {
    try {
      mcpClient = await createMCPClient({
        transport: {
          type: 'sse',
          url: process.env.PCO_MCP_URL || 'https://pco-mcp.com/mcp',
          headers: {
            Authorization: `Bearer ${token.pcoAccessToken}`,
          },
        },
      });
      tools = await mcpClient.tools();
    } catch (error) {
      console.error('[chat] MCP connection failed:', error);
      // Continue without MCP tools — chat still works, just no PCO data access
    }
  }

  // 8. Build system prompt
  const systemPrompt = buildSystemPrompt();

  // 9. Stream the response
  const result = streamText({
    model: createModel(user.apiProvider, modelId, apiKey),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    maxSteps: 5,
    onFinish: async ({ text, toolCalls }) => {
      // Save assistant message
      await saveMessage({
        conversationId,
        role: 'assistant',
        content: text || '',
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      });

      // Auto-title the conversation from the first exchange
      if (!existingConvId && text) {
        const title = text.slice(0, 100).split('\n')[0];
        await updateConversationTitle(conversationId, title);
      }

      // Close MCP client
      if (mcpClient) {
        await mcpClient.close();
      }
    },
    onError: async () => {
      if (mcpClient) {
        await mcpClient.close();
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'x-conversation-id': conversationId,
    },
  });
}

function getDefaultModelId(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'claude-sonnet-4-5-20250514';
    case 'openai': return 'gpt-4o';
    case 'google': return 'gemini-2.0-flash';
    default: return 'claude-sonnet-4-5-20250514';
  }
}

function buildSystemPrompt(): string {
  // Minimal system prompt for Plan 2. Rules system comes in Plan 3.
  return `You are a helpful assistant for church staff who use Planning Center Online.

You have access to tools that can search people, view services, check schedules, and manage church data in Planning Center. Use these tools when the user asks about their church data.

Be friendly, use plain language, and avoid technical jargon. If you're unsure about something, say so rather than guessing.

When you use a tool and get results, summarize them in a clear, readable way.`;
}

async function getJwtToken() {
  // Access the raw JWT token to get pcoAccessToken
  // NextAuth v5 stores this in the JWT, not the session
  const { getToken } = await import('next-auth/jwt');
  const { cookies, headers } = await import('next/headers');

  try {
    // In App Router, we need to construct a minimal request-like object
    const cookieStore = await cookies();
    const headerStore = await headers();

    // Build a headers object from the header store
    const reqHeaders = new Headers();
    headerStore.forEach((value, key) => {
      reqHeaders.set(key, value);
    });

    // Add cookies
    const cookieHeader = cookieStore.getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    reqHeaders.set('cookie', cookieHeader);

    const token = await getToken({
      req: { headers: reqHeaders } as any,
      secret: process.env.NEXTAUTH_SECRET,
    });
    return token;
  } catch (error) {
    console.error('[chat] Failed to get JWT token:', error);
    return null;
  }
}
```

- [ ] **Step 2: Verify the project builds**

```bash
npx next build
```

Fix any type errors. The build may warn about missing env vars — that's OK. There should be no compilation errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add chat API route with AI streaming and MCP tools"
```

---

## Task 4: Settings Page (API Key + Provider Selection)

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/components/settings/api-key-form.tsx`
- Create: `src/app/api/settings/route.ts`

- [ ] **Step 1: Create the settings API route**

```typescript
// src/app/api/settings/route.ts
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
    select: {
      apiProvider: true,
      preferredModel: true,
      // Never return the encrypted key — just whether one exists
    },
  });

  return Response.json({
    apiProvider: user?.apiProvider || null,
    preferredModel: user?.preferredModel || null,
    hasApiKey: !!user?.apiKeyEnc,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { apiProvider, apiKey, preferredModel } = body as {
    apiProvider: string;
    apiKey?: string;
    preferredModel?: string;
  };

  if (!apiProvider) {
    return new Response('Provider is required', { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    apiProvider,
    preferredModel: preferredModel || null,
  };

  // Only update the key if a new one was provided
  if (apiKey) {
    updateData.apiKeyEnc = encrypt(apiKey, getEncryptionKey());
  }

  await prisma.user.update({
    where: { id: session.user.agentUserId },
    data: updateData,
  });

  return Response.json({ success: true });
}
```

- [ ] **Step 2: Create the API key form client component**

```tsx
// src/components/settings/api-key-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MODEL_OPTIONS, type ModelOption } from '@/lib/ai/models';
import { SUPPORTED_PROVIDERS } from '@/lib/ai/providers';

export function ApiKeyForm() {
  const [provider, setProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.apiProvider) setProvider(data.apiProvider);
        if (data.preferredModel) setModel(data.preferredModel);
        setHasExistingKey(data.hasApiKey);
      });
  }, []);

  const modelsForProvider = MODEL_OPTIONS.filter((m) => m.provider === provider);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiProvider: provider,
          apiKey: apiKey || undefined,
          preferredModel: model || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      setMessage({ type: 'success', text: 'Settings saved!' });
      setApiKey('');
      setHasExistingKey(true);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider Settings</CardTitle>
        <CardDescription>
          Choose your AI provider and enter your API key. Your key is encrypted
          and stored securely — we never see it in plain text.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel('');
              }}
              className="w-full rounded-md border p-2"
              required
            >
              <option value="">Select a provider...</option>
              {SUPPORTED_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p === 'anthropic' ? 'Anthropic (Claude)' :
                   p === 'openai' ? 'OpenAI (GPT)' :
                   p === 'google' ? 'Google (Gemini)' : p}
                </option>
              ))}
            </select>
          </div>

          {provider && (
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-md border p-2"
              >
                <option value="">Use default</option>
                {modelsForProvider.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              API Key {hasExistingKey && '(leave blank to keep current key)'}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKey ? '••••••••' : 'Paste your API key here'}
              required={!hasExistingKey}
            />
            <p className="text-xs text-gray-500">
              {provider === 'anthropic' && 'Get your key at console.anthropic.com'}
              {provider === 'openai' && 'Get your key at platform.openai.com'}
              {provider === 'google' && 'Get your key at aistudio.google.com'}
            </p>
          </div>

          {message && (
            <div
              className={`rounded-lg p-3 text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
              role="alert"
            >
              {message.text}
            </div>
          )}

          <Button type="submit" disabled={saving || !provider}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the settings page**

```tsx
// src/app/(app)/settings/page.tsx
import { ApiKeyForm } from '@/components/settings/api-key-form';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <ApiKeyForm />
    </div>
  );
}
```

- [ ] **Step 4: Add settings link to sidebar**

In `src/components/sidebar.tsx`, add a settings link in the navigation area (above the scroll area, below the New Chat button):

```tsx
<Button asChild className="w-full" variant="ghost">
  <Link href="/settings">Settings</Link>
</Button>
```

- [ ] **Step 5: Verify the project builds**

```bash
npx next build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/settings/ src/app/\(app\)/settings/ src/components/settings/ src/components/sidebar.tsx
git commit -m "feat: add settings page with API key and provider configuration"
```

---

## Task 5: Chat UI Components

**Files:**
- Create: `src/components/chat/chat-interface.tsx`
- Create: `src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Create message bubble component**

```tsx
// src/components/chat/message-bubble.tsx
'use client';

import type { UIMessage } from 'ai';

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap">
                {part.text}
              </div>
            );
          }
          if (part.type === 'tool-invocation') {
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">Tool: {part.toolInvocation.toolName}</span>
                {part.toolInvocation.state === 'result' && (
                  <div className="mt-1 text-xs text-gray-500">
                    Done
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create chat interface component**

```tsx
// src/components/chat/chat-interface.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble } from '@/components/chat/message-bubble';

export function ChatInterface({
  conversationId,
  initialMessages,
}: {
  conversationId?: string;
  initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
}) {
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: convId,
    initialMessages,
    body: { conversationId: convId },
    onFinish: (message, { response }) => {
      // Extract conversation ID from response headers for new conversations
      const newConvId = response?.headers?.get('x-conversation-id');
      if (newConvId && !convId) {
        setConvId(newConvId);
        // Update URL without full navigation
        window.history.replaceState(null, '', `/chat/${newConvId}`);
      }
    },
    onError: (err) => {
      console.error('[chat] Error:', err.message);
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isStreaming = status === 'streaming' || status === 'submitted';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const text = textarea.value.trim();
    if (!text || isStreaming) return;

    textarea.value = '';
    await sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form) form.requestSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-400">
            <p>Ask anything about your Planning Center data.</p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="mb-4 flex justify-start">
            <div className="rounded-lg bg-gray-100 px-4 py-3 text-gray-500">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error.message || 'Something went wrong. Please try again.'}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask about your church data..."
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-[44px] flex-1 resize-none"
            disabled={isStreaming}
            aria-label="Chat message"
          />
          <Button type="submit" disabled={isStreaming}>
            {isStreaming ? '...' : 'Send'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify the project builds**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/
git commit -m "feat: add chat UI components — message bubbles and chat interface"
```

---

## Task 6: Wire Up Chat Pages

**Files:**
- Modify: `src/app/(app)/chat/page.tsx`
- Create: `src/app/(app)/chat/[id]/page.tsx`

- [ ] **Step 1: Update the chat page**

```tsx
// src/app/(app)/chat/page.tsx
import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    redirect('/login');
  }

  return <ChatInterface />;
}
```

- [ ] **Step 2: Create the conversation page**

```tsx
// src/app/(app)/chat/[id]/page.tsx
import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { getConversation } from '@/lib/chat/persist';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    redirect('/login');
  }

  const { id } = await params;
  const conversation = await getConversation(id, session.user.agentUserId);

  if (!conversation) {
    notFound();
  }

  const initialMessages = conversation.messages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  return (
    <ChatInterface
      conversationId={conversation.id}
      initialMessages={initialMessages}
    />
  );
}
```

- [ ] **Step 3: Update sidebar to show conversation list**

Update `src/components/sidebar.tsx` to list recent conversations. Replace the static "No conversations yet" text with a server component that queries the DB:

In the sidebar's ScrollArea section, replace:
```tsx
<p className="text-sm text-gray-400">No conversations yet</p>
```
with:
```tsx
{conversations.length === 0 ? (
  <p className="text-sm text-gray-400">No conversations yet</p>
) : (
  <div className="space-y-1">
    {conversations.map((conv) => (
      <Link
        key={conv.id}
        href={`/chat/${conv.id}`}
        className="block truncate rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
      >
        {conv.title || 'Untitled conversation'}
      </Link>
    ))}
  </div>
)}
```

And at the top of the Sidebar function, after the session check, add:
```tsx
const conversations = await listConversations(session?.user?.agentUserId || '');
```

Import `listConversations` from `@/lib/chat/persist`.

- [ ] **Step 4: Verify the project builds**

```bash
npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/chat/ src/components/sidebar.tsx
git commit -m "feat: wire up chat pages with conversation history and sidebar list"
```

---

## Task 7: Documentation + Dev Queue Update

**Files:**
- Create: `docs/features/ai-provider-mcp-chat/SUMMARY.md`
- Modify: `DEV_QUEUE.md`
- Modify: `CLAUDE.md` (update project structure)
- Modify: `AGENTS.md` (update AI provider routing section)

- [ ] **Step 1: Create feature summary**

```markdown
# Feature: AI Provider + MCP + Chat

**Status:** Complete
**Last Updated:** YYYY-MM-DD

## What It Does
Multi-provider AI chat interface with MCP tool integration for accessing Planning Center
data. Users configure their own API key (Anthropic/OpenAI/Google), choose a model, and
chat with an AI assistant that can search people, view services, and manage church data.

## Key Files
- `src/lib/ai/providers.ts` — Runtime provider factory (creates model from user's stored key)
- `src/lib/ai/models.ts` — Model options metadata for UI
- `src/lib/chat/persist.ts` — Conversation and message CRUD
- `src/app/api/chat/route.ts` — Chat streaming route (AI SDK + MCP + persistence)
- `src/app/api/settings/route.ts` — Settings API (save provider, encrypted key, model)
- `src/components/chat/chat-interface.tsx` — useChat() client component
- `src/components/chat/message-bubble.tsx` — Message display with tool call support
- `src/components/settings/api-key-form.tsx` — API key entry form
- `src/app/(app)/settings/page.tsx` — Settings page
- `src/app/(app)/chat/[id]/page.tsx` — Conversation resume page

## Design Decisions
- BYO API key — no server-side AI key, reduces cost/liability
- Fernet encryption for API keys at rest
- MCP transport type 'sse' for pco-mcp compatibility
- Graceful MCP degradation — chat works without PCO data if MCP fails
- Auto-title conversations from first assistant response
- maxSteps: 5 for multi-turn tool calling
- Minimal system prompt (rules system comes in Plan 3)

## Known Limitations
- No conversation deletion
- No message editing or regeneration
- Auto-title uses first 100 chars (not AI-generated summary)
- No token usage tracking
- No rate limiting on chat route
- Settings page has no "test connection" button
- Sidebar conversation list is not real-time (requires page refresh)
```

- [ ] **Step 2: Update DEV_QUEUE.md**

Move Plan 2 to Done. Next up: Plan 3 (Rules System).

- [ ] **Step 3: Update CLAUDE.md project structure**

Add new files to the project structure tree:
```
src/
  lib/
    ai/
      providers.ts    # Runtime AI provider factory
      models.ts       # Model options metadata
    chat/
      persist.ts      # Conversation/message CRUD
  app/
    api/
      chat/
        route.ts      # Streaming chat endpoint
      settings/
        route.ts      # Settings API
    (app)/
      chat/
        [id]/
          page.tsx    # Conversation resume
      settings/
        page.tsx      # API key + provider settings
  components/
    chat/
      chat-interface.tsx  # useChat() client component
      message-bubble.tsx  # Message display
    settings/
      api-key-form.tsx    # API key form
```

- [ ] **Step 4: Update AGENTS.md AI provider routing section**

Update the "How AI Provider Routing Works" section to be accurate:
```
1. User saves api_provider + API key via Settings page (/settings)
2. Key is Fernet-encrypted, stored in User.apiKeyEnc
3. On chat request: decrypt key, create provider via createModel() in src/lib/ai/providers.ts
4. Connect to pco-mcp via @ai-sdk/mcp with user's PCO access token
5. Stream response via streamText() in src/app/api/chat/route.ts
6. Persist conversation and messages via src/lib/chat/persist.ts
```

- [ ] **Step 5: Commit**

```bash
git add docs/ DEV_QUEUE.md CLAUDE.md AGENTS.md
git commit -m "docs: add Plan 2 feature summary and update project documentation"
```
