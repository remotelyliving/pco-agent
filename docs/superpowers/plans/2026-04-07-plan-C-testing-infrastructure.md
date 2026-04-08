# Plan C: Testing Infrastructure — Stryker + Playwright

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Stryker mutation testing (80% threshold on business logic) and Playwright E2E testing with MSW mocked backends.

**Architecture:** Stryker targets only `src/lib/**/*.ts` (business logic) via the Vitest runner. Playwright tests run against `next dev` with MSW intercepting all API calls, enabling UI flow testing without a real database or PCO OAuth.

**Tech Stack:** @stryker-mutator/core, @stryker-mutator/vitest-runner, @stryker-mutator/typescript-checker, @playwright/test, msw

**Spec:** `docs/superpowers/specs/2026-04-07-audit-remediation-design.md` — Sections 2.3 and 2.4

**Prerequisites:** Plans A and B complete

---

### Task 1: Install Stryker Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Stryker packages**

```bash
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

- [ ] **Step 2: Verify installation**

```bash
npx stryker --version
```

Expected: Stryker version printed (e.g., `8.x.x`)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Stryker mutation testing dependencies"
```

---

### Task 2: Configure Stryker

**Files:**
- Create: `stryker.config.mjs`
- Modify: `package.json` (add script)
- Modify: `Makefile` (add target)

- [ ] **Step 1: Create stryker.config.mjs**

Create `stryker.config.mjs` at project root:

```javascript
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.test.ts',
    '!src/lib/**/*.spec.ts',
  ],
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  reporters: ['clear-text', 'html'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 80,
  },
  tempDirName: '.stryker-tmp',
};
```

- [ ] **Step 2: Add npm script**

In `package.json` scripts, add:

```json
"test:mutation": "stryker run"
```

- [ ] **Step 3: Add Makefile target**

In `Makefile`, add after the `test-coverage` target:

```makefile
test-mutation:
	npx stryker run
```

Also update the `.PHONY` line to include `test-mutation`.

- [ ] **Step 4: Add .stryker-tmp and reports to .gitignore**

Check if `.gitignore` already ignores these. If not, add:

```
.stryker-tmp/
reports/
```

- [ ] **Step 5: Run Stryker to verify it works**

```bash
npx stryker run --logLevel info 2>&1 | head -50
```

Expected: Stryker runs, finds mutants in `src/lib/`, runs tests against them. It may not hit 80% threshold yet — that's OK for now.

- [ ] **Step 6: Commit**

```bash
git add stryker.config.mjs package.json Makefile .gitignore
git commit -m "feat: configure Stryker mutation testing for src/lib"
```

---

### Task 3: Install Playwright and MSW

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Install MSW**

```bash
npm install -D msw
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Playwright and MSW for E2E testing"
```

---

### Task 4: Configure Playwright

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Create playwright.config.ts**

Create `playwright.config.ts` at project root:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: Add npm script**

In `package.json` scripts, add:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Update Makefile**

The `test-e2e` target already exists in the Makefile (`npx playwright test`). No change needed.

- [ ] **Step 4: Add playwright artifacts to .gitignore**

Add to `.gitignore` if not already present:

```
test-results/
playwright-report/
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts package.json .gitignore
git commit -m "feat: configure Playwright for E2E testing"
```

---

### Task 5: Create MSW Handlers for E2E Tests

**Files:**
- Create: `tests/e2e/mocks/handlers.ts`

- [ ] **Step 1: Create MSW handlers**

Create `tests/e2e/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';

// Mock session for authenticated user
const mockSession = {
  user: {
    agentUserId: 'test-user-id',
    orgId: 'test-org-id',
    role: 'admin',
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

// Mock settings (API key configured)
const mockSettings = {
  apiProvider: 'anthropic',
  preferredModel: null,
  hasApiKey: true,
};

// Mock rules
const mockRules = {
  rules: [
    { id: 'sys-1', content: 'Be helpful and friendly', ruleType: 'system', category: 'general', visibility: 'org', createdById: null },
    { id: 'org-1', content: 'Always check blockout dates', ruleType: 'org', category: 'scheduling', visibility: 'org', createdById: 'admin-1' },
  ],
  settings: {},
};

// Mock memories
const mockMemories = {
  orgMemories: [
    { id: 'mem-1', key: 'pastor_name', value: 'John Smith', source: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ],
  userMemories: [],
};

export const handlers = [
  // Auth session
  http.get('/api/auth/session', () => {
    return HttpResponse.json(mockSession);
  }),

  // Settings
  http.get('/api/settings', () => {
    return HttpResponse.json(mockSettings);
  }),

  http.post('/api/settings', () => {
    return HttpResponse.json({ success: true });
  }),

  // Rules
  http.get('/api/rules', () => {
    return HttpResponse.json(mockRules);
  }),

  http.post('/api/rules', async ({ request }) => {
    const body = await request.json() as Record<string, string>;
    return HttpResponse.json(
      { id: 'new-rule', content: body.content, ruleType: body.ruleType, category: null, visibility: 'org', createdById: 'test-user-id' },
      { status: 201 },
    );
  }),

  http.post('/api/rules/toggle', () => {
    return HttpResponse.json({ id: 'setting-1', enabled: true });
  }),

  // Memory
  http.get('/api/memory', () => {
    return HttpResponse.json(mockMemories);
  }),

  // Chat — simple non-streaming response for now
  http.post('/api/chat', () => {
    return new HttpResponse(
      'Hello! I can help you with your Planning Center data.',
      { headers: { 'x-conversation-id': 'test-conv-1', 'Content-Type': 'text/plain' } },
    );
  }),

  // Health
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }),
];
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/mocks/handlers.ts
git commit -m "feat: create MSW handlers for E2E test mocking"
```

---

### Task 6: Write Foundational E2E Tests

**Files:**
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/rules.spec.ts`

- [ ] **Step 1: Create auth redirect test**

Create `tests/e2e/auth.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/chat');
    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page has Planning Center sign-in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in with planning center/i })).toBeVisible();
  });

  test('login page shows error when auth fails', async ({ page }) => {
    await page.goto('/login?error=OAuthCallback');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
```

- [ ] **Step 2: Create rules page test**

Create `tests/e2e/rules.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Rules Page', () => {
  // Note: These tests require auth mocking to be set up.
  // For now, these test the unauthenticated behavior.

  test('rules page redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/rules');
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
npx playwright test --reporter=list
```

Expected: Tests run. Auth redirect tests should pass (they test unauthenticated behavior which doesn't need mocking).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/auth.spec.ts tests/e2e/rules.spec.ts
git commit -m "feat: add foundational Playwright E2E tests"
```
