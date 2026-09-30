# Billing & Subscription System Design

**Date:** 2026-04-13
**Amended:** 2026-04-15 — AI cost absorption pivot (see [Amendment](#amendment-ai-cost-absorption-2026-04-15))
**Status:** Draft (amended — pricing model changed, new sections added)
**Research:** [docs/research/billing-landscape.md](../../research/billing-landscape.md)

---

## Goal

Add monthly subscription billing to Service Planner so it can be offered as a paid product. Users sign in with PCO, hit a paywall, subscribe via Stripe, and get access. Admins manage billing. Lapsed subscriptions degrade to read-only. Founder/test accounts bypass billing entirely.

**Amended goal (2026-04-15):** Additionally, **absorb AI provider costs into the subscription price** so end users never have to create API keys, register with provider portals, or deal with separate billing relationships. The default path is app-provided keys backed by the pco-agent master provider accounts; BYOK becomes an opt-in escape hatch for technical users in Settings.

---

## Amendment: AI Cost Absorption (2026-04-15)

### Why this changed

The original 2026-04-13 draft assumed a **BYOK (bring-your-own-key) primary model** — users would create API keys with Anthropic, OpenAI, or Google themselves and pay provider bills directly, with pco-agent charging a modest flat platform fee on top. Follow-up brainstorming on 2026-04-15 identified two problems with that model for the actual target audience (non-technical church staff):

1. **BYOK is a dead end for non-technical users.** Asking a church secretary or worship pastor to create an Anthropic console account, attach a credit card, generate an API key, and paste it into a web form loses 80%+ of the target audience before they ever send a first message. BYOK works for the 5% of users who are developers — it does not work as the main door for the other 95%.
2. **Pass-through billing is standard SaaS, not reselling.** Research into how Cursor, Linear, Notion AI, and similar products handle this confirmed the industry norm: absorb raw provider cost into the subscription price, bake in enough margin to stay profitable, cap usage to bound downside risk. This is legally and operationally clean — pco-agent is a real product (PCO integration, MCP tools, rules, memory), not a raw API proxy, so provider ToS around "reselling" do not apply.

### What changed

| Area | Before (2026-04-13) | After (2026-04-15 amendment) |
|---|---|---|
| API key source | BYOK primary — user pastes their own key in Settings | **App-provided keys** on the default path; BYOK retained as an escape hatch in Settings for power users |
| Pricing model | Flat base fee (~$12 includes 3 seats) + $4/seat overage | **Tiered plans** (Starter / Standard / Pro) with hard daily-token caps per org. Seats become informational only — see [Open Questions](#open-questions-2026-04-15). |
| AI cost responsibility | User pays provider directly | pco-agent pays provider; cost is baked into subscription margin |
| Cost containment | N/A (user's problem) | **Hard per-org daily token caps** enforced in chat middleware; no overages — tier upgrade required |
| Provider backend | Direct SDKs (already built) | **Unchanged** — direct SDKs stay. OpenRouter evaluated and rejected at early SaaS scale (see [AI Provider Strategy](#ai-provider-strategy)). |
| Test account bypass | `billingExempt` Boolean flag | `billingExempt` + new **`testTier` override** so exempt accounts can simulate any tier for QA |
| Admin ops UI | Billing status view only (Stripe Dashboard does the rest) | Expanded **admin backend** — tier overrides, usage dashboards, exempt-account management |

Sections added by this amendment:
- [AI Provider Strategy](#ai-provider-strategy)
- [Tier Structure & Caps](#tier-structure--caps)
- [Usage Tracking & Cap Enforcement](#usage-tracking--cap-enforcement)
- [Admin Backend](#admin-backend)
- [Open Questions (2026-04-15)](#open-questions-2026-04-15)

Existing sections that remain valid unchanged: Paywall Enforcement, Webhook Handler, Subscription Lifecycle (seat management flow may be replaced pending resolution of the seats-vs-tiers open question), Environment Variables, UX Review Resolutions.

**Implementation plan impact:** The companion implementation plan at [`docs/superpowers/plans/2026-04-13-billing-subscription.md`](../plans/2026-04-13-billing-subscription.md) was authored against the pre-amendment design and **must be regenerated** after this amendment is approved. Affected tasks: schema (add tier + testTier + OrgUsage), chat route hard check (add cap enforcement), new admin backend tasks, test fixture updates.

## Decisions

Legend: ✱ = amended 2026-04-15 (differs from original decision). ✚ = added 2026-04-15 (new decision).

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Billing entity | Per-organization | Matches PCO's org model and existing auth |
| ✱ Pricing model | **Credit-based tiered plans** (Starter $9 / Standard $19 / Pro $49) with daily credit budgets and model multipliers | AI cost is the dominant variable, not seat count. Credits × model multiplier bounds worst-case cost per customer regardless of model choice. Seats removed — orgs have unlimited users. See [Tier Structure & Caps](#tier-structure--caps). |
| ✚ API key source | App-provided keys on default path; BYOK retained as Settings escape hatch | Non-technical church staff cannot realistically complete a provider API key signup flow. BYOK as the main door loses 80%+ of the target audience at onboarding. Tech-savvy users still get BYOK as an opt-in. |
| ✚ Provider backend | Direct provider SDKs via existing `src/lib/ai/providers.ts` — no OpenRouter or other gateway | BYOK requires direct SDKs regardless (forcing BYOK users through OpenRouter defeats the point), so adding OpenRouter for the app-provided path only would create a second code path for marginal benefit. Direct SDKs give native prompt caching, shorter data-processor chain (important for church data), and zero 5.5% credit-top-up tax. Revisit only if rate-limit headroom becomes a real constraint or the supported-provider list expands past ~3. |
| ✚ Rate limit strategy | One master key per provider shared across all orgs; per-org concurrency limit + per-request token ceiling + Vercel AI SDK 429 retry | At target scale (tens to low-hundreds of churches doing church-staff-volume chat), Anthropic Tier 2 / OpenAI Tier 2 limits already provide 20–40x headroom over expected peak load. Deposit upfront to skip Tier 1 during early weeks. |
| ✚ Prompt caching | Native provider caching (Anthropic `cache_control`, OpenAI automatic, Google 2.5 explicit caching) on the large system prompt (PCO MCP tool descriptions + rules assembly + memory) | Chat routes send a ~2–5K-token system prompt on every turn. Prompt caching cuts repeat-context cost by 80–90% on Anthropic and materially on others. This is a bigger cost lever than picking a cheaper model. |
| ✚ Cap enforcement point | Chat route middleware — pre-dispatch token budget check + post-stream usage recording via Vercel AI SDK `onFinish` | Soft cutoff at 95% of cap prevents overshoot from races at the boundary. Per-request token ceiling (e.g., 20K tokens) prevents a single runaway request from burning the day's budget in one shot. |
| Payment platform | Stripe Billing | Best Next.js ecosystem, reliable webhooks, native coupons, Customer Portal |
| Trial | 14 days, card required | Auto-converts to paid. Stripe handles trial logic natively. Checkout page must clearly show trial end date and exact first charge amount in plain language (e.g., "You won't be charged until [date]. Your first payment will be [amount]/month."). |
| Lapsed access | Read-only degradation | Users can view conversation history but can't send messages. Prevents "I lost my data" panic. |
| Billing permissions | Admin only | Consistent with existing pattern (admins manage org-level settings). All users can view status. |
| ✱ Test account bypass | `billingExempt` flag **plus** new `testTier` override on Organization | `billingExempt` alone only skips the paywall — it doesn't let QA exercise different tier caps and model access. `testTier` (nullable enum) lets an exempt account behave as if it were Starter, Standard, or Pro for testing purposes. Toggled from the admin backend. |
| ✚ Admin backend | Thin custom pages at `/admin/*` (admin-role-gated) for: listing orgs, toggling `billingExempt`, setting `testTier`, viewing per-org usage for the current day | Stripe Dashboard handles refunds/credits/invoices (already decided). The custom backend only covers what Stripe can't: the app-local fields (`billingExempt`, `testTier`, `OrgUsage`). No framework — just Next.js pages + the existing auth/role pattern. |
| Coupons/referrals | Stripe native coupons + promotion codes | No custom coupon system. `allow_promotion_codes: true` on checkout. |
| Email notifications | Stripe native only | Stripe sends failed payment, renewal, trial-ending emails. In-app banners cover non-billing users. No custom email infrastructure. |
| Mobile app | Out of scope | Web-only. Invest in excellent mobile-web UX instead of app store billing. |
| Admin billing ops | Stripe Dashboard + thin custom admin backend | Stripe handles money ops. Custom backend handles app-local concerns (exempt flag, test tier, usage visibility). See [Admin Backend](#admin-backend). |
| ✱ Seat management | **Removed** — Q1 resolved 2026-04-18 | Tiers replace seats entirely. Orgs have unlimited users who self-sign-up via PCO OAuth. No seat counting, no seat billing, no seat-update UI. `seatCount` field retained as informational only (for admin reference). |

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

**Amended data flow (2026-04-15) — chat request with cap enforcement and app-provided keys:**

```
User sends message → /api/chat route
  ↓
Auth + subscription hard check (existing)
  ↓
Resolve effective tier:
  org.testTier ?? org.tier                          (admin overrides live here)
  ↓
Pre-check: today's token usage < tier.dailyCap × 0.95?
  ↓                                    ↓
  yes                                  no → 429 "Daily limit reached — upgrade"
  ↓
Select model + API key:
  BYOK-on-this-org ? user's key : master key for tier
  ↓
Dispatch via existing createModel() (src/lib/ai/providers.ts)
  → includes per-request token ceiling (maxOutputTokens)
  → includes provider-native prompt caching hints
  ↓
Stream response
  ↓
onFinish(usage) → incrementOrgUsage(orgId, today, usage.totalTokens, usage.inputTokens, usage.outputTokens)
```

---

## AI Provider Strategy

### Backend: direct SDKs only

pco-agent continues to use its existing direct-SDK integration (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) via the factory at `src/lib/ai/providers.ts`. No gateway service (OpenRouter, LiteLLM, Cloudflare AI Gateway, Portkey) sits between pco-agent and the providers.

**Why not OpenRouter, explicitly:**
1. BYOK support mandates direct SDKs in the codebase regardless — any gateway added for app-provided traffic creates a second code path.
2. The 5.5% OpenRouter credit top-up fee is immaterial at pco-agent scale, but so is its operational convenience.
3. Direct SDKs give first-class access to provider-specific prompt caching (Anthropic `cache_control`, OpenAI automatic, Google 2.5 explicit), which is a bigger cost lever than a 5.5% difference.
4. Church data has privacy sensitivity — adding another sub-processor means another DPA review and another trust relationship.
5. OpenRouter introduces a single point of failure: their credit balance depletion or their availability outage takes down *all* app-provided traffic simultaneously.
6. The `createModel()` switch in `providers.ts` is exactly the escape hatch for adding OpenRouter later if the decision ever flips — no architectural lock-in.

### Master keys and account provisioning

pco-agent owns one API key per supported provider, stored in environment variables (Fernet-encrypted if persisted to DB, which they should not be — keep them in env vars only):

```
ANTHROPIC_MASTER_API_KEY    # used when org tier includes Anthropic models
OPENAI_MASTER_API_KEY       # used when org tier includes OpenAI models
GOOGLE_MASTER_API_KEY       # used when org tier includes Google models
```

These are distinct from user-supplied BYOK keys stored on the User model. The selection logic in the chat route:

```typescript
// Pseudocode for key selection
const userKey = await getUserApiKey(session.user.id);  // existing BYOK path
const apiKey = userKey ?? getMasterKeyFor(provider);
```

BYOK, when present, takes precedence — so a technical user who wants to use their own key never touches the shared master-key quota.

### Rate limit posture

Provider rate limits are per-API-key and scale with cumulative spend on the account (Tier 1 → Tier 5). At pco-agent's target scale:

- **Early weeks on Tier 1** (new account, ~$5 deposit): Anthropic ~50 RPM, OpenAI ~500 RPM, Google paid Flash ~1,000 RPM. Expected pco-agent peak at 50 active churches ≈ 25 RPM fleet-wide. Anthropic Tier 1 is the tightest and still provides ~2x headroom.
- **After ~$40–50 spend** (typically within days once churches are active): Tier 2 on Anthropic (~1,000 RPM) and OpenAI (~5,000 RPM). Now 40–200x headroom vs peak.
- **Acceleration**: deposit $40–50 upfront per provider to skip Tier 1 entirely.

**Protection against concentration risk** (one org bursting and starving others):
- **Per-org concurrency cap**: max 3 in-flight requests per org at any time. Additional requests queue briefly, then 429 if the queue exceeds a short timeout.
- **Per-request token ceiling**: `maxOutputTokens` set to a sensible ceiling (e.g., 4K output tokens) on every stream. Prevents pathological long-form generation.
- **Daily token cap**: the tier cap itself is a longer-horizon constraint — see [Tier Structure & Caps](#tier-structure--caps).

**429 handling:**
- Vercel AI SDK's built-in retry with exponential backoff handles transient rate-limit hits.
- On persistent 429 from a primary provider, fall back to a configured backup model (e.g., Sonnet 4.6 → GPT-4.1). Wrap `createModel()` in a thin failover helper, ~30 lines.
- Log every failover event and alert if failover rate exceeds a threshold (the signal that a tier-up is needed).

### Prompt caching

Every chat turn in pco-agent sends a substantial system prompt: PCO MCP tool descriptions, assembled rules, memory context. This content is highly cacheable — it changes rarely within a conversation and not at all within a turn.

- **Anthropic:** Mark the system prompt and MCP tool block with `cache_control: { type: 'ephemeral' }`. Cached reads cost ~10% of standard input; misses cost ~125% (cache-write premium). Break-even is any conversation with ≥2 turns — which is essentially all of them.
- **OpenAI:** Automatic caching applies to prompts ≥1024 tokens. No code changes required — pco-agent already crosses that threshold.
- **Google (Gemini 2.5):** Explicit caching API. Requires creating a cached content handle for the system prompt and referencing it in subsequent requests. More setup cost than Anthropic/OpenAI, but still a meaningful saving on repeat turns.

Token accounting for usage tracking (see [Usage Tracking & Cap Enforcement](#usage-tracking--cap-enforcement)) must record the **uncached-equivalent** token count for fairness across orgs — otherwise an org that happens to share system prompt with many others would benefit at the expense of orgs that don't. The AI SDK's `onFinish` callback exposes `usage.cachedInputTokens` alongside `usage.inputTokens`; charge the org against `inputTokens + cachedInputTokens` (or a weighted blend) rather than raw billed tokens. **Decision detail deferred to implementation plan.**

---

## Tier Structure & Caps

### Credit-based budget system

Tiers use a **"daily chat budget"** denominated in credits — not raw tokens. Each AI model consumes credits at a rate proportional to its real cost. This ensures that offering premium models (Sonnet, Opus) on mid-range tiers never creates worst-case scenarios where a single customer's usage exceeds the subscription price. This is the same structural pattern Cursor uses (Pro/$20 with credit pool, Pro+/$60 with 3x pool).

**Credit consumption rates per 1K tokens (input+output blended):**

| Model | Credits per 1K tokens | Relative cost | Rationale |
|---|---|---|---|
| Gemini 2.5 Flash | 1 | 1x (baseline) | ~$0.003/turn cached — cheapest viable model |
| GPT-4.1 mini | 1 | 1x | ~$0.003/turn cached — cost-equivalent to Flash |
| Claude Haiku 4.5 | 3 | 3x | ~$0.008/turn cached — higher quality, 3x the raw cost |
| GPT-4.1 | 4 | 4x | ~$0.012/turn cached |
| Claude Sonnet 4.6 | 6 | 6x | ~$0.020/turn cached — the "smart" model |
| Gemini 2.5 Pro | 6 | 6x | ~$0.020/turn cached — comparable to Sonnet in cost |
| Claude Opus 4.6 | 10 | 10x | ~$0.030/turn cached — premium only |

### Tier table (research-grounded, April 2026)

Pricing is anchored to Planning Center's module pricing ($15/mo per module) and validated against Cursor's AI tier structure.

| Tier | Monthly price | Daily budget | Models available | Rough daily capacity | Worst-case monthly cost (saturated every day) | Realistic cost (~20% of worst-case) | Realistic margin |
|---|---|---|---|---|---|---|---|
| **Starter** | **$9/mo** | 500 credits/day | Gemini 2.5 Flash, GPT-4.1 mini, Claude Haiku 4.5 | 500K Flash tokens OR 166K Haiku tokens | ~$4 | ~$1 | **~$8** |
| **Standard** | **$19/mo** | 1,500 credits/day | All Starter + Sonnet 4.6, GPT-4.1, Gemini 2.5 Pro | 1.5M Flash OR 250K Sonnet | ~$15 | ~$4 | **~$15** |
| **Pro** | **$49/mo** | 5,000 credits/day | All Standard + Claude Opus 4.6 | 5M Flash OR 833K Sonnet OR 500K Opus | ~$45 | ~$11 | **~$38** |

**Why these prices:**
- **$9 Starter** — under PCO's $15/module anchor. "Cheaper than another PCO module" is an easy board-level pitch for a small church.
- **$19 Standard** — just above a PCO module. Signals "more than basic" while staying within one-module-equivalent budget.
- **$49 Pro** — comparable to Cursor Pro+ ($60), below Cursor Ultra ($200). Aligns with "premium AI tier" pricing across the industry.

### Cap semantics

- **Hard cap, no overage.** Reaching the daily budget results in a 429 response with a friendly in-app message: "Your church has used today's chat budget. It resets at midnight. Upgrade for more capacity." Admins see an "Upgrade" button; non-admins see "Ask [Pastor Jane] to upgrade."
- **Daily reset** at UTC midnight (simplest — matches a single `date` column in `OrgUsage`). A future refinement could localize the reset to the church's timezone; out of scope for initial implementation.
- **Soft margin at 95%.** New chat requests are rejected once `todayCreditsUsed >= dailyBudget * 0.95`. This leaves headroom for the in-flight request to complete without going over.
- **Per-request credit ceiling independent of budget.** No single chat turn is allowed to consume more than 100 credits regardless of remaining daily budget. Prevents a pathological long-form response on a premium model from burning the entire day's budget in one shot.
- **Model gating by tier.** The model picker in the UI shows all models the org's tier allows. Models from higher tiers appear grayed out with "(Standard required)" or "(Pro required)." Selecting a grayed-out model opens a tier comparison modal with an "Upgrade" button. This is both a gate and an upsell discovery surface.
- **Credit display in model picker.** Each model in the dropdown shows its credit rate: "Claude Sonnet 4.6 — 6 credits/1K tokens" and "Claude Haiku 4.5 — 3 credits/1K tokens". This lets users self-select based on budget awareness.
- **Trial behavior.** Trialing orgs get Standard-tier model access with a **lifetime trial budget of 21,000 credits** (≈ 14 days × 1,500/day) rather than a daily reset. This prevents trial abuse (can't just wait for tomorrow's reset) while giving enough budget for genuine evaluation. Enforced via a separate `trialCreditsUsed` counter on the Organization model that does not reset.

### UI: "Daily chat budget" framing

The credit system is presented to end users as a **progress bar**, not a numbers game:

```
╭──────────────────────────────────────────────╮
│  Today's chat budget:  ████████░░░░  65%     │
│  Resets at midnight                          │
╰──────────────────────────────────────────────╯
```

- Shown subtly at the top of the chat interface — not modal, not alarming.
- Clicking the bar opens detail: "350 of 1,500 credits remaining. Using Claude Sonnet 4.6 (6 credits/1K tokens)."
- The word "credits" appears only in the expanded detail view. The primary UX is "budget used: 65%."
- When usage hits 80%, the bar turns amber. At 95% (soft margin), it turns red with text: "Almost out — switch to a lighter model or wait until midnight."

### Cost math grounding

**Per-turn cost with prompt caching (averaged over a typical 3-turn conversation):**

pco-agent's per-turn token profile: ~9,450 input (of which ~7,000 are cacheable system/MCP/rules/memory) + ~400 output. First turn pays cache-write premium on Anthropic (1.25x input) but not on OpenAI/Google (automatic caching, no write premium).

| Model | First turn cost | Cached turn cost | 3-turn convo avg | 5-turn convo avg |
|---|---|---|---|---|
| Gemini 2.5 Flash | $0.0038 | $0.0023 | $0.0028 | $0.0026 |
| GPT-4.1 mini | $0.0044 | $0.0023 | $0.0030 | $0.0027 |
| Claude Haiku 4.5 | $0.0132 | $0.0052 | $0.0078 | $0.0068 |
| GPT-4.1 | $0.0150 | $0.0078 | $0.0102 | $0.0092 |
| Claude Sonnet 4.6 | $0.0400 | $0.0160 | $0.0240 | $0.0208 |
| Gemini 2.5 Pro | $0.0200 | $0.0120 | $0.0147 | $0.0136 |
| Claude Opus 4.6 | $0.0550 | $0.0250 | $0.0350 | $0.0310 |

**Monthly cost per church at realistic usage levels:**

| Church profile | Active users | Turns/day | Monthly cost (Flash/mini) | Monthly cost (Haiku) | Monthly cost (Sonnet) |
|---|---|---|---|---|---|
| Small (1–3 staff) | 1 | ~20 | $1.80 | $4.80 | $12 |
| Medium (5–10 staff) | 3–5 | ~60 | $5.40 | $14.40 | $36 |
| Large (20+ staff) | 10+ | ~200 | $18 | $48 | $120 |

**Critical insight: the credit system bounds your worst case regardless of model choice.** A Standard-tier church gets 1,500 credits/day. If they spend all 1,500 on Sonnet (6 credits/1K = 250K tokens of Sonnet/day), their worst-case monthly raw cost to you is:
- 250K tokens × 30 days = 7.5M tokens
- At Sonnet's cached blended rate (~$2.40/MT avg): ~$18/mo
- On a $19 subscription: **~$1 margin worst case, ~$15 realistic**

If they spend all 1,500 on Flash (1 credit/1K = 1.5M tokens of Flash/day):
- 1.5M × 30 = 45M tokens at ~$0.28/MT blended: ~$12.60/mo
- Margin: ~$6.40 worst case

**The credit multiplier ensures that the worst-case cost is approximately the same (~$12–18) regardless of which model the user picks.** That's the structural guarantee — it's why this approach is safe at $19/mo.

**Additional cache warm-up benefit at scale:** Anthropic's prompt cache is workspace-scoped with a 5-minute TTL. At even modest fleet activity (~1 request every 5 minutes across all orgs), the cache stays warm for subsequent users. This means the "cache write" premium is paid once and amortized across many orgs. At 50+ active churches, the effective blended cost per turn drops further — making the realistic cost column above conservative.

---

## Usage Tracking & Cap Enforcement

### New Prisma model: `OrgUsage`

```prisma
model OrgUsage {
  id           String   @id @default(cuid())
  orgId        String   @map("org_id")
  date         DateTime @db.Date @map("date")  // UTC midnight-aligned
  creditsUsed  Int      @default(0) @map("credits_used")     // primary cap-enforcement field
  totalTokens  Int      @default(0) @map("total_tokens")     // raw tokens for admin visibility
  inputTokens  Int      @default(0) @map("input_tokens")
  outputTokens Int      @default(0) @map("output_tokens")
  cachedTokens Int      @default(0) @map("cached_tokens")
  requestCount Int      @default(0) @map("request_count")
  estimatedCostCents Int @default(0) @map("estimated_cost_cents")
  updatedAt    DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, date])
  @@index([date])  // for the daily reconciliation / reporting cron
  @@map("org_usage")
  @@schema("agent")
}
```

Rationale for a daily row (not a single running counter): makes retention/cleanup trivial (drop rows older than 90 days), enables historical usage graphs in the admin backend for free, and sidesteps the question of "when does the counter reset" because the row simply doesn't exist for a new day.

### Organization model additions

```prisma
model Organization {
  // ... existing fields ...

  tier              Tier     @default(starter) @map("tier")
  testTier          Tier?    @map("test_tier")    // admin override for billingExempt accounts
  trialCreditsUsed  Int      @default(0) @map("trial_credits_used")  // lifetime counter for trial orgs (21,000 budget)

  usage             OrgUsage[]
}

enum Tier {
  starter
  standard
  pro

  @@schema("agent")
}
```

Effective tier resolution:
```typescript
function effectiveTier(org: Organization): Tier {
  if (org.billingExempt && org.testTier) return org.testTier;
  return org.tier;
}
```

### Credit calculation

Credits consumed by a request are computed from the **raw token count** (not billed/cached tokens — this keeps it fair and predictable for the user) multiplied by the model's credit multiplier:

```typescript
// src/lib/billing/tiers.ts

export const MODEL_CREDIT_RATES: Record<string, number> = {
  'gemini-2.5-flash':            1,   // baseline
  'gpt-4.1-mini':                1,
  'gpt-4.1-nano':                1,
  'claude-haiku-4-5-20251001':   3,
  'gpt-4.1':                     4,
  'claude-sonnet-4-6':           6,
  'gemini-2.5-pro':              6,
  'claude-opus-4-6':            10,
};

export const TIER_CONFIGS = {
  starter:  { dailyBudget: 500,   allowedModels: ['gemini-2.5-flash', 'gpt-4.1-mini', 'gpt-4.1-nano', 'claude-haiku-4-5-20251001'] },
  standard: { dailyBudget: 1_500, allowedModels: [...starter, 'claude-sonnet-4-6', 'gpt-4.1', 'gemini-2.5-pro'] },
  pro:      { dailyBudget: 5_000, allowedModels: [...standard, 'claude-opus-4-6'] },
} as const;

export const TRIAL_LIFETIME_BUDGET = 21_000; // credits — approx 14 days × 1,500/day

export function computeCredits(modelId: string, totalTokens: number): number {
  const rate = MODEL_CREDIT_RATES[modelId] ?? 1;
  return Math.ceil((totalTokens / 1000) * rate);
}
```

### Chat route cap-check flow

Add to `src/app/api/chat/route.ts` after the existing subscription hard check and before the model call:

```typescript
// After the existing subscriptionStatus check in the chat route
const tier = effectiveTier(org);
const tierConfig = TIER_CONFIGS[tier];

// --- Model gating ---
const requestedModel = body.model ?? user.defaultModel;
if (!tierConfig.allowedModels.includes(requestedModel)) {
  return Response.json(
    {
      error: "model_not_available",
      message: `${requestedModel} requires the ${requiredTierFor(requestedModel)} plan.`,
      requiredTier: requiredTierFor(requestedModel),
    },
    { status: 403 }
  );
}

// --- Budget check ---
const today = startOfUtcDay(new Date());
const usage = await prisma.orgUsage.findUnique({
  where: { orgId_date: { orgId: org.id, date: today } },
});
const creditsUsed = usage?.creditsUsed ?? 0;

if (creditsUsed >= tierConfig.dailyBudget * 0.95) {
  return Response.json(
    {
      error: "daily_budget_exhausted",
      message: "Your church has used today's chat budget. It resets at midnight.",
      tier,
      budget: tierConfig.dailyBudget,
      used: creditsUsed,
    },
    { status: 429 }
  );
}

// --- Trial lifetime budget check ---
if (org.subscriptionStatus === 'trialing') {
  if (org.trialCreditsUsed >= TRIAL_LIFETIME_BUDGET * 0.95) {
    return Response.json(
      {
        error: "trial_budget_exhausted",
        message: "Your free trial budget has been used up. Subscribe to keep chatting.",
      },
      { status: 429 }
    );
  }
}

// --- Dispatch using existing providers.ts + BYOK precedence ---
const apiKey = user.byokKey ?? getMasterKeyFor(requestedModel);
const result = streamText({
  model: createModel(providerFor(requestedModel), requestedModel, apiKey),
  system: buildSystemPrompt({ caching: true }),
  maxOutputTokens: 4_000,  // per-request output ceiling
  messages,
  tools,
  onFinish: async ({ usage: tokenUsage }) => {
    const credits = computeCredits(requestedModel, tokenUsage.totalTokens);

    await recordOrgUsage({
      orgId: org.id,
      date: today,
      creditsUsed: credits,
      totalTokens: tokenUsage.totalTokens,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      cachedTokens: tokenUsage.cachedInputTokens ?? 0,
      costCents: estimateCostCents(requestedModel, tokenUsage),
    });

    // Trial lifetime counter
    if (org.subscriptionStatus === 'trialing') {
      await prisma.organization.update({
        where: { id: org.id },
        data: { trialCreditsUsed: { increment: credits } },
      });
    }
  },
});

return result.toDataStreamResponse();
```

`recordOrgUsage` uses an upsert with atomic `increment` on all counters:

```typescript
await prisma.orgUsage.upsert({
  where: { orgId_date: { orgId, date } },
  create: { orgId, date, creditsUsed: credits, totalTokens, inputTokens, outputTokens, cachedTokens, requestCount: 1, estimatedCostCents: costCents },
  update: {
    creditsUsed:  { increment: credits },
    totalTokens:  { increment: totalTokens },
    inputTokens:  { increment: inputTokens },
    outputTokens: { increment: outputTokens },
    cachedTokens: { increment: cachedTokens },
    requestCount: { increment: 1 },
    estimatedCostCents: { increment: costCents },
  },
});
```

### Per-request credit ceiling

No single chat turn is allowed to consume more than **100 credits** regardless of remaining daily budget. This prevents a pathological long-form response on a premium model (100 credits on Opus = ~10K tokens, on Flash = ~100K tokens) from draining the day's budget in one shot. Enforced via `maxOutputTokens` ceiling, computed before dispatch:

```typescript
const maxOutputCredits = 100;
const maxOutputTokens = Math.floor((maxOutputCredits / MODEL_CREDIT_RATES[requestedModel]) * 1000);
// Opus (10 credits/1K): maxOutputTokens = 10,000
// Flash (1 credit/1K): maxOutputTokens = 100,000 (but clamped to 4,000 for practical response quality)
const effectiveMaxOutput = Math.min(4_000, maxOutputTokens);
```

### Concurrency limit (in-flight request guard)

A per-org concurrency limit (e.g., max 3 in-flight requests) is enforced via a lightweight in-memory counter per server instance (the existing `lib/rate-limit.ts` pattern can be extended). This is a burst guard, not a security boundary — the hard daily budget is the security/cost boundary.

### BYOK users and the credit system

When a user has a BYOK key configured, their requests still consume credits against the org's daily budget — **unless** the admin explicitly opts the org into "BYOK bypass" mode (future feature, out of scope for v1). Rationale: BYOK users shouldn't get unlimited usage just because they brought their own key, since they still consume server resources (MCP connections, DB writes, rate limiter slots). The credit budget is a resource cap, not just a cost cap.

### Estimating cost (informational)

`estimateCostCents(model, usage)` uses a static price table keyed by model ID for admin dashboard visibility:

```typescript
// src/lib/billing/tiers.ts
export const MODEL_PRICING_CENTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':            { input:   30, output:  250 },
  'gpt-4.1-nano':                { input:    5, output:   20 },
  'gpt-4.1-mini':                { input:   40, output:  160 },
  'claude-haiku-4-5-20251001':   { input:  100, output:  500 },
  'gpt-4.1':                     { input:  200, output:  800 },
  'gemini-2.5-pro':              { input:  125, output: 1000 },
  'claude-sonnet-4-6':           { input:  300, output: 1500 },
  'claude-opus-4-6':             { input:  500, output: 2500 },
};
```

Prices in cents per 1M tokens. Review and update on every release. The cost column is **informational only** (for admin visibility and future cost analytics) — **cap enforcement is on credits, not dollars**, to keep the system predictable and model-agnostic.

---

## Admin Backend

A thin set of admin-role-gated pages at `/admin/*` for ops work that Stripe Dashboard can't handle — specifically the app-local fields (`billingExempt`, `testTier`, `OrgUsage`).

**Not a framework** — just Next.js pages using the existing shadcn/ui components and the existing admin role check from `src/lib/auth.ts`. No AdminJS, no Refine, no Retool. Those were researched and documented in the landscape doc but are overkill for the handful of fields that need admin UI.

### Access control

Gate every `/admin/*` route and `/api/admin/*` API route on an `isSuperAdmin(user)` check. Initially this is a hardcoded allowlist of PCO user IDs / emails in environment config:

```typescript
// src/lib/auth.ts (addition)
export function isSuperAdmin(user: SessionUser): boolean {
  const allowlist = (process.env.SUPER_ADMIN_PCO_IDS ?? '').split(',').filter(Boolean);
  return allowlist.includes(user.pcoId);
}
```

This is distinct from the per-org `admin` role (that's for church admins managing their own org's billing). `isSuperAdmin` is for **you** — the pco-agent operator. Future refinement: move to a dedicated `SuperAdmin` model with audit logging; out of scope for initial implementation.

### Pages

| Page | Purpose |
|---|---|
| `/admin` | Landing: totals (orgs, MRR if Stripe API reachable, today's fleet token usage), recent signups |
| `/admin/orgs` | Sortable/filterable list of all orgs: name, tier, status, billingExempt, today's tokens, last activity |
| `/admin/orgs/[id]` | Single-org detail: status + controls — toggle `billingExempt`, set `testTier`, view usage history, jump link to Stripe customer dashboard |
| `/admin/usage` | Fleet-wide usage dashboard: daily totals, per-tier breakdown, cost estimate, top consumers |

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/orgs/[id]/exempt` | PATCH | Toggle `billingExempt` |
| `/api/admin/orgs/[id]/test-tier` | PATCH | Set or clear `testTier` |
| `/api/admin/orgs/[id]/usage` | GET | Fetch usage history for the org (last 30 days by default) |

All admin mutations write to an audit log (new `AdminAuditLog` Prisma model — see [Data Model](#data-model) additions below). Every flag flip is recorded with `adminPcoId`, `targetOrgId`, `action`, `before`, `after`, `at`.

### Test account workflow (the thing you asked for)

1. You sign in with your PCO account (which is on the `SUPER_ADMIN_PCO_IDS` allowlist).
2. You navigate to `/admin/orgs` and find the org you want to turn into a test account.
3. You toggle `billingExempt: true` — this bypasses the paywall entirely.
4. You set `testTier: 'pro'` (or Starter / Standard) — this forces the chat route to behave as if the org were on that tier, including the daily token cap and model access of that tier.
5. You use pco-agent with that org and verify the tier-specific behavior (cap enforcement, model gating, upgrade prompts, etc.) end-to-end.
6. When done, clear `testTier` (or leave it — it only matters while `billingExempt` is true).

This also handles the existing requirement: founder/dev accounts that bypass billing entirely. Such accounts simply leave `testTier` unset while `billingExempt: true` — they behave as if on the default tier (Starter), which is fine for daily use, but can be bumped to Pro via `testTier` during testing.

---

## Open Questions

### Resolved

**Q1: Does tier-based pricing replace seat-based pricing entirely?** ✅ **Resolved 2026-04-18: Yes.** Tiers replace seats. Orgs have unlimited users — individual church staff sign up on their own via PCO OAuth. No seat counting, no seat-update flow, no `/api/billing/seats` route. The daily credit budget is the effective constraint on usage, not headcount.

**Q2: What are the final tier prices and caps?** ✅ **Resolved 2026-04-18: Credit-based tiers.** $9 Starter (500 credits/day), $19 Standard (1,500 credits/day), $49 Pro (5,000 credits/day). Premium models consume credits at higher multipliers (Sonnet = 6x, Opus = 10x). Pricing grounded in:
- Provider pricing as of April 2026 (Claude Haiku $1/$5, Sonnet $3/$15, GPT-4.1 mini $0.40/$1.60, Flash $0.30/$2.50, etc.)
- Prompt caching behavior and per-turn cost modeling with realistic 3-turn conversations
- Planning Center module pricing ($15/mo) as the primary market anchor
- Cursor's tiered credit model ($20/$60/$200) as a structural benchmark
- Worst-case margin analysis confirming profitability even at saturation

**Q3: What's the trial tier treatment?** ✅ **Resolved 2026-04-18:** Trials get **Standard-tier model access** (to showcase premium models) with a **lifetime budget of 21,000 credits** (no daily reset — prevents free-riding by spreading usage over weeks). Tracked via `Organization.trialCreditsUsed`. 14-day trial with card required; auto-converts to the plan the admin selects at checkout.

**Q4: Model gating UX — hide or downgrade?** ✅ **Resolved 2026-04-18:** Neither hide nor downgrade — **show all models with tier-gating and credit rates visible.** Higher-tier models appear in the picker with "(Standard required)" or "(Pro required)" label. Selecting a gated model opens a tier comparison modal. Each model also shows its credit rate ("6 credits/1K tokens") so users can self-manage their budget. See [UI: "Daily chat budget" framing](#ui-daily-chat-budget-framing) for details.

**Q5: How is token accounting handled when prompt caching is in play?** ✅ **Resolved 2026-04-18:** Credits are computed from **raw (uncached-equivalent) token counts** — `totalTokens` from the AI SDK's `onFinish` usage, not the billed/cached subset. This keeps credit consumption predictable for the user regardless of cache hit behavior. Both raw and cached token counts are recorded in `OrgUsage` for admin-side cost visibility.

---

## Data Model

### Schema Changes

**Organization model — new fields (amended 2026-04-15):**

```prisma
model Organization {
  // ... existing fields ...

  stripeCustomerId    String?  @unique @map("stripe_customer_id")
  subscriptionId      String?  @unique @map("subscription_id")
  subscriptionStatus  SubscriptionStatus @default(none) @map("subscription_status")
  seatCount           Int      @default(0) @map("seat_count")  // informational only — Q1 resolved: no seat billing
  billingExempt       Boolean  @default(false) @map("billing_exempt")
  trialEndsAt         DateTime? @map("trial_ends_at")

  // ✚ Added 2026-04-15, amended 2026-04-18
  tier                Tier     @default(starter) @map("tier")
  testTier            Tier?    @map("test_tier")         // admin override for billingExempt accounts — see Admin Backend
  trialCreditsUsed    Int      @default(0) @map("trial_credits_used")  // lifetime counter for trial orgs (21,000 budget)

  usage               OrgUsage[]
}
```

**Enums:**

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

// ✚ Added 2026-04-15
enum Tier {
  starter
  standard
  pro

  @@schema("agent")
}
```

**Webhook idempotency:**

```prisma
model StripeEvent {
  id          String   @id  // Stripe event ID (evt_xxx)
  type        String
  processedAt DateTime @default(now()) @map("processed_at")

  @@map("stripe_events")
  @@schema("agent")
}
```

**✚ Usage tracking (added 2026-04-15, amended 2026-04-18 for credit-based system):**

```prisma
model OrgUsage {
  id                 String   @id @default(cuid())
  orgId              String   @map("org_id")
  date               DateTime @db.Date @map("date")  // UTC midnight-aligned
  creditsUsed        Int      @default(0) @map("credits_used")       // primary cap-enforcement field
  totalTokens        Int      @default(0) @map("total_tokens")       // raw tokens for admin visibility
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

**✚ Admin audit log (added 2026-04-15):**

```prisma
model AdminAuditLog {
  id          String   @id @default(cuid())
  adminPcoId  String   @map("admin_pco_id")    // super-admin operator's PCO ID
  targetOrgId String?  @map("target_org_id")   // nullable for fleet-wide actions
  action      String                            // e.g. "set_billing_exempt", "set_test_tier", "clear_test_tier"
  before      Json?                             // previous field values
  after       Json?                             // new field values
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([adminPcoId])
  @@index([targetOrgId])
  @@index([createdAt])
  @@map("admin_audit_log")
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
2. Page shows current org status, tier, daily budget usage, and "Subscribe" button
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

> **Removed (Q1 resolved 2026-04-18).** Tiers replace seat-based pricing entirely. Orgs have unlimited users — individual church staff sign up on their own via PCO OAuth. There is no seat counting, no seat-update flow, no `/api/billing/seats` route, and no `seat-manager.tsx` component. The `seatCount` DB field is retained for informational purposes only (admin backend shows how many users are in an org, but it has no billing impact).

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
| `checkout.session.completed` | Link Stripe customer to org via `client_reference_id`. Set `stripeCustomerId`, `subscriptionId`. Set status to `trialing` or `active`. Set `tier` from selected plan. |
| `customer.subscription.created` | Set `subscriptionId`, `subscriptionStatus`, `trialEndsAt` |
| `customer.subscription.updated` | Update `subscriptionStatus`, `tier` (if plan changed) |
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
| `/billing` | Subscription status, tier, daily budget usage bar, pricing table, subscribe/manage/upgrade buttons, billing-exempt indicator | All users view status and pricing. Only admins see action buttons. Non-admins see "Only admins can manage billing" note. |

### New API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/billing/checkout` | POST | Admin | Create Stripe Checkout Session, return client secret |
| `/api/billing/portal` | POST | Admin | Create Stripe Customer Portal session, return URL |
| ~~`/api/billing/seats`~~ | ~~POST~~ | ~~Admin~~ | ~~Removed — Q1 resolved: tiers replace seats~~ |
| `/api/billing/usage` | GET | Authenticated | Return today's credit usage + budget for the caller's org (powers the budget progress bar) |
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
      admin/                      # ✚ Added 2026-04-15 — super-admin-gated
        layout.tsx                # Gates all /admin/* on isSuperAdmin(session.user)
        page.tsx                  # Landing dashboard (fleet totals, recent signups)
        orgs/
          page.tsx                # Sortable list of all orgs
          [id]/page.tsx           # Org detail: exempt toggle, tier override, usage history
        usage/
          page.tsx                # Fleet-wide usage dashboard
    api/
      billing/
        checkout/route.ts         # Create checkout session
        portal/route.ts           # Create portal session
        # seats/route.ts removed — Q1 resolved: tiers replace seats
        webhook/route.ts          # Stripe webhook handler
        reconcile/route.ts        # Daily reconciliation
      admin/                      # ✚ Added 2026-04-15
        orgs/
          [id]/
            exempt/route.ts       # PATCH — toggle billingExempt
            test-tier/route.ts    # PATCH — set/clear testTier
            usage/route.ts        # GET — fetch org usage history
  lib/
    billing/
      stripe.ts                   # Stripe client singleton
      webhook-handlers.ts         # Event processing logic (one function per event type)
      queries.ts                  # DB queries: getOrgBilling, updateSubscriptionStatus, etc.
      constants.ts                # Active statuses list, exempt route patterns, trial days
      tiers.ts                    # ✚ Tier configs: daily caps, allowed models, prices, model pricing table
      usage.ts                    # ✚ recordOrgUsage, getTodayUsage, effectiveTier, estimateCostCents
      caps.ts                     # ✚ Cap-check middleware for chat route + per-org concurrency guard
    admin/                        # ✚ Added 2026-04-15
      audit.ts                    # Admin audit log helpers
      queries.ts                  # Fleet-wide queries for admin dashboards
  components/
    billing/
      billing-status.tsx          # Current plan, tier, daily budget bar display
      checkout-form.tsx           # Stripe Embedded Checkout wrapper
      # seat-manager.tsx removed — Q1 resolved: tiers replace seats
      subscription-banner.tsx     # Warning banners (past_due, canceled/read-only, daily-cap-hit)
      tier-comparison.tsx         # ✚ Upgrade modal shown when user hits cap or picks disallowed model
    admin/                        # ✚ Added 2026-04-15
      org-table.tsx               # Admin org list table
      org-controls.tsx            # Exempt toggle + test-tier dropdown
      usage-chart.tsx             # Recharts/shadcn chart for daily tokens over time
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
| `ANTHROPIC_MASTER_API_KEY` | ✚ Yes (for app-provided key path) | Master key used for all paid-tier Anthropic traffic. Kept in env only, never persisted to DB. |
| `OPENAI_MASTER_API_KEY` | ✚ Yes (for app-provided key path) | Master key for paid-tier OpenAI traffic. |
| `GOOGLE_MASTER_API_KEY` | ✚ Yes (for app-provided key path) | Master key for paid-tier Google/Gemini traffic. |
| `SUPER_ADMIN_PCO_IDS` | ✚ Yes (for admin backend) | Comma-separated PCO user IDs allowed to access `/admin/*` pages. |

---

## Testing Strategy

### Stripe Test Mode

All development and CI use Stripe test mode keys (`sk_test_*`, `pk_test_*`). Stripe CLI (`stripe listen --forward-to localhost:3000/api/billing/webhook`) forwards test webhooks locally.

### Unit Tests (Vitest)

- `webhook-handlers.ts` — test each event handler with mocked Prisma. Verify correct DB field updates for each event type.
- `queries.ts` — test billing DB queries.
- `constants.ts` — test `isActiveSubscription` with each status value.
- Paywall logic — test proxy subscription check returns correct responses per status.
- **✚ `tiers.ts`** — test `effectiveTier()` precedence: `testTier` only honored when `billingExempt: true`; tier resolution for each enum value; `TIER_CONFIGS` completeness.
- **✚ `usage.ts`** — test `recordOrgUsage()` upsert semantics (new row vs increment existing), atomic counter behavior under concurrent calls, UTC midnight date bucketing.
- **✚ `caps.ts`** — test cap pre-check at various `todayUsage` levels (under soft margin, at 95% margin, over cap), `maxOutputTokens` computation, per-org concurrency counter increment/decrement under success and error paths.
- **✚ Failover wrapper** — test that a persistent 429 from the primary provider routes to the configured backup model and logs the event.
- **✚ Model resolver** — test that a Starter-tier org requesting Opus gets the tier-gated response per Q4 decision.

### E2E Tests (Playwright)

- Billing page renders correctly for each subscription state (`none`, `active`, `trialing`, `past_due`, `canceled`)
- Read-only degradation: input disabled, banner shown, history visible
- Admin sees action buttons, members don't
- `past_due` warning banner appears for admins only, not for non-admin users
- Don't test actual Stripe checkout in E2E — mock API responses
- **✚ Tier cap hit flow**: seed `OrgUsage` at 95% of Starter cap, send a chat message, verify 429 response and friendly in-app banner with correct upgrade prompt per admin vs non-admin
- **✚ Model gating**: Starter-tier org attempts to use Opus, verify tier-comparison modal or downgrade notice (per Q4)
- **✚ Super-admin flow**: allowlisted user visits `/admin/orgs`, toggles `billingExempt`, sets `testTier: 'pro'`, verifies cap enforcement behaves as Pro tier
- **✚ Non-super-admin access denied**: regular user (even an org admin) gets 403 on `/admin/*` routes

### Existing Test Compatibility

Test fixtures set `billingExempt: true` on the test organization so all existing test suites (chat, files, rules, memory) pass without modification. **✚ Amended:** Fixtures also set `testTier: 'pro'` on the exempt test org so existing tests have unrestricted model access and high enough daily cap to never trip the cap check. A separate fixture variant with `testTier: 'starter'` backs the tier-cap E2E tests above.

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

**In scope — added 2026-04-15:**
- **Tiered subscription plans** (Starter / Standard / Pro) with hard daily token caps
- **App-provided API keys** as the default model access path; BYOK retained in Settings as an escape hatch
- **Usage tracking** via new `OrgUsage` model, recorded post-stream from `onFinish` hook
- **Cap enforcement** in the chat route (pre-dispatch check at 95% of cap, per-request token ceiling, per-org concurrency guard)
- **Tier-gated model selection** (downgrade or hide models not included in the org's tier — final UX per Q4)
- **Native prompt caching** wiring on the system prompt (`cache_control` for Anthropic, automatic for OpenAI, explicit caching API for Google 2.5)
- **429 retry + failover** wrapper around `createModel()` for rate-limit resilience
- **`testTier` override** on Organization for QA simulation of tier-specific behavior
- **Super-admin backend pages** at `/admin/*`: org list, per-org detail with exempt/test-tier controls, fleet usage dashboard
- **Admin API routes** under `/api/admin/*` gated on `isSuperAdmin()`
- **`AdminAuditLog` model** recording every super-admin flag flip

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
- ~~Usage-based or metered billing~~ → now in scope via credit-based budget system
- ~~Multiple plan tiers (single plan, seat-based)~~ → now in scope: three tiers (Starter/Standard/Pro), seats removed
- ~~Per-seat pricing and seat management flows~~ → replaced by tier-based flat pricing
- Admin UI for refunds/credits (use Stripe Dashboard)
- Billing analytics dashboard beyond what the admin backend provides (use Stripe Dashboard for revenue)
- Church timezone-based daily reset (UTC midnight only for v1)
- BYOK bypass mode (BYOK users still consume org credits in v1)
- OpenRouter or other gateway integrations (direct SDKs only)
