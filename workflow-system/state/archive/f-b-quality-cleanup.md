---
workflow: task
state: close (complete)
completed: 2026-09-28
created: 2026-09-28
drive_mode: autopilot
docs-only: false
---

# Task: F-b code-quality cleanup (2 MAJOR + 6 MINOR)

**Workflow:** task
**State:** Completed 2026-09-28
**Created:** 2026-09-28

## Problem Statement
Close the F-b review's backlogged findings. Two are MAJOR: the transcript reader follows the STORED profile rather than the LIVE one, and profile create is missing the already-listed-dir guard. The other six are MINOR, done as one-liners.

## Context
- Finding bodies: `workflow-system/state/backlog-quality-findings.md` → `# f-b-isolated-cc-profiles — 2026-09-24` (3 SURFACE blocks). Backlog pointer: `backlog.md` → `## Code-quality findings — f-b-isolated-cc-profiles (2026-09-24)`.
- `src-tauri/src/transcript/commands.rs` — `transcript_tail`, `config_root_for_project`, `select_transcript`.
- `src-tauri/src/cc_session/{commands,mod}.rs` — `cc_session_profile` / `Registry::profile` (the LIVE profile, keyed by PTY session id).
- `src/state/supervisor/useSupervisor.ts` — `decideTurn` → `invoke("transcript_tail", …)`.
- `src-tauri/src/config_store/{profile_create,profiles,commands,mod}.rs` — `create`, `adopt`, `same_dir`, `invalid`, `profiles_invalid`, `ConfigError`.
- `src/state/{profiles,workflowApplicable}.ts` — `resolveRowProfile`, `isDefaultProfile`, `PROFILES_CHANGED_EVENT`.
- `src/components/picker/ProjectPicker.tsx` — `handleProfileCommitted`.
- `invokedCommandsAreRegistered.test.ts` — the invoke-name regex.
- Excluded: F-a's `SURFACE-2026-09-22-QUALITY-WP4-COMMENT-DUPLICATION-ACROSS-PROMPT-MODULES`. It is routed to the T1/T2 comment-convention pass.

## Work Tree

- [x] T1 MAJOR 2: `profile_create::create` refuses an already-listed DIRECTORY. Make `profiles::same_dir` `pub(crate)`. Pre-check against `listed` before any write, and re-check inside the `update_profiles` closure. Test: an adopted EMPTY dir → create refused, the dir untouched (no seeded files, still listed once, still `Adopted`). Mutation-prove the pre-check and the closure check individually.
- [x] T2 MAJOR 1: `transcript_tail` resolves its root from the LIVE session's profile. Add a `pty_session_id: Option<String>` param and read `Registry::profile` when that id is registered. Fall back to the stored row only when no live session is known. Extract the stored-vs-live choice as a pure fn so it can be unit-tested (live wins; unknown session → stored). Frontend: `decideTurn` passes `ptySessionId`. Correct the doc comment ("safe because the supervisor is off…").
- [x] T3 (discovery fold-in) `decideTurn` passes the hook's CC session id, not the PTY id, as `transcript_tail`'s `sessionId`, so the named-session lookup can match. Test: `readTail`/invoke receives the event's `session_id`; `null` stays `null`.
- [x] T4 MINOR batch: (1) move the drive-mode comment in `ProjectPicker` back onto its handler; (2) `PROFILES_CHANGED_EVENT` docs (TS + Rust) also name create/delete; (3) add a `ConfigError::Invalid(String)` variant with one shared `invalid()` constructor, and delete `profile_create::profiles_invalid`; (4) share the blank/`"default"` core between `resolveRowProfile` and `isDefaultProfile`, keeping `undefined` handling distinct; (5) put the `config_store/commands.rs` test-module imports first; (6) widen the invoke-name regex to handle nested generics, with a fixture assertion.
- [x] T5 `pnpm verify:auto` green.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Discoveries
- [SURFACED-2026-09-28] T3 — `decideTurn` (`useSupervisor.ts`) builds `SupervisedWorkspace.sessionId` from the **PTY** session id, which `SupervisedWorkspace`'s doc calls "the CC session id from the turn-end event". `transcript_tail` looks for `<sessionId>.jsonl`, so the named-session branch can never match, and every read has taken the newest-modified fallback since the supervisor was wired up. That makes MAJOR 1's fallback the ONLY path, not the rare one. Folded in as T3; its scope is small and on the same read path.
- Partial on MINOR 3: `create` / `delete_created` keep `Result<_, String>`. Their errors mix `register`'s `String` and formatted IO failures, and the command boundary is `String` anyway. Only the dressed-up `Io(InvalidInput)` duplication is removed.

## Act notes
- T1: each of the two listed-dir refusals is mutation-proven on its own. With the pre-check removed, the empty-dir test fails, because its `register` panics if it is reached. With the in-lock re-check removed, the race test fails, because its `register` adopts the dir mid-create.
- T2: with `live_or_stored_reference`'s live arm mutated to read the stored row, the live-session test fails.
- T3: two mutants fail the activity-funnel tests (`tailArgs` captures the invoke arguments): the PTY id restored as `sessionId`, and `ptySessionId` dropped from the invoke.
- `arch/profiles.md` → "Transcript reader follows the config root": the "Known gap" paragraph is rewritten to the as-built behavior.
- `pnpm verify:auto`: EXIT=0, 43s (frontend 3217, Rust 992 lib). The one ESLint warning (`XtermPane.tsx:932`, spread deps) predates this task and does not fail the gate.

## Verification Observable

**Observable:** In a live dev build, the real `transcript_tail` IPC command, called with the new `ptySessionId` argument, reads the NAMED session's file (not the newest-modified one) under the default root, both with an unregistered `ptySessionId` and with none. A registered live session's profile arm is covered by `live_or_stored_reference`'s unit tests; mockIPC could not see the argument-name contract.
**Verification command:** launch `pnpm tauri:dev` (with the Claude-marker `env -u` strip), then `__TAURI_INTERNALS__.invoke("transcript_tail", {projectPath: "/Users/stayman/Personal/projects/claudesk", sessionId: "5aa4c609-51e3-4f4d-872f-6274fc659a59", ptySessionId: "no-such-pty"})` via the MCP bridge. Repeat with `ptySessionId` omitted. Also a positive control with `sessionId: null`.
**Expected result:** the two named calls return `path` ending `/5aa4c609-51e3-4f4d-872f-6274fc659a59.jsonl` (the SECOND-newest file, so a named match is distinguishable from the newest-file fallback), with `lines.length > 0`. The `sessionId: null` control returns the newest file (`1d4452cc-….jsonl`), proving the two paths differ.

## Verification Result

**Status:** PASS
**Date:** 2026-09-28
**Evidence:** Live dev build (`pnpm tauri:dev`, com.claudesk.app.dev), with the real `transcript_tail` invoked over the MCP bridge:
- `{sessionId:"5aa4c609-…", ptySessionId:"no-such-pty"}` → `{"path":"/Users/stayman/.claude/projects/-Users-stayman-Personal-projects-claudesk/5aa4c609-51e3-4f4d-872f-6274fc659a59.jsonl","lines":164}`
- `{sessionId:"5aa4c609-…"}` (no `ptySessionId`) → the same path, `"lines":164`
- control `{sessionId:null, ptySessionId:"no-such-pty"}` → `{"path":"…/1d4452cc-a821-437b-8de9-97954a7f4bc0.jsonl","lines":289}` (newest-modified)
**Notes:** The command accepts the new `ptySessionId` argument, with or without it. An unregistered PTY id falls back to the stored (default) root, and a named session now selects its own file rather than the newest one. The control shows the two paths return different files. (The bridge's return channel timed out on any script that started an invoke, so results were stored on `window` and read back in a second call. The dev build was torn down by PID afterwards.)

## Retrospect
- **What changed in our understanding:** MAJOR 1 was worse than filed. The review saw a rare newest-file FALLBACK behind a stored/live profile mismatch. In fact the supervisor passed the PTY session id where CC's session id belonged, so the named-file branch could never match and the fallback was the ONLY path it had ever taken.
- **Assumptions that held:** both MAJORs were few-line fixes. The two listed-dir checks and the live/stored choice each proved mutation-killable. The MINORs really were one-liners.
- **Assumptions that were wrong:** the first empty-dir test could NOT tell the pre-check from the in-lock re-check. Either one refused, and rollback erased the difference. It took a `register` that panics if reached to make the pre-check's absence visible. The MCP bridge's return channel times out on any script that starts an invoke (even a synchronous IIFE that only calls it), so results had to be parked on `window` and read back.
- **Approach delta:** T3 (the session-id mix-up) was added at plan time from a discovery. MINOR 3 was done only in part: the `Invalid` variant plus one shared constructor landed, but the `String` returns stayed. The arch doc's "Known gap" paragraph (`arch/profiles.md`) was rewritten to the as-built behavior.

## Closure
Requester = operator — closure notice for self-record.
> **Closure notice:** F-b code-quality cleanup is complete. The supervisor's transcript read now follows the live session's profile and names CC's real session file, profile create refuses an already-listed directory, and the review MINORs are fixed bar one remainder. Verified in a live dev build against the real `transcript_tail` command, with `pnpm verify:auto` green.
