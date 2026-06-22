---
stage: wbs
state: in-progress
updated: 2026-06-22
milestone: 3
# Milestone 3 — CC lifecycle & state plumbing. Scope = arch.md Phase-2 forward-look §A
# (status broadcaster + Unix-socket hook channel) + the workflow/.session.md file-watcher.
# Decomposes the IMMEDIATE next milestone only (M3). Future milestones (M4 multi-workspace,
# M5 PiP, M6 menu-bar, M7 auto-resume, M8 skill-orch, M9 polish) are tracked in roadmap.md
# and decomposed just-in-time when each opens. No /product-research needed — the CC hook
# contract is fully documented by the working _ref/.../claude-time/hook.pl reference.
---

# Work Breakdown Structure — Milestone 3: CC lifecycle & state plumbing

**Cycle scope:** **Milestone 3 only** (CC lifecycle & state plumbing — the "central nervous system" that lets Claudesk know each workspace's idle/running/awaiting-input state from CC's official hook signals, never by scraping PTY output). This is the backend foundation the three status surfaces (M4 filmstrip, M5 PiP, M6 menu-bar) all subscribe to. Milestones 4–9 are tracked in [`roadmap.md`](roadmap.md) and are **deliberately not decomposed** here — just-in-time decomposition happens when each milestone opens. Completed Milestone 1 + Milestone 2 WBSs are archived under [`archive/`](archive/).

**Grounding docs:** [`arch.md`](arch.md) → "Phase 2 forward-look §A — Status broadcaster + Unix-socket hook channel" (the full design: hook registration, socket-vs-file decision, broadcaster DTO, claude-time coexistence, failure mode) + roadmap [`Milestone 3`](roadmap.md) deliverables. Reference implementation: `_ref/claude-customization/tools/claude-time/hook.pl` (a working CC hook proving the event/payload contract — `hook_event_name` / `session_id` / `cwd` / `prompt` / `message` on stdin as JSON; the three M3 events `UserPromptSubmit` / `Stop` / `Notification` are all handled there with their real field shapes; `~/.claude/settings.json` `hooks` is a JSON array so multiple scripts coexist).

## Why no research pass + no external-API probe

Per the 3rd-party-integration rule, an external integration normally needs a preceding probe. Here the **CC hook contract is already a known, documented quantity** — `claude-time/hook.pl` is a first-hand working tap of the exact events, payload fields, stdin-JSON delivery, `cwd` presence, and multi-script-coexistence M3 depends on. The genuine remaining unknown is **our own seam** (does a hook fired by a real `claude` reach a Rust-owned Unix socket, parse cleanly, and coexist with claude-time's hook in `settings.json`), which WP1 smoke-tests. Everything else is documented-library work (`std::os::unix::net::UnixListener`, `serde`, `notify`).

## Milestone 3 ordering rationale

Learning-sequence ordering, riskiest-unknown-first, synchronous-before-async:

1. **Seam smoke-test first (WP1, probe).** The one real unknown is the end-to-end wire: real `claude` hook → Claudesk-owned Unix socket → parseable JSON line, AND that registering our hook alongside `claude-time`'s in `settings.json` breaks neither. Settle it in a throwaway harness before designing the listener + registration for real — so WP2/WP3 aren't built on an assumed handshake.
2. **Hook script + settings.json registration (WP2)** before the listener can receive anything real — but it's independently testable (the script writes to a socket; a `nc -lU` stand-in or the WP1 harness receives it). Owns the install/uninstall + idempotency + coexistence logic.
3. **Unix-socket listener + the synchronous receive path (WP3)** — accept connections, read newline-delimited JSON, parse to a typed event. Pure synchronous request/response into the core; no broadcast yet.
4. **Status broadcaster + `WorkspaceStatusUpdate` DTO + cwd→workspace mapping + Tauri event emit (WP4)** — normalize parsed hook events to the state machine, map `cwd` to a known workspace, emit on the Tauri event channel. This is the central node; depends on WP3 delivering parsed events.
5. **`workflow/.session.md` file-watcher (WP5)** — a second, independent event source feeding the same broadcaster; `notify`/`tauri-plugin-fs-watch`, debounced. Parallelizable with WP4 once WP3 lands (different input, same broadcaster sink).
6. **Frontend subscription + status surfacing in the existing UI (WP6)** — the main webview subscribes to `workspace-status` and renders an honest idle/running/awaiting-input/unknown indicator on the (single, in M3) workspace. Proves the whole chain end-to-end; the M4 filmstrip/M5 PiP/M6 menu-bar are later milestones that plug into the same event.
7. **No async/orchestration milestone here beyond the socket accept-loop** — the accept-loop is inherent (the socket is an unbounded stream by nature; documented as a deviation from "sync-before-async" because a listening socket *is* the core operation). Everything downstream of "a line arrived" is synchronous normalize-and-emit.

## Milestone 3

### WP1: Probe — hook → Unix-socket → parse wire + settings.json coexistence  ✅ DONE 2026-06-22 — verdict GO

**Outcome:** [`wp1-hook-socket-probe-outcome.md`](wp1-hook-socket-probe-outcome.md). All four learning objectives met: real `claude` hook → Claudesk `AF_UNIX` socket → clean `serde` parse; `cwd`+`session_id` present on every event; coexistence with `claude-time` PROVEN (both fired, neither errored); ~15 ms/call latency, exits 0 with no listener. **Listener go/no-go: blocking `std::os::unix::net::UnixListener` on a dedicated thread (NOT `tokio`).** Hook language: Perl (`/usr/bin/perl`). `UserPromptSubmit`+`Stop` observed live; `Notification` payload inference-grade (documented + offline-parsed) — live capture deferred to WP2/WP6 (`SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED`). Harness kept at `src-tauri/examples/hook_socket_probe.{rs,pl}`.

**Type:** probe
**Milestone:** Milestone 3
**Dependencies:** none (Milestone 1 PTY/CcSession + Milestone 2 shipped; this probes a new seam)
**Size:** S
**Learning objective:** Confirm the end-to-end status wire works on real macOS before building it for real: (a) a hook script fired by a real `claude --dangerously-skip-permissions` process connects to a Claudesk-owned `AF_UNIX` socket and delivers a single parseable JSON line per event; (b) the three M3 events (`UserPromptSubmit` / `Stop` / `Notification`) fire when expected and carry `cwd` + `session_id`; (c) registering a Claudesk hook entry **alongside** `claude-time`'s existing entry in `~/.claude/settings.json` runs both, breaking neither; (d) the hook does not perceptibly block CC (sub-ms socket write, like `hook.pl`'s ~15ms ceiling).
**Timebox:** half-day
**Success criterion:** A documented writeup (`docs/product/wp1-hook-socket-probe-outcome.md`) recording: the observed JSON payload for each of the 3 events (verbatim field dump), confirmation that `cwd` reliably identifies the project dir, the working `settings.json` array shape with both hooks, a measured hook-call latency figure, and a go/no-go on the socket-vs-named-pipe + blocking-`std`-vs-`tokio` listener choice for WP3.
**Tasks:**
- [ ] Throwaway harness: a Rust binary (or `src-tauri/examples/`) that opens `AF_UNIX` `SocketListener` at a temp path and prints every line it receives
- [ ] A minimal hook script (POSIX sh or the `hook.pl` pattern) that writes `{event,cwd,session_id,…}` JSON to that socket path; register it in a SCRATCH copy of `settings.json` (never mutate the real one in the probe) for `UserPromptSubmit`/`Stop`/`Notification`
- [ ] Run a real `claude` in a test dir; trigger each event (submit a prompt → `UserPromptSubmit`; let it finish → `Stop`; trigger a notification-class pause → `Notification`); capture the verbatim payloads
- [ ] Add `claude-time`'s hook entry alongside in the scratch settings; confirm both fire (claude-time DB row + our socket line) and neither errors
- [ ] Measure per-call hook latency; record the listener-design go/no-go (blocking accept-thread vs async)
- [ ] Write the outcome doc; SURFACE any contract surprise (e.g. a missing `cwd`, an unexpected event name) to backlog

**WP1 → WP2 rationale:** Probe the live wire + coexistence before writing the real hook script and the `settings.json` install logic — so WP2's registration is designed against the verbatim payload shapes and the confirmed array-merge behavior, not the arch.md sketch.

### WP2: Hook script + `~/.claude/settings.json` registration (install/uninstall, idempotent, coexisting)  ✅ SHIPPED 2026-06-22 (commit 77d6a6e)

**Description:** The production hook script Claudesk installs, plus the Rust logic that registers/deregisters it in `~/.claude/settings.json`'s `hooks` block for the three events — idempotent, additive (never clobbering `claude-time` or any other registered hook), and reversible. The script writes one JSON line per event to Claudesk's stable socket path (`<app-data>/hook.sock` — note: app-data resolves to `~/Library/Application Support/com.claudesk.app/`, the bundle identifier, not `Claudesk/`; see SURFACE-2026-06-22-APP-DATA-DIR-IS-BUNDLE-IDENTIFIER-NOT-PRODUCTNAME).
**Milestone:** Milestone 3
**Dependencies:** WP1 (payload shapes + coexistence behavior confirmed)
**Size:** M
**Tasks:**
- [x] Ship the hook script as a Claudesk resource — **Perl** (`/usr/bin/perl`, the `hook.pl` pattern; WP1 measured ~15 ms): `resources/claudesk-hook.pl` reads stdin JSON, writes `{hook_event_name, session_id, cwd, timestamp, prompt?, message?}` to the socket, exits 0 unconditionally (never blocks CC)
- [x] Rust `hook_install` module: read `~/.claude/settings.json`, **merge** Claudesk's three hook entries into the existing `hooks` array (additive — preserves claude-time + notify-telegram + any others), write back atomically (tmp→rename); idempotent (re-run is a no-op, detected by the stable command-path marker); malformed file is an error, never wiped
- [x] `hook_uninstall` (`#[tauri::command]` + pure `uninstall` fn — removes only Claudesk's entries via the command marker, prunes now-empty event arrays) — clean teardown / future settings toggle
- [x] Install-on-launch wiring (Tauri `.setup()` hook); resolves the script to `<app-data>/claudesk-hook.pl`; chmod 0o755; registered as a `tauri.conf.json` bundle resource
- [x] Errors surfaced, not swallowed (WP6/WP7-M2 IPC-error lesson): a failed settings write/resource-copy logs to stderr AND emits `hook-install-error` to the frontend; never silently leaves status broken
- [x] Tests: 13 TempDir/`settings.json`-fixture tests for the merge (additive, idempotent, uninstall-leaves-others, byte-exact round-trip, malformed-never-wiped); script JSON-line output shape verified live (full pin → WP3's parse-fn tests). **Live-verified** on real `~/.claude/settings.json`: additive merge alongside claude-time/notify-telegram, idempotent re-launch, real-`claude` coexistence (claude-time DB keeps logging).
- **Residual:** live `Notification` payload capture deferred to WP6 (SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED); 4 MINOR code-quality findings auto-backlogged (#2 write-side-blocking folds into WP3).

**WP2 → WP3 rationale:** The hook script + a known socket path must exist before the listener has anything real to accept; WP2's output (the line format + socket path) is WP3's input contract.

### WP3: Unix-socket listener + synchronous receive/parse path (Rust core)

**Description:** Claudesk opens the `AF_UNIX` listener at the stable path on app launch, accepts the stream of newline-delimited JSON lines from any CC hook, and parses each to a typed `HookEvent` (serde). Synchronous receive path only — no broadcast/normalization yet (that's WP4). Handles the lifecycle: bind (removing a stale socket file), accept-loop on a dedicated thread/task, per-connection line reads, graceful shutdown on app exit.
**Milestone:** Milestone 3
**Dependencies:** WP1 (listener-design go/no-go), WP2 (line format + socket path)
**Size:** M
**Tasks:**
- [ ] `hook_socket` Rust module: bind `UnixListener` at `<app-data>/hook.sock` (resolved via `app_data_dir()` — on macOS `~/Library/Application Support/com.claudesk.app/hook.sock`, the bundle identifier, NOT `Claudesk/`; see SURFACE-2026-06-22-APP-DATA-DIR-…), removing a stale socket file from a prior unclean exit first; accept-loop on a dedicated thread (or `tokio` task per WP1's verdict)
- [ ] Per-connection newline-delimited reader → `serde` parse to `HookEvent { event_name, cwd, session_id, timestamp, message: Option<String> }`; tolerate partial/garbage lines (skip-and-continue, never panic the loop)
- [ ] Deliver parsed `HookEvent`s into the core via a channel (the seam WP4's broadcaster consumes) — keep parsing pure/testable, separate from the IO loop
- [ ] Socket lifecycle: created on launch, cleaned up on `WindowEvent::CloseRequested` (mirror the WP7-M1 `kill_all` reaping discipline); a missing/failed socket → status defaults to `Unknown` (arch.md failure mode), never inferred from PTY
- [ ] Tests: pure parse-function tests over verbatim WP1 payload literals (incl. the snake_case serde shape — see WP4 DTO note); a stale-socket-file cleanup test

**WP3 → WP4 rationale:** Get a parsed `HookEvent` flowing synchronously into the core before adding the normalize-map-emit broadcaster on top — the broadcaster is a transform over a working event stream, not part of the IO plumbing.

### WP4: Status broadcaster + `WorkspaceStatusUpdate` DTO + cwd→workspace mapping + Tauri emit

**Description:** The central node. Normalizes each `HookEvent` to a workspace state (`UserPromptSubmit`→Running, `Stop`→Idle, `Notification`→AwaitingInput), maps the event's `cwd` to a known workspace's project path, builds `WorkspaceStatusUpdate { workspace_id, state, last_event_at, last_output_snippet? }`, and emits it on the Tauri event channel (`app.emit("workspace-status", …)`). This is the single source the three (later-milestone) surfaces subscribe to.
**Milestone:** Milestone 3
**Dependencies:** WP3 (parsed `HookEvent` stream)
**Size:** M
**Tasks:**
- [ ] `status_broadcaster` Rust module: pure `event_to_state(HookEvent) -> WorkspaceState` mapping (`Idle|Running|AwaitingInput`; unknown event → no-op)
- [ ] cwd→workspace resolution: match `HookEvent.cwd` against the open workspaces' project paths (canonicalized, reusing the path-keying lesson from M2 WP11); an event whose cwd matches no open workspace is dropped (not an error)
- [ ] Define `WorkspaceStatusUpdate` DTO; emit via `app.emit("workspace-status", update)` on each mapped event
- [ ] **Serde-shape contract test (folds in `SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`):** add a Rust `#[test]` asserting `serde_json::to_value(&WorkspaceStatusUpdate)` has the exact expected keys (snake_case end-to-end, per the M2 lesson), so the frontend (WP6) can mirror the serde field names verbatim with no camelCase drift
- [ ] `Unknown`-state default for a workspace that has produced no hook event yet (honest, not guessed)
- [ ] Tests: pure mapping (all 3 events + unknown), cwd-match (hit/miss/canonicalization), the DTO key-shape test

**WP4 → WP5 rationale:** WP5 is a *second input source* feeding the same broadcaster; it can land in parallel once WP3/WP4 exist, but is ordered after WP4 so the broadcaster + DTO it feeds are defined first.

### WP5: `workflow/.session.md` file-watcher → broadcaster

**Description:** A live filesystem watcher on each open workspace's `workflow/.session.md`, debounced, feeding the same broadcaster. Detects workflow-state changes (pause/resume pointer writes) in real time — a second signal alongside the hook channel. `notify` / `tauri-plugin-fs-watch`.
**Milestone:** Milestone 3
**Dependencies:** WP4 (broadcaster sink), WP3 (core wiring)
**Size:** S
**Tasks:**
- [ ] `session_watcher` module: watch each open workspace's `<project>/workflow/.session.md` via `notify` (debounced — editors write-then-rename; coalesce rapid events)
- [ ] On a write/create/remove event, read the (small) `.session.md` frontmatter and feed a workflow-state signal into the broadcaster (the watcher complements the hook channel; define how the two compose — hook = CC idle/running/awaiting; session.md = workflow paused/active context)
- [ ] Watch lifecycle: add a watch on workspace-open, drop it on workspace-close; tolerate a missing `workflow/` dir (no watch, no error)
- [ ] Tests: debounce coalescing (pure timer logic if extractable), frontmatter-read on a TempDir `.session.md` fixture
- [ ] **Note:** this is the same `notify`/`tauri-plugin-fs-watch` capability `SURFACE-2026-06-21-EDITOR-FILE-WATCHER` wants extended to open editor documents later — out of M3 scope (that SURFACE stays deferred), but build the watcher seam so a future milestone can reuse it for `editorDocs`.

### WP6: Frontend subscription + honest status surfacing (proves the chain end-to-end)

**Description:** The main React webview subscribes to the `workspace-status` Tauri event and renders an idle/running/awaiting-input/unknown indicator on the workspace (the single center-stage workspace in M3 — the M4 filmstrip + M5 PiP + M6 menu-bar are later milestones that subscribe to the same event). This closes the loop and is the M3 verify surface: a real CC state transition is observed in the UI purely from the hook channel + file-watcher, no PTY scraping.
**Milestone:** Milestone 3
**Dependencies:** WP4 (the `workspace-status` event + DTO), WP5 (session.md signal, if surfaced in the indicator)
**Size:** S
**Tasks:**
- [ ] Frontend `workspace-status` listener (Tauri `listen`), keyed by `workspace_id`; TS type mirrors the WP4 serde field names verbatim (snake_case — the M2 IPC-DTO lesson)
- [ ] Status indicator on the workspace header/chrome: dot + label for Idle / Running / AwaitingInput / Unknown (dark-only palette, project convention)
- [ ] Wire workspace-open to register the project path with the broadcaster (so cwd→workspace matching in WP4 has the mapping) and workspace-close to deregister
- [ ] Verify-self/verify-human against the live native app (`pnpm tauri dev` + a real `claude`) — observe idle→running→awaiting-input→exit reflected from the hook channel only (native-PTY discipline: this is NOT browser-harness-observable; per the `verify-native-pty-via-ps-screencapture-stderr` posture)
- [ ] Tests: pure status-reducer/mapping (event payload → indicator state) in vitest

## Dependency map

**Critical path:** WP1 → WP2 → WP3 → WP4 → WP6.
**Parallel track:** WP5 (file-watcher) can proceed alongside WP4 once WP3 lands (independent input source, same broadcaster sink); WP6 surfaces both WP4 and WP5 signals.

```
WP1 (probe) ─→ WP2 (hook+settings) ─→ WP3 (socket listener) ─┬─→ WP4 (broadcaster+DTO) ─→ WP6 (frontend)
                                                              └─→ WP5 (session.md watcher) ─┘
```

## Carried backlog — disposition for this cycle

- **`SURFACE-2026-06-21-IPC-DTO-FIELD-CASE-TESTS-MISS-SERDE-SHAPE`** — **FOLDED INTO WP4** (the `WorkspaceStatusUpdate` serde-shape contract test); also a candidate arch.md convention note ("IPC DTOs are snake_case end-to-end; frontend types mirror the serde field names"). The M3 DTO is exactly the multi-word-field-struct-over-IPC hazard this warns about.
- **`SURFACE-2026-06-21-EDITOR-FILE-WATCHER`** — **stays DEFERRED** (low pri); but WP5 builds the `notify` watcher seam this would later reuse for `editorDocs`. Noted in WP5.
- **`SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE`** — **defers to M4** (multi-workspace milestone), not M3. M3 never opens N workspaces.
- **wp6-M1 picker IPC error-surfacing MAJORs** — **defer to M4** (they pair with the multi-workspace picker open-flow, per the Phase-1 sweep note). Not touched by M3's backend plumbing.
- **All other carried code-quality MINORs + forward-look SURFACEs** — remain deferred (M2-close sweep); none are M3-relevant. Re-triage continues at each milestone open.

## Architectural notes / gaps

- **No architectural gaps found** — M3 is a faithful build of arch.md Phase-2 forward-look §A + the roadmap M3 deliverables; no P8 back-loop to `/product-arch` needed. The one refinement worth landing during the cycle (likely at WP4 or WP6) is the small arch.md convention note on snake_case IPC DTOs (above), which is a clarification, not a design change.
- **Hook/file-watcher composition** (how the CC-hook idle/running/awaiting signal and the `.session.md` workflow-paused/active signal combine into what the indicator shows) is the one design decision M3 surfaces that arch.md leaves open — resolve it concretely in WP5 (it's a small composition rule, not a structural gap).
