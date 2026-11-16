# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# m12-wp1-probe-flag-store-and-announce — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** gap (process)
- **Summary:** Phase 2's observable required the verdict cite `ProjectPicker.tsx:38-42` "as the precedent it **is following**." The verdict correctly *reversed* that conclusion (sibling command, not a widening) and cites the precedent as **declined**, by name rather than by line — so the literal string `ProjectPicker.tsx:38-42` appears nowhere, and a mechanical grep of the observable reports a miss on a phase marked `[x]`.
- **Context:** The reversal is the *right* outcome; the defect is that the observable was not amended when the conclusion inverted. Generalizable process point: **when a phase's finding overturns the assumption its own observable encoded, the observable must be rewritten, not silently outgrown** — otherwise a later audit reads the mismatch as an unfinished phase.
- **Suggested action:** No code change. Consider whether `feature-verify-codify` should prompt to reconcile observables that a verdict reversed. Low value alone; worth folding into a future workflow-system pass.
- **Priority:** low
- **Status:** pending — upstream (mccc) — consolidated into `HANDOFF-to-mccc-2026-09-23-paydown.md` §B.6

# paydown-2026-11-08-wp6-subprocess-primitives — 2026-11-09

*(feature-review-quality on ship commit `1ccf9c4`, window `1ccf9c4^..1ccf9c4`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 4 MINOR, all auto-backlogged. The MAJOR was resolved 2026-11-09 by task `wp6-kill-exit-drain-bound`; the 4 MINORs below remain.)*

## SURFACE-2026-11-09-QUALITY-WP6-MAX-OUTPUT-CARRIES-THREE-MEANINGS
- **Severity:** MINOR
- **Location:** `src-tauri/src/subprocess/mod.rs`, `MAX_OUTPUT`; used by `adjudicator` (per-pipe cap), `run_streaming` (combined budget) and `read_bounded_line` (per-line limit).
- **Finding:** one constant, three meanings; its doc ("the most output a runner keeps") fits none exactly, and the adjudicator's own reason ("a verdict is a few hundred bytes") was dropped in the move.
- **Why it matters:** tuning the runner's budget silently changes the adjudicator's `OutputTooLarge` threshold.
- **Suggested action:** separate named constants (or one doc that names all three uses), and restore the adjudicator's reason at its use.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-09-QUALITY-WP6-TRUNCATION-NOTE-IMPLIES-ARRIVAL-ORDER
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/runner.rs`, `truncation_note`.
- **Finding:** "the last {shown} follow" reads as the last N dropped lines in arrival order; the tail is stdout's tail, then stderr's.
- **Why it matters:** a reader of the wizard output could take the stdout-then-stderr block for the real order.
- **Suggested action:** reword to e.g. "the last lines of each stream follow" (update the two tests that pin the note).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-09-QUALITY-WP6-DOCS-STILL-NAME-SPAWN-BLOCKING
- **Severity:** MINOR
- **Location:** the doc headers of `supervisor_adjudicate`, `time_analytics_query`, `trash_path`, `profile_delete`, `workflow_uninstall_dry_run`; `src-tauri/tests/sync_commands_do_not_block.rs` `ASYNC_COMMANDS` reasons and `SPAWN_BOUNDARIES`.
- **Finding:** they say "the work runs on `spawn_blocking`"; the call sites now call `on_blocking_worker`, which `SPAWN_BOUNDARIES` does not list.
- **Why it matters:** a grep by the documented name misses the call sites. Harmless today (async bodies are not scanned); a sync path reaching `on_blocking_worker` would be a loud false positive.
- **Suggested action:** name `on_blocking_worker` in those docs/reasons, and add it to `SPAWN_BOUNDARIES`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-09-QUALITY-WP6-LONG-LINE-CUT-WITHOUT-MARKER
- **Severity:** MINOR
- **Location:** `src-tauri/src/workflow_install/runner.rs`, `read_bounded_line` / `start_line_reader`.
- **Finding:** a line longer than `MAX_OUTPUT` is cut silently; the kept part has no marker, unlike the budget's note.
- **Why it matters:** rare, but a cut line reads as a complete one.
- **Suggested action:** append a short marker (e.g. ` […line cut]`) when the remainder was discarded.
- **Priority:** low
- **Status:** pending

# paydown-2026-11-08-wp5-auto-resume-folder-trust — 2026-11-09

*(feature-review-quality on ship commit `80128a4`, window `80128a4^..80128a4`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 4 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-09-QUALITY-WP5-APPLY-TRUST-REPARSES-PER-ROW
- **Severity:** MINOR
- **Location:** `src-tauri/src/announce/mod.rs`, `apply_trust` (calls `folder_trust::is_trusted` per row).
- **Finding:** `trusted` is computed for every row before the `action == ACTION_RESTORE` check, and `is_trusted` takes the raw text, so each row re-parses the whole `.claude.json` (~247 KB here) plus a `canonicalize`, continue rows included, inside a sync (main-thread) command.
- **Why it matters:** the "read once" doc covers the file read, not the parse; the cost grows with the record and the project list.
- **Suggested action:** check the action first, and parse once (e.g. an `is_trusted_in(projects: &Map, path)` that both `is_trusted` and `apply_trust` call).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-09-QUALITY-WP5-SHARED-RESOLVER-TESTS-LIVE-IN-TRANSCRIPT
- **Severity:** MINOR
- **Location:** `src-tauri/src/transcript/commands.rs` tests (the `config_root_for_project` shim); `src-tauri/src/config_store/profiles.rs` (`config_target`, `live_or_stored_reference`).
- **Finding:** the moved functions' tests stayed in one of their two consumers, behind a test-only shim named after the deleted function; `profiles.rs` has no tests of its own for them.
- **Why it matters:** the next maintainer of `profiles.rs` will not find the tests.
- **Suggested action:** move the `config_target` / `live_or_stored_reference` cases into `profiles.rs`'s tests; keep one `transcript_root` case in transcript.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-09-QUALITY-WP5-ANNOUNCEROW-HEADER-CONTRADICTS-MANUAL-ROWS
- **Severity:** MINOR (verified: the defect is real)
- **Location:** `src/components/picker/announceRow.ts` module header (the "ONE CONDITIONAL GOVERNS BOTH THE LABEL AND THE BUTTON" section and the "label and the door still appear together or not at all" line under the gate section).
- **Finding:** the WP5 edit merged two sentences onto one ~157-char line, and the heading plus the "together or not at all" claim are now false for a manual row (label shown, no door).
- **Why it matters:** a header stating a rule the code no longer follows misleads the next edit to `rowAffordances`.
- **Suggested action:** re-wrap the merged line; restate the rule as "the door appears only with an announcement, and only when the two doors differ" in both places.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-09-QUALITY-WP5-PICKERROW-COMMENT-CARRIES-REVIEW-HISTORY
- **Severity:** MINOR
- **Location:** `src/components/picker/PickerRow.tsx`, the JSX comment above the badge text.
- **Finding:** the comment records verify-human history (the rejected `⌨︎`); the WHY ("`↻` would promise a re-run") is enough on its own.
- **Why it matters:** comment budget.
- **Suggested action:** trim to the WHY.
- **Priority:** low
- **Status:** pending

# m17-wp2-remote-rows — 2026-11-16

*(feature-review-quality on ship commit `d871473`, window `5ac8819..d871473`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 7 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-16-QUALITY-M17WP2-STORE-DOES-NOT-ENFORCE-HOST-AND-PATH-VALIDATION
- **Severity:** MAJOR
- **Location:** `src-tauri/src/config_store/mod.rs`: `add_remote` / `check_remote_invariants`.
- **Finding:** The doc says the store enforces the §A invariants "so no caller can skip them", but the security-relevant checks are not among them. The store requires only a non-empty host and a path starting with `/`. `remote_cmd::validate_host` (no leading `-`, allow-listed characters) and `normalize_remote_path` (no control characters, no trailing slash) run only inside `run_preflight`, and nothing re-checks a remote row read back from a hand-edited `projects.json`.
- **Why it matters:** WP3 puts `remote.host` / `remote.path` from the STORE into the ControlMaster ssh argv and tmux `-c`. Today that depends on the WP3 author re-validating, or on the `--` that only `SshExec` passes. The store also accepts `/r/` and `/r` as two identity keys for one project.
- **Suggested action:** Call `validate_host` and the path normalization from `check_remote_invariants`, and apply them to remote rows on read (refuse or degrade the row, never fail the whole list, which is the drive-mode blast-radius rule). ⚠️ **Do this before WP3's spawn reads rows from disk (WP3 task 3.2).**
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-AUTH-CHECK-HARDCODES-TOKEN-PATH
- **Severity:** MINOR
- **Location:** `src-tauri/src/remote_cmd/mod.rs`: `AUTH_CHECK` vs `TOKEN_FILE`.
- **Finding:** `AUTH_CHECK` repeats `~/.claudesk/cc-oauth-token` literally instead of deriving it from `TOKEN_FILE`, and the only test asserts the literal, so the two can drift silently.
- **Suggested action:** `assert!(AUTH_CHECK.contains(TOKEN_FILE))`, or build the fragment with `concat!`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-PRINT-HOME-INTOLERANT-OF-RC-NOISE
- **Severity:** MINOR
- **Location:** `src-tauri/src/remote_cmd/preflight.rs`: the connect step.
- **Finding:** The connect step requires the whole stdout of `PRINT_HOME` to be one `/…` line, while the check-script parser deliberately ignores rc-file noise. A remote `.zshenv` that prints anything fails connect with "$HOME looked wrong".
- **Suggested action:** Take the last line, or wrap `$HOME` in a sentinel.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-PREFLIGHT-CHECK-NAMES-MISLABEL
- **Severity:** MINOR
- **Location:** `src-tauri/src/remote_cmd/preflight.rs`: `run_preflight` / `parse_check_lines`.
- **Finding:** A transport failure on the check-script exec is labelled `"tools"`, and "stopped early" is labelled `"auth"`, whatever step was actually reached.
- **Suggested action:** Use a `"connect"` / `"script"` name for transport failures, and name the next unreported check when the script stops early.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-REMOTE-PREFLIGHT-HAS-NO-FRONTEND-CALLER
- **Severity:** MINOR
- **Location:** `src-tauri/src/remote_cmd/commands.rs`: `remote_preflight`.
- **Finding:** The command is registered and listed in `ASYNC_COMMANDS`, but no frontend code calls it. `AddRemoteForm` shows a static "Checking…" line, although P2.4 justified the command as "the UI's progress line". Its only use so far is MCP-bridge verification.
- **Suggested action:** Wire it up for per-check progress, or document it as a deliberate diagnostic surface (or delete it).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-SSH-RUNNER-BORROWS-ADJUDICATOR-TYPES
- **Severity:** MINOR
- **Location:** `src-tauri/src/remote_cmd/preflight.rs` → `crate::adjudicator::{run_command, AdjudicateError}`.
- **Finding:** The ssh exec maps errors through a type named after an unrelated subsystem.
- **Suggested action:** Before WP3 adds more remote execs, move the hardened runner and its error type into `subprocess` under a neutral name.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-REMOTE-PATH-NOT-FULLY-NORMALIZED
- **Severity:** MINOR
- **Location:** `src-tauri/src/remote_cmd/mod.rs`: `normalize_remote_path`.
- **Finding:** Only trailing slashes are stripped. `/a//b`, `/a/./b` and `/a/x/../b` each give a different identity key for the same folder.
- **Suggested action:** Collapse `//` and `.` lexically. For `..`, resolve remotely or refuse it. Do it before rows accumulate (changing the key format later means a migration).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-CWD-TRAP-TEST-WRITES-UNDER-SRC-TAURI
- **Severity:** MINOR
- **Location:** `src-tauri/src/status_broadcaster/mod.rs`: `canonical_key_passes_a_remote_key_through_even_when_a_cwd_relative_match_exists`.
- **Finding:** The test creates `ssh:/claudesk-ck-<pid>/a` under the process cwd (`src-tauri/`). The Drop guard cleans it up, but a killed run leaves debris, and a running `tauri:dev` watcher may rebuild on it.
- **Suggested action:** Add a `.gitignore` entry for `src-tauri/ssh:` plus a comment about the watcher interaction (or a cwd-scoped harness).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP2-HISTORY-NOTES-IN-CODE-COMMENTS
- **Severity:** MINOR
- **Location:** `src-tauri/src/config_store/mod.rs` module doc ("Re-opened and re-closed by M17 WP2"); `src-tauri/src/remote_cmd/commands.rs` test comment citing `P2.verify-human.1`.
- **Finding:** Per-WP history in code comments, citing WIP-local ruling IDs that get archived.
- **Suggested action:** Trim the history note and state the rule.
- **Priority:** low
- **Status:** pending
