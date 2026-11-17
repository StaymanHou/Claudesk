---
drive_mode: autopilot
---

# Feature: M17 WP6 — OUT rows absent: the `workspaceSurfaces` funnel (+ WP9 folded in)

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-11-17
**Entry:** spec (complex feature)
**WBS:** `workflow-system/product/wbs.md` → "### WP6" (M17), with "### WP9" (no raw local-fs errors on a remote workspace) folded in. Design: `arch/remote-workspaces.md` §G (PLANNED).

## Problem Statement

A remote workspace (its key is `ssh://user@host/path`) mounts the full local IDE half today. Every
surface that touches the local filesystem or a local app is handed the `ssh://` key as if it were a
local path, so each one fails in its own way:

- **Some fail loudly with a raw OS error.** The Docs panel shows `file I/O error: root "ssh://…": No
  such file or directory (os error 2)` (found live at WP5 Phase 2; that is WP9's symptom). The
  editor's `read_file`/`stat_file`, `fs_tree`, `git_file_statuses` and `fs_index` fail the same way,
  by accident (`canonicalize` / `is_dir` on a non-path), never by design.
- **Some pass the key straight on.** `sublime_open`, `smerge_open` and `finder_open` validate nothing:
  they hand `ssh://…` to Sublime/Finder. `term_spawn` would start a LOCAL shell for a remote row.
- **Some run silently in the background.** `workspace_watch_start` runs for every workspace and
  fails with `BadRoot`; the supervisor would read `wip_read`/`transcript_tail` against the key.
- **One is a dead affordance.** The prev/next-turn buttons read xterm's scrollback, which stays
  empty under tmux (arch §I), so on a remote pane they jump nowhere.

Vision Core Principle 7 and the prior `a-workspace-is-its-cc-session` say these surfaces must be
**absent** on a remote workspace: not greyed out, not erroring. Nothing decides that today: there is
no funnel, the workspace model carries no `remote` field (5 sites test `startsWith(REMOTE_KEY_PREFIX)`
ad hoc), and no backend command refuses a remote key on purpose.

Problem statement unchanged (2026-11-17, F12 from P3.verify-human.2): the operator's decision B changes how an informational notice LOOKS (neutral, not error-red), not what the remote workspace must hide or say.

## User Stories

- As the operator with a remote workspace focused, I want its right half to show only what works for
  a remote session (Prompt, and Docs when the workflow gate is on), so that nothing I click reaches
  the wrong machine or shows a raw OS error.
- As the operator, I want a native menu item or chord for an absent surface to tell me it isn't
  available on a remote workspace, rather than doing nothing, so that I'm never left guessing.
- As the maintainer, I want one funnel that every OUT surface consults, plus a guard that fails when
  a new mount site skips it and a backend refusal behind it, so that a missed site errors loudly in
  dev rather than reading the local disk.
- As a gate-OFF user (no workflow system), I want my local workspaces byte-identical to before this
  WP, so that the remote work costs me nothing.

## Acceptance Criteria

**The funnel**
- **AC-1.** `workspaceSurfaces(projectPath)` (TS, pure) returns which surfaces a workspace may show.
  For a remote key the OUT set is **absent**: editor (and with it media viewer, ⌘N, ⌘1–9/⌘W tab
  ops, the editor's command palette), diff, second terminal (tab, ＋, ⌘T, ⌘⇧T), file tree, ⌘P finder,
  ⌘⇧F project search (and Replace All), Sublime Text, Sublime Merge, Finder reveal, open-in-default-app,
  supervisor (header control, ⚙ turn badge, the `useSupervisor` loop), and the **turn-marker jump**
  (prev/next buttons and the readout). For a local key every surface is present, exactly as today.
  The remote test is ONE shared predicate (`isRemoteKey`); the 5 existing ad hoc
  `startsWith(REMOTE_KEY_PREFIX)` sites migrate to it.
- **AC-2.** `availablePanels` takes the surfaces as an input. A remote workspace's panels are
  **Prompt** (gate OFF) or **Docs, Prompt** (gate ON). `defaultPanel` and `reconcilePanel` never
  land on an absent panel: a remote workspace opens on **Docs** (gate ON) or **Prompt** (gate OFF).
  `selectPanel` to an absent panel is the existing graceful no-op.
- **AC-3.** Every mount/trigger site in the seam map (Technical Constraints) consults the funnel
  before mounting or acting. An absent surface renders **no DOM** (not `display:none`, not disabled).

**Triggers that can't be absent (menu items, chords)**
- **AC-4.** The native menu is app-global and cannot be made absent per workspace. When the focused
  workspace is remote, a menu item or chord for an absent surface (View → Editor/Diff/Terminal, Go to
  File, Find in Files, Open in Sublime Text/Merge, Reveal in Finder, ⌘P, ⌘⇧F, ⌘⇧E/D/T, ⌘T, ⌘N) does
  nothing except show one **info toast** in plain words, e.g. "The editor isn't available on a remote
  workspace." No invoke reaches the backend.

**Backend refusal (defense in depth; WP6.2 + WP9.2)**
- **AC-5.** A Rust twin (`workspace_surfaces::refuse_remote(root)`, keyed on
  `config_store::is_remote_key`) returns a typed, plain-words refusal ("Not available on a remote
  workspace.") **before any filesystem, git or process call**. Every command in: `editor_fs` (8),
  `docs` (`docs_list`, `docs_read`), `git_diff` (4), `git_status` (1), `fs_index` (`fs_index`,
  `fs_tree`), `fs_watch` (`workspace_watch_start`), `project_search` (2), `sublime` (2), `finder` (1),
  `term_spawn`, and the supervisor's `wip_read`/`transcript_tail` calls it. Each refusal is pinned by
  a test that passes an `ssh://` root and asserts the typed variant (not an io error string).
- **AC-6.** The error's display string never contains `os error`, `No such file`, or the raw key.

**IN surfaces that read local files (WP9.1)**
- **AC-7.** The Docs panel on a remote workspace (gate ON) shows a plain note: **"Docs aren't
  available on a remote workspace yet."** No `docs_list` invoke is made (the frontend checks the
  funnel first; the backend refusal is the backstop). WP7.3 replaces this note with the real remote
  read.
- **AC-8.** The fs watcher (`useWorkspaceStatus` → `workspace_watch_start`) is not started for a
  remote workspace (WP7.2's poller replaces it there).

**What must NOT change**
- **AC-9.** `offInvariantGuard` (6 arms / 10 subjects) and `workflowApplicableGuard` pass
  **unchanged** (no edits to either file). `availablePanels(false)` for a local workspace still equals
  `AVAILABLE_PANELS`. The kind funnel sits beside the workflow gate, never inside it:
  `isWorkflowApplicable` is not consulted by `workspaceSurfaces`, and vice versa.
- **AC-10.** A local workspace renders byte-identical (gate OFF and gate ON), proven by
  `renderToStaticMarkup` against a HEAD worktree (memory `prove-render-unchanged-via-head-worktree`).
- **AC-11.** IN surfaces stay present and working on a remote workspace: the CC pane, Prompt panel,
  skill row, Recycle button, Session-Start, drive-mode cell, resume announce, Detach/Reconnect, the
  link strip.

**The guard (WP6.3)**
- **AC-12.** `workspaceSurfacesGuard` fails if any OUT surface's mount/trigger site does not consult
  the funnel. It is **mutation-proven per site** (each site's consult removed individually → the
  guard fails, naming that site). Its subject list starts from this spec's seam map and is grepped
  repo-wide (`invoke("<cmd>"` for every OUT command, every OUT component's JSX mount) before it is
  trusted; the grep is recorded in the WIP.
- **AC-13.** `pnpm verify:auto` is green.

**Live (verify-self / verify-human on the mini, scratch folder)**
- **AC-14.** With a remote scratch workspace focused: the right half shows Prompt (gate OFF) or
  Docs + Prompt (gate ON), Docs shows the AC-7 note, no Sublime/Merge/Finder buttons, no prev/next
  turn buttons, no supervisor control; each AC-4 menu item and chord shows its toast. A local
  workspace open beside it is unchanged.

## Asked (spec elicitation, 2026-11-17)

1. **Turn-marker jump on a remote pane: hide, or rebuild on tmux history?** (Rebuild cost ~1 day:
   an exec per turn start to record `history_size`, a copy-mode `goto-line` exec per jump, eviction
   at `history-limit`.) Recommended: hide now, backlog the rebuild. **Operator: hide permanently.**
   No rebuild is planned; no backlog item is written. ⚠️ This overrides the prior
   `a-session-behaves-the-same-wherever-it-runs` ("reproducible at bounded cost → match local"):
   `[PRIOR: a-session-behaves-the-same-wherever-it-runs] overridden by operator ruling — the turn
   jump is absent on remote panes, permanently.` arch §G's "⚠️ open" note is resolved at finalize.

## Assumed (defaults taken without asking; flag any that are wrong)

- **WP9 folds into WP6** (the WBS offered folding into WP6 or WP7). 9.2's refusal IS 6.2's, and
  9.1's only remaining surface after WP6 is Docs (AC-7). WP9's WBS row is marked folded at finalize.
- **The funnel keys on the project key, not a new `remote` field.** No component has the project row
  (`RightPanelHost` and `Workspace` get `project_path` only), and the 5 existing remote checks all use
  the `ssh://` prefix. arch §G names `workspaceSurfaces(project)`; the argument becomes the key.
  Cheap to change if a row is ever threaded through.
- **Menu items and chords for absent surfaces toast** (AC-4) rather than silently no-op or being
  disabled per focused workspace. Disabling native menu items per focus is new menu plumbing for a
  rare case; a silent no-op on a menu click reads as a bug (prior
  `a-silent-non-action-must-not-read-as-done`, weakly: the operator would see nothing opened).
- **Docs on remote shows a note, not absence** (AC-7): Docs is an IN surface (arch §G) pending
  WP7.3, so hiding it would make it vanish and reappear a WP later.
- **Toast wording** follows the existing toast style ("The <surface> isn't available on a remote
  workspace."); exact strings are a plan/build detail.
- **The second terminal is absent, not a remote shell.** arch §G lists it OUT; a remote shell is not
  M17 scope.
- **Recycle on a remote workspace is WP7.4's**, not this WP's. Today its `stat_file` read swallows
  errors (`readSessionMdMtime` returns null) and falls back to the timeout; AC-5's refusal changes
  the error's text, not that behavior. No raw error reaches the operator from it.
- **No Rust surfaces enum is exposed to the frontend.** The "Rust twin" is the refusal predicate
  only; the TS funnel is the authority for what renders.
- **`open_in_default_app` and `stat_media` are covered by the `editor_fs` refusal** (they are
  `editor_fs` commands), and the media viewer is absent with the editor.

## Out of Scope

- Rebuilding the turn jump on tmux history (operator: permanently absent).
- Remote reads (Docs content, poller, Recycle on remote, skill buttons/Prompt confirmation while
  scrolled up): WP7.
- Disabling native menu items per focused workspace.
- A remote second terminal, editor, diff, or file reach (arch §I).
- Threading the project row (`remote`) through the workspace model.
- Installed-build acceptance (WP8).

## Technical Constraints

- **Seam map (from the 2026-11-17 sweep; a FLOOR, re-grep before trusting):**
  - `RightPanelHost`: editor/diff/terminal tab buttons + slots; `onKeyDown` effect (⌘⇧E/D/T via
    `panelForChord`, ⌘P `isFinderChord`, ⌘⇧F `isSearchChord`, ⌘N, ⌘T `newTerminalChord`, ⌘1–9/⌘W);
    `openFile`; `fileTreeRail`; `FileFinder`/`ProjectSearch` overlays + Replace-All `ConfirmModal`;
    `sublime-open`, `smerge-open`, `finder-open`, `open-default-app` buttons; the `fs-change` listener.
  - `App.tsx` menu callbacks `openSublimeText`, `openSublimeMerge`, `revealInFinder` (use
    `focusedPathRef`); `menuActionFor` (`src/menu/menuBridge.ts`) turns menu ids into synthetic
    keydowns for the panel/finder/search chords.
  - `Workspace`: `useSupervisor`, `SupervisorHeaderControl`, `toggleSupervisor`,
    `supervisorTurnBadge`, `getProjectSupervisorEnabled` reveal effect; `workspace-turn-prev`/`-next`
    buttons + `turnNav` readout; `XtermPane` turn-start recording.
  - `useWorkspaceStatus` (`workspace_watch_start/stop`); `DocsPanel` fetch effect.
  - Existing ad hoc remote checks to migrate: `Filmstrip.tsx` `isRemoteKey`, `remoteHookWarning.ts` ×2,
    `autoResumeFire.ts`, `spawnArgs.ts` `spawnCommandFor`.
- **The supervisor is gated AND OUT.** `useSupervisor`'s `enabled` becomes
  `workflowFeaturesEnabled && surfaces.supervisor`; the gate derivation (`isWorkflowApplicable`) and
  the header-arm subjects (`workspaceSupervisorReadout`, `supervisorTurnBadge`) are not edited, so
  `offInvariantGuard` stays unchanged (AC-9). The plan must check the HEADER arm still sees the gate
  consumed in the same expression.
- **`workflowApplicableGuard` walks `useWorkflowFeaturesEnabled()` reads.** A surfaces input must
  not be threaded through a gate value binding in a way that changes its read shape.
- **Guard authority** (`docs/lessons/source-text-guards.md`): render a DOM question (jsdom render of
  `RightPanelHost`/`Workspace` with a remote key, asserting absence), guard only a source question
  (every `invoke` of an OUT command sits behind the funnel). Mutate each form individually; check the
  mutation landed (memory `verify-the-mutation-landed`).
- **Rust refusal placement:** the check runs first in each command body, before `validate_root` /
  `canonicalize` / `Repository::discover` / process spawn. Each module's error enum gains a variant
  (or `#[from]`) for it; `thiserror`, no `unwrap()`.
- **`sync_commands_do_not_block.rs`:** the refusal is a string-prefix check, no blocking; no new
  commands, so no table edits expected.
- **Deleted exports:** if any export is removed (e.g. Filmstrip's local `isRemoteKey`), its consumers
  migrate in the same phase and the app is boot-smoke-tested (backlog `high`:
  `SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC`).
- **Live checks** use the mini's scratch folder `~/claudesk-scratch-remote` (re-add the row via the
  picker; dev `projects.json` has none) and the remote-verify hygiene memory.
- **No 3rd-party dependency** — no probe needed.

## Open Questions

- (none) The turn-jump question was settled at elicitation.

## Work Tree

- [x] Phase 1: Backend refusal — the Rust twin (AC-5, AC-6; WP6.2 + WP9.2)
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml workspace_surfaces` exits 0 and its output lists one refusal test per refused command (27 `#[tauri::command]`s across `editor_fs`, `docs`, `git_diff`, `git_status`, `fs_index`, `fs_watch`, `project_search`, `sublime`, `finder`, `wip`, `transcript`, plus `cc_session::commands::term_spawn`; exact set fixed by P1.3's pin), each passing an `ssh://u@h/p` root and asserting the typed refusal variant.
  - CLI: the pin test (P1.3) fails when a `#[tauri::command]` is added to one of those modules without being listed (proven by adding a throwaway command, then removing it; `git diff --stat` clean afterward).
  - CLI (mutation, per form): deleting the `refuse_remote` call from ONE command (e.g. `sublime_open`, `docs_list`, `git_changed_files`) makes that command's test fail with a `Tests N` line showing ≥1 failed; restored by `cp` aside + `shasum` match (memory `git-checkout-no-ops-on-untracked-file`).
  - CLI (live, dev app via the tauri bridge): `ipc_execute_command docs_list {root:"ssh://u@h/x"}` returns an error whose text is "Not available on a remote workspace." and contains neither `os error`, `No such file`, nor `ssh://`; the same call with a local project root still returns a doc list.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none
  - [x] P1.1 `src-tauri/src/workspace_surfaces/` module: `RemoteRefused` (`thiserror`, Display "Not available on a remote workspace.") + `refuse_remote(root: &str) -> Result<(), RemoteRefused>` keyed on `config_store::is_remote_key`. Pure string check (no IO, no blocking).  <!-- status: done -->
  - [x] P1.2 Call it FIRST in every refused command body (before `validate_root`/`canonicalize`/`Repository::discover`/spawn); each module's error enum gains a `#[from] RemoteRefused` variant whose serialized string is the plain words. `term_spawn`, `wip_read`, `transcript_tail` included.  <!-- status: done -->
  **Build notes (2026-11-17):**
  - ⚠️ **Deviation 1, the "typed variant":** every refused command already returns `Result<_, String>`, so there is no per-module error enum at the IPC boundary to extend. The type is `workspace_surfaces::RemoteRefused` (`thiserror`, `impl From<RemoteRefused> for String`), and what crosses IPC is its exact text `REMOTE_REFUSAL` = "Not available on a remote workspace.". Tests and the frontend match on that exact string.
  - ⚠️ **Deviation 2, `wip_read` / `transcript_tail`:** they have no error channel by design (the supervisor withholds). On a remote key they return their empty value; they still open with the refusal (pinned).
  - ⚠️ **Deviation 3, how the tests split:** 9 commands need no `AppHandle` and are called for real (`src/workspace_surfaces/tests.rs`: equality with the refusal text, plus `wip_read` empty). All 26 are pinned by `syn` in `tests/remote_refusal_is_first.rs`: the first statement must call `refuse_remote`, and REFUSED ∪ EXEMPT must equal the declared commands. EXEMPT = `workspace_watch_stop` (no root). Calling the `AppHandle` commands for real would need Tauri's `test` feature, which is not added.
  - **Count:** 26 refused commands (the plan's "27 + term_spawn" was an over-count: 25 in the modules + `term_spawn`; `workspace_watch_stop` is exempt).
  - **Mutation proofs at build (each individually, `cp` aside + `shasum` restore, each with a `test result` line):** M1 `sublime_open` refusal deleted → pin FAILED; M2 `git_changed_files` refusal deleted → pin FAILED **and** behavioral `git_changed_files_refuses_remote` FAILED; M3 a statement inserted before `docs_list`'s refusal → pin FAILED naming `docs/commands.rs::docs_list`; M4 a throwaway `finder_extra` command added → set pin FAILED; M5 `wip_read`'s refusal deleted → pin FAILED. (The first M3 form, moving the refusal after `validate_frontend_root`, did not compile because `root` is shadowed into a `PathBuf`; it was replaced, never counted. A first batch that never ran, because zsh does not word-split `$t`, was discarded.)
  - [x] P1.3 Tests: one behavioral refusal test per command (ssh root → the refusal variant; Display has no `os error`/raw key), plus a `syn`-based pin (modelled on `tests/sync_commands_do_not_block.rs`) that the refused list equals the `#[tauri::command]` set of those modules, with any deliberate exemption listed with a reason.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: run 1 `pnpm verify:auto` → EXIT=101: clippy `-D warnings` failed, "constant `REMOTE_REFUSAL` is never used" (the text was duplicated in the `#[error(..)]` literal). Fixed in build scope: `#[error("{}", REMOTE_REFUSAL)]`, one source for the text.
    — evidence: run 2 `pnpm verify:auto` → EXIT=0 in 64s; vitest `Test Files 310 passed`, `Tests 3948 passed`; cargo lib `1327 passed; 0 failed; 4 ignored`; `remote_refusal_is_first` `2 passed`; `hook_pl_output` `16 passed`. ESLint `1 problem (0 errors, 1 warning)`: `XtermPane.tsx` react-hooks/exhaustive-deps, a file this phase did not touch (pre-existing).
  - [x] verify-self  <!-- status: done -->
    - [x] O1 refusal tests + set equality — evidence: `cargo test --lib workspace_surfaces` → EXIT=0 "12 passed; 0 failed"; `cargo test --test remote_refusal_is_first` → EXIT=0 "2 passed"; independent perl scan: 26 declared commands in the 11 modules (+ `term_spawn`) == REFUSED ∪ EXEMPT (runner).
    - [x] O2 set pin catches an unlisted command — evidence: `fs_extra` appended to `fs_index/commands.rs` → EXIT=101 "new #[tauri::command]s in a local-only module: [\"fs_extra\"]"; restored, shasum 511f3ef9… matches (runner).
    - [x] O3 pin catches a deleted refusal — evidence: `stat_file`'s refusal line deleted → EXIT=101 naming `editor_fs/commands.rs::stat_file`; restored, shasum d35f7059… matches (runner).
    - [x] O4 (live, consuming surface = the frontend's IPC `invoke`) — evidence: dev app PID 49961 via the tauri bridge, `window.__TAURI_INTERNALS__.invoke` (the bridge's `ipc_execute_command` only reaches plugin commands): with `ssh://u@mini.example/Users/u/proj`, `stat_file`, `docs_list`, `git_changed_files`, `sublime_open`, `term_spawn` each rejected with exactly "Not available on a remote workspace."; `wip_read` → `{path:null,text:""}`. Positive controls on local `claudesk-scratch/scratch-a`: `docs_list` ok (array 0), `fs_index` ok (array 23). The app started 1 s after the runner's `editor_fs` restore; `stat_file` (the mutated command) refusing live shows the running binary is not that mutant.
    - [x] O5 `pnpm verify:auto` — evidence: see verify-auto (EXIT=0).
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11); digest printed, advanced per drive_mode=autopilot
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 64s; `cargo test` ~10s)
    — evidence: `pnpm verify:auto` → EXIT=0 in 68s; vitest 3948 passed (310 files); cargo lib 1327 passed / 0 failed.
    — no new tests: every verified behavior already has a test that fails when it breaks (12 behavioral in `src/workspace_surfaces/tests.rs`; the `syn` pin `tests/remote_refusal_is_first.rs` over all 26 commands, mutation-proven ×7 across build + verify-self).
    — ⚠️ known gap, accepted: no end-to-end IPC test for the `AppHandle` commands (editor_fs, docs, sublime, finder, fs_watch, term_spawn, transcript); it would need Tauri's `test` feature, not enabled in this crate. The live bridge check (verify-self O4) covered that consuming surface once; the pin keeps the refusal the first statement. Phase 2's jsdom tests pin the frontend side (the UI never invokes these for a remote key).

- [x] Phase 2: The TS funnel and the remote right half / header (AC-1, AC-2, AC-3, AC-7, AC-8, AC-9, AC-10, AC-11)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP6 is M17's partial-release point; nothing changed since the spec this morning.
  - Requirements unchanged: yes — Phase 1 changed only the backend error text, which the plan anticipated.
  - Solution still feasible: yes — Phase 1 confirmed every OUT command name the frontend invokes.
  - No superior alternative discovered: yes — none.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: vitest `workspaceSurfaces.test.ts`: a remote key gives every OUT surface `false` and every IN surface `true`; a local key gives all `true`; `isRemoteKey` is the only `REMOTE_KEY_PREFIX` consumer outside `spawnArgs.ts` (`grep -rn "REMOTE_KEY_PREFIX" src --include` equivalent returns only those two modules' production lines).
  - CLI: vitest panelHost: `availablePanels(false)` and `availablePanels(true)` with no surfaces argument equal today's arrays (the OFF-invariant call shape still compiles and passes); with remote surfaces → `["prompt"]` / `["docs","prompt"]`; `defaultPanel`/`reconcilePanel` for remote → `"prompt"` (gate OFF) / `"docs"` (gate ON); `selectPanel(…,"editor",…)` on remote returns the current panel.
  - Browser (jsdom render, `RightPanelHost` + `Workspace` mounted with an `ssh://` key): no element for editor/diff/terminal tabs or slots, file tree, `sublime-open`, `smerge-open`, `finder-open`, `open-default-app`, `workspace-turn-prev`/`-next`, the turn readout, the supervisor header control; the Prompt tab IS present; with the gate ON the Docs panel shows "Docs aren't available on a remote workspace yet." and the `mockIPC` recorder saw NO `docs_list`, `fs_tree`, `git_*`, `workspace_watch_start` call for that workspace.
  - CLI: `offInvariantGuard.test.ts` and `workflowApplicableGuard.test.ts` pass with `git diff --stat` showing neither file changed.
  - CLI: AC-10 — `renderToStaticMarkup` of a LOCAL `RightPanelHost` and `Workspace` (gate OFF and ON) at a HEAD worktree vs the working tree produces identical markup (memory `prove-render-unchanged-via-head-worktree`).
  - Browser (live, dev app via the bridge, state-changing: adds the remote scratch row `~/claudesk-scratch-remote` on the mini to the DEV `projects.json` through the picker add form): opening it shows only the Prompt tab (gate OFF) / Docs + Prompt (gate ON); `webview_find_element` for each absent selector returns none; a local workspace open beside it still shows Editor/Diff/Terminal/Sublime/Finder and the turn buttons. App boots (boot smoke) with no blank window after any export moves.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Docs + Prompt only (gate ON) / Prompt only (gate OFF) on a remote workspace, and the Docs note "Docs aren't available on a remote workspace yet." — now that you see it, still what you want?
  - The remote workspace's right half with a single Prompt tab (gate OFF): does a one-tab row read right, or should the tab row hide when only one panel exists? (decision)
  - [x] P2.1 `src/state/workspaceSurfaces.ts`: `isRemoteKey`, `workspaceSurfaces(projectPath)` → a frozen record (one boolean per surface in AC-1). Migrate the 5 ad hoc sites (`Filmstrip.tsx` local `isRemoteKey`, `remoteHookWarning.ts` ×2, `autoResumeFire.ts`, `spawnArgs.ts` `spawnCommandFor` → `isRemoteKey`); consumers of any moved export migrate in this same phase.  <!-- status: done -->
  - [x] P2.2 `panelHost.ts`: `availablePanels`/`defaultPanel`/`reconcilePanel`/`selectPanel` take an optional surfaces argument defaulting to LOCAL (so `availablePanels(false)` keeps its meaning and the guard file is untouched). The gate parameter and its `WorkflowGateValue` type stay exactly as they are.  <!-- status: done -->
  - [x] P2.3 `RightPanelHost`: compute surfaces from `projectPath`; gate every seam-map site (tab buttons, slots, `fileTreeRail`, `FileFinder`/`ProjectSearch` overlays + Replace-All modal, launcher + default-app buttons, `openFile`, the `fs-change` listener, ⌘N/⌘T/⌘1–9/⌘W).  <!-- status: done -->
  - [x] P2.4 `Workspace`: `useSupervisor` `enabled` = gate value `&& surfaces.supervisor` (gate derivation untouched), header control + ⚙ badge + reveal effect behind `surfaces.supervisor`; turn prev/next buttons + readout behind `surfaces.turnJump`. `useWorkspaceStatus` skips `workspace_watch_start/stop` for a remote key (AC-8).  <!-- status: done -->
  - [x] P2.5 `DocsPanel`: a remote key renders the plain note and makes no `docs_list`/`docs_read` invoke (AC-7).  <!-- status: done -->
  - [x] P2.6 AC-10 render-unchanged proof for local workspaces at a HEAD worktree; record the command + result in the WIP.  <!-- status: done -->
  **Build notes (2026-11-17):**
  - `src/state/workspaceSurfaces.ts`: `REMOTE_KEY_PREFIX` MOVED here from `cc/spawnArgs.ts` (its 3 importers migrated in the same edit; no test imported it), plus `isRemoteKey`, `remoteAuthority`, `workspaceSurfaces`, `LOCAL_SURFACES`. 14 surface fields (the spec's list + `fsWatch` + `docsRead`).
  - `panelHost.ts`: optional `surfaces` param (default `LOCAL_SURFACES`) on `availablePanels`/`defaultPanel`/`selectPanel`/`reconcilePanel`; a local workspace returns the gate's literal array (`availablePanels(false) === AVAILABLE_PANELS`, identity).
  - `RightPanelHost`: tabs, slots, launchers (+ default-app), finder/search/replace/delete overlays, `openFile`, the `fs-change` listener and the keydown branches (⌘P, ⌘⇧F, ⌘N, ⌘T, ⌘1–9, both ⌘W branches, panel chords via `selectPanel(…, s)`) consult the funnel. Absent chords PASS THROUGH in this phase; Phase 3 adds the toast. Docs on remote: `RightPanelHost` renders the note INSTEAD of `DocsPanel` (DocsPanel's fetch lives in hooks, so an early return inside it would break hook order).
  - `Workspace`: `useSupervisor` `enabled: workflowFeaturesEnabled && surfaces.supervisor`; `SupervisorHeaderControl` and the turn prev/readout/next behind the funnel; the reveal effect skips `getProjectSupervisorEnabled` on remote. `useWorkspaceStatus` skips `workspace_watch_start` for a remote key (registration unchanged).
  - **Tests added:** `state/__tests__/workspaceSurfaces.test.ts` (incl. a comment-stripped source scan: no production module but the funnel names `REMOTE_KEY_PREFIX` or an `ssh://` literal), `workspace/__tests__/panelHostSurfaces.test.ts`, `remoteRightPanelLive.test.tsx` (real RightPanelHost, remote ×gate OFF/ON + local positive controls incl. ⌘P/⌘⇧F opening the overlays), `remoteWorkspaceHeaderLive.test.tsx` (live Workspace), `state/__tests__/remoteWatcherSkip.test.tsx`. 24 tests (7 + 5 + 7 + 4 + 1), all pass. `offInvariantGuard` + `workflowApplicableGuard`: 44 pass with `git diff --stat` empty for both files.
  - **P2.6 AC-10 evidence:** HEAD worktree (`292ca86`) vs working tree, throwaway live-mount specs dumping innerHTML + sorted IPC calls. `Workspace` (liveWorkspace harness, local, gate OFF+ON): identical, 78 lines. `RightPanelHost` (real, local, gate OFF+ON): first attempt NON-deterministic at HEAD (the lazy Docs chunk raced fixed sleeps: HEAD run 1 ≠ run 2); fixed by waiting on the condition (`docs-panel` present), then HEAD ×2 == WT ×2, 530 lines, `diff` exit 0. Positive control: `smerge-open` → `smerge-openX` in the working tree changed the dump (line 17), restored by shasum. Specs + worktree removed (`git worktree list` shows main only).
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 in 51s; vitest `Test Files 315 passed`, `Tests 3972 passed` (+24 = this phase's new tests); cargo lib `1327 passed; 0 failed`; ESLint 1 warning, the pre-existing `XtermPane.tsx` exhaustive-deps (not touched).
  - [x] verify-self  <!-- status: done -->
    - [x] O1 funnel unit + scheme-check scan — evidence: vitest `workspaceSurfaces.test.ts` 7 pass; runner's own comment-stripped grep: non-comment `REMOTE_KEY_PREFIX`/`ssh://` code only in `state/workspaceSurfaces.ts` (runner).
    - [x] O2 panel functions — evidence: `panelHostSurfaces.test.ts` 5 + `panelHost.test.ts` 38 pass; `availablePanels(false)` is `AVAILABLE_PANELS` by identity (runner).
    - [x] O3 jsdom render + per-site mutation — evidence: `remoteRightPanelLive` 7, `remoteWorkspaceHeaderLive` 4, `remoteWatcherSkip` 1 pass. Mutant A `{surfaces.sublimeText && (`→`{true && (` → "Tests 3 failed | 4 passed (7)" ("sublime-open: expected <button> to be null"); Mutant B `{surfaces.turnJump && (`→`{true && (` → "Tests 1 failed | 3 passed (4)"; both restored, shasums match (runner).
    - [x] O4 guards unchanged — evidence: `offInvariantGuard` + `workflowApplicableGuard` pass; `git diff --stat` on both → empty (runner).
    - [x] O5 AC-10 render-unchanged — evidence: build-time HEAD-worktree diff (P2 build notes: HEAD×2 == WT×2, exit 0, positive control); runner confirmed `src/__verify_tmp` absent, single worktree, `tsc --noEmit` exit 0.
    - [x] O6 (live, consuming surface = the real Workspace/RightPanelHost in the dev app, state-changing as declared: scratch remote row `<user>@<mini-host>:~/claudesk-scratch-remote` added to the DEV `projects.json` via `add_remote_project`; backup `scratchpad/projects.dev.before.json`) — evidence: after a webview reload (boot smoke after the `REMOTE_KEY_PREFIX` move: picker rendered), opened the remote row. Gate ON (the dev app's current setting). DOM counts: `panel-tab-editor/diff/terminal`, `file-tree-rail`, `sublime-open`, `smerge-open`, `finder-open`, `open-default-app`, `term-tab-row`, `workspace-turn-prev/next/readout`, `workspace-header-supervisor`, `.editor-split` all **0**; `panel-tab-docs` 1 (selected), `panel-tab-prompt` 1, `pip-toggle` 1, `docs-panel-remote-note` 1 with text "Docs aren't available on a remote workspace yet.", `docs-panel` 0. Remote CC live (auto-resume fired the scratch's stand-in `/session-restore` → `SCRATCHRESTOREOK`), skill row + drive-mode cell + Idle status present (IN surfaces, AC-11). Positive control: local `scratch-c` opened beside it shows every one of those surfaces (each count 1) and the real `docs-panel`. Screenshot: `scratchpad/p2-remote-gate-on.png`. Gate OFF is covered by jsdom (O3) only; flipping the dev app's gate was not declared.
    - [x] align: "Docs + Prompt only (gate ON) / Prompt only (gate OFF), and the Docs note — still what you want?" — evidence: CAPTURED live (gate ON) `scratchpad/p2-remote-gate-on.png`; gate OFF via jsdom (`availablePanels(false, REMOTE)` = `["prompt"]`, Prompt selected).
    - [x] align (decision): "a single Prompt tab (gate OFF): one-tab row, or hide the row?" — evidence: CAPTURED via jsdom only (`remoteRightPanelLive`, gate OFF: the tab row holds Prompt + the PiP toggle). The operator can see it live with ⌘, → workflow features off while the remote scratch workspace is open.
  - [x] verify-human  <!-- status: done — operator 2026-11-17: "all good" / "A" -->
    - [x] P2.verify-human.1 (a+b, happy path) The open remote scratch workspace in the dev app: right half = Docs + Prompt with the Docs note; no editor/diff/terminal/file tree, no Sublime/Merge/Finder/default-app buttons, no turn arrows, no supervisor control; local scratch-c beside it unchanged. Includes spec Assumed: Docs shows a note (not absence); the second terminal is absent (not a remote shell). — still what you want?  <!-- status: done — operator: all good -->
    - [x] P2.verify-human.2 (c, decision) Gate OFF on a remote workspace leaves a tab row with only Prompt (+ the PiP toggle): keep the one-tab row, or hide the row when one panel remains?  <!-- status: done — operator chose A: keep the one-tab row -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 64s)
    — evidence: `pnpm verify:auto` → EXIT=0 in 60s; vitest 3973 passed (315 files); cargo lib 1327 passed / 0 failed.
    — new: `remoteRightPanelLive.test.tsx` "keeps the tab row with exactly one tab when only Prompt remains (decision A)" pins P2.verify-human.2 (row present, tabs == [panel-tab-prompt], PiP toggle inside).
    — already covered (no duplicates): the funnel, panel functions, remote/local right half + header, watcher skip, guards unchanged (Phase 2 build tests, mutation-proven in verify-self).
    — ⚠️ accepted gap: `useSupervisor`'s `&& surfaces.supervisor` is not pinned by a frontend test (observing it needs a turn-end fire on a remote workspace). Backstop: `wip_read` / `transcript_tail` return empty for a remote key (Phase 1, pinned), and the supervisor withholds on no evidence by design; the header control + per-project read ARE pinned (`remoteWorkspaceHeaderLive`).

- [x] Phase 3: Triggers that can't be absent + `workspaceSurfacesGuard` + live acceptance on the mini (AC-4, AC-12, AC-13, AC-14)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — operator approved Phase 2 ("all good").
  - Requirements unchanged: yes — decision A (keep the one-tab row) needs no Phase 3 change.
  - Solution still feasible: yes — App already had a per-workspace `notice` channel (M17 WP5).
  - No superior alternative discovered: yes — none.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser (jsdom): with a remote key focused, dispatching each chord (⌘⇧E, ⌘⇧D, ⌘⇧T, ⌘P, ⌘⇧F, ⌘T, ⌘N) shows exactly one info toast naming that surface ("The editor isn't available on a remote workspace." etc.) and the `mockIPC` recorder sees no OUT-command invoke; the same chords on a local key behave as today (no toast).
  - Browser (jsdom whole-app boot, memory `whole-app-jsdom-boot-via-tauri-mockipc`): emitting the native `menu` event for `openSublimeText`, `openSublimeMerge`, `revealInFinder` with a remote workspace focused shows the toast and records NO `sublime_open`/`smerge_open`/`finder_open` invoke; with a local workspace focused the invoke happens.
  - CLI: `workspaceSurfacesGuard.test.ts` passes, and its header records the repo-wide grep that seeded its subject list (`invoke("<cmd>"` for every OUT command + every OUT component's JSX mount).
  - CLI (mutation, per site): removing the funnel consult from EACH guarded site individually makes the guard fail naming that site; each run shows a `Tests N` line with ≥1 failed; each mutant restored by `cp` aside + `shasum` match.
  - Browser (live, dev app via the bridge, state-changing: the remote scratch row on the mini, real CC session in `~/claudesk-scratch-remote` only): AC-14 end-to-end — remote right half per AC-2, Docs note, no launchers/turn buttons/supervisor control; each AC-4 chord shows its toast; the native menu items (driven where the bridge can reach them; otherwise listed for verify-human) show their toast; a local workspace beside it unchanged. After the check: the remote tmux session closed, `ssh -M` (PPID 1) swept, `tmux -L claudesk-dev ls` on the mini clean.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Menu items and chords for an absent surface show an info toast (not a silent no-op, not a disabled item) — now that you see it, still what you want?
  - [x] P3.1 `RightPanelHost` `onKeyDown`: for an absent surface's chord on a remote workspace, consume the key and raise the info toast through the workspace's existing toast surface. Menu items that become synthetic keydowns (`menuActionFor`) follow automatically.  <!-- status: done -->
  - [x] P3.2 `App.tsx` menu callbacks `openSublimeText`/`openSublimeMerge`/`revealInFinder`: consult the funnel on `focusedPathRef`; on remote, route the toast to the focused workspace (App has no toast surface of its own; the channel is chosen at build, the simplest one that the jsdom boot test can observe).  <!-- status: done -->
  - [x] P3.3 `src/state/__tests__/workspaceSurfacesGuard.test.ts`: a DOM arm (jsdom render with a remote key, every OUT mount absent) + a source arm (every production `invoke` of an OUT command sits in a function that consults `workspaceSurfaces`/`isRemoteKey` or behind a mount the DOM arm proves absent), comment-stripped and whitespace-flattened per `docs/lessons/source-text-guards.md`; subject list seeded by the recorded grep.  <!-- status: done -->
  - [x] P3.4 Per-site mutation proof of the guard; record each site + its failing run in the WIP.  <!-- status: done -->
  **Build notes (2026-11-17):**
  - `workspaceSurfaces.ts`: `absentSurfaceNotice(surface)` ("<Subject> isn't available on a remote workspace.") + `launcherSurfaceFor(callback)`.
  - `RightPanelHost`: new prop `onSurfaceUnavailable`; a chord for an absent surface (⌘P, ⌘⇧F, ⌘N, ⌘T, ⌘⇧E/D/T) is CONSUMED and raises one notice. The menu items View→Editor/Diff/Terminal, Go to File, Find in Files arrive as those synthetic keydowns (`menuActionFor`), so they follow. ⌘W and ⌘1–9 are consumed SILENTLY (exactly what they did on an editor with no tabs; never fall through to a window close). `Workspace` wires the prop to its existing toast (`setInjectFailure`).
  - `App`: `focusedIdRef`; the three launcher callbacks consult `workspaceSurfaces(path)[launcherSurfaceFor(cb)]` and, when absent, invoke nothing and push the notice through the existing per-workspace `workspaceNotices` (M17 WP5's channel).
  - **Tests:** `src/__tests__/remoteMenuLaunchers.test.tsx` (real App: 3 launchers × remote/local, 6), `remoteRightPanelLive.test.tsx` +9 (each chord's exact notice + `defaultPrevented`; local control none; ⌘W/⌘1 silent), `remoteWorkspaceHeaderLive.test.tsx` +1 (the wiring: a notice raised by the right panel reaches the workspace toast), `state/__tests__/workspaceSurfacesGuard.test.ts` (31: the floor = every production file whose comment-stripped code names one of the 26 refused commands or mounts/launches an OUT surface must be in `SITES` with its gate reason, none stale, the command list mirrors Rust `REFUSED`; 24 gate pins = nearest `surfaces.<flag>` before the token; App + supervisor-loop pins). Subject list seeded by a repo-wide scan (`scratchpad/scan.mjs`), which found 17 reaching files incl. 3 the first grep shape missed (`mediaIpc.ts` via an injected `invoker`, `TerminalPane.tsx`/`XtermPane.tsx` via the `term_spawn` prop literal).
  - **P3.4 mutation proof (`scratchpad/mutants.py`, 30 gate sites, each individually, cp-aside + sha1 restore, 5 test files per run):** 25 caught first time. 5 survived: replace confirm, delete-folder confirm, fs-change listener, `openFile` (all four unreachable on a remote workspace because their openers are already absent: defense-in-depth gates no DOM test can see) and the `onSurfaceUnavailable` wiring in Workspace (a REAL gap: the harness stubs RightPanelHost). Fixed: 3 new source pins + per-pin tight `max` distance on the two confirms (the delete-folder pin was satisfied by the neighbouring delete-file gate), and the wiring test. Re-run: all 6 now fail their run (each `Tests 1 failed`). Floor probe: a new `src/state/zzNewReach.ts` with `invoke("fs_tree")` failed the floor test naming it; removed, guard back to 31 passed.
  **Back-loop F12 build (2026-11-17, P3.verify-human.2, operator decision B):**
  - `Workspace`: the toast state became `{text, kind: "error" | "info"}`; `setInjectFailure` (now a stable `useCallback`) sets `error`, new `showInfoNotice` sets `info`; `onSurfaceUnavailable={showInfoNotice}`. Render: `is-info` class + `role="status"` + `data-kind` for info; errors keep `role="alert"`, red. The app `notice` prop gained an optional `kind` (CenterStage + App types); App's absent-launcher notice sends `kind: "info"`, the failed Detach (no kind) stays an error.
  - `App.css`: `.workspace-inject-toast.is-info` = the picker's info-toast look (`rgba(160,160,160,0.3)` border, `#1f1f1f`, inherited text).
  - **Tests:** header wiring test asserts `data-kind="info"`, `role="status"`, `is-info`; new "a failure keeps the red alert" test; `remoteMenuLaunchers` asserts `data-kind="info"`; `detachWiring` asserts the failed Detach is `error`. 47 pass across 5 files incl. `cssModifierAudit` (the new modifier is emitted + styled) and `injectFailureToast`.
  - **Mutation (`scratchpad/mut2.py`, each individual, sha-restored):** App `kind: "info"` removed → "Tests 3 failed | 3 passed (6)"; Workspace wiring back to `setInjectFailure` → "1 failed"; `" is-info"` emptied → "1 failed".
  - **Re-verify (live):** remote scratch reopened (the App.tsx edit had Fast-Refresh-reset the workspaces again: the SURFACED discovery), ⌘P → toast `class="workspace-inject-toast is-info"`, `role="status"`, `data-kind="info"`, computed bg `rgb(31,31,31)`, border `rgba(160,160,160,0.3)`, text "Go to File isn't available on a remote workspace."; screenshot `scratchpad/p3-remote-toast-info.png` (neutral, not red).
  - [x] verify-auto  <!-- status: done -->
    — evidence (after the F12 fix): `pnpm verify:auto` → EXIT=0 in 47s; vitest `Tests 4022 passed` (317 files; 4020 → 4022); cargo lib 1327 passed; ESLint only the pre-existing warning.
    — evidence: `pnpm verify:auto` → EXIT=0 in 45s; vitest `Test Files 317 passed`, `Tests 4020 passed` (+47 since Phase 2: guard 31, menu launchers 6, right-panel chords 9, header wiring 1); cargo lib `1327 passed; 0 failed`; ESLint only the pre-existing `XtermPane.tsx` warning.
  - [x] verify-self  <!-- status: done (1 cosmetic) -->
    - [x] O1 chord notices (jsdom, real RightPanelHost) — evidence: `remoteRightPanelLive.test.tsx` 17 pass incl. the 7 per-chord exact-notice + `defaultPrevented` tests, the local "raise no notice" control and ⌘W/⌘1 silent (runner).
    - [x] O2 menu launchers (jsdom whole-app boot) + wiring — evidence: `remoteMenuLaunchers.test.tsx` 6 pass (3 × remote "invokes nothing and says so" / local "still launches"); `remoteWorkspaceHeaderLive` 5 pass incl. the wiring test (runner).
    - [x] O3 guard + independent floor — evidence: guard 31 pass; runner's TS-compiler-based re-derivation (string literals matched exactly against the 26 commands + the MOUNT regex on printer-stripped code) → 18 files == the 18 `SITES` keys, no difference either way (runner, `scratchpad/floor.cjs`).
    - [x] O4 per-site mutation — evidence: build P3.4 (30 sites, all caught after the fixes) + runner's independent Mutant C (finder chord notice deleted → "Tests 1 failed | 16 passed (17)") and Mutant D (`surfaces.projectSearch &&` removed from the replace-confirm block → pin "expected 560 to be less than 200", "Tests 1 failed | 30 passed (31)"); restores sha-matched (runner).
    - [x] O6 `tsc --noEmit` exit 0; `src/state/zzNewReach.ts` absent; the two must-not-change guards' `git diff --stat` empty (runner). `pnpm verify:auto` → see verify-auto.
    - [x] O5 (live AC-14, consuming surfaces = RightPanelHost's chord listener + App's native `menu` event handler, dev app PID 49961 via the bridge; state-changing as declared: the scratch remote row, a real CC session in `~/claudesk-scratch-remote` only) — evidence: remote scratch workspace reopened after a webview reload. Chords fired one per 150 ms, toast read a frame later: ⌘⇧E "The editor isn't available on a remote workspace.", ⌘⇧D "The diff viewer …", ⌘⇧T "The terminal panel …", ⌘P "Go to File …", ⌘⇧F "Find in Files …", ⌘N "New File …", ⌘T "The terminal panel …"; all 9 incl. ⌘W/⌘1 `defaultPrevented: true`. Native menu items emitted through the real event channel (`plugin:event|emit` "menu"): `workspace.openSublimeText` → "Sublime Text isn't available …", `openSublimeMerge` → "Sublime Merge …", `revealInFinder` → "Reveal in Finder …", `view.panel.editor/diff/terminal`, `find.goToFile`, `find.findInFiles` → their notices; afterwards `panel-tab-editor` 0, `file-finder` 0, `project-search` 0, and `pgrep "Sublime Text|Sublime Merge"` → none. Live local control (scratch-c): ⌘P → `file-finder` 1, no toast. Screenshot `scratchpad/p3-remote-toast.png`.
    - [x] align: "a toast (not a silent no-op, not a disabled item) — still what you want?" — evidence: CAPTURED `scratchpad/p3-remote-toast.png` ("Find in Files isn't available on a remote workspace." in the workspace toast, top right of the right half).
    - [x] R1 (re-entry after F12) restyled notice — evidence: 5 files / 47 tests pass (header wiring asserts info/status/is-info; "a failure keeps the red alert"; menu launchers info; failed Detach error; cssModifierAudit; injectFailureToast); `App.css` `.is-info` has exactly the 3 neutral declarations and the base rule keeps the red look; mutant `role=…` → `role="alert"` → "AssertionError: expected 'alert' to be 'status'", "Tests 1 failed | 5 passed (6)", sha-restored; tsc exit 0 (runner). Live: orchestrator capture in the back-loop build (computed bg `rgb(31,31,31)`, `role="status"`, `scratchpad/p3-remote-toast-info.png`).
    - [x] O-cosmetic: the notice rendered in the EXISTING workspace toast, styled RED (error look); the spec said an "info toast".  <!-- status: fixed via F12 (decision B) — see P3 back-loop notes -->
  - [x] verify-human  <!-- status: done — operator 2026-11-17: "1 good", "2 B", then "good" on the restyle -->
    - [x] P3.verify-human.1 (a+b, happy path) In the dev app, on the remote scratch workspace, press ⌘P / ⌘⇧E / ⌘N and use the menu (View → Editor, Workspace → Open in Sublime Text, Find → Find in Files): each answers with one notice "… isn't available on a remote workspace." and does nothing else (spec Assumed: a toast, not a silent no-op, not a disabled menu item; ⌘W / ⌘1 stay silent). — still what you want?  <!-- status: done — operator: "good" -->
    - [x] P3.verify-human.2 (c, decision on the cosmetic) The notice uses the existing workspace toast, styled RED like an error. Keep it red, or give informational notices a neutral style?  <!-- status: done — operator chose B; built via F12; restyle approved ("good") -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — last phase
    — evidence: `pnpm verify:auto` → EXIT=0 in 52s; vitest 4022 passed (317 files); cargo lib 1327 passed / 0 failed; integration tests incl. `remote_refusal_is_first` 2, `hook_pl_output` 16 pass.
    — no new tests: every Phase 3 behavior (chord notices, menu launchers, the toast kind incl. decision B, the guard's floor + 24 pins) is pinned by a test that FAILS when it breaks (mutation-proven: 30 gate sites + 3 toast-kind mutants + 2 runner mutants + the floor probe).
    — live cleanup (remote-verify hygiene): the remote scratch workspace closed through the UI (`filmstrip-close-*`, no dialog); the scratch row removed via the picker × ; dev `projects.json` row set == the pre-WP6 backup (8 rows); dev app stopped (TaskStop) after the close; `ssh -M` masters 0; mini `tmux -L claudesk-dev ls` → "no server running".

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship
- **Live state:** clean (dev app stopped, scratch row removed, no ssh master, no remote tmux server)
- **Blocked:** none
- **Unvisited:** none after Phase 3
- **Open discoveries:** none

## Discoveries

- [SURFACED-2026-11-17] P3.verify-self — editing `src/App.tsx` while `pnpm tauri:dev` runs makes React Fast Refresh RESET App's workspace list: every open workspace unmounts and closes through the normal path, which ENDS a remote session (R-1). Hit twice this phase (the Phase 3 App edit at 12:27 and the App.tsx mutants); no orphans (tmux server + ssh master gone cleanly). Dev-time only. Candidate for the remote-verify-hygiene memory: close remote workspaces before editing App.tsx / running App.tsx mutants.

- [SURFACED-2026-11-17] feature-spec — design-priors.md exceeds size guard (356 lines); read in full for the relevant priors (M17's five) rather than truncated, since they bear directly on this spec.
