# UI Polish & Dark Mode Theming Design

**Date:** 2026-04-14
**Status:** Draft

---

## Goal

Polish the app's appearance for first testers: add light/dark mode theming, fix hardcoded colors across all components, upgrade the sidebar with icons and branded accents, and fix dropdown casing inconsistencies. Keep the existing layout — improve the fit and finish.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Theme library | `next-themes` | Standard for Next.js, handles class toggling, localStorage persistence, system preference, SSR flash prevention |
| Theme toggle location | Sidebar footer, next to avatar | Quick access, always visible. No settings page toggle. |
| Theme options | Light, dark, system (follows OS) | Two well-designed themes beat three mediocre ones. Both meet WCAG AA. |
| High-contrast mode | Not separate | Both themes designed with WCAG AA contrast (4.5:1 minimum). OKLCH color space makes this achievable without a third mode. |
| Brand accent color | Blue (`#3b82f6` / `bg-primary`) | Universal, professional, already in the OKLCH palette. No gradient. |
| Sidebar style | Theme-adaptive with icons | Follows light/dark theme. Lucide icons on nav items, "Recent" section header, branded SP monogram, toned-down sign out. |
| Mobile nav | Mirror sidebar changes | Same icons, branding, and theme toggle for consistency |
| Nav icons | Lucide-react (not emoji) | Consistent sizing, theme-aware colors, professional appearance |
| Color approach | Systematic token migration | Replace all 60+ hardcoded Tailwind colors with CSS variable-based theme tokens |

---

## Theme Infrastructure

### Installation

Install `next-themes` package. It provides:
- `.dark` class toggle on `<html>` element (CSS already responds to this — dark mode variables are fully defined in `globals.css`)
- `prefers-color-scheme` system preference detection
- `localStorage` persistence of user choice
- SSR-safe — prevents flash of wrong theme via inline script

### Root Layout Changes (`src/app/layout.tsx`)

- Add `suppressHydrationWarning` to `<html>` tag (required by next-themes)
- Wrap children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
- ThemeProvider must be a client component wrapper — create `src/components/theme-provider.tsx`

### Theme Toggle Component (`src/components/theme-toggle.tsx`)

- Client component using `useTheme()` from next-themes
- Three states: light (Sun icon), dark (Moon icon), system (Monitor icon)
- Click cycles: light → dark → system → light
- Uses lucide-react icons: `Sun`, `Moon`, `Monitor`
- Minimum 44px touch target
- Placed in sidebar footer, next to user avatar
- Tooltip shows current mode: "Light", "Dark", "System"

### CSS Variable Addition (`src/app/globals.css`)

Add `--warning` color variable (missing from current palette):

**Light mode (`:root`):**
```css
--warning: oklch(0.75 0.15 75);
--warning-foreground: oklch(0.35 0.12 75);
```

**Dark mode (`.dark`):**
```css
--warning: oklch(0.75 0.12 75);
--warning-foreground: oklch(0.85 0.1 75);
```

Map in `@theme inline` block:
```css
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
```

---

## Color Token Migration

### Mapping Table

| Hardcoded Class | Theme Token | Usage |
|----------------|-------------|-------|
| `bg-gray-50`, `bg-gray-100` | `bg-muted` | Section backgrounds, hover states |
| `bg-white` | `bg-background` or `bg-card` | Cards, inputs, page backgrounds |
| `text-gray-900`, `text-gray-700` | `text-foreground` | Primary text |
| `text-gray-500`, `text-gray-400` | `text-muted-foreground` | Secondary text, labels, hints |
| `text-gray-300` | `text-muted-foreground/50` | Very subtle text |
| `border-gray-200`, `border-gray-300` | `border-border` or `border-input` | Dividers, input borders |
| `bg-blue-600` | `bg-primary` | Primary buttons, accents |
| `text-blue-600`, `text-blue-700` | `text-primary` | Links, active states |
| `bg-blue-50` | `bg-primary/10` | Info backgrounds, selection highlights |
| `text-blue-800` | `text-primary` | Info text |
| `bg-red-50` | `bg-destructive/10` | Error backgrounds |
| `text-red-600`, `text-red-700` | `text-destructive` | Error text, destructive actions |
| `border-red-200` | `border-destructive/30` | Error borders |
| `bg-amber-50` | `bg-warning/10` | Warning backgrounds |
| `text-amber-600`, `text-amber-800` | `text-warning-foreground` | Warning text |
| `bg-green-50`, `bg-green-100` | `bg-accent` or custom `bg-success/10` | Success states |
| `text-green-700` | Custom `text-success` | Success text |
| `focus:border-blue-500` | `focus:border-ring` | Focus indicators |
| `hover:bg-gray-50`, `hover:bg-gray-100` | `hover:bg-muted` | Hover states |

### Components to Migrate (12 files)

1. **`src/components/sidebar.tsx`** — nav background, text colors, sign-out button, separator
2. **`src/components/mobile-nav.tsx`** — hamburger button, overlay, nav links, sign-out
3. **`src/components/conversation-item.tsx`** — rename input, active state, delete confirm, text colors
4. **`src/components/chat/chat-interface.tsx`** — thinking indicator, error alert, consent banner, empty state prompts, file upload area
5. **`src/components/chat/message-bubble.tsx`** — user bubble (`bg-blue-600`→`bg-primary`), assistant bubble (`bg-gray-100`→`bg-muted`), tool call display
6. **`src/components/chat/file-chip.tsx`** — progress bar, error state, icon colors
7. **`src/components/chat/file-card.tsx`** — card borders, icon colors, download link
8. **`src/components/rules/rule-editor.tsx`** — error alert, form borders, submit button
9. **`src/components/rules/rule-list.tsx`** — category badges, "Admin only" text, delete button, edit form
10. **`src/components/settings/api-key-form.tsx`** — provider selection cards, model selection, test connection banners
11. **`src/components/setup/setup-wizard.tsx`** — progress dots, provider cards, model cards, info banners, step badges
12. **`src/components/memory/memory-list.tsx`** — source badges, delete buttons, add form, empty state

---

## Sidebar Polish

### Changes to `src/components/sidebar.tsx`

**Logo mark:**
- Replace robot emoji (`<Image src="/robot.svg">`) with styled "SP" monogram
- Blue rounded square: `bg-primary text-primary-foreground rounded-lg w-7 h-7 flex items-center justify-center text-xs font-bold`

**Nav icons (lucide-react):**
- Rules: `BookOpen` icon
- Memory: `Brain` icon
- Settings: `Settings` icon
- Billing: `CreditCard` icon (when billing feature lands)
- Icons use `text-muted-foreground`, 16px size
- Nav items become flex row: `flex items-center gap-2`

**"Recent" section header:**
- Above conversation list: `text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1.5`
- Text: "Recent"

**Active conversation highlight:**
- Currently: `bg-gray-100` (hardcoded)
- After: `bg-primary/10 text-primary`

**New Chat button:**
- `bg-primary text-primary-foreground` instead of `variant="outline"`
- Consistent blue accent in both themes

**Sign out button:**
- Currently: `text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700`
- After: `text-muted-foreground border-border hover:bg-muted`
- Less alarming, consistent with footer area

**Theme toggle:**
- Next to user avatar in footer row
- `ThemeToggle` component (see Theme Infrastructure section)

**Background:**
- Currently: `bg-gray-50`
- After: `bg-sidebar` (uses existing CSS variable `--sidebar`)

### Changes to `src/components/mobile-nav.tsx`

Mirror all sidebar changes:
- Same SP monogram, icons, "Recent" header
- Theme toggle in the drawer
- Same color token migration

---

## Chat Area Polish

No layout changes. Token migration only:

- **User bubble:** `bg-primary text-primary-foreground` (from `bg-blue-600 text-white`)
- **Assistant bubble:** `bg-muted text-foreground` (from `bg-gray-100 text-gray-900`)
- **Thinking indicator:** `bg-muted text-muted-foreground`, dots `bg-muted-foreground`
- **Error alert:** `bg-destructive/10 text-destructive` (from `bg-red-50 text-red-700`)
- **Consent banner:** `bg-warning/10 text-warning-foreground` (from `bg-amber-50 text-amber-800`)
- **Empty state heading:** `text-foreground` (from `text-gray-700`)
- **Empty state subtext:** `text-muted-foreground` (from `text-gray-400`)
- **Prompt buttons:** `border-border text-foreground hover:bg-muted hover:border-border` (from `border-gray-200 text-gray-700 hover:bg-gray-50`)
- **Tool call blocks:** `border-border bg-card text-muted-foreground` (from hardcoded grays)
- **Image thumbnails in message-bubble:** `border-border rounded-lg`

---

## Settings, Rules & Memory Page Polish

Token migration across all form and display components:

**Settings (`api-key-form.tsx`):**
- Selected provider card: `border-primary bg-primary/10` (from `border-blue-600 bg-blue-50`)
- Unselected card: `border-border` (from `border-gray-200`)
- Model badges: `bg-primary/10 text-primary` and `bg-warning/10 text-warning-foreground` (from hardcoded blue/amber)
- Test connection success: `bg-accent text-accent-foreground`
- Test connection error: `bg-destructive/10 text-destructive`

**Setup wizard (`setup-wizard.tsx`):**
- Progress dots: `bg-primary` active, `bg-muted` inactive (from `bg-blue-600` / `bg-gray-200`)
- Provider cards: same as settings
- Info banners: `bg-primary/10 text-primary` (from `bg-blue-50 text-blue-800`)
- Step badges: tokens instead of hardcoded green/blue/amber

**Rules (`rule-editor.tsx`, `rule-list.tsx`):**
- Error alerts: `bg-destructive/10 text-destructive` (from `bg-red-50 text-red-700`)
- "Admin only" badge: `text-muted-foreground` (from `text-gray-400`)
- Delete buttons: `text-destructive hover:text-destructive` (from `text-red-500 hover:text-red-700`)
- Category group headers: `text-foreground` (from hardcoded)

**Memory (`memory-list.tsx`):**
- Source badges: theme tokens
- Delete buttons: `text-destructive`
- Empty state: `text-muted-foreground`

---

## Bug Fixes

### Provider Name Duplication

**Problem:** Provider display names maintained in two places:
- `src/components/setup/setup-wizard.tsx` — `PROVIDER_INFO` object (lines 23-75)
- `src/components/settings/api-key-form.tsx` — inline ternary (lines 94-100)

**Fix:** Extract `PROVIDER_INFO` to `src/lib/ai/provider-meta.ts`. Both components import from the same source. The inline ternary in `api-key-form.tsx` gets replaced with a lookup: `PROVIDER_INFO[provider].name`.

### Select Display Casing

**Problem:** User reported lowercase text in dropdown selections.

**Audit scope:** Check every `<Select>` / `<SelectItem>` in the app:
- `rule-editor.tsx` — category select, visibility select, rule type select
- `api-key-form.tsx` — provider select, model select
- `setup-wizard.tsx` — provider and model selection (card-based, not select)

**Fix:** Ensure all `<SelectItem>` children use title-case display text. If any component renders the raw value string (e.g., `"general"` instead of `"General"`), fix the display path. Model IDs that appear as raw strings (e.g., `claude-sonnet-4-5-20250514`) should display the human-readable name from the models metadata.

---

## Scope Boundary

**In scope:**
- `next-themes` installation and provider setup
- Theme toggle component (sun/moon/monitor cycle)
- `--warning` CSS variable addition
- 60+ hardcoded color → theme token migration across 12 components
- Sidebar polish: SP monogram, lucide icons, "Recent" header, theme toggle, sign-out tone-down
- Mobile nav: mirror sidebar changes
- Chat area: bubble colors, indicators, banners → tokens
- Settings/Rules/Memory: selection states, badges, alerts → tokens
- Provider name deduplication
- Select display casing audit and fix

**Out of scope:**
- Layout changes (keep existing structure)
- New pages or routes
- Accessibility beyond color contrast (focus management, screen reader enhancements are separate)
- Custom theme creation UI (only light/dark/system toggle)
- Animation or transition enhancements
- Typography changes
