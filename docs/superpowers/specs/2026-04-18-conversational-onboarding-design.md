# Conversational Onboarding Design

## Problem

After completing the setup wizard (provider/model/API key), users land on a blank chat with no context about who they are, what they do, or how they prefer to work. The AI has PCO tool access but zero personalization — it doesn't know the user's role, their church's structure, or how to tailor its behavior. Users must discover the system's capabilities on their own.

## Goal

Replace the cold-start experience with a conversational onboarding flow that learns about the user through natural dialogue and automatically configures the system (rules, memories) based on what it learns. This embodies the project's mission: end-to-end configuration through natural language.

## Design

### Flow Trigger & Conversation Seeding

The setup wizard's final step ("You're All Set!") calls `POST /api/conversations/onboarding` instead of linking directly to `/chat`. This endpoint:

1. Checks whether org-level memories already exist (determines seed message variant)
2. Creates a normal conversation record
3. Saves a pre-written assistant greeting as the first message
4. Returns `{ conversationId }`

The wizard redirects to `/chat/{conversationId}`. The user sees the AI's greeting immediately.

**Seed message — first user from org (admin):**
> "Hey [name]! I'm Service Planner — I'll be helping you work with your Planning Center data through conversation. Before we dive in, I'd love to learn a little about you and your church so I can be as helpful as possible. What's your role at your church?"

**Seed message — subsequent user (org memories exist):**
> "Hey [name]! I'm Service Planner — I'll be helping you work with your Planning Center data. I already know a bit about [Church Name] from your team, but I'd like to learn about you specifically. What's your role there?"

### User-Level Onboarding State

A new boolean field on the `User` model tracks onboarding completion:

```prisma
model User {
  // ... existing fields ...
  onboardingComplete Boolean @default(false) @map("onboarding_complete")
}
```

The chat route checks `user.onboardingComplete`. If `false`, onboarding instructions are appended to the system prompt. This means:
- The onboarding conversation has no special schema — it's a normal conversation
- If the user starts a second chat before finishing, onboarding instructions still apply
- No wasted boolean column on every conversation record

### System Prompt Onboarding Instructions

When `user.onboardingComplete === false`, the chat route appends an onboarding instruction block to the system prompt. This layers on top of the existing PCO data model and tool instructions — no duplication needed.

**For first-in-org admins (no org memories):**

```
## Onboarding Mode

You are having a getting-to-know-you conversation with a new user. Ask ONE question
at a time. Be warm and conversational — this should feel like meeting a new coworker,
not filling out a form.

Cover these topics in roughly this order:
1. Their role at the church (already asked in seed message)
2. What tasks they spend the most time on in Planning Center
3. A brief picture of their church — size, number of services, anything notable
4. How their teams/volunteers are organized
5. Any preferences for how you should communicate (brief vs. detailed, confirm before
   acting, etc.)

When you've covered enough ground (or the user pivots to a real question), wrap up
naturally. Say something like "Great — I've got a good picture of how to help you.
You can always tell me more anytime and I'll remember."

If the user asks a real question at any point, answer it immediately. Don't force
the interview. You can circle back with "By the way..." if there's something important
you haven't learned yet.
```

**For subsequent users (org memories exist):**

Same structure but topics 3-4 replaced with:
```
3. Whether there's anything about how the church uses PCO that's specific to their work
4. Any preferences for how you should communicate
```

Total depth: 5-6 questions for first-in-org, 3-4 for subsequent users.

### Skippability

No skip button. If the user types a real question at any point, the AI answers it immediately and pivots to being a normal assistant. The onboarding extraction still runs on whatever was gathered up to that point. This respects user autonomy without adding UI complexity.

### Structured Onboarding Extraction

A dedicated `extractOnboardingProfile` function replaces the generic `extractAndSaveMemories` for the onboarding pass. It processes the full conversation (not individual message pairs) with explicit categorization:

```typescript
const onboardingSchema = z.object({
  items: z.array(z.object({
    content: z.string(),       // The actual text to store
    key: z.string(),           // snake_case identifier
    destination: z.enum([
      'user_memory',           // Facts about this person
      'org_memory',            // Facts about the church
      'user_rule',             // Behavioral instructions for the AI
    ]),
  })),
});
```

**Routing logic:**
- `user_memory` → `upsertMemory(orgId, key, value, 'auto', userId)`
- `org_memory` → `upsertMemory(orgId, key, value, 'auto', null)` — only if user is admin; otherwise stored as `user_memory`
- `user_rule` → creates a `Rule` with `ruleType: 'user'`, `visibility: 'private'`, owned by the user

**When extraction runs:** Not after every message. The onboarding extraction runs after each assistant response but only performs the full categorized extraction once, using a heuristic: if the conversation has at least 3 user-assistant exchanges, or if the assistant's latest message signals wrap-up (contains phrases like "got a good picture" or "tell me more anytime"), or if the user's message triggered a tool call (indicating they pivoted to a real question). Once extraction runs successfully, `onboardingComplete` flips to `true` immediately.

After extraction completes, `user.onboardingComplete` is set to `true`. All subsequent messages use the normal chat flow with normal memory extraction.

The generic `extractAndSaveMemories` is suppressed during onboarding to avoid lower-quality duplicate extraction.

### Client-Side Changes

- **Setup wizard step 5**: "Start Chatting" button calls the onboarding endpoint, then redirects to `/chat/{id}`
- **Chat interface**: No changes needed. The onboarding conversation is a normal chat. The textarea placeholder remains "Ask about your church data..." — context is clear from the AI's greeting
- **Sidebar**: Onboarding conversation appears titled "Getting Started". Users can rename or delete it later. No special UI treatment
- **Returning users who didn't finish**: The conversation stays in the sidebar. `onboardingComplete` is still `false`, so onboarding instructions apply if they continue it or start any new chat. No nagging or forced re-entry

### Schema & File Changes

**Prisma migration:** One `ALTER TABLE` adding `onboarding_complete BOOLEAN DEFAULT false` to the users table.

**New files:**
- `src/lib/memory/extract-onboarding.ts` — structured extraction with categorized routing
- `src/app/api/conversations/onboarding/route.ts` — conversation seeding endpoint

**Modified files:**
- `prisma/schema.prisma` — new field on User model
- `src/app/api/chat/route.ts` — check `onboardingComplete`, inject onboarding instructions, trigger onboarding extractor, flip flag when done
- `src/components/setup/setup-wizard.tsx` — step 5 calls onboarding endpoint instead of linking to `/chat`

### Example Extraction Output

From a first-user onboarding conversation:

| Key | Value | Destination |
|-----|-------|-------------|
| `church_size` | ~400 members | org_memory |
| `sunday_services` | 3 services each Sunday morning | org_memory |
| `worship_style` | contemporary | org_memory |
| `role` | worship director | user_memory |
| `primary_tasks` | volunteer scheduling, setlist building | user_memory |
| `team_structure` | team leads pick musicians, user fills gaps | user_memory |
| (rule) | Keep responses brief and concise | user_rule |
| (rule) | Always confirm before scheduling anyone | user_rule |

### Testing Strategy

- **Unit tests**: Onboarding extraction schema parsing, routing logic (admin vs. member for org memories), seed message selection
- **Integration tests**: Full onboarding flow — wizard completion → conversation creation → onboarding chat → extraction → flag flip → normal chat mode
- **Edge cases**: User pivots on first message (minimal extraction), user closes browser mid-onboarding (resumes correctly), second user from org (skips org questions), non-admin tries to provide org context (stored as user memory)
