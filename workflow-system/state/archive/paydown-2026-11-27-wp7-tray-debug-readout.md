---
workflow: task
state: close (complete)
completed: 2026-11-27
created: 2026-11-27
docs-only: false
drive_mode: autopilot
---

# Task: paydown-2026-11-27 WP7 — tray debug readout

**Workflow:** task
**State:** close (complete)
**Completed:** 2026-11-27
**Created:** 2026-11-27
**Source:** `workflow-system/product/backlog-paydown-wbs.md` §WP7 → BL `SURFACE-2026-11-16-TRAY-HAS-NO-READOUT-FOR-LIVE-VERIFY`

## Problem Statement
The menu-bar tray's alarm state has no readout an agent can observe (no IPC, and `screencapture` fails in agent sessions), so two M17 WP4 tray behaviours were accepted on unit tests alone; add a debug-build-only command that returns it, then verify the local behaviour live.

## Context
- `src-tauri/src/tray/commands.rs`: `TrayState` (`states: Mutex<HashMap<String, WorkspaceState>>`, `applied: Mutex<AlarmState>`), `apply_update`, `forget_workspace` (wired into `workspace_deregister`), `reconcile`.
- `src-tauri/src/tray/mod.rs`: `AlarmState` (no `Serialize` yet), `aggregate_alarm`.
- `src-tauri/src/lib.rs`: `generate_handler!` (tauri-macros 2.6.2 accepts `#[cfg]` on an entry); the MCP bridge is already registered under `#[cfg(debug_assertions)]` (the precedent).
- `src-tauri/tests/sync_commands_do_not_block.rs`: the sync-command guard (`LEDGER`, `ASYNC_COMMANDS`). The new command is sync and only locks two mutexes, so it should not flag; register wherever the guard's tables require.
- Live drive: `[[drive-status-channel-with-real-hook-script]]` (pipe a payload into the working-tree hook script at the dev socket); scratch workspaces `../claudesk-scratch/scratch-{a,b,c}`; `[[never-touch-the-prod-app-or-its-listener]]`.
- **Remote half NOT RUN (decided at plan):** the dev profile has no scratch remote row; its one remote row is the operator's real repo under the admin account, which must never be used (`[[mini-remote-user-is-stayman]]`, `[[remote-verify-hygiene]]`). Per the WBS, record it as not run and keep that obligation on the backlog.

## Work Tree

- [x] T1 `AlarmState` derives `Serialize` (snake_case); add `#[cfg(debug_assertions)]` `tray_debug_state` sync command returning `{ applied, workspaces }` (workspaces sorted, `display_state` values as the tray folds them) built by a pure snapshot fn over `&TrayState`; unit-test the snapshot (applied + map, and that it reflects `forget_workspace`-style removal)
- [x] T2 Register it in `generate_handler!` under `#[cfg(debug_assertions)]`; satisfy the sync-command guard tables and any other command-registry guard; confirm a release-profile check compiles without it (`cargo check --release --lib`)
- [x] T3 Live (dev app, scratch workspace, bridge): positive control — drive a scratch workspace to AwaitingInput through the real hook script → `tray_debug_state` reads `attention` with that workspace `awaiting_input`; close the workspace through the UI → `neutral`, workspace gone from the map
- [x] T4 Record the remote half ("a lost remote session that was awaiting keeps the alarm lit") as NOT RUN with the reason; rewrite the backlog entry to that remaining obligation (partial resolution) — its readout half is resolved

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Act evidence
- T1: `cargo test --lib tray::` → 9 passed (new `the_debug_readout_reports_the_applied_alarm_and_the_folded_map`: neutral/empty → attention with both workspaces sorted → neutral after removal; wire shape `"attention"` / `"awaiting_input"`).
- T2: `cargo test` (all targets) green; the sync guard scans 123 commands (100 sync, 23 async) with parsed == declared, so the new sync, non-blocking command is seen and needs no `LEDGER` / `ASYNC_COMMANDS` row. `cargo check --release --lib` → Finished in 41 s, no warnings (the `#[cfg(debug_assertions)]` pairing on fn + handler entry holds; a mismatch fails exactly this build).
- T3 (live, dev app PID 67988 launched by the agent, scratch-a): baseline `{"applied":"neutral","workspaces":{}}` → real hook script `Notification`/`permission_prompt` at scratch-a (`status-channel.log`: `mapped=awaiting_input resolved=ws-1 outcome=emitted`) → `{"applied":"attention","workspaces":{"ws-1":"awaiting_input"}}`, UI dots `status-dot-awaiting` agree → close via `filmstrip-close-ws-1` + "Close Anyway" (`REGISTRY op=deregister … scratch-a`) → `{"applied":"neutral","workspaces":{}}`. Dev app stopped; no dev ssh master (the one running is prod's, untouched).
- T4: remote half NOT RUN (no scratch remote row; the only remote row is the real repo under the admin account). Backlog entry rewritten to that remaining obligation: `SURFACE-2026-11-16-TRAY-REMOTE-LOST-SESSION-ALARM-NOT-VERIFIED-LIVE`.
- [SURFACED-2026-11-27] T3 — the MCP bridge's `ipc_execute_command` refuses app commands ("Unsupported Tauri command: tray_debug_state"); call through `__TAURI_INTERNALS__.invoke` via `webview_execute_js` (fire-and-forget, read back from `window`). Tooling note, not backlog work (a memory candidate at reflect).

## Verification Observable

**Observable:** in a running dev build, `tray_debug_state` (called through the webview's `__TAURI_INTERNALS__.invoke`) reports `attention` with the workspace `awaiting_input` after a real `permission_prompt` hook event, and `neutral` with an empty map after that workspace is closed through the UI; and the project gate stays green.
**Verification command:** the T3 live sequence (dev app + scratch-a + real hook script + `filmstrip-close-ws-1` → "Close Anyway", reading `tray_debug_state` before, between and after); then `pnpm verify:auto`; then one mutant of `debug_snapshot` (report `AlarmState::Neutral` instead of the applied value) against `cargo test --lib tray::`.
**Expected result:** readouts `neutral/{}` → `attention/{"ws-1":"awaiting_input"}` → `neutral/{}`; `pnpm verify:auto` exit 0; the mutant makes `the_debug_readout_reports_the_applied_alarm_and_the_folded_map` FAIL, restored by `cp` + `shasum`.

## Verification Result

**Status:** PASS
**Date:** 2026-11-27
**Evidence:** live (T3, this session, code unchanged since): `{"applied":"neutral","workspaces":{}}` → after `STATUS event=Notification … mapped=awaiting_input resolved=ws-1 outcome=emitted`: `{"applied":"attention","workspaces":{"ws-1":"awaiting_input"}}` → after `REGISTRY op=deregister … scratch-a`: `{"applied":"neutral","workspaces":{}}`. `pnpm verify:auto` → exit 0 in 72s (vitest 332 files / 4205 tests; cargo test lib 1535 passed, 0 failed). Mutant `let applied = AlarmState::Neutral;` (line 206) → "test tray::commands::tests::the_debug_readout_reports_the_applied_alarm_and_the_folded_map ... FAILED"; restored, shasum equal.
**Notes:** The readout reflects the real alarm both ways, and its unit test is not vacuous. The remote half stays open as `SURFACE-2026-11-16-TRAY-REMOTE-LOST-SESSION-ALARM-NOT-VERIFIED-LIVE`.

## Retrospect
- **What changed in our understanding:** `generate_handler!` (tauri-macros 2.6.2) takes `#[cfg]` on an entry, so a debug-only command needs no separate handler list; and the sync-command guard finds commands by their `#[tauri::command]` attribute, so a sync, non-blocking command needs no table row at all (the WBS's "register it in the guard tables" was a no-op, confirmed by the guard's parsed == declared count).
- **Assumptions that held:** the readout could be a pure snapshot over `&TrayState`, tested through the real `reconcile` with no tray icon built; the real hook script drives the alarm deterministically; closing an awaiting workspace clears the alarm live.
- **Assumptions that were wrong:** the backlog entry said the readout would be "callable over the MCP bridge"; the bridge's `ipc_execute_command` refuses app commands (already caveat (e).2 for `cc_input`), so it is called through the webview's `invoke`.
- **Approach delta:** none beyond that; the remote half was not run, as planned.

**Closure:** Requester = operator — closure notice for self-record. **Closure notice:** paydown-2026-11-27 WP7 is complete. Debug builds now expose the menu-bar alarm as `tray_debug_state` (`{ applied, workspaces }`), and "closing an awaiting workspace clears the alarm" is verified live. The remote half stays on the backlog.
