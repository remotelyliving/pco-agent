# Billing & Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe-based monthly subscription billing with per-org seat-based pricing, three-layer paywall enforcement, and read-only degradation for lapsed subscriptions.

**Architecture:** Stripe owns pricing, plans, trial logic, dunning, and invoicing. The app stores synced subscription status on the Organization model. Paywall enforcement is layered: proxy.ts redirect (UX), API route DB check (security), client-side UI degradation (UX). Webhooks with idempotency + daily reconciliation cron provide fault tolerance.

**Tech Stack:** Stripe Billing (`stripe` npm package), `@stripe/stripe-js`, `@stripe/react-stripe-js`, Prisma, Next.js App Router

**Spec:** [docs/superpowers/specs/2026-04-13-billing-subscription-design.md](../specs/2026-04-13-billing-subscription-design.md)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/billing/stripe.ts` | Stripe client singleton |
| `src/lib/billing/constants.ts` | Active statuses, exempt routes, billing helpers |
| `src/lib/billing/queries.ts` | DB queries for billing (get/update org billing state) |
| `src/lib/billing/webhook-handlers.ts` | Process each Stripe event type |
| `src/app/api/billing/checkout/route.ts` | Create Stripe Checkout Session |
| `src/app/api/billing/portal/route.ts` | Create Stripe Customer Portal session |
| `src/app/api/billing/seats/route.ts` | Update subscription seat quantity |
| `src/app/api/billing/webhook/route.ts` | Stripe webhook receiver |
| `src/app/api/billing/reconcile/route.ts` | Daily reconciliation endpoint |
| `src/app/(app)/billing/page.tsx` | Billing page |
| `src/components/billing/billing-status.tsx` | Plan status + seat display |
| `src/components/billing/checkout-form.tsx` | Stripe Embedded Checkout wrapper |
| `src/components/billing/seat-manager.tsx` | Seat count + update (admin) |
| `src/components/billing/subscription-banner.tsx` | Warning/degradation banners |
| `tests/lib/billing/constants.test.ts` | Tests for billing helpers |
| `tests/lib/billing/queries.test.ts` | Tests for billing DB queries |
| `tests/lib/billing/webhook-handlers.test.ts` | Tests for webhook event processing |
| `tests/api/billing/webhook.test.ts` | Tests for webhook route |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add billing fields to Organization, SubscriptionStatus enum, StripeEvent model |
| `src/lib/auth.ts` | Add subscriptionStatus + billingExempt to JWT/session, sync on 15-min cadence |
| `src/lib/env.ts` | Add Stripe env var helpers |
| `src/proxy.ts` | Add subscription check after auth, add billing routes to public/exempt lists |
| `src/components/sidebar.tsx` | Add Billing nav link |
| `src/components/chat/chat-interface.tsx` | Disable input when subscription inactive, show degradation banner |
| `src/app/api/chat/route.ts` | Add subscription hard check |

---

## Task 1: Prisma Schema — Billing Fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SubscriptionStatus enum to schema**

In `prisma/schema.prisma`, after the existing `UserRole` enum (around line 17), add:

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

- [ ] **Step 2: Add billing fields to Organization model**

In the `Organization` model (around line 55), add these fields after `createdAt`:

```prisma
  stripeCustomerId    String?              @unique @map("stripe_customer_id")
  subscriptionId      String?              @unique @map("subscription_id")
  subscriptionStatus  SubscriptionStatus   @default(none) @map("subscription_status")
  seatCount           Int                  @default(0) @map("seat_count")
  billingExempt       Boolean              @default(false) @map("billing_exempt")
  trialEndsAt         DateTime?            @map("trial_ends_at")
```

- [ ] **Step 3: Add StripeEvent model**

After the `File` model (at the end of the schema), add:

```prisma
model StripeEvent {
  id          String   @id // Stripe event ID (evt_xxx)
  type        String
  processedAt DateTime @default(now()) @map("processed_at")

  @@map("stripe_events")
  @@schema("agent")
}
```

- [ ] **Step 4: Push schema to database**

Run: `npx prisma db push`
Expected: Schema changes applied successfully. Prisma Client regenerated.

- [ ] **Step 5: Verify Prisma Client types**

Run: `npx prisma generate`
Expected: Prisma Client generated with `SubscriptionStatus` enum and `StripeEvent` model.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(billing): add subscription status, billing fields, and StripeEvent model to schema"
```

---

## Task 2: Billing Constants & Helpers

**Files:**
- Create: `src/lib/billing/constants.ts`
- Test: `tests/lib/billing/constants.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/billing/constants.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isActiveSubscription,
  isBillingRoute,
  BILLING_EXEMPT_ROUTES,
} from '@/lib/billing/constants';

describe('isActiveSubscription', () => {
  it('returns true for active', () => {
    expect(isActiveSubscription('active')).toBe(true);
  });
  it('returns true for trialing', () => {
    expect(isActiveSubscription('trialing')).toBe(true);
  });
  it('returns true for past_due (grace period)', () => {
    expect(isActiveSubscription('past_due')).toBe(true);
  });
  it('returns false for canceled', () => {
    expect(isActiveSubscription('canceled')).toBe(false);
  });
  it('returns false for unpaid', () => {
    expect(isActiveSubscription('unpaid')).toBe(false);
  });
  it('returns false for none', () => {
    expect(isActiveSubscription('none')).toBe(false);
  });
  it('returns false for incomplete', () => {
    expect(isActiveSubscription('incomplete')).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isActiveSubscription(undefined)).toBe(false);
  });
  it('returns false for null', () => {
    expect(isActiveSubscription(null)).toBe(false);
  });
});

describe('isBillingRoute', () => {
  it('returns true for /billing', () => {
    expect(isBillingRoute('/billing')).toBe(true);
  });
  it('returns true for /api/billing/checkout', () => {
    expect(isBillingRoute('/api/billing/checkout')).toBe(true);
  });
  it('returns true for /api/billing/webhook', () => {
    expect(isBillingRoute('/api/billing/webhook')).toBe(true);
  });
  it('returns true for /settings', () => {
    expect(isBillingRoute('/settings')).toBe(true);
  });
  it('returns true for /api/settings', () => {
    expect(isBillingRoute('/api/settings')).toBe(true);
  });
  it('returns false for /chat', () => {
    expect(isBillingRoute('/chat')).toBe(false);
  });
  it('returns false for /api/chat', () => {
    expect(isBillingRoute('/api/chat')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/billing/constants.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement constants module**

Create `src/lib/billing/constants.ts`:

```typescript
import type { SubscriptionStatus } from '@prisma/client';

const ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
]);

export function isActiveSubscription(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  return ACTIVE_STATUSES.has(status as SubscriptionStatus);
}

export const BILLING_EXEMPT_ROUTES = [
  '/billing',
  '/api/billing',
  '/settings',
  '/api/settings',
] as const;

export function isBillingRoute(pathname: string): boolean {
  return BILLING_EXEMPT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );
}

export const TRIAL_PERIOD_DAYS = 14;
export const INCLUDED_SEATS = 3;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/billing/constants.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/constants.ts tests/lib/billing/constants.test.ts
git commit -m "feat(billing): add subscription status helpers and billing route constants"
```

---

## Task 3: Stripe Client Singleton & Env Vars

**Files:**
- Create: `src/lib/billing/stripe.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Install Stripe packages**

Run: `npm install stripe @stripe/stripe-js @stripe/react-stripe-js`

- [ ] **Step 2: Add Stripe env helpers to env.ts**

In `src/lib/env.ts`, add after the existing `getLogLevel` function (line 22):

```typescript
export function getStripeSecretKey(): string {
  return getRequired('STRIPE_SECRET_KEY');
}

export function getStripeWebhookSecret(): string {
  return getRequired('STRIPE_WEBHOOK_SECRET');
}

export function getStripeCronSecret(): string {
  return getRequired('STRIPE_CRON_SECRET');
}
```

Note: Do NOT add these to `validateEnv()` — Stripe keys are optional (billing can be disabled). They fail fast when accessed via `getRequired` at call time.

- [ ] **Step 3: Create Stripe client singleton**

Create `src/lib/billing/stripe.ts`:

```typescript
import Stripe from 'stripe';
import { getStripeSecretKey } from '@/lib/env';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecretKey(), {
      apiVersion: '2025-03-31.basil',
      typescript: true,
    });
  }
  return stripeInstance;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/stripe.ts src/lib/env.ts package.json package-lock.json
git commit -m "feat(billing): add Stripe client singleton and env var helpers"
```

---

## Task 4: Billing DB Queries

**Files:**
- Create: `src/lib/billing/queries.ts`
- Test: `tests/lib/billing/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/billing/queries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrgBilling, updateSubscriptionStatus, recordStripeEvent, isEventProcessed } from '@/lib/billing/queries';

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
    user: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockOrg = {
  id: 'org-1',
  stripeCustomerId: 'cus_xxx',
  subscriptionId: 'sub_xxx',
  subscriptionStatus: 'active' as const,
  seatCount: 5,
  billingExempt: false,
  trialEndsAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOrgBilling', () => {
  it('returns billing fields for an org', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as never);
    const result = await getOrgBilling('org-1');
    expect(result).toEqual(mockOrg);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: {
        id: true,
        stripeCustomerId: true,
        subscriptionId: true,
        subscriptionStatus: true,
        seatCount: true,
        billingExempt: true,
        trialEndsAt: true,
      },
    });
  });

  it('returns null for unknown org', async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null as never);
    const result = await getOrgBilling('unknown');
    expect(result).toBeNull();
  });
});

describe('updateSubscriptionStatus', () => {
  it('updates org billing fields', async () => {
    vi.mocked(prisma.organization.update).mockResolvedValue(mockOrg as never);
    await updateSubscriptionStatus('org-1', {
      subscriptionStatus: 'trialing',
      seatCount: 3,
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { subscriptionStatus: 'trialing', seatCount: 3 },
    });
  });
});

describe('isEventProcessed', () => {
  it('returns true if event exists', async () => {
    vi.mocked(prisma.stripeEvent.findUnique).mockResolvedValue({ id: 'evt_1', type: 'test', processedAt: new Date() } as never);
    expect(await isEventProcessed('evt_1')).toBe(true);
  });

  it('returns false if event does not exist', async () => {
    vi.mocked(prisma.stripeEvent.findUnique).mockResolvedValue(null as never);
    expect(await isEventProcessed('evt_2')).toBe(false);
  });
});

describe('recordStripeEvent', () => {
  it('creates a stripe event record', async () => {
    vi.mocked(prisma.stripeEvent.create).mockResolvedValue({ id: 'evt_1', type: 'checkout.session.completed', processedAt: new Date() } as never);
    await recordStripeEvent('evt_1', 'checkout.session.completed');
    expect(prisma.stripeEvent.create).toHaveBeenCalledWith({
      data: { id: 'evt_1', type: 'checkout.session.completed' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/billing/queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement queries module**

Create `src/lib/billing/queries.ts`:

```typescript
import { prisma } from '@/lib/db';
import type { SubscriptionStatus } from '@prisma/client';

const BILLING_SELECT = {
  id: true,
  stripeCustomerId: true,
  subscriptionId: true,
  subscriptionStatus: true,
  seatCount: true,
  billingExempt: true,
  trialEndsAt: true,
} as const;

export type OrgBilling = {
  id: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  seatCount: number;
  billingExempt: boolean;
  trialEndsAt: Date | null;
};

export async function getOrgBilling(orgId: string): Promise<OrgBilling | null> {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: BILLING_SELECT,
  });
}

export async function updateSubscriptionStatus(
  orgId: string,
  data: Partial<{
    stripeCustomerId: string;
    subscriptionId: string;
    subscriptionStatus: SubscriptionStatus;
    seatCount: number;
    trialEndsAt: Date | null;
  }>,
): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data,
  });
}

export async function getOrgByStripeCustomerId(
  stripeCustomerId: string,
): Promise<OrgBilling | null> {
  return prisma.organization.findFirst({
    where: { stripeCustomerId },
    select: BILLING_SELECT,
  });
}

export async function getOrgUserCount(orgId: string): Promise<number> {
  return prisma.user.count({ where: { orgId } });
}

export async function getOrgAdminNames(orgId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { orgId, role: 'admin' },
    select: { name: true },
    take: 3,
  });
  return admins.map((a) => a.name).filter((n): n is string => n !== null);
}

export async function isEventProcessed(eventId: string): Promise<boolean> {
  const event = await prisma.stripeEvent.findUnique({
    where: { id: eventId },
  });
  return event !== null;
}

export async function recordStripeEvent(
  eventId: string,
  eventType: string,
): Promise<void> {
  await prisma.stripeEvent.create({
    data: { id: eventId, type: eventType },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/billing/queries.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/queries.ts tests/lib/billing/queries.test.ts
git commit -m "feat(billing): add billing DB query helpers with tests"
```

---

## Task 5: Webhook Event Handlers

**Files:**
- Create: `src/lib/billing/webhook-handlers.ts`
- Test: `tests/lib/billing/webhook-handlers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/billing/webhook-handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhookEvent } from '@/lib/billing/webhook-handlers';

vi.mock('@/lib/billing/queries', () => ({
  getOrgByStripeCustomerId: vi.fn(),
  updateSubscriptionStatus: vi.fn(),
  isEventProcessed: vi.fn(),
  recordStripeEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      update: vi.fn(),
    },
  },
}));

import {
  getOrgByStripeCustomerId,
  updateSubscriptionStatus,
  isEventProcessed,
  recordStripeEvent,
} from '@/lib/billing/queries';
import { prisma } from '@/lib/db';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEventProcessed).mockResolvedValue(false);
  vi.mocked(recordStripeEvent).mockResolvedValue(undefined);
});

describe('handleWebhookEvent', () => {
  it('skips already-processed events', async () => {
    vi.mocked(isEventProcessed).mockResolvedValue(true);
    const result = await handleWebhookEvent({
      id: 'evt_dup',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_xxx' } },
    } as never);
    expect(result).toEqual({ processed: false, reason: 'duplicate' });
    expect(updateSubscriptionStatus).not.toHaveBeenCalled();
  });

  it('handles checkout.session.completed — links customer to org', async () => {
    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'org-1',
          customer: 'cus_new',
          subscription: 'sub_new',
        },
      },
    };
    const result = await handleWebhookEvent(event as never);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: {
        stripeCustomerId: 'cus_new',
        subscriptionId: 'sub_new',
      },
    });
    expect(recordStripeEvent).toHaveBeenCalledWith('evt_1', 'checkout.session.completed');
    expect(result).toEqual({ processed: true });
  });

  it('handles customer.subscription.updated — updates status and seats', async () => {
    vi.mocked(getOrgByStripeCustomerId).mockResolvedValue({
      id: 'org-1',
      stripeCustomerId: 'cus_xxx',
      subscriptionId: 'sub_xxx',
      subscriptionStatus: 'trialing',
      seatCount: 3,
      billingExempt: false,
      trialEndsAt: null,
    });
    const event = {
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_xxx',
          status: 'active',
          items: { data: [{ quantity: 5 }] },
          trial_end: null,
        },
      },
    };
    const result = await handleWebhookEvent(event as never);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', {
      subscriptionStatus: 'active',
      seatCount: 5,
      trialEndsAt: null,
    });
    expect(result).toEqual({ processed: true });
  });

  it('handles customer.subscription.deleted — sets canceled', async () => {
    vi.mocked(getOrgByStripeCustomerId).mockResolvedValue({
      id: 'org-1',
      stripeCustomerId: 'cus_xxx',
      subscriptionId: 'sub_xxx',
      subscriptionStatus: 'active',
      seatCount: 5,
      billingExempt: false,
      trialEndsAt: null,
    });
    const event = {
      id: 'evt_3',
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_xxx' } },
    };
    const result = await handleWebhookEvent(event as never);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', {
      subscriptionStatus: 'canceled',
    });
    expect(result).toEqual({ processed: true });
  });

  it('handles invoice.paid — sets active', async () => {
    vi.mocked(getOrgByStripeCustomerId).mockResolvedValue({
      id: 'org-1',
      stripeCustomerId: 'cus_xxx',
      subscriptionId: 'sub_xxx',
      subscriptionStatus: 'past_due',
      seatCount: 5,
      billingExempt: false,
      trialEndsAt: null,
    });
    const event = {
      id: 'evt_4',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_xxx' } },
    };
    const result = await handleWebhookEvent(event as never);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', {
      subscriptionStatus: 'active',
    });
    expect(result).toEqual({ processed: true });
  });

  it('handles invoice.payment_failed — sets past_due', async () => {
    vi.mocked(getOrgByStripeCustomerId).mockResolvedValue({
      id: 'org-1',
      stripeCustomerId: 'cus_xxx',
      subscriptionId: 'sub_xxx',
      subscriptionStatus: 'active',
      seatCount: 5,
      billingExempt: false,
      trialEndsAt: null,
    });
    const event = {
      id: 'evt_5',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_xxx' } },
    };
    const result = await handleWebhookEvent(event as never);
    expect(updateSubscriptionStatus).toHaveBeenCalledWith('org-1', {
      subscriptionStatus: 'past_due',
    });
    expect(result).toEqual({ processed: true });
  });

  it('returns unhandled for unknown event types', async () => {
    const result = await handleWebhookEvent({
      id: 'evt_6',
      type: 'some.unknown.event',
      data: { object: {} },
    } as never);
    expect(result).toEqual({ processed: false, reason: 'unhandled_type' });
    expect(recordStripeEvent).not.toHaveBeenCalled();
  });

  it('returns not_found when org lookup fails for subscription event', async () => {
    vi.mocked(getOrgByStripeCustomerId).mockResolvedValue(null);
    const result = await handleWebhookEvent({
      id: 'evt_7',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_unknown' } },
    } as never);
    expect(result).toEqual({ processed: false, reason: 'org_not_found' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/billing/webhook-handlers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement webhook handlers**

Create `src/lib/billing/webhook-handlers.ts`:

```typescript
import type Stripe from 'stripe';
import type { SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  getOrgByStripeCustomerId,
  updateSubscriptionStatus,
  isEventProcessed,
  recordStripeEvent,
} from '@/lib/billing/queries';

type WebhookResult =
  | { processed: true }
  | { processed: false; reason: 'duplicate' | 'unhandled_type' | 'org_not_found' | 'missing_ref' };

const STRIPE_TO_DB_STATUS: Record<string, SubscriptionStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'unpaid',
  canceled: 'canceled',
  incomplete: 'incomplete',
  paused: 'paused',
  incomplete_expired: 'canceled',
};

export async function handleWebhookEvent(
  event: Stripe.Event,
): Promise<WebhookResult> {
  // Idempotency check
  if (await isEventProcessed(event.id)) {
    return { processed: false, reason: 'duplicate' };
  }

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionChange(event);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event);
    case 'invoice.paid':
      return handleInvoicePaid(event);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event);
    default:
      return { processed: false, reason: 'unhandled_type' };
  }
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
): Promise<WebhookResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.client_reference_id;
  if (!orgId) {
    return { processed: false, reason: 'missing_ref' };
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeCustomerId: session.customer as string,
      subscriptionId: session.subscription as string,
    },
  });

  await recordStripeEvent(event.id, event.type);
  return { processed: true };
}

async function handleSubscriptionChange(
  event: Stripe.Event,
): Promise<WebhookResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const org = await getOrgByStripeCustomerId(subscription.customer as string);
  if (!org) return { processed: false, reason: 'org_not_found' };

  const status = STRIPE_TO_DB_STATUS[subscription.status] ?? 'none';
  const seatCount = subscription.items.data[0]?.quantity ?? org.seatCount;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  await updateSubscriptionStatus(org.id, {
    subscriptionStatus: status,
    seatCount,
    trialEndsAt: trialEnd,
  });

  await recordStripeEvent(event.id, event.type);
  return { processed: true };
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
): Promise<WebhookResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const org = await getOrgByStripeCustomerId(subscription.customer as string);
  if (!org) return { processed: false, reason: 'org_not_found' };

  await updateSubscriptionStatus(org.id, {
    subscriptionStatus: 'canceled',
  });

  await recordStripeEvent(event.id, event.type);
  return { processed: true };
}

async function handleInvoicePaid(
  event: Stripe.Event,
): Promise<WebhookResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const org = await getOrgByStripeCustomerId(invoice.customer as string);
  if (!org) return { processed: false, reason: 'org_not_found' };

  await updateSubscriptionStatus(org.id, {
    subscriptionStatus: 'active',
  });

  await recordStripeEvent(event.id, event.type);
  return { processed: true };
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
): Promise<WebhookResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const org = await getOrgByStripeCustomerId(invoice.customer as string);
  if (!org) return { processed: false, reason: 'org_not_found' };

  await updateSubscriptionStatus(org.id, {
    subscriptionStatus: 'past_due',
  });

  await recordStripeEvent(event.id, event.type);
  return { processed: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/billing/webhook-handlers.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/webhook-handlers.ts tests/lib/billing/webhook-handlers.test.ts
git commit -m "feat(billing): add Stripe webhook event handlers with tests"
```

---

## Task 6: Webhook API Route

**Files:**
- Create: `src/app/api/billing/webhook/route.ts`
- Test: `tests/api/billing/webhook.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/billing/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/billing/stripe', () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/billing/webhook-handlers', () => ({
  handleWebhookEvent: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  getStripeWebhookSecret: vi.fn(() => 'whsec_test'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })) },
}));

vi.mock('@/lib/request-context', () => ({
  getRequestId: vi.fn(() => Promise.resolve('req-123')),
}));

import { POST } from '@/app/api/billing/webhook/route';
import { getStripe } from '@/lib/billing/stripe';
import { handleWebhookEvent } from '@/lib/billing/webhook-handlers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/billing/webhook', () => {
  it('returns 400 if signature is missing', async () => {
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 if signature verification fails', async () => {
    const stripe = getStripe();
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 'bad_sig' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 and processes valid event', async () => {
    const mockEvent = { id: 'evt_1', type: 'invoice.paid', data: { object: {} } };
    const stripe = getStripe();
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);
    vi.mocked(handleWebhookEvent).mockResolvedValue({ processed: true });

    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(mockEvent),
      headers: { 'stripe-signature': 'valid_sig' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(handleWebhookEvent).toHaveBeenCalledWith(mockEvent);
  });

  it('returns 200 for duplicate events', async () => {
    const mockEvent = { id: 'evt_dup', type: 'invoice.paid', data: { object: {} } };
    const stripe = getStripe();
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);
    vi.mocked(handleWebhookEvent).mockResolvedValue({ processed: false, reason: 'duplicate' });

    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(mockEvent),
      headers: { 'stripe-signature': 'valid_sig' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/billing/webhook.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement webhook route**

Create `src/app/api/billing/webhook/route.ts`:

```typescript
import { getStripe } from '@/lib/billing/stripe';
import { getStripeWebhookSecret } from '@/lib/env';
import { handleWebhookEvent } from '@/lib/billing/webhook-handlers';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await req.text();
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    log.error('[billing/webhook] Signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  log.info('[billing/webhook] Received event', {
    eventId: event.id,
    type: event.type,
  });

  try {
    const result = await handleWebhookEvent(event);
    log.info('[billing/webhook] Event processed', {
      eventId: event.id,
      ...result,
    });
    return Response.json({ received: true }, { status: 200 });
  } catch (err) {
    log.error('[billing/webhook] Handler error', {
      eventId: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: 'Processing failed' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/billing/webhook.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/webhook/route.ts tests/api/billing/webhook.test.ts
git commit -m "feat(billing): add Stripe webhook API route with signature verification"
```

---

## Task 7: Auth — Add Subscription Status to JWT/Session

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add billing fields to JWT interface**

In `src/lib/auth.ts`, update the `JWT` interface (around line 24) to add:

```typescript
subscriptionStatus?: string;
billingExempt?: boolean;
```

- [ ] **Step 2: Add billing fields to Session interface**

In `src/lib/auth.ts`, update the `Session` interface's `user` object (around line 12) to add:

```typescript
subscriptionStatus?: string;
billingExempt?: boolean;
```

- [ ] **Step 3: Set billing fields on initial login**

In the `jwt` callback, inside the `if (user && account)` block where initial token fields are set, add after the `token.role` assignment:

```typescript
// Fetch billing status for initial login
try {
  const org = await prisma.organization.findUnique({
    where: { id: token.orgId as string },
    select: { subscriptionStatus: true, billingExempt: true },
  });
  if (org) {
    token.subscriptionStatus = org.subscriptionStatus;
    token.billingExempt = org.billingExempt;
  }
} catch {
  // Non-fatal — will sync on next check
}
```

- [ ] **Step 4: Sync billing status alongside role every 15 minutes**

In the role re-sync block (around line 240-260), expand the DB query and token updates. Replace the existing role sync block:

```typescript
// Re-sync role and billing status from DB every 15 minutes
if (!user && token.agentUserId) {
  const now2 = Math.floor(Date.now() / 1000);
  const lastCheck = (token.roleCheckedAt as number) ?? 0;
  if (now2 - lastCheck > 900) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: token.agentUserId as string },
        select: { role: true, org: { select: { subscriptionStatus: true, billingExempt: true } } },
      });
      if (dbUser) {
        token.role = dbUser.role;
        token.subscriptionStatus = dbUser.org.subscriptionStatus;
        token.billingExempt = dbUser.org.billingExempt;
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

- [ ] **Step 5: Pass billing fields through session callback**

In the `session` callback (around line 264), add billing fields to the user object:

```typescript
async session({ session, token }) {
  return {
    ...session,
    user: {
      ...session.user,
      agentUserId: (token.agentUserId as string) ?? '',
      orgId: (token.orgId as string) ?? '',
      role: (token.role as string) ?? 'member',
      subscriptionStatus: (token.subscriptionStatus as string) ?? 'none',
      billingExempt: (token.billingExempt as boolean) ?? false,
    },
    pcoAccessToken: token.pcoAccessToken as string | undefined,
    pcoRefreshToken: token.pcoRefreshToken as string | undefined,
  };
},
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(billing): add subscription status and billingExempt to JWT/session with 15-min sync"
```

---

## Task 8: Proxy — Paywall Enforcement (Layer 1)

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Import billing helpers**

At the top of `src/proxy.ts`, add import:

```typescript
import { isActiveSubscription, isBillingRoute } from '@/lib/billing/constants';
```

- [ ] **Step 2: Add webhook to public routes**

In the `isPublicRoute` function (around line 28), add webhook route:

```typescript
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/api/billing/webhook') return true;
  return false;
}
```

- [ ] **Step 3: Add billing rate limits**

In the `RATE_LIMITS` object (around line 9), add:

```typescript
'/api/billing/checkout': 10,
'/api/billing/portal': 10,
'/api/billing/seats': 10,
'/api/billing/reconcile': 5,
```

- [ ] **Step 4: Add normalizeRoute pattern for billing**

In the `normalizeRoute` function (around line 38), add before the final `return pathname`:

```typescript
if (/^\/api\/billing\/[^/]+$/.test(pathname)) return '/api/billing/:action';
```

- [ ] **Step 5: Add subscription check after auth**

In the `export default auth((req) => {` handler, after the rate limiting block (around line 101) and before the response creation (line 104), add the subscription paywall check:

```typescript
  // --- Subscription paywall for API routes ---
  if (pathname.startsWith('/api/') && !isPublic) {
    const status = req.auth?.user?.subscriptionStatus;
    const exempt = req.auth?.user?.billingExempt;
    if (!exempt && !isBillingRoute(pathname) && !isActiveSubscription(status)) {
      return Response.json(
        { error: "Your church's subscription isn't active. Ask your admin to visit the Billing page to get started." },
        { status: 403 },
      );
    }
  }

  // --- Subscription paywall for page routes ---
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next')) {
    const status = req.auth?.user?.subscriptionStatus;
    const exempt = req.auth?.user?.billingExempt;
    if (!exempt && !isBillingRoute(pathname) && !isActiveSubscription(status)) {
      return NextResponse.redirect(new URL('/billing', req.url));
    }
  }
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(billing): add subscription paywall to proxy (layer 1 — UX redirect)"
```

---

## Task 9: Chat Route — Subscription Hard Check (Layer 2)

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add subscription check after auth**

In `src/app/api/chat/route.ts`, after the auth check (around line 48-50), add the subscription hard check:

```typescript
  // 1b. Subscription check (hard gate — verifies from DB, not JWT)
  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { subscriptionStatus: true, billingExempt: true },
  });
  if (
    org &&
    !org.billingExempt &&
    !['active', 'trialing', 'past_due'].includes(org.subscriptionStatus)
  ) {
    return Response.json(
      { error: "Your church's subscription isn't active. Ask your admin to visit the Billing page to get started." },
      { status: 403 },
    );
  }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(billing): add subscription hard check to chat route (layer 2 — security gate)"
```

---

## Task 10: Billing API Routes (Checkout, Portal, Seats)

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/portal/route.ts`
- Create: `src/app/api/billing/seats/route.ts`

- [ ] **Step 1: Create checkout route**

Create `src/app/api/billing/checkout/route.ts`:

```typescript
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getStripe } from '@/lib/billing/stripe';
import { getOrgBilling, getOrgUserCount } from '@/lib/billing/queries';
import { INCLUDED_SEATS, TRIAL_PERIOD_DAYS } from '@/lib/billing/constants';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return Response.json({ error: 'Only admins can manage billing.' }, { status: 403 });
  }

  try {
    const orgId = session.user.orgId;
    const billing = await getOrgBilling(orgId);
    if (!billing) {
      return Response.json({ error: 'Organization not found.' }, { status: 404 });
    }
    if (billing.subscriptionId) {
      return Response.json({ error: 'Organization already has an active subscription.' }, { status: 400 });
    }

    const { priceId } = (await req.json()) as { priceId: string };
    if (!priceId) {
      return Response.json({ error: 'Price ID is required.' }, { status: 400 });
    }

    const userCount = await getOrgUserCount(orgId);
    const extraSeats = Math.max(0, userCount - INCLUDED_SEATS);

    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: orgId,
      customer_email: session.user.email ?? undefined,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
      },
      line_items: [
        { price: priceId, quantity: 1 },
        ...(extraSeats > 0
          ? [{ price: process.env.STRIPE_SEAT_PRICE_ID!, quantity: extraSeats }]
          : []),
      ],
      ui_mode: 'embedded',
      return_url: `${req.headers.get('origin')}/billing?session_id={CHECKOUT_SESSION_ID}`,
    });

    log.info('[billing/checkout] Session created', {
      orgId,
      sessionId: checkoutSession.id,
    });

    return Response.json({ clientSecret: checkoutSession.client_secret });
  } catch (error) {
    log.error('[billing/checkout] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create portal route**

Create `src/app/api/billing/portal/route.ts`:

```typescript
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getStripe } from '@/lib/billing/stripe';
import { getOrgBilling } from '@/lib/billing/queries';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return Response.json({ error: 'Only admins can manage billing.' }, { status: 403 });
  }

  try {
    const billing = await getOrgBilling(session.user.orgId);
    if (!billing?.stripeCustomerId) {
      return Response.json({ error: 'No billing account found. Please subscribe first.' }, { status: 400 });
    }

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${req.headers.get('origin')}/billing`,
    });

    log.info('[billing/portal] Portal session created', {
      orgId: session.user.orgId,
    });

    return Response.json({ url: portalSession.url });
  } catch (error) {
    log.error('[billing/portal] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Failed to create portal session.' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create seats route**

Create `src/app/api/billing/seats/route.ts`:

```typescript
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getStripe } from '@/lib/billing/stripe';
import { getOrgBilling, getOrgUserCount } from '@/lib/billing/queries';
import { INCLUDED_SEATS } from '@/lib/billing/constants';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return Response.json({ error: 'Only admins can manage billing.' }, { status: 403 });
  }

  try {
    const billing = await getOrgBilling(session.user.orgId);
    if (!billing?.subscriptionId) {
      return Response.json({ error: 'No active subscription found.' }, { status: 400 });
    }

    const userCount = await getOrgUserCount(session.user.orgId);
    const newSeatQuantity = Math.max(0, userCount - INCLUDED_SEATS);

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(billing.subscriptionId);

    // Find the seat line item (second item — first is the base plan)
    const seatItem = subscription.items.data[1];
    if (seatItem) {
      await stripe.subscriptions.update(billing.subscriptionId, {
        items: [{ id: seatItem.id, quantity: newSeatQuantity }],
        proration_behavior: 'create_prorations',
      });
    } else if (newSeatQuantity > 0) {
      // No seat line item yet — add one
      await stripe.subscriptions.update(billing.subscriptionId, {
        items: [{ price: process.env.STRIPE_SEAT_PRICE_ID!, quantity: newSeatQuantity }],
        proration_behavior: 'create_prorations',
      });
    }

    log.info('[billing/seats] Seats updated', {
      orgId: session.user.orgId,
      userCount,
      newSeatQuantity,
    });

    return Response.json({ success: true, userCount, seatQuantity: newSeatQuantity });
  } catch (error) {
    log.error('[billing/seats] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Failed to update seats.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/checkout/route.ts src/app/api/billing/portal/route.ts src/app/api/billing/seats/route.ts
git commit -m "feat(billing): add checkout, portal, and seats API routes"
```

---

## Task 11: Reconciliation Route

**Files:**
- Create: `src/app/api/billing/reconcile/route.ts`

- [ ] **Step 1: Implement reconciliation route**

Create `src/app/api/billing/reconcile/route.ts`:

```typescript
import { getStripe } from '@/lib/billing/stripe';
import { getStripeCronSecret } from '@/lib/env';
import { handleWebhookEvent } from '@/lib/billing/webhook-handlers';
import { isEventProcessed } from '@/lib/billing/queries';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  // Authenticate via shared secret (not session — called by cron)
  const cronSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== getStripeCronSecret()) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const stripe = getStripe();
    const yesterday = Math.floor(Date.now() / 1000) - 86400;

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const events = await stripe.events.list({
        created: { gte: yesterday },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const event of events.data) {
        if (await isEventProcessed(event.id)) {
          skipped++;
          continue;
        }

        try {
          const result = await handleWebhookEvent(event);
          if (result.processed) processed++;
          else skipped++;
        } catch (err) {
          failed++;
          log.error('[billing/reconcile] Event processing failed', {
            eventId: event.id,
            type: event.type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      hasMore = events.has_more;
      if (events.data.length > 0) {
        startingAfter = events.data[events.data.length - 1].id;
      }
    }

    log.info('[billing/reconcile] Completed', { processed, skipped, failed });
    return Response.json({ processed, skipped, failed });
  } catch (error) {
    log.error('[billing/reconcile] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Reconciliation failed.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/billing/reconcile/route.ts
git commit -m "feat(billing): add daily reconciliation cron endpoint"
```

---

## Task 12: Subscription Banner Component

**Files:**
- Create: `src/components/billing/subscription-banner.tsx`

- [ ] **Step 1: Create the banner component**

Create `src/components/billing/subscription-banner.tsx`:

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';

export function SubscriptionBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  if (!session?.user) return null;
  const { subscriptionStatus, billingExempt, role } = session.user as {
    subscriptionStatus?: string;
    billingExempt?: boolean;
    role?: string;
  };

  if (billingExempt) return null;
  if (dismissed) return null;

  // past_due — admin-only warning
  if (subscriptionStatus === 'past_due' && role === 'admin') {
    return (
      <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="alert">
        <p>
          There&apos;s an issue with your payment. Update your billing to avoid interruption.{' '}
          <Link href="/billing" className="font-medium underline">
            Go to Billing
          </Link>
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 shrink-0 min-h-[44px] min-w-[44px] px-2 font-medium text-amber-600 hover:text-amber-800"
          aria-label="Dismiss billing warning"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // canceled / unpaid / none — read-only message for all users
  if (
    subscriptionStatus === 'canceled' ||
    subscriptionStatus === 'unpaid' ||
    subscriptionStatus === 'none' ||
    !subscriptionStatus
  ) {
    return (
      <div className="mx-4 mb-2 rounded-lg bg-gray-100 p-4 text-sm text-gray-700" role="alert">
        <p className="font-medium">Your subscription has ended.</p>
        <p className="mt-1">
          You can still view your conversations.{' '}
          {role === 'admin' ? (
            <Link href="/billing" className="font-medium text-blue-600 underline">
              Resubscribe
            </Link>
          ) : (
            'Contact your admin to resubscribe.'
          )}
        </p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/billing/subscription-banner.tsx
git commit -m "feat(billing): add subscription warning and degradation banner component"
```

---

## Task 13: Chat Interface — Read-Only Degradation (Layer 3)

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Import banner and add subscription check**

In `src/components/chat/chat-interface.tsx`, add import at the top:

```typescript
import { SubscriptionBanner } from '@/components/billing/subscription-banner';
import { useSession } from 'next-auth/react';
```

- [ ] **Step 2: Add subscription status check inside ChatInterface**

Inside the `ChatInterface` component, add after the existing state declarations (around line 110):

```typescript
const { data: sessionData } = useSession();
const subscriptionActive = (() => {
  const user = sessionData?.user as { subscriptionStatus?: string; billingExempt?: boolean } | undefined;
  if (user?.billingExempt) return true;
  const status = user?.subscriptionStatus;
  return status === 'active' || status === 'trialing' || status === 'past_due';
})();
```

- [ ] **Step 3: Add banner before the form**

In the JSX, add the `<SubscriptionBanner />` right before the `<form>` tag (around line 314):

```typescript
      <SubscriptionBanner />

      <form onSubmit={handleSubmit} className="border-t p-4">
```

- [ ] **Step 4: Disable form when subscription is inactive**

Update the Textarea and Button to be disabled when subscription is inactive. In the Textarea (around line 326), change:

```typescript
disabled={isStreaming}
```

to:

```typescript
disabled={isStreaming || !subscriptionActive}
```

Update the send button disabled prop similarly:

```typescript
disabled={isStreaming || uploading || !subscriptionActive}
```

Update the file attach button similarly:

```typescript
disabled={isStreaming || !subscriptionActive}
```

- [ ] **Step 5: Update the Textarea placeholder when inactive**

Change the placeholder to be dynamic:

```typescript
placeholder={subscriptionActive ? "Ask about your church data..." : "Subscription required to send messages"}
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/chat-interface.tsx
git commit -m "feat(billing): disable chat input and show banner when subscription inactive (layer 3)"
```

---

## Task 14: Billing Page & Components

**Files:**
- Create: `src/app/(app)/billing/page.tsx`
- Create: `src/components/billing/billing-status.tsx`
- Create: `src/components/billing/checkout-form.tsx`
- Create: `src/components/billing/seat-manager.tsx`

- [ ] **Step 1: Create billing status component**

Create `src/components/billing/billing-status.tsx`:

```typescript
import type { SubscriptionStatus } from '@prisma/client';

const STATUS_LABELS: Record<SubscriptionStatus, { label: string; color: string }> = {
  none: { label: 'No subscription', color: 'text-gray-500' },
  trialing: { label: 'Free trial', color: 'text-blue-600' },
  active: { label: 'Active', color: 'text-green-600' },
  past_due: { label: 'Payment issue', color: 'text-amber-600' },
  unpaid: { label: 'Unpaid', color: 'text-red-600' },
  canceled: { label: 'Canceled', color: 'text-gray-500' },
  incomplete: { label: 'Incomplete', color: 'text-amber-600' },
  paused: { label: 'Paused', color: 'text-gray-500' },
};

export function BillingStatus({
  status,
  seatCount,
  userCount,
  trialEndsAt,
  billingExempt,
}: {
  status: SubscriptionStatus;
  seatCount: number;
  userCount: number;
  trialEndsAt: Date | null;
  billingExempt: boolean;
}) {
  if (billingExempt) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-medium text-green-800">Billing exempt</p>
        <p className="mt-1 text-sm text-green-700">
          This organization has complimentary access.
        </p>
      </div>
    );
  }

  const { label, color } = STATUS_LABELS[status];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Subscription status</p>
            <p className={`text-lg font-semibold ${color}`}>{label}</p>
          </div>
        </div>
        {status === 'trialing' && trialEndsAt && (
          <p className="mt-2 text-sm text-gray-600">
            Your free trial ends on{' '}
            <strong>{new Date(trialEndsAt).toLocaleDateString()}</strong>.
            You won&apos;t be charged until then.
          </p>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-sm text-gray-500">Team</p>
        <p className="text-lg font-semibold">{userCount} members</p>
        {seatCount > 0 && userCount !== seatCount && (
          <p className="mt-1 text-sm text-gray-600">
            Paying for {seatCount} seats.{' '}
            {userCount > seatCount
              ? 'Everyone can still use Service Planner — update your seats when you\'re ready.'
              : ''}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create checkout form component**

Create `src/components/billing/checkout-form.tsx`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

export function CheckoutForm({ priceId }: { priceId: string }) {
  const [showCheckout, setShowCheckout] = useState(false);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to start checkout');
    }
    const data = await res.json();
    return data.clientSecret;
  }, [priceId]);

  if (!showCheckout) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Service Planner</h3>
          <p className="mt-1 text-sm text-gray-600">
            Includes 3 team members. Additional members can be added anytime.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            14-day free trial. You won&apos;t be charged until the trial ends.
          </p>
        </div>
        <Button
          onClick={() => setShowCheckout(true)}
          className="w-full min-h-[44px]"
        >
          Start free trial
        </Button>
      </div>
    );
  }

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ fetchClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
```

- [ ] **Step 3: Create seat manager component**

Create `src/components/billing/seat-manager.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function SeatManager({
  userCount,
  seatCount,
}: {
  userCount: number;
  seatCount: number;
}) {
  const [updating, setUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (userCount <= seatCount) return null;

  async function handleUpdateSeats() {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/seats', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update seats.');
        return;
      }
      setShowConfirm(false);
      window.location.reload();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setUpdating(false);
    }
  }

  if (showConfirm) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          Update from {seatCount} to {userCount} seats? Your monthly billing will be adjusted.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex gap-2">
          <Button
            onClick={handleUpdateSeats}
            disabled={updating}
            size="sm"
            className="min-h-[44px]"
          >
            {updating ? 'Updating...' : 'Confirm'}
          </Button>
          <Button
            onClick={() => setShowConfirm(false)}
            variant="outline"
            size="sm"
            className="min-h-[44px]"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-800">
        You have {userCount} team members but are paying for {seatCount} seats.
        Everyone can still use Service Planner — update your seats when you&apos;re ready.
      </p>
      <Button
        onClick={() => setShowConfirm(true)}
        variant="outline"
        size="sm"
        className="mt-3 min-h-[44px]"
      >
        Update seats
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create billing page**

Create `src/app/(app)/billing/page.tsx`:

```typescript
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOrgBilling, getOrgUserCount } from '@/lib/billing/queries';
import { BillingStatus } from '@/components/billing/billing-status';
import { CheckoutForm } from '@/components/billing/checkout-form';
import { SeatManager } from '@/components/billing/seat-manager';

export const metadata: Metadata = {
  title: 'Billing — Service Planner',
};

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  const billing = await getOrgBilling(session.user.orgId);
  if (!billing) redirect('/login');

  const userCount = await getOrgUserCount(session.user.orgId);
  const isAdmin = session.user.role === 'admin';

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Billing</h1>

      <BillingStatus
        status={billing.subscriptionStatus}
        seatCount={billing.seatCount}
        userCount={userCount}
        trialEndsAt={billing.trialEndsAt}
        billingExempt={billing.billingExempt}
      />

      {isAdmin && !billing.billingExempt && (
        <div className="mt-6 space-y-4">
          {billing.subscriptionStatus === 'none' && (
            <CheckoutForm priceId={process.env.STRIPE_BASE_PRICE_ID!} />
          )}

          {billing.subscriptionStatus === 'canceled' && (
            <CheckoutForm priceId={process.env.STRIPE_BASE_PRICE_ID!} />
          )}

          {billing.stripeCustomerId && billing.subscriptionStatus !== 'none' && billing.subscriptionStatus !== 'canceled' && (
            <>
              <SeatManager userCount={userCount} seatCount={billing.seatCount} />

              <form
                action={async () => {
                  'use server';
                  const { auth: serverAuth } = await import('@/lib/auth');
                  const sess = await serverAuth();
                  if (!sess?.user || sess.user.role !== 'admin') return;
                  const { getOrgBilling: getBilling } = await import('@/lib/billing/queries');
                  const b = await getBilling(sess.user.orgId);
                  if (!b?.stripeCustomerId) return;
                  const { getStripe } = await import('@/lib/billing/stripe');
                  const stripe = getStripe();
                  const portal = await stripe.billingPortal.sessions.create({
                    customer: b.stripeCustomerId,
                    return_url: process.env.NEXTAUTH_URL + '/billing',
                  });
                  const { redirect: redir } = await import('next/navigation');
                  redir(portal.url);
                }}
              >
                <p className="text-sm text-gray-500">
                  You&apos;ll be taken to our secure payment partner to manage your subscription.
                </p>
                <button
                  type="submit"
                  className="mt-2 text-sm font-medium text-blue-600 underline hover:text-blue-800 min-h-[44px]"
                >
                  Manage subscription
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {!isAdmin && !billing.billingExempt && (
        <p className="mt-6 text-sm text-gray-500">
          Only admins can manage billing. Contact your admin for changes.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/billing/page.tsx src/components/billing/billing-status.tsx src/components/billing/checkout-form.tsx src/components/billing/seat-manager.tsx
git commit -m "feat(billing): add billing page with status, checkout, seat management, and portal link"
```

---

## Task 15: Sidebar — Add Billing Nav Link

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add Billing link to sidebar**

In `src/components/sidebar.tsx`, add a Billing link after the Settings link (after line 71):

```typescript
        <Link
          href="/billing"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
        >
          Billing
        </Link>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(billing): add Billing nav link to sidebar"
```

---

## Task 16: Update Existing Test Fixtures

**Files:**
- Modify: any test that creates mock orgs or sessions

- [ ] **Step 1: Find all test files that mock Organization or session**

Run: `grep -rn "billingExempt\|subscriptionStatus\|orgId.*org-" tests/ --include="*.ts" -l`

Review the output. For any test fixture that creates an Organization or session mock, ensure it includes `billingExempt: true` so existing tests aren't broken by the paywall.

- [ ] **Step 2: Update existing test helpers or fixtures**

In any test that mocks `session.user`, add the billing fields:

```typescript
// Add to any mocked session.user object:
subscriptionStatus: 'active',
billingExempt: true,
```

In any test that mocks an Organization, add:

```typescript
// Add to any mocked Organization object:
subscriptionStatus: 'active',
billingExempt: true,
seatCount: 5,
stripeCustomerId: null,
subscriptionId: null,
trialEndsAt: null,
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests pass, plus all new billing tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update existing test fixtures with billing fields (billingExempt: true)"
```

---

## Task 17: Environment & Documentation Updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update CLAUDE.md project structure**

Add the new billing files to the project structure section in `CLAUDE.md`. In the `src/lib/` section, add:

```
    billing/
      stripe.ts              # Stripe client singleton
      constants.ts           # Active status helpers, exempt route list
      queries.ts             # Billing DB queries (get/update org billing state)
      webhook-handlers.ts    # Stripe webhook event processors
```

In the `src/app/api/` section, add:

```
      billing/
        checkout/route.ts    # POST — create Stripe Checkout Session (admin)
        portal/route.ts      # POST — create Stripe Customer Portal session (admin)
        seats/route.ts       # POST — update subscription seat quantity (admin)
        webhook/route.ts     # POST — Stripe webhook receiver (public)
        reconcile/route.ts   # POST — daily reconciliation cron (cron secret)
```

In the `src/components/` section, add:

```
    billing/
      billing-status.tsx     # Plan status, seat count, trial info display
      checkout-form.tsx      # Stripe Embedded Checkout wrapper
      seat-manager.tsx       # Seat count update with confirmation (admin)
      subscription-banner.tsx # Warning banners (past_due admin, read-only degradation)
```

Add billing env vars to the Environment Variables table:

```
| STRIPE_SECRET_KEY | Yes (billing) | Stripe API secret key |
| STRIPE_PUBLISHABLE_KEY | Yes (billing) | Stripe publishable key (client-side) |
| STRIPE_WEBHOOK_SECRET | Yes (billing) | Stripe webhook signing secret |
| STRIPE_CRON_SECRET | Yes (billing) | Shared secret for reconciliation endpoint |
| STRIPE_BASE_PRICE_ID | Yes (billing) | Stripe Price ID for base plan |
| STRIPE_SEAT_PRICE_ID | Yes (billing) | Stripe Price ID for per-seat add-on |
```

- [ ] **Step 2: Add How Billing Works section to AGENTS.md**

Add a new section to `AGENTS.md` after "How File Upload Works":

```markdown
## How Billing Works

**Model:** Per-organization, seat-based. Base fee includes 3 seats, additional seats billed per-user. 14-day trial with card required.

**Stripe-heavy architecture:** Stripe owns pricing, plans, coupons, seat quantities, trial logic, dunning, and invoicing. The app stores synced status only.

**Subscription lifecycle:**
1. Admin navigates to `/billing`, clicks "Start free trial"
2. Stripe Embedded Checkout collects payment method, starts 14-day trial
3. `checkout.session.completed` webhook links Stripe customer to org
4. `customer.subscription.updated` webhook syncs status changes
5. `invoice.paid` / `invoice.payment_failed` webhooks update status
6. Admin manages subscription via Stripe Customer Portal

**Paywall enforcement (three layers):**
1. `proxy.ts` — reads subscriptionStatus from JWT, redirects inactive users to `/billing` (UX only, not security)
2. `/api/chat` route — hard check from DB, returns 403 if not active/trialing/past_due (security boundary)
3. `chat-interface.tsx` — disables input, shows degradation banner when inactive (UX)

**Seat management:** Manual, admin-controlled. No lockout — all org users can chat regardless of seat count. Seats are for billing only.

**Test accounts:** `Organization.billingExempt` flag bypasses all paywall checks. Set via DB (no UI).

**Fault tolerance:**
- Webhook idempotency via `StripeEvent` table (stores processed event IDs)
- Daily reconciliation cron (`POST /api/billing/reconcile`) replays missed events
- Stripe retries failed webhooks with exponential backoff for 3 days

**Key files:**
- `src/lib/billing/stripe.ts` — Stripe client singleton
- `src/lib/billing/constants.ts` — `isActiveSubscription()`, `isBillingRoute()`, status/route helpers
- `src/lib/billing/queries.ts` — `getOrgBilling`, `updateSubscriptionStatus`, `isEventProcessed`, `recordStripeEvent`
- `src/lib/billing/webhook-handlers.ts` — `handleWebhookEvent()` processes 6 event types
- `src/app/api/billing/webhook/route.ts` — webhook receiver (public, signature-verified)
- `src/app/api/billing/reconcile/route.ts` — cron-triggered reconciliation
- `src/app/(app)/billing/page.tsx` — billing management page
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: add billing architecture to CLAUDE.md and AGENTS.md"
```

---

## Task Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Prisma schema — billing fields, enum, StripeEvent | — |
| 2 | Billing constants & helpers | 11 tests |
| 3 | Stripe client singleton & env vars | — |
| 4 | Billing DB queries | 5 tests |
| 5 | Webhook event handlers | 8 tests |
| 6 | Webhook API route | 4 tests |
| 7 | Auth — JWT/session billing fields | — |
| 8 | Proxy — paywall (layer 1) | — |
| 9 | Chat route — subscription hard check (layer 2) | — |
| 10 | Billing API routes (checkout, portal, seats) | — |
| 11 | Reconciliation route | — |
| 12 | Subscription banner component | — |
| 13 | Chat interface — read-only degradation (layer 3) | — |
| 14 | Billing page & components | — |
| 15 | Sidebar — billing nav link | — |
| 16 | Update existing test fixtures | — |
| 17 | Environment & documentation updates | — |
