# Billing & Subscription System Design

**Date:** 2026-04-13
**Status:** Draft
**Research:** [docs/research/billing-landscape.md](../../research/billing-landscape.md)

---

## Goal

Add monthly subscription billing to Service Planner so it can be offered as a paid product. Users sign in with PCO, hit a paywall, subscribe via Stripe, and get access. Admins manage billing. Lapsed subscriptions degrade to read-only. Founder/test accounts bypass billing entirely.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Billing entity | Per-organization, seat-based | Matches PCO's org model and existing auth |
| Pricing model | Base fee (includes seats) + per-seat overage | ~$12/mo base includes 3 seats. Additional seats ~$4/user/month. A 3-person church pays $12/mo. A 10-person church pays $12 + (7 x $4) = $40/mo. Church staff also pay for API keys, so keep the platform fee modest. |
| Payment platform | Stripe Billing | Best Next.js ecosystem, reliable webhooks, native coupons, Customer Portal |
| Trial | 14 days, card required | Auto-converts to paid. Stripe handles trial logic natively. Checkout page must clearly show trial end date and exact first charge amount in plain language (e.g., "You won't be charged until [date]. Your first payment will be [amount]/month."). |
| Lapsed access | Read-only degradation | Users can view conversation history but can't send messages. Prevents "I lost my data" panic. |
| Billing permissions | Admin only | Consistent with existing pattern (admins manage org-level settings). All users can view status. |
| Test account bypass | `billingExempt` flag on Organization | Simple DB flag, no Stripe dependency, works when Stripe is down. |
| Coupons/referrals | Stripe native coupons + promotion codes | No custom coupon system. `allow_promotion_codes: true` on checkout. |
| Email notifications | Stripe native only | Stripe sends failed payment, renewal, trial-ending emails. In-app banners cover non-billing users. No custom email infrastructure. |
| Mobile app | Out of scope | Web-only. Invest in excellent mobile-web UX instead of app store billing. |
| Admin billing ops | Stripe Dashboard | Refunds, credits, manual adjustments done in Stripe Dashboard. Thin in-app admin page for subscription status and billing-exempt management. |
| Seat management | Manual, admin-controlled, no lockout | Seats don't auto-adjust when users join. Admin updates seat count explicitly to avoid surprise charges from casual logins. Seat count is for billing only — all org users can chat regardless of seat count. |

## Architecture

### Approach: Stripe-Heavy

Let Stripe own pricing, plans, coupons, seat quantities, trial logic, dunning, and invoicing. The app stores only the synced status and enforces access based on it.

```
User → /billing page → Stripe Embedded Checkout → Stripe
                                                      ↓
                                               Webhook events
                                                      ↓
                            /api/billing/webhook → Update org status in DB
                                                      ↓
                              proxy.ts + API routes → Paywall enforcement
```

---

## Data Model

### Schema Changes

**Organization model — new fields:**

```prisma
model Organization {
  // ... existing fields ...

  stripeCustomerId    String?  @unique @map("stripe_customer_id")
  subscriptionId      String?  @unique @map("subscription_id")
  subscriptionStatus  SubscriptionStatus @default(none) @map("subscription_status")
  seatCount           Int      @default(0) @map("seat_count")
  billingExempt       Boolean  @default(false) @map("billing_exempt")
  trialEndsAt         DateTime? @map("trial_ends_at")
}
```

**New enum:**

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

**New model — webhook idempotency:**

```prisma
model StripeEvent {
  id          String   @id  // Stripe event ID (evt_xxx)
  type        String
  processedAt DateTime @default(now()) @map("processed_at")

  @@map("stripe_events")
  @@schema("agent")
}
```

### Session/JWT Additions

```typescript
// Added to JWT token and session.user
subscriptionStatus?: SubscriptionStatus  // cached from org
billingExempt?: boolean                  // cached from org
```

Synced from DB on the same 15-minute cadence as the existing role refresh in `src/lib/auth.ts`. The paywall in `proxy.ts` reads from the JWT for speed; API routes verify against the DB for security.

---

## Subscription Lifecycle

### New Subscription (Admin Flow)

1. Admin navigates to `/billing`
2. Page shows current org status, seat count, and "Subscribe" button
3. Admin clicks "Subscribe" → `POST /api/billing/checkout` creates a Stripe Checkout Session:
   - `mode: 'subscription'`
   - `subscription_data.trial_period_days: 14`
   - Base price (includes 3 seats) + per-seat add-on with `quantity` set to max(0, current org user count - 3)
   - `customer_email` pre-filled from admin's email
   - `client_reference_id` set to org ID
   - `allow_promotion_codes: true`
4. Stripe Embedded Checkout renders inline on `/billing` (stays on your domain)
5. On completion: `checkout.session.completed` webhook fires → links Stripe customer to org, sets status to `trialing`, records `trialEndsAt`

### Seat Management

Seats do not auto-adjust. When a new user joins (PCO OAuth login, org exists):

1. App checks `org.seatCount` vs actual user count
2. If actual users > `seatCount`, the `/billing` page shows: "You have X team members but are paying for Y seats. Everyone can still use Service Planner — update your seats when you're ready."
3. Admin clicks "Update seats" → confirmation dialog shows new monthly total (e.g., "Your plan will change from $28/mo to $40/mo. Update?") → `POST /api/billing/seats` → updates Stripe subscription `quantity`
4. `customer.subscription.updated` webhook confirms the change

**No lockout enforcement.** Seat count is for billing only. All org users can chat regardless of whether seat count matches user count. This avoids punishing users for an admin's billing oversight.

Rationale: A church volunteer might log in once and never return. Auto-charging for that seat would frustrate admins. Let them control it.

### Self-Service (Stripe Customer Portal)

"Manage subscription" button on `/billing`:
1. Brief explanation shown before redirect: "You'll be taken to our secure payment partner to manage your subscription."
2. Calls `POST /api/billing/portal` → creates Stripe Portal session → returns URL
3. Portal handles: update payment method, view invoices, cancel subscription
4. No custom UI needed

### Cancellation

1. Admin cancels via Stripe Customer Portal (or Stripe Dashboard)
2. `customer.subscription.deleted` webhook fires → sets status to `canceled`
3. App enters read-only degradation mode

---

## Paywall Enforcement

### Three Layers

**Layer 1 — `proxy.ts` (UX redirect, not a security boundary):**

After the existing auth check, before rate limiting:

```typescript
if (pathname.startsWith('/api/') && !isPublicRoute(pathname) && !isBillingRoute(pathname)) {
  const status = req.auth?.user?.subscriptionStatus;
  const exempt = req.auth?.user?.billingExempt;
  if (!exempt && !isActiveSubscription(status)) {
    return Response.json(
      { error: "Your church's subscription isn't active. Ask your admin to visit the Billing page to get started." },
      { status: 403 }
    );
  }
}

// Page routes — redirect to /billing
if (!pathname.startsWith('/api/') && !isBillingRoute(pathname)) {
  if (!exempt && !isActiveSubscription(status)) {
    return NextResponse.redirect(new URL('/billing', req.url));
  }
}
```

**`isActiveSubscription(status)`** returns true for: `active`, `trialing`, `past_due`.

**Billing-exempt routes** (accessible regardless of subscription):
- `/billing`, `/api/billing/*` — so users can subscribe/manage
- `/settings` — so users can update their API key
- `/api/auth/*`, `/api/health` — already public

**Layer 2 — API route hard check (security boundary):**

The chat route (`/api/chat`) and other mutation endpoints verify from DB:

```typescript
const org = await prisma.organization.findUnique({
  where: { id: session.user.orgId }
});
if (!org.billingExempt &&
    !['active', 'trialing', 'past_due'].includes(org.subscriptionStatus)) {
  return Response.json(
    { error: "Your church's subscription isn't active. Ask your admin to visit the Billing page to get started." },
    { status: 403 }
  );
}
```

**Layer 3 — Client-side UI degradation:**

When status is `canceled`, `unpaid`, or `none`:
- Chat interface shows conversation history (read-only)
- Input area replaced with banner: "Your subscription has ended. You can still view your conversations." For non-admins, append: "Contact [Admin Name] to resubscribe." (resolve admin name from org's admin users). For admins, show a "Resubscribe" button linking to `/billing`.
- `chat-interface.tsx` reads `subscriptionStatus` from session and disables the input form

**`past_due` behavior:**
- Full access continues
- **Admins only:** Dismissable warning banner: "There's an issue with your payment. Update your billing to avoid interruption." with link to `/billing`.
- **Non-admins:** No banner. They don't control billing and shouldn't be alarmed by payment issues that don't affect their access.

---

## Webhook Handler

### Route: `POST /api/billing/webhook`

Public route — excluded from proxy auth check. Added to `isPublicRoute()` in `proxy.ts`.

### Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Link Stripe customer to org via `client_reference_id`. Set `stripeCustomerId`, `subscriptionId`. Set status to `trialing` or `active`. Set `seatCount`. |
| `customer.subscription.created` | Set `subscriptionId`, `subscriptionStatus`, `trialEndsAt` |
| `customer.subscription.updated` | Update `subscriptionStatus`, `seatCount` |
| `customer.subscription.deleted` | Set status to `canceled` |
| `invoice.paid` | Set status to `active` |
| `invoice.payment_failed` | Set status to `past_due` |

### Handler Pattern

1. Read raw body with `req.text()` (not `req.json()` — preserves HMAC signature)
2. Verify signature: `stripe.webhooks.constructEvent(body, sig, webhookSecret)`
3. Check idempotency: look up `event.id` in `StripeEvent` table. If exists, return 200 immediately.
4. Process event (update Organization fields)
5. Insert `event.id` into `StripeEvent` after successful processing
6. Return 200
7. Return 200 for unhandled event types (prevents unnecessary retries)

### Reconciliation Cron

**Route: `POST /api/billing/reconcile`**

Protected by `STRIPE_CRON_SECRET` header check (not session auth — called by crontab, not a browser).

Daily job:
1. Call `stripe.events.list({ created: { gte: yesterday } })`
2. Compare against `StripeEvent` table
3. Process any missed events
4. Log results

Triggered by homelab crontab: `curl -H "x-cron-secret: $SECRET" https://your-app/api/billing/reconcile`

---

## Pages & Routes

### New Pages

| Page | Purpose | Access |
|------|---------|--------|
| `/billing` | Subscription status, pricing, subscribe/manage buttons, seat count, billing-exempt indicator | All users view status and pricing. Only admins see action buttons. Non-admins see "Only admins can manage billing" note. |

### New API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/billing/checkout` | POST | Admin | Create Stripe Checkout Session, return client secret |
| `/api/billing/portal` | POST | Admin | Create Stripe Customer Portal session, return URL |
| `/api/billing/seats` | POST | Admin | Update subscription seat quantity |
| `/api/billing/webhook` | POST | Public (Stripe signature) | Stripe webhook receiver |
| `/api/billing/reconcile` | POST | Cron secret | Daily reconciliation |

### Sidebar Changes

Add "Billing" nav item below "Settings". Visible to all users. Shows a warning indicator when status is `past_due` (admin only — non-admins don't see the indicator since the `past_due` banner is admin-only).

---

## File Structure

```
src/
  app/
    (app)/
      billing/
        page.tsx                  # Billing page
    api/
      billing/
        checkout/route.ts         # Create checkout session
        portal/route.ts           # Create portal session
        seats/route.ts            # Update seat quantity
        webhook/route.ts          # Stripe webhook handler
        reconcile/route.ts        # Daily reconciliation
  lib/
    billing/
      stripe.ts                  # Stripe client singleton
      webhook-handlers.ts        # Event processing logic (one function per event type)
      queries.ts                 # DB queries: getOrgBilling, updateSubscriptionStatus, etc.
      constants.ts               # Active statuses list, exempt route patterns, trial days
  components/
    billing/
      billing-status.tsx         # Current plan, status, seat count display
      checkout-form.tsx          # Stripe Embedded Checkout wrapper
      seat-manager.tsx           # Seat count display + update button (admin only)
      subscription-banner.tsx    # Warning banners (past_due, canceled/read-only)
```

---

## Coupons & Referral Discounts

All managed in Stripe — no custom coupon infrastructure.

- **Coupons:** Created in Stripe Dashboard. Percent off, fixed amount, or duration-based.
- **Referral discounts:** Stripe promotion codes with `max_redemptions` and `expires_at`. Shareable codes like `FRIENDOFCHURCH20`.
- **Checkout integration:** `allow_promotion_codes: true` on the Checkout Session. Stripe renders the promo code input natively.
- **No custom UI** for coupon management in the app.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes (when billing enabled) | `sk_test_xxx` (dev) or `sk_live_xxx` (prod) |
| `STRIPE_PUBLISHABLE_KEY` | Yes (when billing enabled) | `pk_test_xxx` (dev) or `pk_live_xxx` (prod) |
| `STRIPE_WEBHOOK_SECRET` | Yes (when billing enabled) | `whsec_xxx` (separate per environment) |
| `STRIPE_CRON_SECRET` | Yes (when billing enabled) | Shared secret for reconciliation endpoint |

---

## Testing Strategy

### Stripe Test Mode

All development and CI use Stripe test mode keys (`sk_test_*`, `pk_test_*`). Stripe CLI (`stripe listen --forward-to localhost:3000/api/billing/webhook`) forwards test webhooks locally.

### Unit Tests (Vitest)

- `webhook-handlers.ts` — test each event handler with mocked Prisma. Verify correct DB field updates for each event type.
- `queries.ts` — test billing DB queries.
- `constants.ts` — test `isActiveSubscription` with each status value.
- Paywall logic — test proxy subscription check returns correct responses per status.

### E2E Tests (Playwright)

- Billing page renders correctly for each subscription state (`none`, `active`, `trialing`, `past_due`, `canceled`)
- Read-only degradation: input disabled, banner shown, history visible
- Admin sees action buttons, members don't
- `past_due` warning banner appears for admins only, not for non-admin users
- Don't test actual Stripe checkout in E2E — mock API responses

### Existing Test Compatibility

Test fixtures set `billingExempt: true` on the test organization so all existing test suites (chat, files, rules, memory) pass without modification.

---

## Scope Boundary

**In scope:**
- Stripe Billing integration (checkout, webhooks, reconciliation)
- Paywall enforcement (three layers)
- Billing page with status, checkout, portal, seat management
- Read-only degradation for lapsed subscriptions
- `billingExempt` flag for test/founder accounts
- Stripe native coupons and promotion codes
- In-app warning banners for `past_due` and `canceled`
- Sidebar billing nav item with status indicator

---

## UX Review Resolutions

Findings from UX/PM review against [TARGET_AUDIENCE.md](../../TARGET_AUDIENCE.md):

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Card-required trial creates trust barrier | Keep card-required (business decision), but checkout must show trial end date and exact first charge in plain language |
| 2 | `subscription_required` error is jargon | API returns user-friendly message; client translates 403 to guidance |
| 3 | Seat mismatch enforcement undefined | No lockout. Seats are billing-only. Banner says "Everyone can still use Service Planner" |
| 4 | Read-only banner doesn't identify admin | Show admin's name: "Contact [Pastor Jane] to resubscribe" |
| 5 | `past_due` banner alarming non-admins | Show payment warning to admins only. Non-admins unaware of payment issues. |
| 6 | No confirmation before seat changes | Confirmation dialog shows new monthly total before submitting |
| 7 | No pricing shown before checkout | Billing page displays pricing before the subscribe button |
| 8 | Stripe Portal redirect unexplained | Brief explanation before redirect: "You'll be taken to our secure payment partner" |
| 9 | Billing nav visible but non-actionable for non-admins | Keep it (users should see status). Page shows "Only admins can manage billing" for non-admins. |

---

**Out of scope:**
- Mobile app store billing (App Store / Google Play IAP)
- Custom email delivery infrastructure
- Referral tracking / attribution system
- Custom coupon management UI
- Usage-based or metered billing
- Multiple plan tiers (single plan, seat-based)
- Admin UI for refunds/credits (use Stripe Dashboard)
- Billing analytics dashboard (use Stripe Dashboard)
