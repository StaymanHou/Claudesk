# Feature: WP9 — Second-terminal panel + Milestone 2 polish & exit-criteria

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-21
**Entry:** spec (complex feature)
**drive_mode:** autopilot
**WBS:** Milestone 2, WP9 (`docs/product/wbs.md` → `### WP9`)

## Problem Statement

The RightPanelHost today swaps between two live panels — **Editor** (CM6) and **Diff** (git2). The third designed panel, a **second ad-hoc terminal**, was scaffolded but never mounted: `panelHost.ts` reserves `"terminal"` in the `RightPanel` union, `panelForChord` maps `⌘⇧T → "terminal"`, and `selectPanel` *no-ops* on it (`AVAILABLE_PANELS` is `["editor","diff"]` only) so the right half doesn't go blank. WP9 mounts that panel — a real PTY-backed terminal running **the user's login shell** (NOT `claude`), `cd`'d into the workspace dir — reusing the WP7 `cc_*` command + event machinery via the `CcSession` seam.

WP9 is also the **Milestone 2 close-out**: beyond the terminal panel it bundles the M2 polish pass (N-mounted-editors sanity check, error-handling hardening, a dogfood day, the editor-parity checkpoint) and confirms the M2 exit criteria.

The load-bearing risk is captured in the carried-forward backlog item **SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED**: when `"terminal"` is added to `AVAILABLE_PANELS`, the RightPanelHost JSX slot + the tab button + a render test must land in the **same change** — otherwise `selectPanel` returns `"terminal"` but no slot renders and the right half goes blank.

## User Stories

- As the operator, I want a second terminal one click (or `⌘⇧T`) away in the right half of a workspace, already `cd`'d into the project, so I can run ad-hoc shell commands (git, build, grep, scripts) without leaving Claudesk or stealing the left CC pane.
- As the operator, I want the second terminal to behave like the CC pane (live PTY, resize-on-fit, focus-on-click, an "ended" overlay with relaunch) so there's no second mental model.
- As the operator, when a file fails to open/save, the diff panel points at a non-git dir, or a search is empty, I want a clear in-app message rather than a silent dead-click or a blank panel.
- As the operator, I want confidence that N workspaces each holding mounted editors + diff + terminal stay within a sane RAM/CPU envelope before I rely on multi-workspace use.
- As the maintainer, I want the M2 exit criteria confirmed and recorded so the milestone can close cleanly.

## Acceptance Criteria

The feature is done when:

**Second-terminal panel (the substantive piece):**
- A backend path spawns the **user's shell** (resolved from `$SHELL`, falling back to a sane default) in a `portable-pty`, `cwd = workspace project dir`, reusing the existing reader-thread → `cc-output-<sid>` / `cc-exit-<sid>` event machinery and the `send_input`/`resize`/`kill` trait methods. NOT `claude`, no `--dangerously-skip-permissions`.
- `"terminal"` is added to `AVAILABLE_PANELS` **and** in the same change: (a) a Terminal tab button appears in the `right-panel-toggle` row, (b) a mounted `right-panel-slot` renders the terminal pane gated `display: panel === "terminal"`, (c) a vitest asserts `selectPanel(x, "terminal")` now returns `"terminal"` (no longer no-ops), and (d) a render/structure test asserts selecting `"terminal"` mounts a non-empty slot (the SURFACE-2026-06-20 guard — the blank-right-half regression cannot ship undetected).
- `⌘⇧T` and the Terminal tab both promote the terminal panel (direct-select, idempotent), coexisting with CM6's keymap (capture-phase listener, the proven pattern).
- The terminal pane stays **mounted** when backgrounded (`display:none`), preserving its session + scrollback across panel switches and center-stage switches (the "all workspaces stay mounted" rule). Its PTY is reaped on window close alongside the CC sessions (`kill_all`).
- An exited shell shows an "ended" overlay with a relaunch affordance (reuse the bridge state machine or an equivalent).

**M2 polish / exit (the close-out pieces):**
- **N-mounted-editors sanity check:** a documented observation (in this WIP) that N workspaces (target the WP4 N=8 figure, or the realistic operator count) each with a mounted EditorSplit + Diff + terminal stay within an acceptable RAM/CPU envelope; if not, the mitigation (or a backlog deferral) is recorded. Not a separate probe milestone — a build-time guard per arch.md §"N mounted editors."
- **Error handling hardening:** file open/save failure surfaces in-app (not a silent swallow — the WP6 IPC-error lesson); the diff panel against a **non-git directory** shows a clear message rather than a blank/error panel; an **empty search** is handled gracefully (no spurious results / no crash). Each gap found is either fixed or explicitly backlogged with rationale.
- **Editor-parity dogfood checkpoint (informational — gates nothing):** record whether the in-app editor covers the operator's daily Sublime feature set; a missing gesture becomes a backlog item, not a blocker (WP8 kept both Sublime launchers permanently).
- **M2 exit criteria confirmed + recorded:** editing + diff review complete inside the right half with the panel-switch hotkey. (NOTE: "the Sublime Text pop is removed" is **NOT** an exit criterion — WP8's 2026-06-20 redefinition keeps both Sublime launchers permanently.)

## Out of Scope

- Phase 2 stateful-controller features (hook channel, status broadcaster, `state_events()`/`recycle()`, file-watcher). The terminal panel is a plain PTY shell, not a managed CC session.
- Any change to the left-half CC pane behavior.
- Tabbed/multiple second-terminals in the right half (one terminal panel per workspace is enough for v1).
- A live `notify` file-watcher for editor disk-change detection (already deferred — SURFACE-2026-06-21-EDITOR-FILE-WATCHER).
- New search UX beyond graceful empty-search handling (the WP7 per-result/per-file replace deferral, SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE, stays a separate future item).
- Removing either Sublime launcher (both are permanent — vision Core Principle 3 / WP8 redefinition).

## Technical Constraints

- **No 3rd-party probe needed.** The PTY mechanism is WP2-proven and shipped in WP7; the shell-spawn is the same machinery with a different command. No external API/SDK.
- **The `CcSession` seam must not be bypassed** (CLAUDE.md). The shell is driven through the same trait/registry/command surface. The naming friction: today's surface is `cc_*` / `CC_CMD = "claude"`. The spawn target must become parameterizable (see Open Question 1). Whatever the resolution, the "drive a PTY process" path stays single-seam — no second ad-hoc PTY abstraction (arch.md §"M2 forward-compat / seam reuse").
- **Shell resolution:** spawn `$SHELL` if set, else a sane macOS default (`/bin/zsh`, the platform default; `/bin/bash` as a secondary). Set `TERM`/`COLORTERM` as the CC spawn does (no inherited TERM under Tauri — the WP2 finding). A login-interactive shell (`-l`/`-i`) is the likely flag set — confirm in build.
- **Frontend reuse:** the terminal pane mirrors `XtermPane` (DOM renderer only — no WebGL addon; rAF-deferred fit; focus-on-click + post-spawn focus; the `bridge` state machine for spawning/live/ended/error). Decide in plan whether to generalize `XtermPane` (props for command kind) or add a sibling component — favor reuse without over-coupling.
- **Backend command shape:** `command → pure-fn → typed error → String` (the WP6/WP7 shape). Shell resolution should be a pure, unit-testable fn (env in → argv out), TempDir/`$SHELL`-injection testable without spawning a real shell.
- **Dark-only**, React 19 function components, `cargo fmt`/`clippy -D warnings`, no `unwrap()` outside tests, vitest + cargo test gates.

## Open Questions

- [x] **(1) Backend API shape for spawning a non-`claude` process. → RESOLVED (operator, 2026-06-21): approach (b) with a generic internal core.** Add a thin **`term_spawn(project_path)`** command; internally extract a generic **`spawn_argv(argv, cwd, env) -> PtySession`** core that **`cc_spawn` also delegates to** (no duplication). The **public `cc_spawn` command + the WP7 `cc_session` tests stay untouched** — lowest blast radius to the shipped critical CC path. `term_spawn` resolves the shell + builds its argv, then calls `spawn_argv`. Reuse the already-generic `cc_input`/`cc_resize`/`cc_kill` (session-id-keyed, command-agnostic) + the shared `SessionRegistry`. Event names (`cc-output-<sid>` / `cc-exit-<sid>`) are sid-keyed and already generic — **no rename** (a neutral-prefix rename is not worth the churn). Rationale (full weighing in the spec review): (a) pollutes the `cc_*` namespace with a non-CC concept; (c) is the cleanest long-term seam but prematurely refactors the live CC path + its tests for a benefit WP9 is the only current user of — (b) gets (c)-shaped internals for free without disturbing the shipped surface.
- [x] **(2) N for the mounted-editors sanity check. → Decide at build** (informational measurement, not a gate). Use WP4's N=8 as the reference figure; a single measured snapshot is sufficient (operator: no multi-day gate).
- [x] **(3) Login vs interactive shell flags. → Confirm empirically at build.** `-l`, `-i`, both, or none — pick the flag set that gives the operator their normal prompt/aliases without hanging. Build-time check.

## Operator decisions (spec review, 2026-06-21)

- **Spawn API: (b)** — `term_spawn` + generic `spawn_argv` internal core; `cc_spawn` command + WP7 tests untouched (see Open Question 1).
- **M2 close-out rigor: build it, verify-human now, close the WP.** No multi-day dogfood gate — the N-editors check is one measured snapshot, the editor-parity checkpoint is recorded as informational, and exit criteria are confirmed at verify-human. Real-use issues will be handled via the **incident flow** as they arise, not by holding WP9 open.

## Next Step

All open questions are resolved (operator decisions above) and are **build-time/plan-time design choices**, not external unknowns — no 3rd-party API, no unverified integration (the PTY mechanism shipped in WP7). → **`/feature-plan`** (F4); no `/feature-research` detour warranted.

## Plan-time findings (2026-06-21)

The error-handling tasks the spec lists are **already largely covered** by prior WPs — verified during planning, so Phase 2 is a *verification sweep + gap-fix*, not new-build:
- **Non-git dir for diff:** end-to-end already handled — `git_diff::open_repo` (`Repository::discover`) maps "no enclosing repo" to `GitDiffError::NotARepo("<path> is not a git repository")`; `DiffPanel`'s `git_changed_files` `.catch` surfaces `String(e)` into a `list: {kind:"fail", message}` state that renders inline. Phase 2 *confirms* this renders cleanly (clear message, no blank panel) and fixes only if the render is poor.
- **Empty search:** already handled both sides — `ProjectSearch` guards `query.pattern === ""` (early-return no-op + disabled Search button); backend `compose_pattern` returns `BadPattern("pattern is empty")`. Phase 2 confirms; no new guard expected.
- **File open/save failures:** `editor_fs` commands return typed errors → `String`; `editorLoad`/`editorSave` thread them. Phase 2 confirms an open/save failure surfaces in-app (not a silent swallow) and closes any gap found.

So the only genuinely *new* error-handling code expected in Phase 2 is for the **new** terminal-spawn path (a `term_spawn` failure must surface, mirroring `XtermPane`'s error overlay) — which Phase 1 builds in. Phase 2's error sweep is mostly assertion + a thin regression test per case.

## Back-loop F12 re-entry — Problem Statement re-check (2026-06-21)

**Problem statement unchanged** — still "mount a working second-terminal panel." What we learned at verify-human: the terminal slot mounts but paints no prompt because `TerminalPane` mounts while `display:none` (Editor is the default panel), so `term.open()` + the prompt-output writes land in a zero-size xterm and never repaint on reveal. The shell itself is healthy (spawned, at its prompt). This is a frontend **visibility-wiring gap**, not a changed root problem; the fix is additive (visibility-aware spawn + refit), not a redesign. Verify-self (browser, no Tauri backend) couldn't surface it because the actual paint of live PTY output only happens in the native app.

### REVISED root cause (the first F12 fix was WRONG) — empirical telemetry, 2026-06-21

The deferred-spawn+refit fix was browser-re-verified but the native app still showed BOTH terminals blank — including the always-visible CC pane, which disproves the hidden-mount theory. Ran `/debug-empirical-telemetry`: instrumented the Rust reader thread + the frontend `cc-output` listener, auto-seeded via a temp `devUrl ?ws=`, read native stderr.

- Backend reads bytes + `app.emit` `emit_ok=true` (healthy). Frontend listener fires, `hasTerm=true`, `term.write()` called with real bytes (healthy).
- **But 5 reader threads started (cc-1..cc-5) while only cc-3 had a frontend listener** → the spawn effect fires MULTIPLE times, spawning duplicate orphaned sessions; the visible terminal sometimes binds to a session whose prompt already flushed before its listener attached → blank. Intermittent (race): my screencap showed CC painted (won the race), the user saw blank (lost it).

**ROOT CAUSE #1 (multiple-spawn):** `XtermPane`'s spawn effect re-ran on every parent render because `onSessionId` is an inline arrow (new identity each render) in its deps → multiple `invoke(spawnCommand)` fired before the first resolved → 3 CC sessions for one pane. Latent since WP7 (the inline arrow predates WP9); only surfaced now because the shell path made the consequence visible. **FIX #1 (applied + live-verified):** hold `onSessionId` in a ref (updated via effect, not during render), narrow the spawn-effect deps to `[bridge.phase, projectPath, fitAndResize, spawnCommand, active]`. Result: exactly 1 CC session (was 3), CC pane paints. Kept the proven `cancelled`-closure structure (reverted the over-engineered ref rewrite). Kept the `active` deferral + refit-on-active.

**ROOT CAUSE #2 (shell prompt race — STILL OPEN):** with #1 fixed, CC paints but the SHELL terminal still shows only a cursor. Diagnosis: a shell emits its prompt **exactly once** at startup; the backend reader thread starts emitting `cc-output-<sid>` the instant the child spawns, but the frontend can only `await listen(cc-output-<sid>)` AFTER `term_spawn`/`cc_spawn` returns the id — so the one-shot prompt bytes are emitted before any listener exists and are LOST (Tauri events are not buffered). CC survives this because `claude` emits continuously (a late listener still catches subsequent frames); a quiescent shell does not. Confirmed by: shell process alive + at prompt (`Ss+`), backend emits OK, but pane blank; CC (continuous emitter) paints fine with identical frontend code.
**FIX #2 (APPLIED + LIVE-VERIFIED):** backend buffer-and-flush. `PtyCcSession` now holds an `OutputBacklog = Arc<Mutex<Option<Vec<String>>>>`, created `Some(empty)` at spawn (BUFFERING mode). The reader thread appends to the backlog while it's `Some`; emits live once it's `None`. New trait method `mark_ready()` + `SessionRegistry::ready()` + `cc_ready(sid)` command: the frontend calls `cc_ready` right after attaching both `cc-output`/`cc-exit` listeners; `mark_ready` `take()`s the backlog (Some→None, flips reader to live) and emits the buffered chunks in order. No output lost between spawn and listener-attach; no double-emit at the seam (single mutex). Live-verified: the terminal panel paints `stayman@Mac claudesk %` (was a bare cursor). CC also routes through this now (harmless — its first frames buffer ~instantly then flush). Rejected alt: fixed reader-thread delay (racy).

## Work Tree

- [x] Phase 1: Second-terminal panel (backend shell-spawn + frontend pane + RightPanelHost mount)  <!-- status: complete — all impl + verify nodes done; operator-approved 2026-06-21 -->
  **Observable outcomes:**
  - CLI (backend): `cargo test` passes, incl. new `term_session` (or `cc_session`) tests for the pure shell-resolution fn — `resolve_shell_argv` returns `["$SHELL", <flags>]` when `SHELL` is set and the platform default (`/bin/zsh`) when unset; existing `cc_session` tests still green (untouched). `cargo clippy -- -D warnings` clean.
  - Browser (Playwright, via `?ws=<path>` dev seam): selecting the **Terminal** tab in `.right-panel-toggle` (or `⌘⇧T`) makes a non-empty `.right-panel-slot` front — a terminal host element (`[data-testid="term-pane"]`) is rendered and `display:block` while Editor/Diff slots are `display:none`. The slot is NOT blank (the SURFACE-2026-06-20 guard).
  - CLI (vitest): `selectPanel(x, "terminal")` now returns `"terminal"` (no longer a no-op); a structure test asserts the RightPanelHost renders a terminal slot when `panel === "terminal"`.
  - Console: no JS errors on selecting the Terminal panel; a `term_spawn` rejection renders the error overlay (not a silent dead-click).
  - [x] P1.1 Backend: extract a generic `spawn_argv(app, id, argv, cwd, env, exit_command)` core inside `cc_session/mod.rs`; refactored `PtyCcSession::spawn` to build `[claude, --yolo]` + delegate (CC behavior byte-identical — 15 existing+new cc_session tests green). Added pure `resolve_shell_argv(Option<String>) -> Vec<String>` (=`$SHELL` if set/non-blank + `-l -i`, else `/bin/zsh`) + a shared `color_tty_env()`. 3 new unit tests.  <!-- status: complete -->
  - [x] P1.2 Backend: added `SessionRegistry::spawn_shell(app, project_path)` (same registry) + thin `term_spawn` Tauri command in `commands.rs`; registered in `lib.rs`. `cc_input`/`cc_resize`/`cc_kill` reused unchanged.  <!-- status: complete -->
  - [x] P1.3 Frontend: generalized `XtermPane` with `spawnCommand`/`errorTitle`/`testId` props (defaults = CC, backward-compatible) + a thin `TerminalPane` wrapper passing `spawnCommand="term_spawn"`, `testId="term-pane"`. Shares the `bridge` state machine + DOM-renderer/fit/focus wiring; only the spawn call + overlay copy differ.  <!-- status: complete -->
  - [x] P1.4 RightPanelHost + panelHost: added `"terminal"` to `AVAILABLE_PANELS`; `selectPanel` guard generalized to `!AVAILABLE_PANELS.includes(target)` (structural, no longer terminal-special-cased); added the **Terminal** tab button + a mounted `<TerminalPane>` slot gated `display: panel === "terminal"`, gated `active` via the per-slot mount; threaded `workspaceId` through `Workspace → RightPanelHost`. ALL in one change (SURFACE-2026-06-20 guard). New `terminalSlotGuard.test.ts` (?raw source assert: every AVAILABLE_PANEL has a slot + tab + the TerminalPane is mounted) + updated panelHost.test.ts.  <!-- status: complete -->
  - [x] P1.5 Lifecycle: shell PTY reaped by the existing `kill_all` (same registry — free). Per-session-kind `exit_command` added to `PtyCcSession` (`/exit` CC, `exit` shell) so `kill()`'s clean-exit write works for a shell instead of forcing the full 3s SIGKILL grace window; SIGKILL fallback unchanged.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete (re-run post-F12 round-2 fixes); cc_session 15✓, full backend 124✓, frontend 317✓, clippy/fmt/tsc/eslint/prettier clean -->
  - [x] verify-self  <!-- status: complete (post-fix native + browser). Multi-spawn FIX live-verified: exactly 1 CC session (was 3), CC pane paints (screencap of native window). Shell-prompt FIX live-verified: terminal panel paints `stayman@Mac claudesk %` (was bare cursor) — backend buffer-and-flush. Deferred-spawn + non-empty-slot browser-verified (Playwright). Native window observed via screencapture (Playwright can't attach to WKWebView). -->
  - [x] verify-human  <!-- status: complete — operator accepted all leaves 2026-06-21 ("finally working. Good"); accepted .2–.5 on the working confirmation -->
    - [x] P1.verify-human.1 Native app: ⌘⇧T / Terminal tab open a WORKING login shell, prompt paints, runs commands  <!-- status: complete — operator confirmed working after the listener-lifetime fix -->
    - [x] P1.verify-human.2 Session + scrollback survive panel switches (Editor↔Diff↔Terminal)  <!-- status: complete (accepted) -->
    - [x] P1.verify-human.3 In-progress line preserved across switch  <!-- status: complete (accepted) -->
    - [x] P1.verify-human.4 Window-close reaps the shell PTY (no orphan)  <!-- status: complete (accepted) -->
    - [x] P1.verify-human.5 Left CC pane still works (the spawn refactor was byte-identical for CC)  <!-- status: complete — operator confirmed CC works -->
    - **Operator request captured (NOT a WP9 leaf):** Files nav (left tree rail) should be Editor-only (hidden for Diff + Terminal). Tracked in WBS WP11 Part A (operator chose formal WBS tracking, own cycle). Not blocking WP9.

### Discoveries (F12 round-2 fixes, 2026-06-21)
- [SHORTCUT-2026-06-21] P1.verify-human.1 — two real bugs found at verify-human (NOT the hidden-mount theory of the first F12 fix): (1) multi-spawn from `onSessionId` identity churn in spawn deps → fixed via ref + narrowed deps; (2) shell one-shot-prompt race → fixed via backend output buffer + `cc_ready` flush. Diagnosed with `/debug-empirical-telemetry` (reader-thread + frontend-recv instrumentation, telemetry since removed). Both live-verified in the native app (single session via `ps`; prompt paint via `screencapture`). Agent-side verification used screencapture because Playwright cannot attach to the Tauri WKWebView.
- [BUG-3 fixed post-operator-logs 2026-06-21] The terminal-reveal path STILL blanked after the two fixes above: the spawn effect re-runs on the `spawning→live` phase flip it dispatches itself, and its cleanup unlistened the live `cc-output` listener one tick after spawn — CC survived (output flushes synchronously before the cleanup) but the shell's ~100ms-later prompt hit a dead listener. Operator's devtools+backend logs pinned it (`spawn-effect CLEANUP` right after `calling cc_ready`, then `flush 0 chunks`, no `recv`). FIX: decoupled listener lifetime from the spawn effect — listeners live in `unlistenersRef`, disposed only on true unmount (mount-effect cleanup) or relaunch (`handleRelaunch`), never on a phase-flip re-run. Operator confirmed working.
  - [x] verify-codify  <!-- status: complete — backend `route_chunk` + `drain_backlog` extracted as pure helpers (the buffer-race core, AppHandle-free testable) with 4 new unit tests (buffer-while-pending, drain-in-order+flip-live, idempotent, no-loss-across-seam); `resolve_shell_argv` 3 tests + `terminalSlotGuard` already codified P1.1/P1.4. cargo 128✓ / vitest 317✓ / fmt+clippy+tsc+eslint+prettier clean. -->

- [x] Phase 2: Milestone 2 close-out — error-handling sweep + N-editors snapshot + exit-criteria  <!-- status: complete — operator-approved 2026-06-21; M2 exit criteria met -->
  **Relevance check (before Phase 2):** requester still needs it: yes; requirements unchanged: yes; solution still feasible: yes; no superior alternative: yes. **Verdict: proceed** (done).
  **Observable outcomes:**
  - Browser (Playwright): pointing the diff panel at a **non-git dir** (a `?ws=<non-git-path>` seed) shows a clear "is not a git repository" message in the diff panel — NOT a blank panel or a raw error code; an **empty search** leaves the Search button disabled / is a no-op (no spurious results, no console error).
  - CLI (vitest + cargo test): a regression test per error case — non-git `git_changed_files` → `NotARepo` String surfaced; empty-pattern `project_search` → `BadPattern`; an editor save against an unwritable path surfaces a non-empty error. All gates green (`cargo test`, `pnpm test`, `tsc`, `eslint`, `prettier --check`).
  - CLI (documented snapshot): the N-mounted-editors measurement is recorded in this WIP (RAM/CPU at N≈8 mounted EditorSplit+Diff(+terminal)); a within-envelope verdict OR a recorded mitigation/backlog deferral.
  - Console: no JS errors across an Editor↔Diff↔Terminal panel-switch cycle.
  - [x] P2.1 Error-handling verification sweep — **PASS, zero new code (plan-time finding confirmed).** All three cases already surface in-app via typed-error→`String`→overlay/inline AND already have regression tests: (a) **non-git diff dir** → `git_diff::open_repo` maps to `GitDiffError::NotARepo("<path> is not a git repository")`, DiffPanel `.catch` renders it inline — test `git_diff::tests::non_git_dir_is_not_a_repo_error`; (b) **empty search** → frontend guards `pattern===""` (disabled button + early-return) + backend `compose_pattern` → `BadPattern("pattern is empty")` — tests `empty_pattern_is_typed_error` + `no_match_is_empty_result_not_error` + `invalid_regex_is_typed_error`; (c) **editor open/save failure** → `editor_fs` typed errors threaded to the overlay — tests `read_missing_file_is_io_error`, `write_to_missing_parent_dir_is_io_error`, `read/write_path_escaping_root_is_rejected`. The one NEW WP9 error path (a `term_spawn` failure) reuses the proven `classify_spawn_error` + bridge error overlay (already tested + parameterized `errorTitle`). No gap found → no new test needed.  <!-- status: complete -->
  - [x] P2.2 N-mounted-editors sanity snapshot — **deferred to multi-workspace milestone (not measurable now); informational, operator-waived as a gate.** The app currently opens ONE workspace at a time — the multi-workspace open flow is Milestone 6+ — so N=8 mounted EditorSplit+Diff+terminal cannot be exercised in this build. Reference envelope from the WP4 probe (Apple M4: idle CPU 4.5%, RAM 240MB at N=8 *terminals*, <300MB budget); arch.md:332 notes the CM6-editor cost-at-N check remains warranted when N>1 ships. Single-workspace observation during this session: editor + diff + terminal all mounted in one workspace, no perceptible RAM/CPU issue. ACTION: carry the real N=8-editors measurement to the multi-workspace WP (logged below as a discovery). Per operator (no multi-day/native gate), this does not block WP9.  <!-- status: complete (deferred-measurement, recorded) -->
  - [x] P2.3 Editor-parity dogfood checkpoint — **informational, gates nothing (WP8 kept both Sublime launchers).** As-built, the in-app editor covers the operator's core daily set: multi-cursor (WP3a), find/replace (WP3a `@codemirror/search`), font-zoom (WP3a), command palette (WP3b), split panes (WP3c), multi-file tabs (WP12), Cmd+P finder (WP6), project find/replace (WP7), file tree (WP10). Sublime Text + Merge remain one click away as escape hatches (WP8). No missing gesture surfaced as a blocker this session; any found during real-use dogfooding → a backlog SURFACE (not a WP9 blocker, per the WP8 redefinition + operator's incident-flow-for-real-issues directive).  <!-- status: complete (informational) -->
  - [ ] P2.4 M2 exit-criteria confirmation: editing + diff review + second terminal all work inside the right half with the panel-switch hotkeys (⌘⇧E/D/T). "Sublime Text pop removed" is NOT a criterion (WP8 redefinition — both launchers permanent). → operator spot-check at verify-human.  <!-- status: NOT-STARTED (operator spot-check) -->
  - [x] verify-auto  <!-- status: complete — Phase 2 added NO runtime code (P2.1 confirmed existing coverage, P2.2/P2.3 are recorded observations, P2.4 is a doc verdict). Full gate run green: cargo 128✓, vitest 317✓, fmt/clippy/tsc/eslint/prettier clean. -->
  - [x] verify-self  <!-- status: complete (N/A — no new code/UI surface to observe; Phase 2 is verification + documentation. The error-case behaviors were already verify-self'd in their origin WPs; the terminal panel itself was verify-self'd in Phase 1). -->
  - [x] verify-human  <!-- status: complete — operator "all pass" 2026-06-21; M2 exit criteria met -->
    - [x] P2.verify-human.1 Exit criteria: editing, diff review, AND the second terminal all usable inside the right half via ⌘⇧E/⌘⇧D/⌘⇧T  <!-- status: complete — operator confirmed -->
  - [x] verify-codify  <!-- status: complete (N/A — Phase 2 added no runtime code; P2.1's error cases + the buffer-race fix are already codified by their origin-WP + Phase-1 tests) -->

## Current Node
- **Path:** Feature > Phase 2 > P2.1 (M2 close-out)
- **Active scope:** Phase 2 build — error-handling sweep (P2.1), N-editors snapshot (P2.2), editor-parity checkpoint (P2.3), exit-criteria (P2.4)
- **Blocked:** none
- **Unvisited:** P2.1 → P2.2 → P2.3 → P2.4 → verify-auto → verify-self → verify-human → verify-codify → ship → review-quality → finalize
- **Phase 1: COMPLETE** (2026-06-21) — second-terminal panel shipped + operator-approved after 3 bug-fix back-loops (terminal-seam guard, multi-spawn, listener-lifetime/prompt-race). All gates green.
- **Open discoveries:** none
- **F12 round-2 fixes applied + agent-verified live:** (1) multi-spawn → `onSessionId` held in a ref + spawn deps narrowed to `[bridge.phase, projectPath, fitAndResize, spawnCommand, active]` (was re-running per parent render → 3 sessions; now exactly 1, CC paints). (2) shell-prompt race → backend `OutputBacklog` buffer + `mark_ready`/`cc_ready` flush (frontend calls `cc_ready` after attaching listeners; backend flushes pre-subscription output → prompt paints `stayman@Mac claudesk %`). Kept the proven `cancelled`-closure spawn structure + `active` deferral + refit-on-active. All gates green (frontend 317, backend 124). Both fixes live-verified in the native app (ps: 1 session; screencapture: prompt paints).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- Carried-in (must close in Phase 1): **SURFACE-2026-06-20-QUALITY-WP5-TERMINAL-SEAM-UNTESTED** — adding `"terminal"` to `AVAILABLE_PANELS` requires the JSX slot + tab + render test in the SAME change (P1.4 + its outcome test); this WP is its resolution.

## Code-Quality Review (post-ship, 2026-06-21)
Reviewer (`code-quality-reviewer`) on ship commit `70a7576`: 0 CRITICAL, 2 MAJOR, 2 MINOR. Strengths: clean generic-spawn factoring, CcSession seam honored, route_chunk/drain_backlog testable, terminalSlotGuard structural guard. Operator chose **fix both MAJORs now** (`/feature-refactor`).
- **MAJOR #1 (stale spawn-effect comment) — RESOLVED.** The comment described a reverted `cancelled`-closure design that didn't match the shipped ref-based code. REWROTE to accurately document the lifecycle.
- **MAJOR #2 (active-churn in-flight double-spawn → orphaned PTY) — RESOLVED, but the fix path mattered:** first attempt added a `spawnStartedRef` ref-latch; **empirical re-test caught that it regressed StrictMode into 2 live sessions per pane** (a later effect run reset the ref before the first spawn's await resolved). Reverted to the proven **closure-`cancelled`** primitive (each run's cleanup cancels its own in-flight spawn) — which handles active-churn AND StrictMode AND unmount uniformly. Live-verified: exactly 1 shell + 1 CC session, prompt paints. The shell-prompt race stays fixed by the backend buffer-and-flush (`cc_ready`), independent of listener lifetime. Net: removed the over-engineered `spawnStartedRef`/`unlistenersRef`/`unmountedRef`/`disposeListeners` machinery; XtermPane is back to the WP7 closure structure + `active` gate + `spawnCommand` + `cc_ready`.
- **MINOR #1 (mark_ready drain→emit ordering not atomic across the seam):** acknowledged — no loss/dup (tests prove), only a microsecond ordering window on a one-shot prompt. Comment wording softened is a nice-to-have; logged as low-pri below, not fixed (out of refactor scope).
- **MINOR #2 (cc_ready holds registry lock across emit):** acknowledged low-pri; backlog below.
