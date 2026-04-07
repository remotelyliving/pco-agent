# Feature: Memory System

**Status:** Complete
**Last Updated:** 2026-04-07

## What It Does
Persistent key-value fact store scoped to org and/or user. Facts are auto-extracted after each
AI response using the cheapest available model, then injected into every subsequent conversation's
system prompt. Admins can also manually add, view, and delete org-level facts at `/memory`.

## Key Files
- `src/lib/memory/queries.ts` — `getOrgMemories`, `getUserMemories`, `getAllMemoriesForUser`, `upsertMemory`, `updateMemory`, `deleteMemory`
- `src/lib/memory/extract.ts` — `extractAndSaveMemories(orgId, userId, userMsg, assistantMsg, provider, apiKey)` — fire-and-forget post-response extraction
- `src/lib/memory/retrieve.ts` — `getMemoryPrompt(orgId, userId)` — returns formatted prompt string with org and personal sections
- `src/app/api/memory/route.ts` — `GET` (list org memories), `POST` (admin create)
- `src/app/api/memory/[id]/route.ts` — `PATCH` (admin update key/value), `DELETE` (admin delete)
- `src/components/memory/memory-list.tsx` — Memory management UI with add form and delete button (admin-gated)
- `src/app/(app)/memory/page.tsx` — `/memory` page (server component, passes `isAdmin` to `MemoryList`)
- `prisma/schema.prisma` — `Memory` model with `@@unique([orgId, userId, key])`

## Design Decisions
- **Dual scoping**: `userId=null` = org-level fact (shared across all users); `userId` set = user-level fact (personal). Both are fetched together by `getAllMemoriesForUser` and rendered in separate prompt sections.
- **Auto-extraction is fire-and-forget**: `extractAndSaveMemories` is called in the chat route's `onFinish` callback without `await`. Extraction failures are caught and swallowed — memory is best-effort and never blocks a response.
- **Cheapest model per provider**: Extraction uses `claude-haiku-4-5`, `gpt-4o-mini`, or `gemini-2.0-flash` depending on the user's configured provider. Falls back to Haiku if the provider is unrecognized.
- **Upsert semantics**: `upsertMemory` uses `@@unique([orgId, userId, key])` — re-extracting the same fact updates its value rather than duplicating it.
- **Prompt structure**: `getMemoryPrompt` returns two headed sections — `## Known facts about this church` for org memories and `## Your personal notes` for user memories. An empty string is returned if no memories exist (no prompt pollution).
- **Admin-only write access**: `POST`, `PATCH`, and `DELETE` on the API routes check `session.user.role === 'admin'`. Members can see the `/memory` page (read-only) but cannot add or delete.
- **Source tracking**: Every memory record carries a `source` field — `"auto"` for extraction, `"manual"` for admin-created. Displayed as a badge in the UI.

## Polish Pass (2026-04-07)
Fixed during comprehensive review + polish on branch `fix/buff-and-polish`:
- `/memory` page org-only → now shows both org memories and the current user's personal memories in separate labeled sections
- Memory source labels → friendly display names ("Auto-extracted" / "Manually added") instead of raw `auto`/`manual` strings
- Memory `NULL` uniqueness → `upsertMemory` now uses `findFirst` pattern to safely handle `userId=null` in unique constraints
- Settings auth check → added to memory API routes

## Known Limitations
- No user-facing memory management for members — members can view personal memories but cannot add or delete them through the UI
- Auto-extraction only covers the most recent user/assistant message pair, not the full conversation history
- No deduplication or merging of semantically similar facts — keys must match exactly to upsert
- No extraction for tool call content (MCP tool results are not included in the extraction prompt)
- No memory TTL or expiry — facts persist indefinitely until manually deleted
- No pagination on the memory list — could be slow for orgs with many extracted facts
