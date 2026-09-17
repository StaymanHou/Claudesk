---
name: mutant-survives-because-its-line-never-executes
description: A FIFTH guard-failure mode — the mutant survives because its line is never EVALUATED (a gate short-circuits above the mutation site), not because its observable matches. The equivalent-mutant remedy ("find an input where the versions diverge") has NO answer, because no input to that harness reaches the line at all.
metadata:
  type: project
---

Four sibling memories cover guard failures where the probe, the predicate, or the observable is at
fault: [[verify-the-mutation-landed]] (the mutation never reached executable code),
[[guard-predicate-completeness-vs-mutation-landing]] (the predicate cannot see the vector class),
[[extract-for-import-when-a-raw-guard-cant-express-the-property]] (source text cannot express a
behavioral property), and [[behavioral-test-can-still-be-an-equivalent-mutant]] (both paths give
identical observables on the test's input).

**This is a fifth, and it is the one where every sibling's remedy has ALREADY been applied and the
mutant still survives.** The mutation lands in executable code. The test is genuinely behavioral
and drives the real component. The predicate is complete. And the test still passes — because
**the mutated line is never evaluated at all.**

⚠️ **The discriminator against [[behavioral-test-can-still-be-an-equivalent-mutant]]:** there, the
line RUNS and produces the same observable, so the remedy is to find an input on which the two
versions must diverge. **Here no such input exists in that harness** — a guard above the mutation
site short-circuits, so the code path is unreachable by construction. Asking "what input makes the
versions differ?" returns nothing, and if you treat the silence as "the property is untestable"
you will weaken a guard that was fine.

## The instance (M14 WP0 Phase 3 verify-codify, 2026-09-17)

The suppressed-marker's render site read the gated derivation:

```tsx
{supervisorReadout.suppressed && ( … )}
```

The mutant made it read the raw watermark instead — `supervisorReadout.suppressed || unsentInput` —
which bypasses the workflow gate AND the per-workspace toggle at once: it would paint the marker on
a workspace whose supervisor is OFF, and on one whose gate is closed entirely.

**It survived the ENTIRE suite at 2709 tests**, including a jsdom render test written *minutes
earlier in that same verify-codify, specifically for that property.*

⚠️ **Why that render test could not catch it, and this is the whole lesson.** Two independent
structural facts compose:
1. `workspaceSupervisorReadout` returns `null` when the gate is off, so the badge subtree — mutated
   line included — is never evaluated.
2. `useWorkflowFeaturesEnabled` **seeds asynchronously**, so a server render returns its restrictive
   pre-seed default and only ever reaches the **gate-OFF** shape (documented in
   `docs/lessons/source-text-guards.md` → "The render-harness note, corrected").

So **the one arm where the mutant bites is the one arm the harness cannot reach.** The test was not
weak, badly written, or vacuous — it was *structurally incapable*, and no amount of improving its
assertions would have changed that.

## The remedy — change mechanism, not assertions

The property was closed with a **source-level guard** over the comment-stripped component: a
positive one pinning the conditional to `supervisorReadout.suppressed &&`, plus — because the
positive alone still passes when a second term is OR'd in — a **negative** one asserting the
marker's JSX never names the raw state, and an anti-vacuity guard pinning both `indexOf` anchors
(a missing needle silently yields a window from `-1`).

⚠️ **This is the strongest local argument for why the `?raw` guard idiom exists here at all.**
Normally the rule runs the other way — `docs/lessons/source-text-guards.md` says prefer
extract-for-import for behavioral properties, because a source predicate only encodes shapes you
thought of. This is the documented exception: when the behavioral harness **cannot reach the arm**,
a source guard is not the weaker substitute, it is the *only* mechanism that reaches the property.
Say so at the guard, or a later reader will "upgrade" it to a render test that silently stops
checking.

⚠️ **Re-prove the kill after Prettier runs.** A source-text guard asserts against formatted text;
the reflow is a real break vector here, so re-apply the mutant after `--write` rather than trusting
the green.

## The general move

**Before trusting a green behavioral test, ask not only "what input makes the versions differ?" but
"can this harness REACH the line at all?"** If a gate, an early return, or an async-seeded default
short-circuits above the mutation site, the answer is no — and the fix is a different mechanism,
not a better assertion.

Corollary: **mutation-test a new guard BEFORE writing more of it.** Writing the render test first
and mutating second cost a file that cannot do the job it was written for; the reachability limit
would have shown up immediately in the other order.
