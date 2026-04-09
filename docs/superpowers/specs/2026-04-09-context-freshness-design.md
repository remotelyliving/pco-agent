# Context-Aware Conversation Freshness

## Problem

AI models degrade in quality as conversations approach their context window limit — a phenomenon called "context rot." Our non-technical users (18-70, church staff) have no way to know this is happening. They'll experience worse responses without understanding why, potentially losing confidence in the product.

## Solution

Track real token usage reported by model providers after each response. When remaining context capacity drops below a threshold, display a friendly, non-technical warning offering to start a fresh conversation with a carried-over summary. Fully automatic — no user decisions about summaries or technical details.

## Design Principles

- **Never guess.** Only use exact token counts returned by the provider API. If usage data is unavailable (aborted stream, error), skip the check entirely.
- **Speak human.** No tokens, no percentages, no context windows. The AI talks about itself naturally: "I'm getting close to the limit of what I can keep track of."
- **Low friction.** One click to start fresh. Old conversation stays in history. Summary generation is invisible.
- **Low pressure.** Users can dismiss and continue. The warning doesn't nag.

---

## 1. Model Metadata — Context Windows

Add `contextWindow` (in tokens) to `ModelOption` in `src/lib/ai/models.ts`:

| Model | Context Window |
|-------|---------------|
| Claude Opus 4.6 | 1,000,000 |
| Claude Sonnet 4.6 | 1,000,000 |
| Claude Haiku 4.5 | 200,000 |
| GPT-4.1 | 1,000,000 |
| GPT-4.1 Mini | 1,000,000 |
| GPT-4.1 Nano | 1,000,000 |
| Gemini 2.5 Flash | 1,048,576 |
| Gemini 2.5 Pro | 1,048,576 |
| Gemini 2.5 Flash-Lite | 1,048,576 |

Add helper: `getContextWindow(modelId: string): number` — returns the context window for a model ID, with a conservative fallback of 200,000 for unknown models.

## 2. Server-Side Threshold Detection

### Fix: Use `totalUsage` Instead of `usage`

The current `onFinish` callback uses `usage`, which only captures the final step's token count. For multi-step tool-calling flows, this undercounts. Switch to the `totalUsage` property which aggregates across all steps in a `streamText` call.

### Threshold Formula

```
threshold = max(50_000, contextWindow * 0.10)
remaining = contextWindow - totalUsage.totalTokens
nearLimit = remaining < threshold
```

This means:
- Haiku (200K): warns at 50K remaining (floor kicks in over 10%)
- Opus/GPT-4.1/Gemini (1M+): warns at ~100K remaining (10%)
- All models get at least 50K buffer

### Pipe to Client via `messageMetadata`

The `toUIMessageStreamResponse()` call gains a `messageMetadata` option:

```typescript
result.toUIMessageStreamResponse({
  messageMetadata: {
    nearLimit: boolean,       // true when threshold crossed
    remainingTokens: number,  // for future use (not displayed to user)
    contextWindow: number,    // for future use (not displayed to user)
  },
  headers: { ... },
});
```

When `nearLimit` is false (the common case), `messageMetadata` can be omitted or sent with `nearLimit: false` — the client ignores it.

If `totalUsage` is undefined (aborted stream, error, etc.), do NOT set `nearLimit: true`. Skip the check entirely.

## 3. Client-Side Warning Banner

### Component: `ContextWarningBanner`

Location: `src/components/chat/context-warning-banner.tsx`

**Appears when:** The most recent assistant message has `nearLimit: true` in its metadata, AND the user hasn't dismissed it or already compacted.

**Design:**
- Inline block below the triggering message, same width as message bubbles, left-aligned (assistant side)
- Warm amber background (`bg-amber-50 border-amber-200`) — not red, not an error
- Friendly copy in AI voice:

  > "I'm getting close to the limit of what I can keep track of in this conversation. Want to start a fresh chat? I'll carry over a summary so we don't lose context."

- Primary CTA button: **"Start fresh chat"** (amber/warm styling, 48px touch target)
- Secondary text link: **"Continue anyway"** (muted, dismisses banner)

**Behavior:**
- Dismissal stored in `localStorage` keyed by conversation ID (`context-warning-dismissed:{convId}`)
- If dismissed, banner never reappears for that conversation — even on page reload
- If NOT dismissed and user reloads, banner reappears if last message has `nearLimit: true`
- Only one banner ever shown per conversation (even if multiple messages have `nearLimit: true`)

### Reading Message Metadata

The `useChat()` hook from `@ai-sdk/react` exposes message metadata when the server sends it via `messageMetadata` in `toUIMessageStreamResponse()`. The client reads it from the message's metadata property to determine whether to show the banner.

## 4. Summary Generation & Conversation Handoff

### New Endpoint: `POST /api/conversations/[id]/compact`

Auth: requires session, conversation must belong to the user.

**Steps:**

1. Fetch all messages for the conversation (ordered by `createdAt`)
2. Load user's API key + provider (same pattern as chat route)
3. Call `generateText()` with the user's configured model and this prompt:

   > "Summarize this conversation concisely. Capture: what the user was working on, key decisions made, any outstanding questions or next steps. Write this as a briefing for a new conversation — not a transcript. Keep it under 500 words."

4. Create a new conversation titled `"Continued: {originalTitle}"`
5. Save the summary as the first message with role `system` (or a `MessageRole.summary` if we add one — see below)
6. Return JSON: `{ newConversationId: string }`

**Model selection:** Use the user's configured model. The summary prompt is short — cost is negligible even on expensive models. No need to implement cheap-model selection logic.

**Error handling:** If summary generation fails, return a 500 with `{ error: "Could not generate summary. You can continue this conversation or start a new one from the sidebar." }` The client shows this message in the banner area.

### Summary Message Storage

Option A: Use `MessageRole.summary` — add a new enum value to Prisma schema. Cleanly distinguishes summary context from user/assistant messages.

Option B: Use `MessageRole.system` — no schema change, but `system` messages don't currently exist in the DB.

**Decision: Option A** — adding an enum value is a trivial migration and makes intent clear. The summary message:
- Has role `summary`
- Contains the generated briefing text
- Is always the first message in a compacted conversation

### Summary Injection in Chat Route

When building the system prompt in the chat route, check if the conversation's first message is a `summary` message. If so, append it to the system prompt:

```
## Previous Conversation Context

{summary text}
```

This keeps the summary out of the message array (it's context, not conversation) and ensures the model sees it as background knowledge.

### Client-Side Rendering of Summary

In the new conversation, the summary message renders as a collapsed block at the top of the chat:

- Light gray background, subtle border
- Header: "Summary from previous conversation" with expand/collapse chevron
- Collapsed by default — users who want to see it can expand
- Links to the original conversation: "View original conversation" → `/chat/{originalConvId}`

## 5. Edge Cases

**Token count unavailable:** If `totalUsage` is undefined (aborted stream, error), skip the threshold check. Never warn based on absence of data.

**Conversation has very few messages:** If a single massive file upload consumes most of the context, the warning still fires and the summary still captures what was discussed. This is correct behavior.

**Multiple `nearLimit` responses before user acts:** Only show the banner once. Track via localStorage.

**User navigates away and back:** Banner reappears on reload if last message has `nearLimit: true` and localStorage doesn't have the dismissed flag.

**Summary generation fails:** Show error message in the banner area. Don't block the user — they can continue or start fresh manually from the sidebar.

**User has no messages worth summarizing:** The summary prompt handles this gracefully — a short conversation produces a short summary.

## 6. Rate Limiting

Add the compact endpoint to the rate limiter in `proxy.ts`:
- `/api/conversations/:id/compact`: 5 requests per minute (prevent abuse — this makes an AI call)

## 7. Files Not Included

- **No changes to the database schema beyond adding `MessageRole.summary`** — we already store `tokenCount` on messages
- **No new dependencies** — uses existing AI SDK, Prisma, and React patterns
- **No changes to memory extraction** — continues to work as-is on both old and new conversations

## 8. Future Enhancements (Not In Scope)

- **Proactive quality detection:** Analyze response quality metrics to warn even before hitting token thresholds
- **Progressive summarization:** Instead of one big summary at the end, periodically compress older messages mid-conversation
- **Cost tracking:** Use the per-message token counts to show estimated API spend
- **Virus scanning for uploaded files** (tracked in KNOWN_ISSUES.md)
- **Prompt injection detection for uploaded files** (tracked in KNOWN_ISSUES.md)
