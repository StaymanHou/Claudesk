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

# paydown-2026-11-27-wp8-workspace-notices — 2026-11-27

*(feature-review-quality on ship commit `53bac5a`, window `53bac5a^..53bac5a`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 7 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-27-QUALITY-WP8-TOAST-STACK-GAPS-BLOCK-CLICKS
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** UX gap (new with the stack)
- **Summary:** `.workspace-inject-toasts` (`src/App.css`) is an absolutely positioned flex column sized to its WIDEST row. The empty area left of narrower rows, and the `gap` between rows, sits over the content beneath (usually the CC pane) and swallows clicks there while notices are showing. The old single toast had no such dead area.
- **Suggested action:** `pointer-events: none` on `.workspace-inject-toasts`, `pointer-events: auto` on `.workspace-inject-toast`. Verify live: a click in the gap reaches the pane (`document.elementFromPoint`).
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP8-OSC52-FAILURE-SINK-OPTIONAL
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** API shape
- **Summary:** `osc52.ts` → `registerOsc52` / `osc52Handler` / `macClipboardSink` take `onFailure` as OPTIONAL, and `sink` defaults to `writeMacClipboard` (no failure sink). A bare `registerOsc52(term)` brings the silent failed copy back. `XtermPane` passes the same callback twice (`registerOsc52(term, macClipboardSink(copyFailed), copyFailed)`). The same WP made `withheldNotice`'s `cause` required for this reason. Latent: the only production caller is pinned by `osc52Live`.
- **Suggested action:** make `onFailure` required and build the Mac sink inside `registerOsc52` (a test override stays possible through an options argument).
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP8-OSC52TEXT-TEST-ONLY-WRAPPER
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** dead-ish code
- **Summary:** `osc52.ts` → `osc52Text` is now a wrapper over `osc52Decode` with no production reader; only `osc52.test.ts` calls it.
- **Suggested action:** move the `osc52Text` tests onto `osc52Decode` and delete the wrapper.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP8-OPENTIMENOTICE-DUPLICATES-TOAST-TYPES
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** duplication
- **Summary:** `remoteHookWarning.ts` → `OpenTimeNotice` restates `kind: "error" | "info"` and `source?: "hook"` instead of importing `ToastKind` / `ToastSource` from `workspaceToasts.ts`, and `Workspace.tsx` spreads it straight into a `push` action.
- **Suggested action:** type it from the toast module (e.g. `Pick<Toast, "text" | "kind"> & { source?: "hook" }`).
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP8-FIRERUN-INJECT-WIDENED-TO-UNKNOWN
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** typing
- **Summary:** `autoResumeFire.ts` → `FireRun.inject` was widened to `Promise<unknown>` rather than `Promise<InjectRefusal | null>`, dropping the new typed refusal at that seam (a double may return anything).
- **Suggested action:** type it `Promise<InjectRefusal | null | void>` (the existing doubles return void) or migrate the doubles to return `null`.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP8-PROJECT-LABEL-SECOND-DERIVATION
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** duplication / doc precision
- **Summary:** `cc_session::remote::project_label`'s doc says it is "the project as its picker row names it", but the row shows the stored `display_name` (`config_store`'s `derive_display_name`), a separate derivation. Equal today; the doc asserts an equivalence nothing pins.
- **Suggested action:** read the row's stored `display_name` for the emit (or reuse `derive_display_name`), or reword the doc to "the remote path's last segment".
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP8-CLOSE-NOT-ENDED-MIRROR-WHOLE-FILE-CONTAINS
- **Source:** feature-review-quality (paydown-2026-11-27 WP8, MINOR)
- **Type:** guard precision
- **Summary:** `the_close_not_ended_event_matches_its_ts_mirror`'s new TS-side checks (`project: string;`, the `reason` union) are whole-file `contains`, not scoped to the `RemoteCloseNotEnded` declaration. They would still pass if the field moved to another interface in the file. Same pattern as the existing `projectPath` / `host` checks.
- **Suggested action:** slice the interface body (`export interface RemoteCloseNotEnded {` … `}`) and assert within it; mutation-prove by moving one field out.
- **Priority:** low

# paydown-2026-11-27-wp9-cc-session-shape — 2026-11-27

*(feature-review-quality on ship commit `ee37ae3`, window `ee37ae3^..ee37ae3`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 5 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-27-QUALITY-WP9-DRIVE-MODE-WIRE-THIRD-COPY
- **Source:** feature-review-quality (paydown-2026-11-27 WP9, MINOR)
- **Type:** duplication + inconsistent failure handling
- **Summary:** `cc_session::drive_mode_wire` is the third `DriveMode` → wire-string conversion, beside the inline `serde_json::to_string` in `cc_spawn_env` and the inline `to_value` chain in `announce` (`remote_cmd::drive_mode_of` is the inverse). They fail differently: `cc_spawn_env` logs a serialize failure (the WP8 M2.2 "say so, never drop silently" ruling), while `drive_mode_wire` returns `None` silently, which would record `Attach(Mode(m))` as "no mode".
- **Suggested action:** one `DriveMode::wire()` in `config_store` (via serde, so the set still has one copy), used by all three; keep the logging on failure. Pin it against `drive_mode_serializes_to_these_literal_strings`.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP9-ENV-DRIVE-MODE-LOOKUP-TWICE
- **Source:** feature-review-quality (paydown-2026-11-27 WP9, MINOR)
- **Type:** duplication of two values that must agree
- **Summary:** `env.iter().find(|(k, _)| k == DRIVE_MODE_ENV)` is written in `record_remote_spawn` (the mode the start records locally) and in `RemoteCcSession::spawn_cc` (the mode put on the remote command line). The record must equal what the session runs under, but only identical code ties them together.
- **Suggested action:** one `env_drive_mode(&[(String, String)]) -> Option<&str>` helper used by both; extend the record test to assert the two agree.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP9-SPAWN-PARALLEL-TARGET-MATCHES
- **Source:** feature-review-quality (paydown-2026-11-27 WP9, MINOR)
- **Type:** parallel derivation
- **Summary:** `SessionRegistry::spawn` opens with four sibling `match &target` blocks (admit, `remote_open`, `remote_transcript`, `remote_handle`) before the dispatch match. `RemoteExit` is also built from `RemoteSpawn` fields in two places (`SessionRegistry::spawn` and `remote.rs`).
- **Suggested action:** one `if let SpawnTarget::Remote(r)` that yields a small struct, or a `RemoteSpawn::exit_handle()`. Re-spell the caller guards that pin these `let` lines (`a_reconnect_spawn_attaches_…`, `remote_spawn_caller_admits_first_…`) in the same change.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP9-GUARD-FAILURE-MESSAGES-DUMP-BODY
- **Source:** feature-review-quality (paydown-2026-11-27 WP9, MINOR)
- **Type:** guard precision (diagnostics)
- **Summary:** Several asserts re-spelled at WP9 in `profile_spawn_caller_orders_its_profile_decisions` and `remote_spawn_caller_admits_first_and_never_continues_from_local_transcripts` use `"{code}"` as their only message, so a red guard dumps the whole `SessionRegistry::spawn` body without naming the property that broke.
- **Suggested action:** a one-line property statement in front of each dump, as their neighbouring asserts already have.
- **Priority:** low

## SURFACE-2026-11-27-QUALITY-WP9-ARCH-SPAWNTARGET-PARENT-STALE
- **Source:** feature-review-quality (paydown-2026-11-27 WP9, MINOR)
- **Type:** doc drift
- **Summary:** `arch/remote-workspaces.md` §C: WP9's new "As built" sub-bullet sits under a parent that still reads `SpawnTarget::{Local { cwd }, Remote { target }}`, while the real shape is `Local` / `Remote(Box<RemoteSpawn>)`. A reader sees two spellings one line apart.
- **Suggested action:** correct the parent line to the as-built shape (or mark it as the design-time sketch). Doc-only.
- **Priority:** low

# paydown-2026-11-27-wp10-remote-link-lifecycle — 2026-11-27

*(feature-review-quality on ship commit `226f863`, window `226f863^..226f863`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 6 MINOR, all auto-backlogged.)*

## SURFACE-2026-11-27-QUALITY-WP10-STATUS-FUNNEL-GUARD-BLIND-SPOTS
- **Source:** feature-review-quality (paydown-2026-11-27 WP10, MINOR)
- **Location:** src-tauri/src/status_broadcaster/commands.rs: `every_status_emit_is_settled`
- **Finding:** The site count matches only `emit(STATUS_EVENT,`-shaped forms, so `emit_to(<target>, STATUS_EVENT, …)`, `emit_filter`, and UFCS `Emitter::emit(&app, STATUS_EVENT, …)` would bypass it. The "inside a settle" check is the text since the previous `;`, so `if emit_settled(…).is_err() { emit_raw(&app, u) }` passes.
- **Suggested action:** Add the `emit_to(`/`emit_filter(`/`Emitter::emit(` forms to the crate-wide count; tighten the use check to "is an argument of the `emit_settled(`/`apply_link_edge(` call" (e.g. the closure `|u|emit_raw(&app,u)` as the third argument). Mutation-prove each form alone.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-27-QUALITY-WP10-FORGET-MASTER-WINDOW-UNDOCUMENTED
- **Source:** feature-review-quality (paydown-2026-11-27 WP10, MINOR)
- **Location:** src-tauri/src/remote_link/mod.rs: `forget_master`, `run_worker`, `SshMaster::try_exit`
- **Finding:** `forget_master` runs after `try_exit` has already reaped the child (plus a 50 ms stderr sleep) and after the up-timeout `kill` reaped it, so a `halt()` in that window can still `killpg` a freed pid. The ship commit message says "as soon as a master exits", which overstates it.
- **Suggested action:** Document the residual window at `forget_master` (or publish/clear the pid inside the `Master` impl around its reap if it ever matters). No behaviour change needed.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-27-QUALITY-WP10-ORPHANED-MASTERS-DOC-SAYS-DIRECTLY-UNDER
- **Source:** feature-review-quality (paydown-2026-11-27 WP10, MINOR)
- **Location:** src-tauri/src/remote_link/mod.rs: `orphaned_masters` doc
- **Finding:** The doc says `-S` names a path "directly under `ssh_dir/`", but `cmd.contains(&needle)` accepts any depth (`ssh/sub/x`). It affects only the doc: real ControlPaths are one level deep.
- **Suggested action:** Reword to "under `ssh_dir/`", or match exactly one path component after the needle (then add a `ssh/sub/x` near-miss and mutation-prove it).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-27-QUALITY-WP10-DRAIN-LOOP-SECOND-TRY-STATE
- **Source:** feature-review-quality (paydown-2026-11-27 WP10, MINOR)
- **Location:** src-tauri/src/status_broadcaster/commands.rs: `drain_loop` emit block
- **Finding:** The emit block calls `app.try_state::<SharedRegistry>()` a second time. That branch is unreachable (the first lookup succeeded), and if it were hit it would drop the update silently, unlike the first lookup's explicit "dropping event" log.
- **Suggested action:** Lift the registry handle out of the first block and reuse it for `emit_settled`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-27-QUALITY-WP10-LINK-EDGE-EMIT-IGNORES-FAILURE
- **Source:** feature-review-quality (paydown-2026-11-27 WP10, MINOR)
- **Location:** src-tauri/src/status_broadcaster/mod.rs: `apply_link_edge`
- **Finding:** The unit-returning `emit` is wrapped to `Ok(())` and the result is `.ok()`'d, so the link-edge path never stops on a failed emit while the drain/promote/clear paths do. It is benign (a failed emit leaves the registry unchanged, so the re-read matches), but asymmetric.
- **Suggested action:** Make `apply_link_edge`'s `emit` (the `LinkEdgeSink` body) return `Result<(), String>` and pass `emit_raw` straight through.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-11-27-QUALITY-WP10-FUNNEL-GUARD-ABOVE-USE-LINES
- **Source:** feature-review-quality (paydown-2026-11-27 WP10, MINOR)
- **Location:** src-tauri/src/status_broadcaster/commands.rs: `mod tests`
- **Finding:** `every_status_emit_is_settled` sits above `use super::*;` and the module's other `use` lines (cosmetic).
- **Suggested action:** Move it below the `use` block.
- **Priority:** low
- **Status:** pending
