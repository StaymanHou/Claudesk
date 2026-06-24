---
workflow: task
state: Completed 2026-06-24
created: 2026-06-24
docs-only: false
---

# Task: "Reveal in Finder" launcher button

**Workflow:** task
**State:** plan (complete)
**Created:** 2026-06-24

## Problem Statement
Add a third icon button in the right-panel tab row — alongside the Sublime Text and Sublime Merge launchers — that opens the focused workspace's project folder in the macOS Finder.

## Context
- **Frontend launchers:** `src/sublime/sublimeLaunch.ts` (`openSublime`/`openSublimeMerge` — injectable `Invoker`, `.catch` console.error surface-not-dead-click).
- **Button row:** `src/components/workspace/RightPanelHost.tsx:440-461` — `.panel-launch-group` with two `.panel-launch` buttons (`data-testid` `sublime-open` / `smerge-open`), each rendering an icon component, `onClick={() => void openX(projectPath)}`.
- **Icons:** `src/sublime/icons/SublimeTextIcon.tsx`, `SublimeMergeIcon.tsx` — inline `currentColor` SVGs, `size=16` default, `aria-hidden`.
- **Backend:** `src/sublime/commands.rs` (`sublime_open`/`smerge_open` thin IPC shells) + `src/sublime/mod.rs` (pure command builder + `std::process::Command` launch). Registered in `src-tauri/src/lib.rs:90` `generate_handler!`.
- **Convention (arch-noted):** launch via `std::process::Command`, NOT tauri-plugin-shell/opener. Finder needs NO tool discovery — macOS `open` is always present.
- **Tests:** `src/sublime/__tests__/sublimeLaunch.test.ts` (helper invokes the right cmd + surfaces rejection); backend command-construction unit tests live in `sublime/mod.rs`.
- **Design decision:** use `open <dir>` (opens the project folder IN Finder, showing its contents) — the natural "open project folder" behavior. NOT `open -R <dir>` (which reveals+selects the folder in its *parent*). Noted here so act doesn't second-guess.

## Work Tree

- [x] T1 Backend `finder` module  <!-- status: done 2026-06-24 — src-tauri/src/finder/{mod.rs,commands.rs}: pure finder_command(dir)=("open",[dir]) + launch (std::process::Command) + finder_open IPC shell + FinderError; registered mod + finder::commands::finder_open in lib.rs; 3 unit tests (builds open <dir> / no -R flag / spaced-path-one-arg) -->
- [x] T2 Frontend openFinder helper  <!-- status: done 2026-06-24 — src/finder/finderLaunch.ts mirrors sublimeLaunch: injectable Invoker, invoke("finder_open",{projectPath}), .catch console.error("[finder] open failed:",err) -->
- [x] T3 FinderIcon  <!-- status: done 2026-06-24 — src/finder/icons/FinderIcon.tsx: inline currentColor folder glyph, size=16 default, aria-hidden, matches Sublime icon shape -->
- [x] T4 Button in RightPanelHost  <!-- status: done 2026-06-24 — third .panel-launch button after smerge: data-testid="finder-open", aria-label/title "Reveal in Finder", onClick openFinder(projectPath), <FinderIcon/>; imports added -->
- [x] T5 Frontend test  <!-- status: done 2026-06-24 — src/finder/__tests__/finderLaunch.test.ts mirrors sublimeLaunch.test.ts (invokes finder_open with path; rejection surfaced not thrown) -->
- [x] T6 Verify green  <!-- status: done 2026-06-24 — cargo 201 (+3 finder), build+clippy clean; vitest 428 (+2 finder, 50 files); tsc clean; lint 0 errors (1 pre-existing XtermPane warning) -->
- [x] T7 SURFACED: doc resync deferred  <!-- status: done 2026-06-24 — the Finder button is a 3rd permanent launcher in the panel tab row; vision.md/CLAUDE.md mention the Sublime launchers explicitly. A one-line mention of the Finder launcher belongs in those docs but is the kind of resync /product-finalize handles (M4 finalize is queued right after this task). Noted, not blocking. -->

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** The exact OS-level invocation the backend `finder` module spawns — `open <dir>` against a real directory — succeeds (exit 0), confirming the `finder_command` builder produces a working Finder-open; and the command + helper + button are wired (registered IPC command, `finder_open` reachable, button rendered with the right testid). The live click→Finder behavior is native (Tauri IPC + Finder) and is the operator-confirmable part.
**Verification command:** `open "$(mktemp -d)"` (the real `open <dir>` the backend spawns) ; plus `grep finder_open src-tauri/src/lib.rs` (command registered) ; plus `grep 'data-testid="finder-open"' src/components/workspace/RightPanelHost.tsx` (button wired) ; plus the unit suites (cargo 201 incl. finder_command, vitest 428 incl. openFinder).
**Expected result:** `open <tmpdir>` exits 0 (the spawned command works at the OS level); both greps match; suites green.

## Verification Result

**Status:** PASS
**Date:** 2026-06-24
**Evidence:** `open "$(mktemp -d)"` → **exit 0** (a real Finder window opened for the temp dir — the exact `open <dir>` invocation `finder_command` builds, confirmed working end-to-end at the OS level). `grep -c finder::commands::finder_open src-tauri/src/lib.rs` → 1 (command registered). `grep -c 'data-testid="finder-open"' RightPanelHost.tsx` → 1 (button wired). `cargo test --lib finder` → 3 passed. (Full suites: cargo 201, vitest 428 — confirmed at T6.)
**Notes:** The backend half (build `open <dir>` + spawn) is verified end-to-end against the real OS `open`; the live click→Finder gesture is native (Tauri IPC + Finder window) and is the operator-confirmable part — but the spawned command itself is proven to work, so the path is sound. PASS.

## Retrospect
- **What changed in our understanding:** Nothing surprising — the Finder launcher is strictly simpler than the Sublime ones because macOS `open` needs no tool discovery (no PATH/bundle/`open -a` fallback chain), so the backend `finder` module is a pure builder + spawn with no resolver.
- **Assumptions that held:** The sublime-module pattern transferred cleanly (pure `(program,args)` builder + fire-and-forget spawn + thin IPC shell + injectable-Invoker frontend helper + inline currentColor icon + tab-row button). `open <dir>` (open folder contents) over `open -R` (reveal+select in parent) was the right default.
- **Assumptions that were wrong:** None.
- **Approach delta:** Matched the plan exactly. Verify-time nuance: the live click→Finder gesture is native (Tauri IPC + a real Finder window), so the gate verified the backend's real `open <dir>` invocation at the OS level (exit 0) + wiring greps + unit suites, rather than a headless click — appropriate given the M5-anchored no-agent-UI-driver gap.

## Communicate
> **Closure notice:** The "Reveal in Finder" button is complete. A third icon button in the right-panel tab row (beside Open-in-Sublime-Text and Open-in-Sublime-Merge) opens the focused workspace's project folder in the macOS Finder via a `finder_open` backend command (`open <dir>`). Verify in the running app: open a workspace, click the folder icon in the right-panel tab row → the project folder opens in Finder.

Requester = operator — closure notice for self-record.
