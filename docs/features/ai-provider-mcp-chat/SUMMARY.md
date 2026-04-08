# Feature: AI Provider + MCP + Chat

**Status:** Complete
**Last Updated:** 2026-04-07

## What It Does
Multi-provider AI chat interface with MCP tool integration for accessing Planning Center
data. Users configure their own API key (Anthropic/OpenAI/Google), choose a model, and
chat with an AI assistant that can search people, view services, and manage church data.

## Key Files
- `src/lib/ai/providers.ts` — Runtime provider factory (creates model from user's stored key)
- `src/lib/ai/models.ts` — Model options metadata for UI
- `src/lib/chat/persist.ts` — Conversation and message CRUD
- `src/app/api/chat/route.ts` — Chat streaming route (AI SDK + MCP + persistence)
- `src/app/api/settings/route.ts` — Settings API (save provider, encrypted key, model)
- `src/app/api/settings/test/route.ts` — Test connection endpoint (validates API key live)
- `src/app/api/conversations/[id]/route.ts` — Conversation DELETE endpoint
- `src/components/chat/chat-interface.tsx` — useChat() client component with auto-resize textarea and example prompts
- `src/components/chat/message-bubble.tsx` — Message display with tool call support
- `src/components/conversation-item.tsx` — Conversation list item with inline delete confirm
- `src/components/settings/api-key-form.tsx` — API key entry form with test connection button
- `src/app/(app)/settings/page.tsx` — Settings page
- `src/app/(app)/chat/[id]/page.tsx` — Conversation resume page

## Design Decisions
- BYO API key — no server-side AI key, reduces cost/liability
- Fernet encryption for API keys at rest
- MCP transport type 'sse' for pco-mcp compatibility
- Graceful MCP degradation — chat works without PCO data if MCP fails
- Auto-title conversations from first assistant response
- maxSteps: 5 for multi-turn tool calling
- Minimal system prompt (rules system comes in Plan 3)

## Polish Pass (2026-04-07)
Fixed during comprehensive review + polish on branch `fix/buff-and-polish`:
- Conversation deletion → implemented (`DELETE /api/conversations/[id]` + inline delete confirm in sidebar)
- Settings "test connection" → added (`POST /api/settings/test` + button on API key form)
- `maxDuration` → added to chat route to prevent Vercel edge timeout
- `getDefaultModelId` duplication → removed; unified through `getDefaultModel()`
- MCP client leak → wrapped in try/catch with proper cleanup
- Conversation injection (security) → fixed with conversation ownership verification
- Auto-title → improved to use first meaningful assistant sentence rather than raw char slice
- Chat interface → auto-resize textarea and example prompts for empty state

## Known Limitations
- No message editing or regeneration
- Sidebar conversation list is not real-time (requires page refresh)
