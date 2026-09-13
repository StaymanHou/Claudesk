---
name: ts-arity-flexible-assignability-hides-a-widened-param
description: Widening a TS function-TYPE parameter list does not break existing implementations — a stub declaring fewer parameters stays assignable — so "the argument is now required" is unproven by tsc and the test suite alike until a test captures the passed VALUE.
metadata:
  type: project
---

TypeScript function assignability is **arity-flexible**: a function of fewer parameters is
assignable to a type expecting more (it may ignore the extras). So widening a *function type* in
an interface does **not** produce errors at the implementations.

⚠️ **The consequence for a "make it structural, not prose" refactor:** widening the dep signature
feels like it converts a doc-comment requirement into a compiler-enforced one, and `tsc --noEmit`
agreeing feels like confirmation. It is not. The compiler is silent because every existing stub is
still legal — **including one that ignores the new argument entirely.**

## The instance (M15 WP3 quality refactor, 2026-09-14)

A code-quality MAJOR: `SUPERVISOR_INJECT_LABEL` existed but `FanOutDeps.inject` was
`(ptySessionId, command) => Promise<void>` — the label requirement enforced by a doc comment plus
a `?raw` test asserting the string `"MUST pass"` appeared in the file (*documentation checking
documentation*). The fix widened the dep to take `label` and had `fireOne` pass the constant.

**After the widening: `tsc --noEmit` clean, 97/97 tests green — and nothing had verified the fix.**
The test harness stub was `inject: async (pty, command) => {...}`; still assignable, still ignoring
the third argument. A `fireOne` that dropped the argument would have compiled and passed too.

## What actually proves it

Capture the value, then mutation-test it:

1. Record the new parameter in the test double — `inject: async (pty, command, label) => { injected.push({ pty, command, label }); }`.
2. Assert it at every injection site (`toEqual([{ pty, command, label: SUPERVISOR_INJECT_LABEL }])`),
   and assert it is **not** the wrong default (`.not.toBe("auto-resume")`) where a wrong value is
   the actual hazard.
3. Delete the argument at the call site, confirm the mutation landed (`shasum` before/after), and
   require a FAIL. Here that killed the mutant across 5 tests — while the replaced `?raw` guard had
   **survived** it, since dropping an argument leaves the doc comment it asserted on intact.

## The general rule

**A widened parameter list is a type change, not a guarantee.** Whenever the point of a signature
change is "the caller can no longer omit this," the proof is a captured value in a test plus a
mutant that removes the argument — never `tsc` plus a green suite. Related:
[[behavioral-test-can-still-be-an-equivalent-mutant]] (a green behavioral test that cannot
distinguish the two versions) and [[verify-the-mutation-landed]] (confirm the mutant reached
executable code before believing any verdict).
