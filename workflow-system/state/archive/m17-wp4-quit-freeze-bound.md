---
workflow: task
state: close (complete)
completed: 2026-11-16
created: 2026-11-16
drive_mode: autopilot
docs-only: false
---

# Task: a link-down remote close never execs (quit-freeze bound)

**Workflow:** task
**State:** Completed (2026-11-16)
**Created:** 2026-11-16

## Problem Statement
A remote session's close runs two side-channel ssh execs (the copy-mode cancel, then `end_session`), and with the link not Up each one falls back to a DIRECT connect bounded only by `ConnectTimeout`. The sync `quit_now` joins those kills on the main thread, so a link-down quit freezes the UI for up to ~27 s, and the `quit_now` LEDGER entry says ~12 s.

Source: `SURFACE-2026-11-16-QUALITY-M17WP4-QUIT-FREEZE-BOUND-UNDERSTATED` (`backlog-quality-findings.md` → `# m17-wp4-status-over-the-link`).

## Context
- `src-tauri/src/remote_link/mod.rs`: `LinkRegistry::cancel_copy_mode`, `LinkRegistry::end_session`, `LinkRegistry::exec`, `exec_argv`, `NO_DIRECT_FALLBACK`, `terminal_argv`, `LinkRegistry::state`
- `src-tauri/src/cc_session/mod.rs`: `RemoteExit::cancel_before_exit` (called from `PtyCcSession::kill`'s `CleanExitAttempt` step), `RemoteCcSession::kill` (→ `end_session`)
- `src-tauri/src/lib.rs`: `perform_quit_teardown`. `kill_all` runs BEFORE `links.stop_all()`, so on a healthy link the close still sees Up and still ends the remote session (R-1 kept).
- `src-tauri/tests/sync_commands_do_not_block.rs`: the `quit_now` LEDGER comment.
- Test harness: `src-tauri/src/remote_link/tests.rs` (`harness`, `up`, `ssh_ends_within`, and the positive-control pattern in `a_remote_terminal_never_falls_back_to_a_direct_connection`).

**Design (both halves of the suggested action, because each one covers a case the other misses):**
1. **Gate.** The close-path execs (`cancel_copy_mode`, `end_session`) run only when `state(host) == Some(Up)`. Otherwise they return a distinct `LinkNotUp` error without spawning anything. This covers the usual link-down quit (Lost / Connecting / no link). It also matches `RemoteCcSession::kill`'s documented intent: "while reconnecting … nothing touches the remote" (the end-intent is WP5's R-4 work).
2. **Master-only argv.** These execs carry `NO_DIRECT_FALLBACK`, so a stale Up (the master died inside the worker's poll window) fails at once with 255 instead of connecting directly. Other execs (the open check, prepare_inject, the hook install) keep the fallback. They are out of scope and not on the quit path.

**Residual bound (to state honestly in the LEDGER):** the link reads Up and the master is alive, but the network is gone (keep-alive not yet expired). Then a mux exec can still wait for its timeout: cancel 10 s + end 15 s. That window lasts until `ServerAliveInterval`×count (~45 s) detects the drop. The gate cannot see it, and only a shorter close-path timeout would bound it. Note it in the LEDGER and do not widen scope.

## Work Tree

- [x] T1 Gate + master-only argv in `remote_link`: a `CloseExecError { LinkNotUp, Run(RunError) }`; a private `close_exec` helper (gate on `state == Some(Up)`, then `master_only_exec_argv` = `exec_argv` + `-o NO_DIRECT_FALLBACK`); route `cancel_copy_mode` + `end_session` through it; update their docs.
- [x] T2 Callers in `cc_session`: adapt to the new error type; update the docs on `RemoteExit::cancel_before_exit` and `RemoteCcSession::kill` (a not-Up close skips the remote, the session keeps running → WP5).
- [x] T3 Tests in `remote_link/tests.rs`: (a) no link → both methods return `LinkNotUp` within 200 ms; (b) a fake-Up link to the unroutable `192.0.2.1` with no control socket → `end_session` fails 255 within 3 s (it would wait ~10 s on a direct connect); (c) an argv pin that `master_only_exec_argv` carries `NO_DIRECT_FALLBACK` before `--`. Mutation-prove (a) by deleting the gate and (b) by deleting the option. Restore each mutant via `cp` aside + `shasum`, never `git checkout`.
- [x] T4 Rewrite the `quit_now` LEDGER comment in `tests/sync_commands_do_not_block.rs` with the real bounds: not Up → no exec, the ~0.8 s kill window + reap; Up → cancel ≤10 s + end ≤15 s; the stale-network residual.
- [x] T5 Run `pnpm verify:auto`.

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Act notes
- T3 mutation proofs (restored via `cp` aside, shasum `2f23b94c…` matched): **M1** (the gate replaced by `if false`) → `a_close_with_no_link_or_a_lost_link_sends_nothing` FAILED. **M2** (the `NO_DIRECT_FALLBACK` splice commented out) → the stale-Up test FAILED in 10.05 s (the direct-connect wait) and the argv pin FAILED.
- T5: `pnpm verify:auto` EXIT=0 in 57 s (vitest 3905 pass; cargo lib 1256 pass / 4 ignored). The first run failed only `cargo fmt --check` on the new tests; `cargo fmt` fixed it. The one lint warning is the pre-existing XtermPane `exhaustive-deps`.

## Verification Observable

**Observable:** The two close-path calls that a remote kill makes on the quit's main thread (`end_session`, `cancel_copy_mode`), run with the real `/usr/bin/ssh` against an unroutable host, send nothing and return in under 200 ms when the link is not Up (none, or Lost and staying down). On a stale Up they fail with 255 in under 3 s instead of a ~10 s direct connect. The caller pins tying `RemoteCcSession::kill` / `PtyCcSession::kill` to those calls still hold.
**Verification command:** `cargo test --lib -- remote_link::tests::a_close remote_link::tests::the_master_only cc_session::tests::kill_cancels_a_remote_panes_copy_mode cc_session::tests::a_remote` + `cargo test --test sync_commands_do_not_block` (from `src-tauri/`)
**Expected result:** every named test `ok`, `0 failed`.

## Verification Result

**Status:** PASS
**Date:** 2026-11-16
**Evidence:** `test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 1252 filtered out; finished in 1.55s` (incl. `a_close_with_no_link_or_a_lost_link_sends_nothing ... ok`, `a_close_exec_on_a_stale_up_link_fails_fast_instead_of_connecting_directly ... ok`, `a_remote_close_ends_its_session_and_a_respawn_waits_for_it ... ok`, `kill_cancels_a_remote_panes_copy_mode_before_it_types_exit ... ok`). `sync_commands_do_not_block`: `test result: ok. 16 passed; 0 failed`. Mutants from act: removing the gate fails the no-link/Lost test; removing the option makes the stale-Up exec take 10.05 s and fails its test.
**Notes:** The fix lives entirely in the two callees; the kill callers are unchanged apart from doc text. Not run: a live, installed-app quit with a real link-down remote workspace. A down network cannot be produced safely against the operator's mini (`remote-verify-hygiene`), and it would add nothing over the real-ssh timing above. The residual "master alive, network gone" window (≤ ~27 s until keep-alive) is unchanged and documented in the LEDGER.

## Retrospect
- **What changed in our understanding:** the finding offered two fixes as alternatives ("skip when not Up, OR `NO_DIRECT_FALLBACK`"), but each covers a case the other misses. The gate handles Lost/Connecting/no link with zero cost. The option handles a stale Up (the master died inside the worker's poll window). Both shipped.
- **Assumptions that held:** `perform_quit_teardown` runs `kill_all` BEFORE `links.stop_all()`, so on a healthy link the close still sees Up and R-1 (close ends the remote session) is unchanged. The existing `ssh_ends_within` + RFC 5737 address pattern made the stale-Up case testable with a positive control, without a network.
- **Assumptions that were wrong:** none material. The first `verify:auto` failed only on `cargo fmt --check` for the new test code.
- **Approach delta:** gating in the callee (`LinkRegistry::close_exec`) instead of in `RemoteCcSession::kill`, so both close-path calls (and any future caller) get it and the kill callers only changed doc text. One residual stays open by design: master alive over a dead network, until keep-alive notices. It is documented in the LEDGER, not bounded tighter.

**Closure notice:** Requester = operator. Closure notice for self-record: the M17 WP4 review MAJOR is fixed. A link-down quit with a remote workspace open no longer runs any ssh exec from the close path, and a stale-Up close fails fast instead of connecting directly. Covered by `remote_link::tests::a_close_*` (mutation-proven).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
