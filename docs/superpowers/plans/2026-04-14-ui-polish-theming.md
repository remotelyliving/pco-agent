# UI Polish & Dark Mode Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light/dark mode theming, migrate 60+ hardcoded colors to theme tokens, polish the sidebar with icons and branding, and fix dropdown casing inconsistencies.

**Architecture:** Install `next-themes` to toggle `.dark` class on `<html>` (dark mode CSS variables already exist in globals.css). Systematically replace hardcoded Tailwind color classes with CSS variable-based theme tokens across 12 components. Polish sidebar with lucide icons, branded monogram, and theme toggle.

**Tech Stack:** `next-themes`, lucide-react (already installed), Tailwind CSS v4 with OKLCH theme variables, shadcn/ui

**Spec:** [docs/superpowers/specs/2026-04-14-ui-polish-theming-design.md](../specs/2026-04-14-ui-polish-theming-design.md)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/theme-provider.tsx` | Client-side wrapper for next-themes `ThemeProvider` |
| `src/components/theme-toggle.tsx` | Sun/Moon/Monitor toggle button for sidebar |
| `src/lib/ai/provider-meta.ts` | Shared provider display names (deduplicated from wizard + settings) |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/globals.css` | Add `--warning` color variable, update `--primary` to blue |
| `src/app/layout.tsx` | Wrap in ThemeProvider, add `suppressHydrationWarning` |
| `src/components/sidebar.tsx` | SP monogram, lucide icons, "Recent" header, theme toggle, color tokens |
| `src/components/mobile-nav.tsx` | Mirror sidebar: icons, branding, theme toggle, color tokens |
| `src/components/conversation-item.tsx` | Color token migration |
| `src/components/chat/chat-interface.tsx` | Color token migration |
| `src/components/chat/message-bubble.tsx` | Color token migration |
| `src/components/chat/file-chip.tsx` | Color token migration |
| `src/components/chat/file-card.tsx` | Color token migration |
| `src/components/rules/rule-editor.tsx` | Color token migration |
| `src/components/rules/rule-list.tsx` | Color token migration |
| `src/components/settings/api-key-form.tsx` | Color token migration, use shared provider names |
| `src/components/setup/setup-wizard.tsx` | Color token migration, use shared provider names |
| `src/components/memory/memory-list.tsx` | Color token migration |

---

## Task 1: CSS Variables — Add Warning Color & Update Primary to Blue

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update primary to blue and add warning colors in light mode**

In `src/app/globals.css`, in the `:root` block (line 52), replace these lines:

```css
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
```

with:

```css
  --primary: oklch(0.546 0.245 262.881);
  --primary-foreground: oklch(0.985 0 0);
  --warning: oklch(0.75 0.15 75);
  --warning-foreground: oklch(0.35 0.12 75);
```

- [ ] **Step 2: Update primary to blue and add warning colors in dark mode**

In the `.dark` block (line 87), replace these lines:

```css
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
```

with:

```css
  --primary: oklch(0.623 0.214 259.815);
  --primary-foreground: oklch(0.985 0 0);
  --warning: oklch(0.75 0.12 75);
  --warning-foreground: oklch(0.85 0.1 75);
```

- [ ] **Step 3: Add warning to theme inline mapping**

In the `@theme inline` block (after line 30, near the `--color-destructive` line), add:

```css
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "style: update primary to blue and add warning color variables"
```

---

## Task 2: Theme Provider & Layout Setup

**Files:**
- Create: `src/components/theme-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install next-themes**

Run: `npm install next-themes`

- [ ] **Step 2: Create ThemeProvider wrapper**

Create `src/components/theme-provider.tsx`:

```typescript
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 3: Wrap layout in ThemeProvider**

In `src/app/layout.tsx`, add import:

```typescript
import { ThemeProvider } from '@/components/theme-provider';
```

Update the `<html>` tag to add `suppressHydrationWarning`:

```typescript
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
```

Wrap `{children}` in the `<body>` with `ThemeProvider`:

```typescript
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Verify dark mode works**

Run: `npm run dev`
Open the app, open browser DevTools, add `class="dark"` to the `<html>` element manually.
Expected: Background should turn dark, text should turn light. Remove the class when done.

- [ ] **Step 6: Commit**

```bash
git add src/components/theme-provider.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add next-themes provider for light/dark mode support"
```

---

## Task 3: Theme Toggle Component

**Files:**
- Create: `src/components/theme-toggle.tsx`

- [ ] **Step 1: Create the theme toggle component**

Create `src/components/theme-toggle.tsx`:

```typescript
'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-md">
        <div className="h-4 w-4" />
      </div>
    );
  }

  function cycleTheme() {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const label =
    theme === 'dark' ? 'Dark mode' : theme === 'light' ? 'Light mode' : 'System theme';

  return (
    <button
      onClick={cycleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/theme-toggle.tsx
git commit -m "feat: add theme toggle component (sun/moon/monitor cycle)"
```

---

## Task 4: Provider Name Deduplication

**Files:**
- Create: `src/lib/ai/provider-meta.ts`

- [ ] **Step 1: Create shared provider metadata**

Create `src/lib/ai/provider-meta.ts`:

```typescript
export interface ProviderInfo {
  name: string;
  description: string;
  keyUrl: string;
  keySteps: string[];
}

export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export const PROVIDER_INFO: Record<SupportedProvider, ProviderInfo> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Advanced AI with excellent reasoning and tool use',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keySteps: [
      'Go to console.anthropic.com',
      'Sign in or create an account',
      'Click "API Keys" in the sidebar',
      'Click "Create Key" and copy the key',
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'Widely used AI with strong general capabilities',
    keyUrl: 'https://platform.openai.com/api-keys',
    keySteps: [
      'Go to platform.openai.com',
      'Sign in or create an account',
      'Click "API keys" in the sidebar',
      'Click "Create new secret key" and copy it',
    ],
  },
  google: {
    name: 'Google (Gemini)',
    description: 'Google AI with a generous free tier',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keySteps: [
      'Go to aistudio.google.com',
      'Sign in with your Google account',
      'Click "Get API key"',
      'Create a key and copy it',
    ],
  },
};

export function getProviderDisplayName(provider: string): string {
  return (PROVIDER_INFO as Record<string, ProviderInfo>)[provider]?.name ?? provider;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/provider-meta.ts
git commit -m "refactor: extract shared provider display names to provider-meta.ts"
```

---

## Task 5: Sidebar Polish

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Update sidebar imports**

In `src/components/sidebar.tsx`, replace the imports section (lines 1-11) with:

```typescript
import { auth, signOut } from '@/lib/auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { listConversations } from '@/lib/chat/persist';
import { prisma } from '@/lib/db';
import { ConversationItem } from '@/components/conversation-item';
import { ThemeToggle } from '@/components/theme-toggle';
import { BookOpen, Brain, Settings } from 'lucide-react';
```

- [ ] **Step 2: Replace the nav element with polished version**

Replace the entire return statement (lines 32-108) with:

```typescript
  return (
    <nav className="hidden md:flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar" aria-label="Main navigation">
      <header className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            SP
          </div>
          <h2 className="text-lg font-semibold text-sidebar-foreground">Service Planner</h2>
        </div>
        {orgName && <p className="text-sm font-medium text-sidebar-foreground/80">{orgName}</p>}
        <p className="text-sm text-muted-foreground">
          {user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Editor' : 'Member'}
        </p>
      </header>

      <Separator />

      <div className="space-y-1 p-4">
        <Link
          href="/chat"
          className={cn(buttonVariants({ variant: 'default' }), 'w-full')}
        >
          + New Chat
        </Link>
        <Link
          href="/rules"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-2')}
        >
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          Rules
        </Link>
        <Link
          href="/memory"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-2')}
        >
          <Brain className="h-4 w-4 text-muted-foreground" />
          Memory
        </Link>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-2')}
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Settings
        </Link>
      </div>

      <div className="px-4 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2">
          Recent
        </p>
      </div>

      <ScrollArea className="flex-1 px-4">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversations yet</p>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <ConversationItem key={conv.id} id={conv.id} title={conv.title} updatedAt={conv.updatedAt.toISOString()} />
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium truncate text-sidebar-foreground flex-1">{user?.name}</p>
          <ThemeToggle />
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <Button variant="outline" size="sm" type="submit" className="w-full text-muted-foreground">
            Sign out
          </Button>
        </form>
      </div>
    </nav>
  );
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "style: polish sidebar with SP monogram, lucide icons, theme toggle, and color tokens"
```

---

## Task 6: Mobile Nav Polish

**Files:**
- Modify: `src/components/mobile-nav.tsx`

- [ ] **Step 1: Read the current mobile nav**

Read `src/components/mobile-nav.tsx` fully to understand the current structure.

- [ ] **Step 2: Update mobile nav imports and add icons**

Add to imports:

```typescript
import { ThemeToggle } from '@/components/theme-toggle';
import { BookOpen, Brain, Settings, Menu, X } from 'lucide-react';
```

- [ ] **Step 3: Apply color token migration and sidebar parity**

Apply these changes throughout the file:
- Replace `bg-gray-50` with `bg-sidebar`
- Replace `hover:bg-gray-100` with `hover:bg-muted`
- Replace `text-gray-700`, `text-gray-500` with `text-sidebar-foreground`, `text-muted-foreground`
- Replace `border-gray-200` with `border-sidebar-border`
- Add SP monogram matching sidebar
- Add icons to nav links matching sidebar (BookOpen, Brain, Settings)
- Add `<ThemeToggle />` in the drawer
- Change sign-out button from `text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700` to `text-muted-foreground`
- Replace hamburger/close button with `<Menu>` and `<X>` lucide icons

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/mobile-nav.tsx
git commit -m "style: mirror sidebar polish to mobile nav — icons, branding, theme toggle, color tokens"
```

---

## Task 7: Message Bubble Color Tokens

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Migrate bubble colors**

In `src/components/chat/message-bubble.tsx`, replace line 47:

```typescript
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
```

with:

```typescript
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
```

- [ ] **Step 2: Migrate prose code background for dark mode**

Replace line 62:

```typescript
              <div key={i} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-table:my-2 prose-code:bg-white prose-code:px-1 prose-code:rounded">
```

with:

```typescript
              <div key={i} className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-table:my-2 prose-code:bg-muted prose-code:px-1 prose-code:rounded">
```

- [ ] **Step 3: Migrate tool call display colors**

Replace line 94:

```typescript
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
```

with:

```typescript
                className="my-2 rounded border border-border bg-card p-2 text-sm text-muted-foreground"
```

Replace line 107 (same pattern):

```typescript
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
```

with:

```typescript
                className="my-2 rounded border border-border bg-card p-2 text-sm text-muted-foreground"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/message-bubble.tsx
git commit -m "style: migrate message bubble colors to theme tokens"
```

---

## Task 8: Chat Interface Color Tokens

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Migrate thinking indicator**

Replace the thinking indicator div (around line 277):

```typescript
            <div className="rounded-lg bg-gray-100 px-4 py-3 text-gray-500 flex items-center gap-1">
```

with:

```typescript
            <div className="rounded-lg bg-muted px-4 py-3 text-muted-foreground flex items-center gap-1">
```

Replace the bouncing dots (3 instances of `bg-gray-400`):

```typescript
                <span className="animate-bounce [animation-delay:0ms] h-1 w-1 rounded-full bg-gray-400" />
                <span className="animate-bounce [animation-delay:150ms] h-1 w-1 rounded-full bg-gray-400" />
                <span className="animate-bounce [animation-delay:300ms] h-1 w-1 rounded-full bg-gray-400" />
```

with:

```typescript
                <span className="animate-bounce [animation-delay:0ms] h-1 w-1 rounded-full bg-muted-foreground" />
                <span className="animate-bounce [animation-delay:150ms] h-1 w-1 rounded-full bg-muted-foreground" />
                <span className="animate-bounce [animation-delay:300ms] h-1 w-1 rounded-full bg-muted-foreground" />
```

- [ ] **Step 2: Migrate error alert**

Replace (around line 292):

```typescript
          className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
```

with:

```typescript
          className="mx-4 mb-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
```

- [ ] **Step 3: Migrate consent banner**

Replace (around line 299):

```typescript
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
```

with:

```typescript
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning-foreground">
```

Replace the consent dismiss button (around line 303):

```typescript
          <button onClick={dismissConsent} className="shrink-0 min-h-[44px] min-w-[44px] px-3 font-medium text-amber-600 hover:text-amber-800">Got it</button>
```

with:

```typescript
          <button onClick={dismissConsent} className="shrink-0 min-h-[44px] min-w-[44px] px-3 font-medium text-warning-foreground hover:text-foreground">Got it</button>
```

- [ ] **Step 4: Migrate empty state**

Replace (around line 247):

```typescript
              <h2 className="text-lg font-semibold text-gray-700">What can I help with?</h2>
              <p className="mt-1 text-sm text-gray-400">Try one of these, or ask your own question.</p>
```

with:

```typescript
              <h2 className="text-lg font-semibold text-foreground">What can I help with?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Try one of these, or ask your own question.</p>
```

Replace prompt buttons (around line 261):

```typescript
                  className="rounded-lg border border-gray-200 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
```

with:

```typescript
                  className="rounded-lg border border-border px-4 py-3 text-left text-sm text-foreground hover:bg-muted hover:border-border transition-colors"
```

Replace footer text (around line 267):

```typescript
            <p className="text-xs text-gray-400 text-center mt-2">
```

with:

```typescript
            <p className="text-xs text-muted-foreground text-center mt-2">
```

- [ ] **Step 5: Migrate form footer text**

Replace (around line 345):

```typescript
        <p className="mt-1 text-xs text-gray-400">
```

with:

```typescript
        <p className="mt-1 text-xs text-muted-foreground">
```

- [ ] **Step 6: Migrate paperclip button**

Replace (around line 321):

```typescript
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
```

with:

```typescript
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
```

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/chat-interface.tsx
git commit -m "style: migrate chat interface colors to theme tokens"
```

---

## Task 9: Rule Editor & Rule List Color Tokens

**Files:**
- Modify: `src/components/rules/rule-editor.tsx`
- Modify: `src/components/rules/rule-list.tsx`

- [ ] **Step 1: Migrate rule editor error alert**

In `src/components/rules/rule-editor.tsx`, replace line 100:

```typescript
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
```

with:

```typescript
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
```

- [ ] **Step 2: Read and migrate rule list**

Read `src/components/rules/rule-list.tsx` fully. Apply these replacements throughout:
- `text-gray-400` → `text-muted-foreground`
- `text-gray-500` → `text-muted-foreground`
- `text-gray-600` → `text-muted-foreground`
- `text-red-500 hover:text-red-700` → `text-destructive hover:text-destructive/80`
- `bg-gray-50` → `bg-muted`
- `border-gray-200` → `border-border`
- Any `bg-red-50 text-red-700` → `bg-destructive/10 text-destructive`

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/rules/rule-editor.tsx src/components/rules/rule-list.tsx
git commit -m "style: migrate rule editor and list colors to theme tokens"
```

---

## Task 10: Settings Form — Color Tokens & Provider Names

**Files:**
- Modify: `src/components/settings/api-key-form.tsx`

- [ ] **Step 1: Replace provider name ternary with shared lookup**

In `src/components/settings/api-key-form.tsx`, add import:

```typescript
import { getProviderDisplayName } from '@/lib/ai/provider-meta';
```

Replace lines 94-100 (the provider select items):

```typescript
                {SUPPORTED_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === 'anthropic' ? 'Anthropic (Claude)' :
                     p === 'openai' ? 'OpenAI (GPT)' :
                     p === 'google' ? 'Google (Gemini)' : p}
                  </SelectItem>
                ))}
```

with:

```typescript
                {SUPPORTED_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {getProviderDisplayName(p)}
                  </SelectItem>
                ))}
```

- [ ] **Step 2: Migrate model selection card colors**

Replace the model card button class (around line 116):

```typescript
                      className={`w-full rounded-lg border-2 p-3 text-left transition-colors hover:border-blue-400 ${
                        isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                      }`}
```

with:

```typescript
                      className={`w-full rounded-lg border-2 p-3 text-left transition-colors hover:border-primary/60 ${
                        isSelected ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
```

- [ ] **Step 3: Migrate all remaining hardcoded colors**

Search the file for remaining hardcoded colors and replace:
- `text-blue-700` → `text-primary`
- `text-gray-500` → `text-muted-foreground`
- `text-gray-600` → `text-muted-foreground`
- `bg-amber-100 text-amber-700` → `bg-warning/20 text-warning-foreground`
- `text-amber-600` → `text-warning-foreground`
- `bg-green-50 text-green-700` → `bg-accent text-accent-foreground`
- `bg-red-50 text-red-700` → `bg-destructive/10 text-destructive`
- `border-gray-200` → `border-border`
- `border-t-blue-600` (spinner) → `border-t-primary`
- `border-gray-200` (spinner) → `border-muted`

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/api-key-form.tsx
git commit -m "style: migrate settings form to theme tokens and shared provider names"
```

---

## Task 11: Setup Wizard — Color Tokens & Provider Names

**Files:**
- Modify: `src/components/setup/setup-wizard.tsx`

- [ ] **Step 1: Update PROVIDER_INFO import**

The setup wizard has its own `PROVIDER_INFO` object. Replace its import source to use the shared module. Add import:

```typescript
import { PROVIDER_INFO, SUPPORTED_PROVIDERS } from '@/lib/ai/provider-meta';
```

Remove the local `PROVIDER_INFO` constant and `SUPPORTED_PROVIDERS` from the wizard file (keeping only what the shared module doesn't provide — any UI-specific fields like step text can remain).

- [ ] **Step 2: Migrate progress dots**

Replace the step indicator (around line 143):

```typescript
                className={`h-2 w-16 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
```

with:

```typescript
                className={`h-2 w-16 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`}
```

- [ ] **Step 3: Migrate all hardcoded colors**

Search the file and replace:
- `bg-blue-50 text-blue-800` → `bg-primary/10 text-primary`
- `bg-gray-50 text-gray-700` → `bg-muted text-foreground`
- `border-blue-600 bg-blue-50` → `border-primary bg-primary/10`
- `border-blue-500` → `border-primary`
- `border-gray-200` → `border-border`
- `hover:border-blue-500` → `hover:border-primary/60`
- `bg-blue-100 text-blue-700` → `bg-primary/20 text-primary`
- `bg-amber-100 text-amber-700` → `bg-warning/20 text-warning-foreground`
- `bg-green-100 text-green-700` → `bg-accent text-accent-foreground`
- `text-gray-500` → `text-muted-foreground`
- `text-gray-600` → `text-muted-foreground`
- `text-gray-400` → `text-muted-foreground`
- `text-blue-600 hover:text-blue-700` → `text-primary hover:text-primary/80`

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/setup/setup-wizard.tsx
git commit -m "style: migrate setup wizard to theme tokens and shared provider names"
```

---

## Task 12: Memory List Color Tokens

**Files:**
- Modify: `src/components/memory/memory-list.tsx`

- [ ] **Step 1: Migrate hardcoded colors**

In `src/components/memory/memory-list.tsx`, apply these replacements:

Replace line 33:

```typescript
      <p className="text-sm text-gray-400">
```

with:

```typescript
      <p className="text-sm text-muted-foreground">
```

Replace line 45:

```typescript
        <p className="text-xs text-gray-400 mb-2">Showing first 100 facts</p>
```

with:

```typescript
        <p className="text-xs text-muted-foreground mb-2">Showing first 100 facts</p>
```

Replace line 64:

```typescript
                className={`text-sm text-gray-600 mt-0.5 cursor-pointer ${expandedId === memory.id ? '' : 'truncate'}`}
```

with:

```typescript
                className={`text-sm text-muted-foreground mt-0.5 cursor-pointer ${expandedId === memory.id ? '' : 'truncate'}`}
```

Replace line 77:

```typescript
                    className="text-red-500 hover:text-red-700 shrink-0"
```

with:

```typescript
                    className="text-destructive hover:text-destructive/80 shrink-0"
```

Replace line 143:

```typescript
          <p className="text-sm text-gray-500 mt-1">
```

with:

```typescript
          <p className="text-sm text-muted-foreground mt-1">
```

Replace spinner (line 188):

```typescript
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
```

with:

```typescript
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/memory/memory-list.tsx
git commit -m "style: migrate memory list colors to theme tokens"
```

---

## Task 13: File Chip & File Card Color Tokens

**Files:**
- Modify: `src/components/chat/file-chip.tsx`
- Modify: `src/components/chat/file-card.tsx`

- [ ] **Step 1: Read and migrate file-chip.tsx**

Read `src/components/chat/file-chip.tsx`. Replace all hardcoded colors:
- `text-gray-*` → `text-muted-foreground` or `text-foreground`
- `bg-gray-*` → `bg-muted`
- `border-gray-*` → `border-border`
- `text-red-*` → `text-destructive`
- `bg-red-*` → `bg-destructive/10`
- `bg-blue-*` (progress) → `bg-primary`

- [ ] **Step 2: Read and migrate file-card.tsx**

Read `src/components/chat/file-card.tsx`. Replace all hardcoded colors:
- `text-gray-*` → `text-muted-foreground` or `text-foreground`
- `bg-gray-*` → `bg-muted`
- `border-gray-*` → `border-border`
- `text-blue-*` → `text-primary`
- `hover:text-blue-*` → `hover:text-primary/80`

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/file-chip.tsx src/components/chat/file-card.tsx
git commit -m "style: migrate file chip and card colors to theme tokens"
```

---

## Task 14: Conversation Item Color Tokens

**Files:**
- Modify: `src/components/conversation-item.tsx`

- [ ] **Step 1: Read and migrate conversation-item.tsx**

Read `src/components/conversation-item.tsx`. Replace all hardcoded colors:
- `bg-gray-100` (active state) → `bg-primary/10`
- `text-gray-700` → `text-foreground`
- `text-gray-500` → `text-muted-foreground`
- `border-gray-300` → `border-input`
- `bg-white` → `bg-background`
- `focus:border-blue-500` → `focus:border-ring`
- `text-red-500 hover:text-red-700` → `text-destructive hover:text-destructive/80`
- `bg-red-50 text-red-700` → `bg-destructive/10 text-destructive`
- `hover:bg-gray-100` → `hover:bg-muted`
- `hover:bg-gray-200` → `hover:bg-muted`

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/conversation-item.tsx
git commit -m "style: migrate conversation item colors to theme tokens"
```

---

## Task 15: Visual QA & Full Test Suite

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests pass. Color changes are CSS-only — no logic changes.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `npx next lint`
Expected: No lint errors

- [ ] **Step 4: Visual QA in browser**

Run: `npm run dev`

Check these pages in both light and dark mode (toggle via the new sidebar button):
- `/chat` — empty state, message bubbles, thinking indicator, file upload consent banner
- `/chat/[id]` — conversation with messages, tool calls, file attachments
- `/rules` — rule list, toggle switches, create form, error states
- `/memory` — memory list, add form, badges, delete buttons
- `/settings` — provider select, model cards, test connection
- `/setup` — all 5 wizard steps (if accessible)

Verify:
- No white text on white background
- No black text on black background
- All borders visible in both themes
- Active states (selected conversation, selected model) visible
- Error/warning/success states readable
- Sidebar looks polished with icons and monogram

- [ ] **Step 5: Commit any fixes from QA**

```bash
git add -A
git commit -m "fix: visual QA fixes for dark mode compatibility"
```

---

## Task Summary

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | CSS variables — blue primary + warning color | Simple |
| 2 | Theme provider & layout setup | Simple |
| 3 | Theme toggle component | Simple |
| 4 | Provider name deduplication | Simple |
| 5 | Sidebar polish (major visual upgrade) | Medium |
| 6 | Mobile nav polish (mirror sidebar) | Medium |
| 7 | Message bubble color tokens | Simple |
| 8 | Chat interface color tokens | Medium (many replacements) |
| 9 | Rule editor & list color tokens | Simple |
| 10 | Settings form tokens + provider names | Medium |
| 11 | Setup wizard tokens + provider names | Medium |
| 12 | Memory list color tokens | Simple |
| 13 | File chip & card color tokens | Simple |
| 14 | Conversation item color tokens | Simple |
| 15 | Visual QA & full test suite | Medium |
