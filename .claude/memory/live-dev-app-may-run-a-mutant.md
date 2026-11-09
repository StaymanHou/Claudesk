---
name: live-dev-app-may-run-a-mutant
description: Mutation-testing Rust while `pnpm tauri:dev` runs lets its watcher rebuild + restart the app from a MUTANT; check the process start time and binary mtime against the last restore and force a clean rebuild before any live check. Find the app with `pgrep -x claudesk` (`pgrep -f` matches the Bash wrapper shell).
metadata:
  type: project
---

`pnpm tauri:dev` watches `src-tauri/src` and rebuilds + restarts the app whenever a Rust source
changes. A mutation run (`perl -pi` a mutant → `cargo test` → `cp` the original back) edits those
sources, so the watcher can build and launch the app **from a mutant** and keep running it after
the file is restored. A later bridge/IPC observation then silently verifies mutant code.

Hit 2026-11-02 (M16.5 WP6 Phase 2): after two Rust mutants, the dev process had started **1 s after**
the final restore, too close to be sure it was built from the restored file.

**How to apply:** before any live verify-self that follows a mutation run, compare
`ps -o lstart= -p <pid>` (from `pgrep -x claudesk`, NOT `pgrep -f`; see below) and
`stat -f %Sm src-tauri/target/debug/claudesk` against the time of the last restore. If either is not
clearly later, `touch` a source file and wait for a NEW PID before observing.

⚠️ **The PID start time is when `cargo run` STARTED, not when the binary was built** (added 2026-11-04,
paydown WP4). `cargo run` exec-replaces itself with the binary, keeping its PID, so a fresh rebuild
shows a start time BEFORE the binary's mtime (observed: start 11:23:21, binary 11:23:26, file swap
11:23:20). Read that as "the build ran after cargo started", not as stale code. The decisive signal is
the dev log: after the watcher's `File … changed. Rebuilding application...`, a `Finished` line followed
by `Running \`target/debug/claudesk\`` (strip ANSI before grepping; the cargo progress bar can put
`Finished` on the same line as `Building`). Related:
[[verify-the-mutation-landed]] (the mutant must land) and [[hmr-stale-across-file-rename]] (the
frontend twin: a stale HMR module).

⚠️ **Find the dev app with `pgrep -x claudesk`, never `pgrep -f target/debug/claudesk`** (added
2026-11-09, backlog-paydown-2026-11-08 WP6). The Bash tool runs each command inside a wrapper shell whose
OWN command line contains the whole command text, so `pgrep -f <pattern>` matches that wrapper whenever
the pattern appears in the same command, and a `kill $(pgrep -f …)` can then kill the agent's own shell
(observed: the wrapper `/bin/zsh -c … pgrep -fl "target/debug/claudesk" …` listed as a match while the app
had not started yet). `pgrep -x claudesk` matches the process NAME exactly. Before any kill, confirm the
PID is one this session launched (`ps -o pid,lstart,command -p <pid>`); never kill a dev build you did not
start ([[lsof-ti-tcp-misses-ipv6-vite]]).
