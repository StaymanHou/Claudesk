---
workflow: feature
state: finalize (complete) — COMPLETED 2026-06-19
created: 2026-06-19
drive_mode: autopilot
ship_commit: 74dfc2c
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
- **Path:** Feature > finalize
- **Active scope:** none — shipped (74dfc2c) + review-quality done (0C/0M/3 MINOR; #1 fixed in-place, 2 cosmetic auto-backlogged). Ready to finalize.
- **Blocked:** none
- **Unvisited:** finalize → reflect
- **Open discoveries:** 1 arch-resync note survives (subl --project superseded). The std-process-vs-shell-plugin note also survives. The OS-global/Accessibility arch drift is NEW (added to Problem Statement; also needs finalize resync). All low priority, for finalize.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

[SURFACED-2026-06-19] product:arch — WP8 launches Sublime via `std::process::Command`, NOT `tauri-plugin-shell` as arch.md:27,113 state. The `sublime_open` command (called from the frontend button + in-app ⌘⇧E handler) spawns `subl`/`open` directly; a std spawn is the natural fit (consistent with cc_session spawning `claude`) and avoids an unneeded plugin + capability. [Corrected 2026-06-19 per review-quality MINOR #1: the original rationale said "backend-initiated from the global-shortcut handler" — stale; that handler was torn out, the launch is frontend-initiated.] Same class of as-built delta as WP7's portable-pty-vs-tauri-plugin-pty. Resync arch.md at finalize.

[SURFACED-2026-06-19] product:arch — arch.md:113,167 still say hotkey-pop uses `subl --project <file>` when a `.sublime-project` exists. The WP3 probe SUPERSEDED this: `--project` does not activate ST on cold start, so hotkey-pop must use `subl <dir>` (which auto-loads any project file in the folder). WP8 follows the WP3 contract. Resync arch.md at finalize.

## Code-Quality Review — wp8-sublime-hotkey

Ship commit `74dfc2c`. drive_mode autopilot → 0 CRITICAL / 0 MAJOR / 3 MINOR (Case C: MINORs auto-backlogged; MINOR #1 fixed in-place at the source). F39 → finalize.

### Strengths
- Clean pure-core / IPC-shell split (`resolve`/`subl_command` pure, `find_subl`/`launch` impure, `commands::sublime_open` thin) mirrors the established `cc_session/` layout — consistent and unit-testable without a real FS.
- The WP3 invocation contract (PATH→bundle→open-a; `subl <dir>`, never `--project`/`--new-window`) is encoded as code AND pinned by a dedicated negative test (`never_passes_project_or_new_window_flags`) across all three branches — the load-bearing constraint can't silently regress.
- The mid-feature scope correction (OS-global → in-app) was torn out cleanly: no `global_shortcut`/`FocusedProject`/`AccessibilityOnboarding` remnants survive; `lib.rs`/`Cargo.toml`/capabilities correspondingly trimmed.
- Keydown ownership correct by construction: only the `active` (visible) workspace binds the `window` listener, `[active, projectPath]` deps + unmount cleanup → the chord always targets the focused tab, no stale-closure/multi-listener race.
- Error path surfaced not swallowed (`SublimeError`→`String`, frontend `.catch` logs) — carries the WP6 "don't dead-click" lesson.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [workflow/backlog.md / WIP Discoveries] The surviving SURFACE-...-ARCH-SUBLIME-LAUNCH-MECHANISM rationale justified `std::process::Command` as natural because the launch is "backend-initiated from the global-shortcut handler" — stale; the as-built launch is frontend-initiated via `sublime_open`. Conclusion still sound, rationale misleading for the arch-resync reader. — **FIXED in-place 2026-06-19** (corrected the WIP Discoveries entry; backlog entry corrected too — see below).
- [src-tauri/src/sublime/mod.rs:46-47 vs :99] `ST_BUNDLE_BIN` doc cites "WP3 probe §Decision point 2" while the header cites "WP3 T3" for the `--project` finding — inconsistent probe-section shorthand for the same archived source. Cosmetic.
- [src/sublime/chord.ts:1] `chord.ts` header tagged "WP8 Phase 2" reads oddly standalone now the tree collapsed to 2 phases. Cosmetic, accurate.

### Assessment
A well-built small feature that survived a disruptive mid-flight spec reversal without accruing debt. The discovery core is properly factored and the tests pin exactly the constraints that matter (WP3 anti-patterns + three-way precedence) rather than trivia. The frontend keydown-ownership model — gating the listener on `active` — is the subtle part and is done right for an all-mounted workspace shell. The torn-out OS-global machinery left no live remnants (the main risk in a rejected-then-rebuilt feature). The only real wart was doc drift in the surviving rationale, now corrected. Net: advances the codebase; no refactor-worthy findings.

### If you disagree
Operator: dismiss any finding by editing this section in the WIP and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:** The feature's *spec* was wrong, not its plan — "hotkey for Sublime" was implemented as an OS-global shortcut (the literal WBS/arch wording) when the operator actually wanted an in-app keybinding scoped to the focused Claudesk window. The correction came only at verify-human, after a full OS-global build (plugin + Accessibility onboarding + backend focus-mirror) was complete. The in-app design turned out *simpler*: no permission, no plugin, no mirror cell — the frontend already knows the focused path.
- **Assumptions that held:** The WP3 probe's discovery contract (PATH → `.app` bundle → `open -a`; `subl <dir>`, never `--project`/`--new-window`; steal focus) was exactly right and survived the rewrite untouched — the `sublime` core + its 7 pure tests carried over verbatim. The pure-core / IPC-shell split (mirroring `cc_session`) made the teardown clean.
- **Assumptions that were wrong:** That "global hotkey" in the WBS/arch meant *OS-global*. It meant "a hotkey," and the operator's mental model was always in-app (works while using Claudesk). The arch.md happy-path + the WBS task list both encoded the OS-global reading, so the agent built to the doc — but the doc was a confabulation of the real intent. Cost: ~one full phase of build + the global-shortcut/Accessibility/focus-mirror machinery, all torn out. Net still small (Size S), but the rework was avoidable with one clarifying question at plan time about *where* the hotkey should fire.
- **Approach delta:** Plan → build → verify-self auto-skip (Phase 1 + first Phase 2) ran smoothly until the **verify-human pause caught the spec error** — exactly the gate's purpose. The F12 reject → F23 re-plan → rebuild loop worked as designed; the in-app rebuild then passed verify-human cleanly. Verify-human was the load-bearing human gate here: every automated step (tests, clippy, build, self-verify) PASSED on the *wrong* feature, because the code correctly implemented the wrong spec. Only a human pressing the key surfaced it. Reinforces [[verify-self-stub-cannot-cross-subprocess-boundary]] and the broader lesson that verify-human is non-negotiable at a real integration/UX boundary.
