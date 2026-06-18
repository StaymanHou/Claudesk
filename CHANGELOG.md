# Changelog

## 2026-06-18

- **Feature shipped:** WP5 — frontend UI prototype: the VSCode-style Project Picker (scrollable mock recents with per-row delete, mocked Open-Folder) plus the tab-shell substrate (WorkspaceList with a Phase 1 N≤1 invariant, Center Stage, empty Filmstrip slot, 50/50 Workspace with an xterm.js DOM-renderer terminal on mock data and a "Coming in Phase 3" placeholder), driven by a `picker | workspace-open` view machine derived from state — all dark-mode only, with no backend wiring yet.
- **Milestone:** WP5 (Phase 1, Frontend UI prototype — tab-shell substrate) complete — the first critical-path build after the scaffold + probes; Phase 2/WP6/WP7 plug into this substrate rather than reshaping it.

## 2026-06-17

- **Feature shipped:** WP4 — thumbnail-rendering probe validated that ~1 fps live terminal mirrors of 8 backgrounded + 1 active xterm.js stay within budget on real macOS WKWebView (Apple M4: idle CPU 4.5%, active median 13.3%, RAM 240 MB, center frame p95 18 ms / 0 dropped), so **Phase 2 ships live mirrors** using `@xterm/addon-serialize` `serializeAsHTML()` from the buffer (which beat the `cloneNode` arm) — and corrected a non-viable mechanism the architecture had assumed (off-screen-DOM mirroring, defeated by one-parent-per-node and xterm's off-viewport renderer pause).
- **Backlog resolved:** SURFACE-2026-06-16-ARCH-THUMBNAIL-MECHANISM-NONVIABLE — closed by WP4's decision report and the atomic arch.md mechanism correction.
- **Milestone:** WP4 (Phase 1, Probe — Thumbnail-rendering cost at N=8 workspaces) complete; outcome gates Phase 2's filmstrip + PiP rendering strategy.

## 2026-06-16

- **Feature shipped:** WP1 — Tauri 2 + React 19 + TypeScript + Vite project scaffold landed in the repo (scaffold-and-merge preserved strategic docs and the `_ref/` symlink), with ESLint v9 / Prettier / Vitest on the JS side and `cargo fmt` / `cargo clippy -D warnings` / `cargo test` on the Rust side; `pnpm tauri dev` opens a Claudesk window and `pnpm tauri build` produces `Claudesk.app`.
- **Feature shipped:** WP2 — Claude Code PTY-byte-injection probe confirmed via `portable-pty` 0.9 harness at `src-tauri/examples/cc_pty_probe.rs` that ANSI rendering, `/help\n` slash-command byte-injection, `pty.resize()` SIGWINCH, and yolo-mode auth carry-over all work as required for WP7; surfaced one high-priority design constraint (CC's TUI requires `Ctrl+D`/`Ctrl+C` twice to exit) to backlog as SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES.
- **Milestone:** WP2 (Phase 1, Probe — Claude Code under host-driven PTY byte-injection) complete.
- **Feature shipped:** WP2 follow-up probe — corrected the WP7 design constraint after observing CC's TUI live: raw-mode means `\n` (LF) is a literal character and `\r` (CR) is the Enter key. Every slash-command byte-injection MUST end in `\r`. `/exit\r` is a cleaner one-byte-sequence shutdown than the original Ctrl+D x2 path. Backlog SURFACE entry superseded by SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF.
- **Feature shipped:** WP3 — Sublime Text / Sublime Merge CLI shapes probe documented the (project-state × user-intent) → command matrix and the WP8 hand-off contract; key findings include that the `.app`-bundle path (`/Applications/<App>.app/Contents/SharedSupport/bin/<tool>`) is the _default_ discovery state on the canonical dev machine (neither tool symlinked to PATH) and that both `subl` and `smerge` ship a native `-b/--background` flag, so WP8 needs no `open -a -g` quirk; also captured a project-scope feedback memory making Sublime Text activation consent-gated after probe `osascript activate` calls yanked live ST windows across macOS Spaces (Sublime Merge exempt).
- **Milestone:** WP3 (Phase 1, Probe — Sublime Text / Sublime Merge CLI shapes across project styles) complete.
