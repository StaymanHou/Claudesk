---
workflow: task
state: close (complete)
completed: 2026-11-27
created: 2026-11-27
docs-only: false
drive_mode: autopilot
---

# Task: De-flake the hook_socket closed-peer test

**Workflow:** task
**State:** Completed 2026-11-27
**Created:** 2026-11-27

## Problem Statement
`hook_socket::tests::a_client_closed_before_accept_refuses_the_timeout_benignly_and_still_delivers` asserts that macOS ALWAYS refuses `SO_RCVTIMEO` once the peer closed, but under gate load the close has sometimes not landed by `accept()` (3 of 5 full gates on 2026-11-27), so the test is flaky while the production behaviour is fine.

## Context
- Backlog: `SURFACE-2026-11-27-HOOK-SOCKET-CLOSED-PEER-TEST-FLAKY` (low; failed 3/5 full gates today).
- Code: `src-tauri/src/hook_socket/mod.rs` — `accept_loop` (sets the read timeout, `peer_already_closed` keeps the EINVAL refusal off stderr), the test in `mod tests`.
- Panic text `expect_err(...): ()` = `set_read_timeout` returned **Ok**: the peer was not yet closed at accept time.
- Likely cause (plausible, not proven): `drop(client)` only drops the last reference if no other process holds the fd; the lib test binary runs tests in parallel and several modules spawn processes (`clipboard`, `git_diff`, `remote_fs` tests, `adjudicator`, `status_broadcaster`). A child forked between `connect` and `drop` holds the client fd until its exec closes it (CLOEXEC), so the peer is still open when the server accepts. That would explain "only under gate load".
- Production is unaffected either way: an accepted timeout is the normal path, a refused one is classified benign, and the buffered line reads in both.

## Approach
Keep the kernel premise asserted but stop depending on a single draw of the race:
- Repeat the closed-before-accept scenario up to N times. On **every** attempt the buffered line must be delivered (whatever `set_read_timeout` returned), and any refusal must classify as benign via `peer_already_closed`.
- Require at least ONE refusal across the attempts (stop at the first), so the test still proves the macOS premise the EINVAL classifier exists for. A single attempt loses the race ~10% of the time under load, so N=20 brings it to ≈1e-20.
- Keep the deterministic negative (`EBADF` is NOT benign) as before.

## Work Tree

- [x] T1 Rewrite the test as a bounded retry: per-attempt delivery assert, benign-classification assert on Err, at-least-one-refusal assert at the end; update its doc comment with the race and why
- [x] T2 Mutation-prove: (a) `peer_already_closed` → `false` fails; (b) the client no longer sends its line (delivery breaks) fails; (c) the at-least-one-refusal assert fails if refusals are never counted. Restore and confirm clean
- [x] T3 Stress: run the test 50× in isolation plus several full `cargo test --lib` runs with parallel load; then `pnpm verify:auto` green

## Current Node
- **Path:** Task > closed
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** SURFACE-2026-11-27-UNIDENTIFIED-RUST-LIB-TEST-FLAKE (backlogged)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-27] verify — an unidentified OTHER Rust lib test failed 1 of 40 full-binary runs; logged as SURFACE-2026-11-27-UNIDENTIFIED-RUST-LIB-TEST-FLAKE.

## Act evidence (2026-11-27)
- T1: the test now repeats the closed-before-accept scenario up to 20×; every attempt asserts delivery, a refusal must classify benign, and at least one refusal is required (the macOS premise). EBADF-is-not-benign kept.
- T2 mutants (each killed at its own assert, file restored by `cp` + shasum): classifier → `false` (benign assert); client sends nothing (delivery assert); `refused += 1` removed (at-least-one-refusal assert).
- T2 positive control: holding a `try_clone` of the client on attempts 0–2 makes `set_read_timeout` ACCEPTED (the exact `expect_err(...): ()` failure); the new test delivers through all three and passes on the refusal at attempt 3.
- T3: isolated 50/50; full `cargo test --lib` binary 8/8 (129 s); `pnpm verify:auto` EXIT=0 in 89 s (1553 Rust lib tests, 4225 vitest). The one ESLint warning (`XtermPane.tsx` spread deps) is pre-existing and untouched.

## Verification Observable

**Observable:** Under the real parallel load of the full Rust lib test binary, the rewritten test never fails, while HEAD's single-draw version run beside it as a throwaway sibling (`zz_head_closed_peer`) does fail, which proves the runs actually hit the race.
**Verification command:** temporarily add HEAD's test body as `zz_head_closed_peer` in `hook_socket::tests`, build, run `target/debug/deps/claudesk_lib-<hash>` (all tests) 20×, count per-test failures; remove the sibling and confirm `mod.rs` is byte-identical to the act result.
**Expected result:** `a_client_closed_before_accept…` 0/20 failures; `zz_head_closed_peer` ≥ 1/20 failures (if 0, extend the runs before calling it); restore shasum matches.

## Verification Result

**Status:** PASS
**Date:** 2026-11-27
**Evidence:** HEAD's version as sibling `zz_head_closed_peer` (passes alone: `1 passed; 0 failed`). First batch of 20 full lib-binary runs: `new_fail=0/20 head_fail=1/20 other_fail=1`. Second batch of 20 printed no `FAILED` line at all. Total: rewritten test 0/40, HEAD's version 1/40. Sibling removed; `mod.rs` restored to the act result (shasum match, `grep -c zz_head` = 0).
**Notes:** The runs did hit the race (HEAD's single draw failed under load), and the rewritten test survived every run. One OTHER test failed once in the first batch, and its name was not captured (the counting loop only tallied it). It was not seen again in the next 20 runs, so it is not attributable to this change (which touches only this one test). Logged to the backlog as an unidentified lib-suite flake.

## Retrospect
- **What changed in our understanding:** The test's `expect_err(...): ()` panic means `set_read_timeout` SUCCEEDED, so the peer was still open at `accept()`. A held reference to the client fd reproduces that exactly (the `try_clone` control). That makes a concurrent test's forked child briefly holding the fd the likely cause under gate load. This is the mechanism, not a proven trigger.
- **Assumptions that held:** Production is unaffected (an accepted timeout is the normal path). A bounded retry that still demands one refusal keeps the macOS premise asserted without depending on one draw of the race.
- **Assumptions that were wrong:** None about the fix. The process slipped twice: a `ls target/debug/deps/claudesk_lib-*` glob overflowed the argument list and produced a silent 0/50 (take the binary path from `cargo test --no-run` output instead), and a perl replacement `$1[SURFACED-…]` was parsed as an array subscript and ate the WIP's Discoveries heading (write `${1}`).
- **Approach delta:** Added a HEAD-version sibling discriminator at verify (old 1/40 vs new 0/40), which the plan did not list. It turned up one unrelated unnamed lib-test failure, now backlogged.
