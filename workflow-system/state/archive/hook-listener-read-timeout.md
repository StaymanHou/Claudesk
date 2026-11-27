---
drive_mode: autopilot
---

# Feature: Hook listener read timeout (one stuck connection must not deafen every session)

**Workflow:** feature
**State:** Completed 2026-11-27
**Created:** 2026-11-27
**Resolves:** `SURFACE-2026-11-27-HOOK-LISTENER-ONE-STUCK-CONNECTION-DEAFENS-ALL` (high)

## Problem Statement

`hook_socket::accept_loop` serves one connection at a time and reads it to EOF with no read
timeout. If one client connects and never closes, the listener stops accepting for every Claude
Code session on the machine until the app restarts. Prod's `status-channel.log` (read-only
inspection, 2026-11-27) shows exactly this:
- The last line processed live was a remote `PreToolUse` at 09:51:09.425. The connection behind
  it (most likely a forwarded `ssh -R` channel that delivered its line and never closed)
  blocked the loop.
- The next **128** events (exactly the macOS listen backlog) queued in the kernel.
- After that, every hook's connect failed: 321 `- HOOK write-failed` lines.
- At the 10:33 quit, the workspaces deregistered first. The stuck channel then closed and the
  loop drained the 128 queued events against an empty registry, which wrote them as
  `resolved=none` with their *send* timestamps (09:51–09:54).

So the backlog's open sub-question ("`resolved=none` from 09:51:09, cause not established") is
**answered**: it was not a routing failure, just backlogged events drained after deregistration.
What made it hard to read is that `REGISTRY` lines carry no timestamp (`-`), so nothing in the
log showed those deregisters were at 10:33.

**Fix (chosen):** a per-connection **read timeout** on the existing serial loop (2 s idle).
A thread per connection was rejected: CC runs hooks synchronously, so one session's events
arrive as strictly ordered, non-overlapping connections, and the status machine depends on that
order (Stop vs. the next UserPromptSubmit). Handing each connection to its own thread could
reorder two connections accepted microseconds apart. The serial loop keeps the order and caps a
stuck connection's cost at 2 s, with the queued events delivered (not lost) right after. Any
line the stuck client already sent was delivered before the timeout, because the timeout only
fires on *silence*.

Plus diagnostics so the next occurrence explains itself:
- a timestamped `HOOKSOCK read-timeout` line naming the peer: pid via `getsockopt(SOL_LOCAL,
  LOCAL_PEERPID)` and process name via `proc_name`, which shows `ssh` for a forwarded channel;
- a wall-clock ms timestamp on `REGISTRY` lines in place of `-`, the same leading-field shape
  as `STATUS` lines.

No 3rd-party dependency (`libc` is already a direct dependency). No `wbs.md` exists; this is an
inserted high-priority fix taken ahead of paydown-2026-11-27 WP6, by operator choice at restore.

## Work Tree

- [x] Phase 1: Read timeout + peer diagnostics
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml hook_socket` passes and includes a new test that holds one client connection open after writing a line, then has a SECOND client write an event. The second event is received within `recv_timeout(5 s)` while the first client is still open (test-injected timeout ~200 ms). The first client's line was also delivered. Mutation-proven: with the timeout removed (`set_read_timeout(None)`), this test FAILS (times out), never hangs `cargo test` (bounded waits only).
  - CLI: a new test asserts that after a held-open connection times out, the logger at a temp dir has one `HOOKSOCK read-timeout` line whose `peer_pid=` equals `std::process::id()` (the test is the peer), plus `lines=1`. Mutation-proven: forcing the peer-pid helper to return `None` fails it.
  - CLI: `format_registry_line` unit test pins the new shape `<ts_ms> REGISTRY op=… id=… raw=… key=…` (a digit-only leading field, not `-`).
  - CLI (state-changing, dev app + dev app-data only): launch `pnpm tauri:dev` (identity `com.claudesk.app.dev`). Open a held connection to the DEV `hook.sock` with a perl client that writes nothing and sleeps 30 s. Then pipe a `Stop` payload through the working-tree `src-tauri/resources/claudesk-hook.pl` at the dev socket (`[[drive-status-channel-with-real-hook-script]]`). Within ~3 s the dev `status-channel.log` gains (a) a `HOOKSOCK read-timeout peer_pid=<the perl pid> peer=perl …` line and (b) the `STATUS event=Stop …` line, and gains no `HOOK write-failed` line. Kill only the PIDs launched here, by full command line. ⚠️ Never the prod app or its socket.
  - CLI: `pnpm verify:auto` exits 0 (timeout 315000).
  **Alignment questions:**
  - (decision) A connection silent for 2 s is closed, so anything a stalled remote channel sends *after* those 2 s is lost (that one event; the next one corrects the dot). The alternative is a longer timeout and a longer blind window per stall. Is 2 s the trade you want?
  - [x] P1.1 `hook_socket`: give `accept_loop` a `read_timeout: Duration` and an `Option<StatusLog>`. Call `stream.set_read_timeout(Some(t))` per accepted stream. On a read error of kind `WouldBlock`/`TimedOut`, log one `HOOKSOCK read-timeout` line (peer pid + name, lines delivered on this connection, idle ms) and move to the next accept. Other read errors keep today's `eprintln` + break. `spawn_listener_fanout` takes the log and uses the production constant `HOOK_READ_TIMEOUT = 2 s`; the test-only `spawn_listener` passes `None` + the constant; tests call `accept_loop` directly to inject ~200 ms.  
  - [x] P1.2 Peer helper: `peer_info(&UnixStream) -> (Option<i32>, Option<String>)` via `libc::getsockopt(fd, SOL_LOCAL, LOCAL_PEERPID, …)` + `libc::proc_name`. Best-effort, no `unwrap`, all `unsafe` contained and commented. *(As built: read lazily at TIMEOUT time instead of at accept, since the client is by definition still connected then, so the hot path pays nothing.)*  
  - [x] P1.3 `status_log`: pure `format_hooksock_timeout_line(ts_ms, pid, name, lines, idle_ms)`. Make `format_registry_line` take `ts_ms` and update its caller `log_registry_mutation` (wall-clock now). Update the byte-exact tests.  
  - [x] P1.4 `hook_socket::commands::start_on_launch`: build the `StatusLog` from the socket path's parent (it IS `app_data_dir`) and pass it in.  
  - [x] P1.5 Tests: the held-open-then-second-client pin; the timeout-line + peer-pid pin; keep all existing listener tests green (`loop_exits_cleanly_when_receiver_is_dropped` etc.). Mutation-prove each new test individually (restore via `cp` aside + `shasum`, `[[git-checkout-no-ops-on-untracked-file]]`).  
  - [x] P1.6 Docs: `arch/status-channel-and-surfaces.md` gains the listener's read-timeout rule (serial on purpose, for event order) and the two log-line shapes. Update the module doc of `hook_socket/mod.rs` ("drained promptly" → bounded by the timeout).  
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 0 in 82 s (lint 0 errors / 1 warning, in untouched `XtermPane.tsx`; format; tsc; check:link; vitest 332 files / 4205 tests; cargo fmt --check; clippy --all-targets -D warnings; cargo test lib 1523 passed / 0 failed, 11 `test result: ok` lines)
    — evidence: `cargo test --lib hook_socket` → 22 passed, incl. `a_connection_that_never_closes_does_not_deafen_the_next_client` + `a_timed_out_connection_is_logged_with_its_peer`
    — evidence: mutation, each alone, restored by `cp` + `shasum`: no-timeout (`set_read_timeout(None)`) → both new tests FAIL in 5 s (bounded, no hang); peer_pid→None → peer test FAILS; process_name→None → peer test FAILS; now_ms→0 → `now_ms_is_a_current_epoch_ms` + peer test FAIL
  - [x] verify-self
    — evidence: `cargo test --lib hook_socket` → 23 passed / 0 failed, incl. the 3 new listener tests; `cargo test --lib status_log` → 17 passed, incl. both format pins
    — evidence (live, dev app `com.claudesk.app.dev` PID 25553, built after the EINVAL fix): perl holder (PID 27437) connected and wrote nothing; a Stop probe through the working-tree `claudesk-hook.pl` returned in 29 ms (exit 0). New log lines, in order: `… HOOKSOCK read-timeout peer_pid=27437 peer=perl lines=0 idle_ms=2000`, then `… STATUS event=Stop cwd=/nonexistent/vs-held-probe mapped=idle resolved=none outcome=dropped`. No `HOOK write-failed` line. The probe was held ~1.70 s behind the silent connection, then delivered.
    — evidence: in-place EINVAL fix (see [SHORTCUT-2026-11-27]); after the rebuild, 3 probe events → 3 STATUS lines and 0 new `set_read_timeout failed` stderr lines (the old build logged 62)
    — evidence: `pnpm verify:auto` re-run after the fix → exit 0 in 89 s (vitest 4205 passed; cargo lib 1524 passed; clippy -D warnings clean; 1 ESLint warning, in untouched `XtermPane.tsx`)
    - [x] align: (decision) 2 s timeout trade — evidence: one stall cost idle_ms=2000; a probe queued behind it was delayed ~1.70 s and then delivered; the hook side never blocked (29 ms). Each silent connection queued ahead adds up to 2 s.
  - [x] verify-human
    - [x] P1.verify-human.1 (decision) 2 s idle read timeout: accept it, or set a different value? — operator: "ok" (keep 2 s), 2026-11-27
  - [x] verify-codify
    Test scope: full — last phase
    — evidence: new coverage for the production wiring (the build-time tests inject a short timeout into `accept_loop`, so they could not see it): `the_production_listener_times_out_a_silent_client_at_two_seconds_and_logs_it` (drives `spawn_listener_fanout` at the real 2 s; asserts the next client's event arrives and the HOOKSOCK line has idle_ms in [2000,3000)) and `the_listener_logs_to_status_channel_log_beside_the_socket` (`start_on_launch`'s log path, extracted to `listener_log`)
    — evidence: mutation, each alone, restored + shasum-checked: fanout passes `None` log → FAILS; timeout 5 s → FAILS (5.00 s, bounded); log one dir up → FAILS
    — evidence: `pnpm verify:auto` (full) → exit 0 in 71 s; vitest 332 files / 4205 tests; cargo lib 1526 passed / 0 failed; every cargo target ok; clippy -D warnings clean; 1 ESLint warning, in untouched `XtermPane.tsx`
    Full suite at ship: reused the last-phase codify run (Test scope: full — last phase; `pnpm verify:auto` exit 0, 71 s). Since then only the WIP and `runtimes.md` changed; `format:check` + `cargo fmt --check` re-run at ship → 0
    — dev app (PIDs launched 11:09:22: tauri cli 20985, vite 21120, esbuild 21128, claudesk 45841) stopped by PID; prod untouched

## Code-Quality Review

*(ship commit `e96e3b4`; 0 CRITICAL, 1 MAJOR, 5 MINOR; all auto-backlogged per drive_mode=autopilot → `backlog-quality-findings.md` `# hook-listener-read-timeout — 2026-11-27`.)*

### Strengths
- Serial-on-purpose is explained in all three places a reader looks (the constant, the `accept_loop` doc, the arch doc).
- The tests have bounded waits, cover the real 2 s production path through `spawn_listener_fanout`, and are each mutation-proven.
- The FFI is tight: small `unsafe` blocks with SAFETY comments, `try_from` instead of `as`, failures fall back to `None`; the peer lookup only runs on timeout.
- The live-found EINVAL case is handled soundly, and its test asserts the kernel premise itself.
- The `REGISTRY` timestamp is a small, well-aimed diagnostic, and nothing parses the old shape.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`hook_socket/mod.rs` `HOOK_READ_TIMEOUT`] The timeout caps one stalled connection, but a client that trickles a byte every 2 s holds the loop, and stalls add up on a bad shared `ssh -R` link (the backlog can fill again). Why the forwarded channel never closed is still unknown. → SURFACE-2026-11-27-QUALITY-HOOK-LISTENER-STALLS-STILL-ADD-UP

**MINOR**
- [`accept_loop`] `try_clone()` on every connection contradicts "the hot path pays nothing". → …-PEER-TRY-CLONE-ON-EVERY-CONNECTION
- [`accept_loop`] the `!peer_already_closed` call site is untested (only the classifier is). → …-EINVAL-CALL-SITE-UNPINNED
- [`status_log::now_ms`] a third `now_ms` helper. → …-THIRD-NOW-MS-HELPER
- [`status_log` module doc] the writer list omits the listener thread. → …-STATUS-LOG-WRITER-LIST-STALE
- [`HOOKSOCK lines=`] counts lines that failed to parse. → …-HOOKSOCK-LINES-COUNTS-GARBAGE

### Assessment
A tight, well-reasoned fix: the smallest mechanism that bounds the observed failure, keeps the event order, and makes the next stall explain itself. The main gap is follow-up, not code: indefinite deafness became a per-stall cost that can add up, and the forwarded channel's root cause stays open (now backlogged).

### If you disagree
Mark a finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Current Node
- **Path:** Feature > complete
- **Active scope:** none (archived)
- **Blocked:** none
- **Unvisited:** none (next: paydown-2026-11-27 WP6) (then paydown-2026-11-27 WP6)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-11-27] plan — prod only gets this fix from a release; until then a stuck forwarded channel can still deafen the installed app (restart clears it). Note at ship; do not cut a release from this feature (`/release` is manual-only).
- [SHORTCUT-2026-11-27] P1.1 — verify-self found live that macOS `setsockopt(SO_RCVTIMEO)` returns EINVAL when the client closed BEFORE `accept()` (the common local-hook case: 62 stderr lines in minutes). Confirmed with a python socket repro (closed peer → errno 22, line still readable; open peer → ok). Fixed in place: `peer_already_closed` classifies EINVAL as benign (no log; such a connection reaches EOF and cannot stall). Pinned by `a_client_closed_before_accept_refuses_the_timeout_benignly_and_still_delivers` (mutant `→ false` FAILS it). Live discriminator: 3 probe events after the rebuild → 3 STATUS lines, 0 new EINVAL lines. Re-verified by a fresh verify-self runner subagent.

## Retrospect
- **What changed in our understanding:** the backlog's open sub-question ("`resolved=none` from 09:51:09, cause not established") was not a routing bug. Those were the 128 events queued in the listen backlog, processed at the 10:33 quit after the workspaces had deregistered, and logged with their SEND timestamps. Register/deregister were already logged; the missing piece was a timestamp on those lines.
- **Assumptions that held:** a serial loop with an idle read timeout bounds the observed failure and keeps event order; LOCAL_PEERPID + `proc_name` give a usable peer name.
- **Assumptions that were wrong:** that `set_read_timeout` always succeeds. macOS refuses `SO_RCVTIMEO` with EINVAL when the peer closed before `accept()`, which is the NORMAL local-hook case. The unit tests (all with live peers) could not see it; the live dev-app run found it within minutes (62 stderr lines).
- **Approach delta:** the peer lookup moved from accept time to timeout time (zero cost on the hot path); an EINVAL classifier was added in place at verify-self; verify-codify added two production-wiring tests (real 2 s via `spawn_listener_fanout`, the log path via `listener_log`) that the injected-timeout tests could not cover.

**Closure (requester = operator; closure notice for self-record):**
> **Feature complete:** the hook listener now drops a connection that stays silent for 2 s, so one stuck client (seen live: a remote host's forwarded channel) can no longer silence every workspace's status dot until restart. Each drop leaves a `HOOKSOCK read-timeout peer_pid=… peer=…` line in `status-channel.log`; it reaches the installed app with the next release.

