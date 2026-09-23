---
name: whole-app-jsdom-boot-via-tauri-mockipc
description: The REAL app entries (src/main.tsx, src/pip/main.tsx) boot under jsdom with @tauri-apps/api/mocks — no new dependency, <1s. A whole-app render IS available; precedent src/__tests__/appBoot.test.tsx. It still cannot see a missing export.
metadata:
  type: project
---

The full app boots under Vitest + jsdom with no new dependency. Use a per-file `// @vitest-environment jsdom`, then
`mockWindows("main")` and `mockIPC(cb, { shouldMockEvents: true })` from `@tauri-apps/api/mocks`, whose `cb` records
command names and returns canned replies. Create a `<div id="root">` (or `#pip-root`) and `await import("../main")`. The
entry's own `createRoot(...).render(<StrictMode><App/></StrictMode>)` runs for real. Both entries mount in under 1s.
Command replies that matter at boot: `prune_missing_projects → []`, `list_projects → [project]`,
`picker_announce_actions → {}`, and `pip_get_layout → "grid"`. Anything else can return `null`. The working precedent is
`src/__tests__/appBoot.test.tsx` (paydown 2026-09-23 WP3).

**Why:** the repo long held that it had "no component-render harness". `docs/lessons/source-text-guards.md` §"The render-harness note, corrected" already refuted that for `renderToStaticMarkup`, but that covers leaf components only. A whole-app mount was never tried until WP3's plan-time probe. This is what lets a `?raw` source guard over a DOM-at-rest question become a real render, and paydown WP7 (render instead of `?raw`) will lean on it.

**How to apply:**
- Assert **identity**: content seeded through `mockIPC` must appear, e.g. `.picker-recent-name` === the seeded project. A non-empty root is not enough; see source-text-guards entry 15.
- Reset per-test capture state. A second entry booted in the same file shares the jsdom and the first tree is never unmounted.
- ⚠️ This harness **cannot catch a deleted export**: Vitest reads a missing binding as `undefined`. That class belongs to `pnpm check:link` (source-text-guards entry 19).
- A mocked IPC proves the webview side only. See [[verify-self-stub-cannot-cross-subprocess-boundary]]. The entry uses StrictMode, so [[strictmode-remount-deadlocks-an-unreleased-fetch-latch]] can bite here too.
