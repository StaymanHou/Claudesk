---
workflow: feature
state: completed
completed: 2026-06-22
drive_mode: autopilot
milestone: 2
wp: WP13
created: 2026-06-22
---

# Feature: WP13 — ⌘W close the active editor tab

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-22

## Problem Statement

Today an open editor tab closes only via its per-tab `✕` (WP12). Sublime/VS Code users
reflexively hit **⌘W** to close the current tab; that chord doesn't exist yet. This WP
adds a bare-⌘W app-level chord that closes the **active tab of the focused editor pane**,
routed through WP12's existing `requestClose` dirty-guard (so ⌘W on an unsaved last view
prompts the Save/Don't-Save/Cancel dialog rather than silently discarding), and is inert
when no tab is open (Sublime parity). It is a small, self-contained slice: one pure chord
predicate + one method threaded down the existing `EditorSplitHandle` → pane ref chain +
one branch in the capture-phase listener that already hosts ⌘1..9 / ⌘P / ⌘⇧F.

[Problem statement unchanged — F12 back-loop 2026-06-22: the goal (⌘W closes via the dirty-guard) is intact. The vh.3 failure was a wiring defect, not a problem shift: `closeActiveTab`'s `useCallback([activeTabId])` captured a STALE `requestClose` that read pre-dirty `docs`, so the guard never fired. Fix = a latest-ref so the handle invokes a render-fresh closure.]

**Reuse map (verified against the code, 2026-06-22):**
- `editor/tabSwitchChord.ts` — sibling pure predicate pattern (`tabSwitchIndex`); `isCloseTabChord` mirrors it.
- `editor/openFiles.ts` — `close` reducer event already does neighbor-reassign + empties-to-null; ⌘W just triggers it via `requestClose`.
- `editor/PaneTabs.tsx:205 requestClose(id)` — the dirty-guard close path (last-view + dirty → `setClosing(id)` dialog; else `doClose`). ⌘W calls `requestClose(activeTabId)` — guard reused for free.
- `editor/PaneTabs.tsx:175 useImperativeHandle` — currently exposes `{openFile, activateIndex, addSynthetic}`; add `closeActiveTab`.
- `editor/EditorSplit.tsx:43 EditorSplitHandle` + `:322 activateIndex` — forwards to the **focused** pane via `paneHandles.current.get(panes.activePaneId)`; add a `closeActiveTab` that forwards identically.
- `RightPanelHost.tsx:301` — capture-phase `keydown` listener (gated on `visible`); add the `isCloseTabChord` branch next to the `tabSwitchIndex` branch, calling `editorSplitRef.current?.closeActiveTab()`.
- `editor/paletteCommands.ts` chord-ownership comment block (~L23–49) — add the ⌘W row.

**Chord-disjointness (confirmed):** bare ⌘W, Shift-absent → disjoint from the entire ⌘⇧ family (⌘⇧E/D/T/P/F) and from bare-⌘P (a letter, finder) / ⌘1..9 (digits). No existing `"w"` keybinding in `src/` (grep clean). CM6 does not bind bare ⌘W. The OS-level ⌘W (close window) is pre-empted by `e.preventDefault()` in the capture-phase handler, same as the other app chords.

## Work Tree

- [x] Phase 1: ⌘W closes the focused pane's active tab (dirty-guarded, Sublime-parity no-op)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/editor/__tests__/closeTabChord.test.ts` exits 0 — `isCloseTabChord` returns true for bare ⌘W and false for ⌘⇧W / ⌘P / ⌘1 / bare W / ⌘⇧E (disjointness cases mirror `tabSwitchChord.test.ts`).
  - CLI: full `pnpm vitest run` exits 0 (no regression in openFiles/PaneTabs/RightPanelHost suites); `pnpm tsc --noEmit`, `pnpm lint`, `pnpm format:check` all clean.
  - Browser (operator, real `pnpm tauri dev`): with ≥2 tabs open in the focused pane and focus inside the CodeMirror editor, pressing ⌘W closes the active tab and activates a neighbor; the OS does not close the window. With a single clean tab, ⌘W closes it → editor shows "No file open". With **no** tab open, ⌘W is inert (nothing happens, no error). With a dirty last-view tab, ⌘W raises the Save/Don't-Save/Cancel confirm dialog (not a silent discard); choosing Cancel keeps the tab.
  - Console: no JS errors on any ⌘W press (including the no-tab inert case).
  - [x] P1.1 Pure `isCloseTabChord(e)` predicate in `editor/closeTabChord.ts` (bare ⌘ + key `"w"`/`"W"`, Shift required-absent; Ctrl/Alt permissive) — mirrors `tabSwitchChord.ts` shape + header comment. + `__tests__/closeTabChord.test.ts` (5 cases, green).  <!-- status: done -->
  - [x] P1.2 Add `closeActiveTab()` to PaneTabs `useImperativeHandle` → `if (activeTabId) requestClose(activeTabId)` (no-op when null = Sublime parity; dirty-guard reused). Relocated `useImperativeHandle` below `requestClose`/`doClose` to avoid a TDZ dep-array reference. **[F12 fix 2026-06-22] Replaced the `useCallback([activeTabId])` with a latest-ref (`closeActiveTabRef.current` rewritten every render; handle calls through it) so the dirty-guard reads CURRENT `docs` — fixes vh.3 (dialog skipped because the memoized closure saw pre-dirty docs).**  <!-- status: done -->
  - [x] P1.3 Add `closeActiveTab` to `EditorSplitHandle` + forward to the focused pane (`paneHandles.current.get(panes.activePaneId)?.closeActiveTab()`), parallel to `activateIndex`.  <!-- status: done -->
  - [x] P1.4 Wire the `isCloseTabChord` branch into RightPanelHost's capture-phase listener (gated on `visible`; `preventDefault` + `editorSplitRef.current?.closeActiveTab()`); placed AFTER the finder/search toggles, suppressed via an `overlayOpenRef` (ref-mirrored `finderOpen||searchOpen` so the once-registered `[visible]` listener reads current overlay state without re-registering). The overlay-suppress guard WAS needed (cf. wp6 overlay-shadowing MINOR).  <!-- status: done -->
  - [x] P1.5 Record ⌘W in the chord-ownership map in `editor/paletteCommands.ts` (the comment block).  <!-- status: done -->
  - [x] verify-auto  <!-- status: done; tsc 0, eslint 0, prettier clean, vitest 16 files/188 tests pass. (1st pass caught+fixed a ref-write-during-render lint error → overlayOpenRef synced via useEffect.) RE-RUN after F12 latest-ref fix: tsc 0, eslint 0, prettier clean, vitest 188 — all green. -->
  - [x] verify-self  <!-- status: done; no BLOCKING. Stub-browser subagent (Vite + ?ws=) confirmed predicate/inert-no-tab/console-clean; the focus-gated + native behaviors were stub-blind and confirmed at verify-human (vh.1-4 all PASS, vh.3 on re-test). -->
    - [x] verify-self.1 App loads, workspace seeds, no JS console errors — PASS  <!-- status: done -->
    - [x] verify-self.2 Inert no-tab ⌘W (empty editor, document-level Meta+w dispatch) — page stays mounted, zero errors — PASS  <!-- status: done -->
    - [x] verify-self.3 Console clean across all ⌘W dispatches — PASS  <!-- status: done -->
    - [x] verify-self.4 Multi-tab close + neighbor-activate via real ⌘W — PASS at verify-human (vh.1)  <!-- status: done -->
    - [x] verify-self.5 Single clean-tab close → "No file open" — PASS at verify-human (vh.2)  <!-- status: done -->
    - [x] verify-self.6 Dirty last-view ⌘W → Save/Don't-Save/Cancel dialog — PASS at verify-human re-test (vh.3) after F12 latest-ref fix  <!-- status: done -->
    - [x] verify-self.7 OS window does NOT close on ⌘W (preventDefault) — PASS at verify-human (vh.4)  <!-- status: done -->
  - [x] verify-human  <!-- status: done; all 4 leaves PASS (vh.1/2/4 round 1, vh.3 re-test round 2 after the latest-ref fix) -->
    - [x] P1.verify-human.1 ≥2 tabs, ⌘W closes active + activates neighbor, window stays — PASS  <!-- status: done -->
    - [x] P1.verify-human.2 single clean tab, ⌘W → "No file open" — PASS  <!-- status: done -->
    - [x] P1.verify-human.3 dirty tab, ⌘W → Save/Don't-Save/Cancel dialog, Cancel keeps — PASS (re-test after F12 latest-ref fix)  <!-- status: done -->
    - [x] P1.verify-human.4 ⌘W never closes the OS window (incl. terminal focus) — PASS  <!-- status: done -->

  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-codify  <!-- status: done; see Codification Decision below. Full suite green: 36 files / 338 tests. -->

  **Codification Decision (verify-codify, 2026-06-22):**
  - **Predicate** (`isCloseTabChord`) — codified by `__tests__/closeTabChord.test.ts` (5 cases: bare ⌘W match incl. "W", requires Cmd, Shift-absent, disjoint from ⌘P/⌘1/⌘⇧E, no bare-W). Green.
  - **Close-routing reducer mechanics** (clean active close → neighbor; active-last → new-last; last tab → empty/null; non-active close keeps active; unknown-id no-op) — ALREADY codified by WP12's `__tests__/openFiles.test.ts` `describe("close")` block (lines 119-158). These ARE the vh.1/vh.2 mechanics; a new test would duplicate. SKIPPED per the no-duplicate rule.
  - **Dirty-guard closure-freshness regression** (the vh.3 bug: `closeActiveTab` must read CURRENT `docs` so a dirty active tab routes to the confirm dialog, not silent close) — **NOT codified by an automated test.** Honest assessment: this regression is a React closure-freshness defect reachable ONLY through the `PaneTabs` component (the dirty decision reads the parent `docs` store + calls `setClosing`; `openFiles.ts` is dirty-unaware). Catching a recurrence needs a rendered-component test with a mutating `docs` prop — which requires a jsdom/Testing-Library environment the repo does NOT have (vitest runs node-default; zero component tests exist; `pure logic → vitest` is the standing posture). Standing up a DOM-test toolchain for one assertion in a size-S WP is disproportionate and is itself an arch decision out of this WP's scope. Covered instead by verify-human (vh.3, re-tested PASS after the fix). Gap surfaced to backlog → SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP.

## Current Node
- **Path:** Feature > finalize
- **Active scope:** finalize — shipped (`f8d6761`), review-quality clean (0 CRIT / 0 MAJOR / 3 MINOR auto-backlogged). Ready to finalize, then halt at WP boundary.
- **Blocked:** none
- **Unvisited:** finalize (then halt at WP boundary per the standing directive)
- **Open discoveries:** SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP (component-test infra absent; dirty-guard regression covered by verify-human only)
- **Blocked:** none
- **Unvisited:** verify-auto → verify-self → verify-human → verify-codify (single-phase feature)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SURFACED-2026-06-22] product:wbs — SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP: the WP13 vh.3 stale-closure regression (closeActiveTab dirty-guard read pre-dirty docs) had NO automated test that would catch a recurrence — the repo has no DOM/component test environment (vitest node-default, zero rendered-component tests). Surfaced to backlog; covered by verify-human for now.

## Code-Quality Review — m2-wp13-close-tab-chord

Reviewer: `code-quality-reviewer` subagent on ship commit `f8d6761`. Result: **0 CRITICAL, 0 MAJOR, 3 MINOR** — well-built, no refactor warranted; MINORs auto-backlogged (Mode 3).

### Strengths
- `isCloseTabChord` mirrors the established `tabSwitchChord.ts`/`finderChord.ts` posture exactly (pure, minimal event shape, vitest-tested); disjointness is explicit and asserted against the real sibling chords.
- The stale-closure fix matches prior art already in the same file (`onActivePathChangeRef`/`onEmptyChangeRef` render-fresh-ref pattern) — consistent idiom, not a one-off.
- Reuses the WP12 `requestClose` dirty-guard rather than re-implementing close logic — ⌘W and the per-tab ✕ share one path, so dialog semantics can't drift.
- Chord-ownership map updated in the same commit (single source of truth stays in sync).
- `overlayOpenRef` avoids re-registering the capture-phase listener on every overlay toggle (listener stays keyed on `[visible]`).

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [PaneTabs.tsx:231-245] `closeActiveTabRef` carries a ~10-line WHY comment restating the render-fresh-ref rationale already documented at L257-263 for the path/empty reporters; a one-liner + back-reference would cut duplication while keeping the vh.3 explanation.
- [closeTabChord.ts:1-32] `CloseTabChordEvent` is a verbatim copy of `TabSwitchChordEvent`; a shared `ChordEvent` type would remove the dup, though per-file self-containment for these pure seams is arguably a feature.
- [__tests__/closeTabChord.test.ts] No case pins the documented Ctrl/Alt-permissive contract (docstring promises Ctrl/Alt aren't part of the chord); a `{metaKey:true,shiftKey:false,ctrlKey:true,key:"w"}` assertion would lock it.

### Assessment
Well-built, tightly-scoped, advances the codebase without debt. Reuses the two correct seams (WP12 dirty-guard + WP1 capture-phase listener), the imperative-handle plumbing is isomorphic to the existing `activateIndex` path, and the subtle stale-closure fix uses an in-file existing pattern with the codification gap honestly surfaced (SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP) rather than hidden. All findings MINOR/cosmetic; none justify a refactor.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** The dirty-guard close logic is NOT a pure-reducer concern — it lives in the `PaneTabs` component (reads the parent `docs` store + calls `setClosing`). That meant the regression class (closure-freshness) is only catchable with a DOM/component test the repo doesn't have. The plan assumed "reuse requestClose" was a trivial wiring; the subtlety was *how* the imperative handle captures it.
- **Assumptions that held:** The imperative-handle chain (PaneTabs → EditorSplit → RightPanelHost) was the right seam, isomorphic to WP12's `activateIndex`. The capture-phase listener + `preventDefault` correctly pre-empts the OS ⌘W. The predicate-disjointness reasoning was sound. The overlay-suppress guard (wp6 lesson) was correctly anticipated at plan time.
- **Assumptions that were wrong:** That a `useCallback([activeTabId])` would be a safe memoization for `closeActiveTab` — it wasn't, because the guard's dirtiness input (`docs`) changes WITHOUT `activeTabId` changing. The first impl shipped a stale closure that defeated the dirty-guard; caught at verify-human (vh.3), not by any automated check.
- **Approach delta:** Two unplanned in-loop fixes beyond the original plan: (1) a ref-write-during-render lint error on `overlayOpenRef` (fixed via `useEffect` sync at verify-auto); (2) the stale-closure dirty-guard bug (fixed via the latest-ref pattern at the F12 back-loop from verify-human). The core 5-leaf plan otherwise landed as written.
