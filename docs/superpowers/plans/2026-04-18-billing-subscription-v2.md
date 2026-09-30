# Billing & Subscription V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add credit-based tiered subscription billing with app-provided AI keys, daily usage caps, Stripe integration, and a super-admin backend.

**Architecture:** Stripe-heavy — Stripe owns pricing/plans/coupons/dunning. App stores synced status + enforces access via 3-layer paywall (proxy → API route → client). Credit-based daily budgets with per-model multipliers bound worst-case cost per customer. Master API keys for Anthropic/OpenAI/Google, BYOK retained as escape hatch.

**Tech Stack:** Next.js 16, Stripe Billing (`stripe` + `@stripe/stripe-js` + `@stripe/react-stripe-js`), Prisma, Vitest, shadcn/ui

**Supersedes:** `docs/superpowers/plans/2026-04-13-billing-subscription.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/billing/tiers.ts` | MODEL_CREDIT_RATES, TIER_CONFIGS, MODEL_PRICING, computeCredits, estimateCostCents, effectiveTier |
| `src/lib/billing/constants.ts` | ACTIVE_STATUSES, isActiveSubscription, BILLING_EXEMPT_ROUTES, TRIAL_DAYS |
| `src/lib/billing/stripe.ts` | Stripe client singleton |
| `src/lib/billing/queries.ts` | getOrgBilling, updateSubscriptionStatus, linkStripeCustomer, updateTier |
| `src/lib/billing/usage.ts` | recordOrgUsage, getTodayCredits, getTodayUsage |
| `src/lib/billing/caps.ts` | checkBudget, resolveModelForTier, PER_REQUEST_CREDIT_CEILING |
| `src/lib/billing/webhook-handlers.ts` | One function per Stripe event type |
| `src/lib/admin/audit.ts` | logAdminAction helper |
| `src/lib/admin/queries.ts` | Fleet queries for admin dashboards |
| `src/app/api/billing/checkout/route.ts` | Create Stripe Checkout Session |
| `src/app/api/billing/portal/route.ts` | Create Stripe Customer Portal session |
| `src/app/api/billing/usage/route.ts` | Today's credit usage for caller's org |
| `src/app/api/billing/webhook/route.ts` | Stripe webhook receiver |
| `src/app/api/billing/reconcile/route.ts` | Daily reconciliation endpoint |
| `src/app/api/admin/orgs/[id]/exempt/route.ts` | Toggle billingExempt |
| `src/app/api/admin/orgs/[id]/test-tier/route.ts` | Set/clear testTier |
| `src/app/api/admin/orgs/[id]/usage/route.ts` | Fetch org usage history |
| `src/app/(app)/billing/page.tsx` | Billing page |
| `src/app/(app)/admin/layout.tsx` | Super-admin gate layout |
| `src/app/(app)/admin/page.tsx` | Admin landing dashboard |
| `src/app/(app)/admin/orgs/page.tsx` | Org list |
| `src/app/(app)/admin/orgs/[id]/page.tsx` | Org detail |
| `src/app/(app)/admin/usage/page.tsx` | Fleet usage dashboard |
| `src/components/billing/billing-status.tsx` | Current plan, tier, budget display |
| `src/components/billing/checkout-form.tsx` | Stripe Embedded Checkout wrapper |
| `src/components/billing/subscription-banner.tsx` | Warning banners (past_due, canceled, cap-hit) |
| `src/components/billing/tier-comparison.tsx` | Upgrade modal for tier-gated models |
| `src/components/billing/daily-budget-bar.tsx` | Credit budget progress bar |
| `src/components/admin/org-table.tsx` | Admin org list table |
| `src/components/admin/org-controls.tsx` | Exempt toggle + test-tier dropdown |
| `src/components/admin/usage-chart.tsx` | Daily usage chart |
| `tests/lib/billing/tiers.test.ts` | Tests for tier config and credit computation |
| `tests/lib/billing/constants.test.ts` | Tests for billing constants and helpers |
| `tests/lib/billing/stripe.test.ts` | Tests for Stripe client singleton |
| `tests/lib/billing/queries.test.ts` | Tests for billing DB queries |
| `tests/lib/billing/usage.test.ts` | Tests for usage tracking |
| `tests/lib/billing/caps.test.ts` | Tests for cap enforcement |
| `tests/lib/billing/webhook-handlers.test.ts` | Tests for webhook event processing |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add SubscriptionStatus + Tier enums, Organization billing fields, OrgUsage, StripeEvent, AdminAuditLog models |
| `src/lib/auth.ts` | Add subscriptionStatus + billingExempt + tier to JWT/session, add isSuperAdmin(), sync on 15-min cadence |
| `src/lib/env.ts` | Add Stripe + master API key env var helpers |
| `src/lib/ai/providers.ts` | Add getMasterKey() for provider, update createModel to accept optional key |
| `src/proxy.ts` | Add paywall enforcement after auth, add billing/admin routes to exempt lists |
| `src/app/api/chat/route.ts` | Add subscription hard check, budget check, model gating, master key fallback, usage recording in onFinish |
| `src/components/chat/chat-interface.tsx` | Add daily-budget-bar, read-only degradation, model picker credit rates |
| `src/components/sidebar.tsx` | Add Billing nav item, admin nav item (super-admin only) |

---

## Task 1: Prisma Schema — Billing Models & Enums

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SubscriptionStatus enum**

In `prisma/schema.prisma`, after the existing `MemorySource` enum (line 39), add:

```prisma
enum SubscriptionStatus {
  none
  trialing
  active
  past_due
  unpaid
  canceled
  incomplete
  paused

  @@schema("agent")
}
```

- [ ] **Step 2: Add Tier enum**

Immediately after the `SubscriptionStatus` enum, add:

```prisma
enum Tier {
  starter
  standard
  pro

  @@schema("agent")
}
```

- [ ] **Step 3: Add billing fields to Organization model**

In the `Organization` model (currently at line 50), add these fields after `createdAt` and before `users`:

```prisma
model Organization {
  id        String   @id @default(uuid())
  pcoOrgId  String   @unique @map("pco_org_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  // Billing fields
  stripeCustomerId    String?            @unique @map("stripe_customer_id")
  subscriptionId      String?            @unique @map("subscription_id")
  subscriptionStatus  SubscriptionStatus @default(none) @map("subscription_status")
  seatCount           Int                @default(0) @map("seat_count")
  billingExempt       Boolean            @default(false) @map("billing_exempt")
  trialEndsAt         DateTime?          @map("trial_ends_at")
  tier                Tier               @default(starter) @map("tier")
  testTier            Tier?              @map("test_tier")
  trialCreditsUsed    Int                @default(0) @map("trial_credits_used")

  users   User[]
  rules   Rule[]
  memory  Memory[]
  files   File[]
  usage   OrgUsage[]

  @@map("organizations")
  @@schema("agent")
}
```

- [ ] **Step 4: Add OrgUsage model**

After the `Memory` model (currently the last model), add:

```prisma
model OrgUsage {
  id                 String   @id @default(cuid())
  orgId              String   @map("org_id")
  date               DateTime @db.Date @map("date")
  creditsUsed        Int      @default(0) @map("credits_used")
  totalTokens        Int      @default(0) @map("total_tokens")
  inputTokens        Int      @default(0) @map("input_tokens")
  outputTokens       Int      @default(0) @map("output_tokens")
  cachedTokens       Int      @default(0) @map("cached_tokens")
  requestCount       Int      @default(0) @map("request_count")
  estimatedCostCents Int      @default(0) @map("estimated_cost_cents")
  updatedAt          DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, date])
  @@index([date])
  @@map("org_usage")
  @@schema("agent")
}
```

- [ ] **Step 5: Add StripeEvent model**

After the `OrgUsage` model, add:

```prisma
model StripeEvent {
  id          String   @id
  type        String
  processedAt DateTime @default(now()) @map("processed_at")

  @@map("stripe_events")
  @@schema("agent")
}
```

- [ ] **Step 6: Add AdminAuditLog model**

After the `StripeEvent` model, add:

```prisma
model AdminAuditLog {
  id          String   @id @default(cuid())
  adminPcoId  String   @map("admin_pco_id")
  targetOrgId String?  @map("target_org_id")
  action      String
  before      Json?
  after       Json?
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([adminPcoId])
  @@index([targetOrgId])
  @@index([createdAt])
  @@map("admin_audit_log")
  @@schema("agent")
}
```

- [ ] **Step 7: Generate and apply migration**

```bash
cd /home/christian/apps/pco-agent
npx prisma migrate dev --name add-billing-models
```

Expected: Migration creates successfully, Prisma Client regenerates.

Verify:

```bash
npx prisma validate
```

Expected output: `Prisma schema is valid.`

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(billing): add billing schema — SubscriptionStatus, Tier, OrgUsage, StripeEvent, AdminAuditLog

Add enums for SubscriptionStatus (none/trialing/active/past_due/unpaid/canceled/incomplete/paused)
and Tier (starter/standard/pro). Extend Organization with billing fields (stripeCustomerId,
subscriptionId, subscriptionStatus, tier, testTier, billingExempt, trialEndsAt, trialCreditsUsed).
Add OrgUsage for daily credit tracking, StripeEvent for webhook idempotency, and AdminAuditLog
for super-admin audit trail."
```

---

## Task 2: Billing Tier Config

**Files:**
- Create: `src/lib/billing/tiers.ts`
- Create: `tests/lib/billing/tiers.test.ts`

- [ ] **Step 1: Create `src/lib/billing/tiers.ts`**

```typescript
// src/lib/billing/tiers.ts
import type { Tier } from '@prisma/client';

/**
 * Credit consumption rates per 1K tokens (input+output blended).
 * Multiplier reflects real cost relative to the cheapest model (Flash = 1x baseline).
 */
export const MODEL_CREDIT_RATES: Record<string, number> = {
  'gemini-2.5-flash':          1,   // baseline — ~$0.003/turn cached
  'gpt-4.1-mini':              1,   // ~$0.003/turn cached
  'gpt-4.1-nano':              1,   // cheapest OpenAI
  'claude-haiku-4-5-20251001': 3,   // ~$0.008/turn cached
  'gpt-4.1':                   4,   // ~$0.012/turn cached
  'claude-sonnet-4-6':         6,   // ~$0.020/turn cached
  'gemini-2.5-pro':            6,   // ~$0.020/turn cached
  'claude-opus-4-6':          10,   // ~$0.030/turn cached — premium only
};

/** Default credit rate for unknown models. */
export const DEFAULT_CREDIT_RATE = 1;

/**
 * Tier configuration: daily credit budget and allowed model IDs.
 */
export interface TierConfig {
  readonly dailyBudget: number;
  readonly allowedModels: readonly string[];
  readonly label: string;
  readonly priceMonthly: number;
}

const STARTER_MODELS = [
  'gemini-2.5-flash',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'claude-haiku-4-5-20251001',
] as const;

const STANDARD_MODELS = [
  ...STARTER_MODELS,
  'claude-sonnet-4-6',
  'gpt-4.1',
  'gemini-2.5-pro',
] as const;

const PRO_MODELS = [
  ...STANDARD_MODELS,
  'claude-opus-4-6',
] as const;

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  starter: {
    dailyBudget: 500,
    allowedModels: STARTER_MODELS,
    label: 'Starter',
    priceMonthly: 9,
  },
  standard: {
    dailyBudget: 1_500,
    allowedModels: STANDARD_MODELS,
    label: 'Standard',
    priceMonthly: 19,
  },
  pro: {
    dailyBudget: 5_000,
    allowedModels: PRO_MODELS,
    label: 'Pro',
    priceMonthly: 49,
  },
};

/** Lifetime credit budget for trial orgs (no daily reset). */
export const TRIAL_LIFETIME_BUDGET = 21_000;

/**
 * Model pricing in cents per 1M tokens — informational only for admin cost visibility.
 * Cap enforcement uses credits, not dollars.
 */
export const MODEL_PRICING_CENTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':          { input:   30, output:  250 },
  'gpt-4.1-nano':              { input:    5, output:   20 },
  'gpt-4.1-mini':              { input:   40, output:  160 },
  'claude-haiku-4-5-20251001': { input:  100, output:  500 },
  'gpt-4.1':                   { input:  200, output:  800 },
  'gemini-2.5-pro':            { input:  125, output: 1000 },
  'claude-sonnet-4-6':         { input:  300, output: 1500 },
  'claude-opus-4-6':           { input:  500, output: 2500 },
};

/**
 * Compute credits consumed by a request from raw token count and model multiplier.
 * Credits = ceil((totalTokens / 1000) * rate)
 */
export function computeCredits(modelId: string, totalTokens: number): number {
  const rate = MODEL_CREDIT_RATES[modelId] ?? DEFAULT_CREDIT_RATE;
  return Math.ceil((totalTokens / 1000) * rate);
}

/**
 * Estimate cost in cents for admin visibility. Informational only — not used for cap enforcement.
 */
export function estimateCostCents(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const pricing = MODEL_PRICING_CENTS_PER_MTOK[modelId];
  if (!pricing) return 0;
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return Math.round(inputCost + outputCost);
}

/**
 * Resolve the effective tier for an org. testTier is only honored when billingExempt is true.
 */
export function effectiveTier(org: { tier: Tier; testTier?: Tier | null; billingExempt: boolean }): Tier {
  if (org.billingExempt && org.testTier) return org.testTier;
  return org.tier;
}

/**
 * Find the minimum tier required to use a given model.
 */
export function requiredTierFor(modelId: string): Tier {
  if (TIER_CONFIGS.starter.allowedModels.includes(modelId)) return 'starter';
  if (TIER_CONFIGS.standard.allowedModels.includes(modelId)) return 'standard';
  return 'pro';
}
```

- [ ] **Step 2: Create `tests/lib/billing/tiers.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  MODEL_CREDIT_RATES,
  DEFAULT_CREDIT_RATE,
  TIER_CONFIGS,
  TRIAL_LIFETIME_BUDGET,
  MODEL_PRICING_CENTS_PER_MTOK,
  computeCredits,
  estimateCostCents,
  effectiveTier,
  requiredTierFor,
} from '@/lib/billing/tiers';

describe('MODEL_CREDIT_RATES', () => {
  it('has an entry for every model in every tier', () => {
    for (const tier of Object.values(TIER_CONFIGS)) {
      for (const modelId of tier.allowedModels) {
        expect(MODEL_CREDIT_RATES[modelId]).toBeDefined();
        expect(MODEL_CREDIT_RATES[modelId]).toBeGreaterThan(0);
      }
    }
  });

  it('Flash is the cheapest at 1x', () => {
    expect(MODEL_CREDIT_RATES['gemini-2.5-flash']).toBe(1);
  });

  it('Opus is the most expensive at 10x', () => {
    expect(MODEL_CREDIT_RATES['claude-opus-4-6']).toBe(10);
  });
});

describe('TIER_CONFIGS', () => {
  it('has three tiers', () => {
    expect(Object.keys(TIER_CONFIGS)).toEqual(['starter', 'standard', 'pro']);
  });

  it('each tier has increasing daily budgets', () => {
    expect(TIER_CONFIGS.starter.dailyBudget).toBeLessThan(TIER_CONFIGS.standard.dailyBudget);
    expect(TIER_CONFIGS.standard.dailyBudget).toBeLessThan(TIER_CONFIGS.pro.dailyBudget);
  });

  it('higher tiers include all lower-tier models', () => {
    for (const model of TIER_CONFIGS.starter.allowedModels) {
      expect(TIER_CONFIGS.standard.allowedModels).toContain(model);
      expect(TIER_CONFIGS.pro.allowedModels).toContain(model);
    }
    for (const model of TIER_CONFIGS.standard.allowedModels) {
      expect(TIER_CONFIGS.pro.allowedModels).toContain(model);
    }
  });

  it('Opus is only in Pro tier', () => {
    expect(TIER_CONFIGS.starter.allowedModels).not.toContain('claude-opus-4-6');
    expect(TIER_CONFIGS.standard.allowedModels).not.toContain('claude-opus-4-6');
    expect(TIER_CONFIGS.pro.allowedModels).toContain('claude-opus-4-6');
  });

  it('Sonnet is in Standard and Pro but not Starter', () => {
    expect(TIER_CONFIGS.starter.allowedModels).not.toContain('claude-sonnet-4-6');
    expect(TIER_CONFIGS.standard.allowedModels).toContain('claude-sonnet-4-6');
    expect(TIER_CONFIGS.pro.allowedModels).toContain('claude-sonnet-4-6');
  });
});

describe('TRIAL_LIFETIME_BUDGET', () => {
  it('is 21,000 credits', () => {
    expect(TRIAL_LIFETIME_BUDGET).toBe(21_000);
  });
});

describe('computeCredits', () => {
  it('computes credits for a known model', () => {
    // 10,000 tokens on Sonnet (6x) = ceil(10 * 6) = 60
    expect(computeCredits('claude-sonnet-4-6', 10_000)).toBe(60);
  });

  it('computes credits for Flash (1x baseline)', () => {
    // 5,000 tokens on Flash (1x) = ceil(5 * 1) = 5
    expect(computeCredits('gemini-2.5-flash', 5_000)).toBe(5);
  });

  it('computes credits for Opus (10x)', () => {
    // 3,000 tokens on Opus (10x) = ceil(3 * 10) = 30
    expect(computeCredits('claude-opus-4-6', 3_000)).toBe(30);
  });

  it('rounds up partial credits', () => {
    // 500 tokens on Haiku (3x) = ceil(0.5 * 3) = ceil(1.5) = 2
    expect(computeCredits('claude-haiku-4-5-20251001', 500)).toBe(2);
  });

  it('uses default rate for unknown models', () => {
    // 10,000 tokens on unknown model = ceil(10 * 1) = 10
    expect(computeCredits('unknown-model', 10_000)).toBe(10);
  });

  it('returns 0 for 0 tokens', () => {
    expect(computeCredits('claude-sonnet-4-6', 0)).toBe(0);
  });
});

describe('estimateCostCents', () => {
  it('estimates cost for Sonnet', () => {
    // 1M input at 300 cents/MT = 300 cents, 100K output at 1500 cents/MT = 150 cents
    const cost = estimateCostCents('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });
    expect(cost).toBe(450);
  });

  it('returns 0 for unknown models', () => {
    expect(estimateCostCents('unknown-model', { inputTokens: 1000, outputTokens: 500 })).toBe(0);
  });

  it('handles zero tokens', () => {
    expect(estimateCostCents('claude-sonnet-4-6', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe('effectiveTier', () => {
  it('returns org tier when not billing exempt', () => {
    expect(effectiveTier({ tier: 'standard', testTier: 'pro', billingExempt: false })).toBe('standard');
  });

  it('returns testTier when billing exempt and testTier set', () => {
    expect(effectiveTier({ tier: 'starter', testTier: 'pro', billingExempt: true })).toBe('pro');
  });

  it('returns org tier when billing exempt but testTier is null', () => {
    expect(effectiveTier({ tier: 'standard', testTier: null, billingExempt: true })).toBe('standard');
  });

  it('returns org tier when billing exempt but testTier is undefined', () => {
    expect(effectiveTier({ tier: 'starter', billingExempt: true })).toBe('starter');
  });
});

describe('requiredTierFor', () => {
  it('returns starter for Flash', () => {
    expect(requiredTierFor('gemini-2.5-flash')).toBe('starter');
  });

  it('returns standard for Sonnet', () => {
    expect(requiredTierFor('claude-sonnet-4-6')).toBe('standard');
  });

  it('returns pro for Opus', () => {
    expect(requiredTierFor('claude-opus-4-6')).toBe('pro');
  });

  it('returns pro for unknown models (most restrictive)', () => {
    expect(requiredTierFor('unknown-model')).toBe('pro');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/lib/billing/tiers.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/tiers.ts tests/lib/billing/tiers.test.ts
git commit -m "feat(billing): add tier config with credit rates, budget computation, and model gating

MODEL_CREDIT_RATES maps each model to a cost multiplier (Flash=1x to Opus=10x).
TIER_CONFIGS defines daily budgets and allowed models per tier.
computeCredits(), estimateCostCents(), effectiveTier(), requiredTierFor() provide
the core billing logic. 100% test coverage."
```

---

## Task 3: Billing Constants

**Files:**
- Create: `src/lib/billing/constants.ts`
- Create: `tests/lib/billing/constants.test.ts`

- [ ] **Step 1: Create `src/lib/billing/constants.ts`**

```typescript
// src/lib/billing/constants.ts
import type { SubscriptionStatus } from '@prisma/client';

/** Subscription statuses that grant access to the app. */
export const ACTIVE_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
] as const;

/**
 * Returns true if the given status should have app access.
 * active, trialing, and past_due all grant access.
 */
export function isActiveSubscription(status?: SubscriptionStatus | string | null): boolean {
  if (!status) return false;
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Number of days for a free trial. */
export const TRIAL_DAYS = 14;

/** Soft margin threshold — reject new requests at 95% of daily budget. */
export const SOFT_MARGIN_PERCENT = 0.95;

/**
 * Routes that are accessible regardless of subscription status.
 * Users must be able to reach billing pages to subscribe and settings to configure keys.
 */
export const BILLING_EXEMPT_ROUTES = [
  '/billing',
  '/api/billing',
  '/settings',
  '/api/settings',
  '/api/auth',
  '/api/health',
  '/login',
] as const;

/**
 * Check if a route should bypass paywall enforcement.
 */
export function isBillingExemptRoute(pathname: string): boolean {
  return BILLING_EXEMPT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );
}
```

- [ ] **Step 2: Create `tests/lib/billing/constants.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  ACTIVE_STATUSES,
  isActiveSubscription,
  TRIAL_DAYS,
  SOFT_MARGIN_PERCENT,
  isBillingExemptRoute,
} from '@/lib/billing/constants';

describe('ACTIVE_STATUSES', () => {
  it('includes active, trialing, and past_due', () => {
    expect(ACTIVE_STATUSES).toContain('active');
    expect(ACTIVE_STATUSES).toContain('trialing');
    expect(ACTIVE_STATUSES).toContain('past_due');
  });

  it('does not include canceled, unpaid, or none', () => {
    expect(ACTIVE_STATUSES).not.toContain('canceled');
    expect(ACTIVE_STATUSES).not.toContain('unpaid');
    expect(ACTIVE_STATUSES).not.toContain('none');
    expect(ACTIVE_STATUSES).not.toContain('incomplete');
    expect(ACTIVE_STATUSES).not.toContain('paused');
  });
});

describe('isActiveSubscription', () => {
  it('returns true for active', () => {
    expect(isActiveSubscription('active')).toBe(true);
  });

  it('returns true for trialing', () => {
    expect(isActiveSubscription('trialing')).toBe(true);
  });

  it('returns true for past_due', () => {
    expect(isActiveSubscription('past_due')).toBe(true);
  });

  it('returns false for canceled', () => {
    expect(isActiveSubscription('canceled')).toBe(false);
  });

  it('returns false for none', () => {
    expect(isActiveSubscription('none')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isActiveSubscription(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isActiveSubscription(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isActiveSubscription('')).toBe(false);
  });

  it('returns false for unpaid', () => {
    expect(isActiveSubscription('unpaid')).toBe(false);
  });

  it('returns false for paused', () => {
    expect(isActiveSubscription('paused')).toBe(false);
  });
});

describe('TRIAL_DAYS', () => {
  it('is 14', () => {
    expect(TRIAL_DAYS).toBe(14);
  });
});

describe('SOFT_MARGIN_PERCENT', () => {
  it('is 0.95', () => {
    expect(SOFT_MARGIN_PERCENT).toBe(0.95);
  });
});

describe('isBillingExemptRoute', () => {
  it('returns true for /billing', () => {
    expect(isBillingExemptRoute('/billing')).toBe(true);
  });

  it('returns true for /api/billing/checkout', () => {
    expect(isBillingExemptRoute('/api/billing/checkout')).toBe(true);
  });

  it('returns true for /settings', () => {
    expect(isBillingExemptRoute('/settings')).toBe(true);
  });

  it('returns true for /api/auth/callback', () => {
    expect(isBillingExemptRoute('/api/auth/callback')).toBe(true);
  });

  it('returns true for /api/health', () => {
    expect(isBillingExemptRoute('/api/health')).toBe(true);
  });

  it('returns true for /login', () => {
    expect(isBillingExemptRoute('/login')).toBe(true);
  });

  it('returns false for /chat', () => {
    expect(isBillingExemptRoute('/chat')).toBe(false);
  });

  it('returns false for /api/chat', () => {
    expect(isBillingExemptRoute('/api/chat')).toBe(false);
  });

  it('returns false for /api/rules', () => {
    expect(isBillingExemptRoute('/api/rules')).toBe(false);
  });

  it('returns false for /admin', () => {
    expect(isBillingExemptRoute('/admin')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/lib/billing/constants.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/constants.ts tests/lib/billing/constants.test.ts
git commit -m "feat(billing): add billing constants — active statuses, exempt routes, trial days

isActiveSubscription() returns true for active/trialing/past_due.
isBillingExemptRoute() identifies routes that bypass paywall.
SOFT_MARGIN_PERCENT (0.95) and TRIAL_DAYS (14) are the key policy values."
```

---

## Task 4: Stripe Client Singleton

**Files:**
- Create: `src/lib/billing/stripe.ts`
- Modify: `src/lib/env.ts`
- Create: `tests/lib/billing/stripe.test.ts`

- [ ] **Step 1: Add Stripe + master key env var helpers to `src/lib/env.ts`**

Add the following functions after the existing `getLogLevel()` function:

```typescript
export function getStripeSecretKey(): string {
  return getRequired('STRIPE_SECRET_KEY');
}

export function getStripePublishableKey(): string {
  return getRequired('STRIPE_PUBLISHABLE_KEY');
}

export function getStripeWebhookSecret(): string {
  return getRequired('STRIPE_WEBHOOK_SECRET');
}

export function getStripeCronSecret(): string {
  return getRequired('STRIPE_CRON_SECRET');
}

export function getMasterApiKey(provider: string): string | undefined {
  const envMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_MASTER_API_KEY',
    openai: 'OPENAI_MASTER_API_KEY',
    google: 'GOOGLE_MASTER_API_KEY',
  };
  const envName = envMap[provider];
  return envName ? process.env[envName] ?? undefined : undefined;
}

export function getSuperAdminPcoIds(): string[] {
  return (process.env.SUPER_ADMIN_PCO_IDS ?? '').split(',').filter(Boolean);
}
```

Also update `validateEnv()` — add the Stripe variables to a separate optional billing group that logs a warning rather than failing, since billing may not be enabled in all environments:

```typescript
export function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'PCO_CLIENT_ID',
    'PCO_CLIENT_SECRET',
    'ENCRYPTION_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  // Billing env vars — warn if missing but don't fail startup
  const billingVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];
  const missingBilling = billingVars.filter((name) => !process.env[name]);
  if (missingBilling.length > 0 && missingBilling.length < billingVars.length) {
    console.warn(
      `Partial billing config — missing: ${missingBilling.join(', ')}. Billing features will be disabled.`
    );
  }
}
```

- [ ] **Step 2: Install Stripe packages**

```bash
cd /home/christian/apps/pco-agent
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

- [ ] **Step 3: Create `src/lib/billing/stripe.ts`**

```typescript
// src/lib/billing/stripe.ts
import Stripe from 'stripe';
import { getStripeSecretKey } from '@/lib/env';

let stripeInstance: Stripe | null = null;

/**
 * Returns a singleton Stripe client.
 * Lazy-initialized to avoid failing at import time when STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecretKey(), {
      apiVersion: '2025-03-31.basil',
      typescript: true,
    });
  }
  return stripeInstance;
}

/**
 * Reset the singleton — only for tests.
 * @internal
 */
export function _resetStripe(): void {
  stripeInstance = null;
}
```

- [ ] **Step 4: Create `tests/lib/billing/stripe.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStripe, _resetStripe } from '@/lib/billing/stripe';

vi.mock('stripe', () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    customers: {},
    subscriptions: {},
  }));
  return { default: MockStripe };
});

describe('getStripe', () => {
  beforeEach(() => {
    _resetStripe();
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  });

  it('returns a Stripe instance', () => {
    const stripe = getStripe();
    expect(stripe).toBeDefined();
    expect(stripe).toHaveProperty('customers');
  });

  it('returns the same instance on subsequent calls (singleton)', () => {
    const first = getStripe();
    const second = getStripe();
    expect(first).toBe(second);
  });

  it('creates a new instance after reset', () => {
    const first = getStripe();
    _resetStripe();
    const second = getStripe();
    expect(first).not.toBe(second);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/lib/billing/stripe.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/stripe.ts src/lib/env.ts tests/lib/billing/stripe.test.ts package.json package-lock.json
git commit -m "feat(billing): add Stripe client singleton and env var helpers

Lazy-initialized Stripe singleton in src/lib/billing/stripe.ts.
Added env helpers for Stripe keys, master API keys, and super-admin IDs.
Billing env vars warn on partial config rather than failing startup."
```

---

## Task 5: Billing DB Queries

**Files:**
- Create: `src/lib/billing/queries.ts`
- Create: `tests/lib/billing/queries.test.ts`

- [ ] **Step 1: Create `src/lib/billing/queries.ts`**

```typescript
// src/lib/billing/queries.ts
import { prisma } from '@/lib/db';
import type { SubscriptionStatus, Tier, Organization } from '@prisma/client';

export interface OrgBilling {
  id: string;
  pcoOrgId: string;
  name: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  tier: Tier;
  testTier: Tier | null;
  billingExempt: boolean;
  trialEndsAt: Date | null;
  trialCreditsUsed: number;
  seatCount: number;
}

/**
 * Fetch billing-relevant fields for an organization.
 */
export async function getOrgBilling(orgId: string): Promise<OrgBilling | null> {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      pcoOrgId: true,
      name: true,
      stripeCustomerId: true,
      subscriptionId: true,
      subscriptionStatus: true,
      tier: true,
      testTier: true,
      billingExempt: true,
      trialEndsAt: true,
      trialCreditsUsed: true,
      seatCount: true,
    },
  });
}

/**
 * Update an organization's subscription status.
 */
export async function updateSubscriptionStatus(
  orgId: string,
  status: SubscriptionStatus,
): Promise<Organization> {
  return prisma.organization.update({
    where: { id: orgId },
    data: { subscriptionStatus: status },
  });
}

/**
 * Link a Stripe customer ID and subscription ID to an organization.
 * Called during checkout.session.completed.
 */
export async function linkStripeCustomer(
  orgId: string,
  data: {
    stripeCustomerId: string;
    subscriptionId: string;
    subscriptionStatus: SubscriptionStatus;
    tier: Tier;
    trialEndsAt?: Date | null;
  },
): Promise<Organization> {
  return prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeCustomerId: data.stripeCustomerId,
      subscriptionId: data.subscriptionId,
      subscriptionStatus: data.subscriptionStatus,
      tier: data.tier,
      trialEndsAt: data.trialEndsAt ?? null,
    },
  });
}

/**
 * Update an organization's tier (when plan changes).
 */
export async function updateTier(orgId: string, tier: Tier): Promise<Organization> {
  return prisma.organization.update({
    where: { id: orgId },
    data: { tier },
  });
}

/**
 * Find an organization by its Stripe customer ID.
 */
export async function findOrgByStripeCustomerId(
  stripeCustomerId: string,
): Promise<Organization | null> {
  return prisma.organization.findUnique({
    where: { stripeCustomerId },
  });
}

/**
 * Find an organization by its subscription ID.
 */
export async function findOrgBySubscriptionId(
  subscriptionId: string,
): Promise<Organization | null> {
  return prisma.organization.findUnique({
    where: { subscriptionId },
  });
}

/**
 * Check if a Stripe event has already been processed (idempotency).
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const event = await prisma.stripeEvent.findUnique({ where: { id: eventId } });
  return event !== null;
}

/**
 * Mark a Stripe event as processed.
 */
export async function markEventProcessed(eventId: string, type: string): Promise<void> {
  await prisma.stripeEvent.create({
    data: { id: eventId, type },
  });
}

/**
 * Increment an org's trial credits used counter.
 */
export async function incrementTrialCredits(orgId: string, credits: number): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data: { trialCreditsUsed: { increment: credits } },
  });
}
```

- [ ] **Step 2: Create `tests/lib/billing/queries.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrgBilling,
  updateSubscriptionStatus,
  linkStripeCustomer,
  updateTier,
  findOrgByStripeCustomerId,
  findOrgBySubscriptionId,
  isEventProcessed,
  markEventProcessed,
  incrementTrialCredits,
} from '@/lib/billing/queries';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    stripeEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockOrg = {
  id: 'org-1',
  pcoOrgId: 'pco-123',
  name: 'Test Church',
  stripeCustomerId: 'cus_test',
  subscriptionId: 'sub_test',
  subscriptionStatus: 'active' as const,
  tier: 'standard' as const,
  testTier: null,
  billingExempt: false,
  trialEndsAt: null,
  trialCreditsUsed: 0,
  seatCount: 0,
  createdAt: new Date(),
};

describe('getOrgBilling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns billing fields for an org', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg);
    const result = await getOrgBilling('org-1');
    expect(result).toBeDefined();
    expect(result!.id).toBe('org-1');
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: expect.objectContaining({ subscriptionStatus: true, tier: true }),
    });
  });

  it('returns null for unknown org', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
    const result = await getOrgBilling('nonexistent');
    expect(result).toBeNull();
  });
});

describe('updateSubscriptionStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates status on the org', async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue({ ...mockOrg, subscriptionStatus: 'canceled' });
    await updateSubscriptionStatus('org-1', 'canceled');
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { subscriptionStatus: 'canceled' },
    });
  });
});

describe('linkStripeCustomer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets stripeCustomerId, subscriptionId, status, and tier', async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue(mockOrg);
    await linkStripeCustomer('org-1', {
      stripeCustomerId: 'cus_new',
      subscriptionId: 'sub_new',
      subscriptionStatus: 'trialing',
      tier: 'standard',
      trialEndsAt: new Date('2026-05-01'),
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: {
        stripeCustomerId: 'cus_new',
        subscriptionId: 'sub_new',
        subscriptionStatus: 'trialing',
        tier: 'standard',
        trialEndsAt: new Date('2026-05-01'),
      },
    });
  });
});

describe('updateTier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the tier', async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue({ ...mockOrg, tier: 'pro' });
    await updateTier('org-1', 'pro');
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { tier: 'pro' },
    });
  });
});

describe('findOrgByStripeCustomerId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('finds org by Stripe customer ID', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg);
    const result = await findOrgByStripeCustomerId('cus_test');
    expect(result).toBeDefined();
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_test' },
    });
  });
});

describe('findOrgBySubscriptionId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('finds org by subscription ID', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg);
    const result = await findOrgBySubscriptionId('sub_test');
    expect(result).toBeDefined();
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { subscriptionId: 'sub_test' },
    });
  });
});

describe('isEventProcessed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when event exists', async () => {
    vi.mocked(prisma.stripeEvent.findUnique).mockResolvedValue({
      id: 'evt_test',
      type: 'checkout.session.completed',
      processedAt: new Date(),
    });
    expect(await isEventProcessed('evt_test')).toBe(true);
  });

  it('returns false when event does not exist', async () => {
    vi.mocked(prisma.stripeEvent.findUnique).mockResolvedValue(null);
    expect(await isEventProcessed('evt_new')).toBe(false);
  });
});

describe('markEventProcessed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a StripeEvent record', async () => {
    vi.mocked(prisma.stripeEvent.create).mockResolvedValue({
      id: 'evt_test',
      type: 'invoice.paid',
      processedAt: new Date(),
    });
    await markEventProcessed('evt_test', 'invoice.paid');
    expect(prisma.stripeEvent.create).toHaveBeenCalledWith({
      data: { id: 'evt_test', type: 'invoice.paid' },
    });
  });
});

describe('incrementTrialCredits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments the trial credits counter', async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue(mockOrg);
    await incrementTrialCredits('org-1', 50);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { trialCreditsUsed: { increment: 50 } },
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/lib/billing/queries.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/queries.ts tests/lib/billing/queries.test.ts
git commit -m "feat(billing): add billing DB queries with full test coverage

getOrgBilling, updateSubscriptionStatus, linkStripeCustomer, updateTier,
findOrgByStripeCustomerId, findOrgBySubscriptionId, isEventProcessed,
markEventProcessed, incrementTrialCredits — all with mocked Prisma tests."
```

---

## Task 6: Usage Tracking

**Files:**
- Create: `src/lib/billing/usage.ts`
- Create: `tests/lib/billing/usage.test.ts`

- [ ] **Step 1: Create `src/lib/billing/usage.ts`**

```typescript
// src/lib/billing/usage.ts
import { prisma } from '@/lib/db';
import type { OrgUsage } from '@prisma/client';

/**
 * Get the start of today in UTC (midnight-aligned Date).
 */
export function startOfUtcDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface UsageIncrement {
  orgId: string;
  date: Date;
  creditsUsed: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costCents: number;
}

/**
 * Record usage for an org with atomic upsert (increment if row exists, create if not).
 * Safe for concurrent calls — Prisma's upsert with increment is atomic at the DB level.
 */
export async function recordOrgUsage(data: UsageIncrement): Promise<OrgUsage> {
  return prisma.orgUsage.upsert({
    where: {
      orgId_date: { orgId: data.orgId, date: data.date },
    },
    create: {
      orgId: data.orgId,
      date: data.date,
      creditsUsed: data.creditsUsed,
      totalTokens: data.totalTokens,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cachedTokens: data.cachedTokens,
      requestCount: 1,
      estimatedCostCents: data.costCents,
    },
    update: {
      creditsUsed: { increment: data.creditsUsed },
      totalTokens: { increment: data.totalTokens },
      inputTokens: { increment: data.inputTokens },
      outputTokens: { increment: data.outputTokens },
      cachedTokens: { increment: data.cachedTokens },
      requestCount: { increment: 1 },
      estimatedCostCents: { increment: data.costCents },
    },
  });
}

/**
 * Get today's credit usage for an org. Returns 0 if no usage row exists yet.
 */
export async function getTodayCredits(orgId: string): Promise<number> {
  const today = startOfUtcDay();
  const usage = await prisma.orgUsage.findUnique({
    where: { orgId_date: { orgId, date: today } },
    select: { creditsUsed: true },
  });
  return usage?.creditsUsed ?? 0;
}

/**
 * Get today's full usage record for an org. Returns null if no usage yet.
 */
export async function getTodayUsage(orgId: string): Promise<OrgUsage | null> {
  const today = startOfUtcDay();
  return prisma.orgUsage.findUnique({
    where: { orgId_date: { orgId, date: today } },
  });
}

/**
 * Get usage history for an org over a date range (for admin dashboard).
 */
export async function getUsageHistory(
  orgId: string,
  days: number = 30,
): Promise<OrgUsage[]> {
  const since = startOfUtcDay();
  since.setUTCDate(since.getUTCDate() - days);
  return prisma.orgUsage.findMany({
    where: {
      orgId,
      date: { gte: since },
    },
    orderBy: { date: 'asc' },
  });
}
```

- [ ] **Step 2: Create `tests/lib/billing/usage.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startOfUtcDay,
  recordOrgUsage,
  getTodayCredits,
  getTodayUsage,
  getUsageHistory,
} from '@/lib/billing/usage';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    orgUsage: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('startOfUtcDay', () => {
  it('returns midnight UTC for a given date', () => {
    const date = new Date('2026-04-18T14:30:00Z');
    const result = startOfUtcDay(date);
    expect(result.toISOString()).toBe('2026-04-18T00:00:00.000Z');
  });

  it('handles dates near midnight correctly', () => {
    const date = new Date('2026-04-18T23:59:59.999Z');
    const result = startOfUtcDay(date);
    expect(result.toISOString()).toBe('2026-04-18T00:00:00.000Z');
  });

  it('defaults to today when no argument', () => {
    const result = startOfUtcDay();
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it('does not mutate the input date', () => {
    const date = new Date('2026-04-18T14:30:00Z');
    const original = date.toISOString();
    startOfUtcDay(date);
    expect(date.toISOString()).toBe(original);
  });
});

describe('recordOrgUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts with correct create and increment data', async () => {
    const mockUsage = {
      id: 'usage-1',
      orgId: 'org-1',
      date: new Date('2026-04-18'),
      creditsUsed: 30,
      totalTokens: 5000,
      inputTokens: 4000,
      outputTokens: 1000,
      cachedTokens: 3000,
      requestCount: 1,
      estimatedCostCents: 5,
      updatedAt: new Date(),
    };
    vi.mocked(prisma.orgUsage.upsert).mockResolvedValue(mockUsage);

    const data = {
      orgId: 'org-1',
      date: new Date('2026-04-18'),
      creditsUsed: 30,
      totalTokens: 5000,
      inputTokens: 4000,
      outputTokens: 1000,
      cachedTokens: 3000,
      costCents: 5,
    };

    await recordOrgUsage(data);

    expect(prisma.orgUsage.upsert).toHaveBeenCalledWith({
      where: { orgId_date: { orgId: 'org-1', date: data.date } },
      create: {
        orgId: 'org-1',
        date: data.date,
        creditsUsed: 30,
        totalTokens: 5000,
        inputTokens: 4000,
        outputTokens: 1000,
        cachedTokens: 3000,
        requestCount: 1,
        estimatedCostCents: 5,
      },
      update: {
        creditsUsed: { increment: 30 },
        totalTokens: { increment: 5000 },
        inputTokens: { increment: 4000 },
        outputTokens: { increment: 1000 },
        cachedTokens: { increment: 3000 },
        requestCount: { increment: 1 },
        estimatedCostCents: { increment: 5 },
      },
    });
  });
});

describe('getTodayCredits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns credits used when usage row exists', async () => {
    vi.mocked(prisma.orgUsage.findUnique).mockResolvedValue({
      id: 'usage-1',
      orgId: 'org-1',
      date: new Date(),
      creditsUsed: 250,
      totalTokens: 50000,
      inputTokens: 40000,
      outputTokens: 10000,
      cachedTokens: 30000,
      requestCount: 10,
      estimatedCostCents: 50,
      updatedAt: new Date(),
    });
    const result = await getTodayCredits('org-1');
    expect(result).toBe(250);
  });

  it('returns 0 when no usage row exists', async () => {
    vi.mocked(prisma.orgUsage.findUnique).mockResolvedValue(null);
    const result = await getTodayCredits('org-1');
    expect(result).toBe(0);
  });
});

describe('getTodayUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the full usage record', async () => {
    const mockUsage = {
      id: 'usage-1',
      orgId: 'org-1',
      date: new Date(),
      creditsUsed: 100,
      totalTokens: 20000,
      inputTokens: 15000,
      outputTokens: 5000,
      cachedTokens: 10000,
      requestCount: 5,
      estimatedCostCents: 20,
      updatedAt: new Date(),
    };
    vi.mocked(prisma.orgUsage.findUnique).mockResolvedValue(mockUsage);
    const result = await getTodayUsage('org-1');
    expect(result).toEqual(mockUsage);
  });

  it('returns null when no usage exists', async () => {
    vi.mocked(prisma.orgUsage.findUnique).mockResolvedValue(null);
    const result = await getTodayUsage('org-1');
    expect(result).toBeNull();
  });
});

describe('getUsageHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries for usage in the last N days ordered ascending', async () => {
    vi.mocked(prisma.orgUsage.findMany).mockResolvedValue([]);
    await getUsageHistory('org-1', 7);
    expect(prisma.orgUsage.findMany).toHaveBeenCalledWith({
      where: {
        orgId: 'org-1',
        date: { gte: expect.any(Date) },
      },
      orderBy: { date: 'asc' },
    });
  });

  it('defaults to 30 days', async () => {
    vi.mocked(prisma.orgUsage.findMany).mockResolvedValue([]);
    await getUsageHistory('org-1');
    const call = vi.mocked(prisma.orgUsage.findMany).mock.calls[0][0];
    const sinceDate = (call as { where: { date: { gte: Date } } }).where.date.gte;
    const daysDiff = Math.round((Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBeGreaterThanOrEqual(29);
    expect(daysDiff).toBeLessThanOrEqual(31);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/lib/billing/usage.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/usage.ts tests/lib/billing/usage.test.ts
git commit -m "feat(billing): add usage tracking — recordOrgUsage, getTodayCredits, getUsageHistory

Atomic upsert with increment for concurrent safety. startOfUtcDay() for
date bucketing. Full test coverage with mocked Prisma."
```

---

## Task 7: Cap Enforcement

**Files:**
- Create: `src/lib/billing/caps.ts`
- Create: `tests/lib/billing/caps.test.ts`

- [ ] **Step 1: Create `src/lib/billing/caps.ts`**

```typescript
// src/lib/billing/caps.ts
import type { Tier, SubscriptionStatus } from '@prisma/client';
import {
  TIER_CONFIGS,
  MODEL_CREDIT_RATES,
  DEFAULT_CREDIT_RATE,
  TRIAL_LIFETIME_BUDGET,
  effectiveTier,
  requiredTierFor,
} from '@/lib/billing/tiers';
import { SOFT_MARGIN_PERCENT } from '@/lib/billing/constants';
import { getTodayCredits } from '@/lib/billing/usage';

/** No single request can consume more than 100 credits. */
export const PER_REQUEST_CREDIT_CEILING = 100;

/** Maximum output tokens to cap response length (practical quality limit). */
export const MAX_OUTPUT_TOKENS_HARD_CAP = 4_000;

export interface BudgetCheckResult {
  allowed: boolean;
  creditsUsed: number;
  budget: number;
  tier: Tier;
  /** Present when allowed is false. */
  reason?: 'daily_budget_exhausted' | 'trial_budget_exhausted';
  message?: string;
}

export interface ModelCheckResult {
  allowed: boolean;
  modelId: string;
  /** Present when allowed is false. */
  requiredTier?: Tier;
  message?: string;
}

/**
 * Check whether an org has remaining daily budget.
 * Returns {allowed: true} or {allowed: false} with reason.
 */
export async function checkBudget(
  orgId: string,
  org: {
    tier: Tier;
    testTier?: Tier | null;
    billingExempt: boolean;
    subscriptionStatus: SubscriptionStatus;
    trialCreditsUsed: number;
  },
): Promise<BudgetCheckResult> {
  const tier = effectiveTier(org);
  const config = TIER_CONFIGS[tier];
  const creditsUsed = await getTodayCredits(orgId);

  // Daily budget check at 95% soft margin
  if (creditsUsed >= config.dailyBudget * SOFT_MARGIN_PERCENT) {
    return {
      allowed: false,
      creditsUsed,
      budget: config.dailyBudget,
      tier,
      reason: 'daily_budget_exhausted',
      message: "Your church has used today's chat budget. It resets at midnight.",
    };
  }

  // Trial lifetime budget check
  if (org.subscriptionStatus === 'trialing') {
    if (org.trialCreditsUsed >= TRIAL_LIFETIME_BUDGET * SOFT_MARGIN_PERCENT) {
      return {
        allowed: false,
        creditsUsed,
        budget: config.dailyBudget,
        tier,
        reason: 'trial_budget_exhausted',
        message: 'Your free trial budget has been used up. Subscribe to keep chatting.',
      };
    }
  }

  return {
    allowed: true,
    creditsUsed,
    budget: config.dailyBudget,
    tier,
  };
}

/**
 * Check whether a model is allowed for the org's tier.
 * Returns {allowed: true} or {allowed: false} with the required tier.
 */
export function resolveModelForTier(
  modelId: string,
  org: {
    tier: Tier;
    testTier?: Tier | null;
    billingExempt: boolean;
  },
): ModelCheckResult {
  const tier = effectiveTier(org);
  const config = TIER_CONFIGS[tier];

  if (config.allowedModels.includes(modelId)) {
    return { allowed: true, modelId };
  }

  const required = requiredTierFor(modelId);
  return {
    allowed: false,
    modelId,
    requiredTier: required,
    message: `${modelId} requires the ${TIER_CONFIGS[required].label} plan.`,
  };
}

/**
 * Compute the effective maxOutputTokens for a request based on the per-request credit ceiling.
 * Ensures no single request burns more than PER_REQUEST_CREDIT_CEILING credits.
 */
export function computeMaxOutputTokens(modelId: string): number {
  const rate = MODEL_CREDIT_RATES[modelId] ?? DEFAULT_CREDIT_RATE;
  const maxTokensFromCeiling = Math.floor((PER_REQUEST_CREDIT_CEILING / rate) * 1000);
  return Math.min(MAX_OUTPUT_TOKENS_HARD_CAP, maxTokensFromCeiling);
}
```

- [ ] **Step 2: Create `tests/lib/billing/caps.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PER_REQUEST_CREDIT_CEILING,
  checkBudget,
  resolveModelForTier,
  computeMaxOutputTokens,
} from '@/lib/billing/caps';

// Mock getTodayCredits
vi.mock('@/lib/billing/usage', () => ({
  getTodayCredits: vi.fn(),
}));

import { getTodayCredits } from '@/lib/billing/usage';

const baseOrg = {
  tier: 'standard' as const,
  testTier: null,
  billingExempt: false,
  subscriptionStatus: 'active' as const,
  trialCreditsUsed: 0,
};

describe('PER_REQUEST_CREDIT_CEILING', () => {
  it('is 100', () => {
    expect(PER_REQUEST_CREDIT_CEILING).toBe(100);
  });
});

describe('checkBudget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows when under the soft margin', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(500);
    const result = await checkBudget('org-1', baseOrg);
    expect(result.allowed).toBe(true);
    expect(result.creditsUsed).toBe(500);
    expect(result.budget).toBe(1500); // standard tier
  });

  it('rejects when at 95% of daily budget', async () => {
    // Standard tier: 1500 * 0.95 = 1425
    vi.mocked(getTodayCredits).mockResolvedValue(1425);
    const result = await checkBudget('org-1', baseOrg);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily_budget_exhausted');
  });

  it('rejects when over 95% of daily budget', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(1450);
    const result = await checkBudget('org-1', baseOrg);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily_budget_exhausted');
  });

  it('allows when just under the 95% margin', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(1424);
    const result = await checkBudget('org-1', baseOrg);
    expect(result.allowed).toBe(true);
  });

  it('rejects trialing org when trial lifetime budget exhausted', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(0);
    const trialingOrg = {
      ...baseOrg,
      subscriptionStatus: 'trialing' as const,
      trialCreditsUsed: 20_000, // 95% of 21,000 = 19,950
    };
    const result = await checkBudget('org-1', trialingOrg);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('trial_budget_exhausted');
  });

  it('allows trialing org when trial budget has headroom', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(0);
    const trialingOrg = {
      ...baseOrg,
      subscriptionStatus: 'trialing' as const,
      trialCreditsUsed: 10_000,
    };
    const result = await checkBudget('org-1', trialingOrg);
    expect(result.allowed).toBe(true);
  });

  it('uses testTier when billingExempt', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(400);
    const exemptOrg = {
      ...baseOrg,
      tier: 'starter' as const,
      testTier: 'pro' as const,
      billingExempt: true,
    };
    const result = await checkBudget('org-1', exemptOrg);
    expect(result.allowed).toBe(true);
    expect(result.budget).toBe(5000); // pro tier
  });

  it('uses starter budget for starter org', async () => {
    vi.mocked(getTodayCredits).mockResolvedValue(475); // 95% of 500 = 475
    const starterOrg = { ...baseOrg, tier: 'starter' as const };
    const result = await checkBudget('org-1', starterOrg);
    expect(result.allowed).toBe(false);
    expect(result.budget).toBe(500);
  });
});

describe('resolveModelForTier', () => {
  it('allows a starter model on starter tier', () => {
    const result = resolveModelForTier('gemini-2.5-flash', { tier: 'starter', billingExempt: false });
    expect(result.allowed).toBe(true);
    expect(result.modelId).toBe('gemini-2.5-flash');
  });

  it('rejects Sonnet on starter tier', () => {
    const result = resolveModelForTier('claude-sonnet-4-6', { tier: 'starter', billingExempt: false });
    expect(result.allowed).toBe(false);
    expect(result.requiredTier).toBe('standard');
  });

  it('rejects Opus on standard tier', () => {
    const result = resolveModelForTier('claude-opus-4-6', { tier: 'standard', billingExempt: false });
    expect(result.allowed).toBe(false);
    expect(result.requiredTier).toBe('pro');
  });

  it('allows Opus on pro tier', () => {
    const result = resolveModelForTier('claude-opus-4-6', { tier: 'pro', billingExempt: false });
    expect(result.allowed).toBe(true);
  });

  it('allows Sonnet on standard tier', () => {
    const result = resolveModelForTier('claude-sonnet-4-6', { tier: 'standard', billingExempt: false });
    expect(result.allowed).toBe(true);
  });

  it('uses testTier when billing exempt', () => {
    const result = resolveModelForTier('claude-opus-4-6', {
      tier: 'starter',
      testTier: 'pro',
      billingExempt: true,
    });
    expect(result.allowed).toBe(true);
  });

  it('includes a message when model is not allowed', () => {
    const result = resolveModelForTier('claude-opus-4-6', { tier: 'starter', billingExempt: false });
    expect(result.message).toContain('Pro');
  });
});

describe('computeMaxOutputTokens', () => {
  it('caps Flash at MAX_OUTPUT_TOKENS_HARD_CAP', () => {
    // Flash (1x): 100/1 * 1000 = 100,000, clamped to 4,000
    expect(computeMaxOutputTokens('gemini-2.5-flash')).toBe(4_000);
  });

  it('caps Opus at credit ceiling', () => {
    // Opus (10x): 100/10 * 1000 = 10,000, clamped to 4,000
    expect(computeMaxOutputTokens('claude-opus-4-6')).toBe(4_000);
  });

  it('caps Sonnet correctly', () => {
    // Sonnet (6x): 100/6 * 1000 = 16,666, clamped to 4,000
    expect(computeMaxOutputTokens('claude-sonnet-4-6')).toBe(4_000);
  });

  it('uses default rate for unknown models', () => {
    // Unknown (1x): 100/1 * 1000 = 100,000, clamped to 4,000
    expect(computeMaxOutputTokens('unknown-model')).toBe(4_000);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/lib/billing/caps.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/caps.ts tests/lib/billing/caps.test.ts
git commit -m "feat(billing): add cap enforcement — checkBudget, resolveModelForTier, computeMaxOutputTokens

Pre-dispatch budget check with 95% soft margin. Model gating per tier.
Per-request credit ceiling (100 credits) translated to maxOutputTokens.
Trial lifetime budget enforcement for trialing orgs."
```

---

## Task 8: Webhook Handlers

**Files:**
- Create: `src/lib/billing/webhook-handlers.ts`
- Create: `tests/lib/billing/webhook-handlers.test.ts`

- [ ] **Step 1: Create a Stripe price-to-tier mapping constant**

Add to the top of `src/lib/billing/tiers.ts`:

```typescript
/**
 * Map Stripe price IDs to tier enum values.
 * Update these when creating/changing Stripe products.
 */
export const STRIPE_PRICE_TO_TIER: Record<string, Tier> = {
  [process.env.STRIPE_STARTER_PRICE_ID ?? 'price_starter']: 'starter',
  [process.env.STRIPE_STANDARD_PRICE_ID ?? 'price_standard']: 'standard',
  [process.env.STRIPE_PRO_PRICE_ID ?? 'price_pro']: 'pro',
};

/**
 * Resolve a Stripe price ID to a Tier. Falls back to 'starter' if unknown.
 */
export function tierFromStripePriceId(priceId: string): Tier {
  return STRIPE_PRICE_TO_TIER[priceId] ?? 'starter';
}
```

- [ ] **Step 2: Create `src/lib/billing/webhook-handlers.ts`**

```typescript
// src/lib/billing/webhook-handlers.ts
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  linkStripeCustomer,
  findOrgByStripeCustomerId,
  updateSubscriptionStatus,
  updateTier,
} from '@/lib/billing/queries';
import { tierFromStripePriceId } from '@/lib/billing/tiers';
import { prisma } from '@/lib/db';

/**
 * checkout.session.completed
 * Links Stripe customer to org via client_reference_id.
 * Sets stripeCustomerId, subscriptionId, status, tier, trialEndsAt.
 */
export async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.client_reference_id;
  if (!orgId) {
    logger.error('[webhook] checkout.session.completed missing client_reference_id', { eventId: event.id });
    return;
  }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;

  if (!subscriptionId || !customerId) {
    logger.error('[webhook] checkout.session.completed missing subscription or customer', { eventId: event.id });
    return;
  }

  // Resolve tier from the subscription's price
  let tier: ReturnType<typeof tierFromStripePriceId> = 'starter';
  try {
    // The subscription data may be expanded or available via line_items
    // In checkout mode, we get the price from line_items or metadata
    const priceId = session.metadata?.price_id;
    if (priceId) {
      tier = tierFromStripePriceId(priceId);
    }
  } catch {
    // Fall through to default tier
  }

  const status = session.status === 'complete' ? 'active' : 'trialing';
  let trialEndsAt: Date | null = null;
  if (status === 'trialing' && session.subscription) {
    // Trial end will be set by subscription.created/updated events
    trialEndsAt = null;
  }

  await linkStripeCustomer(orgId, {
    stripeCustomerId: customerId,
    subscriptionId,
    subscriptionStatus: status === 'active' ? 'active' : 'trialing',
    tier,
    trialEndsAt,
  });

  logger.info('[webhook] checkout.session.completed processed', { orgId, customerId, tier });
}

/**
 * customer.subscription.created
 * Sets subscriptionId, subscriptionStatus, trialEndsAt.
 */
export async function handleSubscriptionCreated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    logger.error('[webhook] subscription.created missing customer', { eventId: event.id });
    return;
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    logger.error('[webhook] subscription.created — no org for customer', { customerId, eventId: event.id });
    return;
  }

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status as 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'paused',
      trialEndsAt: trialEnd,
    },
  });

  logger.info('[webhook] subscription.created processed', { orgId: org.id, status: subscription.status });
}

/**
 * customer.subscription.updated
 * Updates subscriptionStatus and tier (if plan changed).
 */
export async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    logger.error('[webhook] subscription.updated missing customer', { eventId: event.id });
    return;
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    logger.error('[webhook] subscription.updated — no org for customer', { customerId, eventId: event.id });
    return;
  }

  // Detect tier change from subscription items
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const updates: Record<string, unknown> = {
    subscriptionStatus: subscription.status,
  };

  if (priceId) {
    updates.tier = tierFromStripePriceId(priceId);
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: updates,
  });

  logger.info('[webhook] subscription.updated processed', {
    orgId: org.id,
    status: subscription.status,
    tier: updates.tier,
  });
}

/**
 * customer.subscription.deleted
 * Sets status to canceled.
 */
export async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    logger.error('[webhook] subscription.deleted missing customer', { eventId: event.id });
    return;
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    logger.error('[webhook] subscription.deleted — no org for customer', { customerId, eventId: event.id });
    return;
  }

  await updateSubscriptionStatus(org.id, 'canceled');
  logger.info('[webhook] subscription.deleted processed', { orgId: org.id });
}

/**
 * invoice.paid
 * Sets status to active (confirms payment went through after trial or renewal).
 */
export async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : (invoice.customer as Stripe.Customer | null)?.id;

  if (!customerId) {
    logger.error('[webhook] invoice.paid missing customer', { eventId: event.id });
    return;
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    logger.error('[webhook] invoice.paid — no org for customer', { customerId, eventId: event.id });
    return;
  }

  await updateSubscriptionStatus(org.id, 'active');
  logger.info('[webhook] invoice.paid processed', { orgId: org.id });
}

/**
 * invoice.payment_failed
 * Sets status to past_due.
 */
export async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : (invoice.customer as Stripe.Customer | null)?.id;

  if (!customerId) {
    logger.error('[webhook] invoice.payment_failed missing customer', { eventId: event.id });
    return;
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    logger.error('[webhook] invoice.payment_failed — no org for customer', { customerId, eventId: event.id });
    return;
  }

  await updateSubscriptionStatus(org.id, 'past_due');
  logger.info('[webhook] invoice.payment_failed processed', { orgId: org.id });
}
```

- [ ] **Step 3: Create `tests/lib/billing/webhook-handlers.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import {
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from '@/lib/billing/webhook-handlers';

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/billing/queries', () => ({
  linkStripeCustomer: vi.fn().mockResolvedValue({}),
  findOrgByStripeCustomerId: vi.fn(),
  updateSubscriptionStatus: vi.fn().mockResolvedValue({}),
  updateTier: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/billing/tiers', () => ({
  tierFromStripePriceId: vi.fn().mockReturnValue('standard'),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { linkStripeCustomer, findOrgByStripeCustomerId, updateSubscriptionStatus } from '@/lib/billing/queries';
import { logger } from '@/lib/logger';

const mockOrg = {
  id: 'org-1',
  pcoOrgId: 'pco-123',
  name: 'Test Church',
  stripeCustomerId: 'cus_test',
  subscriptionId: 'sub_test',
  subscriptionStatus: 'active' as const,
  tier: 'standard' as const,
  testTier: null,
  billingExempt: false,
  trialEndsAt: null,
  trialCreditsUsed: 0,
  seatCount: 0,
  createdAt: new Date(),
};

function makeEvent(type: string, data: Record<string, unknown>): Stripe.Event {
  return {
    id: 'evt_test',
    type,
    data: { object: data },
  } as unknown as Stripe.Event;
}

describe('handleCheckoutCompleted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links Stripe customer to org via client_reference_id', async () => {
    const event = makeEvent('checkout.session.completed', {
      client_reference_id: 'org-1',
      subscription: 'sub_new',
      customer: 'cus_new',
      status: 'complete',
      metadata: { price_id: 'price_standard' },
    });

    await handleCheckoutCompleted(event);

    expect(linkStripeCustomer).toHaveBeenCalledWith('org-1', expect.objectContaining({
      stripeCustomerId: 'cus_new',
      subscriptionId: 'sub_new',
    }));
  });

  it('logs error when client_reference_id is missing', async () => {
    const event = makeEvent('checkout.session.completed', {
      subscription: 'sub_new',
      customer: 'cus_new',
    });

    await handleCheckoutCompleted(event);
    expect(linkStripeCustomer).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('handleSubscriptionCreated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates org with subscription details', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(mockOrg);
    const event = makeEvent('customer.subscription.created', {
      id: 'sub_new',
      customer: 'cus_test',
      status: 'trialing',
      trial_end: 1777000000,
    });

    await handleSubscriptionCreated(event);
    expect(findOrgByStripeCustomerId).toHaveBeenCalledWith('cus_test');
  });

  it('logs error when org not found', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(null);
    const event = makeEvent('customer.subscription.created', {
      customer: 'cus_unknown',
      status: 'trialing',
    });

    await handleSubscriptionCreated(event);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('handleSubscriptionUpdated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates subscription status and tier', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(mockOrg);
    const event = makeEvent('customer.subscription.updated', {
      customer: 'cus_test',
      status: 'active',
      items: { data: [{ price: { id: 'price_pro' } }] },
    });

    await handleSubscriptionUpdated(event);
    expect(findOrgByStripeCustomerId).toHaveBeenCalledWith('cus_test');
  });
});

describe('handleSubscriptionDeleted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets org status to canceled', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(mockOrg);
    const event = makeEvent('customer.subscription.deleted', {
      customer: 'cus_test',
    });

    await handleSubscriptionDeleted(event);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', 'canceled');
  });
});

describe('handleInvoicePaid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets org status to active', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(mockOrg);
    const event = makeEvent('invoice.paid', {
      customer: 'cus_test',
    });

    await handleInvoicePaid(event);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', 'active');
  });
});

describe('handleInvoicePaymentFailed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets org status to past_due', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(mockOrg);
    const event = makeEvent('invoice.payment_failed', {
      customer: 'cus_test',
    });

    await handleInvoicePaymentFailed(event);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', 'past_due');
  });

  it('logs error when org not found', async () => {
    vi.mocked(findOrgByStripeCustomerId).mockResolvedValue(null);
    const event = makeEvent('invoice.payment_failed', {
      customer: 'cus_unknown',
    });

    await handleInvoicePaymentFailed(event);
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/lib/billing/webhook-handlers.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/webhook-handlers.ts src/lib/billing/tiers.ts tests/lib/billing/webhook-handlers.test.ts
git commit -m "feat(billing): add Stripe webhook handlers with tier resolution

One handler per event type: checkout.session.completed, subscription
created/updated/deleted, invoice.paid/payment_failed. Each updates
Organization fields. Price-to-tier mapping via STRIPE_PRICE_TO_TIER."
```

---

## Task 9: Webhook API Route

**Files:**
- Create: `src/app/api/billing/webhook/route.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Create `src/app/api/billing/webhook/route.ts`**

```typescript
// src/app/api/billing/webhook/route.ts
import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { getStripeWebhookSecret } from '@/lib/env';
import { logger } from '@/lib/logger';
import { isEventProcessed, markEventProcessed } from '@/lib/billing/queries';
import {
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from '@/lib/billing/webhook-handlers';

export const runtime = 'nodejs';

const HANDLED_EVENTS: Record<string, (event: import('stripe').default.Event) => Promise<void>> = {
  'checkout.session.completed': handleCheckoutCompleted,
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
};

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, getStripeWebhookSecret());
  } catch (err) {
    logger.error('[webhook] Signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check
  if (await isEventProcessed(event.id)) {
    logger.info('[webhook] Duplicate event skipped', { eventId: event.id, type: event.type });
    return NextResponse.json({ received: true });
  }

  // Dispatch to handler
  const handler = HANDLED_EVENTS[event.type];
  if (handler) {
    try {
      await handler(event);
      await markEventProcessed(event.id, event.type);
      logger.info('[webhook] Event processed', { eventId: event.id, type: event.type });
    } catch (err) {
      logger.error('[webhook] Handler error', {
        eventId: event.id,
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
    }
  } else {
    logger.info('[webhook] Unhandled event type', { type: event.type });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Add webhook route to `isPublicRoute()` in `src/proxy.ts`**

In `src/proxy.ts`, update the `isPublicRoute` function (currently at line 28) to include the webhook endpoint:

```typescript
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/api/billing/webhook') return true;
  return false;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/billing/webhook/route.ts src/proxy.ts
git commit -m "feat(billing): add Stripe webhook route with signature verification and idempotency

POST /api/billing/webhook: verifies Stripe signature, checks StripeEvent
table for idempotency, dispatches to typed handlers. Added to isPublicRoute()
in proxy.ts to bypass auth."
```

---

## Task 10: Auth — Subscription Status in JWT/Session

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Extend Session and JWT types**

In `src/lib/auth.ts`, update the `next-auth` Session declaration (line 8) to add billing fields:

```typescript
declare module 'next-auth' {
  interface Session {
    user: {
      agentUserId: string;
      orgId: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      subscriptionStatus?: string;
      billingExempt?: boolean;
      tier?: string;
    };
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
  }
}
```

Update the `@auth/core/jwt` JWT declaration (line 24) to add billing fields:

```typescript
declare module '@auth/core/jwt' {
  interface JWT {
    agentUserId?: string;
    orgId?: string;
    role?: string;
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
    pcoAccessTokenExpires?: number;
    roleCheckedAt?: number;
    subscriptionStatus?: string;
    billingExempt?: boolean;
    tier?: string;
  }
}
```

- [ ] **Step 2: Set billing fields on initial sign-in**

In the `signIn` callback (around line 195), after setting `agentRole`, also fetch and set billing fields:

```typescript
        (user as Record<string, unknown>).agentUserId = agentUser.id;
        (user as Record<string, unknown>).orgId = org.id;
        (user as Record<string, unknown>).agentRole = agentUser.role;
        (user as Record<string, unknown>).subscriptionStatus = org.subscriptionStatus;
        (user as Record<string, unknown>).billingExempt = org.billingExempt;
        (user as Record<string, unknown>).tier = org.tier;
```

Note: The `org` returned from the upsert at line 159 will need to be updated to include the billing fields. Change the `upsert` to either not use `select` (return all fields) or add the needed fields. Since `upsert` already returns the full object, just ensure the variable is typed to include the billing fields.

- [ ] **Step 3: Persist billing fields to JWT on initial login**

In the `jwt` callback (around line 209), after setting role, add:

```typescript
      if (user && account) {
        const profile = user as Record<string, unknown>;
        token.agentUserId = profile.agentUserId as string;
        token.orgId = profile.orgId as string;
        token.role = profile.agentRole as string;
        token.subscriptionStatus = profile.subscriptionStatus as string;
        token.billingExempt = profile.billingExempt as boolean;
        token.tier = profile.tier as string;
        token.pcoAccessToken = account.access_token ?? undefined;
        token.pcoRefreshToken = account.refresh_token ?? undefined;
        token.pcoAccessTokenExpires = account.expires_at;
      }
```

- [ ] **Step 4: Sync billing fields on the 15-min cadence**

In the existing role re-sync block (around line 263), extend the DB query to also fetch billing fields and update the token:

```typescript
      // Re-sync role + billing from DB every 15 minutes
      if (!user && token.agentUserId) {
        const now2 = Math.floor(Date.now() / 1000);
        const lastCheck = (token.roleCheckedAt as number) ?? 0;
        if (now2 - lastCheck > 900) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.agentUserId as string },
              select: { role: true, org: { select: { subscriptionStatus: true, billingExempt: true, tier: true } } },
            });
            if (dbUser) {
              token.role = dbUser.role;
              token.subscriptionStatus = dbUser.org.subscriptionStatus;
              token.billingExempt = dbUser.org.billingExempt;
              token.tier = dbUser.org.tier;
            }
            token.roleCheckedAt = now2;
          } catch (error) {
            logger.error('JWT role re-sync failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
```

- [ ] **Step 5: Expose billing fields in the session callback**

In the `session` callback (around line 286), add the billing fields:

```typescript
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          agentUserId: (token.agentUserId as string) ?? '',
          orgId: (token.orgId as string) ?? '',
          role: (token.role as string) ?? 'member',
          subscriptionStatus: token.subscriptionStatus as string | undefined,
          billingExempt: token.billingExempt as boolean | undefined,
          tier: token.tier as string | undefined,
        },
        pcoAccessToken: token.pcoAccessToken as string | undefined,
        pcoRefreshToken: token.pcoRefreshToken as string | undefined,
      };
    },
```

- [ ] **Step 6: Add `isSuperAdmin()` function**

After the existing `canManageRules()` function (around line 52), add:

```typescript
/**
 * Check if a user is a super-admin (pco-agent operator).
 * Based on SUPER_ADMIN_PCO_IDS env var — distinct from per-org admin role.
 */
export function isSuperAdmin(pcoPersonId: string | bigint): boolean {
  const allowlist = (process.env.SUPER_ADMIN_PCO_IDS ?? '').split(',').filter(Boolean);
  return allowlist.includes(String(pcoPersonId));
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(billing): add subscription status, tier, billingExempt to JWT/session

Billing fields set on sign-in and re-synced from DB every 15 minutes
alongside role. Added isSuperAdmin() for operator-level access gating."
```

---

## Task 11: Proxy — Paywall Enforcement

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add paywall logic to `src/proxy.ts`**

After the existing auth enforcement block (line 83-87) and before the rate limiting block (line 89), insert the paywall check:

```typescript
      // Auth enforcement
      const userId = req.auth?.user?.agentUserId;
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      // --- Paywall enforcement (JWT-level, fast) ---
      if (!isBillingExemptApiRoute(pathname)) {
        const subStatus = req.auth?.user?.subscriptionStatus;
        const exempt = req.auth?.user?.billingExempt;
        if (!exempt && !isActiveSubscriptionStatus(subStatus)) {
          return Response.json(
            { error: "Your church's subscription isn't active. Visit the Billing page to get started." },
            { status: 403 },
          );
        }
      }

      // Rate limiting
```

Add the helper functions before the `export default auth(...)` call:

```typescript
/**
 * Check if an API route is exempt from paywall enforcement.
 * Billing, settings, and auth routes must be accessible without a subscription.
 */
function isBillingExemptApiRoute(pathname: string): boolean {
  if (pathname.startsWith('/api/billing/')) return true;
  if (pathname.startsWith('/api/settings')) return true;
  return false;
}

/**
 * Check if a subscription status grants app access.
 * Duplicated from constants.ts to avoid importing in middleware (edge-safe).
 */
function isActiveSubscriptionStatus(status?: string | null): boolean {
  if (!status) return false;
  return ['active', 'trialing', 'past_due'].includes(status);
}
```

- [ ] **Step 2: Add page-level paywall redirect**

For non-API page routes, add a redirect to `/billing` when the subscription is inactive. After the API route block (line ~102) and before the response construction:

```typescript
  // --- Page-level paywall redirect ---
  if (!pathname.startsWith('/api/') && !isPublicRoute(pathname)) {
    const subStatus = req.auth?.user?.subscriptionStatus;
    const exempt = req.auth?.user?.billingExempt;
    if (!exempt && !isActiveSubscriptionStatus(subStatus)) {
      // Allow billing, settings, and login pages
      const exemptPages = ['/billing', '/settings', '/login'];
      const isExemptPage = exemptPages.some(p => pathname === p || pathname.startsWith(p + '/'));
      if (!isExemptPage) {
        return NextResponse.redirect(new URL('/billing', req.url));
      }
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(billing): add paywall enforcement in proxy — API 403 and page redirect

API routes get 403 JSON when subscription inactive (except billing/settings).
Page routes redirect to /billing. billingExempt orgs skip all checks.
Uses JWT-cached subscription status for speed."
```

---

## Task 12: Chat Route — Cap Enforcement + Master Keys

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/ai/providers.ts`

- [ ] **Step 1: Add `getMasterKey()` to `src/lib/ai/providers.ts`**

Add the master key resolution function and update createModel to support optional key:

```typescript
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { getMasterApiKey } from '@/lib/env';

export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Map a model ID to its provider name.
 */
export function providerForModel(modelId: string): SupportedProvider {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  throw new Error(`Cannot determine provider for model: ${modelId}`);
}

/**
 * Resolve the API key for a request: BYOK key if present, otherwise master key.
 */
export function resolveApiKey(provider: string, byokKey?: string | null): string {
  if (byokKey) return byokKey;
  const masterKey = getMasterApiKey(provider);
  if (!masterKey) {
    throw new Error(`No API key available for provider: ${provider}. Configure a master key or add your own in Settings.`);
  }
  return masterKey;
}

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

- [ ] **Step 2: Modify `src/app/api/chat/route.ts` — Add imports**

Add new imports at the top of the file:

```typescript
import { isActiveSubscription } from '@/lib/billing/constants';
import { checkBudget, resolveModelForTier, computeMaxOutputTokens } from '@/lib/billing/caps';
import { computeCredits, estimateCostCents, effectiveTier } from '@/lib/billing/tiers';
import { recordOrgUsage, startOfUtcDay } from '@/lib/billing/usage';
import { incrementTrialCredits, getOrgBilling } from '@/lib/billing/queries';
import { providerForModel, resolveApiKey } from '@/lib/ai/providers';
```

- [ ] **Step 3: Modify chat route — Add subscription hard check after auth**

After loading the session (around line 48) and before parsing the request, add:

```typescript
  // 1b. Subscription hard check (DB-level, not just JWT)
  const orgBilling = await getOrgBilling(session.user.orgId);
  if (!orgBilling) {
    return Response.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!orgBilling.billingExempt && !isActiveSubscription(orgBilling.subscriptionStatus)) {
    return Response.json(
      { error: "Your church's subscription isn't active. Visit the Billing page to get started." },
      { status: 403 },
    );
  }
```

- [ ] **Step 4: Modify chat route — Add model gating and budget check**

After loading the user and determining modelId (around line 97), add model gating:

```typescript
    // 4b. Model gating — check tier allows this model
    const modelCheck = resolveModelForTier(modelId, orgBilling);
    if (!modelCheck.allowed) {
      return Response.json(
        {
          error: 'model_not_available',
          message: modelCheck.message,
          requiredTier: modelCheck.requiredTier,
        },
        { status: 403 },
      );
    }

    // 4c. Budget check — daily cap enforcement
    const budgetCheck = await checkBudget(session.user.orgId, orgBilling);
    if (!budgetCheck.allowed) {
      return Response.json(
        {
          error: budgetCheck.reason,
          message: budgetCheck.message,
          tier: budgetCheck.tier,
          budget: budgetCheck.budget,
          used: budgetCheck.creditsUsed,
        },
        { status: 429 },
      );
    }
```

- [ ] **Step 5: Modify chat route — Switch to master key fallback**

Replace the API key resolution (around line 93) to use BYOK-or-master-key logic:

```typescript
    // 4. Resolve API key — BYOK if configured, otherwise master key
    const provider = user.apiProvider ?? providerForModel(modelId);
    let apiKey: string;
    try {
      if (user.apiKeyEnc) {
        apiKey = decrypt(user.apiKeyEnc, getEncryptionKey());
      } else {
        apiKey = resolveApiKey(provider, null);
      }
    } catch {
      return Response.json(
        { error: 'No API key available. Configure one in Settings or contact your admin.' },
        { status: 400 },
      );
    }
```

- [ ] **Step 6: Modify chat route — Add maxOutputTokens and usage recording in onFinish**

In the `streamText` call, add `maxOutputTokens`:

```typescript
  const result = streamText({
      model: createModel(provider, modelId, apiKey),
      system: systemPrompt,
      messages: await convertToModelMessages(processedMessages),
      tools: allTools,
      maxOutputTokens: computeMaxOutputTokens(modelId),
      stopWhen: stepCountIs(5),
```

In the `onFinish` callback, after saving the assistant message and before auto-title, add usage recording:

```typescript
          // Record usage for billing
          if (usage) {
            const today = startOfUtcDay();
            const credits = computeCredits(modelId, usage.totalTokens ?? 0);
            const costCents = estimateCostCents(modelId, {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            });

            recordOrgUsage({
              orgId: session.user.orgId,
              date: today,
              creditsUsed: credits,
              totalTokens: usage.totalTokens ?? 0,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              cachedTokens: (usage as Record<string, unknown>).cachedInputTokens as number ?? 0,
              costCents,
            }).catch((err) =>
              log.error('[chat] Usage recording failed', {
                conversationId,
                error: err instanceof Error ? err.message : String(err),
              }),
            );

            // Trial lifetime counter
            if (orgBilling.subscriptionStatus === 'trialing') {
              incrementTrialCredits(session.user.orgId, credits).catch((err) =>
                log.error('[chat] Trial credit increment failed', {
                  conversationId,
                  error: err instanceof Error ? err.message : String(err),
                }),
              );
            }
          }
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/chat/route.ts src/lib/ai/providers.ts
git commit -m "feat(billing): integrate cap enforcement and master keys into chat route

Chat route now: (1) hard-checks subscription from DB, (2) gates model by tier,
(3) checks daily credit budget, (4) falls back to master API key when no BYOK,
(5) records usage in onFinish, (6) increments trial counter for trialing orgs.
Added providerForModel() and resolveApiKey() to providers.ts."
```

---

## Task 13: Billing API Routes

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/portal/route.ts`
- Create: `src/app/api/billing/usage/route.ts`

- [ ] **Step 1: Create `src/app/api/billing/checkout/route.ts`**

```typescript
// src/app/api/billing/checkout/route.ts
import { auth } from '@/lib/auth';
import { getStripe } from '@/lib/billing/stripe';
import { getStripePublishableKey } from '@/lib/env';
import { TRIAL_DAYS } from '@/lib/billing/constants';
import { canManageRules } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Only admins can initiate checkout
  if (!canManageRules(session.user.role)) {
    return Response.json({ error: 'Only admins can manage billing.' }, { status: 403 });
  }

  const body = await req.json();
  const { priceId } = body as { priceId: string };
  if (!priceId) {
    return Response.json({ error: 'priceId is required' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { org_id: session.user.orgId },
      },
      client_reference_id: session.user.orgId,
      customer_email: session.user.email ?? undefined,
      allow_promotion_codes: true,
      metadata: { price_id: priceId },
      ui_mode: 'embedded',
      return_url: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/billing?session_id={CHECKOUT_SESSION_ID}`,
    });

    return Response.json({
      clientSecret: checkoutSession.client_secret,
      publishableKey: getStripePublishableKey(),
    });
  } catch (error) {
    logger.error('[billing] Checkout session creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/billing/portal/route.ts`**

```typescript
// src/app/api/billing/portal/route.ts
import { auth, canManageRules } from '@/lib/auth';
import { getStripe } from '@/lib/billing/stripe';
import { getOrgBilling } from '@/lib/billing/queries';
import { logger } from '@/lib/logger';

export async function POST() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!canManageRules(session.user.role)) {
    return Response.json({ error: 'Only admins can manage billing.' }, { status: 403 });
  }

  const org = await getOrgBilling(session.user.orgId);
  if (!org?.stripeCustomerId) {
    return Response.json({ error: 'No billing account found. Subscribe first.' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/billing`,
    });

    return Response.json({ url: portalSession.url });
  } catch (error) {
    logger.error('[billing] Portal session creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `src/app/api/billing/usage/route.ts`**

```typescript
// src/app/api/billing/usage/route.ts
import { auth } from '@/lib/auth';
import { getTodayUsage } from '@/lib/billing/usage';
import { getOrgBilling } from '@/lib/billing/queries';
import { effectiveTier, TIER_CONFIGS } from '@/lib/billing/tiers';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const org = await getOrgBilling(session.user.orgId);
  if (!org) {
    return Response.json({ error: 'Organization not found' }, { status: 404 });
  }

  const tier = effectiveTier(org);
  const config = TIER_CONFIGS[tier];
  const usage = await getTodayUsage(session.user.orgId);

  return Response.json({
    tier,
    tierLabel: config.label,
    dailyBudget: config.dailyBudget,
    creditsUsed: usage?.creditsUsed ?? 0,
    requestCount: usage?.requestCount ?? 0,
    subscriptionStatus: org.subscriptionStatus,
    billingExempt: org.billingExempt,
    trialCreditsUsed: org.trialCreditsUsed,
  });
}
```

- [ ] **Step 4: Add billing API routes to rate limits in `src/proxy.ts`**

In the `RATE_LIMITS` object in `src/proxy.ts`, add:

```typescript
  '/api/billing/checkout': 5,
  '/api/billing/portal': 5,
  '/api/billing/usage': 30,
```

And in `normalizeRoute()`, add patterns:

```typescript
  if (/^\/api\/billing\/[^/]+$/.test(pathname)) return `/api/billing/${pathname.split('/').pop()}`;
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/checkout/route.ts src/app/api/billing/portal/route.ts src/app/api/billing/usage/route.ts src/proxy.ts
git commit -m "feat(billing): add checkout, portal, and usage API routes

POST /api/billing/checkout — creates Stripe Checkout Session (admin only).
POST /api/billing/portal — creates Stripe Customer Portal session (admin only).
GET /api/billing/usage — returns today's credit usage + budget for the org."
```

---

## Task 14: Subscription Banner + Daily Budget Bar

**Files:**
- Create: `src/components/billing/subscription-banner.tsx`
- Create: `src/components/billing/daily-budget-bar.tsx`

- [ ] **Step 1: Create `src/components/billing/subscription-banner.tsx`**

```tsx
'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

interface SubscriptionBannerProps {
  subscriptionStatus?: string;
  billingExempt?: boolean;
  isAdmin: boolean;
  adminName?: string;
}

export function SubscriptionBanner({
  subscriptionStatus,
  billingExempt,
  isAdmin,
  adminName,
}: SubscriptionBannerProps) {
  if (billingExempt) return null;

  // past_due — admin-only warning
  if (subscriptionStatus === 'past_due' && isAdmin) {
    return (
      <Alert variant="destructive" className="mb-3">
        <AlertDescription>
          There&apos;s an issue with your payment.{' '}
          <Link href="/billing" className="underline font-medium">
            Update your billing
          </Link>{' '}
          to avoid interruption.
        </AlertDescription>
      </Alert>
    );
  }

  // canceled / unpaid / none — show to everyone
  if (!subscriptionStatus || ['canceled', 'unpaid', 'none'].includes(subscriptionStatus)) {
    return (
      <Alert variant="destructive" className="mb-3">
        <AlertDescription>
          {isAdmin ? (
            <>
              Your subscription has ended.{' '}
              <Link href="/billing" className="underline font-medium">
                Resubscribe
              </Link>{' '}
              to continue chatting.
            </>
          ) : (
            <>
              Your subscription has ended. You can still view your conversations.
              {adminName ? ` Contact ${adminName} to resubscribe.` : ' Contact your admin to resubscribe.'}
            </>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
```

- [ ] **Step 2: Create `src/components/billing/daily-budget-bar.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Progress } from '@/components/ui/progress';

interface UsageData {
  creditsUsed: number;
  dailyBudget: number;
  tierLabel: string;
}

export function DailyBudgetBar() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage({
          creditsUsed: data.creditsUsed,
          dailyBudget: data.dailyBudget,
          tierLabel: data.tierLabel,
        });
      }
    } catch {
      // Non-fatal — bar just won't show
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    // Refresh every 2 minutes
    const interval = setInterval(fetchUsage, 120_000);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  if (!usage) return null;

  const percent = Math.min(100, Math.round((usage.creditsUsed / usage.dailyBudget) * 100));
  const remaining = Math.max(0, usage.dailyBudget - usage.creditsUsed);

  let colorClass = 'bg-primary';
  if (percent >= 95) colorClass = 'bg-destructive';
  else if (percent >= 80) colorClass = 'bg-yellow-500';

  return (
    <div
      className="px-4 py-2 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Today&apos;s chat budget</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5" indicatorClassName={colorClass} />
      {expanded && (
        <div className="text-xs text-muted-foreground mt-1">
          {remaining.toLocaleString()} of {usage.dailyBudget.toLocaleString()} credits remaining.{' '}
          {usage.tierLabel} plan. Resets at midnight.
          {percent >= 95 && (
            <span className="text-destructive font-medium block mt-1">
              Almost out — switch to a lighter model or wait until midnight.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/subscription-banner.tsx src/components/billing/daily-budget-bar.tsx
git commit -m "feat(billing): add subscription banner and daily budget bar components

SubscriptionBanner shows past_due warning (admin-only) and canceled/ended
message (all users). DailyBudgetBar shows credit usage progress with
color states at 80% (amber) and 95% (red), auto-refreshes every 2 minutes."
```

---

## Task 15: Billing Page

**Files:**
- Create: `src/components/billing/billing-status.tsx`
- Create: `src/components/billing/checkout-form.tsx`
- Create: `src/components/billing/tier-comparison.tsx`
- Create: `src/app/(app)/billing/page.tsx`

- [ ] **Step 1: Create `src/components/billing/billing-status.tsx`**

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import type { OrgBilling } from '@/lib/billing/queries';
import { TIER_CONFIGS } from '@/lib/billing/tiers';

interface BillingStatusProps {
  org: OrgBilling;
}

export function BillingStatus({ org }: BillingStatusProps) {
  const config = TIER_CONFIGS[org.tier];

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    trialing: 'bg-blue-100 text-blue-800',
    past_due: 'bg-yellow-100 text-yellow-800',
    canceled: 'bg-red-100 text-red-800',
    none: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Current Plan</h2>
        <Badge className={statusColors[org.subscriptionStatus] ?? statusColors.none}>
          {org.subscriptionStatus === 'none' ? 'No subscription' : org.subscriptionStatus.replace('_', ' ')}
        </Badge>
      </div>
      {org.billingExempt && (
        <Badge variant="outline" className="text-xs">Billing exempt</Badge>
      )}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Plan</p>
          <p className="font-medium">{config?.label ?? org.tier} — ${config?.priceMonthly ?? '?'}/mo</p>
        </div>
        <div>
          <p className="text-muted-foreground">Daily chat budget</p>
          <p className="font-medium">{config?.dailyBudget.toLocaleString() ?? '?'} credits</p>
        </div>
        {org.subscriptionStatus === 'trialing' && org.trialEndsAt && (
          <div>
            <p className="text-muted-foreground">Trial ends</p>
            <p className="font-medium">{new Date(org.trialEndsAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/billing/checkout-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TIER_CONFIGS } from '@/lib/billing/tiers';
import type { Tier } from '@prisma/client';

interface CheckoutFormProps {
  currentTier: Tier;
  hasSubscription: boolean;
}

export function CheckoutForm({ currentTier, hasSubscription }: CheckoutFormProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (priceId: string) => {
    setLoading(priceId);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Something went wrong');
        return;
      }
      // Embedded checkout will be handled by Stripe.js in a future step
      // For now, redirect flow
      const data = await res.json();
      if (data.clientSecret) {
        // Store for embedded checkout
        window.location.href = `/billing?checkout=${data.clientSecret}`;
      }
    } catch {
      setError('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const data = await res.json();
        setError(data.error ?? 'Something went wrong');
      }
    } catch {
      setError('Failed to open billing portal');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {hasSubscription ? (
        <Button
          onClick={handlePortal}
          disabled={loading === 'portal'}
          variant="outline"
        >
          {loading === 'portal' ? 'Opening...' : 'Manage Subscription'}
        </Button>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.entries(TIER_CONFIGS) as [Tier, typeof TIER_CONFIGS[Tier]][]).map(
            ([tier, config]) => (
              <div
                key={tier}
                className={`rounded-lg border p-4 space-y-3 ${
                  tier === currentTier ? 'border-primary ring-1 ring-primary' : ''
                }`}
              >
                <h3 className="font-semibold">{config.label}</h3>
                <p className="text-2xl font-bold">${config.priceMonthly}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm text-muted-foreground">
                  {config.dailyBudget.toLocaleString()} credits/day
                </p>
                <Button
                  className="w-full"
                  variant={tier === 'standard' ? 'default' : 'outline'}
                  disabled={loading !== null}
                  onClick={() => handleCheckout(`price_${tier}`)}
                >
                  {loading === `price_${tier}` ? 'Loading...' : 'Subscribe'}
                </Button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/billing/tier-comparison.tsx`**

```tsx
'use client';

import { TIER_CONFIGS, MODEL_CREDIT_RATES } from '@/lib/billing/tiers';
import { MODEL_OPTIONS } from '@/lib/ai/models';
import type { Tier } from '@prisma/client';

interface TierComparisonProps {
  currentTier: Tier;
}

export function TierComparison({ currentTier }: TierComparisonProps) {
  const tiers = Object.entries(TIER_CONFIGS) as [Tier, typeof TIER_CONFIGS[Tier]][];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Plan Comparison</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">Feature</th>
              {tiers.map(([tier, config]) => (
                <th key={tier} className={`text-center py-2 px-4 ${tier === currentTier ? 'bg-primary/5' : ''}`}>
                  {config.label}
                  {tier === currentTier && <span className="block text-xs text-primary">Current</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 pr-4">Monthly price</td>
              {tiers.map(([tier, config]) => (
                <td key={tier} className="text-center py-2 px-4 font-medium">
                  ${config.priceMonthly}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="py-2 pr-4">Daily credit budget</td>
              {tiers.map(([tier, config]) => (
                <td key={tier} className="text-center py-2 px-4">
                  {config.dailyBudget.toLocaleString()}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="py-2 pr-4">Users</td>
              {tiers.map(([tier]) => (
                <td key={tier} className="text-center py-2 px-4">Unlimited</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-medium mb-2">Model access by tier</h3>
        <div className="space-y-1 text-sm">
          {Object.entries(MODEL_CREDIT_RATES).map(([modelId, rate]) => {
            const minTier = tiers.find(([, config]) =>
              config.allowedModels.includes(modelId),
            )?.[0] ?? 'pro';
            return (
              <div key={modelId} className="flex items-center justify-between py-1 border-b last:border-0">
                <span>{modelId}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{rate} credits/1K tokens</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">
                    {TIER_CONFIGS[minTier as Tier]?.label ?? 'Pro'}+
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/(app)/billing/page.tsx`**

```tsx
import { auth, canManageRules } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getOrgBilling } from '@/lib/billing/queries';
import { BillingStatus } from '@/components/billing/billing-status';
import { CheckoutForm } from '@/components/billing/checkout-form';
import { TierComparison } from '@/components/billing/tier-comparison';
import { DailyBudgetBar } from '@/components/billing/daily-budget-bar';
import { isActiveSubscription } from '@/lib/billing/constants';

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    redirect('/login');
  }

  const org = await getOrgBilling(session.user.orgId);
  if (!org) {
    redirect('/login');
  }

  const isAdmin = canManageRules(session.user.role);
  const hasActiveSubscription = isActiveSubscription(org.subscriptionStatus);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Billing</h1>

      <BillingStatus org={org} />

      {hasActiveSubscription && <DailyBudgetBar />}

      {isAdmin ? (
        <CheckoutForm
          currentTier={org.tier}
          hasSubscription={!!org.stripeCustomerId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only admins can manage billing. Contact your church administrator to change plans.
        </p>
      )}

      <TierComparison currentTier={org.tier} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/billing/billing-status.tsx src/components/billing/checkout-form.tsx src/components/billing/tier-comparison.tsx src/app/\(app\)/billing/page.tsx
git commit -m "feat(billing): add billing page with status, checkout, tier comparison

Billing page shows current plan status, daily budget bar (when active),
checkout flow for admins, and tier comparison table with model access
and credit rates. Non-admins see read-only status."
```

---

## Task 16: Chat Interface Updates

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Add daily budget bar above the chat input area**

Import and add the `DailyBudgetBar` component near the top of the chat interface, before the messages area:

```tsx
import { DailyBudgetBar } from '@/components/billing/daily-budget-bar';
import { SubscriptionBanner } from '@/components/billing/subscription-banner';
```

- [ ] **Step 2: Add subscription status props to ChatInterface**

Extend the component props to accept billing state:

```typescript
interface ChatInterfaceProps {
  conversationId?: string;
  initialMessages?: UIMessage[];
  subscriptionStatus?: string;
  billingExempt?: boolean;
  isAdmin?: boolean;
  adminName?: string;
}
```

- [ ] **Step 3: Render banner and budget bar**

At the top of the chat container (before the messages scroll area), add:

```tsx
<SubscriptionBanner
  subscriptionStatus={subscriptionStatus}
  billingExempt={billingExempt}
  isAdmin={isAdmin ?? false}
  adminName={adminName}
/>
```

Above the input area, add the budget bar:

```tsx
<DailyBudgetBar />
```

- [ ] **Step 4: Disable input when subscription is inactive**

Add a computed `isReadOnly` flag and conditionally disable the input:

```typescript
const isReadOnly = !billingExempt && subscriptionStatus
  ? !['active', 'trialing', 'past_due'].includes(subscriptionStatus)
  : false;
```

Apply to the textarea and submit button:

```tsx
<Textarea
  disabled={isReadOnly || isLoading}
  placeholder={isReadOnly ? 'Your subscription has ended. View-only mode.' : 'Message Service Planner...'}
  // ... rest of props
/>
```

- [ ] **Step 5: Pass billing props from parent pages**

In `src/app/(app)/chat/page.tsx` and `src/app/(app)/chat/[id]/page.tsx`, pass the billing props from the session:

```tsx
<ChatInterface
  subscriptionStatus={session.user.subscriptionStatus}
  billingExempt={session.user.billingExempt}
  isAdmin={canManageRules(session.user.role)}
/>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/chat-interface.tsx src/app/\(app\)/chat/page.tsx src/app/\(app\)/chat/\[id\]/page.tsx
git commit -m "feat(billing): add budget bar and read-only degradation to chat interface

Chat interface now shows daily budget bar, subscription banner for lapsed
orgs, and disables input when subscription is inactive. Past_due warning
shown to admins only."
```

---

## Task 17: Admin Auth + API Routes

**Files:**
- Create: `src/lib/admin/audit.ts`
- Create: `src/lib/admin/queries.ts`
- Create: `src/app/api/admin/orgs/[id]/exempt/route.ts`
- Create: `src/app/api/admin/orgs/[id]/test-tier/route.ts`
- Create: `src/app/api/admin/orgs/[id]/usage/route.ts`

- [ ] **Step 1: Create `src/lib/admin/audit.ts`**

```typescript
// src/lib/admin/audit.ts
import { prisma } from '@/lib/db';

export interface AdminAction {
  adminPcoId: string;
  targetOrgId?: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Log a super-admin action for audit trail.
 */
export async function logAdminAction(data: AdminAction): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminPcoId: data.adminPcoId,
      targetOrgId: data.targetOrgId ?? null,
      action: data.action,
      before: data.before ?? null,
      after: data.after ?? null,
    },
  });
}
```

- [ ] **Step 2: Create `src/lib/admin/queries.ts`**

```typescript
// src/lib/admin/queries.ts
import { prisma } from '@/lib/db';

/**
 * List all organizations with billing fields for admin dashboard.
 */
export async function listAllOrgs() {
  return prisma.organization.findMany({
    select: {
      id: true,
      pcoOrgId: true,
      name: true,
      subscriptionStatus: true,
      tier: true,
      billingExempt: true,
      testTier: true,
      seatCount: true,
      stripeCustomerId: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single org with full details for admin org detail page.
 */
export async function getOrgDetail(orgId: string) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      _count: { select: { users: true, conversations: true } },
    },
  });
}

/**
 * Get fleet-wide daily usage aggregates.
 */
export async function getFleetUsage(days: number = 30) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  return prisma.orgUsage.groupBy({
    by: ['date'],
    _sum: {
      creditsUsed: true,
      totalTokens: true,
      requestCount: true,
      estimatedCostCents: true,
    },
    where: { date: { gte: since } },
    orderBy: { date: 'asc' },
  });
}
```

- [ ] **Step 3: Create a shared admin auth guard utility**

Create a helper to DRY admin route auth. Put it in `src/lib/admin/auth-guard.ts`:

```typescript
// src/lib/admin/auth-guard.ts
import { auth, isSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Validate that the current session belongs to a super-admin.
 * Returns the admin's PCO person ID and session, or an error Response.
 */
export async function requireSuperAdmin(): Promise<
  | { ok: true; adminPcoId: string; orgId: string; session: Awaited<ReturnType<typeof auth>> }
  | { ok: false; response: Response }
> {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }

  // Look up the user's PCO person ID
  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
    select: { pcoPersonId: true },
  });

  if (!user || !isSuperAdmin(user.pcoPersonId)) {
    return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, adminPcoId: String(user.pcoPersonId), orgId: session.user.orgId, session };
}
```

- [ ] **Step 4: Create `src/app/api/admin/orgs/[id]/exempt/route.ts`**

```typescript
// src/app/api/admin/orgs/[id]/exempt/route.ts
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/admin/auth-guard';
import { logAdminAction } from '@/lib/admin/audit';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminResult = await requireSuperAdmin();
  if (!adminResult.ok) return adminResult.response;

  const { id: orgId } = await params;
  const body = await req.json();
  const { billingExempt } = body as { billingExempt: boolean };

  if (typeof billingExempt !== 'boolean') {
    return Response.json({ error: 'billingExempt must be a boolean' }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { billingExempt: true },
  });
  if (!org) {
    return Response.json({ error: 'Organization not found' }, { status: 404 });
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { billingExempt },
  });

  await logAdminAction({
    adminPcoId: adminResult.adminPcoId,
    targetOrgId: orgId,
    action: 'set_billing_exempt',
    before: { billingExempt: org.billingExempt },
    after: { billingExempt },
  });

  return Response.json({ success: true, billingExempt });
}
```

- [ ] **Step 5: Create `src/app/api/admin/orgs/[id]/test-tier/route.ts`**

```typescript
// src/app/api/admin/orgs/[id]/test-tier/route.ts
import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/admin/auth-guard';
import { logAdminAction } from '@/lib/admin/audit';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminResult = await requireSuperAdmin();
  if (!adminResult.ok) return adminResult.response;

  const { id: orgId } = await params;
  const body = await req.json();
  const { testTier } = body as { testTier: string | null };

  // Validate tier value
  const validTiers = ['starter', 'standard', 'pro', null];
  if (!validTiers.includes(testTier)) {
    return Response.json({ error: 'testTier must be starter, standard, pro, or null' }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { testTier: true },
  });
  if (!org) {
    return Response.json({ error: 'Organization not found' }, { status: 404 });
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { testTier: testTier as 'starter' | 'standard' | 'pro' | null },
  });

  await logAdminAction({
    adminPcoId: adminResult.adminPcoId,
    targetOrgId: orgId,
    action: testTier ? 'set_test_tier' : 'clear_test_tier',
    before: { testTier: org.testTier },
    after: { testTier },
  });

  return Response.json({ success: true, testTier });
}
```

- [ ] **Step 6: Create `src/app/api/admin/orgs/[id]/usage/route.ts`**

```typescript
// src/app/api/admin/orgs/[id]/usage/route.ts
import { requireSuperAdmin } from '@/lib/admin/auth-guard';
import { getUsageHistory } from '@/lib/billing/usage';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminResult = await requireSuperAdmin();
  if (!adminResult.ok) return adminResult.response;

  const { id: orgId } = await params;
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);

  const usage = await getUsageHistory(orgId, Math.min(days, 90));
  return Response.json({ usage });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/audit.ts src/lib/admin/queries.ts src/lib/admin/auth-guard.ts src/app/api/admin/
git commit -m "feat(admin): add super-admin API routes with audit logging

Admin routes for exempt toggle, test-tier override, and usage history.
All gated on isSuperAdmin(). Every mutation logged to AdminAuditLog
with before/after state."
```

---

## Task 18: Admin Pages

**Files:**
- Create: `src/app/(app)/admin/layout.tsx`
- Create: `src/app/(app)/admin/page.tsx`
- Create: `src/app/(app)/admin/orgs/page.tsx`
- Create: `src/app/(app)/admin/orgs/[id]/page.tsx`
- Create: `src/app/(app)/admin/usage/page.tsx`
- Create: `src/components/admin/org-table.tsx`
- Create: `src/components/admin/org-controls.tsx`
- Create: `src/components/admin/usage-chart.tsx`

- [ ] **Step 1: Create `src/app/(app)/admin/layout.tsx`**

```tsx
import { auth, isSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
    select: { pcoPersonId: true },
  });

  if (!user || !isSuperAdmin(user.pcoPersonId)) {
    redirect('/chat');
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <nav className="flex gap-4 mb-6 text-sm border-b pb-3">
        <a href="/admin" className="hover:text-primary font-medium">Dashboard</a>
        <a href="/admin/orgs" className="hover:text-primary font-medium">Organizations</a>
        <a href="/admin/usage" className="hover:text-primary font-medium">Usage</a>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(app)/admin/page.tsx`**

```tsx
import { prisma } from '@/lib/db';

export default async function AdminDashboard() {
  const [orgCount, userCount, todayUsage] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.orgUsage.aggregate({
      _sum: { creditsUsed: true, estimatedCostCents: true, requestCount: true },
      where: {
        date: {
          gte: new Date(new Date().toISOString().split('T')[0]),
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Organizations</p>
          <p className="text-2xl font-bold">{orgCount}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Users</p>
          <p className="text-2xl font-bold">{userCount}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Today&apos;s requests</p>
          <p className="text-2xl font-bold">{todayUsage._sum.requestCount ?? 0}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Today&apos;s cost</p>
          <p className="text-2xl font-bold">${((todayUsage._sum.estimatedCostCents ?? 0) / 100).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/admin/org-table.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface OrgRow {
  id: string;
  name: string;
  pcoOrgId: string;
  subscriptionStatus: string;
  tier: string;
  billingExempt: boolean;
  testTier: string | null;
  _count: { users: number };
  createdAt: string;
}

export function OrgTable({ orgs }: { orgs: OrgRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Tier</th>
            <th className="py-2 pr-4">Users</th>
            <th className="py-2 pr-4">Flags</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id} className="border-b">
              <td className="py-2 pr-4 font-medium">{org.name}</td>
              <td className="py-2 pr-4">
                <Badge variant="outline">{org.subscriptionStatus}</Badge>
              </td>
              <td className="py-2 pr-4">{org.tier}</td>
              <td className="py-2 pr-4">{org._count.users}</td>
              <td className="py-2 pr-4">
                {org.billingExempt && <Badge variant="secondary">Exempt</Badge>}
                {org.testTier && <Badge variant="secondary">Test: {org.testTier}</Badge>}
              </td>
              <td className="py-2">
                <Link href={`/admin/orgs/${org.id}`} className="text-primary hover:underline">
                  Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/(app)/admin/orgs/page.tsx`**

```tsx
import { listAllOrgs } from '@/lib/admin/queries';
import { OrgTable } from '@/components/admin/org-table';

export default async function AdminOrgsPage() {
  const orgs = await listAllOrgs();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Organizations</h1>
      <OrgTable orgs={JSON.parse(JSON.stringify(orgs))} />
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/admin/org-controls.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OrgControlsProps {
  orgId: string;
  billingExempt: boolean;
  testTier: string | null;
}

export function OrgControls({ orgId, billingExempt: initialExempt, testTier: initialTestTier }: OrgControlsProps) {
  const [exempt, setExempt] = useState(initialExempt);
  const [testTier, setTestTier] = useState<string>(initialTestTier ?? 'none');
  const [saving, setSaving] = useState(false);

  const toggleExempt = async () => {
    setSaving(true);
    const newValue = !exempt;
    const res = await fetch(`/api/admin/orgs/${orgId}/exempt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingExempt: newValue }),
    });
    if (res.ok) setExempt(newValue);
    setSaving(false);
  };

  const updateTestTier = async (value: string) => {
    setSaving(true);
    const tierValue = value === 'none' ? null : value;
    const res = await fetch(`/api/admin/orgs/${orgId}/test-tier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testTier: tierValue }),
    });
    if (res.ok) setTestTier(value);
    setSaving(false);
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h3 className="font-semibold">Admin Controls</h3>
      <div className="flex items-center justify-between">
        <label className="text-sm">Billing Exempt</label>
        <Switch
          checked={exempt}
          onCheckedChange={toggleExempt}
          disabled={saving}
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Test Tier Override</label>
        <Select value={testTier} onValueChange={updateTestTier} disabled={saving}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/app/(app)/admin/orgs/[id]/page.tsx`**

```tsx
import { getOrgDetail } from '@/lib/admin/queries';
import { getUsageHistory } from '@/lib/billing/usage';
import { OrgControls } from '@/components/admin/org-controls';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await getOrgDetail(id);
  if (!org) notFound();

  const usage = await getUsageHistory(id, 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <Badge variant="outline">{org.subscriptionStatus}</Badge>
        {org.billingExempt && <Badge variant="secondary">Exempt</Badge>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">PCO Org ID</p>
          <p className="font-medium">{org.pcoOrgId}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Tier</p>
          <p className="font-medium">{org.tier}{org.testTier ? ` (test: ${org.testTier})` : ''}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Users</p>
          <p className="font-medium">{org._count.users}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Conversations</p>
          <p className="font-medium">{org._count.conversations}</p>
        </div>
        {org.stripeCustomerId && (
          <div className="col-span-2">
            <p className="text-muted-foreground">Stripe Customer</p>
            <a
              href={`https://dashboard.stripe.com/customers/${org.stripeCustomerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {org.stripeCustomerId}
            </a>
          </div>
        )}
      </div>

      <OrgControls
        orgId={org.id}
        billingExempt={org.billingExempt}
        testTier={org.testTier}
      />

      <div>
        <h2 className="text-lg font-semibold mb-3">Usage (last 30 days)</h2>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Credits</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Requests</th>
                  <th className="py-2">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-2 pr-4">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{row.creditsUsed.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.totalTokens.toLocaleString()}</td>
                    <td className="py-2 pr-4">{row.requestCount}</td>
                    <td className="py-2">${(row.estimatedCostCents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/admin/usage-chart.tsx`**

```tsx
'use client';

interface UsageDataPoint {
  date: string;
  _sum: {
    creditsUsed: number | null;
    totalTokens: number | null;
    requestCount: number | null;
    estimatedCostCents: number | null;
  };
}

export function UsageChart({ data }: { data: UsageDataPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No fleet usage data.</p>;
  }

  const maxCredits = Math.max(...data.map((d) => d._sum.creditsUsed ?? 0), 1);

  return (
    <div className="space-y-2">
      {data.map((point) => {
        const credits = point._sum.creditsUsed ?? 0;
        const pct = Math.round((credits / maxCredits) * 100);
        return (
          <div key={point.date} className="flex items-center gap-3 text-xs">
            <span className="w-20 text-muted-foreground">{new Date(point.date).toLocaleDateString()}</span>
            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-20 text-right">{credits.toLocaleString()} cr</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 8: Create `src/app/(app)/admin/usage/page.tsx`**

```tsx
import { getFleetUsage } from '@/lib/admin/queries';
import { UsageChart } from '@/components/admin/usage-chart';

export default async function AdminUsagePage() {
  const fleetUsage = await getFleetUsage(30);

  const totalCredits = fleetUsage.reduce((s, d) => s + (d._sum.creditsUsed ?? 0), 0);
  const totalCost = fleetUsage.reduce((s, d) => s + (d._sum.estimatedCostCents ?? 0), 0);
  const totalRequests = fleetUsage.reduce((s, d) => s + (d._sum.requestCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fleet Usage (30 days)</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Credits</p>
          <p className="text-2xl font-bold">{totalCredits.toLocaleString()}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Requests</p>
          <p className="text-2xl font-bold">{totalRequests.toLocaleString()}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Estimated Cost</p>
          <p className="text-2xl font-bold">${(totalCost / 100).toFixed(2)}</p>
        </div>
      </div>

      <UsageChart data={JSON.parse(JSON.stringify(fleetUsage))} />
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/admin/ src/components/admin/
git commit -m "feat(admin): add super-admin pages — dashboard, org list, org detail, fleet usage

Admin layout gates on isSuperAdmin(). Dashboard shows org/user counts and
today's usage. Org detail page has exempt toggle, test-tier dropdown,
and 30-day usage history. Fleet usage page shows daily credit chart."
```

---

## Task 19: Sidebar + Nav Updates

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Read the current sidebar component to understand its structure**

Read `src/components/sidebar.tsx` to identify where to add the new nav items.

- [ ] **Step 2: Add Billing nav item**

In the sidebar nav section (where Settings link is), add a Billing link after Settings:

```tsx
import { CreditCard, Shield } from 'lucide-react';
```

Add the Billing link:

```tsx
<Link
  href="/billing"
  className={cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    'w-full justify-start gap-2',
  )}
>
  <CreditCard className="h-4 w-4" />
  Billing
  {session.user.subscriptionStatus === 'past_due' && session.user.role !== 'member' && (
    <span className="ml-auto h-2 w-2 rounded-full bg-yellow-500" />
  )}
</Link>
```

- [ ] **Step 3: Add Admin nav item (super-admin only)**

Conditionally render an Admin link. Since the sidebar is a server component, fetch the user's pcoPersonId and check:

```tsx
// At the top of the Sidebar function, after getting the session:
const sidebarUser = await prisma.user.findUnique({
  where: { id: session.user.agentUserId },
  select: { pcoPersonId: true },
});
const showAdmin = sidebarUser ? isSuperAdmin(sidebarUser.pcoPersonId) : false;
```

Then render:

```tsx
{showAdmin && (
  <Link
    href="/admin"
    className={cn(
      buttonVariants({ variant: 'ghost', size: 'sm' }),
      'w-full justify-start gap-2',
    )}
  >
    <Shield className="h-4 w-4" />
    Admin
  </Link>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(nav): add Billing and Admin nav items to sidebar

Billing link shows for all users with past_due warning dot for admins.
Admin link only visible to super-admins (SUPER_ADMIN_PCO_IDS)."
```

---

## Task 20: Reconciliation Route + Test Fixtures + Docs

**Files:**
- Create: `src/app/api/billing/reconcile/route.ts`
- Modify: `src/lib/env.ts` (already done in Task 4, verify)
- Modify: `tests/setup.ts` or test fixtures for billingExempt
- Modify: project documentation

- [ ] **Step 1: Create `src/app/api/billing/reconcile/route.ts`**

```typescript
// src/app/api/billing/reconcile/route.ts
import { getStripe } from '@/lib/billing/stripe';
import { getStripeCronSecret } from '@/lib/env';
import { isEventProcessed, markEventProcessed } from '@/lib/billing/queries';
import {
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from '@/lib/billing/webhook-handlers';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const HANDLED_EVENTS: Record<string, (event: import('stripe').default.Event) => Promise<void>> = {
  'checkout.session.completed': handleCheckoutCompleted,
  'customer.subscription.created': handleSubscriptionCreated,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
};

export async function POST(req: Request) {
  // Authenticate via cron secret header
  const cronSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== getStripeCronSecret()) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stripe = getStripe();
  const yesterday = Math.floor(Date.now() / 1000) - 86400;

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const events = await stripe.events.list({
      created: { gte: yesterday },
      limit: 100,
    });

    for (const event of events.data) {
      if (!(event.type in HANDLED_EVENTS)) continue;

      if (await isEventProcessed(event.id)) {
        skipped++;
        continue;
      }

      try {
        const handler = HANDLED_EVENTS[event.type];
        await handler(event);
        await markEventProcessed(event.id, event.type);
        processed++;
      } catch (err) {
        errors++;
        logger.error('[reconcile] Failed to process event', {
          eventId: event.id,
          type: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.error('[reconcile] Failed to list events', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: 'Reconciliation failed' }, { status: 500 });
  }

  logger.info('[reconcile] Complete', { processed, skipped, errors });
  return Response.json({ processed, skipped, errors });
}
```

- [ ] **Step 2: Add reconcile route to `isPublicRoute()` in `src/proxy.ts`**

Update the `isPublicRoute` function:

```typescript
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/api/billing/webhook') return true;
  if (pathname === '/api/billing/reconcile') return true;
  return false;
}
```

- [ ] **Step 3: Update test fixtures for billing compatibility**

Create a test helper that existing tests can use to set up billing-exempt orgs. Add to `tests/__mocks__/billing-fixtures.ts`:

```typescript
// tests/__mocks__/billing-fixtures.ts

/**
 * Default org billing overrides for existing tests.
 * Set billingExempt: true and testTier: 'pro' so existing tests
 * pass without hitting paywall or cap checks.
 */
export const TEST_ORG_BILLING_DEFAULTS = {
  subscriptionStatus: 'active',
  billingExempt: true,
  tier: 'starter',
  testTier: 'pro',
  trialCreditsUsed: 0,
  stripeCustomerId: null,
  subscriptionId: null,
  trialEndsAt: null,
  seatCount: 0,
} as const;
```

- [ ] **Step 4: Update `CLAUDE.md` with new environment variables**

Add to the Environment Variables section or Commands section of `CLAUDE.md`:

Add these to the project's env documentation (`.env.example` or similar):

```
# Stripe Billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CRON_SECRET=your-cron-secret
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_STANDARD_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...

# Master API Keys (app-provided)
ANTHROPIC_MASTER_API_KEY=sk-ant-...
OPENAI_MASTER_API_KEY=sk-...
GOOGLE_MASTER_API_KEY=...

# Super Admin
SUPER_ADMIN_PCO_IDS=12345,67890
```

- [ ] **Step 5: Update `CLAUDE.md` project structure**

Add the new directories to the project structure in `CLAUDE.md`:

```
  lib/
    billing/
      stripe.ts        — Stripe client singleton
      webhook-handlers.ts — one function per event type
      queries.ts       — getOrgBilling, updateSubscriptionStatus, etc.
      constants.ts     — active statuses, exempt routes, trial days
      tiers.ts         — TIER_CONFIGS, MODEL_CREDIT_RATES, computeCredits, effectiveTier
      usage.ts         — recordOrgUsage, getTodayUsage, getTodayCredits
      caps.ts          — checkBudget, resolveModelForTier, computeMaxOutputTokens
    admin/
      audit.ts         — logAdminAction helper
      queries.ts       — fleet queries for admin dashboards
      auth-guard.ts    — requireSuperAdmin() guard
```

- [ ] **Step 6: Run full test suite to verify nothing is broken**

```bash
npx vitest run
```

Expected: All tests pass. If any existing tests fail due to the new billing fields on Organization, update the test mocks to include the billing defaults from Step 3.

- [ ] **Step 7: Run lint and type check**

```bash
npm run lint
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/billing/reconcile/route.ts src/proxy.ts tests/__mocks__/billing-fixtures.ts CLAUDE.md
git commit -m "feat(billing): add reconciliation route, test fixtures, and documentation

POST /api/billing/reconcile: daily cron catches missed webhook events.
Test fixtures set billingExempt + testTier for backward compatibility.
Updated CLAUDE.md with new file structure and env vars."
```

---

## Summary of Environment Variables to Add

| Variable | Example Value | Required |
|----------|---------------|----------|
| `STRIPE_SECRET_KEY` | `sk_test_xxx` | Yes |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_xxx` | Yes |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxx` | Yes |
| `STRIPE_CRON_SECRET` | `random-secret` | Yes |
| `STRIPE_STARTER_PRICE_ID` | `price_xxx` | Yes |
| `STRIPE_STANDARD_PRICE_ID` | `price_xxx` | Yes |
| `STRIPE_PRO_PRICE_ID` | `price_xxx` | Yes |
| `ANTHROPIC_MASTER_API_KEY` | `sk-ant-xxx` | Yes |
| `OPENAI_MASTER_API_KEY` | `sk-xxx` | Yes |
| `GOOGLE_MASTER_API_KEY` | `AIzaSy...` | Yes |
| `SUPER_ADMIN_PCO_IDS` | `12345,67890` | Yes |

## npm Packages to Install

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

## Crontab Entry (Production)

```cron
0 1 * * * curl -s -H "x-cron-secret: $STRIPE_CRON_SECRET" -X POST https://your-app.com/api/billing/reconcile
```
