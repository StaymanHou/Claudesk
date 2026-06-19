---
workflow: feature
state: verify-codify (all phases complete)
created: 2026-06-19
drive_mode: autopilot
wbs_ref: WP8 (Phase 1, docs/product/wbs.md:170)
size: S
---

# Feature: WP8 — In-app hotkey + button for Sublime Text pop

**Workflow:** feature
**State:** plan (complete) — REVISED 2026-06-19 (F23: OS-global → in-app)
**Created:** 2026-06-19

## Problem Statement

[Updated 2026-06-19: operator rejected the OS-global-hotkey spec at verify-human. Rewritten for an in-app hotkey + a click button. See "## Spec correction" below.]

Claudesk's Phase 1 exit criteria include "Sublime Text pops via hotkey when needed." Provide **two ways** to open Sublime Text at the **active tab's (focused workspace's) project directory**, both living entirely inside the focused Claudesk window:

1. An **in-app keyboard shortcut** `⌘⇧E` — a webview `keydown` handler that fires only while Claudesk is the focused app (NOT an OS-global hotkey). No macOS Accessibility permission required.
2. An **"Open in Sublime" button** in a small toolbar/header at the top of each workspace's **right panel**, labeled with the `⌘⇧E` combo for discoverability. Clicking it does the same thing as the shortcut.

Both resolve the target directory from the **focused workspace** in frontend React state and call a single Rust command (`sublime_open(project_path)`) that launches Sublime. Sublime **steals focus** by default (an explicit user request to switch to Sublime — WP3 decision). Settings/rebinding lands in Phase 4; Phase 1 ships the one hardcoded combo.

The exact Sublime invocation is **already decided** by the completed WP3 probe (archived at `workflow/archive/wp3-sublime-cli-probe.md`): discovery order is PATH (`which subl`) → `/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl` bundle → `open -a "Sublime Text"` fallback; the command is `subl <project-dir>` (or `open -a "Sublime Text" <project-dir>`) — **never** `--project` (it doesn't activate ST on cold start) and **never** `--new-window` (it duplicates windows on every press). Sublime Merge is explicitly out of WP8 scope (Phase 2); the discovery seam is built SM-ready but no SM action is wired.

**Architecture note — no backend focus mirror needed.** Because the hotkey is now an in-app webview handler (not an OS-global Rust handler), the frontend already knows which workspace is focused — it passes that path straight to `sublime_open`. The Phase-1 `FocusedProject` `Mutex` cell and `set_focused_project` command are **no longer needed** and are removed in the revision.

**No 3rd-party probe gap.** The only "external" dependency is the Sublime Text CLI on macOS, and the WP3 probe is complete and archived with a concrete hand-off contract. No known-unknown remains.

**Arch drift to resync at finalize.** (1) `arch.md:113,167` still say "`subl --project <file>` if a `.sublime-project` exists" — superseded by WP3 (use `subl <dir>`). (2) `arch.md:26,88,96,97,114,162-168,193` describe an OS-global `tauri-plugin-global-shortcut` + Accessibility flow — superseded by this in-app-shortcut spec. (3) `arch.md:27,113` say launch via `tauri-plugin-shell` — as-built uses `std::process::Command`. All to resync at finalize.

## Spec correction — 2026-06-19 (operator, at verify-human → F12/F23 back-loop)

**Rejected:** the original WP8 spec built an **OS-global** hotkey via `tauri-plugin-global-shortcut`, requiring a macOS Accessibility grant + a one-time onboarding dialog + relaunch. Operator tested `⌘⇧E` with and without Claudesk focus — it did nothing (the shortcut almost certainly never registered without the Accessibility grant, but that path is being scrapped regardless).

**Correct spec (operator, 2026-06-19):**
- The hotkey is **in-app only** — it should work when Claudesk is the active app, NOT system-wide. (Plain webview keybinding; no OS permission, no plugin, no onboarding dialog, no relaunch dance.)
- It opens Sublime for the project of the **current active tab** in Claudesk.
- ALSO add a **button in the right-panel** (small toolbar/header) that opens Sublime on click, **displaying the `⌘⇧E` combo** on/near it for a friendly, discoverable UX.

**What this deletes from the as-built Phase 1+2:** `tauri-plugin-global-shortcut` dep + `global-shortcut:default` capability + the `lib.rs` plugin registration/handler + `sublime_pop_shortcut()` + `FocusedProject` cell + `set_focused_project` command + `sublime_check_accessibility` command + the focus-mirror `useEffect` + `AccessibilityOnboarding.tsx` + `accessibility.ts`/`focusMirror.ts` (focusMirror's pure helper may survive as the path-selector used by the button/handler).
**What survives:** the `sublime` discovery core (`SublTool`/`find_subl`/`subl_command`/`SublimeError` + its 8 pure unit tests) — still needed to launch Sublime, just invoked from a frontend-callable `sublime_open` command instead of a global handler.

## Work Tree

> **REVISED 2026-06-19 (F23 back-loop).** The original 2-phase tree (Rust global-shortcut core → frontend focus-mirror + Accessibility onboarding) is superseded. New tree below. The `sublime` discovery core from the original Phase 1 SURVIVES and is reused; the global-shortcut/Accessibility machinery from original P1.1/P1.3/P1.4 and all of original Phase 2 is being TORN OUT in revised P1.1. History of the original (completed-then-superseded) nodes is preserved in git + the Spec correction section above.

- [x] Phase 1: Rust — keep discovery core, replace global-shortcut machinery with a frontend-callable `sublime_open` command  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `cargo test` passes — the 8 surviving `sublime` core unit tests (`resolve_*` ×3, `command_for_*` ×3, `never_passes_project_or_new_window_flags`) still pass unchanged. (The 9th, `launch_without_focused_project_errors`, is removed with `FocusedProject`.)
  - CLI: `cargo clippy --all-targets -- -D warnings` is clean.
  - CLI: `cargo build` succeeds; `tauri-plugin-global-shortcut` is GONE from `Cargo.toml`, `global-shortcut:default` GONE from `capabilities/default.json`, and `grep -r "global_shortcut\|FocusedProject\|sublime_check_accessibility\|set_focused_project\|sublime_pop_shortcut" src-tauri/src` returns nothing. `which` stays. `sublime::commands::sublime_open` is registered in `lib.rs` `generate_handler!`.
  - [x] P1.1 Tore out the OS-global machinery: removed `tauri-plugin-global-shortcut` from `Cargo.toml` (gone from Cargo.lock) + `global-shortcut:default` from `capabilities/default.json`; removed from `lib.rs` the plugin+handler+`setup()`, `sublime_pop_shortcut()`, the `Shortcut/Code/Modifiers/ShortcutState/GlobalShortcutExt` imports, `.manage(FocusedProject)`; removed `set_focused_project` + `sublime_check_accessibility` commands, `FocusedProject` struct, `launch_sublime`, `NoFocusedProject`/`Lock` error variants. `which` kept.  <!-- status: complete -->
  - [x] P1.2 Added `sublime_open(project_path: String) -> Result<(), String>` in `sublime/commands.rs` (thin shell) over a new `launch(project_dir)` helper in `mod.rs` (`find_subl` → `subl_command` → spawn `std::process::Command`, fire-and-forget). Registered `sublime_open` in `lib.rs` `generate_handler!`.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete; cargo test 29/29 PASS (7 sublime core tests survive), cargo clippy --all-targets -D warnings clean, cargo build OK, tauri-plugin-global-shortcut gone from Cargo.lock, no global_shortcut/FocusedProject live-code remnants -->
  - [x] verify-self  <!-- status: complete; backend-only revised phase (teardown + thin sublime_open command), CLI-only outcomes confirmed in the build step (cargo test/clippy/build + lockfile + grep). No integration boundary — sublime_open has no consumer until Phase 2 wires it. The real Sublime launch is a Phase 2 verify-human anchor (WP3 consent rule). -->
  - [x] verify-human  <!-- status: complete; AUTO-SKIPPED per drive_mode=autopilot — 4 gates clean (autopilot + verify-self all-PASS + no integration boundary [backend teardown + unconsumed sublime_open command] + no outcome cites a consuming surface). Real Sublime-launch human check belongs to Phase 2 (where the button+hotkey call sublime_open). Affirmation printed for read-time veto. -->
  - [x] verify-codify  <!-- status: complete; no new tests — the 7 surviving sublime core unit tests codify the discovery+command surface; sublime_open is a thin IPC shell over the tested launch()/find_subl/subl_command (its only new line is the spawn, exercised at Phase 2 verify-human). 2 obsolete tests (FocusedProject roundtrip, no-focus error) removed with their code. Full suite: cargo test 29/29 PASS. -->

- [x] Phase 2: Frontend — right-panel "Open in Sublime" toolbar button + in-app ⌘⇧E hotkey  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `pnpm test` (vitest) passes including a new test for the chord matcher (`isSublimeChord(e)` true for metaKey+shiftKey+'e'/'E', false otherwise). The removed `accessibility.test.ts` + `focusMirror.test.ts` are deleted.
  - CLI: `pnpm lint` clean; `pnpm build` (tsc + vite) succeeds; `grep -rn "set_focused_project\|sublime_check_accessibility\|AccessibilityOnboarding\|accessibility" src` returns nothing (dead frontend removed).
  - Browser (verify-self, real surface this time): Playwright opens the dev app, opens a project, and finds in the focused workspace's right panel a toolbar button with text "Open in Sublime" and a visible "⌘⇧E" hint; no JS console errors. (The actual Sublime launch on click/keypress is still a verify-human anchor — Playwright must NOT click it, per the WP3 consent rule barring automated ST activation.)
  - Manual (verify-human, NO Accessibility dependency): with the app focused, clicking the right-panel "Open in Sublime" button opens Sublime Text at the active tab's project dir; pressing ⌘⇧E does the same; ⌘⇧E does nothing when another app is focused (in-app only).
  - [x] P2.1 `src/components/workspace/SublimeToolbar.tsx`: a small toolbar above the placeholder card with an "Open in Sublime" button + a `<kbd>⌘⇧E</kbd>` hint; `onClick` → `invoke("sublime_open", { projectPath })` with a `.catch` surfacing the error (WP6 lesson). Wired into `Workspace.tsx` `workspace-right` (now a flex column); App.css toolbar/button/kbd styles added (dark-only).  <!-- status: complete -->
  - [x] P2.2 In-app ⌘⇧E handler inside `SublimeToolbar`: a `window` `keydown` listener bound only when the workspace is `active` (= `visible` prop) → `isSublimeChord(e)` → `preventDefault()` + same `invoke("sublime_open", ...)`. Only the visible workspace listens, so it targets the active tab. New pure `src/sublime/chord.ts` (`isSublimeChord` + `SUBLIME_CHORD_LABEL`) + 5 vitest.  <!-- status: complete -->
  - [x] P2.3 Removed the dead OS-global frontend: deleted `AccessibilityOnboarding.tsx`, `accessibility.ts` + test, AND the now-unused `focusMirror.ts` + test (the toolbar reads `workspace.project_path` directly — no selector helper needed); restored `App.tsx` to its WP5 shape (no focus-mirror/accessibility effects). grep confirms clean.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete; pnpm test 41/41 PASS (incl chord ×5), pnpm lint clean, pnpm build (tsc+vite) OK, grep confirms dead OS-global frontend removed -->
  - [x] verify-self  <!-- status: complete; subagent confirmed 3/3 CLI outcomes PASS (fresh pnpm test 41/41 incl chord ×5, lint/build exit 0, cargo build OK + sublime_open registered + dead-frontend grep clean). UI-render outcome UNVERIFIED by agent (workspace view is Tauri-gated behind list_projects IPC, unreachable in plain-browser Vite; no jsdom harness) → surfaced to verify-human. Button-click/keypress→ST launch is a verify-human anchor (WP3 consent rule). INTEGRATION BOUNDARY APPLIES (Workspace.tsx + App.tsx modified). No BLOCKING/cosmetic fails. -->
  - [x] verify-human  <!-- status: complete; operator approved all 4 leaves 2026-06-19 (F13). Corrected spec confirmed working: button + ⌘⇧E both open Sublime at the active tab's project; ⌘⇧E is in-app only (no-op when another app focused). NO Accessibility dependency. -->
    - [x] P2.verify-human.1 Right-panel toolbar shows "Open in Sublime" button + ⌘⇧E hint  <!-- status: complete; operator confirmed render -->
    - [x] P2.verify-human.2 Clicking the button opens Sublime at the active tab's project dir  <!-- status: complete -->
    - [x] P2.verify-human.3 Pressing ⌘⇧E (Claudesk focused) opens Sublime at the active tab's project dir  <!-- status: complete -->
    - [x] P2.verify-human.4 ⌘⇧E does NOTHING when another app is focused (in-app only)  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete; no new tests — chord.ts isSublimeChord ×5 codifies the chord decision; button render/click→invoke + the active-only keydown binding need jsdom/RTL (not in project; against pure-logic-vitest convention) and the ST launch can't be automated (WP3 consent rule) — these were human-verified. Integration-boundary consuming surface is a GUI interaction whose "test" is the passed verify-human walkthrough (documented limitation, same as prior UI WPs). Full suites: vitest 41/41, cargo 29/29 PASS. -->

  **Relevance check (before this final-phase close):** Requester still needs this: yes (operator just approved the corrected spec). Requirements unchanged: yes (in-app hotkey + button, as corrected). Solution still feasible: yes (shipped + verified). No superior alternative: yes. **Verdict: proceed to ship.**

## Current Node
- **Path:** Feature > ship (all phases complete)
- **Active scope:** none — both phases complete (Rust core + sublime_open; frontend button + in-app ⌘⇧E). Ready to ship.
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** 1 arch-resync note survives (subl --project superseded). The std-process-vs-shell-plugin note also survives. The OS-global/Accessibility arch drift is NEW (added to Problem Statement; also needs finalize resync). All low priority, for finalize.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

[SURFACED-2026-06-19] product:arch — WP8 launches Sublime via `std::process::Command`, NOT `tauri-plugin-shell` as arch.md:27,113 state. The shell plugin is the IPC-callable shell API for the *frontend*; WP8's launch is backend-initiated from the global-shortcut handler, so a direct std spawn is the natural fit (consistent with cc_session spawning `claude`) and avoids an unneeded plugin + capability. Same kind of as-built delta as WP7's portable-pty-vs-tauri-plugin-pty. Resync arch.md at finalize.

[SURFACED-2026-06-19] product:arch — arch.md:113,167 still say hotkey-pop uses `subl --project <file>` when a `.sublime-project` exists. The WP3 probe SUPERSEDED this: `--project` does not activate ST on cold start, so hotkey-pop must use `subl <dir>` (which auto-loads any project file in the folder). WP8 follows the WP3 contract. Resync arch.md at finalize.
