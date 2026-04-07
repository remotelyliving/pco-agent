# Plan 5: Setup Wizard + UX Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-time setup wizard that guides new users through API key configuration, and polish the overall UX — loading states, better error handling, page titles, and responsive improvements.

**Architecture:** A setup wizard detects first-time users (no API key configured) and guides them through provider selection and key entry before they can chat. UX polish touches existing pages to add metadata, loading indicators, and responsive refinements.

**Tech Stack:** Next.js 16 App Router, React, shadcn/ui, Tailwind v4

---

## File Structure (this plan only)

```
src/
  app/
    (app)/
      setup/
        page.tsx           # Setup wizard page
  components/
    setup/
      setup-wizard.tsx     # Multi-step wizard component
  lib/
    setup.ts              # checkUserSetup() — detect if user needs setup
```

---

## Task 1: Setup Detection + Redirect Logic

**Files:**
- Create: `src/lib/setup.ts`
- Modify: `src/app/(app)/chat/page.tsx`

- [ ] **Step 1: Create setup check function**

```typescript
// src/lib/setup.ts
import { prisma } from '@/lib/db';

export async function needsSetup(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiProvider: true, apiKeyEnc: true },
  });
  return !user?.apiProvider || !user?.apiKeyEnc;
}
```

- [ ] **Step 2: Update chat page to redirect to setup if needed**

Modify `src/app/(app)/chat/page.tsx` to check setup status:

```tsx
import { needsSetup } from '@/lib/setup';
import { redirect } from 'next/navigation';

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  if (await needsSetup(session.user.agentUserId)) {
    redirect('/setup');
  }

  return <ChatInterface />;
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add setup detection with redirect for unconfigured users"
```

---

## Task 2: Setup Wizard UI

**Files:**
- Create: `src/app/(app)/setup/page.tsx`
- Create: `src/components/setup/setup-wizard.tsx`

- [ ] **Step 1: Create setup wizard component**

A friendly multi-step wizard:
1. Welcome message explaining what the app does
2. Provider selection (same as settings but with more explanation)
3. API key entry with provider-specific instructions
4. Test connection (optional — just save and try)
5. Success — redirect to chat

The wizard should reuse the settings API (`POST /api/settings`) for saving.

Key UX principles:
- Plain language, no jargon
- Provider-specific help text ("Here's how to get an Anthropic API key: 1. Go to console.anthropic.com...")
- Big, clear buttons
- Progress indication (step 1 of 3)

```tsx
// src/components/setup/setup-wizard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MODEL_OPTIONS } from '@/lib/ai/models';
import { SUPPORTED_PROVIDERS } from '@/lib/ai/providers';

const PROVIDER_INFO: Record<string, { name: string; description: string; keyUrl: string; steps: string[] }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Claude is great at understanding context, following instructions, and explaining things clearly.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    steps: [
      'Go to console.anthropic.com and sign in (or create an account)',
      'Click "API Keys" in the left sidebar',
      'Click "Create Key" and give it a name like "PCO Assistant"',
      'Copy the key — it starts with "sk-ant-"',
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'GPT models are versatile and widely used. Great all-around performance.',
    keyUrl: 'https://platform.openai.com/api-keys',
    steps: [
      'Go to platform.openai.com and sign in',
      'Click your profile icon, then "API keys"',
      'Click "Create new secret key"',
      'Copy the key — it starts with "sk-"',
    ],
  },
  google: {
    name: 'Google (Gemini)',
    description: 'Gemini models are fast and affordable. Good for everyday tasks.',
    keyUrl: 'https://aistudio.google.com/apikey',
    steps: [
      'Go to aistudio.google.com',
      'Click "Get API key" in the top menu',
      'Click "Create API key"',
      'Copy the key',
    ],
  },
};

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiProvider: provider, apiKey }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Progress */}
      <div className="mb-8 flex justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-16 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to Planning Center Assistant!</CardTitle>
            <CardDescription className="text-base">
              This app lets you chat with an AI that knows your church data.
              Ask about people, services, schedules — anything in Planning Center.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              To get started, you will need an AI provider API key. This is like a password
              that lets our app talk to an AI service on your behalf. Your key is encrypted
              and stored securely.
            </p>
            <Button onClick={() => setStep(2)} className="w-full" size="lg">
              Let&apos;s Get Started
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose Your AI Provider</CardTitle>
            <CardDescription>
              Pick which AI service you would like to use. All three work great — choose
              whichever you prefer or already have an account with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {SUPPORTED_PROVIDERS.map((p) => {
              const info = PROVIDER_INFO[p];
              return (
                <button
                  key={p}
                  onClick={() => { setProvider(p); setStep(3); }}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors hover:border-blue-500 ${
                    provider === p ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <p className="font-semibold">{info.name}</p>
                  <p className="text-sm text-gray-600">{info.description}</p>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {step === 3 && provider && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Your {PROVIDER_INFO[provider].name} API Key</CardTitle>
            <CardDescription>
              Follow these steps to get your API key:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
              {PROVIDER_INFO[provider].steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>

            <a
              href={PROVIDER_INFO[provider].keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-blue-600 underline"
            >
              Open {PROVIDER_INFO[provider].name} in a new tab
            </a>

            <div className="space-y-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here"
                className="text-lg"
              />
              <p className="text-xs text-gray-500">
                Your key is encrypted before being saved. We can never see it in plain text.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!apiKey || saving}
                className="flex-1"
                size="lg"
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
            <CardDescription className="text-base">
              Your AI provider is configured. You can now start chatting with your
              Planning Center data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/chat')} className="w-full" size="lg">
              Start Chatting
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create setup page**

```tsx
// src/app/(app)/setup/page.tsx
import { SetupWizard } from '@/components/setup/setup-wizard';

export default function SetupPage() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <SetupWizard />
    </div>
  );
}
```

- [ ] **Step 3: Verify project builds**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add setup wizard for first-time API key configuration"
```

---

## Task 3: Page Metadata + UX Polish

**Files:**
- Modify various pages to add metadata
- Modify loading states

- [ ] **Step 1: Add page metadata to all pages**

Add `export const metadata` or `export function generateMetadata()` to each page:

- `src/app/(auth)/login/page.tsx`: title "Sign In — Planning Center Assistant"
- `src/app/(app)/chat/page.tsx`: title "Chat — Planning Center Assistant"
- `src/app/(app)/settings/page.tsx`: title "Settings — Planning Center Assistant"
- `src/app/(app)/rules/page.tsx`: title "Rules — Planning Center Assistant"
- `src/app/(app)/memory/page.tsx`: title "Memory — Planning Center Assistant"
- `src/app/(app)/setup/page.tsx`: title "Setup — Planning Center Assistant"

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add page metadata for all routes"
```

---

## Task 4: Documentation + Dev Queue Update

**Files:**
- Create: `docs/features/setup-wizard-ux/SUMMARY.md`
- Modify: `DEV_QUEUE.md`, `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: Create feature summary**

- [ ] **Step 2: Update DEV_QUEUE.md — move Plan 5 to Done, mark all plans complete**

- [ ] **Step 3: Update CLAUDE.md and AGENTS.md with new files**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: add Plan 5 feature summary — all plans complete"
```
