# Feature: Rules System

**Status:** Complete
**Last Updated:** 2026-04-07

## What It Does
Three-layer rules system that assembles per-user behavior instructions into every AI system
prompt. Admins manage org-wide and system-default rules; members add personal rules. Every
user can toggle individual rules on or off independently.

## Key Files
- `src/lib/rules/assemble.ts` — `assembleRules(userId, orgId)` — builds the effective rule list for a user
- `src/lib/rules/queries.ts` — CRUD helpers: `listRulesForOrg`, `createRule`, `updateRule`, `deleteRule`, `toggleRule`, `getUserRuleSettings`
- `src/app/api/rules/route.ts` — `GET` (list + settings), `POST` (create rule)
- `src/app/api/rules/[id]/route.ts` — `PATCH` (edit content/category), `DELETE` (remove rule)
- `src/app/api/rules/toggle/route.ts` — `POST` toggle opt-in/opt-out per user
- `src/components/rules/rule-list.tsx` — Grouped rule list with toggle switches and delete
- `src/components/rules/rule-editor.tsx` — Inline form for creating new rules
- `src/app/(app)/rules/page.tsx` — `/rules` page (server component, passes session to `RuleList`)
- `prisma/seed.ts` — Seeds system default rules into the DB

## Design Decisions
- Rules are plain English text — no code, no logic, no templating. The AI interprets them.
- Three rule types stored in one `rules` table: `system`, `org`, `user`
- Default-on semantics for system/org rules: active unless the user explicitly opts out
- Default-off semantics for other users' public rules: inactive unless the user opts in
- User's own rules are always active (no self-toggle needed)
- `assembleRules` returns `string[]` by default; pass `formatAsPrompt: true` for a numbered string ready to inject into a system prompt
- Admin role check is server-side at the API layer — non-admins are silently downgraded to `user` rule type on create
- System rules are immutable — `PATCH` and `DELETE` return 403 for `ruleType === 'system'`
- Optimistic UI toggle in `RuleList` — state updated immediately, API call fires async

## Known Limitations
- No drag-and-drop reorder for `sortOrder` — currently only set at creation time
- No inline edit for existing rules — must delete and recreate to change content
- `RuleEditor` error state is swallowed silently (no user-facing error message on save failure)
- No category filter on the rules page — all categories shown in a single grouped view
- No bulk enable/disable — each rule must be toggled individually
- `system` rules can only be changed via `prisma/seed.ts` re-seed, not through the UI
