# Feature: QoL-WP6 — New-workspace hotkey ⌘⇧N

**Workflow:** feature
**State:** verify-codify (all phases complete)
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
- **Path:** Feature > Phase 1 (COMPLETE) — ready to ship
- **Active scope:** none — single phase complete (all impl + verify-auto/self/human/codify [x])
- **Blocked:** none
- **Unvisited:** none (single-phase feature; all phases complete)
- **Open discoveries:** none
- **Build note:** tsc --noEmit clean; eslint src clean (1 pre-existing XtermPane warning, unrelated); `pnpm vite build` exits 0; new chord test 8/8.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
