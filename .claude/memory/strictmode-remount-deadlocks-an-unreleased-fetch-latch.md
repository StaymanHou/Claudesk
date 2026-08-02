---
name: strictmode-remount-deadlocks-an-unreleased-fetch-latch
description: A fetch-once latch SET before the await and never released on the cancelled path deadlocks under React StrictMode's mount→unmount→remount — the response is discarded, state stays null, and the UI renders blank while every gate is green. Release it in the cleanup; model it as a pure state machine.
metadata:
  type: project
---

React StrictMode runs every effect **mount → unmount → remount** in dev. A `useRef` latch that
is set *before* the await and never released turns that cycle into a deadlock:

```
mount    → latch = true, fetch starts
unmount  → cleanup sets cancelled = true
remount  → latch is STILL true → guard returns early, never refetches
…then    → the first response lands, sees `cancelled`, and DISCARDS its data
```

State stays `null` forever. In Claudesk's Docs panel (M11 WP3, 2026-08-02) that rendered a
**permanently blank panel** — while `tsc`, `eslint`, **1538 tests**, and a clean production
build were all green. Nothing modelled the remount sequence, so nothing could have caught it.

## ⚠️ The part that makes this a trap rather than a bug

The predecessor latch — `if (!visible || docs !== null) return;` — **survived StrictMode by
accident.** It read from *state*, which the discarded write never updated, so the remount
refetched. It was flagged in code review as entangled (data doubling as a has-fetched flag)
and "cleaned up" into an explicit `useRef`. **The cleanup removed the accident without
replacing it.** A refactor that makes an invariant *explicit* can delete the incidental
mechanism that was upholding it — check what the old shape was accidentally doing.

## The fix

Release the latch in the cleanup so the remount can re-arm, and model it as a **pure state
machine** so the sequence is assertable as a value rather than trusted inside a hook:

| state | event | → |
|---|---|---|
| `idle` | `start` | `in-flight` |
| `in-flight` | `settle` | `settled` |
| **`in-flight`** | **`cancel`** | **`idle`** ← the load-bearing transition |
| `settled` | `cancel` | `settled` ← guard the opposite direction |

Both directions matter. `in-flight + cancel → settled` re-creates the blank panel. But
`settled + cancel → idle` is the opposite failure: every center-stage switch would refetch,
breaking the "all workspaces stay mounted" contract. A naive always-re-arm fix passes the
first test and fails the second, which is why both are pinned.

Pattern lives in `src/components/workspace/docs/fetchLatch.ts`, driven from `DocsPanel`'s
effect; the sequence is pinned by `__tests__/fetchLatch.test.ts` (mutation-proven — reverting
the one transition fails 3 of 6).

**Generalizable check:** any `useRef` guard whose flag is set before an `await` needs an answer
to *"what happens on the StrictMode remount?"* — and the answer must be a test, not a comment.
The proof this latch was correct had been a comment asserting "the ref is never reset and that
is sound." It was wrong. See [[extract-for-import-when-a-raw-guard-cant-express-the-property]]
for the same lesson from the guard side.
