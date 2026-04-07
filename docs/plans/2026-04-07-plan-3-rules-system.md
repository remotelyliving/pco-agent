# Plan 3: Rules System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-layer rules system (system defaults + org rules + user rules) with per-user toggle overrides, an admin rules editor, and integrate assembled rules into the chat system prompt.

**Architecture:** Rules are plain-text instructions injected into the AI system prompt. Three layers: system defaults (shipped by us, org-visible), org rules (admin-created, visible to all org members), and user rules (personal). Per-user overrides via `user_rule_settings` table let individuals opt in/out of any visible rule. Rule assembly happens server-side on every chat request, combining effective rules into the system prompt.

**Tech Stack:** Prisma (existing Rule + UserRuleSetting models), Next.js API routes, React Server Components + Client Components, shadcn/ui

---

## File Structure (this plan only)

```
src/
  lib/
    rules/
      assemble.ts          # assembleRules() — resolve effective rules for a user
      queries.ts           # Rule CRUD queries (Prisma)
  app/
    api/
      rules/
        route.ts           # GET (list rules) + POST (create rule)
        [id]/
          route.ts         # PATCH (update rule) + DELETE (delete rule)
      rules/toggle/
        route.ts           # POST — toggle a rule on/off for current user
    (app)/
      rules/
        page.tsx           # Rules management page
  components/
    rules/
      rule-list.tsx        # Client component — list rules with toggles
      rule-editor.tsx      # Client component — create/edit rule dialog
tests/
  lib/
    rules/
      assemble.test.ts     # Rule assembly tests
      queries.test.ts      # Rule query tests
```

---

## Task 1: Rule Assembly Logic (TDD)

**Files:**
- Create: `src/lib/rules/assemble.ts`
- Create: `tests/lib/rules/assemble.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/rules/assemble.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  rule: {
    findMany: vi.fn(),
  },
  userRuleSetting: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { assembleRules } from '@/lib/rules/assemble';

describe('assembleRules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns system rules when user has no overrides', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Check blockout dates', ruleType: 'system', visibility: 'org', orgId: null, createdById: null },
      { id: 'r2', content: 'Confirm before changes', ruleType: 'system', visibility: 'org', orgId: null, createdById: null },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toHaveLength(2);
    expect(rules[0]).toBe('Check blockout dates');
    expect(rules[1]).toBe('Confirm before changes');
  });

  it('includes org rules visible to org members', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'System rule', ruleType: 'system', visibility: 'org', orgId: null, createdById: null },
      { id: 'r2', content: 'Org rule', ruleType: 'org', visibility: 'org', orgId: 'org-1', createdById: 'admin-1' },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('System rule');
    expect(rules).toContain('Org rule');
  });

  it('includes user own private rules', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'System rule', ruleType: 'system', visibility: 'org', orgId: null, createdById: null },
      { id: 'r3', content: 'My personal rule', ruleType: 'user', visibility: 'private', orgId: 'org-1', createdById: 'user-1' },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('My personal rule');
  });

  it('excludes rules the user has opted out of', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'System rule', ruleType: 'system', visibility: 'org', orgId: null, createdById: null },
      { id: 'r2', content: 'Disabled rule', ruleType: 'system', visibility: 'org', orgId: null, createdById: null },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([
      { userId: 'user-1', ruleId: 'r2', enabled: false },
    ]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('System rule');
    expect(rules).not.toContain('Disabled rule');
  });

  it('includes other users public rules the user has opted into', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r4', content: 'Shared public rule', ruleType: 'user', visibility: 'org', orgId: 'org-1', createdById: 'other-user' },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([
      { userId: 'user-1', ruleId: 'r4', enabled: true },
    ]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('Shared public rule');
  });

  it('excludes other users public rules without opt-in', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r4', content: 'Shared rule no opt-in', ruleType: 'user', visibility: 'org', orgId: 'org-1', createdById: 'other-user' },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).not.toContain('Shared rule no opt-in');
  });

  it('returns rules sorted by sortOrder', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Second', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 2 },
      { id: 'r2', content: 'First', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 1 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);

    const rules = await assembleRules('user-1', 'org-1');
    expect(rules[0]).toBe('First');
    expect(rules[1]).toBe('Second');
  });

  it('formats rules as a numbered list when formatAsPrompt is true', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Rule one', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 0 },
      { id: 'r2', content: 'Rule two', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 1 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);

    const prompt = await assembleRules('user-1', 'org-1', { formatAsPrompt: true });
    expect(prompt).toContain('1.');
    expect(prompt).toContain('2.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/rules/assemble.test.ts
```

- [ ] **Step 3: Implement assemble.ts**

```typescript
// src/lib/rules/assemble.ts
import { prisma } from '@/lib/db';

interface AssembleOptions {
  formatAsPrompt?: boolean;
}

export async function assembleRules(
  userId: string,
  orgId: string,
  options?: AssembleOptions,
): Promise<string[] | string> {
  // 1. Fetch all candidate rules:
  //    - System rules (no orgId, ruleType = 'system')
  //    - Org rules (orgId matches, ruleType = 'org')
  //    - User's own rules (createdById = userId)
  //    - Other users' public rules in the org (visibility = 'org', createdById != userId)
  const allRules = await prisma.rule.findMany({
    where: {
      OR: [
        { ruleType: 'system' },
        { ruleType: 'org', orgId },
        { createdById: userId, orgId },
        { ruleType: 'user', visibility: 'org', orgId },
      ],
    },
    orderBy: { sortOrder: 'asc' },
  });

  // 2. Fetch user's override settings
  const settings = await prisma.userRuleSetting.findMany({
    where: { userId },
  });
  const settingsMap = new Map(settings.map((s) => [s.ruleId, s.enabled]));

  // 3. Filter rules based on visibility and user overrides
  const effectiveRules = allRules.filter((rule) => {
    const override = settingsMap.get(rule.id);

    // System + org rules: included by default, excluded if user opted out
    if (rule.ruleType === 'system' || rule.ruleType === 'org') {
      return override !== false;
    }

    // User's own rules: always included (user controls via creating/deleting)
    if (rule.createdById === userId) {
      return true;
    }

    // Other users' public rules: excluded by default, included only if user opted in
    if (rule.ruleType === 'user' && rule.visibility === 'org' && rule.createdById !== userId) {
      return override === true;
    }

    return false;
  });

  const ruleTexts = effectiveRules.map((r) => r.content);

  if (options?.formatAsPrompt) {
    if (ruleTexts.length === 0) return '';
    return ruleTexts.map((text, i) => `${i + 1}. ${text}`).join('\n');
  }

  return ruleTexts;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/rules/assemble.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/ tests/lib/rules/
git commit -m "feat: add rule assembly logic with per-user overrides"
```

---

## Task 2: Rule CRUD Queries (TDD)

**Files:**
- Create: `src/lib/rules/queries.ts`
- Create: `tests/lib/rules/queries.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/rules/queries.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  rule: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  userRuleSetting: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  listRulesForOrg,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  getUserRuleSettings,
} from '@/lib/rules/queries';

describe('rule queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listRulesForOrg returns system + org rules', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'System rule', ruleType: 'system' },
      { id: 'r2', content: 'Org rule', ruleType: 'org' },
    ]);

    const rules = await listRulesForOrg('org-1');
    expect(rules).toHaveLength(2);
    expect(mockPrisma.rule.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ruleType: 'system' },
          { orgId: 'org-1' },
        ],
      },
      orderBy: [{ ruleType: 'asc' }, { sortOrder: 'asc' }],
    });
  });

  it('createRule creates an org rule', async () => {
    mockPrisma.rule.create.mockResolvedValue({
      id: 'new-1', content: 'New rule', ruleType: 'org', orgId: 'org-1',
    });

    const rule = await createRule({
      content: 'New rule',
      ruleType: 'org',
      orgId: 'org-1',
      createdById: 'user-1',
      category: 'general',
    });
    expect(rule.content).toBe('New rule');
  });

  it('updateRule updates content', async () => {
    mockPrisma.rule.update.mockResolvedValue({ id: 'r1', content: 'Updated' });

    await updateRule('r1', { content: 'Updated' });
    expect(mockPrisma.rule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { content: 'Updated' },
    });
  });

  it('deleteRule deletes rule', async () => {
    mockPrisma.rule.delete.mockResolvedValue({ id: 'r1' });

    await deleteRule('r1');
    expect(mockPrisma.rule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('toggleRule upserts a user rule setting', async () => {
    mockPrisma.userRuleSetting.upsert.mockResolvedValue({
      userId: 'user-1', ruleId: 'r1', enabled: false,
    });

    await toggleRule('user-1', 'r1', false);
    expect(mockPrisma.userRuleSetting.upsert).toHaveBeenCalledWith({
      where: { userId_ruleId: { userId: 'user-1', ruleId: 'r1' } },
      update: { enabled: false },
      create: { userId: 'user-1', ruleId: 'r1', enabled: false },
    });
  });

  it('getUserRuleSettings returns settings map', async () => {
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([
      { ruleId: 'r1', enabled: true },
      { ruleId: 'r2', enabled: false },
    ]);

    const settings = await getUserRuleSettings('user-1');
    expect(settings).toEqual({ r1: true, r2: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement queries.ts**

```typescript
// src/lib/rules/queries.ts
import { prisma } from '@/lib/db';

export async function listRulesForOrg(orgId: string) {
  return prisma.rule.findMany({
    where: {
      OR: [
        { ruleType: 'system' },
        { orgId },
      ],
    },
    orderBy: [{ ruleType: 'asc' }, { sortOrder: 'asc' }],
  });
}

export async function createRule(data: {
  content: string;
  ruleType: string;
  orgId: string;
  createdById: string;
  category?: string;
  visibility?: string;
}) {
  return prisma.rule.create({
    data: {
      content: data.content,
      ruleType: data.ruleType,
      orgId: data.orgId,
      createdById: data.createdById,
      category: data.category || null,
      visibility: data.visibility || 'org',
    },
  });
}

export async function updateRule(id: string, data: { content?: string; category?: string; sortOrder?: number }) {
  return prisma.rule.update({
    where: { id },
    data,
  });
}

export async function deleteRule(id: string) {
  return prisma.rule.delete({ where: { id } });
}

export async function toggleRule(userId: string, ruleId: string, enabled: boolean) {
  return prisma.userRuleSetting.upsert({
    where: { userId_ruleId: { userId, ruleId } },
    update: { enabled },
    create: { userId, ruleId, enabled },
  });
}

export async function getUserRuleSettings(userId: string): Promise<Record<string, boolean>> {
  const settings = await prisma.userRuleSetting.findMany({
    where: { userId },
  });
  return Object.fromEntries(settings.map((s) => [s.ruleId, s.enabled]));
}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules/ tests/lib/rules/
git commit -m "feat: add rule CRUD queries with toggle support"
```

---

## Task 3: Integrate Rules into Chat System Prompt

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Update the chat route to use assembled rules**

In `src/app/api/chat/route.ts`, replace the static `buildSystemPrompt()` function with one that accepts assembled rules:

Change `buildSystemPrompt()` to:
```typescript
function buildSystemPrompt(rules: string): string {
  let prompt = `You are a helpful assistant for church staff who use Planning Center Online.

You have access to tools that can search people, view services, check schedules, and manage church data in Planning Center. Use these tools when the user asks about their church data.

Be friendly, use plain language, and avoid technical jargon. If you're unsure about something, say so rather than guessing.

When you use a tool and get results, summarize them in a clear, readable way.`;

  if (rules) {
    prompt += `\n\n## Rules\n\nFollow these rules in all your responses:\n${rules}`;
  }

  return prompt;
}
```

Then in the POST handler, before the `streamText` call, assemble rules:

```typescript
import { assembleRules } from '@/lib/rules/assemble';

// ... inside POST handler, after loading user:
const rules = await assembleRules(session.user.agentUserId, session.user.orgId, { formatAsPrompt: true });
const systemPrompt = buildSystemPrompt(typeof rules === 'string' ? rules : '');
```

- [ ] **Step 2: Verify project builds**

```bash
npx next build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: integrate assembled rules into chat system prompt"
```

---

## Task 4: Rules API Routes

**Files:**
- Create: `src/app/api/rules/route.ts`
- Create: `src/app/api/rules/[id]/route.ts`
- Create: `src/app/api/rules/toggle/route.ts`

- [ ] **Step 1: Create rules list + create route**

```typescript
// src/app/api/rules/route.ts
import { auth } from '@/lib/auth';
import { listRulesForOrg, createRule, getUserRuleSettings } from '@/lib/rules/queries';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rules = await listRulesForOrg(session.user.orgId);
  const settings = await getUserRuleSettings(session.user.agentUserId);

  return Response.json({ rules, settings });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Only admins can create org rules
  const body = await req.json();
  const { content, ruleType, category } = body as {
    content: string;
    ruleType: string;
    category?: string;
  };

  if (!content) {
    return new Response('Content is required', { status: 400 });
  }

  // Non-admins can only create personal rules
  const effectiveRuleType = session.user.role === 'admin' ? (ruleType || 'org') : 'user';

  const rule = await createRule({
    content,
    ruleType: effectiveRuleType,
    orgId: session.user.orgId,
    createdById: session.user.agentUserId,
    category,
    visibility: effectiveRuleType === 'user' ? 'private' : 'org',
  });

  return Response.json(rule, { status: 201 });
}
```

- [ ] **Step 2: Create rule update + delete route**

```typescript
// src/app/api/rules/[id]/route.ts
import { auth } from '@/lib/auth';
import { updateRule, deleteRule } from '@/lib/rules/queries';
import { prisma } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  // Verify ownership or admin
  const rule = await prisma.rule.findUnique({ where: { id } });
  if (!rule) return new Response('Not found', { status: 404 });

  const isOwner = rule.createdById === session.user.agentUserId;
  const isAdmin = session.user.role === 'admin';
  const isSystemRule = rule.ruleType === 'system';

  if (isSystemRule || (!isOwner && !isAdmin)) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await req.json();
  const updated = await updateRule(id, {
    content: body.content,
    category: body.category,
  });

  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  const rule = await prisma.rule.findUnique({ where: { id } });
  if (!rule) return new Response('Not found', { status: 404 });

  const isOwner = rule.createdById === session.user.agentUserId;
  const isAdmin = session.user.role === 'admin';
  const isSystemRule = rule.ruleType === 'system';

  if (isSystemRule || (!isOwner && !isAdmin)) {
    return new Response('Forbidden', { status: 403 });
  }

  await deleteRule(id);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Create toggle route**

```typescript
// src/app/api/rules/toggle/route.ts
import { auth } from '@/lib/auth';
import { toggleRule } from '@/lib/rules/queries';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { ruleId, enabled } = body as { ruleId: string; enabled: boolean };

  if (!ruleId || typeof enabled !== 'boolean') {
    return new Response('ruleId and enabled are required', { status: 400 });
  }

  const setting = await toggleRule(session.user.agentUserId, ruleId, enabled);
  return Response.json(setting);
}
```

- [ ] **Step 4: Verify project builds**

```bash
npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/rules/
git commit -m "feat: add rules API routes — list, create, update, delete, toggle"
```

---

## Task 5: Rules Management UI

**Files:**
- Create: `src/components/rules/rule-list.tsx`
- Create: `src/components/rules/rule-editor.tsx`
- Create: `src/app/(app)/rules/page.tsx`
- Modify: `src/components/sidebar.tsx` (add Rules link)

- [ ] **Step 1: Create rule list component**

```tsx
// src/components/rules/rule-list.tsx
'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RuleEditor } from '@/components/rules/rule-editor';

interface Rule {
  id: string;
  content: string;
  ruleType: string;
  category: string | null;
  visibility: string;
  createdById: string | null;
}

export function RuleList({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [showEditor, setShowEditor] = useState(false);

  async function loadRules() {
    const res = await fetch('/api/rules');
    const data = await res.json();
    setRules(data.rules);
    setSettings(data.settings);
  }

  useEffect(() => { loadRules(); }, []);

  async function handleToggle(ruleId: string, enabled: boolean) {
    setSettings((prev) => ({ ...prev, [ruleId]: enabled }));
    await fetch('/api/rules/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId, enabled }),
    });
  }

  async function handleDelete(ruleId: string) {
    await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
    loadRules();
  }

  function isEnabled(rule: Rule): boolean {
    const override = settings[rule.id];
    // System + org rules: enabled by default unless opted out
    if (rule.ruleType === 'system' || rule.ruleType === 'org') {
      return override !== false;
    }
    // User's own rules: always enabled
    if (rule.createdById === userId) return true;
    // Other users' public rules: disabled unless opted in
    return override === true;
  }

  const systemRules = rules.filter((r) => r.ruleType === 'system');
  const orgRules = rules.filter((r) => r.ruleType === 'org');
  const userRules = rules.filter((r) => r.ruleType === 'user');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rules</h1>
        <Button onClick={() => setShowEditor(true)}>
          {isAdmin ? 'Add Rule' : 'Add Personal Rule'}
        </Button>
      </div>

      <p className="text-sm text-gray-500">
        Rules tell the AI how to behave. Toggle rules on or off to customize your experience.
      </p>

      {showEditor && (
        <RuleEditor
          isAdmin={isAdmin}
          onSave={() => { setShowEditor(false); loadRules(); }}
          onCancel={() => setShowEditor(false)}
        />
      )}

      <RuleSection title="System Defaults" rules={systemRules} isEnabled={isEnabled} onToggle={handleToggle} onDelete={handleDelete} canDelete={false} userId={userId} />
      <RuleSection title="Organization Rules" rules={orgRules} isEnabled={isEnabled} onToggle={handleToggle} onDelete={handleDelete} canDelete={isAdmin} userId={userId} />
      {userRules.length > 0 && (
        <RuleSection title="Personal Rules" rules={userRules} isEnabled={isEnabled} onToggle={handleToggle} onDelete={handleDelete} canDelete={true} userId={userId} />
      )}
    </div>
  );
}

function RuleSection({
  title,
  rules,
  isEnabled,
  onToggle,
  onDelete,
  canDelete,
  userId,
}: {
  title: string;
  rules: Rule[];
  isEnabled: (rule: Rule) => boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  userId: string;
}) {
  if (rules.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-start gap-3 rounded-lg border p-3">
            <Switch
              checked={isEnabled(rule)}
              onCheckedChange={(checked) => onToggle(rule.id, checked)}
              aria-label={`Toggle rule: ${rule.content.slice(0, 50)}`}
            />
            <div className="flex-1">
              <p className="text-sm">{rule.content}</p>
              {rule.category && (
                <Badge variant="secondary" className="mt-1">{rule.category}</Badge>
              )}
            </div>
            {(canDelete || rule.createdById === userId) && rule.ruleType !== 'system' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(rule.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create rule editor component**

```tsx
// src/components/rules/rule-editor.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RuleEditor({
  isAdmin,
  onSave,
  onCancel,
}: {
  isAdmin: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [ruleType, setRuleType] = useState(isAdmin ? 'org' : 'user');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), ruleType, category: category || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
    } catch {
      // Error handling — could add error state
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Rule</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Rule</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a rule in plain English, e.g., 'Always include phone numbers when listing people.'"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category (optional)</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border p-2"
            >
              <option value="">None</option>
              <option value="general">General</option>
              <option value="scheduling">Scheduling</option>
              <option value="people">People</option>
            </select>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="ruleType">Scope</Label>
              <select
                id="ruleType"
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full rounded-md border p-2"
              >
                <option value="org">Organization (visible to all)</option>
                <option value="user">Personal (just me)</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !content.trim()}>
              {saving ? 'Saving...' : 'Save Rule'}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create rules page**

```tsx
// src/app/(app)/rules/page.tsx
import { RuleList } from '@/components/rules/rule-list';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function RulesPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl p-6">
      <RuleList
        isAdmin={session.user.role === 'admin'}
        userId={session.user.agentUserId}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add rules link to sidebar**

In `src/components/sidebar.tsx`, add a Rules link next to Settings:

```tsx
<Link href="/rules" className={buttonVariants({ variant: 'ghost', className: 'w-full justify-start' })}>
  Rules
</Link>
```

- [ ] **Step 5: Verify project builds**

```bash
npx next build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/rules/ src/app/\(app\)/rules/ src/components/sidebar.tsx
git commit -m "feat: add rules management UI with toggles and editor"
```

---

## Task 6: Documentation + Dev Queue Update

**Files:**
- Create: `docs/features/rules-system/SUMMARY.md`
- Modify: `DEV_QUEUE.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create feature summary**

```markdown
# Feature: Rules System

**Status:** Complete
**Last Updated:** YYYY-MM-DD

## What It Does
Three-layer rules system (system defaults + org rules + user rules) with per-user toggle
overrides. Rules are plain-text instructions injected into the AI system prompt, guiding
how the assistant behaves for each user.

## Key Files
- `src/lib/rules/assemble.ts` — assembleRules() resolves effective rules per user
- `src/lib/rules/queries.ts` — Rule + UserRuleSetting CRUD operations
- `src/app/api/rules/route.ts` — GET (list) + POST (create) API
- `src/app/api/rules/[id]/route.ts` — PATCH (update) + DELETE
- `src/app/api/rules/toggle/route.ts` — POST toggle on/off
- `src/components/rules/rule-list.tsx` — Rule list with switches
- `src/components/rules/rule-editor.tsx` — Create new rule form
- `src/app/(app)/rules/page.tsx` — Rules management page

## Design Decisions
- Rules are plain text, not code — the AI interprets them naturally
- Three layers: system (shipped), org (admin-created), user (personal)
- System/org rules enabled by default, opt-out via toggle
- Other users' public rules disabled by default, opt-in via toggle
- User's own rules always active (managed via create/delete)
- System rules cannot be edited or deleted (only toggled)
- Non-admins can only create personal rules
- Rules assembled per-request into numbered list in system prompt

## Known Limitations
- No drag-and-drop reordering (sortOrder set via API only)
- No rule templates or suggestions
- No rule effectiveness analytics
- No import/export of rules
```

- [ ] **Step 2: Update DEV_QUEUE.md, CLAUDE.md, AGENTS.md**

Move Plan 3 to Done. Update project structure. Update AGENTS.md "How Rules Work" section to reflect actual implementation.

- [ ] **Step 3: Commit**

```bash
git add docs/ DEV_QUEUE.md CLAUDE.md AGENTS.md
git commit -m "docs: add Plan 3 feature summary and update project documentation"
```
