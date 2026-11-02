---
name: live-dev-app-may-run-a-mutant
description: Mutation-testing Rust while `pnpm tauri:dev` runs lets its watcher rebuild + restart the app from a MUTANT; check the process start time and binary mtime against the last restore and force a clean rebuild before any live check.
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
`ps -o lstart= -p <pid>` (from `pgrep -f target/debug/claudesk`) and
`stat -f %Sm src-tauri/target/debug/claudesk` against the time of the last restore. If either is not
clearly later, `touch` a source file and wait for a NEW PID before observing. Related:
[[verify-the-mutation-landed]] (the mutant must land) and [[hmr-stale-across-file-rename]] (the
frontend twin: a stale HMR module).
