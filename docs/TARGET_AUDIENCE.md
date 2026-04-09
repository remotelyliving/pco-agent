# Target Audience & User Personas

## Who Uses Service Planner?

Service Planner is built for **church administrative and ministry staff** who use Planning Center Online (PCO) as their church management platform. These users interact with PCO daily but want a faster, conversational way to get things done.

## Demographics

| Attribute | Range |
|-----------|-------|
| Age | 18–70 |
| Technical skill | Low to moderate — comfortable using web apps, not developers |
| Device mix | Desktop (primary for office work), mobile/tablet (on the go) |
| Accessibility needs | Must support screen readers, keyboard navigation, and sufficient contrast for older users with vision changes |

## Common Roles

| Role | What They Do | How They Use Service Planner |
|------|-------------|------------------------------|
| **Church Administrator** | Manages the office, people records, communications | Look up contact info, check membership, manage lists |
| **Worship Pastor / Director** | Plans weekly services, selects songs, leads rehearsals | Build service plans, check song rotation, schedule musicians |
| **Volunteer Coordinator** | Recruits and schedules volunteers across teams | Find available people, check blockout dates, fill open positions |
| **Music Director** | Manages song library, arrangements, keys | Search songs, review arrangement details, plan setlists |
| **Small Church Multi-Role** | Wears many hats — often one person doing all of the above | Needs the broadest feature access with the simplest interface |

## Key Characteristics

- **Not technical.** They don't know what an API is, what a "provider" means, or why they need an API key. Every technical concept must be explained in plain language where it appears.
- **Busy.** They're often setting up Sunday's service on Thursday afternoon. Speed and directness matter more than feature richness.
- **Cautious with data.** They manage real people's personal information. They need to trust that the tool won't make changes without confirmation.
- **Variable comfort with AI.** Some use ChatGPT daily; others have never used an AI tool. The onboarding must work for both.
- **Mobile-first for quick checks.** They'll pull up the app on their phone to check who's scheduled or look up a phone number between meetings.

## UX Principles (derived from audience)

1. **Plain language always.** No jargon. If a technical term must appear (like "API key"), explain it inline.
2. **Confirm before acting.** Never create, update, or delete records without explicit user confirmation.
3. **Error messages are guidance.** Don't say "401 Unauthorized" — say "Your session has expired. Please sign out and sign back in."
4. **Touch-friendly.** Minimum 44px touch targets. Buttons visible without hover on mobile.
5. **Progressive disclosure.** Show the simple path first. Advanced options exist but don't clutter the primary flow.
6. **Forgiving.** Undo where possible. Clear confirmation dialogs for destructive actions. No data loss from accidental taps.
