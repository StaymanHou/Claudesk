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

*(feature-review-quality on ship commit `d871473`, window `5ac8819..d871473`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 7 MINOR, all auto-backlogged. The MAJOR, the path-normalization and the runner MINORs were resolved by M17 WP3 (2026-11-16); the `$HOME` MINOR is partly resolved.)*

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
- **Partly resolved (2026-11-16, M17 WP3):** the LINK's pre-connect now prints `$HOME` behind `remote_link::HOME_SENTINEL` and parses the last sentinel line, so it tolerates rc noise. **Remaining:** the add-time preflight's connect step (`remote_cmd::preflight`, `PRINT_HOME`) still requires the whole stdout to be one path line.
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

# m17-wp3-remote-terminal — 2026-11-16

*(feature-review-quality on ship commit `7f96ce3`, window `7f96ce3^..7f96ce3`; drive_mode=autopilot. 0 CRITICAL, 3 MAJOR, 8 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-16-QUALITY-M17WP3-OPEN-CHECK-LEAKS-AN-UNHELD-LINK
- **Severity:** MAJOR
- **Location:** src-tauri/src/remote_link/commands.rs: `remote_open_check`, `remote_link_ensure`
- **Finding:** `remote_open_check` (and the frontend-unused `remote_link_ensure`) call `links.ensure()` without a hold, so a successful check leaves a link Up with `refs == 0`. On `FolderMissing`, an exec-level `Unreachable`, or an operator who never opens, nothing releases it: `stop_if_unheld` runs only on `ensure`'s failure path and `run_worker` never checks refs. The `ssh -M`, its remote sshd and the `-R` forward live until quit; an offline host is re-pre-connected every ≤30 s forever.
- **Why it matters:** R-1/R-2 promise a link lives exactly as long as its sessions; the missing-folder path (Remove offered, never automatic) is normal, so each such click leaks a master.
- **Suggested action:** The check takes a temporary `LinkHold` for its own duration (its drop stops an unheld link), or the worker exits when Lost with refs == 0. Remove `remote_link_ensure` or give it a hold.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-ENSURE-THEN-HOLD-IS-NOT-ATOMIC
- **Severity:** MAJOR
- **Location:** src-tauri/src/remote_link/mod.rs: `acquire` / `hold`; `cc_session/commands.rs` `cc_spawn_remote` → `RemoteCcSession::spawn`
- **Finding:** `acquire` silently no-ops when the host has no link, and `cc_spawn_remote` does `ensure` then `hold` as two unlocked steps. If the host's last other session closes in between, `stop()` removes the link and the new session's hold counts nothing; its later `Drop` `release`s whatever link exists then, which can decrement a LATER session's count to 0 and stop a master still in use (that session then fails `wait_up` and ends).
- **Why it matters:** A narrow window, but the refcount can point at the wrong link and kill a healthy workspace.
- **Suggested action:** A combined `ensure_and_hold` that starts the link if absent and increments under one `links` lock.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM
- **Severity:** MAJOR
- **Location:** src-tauri/src/cc_session/mod.rs: `RemoteShared`, `reconnect`, `on_inner_exit`
- **Finding:** `RemoteShared` hard-wires `AppHandle` for its emits, so the feature's most intricate concurrency (the `reconnect` loop's under-lock cancel, the 5-spawn-failure cap, the `attached_at` write, `on_inner_exit`'s take-then-reap) is guarded by four `include_str!` source guards plus live runs, not driven by a test.
- **Why it matters:** The repo's own lessons (`extract-for-import-when-a-raw-guard-cant-express-the-property`) say a regex encodes only the shapes it knows; `remote_link` solved the same problem with an injected `Sink`.
- **Suggested action:** Give `RemoteShared` an emitter seam (like `remote_link::Sink`) and a fake PTY spawner, drive the reconnect loop for real, and retire most of the source guards. Natural home: WP4/WP5, which extend this machinery.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-STALE-MASTER-PID-AFTER-REAP
- **Severity:** MINOR
- **Location:** src-tauri/src/remote_link/mod.rs: `run_worker` (`master_pid`)
- **Finding:** `master_pid` is cleared only at worker exit, so after `try_exit` reaped a dead master (or the up-timeout kill) a stale pid stays published through back-off + the next pre-connect; a `stop()` in that window `killpg`s it.
- **Why it matters:** A reused pid would SIGKILL an unrelated process group (unlikely).
- **Suggested action:** Clear `master_pid` when the master is reaped/killed (one line).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-REMOTE-DISPATCH-INSIDE-PTY-CONSTRUCTOR
- **Severity:** MINOR
- **Location:** src-tauri/src/cc_session/mod.rs: `PtyCcSession::spawn`
- **Finding:** `PtyCcSession::spawn` returns `Box<dyn CcSession>` and builds `RemoteCcSession` itself, so the local/remote dispatch lives inside one implementation's constructor rather than in `SessionRegistry::spawn`, which owns `SpawnTarget`.
- **Why it matters:** A reader of the `CcSession` seam must look inside the PTY type to find the remote one.
- **Suggested action:** Move the dispatch to `SessionRegistry::spawn` (mind the source guards that pin the `PtyCcSession::spawn(` call).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-REMOTE-HOST-STORED-TWICE
- **Severity:** MINOR
- **Location:** src-tauri/src/cc_session/mod.rs: `RegisteredSession`
- **Finding:** `RegisteredSession` carries both `remote_host: Option<String>` and `remote: Option<RemoteExit>` for one fact; the test-only `insert_remote` sets one without the other.
- **Why it matters:** Two fields for one fact can drift.
- **Suggested action:** Derive the host from `remote` (`remote.as_ref().map(|r| r.target.host())`).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-BLOCKING-GUARD-NAME-HEURISTIC-SHAPES-PRODUCTION
- **Severity:** MINOR
- **Location:** src-tauri/src/cc_session/mod.rs (`ExitHook`, `finish_output`); src-tauri/src/subprocess/mod.rs (`killpg`)
- **Finding:** Three production shapes exist only to dodge `sync_commands_do_not_block.rs`'s resolve-by-name heuristic.
- **Why it matters:** The guard's false positives are now shaping production code.
- **Suggested action:** A backlog item against the guard (e.g. resolve method calls by receiver type where `syn` can, or a per-call-site cut list).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-INJECT-REFUSAL-AS-CALLBACK
- **Severity:** MINOR
- **Location:** src/components/workspace/autoResumeFire.ts `injectCommand`; recycleSession.ts `injectRefusal`
- **Finding:** `onIpcError` grew a `reason` every new caller wants while ignoring `message`; Recycle needs an object-cell trick to turn the callback back into a value.
- **Why it matters:** Callers reconstruct a return value from a callback.
- **Suggested action:** Have `injectCommand` resolve to `string | null` (the refusal reason); simplify the three callers.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-WIP-LABELS-IN-PRODUCTION-COMMENTS
- **Severity:** MINOR
- **Location:** Workspace.tsx, injectFailure.ts, remote_link/*.rs, cc_session/mod.rs
- **Finding:** 42 added production-comment references to WIP node labels (`P4.verify-human.2`, `P2.verify-self.F1`–`F4`, `P4.3`, `F9b`, …); `singleAuthority.test.ts` already forbids them per module (recycleSession.ts had to be scrubbed).
- **Why it matters:** Once the WIP is archived these labels point nowhere; the decision content already carries the meaning.
- **Suggested action:** Reword to the decision content; consider widening the `singleAuthority` absent-rule to these modules.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-CC-SESSION-MODULE-SIZE
- **Severity:** MINOR
- **Location:** src-tauri/src/cc_session/mod.rs
- **Finding:** ~4,850 lines; ~450 are new remote-session lifecycle code (classifier, back-off, reconnect, `RemoteCcSession`), while `remote_link` is split `{mod,commands,tests}.rs`.
- **Why it matters:** Reviewability of the reconnect machinery on its own.
- **Suggested action:** Split to `cc_session/remote.rs` (with the source guards re-anchored).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP3-REMOTE-LINK-ENSURE-UNUSED-IPC
- **Severity:** MINOR
- **Location:** src-tauri/src/remote_link/commands.rs: `remote_link_ensure`
- **Finding:** A registered IPC command with no frontend caller (a Phase 2 bridge probe), and it has the refs-0 leak above.
- **Why it matters:** Unused IPC surface.
- **Suggested action:** Remove it (with a `tauri-command-removal-needs-invoke-sweep` check) or give it a hold until WP4 needs it.
- **Priority:** low
- **Status:** pending
