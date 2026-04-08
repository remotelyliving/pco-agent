# Plan D: UX Fixes + Minor Polish + Documentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all UX issues (mobile nav, loading states, error mapping, confirm dialogs), apply minor polish (progress dots, transitions, touch support, etc.), and update all documentation to match the codebase's actual state.

**Architecture:** Each task is independent. UX fixes are component-level changes. Documentation is a single batch pass at the end to capture final state.

**Tech Stack:** React, Tailwind CSS, shadcn/ui, Next.js App Router

**Spec:** `docs/superpowers/specs/2026-04-07-audit-remediation-design.md` — Sections 4, 5, 6

**Prerequisites:** Plans A, B, C complete

---

### Task 1: Mobile Nav — Sign Out + Editor Role

**Files:**
- Modify: `src/components/mobile-nav.tsx`

- [ ] **Step 1: Add sign-out and fix role display**

Replace `src/components/mobile-nav.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function MobileNav({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  const [open, setOpen] = useState(false);

  const roleLabel = userRole === 'admin' ? 'Admin' : userRole === 'editor' ? 'Editor' : 'Member';

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Planning Center Assistant</span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
          {open ? '✕' : '☰'}
        </Button>
      </div>

      {/* Overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50 transition-opacity duration-200"
            onClick={() => setOpen(false)}
          />
          <nav className="relative z-10 w-64 bg-white h-full flex flex-col border-r shadow-lg" aria-label="Mobile navigation">
            <div className="p-4 border-b">
              <p className="font-semibold">Planning Center Assistant</p>
              <p className="text-sm text-gray-500">{roleLabel}</p>
            </div>
            <div className="flex-1 p-4 space-y-2">
              <Link href="/chat" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                + New Chat
              </Link>
              <Link href="/rules" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Rules
              </Link>
              <Link href="/memory" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Memory
              </Link>
              <Link href="/settings" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Settings
              </Link>
            </div>
            <div className="p-4 border-t">
              <p className="text-sm font-medium">{userName || 'User'}</p>
              <form action="/api/auth/signout" method="POST" className="mt-2">
                <Button variant="ghost" size="sm" type="submit" className="w-full justify-start">
                  Sign out
                </Button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
```

Changes made:
- Fixed role display: `admin` → Admin, `editor` → Editor, default → Member
- Added sign-out form in footer
- Added `transition-opacity duration-200` on backdrop overlay

- [ ] **Step 2: Commit**

```bash
git add src/components/mobile-nav.tsx
git commit -m "fix: mobile nav sign-out button, editor role, backdrop transition"
```

---

### Task 2: Loading States for Rules and Memory

**Files:**
- Modify: `src/components/rules/rule-list.tsx`
- Modify: `src/components/memory/memory-list.tsx`

- [ ] **Step 1: Add loading state to RuleList**

In `src/components/rules/rule-list.tsx`, change the `rules` state to be nullable to distinguish loading from empty:

```typescript
const [rules, setRules] = useState<Rule[] | null>(null);
```

After the editor section and before the RuleSections, add:

```tsx
{rules === null && (
  <div className="flex justify-center py-8">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
  </div>
)}
```

Wrap the RuleSection renders in a condition:

```tsx
{rules !== null && (
  <>
    <RuleSection ... />
    <RuleSection ... />
    {userRules.length > 0 && <RuleSection ... />}
  </>
)}
```

Update the filter variables to handle null:

```typescript
const systemRules = (rules ?? []).filter((r) => r.ruleType === 'system');
const orgRules = (rules ?? []).filter((r) => r.ruleType === 'org');
const userRules = (rules ?? []).filter((r) => r.ruleType === 'user');
```

- [ ] **Step 2: Add loading state to MemoryList**

In `src/components/memory/memory-list.tsx`, change both memory states to nullable:

```typescript
const [orgMemories, setOrgMemories] = useState<Memory[] | null>(null);
const [userMemories, setUserMemories] = useState<Memory[] | null>(null);
```

Add a loading check before the cards:

```tsx
{orgMemories === null && (
  <div className="flex justify-center py-8">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
  </div>
)}
```

Wrap the Card sections in `{orgMemories !== null && ( ... )}`.

- [ ] **Step 3: Commit**

```bash
git add src/components/rules/rule-list.tsx src/components/memory/memory-list.tsx
git commit -m "feat: add loading spinners for rules and memory pages"
```

---

### Task 3: Chat Error Message Mapping

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Add error message mapper**

In `src/components/chat/chat-interface.tsx`, add a helper function before the `ChatInterface` component:

```typescript
function friendlyErrorMessage(error: Error): string {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('401') || msg.includes('invalid') && msg.includes('key') || msg.includes('authentication')) {
    return 'Your API key appears to be invalid. Check your key in Settings.';
  }
  if (msg.includes('429') || msg.includes('rate') || msg.includes('too many')) {
    return 'The AI service is busy — try again in a moment.';
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused')) {
    return "Couldn't reach the AI service. Check your connection.";
  }
  if (msg.includes('expired') || msg.includes('sign out')) {
    return error.message; // Already user-friendly from our backend
  }
  return 'Something went wrong. Please try again.';
}
```

Then update the error display (around line 154):

```tsx
{error && (
  <div
    className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
    role="alert"
  >
    {friendlyErrorMessage(error)}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/chat-interface.tsx
git commit -m "feat: map chat errors to user-friendly messages"
```

---

### Task 4: Create Reusable ConfirmDialog Component

**Files:**
- Create: `src/components/ui/confirm-dialog.tsx`

- [ ] **Step 1: Create ConfirmDialog**

First, ensure AlertDialog is available from shadcn:

```bash
npx shadcn@latest add alert-dialog
```

Create `src/components/ui/confirm-dialog.tsx`:

```tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx src/components/ui/alert-dialog.tsx
git commit -m "feat: create reusable ConfirmDialog component"
```

---

### Task 5: Replace confirm() Calls with ConfirmDialog

**Files:**
- Modify: `src/components/conversation-item.tsx`
- Modify: `src/components/rules/rule-list.tsx`
- Modify: `src/components/memory/memory-list.tsx`

- [ ] **Step 1: Update conversation-item.tsx**

In `src/components/conversation-item.tsx`, replace the delete button and `handleDelete`:

Remove the `confirm()` call from `handleDelete`. Change it to just perform the delete:

```typescript
async function handleDelete() {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  if (pathname === `/chat/${id}`) {
    router.push('/chat');
  } else {
    router.refresh();
  }
}
```

Replace the delete button with ConfirmDialog:

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// In the render, replace the hidden delete button:
<ConfirmDialog
  trigger={
    <button
      className="px-2 text-xs text-gray-400 hover:text-red-500 shrink-0"
      aria-label="Delete conversation"
    >
      ✕
    </button>
  }
  title="Delete conversation?"
  description="This will permanently delete this conversation and all its messages."
  onConfirm={handleDelete}
/>
```

Note: Also remove the `hidden group-hover:block` classes — the button is now always visible (fixes touch device issue from MIN item 6.3).

- [ ] **Step 2: Update rule-list.tsx**

In `src/components/rules/rule-list.tsx`, replace the `handleDelete` function's `confirm()` call:

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Replace the Delete button in RuleSection with:
<ConfirmDialog
  trigger={
    <Button
      variant="ghost"
      size="sm"
      className="text-red-500 hover:text-red-700"
    >
      Delete
    </Button>
  }
  title="Delete rule?"
  description="This rule will be permanently removed."
  onConfirm={() => onDelete(rule.id)}
/>
```

Update `handleDelete` to remove the `confirm()` call:

```typescript
async function handleDelete(ruleId: string) {
  await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
  loadRules();
}
```

- [ ] **Step 3: Update memory-list.tsx**

In `src/components/memory/memory-list.tsx`, same pattern:

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Replace the Delete button with:
<ConfirmDialog
  trigger={
    <Button
      variant="ghost"
      size="sm"
      className="text-red-500 hover:text-red-700 shrink-0"
    >
      Delete
    </Button>
  }
  title="Delete fact?"
  description="This fact will be permanently removed from the assistant's memory."
  onConfirm={() => handleDelete(memory.id)}
/>
```

Update `handleDelete` to remove `confirm()`:

```typescript
async function handleDelete(id: string) {
  await fetch(`/api/memory/${id}`, { method: 'DELETE' });
  await loadMemories();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/conversation-item.tsx src/components/rules/rule-list.tsx src/components/memory/memory-list.tsx
git commit -m "feat: replace window.confirm with shadcn AlertDialog"
```

---

### Task 6: Minor Polish — Setup Wizard Progress Dots

**Files:**
- Modify: `src/components/setup/setup-wizard.tsx`

- [ ] **Step 1: Show 4 dots instead of 3**

In `src/components/setup/setup-wizard.tsx`, change line 76 from `{[1, 2, 3].map(...)` to:

```tsx
<div className="mb-8 flex justify-center gap-2">
  {[1, 2, 3, 4].map((s) => (
    <div
      key={s}
      className={`h-2 w-16 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
    />
  ))}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/setup-wizard.tsx
git commit -m "fix: setup wizard shows 4 progress dots for all steps"
```

---

### Task 7: Minor Polish — Memory Value Expand

**Files:**
- Modify: `src/components/memory/memory-list.tsx`

- [ ] **Step 1: Add click-to-expand on memory values**

Extract the `MemoryTable` component to be defined outside `MemoryList`, and add expand/collapse state:

Replace the inline `MemoryTable` function with a standalone component above `MemoryList`:

```tsx
function MemoryTable({
  memories,
  showDelete,
  onDelete,
}: {
  memories: Memory[];
  showDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (memories.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No facts yet. The assistant will learn facts automatically during conversations.
      </p>
    );
  }

  const limitedMemories = memories.slice(0, 100);
  const overLimit = memories.length > 100;

  return (
    <>
      {overLimit && (
        <p className="text-xs text-gray-400 mb-2">Showing first 100 facts</p>
      )}
      <div className="space-y-2">
        {limitedMemories.map((memory) => (
          <div
            key={memory.id}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium font-mono">{memory.key}</span>
                <Badge
                  variant={memory.source === 'manual' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {memory.source}
                </Badge>
              </div>
              <p
                className={`text-sm text-gray-600 mt-0.5 cursor-pointer ${expandedId === memory.id ? '' : 'truncate'}`}
                onClick={() => setExpandedId(expandedId === memory.id ? null : memory.id)}
                title="Click to expand"
              >
                {memory.value}
              </p>
            </div>
            {showDelete && (
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 shrink-0"
                  >
                    Delete
                  </Button>
                }
                title="Delete fact?"
                description="This fact will be permanently removed from the assistant's memory."
                onConfirm={() => onDelete(memory.id)}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
```

Update the `MemoryList` component to pass `onDelete` to `MemoryTable`:

```tsx
<MemoryTable memories={orgMemories ?? []} showDelete={isAdmin} onDelete={handleDelete} />
```

And for user memories:

```tsx
<MemoryTable memories={userMemories ?? []} showDelete={isAdmin} onDelete={handleDelete} />
```

This also addresses the audit finding about `MemoryTable` being defined inside `MemoryList`'s render (section 6.6).

- [ ] **Step 2: Commit**

```bash
git add src/components/memory/memory-list.tsx
git commit -m "feat: click-to-expand memory values, extract MemoryTable component"
```

---

### Task 8: Minor Polish — Native Selects → shadcn Select

**Files:**
- Modify: `src/components/settings/api-key-form.tsx`
- Modify: `src/components/rules/rule-editor.tsx`

- [ ] **Step 1: Add shadcn Select component if not present**

```bash
npx shadcn@latest add select
```

- [ ] **Step 2: Update api-key-form.tsx**

In `src/components/settings/api-key-form.tsx`, replace the two native `<select>` elements with shadcn `Select`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

Replace the provider select (lines 88-103):

```tsx
<Select value={provider} onValueChange={(value) => { setProvider(value); setModel(''); }}>
  <SelectTrigger>
    <SelectValue placeholder="Select a provider..." />
  </SelectTrigger>
  <SelectContent>
    {SUPPORTED_PROVIDERS.map((p) => (
      <SelectItem key={p} value={p}>
        {p === 'anthropic' ? 'Anthropic (Claude)' :
         p === 'openai' ? 'OpenAI (GPT)' :
         p === 'google' ? 'Google (Gemini)' : p}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Replace the model select (lines 109-122):

```tsx
<Select value={model} onValueChange={setModel}>
  <SelectTrigger>
    <SelectValue placeholder="Use default" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">Use default</SelectItem>
    {modelsForProvider.map((m) => (
      <SelectItem key={m.id} value={m.id}>
        {m.name} — {m.description}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 3: Update rule-editor.tsx**

In `src/components/rules/rule-editor.tsx`, replace both `<select>` elements with shadcn `Select`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

Replace category select (lines 70-81):

```tsx
<Select value={category} onValueChange={setCategory}>
  <SelectTrigger>
    <SelectValue placeholder="None" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">None</SelectItem>
    <SelectItem value="general">General</SelectItem>
    <SelectItem value="scheduling">Scheduling</SelectItem>
    <SelectItem value="people">People</SelectItem>
  </SelectContent>
</Select>
```

Replace scope select (lines 86-93):

```tsx
<Select value={ruleType} onValueChange={setRuleType}>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="org">Organization (visible to all)</SelectItem>
    <SelectItem value="user">Personal (just me)</SelectItem>
  </SelectContent>
</Select>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/api-key-form.tsx src/components/rules/rule-editor.tsx src/components/ui/select.tsx
git commit -m "feat: replace native selects with shadcn Select components"
```

---

### Task 9: Minor Polish — Thinking Indicator + Example Prompt Caveat

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Add animated thinking dots**

In `src/components/chat/chat-interface.tsx`, replace the "Thinking..." text (around line 141-146):

```tsx
{isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
  <div className="mb-4 flex justify-start">
    <div className="rounded-lg bg-gray-100 px-4 py-3 text-gray-500 flex items-center gap-1">
      Thinking
      <span className="flex gap-0.5">
        <span className="animate-bounce [animation-delay:0ms] h-1 w-1 rounded-full bg-gray-400" />
        <span className="animate-bounce [animation-delay:150ms] h-1 w-1 rounded-full bg-gray-400" />
        <span className="animate-bounce [animation-delay:300ms] h-1 w-1 rounded-full bg-gray-400" />
      </span>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add example prompt caveat**

After the example prompt buttons grid (around line 133), add:

```tsx
<p className="text-xs text-gray-400 text-center mt-2">
  Available actions depend on your Planning Center modules.
</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/chat-interface.tsx
git commit -m "feat: animated thinking dots + example prompt caveat"
```

---

### Task 10: Documentation Update — Full Pass

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `TEAM.md`
- Modify: `docs/KNOWN_ISSUES.md`
- Modify: `docs/features/memory-system/SUMMARY.md`
- Modify: `docs/features/ai-provider-mcp-chat/SUMMARY.md`
- Modify: `docs/features/scaffolding-auth-db/SUMMARY.md`

- [ ] **Step 1: Update CLAUDE.md**

Make these changes:
1. Logger description: change `"Structured logger (pino/winston wrapper)"` → `"Structured JSON logger (pino)"`
2. Add `mcp-pool.ts` to project structure: `mcp-pool.ts         # MCP client connection pool with TTL and LRU eviction`
3. Add commands: `make install`, `make test-mutation`, `make test-e2e`, `make docker-down`, `make docker-logs`
4. Memory description: change `"org-level key-value facts"` → `"org-level and user-level key-value facts"`
5. Note `middleware.ts` renamed to `proxy.ts` in structure and description
6. Update quality gates to note Stryker and Playwright are now configured

- [ ] **Step 2: Update AGENTS.md**

Make these changes:
1. Rules pseudocode: own rules line → `return userRuleSettings[rule.id] !== false`
2. Rules table: own rules row → `Can opt out? Yes`
3. System rules row → add note `Can opt out? Admins only`
4. Remove `provider-select.tsx` reference → `api-key-form.tsx` and `setup-wizard.tsx`
5. Rate limit description → `Middleware-based rate limiting via proxy.ts; route:userId composite key; configurable per-route limits`
6. Provider routing → mention MCP pool layer (`getMCPClient` from `src/lib/mcp-pool.ts`)
7. Memory section → note dual-scope extraction (org + user), separate caps (200 org, 100 per-user)
8. Memory injection order → `memory before rules` (matches actual `buildSystemPrompt` code)
9. Env var table → mark `PCO_MCP_URL` as `Required (has default: pco-mcp.com/mcp)`, add `LOG_LEVEL` as `Optional (default: info)`

- [ ] **Step 3: Update README.md**

1. Add `make test-mutation` and `make test-e2e` to commands table
2. Add note near Docker seed step: `> Note: The seed file is TypeScript. If running inside the container, ensure tsx is available or seed from the host.`

- [ ] **Step 4: Update TEAM.md**

Quality gates table: update Stryker row to remove "planned" caveat, add Playwright row:

```markdown
| Mutation testing | 80%+ on business logic | Stryker + Vitest |
| E2E tests | Key flows pass | Playwright + MSW |
```

- [ ] **Step 5: Update KNOWN_ISSUES.md**

1. Add under a new "Testing" section:
```markdown
### Playwright E2E Tests Use Mocked Backends
**Status:** Accepted — by design
**Impact:** E2E tests run against MSW-mocked API responses, not a real database or PCO OAuth. UI regressions are caught, but integration issues between frontend and real backend are not.
**Fix:** Set up a test database + test OAuth app for full integration testing. Low priority for homelab deployment.
```

2. Remove any items that were resolved by Plans A–D.

- [ ] **Step 6: Update feature summaries**

In `docs/features/memory-system/SUMMARY.md`:
- Remove "No memory TTL or expiry" from known limitations
- Add "User-scoped memory extraction" to What It Does

In `docs/features/ai-provider-mcp-chat/SUMMARY.md`:
- Remove "No token usage tracking" and "No rate limiting on chat route" from known limitations

In `docs/features/scaffolding-auth-db/SUMMARY.md`:
- Change "First-user-is-admin heuristic" → "PCO role mapping implemented (site_administrator, people_permissions)"

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md TEAM.md docs/KNOWN_ISSUES.md docs/features/memory-system/SUMMARY.md docs/features/ai-provider-mcp-chat/SUMMARY.md docs/features/scaffolding-auth-db/SUMMARY.md
git commit -m "docs: update all documentation to match post-audit codebase state"
```

---

### Task 11: Update DEV_QUEUE.md

**Files:**
- Modify: `DEV_QUEUE.md`

- [ ] **Step 1: Add audit remediation to Done section**

Add to the Done list:

```markdown
- [x] **Audit Remediation** — 33 items across 6 sections: infrastructure (pino, proxy.ts rate limiting), critical fixes (onFinish, Dockerfile, token refresh, markdown, error boundaries, rule toggles), code quality (req.json validation, memory extraction, input length, user-scoped memory), testing (Stryker, Playwright), UX (mobile nav, loading states, error mapping, AlertDialog), documentation (2026-04-07)
```

Add to session history with key details.

- [ ] **Step 2: Commit**

```bash
git add DEV_QUEUE.md
git commit -m "docs: update DEV_QUEUE with audit remediation completion"
```
