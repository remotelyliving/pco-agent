# pco-agent Development Team

## Team Structure

### Architect / Lead Reviewer (Main Session)
**Role:** Design authority, code review final approval, task prioritization, system prompt author.
**Responsibilities:**
- Owns the design spec and architectural decisions
- Dispatches implementation tasks to subagents
- Reviews all subagent output before merge
- Has final veto on any code change
- Updates DEV_QUEUE.md after each session

### Implementation Subagents (Dispatched per task)
Fresh subagent per task. Given full task description + context. Self-reviews before reporting back.

### Review Team (5 subagents, dispatched in parallel after each feature)

#### 1. Senior Engineer
**Focus:** Code correctness, patterns, test quality, DRY/YAGNI, API design consistency.
**Checks:**
- Does the implementation match the spec?
- Are there logic errors or edge cases missed?
- Is the code clean, readable, and maintainable?
- Are tests testing behavior (not just mocking)?
- Any dead code or unnecessary complexity?

#### 2. SRE Expert
**Focus:** Operability, error handling, logging, deployment, performance.
**Checks:**
- Error handling and recovery paths
- Logging completeness (can you diagnose production issues?)
- Resource leaks (connections, clients, memory)
- Health checks and monitoring hooks
- Docker/deployment configuration
- Rate limiting and backoff behavior
- What happens under load?

#### 3. Security Expert
**Focus:** Web application security, auth flows, data protection.
**Checks:**
- Authentication and authorization correctness
- API key handling and encryption
- Input validation and injection vectors
- OWASP top 10 concerns
- CSRF, XSS, open redirects
- Session management
- Secrets in code or logs

#### 4. UI/UX Reviewer + Product Manager
**Focus:** Non-technical user experience, accessibility, onboarding clarity.
**Checks:**
- Is this usable by non-technical clergy?
- Are error messages plain English and actionable?
- Is the onboarding flow clear with sufficient guidance?
- Are technical concepts explained where they appear?
- Mobile responsiveness
- Accessibility (ARIA labels, keyboard nav, contrast)
- Does the feature match the product vision?

#### 5. Documentation Reviewer
**Focus:** Accuracy of all documentation and developer guides.
**Checks:**
- Does README match current setup process?
- Does AGENTS.md reflect current architecture and patterns?
- Does CLAUDE.md have correct project structure and commands?
- Are feature summaries accurate and complete?
- Do inline code comments match behavior?
- Are environment variables documented?

---

## Quality Gates

All code must pass these before merging:

| Gate | Target | Tool |
|------|--------|------|
| Unit test coverage | 90%+ | Vitest + c8 |
| Lint | 0 errors | ESLint |
| Type check | 0 errors | TypeScript strict mode |
| Mutation testing | 80%+ on business logic | Stryker |
| All 5 reviewers approve | No open critical/important issues | Subagent reviews |

---

## Review Protocol

1. **Implementation completes** → implementer self-reviews and commits
2. **Dispatch all 5 reviewers in parallel** → each reads the code independently
3. **Collect findings** → consolidate into the feature summary document
4. **Fix all critical/important issues** → re-run affected reviewers
5. **Architect gives final approval** → merge to main
6. **Update DEV_QUEUE.md** → move task to Done

---

## Feature Summary Documents

After each feature or significant change, a summary document is created or updated:

**Location:** `docs/features/<feature-name>/SUMMARY.md`

**Template:**
```markdown
# Feature: <Name>

**Status:** In Progress | In Review | Complete
**Last Updated:** YYYY-MM-DD

## What It Does
Brief description.

## Key Files
- `src/path/to/file.ts` — what it does
- `src/path/to/other.ts` — what it does

## Design Decisions
- Why we chose X over Y
- Trade-offs made

## Review Findings
- [date] Security: ...
- [date] SRE: ...

## Known Limitations
- Thing we deferred
- Thing that needs improvement
```

---

## Communication Protocol

### Agent-to-agent (via documents)
- DEV_QUEUE.md is the shared state
- Feature SUMMARY.md files carry context between sessions
- AGENTS.md describes patterns for new agents to follow

### Agent-to-human (via chat)
- Architect summarizes progress at end of each session
- Critical decisions require human approval before proceeding
- Security findings are always escalated immediately
