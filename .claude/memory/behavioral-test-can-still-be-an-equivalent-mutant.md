---
name: behavioral-test-can-still-be-an-equivalent-mutant
description: A genuinely behavioral test can still pass against a LANDED mutation when the removed path and its replacement produce identical observables on the test's input — a fourth guard-failure mode distinct from non-landing, incomplete-predicate, and source-text-can't-express. The remedy is to feed an input on which the two paths MUST diverge.
metadata:
  type: project
---

Three sibling memories cover guard failures where something about the *probe* is at fault:
[[verify-the-mutation-landed]] (the mutation never reached executable code),
[[guard-predicate-completeness-vs-mutation-landing]] (the predicate cannot see the vector class),
and [[extract-for-import-when-a-raw-guard-cant-express-the-property]] (source text cannot express
a behavioral property). **This is a fourth, and every one of those remedies has already been
applied when it bites:** the mutation lands in executable code, the test is genuinely behavioral
and drives the real function, the predicate is complete — and the test *still* passes, because
**on the input the test supplies, the mutated path and the original produce the same observable.**

This is the classic **equivalent mutant**, and in this repo it arrives specifically through
*determinism*: two code paths that "agree today" agree on every input you would naturally write.

## The instance (M15 WP3 quality refactor, 2026-09-14)

The defect: `fireOne` called `readTurn(lines)` to build its `FireLedger` key, and `decideVerdict`
called `readTurn(input.lines)` **again** to make the fire decision. Nothing asserted the two
agreed. The fix threaded the caller's already-computed `TurnReading` into `VerdictInput.reading`.

**The first test written for it was worthless.** It built a two-verdict transcript (`F7` then
`F5`), fired, and asserted the injected command (`/feature-plan`, from the *last* verdict) plus
the ledger claim suppressing a second sweep. It drove the real `fireOne` through the real parse,
policy and ledger. It passed — **and it passed identically with the fix reverted**, because
`readTurn` is deterministic over an identical array, so both reads return the same reading no
matter how many times you call it.

⚠️ **The test even carried a comment predicting this trap, and fell into it anyway.** Writing
"a COUNT of `readTurn` calls would be the wrong test" is not the same as checking that the
assertion you *did* write can distinguish the two versions.

## The remedy — construct the divergence the test is about

The property is *"the supplied reading is the one that decides"*. That is only observable when the
supplied reading **disagrees** with what a re-read would produce. So: drive `decideVerdict`
directly, hand it `lines` that emit `F5` (→ `feature-plan`) and a `reading` naming `F7`
(→ `feature-build`), and assert the verdict is `F7`. Re-reading yields `F5`; honoring the argument
yields `F7`. Reverting the fix now fails.

⚠️ **This means deliberately constructing a state production cannot currently reach** — the
desynchronization only arises from a future parameter or short-circuit. That is not a reason to
weaken the test; that hypothetical future IS the finding. Say so in the test comment so a later
reader does not "simplify" it back to a consistent fixture.

## The general move

**Before trusting a green behavioral test, ask: what input makes the two versions differ — and
does my test use it?** If you cannot name such an input, the test is pinning something other than
what you think.

Mechanically, the same discipline as the siblings: **mutate, confirm the mutation landed
(`shasum` before/after — see [[verify-the-mutation-landed]]), and require the test to FAIL.** In
this session two of four mutants survived on the first attempt (this one, and a live-guard call
whose deletion nothing tested), and both survivals were invisible in a 98-green run. ⚠️ **Run the
mutants INDIVIDUALLY** — batching them reports "N tests failed" and hides which mutants nothing
caught.
