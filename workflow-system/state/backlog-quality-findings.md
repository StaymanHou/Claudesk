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
- **Update 2026-11-17 (M17 WP5 review):** WP5 added ~23 more comment lines citing WIP node labels (`P4.verify-self.1`, `P2 re-verify #4, survivor 1`, `F9b`, `P4.2`) across `cc_session/mod.rs` tests, `remote.rs`, `remote_link/commands.rs`.

# m17-wp4-status-over-the-link — 2026-11-16


## SURFACE-2026-11-16-QUALITY-M17WP4-REALPATH-ALIAS-NEVER-CLEARED
- **Source:** feature-review-quality (M17 WP4, MINOR)
- **Location:** src-tauri/src/status_broadcaster/mod.rs: `remote_realpaths`, `set_remote_realpath`
- **Finding:** The alias map is never cleared. A later spawn whose realpath equals the stored path (the symlink was removed) or whose exec fails keeps the old alias, still routing events from the old physical folder.
- **Suggested action:** remove the entry when the realpath resolves to the stored path (or the resolve fails), and on deregister.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP4-HOOK-WARNING-SHARES-INJECT-TOAST
- **Source:** feature-review-quality (M17 WP4, MINOR)
- **Location:** src/components/workspace/Workspace.tsx: `onSessionId` → `readRemoteHookWarning` → `setInjectFailure`
- **Finding:** The hook-install warning reuses the inject-failure toast state and is re-read after every respawn (Recycle, drive-mode apply-now).
- **Suggested action:** a separate notice slot (or a "shown once per link connect" latch) for the warning.
- **Priority:** low
- **Status:** pending
- **Update 2026-11-17 (M17 WP5 review):** WP5 added three more writers to the same slot (the open notice, the withheld-restore notice, a failed-Detach notice): five sources, last writer wins (a start notice can be overwritten ~1.5 s later by the withheld notice). Worse, not new.

## SURFACE-2026-11-16-QUALITY-M17WP4-STALE-OVERLAY-EMIT-RACE
- **Source:** feature-review-quality (M17 WP4, MINOR)
- **Location:** src-tauri/src/status_broadcaster: `drain_step` (stamp under the lock) vs the drain's emit after release; `apply_link_edge(Attached)`
- **Finding:** A hook update stamped with the overlay can be emitted after `Attached` has already emitted Unknown, leaving a stale dimmed tile until the next hook event.
- **Suggested action:** emit under a per-workspace sequence (drop an update older than the last emitted), or re-stamp at emit time.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-16-QUALITY-M17WP4-BRITTLE-PIN-AND-STALE-DOCS
- **Source:** feature-review-quality (M17 WP4, MINOR)
- **Location:** src-tauri/src/cc_session/mod.rs: `a_remote_session_reports_its_link_edges_through_the_sink`; src-tauri/src/status_broadcaster/mod.rs: module doc ("canonicalizes both"), the `to_update` doc's inserted `time_store` sentence
- **Finding:** The test pins the whole `emit_exit` body as one whitespace-free `starts_with` string. The module doc's canonicalization claim is now true only for local scope, and one inserted doc sentence is an unwrapped run-on.
- **Suggested action:** narrow the pin to "Ended is inside the latch", fix the two docs. The behavioural seam itself stays with `…M17WP3-RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`.
- **Priority:** low
- **Status:** pending

# m17-wp5-lifecycle — 2026-11-17

## SURFACE-2026-11-17-QUALITY-M17WP5-RECONNECT-MODE-NESTED-OPTIONS
- **Source:** feature-review-quality (M17 WP5, MAJOR)
- **Location:** `cc_session/mod.rs` (`running_drive_mode`, `record_remote_spawn`), `cc_session/remote.rs` (`RemoteSpawn.{attach, running_mode}`), `remote_cmd/mod.rs` (`OpenFacts.mode`, `SpawnFacts.mode`)
- **Finding:** The reconnect's drive mode is `Option<Option<String>>` (and `Option<&Option<Option<String>>>` at two sites) with four positional meanings (start / reconnect-unknown / reconnect-spawned-with-none / reconnect-under-X), and `RemoteSpawn.attach: bool` duplicates `running_mode.is_some()`, kept in step by hand in `cc_spawn_remote`. Same shape as WP3 `…REMOTE-HOST-STORED-TWICE`; the semantics are load-bearing (A9) and a verify-self mutant on them survived (B6).
- **Suggested action:** `enum SessionMode { Unknown, None, Mode(DriveMode) }` + `enum RemoteOpen { Start, Attach(SessionMode) }`; re-spell the exact-text caller guards that pin today's shape in the same change.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-STALE-ANNOUNCE-REMOTE-COMMENT
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src-tauri/src/announce/mod.rs` (the remote branch of the announce batch)
- **Finding:** The comment "⚠️ M17 WP2 — a REMOTE row announces nothing yet … No prediction is the safe direction here" sits directly above the WP5 code that does announce remote rows.
- **Suggested action:** rewrite the comment to the as-built rule (remote rows announce from the local record; a prediction the click re-decides).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-DISPLACED-DOC-BLOCKS-AND-FUNNEL-INVARIANT
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src-tauri/src/cc_session/mod.rs` (`take_detachable` inserted between `take`'s doc and `take`); `src/components/picker/ProjectPicker.tsx` (`openReconnect` / `resolveAsk` inserted between `handleOpenRecent`'s JSDoc and the function)
- **Finding:** Both doc blocks now attach to the wrong function. The orphaned `handleOpenRecent` JSDoc states "BOTH doors funnel through here", which `openReconnect` (its own `record_open` + error toast, reached by the dialogs' Reconnect without the funnel) now breaks.
- **Suggested action:** move both docs back; route the dialogs' Reconnect through the funnel (e.g. a `reconnect` door) or amend the invariant to name the reconnect door explicitly.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-CLOSE-NOT-ENDED-TOAST-CAUSE-AND-PROJECT
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src/state/remoteCloseNotEnded.ts` (`closeNotEndedText`)
- **Finding:** Always says "it isn't reachable", though `RemotePorts::close_not_ended` also fires when the end ran (link up) and failed; and the text names only the host, not the project (two such toasts for rows on one host read the same and overwrite).
- **Suggested action:** carry the reason (not delivered vs failed) and the project name in the payload; word the toast from them.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-UNKNOWN-SESSION-TEXT-COUPLING
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src/state/detachWorkspace.ts` (`NO_SUCH_SESSION`)
- **Finding:** "Already gone → safe to close" is a substring match on Rust's `CcError::UnknownSession` Display text, with no shared constant or wire test; rewording the Rust error turns a benign case into a kept tile + error toast.
- **Suggested action:** a typed error code on the wire, or a Rust↔TS mirror test like `the_close_not_ended_event_matches_its_ts_mirror`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-DRIVE-MODES-SECOND-COPY
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src-tauri/src/remote_cmd/mod.rs` (`DRIVE_MODES`)
- **Finding:** A second hand-kept copy of the closed drive-mode set `config_store::DriveMode` already defines; drift would make a valid mode read as "unknown" on a reconnect.
- **Suggested action:** derive from `DriveMode` (or test the two sets equal).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-SESSION-EXISTS-RECORD-COMMENT
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src-tauri/src/cc_session/remote.rs` (`InnerExit::SessionExists` arm); `remote_cmd/mod.rs` (`tmux_new_command`)
- **Finding:** The arm's comment says "the live session (and its record) are untouched", but `record_remote_spawn` already wrote `running` when the local ssh started, so the next open silently reconnects to a session Claudesk did not start; the sibling race (tmux's own `duplicate session`, exit 1) records `Ended` and asks via dialog B. Narrow window.
- **Suggested action:** correct the comment (or, if A8 should cover it, record `Ended` on `SessionExists` too so the next open asks).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-17-QUALITY-M17WP5-DENSE-BODY-HELPERS-TRIPLICATED
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src-tauri/src/remote_link/commands.rs` (`dense_body`), `src-tauri/src/cc_session/mod.rs` (`fn_at` + an inline copy)
- **Finding:** Three "dense production body" helpers with different cut rules (`#[cfg(test)]` vs `#[cfg(test)]\nmod tests` vs `mod tests`; `\n}\n` vs `\n    }\n`); one cut at the wrong place during this WP and failed on the clean tree.
- **Suggested action:** one shared test helper with one cut rule, tested once.
- **Priority:** low
- **Status:** pending

# m18-wp1-remote-recycle-respawn — 2026-11-18

## SURFACE-2026-11-18-QUALITY-XTERMPANE-LIFECYCLE-FLAG-BLOCK-STALE-COUNT
- **Source:** feature-review-quality (M18 WP1, MINOR)
- **Type:** tech-debt (comment)
- **Summary:** In `XtermPane.tsx`, the lifecycle-flag warning block still says "THIS PANE NOW HAS THREE LIFECYCLE FLAGS" but now lists four (`cancelled`, `hasSpawnedRef`, `doorUsedRef`, `hasFiredRef`). The new `doorUsedRef` bullet says "declared below" when it is declared above (beside `hasSpawnedRef`), and that declaration has no comment of its own, unlike its neighbours.
- **Suggested action:** fix the count and the pointer, and add a one-line comment on the `doorUsedRef` declaration. The block is the "read before simplifying" warning, so its accuracy matters.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-RELAUNCH-LIVE-TEST-ASSERTS-NOT-EQUAL
- **Source:** feature-review-quality (M18 WP1, MINOR)
- **Type:** test precision
- **Summary:** `remoteRelaunchIntentLive.test.tsx` asserts `intents[1]).not.toBe("reconnect")` while its Fire control asserts `toEqual(["fire", "fire"])`. A mutant mapping `reconnect` → `no-fire` (which would skip the unclean-flag resume) passes the test on the real pane. The unit test pins `fire`, so the hole is small.
- **Suggested action:** assert `toEqual(["reconnect", "fire"])`.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-LIVE-PANE-XTERM-MOCKS-DUPLICATED
- **Source:** feature-review-quality (M18 WP1, MINOR)
- **Type:** tech-debt (test scaffolding)
- **Summary:** The `@xterm/*` mocks and the ResizeObserver / rAF shims are now copied verbatim in two live-pane tests (`autoResumeFireLive.test.tsx`, `remoteRelaunchIntentLive.test.tsx`). A change to the Terminal surface `XtermPane` uses then has to be made in N places.
- **Suggested action:** move the mock factories into `liveWorkspace.tsx`, beside `bootIpc`. `vi.mock` hoisting limits how they can be shared: factories can be imported, the `vi.mock` calls stay per file.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-STUB-RELAUNCH-ASSUMES-COMMITTED-FIRST-SPAWN
- **Source:** feature-review-quality (M18 WP1, MINOR)
- **Type:** tech-debt (comment)
- **Summary:** The `liveWorkspace.tsx` stub's `relaunch()` always passes `isRelaunch = true`, which assumes the pane's first spawn already committed. That is right for every current consumer, but nothing says so. A stub test that relaunches after a "failed" first spawn would get `fire` where the real pane sends `reconnect`.
- **Suggested action:** add a one-line comment stating the assumption.
- **Priority:** low

# m18-wp2-fresh-account-hardening — 2026-11-18

## SURFACE-2026-11-18-QUALITY-REMOTE-BYPASS-ANSWER-STALE-ACROSS-RECYCLE
- **Source:** feature-review-quality (M18 WP2, MAJOR)
- **Type:** gap (stale cached state)
- **Summary:** For a remote row, `bypass_prompt::commands::remote_cleared` answers from `LinkRegistry::open_bypass`, which only the open check writes, and Recycle runs no open check. On a fresh remote account the first open withholds `/session-restore` and tells the operator to accept the warning. Accepting writes the key on the host, but the cached `false` remains, so every later Recycle of that workspace withholds the restore and shows a now-false "is showing its Bypass Permissions warning" toast until the workspace is closed and reopened.
- **Suggested action:** refresh the remote bypass answer for a Recycle respawn (one small exec reading the `BYPASS_ACCEPTED` fragment over the link, through `settle`-style single writer), or treat the cached remote answer as stale on Recycle and word the toast as a possibility. Fails safe today (one typed command), never a lost session.
- **Priority:** medium

## SURFACE-2026-11-18-QUALITY-TOKEN-FIX-HINT-ASSUMES-CLAUDE-ON-NONLOGIN-PATH
- **Source:** feature-review-quality (M18 WP2, MAJOR)
- **Type:** bug (copy / dead-end hint)
- **Summary:** `remote_cmd::preflight::token_fix` still tells the operator to run `ssh -t <host> claude setup-token`. `ssh host cmd` runs a non-login, non-interactive shell, so on exactly the account shape WP2 hardens (`claude` only in `~/.local/bin`, PATH line only in `~/.zshrc`) the tools check now passes via the fallback, the token check fails, and the suggested fix fails with "command not found".
- **Suggested action:** suggest `ssh -t <host> ~/.local/bin/claude setup-token` when that is where `claude` lives (the preflight could report which path `command -v claude` resolved to), or wrap the hint in the same `CLAUDE_PATH_FALLBACK` (`ssh -t <host> 'zsh -lc "…; claude setup-token"'`).
- **Priority:** medium

## SURFACE-2026-11-18-QUALITY-WITHHELD-NOTICE-CAUSE-DEFAULT
- **Source:** feature-review-quality (M18 WP2, MINOR)
- **Type:** tech-debt (API shape)
- **Summary:** `autoResumeFire.ts` → `withheldNotice`'s `cause` defaults to `{ untrusted: true, bypass: false }`. Production always passes it; only one older test relies on the default, and a future caller that forgets it silently gets trust-only behaviour.
- **Suggested action:** make `cause` required and update the one test.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-RECYCLE-BYPASS-REASON-OVERCLAIMS
- **Source:** feature-review-quality (M18 WP2, MINOR)
- **Type:** copy
- **Summary:** `recycleSession.ts` → `RESTORE_WITHHELD_FOR_BYPASS` says the warning "is showing", but the value is a prediction from settings plus the recorded spawn mode, not read off the screen (and false in the stale-remote case above).
- **Suggested action:** "has not been accepted" (matches the auto-resume notice) instead of "is showing". Pairs with the stale-answer fix above.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-SPAWN-PERMISSION-GUARD-INDENT-BOUND
- **Source:** feature-review-quality (M18 WP2, MINOR)
- **Type:** test precision (source guard)
- **Summary:** `cc_session::tests::profile_spawn_caller_orders_its_profile_decisions` checks `code.contains("                permission,\n")`, which is indentation-bound and not anchored to the `RegisteredSession {` literal. Any other struct literal in `spawn` gaining a `permission,` field at that depth would satisfy it with registration deleted.
- **Suggested action:** find the `RegisteredSession {` literal inside `spawn` first and assert `permission,` inside that span (see `docs/lessons/source-text-guards.md`).
- **Priority:** low

# m18-wp2-5-remote-copy-to-mac-clipboard — 2026-11-18

*(feature-review-quality on ship commit `e38cdc7`, window `e38cdc7^..e38cdc7`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 4 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-18-QUALITY-OSC52-PASTEJACK-VECTOR-UNRECORDED
- **Source:** feature-review-quality (M18 WP2.5, MAJOR)
- **Type:** gap (security reasoning)
- **Summary:** `arch/security-posture.md` → "Terminal clipboard" justifies the every-pane OSC 52 write handler (R-d, operator-ratified) with "a local program could already do this with `pbcopy`". That considers only programs. It leaves out **displayed bytes**: `cat` of a hostile file, `git log`, `curl` output, or any in-pane OSC 52 that tmux now passes through under `set-clipboard on` can silently replace the Mac clipboard without anything running `pbcopy`. That is the standard paste-jacking setup (put a command on the clipboard, wait for the operator to paste it into a terminal), and it is why several terminals gate or prompt on OSC 52 writes.
- **Context:** the ruling stands (operator, 2026-11-18, vh2 A). The defect is that the doc future readers will re-derive it from records incomplete reasoning.
- **Suggested action:** add the displayed-content vector to "Terminal clipboard" as an explicitly accepted risk. Optionally note follow-up options: a per-write toast ("Copied N chars from <workspace>"), remote-only, or a size/newline heuristic. Re-ask the operator only if the recorded risk changes their call.
- **Priority:** medium

## SURFACE-2026-11-18-QUALITY-CLIPBOARD-CAP-DUPLICATED-UNPINNED
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** tech-debt (duplicated constant)
- **Summary:** `MAX_CLIPBOARD_BYTES` (4 MiB) is defined in both `osc52.ts` and `clipboard.rs`, kept equal only by a "Mirrors" comment. No test pins the two together.
- **Suggested action:** a small test that reads both values from their sources and asserts they are equal, or drop the frontend cap and let Rust refuse (that also makes the Rust error reachable; see the next entry).
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-OSC52-FAILED-COPY-IS-SILENT
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** UX gap (silent failure)
- **Summary:** an oversize copy is dropped in `osc52Text` before it reaches Rust (so `clipboard.rs`'s "refused with an error" is unreachable from its only caller). An IPC or `pbcopy` failure goes only to `console.warn`, which is unobservable in this app. Either way the operator pastes the PREVIOUS clipboard believing it is the new selection: the "pastes as if whole" harm `clipboard.rs` says it prevents.
- **Suggested action:** surface a failed or refused copy as a workspace toast (the existing toast surface), and soften security-posture's "refused, not truncated (both sides)" to say what the operator actually sees.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-TERMINAL-FAKE-TRIPLICATED
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** tech-debt (test scaffolding)
- **Summary:** the hand-written `@xterm/xterm` `Terminal` fake now lives in 3 test files (`osc52Live`, `autoResumeFireLive`, `remoteRelaunchIntentLive`). WP2.5 had to add `parser.registerOscHandler` to two of them just to keep them mounting, and every new Terminal API `XtermPane` touches will need the same edit in every copy.
- **Suggested action:** move one configurable fake into `__tests__/liveWorkspace.tsx` and import it from all three.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-CONF-ASSERT-NO-MESSAGE
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** cosmetic (test diagnostics)
- **Summary:** in `remote_link/tests.rs` → `the_tmux_conf_lets_in_pane_osc52_through_and_is_safe_to_re_source`, the `!TMUX_CONF.contains("-ga ") && !TMUX_CONF.contains(" -a ")` assert has no failure message, unlike its siblings, which print `{TMUX_CONF}`.
- **Suggested action:** add `"{TMUX_CONF}"`.
- **Priority:** low
