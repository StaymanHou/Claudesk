---
drive_mode: autopilot
---

# Feature: paydown-2026-11-27 WP10 — remote link lifecycle

**Workflow:** feature
**State:** finalize (complete)
**Completed:** 2026-11-27 (ship `226f863`)
**Created:** 2026-11-27
**Source:** `workflow-system/product/backlog-paydown-wbs.md` §WP10 (the sweep's LAST WP)

## Problem Statement

Four leftovers from M17 in how a host link's processes and a remote workspace's status are handled.
(1) **BL `11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED`:** a link's `ssh -M -N` master
runs in its own process group, so when the app dies without `perform_quit_teardown` (SIGTERM,
SIGKILL, a crash), the master survives, reparented to launchd. It holds its connection, its remote
sshd session and its `-R` forward until the network drops. Each crash leaks one. (2) **QF
`11-16-QUALITY-M17WP3-STALE-MASTER-PID-AFTER-REAP`:** `run_worker` clears `master_pid` only at
worker exit. After `try_exit` reaped a dead master, or the up-timeout killed one, the stale pid
stays published through the back-off and the next pre-connect, and a `stop()` in that window
`killpg`s it. (3) **QF `11-16-QUALITY-M17WP4-REALPATH-ALIAS-NEVER-CLEARED`:**
`WorkspaceRegistry::remote_realpaths` is only ever inserted into. A later spawn that finds no alias
(the symlink was removed, or the exec failed) keeps the old one, which still routes events from the
old physical folder, and deregister leaves it behind. (4) **QF
`11-16-QUALITY-M17WP4-STALE-OVERLAY-EMIT-RACE`:** every status emit decides under the registry lock
and emits after releasing it. Two threads (the hook drain and a remote session's link edge) can
deliver in the opposite order to the one they decided in, so a surface keeps showing a superseded
update until the next hook event: for example, a dimmed "reconnecting" tile after `Attached` has
already cleared it.

## Defaults taken without asking (flag any that are wrong)

- **D-A: the orphan reaper kills only `ppid == 1` masters.** A master whose parent is a LIVE app
  (a second dev instance, or prod) is never touched. The selection also requires: the binary is
  `/usr/bin/ssh`, `-M` is present, `-S` names a path under THIS app's `<app_data>/ssh/` (the
  trailing `/ssh/` keeps `com.claudesk.app` from matching `com.claudesk.app.dev`), and
  `pgid == pid` (the master leads its group, as `in_own_group` makes it, so `killpg` reaches it and
  only it). The reap runs synchronously in `remote_link::commands::init` (setup) before the
  registry exists, so no link can start first. One `ps` at launch costs about 30 ms. The
  alternative, a stdin pipe the master watches, needs `-N` dropped and a probe, so it is not taken.
- **D-B: the overlay race is fixed by SETTLE-ON-EMIT, not the WBS's literal "per-workspace
  sequence, drop an older update".** Two reasons. Dropping an older update needs either a lock held
  ACROSS the emit, or a sequence on the wire that every consumer compares. The lock is ruled out:
  the tray's Rust listener runs inside `emit` and swaps the icon via the main thread, and
  `workspace_status_promote` is a main-thread command that also emits. That is exactly the
  "lock held across a marshal" freeze (`docs/lessons/pip-nspanel-main-thread.md`;
  `workspace_status_promote`'s own comment rules it out). The wire sequence touches every
  consumer (TS fold, PiP, popover, the tray fold) and the byte-identity wire test. **Settle-on-emit
  instead:** after each emit, re-read the registry's current view of that workspace. If it
  differs, ignoring turn markers, emit the view, and repeat until it matches. The last update on
  the wire then always equals the registry's final state, without holding a lock across an emit or
  changing the wire. The cost: a stale update can still flash briefly before its correction.
  Corrective emits carry turn markers CLEARED (as `overlay_update` does), so a raw-stream consumer
  never sees a second turn end.
- **D-C: a spawn's alias answer REPLACES the stored one.** `Some` sets it; `None` (no symlink, or
  no usable answer from the exec) removes it. Deregister removes it too. A transiently failed
  exec now drops the alias until the next spawn instead of keeping a possibly-stale one. That is
  the finding's suggested action.

## Work Tree

- [x] Phase 1: Link process lifecycle (orphan reap on launch + clear `master_pid` on reap)
  **Observable outcomes:**
  - CLI: `cargo test --lib remote_link` passes, including new tests:
    (a) `orphaned_masters` selects exactly the `ppid=1`, `pgid=pid`, `/usr/bin/ssh -M … -S <this ssh dir>/…`
    line from a fixture `ps -axww -o pid=,ppid=,pgid=,command=` dump, and rejects each near-miss
    individually: a live-parent master (ppid ≠ 1), the OTHER identifier's dir (`.app` vs `.app.dev`
    both ways), a non-master `ssh -S … -O check`, a `pgid ≠ pid` line, and malformed lines;
    (b) a fake-transport worker whose master exits (and, separately, one that hits the up-timeout)
    reads `master_pid == None` during the back-off that follows.
  - CLI (mutation): each new test fails on its own mutant: drop the `ppid == 1` test, drop the
    `/ssh/` suffix, drop the `-M` test, drop the `pgid == pid` test, and remove each
    `forget_master` call one at a time. As built there are two sites: the failed come-up (it covers
    both exit-while-connecting and the up-timeout kill) and the drop while Up. Restore from a `cp` backup and check with `shasum`.
  - CLI (state-changing: the dev app, the scratch remote row `~/claudesk-scratch-remote` on the mini; per `[[remote-verify-hygiene]]`):
    with the dev app running and a scratch remote workspace open (link Up), `kill -9 <the dev app pid I launched>`.
    Then `ps -axww -o pid=,ppid=,command=` shows one `/usr/bin/ssh -M` with `-S …/com.claudesk.app.dev/ssh/…`
    and `ppid 1` (the positive control: the orphan exists). After `pnpm tauri:dev` relaunches,
    and BEFORE any remote workspace is opened, no `ssh -M` with that ControlPath survives, and the
    dev app's stderr names the reaped pid.
  - CLI (read-only): every prod `ssh -M` (`-S …/com.claudesk.app/ssh/…`) PID listed before the kill
    is still alive with the same PID after the relaunch.
  - CLI: after the reap, opening the scratch remote workspace brings the link Up again (`remote-link` event `up`).
  **Alignment questions:**
  - none
  - [x] P1.1 `remote_link`: pure `orphaned_masters(ps_out, ssh_dir) -> Vec<u32>` plus `reap_orphaned_masters(ssh_dir)` (runs `/bin/ps` through `run_captured` with a short deadline, then `kill_group` on each pid, then one `eprintln!` per pid). Call it from `commands::init` before `LinkRegistry::new`.
  - [x] P1.2 `run_worker`: clear `master_pid` wherever the master is reaped or killed, through one helper: `try_exit` → `Some` while connecting, the up-timeout `kill`, and `try_exit` → `Some` while Up. Keep the exit-time clear. (As built: `forget_master`, called in the `if let Err(reason) = up` block, in the hold loop's `try_exit`, and at worker exit.)
  - [x] P1.3 Unit tests for (a) and (b) above; check that `sync_commands_do_not_block` still passes (`init` is not a command, but the guard resolves calls by name). (24/24 pass; 5 new tests in `remote_link::tests`.)
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 101 in 67 s. lint 0 errors (1 pre-existing exhaustive-deps warning); prettier clean; tsc clean; check:link clean; vitest 4225/4225; cargo fmt/clippy clean; `cargo test` 1541/1542, the one failure the known-flaky `hook_socket::…closed_before_accept…` (no WP10 file; backlog `11-27-HOOK-SOCKET-CLOSED-PEER-TEST-FLAKY`, now 3/5 gates).
    — evidence: `cargo test` re-run → exit 0, lib 1542/1542, `sync_commands_do_not_block` 24/24.
    — evidence: `cargo test --lib remote_link` → 83 passed (5 new: `orphaned_masters_selects_only_this_apps_orphaned_group_leading_masters`, `the_reaper_reads_a_real_ps_and_selects_nothing_outside_its_dir`, `the_master_pid_is_unpublished_when_{the_master_exits_before_coming_up,the_up_timeout_kills_the_master,an_up_link_drops}`).
  - [x] verify-self
    - [x] O1 `cargo test --lib remote_link` green with the 5 new tests — evidence: runner → `test result: ok. 83 passed; 0 failed; 3 ignored`.
    - [x] O2 mutation — evidence (runner, `perl -0pi`, diffed against a `cp` backup, shasum restored each time): M1 `ppid == 1` killed; M3 `-M` killed; M4 `pgid == pid` killed; M5 `starts_with("/usr/bin/ssh ")` killed; M6 `forget_master` in the failed-come-up block killed `…exits_before_coming_up` and `…up_timeout_kills…` (`…an_up_link_drops` ok); M7 `forget_master` in the hold loop killed `…an_up_link_drops` (others ok). M2 (the needle's trailing `/`) SURVIVED on the first run (in-place shortcut below), then was killed by a fresh runner on the new `ssh2/` near-miss: `left: [4242] right: []`, with the positive control passing first.
    - [x] O3 live orphan reap (dev app + scratch remote row, via `remote_open_check` grace: no tmux session, no CC) — evidence: master `18690` with ppid `17872` (the dev app I launched) and dev ControlPath `…/com.claudesk.app.dev/ssh/<hash8>`. After `kill -9 17872`: `pid=18690 ppid=1 pgid=18690` (positive control: the orphan exists). Relaunch stderr: `[claudesk] reaping orphaned ssh link master 18690 (left by a previous run)`, with no `ssh -M` running and `18690 gone`, before any remote action.
    - [x] O4 prod untouched — evidence: VACUOUS this run. No prod `ssh -M` existed before the kill (the awk sweep listed none), so there was nothing to keep alive. The `.app`/`.app.dev` and live-parent exclusions are proven by O2 (M1, M2 and the fixture) instead.
    - [x] O5 link comes back after the reap — evidence: `remote_open_check` on the scratch row → `kind: "start"`; new master `pid=19907 ppid=19195` (the relaunched dev app); it released after the 20 s grace (`no ssh -M after 5s` of polling); dev app stopped via TaskStop and the sweep shows 0 `ssh -M`.
  - [x] verify-human — zero admissible leaves (F11)
  - [x] verify-codify
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 67s)
    — new: `remote_link::commands::tests::init_reaps_orphaned_masters_before_building_the_registry` (consuming surface: `init` runs the reap before `LinkRegistry::new`). Mutant MA (the call deleted) → FAILED.
    — new: `remote_link::tests::the_launch_reap_kills_a_real_orphan_named_as_this_apps_master` (a real double-forked ppid-1 group leader with argv `/usr/bin/ssh -c … -M -N -S <ssh dir>/<hash8>`, through the real `ps` + `killpg`; another app's dir leaves it alive). Mutant MB (`kill_group` removed) → FAILED "the reaped orphan … is still running"; mutant MC (the `pgid=` column dropped) → FAILED. Both files restored by `cp`, shasums matched, and no stray orphans afterwards.
    — evidence: `pnpm verify:auto` → exit 0 in 89 s; vitest 4225/4225; `cargo test` lib 1544 passed, 0 failed.

- [x] Phase 2: Status path (alias clear + settle-on-emit)
  **Observable outcomes:**
  - CLI: `cargo test --lib status_broadcaster` passes, including new tests:
    (a) `set_remote_realpath(key, None)` removes a stored alias, and an event from the old physical
    path then resolves to nothing; `deregister` removes the key's alias.
    (b) settle-on-emit, driven deterministically through a recording `emit` that performs the
    racing mutation INSIDE its first call: drain-then-`Attached` (the finding's case) and
    `Attached`-then-drain (the mirror) each end with the LAST recorded emit equal to the registry's
    current view, and no corrective emit carries `is_turn_end`/`is_turn_start` = `Some(true)`;
    (c) with no race, every path emits exactly once (no spurious corrective emit).
  - CLI (source guard): every `app.emit(STATUS_EVENT, …)` site in `status_broadcaster/commands.rs`
    goes through the settle helper (the drain, `link_edge_sink`, `workspace_status_promote`,
    `workspace_status_clear_attention`). The guard is mutation-proven by reverting one site to a
    bare `app.emit`.
  - CLI (mutation): (a) fails with the `None` arm a no-op, and separately with the deregister
    removal deleted. (b) fails with the re-check loop removed (emit once), and separately with
    the loop's turn-marker clearing removed.
  - CLI: `cc_session` spawn passes `facts.real_alias` straight through (`Some` and `None`). The
    existing `cc_session` ordering guard is updated to the new call, and still fails when the call is moved after `registry.lock()`.
  - CLI (state-changing: the dev app plus the scratch remote row on the mini): open the scratch
    remote workspace, send a one-word prompt, and the dev `status-channel.log` resolves the
    `UserPromptSubmit`/`Stop` events to that workspace's id (the status path still works end to end
    after the refactor).
  **Alignment questions:**
  - none
  - [x] P2.1 `WorkspaceRegistry::set_remote_realpath(key, Option<String>)` (`None` removes). `deregister` removes the key's alias. Update the `cc_session::commands` spawn call site and its ordering guard. (As built: the guard also asserts the old `if let Some(real) = &facts.real_alias` conditional is gone.)
  - [x] P2.2 `WorkspaceRegistry::current_view(ws)`: the record with attention and link overlaid and turn markers cleared. Add `emit_settled(registry, update, emit)`, which loops emit → re-read → re-emit the view while it differs, with markers normalized, a small cap, and an `eprintln!` if the cap is hit. Route all four `STATUS_EVENT` emit sites through it. (As built: `commands::emit_raw` is THE one `STATUS_EVENT` emit. The drain, promote and clear call `emit_settled(…, emit_raw)`; `link_edge_sink` passes `emit_raw` into `apply_link_edge`, which settles. Cap 8. The promote comment was corrected.)
  - [x] P2.3 Tests (a)–(c) above plus the source guard; check `sync_commands_do_not_block` (promote/clear are sync main-thread commands: the helper must not sleep or hold the lock across `emit`). (Added: `a_spawn_with_no_alias_clears_the_stored_one_and_a_new_one_replaces_it`, `deregister_drops_the_rows_alias`, `a_drain_update_overtaken_by_attached_still_settles_on_the_registry_view`, `an_attached_update_overtaken_by_a_drain_still_settles_on_the_registry_view`, `with_no_race_every_path_emits_exactly_once`, `a_settle_for_a_closed_workspace_emits_once_and_stops`, `a_failed_emit_stops_the_settle_and_is_returned`, `commands::tests::every_status_emit_is_settled`. `sync_commands_do_not_block` 24/24.)
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 1 in 87 s. lint 0 errors (the pre-existing warning); prettier, tsc, check:link clean; vitest 4224/4225, the one failure `appBoot.test.tsx` › "src/pip/main.tsx mounts the PiP surface" (`…to include 'pip_get_layout'` plus 8 unhandled `transformCallback is not a function`). No frontend file is in WP10's diff. Logged as `SURFACE-2026-11-27-APPBOOT-PIP-MOUNT-TEST-FLAKY-UNDER-GATE-LOAD`.
    — evidence: `vitest run src/__tests__/appBoot.test.tsx` ×3 → `Tests 2 passed (2)` each time; full `vitest run` re-run → `Tests 4225 passed (4225)`.
    — evidence: the Rust steps the `&&` chain skipped, run by hand: `cargo fmt --check` ok; `cargo clippy --all-targets -D warnings` clean; `cargo test` lib 1552 passed / 0 failed, `sync_commands_do_not_block` 24/24.
  - [x] verify-self
    - [x] O1 `cargo test --lib status_broadcaster` + `cargo test --lib cc_session` green — evidence: runner → 104 passed / 0 failed and 144 passed / 0 failed (all 8 new tests `ok`), before and after the mutation run.
    - [x] O2 source guard + O3 mutation — evidence (runner, `perl -0pi`, diffed against a `cp` backup, shasum restored each time; final shasums `d535fe91…`/`adb62dae…`/`37ce3d5e…`): MA1 (`None` arm no-op) → `a_spawn_with_no_alias…` FAILED "cleared"; MA2 (deregister removal deleted) → `deregister_drops_the_rows_alias` FAILED; MS1 (`0..1`, one emit) → both race tests FAILED "the wire ends on the registry view", `with_no_race…` ok; MS2 (view keeps the turn markers) → the mirror test FAILED with two `is_turn_start: Some(true)`; MS3 (bare `app.emit` in promote) → `every_status_emit_is_settled` FAILED "left: 2"; MS4 (bare `emit(&u)` in `apply_link_edge`) → the same guard FAILED.
    - [x] O4 `cc_session` spawn passes the alias straight through — evidence: MC1 (the old `if let Some(real)` form restored) → `cc_session::tests::a_remote_close_ends_its_session_and_a_respawn_waits_for_it` FAILED "the alias is recorded whether or not the spawn found one" (143/144).
    - [x] O5 live status path (dev app + temporary scratch remote row on the mini) — evidence: opened `claudesk-scratch-remote` through the picker (`ws-1`, `cc-1`; dev master + `-tt` attach; remote CC at its prompt, read via my own ControlMaster `tmux capture-pane`). Sent "reply with only the word ok" + `\r` via `cc_input`. Dev `status-channel.log`: `event=UserPromptSubmit cwd=/Users/<u>/claudesk-scratch-remote mapped=running resolved=ws-1 outcome=emitted`, then `event=Stop … mapped=idle resolved=ws-1 outcome=emitted bg=0`. The frontend `workspace-status-indicator` read `idle`. Closed via `filmstrip-close-ws-1`: the remote `tmux -L claudesk-dev ls` → "no server running", and no dev ssh left. Dev app stopped; `projects.json`/`settings.json`/`remote-sessions.json` restored from backup (shas match; 8 rows, no scratch row).
  - [x] verify-human
    - [x] P2.verify-human.1 (5a feature-level floor: Phase 1 advanced with zero leaves) — the feature end to end plus its defaults: launch reap of `ppid=1` group-leading masters under this app's `ssh/` (verified live, 18690); D-C (a spawn's alias answer replaces the stored one, `None` and a failed exec clear it); D-B (settle-on-emit instead of the WBS's literal per-workspace sequence: no lock across `emit`, no wire change, a stale update may flash before its correction). "Now that you see it, still what you want?" — operator 2026-11-27: "continue" (approved, D-B included).
  - [x] verify-codify
    Test scope: full — last phase
    — new: `status_broadcaster::tests::a_registry_that_never_settles_stops_at_the_cap` (a registry flipping its overlay after every emit makes exactly `SETTLE_CAP + 1` emits and returns Ok, so an emit site never hangs). Mutant (`0..=(SETTLE_CAP * 4)`) → FAILED `left: 33 right: 9`; restored by `cp`, shasum matched.
    — already covered (no duplicate): alias replace and clear plus deregister (unit tests, MA1/MA2); both race interleavings, no-race single emit, closed workspace, failed emit (unit tests, MS1/MS2); every `STATUS_EVENT` emit funnels through a settle (`every_status_emit_is_settled`, MS3/MS4); the spawn passes the alias straight through (the `cc_session` guard, MC1). Consuming surface (the drain thread's `emit_settled(… emit_raw)`): it needs a live `AppHandle`, so it is pinned by the funnel guard and was driven live in verify-self O5.
    — evidence: `pnpm verify:auto` → exit 0 in 73 s; vitest 4225/4225; `cargo test` lib 1553 passed, 0 failed.

## Current Node
- **Path:** Feature > done
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none (then the sweep's "Fold back and delete"), then the sweep's "Fold back and delete"
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-27] P2.verify-auto — `appBoot.test.tsx` PiP mount case failed once under full-gate load (no WP10 frontend change; 3/3 alone and a full re-run green). Backlog `SURFACE-2026-11-27-APPBOOT-PIP-MOUNT-TEST-FLAKY-UNDER-GATE-LOAD`.
[SHORTCUT-2026-11-27] P1.verify-self.O2 — M2 (the needle's trailing `/`) survived: the doc comment claimed the slash separates `com.claudesk.app` from `.app.dev`, but the `/ssh` after the identifier already does that, and no fixture had a sibling `ssh2/` dir. Fix: corrected the `orphaned_masters` doc and added the `ssh2/` near-miss to the P1.3 test. A FRESH runner re-verified it (positive control passed; the mutant was killed: `left: [4242] right: []`).
[NOTE-2026-11-27] Live-check state: the temporary scratch remote row was added to the dev `projects.json` for both phases' live checks. RESTORED after Phase 2 (`projects.json`, `settings.json` and `remote-sessions.json` from backup, shas match).

## Code-Quality Review

*(feature-review-quality on ship commit `226f863`, window `226f863^..226f863`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 6 MINOR, all auto-backlogged.)*

### Strengths
- `emit_settled` is pure (the emitter is injected), so the race is tested deterministically. The two interleaving tests run the racing mutation inside the recording emit's first call and assert their own preconditions before the final emit.
- One choke point: `commands::emit_raw` is the crate's only `STATUS_EVENT` emit, and `every_status_emit_is_settled` counts crate-wide. `with_no_race_every_path_emits_exactly_once` guards the opposite regression (doubled emits).
- The reaper fixture builds its `ps` lines from the real `master_argv`/`check_argv`, so a change to the argv shape fails the selection test instead of leaving a reaper that silently selects nothing. Each near-miss differs from the orphan in exactly one respect.
- Main-thread discipline holds: the registry lock is taken only for the `current_view` re-read, never across `emit`. The promote comment was corrected rather than deleted.
- `forget_master` is the one clear helper; `set_remote_realpath(Option)` forces every caller to say what `None` means; the `cc_session` guard pins the new call and the old form's absence.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [status_broadcaster/commands.rs `every_status_emit_is_settled`] The funnel guard misses `emit_to(…, STATUS_EVENT, …)`, `emit_filter` and the UFCS `Emitter::emit(&app, STATUS_EVENT, …)`. Its "inside a settle" check is a textual "since the last `;`", so `if emit_settled(…).is_err() { emit_raw(…) }` would pass. Add those forms.
- [remote_link/mod.rs `try_exit`/`run_worker`] `forget_master` runs after `try_exit` has already reaped the child (plus its 50 ms stderr sleep), and after the up-timeout `kill` reaped it. A `halt()` in that window could still `killpg` a freed pid. The risk is negligible, but the commit message's "as soon as a master exits" overstates it: document the window at `forget_master`.
- [remote_link/mod.rs `orphaned_masters` doc] The doc says "directly under `ssh_dir/`", but `contains(&needle)` accepts any depth (`ssh/sub/x`). It affects only the doc, since real ControlPaths are one level deep.
- [status_broadcaster/commands.rs `drain_loop`] A second `app.try_state::<SharedRegistry>()` at emit time: an unreachable branch that would drop the update silently. Lift the first handle out of its block instead.
- [status_broadcaster/mod.rs `apply_link_edge`] The unit emit is adapted to `Ok(())`, followed by `.ok()`: the link-edge path never stops on a failed emit, while the others do. It is benign, but consider a `Result`-returning `LinkEdgeSink` emit.
- [status_broadcaster/commands.rs `mod tests`] `every_status_emit_is_settled` sits above the module's `use` lines (cosmetic).

### Assessment
Well-built paydown: four leftovers each get a targeted fix with a proportionate guard, and the riskiest change (settle-on-emit) has a correctness argument plus tests for both of its failure directions. It follows the project's lessons (no lock across `emit`, one funnel with a guard, fixtures derived from production, each near-miss mutation-proven). D-B and its cost are documented in the WIP and the `emit_settled` doc. The reaper's narrow selection plus a real ppid-1 orphan test through the real `ps`/`killpg` is the right proof for code that kills processes at launch. What remains is small: one guard with plausible-but-unlikely blind spots, two docs slightly stronger than the code, and a little redundancy in the drain loop. None of it warrants a refactor pass.

### If you disagree
Dismiss a finding by marking its line `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Ship
- Commit `226f863` (pushed with WP9's finalize `49e04e5`), after a 0-hit identifier grep of both commits' added lines.
- Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto` exit 0 in 73 s). Nothing but staging changed since.

## Retrospect
- **What changed in our understanding:** The WBS's "per-workspace sequence, drop an older update" cannot be built safely on the backend alone. Dropping needs either a lock held across `emit` (the tray's Rust listener runs inside `emit` and marshals to the main thread, and promote is a main-thread command, so that is the freeze shape) or a sequence every consumer compares. Settle-on-emit (re-read the registry after each emit and re-emit its view until they match) gives "the last update on the wire is the truth" with neither.
- **Assumptions that held:** The orphan is reparented to launchd (`ppid 1`) and still leads its own group, so `ppid == 1 && pgid == pid` plus the app's own `ssh/` dir is a safe, narrow selector. `ps -axww -o pid=,ppid=,pgid=,command=` shows the `Application Support` path verbatim, so a substring needle works despite the space. `remote_open_check`'s 20 s grace gave an Up link to kill under, with no tmux session and no CC.
- **Assumptions that were wrong:** The doc comment claimed the needle's trailing `/` separated `com.claudesk.app` from `.app.dev`. The `/ssh` after the identifier already does, so mutant M2 survived until a sibling `ssh2/` near-miss was added (verify-self shortcut). The review then found the same family again: "directly under" is not what `contains` checks. Doc claims about a matcher need their own discriminating input.
- **Approach delta:** D-B replaced the WBS's sequence with settle-on-emit (operator-approved at verify-human). The `master_pid` clear has two sites, not three: one call in the failed-come-up block covers both exit-while-connecting and the up-timeout kill. Codify added a real double-forked ppid-1 orphan test through the real `ps`/`killpg`, plus an `init` ordering guard and a settle-cap test. Two unrelated flakes showed up in the gate (the `hook_socket` closed-peer test, 3/5 today; the new `appBoot` PiP mount case); both are backlogged.

## Closure
> **Feature complete:** paydown-2026-11-27 WP10 (remote link lifecycle) has shipped. A hard-killed app's ssh link master is reaped at the next launch, reaped pids are never signalled, stale remote aliases are cleared, and status surfaces always end on the registry's current state. Verify: `kill -9` a dev app with a remote link up, relaunch, and look for `reaping orphaned ssh link master <pid>` on stderr.

Requester = operator — closure notice for self-record.
