# Feature: M3 WP3 — AF_UNIX socket listener + synchronous receive/parse path

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-22
**Milestone:** 3 (CC lifecycle & state plumbing)
**Size:** M
**drive_mode:** autopilot

## Problem Statement

Claudesk needs to *receive* the CC lifecycle events its installed hook already emits. WP2 deployed the Perl hook (`claudesk-hook.pl`) and registered it in `~/.claude/settings.json`; the hook connects to a Claudesk-owned `AF_UNIX` socket at `<app-data>/hook.sock` (path passed via `CLAUDESK_HOOK_SOCK`) and writes one newline-delimited JSON line per event (`{hook_event_name, session_id, cwd, timestamp, prompt?, message?}`). WP3 builds the production listener: bind that socket on app launch (clearing a stale file first), accept the connection stream on a **dedicated `std::thread`** (NOT tokio — WP1's verdict), parse each line to a typed `HookEvent` with `serde` (skip-and-continue on garbage, never panic the loop), and deliver parsed events into the core via an `mpsc` channel — the seam WP4's broadcaster will consume. Socket lifecycle is cleaned up on `WindowEvent::CloseRequested` (mirroring the WP7-M1 `kill_all` discipline). No broadcast/normalization yet (that's WP4); no PTY-output parsing ever. A missing/failed socket leaves status `Unknown`, never inferred.

The WP1 probe binary (`src-tauri/examples/hook_socket_probe.rs`) already proved this exact wire end-to-end with a real `claude`; WP3 productionizes that throwaway harness into a `hook_socket` module with the pure-core/IO-shell split the rest of the backend uses (`config_store`, `cc_session`, `hook_install`).

**Carry-ins folded into this build:**
- Use `app_data_dir()` to resolve the socket path (never the hardcoded `Claudesk/` string — it resolves to `com.claudesk.app/`). Reuse `hook_install::commands`' path-resolution shape so the listener and the installer agree on the socket path. Fix the stale `Claudesk/` socket-path line in `wbs.md` WP3 (task text) during the build. (`SURFACE-2026-06-22-APP-DATA-DIR-IS-BUNDLE-IDENTIFIER-NOT-PRODUCTNAME`)
- Keep the accept-loop draining promptly so the hook's write side never blocks CC (WP2 review MINOR #2 — the Perl `print $sock $line` can block if the listener accepts-but-stalls; `Timeout=>1` covers connect, not write). (`SURFACE-2026-06-22-QUALITY-WP2-MINORS` #2)
- Pin verbatim WP1 payload literals incl. the snake_case serde shape in the parse-fn tests (folds toward `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`, which WP4 fully closes).

## Work Tree

- [x] Phase 1: `hook_socket` module — pure parse + typed `HookEvent`  <!-- status: [x] — all impl + verify nodes complete; 7 unit tests, full suite 161/161 -->

  **Observable outcomes:**
  - CLI: `cargo test hook_socket::` exits 0; the parse-fn tests pass over the verbatim WP1 payload literals (the three M3 events — `UserPromptSubmit` with `prompt`, `Stop`, `Notification` with `message`).
  - CLI: a serde round-trip test asserts `HookEvent` deserializes the snake_case wire keys (`hook_event_name`/`session_id`/`cwd`/`timestamp`) verbatim — a camelCase or renamed key fails the test.
  - CLI: a garbage-line test (`parse_line("{ not json")`) returns `Err`/`None` (the caller skips it), never panics.
  - [x] P1.1 Create `src-tauri/src/hook_socket/mod.rs`; declare `mod hook_socket;` in `lib.rs`. Define `HookEvent { hook_event_name: String, session_id: String, cwd: String, timestamp: Option<u64>, prompt: Option<String>, message: Option<String> }` with `#[serde(default)]` on the optional/absent fields (mirror the probe's struct; snake_case is the wire shape — NO `rename_all`).  <!-- status: [x] -->
  - [x] P1.2 Pure `parse_line(&str) -> Result<HookEvent, serde_json::Error>` (or `Option`) — the single testable parse seam, separate from any IO. Empty/whitespace line → caller skips (document the contract).  <!-- status: [x] -->
  - [x] P1.3 `HookSocketError` (`thiserror`) for bind/IO failures; `Io(#[from] std::io::Error)`. Parse errors are NOT this error — they're skip-and-continue inside the loop.  <!-- status: [x] (defined; consumed by Phase 2's bind_listener — dead-code warn until then) -->
  - [x] P1.4 Unit tests: the three verbatim WP1 payload literals parse to the expected `HookEvent`; the snake_case serde-shape assertion; the garbage-line skip; an empty-line skip. (7 tests, all pass: +1 production-hook timestamp shape.)  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — cargo test hook_socket:: 7/7, cargo fmt --check clean, clippy --lib -D warnings clean -->
  - [x] verify-self  <!-- status: [x] — subagent confirmed all 3 CLI outcomes PASS (no UI/HTTP surface; isolated new artifacts, no integration boundary) -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIP (F11): drive_mode=autopilot, verify-self all-PASS, no integration boundary, no outcome cites a consuming surface -->
  - [x] verify-codify  <!-- status: [x] — behavior already codified by 7 build-time unit tests (no new tests needed; pure-fn covered at unit level); full suite 161/161, no regressions -->

- [x] Phase 2: Listener — bind, accept-loop on dedicated thread, mpsc delivery, lifecycle  <!-- status: [x] — all impl + verify nodes complete; 10 hook_socket tests, full suite 164/164 -->

  **Observable outcomes:**
  - CLI: `cargo test hook_socket::` exits 0 incl. a stale-socket-file cleanup test (`bind` succeeds after a leftover socket file is pre-created at the path).
  - CLI: an end-to-end channel test — bind the listener at a `TempDir` socket path on a thread, connect a client `UnixStream`, write two newline-delimited JSON lines + one garbage line, and assert the receiver gets exactly the two parsed `HookEvent`s (garbage skipped, loop survived). Exits 0.
  - CLI: with the dev app NOT running, the WP2 hook still `exit 0`s instantly (no listener → connect fails fast → CC unblocked) — covered by the existing WP2 live behavior; restated here as the never-block-CC invariant the accept-loop must preserve (drain promptly).
  - [x] P2.1 `bind_listener(socket_path: &Path) -> Result<UnixListener, HookSocketError>`: `remove_file` a stale socket first (ignore NotFound), then `UnixListener::bind`. Pure-ish (injected path) so it tests against a `TempDir`.  <!-- status: [x] -->
  - [x] P2.2 `spawn_listener(listener, tx)` + `accept_loop`: dedicated `std::thread` (named `claudesk-hook-socket`); per-connection `BufReader::lines()`, drain promptly; each non-empty line → `parse_line` → Ok `tx.send` / Err log+continue (never panic, never break); `SendError` (dropped receiver) → clean exit.  <!-- status: [x] -->
  - [x] P2.3 Launch wiring in `lib.rs` `.setup()`: new `hook_socket::commands` submodule with `hook_socket_path(app)` (the SINGLE source of truth — `hook_install::resolve_paths` now delegates to it, killing drift), `start_on_launch` binds + spawns + returns `HookSocketState { socket_path, receiver: Mutex<Option<Receiver>>, _handle }` held via `app.manage`. Bind failure → `emit_start_error` (stderr + `hook-socket-error` emit), never swallowed.  <!-- status: [x] -->
  - [x] P2.4 Socket lifecycle cleanup: `CloseRequested` calls `hook_socket::commands::cleanup_socket(&state.socket_path)` in the same `on_window_event` handler as `kill_all`. Stale-file removal on next launch (P2.1 `bind_listener`) is the belt to this suspenders.  <!-- status: [x] -->
  - [x] P2.5 Fixed `wbs.md` WP3 task text: socket path now `<app-data>/hook.sock` resolving to `com.claudesk.app/` via `app_data_dir()` (the SURFACE's opportunistic-fix path).  <!-- status: [x] -->
  - [x] P2.6 Tests (10 total, all pass): stale-socket-file cleanup; end-to-end thread+client+channel (2 events delivered, garbage skipped, loop survives); clean-exit-on-dropped-receiver.  <!-- status: [x] -->
  - [x] verify-auto  <!-- status: [x] — cargo test hook_socket:: 10/10, cargo fmt --check clean, clippy --lib -D warnings clean -->
  - [x] verify-self  <!-- status: [x] — subagent confirmed all 3 CLI outcomes PASS (10/10 tests incl. stale-socket bind, end-to-end channel garbage-skip, clean-exit-on-dropped-receiver; cargo build exit 0). No integration boundary. -->
  - [x] verify-human  <!-- status: [x] — AUTO-SKIP (F11): drive_mode=autopilot, verify-self all-PASS, no integration boundary, no outcome cites a consuming surface. Live runtime confirmation (socket binds under real app + real claude hook end-to-end) deferred to WP6 frontend close-the-loop per WBS. -->
  - [x] verify-codify  <!-- status: [x] — behavior already codified by 10 build-time tests (integration-level: real thread+socket+channel; no new tests needed); full suite 164/164, no regressions (hook_install delegation preserved its command-test values) -->

## Current Node
- **Path:** Feature > COMPLETE (all phases done)
- **Active scope:** none — Phase 1 + Phase 2 both `[x]`; all impl + verify nodes complete. Ready to ship.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
