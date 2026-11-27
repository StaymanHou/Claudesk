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

# m18-wp2-fresh-account-hardening — 2026-11-18

## SURFACE-2026-11-18-QUALITY-WITHHELD-NOTICE-CAUSE-DEFAULT
- **Source:** feature-review-quality (M18 WP2, MINOR)
- **Type:** tech-debt (API shape)
- **Summary:** `autoResumeFire.ts` → `withheldNotice`'s `cause` defaults to `{ untrusted: true, bypass: false }`. Production always passes it; only one older test relies on the default, and a future caller that forgets it silently gets trust-only behaviour.
- **Suggested action:** make `cause` required and update the one test.
- **Priority:** low

# m18-wp2-5-remote-copy-to-mac-clipboard — 2026-11-18

*(feature-review-quality on ship commit `e38cdc7`, window `e38cdc7^..e38cdc7`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 4 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-18-QUALITY-OSC52-FAILED-COPY-IS-SILENT
- **Source:** feature-review-quality (M18 WP2.5, MINOR)
- **Type:** UX gap (silent failure)
- **Summary:** an oversize copy is dropped in `osc52Text` before it reaches Rust (so `clipboard.rs`'s "refused with an error" is unreachable from its only caller). An IPC or `pbcopy` failure goes only to `console.warn`, which is unobservable in this app. Either way the operator pastes the PREVIOUS clipboard believing it is the new selection: the "pastes as if whole" harm `clipboard.rs` says it prevents.
- **Suggested action:** surface a failed or refused copy as a workspace toast (the existing toast surface), and soften security-posture's "refused, not truncated (both sides)" to say what the operator actually sees.
- **Priority:** low

# paydown-2026-11-27-wp5-input-and-listeners — 2026-11-27

*(feature-review-quality on ship commit `bc161e8`, window `bc161e8^..bc161e8`; drive_mode=autopilot. 0 CRITICAL, 2 MAJOR, 5 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-27-QUALITY-RESTOREFOCUS-FALLBACK-USES-TEST-HOOK-SELECTOR
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MAJOR)
- **Type:** tech-debt (guard + seam)
- **Summary:** `PickerOverlay.tsx` → `restoreFocus`'s fallback selects `.workspace[data-visible="true"] [data-testid="xterm-pane"] .xterm-helper-textarea`: a test hook (`XtermPane`'s default `testId`) plus an xterm-internal class, beside the existing `ccPaneRef.current?.focus()` path `Workspace` uses on its visible edge. Both new tests (`pickerFocusLive` unit case, `pickerFocusWiring` App case) hand-build that DOM, so an explicit CC-pane `testId` or an xterm class rename would silently strand focus on `<body>` again with both tests green.
- **Suggested action:** route the fallback through the existing handle (e.g. a center-stage "focus the CC pane" callback App or the workspace store can call), or at least a dedicated non-test attribute on the CC pane; add a test that mounts the real `XtermPane` under jsdom (`[[real-xtermpane-mounts-under-jsdom]]`) so the selector's assumption is checked against the real component.
- **Priority:** medium

## SURFACE-2026-11-27-QUALITY-STRICTMODE-TEST-FAKES-A-SYNC-THROW-NOT-THE-REAL-REJECTION
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MAJOR)
- **Type:** test precision (guard reports green on the wrong shape)
- **Summary:** `useTauriListenStrictMode.test.tsx`'s fake unlisten throws synchronously, but Tauri's real unlisten is `async () => _unlisten(…)`, so the live failure is a rejected promise, handled in `useTauriListen.ts` → `safeUnlisten` by the `r instanceof Promise` branch the test never reaches. Deleting that branch leaves the test green while the live `unhandledrejection` returns. The test header's "reproduces exactly that" is wrong about the mechanism.
- **Suggested action:** make the fake async (resolve to `async () => { throw … }`) or run both shapes; mutation-prove by deleting the `.catch` branch (the async case must fail on the `rejections` assertion). Correct the header.
- **Priority:** medium

## SURFACE-2026-11-27-QUALITY-WORKSPACE-REDUNDANT-WORKFLOW-DERIVATION
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MINOR)
- **Summary:** `Workspace.tsx` → `workflowFeaturesEnabled` is now the same `isWorkflowApplicable(workflowGate, workspaceProfile, workspaceHost)` as `workflowEnabled`; the comment above `workspaceProfile` still mentions "the second hook call further down".
- **Suggested action:** one name, and fix the stale comment.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-HOST-STORE-RETRY-NEEDS-A-LATER-SUBSCRIBER
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MINOR)
- **Summary:** `useHostSubstrate.ts` → `ensureStarted`: after a failed listen the retry happens on the next `subscribe`; the mounted workspace that hit the failure keeps reading closed until something else subscribes. The comment reads as if that workspace is covered.
- **Suggested action:** state the dependence in the comment, or retry the listen once on a short timer.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-LISTENER-COUNT-REGEX-MISSES-INFERRED-CALLS
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MINOR)
- **Summary:** `remoteRunPanelListenerCount.test.ts` counts `\buseTauriListen\s*<`, so a `useTauriListen("evt", …)` with an inferred type would not count; `RUN_LISTENERS` is declared inside the component body.
- **Suggested action:** `\buseTauriListen\s*[<(]` plus a one-spelling near-miss; hoist the constant to module scope.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP5-DOC-LINES-PAST-WRAP-WIDTH
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MINOR)
- **Summary:** the edited first lines of `workspaceSurfaces.ts` → `shortHost`'s doc and `workflowApplicableGuard.test.ts` → `checkCall`'s doc run past the wrap width.
- **Suggested action:** rewrap by hand.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-DRIFT-COPY-UNEVEN-ORIGIN-WORDING
- **Source:** feature-review-quality (paydown-2026-11-27 WP5, MINOR)
- **Summary:** `RemoteHostsSettings.tsx` → `driftLine` mixes "the clone's origin", "its origin" and "origin" in one readout.
- **Suggested action:** pick one wording (the operator approved "origin" at WP5 verify-human; keep the decision, even the phrasing).
- **Priority:** low

# hook-listener-read-timeout — 2026-11-27

*(feature-review-quality on ship commit `e96e3b4`, window `e96e3b4^..e96e3b4`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 5 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-27-QUALITY-HOOK-LISTENER-STALLS-STILL-ADD-UP
- **Source:** feature-review-quality (hook-listener-read-timeout, MAJOR)
- **Type:** gap (residual risk + open root cause)
- **Summary:** The 2 s idle read timeout (`hook_socket::HOOK_READ_TIMEOUT`) caps ONE stalled connection, but two shapes of the same failure remain. (1) The timeout is per read, so a client that sends a byte at least every 2 s holds the serial loop with no limit. (2) Stalls add up: if the single `ssh -R` link carrying every remote hook goes bad, each forwarded event costs every session 2 s, and at more than one remote event per 2 s the 128-connection listen backlog fills again (`HOOK write-failed`). The root cause of the 2026-11-27 incident is still open: the stuck client was most likely a forwarded channel, and why it delivered its line and never closed is unknown.
- **Suggested action:** on the next stall, read the `HOOKSOCK read-timeout` lines (`peer=ssh` + `lines=1` confirms the forwarded-channel hypothesis) and find why the forward does not close. Then consider a total per-connection cap (a hook writes one line; e.g. 5 s wall-clock from accept), and decide whether remote-forwarded connections need their own lane (ordering is per session, so a per-session ordered handoff would keep the order guarantee).
- **Priority:** medium

## SURFACE-2026-11-27-QUALITY-PEER-TRY-CLONE-ON-EVERY-CONNECTION
- **Source:** feature-review-quality (hook-listener-read-timeout, MINOR)
- **Type:** tech-debt (doc overclaim)
- **Summary:** `accept_loop` calls `stream.try_clone()` on every accepted connection (an fd dup + close) although the peer is only needed on timeout, which contradicts `peer_info`'s "the hot path pays nothing".
- **Suggested action:** keep the `BufReader`, loop on `read_line`, and use `reader.get_ref()` at timeout.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-EINVAL-CALL-SITE-UNPINNED
- **Source:** feature-review-quality (hook-listener-read-timeout, MINOR)
- **Type:** test precision (machine pinned, caller not)
- **Summary:** The EINVAL test pins the `peer_already_closed` classifier, but deleting the `!peer_already_closed(&e)` check in `accept_loop` passes every test and brings back one stderr line per local hook event.
- **Suggested action:** extract the per-connection timeout setup into a function that returns whether to warn, and test that function, or accept the gap (stderr noise only).
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-THIRD-NOW-MS-HELPER
- **Source:** feature-review-quality (hook-listener-read-timeout, MINOR)
- **Type:** tech-debt (duplication)
- **Summary:** `status_log::now_ms` is a third copy beside `time_store::now_ms` (same clamp-to-0 contract, already `pub`) and `config_store::now_ms` (different fallback).
- **Suggested action:** reuse `time_store::now_ms`, or note why `status_log` keeps its own (a leaf module that should not depend on `time_store`).
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-STATUS-LOG-WRITER-LIST-STALE
- **Source:** feature-review-quality (hook-listener-read-timeout, MINOR)
- **Type:** doc drift
- **Summary:** The `status_log` module doc's "Concurrency-safe" bullet names the drain thread + register/deregister commands as the writers; the hook-listener thread is now a third.
- **Suggested action:** add the listener thread to that bullet.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-HOOKSOCK-LINES-COUNTS-GARBAGE
- **Source:** feature-review-quality (hook-listener-read-timeout, MINOR)
- **Type:** doc/semantics mismatch
- **Summary:** The `lines=` field of `HOOKSOCK read-timeout` counts every non-empty line, including ones that fail `parse_line`; the format doc calls them lines the connection "had already delivered".
- **Suggested action:** rename to "received" in the doc, or count only parsed lines.
- **Priority:** low

# paydown-2026-11-27-wp6-rust-small-correctness — 2026-11-27

*(feature-review-quality on ship commit `7f14181`, window `d26df84..7f14181`; drive_mode=autopilot. 0 CRITICAL, 1 MAJOR, 3 MINOR, all auto-backlogged; the MAJOR (§H doc drift) was resolved at this feature's finalize.)*

## SURFACE-2026-11-27-QUALITY-WP6-REMOTE-READ-ASSERT-WEAKER-THAN-ITS-COMMENT
- **Source:** feature-review-quality (paydown-2026-11-27 WP6, MINOR)
- **Type:** guard precision
- **Summary:** `remote_fs`'s `const _: () = assert!(REMOTE_READ_MAX_BYTES < CAPTURED_PIPE_MAX as u64)` says a read at the limit *plus its answer framing* must fit one exec's stdout, but it passes at 4 MiB − 1, where the `read:ok:<len>` line would overflow. Safe today (1 MiB headroom).
- **Suggested action:** assert with an explicit framing margin, or reword the comment to "strictly below".
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP6-CHECKRESULT-NAME-DOC-OMITS-ZSH-127
- **Source:** feature-review-quality (paydown-2026-11-27 WP6, MINOR)
- **Type:** doc precision
- **Summary:** `remote_cmd::preflight::CheckResult.name`'s doc says a check-script transport failure is named `script`, without the exception that a zsh exit 127 stays `tools` (pinned by `a_missing_zsh_is_named`).
- **Suggested action:** add the one clause.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP6-RENAME-LEFT-LONG-DOC-LINES
- **Source:** feature-review-quality (paydown-2026-11-27 WP6, MINOR)
- **Type:** style
- **Summary:** `subprocess::CAPTURED_PIPE_MAX`'s doc reads "an [`RunError::OutputTooLarge`]" (should be "a"), and the mechanical `MAX_OUTPUT` → `CAPTURED_PIPE_MAX` rename left over-long doc lines in `adjudicator/mod.rs`, `subprocess/captured.rs` (two), `remote_fs/mod.rs` and `remote_cmd/mod.rs` (rustfmt does not wrap comments).
- **Suggested action:** fix the article and rewrap those doc lines.
- **Priority:** low
