# Backlog

## SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF
- **Source:** feature:build (WP2 probe — original surface SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES, superseded after a 2026-06-16 follow-up observable probe)
- **Target level:** product:wbs (WP7 — PtyCcSession)
- **Type:** new-work (WP7 design constraint — load-bearing)
- **Summary:** Claude Code's TUI runs in raw mode. `\n` (LF) is treated as a literal character, NOT as Enter. **`\r` (CR, byte `0x0d`) is the Enter key.** Every slash-command byte-injection MUST end in `\r` to actually execute. Writing `/cmd\n` silently produces typed-but-not-executed bytes — autocomplete may appear but the command never runs.
- **Context:** WP2's original (b) finding claimed `/help\n` worked because the autocomplete dropdown appeared in the output. The follow-up probe showed the dropdown is a typeahead UI side-effect, NOT command execution. Comparing `/help\n` vs `/help\r` proves it: LF gives the dropdown; CR gives `/help`'s actual body (keyboard-shortcut list + doc link). Same rule for `/exit`: `/exit\n` types-but-doesn't-execute; `/exit\r` cleanly exits with code 0 in <5s.
- **Suggested action:** WP7's `CcSession::send_slash_command(cmd)` writes `format!("{cmd}\r").as_bytes()` to the PTY. Shutdown path can use either `Ctrl+D x2` (still works, the original finding) OR the cleaner `/exit\r` (one deterministic byte sequence, no race window). Reference code shapes: `src-tauri/examples/cc_pty_probe.rs::run_exit_via` with `&[b"/exit\r"]` (cleanest), or with `&[&[0x04], &[0x04]]` (control-char fallback). The harness now has both paths and the `inject` vs `inject-cr` modes demonstrate the LF/CR distinction directly.
- **Priority:** high (load-bearing for all of WP7's byte-injection paths, not just shutdown)
- **Status:** open

## SURFACE-2026-06-16-CC-EXIT-REQUIRES-TWO-KEYSTROKES (SUPERSEDED by SURFACE-2026-06-16-CC-SLASH-COMMANDS-NEED-CR-NOT-LF)
- **Status:** superseded
- **Note:** The original finding (Ctrl+D x2 required, `/exit\n` doesn't exit) was correct as far as it went, but the follow-up probe revealed the root cause (raw-mode LF vs CR) and a cleaner shutdown path (`/exit\r`). Kept here as a pointer; live finding is the entry above.

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

## Code-quality findings — wp3-sublime-cli-probe (2026-06-16)
- **Pointer:** 2 MAJOR + 4 MINOR findings from `feature-review-quality` on commit `cc72c4d`. MAJORs: stuck SURFACED leaf under a `[x]` Phase 1 parent (Work Tree invariant violation), and observation-vs-inference flattening in the invocation matrix (T8/T9/T11 inference-grade rows look identical to T7/T10 observation-grade rows). MINORs: stale state-prose drift, superscript footnote markers, stale `Unvisited:` sequence, runtimes.md timeout-formula deviation. See [`workflow/backlog-quality-findings.md`](backlog-quality-findings.md) → `# wp3-sublime-cli-probe — 2026-06-16` section.
- **Priority:** medium (MAJORs) + low (MINORs)
- **Status:** pending
- **Pickup shape:** run `/feature-refactor` against this feature when polishing probe writeups; the two MAJORs are quick wins (one delete-leaf, one column-add). To dismiss specific findings, edit the WIP's `## Code-Quality Review` section and mark `[DISMISSED]`.
