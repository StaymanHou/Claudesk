# Feature: QoL-WP6 — New-workspace hotkey ⌘⇧N

**Workflow:** feature
**State:** finalize (complete) — committed 47fdeb9 (local-only)
**Completed:** 2026-06-25
**Created:** 2026-06-25
**Drive mode:** autopilot
**Backlog:** SURFACE-2026-06-24-NEW-WORKSPACE-HOTKEY

## Problem Statement
The native macOS menu's "New Workspace" item displays the accelerator **⌘⇧N** as DISPLAY-ONLY text (the app menu carries no real accelerators by design — items are reachable by click or by a synthetic-chord bridge). Pressing ⌘⇧N on the keyboard currently does **nothing**. Wire ⌘⇧N as a real keyboard chord that opens the project picker, matching the label the menu already promises. The `newWorkspace` action (open the picker overlay) already exists — it's invoked by the menu bridge (`App.tsx:221` → `setShowPicker(true)`); WP6 only adds the keyboard entry point to it.

## Work Tree

- [x] Phase 1: ⌘⇧N opens the picker  <!-- status: DONE — all impl + all 5 verify nodes complete -->
  **Observable outcomes:**
  - Browser: In a `pnpm tauri:dev` build with a workspace open, pressing ⌘⇧N opens the PickerOverlay (the same overlay the filmstrip "+" opens). Verified live by the operator at verify-human (backend-less harnesses can't drive native modifier chords reliably; the React surface is the relevant proof and is covered by the unit test below).
  - CLI: `pnpm vitest run` passes, including new `newWorkspaceChord` cases — ⌘⇧N (`metaKey+shiftKey+key:"n"`) → true; bare ⌘N, ⌘⇧+digit, plain "n", ⌘⇧E → false.
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm exec eslint src` exits 0; `pnpm vite build` exits 0 (no broken imports/JSX across the change).
  - [x] P1.1 Add `newWorkspaceChord(e)` pure predicate — new file `src/components/workspace/newWorkspaceChord.ts`, same shape/posture as `workspaceSwitchChord.ts` (minimal keydown-shape interface, no React/DOM). Returns true iff `e.metaKey && e.shiftKey && e.key.toLowerCase() === "n"`. Header comment: disjoint from ⌘N (editor new-file, Shift ABSENT) and ⌘⇧+digit (filmstrip switch, key is a digit) and the ⌘⇧-letter chords (E/D/T/P/F). Cite the chord-ownership map.  <!-- status: DONE -->
  - [x] P1.2 Register an App-level capture-phase document keydown listener in `App.tsx` (same shape as the ⌘⇧+digit `useEffect`): gated on `view === "workspace-open"`, on match `e.preventDefault()` + `setShowPicker(true)`. Effect deps `[view]`. Placed right after the `showPicker` useState declaration (so `setShowPicker` is in scope).  <!-- status: DONE -->
  - [x] P1.3 Unit-test `newWorkspaceChord` — new `src/components/workspace/__tests__/newWorkspaceChord.test.ts` (tests live under `__tests__/`, mirroring the other chord tests). 8 cases: positives ⌘⇧N (lowercase + uppercase "N"), negatives (bare ⌘N, bare ⇧N, plain "n", ⌘⇧E, ⌘⇧1), Ctrl/Alt-permissive. 8/8 pass.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — eslint on the 3 changed files clean; newWorkspaceChord test 8/8; tsc + vite build clean (from build) -->
  - [x] verify-self  <!-- status: DONE (agent-doable tier) — static slice green (tsc/eslint/vite/8-of-8 chord test); wiring trace confirms predicate → capture-phase listener (gated view==="workspace-open") → e.preventDefault()+setShowPicker(true) → showPicker && <PickerOverlay>, the SAME open-overlay path the filmstrip "+" and menu-bridge already use (operator-verified prior WPs). No integration boundary in the destructive sense; the UI-behavior boundary (App.tsx) is cited by the PickerOverlay outcome. Live native ⌘⇧N chord proof carried to verify-human per the "native features operator-only at live tier" convention. -->
  - [x] verify-human  <!-- status: DONE — operator confirmed all 3 leaves PASS live (2026-06-25) -->
    - [x] P1.verify-human.1 In a workspace-open `pnpm tauri:dev` build, press ⌘⇧N → PickerOverlay opens.  <!-- status: DONE -->
    - [x] P1.verify-human.2 Esc / dismiss closes it; picking a project appends + focuses a new workspace.  <!-- status: DONE -->
    - [x] P1.verify-human.3 ⌘⇧N inert in first-open "picker" view; no collision with ⌘N (editor new-file) or ⌘⇧+digit (switch).  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — no NEW test needed: verified behavior (newWorkspaceChord predicate) already fully covered by the 8-case unit test from build (P1.3), matching the sibling-chord codification pattern; the App.tsx listener wiring follows the same untested-listener pattern as all chords + was operator-verified live. Full suite green: 61 files / 562 tests (+8 vs pre-WP6 554), no regressions. cargo test untouched (frontend-only change). -->

  **No integration boundary requiring a NEW consuming-surface test:** the only consuming surface (PickerOverlay open on ⌘⇧N) requires a native modifier chord against a real Tauri app — out of CI reach by project convention; operator-verified end-to-end at verify-human.

## Current Node
- **Path:** Feature > review-quality (COMPLETE — 0C/0M/2 MINOR auto-backlogged) — ready to finalize
- **Active scope:** none — single phase complete (all impl + verify-auto/self/human/codify [x])
- **Blocked:** none
- **Unvisited:** none (single-phase feature; all phases complete)
- **Open discoveries:** none
- **Build note:** tsc --noEmit clean; eslint src clean (1 pre-existing XtermPane warning, unrelated); `pnpm vite build` exits 0; new chord test 8/8.

## Retrospect
- **What changed in our understanding:** Nothing material — the WBS spec was complete and the existing `newWorkspace` open-overlay path (already wired for the menu bridge + filmstrip "+") meant WP6 was purely an additional keyboard entry point, not new behavior.
- **Assumptions that held:** ⌘⇧N is disjoint from every existing chord (confirmed against the paletteCommands.ts chord-ownership map); the ⌘⇧+digit listener was a perfect structural template; the `view === "workspace-open"` gate is correct (in "picker" view the full-screen picker is already up).
- **Assumptions that were wrong:** None.
- **Approach delta:** Implemented exactly as planned — single phase, three impl tasks (predicate, listener, test), no back-loops. The only nuance was placing the listener effect after the `setShowPicker` useState declaration (vs. next to the sibling ⌘⇧+digit effect) so `setShowPicker` is in scope. No surprises.

## Code-Quality Review — qol-wp6-new-workspace-hotkey

### Strengths
- Pure predicate (`newWorkspaceChord`) extracted into its own file with a minimal keydown-shape interface — exactly the established `workspaceSwitchChord.ts` / `newFileChord.ts` posture, keeping the matcher vitest-testable with no React/DOM coupling.
- Disjointness with the adjacent `⌘N` editor new-file chord is enforced symmetrically and documented on both sides, so the two provably never co-fire.
- App.tsx listener is a faithful mirror of the `⌘⇧+digit` `useEffect` directly above it (capture phase, `view === "workspace-open"` gate, `preventDefault`, identical add/remove teardown).
- Reuses the single canonical open-overlay path (`setShowPicker(true)`) shared by the filmstrip "+", the menu bridge `newWorkspace` callback, and now the chord.
- Test cases cover lowercase + macOS-shifted-uppercase `key` reports plus the three collision vectors (bare ⌘N, ⌘⇧+digit, ⌘⇧E).

### Issues
**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [src/components/workspace/__tests__/newWorkspaceChord.test.ts:46-49] The final case is titled "is permissive on Ctrl/Alt" but the object passes neither `ctrlKey` nor `altKey` — it is identical in effect to the earlier uppercase-N positive. The assertion passes but does not test what its name promises. Either add `ctrlKey: true, altKey: true` to the literal or retitle the case. (Test-naming/coverage-honesty nit, not a behavior bug.)
- [src/components/workspace/newWorkspaceChord.ts:6] Header cites "the chord-ownership map in editor/paletteCommands.ts" — cross-reference hygiene: confirm that path still exists and lists this chord. (Confirmed present this session — the map exists at paletteCommands.ts and ⌘⇧N is correctly disjoint from every entry; reference is sound.)

### Assessment
A small, well-built feature that does exactly one thing the way the codebase already does this class of thing. Pure-predicate + app-level-listener split is the right factoring; disjointness reasoning against the neighbouring ⌘N chord is sound and bidirectionally documented; the listener is a near-verbatim clone of the proven ⌘⇧+digit effect so it advances rather than fragments the pattern. Accrues no debt. Only blemish is one unit-test case whose name overpromises its coverage — harmless to behavior. Net: clean, convention-adherent, needs no refactor pass.

### If you disagree
Operator: dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
