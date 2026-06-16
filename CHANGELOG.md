# Changelog

## 2026-06-16

- **Feature shipped:** WP1 — Tauri 2 + React 19 + TypeScript + Vite project scaffold landed in the repo (scaffold-and-merge preserved strategic docs and the `_ref/` symlink), with ESLint v9 / Prettier / Vitest on the JS side and `cargo fmt` / `cargo clippy -D warnings` / `cargo test` on the Rust side; `pnpm tauri dev` opens a Claudesk window and `pnpm tauri build` produces `Claudesk.app`.
- **Feature shipped:** WP2 — Claude Code PTY-byte-injection probe confirmed via `portable-pty` 0.9 harness at `src-tauri/examples/cc_pty_probe.rs` that ANSI rendering, `/help\n` slash-command byte-injection, `pty.resize()` SIGWINCH, and yolo-mode auth carry-over all work as required for WP7; surfaced one high-priority design constraint (CC's TUI requires `Ctrl+D`/`Ctrl+C` twice to exit) to backlog as SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES.
- **Milestone:** WP2 (Phase 1, Probe — Claude Code under host-driven PTY byte-injection) complete.
