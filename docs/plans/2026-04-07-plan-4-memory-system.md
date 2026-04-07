# Plan 4: Memory System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an org-level memory system that automatically extracts key-value facts from conversations and includes them in the system prompt, giving the AI persistent context about the church.

**Architecture:** After each assistant response, a cheap follow-up AI call (using the cheapest available model) extracts structured facts from the conversation. Facts are stored as org-level key-value pairs in the Memory table (existing Prisma model). On each chat request, relevant memories are retrieved and injected into the system prompt above the rules. An admin memory management page allows viewing, editing, and deleting stored facts.

**Tech Stack:** Vercel AI SDK v6 (`generateObject` for structured extraction), Prisma (existing Memory model), Next.js API routes, React

---

## File Structure (this plan only)

```
src/
  lib/
    memory/
      extract.ts         # extractMemories() — post-response fact extraction via AI
      retrieve.ts        # getOrgMemories() — fetch memories for system prompt
      queries.ts         # Memory CRUD operations
  app/
    api/
      memory/
        route.ts         # GET (list) + POST (create manual memory)
        [id]/
          route.ts       # PATCH (update) + DELETE
    (app)/
      memory/
        page.tsx         # Memory management page (admin only)
  components/
    memory/
      memory-list.tsx    # Client component — list memories with edit/delete
tests/
  lib/
    memory/
      extract.test.ts
      retrieve.test.ts
      queries.test.ts
```

---

## Task 1: Memory CRUD Queries (TDD)

**Files:**
- Create: `src/lib/memory/queries.ts`
- Create: `tests/lib/memory/queries.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/memory/queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  memory: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { getOrgMemories, upsertMemory, updateMemory, deleteMemory } from '@/lib/memory/queries';

describe('memory queries', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getOrgMemories returns all memories for an org', async () => {
    mockPrisma.memory.findMany.mockResolvedValue([
      { id: 'm1', key: 'pastor_name', value: 'John Smith', source: 'auto' },
    ]);
    const result = await getOrgMemories('org-1');
    expect(result).toHaveLength(1);
    expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1' },
      orderBy: { key: 'asc' },
    });
  });

  it('upsertMemory creates or updates a memory', async () => {
    mockPrisma.memory.upsert.mockResolvedValue({
      id: 'm1', orgId: 'org-1', key: 'pastor_name', value: 'John Smith', source: 'auto',
    });
    await upsertMemory('org-1', 'pastor_name', 'John Smith', 'auto');
    expect(mockPrisma.memory.upsert).toHaveBeenCalledWith({
      where: { orgId_key: { orgId: 'org-1', key: 'pastor_name' } },
      update: { value: 'John Smith', source: 'auto' },
      create: { orgId: 'org-1', key: 'pastor_name', value: 'John Smith', source: 'auto' },
    });
  });

  it('updateMemory updates value', async () => {
    mockPrisma.memory.update.mockResolvedValue({ id: 'm1' });
    await updateMemory('m1', { value: 'Updated' });
    expect(mockPrisma.memory.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { value: 'Updated' },
    });
  });

  it('deleteMemory removes a memory', async () => {
    mockPrisma.memory.delete.mockResolvedValue({ id: 'm1' });
    await deleteMemory('m1');
    expect(mockPrisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });
});
```

- [ ] **Step 2: Implement queries.ts**

```typescript
// src/lib/memory/queries.ts
import { prisma } from '@/lib/db';

export async function getOrgMemories(orgId: string) {
  return prisma.memory.findMany({
    where: { orgId },
    orderBy: { key: 'asc' },
  });
}

export async function upsertMemory(orgId: string, key: string, value: string, source: string = 'auto') {
  return prisma.memory.upsert({
    where: { orgId_key: { orgId, key } },
    update: { value, source },
    create: { orgId, key, value, source },
  });
}

export async function updateMemory(id: string, data: { value?: string; key?: string }) {
  return prisma.memory.update({ where: { id }, data });
}

export async function deleteMemory(id: string) {
  return prisma.memory.delete({ where: { id } });
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/memory/ tests/lib/memory/
git commit -m "feat: add memory CRUD queries"
```

---

## Task 2: Memory Retrieval for System Prompt (TDD)

**Files:**
- Create: `src/lib/memory/retrieve.ts`
- Create: `tests/lib/memory/retrieve.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/memory/retrieve.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  memory: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { getMemoryPrompt } from '@/lib/memory/retrieve';

describe('getMemoryPrompt', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty string when no memories exist', async () => {
    mockPrisma.memory.findMany.mockResolvedValue([]);
    const result = await getMemoryPrompt('org-1');
    expect(result).toBe('');
  });

  it('formats memories as key-value pairs', async () => {
    mockPrisma.memory.findMany.mockResolvedValue([
      { key: 'pastor_name', value: 'John Smith' },
      { key: 'sunday_service_time', value: '10:00 AM' },
    ]);
    const result = await getMemoryPrompt('org-1');
    expect(result).toContain('pastor_name: John Smith');
    expect(result).toContain('sunday_service_time: 10:00 AM');
  });

  it('includes a header line', async () => {
    mockPrisma.memory.findMany.mockResolvedValue([
      { key: 'key1', value: 'val1' },
    ]);
    const result = await getMemoryPrompt('org-1');
    expect(result).toContain('Known facts about this church');
  });
});
```

- [ ] **Step 2: Implement retrieve.ts**

```typescript
// src/lib/memory/retrieve.ts
import { prisma } from '@/lib/db';

export async function getMemoryPrompt(orgId: string): Promise<string> {
  const memories = await prisma.memory.findMany({
    where: { orgId },
    orderBy: { key: 'asc' },
  });

  if (memories.length === 0) return '';

  const lines = memories.map((m) => `- ${m.key}: ${m.value}`);
  return `## Known facts about this church\n\n${lines.join('\n')}`;
}
```

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add src/lib/memory/retrieve.ts tests/lib/memory/retrieve.test.ts
git commit -m "feat: add memory retrieval for system prompt"
```

---

## Task 3: Memory Extraction After Chat Responses

**Files:**
- Create: `src/lib/memory/extract.ts`
- Create: `tests/lib/memory/extract.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/memory/extract.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

const mockUpsertMemory = vi.fn();
vi.mock('@/lib/memory/queries', () => ({
  upsertMemory: mockUpsertMemory,
}));

import { extractAndSaveMemories } from '@/lib/memory/extract';
import { generateObject } from 'ai';

const mockGenerateObject = vi.mocked(generateObject);

describe('extractAndSaveMemories', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls generateObject with conversation context', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [] },
      usage: { totalTokens: 10 },
    } as any);

    await extractAndSaveMemories(
      'org-1',
      'What time is Sunday service?',
      'Sunday service is at 10:00 AM.',
      'anthropic',
      'test-key',
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('saves extracted facts via upsertMemory', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        facts: [
          { key: 'sunday_service_time', value: '10:00 AM' },
          { key: 'service_count', value: '2 services per Sunday' },
        ],
      },
      usage: { totalTokens: 50 },
    } as any);

    await extractAndSaveMemories(
      'org-1',
      'What time is Sunday service?',
      'Sunday service is at 10:00 AM. We have 2 services per Sunday.',
      'anthropic',
      'test-key',
    );

    expect(mockUpsertMemory).toHaveBeenCalledTimes(2);
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'sunday_service_time', '10:00 AM', 'auto');
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'service_count', '2 services per Sunday', 'auto');
  });

  it('does nothing when no facts extracted', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [] },
      usage: { totalTokens: 10 },
    } as any);

    await extractAndSaveMemories('org-1', 'Hi', 'Hello!', 'anthropic', 'test-key');
    expect(mockUpsertMemory).not.toHaveBeenCalled();
  });

  it('does not throw on extraction error', async () => {
    mockGenerateObject.mockRejectedValue(new Error('API error'));

    // Should not throw — extraction is best-effort
    await expect(
      extractAndSaveMemories('org-1', 'Hi', 'Hello!', 'anthropic', 'test-key')
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Implement extract.ts**

```typescript
// src/lib/memory/extract.ts
import { generateObject } from 'ai';
import { z } from 'zod';
import { createModel } from '@/lib/ai/providers';
import { upsertMemory } from '@/lib/memory/queries';

const FactsSchema = z.object({
  facts: z.array(
    z.object({
      key: z.string().describe('A short snake_case identifier for the fact'),
      value: z.string().describe('The fact value'),
    })
  ),
});

export async function extractAndSaveMemories(
  orgId: string,
  userMessage: string,
  assistantMessage: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  try {
    // Use the cheapest model for extraction
    const cheapModelId = getCheapModel(provider);
    const model = createModel(provider, cheapModelId, apiKey);

    const { object } = await generateObject({
      model,
      schema: FactsSchema,
      prompt: `Extract any factual information about this church or organization from the following conversation exchange. Only extract concrete, reusable facts (names, times, counts, preferences). Do NOT extract opinions, questions, or conversation-specific context.

User: ${userMessage}
Assistant: ${assistantMessage}

Return an empty facts array if there are no concrete facts to extract.`,
    });

    if (object.facts.length === 0) return;

    for (const fact of object.facts) {
      await upsertMemory(orgId, fact.key, fact.value, 'auto');
    }
  } catch (error) {
    // Memory extraction is best-effort — never fail the chat flow
    console.error('[memory] Extraction failed:', error);
  }
}

function getCheapModel(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'claude-haiku-4-5-20251001';
    case 'openai': return 'gpt-4o-mini';
    case 'google': return 'gemini-2.0-flash';
    default: return 'claude-haiku-4-5-20251001';
  }
}
```

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add src/lib/memory/extract.ts tests/lib/memory/extract.test.ts
git commit -m "feat: add post-response memory extraction via AI"
```

---

## Task 4: Integrate Memory into Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add memory retrieval to system prompt**

Import `getMemoryPrompt` from `@/lib/memory/retrieve` and `extractAndSaveMemories` from `@/lib/memory/extract`.

Before the `streamText` call, fetch memory prompt:
```typescript
const memoryPrompt = await getMemoryPrompt(session.user.orgId);
```

Update `buildSystemPrompt` to accept memory:
```typescript
function buildSystemPrompt(rules: string, memory: string): string {
  let prompt = `You are a helpful assistant for church staff who use Planning Center Online.
...`;

  if (memory) {
    prompt += `\n\n${memory}`;
  }

  if (rules) {
    prompt += `\n\n## Rules\n\nFollow these rules in all your responses:\n${rules}`;
  }

  return prompt;
}
```

In the `onFinish` callback, after saving the assistant message, trigger memory extraction (fire-and-forget):
```typescript
onFinish: async ({ text, toolCalls }) => {
  // Save assistant message
  await saveMessage({ ... });

  // Extract memories (fire-and-forget, don't block response)
  if (text && lastUserMessageText) {
    extractAndSaveMemories(
      session.user.orgId,
      lastUserMessageText,
      text,
      user.apiProvider,
      apiKey,
    ).catch((err) => console.error('[memory] Background extraction failed:', err));
  }

  // ... rest of onFinish
},
```

- [ ] **Step 2: Verify project builds**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: integrate memory into chat — retrieval in prompt, extraction on finish"
```

---

## Task 5: Memory API Routes + Admin UI

**Files:**
- Create: `src/app/api/memory/route.ts`
- Create: `src/app/api/memory/[id]/route.ts`
- Create: `src/app/(app)/memory/page.tsx`
- Create: `src/components/memory/memory-list.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Create memory API routes**

```typescript
// src/app/api/memory/route.ts
import { auth } from '@/lib/auth';
import { getOrgMemories, upsertMemory } from '@/lib/memory/queries';

export async function GET() {
  const session = await auth();
  if (!session?.user?.orgId) return new Response('Unauthorized', { status: 401 });

  const memories = await getOrgMemories(session.user.orgId);
  return Response.json({ memories });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.orgId || session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { key, value } = await req.json();
  if (!key || !value) return new Response('Key and value required', { status: 400 });

  const memory = await upsertMemory(session.user.orgId, key, value, 'manual');
  return Response.json(memory, { status: 201 });
}
```

```typescript
// src/app/api/memory/[id]/route.ts
import { auth } from '@/lib/auth';
import { updateMemory, deleteMemory } from '@/lib/memory/queries';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId || session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;
  const { key, value } = await req.json();
  const updated = await updateMemory(id, { key, value });
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.orgId || session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;
  await deleteMemory(id);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Create memory list component**

```tsx
// src/components/memory/memory-list.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Memory {
  id: string;
  key: string;
  value: string;
  source: string;
  updatedAt: string;
}

export function MemoryList({ isAdmin }: { isAdmin: boolean }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadMemories() {
    const res = await fetch('/api/memory');
    const data = await res.json();
    setMemories(data.memories);
  }

  useEffect(() => { loadMemories(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
    });
    setNewKey('');
    setNewValue('');
    setSaving(false);
    loadMemories();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    loadMemories();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Church Memory</h1>
        <p className="text-sm text-gray-500">
          Facts the AI remembers about your church. These are included in every conversation
          to give the assistant context.
        </p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add a Fact</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex gap-2">
              <Input
                placeholder="Key (e.g., pastor_name)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-1/3"
                required
              />
              <Input
                placeholder="Value (e.g., Pastor John Smith)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="flex-1"
                required
              />
              <Button type="submit" disabled={saving}>
                {saving ? '...' : 'Add'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stored Facts ({memories.length})</CardTitle>
          <CardDescription>
            Facts marked &quot;auto&quot; were learned from conversations.
            Facts marked &quot;manual&quot; were added by an admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memories.length === 0 ? (
            <p className="text-sm text-gray-400">
              No facts stored yet. The AI will learn facts from your conversations.
            </p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <span className="font-medium text-sm">{m.key}</span>
                    <span className="mx-2 text-gray-400">→</span>
                    <span className="text-sm">{m.value}</span>
                  </div>
                  <Badge variant="secondary">{m.source}</Badge>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create memory page**

```tsx
// src/app/(app)/memory/page.tsx
import { MemoryList } from '@/components/memory/memory-list';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function MemoryPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl p-6">
      <MemoryList isAdmin={session.user.role === 'admin'} />
    </div>
  );
}
```

- [ ] **Step 4: Add Memory link to sidebar**

Add alongside Rules and Settings in sidebar.

- [ ] **Step 5: Verify project builds**

- [ ] **Step 6: Commit**

```bash
git add src/app/api/memory/ src/app/\(app\)/memory/ src/components/memory/ src/components/sidebar.tsx
git commit -m "feat: add memory management UI and API routes"
```

---

## Task 6: Documentation + Dev Queue Update

**Files:**
- Create: `docs/features/memory-system/SUMMARY.md`
- Modify: `DEV_QUEUE.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: Create feature summary**

Cover key files, design decisions (org-scoped, auto extraction with cheap model, fire-and-forget, best-effort), known limitations (no per-user memory, no extraction rate limiting, no deduplication logic).

- [ ] **Step 2: Update DEV_QUEUE.md, CLAUDE.md, AGENTS.md**

Move Plan 4 to Done. Update project structure. Update "How Memory Works" in AGENTS.md.

- [ ] **Step 3: Commit**

```bash
git add docs/ DEV_QUEUE.md CLAUDE.md AGENTS.md
git commit -m "docs: add Plan 4 feature summary and update project documentation"
```