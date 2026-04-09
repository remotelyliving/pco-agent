# Context-Aware Conversation Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn users when conversations approach context window limits and offer seamless compaction into a fresh conversation with a carried-over summary.

**Architecture:** Server detects threshold using real token usage from `streamText()` `onFinish`, pipes a `nearLimit` flag to the client via `messageMetadata`. Client renders an inline amber banner offering to start fresh. A new `/api/conversations/[id]/compact` endpoint generates a summary, creates a new conversation, and redirects.

**Tech Stack:** Vercel AI SDK v6 (`streamText`, `generateText`, `messageMetadata`), Prisma (schema migration for `MessageRole.summary`), React, Tailwind CSS, localStorage

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/ai/models.ts` | Add `contextWindow` to ModelOption, add `getContextWindow()` helper |
| `tests/lib/ai/models.test.ts` | Tests for contextWindow metadata and getContextWindow() |
| `src/lib/chat/context-warning.ts` | Pure function: `checkNearLimit(totalTokens, contextWindow)` |
| `tests/lib/chat/context-warning.test.ts` | Tests for threshold logic |
| `prisma/schema.prisma` | Add `summary` to `MessageRole` enum |
| `src/app/api/chat/route.ts` | Use `totalUsage`, compute nearLimit, pipe via `messageMetadata`, inject summary into system prompt |
| `src/components/chat/context-warning-banner.tsx` | Amber banner with "Start fresh chat" and "Continue anyway" |
| `src/components/chat/chat-interface.tsx` | Read message metadata, render banner, handle compact flow |
| `src/app/api/conversations/[id]/compact/route.ts` | POST endpoint: generate summary, create new conversation |
| `src/lib/chat/persist.ts` | Add `getSummaryMessage()` helper |
| `tests/lib/chat/persist.test.ts` | Test for getSummaryMessage() |
| `src/proxy.ts` | Add rate limit for compact endpoint |

---

### Task 1: Add Context Window Metadata to Models

**Files:**
- Modify: `src/lib/ai/models.ts`
- Modify: `tests/lib/ai/models.test.ts`

- [ ] **Step 1: Write failing tests for contextWindow and getContextWindow()**

Add to `tests/lib/ai/models.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MODEL_OPTIONS, getDefaultModel, getContextWindow } from '@/lib/ai/models';

// ... existing tests ...

describe('contextWindow metadata', () => {
  it('every model has a contextWindow', () => {
    for (const model of MODEL_OPTIONS) {
      expect(model.contextWindow).toBeGreaterThan(0);
    }
  });

  it('Haiku has 200K context', () => {
    const haiku = MODEL_OPTIONS.find((m) => m.id === 'claude-haiku-4-5-20251001');
    expect(haiku?.contextWindow).toBe(200_000);
  });

  it('Opus has 1M context', () => {
    const opus = MODEL_OPTIONS.find((m) => m.id === 'claude-opus-4-6');
    expect(opus?.contextWindow).toBe(1_000_000);
  });
});

describe('getContextWindow', () => {
  it('returns context window for known model', () => {
    expect(getContextWindow('claude-sonnet-4-6')).toBe(1_000_000);
  });

  it('returns 200000 fallback for unknown model', () => {
    expect(getContextWindow('unknown-model')).toBe(200_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/ai/models.test.ts`
Expected: FAIL — `getContextWindow` is not exported, `contextWindow` does not exist on ModelOption

- [ ] **Step 3: Add contextWindow to ModelOption and all models**

In `src/lib/ai/models.ts`, update the interface and all model entries:

```typescript
export interface ModelOption {
  id: string;
  provider: string;
  name: string;
  description: string;
  isDefault?: boolean;
  supportsTools?: boolean; // false = cannot use MCP tools reliably
  contextWindow: number;  // max input tokens
}
```

Update each model in `MODEL_OPTIONS`:

```typescript
export const MODEL_OPTIONS: ModelOption[] = [
  // Anthropic
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.6',
    description: 'Best balance of speed and intelligence',
    isDefault: true,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    name: 'Claude Opus 4.6',
    description: 'Most capable, best for complex tasks',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    name: 'Claude Haiku 4.5',
    description: 'Fastest and most affordable',
    contextWindow: 200_000,
  },
  // OpenAI
  {
    id: 'gpt-4.1',
    provider: 'openai',
    name: 'GPT-4.1',
    description: 'Capable with large context window',
    isDefault: true,
    contextWindow: 1_000_000,
  },
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    name: 'GPT-4.1 Mini',
    description: 'Good and affordable',
    contextWindow: 1_000_000,
  },
  {
    id: 'gpt-4.1-nano',
    provider: 'openai',
    name: 'GPT-4.1 Nano',
    description: 'Cheapest — no Planning Center access',
    supportsTools: false,
    contextWindow: 1_000_000,
  },
  // Google
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    name: 'Gemini 2.5 Flash',
    description: 'Fast and capable, free tier available',
    isDefault: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    name: 'Gemini 2.5 Pro',
    description: 'Most capable Google model',
    contextWindow: 1_048_576,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'google',
    name: 'Gemini 2.5 Flash-Lite',
    description: 'Cheapest — no Planning Center access',
    supportsTools: false,
    contextWindow: 1_048_576,
  },
];
```

Add the helper after the existing `modelSupportsTools` function:

```typescript
const DEFAULT_CONTEXT_WINDOW = 200_000;

export function getContextWindow(modelId: string): number {
  const model = MODEL_OPTIONS.find((m) => m.id === modelId);
  return model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/ai/models.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/models.ts tests/lib/ai/models.test.ts
git commit -m "feat: add contextWindow metadata to model options"
```

---

### Task 2: Context Warning Threshold Logic

**Files:**
- Create: `src/lib/chat/context-warning.ts`
- Create: `tests/lib/chat/context-warning.test.ts`

- [ ] **Step 1: Write failing tests for checkNearLimit()**

Create `tests/lib/chat/context-warning.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkNearLimit } from '@/lib/chat/context-warning';

describe('checkNearLimit', () => {
  it('returns false when well under limit', () => {
    // 200K used of 1M context — plenty of room
    const result = checkNearLimit(200_000, 1_000_000);
    expect(result.nearLimit).toBe(false);
    expect(result.remaining).toBe(800_000);
  });

  it('triggers at 10% remaining for large context (1M)', () => {
    // 910K used of 1M = 90K remaining, threshold is max(50K, 100K) = 100K
    const result = checkNearLimit(910_000, 1_000_000);
    expect(result.nearLimit).toBe(true);
    expect(result.remaining).toBe(90_000);
  });

  it('does not trigger at 11% remaining for large context', () => {
    // 890K used of 1M = 110K remaining, threshold is 100K
    const result = checkNearLimit(890_000, 1_000_000);
    expect(result.nearLimit).toBe(false);
    expect(result.remaining).toBe(110_000);
  });

  it('triggers at 50K floor for small context (200K)', () => {
    // 160K used of 200K = 40K remaining, threshold is max(50K, 20K) = 50K
    const result = checkNearLimit(160_000, 200_000);
    expect(result.nearLimit).toBe(true);
    expect(result.remaining).toBe(40_000);
  });

  it('does not trigger above 50K floor for small context', () => {
    // 140K used of 200K = 60K remaining, threshold is 50K
    const result = checkNearLimit(140_000, 200_000);
    expect(result.nearLimit).toBe(false);
    expect(result.remaining).toBe(60_000);
  });

  it('returns false when totalTokens is 0', () => {
    const result = checkNearLimit(0, 1_000_000);
    expect(result.nearLimit).toBe(false);
    expect(result.remaining).toBe(1_000_000);
  });

  it('triggers when totalTokens exceeds contextWindow', () => {
    // Edge case: model reported more tokens than context window
    const result = checkNearLimit(1_100_000, 1_000_000);
    expect(result.nearLimit).toBe(true);
    expect(result.remaining).toBe(-100_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/chat/context-warning.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement checkNearLimit()**

Create `src/lib/chat/context-warning.ts`:

```typescript
const MIN_REMAINING_FLOOR = 50_000;
const WARNING_RATIO = 0.10;

export interface NearLimitResult {
  nearLimit: boolean;
  remaining: number;
}

export function checkNearLimit(totalTokens: number, contextWindow: number): NearLimitResult {
  const remaining = contextWindow - totalTokens;
  const threshold = Math.max(MIN_REMAINING_FLOOR, contextWindow * WARNING_RATIO);
  return {
    nearLimit: remaining < threshold,
    remaining,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/chat/context-warning.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/context-warning.ts tests/lib/chat/context-warning.test.ts
git commit -m "feat: context warning threshold logic with floor + ratio"
```

---

### Task 3: Add `summary` to MessageRole Enum

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `summary` to the MessageRole enum**

In `prisma/schema.prisma`, update the `MessageRole` enum (currently at lines 41-48):

```prisma
enum MessageRole {
  user
  assistant
  system
  tool
  summary

  @@schema("agent")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add-summary-message-role`
Expected: Migration created and applied successfully

- [ ] **Step 3: Verify Prisma client generated correctly**

Run: `npx prisma generate`
Expected: `Prisma Client generated` — verify `MessageRole` now includes `summary`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add summary message role for conversation compaction"
```

---

### Task 4: Add `getSummaryMessage()` to Persist Layer

**Files:**
- Modify: `src/lib/chat/persist.ts`
- Modify: `tests/lib/chat/persist.test.ts`

- [ ] **Step 1: Write failing test for getSummaryMessage()**

Add to `tests/lib/chat/persist.test.ts` (this file already exists with `vi.mock` for `@/lib/db`):

```typescript
import { getSummaryMessage } from '@/lib/chat/persist';

// Add inside the existing describe block or add a new one:
describe('getSummaryMessage', () => {
  it('returns the summary message for a conversation', async () => {
    const mockSummary = {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'summary',
      content: 'Summary of previous conversation...',
      toolCalls: null,
      tokenCount: null,
      createdAt: new Date(),
    };

    const { prisma } = await import('@/lib/db');
    vi.mocked(prisma.message.findFirst).mockResolvedValue(mockSummary as never);

    const result = await getSummaryMessage('conv-1');
    expect(result).toEqual(mockSummary);
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 'conv-1',
        role: 'summary',
      },
    });
  });

  it('returns null when no summary message exists', async () => {
    const { prisma } = await import('@/lib/db');
    vi.mocked(prisma.message.findFirst).mockResolvedValue(null);

    const result = await getSummaryMessage('conv-no-summary');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/chat/persist.test.ts`
Expected: FAIL — `getSummaryMessage` is not exported

- [ ] **Step 3: Implement getSummaryMessage()**

Add to `src/lib/chat/persist.ts`:

```typescript
export async function getSummaryMessage(conversationId: string) {
  return prisma.message.findFirst({
    where: {
      conversationId,
      role: MessageRole.summary,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/chat/persist.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/persist.ts tests/lib/chat/persist.test.ts
git commit -m "feat: add getSummaryMessage() for conversation compaction"
```

---

### Task 5: Wire Up Server-Side Threshold Detection in Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts`

This task modifies the chat route to:
1. Use `totalUsage` instead of `usage` in `onFinish`
2. Compute `nearLimit` using `checkNearLimit()`
3. Inject summary context for compacted conversations
4. Pipe metadata to client via `messageMetadata`

- [ ] **Step 1: Add imports at the top of `src/app/api/chat/route.ts`**

Add these imports alongside the existing ones (around line 17):

```typescript
import { getContextWindow } from '@/lib/ai/models';
import { checkNearLimit } from '@/lib/chat/context-warning';
import { getSummaryMessage } from '@/lib/chat/persist';
```

Note: `getContextWindow` import joins the existing `getDefaultModel, modelSupportsTools` import from `@/lib/ai/models`. Combine them into one import line:

```typescript
import { getDefaultModel, modelSupportsTools, getContextWindow } from '@/lib/ai/models';
```

- [ ] **Step 2: Add summary injection after system prompt is built**

After the `buildSystemPrompt()` call (currently line 186-190), add summary detection:

```typescript
    systemPrompt = buildSystemPrompt(
      typeof assembledRules === 'string' ? assembledRules : '',
      memoryPrompt,
      mcpConnected,
    );

    // Inject summary context for compacted conversations
    if (existingConvId) {
      const summaryMessage = await getSummaryMessage(existingConvId);
      if (summaryMessage) {
        systemPrompt += `\n\n## Previous Conversation Context\n\n${summaryMessage.content}`;
      }
    }
```

- [ ] **Step 3: Change `onFinish` to use `totalUsage` and compute nearLimit**

Replace the `onFinish` callback in `streamText()`. The current signature is `({ text, toolCalls, usage })`. Change to:

```typescript
    onFinish: async ({ text, toolCalls, totalUsage }) => {
      try {
        // Save assistant message
        await saveMessage({
          conversationId,
          role: MessageRole.assistant,
          content: text || '',
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
          tokenCount: totalUsage?.totalTokens ?? null,
        });
```

Note: The rest of `onFinish` (auto-title, memory extraction) stays unchanged. Only the destructured parameter name changes from `usage` to `totalUsage`, and `usage?.totalTokens` becomes `totalUsage?.totalTokens`.

- [ ] **Step 4: Compute nearLimit and store for messageMetadata**

Add a mutable variable before the `streamText()` call (around line 293):

```typescript
  let nearLimitMetadata: { nearLimit: boolean; remaining: number; contextWindow: number } | undefined;
```

At the end of the `onFinish` callback (inside the try block, after memory extraction), add:

```typescript
        // Compute context warning
        if (totalUsage?.totalTokens) {
          const ctxWindow = getContextWindow(modelId);
          const limitCheck = checkNearLimit(totalUsage.totalTokens, ctxWindow);
          if (limitCheck.nearLimit) {
            nearLimitMetadata = {
              nearLimit: true,
              remaining: limitCheck.remaining,
              contextWindow: ctxWindow,
            };
          }
        }
```

- [ ] **Step 5: Pass messageMetadata to toUIMessageStreamResponse()**

Replace the current `return` statement (line 362-367):

```typescript
  return result.toUIMessageStreamResponse({
    messageMetadata: nearLimitMetadata,
    headers: {
      'x-conversation-id': conversationId,
      'x-request-id': requestId,
    },
  });
```

- [ ] **Step 6: Verify build passes**

Run: `npx next build`
Expected: Build succeeds with no type errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: server-side context warning detection with messageMetadata"
```

---

### Task 6: Compact API Endpoint

**Files:**
- Create: `src/app/api/conversations/[id]/compact/route.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Create the compact endpoint**

Create `src/app/api/conversations/[id]/compact/route.ts`:

```typescript
import { generateText } from 'ai';
import { MessageRole } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { decrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import { createModel } from '@/lib/ai/providers';
import { getDefaultModel } from '@/lib/ai/models';
import {
  createConversation,
  getConversation,
  saveMessage,
  updateConversationTitle,
} from '@/lib/chat/persist';

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });
  const { id: conversationId } = await params;

  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Verify conversation ownership
  const conversation = await getConversation(conversationId, session.user.agentUserId);
  if (!conversation) {
    return Response.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // 3. Load user + API key
  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
  });

  if (!user?.apiProvider || !user?.apiKeyEnc) {
    return Response.json(
      { error: 'No API key configured.' },
      { status: 400 },
    );
  }

  const apiKey = decrypt(user.apiKeyEnc, getEncryptionKey());
  const modelId =
    user.preferredModel ||
    getDefaultModel(user.apiProvider)?.id ||
    'claude-sonnet-4-6';

  // 4. Fetch all messages
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });

  if (messages.length === 0) {
    return Response.json({ error: 'No messages to summarize' }, { status: 400 });
  }

  // 5. Generate summary
  const transcript = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  // Cap transcript to ~8000 chars to keep the summary call cheap
  const maxTranscript = 8000;
  const truncatedTranscript =
    transcript.length > maxTranscript
      ? transcript.slice(0, maxTranscript) + '\n\n... [earlier messages truncated]'
      : transcript;

  let summaryText: string;
  try {
    const model = createModel(user.apiProvider, modelId, apiKey);
    const { text } = await generateText({
      model,
      prompt: `Summarize this conversation concisely. Capture: what the user was working on, key decisions made, any outstanding questions or next steps. Write this as a briefing for a new conversation — not a transcript. Keep it under 500 words.\n\n${truncatedTranscript}`,
    });
    summaryText = text;
  } catch (error) {
    log.error('[compact] Summary generation failed', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Could not generate summary. You can continue this conversation or start a new one from the sidebar." },
      { status: 500 },
    );
  }

  // 6. Create new conversation with summary
  const originalTitle = conversation.title || 'Untitled';
  const newConversation = await createConversation(session.user.agentUserId);
  await updateConversationTitle(newConversation.id, `Continued: ${originalTitle}`);

  await saveMessage({
    conversationId: newConversation.id,
    role: MessageRole.summary,
    content: summaryText,
  });

  log.info('[compact] Conversation compacted', {
    originalConversationId: conversationId,
    newConversationId: newConversation.id,
    messageCount: messages.length,
  });

  return Response.json({ newConversationId: newConversation.id });
}
```

- [ ] **Step 2: Add rate limit for compact endpoint**

In `src/proxy.ts`, add to the `RATE_LIMITS` object (around line 19):

```typescript
  '/api/conversations/:id/compact': 5,
```

And add a route normalization rule in the `normalizeRoute()` function (around line 43, before the existing conversations rule):

```typescript
  if (/^\/api\/conversations\/[^/]+\/compact$/.test(pathname)) return '/api/conversations/:id/compact';
```

This line must come **before** the existing `conversations/:id` rule so `/compact` doesn't get caught by the generic `:id` pattern.

- [ ] **Step 3: Verify build passes**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/api/conversations/[id]/compact/route.ts src/proxy.ts
git commit -m "feat: compact endpoint for conversation summary + handoff"
```

---

### Task 7: Context Warning Banner Component

**Files:**
- Create: `src/components/chat/context-warning-banner.tsx`

- [ ] **Step 1: Create the banner component**

Create `src/components/chat/context-warning-banner.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ContextWarningBanner({
  conversationId,
  onDismiss,
}: {
  conversationId: string;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompact() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/compact`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Something went wrong.' }));
        setError(data.error);
        setLoading(false);
        return;
      }
      const { newConversationId } = await res.json();
      router.push(`/chat/${newConversationId}`);
    } catch {
      setError("Couldn't create the summary. You can continue this chat or start a fresh one from the sidebar.");
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-800">
          I&apos;m getting close to the limit of what I can keep track of in this
          conversation. Want to start a fresh chat? I&apos;ll carry over a summary so
          we don&apos;t lose context.
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={handleCompact}
            disabled={loading}
            className="min-h-[48px] bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? 'Creating summary...' : 'Start fresh chat'}
          </Button>
          <button
            onClick={onDismiss}
            disabled={loading}
            className="text-sm text-amber-600 hover:text-amber-800 underline"
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/context-warning-banner.tsx
git commit -m "feat: context warning banner with compact + dismiss actions"
```

---

### Task 8: Integrate Banner into Chat Interface

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`
- Modify: `src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Add nearLimit detection and banner state to ChatInterface**

In `src/components/chat/chat-interface.tsx`, add imports at the top:

```typescript
import { ContextWarningBanner } from '@/components/chat/context-warning-banner';
```

Add state for the warning banner inside the `ChatInterface` component (after the existing `consentDismissed` state, around line 106):

```typescript
  const [warningDismissed, setWarningDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`context-warning-dismissed:${conversationId}`) === 'true';
  });
```

Add a function to check if the last assistant message has `nearLimit`:

```typescript
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').at(-1);
  const showContextWarning =
    !warningDismissed &&
    convId != null &&
    lastAssistantMessage?.metadata != null &&
    typeof lastAssistantMessage.metadata === 'object' &&
    'nearLimit' in lastAssistantMessage.metadata &&
    (lastAssistantMessage.metadata as { nearLimit?: boolean }).nearLimit === true;
```

Add the dismiss handler:

```typescript
  function dismissContextWarning() {
    setWarningDismissed(true);
    if (convId) {
      localStorage.setItem(`context-warning-dismissed:${convId}`, 'true');
    }
  }
```

- [ ] **Step 2: Render the banner after the last message**

In the JSX, add the banner after the messages map and before the streaming indicator (around line 258). The section currently looks like:

```tsx
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
```

Change to:

```tsx
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {showContextWarning && convId && (
          <ContextWarningBanner
            conversationId={convId}
            onDismiss={dismissContextWarning}
          />
        )}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
```

- [ ] **Step 3: Render summary messages as a collapsed block in MessageBubble**

In `src/components/chat/message-bubble.tsx`, the component currently checks `message.role === 'user'` to decide styling. Add handling for summary messages at the start of the component (before the return):

Add a check at the top of `MessageBubble`:

```tsx
export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  // Summary messages from compacted conversations render as a collapsed block
  if ((message as { role: string }).role === 'summary') {
    const textPart = message.parts.find((p) => p.type === 'text');
    const text = textPart && 'text' in textPart ? textPart.text : '';
    return <SummaryBlock text={text} />;
  }

  return (
    // ... existing JSX unchanged
  );
}
```

Add the `SummaryBlock` component in the same file, before `MessageBubble`:

```tsx
function SummaryBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-sm font-medium text-gray-600"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9656;</span>
        Summary from previous conversation
      </button>
      {expanded && (
        <div className="mt-2 prose prose-sm max-w-none text-gray-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
```

Add `useState` to the imports at the top of `message-bubble.tsx`:

```typescript
import { useState } from 'react';
```

- [ ] **Step 4: Verify build passes**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/chat-interface.tsx src/components/chat/message-bubble.tsx
git commit -m "feat: integrate context warning banner and summary rendering"
```

---

### Task 9: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (existing + new tests)

- [ ] **Step 2: Run lint and type check**

Run: `npx eslint . && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Run production build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Final commit if any fixes needed**

If any fixes were needed in steps 1-3, commit them:

```bash
git add -A
git commit -m "fix: address lint/type issues from context freshness feature"
```
