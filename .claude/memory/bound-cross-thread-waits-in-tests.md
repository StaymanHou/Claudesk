---
name: bound-cross-thread-waits-in-tests
description: A test that waits on another thread's signal must bound the wait (recv_timeout), or a mutant that removes the signal HANGS cargo test, leaving the mutant on disk and an orphaned test binary.
metadata:
  type: project
---

Hit 2026-11-17 (M17 WP5 Phase 3). `detach_with_the_link_down_cancels_the_reconnect_wait…` spawned a
waiter thread and then `t.join()`ed it. The mutant "Detach does not mark the session closed" left the
waiter's reconnect wait uncancelled, so `join()` never returned: the WHOLE `cargo test --lib` run hung
(the Bash call hit its 600 s timeout and was backgrounded), the mutated file stayed on disk, and the
`deps/claudesk_lib-*` test binary had to be killed by hand before the file could be restored.

- **How to apply:** whenever a test waits for another thread to finish, signal or notice something,
  make the wait bounded and fail on expiry:
  `let (tx, done) = mpsc::channel(); thread::spawn(move || { work(); let _ = tx.send(()); });`
  … `assert!(done.recv_timeout(Duration::from_secs(2)).is_ok(), "<what should have ended it>");`
  The same mutant then FAILS in seconds instead of hanging.
- When a mutation run does hang: stop it, `pkill -f "deps/claudesk_lib-"` (only binaries you
  started), restore the file from its pre-mutation copy, and confirm with `grep`/`shasum` before
  anything else. Related: [[perl-alarm-watchdog-orphans-cargo-test-binary]],
  [[git-checkout-no-ops-on-untracked-file]].
