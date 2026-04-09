# AI Provider Research — April 2026

> **Purpose:** Verified pricing and model data for the onboarding wizard (UX Enhancement #6). This data was web-scraped from official sources on 2026-04-08. Prices change — verify before each release.
>
> **Last Verified:** 2026-04-08

---

## Anthropic (Claude)

**Source:** [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing), [platform.claude.com/docs/en/docs/about-claude/models](https://platform.claude.com/docs/en/docs/about-claude/models)

### Models (Current)

| Model | API ID | Input/MTok | Output/MTok | Context | Max Output | Best For |
|-------|--------|-----------|------------|---------|------------|----------|
| Claude Opus 4.6 | `claude-opus-4-6` | $5.00 | $25.00 | 1M | 128K | Most capable — complex reasoning, coding, agents |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3.00 | $15.00 | 1M | 64K | Best speed/intelligence balance |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | $1.00 | $5.00 | 200K | 64K | Fastest, most affordable |

**Aliases:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` (resolve to latest snapshot)

### Legacy Models (Still Available)

| Model | API ID | Input/MTok | Output/MTok |
|-------|--------|-----------|------------|
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | $3.00 | $15.00 |
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | $5.00 | $25.00 |
| Claude Opus 4.1 | `claude-opus-4-1-20250805` | $15.00 | $75.00 |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | $3.00 | $15.00 |
| Claude Opus 4 | `claude-opus-4-20250514` | $15.00 | $75.00 |
| Claude Haiku 3.5 | `claude-3-5-haiku-20241022` | $0.80 | $4.00 |

**Deprecated:** Claude Haiku 3 (`claude-3-haiku-20240307`) — retiring April 19, 2026.

### Cost Estimates (for wizard)

Using Claude Sonnet 4.6 (recommended default):
- Average chat message (~1K input + ~500 output tokens): ~$0.01
- Heavy conversation (10K input + 2K output): ~$0.06
- Rough estimate: **~500 messages for $5**

Using Claude Haiku 4.5 (budget option):
- Average chat message: ~$0.004
- Rough estimate: **~1,200 messages for $5**

### Billing

- **Prepaid credits** — load balance, usage deducts from it
- Auto-reload available
- New users receive a small amount of free credits (amount varies)
- No free tier for ongoing API use

### Sign-Up Steps

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create account (email or Google SSO)
3. Add payment method (credit card)
4. Navigate to **API Keys** in dashboard
5. Click **Create Key**, name it, copy the `sk-ant-...` value

### Rate Limits

Tiered by cumulative spend (Tier 1–4). New accounts start at Tier 1. Limits increase automatically as spend grows.

---

## OpenAI (GPT)

**Source:** [developers.openai.com](https://developers.openai.com/api/docs/pricing) (individual model pages), cross-referenced with costgoat.com and pricepertoken.com

### Models (Current — Recommended)

| Model | API ID | Input/MTok | Output/MTok | Context | Max Output | Best For |
|-------|--------|-----------|------------|---------|------------|----------|
| GPT-4.1 | `gpt-4.1` | $2.00 | $8.00 | ~1M | 32K | Best balance of capability and cost |
| GPT-4.1 Mini | `gpt-4.1-mini` | $0.40 | $1.60 | ~1M | 32K | Good and affordable |
| GPT-4.1 Nano | `gpt-4.1-nano` | $0.10 | $0.40 | ~1M | 32K | Cheapest, simple tasks |
| GPT-4o | `gpt-4o` | $2.50 | $10.00 | 128K | 16K | Proven multimodal model |
| GPT-4o Mini | `gpt-4o-mini` | $0.15 | $0.60 | 128K | 16K | Budget multimodal |

### Models (Frontier — Latest)

| Model | API ID | Input/MTok | Output/MTok | Notes |
|-------|--------|-----------|------------|-------|
| GPT-5.4 | `gpt-5.4` | $2.50 | $15.00 | Latest frontier model |
| GPT-5.4 Mini | `gpt-5.4-mini` | $0.75 | $4.50 | |
| GPT-5.4 Nano | `gpt-5.4-nano` | $0.20 | $1.25 | |

**Confidence:** GPT-4.1 family verified from official model pages. GPT-5.4 family verified from official pricing page. GPT-4o family from multiple consistent third-party sources.

### Reasoning Models (o-series)

| Model | API ID | Input/MTok | Output/MTok | Notes |
|-------|--------|-----------|------------|-------|
| o4-mini | `o4-mini` | $1.10 | $4.40 | Latest reasoning model (verified) |
| o3 | `o3` | $2.00 | $8.00 | |
| o3-pro | `o3-pro` | $20.00 | $80.00 | Premium reasoning |

**Note:** Reasoning models are optimized for step-by-step problem solving. Not recommended as default for a church chat app — better suited for complex analytical tasks.

### Cost Estimates (for wizard)

Using GPT-4.1 (recommended default):
- Average chat message: ~$0.006
- Rough estimate: **~800 messages for $5**

Using GPT-4.1 Nano (budget option):
- Average chat message: ~$0.0003
- Rough estimate: **~15,000 messages for $5**

### Billing

- **Prepaid credits** — minimum $5 purchase
- Credits expire after 1 year
- No free trial credits (discontinued mid-2025)
- API key creation is free; billing required before API calls

### Sign-Up Steps

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create account (email or Google/Microsoft SSO)
3. Navigate to **API Keys** section
4. Click **Create new secret key**, name it, copy immediately
5. Add payment method under **Billing** (minimum $5)

### Rate Limits

Tiered by cumulative spend (Tier 1–5). New accounts start at Tier 1 after adding payment.

---

## Google (Gemini)

**Source:** [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)

### Models (Current — Stable)

| Model | API ID | Input/MTok | Output/MTok | Context | Best For |
|-------|--------|-----------|------------|---------|----------|
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | $0.10 | $0.40 | — | Cheapest option available |
| Gemini 2.5 Flash | `gemini-2.5-flash` | $0.30 | $2.50 | — | Fast and capable |
| Gemini 2.5 Pro | `gemini-2.5-pro` | $1.25 | $10.00 | — | Most capable stable model |

**Deprecation warning:** Gemini 2.5 Flash and 2.5 Pro deprecating **June 17, 2026**. Plan migration to 3.x.

### Models (Preview — Next Generation)

| Model | API ID | Input/MTok | Output/MTok | Notes |
|-------|--------|-----------|------------|-------|
| Gemini 3 Flash | `gemini-3-flash-preview` | $0.50 | $3.00 | Preview |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite-preview` | Uncertain | Uncertain | Preview |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | $2.00 | $12.00 | Preview, replaces deprecated 3 Pro |

### Free Tier (Unique to Google)

**No credit card required.** Free tier includes:

| Model | Requests/min | Requests/day | Tokens/min |
|-------|-------------|-------------|------------|
| Gemini 2.5 Pro | 5 | 100 | 250K |
| Gemini 2.5 Flash | 10 | 250 | 250K |
| Gemini 2.5 Flash-Lite | 15 | 1,000 | 250K |

Full 1M context window available on free tier. Daily quotas reset at midnight Pacific.

**Note (uncertain):** One source suggested Pro may have been removed from free tier in April 2026. Verify before shipping.

### Cost Estimates (for wizard)

Using Gemini 2.5 Flash (recommended default):
- Average chat message: ~$0.002
- Rough estimate: **~2,500 messages for $5**
- Or **free** within daily limits (250 requests/day)

Using Gemini 2.5 Flash-Lite (budget option):
- Average chat message: ~$0.0003
- Rough estimate: **~15,000 messages for $5**
- Or **free** within daily limits (1,000 requests/day)

### Billing

- **Free tier** available with no credit card
- Paid tier: **Prepaid credits** (minimum $10, max balance $5,000, expire after 12 months)
- Postpay (monthly invoicing) only available at Tier 3+
- Batch API available at 50% discount

### Sign-Up Steps

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in with any Google account
2. Accept Google's Generative AI Terms of Service
3. Click **"Get API key"** in the left sidebar
4. Click **"Create API key in new project"** — auto-creates a Cloud project
5. Copy the generated key — start making API calls immediately
6. (Optional) Add billing for higher rate limits

### Rate Limits

| Tier | RPM | Daily Requests | Spend Cap |
|------|-----|---------------|-----------|
| Free | 5–15 (varies) | 100–1,000 | $0 |
| Tier 1 (billing enabled) | 150–300 | Effectively unlimited | $250/mo |
| Tier 2 ($250+ cumulative) | 1,000+ | Unlimited | $2,000/mo |

---

## Comparison Summary (for wizard)

### For Non-Technical Users

| Provider | Cheapest Option | ~Messages per $5 | Free Tier? | Easiest Setup? |
|----------|----------------|-------------------|------------|----------------|
| **Google (Gemini)** | Flash-Lite: $0.10/$0.40 | ~15,000 | Yes — no credit card needed | Easiest (Google account) |
| **OpenAI (GPT)** | 4.1 Nano: $0.10/$0.40 | ~15,000 | No | Medium (requires $5 prepay) |
| **Anthropic (Claude)** | Haiku 4.5: $1.00/$5.00 | ~1,200 | Small trial credits | Medium |

### Recommended Defaults by Use Case

- **Budget-conscious / trying it out:** Google Gemini 2.5 Flash (free tier, no credit card)
- **Best overall quality:** Claude Sonnet 4.6 or GPT-4.1 (similar price, both excellent)
- **Maximum capability:** Claude Opus 4.6 (most intelligent, highest cost)

---

## Items to Verify Before Release

1. Whether Google still offers Gemini 2.5 Pro on free tier
2. Gemini 3.1 Flash-Lite pricing (not confirmed)
3. OpenAI o3-mini pricing (conflicting sources: $0.50/$2.00 vs $1.10/$4.40)
4. Whether Anthropic's trial credit amount has changed
5. All pricing pages linked above — do a manual spot-check
