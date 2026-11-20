---
name: react19-unmounted-setstate-is-silent
description: React 19 drops a setState on an unmounted component with NO warning, so a `console.error` spy asserting "no state update after unmount" is a false green (the cancel guard is an equivalent mutant). Assert the observable instead: no further work (IPC invokes) after unmount.
metadata:
  type: project
---

**React 19 silently ignores a `setState` on an unmounted component.** React 18 removed the old
"Can't perform a React state update on an unmounted component" warning, and React 19 has none. So a
test that spies on `console.error` after unmount, to prove a late async result is dropped, **passes
with the `if (!cancelled)` guard deleted**.

**Observed (M18 WP5 Phase 2 build, 2026-11-20):** `useRemoteHostsReadout` guards
`setChecks` with a `cancelled` flag set in the effect cleanup. The test unmounted mid-refresh,
resolved the refresh, and asserted `console.error` was never called. Removing the guard left the test
green: an **equivalent mutant**, since nothing observable differs. The plan's outcome ("drops the
result, no `act` warning") was unprovable as written and was amended at verify-human.

**How to apply:**
- For "closing X stops background work", assert **work not started after unmount**: the
  `mockIPC` call log stays flat across a later tick. Unmount BEFORE the first async step resolves
  (e.g. the list read), then resolve it, and check that no follow-up invoke fires. That mutant
  (dropping `if (cancelled) return` before starting the per-host refreshes) IS killed
  (`remoteHostsSettings.test.tsx` → `closing the panel before the host list arrives starts no refresh at all`).
- Keep the late-`setState` guard as hygiene, but never cite a test as proving it.

Related: [[behavioral-test-can-still-be-an-equivalent-mutant]], [[vitest-console-log-silent-on-passing-tests]] (console silence is not a negative).
