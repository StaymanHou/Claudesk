# Backlog

## SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES
- **Source:** feature:build (WP2 probe)
- **Target level:** product:wbs (WP7 — PtyCcSession)
- **Type:** new-work (WP7 design constraint)
- **Summary:** Claude Code's TUI does NOT exit on a single `Ctrl+D` (0x04) or single `Ctrl+C` (0x03). Termination requires the keystroke **twice** within ~500ms. `/exit\n` (LF-terminated) also doesn't exit.
- **Context:** WP2 probe verified that `Ctrl+D x2` and `Ctrl+C x2` both produce clean exit code 0 within 5s. Single keystrokes hang past a 5s deadline. WP7's `CcSession::shutdown()` must implement the two-keystroke pattern with a grace window before falling back to SIGTERM/kill.
- **Suggested action:** WP7's `PtyCcSession::shutdown()` sends Ctrl+D twice (~500ms apart), polls `try_wait()` for ~5s, then `child.kill()` if still alive. Reference code shape: `src-tauri/examples/cc_pty_probe.rs::run_exit_via`.
- **Priority:** high (blocks clean session lifecycle in WP7)
- **Status:** open

## Code-quality findings — wp1-tauri-scaffold (2026-06-16)
- **Pointer:** 4 MAJOR + 5 MINOR findings from `feature-review-quality` on commit `c50a785`. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp1-tauri-scaffold — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** pending
- **Pickup shape:** run `/feature-refactor` against this feature to clean up scaffold-debt; ideally before WP5's UI lands on top. To dismiss specific findings, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.

## Code-quality findings — wp2-cc-pty-probe (2026-06-16)
- **Pointer:** 4 MINOR findings from `feature-review-quality` on commit `875e161`. Polish for the kept-in-tree probe harness (shutdown duplication, reader-thread lifecycle comment, WIP state marker drift, ReaderSink enum). See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp2-cc-pty-probe — 2026-06-16` section.
- **Priority:** low (all)
- **Status:** pending
- **Pickup shape:** run `/feature-refactor` against this feature when WP7 starts using the harness as a reference. To dismiss specific findings, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.
