---
name: extracted-machine-needs-a-live-caller-guard
description: A pure decision module's own tests CANNOT see that a caller never invokes it — they call it themselves. Guard "every exported plan*/decide* function has a live caller", deriving the list from the module's own exports.
metadata:
  type: project
---

`docs/lessons/verify-self-tiers.md` §4 names this failure ("extracting a pure state machine proves
the MACHINE, not its CALLER" — `pendingRestore.ts` had 20 tests and a proven `"reset"` transition
while no caller dispatched it) and says **"only a caller-side guard does"** — but stops short of the
shape. This is the shape.

⚠️ **The pure tests are structurally incapable of catching it.** They invoke the function
themselves, so an exported decision function with zero production callers passes every one of them.
Measured, not assumed: F-a WP3 shipped `planPanelChange` exported, documented and tested with **no
caller**, so `promptDraftSync.ts` promised a flush-on-tab-away the panel never performed — and after
wiring it, deleting the call site again **still passed all 44 tests**.

**The guard, in `promptDraftSync.test.ts`:**

1. `it.each(PLAN_FUNCTIONS)` — assert each name appears as a **call** (`name(`) in the consumer's
   comment-stripped source. Match the call shape, not the bare identifier: an import line or a prose
   mention satisfies the identifier exactly when the call was deleted
   (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
2. A second arm deriving the expected list from the module's **own exports**
   (`/export function (plan\w+)/g`) and asserting set-equality with the hardcoded list. ⚠️ Without
   this, the guard silently stops covering the NEXT function someone adds — which is exactly how the
   first one went unwired. Same shape as entry 13's reverse guard.

Both arms mutation-proven individually: unwiring the call fails arm 1 by name; adding an unlisted
`plan*` export fails arm 2.

⚠️ **A render test is NOT the instrument here** — a server render cannot transition the prop that
triggers the call, so "does leaving the tab flush?" is unreachable in jsdom. "Is the function
invoked?" is genuinely a question about the source, which is the side of
`[[docs/lessons/source-text-guards.md]]`'s rule that source guards belong on. Contrast the sibling
lesson in `CLAUDE.md`: a resting-DOM question must be rendered, not grepped.

Generalizes to any module exporting decision functions a caller must dispatch — reducers, policy
tables, command maps.
