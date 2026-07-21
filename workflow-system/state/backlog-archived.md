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

## SURFACE-2026-06-24-QUALITY-FSWATCH-REWALK-AMPLIFICATION  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** each `fs-change` event bumps both tree + git refresh keys, each triggering a full re-walk + git-status IPC, so a bulk external op produces several back-to-back full-tree re-walks (event→work amplification).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; acceptable at the operator's repo sizes (the `build_ignore` doc already accepts a harmless extra re-walk).
- **Where:** `src/components/workspace/RightPanelHost.tsx:162-163`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-24-QUALITY-FSWATCH-EMIT-FAILURE-INVISIBLE  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** debouncer-callback emit failures go only to `eprintln!`, so a persistent emit failure silently stops tree/editor updates with no operator-visible signal.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; no clean IPC channel back from a detached callback thread, and FSEvents emit failures are vanishingly rare (reviewer "likely dismiss").
- **Where:** `src-tauri/src/fs_watch/commands.rs:143,161`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-24-QUALITY-FSWATCH-ISDIR-FALSE  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** `is_ignored` always passes `is_dir=false` to `matched_path_or_any_parents`; parent-matching covers directory-only patterns, so the edge is sound.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; reviewer confirmed sound, "no action needed."
- **Where:** `src-tauri/src/fs_watch/mod.rs:119`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-25-QUALITY-WP5B-DESCENDANT-COUNT-STALE  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the folder-delete confirm's advisory descendant count reflects the tree as last refreshed, so it can understate the blast radius if the folder grew on disk since the last refresh (the trash itself is correct).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the WP0 watcher keeps the tree fresh in practice, and re-walk-on-confirm is the lowest-value of its sibling findings.
- **Where:** `src/components/workspace/editor/confirmDialog.ts` `deleteFolderSpec` consumer in `RightPanelHost.tsx` (count source).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-25-QUALITY-WP7-CONSIDER-ARRAY-ALLOC  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the `consider` closure allocates a 1–2-element array per ancestor purely to reuse `dominantStatus` (cosmetic given changed-paths-only input).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the current form favors single-source-of-precedence clarity, reviewer dismiss-candidate.
- **Where:** `src/components/workspace/filetree/gitRollup.ts` `consider` closure (~79).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-23-QUALITY-WP2-OVERLAY-ESC-PREVENTDEFAULT  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the picker's document-level Esc handler calls `preventDefault()` unconditionally, suppressing native Esc-to-clear and posing a latent conflict if another document Esc consumer (palette/finder) co-mounts.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; no co-mounted overlay conflict exists today.
- **Where:** `src/components/picker/PickerOverlay.tsx:28-37`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-23-QUALITY-WP2-TOAST-SINGLE-SLOT-MULTIPLEX  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the single `toast` slot multiplexes a benign info prune-note and a surfaced error IPC failure, so one can clobber the other.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; acceptable for WP2 scope, split only if it bites.
- **Where:** `src/components/picker/ProjectPicker.tsx:131-149`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-26-QUALITY-WP3-UNDIFFED-MIRROR-EMIT  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the `pip-mirror` emit sends the full serialized HTML for every needed workspace each tick while shown, with no per-tile diffing.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; correct and fine at dogfood N, revisit only if N grows.
- **Where:** `src/components/workspace/useMirrorTicker.ts` (~130, the emit).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-28-QUALITY-WP9-REDUNDANT-MODE-REREAD  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** `pip_set_mode(On)` persists `mode` to disk then routes to `reconcile_on_mode_visibility`, which re-reads the mode back from disk rather than using the in-scope value — a redundant disk read on a user-click path.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; harmless (returns the just-persisted value) and arguably the file's deliberate "fresh from persisted truth" pattern.
- **Where:** `src-tauri/src/pip/commands.rs` (`pip_set_mode` → `reconcile_on_mode_visibility`).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-20-QUALITY-WP4POLISH-STICKY-ZINDEX-COUPLING  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the whole-commits-sticky diff layout relies on z-index ordering across three sticky elements with no mechanical guard (no CSS/visual-regression harness), so a future top/z-index edit could silently restack.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; inherent to UI polish in a repo with no visual-regression harness, reviewer "none required."
- **Where:** `.diff-commits` / `.diff-commit-banner` / `.diff-file-header` in `.diff-scroll` (App.css).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-20-QUALITY-WP6-HOVER-COUPLES-KEYBOARD-CURSOR  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** `onMouseEnter={() => setActiveIndex(i)}` couples mouse-hover to the keyboard cursor in FileFinder, so a resting mouse can yank the active row from an arrow-key user.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; negligible at the 100-row cap and mirrors CommandPalette, arguably WAI.
- **Where:** `src/components/workspace/finder/FileFinder.tsx:177` (`onMouseEnter`).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-19-QUALITY-WP9-PLAN-IMPL-DRIFT-CCNOTFOUND  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** informational plan/impl drift — the Phase-1 outcome text said the not-found case maps to a `CcError::Spawn` variant, but the shipped code introduced a dedicated `CcError::CcNotFound` variant (cleaner than planned).
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the implementation is better than planned, no code change wanted.
- **Where:** `workflow/archive/wp9-phase1-polish.md` P1.1 outcome line vs `src-tauri/src/cc_session/mod.rs`.
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-29-QUALITY-M8WP3-EVAL-CLASSIC-SCRIPT-IN-TEST  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the demo timeline is loaded via `eval(readFileSync(...))` against a bare `window` shim in a dev-only nodetest — brittle if the timeline ever gains a reference the shim doesn't provide.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; only viable read path for a non-module classic script and well-commented, not worth changing while the timeline stays data-only (dismiss-candidate).
- **Where:** `tooling/demo/timeline.filmstrip.nodetest.mjs:31`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-28-QUALITY-WP10-ESLINT-IGNORE-BUNDLED  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the `tmp/**` + `src-tauri/tmp/**` eslint-ignore addition is an in-scope incidental fix bundled into the feature commit (correctly commented + WIP-flagged); informational, "not a defect."
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; tracked not silent, moving it to its own commit isn't worth a dedicated pass.
- **Where:** `eslint.config.js:18-21`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-25-QUALITY-WP4-TRIGGER-ONCE-UNDERFLAGGED  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the deferred-spawn trigger effect's comment ("bumps `spawnNonce` exactly once") slightly overstates the guarantee — once-ness is co-enforced downstream by the spawn effect's `cancelled` self-kill, not by the trigger alone.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the behavior is SAFE and documented-WAI, and editing the comment risks a future reader "tightening" the de-dup and breaking the StrictMode/`cancelled` invariant.
- **Where:** `src/components/workspace/XtermPane.tsx` (trigger effect ~418-425; cross-refs spawn effect `hasSpawnedRef` ~365).
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)

## SURFACE-2026-06-24-QUALITY-DEVPROD-OVERLAY-WINDOW-SIZE-COUPLING  `← Buried 2026-06-30 (debt-paydown sweep#2 WP4)`
- **Was:** the dev overlay re-declares window `width`/`height` in `app.windows[0]` only because Tauri's array-merge replaces the whole window object (the sole intended override is `title`), so a future prod window-size change would see dev silently keep 1280×800.
- **Buried because:** low-impact + (medium-effort or dismiss-candidate) + low-risk — the meh zone; the cheap comment-form is INFEASIBLE (`tauri.dev.json` is strict JSON, `//` breaks parsing), leaving only the medium-effort "track window size in a shared place" fix (BURY decided at sweep #2 WP2).
- **Where:** `src-tauri/tauri.dev.json:6-12`
- **Status:** BURIED 2026-06-30 (debt-paydown sweep#2 WP4)
