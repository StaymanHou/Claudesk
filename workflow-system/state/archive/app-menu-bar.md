# Feature: Native macOS App Menu Bar

**Workflow:** feature
**State:** COMPLETED 2026-06-24 — committed f815154 on main (local-only; no push); finalized.
**Created:** 2026-06-24
**drive_mode:** autopilot

## Problem Statement
[Back-loop F12 re-check 2026-06-24] Problem statement unchanged — still "menu mirrors existing actions." What we learned: the re-dispatch + predicate chain is provably correct (Playwright minimal-harness confirmed every synthetic event fires its predicate: finder/search/palette/panel all true). The vh.2 failure is a **StrictMode async-listen double-registration bug** in App.tsx's `menu` effect: under dev StrictMode the effect double-mounts; the `listen("menu")` promise resolves AFTER the first cleanup, so the first subscription's unlisten is never captured → TWO live `menu` listeners → each menu click dispatches the synthetic keydown TWICE. Panel-switch's `setPanel(→target)` is idempotent (double-fire invisible); finder/search/palette use `setX((open)=>!open)` TOGGLES, which cancel out on a double-fire (open→close) — hence "item present, clicking does nothing." Fix: the `cancelled`-flag guard already used by `useWorkspaceStatus` (unlisten immediately if cleanup ran before the promise resolved). Not a root-cause shift — same feature, a wiring defect in the just-written P2.2 effect.

---
### (original)
Claudesk currently runs with Tauri's default auto-generated macOS menu — there is no
custom menu code (`tauri.conf.json` has no menu config; `lib.rs` never calls
`app.set_menu`). The operator wants a real native menu bar that (a) shows the app
version (via the standard macOS About panel) and (b) surfaces the app's existing
keyboard shortcuts and click affordances as discoverable menu items. **Hard constraint:
the menu mirrors EXISTING features only — it adds no new behavior.** Every menu item
maps to an action the app already has (a keyboard chord or a launcher button); no menu
item invents a capability the app lacks. The one genuine design problem is the bridge:
how a native Tauri `MenuEvent` (fired on the Rust side) reaches the existing
React/CodeMirror action layer without stealing keystrokes from the JS handlers that
already own them.

## Design (resolved during plan — the bridge)

Three classes of action, each bridged the safest way (per the Tauri-2 menu research,
2026-06-24, and CLAUDE.md "mirror only"):

1. **OS-native (PredefinedMenuItem)** — `about`, `quit`, `services`, `hide`,
   `hide_others`, `show_all`, `minimize`, `maximize`, `fullscreen`, `close_window`,
   and the Edit group `undo`/`redo`/`cut`/`copy`/`paste`/`select_all`. These wire to
   the macOS responder chain automatically; the Edit items operate on whatever holds
   focus in the WKWebView (including CodeMirror's contentEditable) with ZERO custom
   code. `PredefinedMenuItem::about(Some(metadata))` shows the version from
   `tauri.conf.json` in the standard About panel.

2. **App-level chords (functional via re-dispatch)** — actions handled by plain
   `document` capture-phase keydown listeners: panel-switch ⌘⇧E/⌘⇧D/⌘⇧T, finder ⌘P,
   project-search ⌘⇧F, command-palette ⌘⇧P, tab-switch ⌘1…9, close-tab ⌘W,
   workspace-switch ⌘⇧1…9. A custom `MenuItem` (with **no accelerator** — the keystroke
   stays owned by JS, never intercepted by the menu) emits a `menu` event; the frontend
   listener synthesizes the EXACT `KeyboardEvent` each existing predicate matches and
   dispatches it on `document`, so the unchanged handlers fire. The accelerator is shown
   as **plain-text in the item label** (e.g. `"Editor Panel    ⌘⇧E"`) for discoverability
   without registering/stealing the key.

3. **CodeMirror-internal chords (label-only, no functional click)** — Save ⌘S, Find ⌘F,
   Find Next ⌘G, Find & Replace ⌘R, Zoom In ⌘=, Zoom Out ⌘-, Reset Zoom ⌘0. These live
   in CM6's own keymap; a synthesized DOM event will NOT drive CM6's internal commands,
   and adding a real menu accelerator WOULD steal the key from CM6 (breaking it). So
   these are **disabled/informational menu items** that show the shortcut as label text
   (the key keeps working via CM6; the menu is a cheat-sheet). Rationale recorded so a
   later reader doesn't "fix" them into broken re-dispatch.
   *(Save is the one judgment call — see Phase 2; if a clean save seam is reachable it
   may be promoted to functional, else it stays label-only. Default: label-only.)*

4. **Launcher / callback actions (functional via `menu` event)** — New Workspace (opens
   the picker overlay — a React callback, `App.tsx` `setShowPicker(true)` /
   `openWorkspace`), Open in Sublime Text (`sublime_open`), Open in Sublime Merge
   (`smerge_open`), Reveal in Finder (`finder_open`). These have NO existing accelerator
   (operator: no new hotkeys), so they're click-only `MenuItem`s that emit `menu` events
   the frontend handles by calling the existing seam with the FOCUSED workspace's path.

**Menu→frontend channel:** `app.emit("menu", "<item-id>")` on the Rust side;
one `listen("menu", …)` seam on the frontend dispatches by id to the right path
(synthesize-keyboard-event OR call-callback). Built in `.setup()` via `app.set_menu`.

## Menu structure (final, operator-approved)

- **Claudesk** — About Claudesk (predefined, version) · Services · Hide/Hide Others/Show All · Quit ⌘Q
- **File** — New Workspace `⌘N` (functional: open picker) · Close Tab `⌘W` (functional re-dispatch) · — · Save `⌘S` (label-only)
- **Edit** — Undo/Redo/Cut/Copy/Paste/Select All (all predefined)
- **Find** — Find in File `⌘F` (label) · Find Next `⌘G` (label) · Find & Replace `⌘R` (label) · — · Go to File… `⌘P` (functional) · Find in Files… `⌘⇧F` (functional)
- **View** — Editor Panel `⌘⇧E` · Diff Panel `⌘⇧D` · Terminal Panel `⌘⇧T` (functional) · — · Command Palette `⌘⇧P` (functional) · — · Zoom In `⌘=` · Zoom Out `⌘-` · Reset Zoom `⌘0` (label-only)
- **Workspace** — Switch Workspace 1–9 `⌘⇧1…9` (label-only representative) · Switch Tab 1–9 `⌘1…9` (label-only representative) · — · Open in Sublime Text · Open in Sublime Merge · Reveal in Finder (functional, no accel)
- **Window** — Minimize/Zoom/Fullscreen/Close (predefined)
- **Help** — (standard; empty or app name)

## Work Tree

- [x] Phase 1: Native menu skeleton + About/version + Edit/Window predefined groups  <!-- status: DONE 2026-06-24 — Rust native menu built+wired, verify-human approved, codified (3 app_menu unit tests, 208 total pass) -->
  **Observable outcomes:**
  - Browser/App: launching the built `.app` shows a custom macOS menu bar with menus titled Claudesk, File, Edit, Find, View, Workspace, Window, Help (not the Tauri default) — verified visually + via the App menu containing "About Claudesk".
  - App: clicking Claudesk → About Claudesk opens the standard macOS About panel showing version "0.1.1" (read from tauri.conf.json).
  - App: the Edit menu's Cut/Copy/Paste/Select All operate on focused text (CodeMirror or an input) with no custom code — Copy then Paste round-trips selected editor text.
  - CLI: `cargo build` (debug) succeeds; `cargo clippy -- -D warnings` clean; `cargo fmt --check` clean.
  - Console: no JS errors on launch; no `menu`-event listener errors.
  - [x] P1.1 Add a `menu` module under `src-tauri/src/` (e.g. `app_menu/mod.rs` + `commands.rs` or a single `menu.rs`) that builds the full `Menu` tree with `MenuBuilder`/`SubmenuBuilder`: predefined items for App (about-with-metadata, services, hide group, quit), Edit (undo/redo/cut/copy/paste/select_all), Window (minimize/maximize/fullscreen/close). Custom items (Find/View/Workspace/File) created with stable ids + plain-text shortcut labels, NO accelerators.  <!-- status: DONE — src-tauri/src/app_menu/mod.rs (build_menu + handle_menu_event + ids module + is_functional_id pure helper + 2 unit tests). Labels carry the shortcut as `\t⌘…` tab-separated text; label-only items are .enabled(false). -->
  - [x] P1.2 Wire it into `lib.rs` `.setup()` — `app.set_menu(menu)?` after the existing setup steps; add `.on_menu_event(|app, event| …)` that matches `event.id().as_ref()` and `app.emit("menu", id)` for the functional ids (Phase-2 frontend consumes them; Phase 1 just emits + no-ops on label-only ids).  <!-- status: DONE — mod app_menu declared; .on_menu_event on the builder; build_menu+set_menu in .setup() after env_path fix, both failures surfaced to stderr. -->
  - [x] P1.3 About-panel metadata: pass app name + version (the version comes from the bundle/`tauri.conf.json`; use the `AboutMetadata` builder — confirm the version source resolves to 0.1.1).  <!-- status: DONE — AboutMetadataBuilder.name("Claudesk").version(app.package_info().version.to_string()); package_info is sourced from tauri.conf.json (currently 0.1.1) so it never drifts from the build. -->
  **Build check:** `cargo build` (debug) compiles clean (29s cold); removed an unused `Manager` import after first build (clippy-clean intent).
  - [x] verify-auto  <!-- status: DONE — cargo build clean; cargo fmt clean on app_menu/mod.rs + lib.rs; cargo clippy --lib -- -D warnings clean; app_menu unit tests 2/2 pass (205 prior tests unaffected). Pre-existing fmt drift in config_store/env_path/hook_install is NOT this phase's — left untouched. -->
  - [x] verify-self  <!-- status: DONE — subagent: 4 CLI outcomes PASS (cargo build, clippy -D warnings, rustfmt --check on the 2 changed files, app_menu tests 2/2). 4 outcomes UNVERIFIED (native macOS NSMenu menu bar + About panel + Edit responder-chain are outside any webview DOM, unobservable by Playwright — a stronger form of SURFACE-2026-06-23; + no-frontend-this-phase console N/A). ZERO BLOCKING. No integration boundary (isolated new app_menu module; the `menu` event has no consumer until Phase 2). The native outcomes forward to verify-human. -->
  - [x] verify-human  <!-- status: DONE — operator approved all 5 leaves 2026-06-24 -->
    - [x] P1.verify-human.1 menu bar shows Claudesk/File/Edit/Find/View/Workspace/Window menus (not Tauri default)  <!-- status: PASS -->
    - [x] P1.verify-human.2 Claudesk → About Claudesk opens the macOS About panel showing version 0.1.1  <!-- status: PASS -->
    - [x] P1.verify-human.3 Edit → Cut/Copy/Paste/Select All operate on focused text (round-trip a selection in the editor)  <!-- status: PASS -->
    - [x] P1.verify-human.4 menu structure matches the plan (labels show shortcut text e.g. "Editor Panel  ⌘⇧E"; Save/Find/Zoom rows are greyed/disabled; launcher rows present)  <!-- status: PASS -->
    - [x] P1.verify-human.5 no regression: existing keyboard chords still work (the menu did NOT steal ⌘S/⌘F/⌘⇧E/etc)  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: DONE — refactored is_functional_id to a single FUNCTIONAL_IDS slice (one source of truth shared by build_menu + tests); +1 uniqueness/non-empty invariant test (guards the dup-id silent-collision foot-gun). Native menu visual behavior is not automatable (codified by the verify-human ACK). Full suite: clippy clean, cargo test 208 pass. No integration boundary. -->

- [x] Phase 2: Frontend `menu`-event bridge — functional items fire existing actions  <!-- status: DONE 2026-06-24 — menuBridge + App.tsx listener; verify-human approved (1 F12 back-loop fixed the StrictMode double-listen bug); codified. vitest 438 / cargo 208. -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — operator initiated + approved Phase 1
  - Requirements unchanged: yes — the 4 side feature-requests this session went to backlog, none altered the menu spec
  - Solution still feasible: yes — the `menu`-emit bridge validated in Phase 1
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - App: with a workspace open, clicking View → Editor Panel / Diff Panel / Terminal Panel switches the right-half panel (same as ⌘⇧E/D/T) — verified by the panel tab `is-active` state changing.
  - App: clicking Find → Go to File opens the fuzzy finder overlay; Find → Find in Files opens the project-search overlay; View → Command Palette opens the palette — same overlays the chords open.
  - App: clicking File → New Workspace opens the project picker overlay (the filmstrip "+" path).
  - App: clicking Workspace → Open in Sublime Text / Sublime Merge / Reveal in Finder invokes `sublime_open` / `smerge_open` / `finder_open` against the FOCUSED workspace's project path (verified via the launched app or a stubbed invoker in unit test).
  - App: clicking File → Close Tab closes the focused pane's active editor tab (same as ⌘W), respecting the dirty guard.
  - CLI: `pnpm test` (vitest) passes incl. new tests for the id→synthetic-event mapping; `pnpm tsc`/eslint/prettier clean.
  - Console: clicking a menu item logs no errors; the synthesized KeyboardEvent matches its target predicate (unit-asserted).
  - [x] P2.1 Add a frontend menu-bridge module (e.g. `src/menu/menuBridge.ts`): a PURE map from menu-item id → either a synthetic `KeyboardEventInit` (for the re-dispatch class: panelE/D/T, finderP, search⌘⇧F, palette⌘⇧P, closeTab⌘W) or a "callback" tag (newWorkspace, sublimeText, sublimeMerge, finder). Pure + vitest-tested: assert each synthetic init satisfies the matching existing predicate (`isFinderChord`, `panelForChord`, `isSearchChord`, `isPaletteChord`, `isCloseTabChord`).  <!-- status: DONE — src/menu/menuBridge.ts: MENU_IDS (byte-identical to Rust app_menu::ids), menuActionFor(id) → {kind:"key",init} | {kind:"callback",callback} | null. src/menu/__tests__/menuBridge.test.ts: 10 tests incl. the load-bearing "each synthetic init satisfies its predicate" + palette-vs-finder shift disambiguation + unknown→null. -->
  - [x] P2.2 In `App.tsx` (app-level, owns picker + has the workspace roster) add one `listen("menu", e => …)` effect: for re-dispatch ids, build a `KeyboardEvent("keydown", init)` and `document.dispatchEvent` it (capture-phase handlers fire); for callback ids, call the right seam — `setShowPicker(true)` for newWorkspace, and for the launchers resolve the focused workspace's `project_path` and call `openSublime`/`openSublimeMerge`/`openFinder`.  <!-- status: DONE — listen("menu") effect registered once; "key" → document.dispatchEvent(new KeyboardEvent("keydown", init)); callbacks → setShowPicker / launchers. focusedPathRef (latest-ref) keeps the listener single-registration. -->
  - [x] P2.3 Confirm the launcher menu items target the FOCUSED workspace (App.tsx knows `focusedId` + `workspaces`); guard the no-workspace-open case (menu items inert / picker still openable). New Workspace must work from BOTH the full-screen picker state and the workspace-open state.  <!-- status: DONE — focusedPathRef resolves the focused workspace's project_path; launchers no-op when null (no workspace open). New Workspace: setShowPicker(true) drives the overlay in workspace-open state; in the full-screen picker state the picker is already showing (harmless redundancy) — works from both. -->
  **Build check:** tsc clean; pnpm test 438 pass (incl. 10 new menuBridge); eslint 0 errors (1 pre-existing XtermPane warning, not this change).
  - [x] verify-auto  <!-- status: DONE — tsc --noEmit clean; menuBridge tests 10/10; eslint 0 errors on changed files; prettier applied (3 files) → clean. -->
  - [x] verify-self  <!-- status: DONE — subagent: 3 CLI/unit outcomes PASS (tsc clean; menuBridge 10/10 incl. the load-bearing "each synthetic event satisfies its existing predicate" assertions = the correctness proof for the panel/finder/search/palette/close-tab click outcomes; eslint 0 errors on changed files). 6 outcomes UNVERIFIED — the end-to-end click→action path needs a NATIVE NSMenu click + Tauri IPC, neither drivable by Playwright/dev-URL (SURFACE-2026-06-23 gap). ZERO BLOCKING. No behavior change to an existing surface (additive `menu` listener; existing seams unchanged). Native outcomes forward to verify-human. -->
  - [x] verify-human  <!-- status: DONE — operator approved all leaves after the F12 fix re-verify 2026-06-24 -->
    - [x] P2.verify-human.1 View → Editor/Diff/Terminal Panel each switch the right-half panel  <!-- status: PASS -->
    - [x] P2.verify-human.2 Find → Go to File opens the file finder; Find in Files opens project search; View → Command Palette opens the palette  <!-- status: PASS (after F12 fix — StrictMode double-listen cancelled-guard) -->
    - [x] P2.verify-human.3 File → New Workspace opens the project picker  <!-- status: PASS — opens via click; label now ⌘⇧N. NOTE confirmed with operator: ⌘⇧N is DISPLAY-ONLY (no real accelerator wired — by design, menu carries no real accelerators). Binding ⌘⇧N as a real hotkey is a NEW feature → backlog SURFACE-2026-06-24-NEW-WORKSPACE-HOTKEY. -->
    - [x] P2.verify-human.4 Workspace → Open in Sublime Text / Sublime Merge / Reveal in Finder each launch against the focused workspace  <!-- status: PASS -->
    - [x] P2.verify-human.5 File → Close Tab closes the focused editor tab (dirty-guard respected)  <!-- status: PASS -->
    - [x] P2.verify-human.6 no console errors; disabled label-only rows do nothing  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: DONE — menuBridge correctness fully covered by the 10 unit tests (the load-bearing "each synthetic event satisfies its predicate" assertions). The vh.2 StrictMode double-listen fix is an App.tsx effect-lifecycle bug; the repo has NO jsdom/component-test env (SURFACE-2026-06-22-PANETABS-COMPONENT-TEST-GAP) — standing up the toolchain for one assertion is not warranted (same standing posture); folded this instance into that backlog item instead. No integration boundary (additive `menu` listener; existing seams unchanged). Full suite green: vitest 438, cargo 208. -->

## Current Node
- **Path:** Feature > finalize
- **Active scope:** review-quality complete (0 CRITICAL, 1 MAJOR + 2 MINOR auto-backlogged per Mode 3) → finalize
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** none open (7 backlog SURFACEs filed this session, all separate from this feature: switch-workspace-autofocus-cc-panel, editor-add-new-file, status-indicator-busy-vs-awaiting-input, filetree-git-indicator-bubble-up, terminal-spurious-newline-on-panel-switch, no-way-to-close-workspace, new-workspace-hotkey)

## Code-Quality Review — app-menu-bar

### Strengths
- The re-dispatch-as-alias architecture (menu emits id → frontend synthesizes the exact chord the existing capture-phase handlers already own) avoids the Tauri-2-accelerator-steals-keystroke trap and keeps the menu a pure alias with zero changes to the existing chord handlers.
- `menuBridge.test.ts` asserts each synthetic `KeyboardEventInit` actually satisfies its real chord predicate (incl. ⌘P-vs-⌘⇧P shift disambiguation) — the strongest local guard, breaks loudly if a predicate tightens.
- The `cancelled`-flag StrictMode guard is byte-faithful to the established `useWorkspaceStatus` pattern.
- Three-way item classification (predefined / functional-emit / label-only-disabled) documented coherently + mechanically consistent with `FUNCTIONAL_IDS`.
- Errors surfaced not swallowed throughout (build/set_menu/emit log; launchers `.catch`+log).

### Issues
**CRITICAL** — (none)

**MAJOR**
- [src-tauri/src/app_menu/mod.rs:33 / src/menu/menuBridge.ts:16] The 11 functional id strings are duplicated across Rust (`app_menu::ids`) and TS (`MENU_IDS`) with no mechanical link — only prose. A one-char drift silently dead-clicks one menu item (Rust emits an id the TS switch falls through to `default→null`) with GREEN tests (Rust tests check only `FUNCTIONAL_IDS` internal uniqueness; `menuBridge.test.ts` references `MENU_IDS.*` symbolically so it passes regardless of the literal strings). A cheap guard exists (build-time shared id list, or a Rust test that reads the TS file and asserts the literal strings match). → Auto-backlogged (Mode 3).

**MINOR**
- [app_menu/mod.rs label-only ids] The disabled items carry ids (`file.save.label`, …) that exist only for the negative-space test; no runtime consumer — a one-line test comment would save a reader's hunt. → Auto-backlogged.
- [src/App.tsx:120-160] The `menu` listener body (id→action + key re-dispatch + 4 callback branches) is inline in `App()`, not extracted to a pure testable seam (unlike menuBridge). Consistent with the repo's runtime-bound-listeners-not-unit-tested posture. → Auto-backlogged.

### Assessment
Well-built, appropriately-scoped, adds zero new behavior, integrates through existing chord predicates rather than duplicating them. Rust idiomatic (typed `?`, no unwrap); frontend reuses established patterns faithfully; thoughtful test posture. The one real debt is the unguarded cross-language id contract — worth a mechanical pin. Everything else solid.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** the cleanest menu→action bridge wasn't "synthesize a key for everything" — Tauri-2 menu accelerators STEAL keystrokes from the webview/CM6 on macOS, and CM6-internal commands can't be driven by a synthetic DOM event at all. The viable design is a three-way split (predefined / functional-emit-event / label-only), settled in planning via a Tauri-2 menu-API research pass.
- **Assumptions that held:** the re-dispatch-as-alias approach (menu emits id → frontend synthesizes the exact existing chord) worked exactly as intended for the app-level document chords; the pure menuBridge mapping was fully unit-testable (each synthetic event asserted to satisfy its real predicate); PredefinedMenuItem wired Edit/About/Window to the native responder chain with zero custom code.
- **Assumptions that were wrong:** the menu→action path was NOT correct on first build — a StrictMode async-`listen` double-registration (the `menu` effect lacked the `cancelled` guard) double-dispatched every menu click, which was INVISIBLE for idempotent panel-switch but CANCELLED OUT the finder/search/palette toggles. Caught only at verify-human (the native-menu surface is unobservable by the agent — SURFACE-2026-06-23). A Playwright minimal-harness proved the predicate chain was correct, isolating the cause to the effect lifecycle.
- **Approach delta:** matched the plan's two-phase shape (Rust menu → frontend bridge) exactly. The only deviation was one F12 back-loop (the StrictMode double-listen fix + the ⌘N→⌘⇧N label change), plus confirming with the operator that the displayed accelerators are label-only (no real hotkey bound) — consistent with "mirror existing features, add no new behavior."

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-06-24] design note — Tauri-2 menu accelerators STEAL the keystroke from the webview/CM6 on macOS (research 2026-06-24). Therefore: functional menu items carry NO accelerator (label-only shortcut text + JS re-dispatch); CM6-internal chords (⌘S/⌘F/⌘G/⌘R/⌘=/⌘-/⌘0) are label-only menu items (the key keeps working in CM6; a real accel would break it). Edit/About/Window use PredefinedMenuItem (native responder chain).
