---
name: bash-subshell-cargo-path
description: Bash subshells in Claude Code sessions do not inherit ~/.cargo/env from the user's login shell; cargo/rustc invocations require an explicit PATH prefix.
type: reference
---

When invoking `cargo`, `rustc`, `cargo clippy`, `cargo fmt`, `cargo test`, or `pnpm tauri (dev|build)` (which calls cargo under the hood) from a Bash tool call in this Claude Code session, prepend:

    export PATH="$HOME/.cargo/bin:$PATH"

The user's login shell (zsh) sources `~/.cargo/env` automatically, but Bash subshells spawned by Claude Code do not. `which cargo` returns nothing without the prefix even though the binary exists at `~/.cargo/bin/cargo`.

This is a session-execution detail, not a project artifact — but every Phase 1+ task involving Rust will hit it. Surfaced during WP1 (2026-06-16). A `.envrc` (direnv) or shell alias on the user's machine would eliminate the per-command boilerplate; until then, the prefix is the workaround.
