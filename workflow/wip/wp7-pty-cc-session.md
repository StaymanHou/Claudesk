---
workflow: feature
state: ship (complete)
created: 2026-06-19
drive_mode: autopilot
---

# Feature: WP7 — PtyCcSession (embedded CC terminal)

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-19
**Entry:** spec (complex feature)
**WBS reference:** Phase 1 WP7 (`docs/product/wbs.md:152`)

## Resolved Open Questions (settled at plan time)

1. **`tauri-plugin-pty` vs raw `portable-pty`** → **raw `portable-pty`** behind our
   own 4 Tauri commands + 1 event stream. Rationale: keeps the `CcSession` trait the
   single seam (the plugin's JS-side `spawn()` would create a competing frontend
   abstraction that partially bypasses the trait — `CLAUDE.md` forbids bypassing it);
   matches the WP2-proven reference code and `arch.md` Data Flow steps 4–6; reuses the
   `[dev-dependencies] portable-pty = "0.9"` entry (promote to `[dependencies]`).
2. **Reader → event encoding** → emit PTY output as a **base64 string** in the
   `cc-output-<sid>` event payload. Tauri serializes `Vec<u8>` as a JSON number array
   (~6 bytes/byte over IPC); base64 is ~1.37 bytes/byte and `atob`-decodes trivially
   on the frontend. Read in 4 KB chunks, emit per-read (no coalescing in v1 — WP4
   showed serialize/render handles bursts; revisit only if jank appears).
3. **Session registry ownership** → `tauri::State<Mutex<SessionRegistry>>` registered
   via `.manage(...)` at builder time. `SessionRegistry` owns
   `HashMap<SessionId, PtyCcSession>`; command handlers lock it to reach the writer /
   master handle. `kill()`/`resize()`/`send_input()` are reached through the registry.
4. **Window-close hook** → backend `WindowEvent::CloseRequested` handler runs the
   kill-all loop (robust against a frozen webview, unlike a frontend `beforeunload`).
   The frontend session-ended overlay handles **per-session** exit (CC's own `/exit`
   or crash), independent of app shutdown.

**Plus (promoted from spec verification-point to requirement):** the spawn
`CommandBuilder` explicitly sets `TERM=xterm-256color` and `COLORTERM=truecolor`
(WP2 ran under an inherited `TERM`; a Tauri parent has none).

## Problem Statement

Claudesk's whole value proposition is "click a project → a working Claude Code
session fires up inside the workspace in <10s." Today (post-WP6) the picker
opens a workspace whose left half is the WP5 **mock** xterm pane (`XtermPane.tsx`
writes a static banner; `cc_session_id` is always `null`). WP7 replaces that mock
with a **real PTY-backed Claude Code session**: spawn `claude
--dangerously-skip-permissions` with cwd = the picked project's path, stream its
output into the existing xterm.js component, and pipe the user's keystrokes back
into the PTY. This is the single largest piece of Phase 1 user-visible value and
the last critical-path build before WP9 polish.

The mechanics were de-risked by the **WP2 probe** (`workflow/archive/wp2-cc-pty-probe.md`):
`portable-pty` spawns CC in a real TTY, ANSI renders, slash-command byte-injection
works (with a load-bearing CR-not-LF caveat), `pty.resize()` propagates SIGWINCH,
and yolo-mode auth carries over from the host's authenticated `claude`. WP7 turns
that throwaway harness into production code behind the `CcSession` trait —
Claudesk's stable seam for "how we drive CC" (`arch.md:110`, `CLAUDE.md` →
"`CcSession` trait is a stable seam").

## User Stories

- **As Stayman, I want** clicking a project in the picker to drop me into a live,
  interactive Claude Code TUI inside the workspace's left pane **so that** I skip
  the "open terminal → cd → run claude" ritual entirely.
- **As Stayman, I want** the embedded CC terminal to behave like a real terminal
  (colors, cursor, scrollback, resize-on-window-resize, typed slash commands that
  actually execute) **so that** the embedded session is indistinguishable from
  running `claude` in a standalone terminal.
- **As Stayman, I want** Claudesk to cleanly shut down the CC child when I close
  the window **so that** I don't leak orphaned `claude` processes across launches.
- **As Stayman, I want** a clear "session ended" state with a one-click re-launch
  when CC exits (I typed `/exit`, or it crashed) **so that** I can restart the
  session in-place without reopening the project from the picker.

## Acceptance Criteria

The feature is done when:

1. **Spawn:** Opening a project from the picker spawns `claude
   --dangerously-skip-permissions` in a `portable-pty` with cwd = the project
   path, and the workspace's `cc_session_id` is set to the backend-issued session
   id (no longer `null`).
2. **Output bridge:** CC's TUI renders inside the workspace's xterm.js pane with
   ANSI colors, banner, cursor — visually equivalent to bare `claude` in a
   terminal. PTY output streams to xterm via a `cc-output-<sid>` event.
3. **Input bridge:** Typed keystrokes flow xterm `onData` → `cc_input(sid, bytes)`
   → PTY. Interactive prompts, typed text, and **slash commands that end in `\r`
   actually execute** (not just show autocomplete).
4. **CR-not-LF (load-bearing):** Any Claudesk-originated slash-command injection
   writes bytes ending in `\r` (CR, `0x0d`), never `\n`. (Phase 1 has no UI button
   that injects a slash command, but the trait method that will be used by Phase 2
   auto-resume / skill-buttons must enforce CR — codified by a unit test.)
   Ref: `SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF`.
5. **Resize:** Resizing the Claudesk window (or the workspace becoming visible)
   refits xterm and calls `cc_resize(sid, cols, rows)`; CC redraws to the new
   width. The fit-addon lifecycle from WP5's `XtermPane` is reused.
6. **Graceful shutdown:** On window close, every open workspace's CC child is
   terminated via `cc_kill(sid)` (preferred path `/exit\r`; fallback SIGTERM →
   SIGKILL after a grace window). No orphaned `claude` processes survive a normal
   quit. (Phase 1 N=1, but the kill-all-workspaces loop is written for N.)
7. **Session-ended overlay:** When the CC child exits (user `/exit`, crash, or
   kill), the frontend shows a "session ended" overlay over that workspace's pane
   with a **Re-launch** button that re-spawns CC for the same project path in the
   same workspace (no picker round-trip).
8. **Error surfacing:** If spawn fails (e.g. `claude` not on `PATH`), the workspace
   pane shows a readable error message rather than a silent dead pane.
9. **Tests green:** `cargo test` (new `cc_session` unit tests + existing),
   `cargo clippy -- -D warnings`, `cargo fmt --check`, `pnpm test` (new frontend
   bridge/overlay logic tests + existing), `pnpm lint`, `pnpm format:check` all pass.

## Out of Scope

- **Status detection** (idle/running/awaiting-input). That comes from the CC hook
  channel + Unix socket + status broadcaster in **Phase 2** — NEVER from parsing
  PTY output (`CLAUDE.md` → "PTY byte-injection for input; hook channel for state").
  WP7 leaves `Workspace.status` at its WP5 default; no status inference here.
- **Smart auto-resume** (`/session-resume` vs `/resume` vs `/session-start`
  injection on open). Phase 2 (`arch.md` §C). WP7 just spawns a fresh `claude`.
- **Drive-mode selector**, **menu-bar item**, **PiP**, **filmstrip live mirrors** —
  all Phase 2.
- **Multiple concurrent workspaces.** The Phase 1 N≤1 clamp in `openWorkspace`
  stays. WP7 writes the backend session registry and the kill-all loop to handle N,
  but the UI still opens one at a time.
- **`state_events()` / `recycle()`** trait methods — reserved as forward-compat
  comments on the trait per `arch.md:110`; not implemented.
- **Scrollback persistence across app restarts.** xterm scrollback is in-memory only.
- **`recycle()` / Recycle Session button** — Phase 2.

## Technical Constraints

- **`CcSession` trait shape is fixed by arch** (`arch.md:110`): `send_input(bytes)`,
  `resize(cols, rows)`, `kill()`, `wait_for_exit()`, plus output via a Tauri event
  stream. Leave room (commented stubs / doc notes) for Phase 2's `state_events()`
  and `recycle()`. Never bypass the trait when driving CC.
- **WP2 probe (completed) is the reference** — `workflow/archive/wp2-cc-pty-probe.md`
  + the kept-in-tree harness `src-tauri/examples/cc_pty_probe.rs`. Proven contract:
  - `portable_pty::native_pty_system().openpty(PtySize{..})`
  - `CommandBuilder::new("claude")` + `.arg("--dangerously-skip-permissions")` + `.cwd(path)`
  - `drop(pair.slave)` after `spawn_command` (child owns the slave end)
  - `pair.master.try_clone_reader()` for output (cloneable across threads)
  - `pair.master.take_writer()` for input (single-writer, consumes the handle)
  - `pair.master.resize(PtySize{..})` propagates SIGWINCH implicitly
  - **slash commands MUST end in `\r`** (CR); `\n` types-but-doesn't-execute
  - shutdown: `/exit\r` (clean, one write) preferred; `Ctrl+D ×2` fallback
  - yolo auth carries over from host `~/.claude/` with zero extra plumbing
- **`TERM` inheritance is an open WP2-flagged verification point** (`wp2-...md:67,176`):
  WP2 ran from a normal terminal where `TERM=xterm-256color` was inherited. When the
  parent is a **Tauri app with no `TERM` env var**, CC may not detect a color TTY.
  WP7 must **explicitly set `TERM=xterm-256color`** (and likely `COLORTERM=truecolor`)
  on the `CommandBuilder` rather than relying on inheritance, and verify ANSI renders.
- **Plugin vs raw `portable-pty` is a plan-time decision** (see Open Questions). WP2
  proved raw `portable-pty`; the WBS text names `tauri-plugin-pty` / `tauri-pty`.
- **Pure-core / IPC-shell pattern (WP6 precedent)**: the `cc_session/` module mirrors
  `config_store/` — pure-ish session logic + a thin `commands.rs` that resolves
  runtime handles (`AppHandle`, the session registry) and maps typed `CcError` →
  `String` for IPC. PTY/threads are inherently impure, so "pure core" here means the
  session *registry* and *command-byte composition* (the CR-appending helper) are
  unit-testable without spawning a real `claude`.
- **No `unwrap()` outside tests; `thiserror` typed errors** (`CLAUDE.md` code style).
  New `CcError` enum.
- **xterm.js DOM renderer only** — do not add `@xterm/addon-webgl`. WP5's `XtermPane`
  mount/dispose/fit lifecycle is the seam to extend, not replace.
- **All workspaces stay mounted** — the `display:none` toggle must not unmount the
  pane or drop the PTY connection. WP7's bridge subscribes to `cc-output-<sid>` for
  the workspace's lifetime, independent of focus.
- **Frontend test posture (unchanged):** jsdom/RTL not configured. Pure logic
  (bridge state machine, overlay-state derivation, the CR-append rule mirrored
  frontend-side if any) is vitest-unit-tested; live DOM/PTY rendering is verified via
  Playwright in verify-self (stub `window.__TAURI_INTERNALS__`). Backend gets
  `cargo test` unit coverage.
- **PATH-export discipline for cargo:** every cargo invocation needs
  `export PATH="$HOME/.cargo/bin:$PATH"` (`.claude/memory/bash-cargo-env.md`).
- **`cargo test` runtime** ~17s cold after the dep tree, ~2s incremental
  (`runtimes.md`); adding the PTY crate will trigger one cold rebuild.

## Open Questions

> These are plan-time decisions, not research-blocking unknowns. WP2 already
> de-risked the PTY mechanics; none of these require a spike. They are routed to
> `feature-plan` (F4), not `feature-research` (F3).

- [ ] **`tauri-plugin-pty` vs raw `portable-pty`.** The plugin bundles a JS bridge
      (`tauri-pty`'s `spawn()` with node-pty-like `onData`/`write`/`resize`) that
      could shrink the frontend wiring; raw `portable-pty` + our own 4 Tauri commands
      + 1 event stream is exactly the WP2-proven shape and keeps the `CcSession` trait
      as the sole seam (no second JS-side abstraction competing with it). **Leaning:
      raw `portable-pty` behind our own commands** — it matches the arch's command/event
      design (`arch.md` Data Flow steps 4–6), the WP2 reference code, and the
      pure-core/IPC-shell precedent; the plugin's JS `spawn()` would partially bypass
      the trait. Decide in plan.
- [ ] **Reader thread → Tauri event throughput.** CC can emit multi-KB redraws
      (WP2 saw ~4KB per resize). Decide chunk size / whether to coalesce reads before
      `app.emit("cc-output-<sid>", bytes)`. Bytes as `Vec<u8>` vs base64 string over
      IPC — Tauri serializes `Vec<u8>` as a JSON number array (heavy); a base64 string
      or `tauri::ipc::Response` raw bytes may be cheaper. Decide in plan (perf, not
      correctness).
- [ ] **Session registry ownership.** Where the `HashMap<SessionId, PtyCcSession>`
      lives (Tauri `State<Mutex<..>>` vs `AppHandle`-managed). The writer handle is
      single-owner; `kill()` and `resize()` need to reach it from command handlers.
      Decide in plan.
- [ ] **Window-close hook.** Tauri's `on_window_event(CloseRequested)` vs a frontend
      `beforeunload` → `cc_kill` loop. Backend `CloseRequested` is more robust
      (survives a frozen webview). Decide in plan.

## Notes (spec-time)

- **3rd-party probe check:** WP7 depends on `portable-pty` / `tauri-plugin-pty`
  (a non-owned crate driving the external `claude` CLI). A completed probe WP exists
  — **WP2** (`workflow/archive/wp2-cc-pty-probe.md`) — covering ANSI, byte-injection,
  CR/LF, resize, termination, and auth carry-over against the real `claude` v2.1.114
  on this host. The known-unknown gate is satisfied; no spike required. The one
  residual probe-flagged item (`TERM` inheritance under a Tauri parent) is folded
  into Acceptance Criterion #2 + Technical Constraints as an explicit WP7 check, not
  a blocker.
- **Likely phase split (for the planner):** P1 = backend `cc_session/` module
  (trait + `PtyCcSession` + registry + 4 commands + event stream + `CcError`,
  registered in `lib.rs`, cargo unit tests for the registry + CR-append helper);
  P2 = frontend bridge (rewire `XtermPane`/`Workspace` off the mock to `cc_spawn` +
  `onData`→`cc_input` + `cc-output-*`→`term.write` + fit→`cc_resize`, set
  `cc_session_id`) + lifecycle (window-close kill-all, session-ended overlay +
  re-launch, spawn-error surface). The integration boundary (real `claude` PTY
  inside the live app) means **verify-human will NOT auto-skip** — it's the genuine
  Phase 1 exit-criteria moment.

## Work Tree

- [x] Phase 1: Backend `cc_session/` module — PtyCcSession + commands + event stream  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo build` exits 0 with `portable-pty` promoted to `[dependencies]` and the `cc_session` module compiled in.
  - CLI: `cargo test` exits 0 and runs the new `cc_session` unit tests — including a test asserting the slash-command helper appends `\r` (0x0d) and never `\n`, and registry insert/get/remove tests. Existing 14 tests still pass.
  - CLI: `cargo clippy -- -D warnings` and `cargo fmt --check` both exit 0 (no `unwrap()` outside tests; typed `CcError`).
  - CLI: `grep -n 'cc_spawn\|cc_input\|cc_resize\|cc_kill' src-tauri/src/lib.rs` shows all four commands registered in `generate_handler!`, and the registry `.manage()`d.
  - [x] P1.1 Promote `portable-pty = "0.9"` from `[dev-dependencies]` to `[dependencies]` in `src-tauri/Cargo.toml` (keep `tempfile` in dev-deps for tests). Also added `base64 = "0.22"` for the output encoding.  <!-- status: complete -->
  - [x] P1.2 Create `src-tauri/src/cc_session/mod.rs` — module doc (mirrors `config_store/mod.rs`); `CcError` (`thiserror`: `Spawn`, `UnknownSession`, `Io`, `Lock`); ids minted as `cc-<n>` in the registry; `CcSession` **trait** (`send_input`, `resize`, `kill`); commented Phase 2 stubs for `state_events()` + `recycle()` (`arch.md:110`)  <!-- status: complete -->
  - [x] P1.3 Implement `PtyCcSession` (impl `CcSession`): holds `master`, `writer` (`Mutex<Box<dyn Write+Send>>`), `child` (`Mutex<Box<dyn Child>>`). Spawn via WP2 contract: `native_pty_system().openpty()`, `CommandBuilder::new("claude").arg("--dangerously-skip-permissions").cwd(path)`, set `TERM=xterm-256color` + `COLORTERM=truecolor`, `drop(slave)` after spawn. Reader thread off `try_clone_reader()` → base64 → `app.emit("cc-output-<sid>", payload)`; on EOF emit `cc-exit-<sid>`. `kill()` writes `/exit\r`, polls `try_wait` ~3s, falls back to `child.kill()`  <!-- status: complete -->
  - [x] P1.4 Pure helper `slash_command_bytes(cmd: &str) -> Vec<u8>` → strips trailing CR/LF then appends one `\r` (the codified CR-not-LF rule, `SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF`); unit-tested (3 tests incl. no-double-terminate). Backs `kill()`'s `/exit\r` and Phase 2 injection.  <!-- status: complete -->
  - [x] P1.5 `SessionRegistry { next_id, sessions: HashMap<String, Box<dyn CcSession>> }` with `spawn(app, path)`, `input`, `resize`, `kill`, `kill_all`. Registry logic (id minting, insert/get/remove, unknown-id → `CcError::UnknownSession`) unit-tested via a `FakeSession` double (no real spawn).  <!-- status: complete -->
  - [x] P1.6 `src-tauri/src/cc_session/commands.rs` — thin wrappers `cc_spawn`, `cc_input` (base64-decodes data), `cc_resize`, `cc_kill`; map `CcError -> String` (config_store precedent)  <!-- status: complete -->
  - [x] P1.7 Register in `lib.rs`: `mod cc_session;`, `.manage(Mutex::new(SessionRegistry::new()))`, 4 commands in `generate_handler!`, `on_window_event(CloseRequested)` → `kill_all()`  <!-- status: complete -->
  - [x] verify-auto  <!-- status: PASS — cargo test 22 pass (8 cc_session + 14 existing); cargo clippy --all-targets -D warnings clean; cargo fmt --check clean; frontend no-regression: pnpm test 27 pass, pnpm lint clean. format:check warns only on 2 pre-existing .claude/memory/*.md files (SURFACE-2026-06-18-MEMORY-MD-PRETTIER-NITS), not WP7 source. -->
  - [x] verify-self  <!-- status: PASS — feature-verify-self-runner subagent verified all 4 CLI Observable Outcomes PASS (build exits 0 + portable-pty under [dependencies] + cc_session compiled; cargo test 22 pass incl. CR-not-LF + 5 registry tests; clippy --all-targets -D warnings + fmt --check clean; lib.rs registers all 4 cc_* commands + .manage()s registry + CloseRequested kill-all handler). No integration boundary — isolated new artifacts. -->
  - [x] verify-human  <!-- status: AUTO-SKIPPED — drive_mode=autopilot + verify-self all-PASS + no integration boundary (isolated new artifacts: cc_session/ module + 4 commands not yet consumed by any frontend) + no outcome cites a consuming surface. F11 path. Real human-verify moment is Phase 2's live-PTY bridge. -->
    - [x] cargo unit tests cover the CR-append rule + registry ops  <!-- status: PASS — slash_command_appends_cr_not_lf + 5 registry tests, all green in verify-auto/verify-self -->
  - [x] verify-codify  <!-- status: PASS — verified behavior already codified by the 8 build-time cargo tests (TDD, FakeSession double); no new tests warranted (real-PTY spawn/reader/TERM/event paths are integration-level, codified live in Phase 2 verify-human, not unit-testable without a claude binary). No integration boundary. Baselines green: 22 cargo + 27 vitest. -->

- [x] Phase 2: Frontend bridge + lifecycle — real CC in the workspace  <!-- status: complete; depends on Phase 1 -->
  **Observable outcomes:**
  - Browser (Playwright, Tauri IPC stubbed): opening a workspace mounts `XtermPane`, calls `cc_spawn` once, and on a stubbed `cc-output-<sid>` event the decoded bytes are written to the terminal (assert via a stub that records `term.write` calls or visible cell content); no JS console errors.
  - Browser: simulating a stubbed `cc-exit-<sid>` event renders the **session-ended overlay** with a visible "Re-launch" button (snapshot contains the button); clicking it re-invokes `cc_spawn` (stub records a second call).
  - Browser: a `cc_spawn` rejection renders a readable **error message** in the pane (snapshot contains the error text), not a blank pane.
  - CLI: `pnpm test` exits 0 with new vitest cases for the bridge state machine (idle→live→ended→relaunching) and the base64-decode helper; existing 27 pass. `pnpm lint` + `pnpm format:check` exit 0.
  - **verify-human (live, NOT auto-skipped):** in `pnpm tauri dev`, picking a project shows the real `claude` TUI (colors, banner, model line) inside the workspace in <10s; typing works; a slash command typed with Enter executes; resizing the window reflows CC; `/exit` shows the session-ended overlay; Re-launch restores a fresh session; closing the window leaves **no orphaned `claude`** process (`pgrep -fl 'claude --dangerously-skip-permissions'` empty after quit).
  - [x] P2.1 `src/cc/bridge.ts` (pure): `decodeBase64`/`encodeBase64` helpers + bridge state machine `{phase, sessionId, exitCode, errorMsg}` with `bridgeReducer` (spawned/spawn-failed/exited/relaunch). 9 vitest cases in `src/cc/__tests__/bridge.test.ts`. No React/IPC.  <!-- status: complete -->
  - [x] P2.2 Rewired `XtermPane.tsx`: dropped `MOCK_BANNER`; mount-effect owns the terminal + onData→`cc_input`(base64) + ResizeObserver→`cc_resize`; spawn-effect (keyed on phase==spawning) `invoke('cc_spawn',{projectPath})`, `listen('cc-output-'+sid)`→decode→`term.write`, `listen('cc-exit-'+sid)`→`exited`, pushes initial resize; unsubscribes + kills orphan-on-cancel in cleanup. Takes `projectPath`+`onSessionId` props. DOM renderer only.  <!-- status: complete -->
  - [x] P2.3 Threaded `project_path`: `Workspace.tsx` passes `workspace.project_path` + `onSessionId` to `XtermPane`; `CenterStage` forwards `onSessionId`; `App.tsx` wires it to new `setSessionId` reducer action (`state/workspace.ts` + `useWorkspaceList`) that stores the returned sid into `cc_session_id`.  <!-- status: complete -->
  - [x] P2.4 Session-ended overlay: phase `ended` → `.cc-overlay` with exit info + **Re-launch** button dispatching `relaunch` (resets bridge to spawning → spawn-effect re-fires for same projectPath). `data-testid=cc-ended-overlay` / `cc-relaunch`.  <!-- status: complete -->
  - [x] P2.5 Spawn-error surface: phase `error` → overlay rendering `errorMsg` (e.g. claude-not-on-PATH) + Retry button. `cc_spawn` rejection caught → `spawn-failed` (the WP6 silent-dead-click fix). `data-testid=cc-error-overlay` / `cc-retry`.  <!-- status: complete -->
  - [x] verify-auto  <!-- status: PASS — tsc --noEmit clean; eslint clean; vitest 36 pass (9 new bridge); prettier clean on WP7 files; backend cargo test 22 pass + clippy --all-targets -D warnings clean. Pre-existing .claude/memory/*.md prettier nits (SURFACE-2026-06-18) are not WP7 files. -->
  - [x] verify-self  <!-- status: PASS — feature-verify-self-runner (Playwright vs Vite dev @ localhost:1420 with __TAURI_INTERNALS__ + event-plugin stubbed) verified all 4 Browser outcomes: (1) picker renders, no WP7-code console errors (the 2 plain-load errors are the documented backend-absent __TAURI_INTERNALS__=undefined condition); (2) cc_spawn-resolve → xterm-pane mounts, no overlay (live phase); (3) cc_spawn-reject → cc-error-overlay shows "claude not found on PATH" + cc-retry (the WP6 silent-dead-click fix); (4) cc-exit fired → cc-ended-overlay + cc-relaunch. Minor note: exit listener doesn't forward an exit code — consistent with backend emitting unit () payload in Phase 1 (exitCode field is forward-looking, not a bug). -->
  - [x] verify-human  <!-- status: APPROVED (F13) — operator re-tested round 2 against the real claude binary in `pnpm tauri dev`, all 5 leaves PASS. (Round 1 rejected on banner-overprint + no-input + no-reflow; all three fixed via rAF-deferred fit/resize + term.focus + click-to-focus.) -->
    - [x] P2.verify-human.1 Real claude TUI in <10s, ANSI colors/banner/model line intact  <!-- status: PASS (round 2) — clean single banner, colors/model line intact -->
    - [x] P2.verify-human.2 Typing works + a slash command typed + Enter executes (CR-not-LF path)  <!-- status: PASS (round 2) — input registers, slash command executes on Enter (CR path) -->
    - [x] P2.verify-human.3 Resizing the Claudesk window reflows CC's TUI  <!-- status: PASS (round 2) — window resize reflows CC -->
    - [x] P2.verify-human.4 `/exit` → session-ended overlay → Re-launch restores a fresh working session  <!-- status: PASS (round 2) — overlay appears, Re-launch restores a working session -->
    - [x] P2.verify-human.5 No orphaned `claude` after window close (`pgrep` empty)  <!-- status: PASS (round 2) — pgrep empty after quit; /exit\r kill + CloseRequested handler reap cleanly -->
  - [x] verify-codify  <!-- status: PASS — Phase 2 pure logic already codified by 9 vitest cases (bridge reducer + base64 round-trip); the round-1 fix (rAF fit/resize + focus) is React/IPC-effect-level over a real PTY + WKWebView, verified live in verify-human (the integration boundary's consuming-surface test — no headless real-PTY harness exists; a jsdom fake would pass-while-broken). No new tests warranted. Baselines green: 36 vitest + 22 cargo + tsc + lint + prettier(WP7). -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** ALL phases complete (Phase 1 + Phase 2, all verify nodes [x]); next = ship → review-quality → finalize
- **Round-1 back-loop note:** Phase 2 verify-human rejected round 1 (banner-overprint + no-input + no-reflow); fixed via rAF-deferred fit/resize through a shared fitAndResize() chokepoint + term.focus (mount + post-spawn) + onMouseDown click-to-focus; round 2 all-PASS against real claude.
- **Blocked:** none
- **Unvisited:** Phase 2 verify loop (verify-auto → verify-self → verify-human [WILL pause: live claude PTY integration boundary] → verify-codify), then ship → review-quality → finalize
- **Build notes (Phase 1):** backend compiles clean; `cargo test` 22 pass (8 new cc_session + 14 existing); `cargo clippy --all-targets -D warnings` + `cargo fmt --check` green. The 4 spec Open Questions are settled (see "Resolved Open Questions"). Phase 1 verify-human auto-skipped (no boundary).
- **Build notes (Phase 2):** tsc --noEmit clean; eslint clean; 36 vitest pass (9 new bridge tests); prettier clean on WP7 files. fitRef dead-ref removed. Frontend invoke arg names (projectPath/sessionId) map to Rust snake_case via Tauri's auto-conversion. Phase 2's verify-human WILL pause for hands-on live-PTY verification.
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->

TRANSITION: F4

---

TRANSITION: F7
