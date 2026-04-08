# Audit v2 Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all 25 findings from the v2 audit — 2 critical, 11 important, 12 minor.

**Architecture:** Each task is independent unless noted. Work in the `feature/audit-v2-remediation` branch.

**Tech Stack:** Next.js 16, TypeScript, React, shadcn/ui, Prisma, pino

---

### Task 1: Fix SelectItem empty string values (CRIT)

**Files:**
- Modify: `src/components/settings/api-key-form.tsx`
- Modify: `src/components/rules/rule-editor.tsx`

- [ ] **Step 1:** In `api-key-form.tsx`, find `<SelectItem value="">Use default</SelectItem>` for the model select. Change to `<SelectItem value="__default__">Use default</SelectItem>`. Update the `onValueChange` handler to map `"__default__"` back to empty string: `onValueChange={(v) => setModel(v === '__default__' ? '' : v)}`. Also set the Select's `value` to `model || '__default__'`.

- [ ] **Step 2:** In `rule-editor.tsx`, find `<SelectItem value="">None</SelectItem>` for category. Change to `<SelectItem value="__none__">None</SelectItem>`. Update: `onValueChange={(v) => setCategory(v === '__none__' ? '' : v)}` and `value={category || '__none__'}`.

- [ ] **Step 3:** Run `npm test`, commit: `git commit -m "fix: use sentinel values for empty SelectItem options (Radix requires non-empty)"`

---

### Task 2: Fix remaining req.json() + PATCH validation (CRIT)

**Files:**
- Modify: `src/app/api/rules/route.ts` (POST — move req.json inside try)
- Modify: `src/app/api/chat/route.ts` (POST — move req.json inside try)
- Modify: `src/app/api/rules/[id]/route.ts` (PATCH — add validation + length limit)
- Modify: `src/app/api/memory/[id]/route.ts` (PATCH — add validation + length limit)

- [ ] **Step 1:** In `rules/route.ts` POST, move `const body = await req.json()` and the destructuring + validation logic inside the existing try/catch. Add `if (error instanceof SyntaxError)` guard returning 400.

- [ ] **Step 2:** In `chat/route.ts` POST, the `const body = await req.json()` at the top of the function is outside the try block. Move it inside the try block that starts after the auth check. Add SyntaxError handling in the catch.

- [ ] **Step 3:** In `rules/[id]/route.ts` PATCH, after `const body = await req.json()`, add validation:
```typescript
if (body.content !== undefined) {
  if (typeof body.content !== 'string' || body.content.length === 0) {
    return Response.json({ error: 'Content must be a non-empty string.' }, { status: 400 });
  }
  if (body.content.length > 2000) {
    return Response.json({ error: 'Rule content must be under 2,000 characters.' }, { status: 400 });
  }
}
```
Also add SyntaxError handling to the catch block.

- [ ] **Step 4:** In `memory/[id]/route.ts` PATCH, after `const body = await req.json()`, add validation:
```typescript
if (body.key !== undefined && (typeof body.key !== 'string' || body.key.length > 200)) {
  return Response.json({ error: 'Fact name must be a string under 200 characters.' }, { status: 400 });
}
if (body.value !== undefined && (typeof body.value !== 'string' || body.value.length > 2000)) {
  return Response.json({ error: 'Fact value must be a string under 2,000 characters.' }, { status: 400 });
}
```
Also add SyntaxError handling to the catch block.

- [ ] **Step 5:** Run `npm test`, commit: `git commit -m "fix: req.json inside try/catch for rules+chat POST, add PATCH validation"`

---

### Task 3: Fix mobile sign-out (IMP)

**Files:**
- Modify: `src/components/mobile-nav.tsx`
- Modify: `src/app/(app)/layout.tsx`

The mobile nav is a client component, so it can't use server actions directly. The cleanest fix is to pass a sign-out server action from the layout.

- [ ] **Step 1:** In `src/app/(app)/layout.tsx`, import `signOut` from `@/lib/auth`. Create a server action and pass it to MobileNav:
```tsx
import { signOut } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <MobileNav userName={session?.user?.name} userRole={session?.user?.role} onSignOut={handleSignOut} />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2:** In `src/components/mobile-nav.tsx`, add `onSignOut` prop and use it in a form:
```tsx
export function MobileNav({ userName, userRole, onSignOut }: { userName?: string | null; userRole?: string; onSignOut?: () => Promise<void> }) {
```
Replace the sign-out form with:
```tsx
<form action={onSignOut}>
  <Button variant="ghost" size="sm" type="submit" className="w-full justify-start">
    Sign out
  </Button>
</form>
```

- [ ] **Step 3:** Run `npm test`, commit: `git commit -m "fix: mobile sign-out uses server action (matches desktop sidebar)"`

---

### Task 4: Allow users to delete their own memories (IMP)

**Files:**
- Modify: `src/app/api/memory/[id]/route.ts` (DELETE — allow owner)
- Modify: `src/components/memory/memory-list.tsx` (show delete for own memories)

- [ ] **Step 1:** In `memory/[id]/route.ts` DELETE, change the admin check to also allow the memory's owner:
```typescript
// Admin can delete any memory, users can delete their own
const isOwner = memory.userId === session.user.agentUserId;
if (session.user.role !== 'admin' && !isOwner) {
  return new Response('Forbidden', { status: 403 });
}
```
Apply the same logic to PATCH.

- [ ] **Step 2:** In `memory-list.tsx`, for the "My Facts" MemoryTable, change `showDelete={isAdmin}` to `showDelete={true}` — users can always delete their own facts.

- [ ] **Step 3:** Run `npm test`, commit: `git commit -m "fix: allow users to delete their own personal memories"`

---

### Task 5: PUBLIC_API_ROUTES exact matching (IMP)

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1:** Replace the `startsWith` check with exact + prefix matching:
```typescript
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  return false;
}
```
Replace the `isPublic` line with: `const isPublic = isPublicRoute(pathname);`

- [ ] **Step 2:** Run `npm test`, commit: `git commit -m "fix: exact matching for public API routes in proxy"`

---

### Task 6: PATCH routes SyntaxError handling (covered in Task 2)

Already addressed in Task 2 steps 3-4. No separate task needed.

---

### Task 7: Rule toggle error handling + rollback (IMP)

**Files:**
- Modify: `src/components/rules/rule-list.tsx`

- [ ] **Step 1:** Add error handling to `handleToggle` with rollback:
```typescript
async function handleToggle(ruleId: string, enabled: boolean) {
  const prev = settings[ruleId];
  setSettings((s) => ({ ...s, [ruleId]: enabled }));
  try {
    const res = await fetch('/api/rules/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId, enabled }),
    });
    if (!res.ok) {
      setSettings((s) => ({ ...s, [ruleId]: prev }));
    }
  } catch {
    setSettings((s) => ({ ...s, [ruleId]: prev }));
  }
}
```

- [ ] **Step 2:** Add error handling to `handleEdit` — show a brief error message on failure:
Add a state `const [editError, setEditError] = useState('');` in RuleSection. On failure: `setEditError('Failed to save. Please try again.')`. Show it below the textarea. Clear on success.

- [ ] **Step 3:** Run `npm test`, commit: `git commit -m "fix: rule toggle rollback on failure, edit error feedback"`

---

### Task 8: Memory extraction prompt truncation (IMP)

**Files:**
- Modify: `src/lib/memory/extract.ts`
- Modify: `tests/lib/memory/extract.test.ts`

- [ ] **Step 1:** Add a constant and truncation helper at the top of extract.ts:
```typescript
const MAX_EXTRACTION_INPUT_LENGTH = 4000;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '... [truncated]';
}
```

- [ ] **Step 2:** In the prompt builder, use: `User: ${truncate(userMessage, MAX_EXTRACTION_INPUT_LENGTH)}` and `Assistant: ${truncate(assistantMessage, MAX_EXTRACTION_INPUT_LENGTH)}`.

- [ ] **Step 3:** Add a test that verifies truncation happens for long messages.

- [ ] **Step 4:** Run `npm test`, commit: `git commit -m "fix: truncate extraction prompt inputs to prevent context overflow"`

---

### Task 9: ConfirmDialog double-click prevention (IMP)

**Files:**
- Modify: `src/components/ui/confirm-dialog.tsx`

- [ ] **Step 1:** Add loading state to ConfirmDialog:
```tsx
export function ConfirmDialog({
  trigger, title, description, confirmLabel = 'Delete', onConfirm,
}: { ... }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={loading} className="bg-red-600 hover:bg-red-700">
            {loading ? 'Deleting...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Note: `onConfirm` type changes to `() => void | Promise<void>`.

- [ ] **Step 2:** Run `npm test`, commit: `git commit -m "fix: ConfirmDialog prevents double-click with loading state"`

---

### Task 10: Mobile backdrop animation fix (IMP)

**Files:**
- Modify: `src/components/mobile-nav.tsx`

- [ ] **Step 1:** The backdrop is conditionally rendered (`{open && ...}`) so CSS transitions can't fire. Fix by keeping the overlay always mounted but toggling opacity + pointer-events:

Replace the overlay section:
```tsx
{/* Overlay drawer */}
<div className={`fixed inset-0 z-50 flex ${open ? '' : 'pointer-events-none'}`}>
  <div
    className={`absolute inset-0 bg-black transition-opacity duration-200 ${open ? 'opacity-50' : 'opacity-0'}`}
    onClick={() => setOpen(false)}
  />
  {open && (
    <nav className="relative z-10 w-64 bg-white h-full flex flex-col border-r shadow-lg" aria-label="Mobile navigation">
      {/* ... nav content unchanged ... */}
    </nav>
  )}
</div>
```

This keeps the backdrop mounted for transitions while only rendering the nav content when open.

- [ ] **Step 2:** Run `npm test`, commit: `git commit -m "fix: mobile backdrop actually animates on open/close"`

---

### Task 11: Graceful shutdown handler (IMP)

**Files:**
- Modify: `src/instrumentation.ts`

- [ ] **Step 1:** Add shutdown handling in the instrumentation hook:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env');
    const { logger } = await import('@/lib/logger');
    try {
      validateEnv();
    } catch (error) {
      console.error('[startup] Environment validation failed:', error);
    }

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('[shutdown] SIGTERM received, cleaning up');
      const { prisma } = await import('@/lib/db');
      await prisma.$disconnect();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
```

- [ ] **Step 2:** Commit: `git commit -m "feat: graceful shutdown handler for Prisma on SIGTERM/SIGINT"`

---

### Task 12: enforceUserMemoryCap test coverage (IMP)

**Files:**
- Modify: `tests/lib/memory/queries.test.ts`

- [ ] **Step 1:** Add tests for `enforceUserMemoryCap`:
```typescript
describe('enforceUserMemoryCap', () => {
  it('does nothing when under cap', async () => {
    mockPrisma.memory.count.mockResolvedValue(50);
    await enforceUserMemoryCap('org-1', 'user-1');
    expect(mockPrisma.memory.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.memory.deleteMany).not.toHaveBeenCalled();
  });

  it('evicts oldest auto-extracted user memories when over cap', async () => {
    mockPrisma.memory.count.mockResolvedValue(105);
    mockPrisma.memory.findMany.mockResolvedValue([
      { id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }, { id: 'old-4' }, { id: 'old-5' },
    ]);
    mockPrisma.memory.deleteMany.mockResolvedValue({ count: 5 });

    await enforceUserMemoryCap('org-1', 'user-1');

    expect(mockPrisma.memory.count).toHaveBeenCalledWith({
      where: { orgId: 'org-1', userId: 'user-1', source: 'auto' },
    });
    expect(mockPrisma.memory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'org-1', userId: 'user-1', source: 'auto' },
      take: 5,
    }));
    expect(mockPrisma.memory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2', 'old-3', 'old-4', 'old-5'] } },
    });
  });
});
```

- [ ] **Step 2:** Run `npm test`, commit: `git commit -m "test: add enforceUserMemoryCap test coverage"`

---

### Task 13: Minor fixes batch — logger, MCP pool, console.error, prose styling

**Files:**
- Modify: `src/app/(app)/chat/page.tsx` — replace `console.error` with `logger.error`
- Modify: `src/lib/mcp-pool.ts` — change `.close().catch(() => {})` to `.close().catch((e) => logger.warn(...))`
- Modify: `src/components/chat/message-bubble.tsx` — add `prose-code:bg-white prose-code:px-1 prose-code:rounded` to prose classes
- Modify: `tests/lib/logger.test.ts` — add a test verifying arg order (context passed first to pino)

- [ ] **Step 1:** Fix `chat/page.tsx` — import logger, replace `console.error` with `logger.error`.

- [ ] **Step 2:** Fix `mcp-pool.ts` — replace all 4 `.catch(() => {})` with `.catch((e) => logger.warn('[mcp-pool] Client close failed', { error: e instanceof Error ? e.message : String(e) }))`.

- [ ] **Step 3:** Fix `message-bubble.tsx` — add inline code styling to the prose classes.

- [ ] **Step 4:** Add logger arg-order test to `logger.test.ts`.

- [ ] **Step 5:** Run `npm test`, commit: `git commit -m "fix: minor — structured logging, MCP close warnings, inline code styling, logger tests"`

---

### Task 14: Accessibility — skip-to-content + conversation delete tap target

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/conversation-item.tsx`

- [ ] **Step 1:** In `layout.tsx`, add skip link as first child and `id="main"` on the main tag:
```tsx
<div className="flex h-screen flex-col md:flex-row">
  <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-blue-600">
    Skip to content
  </a>
  <MobileNav ... />
  <Sidebar />
  <main id="main" className="flex-1 overflow-y-auto">{children}</main>
</div>
```

- [ ] **Step 2:** In `conversation-item.tsx`, add minimum tap target size to the delete button trigger:
```tsx
<button className="min-h-[44px] min-w-[44px] flex items-center justify-center text-xs text-gray-400 hover:text-red-500 shrink-0" ...>
```

- [ ] **Step 3:** Run `npm test`, commit: `git commit -m "fix: skip-to-content link + minimum tap target for conversation delete"`

---

### Task 15: Documentation fixes

**Files:**
- Modify: `docs/features/scaffolding-auth-db/SUMMARY.md` — fix "first-user-is-admin" to "PCO role mapping", update `middleware.ts` → `proxy.ts`
- Modify: `AGENTS.md` — add comment to rules pseudocode about admin-only system toggle at API layer
- Modify: `Makefile` — add `test-e2e` to `.PHONY`
- Modify: `docs/KNOWN_ISSUES.md` — update memory cap description to mention both 200 org + 100 user caps
- Delete: `.claude/worktrees/dreamy-margulis/` if it exists (stale worktree)

- [ ] **Step 1:** Make all doc changes.
- [ ] **Step 2:** Clean up stale worktree: `rm -rf .claude/worktrees/dreamy-margulis` (if exists).
- [ ] **Step 3:** Run `npm test`, commit: `git commit -m "docs: fix scaffolding summary, AGENTS.md pseudocode, Makefile phony, memory cap description"`

---
