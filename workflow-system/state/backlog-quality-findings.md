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
- **Finding:** `SPAWN_BOUNDARIES` does not list `on_blocking_worker`, the one hop every async command now calls. *(The docs half, the five command headers and the `ASYNC_COMMANDS` reasons naming `spawn_blocking`, was resolved by paydown-2026-11-27 WP2.)*
- **Why it matters:** a grep by the documented name misses the call sites. Harmless today (async bodies are not scanned); a sync path reaching `on_blocking_worker` would be a loud false positive.
- **Suggested action:** add `on_blocking_worker` to `SPAWN_BOUNDARIES` (paydown-2026-11-27 WP4).
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

## SURFACE-2026-11-16-QUALITY-M17WP2-CWD-TRAP-TEST-WRITES-UNDER-SRC-TAURI
- **Severity:** MINOR
- **Location:** `src-tauri/src/status_broadcaster/mod.rs`: `canonical_key_passes_a_remote_key_through_even_when_a_cwd_relative_match_exists`.
- **Finding:** The test creates `ssh:/claudesk-ck-<pid>/a` under the process cwd (`src-tauri/`). The Drop guard cleans it up, but a killed run leaves debris, and a running `tauri:dev` watcher may rebuild on it.
- **Suggested action:** Add a `.gitignore` entry for `src-tauri/ssh:` plus a comment about the watcher interaction (or a cwd-scoped harness).
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

## SURFACE-2026-11-16-QUALITY-M17WP3-INJECT-REFUSAL-AS-CALLBACK
- **Severity:** MINOR
- **Location:** src/components/workspace/autoResumeFire.ts `injectCommand`; recycleSession.ts `injectRefusal`
- **Finding:** `onIpcError` grew a `reason` every new caller wants while ignoring `message`; Recycle needs an object-cell trick to turn the callback back into a value.
- **Why it matters:** Callers reconstruct a return value from a callback.
- **Suggested action:** Have `injectCommand` resolve to `string | null` (the refusal reason); simplify the three callers.
- **Priority:** low
- **Status:** pending

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
- **Suggested action:** narrow the pin to "Ended is inside the latch" (paydown-2026-11-27 WP4). *(The two docs were fixed by paydown-2026-11-27 WP2.)* The behavioural seam itself stays with `…M17WP3-RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`.
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

## SURFACE-2026-11-17-QUALITY-M17WP5-DENSE-BODY-HELPERS-TRIPLICATED
- **Source:** feature-review-quality (M17 WP5, MINOR)
- **Location:** `src-tauri/src/remote_link/commands.rs` (`dense_body`), `src-tauri/src/cc_session/mod.rs` (`fn_at` + an inline copy)
- **Finding:** Three "dense production body" helpers with different cut rules (`#[cfg(test)]` vs `#[cfg(test)]\nmod tests` vs `mod tests`; `\n}\n` vs `\n    }\n`); one cut at the wrong place during this WP and failed on the clean tree.
- **Suggested action:** one shared test helper with one cut rule, tested once.
- **Priority:** low
- **Status:** pending

# m18-wp2-fresh-account-hardening — 2026-11-18

## SURFACE-2026-11-18-QUALITY-WITHHELD-NOTICE-CAUSE-DEFAULT
- **Source:** feature-review-quality (M18 WP2, MINOR)
- **Type:** tech-debt (API shape)
- **Summary:** `autoResumeFire.ts` → `withheldNotice`'s `cause` defaults to `{ untrusted: true, bypass: false }`. Production always passes it; only one older test relies on the default, and a future caller that forgets it silently gets trust-only behaviour.
- **Suggested action:** make `cause` required and update the one test.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-SPAWN-PERMISSION-GUARD-INDENT-BOUND
- **Source:** feature-review-quality (M18 WP2, MINOR)
- **Type:** test precision (source guard)
- **Summary:** `cc_session::tests::profile_spawn_caller_orders_its_profile_decisions` checks `code.contains("                permission,\n")`, which is indentation-bound and not anchored to the `RegisteredSession {` literal. Any other struct literal in `spawn` gaining a `permission,` field at that depth would satisfy it with registration deleted.
- **Suggested action:** find the `RegisteredSession {` literal inside `spawn` first and assert `permission,` inside that span (see `docs/lessons/source-text-guards.md`).
- **Priority:** low

# m18-wp2-5-remote-copy-to-mac-clipboard — 2026-11-18

*(feature-review-quality on ship commit `e38cdc7`, window `e38cdc7^..e38cdc7`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 4 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-18-QUALITY-OSC52-FAILED-COPY-IS-SILENT
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** UX gap (silent failure)
- **Summary:** an oversize copy is dropped in `osc52Text` before it reaches Rust (so `clipboard.rs`'s "refused with an error" is unreachable from its only caller). An IPC or `pbcopy` failure goes only to `console.warn`, which is unobservable in this app. Either way the operator pastes the PREVIOUS clipboard believing it is the new selection: the "pastes as if whole" harm `clipboard.rs` says it prevents.
- **Suggested action:** surface a failed or refused copy as a workspace toast (the existing toast surface), and soften security-posture's "refused, not truncated (both sides)" to say what the operator actually sees.
- **Priority:** low

## SURFACE-2026-11-18-QUALITY-CONF-ASSERT-NO-MESSAGE
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** cosmetic (test diagnostics)
- **Summary:** in `remote_link/tests.rs` → `the_tmux_conf_lets_in_pane_osc52_through_and_is_safe_to_re_source`, the `!TMUX_CONF.contains("-ga ") && !TMUX_CONF.contains(" -a ")` assert has no failure message, unlike its siblings, which print `{TMUX_CONF}`.
- **Suggested action:** add `"{TMUX_CONF}"`.
- **Priority:** low

# m18-wp4-substrate-detection-and-funnel — 2026-11-20

*(feature-review-quality on the WP4 window `9ce4810^..d57aa15`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 7 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-20-QUALITY-HOST-STORE-LATCH-NEVER-RETRIES
- **Source:** feature-review-quality (M18 WP4, MINOR)
- **Type:** hardening
- **Summary:** `useHostSubstrate.ts` sets `started = true` before `listen` resolves and never resets it. A rejected `listen` leaves every remote host `undefined` for the session, and `absentHostNote` shows nothing for `undefined`, so the skill row silently vanishes with no note.
- **Suggested action:** reset `started` in the `catch` (retry on the next subscriber), or surface the failed state distinctly.
- **Priority:** low

## SURFACE-2026-11-20-QUALITY-WORKSPACE-THIRD-GATE-HOOK-CALL
- **Source:** feature-review-quality (M18 WP4, MINOR)
- **Type:** tech-debt
- **Summary:** `Workspace.tsx` now calls `useWorkflowFeaturesEnabled()` inline three times. Each call seeds and listens separately: one more IPC round-trip per workspace, and a brief window where the note's copy and the row's copy disagree.
- **Suggested action:** read the gate once into a binding and feed both funnel wrappers. `workflowApplicableGuard`'s binding shape already accepts it.
- **Priority:** low

## SURFACE-2026-11-20-QUALITY-SHORTHOST-CROSS-LAYER-IMPORT
- **Source:** feature-review-quality (M18 WP4, MINOR)
- **Type:** tech-debt
- **Summary:** `components/workspace/absentHostNote.ts` imports `shortHost` from `components/picker/remoteRow.ts`, a picker module with its own runtime imports. That is a layering inversion.
- **Suggested action:** move `shortHost` beside `remoteAuthority` in `state/workspaceSurfaces.ts` and import it from there in both the picker and the workspace (`autoResumeFire.ts` imports it the same way).
- **Priority:** low

# m18-wp5-remote-hosts-readout — 2026-11-20

*(feature-review-quality on the WP5 window `e3926dc^..9fd2c46`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 3 MINOR. The MAJOR and two MINORs are auto-backlogged here; the stale §R.4 drift-URL wording MINOR was resolved at WP5 finalize.)*

## SURFACE-2026-11-20-QUALITY-DRIFT-COPY-SAYS-GITHUB-FOR-ANY-ORIGIN
- **Source:** feature-review-quality (M18 WP5, MINOR)
- **Type:** cosmetic (copy)
- **Summary:** every drift string ("Checking GitHub…", "Up to date with GitHub.", "Behind GitHub…") and the group hint say "GitHub", but D1 compares against the clone's own `origin`, which can be any server.
- **Context:** a Developer clone whose origin is not GitHub gets a verdict naming the wrong server. Polish: today's real hosts all clone from GitHub.
- **Suggested action:** say "its origin" (or name the origin's host) when the origin is not GitHub, or accept as-is and record that the copy assumes the published repo.
- **Priority:** low

# m18-wp7-remote-update-uninstall — 2026-11-20

*(feature-review-quality on the WP7 window `a33f7ba^..753f5cf`; drive_mode=autopilot. 0 CRITICAL, 4 MAJOR, 7 MINOR, all auto-backlogged. WP8 resolved all but one part of one MINOR, 2026-11-20.)*

## SURFACE-2026-11-20-QUALITY-INSTALL-ERA-NAMES-SERVE-ALL-OPS
- **Source:** feature-review-quality (M18 WP7, MINOR)
- **Type:** naming
- **Summary (remaining open work, rewritten at M18 WP8 finalize 2026-11-20):** `RemoteUninstallTarget` also feeds Update, so its name now misdescribes one of its two uses. (WP8 renamed `RemoteRunStart` / `REMOTE_RUN_DEADLINE`, dropped the `begin_remote_install` wrapper and unified the lock refusal; CHANGELOG 2026-11-20.)
- **Suggested action:** rename it (e.g. `ApprovedRemoteClone`) together with the `E0451` compile-fail test's expected type and the docs that name it (`arch/claude-substrate.md` → R.3).
- **Priority:** low

# m18-wp8-release-acceptance — 2026-11-20

*(feature-review-quality on the WP8 window `22bcec6^..b015868`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 4 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-20-QUALITY-CONSENT-REFUSAL-NAMES-AN-UNCHANGED-FOLDER
- **Source:** feature-review-quality (M18 WP8, MINOR)
- **Type:** copy (on the safety surface)
- **Summary:** `remote_ops::confirmed_matches`'s refusal reads "(it was {clone_dir}, now {approved.clone_dir()})". When only the record changed (the case its test drives), it prints the same folder twice and shows a "change" the operator cannot see.
- **Suggested action:** name the folder pair only when the folders differ; otherwise say the install record changed. Pin both wordings in `an_uninstall_proceeds_only_on_the_approval_the_operator_confirmed`.
- **Priority:** low

## SURFACE-2026-11-20-QUALITY-GITCLEAN-MISSES-THE-COMMAND-FORM
- **Source:** feature-review-quality (M18 WP8, MINOR)
- **Type:** gap (guard coverage)
- **Summary:** `Deletion::GitClean` matches only the shell spelling. `Command::new("git").args(["clean", …])` and the `GIT_BIN, vec!["clean".to_string(), …]` style this module uses to call git (`runner.rs`) count as zero, unlike `RmProgram`, which was added for exactly the Rust `Command` form.
- **Suggested action:** add a `"clean"`-as-an-argument form scoped to a git invocation (or a quoted `"clean"` next to `GIT_BIN` / `"git"`), with one-spelling meta-tests and a near-miss.
- **Priority:** low

## SURFACE-2026-11-20-QUALITY-CFG-TEST-FENCE-HAND-COPIED
- **Source:** feature-review-quality (M18 WP8, MINOR)
- **Type:** tech-debt (duplication)
- **Summary:** the syn `#[cfg(test)]` item detector now exists twice (`source_guard::tests::is_cfg_test` and the `is_test` closure in `remote_ops_tests::the_deleting_builders_take_only_an_approved_target`), each with its own `Item`-variant → attrs match covering DIFFERENT variants; a third copy lives in `tests/sync_commands_do_not_block.rs`.
- **Suggested action:** one `pub(crate)` test helper in `source_guard` (`fn item_attrs(&syn::Item) -> &[Attribute]` + `is_cfg_test`) covering every variant, used by all three.
- **Priority:** low

## SURFACE-2026-11-20-QUALITY-RUN-PANEL-LISTENER-COUNT-HARDCODED
- **Source:** feature-review-quality (M18 WP8, MINOR)
- **Type:** tech-debt (implicit coupling)
- **Summary:** `RemoteRunPanel`'s `const listening = subscribed >= 3;` hard-codes the number of `useTauriListen` calls. A fourth listener would let the run-state query fire after only three subscribe, bringing back the race WP8 P1.2 closed.
- **Suggested action:** name the count beside the three listen calls (e.g. `const LISTENERS = 3`) with a comment tying them, or count the registrations.
- **Priority:** low

# picker-qol-focus-and-scroll — 2026-11-27

*(feature-review-quality on ship commit `8c019bf`, window `8c019bf^..8c019bf`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 3 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-27-QUALITY-PICKER-DISMISS-RESTORES-FOCUS-TO-A-BACKGROUND-WORKSPACE
- **Source:** feature-review-quality (picker-qol-focus-and-scroll, MAJOR)
- **Type:** bug (input misrouting, narrow trigger)
- **Summary:** `PickerOverlay`'s `restoreFocus` returns focus to whatever had it when the overlay opened, without checking that the element is still in the CENTER-STAGE workspace. The ⌘⇧digit switch handler in `App` does not check `showPicker`, so "+" from workspace A, ⌘⇧2 to B, then Esc refocuses A's xterm helper textarea. Background workspaces are parked off-viewport (`.workspace` `left: -99999px`), not `display: none`, so that textarea is still focusable and passes the `isConnected` guard. The next keystrokes (Enter included) go to a hidden yolo-mode CC session.
- **Context:** Reviewer's reading of the code; not yet reproduced live. Before this feature the overlay never took focus, so A's pane kept it across the switch and the same misrouting already existed (keys typed into the overlay went to A). The feature narrowed the window to "switch while the overlay is open", but did not close it.
- **Suggested action:** reproduce first in the dev app via the bridge (seed two workspaces, focus A's pane, "+", ⌘⇧2 via the real handler, Esc, read `activeElement`). Then either skip a restore target outside the focused workspace (`el.closest('.workspace')` vs the focused one) or gate the ⌘⇧digit switch while the picker overlay is open. Pin with a `pickerFocusWiring` case through the real `App`.
- **Priority:** medium

