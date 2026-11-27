---
drive_mode: autopilot
---

# Feature: paydown-2026-11-27 WP9 — `cc_session` session shape

**Workflow:** feature
**State:** Completed 2026-11-27. Shipped as `ee37ae3` (pushed); review 0/0/5 MINOR, backlogged.
**Created:** 2026-11-27
**Source:** `workflow-system/product/backlog-paydown-wbs.md` §WP9

## Problem Statement

A remote session's open has four meanings: start, reconnect with the mode unknown, reconnect to a session spawned with no mode, and reconnect under mode X. Today they are spelled positionally as `Option<Option<String>>`, and as `Option<&Option<Option<String>>>` at two sites. A separate `RemoteSpawn.attach: bool` duplicates `running_mode.is_some()`, and `cc_spawn_remote` keeps the two in step by hand. This is QF `11-17-QUALITY-M17WP5-RECONNECT-MODE-NESTED-OPTIONS` (MAJOR). The semantics are load-bearing (M17 WP5 A9), and only an exact-text caller guard closed the B6 mutant, which swapped the recorded mode argument for `None`.

Two smaller findings sit in the same spawn path:
- `RegisteredSession` stores the host twice, as `remote_host` and as `remote.target` (QF `11-16-QUALITY-M17WP3-REMOTE-HOST-STORED-TWICE`).
- The local/remote dispatch lives inside `PtyCcSession::spawn`, which builds the `RemoteCcSession` itself. It belongs in `SessionRegistry::spawn`, which owns `SpawnTarget` (QF `11-16-QUALITY-M17WP3-REMOTE-DISPATCH-INSIDE-PTY-CONSTRUCTOR`).

This is a refactor with **no behaviour change**: what gets spawned, recorded and registered stays the same, and the frontend wire is unchanged.

**Defaults taken without asking (flag any that are wrong):**
- **W1, variant name.** The "spawned with none" variant is named `SessionMode::NoMode`, not `None` as the finding wrote it. A `None` variant reads as `Option::None` in every `match` and `use`.
- **W2, where the types live.** `SessionMode` lives in `remote_cmd`, because its parser produces it from the tmux option. `RemoteOpen` lives in `cc_session::remote`, because it replaces `RemoteSpawn.{attach, running_mode}`.
- **W3, the frontend wire stays as it is.** `OpenCheck::Reconnect { mode }` keeps its JSON exactly. It becomes `Option<DriveMode>`, whose serde renames produce the same strings, or it stays `Option<String>` if the TS-mirror test shows any difference. No frontend file changes, so the deleted-export runtime hazard (the backlog's high-priority entry) does not apply.
- **W4, the B6 hole.** It is closed by moving the env→mode lookup *into* `record_remote_spawn`: it takes `&cc_env` and the `Option<&RemoteOpen>`, and a test drives both with real values. **Residual, stated:** the call site's single `&cc_env` argument is still pinned only by the caller guard, because `SessionRegistry::spawn` needs a real `AppHandle` and has no behavioural test. Enabling `tauri/test` + `mock_app` would not reach a remote spawn either, since that needs a live link. The live open in verify-self is the behavioural proof of the call.
- **W5, one phase.** The three findings share one call path and one live check on the mini, and the work is S–M. Two phases would mean two remote live sessions for no separation gain.

## Work Tree

- [x] Phase 1: Typed remote open, one host, dispatch at the registry
  **Observable outcomes:**
  - CLI: `pnpm verify:auto` exits 0 (timeout 315000, from `runtimes.md`).
  - CLI: production text (tests and comments stripped) of `src-tauri/src/{cc_session,remote_cmd,remote_link}/` contains no `Option<Option<String>>` and no `Option<&Option<Option<String>>>`. `grep -n "attach: bool\|running_mode" src-tauri/src/cc_session/remote.rs` returns nothing.
  - CLI: `RegisteredSession` has no `remote_host` field (`grep -n "remote_host" src-tauri/src/cc_session/mod.rs` returns nothing). `remote_count` reads the host from `remote`, and the per-host cap test (`admit_remote` / `insert_remote`) passes on a fake remote session built with a `RemoteExit`-derived host.
  - CLI: the `impl PtyCcSession` block in `src-tauri/src/cc_session/mod.rs` constructs no `RemoteCcSession`, and `PtyCcSession::spawn` returns `Result<Self, CcError>`. `SessionRegistry::spawn` matches `SpawnTarget` and calls the local constructor or the remote one.
  - CLI (mutation, state-changing: edits to `src-tauri/src/` restored by `cp` + `shasum`, dev app STOPPED first). Each mutant must turn `cargo test --lib` red, with a `test result` line per run (`[[verify-the-mutation-landed]]`):
    - **M1 (B6, behavioural):** inside `record_remote_spawn`, the start arm's env lookup is replaced by `None`. A named behavioural test fails.
    - **M2:** `record_remote_spawn`'s `Attach(SessionMode::Mode(_))` arm records as `Unknown`, so it keeps the old record.
    - **M3:** `running_drive_mode` maps `Attach(NoMode)` to the resolved stored mode.
    - **M4:** `session_argv` takes the start argv for `RemoteOpen::Attach(_)`.
    - **M5:** the host derivation returns `None`, so the cap test sees 0 sessions.
    - **M6:** the reconnect arm in `cc_spawn_remote` builds `RemoteOpen::Start`. This mutant is call-site only, so the re-spelled caller guard must fail; that the guard is what kills it is recorded as the residual.
  - CLI (live, state-changing: the dev app is launched by the agent via `pnpm tauri:dev`; a TEMPORARY scratch remote row `ssh://<user>@<mini-host>/<home>/claudesk-scratch-remote` is added to the DEV `projects.json` and removed after; a scratch tmux session under the dev server on the mini; never the admin-account row, `[[remote-verify-hygiene]]`, `[[mini-remote-user-is-stayman]]`). Driven through the `tauri` MCP bridge:
    1. **Start.** Set the scratch row's drive mode to `orchestrated` and open it. The CC pane starts in the scratch folder. `cc_drive_mode` returns `orchestrated`. The local remote record (`remote_record`) reads `Running` / `orchestrated`. `tmux -L claudesk-dev show-options` on the mini shows the stored mode option as `orchestrated`.
    2. **Reconnect keeps the live mode (A9).** Detach the workspace, change the row's mode to `fsd`, then reopen. The open check returns `Reconnect`, the pane attaches to the same tmux session (the session's creation time on the mini is unchanged), and `cc_drive_mode` still returns `orchestrated`, never `fsd`. The record still reads `orchestrated`.
    3. **Recycle starts fresh.** Recycle the workspace. A new tmux session starts (a new creation time), and `cc_drive_mode` returns `fsd`.
    4. **Clean up.** Close the workspace through the UI (`filmstrip-close-*`). Afterwards no `ssh -M` for the scratch host remains that the agent started, `tmux -L claudesk-dev ls` on the mini lists no scratch session, and the dev `projects.json` row set equals the pre-check set (compare row sets, not a shasum: `[[projects-json-resorted-on-every-launch]]`).
  - CLI (live ride-along, same scratch row; a failure is reported against its OWN backlog entry and does not block WP9):
    - **RA1** `SURFACE-2026-11-16-TRAY-REMOTE-LOST-SESSION-ALARM-NOT-VERIFIED-LIVE`: drive the scratch workspace to `AwaitingInput` with the real hook script (`CLAUDESK_ORIGIN`), then end its remote tmux session. `tray_debug_state` must report `attention` while the workspace is still `awaiting_input`.
    - **RA2** `SURFACE-2026-11-27-CLOSE-NOT-ENDED-PROJECT-NOT-LIVE-CHECKED`: with the scratch workspace open, take ONLY the dev app's link master for that host down (by a PID resolved from its ControlPath), then close it with ×. The `remote-close-not-ended` toast text names `claudesk-scratch-remote` and the `unreachable` cause.
  **Alignment questions:**
  - none. This is a behaviour-preserving refactor: every check above has a mechanical expected result, and RA1/RA2's expected text is already fixed by their backlog entries.
  **Build evidence (2026-11-27):**
  - `cargo test --lib`: 1537 passed, 0 failed. `cargo fmt --check` and `cargo clippy --all-targets -D warnings` are clean.
  - Mutants. Each one was applied alone with the dev app stopped, landed in executable code (the mutated line is printed in the run), and was restored by `cp` + `shasum`:
    - **M1** (B6: the start arm's env lookup → `None`): `a_remote_spawn_records_its_session_running_and_nothing_else_does` FAILED. This is behavioural; it used to be text-only.
    - **M2** (Attach(Mode) recorded as Unknown): the same test FAILED.
    - **M3** (`running.mode().or(resolved)`): `a_reconnect_registers_the_live_sessions_mode_never_the_stored_one` FAILED.
    - **M4** (Attach takes the start argv): `remote::tests::a_reconnect_on_open_attaches_and_a_start_starts` FAILED.
    - **M5** (`RemoteExit::host` → `""`): `a_ninth_remote_session_on_one_host_is_refused_in_plain_words` FAILED.
    - **M6** (the reconnect arm builds `Start`): `a_reconnect_spawn_attaches_and_registers_its_running_mode` and `a_remote_close_ends_its_session_and_a_respawn_waits_for_it` FAILED. Both are text guards (the residual below).
    - **M7** (`remote_open` → `Some(Start)`, extra): `a_reconnect_spawn_attaches_and_registers_its_running_mode` FAILED (text guard).
  - **Residual, stated:** the call-site arguments inside `SessionRegistry::spawn` and `cc_spawn_remote` (`&cc_env`, `remote_open`, the `RemoteOpen` the reconnect door builds) are still pinned by exact text only (W4). The live open in verify-self is their behavioural proof.
  - **Guard re-spellings** (P1.6): `profile_spawn_caller_orders_its_profile_decisions` now anchors on `build_cc_argv(` and pins ONE `cc_argv` feeding both arms. `remote_spawn_caller_admits_first_…` pins the dispatch in the registry plus `remote:remote_handle,`. `a_remote_close_ends_…` gained `RemoteOpen::{Attach,Start}` in its reach allow-list and re-anchored its no-exec scan on `RemoteCcSession::spawn_cc`. `a_reconnect_spawn_attaches_…` and `a_remote_spawn_records_running_through_…` are re-spelled to the new text.
  - **Not in the plan, done:** the open check's `OpenCheck::Reconnect { mode }` became `Option<DriveMode>` (W3). Its JSON is unchanged, as `remote_link::commands::tests::the_wire_kinds_are_kebab_case` asserts with `"fsd"`. `config_store/profiles.rs`'s `live: Option<Option<String>>` is unrelated (a profile's config dir) and is left alone.
  - [x] P1.1 **Test first (B6).** Change `record_remote_spawn` to take `remote_open: Option<&RemoteOpen>` and `cc_env: &[(String, String)]`, and move the `DRIVE_MODE_ENV` lookup inside it. While still on today's types, add a behavioural test that a start with `CLAUDESK_DRIVE_MODE=autopilot` in its env records `autopilot`, and that a start with no var records none. Mutation-prove M1 before going on.
  - [x] P1.2 Add `remote_cmd::SessionMode { Unknown, NoMode, Mode(DriveMode) }`. `parse_mode_value` returns it, and `OpenFacts.mode` / `SpawnFacts.mode` become `SessionMode`, defaulting to `Unknown`; a non-live session is still `Unknown`. Update `remote_link::commands` (`OpenCheck::Reconnect { mode }`, per W3) and its tests.
  - [x] P1.3 Add `cc_session::remote::RemoteOpen { Start, Attach(SessionMode) }`, replacing `RemoteSpawn.{attach, running_mode}`. `cc_spawn_remote` builds it from the intent and the facts in ONE expression, so nothing is kept in step by hand. `session_argv` takes `&RemoteOpen`. `running_drive_mode`, `record_remote_spawn` and `recorded_spawn_permission` take the typed open. Rewrite their unit tests against the enum.
  - [x] P1.4 Drop `RegisteredSession.remote_host` and derive it via `remote.as_ref().map(|r| r.target.host())`. `insert_remote` builds a `RemoteExit` for the fake host; a test-only constructor is fine.
  - [x] P1.5 Move the dispatch. `PtyCcSession::spawn` becomes local-only and returns `Self`. The remote arm (drive-mode extraction from the env, `session_argv`, local-env filtering, `RemoteCcSession::spawn`) moves into a function in `cc_session::remote`, and `SessionRegistry::spawn` matches `SpawnTarget` to call one or the other.
  - [x] P1.6 Re-spell every exact-text guard that pinned the old shape, by SYMBOL, not line: `a_remote_spawn_records_running_through_record_remote_spawn`, `a_reconnect_spawn_attaches_and_registers_its_running_mode`, the `PtyCcSession::spawn(` ordering guards (`resolve_spawn_profile(` / `guard_continue_against_transcripts(` before the spawn call, the call's argument span), the `remote_host,` registration guard, the `letrunning_mode=ifattach{facts.mode}else{None};` guard, and the `fn_at(… "pub(super) fn spawn(")` sync-commands span. Run `grep -rn "PtyCcSession::spawn(\|remote_host\|running_mode\|remote.attach" src-tauri/` and resolve each hit. Mutation-prove each re-spelled guard individually (M2–M6).
  - [x] P1.7 Update the doc comments that describe the old shape (`RemoteSpawn`, `SpawnTarget`, `OpenFacts::mode`, `SpawnFacts::mode`, `running_drive_mode`, `record_remote_spawn`), and the `arch/remote-workspaces.md` lines that name `attach`/`running_mode`, if any (grep).
  - [x] verify-auto — evidence: `pnpm verify:auto` → exit 0 in 66 s (lint: 0 errors, 1 pre-existing warning in the untouched `XtermPane.tsx`; `format:check`, `tsc --noEmit`, `check:link` clean; vitest `Tests 4225 passed (4225)`; `cargo fmt --check` clean; `cargo clippy --all-targets -D warnings` clean; `cargo test`: lib `1537 passed; 0 failed; 4 ignored`, every integration binary `ok`).
  - [x] verify-self — runner subagent (static + mutation) + orchestrator (live, via the `tauri` MCP bridge, which subagents cannot reach)
    - [x] `pnpm verify:auto` exits 0 — evidence: verify-auto run, exit 0 in 66 s; the runner's own `cargo test --lib` → `1537 passed; 0 failed` before the mutations and after every restore.
    - [x] No `Option<Option<String>>` / `Option<&Option<Option<String>>>` in production text; no `attach: bool|running_mode` in `remote.rs` — evidence: grep over the comment-stripped production extracts → exit 1. Positive control: `RemoteOpen` is found in the same extracts. The only raw hits are the two `///` doc lines that describe the OLD shape.
    - [x] No `remote_host`; `remote_count` reads `RemoteExit::host`; the cap test passes on `RemoteExit::for_test` — evidence: `grep -n remote_host cc_session/mod.rs` → exit 1; `a_ninth_remote_session_on_one_host_is_refused_in_plain_words` passes (and fails under M5).
    - [x] `impl PtyCcSession` builds no `RemoteCcSession`; `PtyCcSession::spawn -> Result<Self, CcError>`; `SessionRegistry::spawn` matches `SpawnTarget` — evidence: the comment-filtered impl block has no `Remote` token; the only `RemoteCcSession::spawn_cc` call is the registry's `SpawnTarget::Remote(r)` arm.
    - [x] Mutants, the runner's OWN mutant text, independent of build. It ran with no dev app up, one mutant at a time, restored by `cp` + `shasum`. M1–M5 were each killed by a behavioural test, the same tests as at build. M6 was killed only by text guards (`a_reconnect_spawn_attaches_…`, `a_remote_close_ends_…`), the stated residual. The extras M7 (`SessionMode::mode()` → `None` for `Mode`), M8 (`parse_mode_value(NO_MODE)` → `Unknown`) and M9 (the `Attach(NoMode)` arm keeps the old record) were each killed. No hole found. M9's run also failed `hook_socket::…a_client_closed_before_accept…`, the known flaky test (backlogged), which passed in the runs before and after.
    - [x] **Live, step 1 (Start).** I opened the scratch row (stored `orchestrated`) through the picker row click. The remote tmux session `cd-f37d9999` started in the scratch folder with `@cd_mode=orchestrated`. `invoke('cc_drive_mode', {sessionId: 'cc-1'})` → `"orchestrated"`. The dev `remote-sessions.json` reads `{state: running, drive_mode: orchestrated}`.
    - [x] **Live, step 2 (reconnect keeps the live mode, A9).** The `filmstrip-detach-ws-1` click left the session alive (`attached=0`, same creation time) with the record `running`. I set the row to `fsd` (`project_set_default_drive_mode`); the picker row then read "↻ reconnect". Reopening it attached to the SAME session (creation time unchanged, `attached=1`, `@cd_mode` still `orchestrated`). `cc_drive_mode('cc-2')` → `"orchestrated"`, NOT `fsd`. The record stayed `orchestrated`. The workspace header read `⇅ fsd ⚠`, the stored-≠-running readout.
    - [x] **Live, step 3 (Recycle starts fresh).** I seeded a throwaway WIP in the scratch folder (hygiene rule 6) and clicked `workspace-recycle`. The handoff wrote `.session.md`, and the respawn created a NEW tmux session (creation time went from …924 to …055) with `@cd_mode=fsd`. `cc_drive_mode('cc-3')` → `"fsd"`, the header read `⇅ fsd` (no ⚠), and the record read `running`/`fsd`. `/session-restore` consumed `.session.md`.
    - [x] **Live, step 4 (cleanup).** Every workspace was closed through the UI (× plus `confirm-close`). The scratch tmux session left by RA2's unreachable close was ended through my own ControlMaster. The scratch folder is back to README + empty `state/`. The dev app was stopped with TaskStop and no `ssh -M` remains (my own master included). The dev `projects.json`, `settings.json` (gate flipped ON for the check), `remote-sessions.json` and `session-state.json` were restored from the backups taken before the check, each `shasum`-equal; the `projects.json` row set is back to 8.
    - [x] **RA1** `SURFACE-2026-11-16-TRAY-REMOTE-LOST-SESSION-ALARM-NOT-VERIFIED-LIVE`. I fired a `Notification`/`permission_prompt` through the DEPLOYED remote hook command, on the mini, over the `-R` forward; the dev `status-channel.log` showed `event=Notification cwd=~/claudesk-scratch-remote mapped=awaiting_input resolved=ws-3 outcome=emitted`. `tray_debug_state` then read `{applied: attention, ws-3: awaiting_input}`. I ended the remote tmux session (`kill-session`); the log showed `SessionEnd … resolved=ws-3 outcome=dropped` and the pane read "Session ended". `tray_debug_state` still read `{applied: attention, ws-3: awaiting_input}` (both dots `status-dot-awaiting`). **PASS.** The baseline before the event was `{applied: neutral, ws-3: idle}`.
    - [x] **RA2** `SURFACE-2026-11-27-CLOSE-NOT-ENDED-PROJECT-NOT-LIVE-CHECKED`. I opened a fresh scratch session (`ws-5`), resolved the dev app's link master by its dev ControlPath (`…/com.claudesk.app.dev/ssh/<hash8>`; its PPID was the dev app), killed only that PID, and clicked `filmstrip-close-ws-5` about 1.2 s later, inside the 1 s+ backoff. The toast read: "Couldn't end the Claude Code session for claudesk-scratch-remote: <mini-host> isn't reachable, so the session is still running there. The next time you open it, Claudesk will ask whether to end it or reconnect." The record read `end-pending`. **PASS**: it names the scratch folder and the `unreachable` cause.
    - Not observed: the `failed` cause (the optional half of RA2).
  - [x] verify-human — operator approved 2026-11-27 ("ok")
    - [x] P1.verify-human.1 Feature floor (§2 5a: one phase, so no earlier human look): the remote open → detach → reopen → Recycle happy path, end to end — "now that you see it, still what you want?" — operator: "ok" (accepted the agent's live run as the look).
  - [x] verify-codify — no new tests: every verified behaviour already has a test that fails when it breaks, each one mutation-proven at build/verify-self (M1–M9; the reconnect door's `Attach(facts.mode)` is the stated caller-guard residual). The integration boundary (`cc_spawn_remote` → `SessionRegistry::spawn`) needs a real `AppHandle` and a live link, so the verify-self live run is its behavioural proof.
    Test scope: full — last phase
    - evidence: `pnpm verify:auto` run 1 → exit 101 (`hook_socket::…a_client_closed_before_accept…` FAILED; triaged as flaky, see ## Test Triage); run 2 → exit 101 (same test); run 3 → exit 0 in 99 s (vitest `4225 passed`; `cargo test` lib `1537 passed; 0 failed`). The test passed 3/3 alone and 3/3 in a bare `cargo test --lib` between the runs. No code or test was changed. The backlog entry `SURFACE-2026-11-27-HOOK-SOCKET-CLOSED-PEER-TEST-FLAKY` was updated with the frequency.

## Current Node
- **Path:** Feature > complete
- **Active scope:** none
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Code-Quality Review

*(feature-review-quality on ship commit `ee37ae3`, window `ee37ae3^..ee37ae3`; drive_mode=autopilot. 0 CRITICAL, 0 MAJOR, 5 MINOR. All 5 auto-backlogged to `backlog-quality-findings.md` → `# paydown-2026-11-27-wp9-cc-session-shape — 2026-11-27`.)*

### Strengths
- `RemoteOpen::{Start, Attach(SessionMode)}` + `SessionMode::{Unknown, NoMode, Mode(DriveMode)}` replace the positional `Option<Option<String>>` and the duplicate `attach: bool`. Every state is named, the consumers match exhaustively, and the `OpenCheck::Reconnect` JSON stays pinned.
- The B6 hole moved from a text-only guard to a behavioural test driven by the real `cc_spawn_env` (including the gate-off case).
- The dispatch on `SpawnTarget` now lives in `SessionRegistry::spawn`. `PtyCcSession::spawn` is local-only and drops its `too_many_arguments` allow, and one `cc_argv` feeds both targets.
- `remote_host` is gone; the per-host cap reads `RemoteExit::host`, tested via a never-connecting `RemoteExit::for_test`.
- The verification is honest: the call-site residual is named with its reason, mutants were run one at a time, and the arch doc got an as-built note.

### Issues
**CRITICAL** — none
**MAJOR** — none
**MINOR**
- [`cc_session::drive_mode_wire`] A third `DriveMode` → wire conversion, and it fails silently where `cc_spawn_env` logs. → `SURFACE-2026-11-27-QUALITY-WP9-DRIVE-MODE-WIRE-THIRD-COPY`
- [`record_remote_spawn` / `RemoteCcSession::spawn_cc`] The env drive-mode lookup is written twice; only identical code makes the two values agree. → `…-WP9-ENV-DRIVE-MODE-LOOKUP-TWICE`
- [`SessionRegistry::spawn`] Four parallel `match &target` blocks, and `RemoteExit` is built in two places. → `…-WP9-SPAWN-PARALLEL-TARGET-MATCHES`
- [the re-spelled guards] `"{code}"`-only failure messages dump the whole body. → `…-WP9-GUARD-FAILURE-MESSAGES-DUMP-BODY`
- [`arch/remote-workspaces.md` §C] The parent `SpawnTarget::{Local { cwd }, Remote { target }}` line is stale next to the new as-built note. → `…-WP9-ARCH-SPAWNTARGET-PARENT-STALE`

### Assessment
A clean, well-aimed paydown. It closes three backlogged findings by making the illegal or duplicated state unrepresentable rather than by adding more guards. Correctness is sound: the enums map one-to-one onto the old meanings, and `Unknown`-when-not-live survives. Test quality rose: B6 is now behavioural, and the remaining text guards fail closed, with the residual stated. What remains is backlog-tier duplication (the wire conversion ×3, the env lookup ×2, four parallel target matches).

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before `feature-finalize` archives the WIP.

## Test Triage — hook_socket::tests::a_client_closed_before_accept_refuses_the_timeout_benignly_and_still_delivers
Classification: Flaky test — the failure is unrelated to the new code and inconsistent across runs.
Confidence: high
Evidence: WP9 touches no `hook_socket` code. The same test failed in exactly one of the verify-self runner's ten `cargo test --lib` runs (its M9 run) and passed in the runs before and after it. It also passed in this phase's verify-auto gate. It is the known flaky closed-peer test that the handoff notes as backlogged ("re-run it alone before triaging further").
Action: no code or test change. Re-run the test alone, then the full gate (up to 2 retries); escalate only if it still fails.
Result: full gate retry 1 failed again (same test); a bare `cargo test --lib` passed 3/3; full gate retry 2 passed (exit 0). Flaky confirmed, so no code or test change. The backlog entry has the frequency.

## Retrospect
- **What changed in our understanding:** "Close the B6 hole with a behavioural test" can only be done for the half of the call that a test can reach. Moving the env→mode lookup INSIDE `record_remote_spawn` made the mutant site testable. The call site's arguments stay text-pinned, because `SessionRegistry::spawn` needs a real `AppHandle` plus a live link. The honest closure is "the decision is behavioural, the wiring is guarded", with the live run as the wiring's proof.
- **Assumptions that held:** a pure refactor with no behaviour change; the frontend wire unchanged (`OpenCheck::Reconnect` as `Option<DriveMode>` serializes identically, pinned by `the_wire_kinds_are_kebab_case`); one phase sufficed; the plan's guard-respell inventory found every guard that broke (5).
- **Assumptions that were wrong:** that the dev profile's workflow gate would be on: it was OFF, which withholds the drive mode entirely, so the A9 check needed a temporary gate flip (backed up and restored). Also, the flaky `hook_socket` closed-peer test is far more frequent under the full gate than its backlog entry suggested (2 of 4 runs today).
- **Approach delta:** beyond the plan, one `cc_argv` is now built in the registry and fed to both targets, and `PtyCcSession::spawn` lost its `too_many_arguments` allow. The two backlog live checks (RA1 tray alarm, RA2 close-not-ended toast) rode along and both passed. RA2's optional `failed` cause was not driven.

**Closure notice:** Requester = operator — closure notice for self-record.
> **Feature complete:** paydown-2026-11-27 WP9 has shipped (`ee37ae3`). A remote session's open is now one typed value (start, or attach under a known, none or unknown mode), its host is stored once, and the local/remote spawn dispatch lives in the session registry. No behaviour change; verified live on a scratch remote row (start, reconnect keeping the live mode, Recycle).
