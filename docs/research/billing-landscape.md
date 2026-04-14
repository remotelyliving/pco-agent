# Billing & Subscription Infrastructure Research

**Date:** 2026-04-13
**Purpose:** Fact-gathering for adding monthly subscription billing to pco-agent

---

## Hard Requirements

1. Fault-tolerant billing (monthly subscription)
2. Backend admin UI for credits, refunds, fixing billing errors
3. Permanent test accounts that bypass paywall (e.g., founder/dev accounts)
4. Paywall for normal users

---

## Payment Platforms Compared

### Stripe Billing
- **Cost:** ~3.4-3.7% + $0.30/txn. First $1M billing revenue has no Billing surcharge (Starter tier). Scale tier adds 0.8% for revenue recovery + analytics.
- **Subscription features:** Full lifecycle (trials, upgrades/downgrades, proration, pauses, cancellations), coupons, metered billing, dunning (Smart Retries).
- **Admin dashboard:** Full-featured — refunds, credits, disputes, manual adjustments, MRR tracking, churn reporting.
- **Webhooks:** Exponential backoff retries for 3 days. Signature verification (HMAC). Event log with manual resend.
- **Next.js integration:** `stripe` (server), `@stripe/stripe-js` + `@stripe/react-stripe-js` (client). Official examples, largest ecosystem.
- **Tax:** Stripe Tax add-on (0.5%/txn). Not included by default.
- **Self-hosted:** No.

### Paddle (Merchant of Record)
- **Cost:** 5% + $0.50/txn. Tax compliance included.
- **Key difference:** Paddle is the merchant of record — handles all tax collection/remittance globally.
- **Admin dashboard:** Good but less granular than Stripe.
- **Next.js integration:** `@paddle/paddle-js` (client), `@paddle/paddle-node-sdk` (server). No React component library.
- **Best for:** Global SaaS wanting zero tax headaches.

### Lemon Squeezy (acquired by Stripe, June 2024)
- **Cost:** 5% + $0.50/txn. Tax compliance included.
- **Status:** Acquired by Stripe. Long-term roadmap uncertain.
- **Admin dashboard:** Clean, simple. Built-in email/marketing tools.
- **Next.js integration:** `@lemonsqueezy/lemonsqueezy.js`. Official Next.js template (732 stars).
- **Risk:** May be folded into Stripe proper. Not recommended for new projects.

### Chargebee
- **Cost:** Stripe fees + $599/mo+ (Performance tier). Most expensive option.
- **What it adds:** Advanced subscription management UI, quote-to-cash workflows, revenue recognition, multi-entity support.
- **Admin dashboard:** Best-in-class for billing operations teams.
- **Next.js integration:** `chargebee` Node SDK + hosted checkout/portal.
- **Best for:** Enterprise billing ops at scale. Overkill for early-stage.

### Lago (Open Source)
- **Cost:** Free self-hosted (MIT license). Cloud starts ~$350/mo.
- **Strengths:** Usage-based billing, no per-transaction fees from Lago itself.
- **Admin dashboard:** Functional but less polished.
- **Next.js integration:** REST API + auto-generated JS client. No hosted checkout — build your own.
- **Best for:** Usage-heavy billing, cost-conscious, willing to self-host.

### Cost Comparison on $20/mo Subscription

| Platform | Per-transaction cost | Effective % |
|----------|---------------------|-------------|
| Stripe Billing | ~$0.98 | 4.9% |
| Paddle | ~$1.50 | 7.5% |
| Lemon Squeezy | ~$1.50 | 7.5% |
| Chargebee + Stripe | ~$0.98 + platform fee | 4.9% + $599/mo |
| Lago (self-hosted) + Stripe | ~$0.88 | 4.4% |

---

## Next.js Reference Implementations

| Repo | Stars | Active | ORM | Notes |
|------|-------|--------|-----|-------|
| `nextjs/saas-starter` | 15.7k | Yes | Drizzle | Best reference architecture (Vercel official) |
| `mickasmt/next-saas-stripe-starter` | 3.0k | Stale (2024) | Prisma | Closest to pco-agent stack |
| `ixartz/SaaS-Boilerplate` | 7.0k | Yes | Other | Full-featured |
| `vercel/nextjs-subscription-payments` | 7.7k | Archived | Supabase | Legacy reference, good webhook patterns |
| `lmsqueezy/nextjs-billing` | 732 | Yes | Drizzle | Lemon Squeezy template |

---

## Admin Panel Frameworks

- **Stripe Dashboard + Customer Portal:** Handles 90% of admin ops natively (refunds, credits, plan changes, invoices, payment method updates).
- **AdminJS** (8.9k stars): Has `@adminjs/prisma` adapter. Can auto-generate admin UI over billing tables. Most relevant to pco-agent.
- **Refine** (34.5k stars): Best overall admin framework but no native Stripe integration.
- **React Admin** (26.6k stars): Most mature, no native Stripe integration.
- **Retool:** Proprietary, native Stripe connector. Good for internal dashboards but adds vendor dependency.

None have turnkey Stripe billing admin. All require custom integration.

---

## Paywall Architecture Patterns

### Layered Enforcement (Required)

Next.js middleware is NOT a security boundary (CVE-2025-29927). Must enforce at multiple layers:

1. **`proxy.ts` (middleware):** Read `subscriptionStatus` from JWT. Redirect unpaid users to `/subscribe`. UX convenience only.
2. **API routes:** Hard check — verify subscription status from DB before processing. Real security gate.
3. **Server components:** Check status, redirect if needed. Defense in depth.

### Subscription Status → App Behavior

| Stripe Status | App Behavior |
|---------------|--------------|
| `active` | Full access |
| `trialing` | Full access |
| `past_due` | Full access + warning banner |
| `unpaid` | Read-only or degraded access |
| `canceled` | Redirect to resubscribe |
| `incomplete` | Block access, show payment completion |

### Storing Subscription State

- Store `stripeCustomerId` and `subscriptionStatus` on User or Organization model
- Sync via Stripe webhooks
- Cache status in JWT (refresh periodically, like existing PCO role sync every 15 min)

---

## Test Account Bypass Patterns

### Option A: Database Flag (Recommended)
```
Organization.billingExempt: Boolean @default(false)
```
- Simple, no Stripe dependency, works when Stripe is down
- Orthogonal to roles (admin at customer org still pays)
- Check: `if (org.billingExempt || subscriptionActive) { allow }`

### Option B: Stripe 100% Coupon
- `percent_off: 100, duration: forever` applied to internal subscriptions
- Exercises real payment code path (good for dogfooding)
- More complex to manage

### Option C: Role-Based Bypass
- Anti-pattern: conflates authorization with billing
- An admin at a customer org shouldn't get free access

### Recommendation
Start with Option A (database flag). Layer on Option B later if you want to dogfood the billing flow.

---

## Webhook Reliability & Fault Tolerance

### Stripe Webhook Retry Schedule
Exponential backoff: immediately → 5 min → 30 min → 2 hours → 5 hours → 10 hours → every 12 hours for 3 days.

### Non-Negotiable Safety Patterns

1. **Signature verification:** `stripe.webhooks.constructEvent(rawBody, sig, secret)`. Must read body as raw text, not parsed JSON.
2. **Idempotency:** Store processed `event.id` values. Skip duplicates. Record AFTER successful processing (not before).
3. **Event ordering:** Stripe does NOT guarantee order. Fetch current state from Stripe API rather than relying solely on webhook payload.
4. **Quick acknowledgment:** Return 200 within 5-20 seconds. Queue heavy processing for background worker.
5. **Reconciliation cron (daily):** Call `stripe.events.list()`, compare against processed events, process gaps. This is the backstop.

### Dunning Best Practices
- Smart Retries: up to 8 attempts over 2 weeks (ML-optimized timing)
- Recovery rate: 30% automatic, 50-70% with customer-initiated payment updates
- Proactive: listen for `customer.source.expiring` (fires 30 days before card expiration)
- In-app banner for `past_due` status: "Your payment failed — update your card"

### Minimum Webhook Events

- `checkout.session.completed` — new subscription
- `customer.subscription.created/updated/deleted` — lifecycle changes
- `invoice.paid` — successful payment
- `invoice.payment_failed` — trigger dunning
- `customer.source.expiring` — proactive card warning

---

## Emerging Options (Watch List)

- **Clerk Billing (Beta):** Unified auth + billing. 0.7% per transaction. React hooks: `useSubscription()`, `usePlans()`. Breaking API changes expected.
- **Better Auth Stripe Plugin:** Auth framework with Stripe plugin. Handles checkout, webhooks, subscription lifecycle. Tightly coupled to subscription use case only.
- **Polar:** Open-source MoR alternative. Native Next.js SDK. Gaining traction with solo devs.

---

## Recommended Stack

| Layer | Tool | Rationale |
|-------|------|-----------|
| Payment processing | Stripe Billing | Best ecosystem, official Next.js SDKs |
| Checkout | Stripe Embedded Checkout | On-domain, PCI compliant |
| Self-service | Stripe Customer Portal | Free, handles plan changes/cancellations |
| Admin ops | Stripe Dashboard + thin custom page | 90% covered by Stripe natively |
| Paywall | `proxy.ts` + API route checks | Layered, matches existing auth pattern |
| Test bypass | `Organization.billingExempt` flag | Simple, no Stripe dependency |
| Webhook safety | Daily reconciliation cron | Non-negotiable for production |
| Admin framework | AdminJS (if custom admin needed) | Prisma adapter available |
