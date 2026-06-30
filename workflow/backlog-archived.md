# Archived Backlog

Items **Buried** by the disposition model (low-impact + medium-effort + low-risk — the
"meh" zone, not cheap enough to sweep, not valuable enough to prioritize). These are NOT
expected to be revisited; they live here so the active `backlog.md` stays a list of work
we actually intend to do. An item can be un-buried by moving it back if its calculus
changes (e.g. the prerequisite toolchain lands for another reason).

---

## SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP  `← Buried 2026-06-30 (debt-paydown WP6)`
- **Buried because:** the disposition model scored this Low-impact + Medium-effort + Low-risk —
  the meh zone. The fix is NOT a single test; it requires standing up an entire jsdom +
  `@testing-library/react` + `environment: "jsdom"` vitest toolchain that the repo deliberately
  does not have (standing posture: *pure logic → vitest, live DOM → Playwright/MCP-bridge*). WP6's
  test work (aria pairing, chord-type, exhaustiveness pins) used the `?raw` source-grep idiom and the
  Rust serde-contract test — NOT rendered-component tests — so it did NOT make a PaneTabs component
  test cheap. The two specific defects this gap named are now partly mitigated by code, not a
  component test: the ⌘W `closeActiveTabRef` stale-closure was fixed + comment-anchored (WP5), and
  the App.tsx `menu`-listener StrictMode double-register class is now structurally guarded by the
  shared `useTauriListen` hook (WP6, Theme I — the `cancelled`-flag lives in one place). The remaining
  value (a true render-time dirty-close-confirm assertion) is not worth the toolchain in isolation;
  fold into a future component-test-infra investment IF one is ever stood up for another reason.
- **Source:** feature:verify-codify (WP13 — ⌘W close-active-tab)
- **Type:** tech-debt
- **Summary:** WP13's vh.3 regression (the ⌘W `closeActiveTab` stale-closure bug — the memoized handle read pre-dirty `docs`, so a dirty tab closed silently instead of raising the confirm dialog) had NO automated test that would catch a recurrence. The fix was confirmed only at verify-human.
- **Context:** The dirty-guard routing lives in the `PaneTabs` React component (reads the parent `docs` store + calls `setClosing`); `openFiles.ts` is dirty-unaware, so there's no pure-logic seam. The repo has no DOM/component test environment — vitest runs node-default, there are zero rendered-component tests, and `pure logic → vitest` is the standing posture. Closure-freshness defects in component event handlers (state X updates without dep Y changing) are a recurring foot-gun (same shape as the `overlayOpenRef`/`closeActiveTabRef` latest-ref patterns WP13 itself used) and are exactly what a component test would guard.
- **Suggested action (if ever un-buried):** add jsdom + `@testing-library/react` + a vitest `environment: "jsdom"` config, then write a `PaneTabs` test: render with an open dirty file tab, fire `closeActiveTab()` via the imperative handle, assert the confirm dialog opens (not an immediate close). Pairs with any future component-level coverage (RightPanelHost chord wiring, EditorSplit focus). NOT worth standing up the whole toolchain for this single assertion in isolation.
- **Priority:** low
- **Status:** BURIED 2026-06-30 (debt-paydown WP6)
- **Note (2026-06-24, app-menu-bar Phase 2):** another instance of the same class — App.tsx's `menu` Tauri-event listener had a StrictMode async-`listen` DOUBLE-REGISTRATION bug (the effect's cleanup ran before the `listen()` promise resolved, so the first subscription's unlisten was never captured → two live listeners → menu clicks double-dispatched → finder/search/palette toggles cancelled out). Caught only at verify-human; fixed with the `cancelled`-flag guard (mirrors `useWorkspaceStatus`). **Now structurally guarded** by the shared `useTauriListen` hook (debt-paydown WP6, Theme I) — the async-listen + cancel-before-resolve guard lives in one place, so a fresh hand-rolled subscription can't re-introduce the double-register.
