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
- `src/components/chat/chat-interface.tsx` — useChat() client component
- `src/components/chat/message-bubble.tsx` — Message display with tool call support
- `src/components/settings/api-key-form.tsx` — API key entry form
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

## Known Limitations
- No conversation deletion
- No message editing or regeneration
- Auto-title uses first 100 chars (not AI-generated summary)
- No token usage tracking
- No rate limiting on chat route
- Settings page has no "test connection" button
- Sidebar conversation list is not real-time (requires page refresh)
