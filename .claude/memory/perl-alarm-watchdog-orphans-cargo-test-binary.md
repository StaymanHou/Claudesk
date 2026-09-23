---
name: perl-alarm-watchdog-orphans-cargo-test-binary
description: A `perl -e 'alarm N; exec @ARGV' cargo test …` watchdog (used to bound a mutant that makes a test HANG) kills cargo on SIGALRM but orphans the test binary, which is re-parented to PID 1 and keeps running. Afterwards `pgrep -fl claudesk_lib-` and kill ONLY your own PID (identified by the test-name argv).
metadata:
  type: project
---

macOS has no `timeout(1)` by default, so a hang mutant, for example an accept loop that never exits, was bounded with `perl -e "alarm 45; exec @ARGV" cargo test --lib loop_exits_cleanly` (paydown 2026-09-23 WP6, Row 29). The alarm fired (rc **142** = SIGALRM, which reads correctly as "never passed"). But `cargo` runs the test as a **child** binary, `target/debug/deps/claudesk_lib-<hash> loop_exits_cleanly`, and the signal killed cargo only. The child survived with PPID 1 and was still running 50s later.

**Why:** `exec` replaces perl with cargo, so SIGALRM goes to cargo's PID. Cargo does not forward it to the test process. A hung test binary is otherwise invisible: no terminal, no output. It holds whatever the mutant made it wait on (here a Unix socket in a tempdir), and it would still be running at the next gate run.

**How to apply:**
- After any watchdog-bounded run, run `pgrep -fl claudesk_lib-`. Confirm the process is yours with `ps -o pid,ppid,etime,command -p <pid>`: PPID 1, a short elapsed time, and **your test-name filter in its argv**. Then `kill <pid>`.
- ⚠️ **PID-scoped only, never `pkill`.** The same binary name runs in the operator's own terminals. See [[verify-self-dev-vs-prod-process-name-collision]] and [[lsof-ti-tcp-misses-ipv6-vite]]: never kill a process you did not launch.
- The binary was built from MUTATED source. Restoring the file changes its mtime, so the next `cargo test` rebuilds. Still, never trust a leftover binary's result.
