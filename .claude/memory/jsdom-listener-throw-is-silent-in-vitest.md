---
name: jsdom-listener-throw-is-silent-in-vitest
description: Under Vitest's jsdom env, a throw inside a DOM event listener is SWALLOWED — jsdom turns it into a window `error` event and Vitest reports nothing (no failure, no "Unhandled Errors"), so the test passes green. A throw in a `setTimeout` callback is the opposite: it runs on Node's timers and fails the run. Tap `window` `error` to see listener throws.
metadata:
  type: project
---

Two positive controls, measured at paydown 2026-09-23 WP6 on `src/__tests__/appBoot.test.tsx`, each appended to `src/main.tsx`'s boot path:

| Throw site | What Vitest does | Does a `window.addEventListener("error", …)` tap see it? |
|---|---|---|
| inside a DOM event listener (`window.addEventListener("x", () => { throw … }); window.dispatchEvent(…)`) | **nothing**: the test passes, 0 "Unhandled Errors" | **yes**, this tap is the ONLY instrument that sees it |
| inside a `setTimeout(() => { throw … }, 0)` | "Unhandled Errors / Errors 1", and the run **exits 1** (while reporting all tests passed) | **no**: the callback runs on Node's timers, not jsdom's |

**Why:** jsdom catches listener exceptions itself and reports them as a window `ErrorEvent` (browser semantics). Nothing forwards that to Vitest. So in any jsdom test where a handler throws, whether a click, keydown, resize or custom event, the test goes green unless it listens for `error` or asserts on the handler's effect. That is the "guards that report green while checking nothing" shape (`docs/lessons/source-text-guards.md`), at the framework level.

**How to apply:**
- If a test dispatches DOM events into real handlers, and "the handler did not throw" matters, add a `window` `error` tap and assert it stayed empty. `appBoot.test.tsx`'s `uncaught` array is the precedent, and it is proven load-bearing.
- Do NOT cite that tap for timer or async throws: Vitest's own unhandled-error report covers those, and exits 1 with 0 failed tests. That is the `verify:auto` "exits 1 with 0 failures" shape, and the Row 7 docs-link poll was one such case.
- When proving the tap works, use a LISTENER throw as the positive control. A timer throw will not turn it red and reads as "the assertion is vacuous", which is the wrong conclusion ([[invalid-probe-and-real-hole-look-identical]]).
- Related: [[whole-app-jsdom-boot-via-tauri-mockipc]] (the harness), [[read-logs-console-captures-nothing]] (the MCP-bridge analogue of an empty error read being a false green).
