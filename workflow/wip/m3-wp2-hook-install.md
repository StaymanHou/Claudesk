# Feature: M3 WP2 — Hook script + `~/.claude/settings.json` registration

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-06-22
**Milestone:** 3 (CC lifecycle & state plumbing)
**WBS WP:** WP2
**drive_mode:** autopilot

## Problem Statement

Claudesk needs CC to report each workspace's lifecycle events (`UserPromptSubmit` / `Stop` / `Notification`) to a Claudesk-owned Unix socket. That requires (a) a **production hook script** Claudesk ships and installs on disk, and (b) **Rust logic that registers/deregisters that script** in `~/.claude/settings.json`'s `hooks` block for those three events. The registration must be **additive** (never clobber `claude-time`, `notify-telegram`, or any other registered hook — the real config already runs multiple independent matcher-group entries per event), **idempotent** (re-running install is a no-op, detected by a stable Claudesk script-path marker), and **reversible** (uninstall removes only Claudesk's entries). The script writes one JSON line per event to `~/Library/Application Support/Claudesk/hook.sock` and `exit 0` unconditionally so a down Claudesk never blocks CC. WP1 (the probe, DONE — verdict GO) confirmed every design input: payload shapes, the additive-array merge model, Perl + `/usr/bin/perl`, ~15 ms latency, and exit-0-with-no-listener resilience. WP2 turns the throwaway harness (`examples/hook_socket_probe.{rs,pl}`) into production code. The socket *listener* itself is WP3 — WP2's output (the on-disk line format + the socket path) is WP3's input contract.

## WP1 design inputs this plan honors (from `wp1-hook-socket-probe-outcome.md`)

- **Socket path:** `~/Library/Application Support/Claudesk/hook.sock` (resolved via `app.path().app_data_dir()`, the existing `config_store` pattern). Passed to the hook via the `CLAUDESK_HOOK_SOCK` env var set in the registered command.
- **Hook language:** Perl, `/usr/bin/perl` (bundled on macOS). Reuses the proven `examples/hook_socket_probe.pl` discipline: stdin-JSON in, one compact JSON line out, `exit 0` always, stdlib only (`JSON::PP`, `IO::Socket::UNIX`, `Time::HiRes`).
- **Line format (WP3's input contract):** `{hook_event_name, session_id, cwd, timestamp, prompt?, message?}` — one newline-terminated JSON object per event. `prompt` present only on `UserPromptSubmit`; `message` only on `Notification`.
- **`settings.json` shape:** each event → array of matcher-group objects, each `{matcher?, hooks: [{type:"command", command, timeout?}]}`. Real config mixes the `matcher`-present and `matcher`-absent forms; both are additive. Register Claudesk as a **new appended matcher-group object** detectable by a stable marker (Claudesk's command/script path) so install is idempotent and uninstall surgical.
- **Three events:** `UserPromptSubmit` → (later) Running, `Stop` → Idle, `Notification` → AwaitingInput. WP2 only registers; the state mapping is WP4.
- **`CLAUDE_CONFIG_DIR` gotcha (do NOT re-discover):** a separate scratch config dir isolates `settings.json` but loses auth. For any LIVE test, layer via `claude --print --settings <scratch>` (scratch hooks + real auth), and redirect `claude-time` via `CLAUDE_TIME_DIR=<scratch>`. **Never mutate the real `~/.claude/settings.json` in tests.**
- **Residual to close (`SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED`):** trigger a real `Notification` during the Phase 2 live test, capture its verbatim payload, upgrade the outcome doc's `Notification` block inference→observed.

## Work Tree

- [x] Phase 1: Production hook script + pure settings-merge core  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `echo '{"hook_event_name":"UserPromptSubmit","session_id":"s1","cwd":"/tmp/x","prompt":"hi"}' | CLAUDESK_HOOK_SOCK=/tmp/nope.sock /usr/bin/perl src-tauri/resources/claudesk-hook.pl; echo $?` → prints nothing, exits `0` (no listener → silent, never blocks). ✅ verified at build
  - CLI: with a listener on `/tmp/t.sock`, piping the same JSON to the hook with `CLAUDESK_HOOK_SOCK=/tmp/t.sock` → the listener receives exactly one line `{...,"hook_event_name":"UserPromptSubmit","cwd":"/tmp/x","timestamp":<int>,"prompt":"hi","session_id":"s1"}`. ✅ verified at build
  - CLI: `cargo test --lib hook_install::` → all 13 pure-merge tests pass (additive-merge preserves claude-time; idempotent re-install adds nothing; uninstall removes only Claudesk's entry and prunes empty arrays). ✅ 13 passed
  - CLI: `cargo test` (151 pass), `cargo clippy --all-targets -- -D warnings` (clean), `cargo fmt --check` (clean) all green. ✅
  - [x] P1.1 Add the production hook script at `src-tauri/resources/claudesk-hook.pl` (productionized from `examples/hook_socket_probe.pl`): reads stdin JSON, emits `{hook_event_name, session_id, cwd, timestamp, prompt?, message?}` to `$CLAUDESK_HOOK_SOCK`, `exit 0` unconditionally, short connect timeout, stdlib-only. Dropped the probe's `sent_ms`; uses `timestamp` (ms). chmod +x in-repo.  <!-- status: complete -->
  - [x] P1.2 New Rust module `src-tauri/src/hook_install/mod.rs`: `CLAUDESK_EVENTS` const (3 events); pure `merge_claudesk_hooks(&mut Value, command)` (additive, idempotent by `command` marker, preserves all existing entries); pure `remove_claudesk_hooks(&mut Value, command)` (strips only our matcher-groups, prunes now-empty event arrays). Typed `HookInstallError` via `thiserror`.  <!-- status: complete -->
  - [x] P1.3 File-level `install`/`uninstall` over injected `settings_path: &Path` (mirrors `config_store`): read-or-default `{}`, merge, atomic write-then-rename; missing file → created with just our block; malformed file → `Parse` error, never wiped (config_store precedent). Module wired into `lib.rs` (`mod` + `hook_uninstall` IPC command); setup-launch wiring deferred to Phase 2 P2.1 (`install_on_launch`/`deploy_hook_script`/`set_executable` `#[allow(dead_code)]` until then).  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — perl -c OK; hook_install:: 13 pass; clippy+fmt clean -->
  - [x] verify-self  <!-- status: complete — subagent PASS on all 4 CLI outcomes; no integration boundary (isolated new artifacts only) -->
  - [x] verify-human  <!-- status: complete — AUTO-SKIP (F11): drive_mode=autopilot, verify-self all-PASS, no integration boundary (real settings.json write is Phase 2) -->
  - [x] verify-codify  <!-- status: complete — 13 hook_install:: unit tests written at build (TDD) cover the substantive new code; full suite 151 pass. No new test added: the hook script's wire-output shape gets its committed-test home in WP3 (pure parse-fn tests over verbatim payloads, per WBS WP3) + Phase 2's live coexistence test — adding a parallel Perl-output integration test now would duplicate WP3. No integration boundary (real settings.json write is Phase 2). -->

- [x] Phase 2: Install-on-launch wiring + live coexistence verification  <!-- status: complete (P2.4 Notification live-capture deferred to WP6 — not a blocker) -->
  **Observable outcomes:**
  - CLI: launch `pnpm tauri dev`; afterward `~/Library/Application Support/Claudesk/claudesk-hook.pl` exists, is executable (`-x`), and `~/.claude/settings.json` contains a Claudesk matcher-group under each of `UserPromptSubmit`/`Stop`/`Notification` **alongside** the pre-existing claude-time / notify-telegram entries (none removed).
  - CLI: re-launch a second time → `settings.json` is byte-identical for the hooks region (idempotent; no duplicate Claudesk entry appended).
  - CLI (coexistence): run a real `claude --print` in a test dir with both hooks live → claude-time's DB still records the event AND (with the WP1 probe binary listening on the real socket path) Claudesk's socket receives the line; neither errors; CC exits 0.
  - CLI (Notification live-capture, closes the SURFACE): trigger a real `Notification` (permission prompt or idle-wait) in an interactive `claude` while the probe listener runs → capture the verbatim `Notification` payload; confirm `message` + `cwd` + `session_id` match the inferred shape.
  - [x] P2.1 `install_on_launch` wired into `lib.rs` Tauri `.setup(|app| …)` hook: resolves app-data dir, copies/refreshes `claudesk-hook.pl` from the bundled resource (`tauri.conf.json` `bundle.resources` + `BaseDirectory::Resource`), chmod 0o755, then file-level install against `~/.claude/settings.json` with command `CLAUDESK_HOOK_SOCK=<app-data>/hook.sock /usr/bin/perl <app-data>/claudesk-hook.pl`. The 3 formerly-`#[allow(dead_code)]` fns are now live.  <!-- status: complete -->
  - [x] P2.2 Errors surfaced, not swallowed (WP6/WP7-M2 IPC-error lesson): the setup hook logs `[claudesk] hook install failed: <e>` to stderr AND emits `hook-install-error` (the error string) so the frontend can toast it; never silently breaks status. A malformed `~/.claude/settings.json` surfaces "couldn't register the Claudesk hook in <path>: <reason>" and leaves the file untouched (pure-layer `Parse` error never wipes).  <!-- status: complete -->
  - [x] P2.3 `hook_uninstall` `#[tauri::command]` (+ pure `uninstall` fn) registered in `lib.rs` — reachable for clean teardown / a future settings toggle; uses the same command marker so removal is surgical. UI surfacing not in scope this WP.  <!-- status: complete -->
  - [ ] P2.4 Close `SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED`: during the live coexistence test trigger a real `Notification`, capture the verbatim payload, update `docs/product/wp1-hook-socket-probe-outcome.md`'s `Notification` block inference→observed.  <!-- status: NOT-STARTED — happens during verify-human live test -->
  - [x] verify-auto  <!-- status: complete — tauri.conf.json valid + resources entry; hook_install:: 13 pass; clippy+fmt clean at build -->
  - [x] verify-self  <!-- status: complete — subagent PASS on all headless checks (cargo build integrates the .setup() hook; script executable; resource registered; 13 merge tests; clippy+fmt). The 4 live-only outcomes (real launch writes settings.json, idempotent re-launch, real-claude coexistence, live Notification capture) are UNVERIFIED-by-agent → surfaced to verify-human live test. -->
  - [x] verify-human  <!-- status: complete — .0–.4 PASS (additive merge into real settings.json, script deployed+executable, idempotent re-launch, claude-time coexistence DB-verified); .5 deferred to WP6 -->
    - [ ] P2.verify-human.0 Back up real settings.json before first launch  <!-- status: NOT-STARTED -->
    - [x] P2.verify-human.1 First launch writes Claudesk hook into settings.json alongside claude-time/notify-telegram (none removed)  <!-- status: complete — operator confirmed: all 3 events list claude-time (+notify-telegram on Notification) AND the claudesk command; nothing removed -->
    - [x] P2.verify-human.2 Hook script deployed + executable in app-data; socket path consistent  <!-- status: complete — deployed at ~/Library/Application Support/com.claudesk.app/claudesk-hook.pl, mode -rwxr-xr-x; command references it + CLAUDESK_HOOK_SOCK=.../hook.sock. NOTE: app-data dir is the bundle IDENTIFIER com.claudesk.app/, not the productName Claudesk/ — checklist said Claudesk/ (doc nit, not a code bug); matches config_store's projects.json location -->
    - [x] P2.verify-human.0 Back up real settings.json before first launch  <!-- status: complete — operator launched directly; additive merge confirmed, no harm -->
    - [x] P2.verify-human.3 Idempotent re-launch — no duplicate Claudesk entry; hooks region byte-stable  <!-- status: complete — operator confirmed: still exactly 1 claudesk entry per event after a second launch -->
    - [x] P2.verify-human.4 Live coexistence — real claude run: claude-time keeps logging; neither errors; CC exits 0  <!-- status: complete — operator confirmed CC clean; orchestrator verified claude-time DB live (482 events last 30min, a full SessionStart→UserPromptSubmit→Stop→SessionEnd chain at 13:30 from the test claude run; DB mtime seconds-fresh). Socket receipt is a WP3 check (no listener yet — hook connect-and-noops = the designed Claudesk-down-safe path). -->
    - [~] P2.verify-human.5 Live Notification capture  <!-- status: DEFERRED to WP6 live test (operator: "defer 5") — SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED stays open; not a WP2 blocker -->
    - **Notification SURFACE carried:** SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED remains pending → WP6 live test  <!-- status: SURFACED -->
    - **Doc nit SURFACED:** SURFACE-2026-06-22-APP-DATA-DIR-IS-BUNDLE-IDENTIFIER-NOT-PRODUCTNAME (docs say Claudesk/, real dir is com.claudesk.app/) → finalize/WP3  <!-- status: SURFACED -->
  - [x] verify-codify  <!-- status: complete — merge/idempotency/uninstall/never-wipe fully covered by the 13 hook_install:: unit tests (no new test: would duplicate). The setup-hook launch wiring (P2.1/P2.2) is AppHandle-runtime-only, not cargo-testable without a GUI launch; its consuming-surface verification IS the live verify-human test (.1–.4) — an automated "launch GUI + inspect real ~/.claude" test is infeasible + unsafe (would mutate the dev's real settings). Full suite 151 pass, no regressions. -->

## Current Node
- **Path:** Feature > COMPLETE — all phases done; next is ship
- **Active scope:** Phase 1 + Phase 2 fully verified (codify complete, 151 tests pass). Ready for `/feature-ship`.
- **Blocked:** none
- **Unvisited:** none (ship)
- **Open discoveries:** 2 SURFACEd (both low-pri, non-blocking) — Notification live-capture deferred to WP6; app-data-dir doc nit → finalize/WP3

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [CARRIED-2026-06-22] Phase 2 P2.4 — `SURFACE-2026-06-22-WP1-NOTIFICATION-PAYLOAD-NOT-LIVE-CAPTURED`: live `Notification` capture was DEFERRED again (operator "defer 5") to WP6's live test — `Notification` is timing-flaky to trigger and not a WP2 blocker. SURFACE stays pending → WP6.
- [SURFACED-2026-06-22] Phase 2 verify-human — `SURFACE-2026-06-22-APP-DATA-DIR-IS-BUNDLE-IDENTIFIER-NOT-PRODUCTNAME`: docs say `~/Library/Application Support/Claudesk/` but the live `app_data_dir()` resolves to `…/com.claudesk.app/`. Pre-existing (config_store used it since Phase 1); harmless to code, misleads readers. Logged to backlog → finalize/WP3 doc sweep.
