# UX Enhancements Backlog

> **Status:** All 7 items COMPLETE — implemented on `feature/ux-enhancements` branch (2026-04-08)
>
> **Purpose:** Captured from first real-user session (2026-04-08). Each item is a discrete unit of work suitable for planning and implementation. Items are ordered by dependency (later items may depend on earlier ones).

---

## 1. ~~Consistent Typography — Modern Sans-Serif Font~~ DONE

**What:** Font sizes and typefaces are inconsistent across the app. Adopt a single modern sans-serif font family (e.g., Inter, Geist, or similar) with a clear type scale applied globally.

**Scope:**
- Pick and import a font (via `next/font` for performance)
- Define a type scale (heading sizes, body, caption, label)
- Apply consistently across all pages and components
- Ensure Tailwind config uses the font as the default sans family

---

## 2. ~~Rebrand to "Service Planner"~~ DONE

**What:** Rename the app from "Planning Center Assistant" to "Service Planner" everywhere. Add a robot SVG icon as the app logo.

**Scope:**
- Create or source a simple robot SVG icon
- Update login page heading, sidebar branding, page titles, `<title>` metadata
- Update setup wizard welcome text
- Update README and any user-facing documentation references

---

## 3. ~~Logout Button~~ DONE

**What:** The sign-out action should be a clearly visible button, not a text link or hidden action.

**Scope:**
- Restyle the sign-out control in the sidebar as a proper button
- Ensure it's obvious on both desktop and mobile nav

---

## 4. ~~Send Button Alignment & Sizing~~ DONE

**What:** The chat send button has poor alignment and sizing relative to the text input.

**Scope:**
- Vertically align the send button with the auto-resize textarea
- Size it appropriately (touch-friendly, visually balanced)
- Test at various viewport widths and with multi-line input

---

## 5. ~~Gate Chat Behind Model Configuration~~ DONE

**What:** Chat should not be available until the user has configured an AI provider and model. Users without config should be clearly redirected to settings with an explanation of why.

**Scope:**
- `/chat` page checks for API key + model config; redirects to `/setup` if missing
- Show a clear, non-technical message explaining they need to set up an AI provider first
- Note: the `needsSetup()` helper and redirect already exist but may need refinement
- Prerequisite for item 6

---

## 6. ~~Enhanced Onboarding Wizard~~ DONE

**What:** A comprehensive, non-technical onboarding flow that guides new users through AI provider selection and model configuration. Replaces/enhances the current basic setup wizard.

**Depends on:** Item 5 (chat gating)

**Scope:**
- **Provider selection step:** Explain each vendor (Anthropic/Claude, OpenAI/ChatGPT, Google/Gemini) in plain language — what they're known for, subscription costs, free tiers, pricing models. No jargon. Help church staff make an informed decision.
- **Model selection step:** After provider is chosen, explain available models in terms of capability vs. cost. Use analogies non-technical users understand (e.g., "faster but simpler" vs. "slower but handles complex questions better"). Show estimated per-message costs if possible.
- **API key entry step:** Walk through where to get an API key for the selected provider, with screenshots or links to the provider's key page.
- **Idempotent / safe navigation:** Users can go back to any previous step without losing data or corrupting state. No writes until final confirmation. Revisiting the wizard later should pre-fill current config.
- **Accessible from settings:** Users can re-run the wizard from the settings page to switch providers.

**Design principles:**
- Written for non-technical clergy and church volunteers
- No acronyms without explanation
- Every step has a "Why does this matter?" helper text
- Estimated costs shown in concrete terms ("about $0.01 per message" or "~500 messages for $5")

---

## 7. ~~Conversation Auto-Naming with Inline Edit~~ DONE

**What:** Conversations should be auto-named from the first exchange (this partially exists) and the name should be easily editable inline by the user.

**Scope:**
- Verify auto-title generation works reliably (currently uses first sentence of assistant response)
- Add inline edit affordance on conversation names in the sidebar (click to edit, enter to save, escape to cancel)
- Add rename option in the conversation header area
- API: conversation rename endpoint may already exist via `updateConversationTitle` — verify and wire up

---

## Implementation Notes

- Items 1–4 are independent and can be parallelized
- Item 5 should come before item 6 (gating before wizard)
- Item 7 is independent of all others
- All items should maintain the existing quality gates (90% test coverage, lint clean, type check clean)
