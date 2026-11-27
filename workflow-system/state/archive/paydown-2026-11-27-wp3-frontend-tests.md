---
workflow: task
state: close (complete)
created: 2026-11-27
completed: 2026-11-27
drive_mode: autopilot
docs-only: false
---

# Task: paydown-2026-11-27 WP3 — frontend test scaffolding + precision

**Workflow:** task
**State:** Completed (2026-11-27)
**Created:** 2026-11-27

## Problem Statement
Close the WP3 test-only findings: duplicated live-pane xterm fakes, an imprecise relaunch
assertion, a fragile CSS tripwire (+ the split rule it guards), an unpinned TS↔Rust constant,
and the label guard WP2's rewording needs.

## Context
- `workflow-system/product/backlog-paydown-wbs.md` §WP3, Defaults D8/D10
- ⚠️ Plan written at close: this WP was executed straight from the WBS's item list without a
  separate plan file first (the WBS section served as the plan).

## Work Tree

- [x] T1 Shared fakes `__tests__/xtermFakes.ts` (not `liveWorkspace.tsx`: it imports the real `Workspace` → `@xterm/xterm`, so loading it from the xterm mock factory risks a cycle); three live-pane tests migrated
- [x] T2 Relaunch test asserts `["reconnect", "fire"]`
- [x] T3 Tripwire strips comments sheet-wide; the two `.picker-overlay-panel .picker` rules merged (no same-specificity rule lies between them, so the cascade is unchanged)
- [x] T4 Clipboard-cap pin test in `osc52.test.ts`
- [x] T5 `singleAuthority` absent rule over `Workspace.tsx` + `injectFailure.ts`
- [x] T6 `pnpm verify:auto`

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** each guard change kills its mutant (and, where it fixes a hole, HEAD's version does not), and the full gate is green.
**Verification command:** per-item mutants below; `pnpm verify:auto`
**Expected result:** every new/changed test FAILS on its mutant; `verify:auto` EXIT=0.

## Verification Result

**Status:** PASS
**Date:** 2026-11-27
**Evidence:**
- Relaunch: `relaunchIntent` `reconnect → "no-fire"` → new test `×`, HEAD's copy (as `zzOldRelaunch.test.tsx`) passes (the hole). Restored, `shasum` match.
- Shared fake: `registerOscHandler(52` → `(53` in `osc52.ts` → `osc52Live` 2 failed. Restored.
- Tripwire: a `/* e.g. .x { flex: 1 } */` comment before `.picker-overlay-panel {` → HEAD's tripwire (`zzOldTripwire.test.ts`) fails "a rule … must exist", the new one passes. Restored.
- Cap pin: `clipboard.rs` cap → `8 * 1024 * 1024` → the pin fails. Restored. (⚠️ Corrected 2026-11-27 at WP5: a dev app WAS running, the previous session's agent-launched one; `pgrep "tauri dev"` missed its `tauri.js dev` process line. Its watcher may have rebuilt from the mutant for the seconds it was on disk; it was killed and relaunched from the clean tree before WP5's live checks.)
- Label guard: `// see P4.verify-human.2` prepended to each of the two files → 1 failed each. Restored.
- `pnpm verify:auto` EXIT=0 in 67 s (330 files / 4199 vitest; 1511 cargo). A first run failed `format:check` on the tripwire test; Prettier fixed it.

## Discoveries
<!-- none -->

## Retrospect
- **What changed in our understanding:** the WBS placed the shared fakes in `liveWorkspace.tsx`; the import graph makes that unsafe from inside a `vi.mock` factory, so they got their own app-free module.
- **Assumptions that held:** every change was test-only or a cascade-neutral CSS merge; the full suite stayed green.
- **Assumptions that were wrong:** none of substance; one Prettier miss (caught by the gate).
- **Approach delta:** no plan file before acting (the WBS item list was the plan); recorded above.

**Closure notice:** Requester = operator — closure notice for self-record. Paydown WP3 is complete: 7 findings closed, the m18-wp1 group emptied.
