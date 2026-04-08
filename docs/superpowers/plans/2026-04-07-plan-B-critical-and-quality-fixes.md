# Plan B: Critical + Code Quality Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical bugs (onFinish error handling, Dockerfile chmod, token refresh recovery, markdown rendering, error boundaries, rule toggle restrictions) and code quality issues (req.json validation, memory extraction errors, input length validation, user-scoped memory).

**Architecture:** Each task is an independent fix targeting specific files. The only dependency is that Plan A (pino + proxy.ts) should be completed first, since some of these files import the logger.

**Tech Stack:** react-markdown, remark-gfm, Next.js App Router, Prisma, Vercel AI SDK

**Spec:** `docs/superpowers/specs/2026-04-07-audit-remediation-design.md` — Sections 1 and 3

**Prerequisites:** Plan A complete (pino logger, proxy.ts migration)

---

### Task 1: onFinish Error Handling in Chat Route

**Files:**
- Modify: `src/app/api/chat/route.ts:180-216`

- [ ] **Step 1: Wrap onFinish body in try/catch**

In `src/app/api/chat/route.ts`, wrap the entire `onFinish` callback body in a try/catch block:

```typescript
onFinish: async ({ text, toolCalls, usage }) => {
  try {
    // Save assistant message
    await saveMessage({
      conversationId,
      role: MessageRole.assistant,
      content: text || '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      tokenCount: usage?.totalTokens ?? null,
    });

    // Auto-title from first exchange
    if (!existingConvId && text) {
      const title = generateTitle(text);
      await updateConversationTitle(conversationId, title);
    }

    // Fire-and-forget memory extraction
    if (text && lastUserMessage?.role === 'user') {
      const userText = lastUserMessage.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      extractAndSaveMemories(
        session.user.orgId,
        session.user.agentUserId,
        userText,
        text,
        user.apiProvider!,
        apiKey,
      ).catch((err) => log.error('[chat] Memory extraction failed', {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  } catch (error) {
    log.error('[chat] onFinish failed — message may not be persisted', {
      conversationId,
      userId: session.user.agentUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
},
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "fix: wrap onFinish in try/catch to prevent silent data loss"
```

---

### Task 2: Dockerfile chmod

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Add chmod +x before USER line**

In `Dockerfile`, add `RUN chmod +x entrypoint.sh` between the `COPY entrypoint.sh ./` line and the `USER nextjs` line:

```dockerfile
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER nextjs
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "fix: make entrypoint.sh executable in Docker image"
```

---

### Task 3: Token Refresh Recovery

**Files:**
- Modify: `src/lib/auth.ts:186-214`

- [ ] **Step 1: Clear pcoAccessToken on refresh failure**

In `src/lib/auth.ts`, in the JWT callback's token refresh block, update the error handling to clear the expired token so downstream code can detect it:

Replace the error handling in the refresh block (both the `!response.ok` case and the `catch` block):

```typescript
if (expiresIn < 300) {
  try {
    const response = await fetch('https://api.planningcenteronline.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.pcoRefreshToken as string,
        client_id: process.env.PCO_CLIENT_ID!,
        client_secret: process.env.PCO_CLIENT_SECRET!,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const tokens = await response.json();
      token.pcoAccessToken = tokens.access_token;
      token.pcoRefreshToken = tokens.refresh_token ?? token.pcoRefreshToken;
      token.pcoAccessTokenExpires = tokens.expires_in
        ? now + tokens.expires_in
        : token.pcoAccessTokenExpires;
    } else {
      logger.error('PCO token refresh failed', { status: response.status });
      // Clear expired token so chat route can detect and prompt re-login
      token.pcoAccessToken = undefined;
      token.pcoAccessTokenExpires = undefined;
    }
  } catch (error) {
    logger.error('PCO token refresh error', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Clear expired token so chat route can detect and prompt re-login
    token.pcoAccessToken = undefined;
    token.pcoAccessTokenExpires = undefined;
  }
}
```

- [ ] **Step 2: Add expired-token detection in chat route**

In `src/app/api/chat/route.ts`, after the `pcoAccessToken` extraction (around line 120-121), add a check:

```typescript
const jwtToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
const pcoAccessToken = jwtToken?.pcoAccessToken as string | undefined;

if (!pcoAccessToken && jwtToken?.pcoRefreshToken) {
  // Token existed but refresh failed — user needs to re-login
  return Response.json(
    { error: 'Your Planning Center session has expired. Please sign out and sign back in.' },
    { status: 401 },
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts src/app/api/chat/route.ts
git commit -m "fix: clear expired PCO token on refresh failure, prompt re-login"
```

---

### Task 4: Markdown Rendering in Message Bubble

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
npm install react-markdown remark-gfm
```

- [ ] **Step 2: Update message-bubble.tsx**

Replace `src/components/chat/message-bubble.tsx`:

```tsx
'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const TOOL_LABELS: Record<string, string> = {
  'list-people': 'Looking up people...',
  'get-person': 'Getting person details...',
  'search-people': 'Searching people...',
  'list-service-types': 'Checking service types...',
  'list-plans': 'Looking at service plans...',
  'get-plan': 'Getting plan details...',
  'list-team-members': 'Checking team members...',
  'list-songs': 'Looking up songs...',
};

function getToolLabel(toolName: string, isDone: boolean): string {
  if (isDone) {
    const base = TOOL_LABELS[toolName]?.replace('...', '') || toolName.replace(/-/g, ' ');
    return `✓ ${base.trim()}`;
  }
  return TOOL_LABELS[toolName] || `Working on ${toolName.replace(/-/g, ' ')}...`;
}

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            if (isUser) {
              return (
                <div key={i} className="whitespace-pre-wrap">
                  {part.text}
                </div>
              );
            }
            return (
              <div key={i} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-table:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type === 'dynamic-tool') {
            const isDone = part.state === 'output-available';
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">{getToolLabel(part.toolName, isDone)}</span>
              </div>
            );
          }
          if (part.type.startsWith('tool-')) {
            const toolName = part.type.slice(5);
            const p = part as { type: string; state: string };
            const isDone = p.state === 'output-available';
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">{getToolLabel(toolName, isDone)}</span>
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

Note: The `prose` classes require `@tailwindcss/typography`. Check if it's installed:

```bash
npm ls @tailwindcss/typography 2>/dev/null || npm install -D @tailwindcss/typography
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/message-bubble.tsx package.json package-lock.json
git commit -m "feat: render assistant messages as markdown with GFM support"
```

---

### Task 5: Error Boundary, Not Found, Loading

**Files:**
- Create: `src/app/error.tsx`
- Create: `src/app/not-found.tsx`
- Create: `src/app/(app)/loading.tsx`

- [ ] **Step 1: Create error.tsx**

Create `src/app/error.tsx`:

```tsx
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-gray-600">
          An unexpected error occurred. Please try again, or go back to the chat.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try Again
          </button>
          <a
            href="/chat"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go to Chat
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create not-found.tsx**

Create `src/app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/chat"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Go to Chat
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create loading.tsx**

Create `src/app/(app)/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/error.tsx src/app/not-found.tsx src/app/\(app\)/loading.tsx
git commit -m "feat: add error boundary, not-found page, and loading spinner"
```

---

### Task 6: System Rule Toggle Restriction

**Files:**
- Modify: `src/app/api/rules/toggle/route.ts`
- Modify: `src/components/rules/rule-list.tsx`

- [ ] **Step 1: Add admin check to toggle endpoint**

In `src/app/api/rules/toggle/route.ts`, after verifying the rule exists and belongs to the org, add:

```typescript
// System rules can only be toggled by admins
if (rule.ruleType === 'system' && session.user.role !== 'admin') {
  return Response.json(
    { error: 'Only administrators can modify system rules.' },
    { status: 403 },
  );
}
```

Insert this block after `if (rule.orgId && rule.orgId !== session.user.orgId)` check and before the `toggleRule` call.

- [ ] **Step 2: Fix isEnabled and disable toggle for non-admin system rules**

In `src/components/rules/rule-list.tsx`, make two changes:

**Fix isEnabled (line 57):** Change the own-rules check:

```typescript
// User's own rules: on by default, can be toggled off
if (rule.createdById === userId) return override !== false;
```

**Pass isAdmin to RuleSection and disable toggle:**

Update the `RuleSection` component signature to accept `isAdmin: boolean`:

```typescript
function RuleSection({
  title,
  rules,
  isEnabled,
  onToggle,
  onDelete,
  onReload,
  canDelete,
  userId,
  isAdmin,
}: {
  title: string;
  rules: Rule[];
  isEnabled: (rule: Rule) => boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onReload: () => void;
  canDelete: boolean;
  userId: string;
  isAdmin: boolean;
}) {
```

In the `RuleSection` rendering, update the `Switch` to be disabled for system rules when non-admin:

```tsx
<Switch
  checked={isEnabled(rule)}
  onCheckedChange={(checked) => onToggle(rule.id, checked)}
  disabled={rule.ruleType === 'system' && !isAdmin}
  aria-label={`Toggle rule: ${rule.content.slice(0, 50)}`}
/>
```

After the Switch, add a label for non-admin system rules:

```tsx
{rule.ruleType === 'system' && !isAdmin && (
  <span className="text-xs text-gray-400">Admin only</span>
)}
```

Update all three `<RuleSection>` calls in `RuleList` to pass `isAdmin`:

```tsx
<RuleSection
  title="System Defaults"
  rules={systemRules}
  isEnabled={isEnabled}
  onToggle={handleToggle}
  onDelete={handleDelete}
  onReload={loadRules}
  canDelete={false}
  userId={userId}
  isAdmin={isAdmin}
/>
```

(Same for Organization Rules and Personal Rules sections.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/rules/toggle/route.ts src/components/rules/rule-list.tsx
git commit -m "fix: restrict system rule toggle to admins, fix own-rule isEnabled"
```

---

### Task 7: req.json() Error Handling

**Files:**
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/rules/toggle/route.ts`
- Modify: `src/app/api/memory/route.ts`

- [ ] **Step 1: Fix settings POST**

In `src/app/api/settings/route.ts`, move the `req.json()` call inside the try block. Replace the section starting at line 48:

```typescript
try {
  const body = await req.json();
  const { apiProvider, apiKey, preferredModel } = body as {
    apiProvider: string;
    apiKey?: string;
    preferredModel?: string;
  };

  if (!apiProvider) {
    return new Response('Provider is required', { status: 400 });
  }
  // ... rest of existing try body
} catch (error) {
  if (error instanceof SyntaxError) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  log.error('[settings] Database error', { error: error instanceof Error ? error.message : String(error) });
  return Response.json(
    { error: 'An internal error occurred. Please try again.' },
    { status: 500 },
  );
}
```

- [ ] **Step 2: Fix rules toggle POST**

In `src/app/api/rules/toggle/route.ts`, move `req.json()` inside the try block and add SyntaxError handling:

```typescript
try {
  const body = await req.json();
  const { ruleId, enabled } = body as { ruleId: string; enabled: boolean };

  if (!ruleId || typeof enabled !== 'boolean') {
    return new Response('ruleId and enabled are required', { status: 400 });
  }

  // ... rest of existing try body
} catch (error) {
  if (error instanceof SyntaxError) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  log.error('[rules/toggle] Database error', { error: error instanceof Error ? error.message : String(error) });
  return Response.json(
    { error: 'An internal error occurred. Please try again.' },
    { status: 500 },
  );
}
```

- [ ] **Step 3: Fix memory POST**

In `src/app/api/memory/route.ts`, move `req.json()` inside the try block and add SyntaxError handling (same pattern).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/route.ts src/app/api/rules/toggle/route.ts src/app/api/memory/route.ts
git commit -m "fix: handle malformed JSON bodies with 400 instead of 500"
```

---

### Task 8: Memory Extraction Error Fix

**Files:**
- Modify: `src/lib/memory/extract.ts:60-62`
- Modify: `tests/lib/memory/extract.test.ts`

- [ ] **Step 1: Update the test**

In `tests/lib/memory/extract.test.ts`, update the error test to expect errors to propagate (not be swallowed):

```typescript
it('throws when generateObject errors (outer caller handles)', async () => {
  mockGenerateObject.mockRejectedValue(new Error('API error'));

  await expect(
    extractAndSaveMemories(
      'org-1',
      'user-1',
      'Hello',
      'Hi there!',
      'anthropic',
      'test-api-key',
    ),
  ).rejects.toThrow('API error');

  expect(mockUpsertMemory).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/memory/extract.test.ts
```

Expected: FAIL — current code catches and swallows the error

- [ ] **Step 3: Remove the inner catch block**

In `src/lib/memory/extract.ts`, remove lines 60-62 (the `catch {}` block). The function body should be:

```typescript
export async function extractAndSaveMemories(
  orgId: string,
  _userId: string,
  userMessage: string,
  assistantMessage: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const modelId = CHEAP_MODELS[provider] ?? CHEAP_MODELS.anthropic;
  const model = createModel(provider, modelId, apiKey);

  const prompt = [
    'Extract factual information about the church or organization from this conversation exchange.',
    'Only extract clear, objective facts (names, times, locations, preferences).',
    'Do not extract opinions or temporary information.',
    'Return an empty facts array if nothing useful is found.',
    '',
    `User: ${userMessage}`,
    `Assistant: ${assistantMessage}`,
  ].join('\n');

  const { object } = await generateObject({
    model,
    schema: factsSchema,
    prompt,
  });

  for (const fact of object.facts) {
    await upsertMemory(orgId, fact.key, fact.value, MemorySource.auto, undefined);
  }

  await enforceMemoryCap(orgId);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/memory/extract.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory/extract.ts tests/lib/memory/extract.test.ts
git commit -m "fix: remove silent error swallowing in memory extraction"
```

---

### Task 9: Input Length Validation

**Files:**
- Modify: `src/app/api/rules/route.ts`
- Modify: `src/app/api/memory/route.ts`

- [ ] **Step 1: Add length validation to rules POST**

In `src/app/api/rules/route.ts`, after the `if (!content)` check, add:

```typescript
if (content.length > 2000) {
  return Response.json(
    { error: 'Rule content must be under 2,000 characters.' },
    { status: 400 },
  );
}
```

- [ ] **Step 2: Add length validation to memory POST**

In `src/app/api/memory/route.ts`, after the `if (!key || !value)` check, add:

```typescript
if (key.length > 200) {
  return Response.json(
    { error: 'Fact name must be under 200 characters.' },
    { status: 400 },
  );
}
if (value.length > 2000) {
  return Response.json(
    { error: 'Fact value must be under 2,000 characters.' },
    { status: 400 },
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/rules/route.ts src/app/api/memory/route.ts
git commit -m "fix: add input length validation for rules and memory"
```

---

### Task 10: User-Scoped Memory Extraction

**Files:**
- Modify: `src/lib/memory/extract.ts`
- Modify: `src/lib/memory/queries.ts`
- Modify: `tests/lib/memory/extract.test.ts`
- Modify: `tests/lib/memory/queries.test.ts`

- [ ] **Step 1: Update extract test for dual-scope**

In `tests/lib/memory/extract.test.ts`, update the test for user-scoped facts:

```typescript
it('saves org-scoped and user-scoped facts based on extraction scope', async () => {
  mockGenerateObject.mockResolvedValue({
    object: {
      facts: [
        { key: 'pastor_name', value: 'John Smith', scope: 'org' },
        { key: 'preferred_format', value: 'bullet points', scope: 'user' },
      ],
    },
  });
  mockUpsertMemory.mockResolvedValue({});

  await extractAndSaveMemories(
    'org-1',
    'user-1',
    'Can you list people in bullet points? Also who is the pastor?',
    'The pastor is John Smith. Here are the people in bullet format...',
    'anthropic',
    'test-api-key',
  );

  expect(mockUpsertMemory).toHaveBeenCalledTimes(2);
  // Org-scoped — userId is undefined
  expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'pastor_name', 'John Smith', 'auto', undefined);
  // User-scoped — userId is passed
  expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'preferred_format', 'bullet points', 'auto', 'user-1');
});
```

Also update the existing test `'saves extracted facts as org-level memories'` to include the `scope` field in the mock response:

```typescript
it('saves extracted facts as org-level memories', async () => {
  mockGenerateObject.mockResolvedValue({
    object: {
      facts: [
        { key: 'pastor_name', value: 'John Smith', scope: 'org' },
        { key: 'sunday_service_time', value: '10:00 AM', scope: 'org' },
      ],
    },
  });
  mockUpsertMemory.mockResolvedValue({});

  await extractAndSaveMemories(
    'org-1',
    'user-1',
    'Tell me about services',
    'Pastor John Smith leads services at 10:00 AM on Sundays.',
    'anthropic',
    'test-api-key',
  );

  expect(mockUpsertMemory).toHaveBeenCalledTimes(2);
  expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'pastor_name', 'John Smith', 'auto', undefined);
  expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'sunday_service_time', '10:00 AM', 'auto', undefined);
});
```

Add the enforceUserMemoryCap mock:

```typescript
const mockEnforceUserMemoryCap = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/memory/queries', () => ({
  upsertMemory: mockUpsertMemory,
  enforceMemoryCap: mockEnforceMemoryCap,
  enforceUserMemoryCap: mockEnforceUserMemoryCap,
}));
```

Add a test for user cap enforcement:

```typescript
it('enforces both org and user memory caps after extraction', async () => {
  mockGenerateObject.mockResolvedValue({
    object: {
      facts: [{ key: 'pref', value: 'concise', scope: 'user' }],
    },
  });
  mockUpsertMemory.mockResolvedValue({});

  await extractAndSaveMemories(
    'org-1',
    'user-1',
    'Be concise please',
    'Sure, I will be concise.',
    'anthropic',
    'test-api-key',
  );

  expect(mockEnforceMemoryCap).toHaveBeenCalledWith('org-1');
  expect(mockEnforceUserMemoryCap).toHaveBeenCalledWith('org-1', 'user-1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/memory/extract.test.ts
```

Expected: FAIL — `scope` field doesn't exist, `enforceUserMemoryCap` doesn't exist

- [ ] **Step 3: Add enforceUserMemoryCap to queries.ts**

In `src/lib/memory/queries.ts`, add after the `enforceMemoryCap` function:

```typescript
export async function enforceUserMemoryCap(
  orgId: string,
  userId: string,
  maxCount: number = 100,
): Promise<void> {
  const count = await prisma.memory.count({ where: { orgId, userId, source: 'auto' } });
  if (count <= maxCount) return;

  const excess = count - maxCount;
  const oldestAuto = await prisma.memory.findMany({
    where: { orgId, userId, source: 'auto' },
    orderBy: { updatedAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (oldestAuto.length > 0) {
    await prisma.memory.deleteMany({
      where: { id: { in: oldestAuto.map((m) => m.id) } },
    });
  }
}
```

Also update `enforceMemoryCap` to scope to org-only (userId IS NULL):

```typescript
export async function enforceMemoryCap(orgId: string, maxCount: number = 200): Promise<void> {
  const count = await prisma.memory.count({ where: { orgId, userId: null, source: 'auto' } });
  if (count <= maxCount) return;

  const excess = count - maxCount;
  const oldestAuto = await prisma.memory.findMany({
    where: { orgId, userId: null, source: 'auto' },
    orderBy: { updatedAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (oldestAuto.length > 0) {
    await prisma.memory.deleteMany({
      where: { id: { in: oldestAuto.map((m) => m.id) } },
    });
  }
}
```

- [ ] **Step 4: Update extract.ts for dual-scope**

Replace `src/lib/memory/extract.ts`:

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';
import { MemorySource } from '@prisma/client';
import { createModel } from '@/lib/ai/providers';
import { upsertMemory, enforceMemoryCap, enforceUserMemoryCap } from '@/lib/memory/queries';

const CHEAP_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
};

const factsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().describe('A short snake_case key for the fact (e.g. pastor_name)'),
        value: z.string().describe('The value of the fact'),
        scope: z.enum(['org', 'user']).describe(
          'org = about the church (names, times, policies). user = about this specific person (preferences, role, style)',
        ),
      }),
    )
    .describe('Facts extracted from this conversation'),
});

export async function extractAndSaveMemories(
  orgId: string,
  userId: string,
  userMessage: string,
  assistantMessage: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const modelId = CHEAP_MODELS[provider] ?? CHEAP_MODELS.anthropic;
  const model = createModel(provider, modelId, apiKey);

  const prompt = [
    'Extract facts from this conversation.',
    '- Org facts (scope: "org"): things about the church that any staff member would find useful',
    '  (names, schedules, policies, team structure, event details)',
    '- User facts (scope: "user"): things specific to THIS user\'s preferences or working style',
    '  (communication preferences, role duties, personal workflows, how they like information presented)',
    '',
    'Only extract clear, objective facts. Return an empty facts array if nothing useful is found.',
    '',
    `User: ${userMessage}`,
    `Assistant: ${assistantMessage}`,
  ].join('\n');

  const { object } = await generateObject({
    model,
    schema: factsSchema,
    prompt,
  });

  for (const fact of object.facts) {
    const factUserId = fact.scope === 'user' ? userId : undefined;
    await upsertMemory(orgId, fact.key, fact.value, MemorySource.auto, factUserId);
  }

  await enforceMemoryCap(orgId);
  await enforceUserMemoryCap(orgId, userId);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/memory/extract.test.ts
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests pass. The memory queries tests may need the `enforceMemoryCap` test updated to check for `userId: null` in the where clause.

- [ ] **Step 7: Commit**

```bash
git add src/lib/memory/extract.ts src/lib/memory/queries.ts tests/lib/memory/extract.test.ts
git commit -m "feat: dual-scope memory extraction (org + user) with separate caps"
```
