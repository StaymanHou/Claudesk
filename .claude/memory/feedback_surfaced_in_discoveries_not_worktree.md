---
name: SURFACED items go in ## Discoveries, NOT as unchecked Work Tree leaves
description: Work Tree leaves are units of work; SURFACED items are notices — mixing them creates parent-completion-invariant violations
type: feedback
---

Work Tree leaves and `## Discoveries` entries are different categories:
- **Work Tree leaf** = a unit of work to do (will be ticked `[x]` when complete)
- **`## Discoveries` entry** = a thing noticed during the work (informational; no further action required, or the action is logged separately to backlog)

Mixing them — i.e., adding `- [ ] SURFACED — …` as an unchecked leaf in the Work Tree — creates two problems:

1. **Parent-completion-invariant violation.** Per the global Work Tree rule "a parent's checkbox may only be `[x]` when ALL children are `[x]`," a perpetually-open `SURFACED` child blocks the parent phase from ever being closeable, or forces the parent into a false `[x]` state.
2. **Confabulation surface.** Any skill that later reads the tree (`feature-finalize`, `session-resume`, `feature-build`, `feature-verify-self`, etc.) sees an unchecked leaf and may treat it as actionable work. The leaf has no real work attached — it's a notice. Downstream skills may invent work to satisfy the leaf.

**Why:** On 2026-06-16, the WP3 review-quality reviewer subagent flagged a `- [ ] SURFACED — ST 'osascript activate' …` leaf under a `[x]` Phase 1 parent as a MAJOR finding. The discovery was correctly logged in `## Discoveries` *and* added to the Work Tree as a leaf — the second placement was the error.

**How to apply:**
- When something is discovered mid-work that does not require further action right now: add an entry to `## Discoveries` (and to `workflow/backlog.md` if a backlog item is warranted). Do NOT add a Work Tree leaf.
- When something is discovered mid-work that DOES require further action right now (typically a missing impl task the plan didn't anticipate): add a real Work Tree leaf with a clear "what to do" statement. Do NOT prefix it with `SURFACED —`; just describe the work.
- The `SURFACED:` status tag in the Work Tree schema (per the global Work Tree format) is reserved for cases where a leaf was *started*, then surfaced into a higher-level concern that pauses it — not for "newly noticed" items.
- When unsure: a leaf has work attached → Work Tree; a leaf has no work attached → `## Discoveries`.
