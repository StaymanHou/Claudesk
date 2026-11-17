---
drive_mode: autopilot
---

# Feature: M17 WP5 — Remote lifecycle: reconnect, detach, the R-4 dialogs, the remote resume checks

**Workflow:** feature
**State:** Completed 2026-11-17 (shipped `67dec33`; review CRITICAL fixed `f7535b4`)
**Created:** 2026-11-16
**Entry:** spec (complex feature)
**WBS:** `workflow-system/product/wbs.md` → "### WP5" (M17). Design: `arch/remote-workspaces.md` §E (PLANNED; this spec supersedes three of its rows, see Technical Constraints).

## Problem Statement

A remote workspace's CC runs in a tmux session on the mini that outlives Claudesk's connection. Today
Claudesk does not decide what an open means for that session:

- **Reopen is an accident of `tmux new -A`.** A live session is silently attached, but the open still
  takes the resume path: it consumes the unclean flag, and if `.session.md` is present the frontend
  could inject `/session-restore` into a session that never ended.
- **The picker announces nothing for a remote row** (`announce_actions` skips them), so "reconnect
  vs. resume" is invisible before the click.
- **The resume rule's file checks are local.** `.session.md` and folder trust are read on the main
  box against an `ssh://` key, so the `/session-restore` arm never fires remotely (the transcript
  check already moved to the remote at WP4).
- **A close or quit with the link down ends nothing and says nothing** (`a2c9fec`: `close_exec`
  returns `LinkNotUp`). The next open silently reattaches to a session the operator believes they
  closed. That is the open instance of the prior `a-silent-non-action-must-not-read-as-done`.
- **There is no way to leave a remote session running on purpose** (R-3).
- **An unrecorded live `cd-*` session** (e.g. a row removed and re-added) is attached with no question.


_Problem statement unchanged (2026-11-16, F9b from P1.verify-self.2): the behaviour was right; two caller writes lacked a test that fails when they are removed._

Problem statement unchanged (2026-11-17, F9b from Phase 2 verify-self): the gaps were test coverage of the fire-time trust read and an unguarded one-exec property, not a changed understanding of what an open must decide.

Problem statement unchanged (2026-11-17, F12 from Phase 2 verify-human): the operator asked for the withheld remote restore to be visible, which is the same resume problem; nothing about what an open must decide shifted.

## User Stories

- As the operator, I want reopening a remote row whose CC is still running to **reconnect** to it, with
  nothing typed into it, so a network drop or a crash never costs me the session.
- As the operator, I want the picker to tell me, before I click, whether a remote row will reconnect or
  resume, from what Claudesk last knew, without connecting to the host just to draw a label.
- As the operator, I want to **detach**: close the workspace while its CC keeps working on the mini,
  and pick it back up later from the picker.
- As the operator, when I closed or quit while the mini was unreachable, I want to be told at close
  time, and asked at the next open whether to end that session or reconnect, rather than find it
  silently still running.
- As the operator, I want a resumed remote session (one that really ended) to follow the same
  two-signal rule as a local one: `--continue`, else `/session-restore`, else nothing.

## Acceptance Criteria

### AC-1 The local record of each remote session (feeds the label and the open decision)
- 1.1 Claudesk keeps, per remote key, a **local** record of the last-known state of its remote session:
  `running` / `ended` / `end-pending (<route>)`, plus the drive mode it was spawned under. It is local,
  read without any network, and survives a restart.
- 1.2 Written at: a successful remote spawn → `running` (default-set, like the unclean flag, so a
  Claudesk crash leaves `running` for free); a confirmed remote end (close / ⏸ / quit / Recycle with
  the end done, or CC exited on its own) → `ended`; an explicit close / ⏸ / quit whose remote end
  could not be delivered (`LinkNotUp`, or the end failed) → `end-pending`; Detach → stays `running`; a
  passive drop → unchanged.
- 1.3 Removing a remote row clears its record.

### AC-2 The picker label (5.1, operator ruling Q1)
- 2.1 A remote row is announced from the local record + the local unclean flag, with **no
  connection**: `running` → **Reconnect**; `end-pending` → a "closed while offline, will ask" label;
  `ended` + flag set → the existing continue label; otherwise no label (the remote `.session.md` is
  not known locally).
- 2.2 When the stored drive mode differs from the mode the running session was spawned under, the
  Reconnect label says the session keeps its original mode (arch §D).
- 2.3 The label is a prediction. The click re-decides (AC-3), and when the click's decision differs
  from the label (stale record), the open's toast says what actually happened ("The session on mini
  had ended; resuming with --continue").
- 2.4 The Reconnect arm is core (ungated), like the continue arm; the restore arm stays gated.

### AC-3 The open decision (5.1, 5.2): one check over the master at click time
- 3.1 The existing open check (`remote_open_check`) becomes the decision. One exec over the master
  answers: the folder exists; the tmux session is live (and its spawn mode); the remote
  `workflow-system/state/.session.md` exists; the remote folder is trusted (remote `~/.claude.json`).
- 3.2 **Live session:**
  - record `running` → **reconnect**: attach to the session; fire nothing (no `--continue`, no
    `/session-restore`); the unclean flag is not consumed.
  - record `end-pending` → **dialog A** (AC-5.1).
  - record `ended` or no record → **dialog B** (AC-5.2, unrecorded session).
- 3.3 **Dead session:** clear any `end-pending`, then the two-signal rule with the **remote** checks:
  unclean flag → `--continue` (transcript guard, as shipped in WP4); else remote `.session.md` →
  `/session-restore` (only into a trusted folder; untrusted → the existing manual hint); else nothing.
- 3.4 Each remote file check is one dispatch inside the deciding function, never at its callers. A
  failed check reads as "no" (fresh session is the safe side), as WP4's transcript check does.
- 3.5 A reconnect never starts a fresh CC, and a start never silently attaches: if the session state
  changed between the check and the spawn, the open says so rather than doing the other thing.

### AC-4 Detach (5.3, operator ruling Q2: "simply detach and quit; the tile is gone")
- 4.1 A remote workspace has a **Detach** action. It closes the workspace and leaves the remote CC
  running: no `/exit`, no copy-mode cancel, no end-session, no dialog (an explicit action keeps its
  meaning).
- 4.2 The unclean flag is left set (a detach is not a clean exit), and the record stays `running`, so
  the next open labels Reconnect and attaches; if the session died meanwhile, the open resumes with
  `--continue` (5.5).
- 4.3 Detach works with the link down (it touches nothing remote).
- 4.4 Local workspaces have no Detach. `CcSession::detach()` defaults to `Unsupported` and only the
  remote session implements it.
- 4.5 The reserved `LinkOverlayStatus::Detached` (WP4) is removed: there is no detached tile.

### AC-5 The R-4 dialogs (5.4)
- 5.1 **Dialog A: closed while offline.** At the next open, a live session with `end-pending`: "You
  closed this while <host> was unreachable, so it is still running." → **End it and open** (carry out
  the recorded close: end the session, then the two-signal rule with the flag as that close left it,
  i.e. × cleared it, ⏸ kept it) / **Reconnect** / **Cancel**.
- 5.2 **Dialog B: unrecorded live session.** A live session Claudesk has no `running` record for:
  "A Claude Code session for this project is already running on <host>." → **Reconnect** / **End it
  and start fresh** (end it, then the two-signal rule) / **Cancel**.
- 5.3 **At the close itself** (× or ⏸ with the link down): a toast says the session could not be
  ended and that the next open will ask. Quit records `end-pending` with no toast (the app is going
  away); dialog A is where the operator meets it.
- 5.4 **Host unreachable at open:** never falls back to anything; the error says so in plain words and
  offers **Retry**.

### AC-6 The unclean-flag interplay is tested (5.5)
- 6.1 A passive drop (link lost, Claudesk killed) leaves the flag set and the record `running`; with
  the session still live, the reopen reconnects; with the session since dead, the reopen resolves to
  `--continue`.
- 6.2 A reconnect does not consume the flag; a resume consumes it exactly as locally.

### AC-7 Auto-resume timing on a remote pane (5.6)
- 7.1 A cold remote open that resolves to `/session-restore` lands the command in CC (re-measured live
  on the mini with the real inner command, ≥5 runs), through `cc_inject`'s readiness wait.
- 7.2 Then decide from the measurement: keep `INJECT_SETTLE_MS` for remote, shorten it, or fire on the
  readiness signal alone. Record the reading and the decision.

### AC-8 Folded review findings
- 8.1 `SURFACE-2026-11-16-QUALITY-M17WP3-RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM` (MAJOR): the reconnect
  loop and the new attach-on-open / detach paths are driven by tests through an injected seam, not
  only `include_str!` source guards.
- 8.2 `…M17WP4-TWO-SEQUENTIAL-SPAWN-EXECS`: the open's remote checks are one exec (AC-3.1).
- 8.3 `…M17WP4-OVERLAY-KEY-DERIVED-TWICE`: the overlay sink uses the caller's row key.

## Asked (spec elicitation, 2026-11-16)

1. **When does a remote row say what it will do?** Agent recommended: at click, from the open check.
   **Operator: from a locally stored state recorded at the last disconnect, accepting it may be
   outdated.** → AC-1, AC-2 (the click still decides; AC-2.3 covers a stale label).
2. **What does Quit do to a detached workspace?** Agent recommended: leave it running. **Operator:
   Detach is simply "detach and close"; the workspace tile is gone.** There is no Detached state, so
   the question dissolves → AC-4; the R-4 "close a detached workspace" dialog and the Detached tile /
   Reconnect button are dropped.

## Assumed (defaults taken without asking; flag any that are wrong)

- **A1. Detach sits beside × and ⏸ on the remote tile** (`TileActionButton`), not in the workspace
  header. The grill's "Detach / Reconnect control in the header" assumed a persistent toggle; with
  Detach now a close variant, it groups with the other close actions. Remote tiles only.
- **A2. Detach asks nothing**, even while CC is busy: nothing is lost, the session keeps running.
- **A3. Dialog A's "End it and open"** carries out the close that was recorded (× → flag cleared, ⏸ →
  flag kept), then the two-signal rule.
- **A4. Dialog B's "End it and start fresh"** = end, then the normal two-signal rule (the flag is
  clear in this case, so it is `.session.md` → restore, else nothing).
- **A5. Both dialogs have Cancel**, which opens nothing and changes nothing.
- **A6. Host unreachable at open stays an error toast with a Retry action** (the toast already
  supports an action button), not a modal. Arch §E wrote "dialog: Retry / Cancel"; dismissing the
  toast is the Cancel.
- **A7. A dead session with `end-pending` asks nothing**: the session ended anyway, so the intent is
  cleared and the open resumes normally.
- **A8. A live session whose record says `ended`** (an end that failed silently) is treated as
  unrecorded (dialog B), never reconnected without asking.
- **A9. The spawn mode is stored with the session** (a tmux user option set at creation, mirrored in
  the local record), so a reconnect registers the mode it is actually running under and the
  workspace's "running mode" readout stays truthful.
- **A10. No remote `.session.md` in the local record.** The restore arm for a remote row is decided
  only at click (AC-2.1); the WP7 poller may feed it later.
- **A11. The passive in-workspace reconnect (WP3) is unchanged**: a re-attach that finds the session
  gone still ends the pane; the two-signal rule applies at the next open.

## Out of Scope

- A Detached tile state, a Reconnect button in the workspace, or a "close a detached workspace"
  dialog (operator ruling Q2).
- A picker-open connection to refresh remote labels (operator ruling Q1).
- Remote `.session.md` polling / docs / Recycle's remote mtime wait (WP7).
- Hiding OUT surfaces (WP6). The residual quit bound (master alive, network gone, ≤ ~27 s) unless
  this WP's close-path changes touch the close timeouts.
- More than one host in the UI.

## Technical Constraints

- **Supersedes arch §E (PLANNED) rows:** "Detach button → Detached tile with a Reconnect button",
  "Reconnect button / reopen" (now reopen only), "Close a detached workspace → dialog". §E, roadmap
  M17 R-3 and WBS 5.3 are resynced at this WP's finalize; `LinkOverlayStatus::Detached` and its
  status-channel doc go with it.
- No ssh I/O in a sync `#[command]` (`sync_commands_do_not_block.rs`). The open decision stays an
  async command on a blocking worker; new async commands go into its `ASYNC_COMMANDS` table.
- Every remote command string through `remote_cmd` (no variable value outside `quote`). Reading the
  remote `~/.claude.json` must not ship a multi-MB file per open if avoidable (decide remote-side vs.
  local parse at plan).
- Reconnect = `tmux attach -t =<name>`, never `new -A` (arch §E). A start must not silently attach.
- Every Claudesk injection through `cc_inject`; the close path through `LinkRegistry::close_exec`.
- Never infer state from PTY output; the session's liveness comes from `tmux has-session` over the
  master.
- The unclean-flag store and its consume/set ordering (`resolve_resume_arm`, `should_set_unclean_flag`)
  are unchanged for local rows, and pinned tests stay green.
- `announce::arm_available`'s wildcard defaults to gated: the new reconnect arm needs an explicit
  ungated case. `offInvariantGuard` (6 arms / 10 subjects) stays unchanged.
- Remote verification follows `remote-verify-hygiene`: a scratch remote folder, never the real remote
  row; stop the dev app before editing Rust; check for the operator's open remote workspaces first.
- No new 3rd-party dependency (ssh + tmux on the mini were probed at WP1).

## Open Questions

- [ ] None blocking. The two technical choices (how to read remote trust; the exact settle-delay
  outcome) are plan / build tasks with their own measurement, not research.

## Work Tree

- [x] Phase 1: Reconnect on open (the record, the decision, attach-on-open, the picker label)
  **Observable outcomes:**
  - CLI: `cargo test` covers the reconnect loop through an injected seam (fake terminal spawner + injected exit/notice sinks): a drop → re-attach, the 5-spawn-failure cap, a close during the wait, `confirm_attached`'s window. The `include_str!` guards these replace are deleted, each replacement mutation-proven (AC-8.1).
  - CLI: `cargo test` proves the record writes (spawn → `running`; Ended → `ended`; a confirmed close end → `ended`; `remove_project` clears it) and the decision table (live+running → reconnect; live+ended/none → ask-unrecorded; live+end-pending → ask-end-pending; dead → start), each arm mutation-proven.
  - CLI (state-changing, scratch remote folder on the mini, dev tmux server `claudesk-dev` only): open the scratch remote row in `pnpm tauri:dev`, SIGKILL the dev app, relaunch → the picker row reads **Reconnect** (bridge DOM read) with no ssh process started by the picker (`pgrep -fl "ssh -M"` empty before the click); clicking attaches to the SAME tmux session (`tmux -L claudesk-dev ls` shows one `cd-<hash>`, its `created` time unchanged) and the pane shows the earlier CC output; `session-state.json`'s flag is still set after the reconnect.
  - CLI: a reconnect after the stored drive mode was changed registers the session's ORIGINAL mode (`cc_drive_mode` via the bridge = the tmux `@cd_mode` value), and the row's label says the session keeps its mode.
  - Browser: when the record says `running` but the session is gone (`tmux kill-session` on the mini before the click), the click starts CC (no attach) and the toast names what happened; no JS errors (bridge console read).
  **Alignment questions:**
  - The Reconnect label and the "keeps its original mode" note on a remote picker row, seen live: still what you want?
  - [x] P1.1 Behavioural seam for `RemoteShared`: route `emit_exit`/`emit_notice` through injected sinks, add a fake terminal spawner, drive `reconnect`/`on_inner_exit` by test; retire the matching source guards (AC-8.1). Carry `project_path` in `RemoteSpawn` for the overlay sink (AC-8.3).
  - [x] P1.2 `remote_record` module: per remote key `{state: running|ended|end-pending, drive_mode}` in app data, atomic write like `session-state.json`; default-set `running` on a successful remote spawn, `ended` on a confirmed end / CC exit, cleared by `remove_project`.
  - [x] P1.3 `tmux_new_command` stores the spawn mode as a tmux user option (`@cd_mode`); a start never silently attaches (AC-3.5: `new` without `-A`, with "duplicate session" classified, not swallowed).
  - [x] P1.4 The open decision: `remote_open_check` runs ONE exec (folder, `has-session`, `@cd_mode`) and returns a typed decision (`reconnect{mode} | start | ask-end-pending | ask-unrecorded | folder-missing | unreachable | invalid`), deciding from the remote answer + the local record. Pure decision function, mutation-proven per arm.
  - [x] P1.5 Attach-on-open: `cc_spawn_remote` takes the decision; `reconnect` spawns `tmux attach -t =<name>` (no flag consume, no `--continue`, no inject), registers the running mode from `@cd_mode`. If the attach finds no session, say so (toast) rather than starting CC unasked.
  - [x] P1.6 Picker: remote rows announced from `remote_record` + the local flag (Reconnect / continue / closed-while-offline / none), Reconnect arm explicitly ungated in `arm_available`; the click uses the decision, never the label; a stale-label toast (AC-2.3). Interim: `ask-*` decisions show an error toast until Phase 4.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (57s): lint 0 errors (1 pre-existing warning, `XtermPane.tsx` exhaustive-deps, file untouched); `format:check` clean; `tsc --noEmit` clean; `check:link` clean; vitest **3916/3916**; `cargo fmt --check` clean; `cargo clippy --all-targets -D warnings` clean; `cargo test` lib **1288 passed / 4 ignored**, integration suites green (incl. `sync_commands_do_not_block`, `hook_pl_output` 24, `quit_teardown_stops_remote_links`).
    — evidence (build-time mutation runs): 12/12 mutants of the reconnect loop / exit latch / overlay edges / close order killed (`cc_session::remote` tests).
    — evidence (after F9b, P1.verify-self.2): `pnpm verify:auto` → EXIT=0 (51s): vitest 3916/3916; `cargo test` lib 1291 passed / 4 ignored (+3 new); fmt / clippy / tsc / lint (same 1 pre-existing warning) clean.
  - [x] verify-self  <!-- status: complete for every drivable leaf; 3 live leaves + 1 alignment UNVERIFIED (mini unreachable) -->
    - [x] P1.verify-self.1 seam — evidence: `cargo test --lib cc_session::remote` → 27 passed; the 3 retired guard names → 0 hits under src; runner's own 3 mutants (under-lock cancel, cap `>`, confirm `present`→`true`) each FAILED their named test; restores shasum-matched.
    - [x] P1.verify-self.2 record writes + decision table  <!-- status: PASS against the project gate (`pnpm verify:auto`), orchestrator ruling over the runner's cargo-test-only verdict; see evidence -->
      — evidence: decision table 6/6 mutants killed; Ended / close-end writes killed. ⚠️ SURVIVED full `cargo test --lib` (1288 green): `SessionRegistry::spawn`'s `record_running` write disabled (`false && spawned.is_ok()`), and `remove_project`'s `remote_record::clear` removed. Two caller writes have no test.
      — F9b fix: the spawn's write extracted to `record_remote_spawn` (test `a_remote_spawn_records_its_session_running_and_nothing_else_does`) + caller guard `a_remote_spawn_records_running_through_record_remote_spawn`; `remove_project`'s body extracted to `remove_project_and_record` (test `removing_a_remote_row_forgets_its_session_record_and_only_its_own`). Re-verify gate: 4 mutants (caller passes `false`, fn ignores `spawn_ok`, call removed, clear removed) each → `cargo test --lib` FAILED 1 test; restores shasum-matched.
      — re-run 1 (fresh runner): 9/12 killed; survivors C3 (`remove_project` not calling the extracted fn), B5 (call in `if false { … }`), B6 (mode arg → `None`). B5/B6 fixed in place ([SHORTCUT-2026-11-16]).
      — re-run 2 (fresh runner): B5, B6, N1 (`spawned.is_ok()`→`true`), N2 (`attached_mode`→`None`) each → `cargo test --lib` FAILED; C3 → clippy `-D warnings` exit 101 (dead_code); N3 (`if false { let _unused = 0;` … `}` keeping the call's indent) → `cargo test --lib` green but `cargo fmt --check` diff. ⚠️ Orchestrator ruling: every mutant is caught by `pnpm verify:auto` (the project's defined gate: fmt --check + clippy -D warnings + tests). Residual stated, not hidden: no source guard proves a FORMATTED call reachable; the behavioural proof of the spawn's `running` write is the live open (P1.verify-self.3), UNVERIFIED while the mini is unreachable.
    - [x] P1.verify-self.3 live reconnect after SIGKILL — evidence (run at verify-human after the operator started Tailscale; scratch row `~/claudesk-scratch-remote`, dev tmux server only): first open → `cd-7cb40f95` created=1794875198, `@cd_mode=none`, record `running`; prompt answered `zebrafive`; `kill -9` the app → session survives detached; relaunch → row reads `↻ reconnect`, 0 `ssh -M` before the click; click → SAME session (created unchanged, attached=1), pane shows the `zebrafive` turn, flag still set, record `running`. A UI × close then ended it (no tmux server; record `ended`; flag cleared).
    - [x] P1.verify-self.4 reconnect registers the ORIGINAL mode — evidence: row mode `fsd` → start → `@cd_mode=fsd`, record `fsd`; SIGKILL; stored mode → `orchestrated`; relaunch → `↻ reconnect (still fsd)`; click → same session (created=1794875362), `cc_drive_mode(cc-1)` = `fsd`.
    - [x] P1.verify-self.5 stale `running` → start + notice — evidence: SIGKILL, `tmux kill-session` on the mini, relaunch → label `↻ reconnect (still fsd)`; click → NEW session (created=1794875438, `@cd_mode=orchestrated` = the row's current mode); workspace toast: "The Claude Code session on <mini> had ended since Claudesk last saw it, so it was started again."
    - [x] align: Reconnect label + "keeps its original mode" note — CAPTURED: scratchpad `live/label-reconnect.png`, `live/label-still-fsd.png`, `live/stale-label-toast.png`.
  - [x] verify-human
    - [x] P1.verify-human.1 (d) Tailscale — operator started it (2026-11-16); the agent then drove .3/.4/.5 live (all PASS). ⚠️ The live run FOUND A DEFECT, fixed in place: tmux 3.8 option commands refuse a `=name` target (`no such session`, hidden by `-q`), so `@cd_mode` read as unset. The open check / mode read now target `=name:`; the fake tmux now refuses the old form (reverting fails 2 tests); `live_cancel_and_folder_check` (ignored, real host) passes; the attached `new … \; set-option -q @cd_mode` shape confirmed on real tmux (throwaway `-L wp5probe`). Gate re-run after the fix: `pnpm verify:auto` EXIT=0, 3916 / 1291.
    - [x] P1.verify-human.2 (a) the Reconnect / "reconnect (still <mode>)" labels + the stale-label toast, seen live — operator: "labels ok" (2026-11-16).
    - [x] P1.verify-human.3 (c) evidence basis for the spawn's `running` write — operator: accepted (2026-11-16); the live open (P1.verify-self.3) supplied the behavioural proof.
  - [x] verify-codify
    Test scope: full — suite not long (`pnpm verify:auto` Last 57s in runtimes.md)
    — evidence: new tests `a_reconnect_on_open_attaches_and_a_start_starts` (extracted `remote::session_argv`), `a_reconnect_registers_the_live_sessions_mode_never_the_stored_one` (extracted `running_drive_mode`), caller guard `a_reconnect_spawn_attaches_and_registers_its_running_mode` (argv from `remote.attach`, the registered mode, `cc_spawn_remote`'s Reconnect door into `RemoteSpawn`); mutants (argv branches swapped, unknown mode → stored, caller passes `false`) each → `cargo test --lib` FAILED 1, restores shasum-matched. The tmux option-target defect found live is pinned by the fake tmux refusing `=name` (revert → 2 FAILED). Full gate `pnpm verify:auto` → EXIT=0 (52s): vitest 3916/3916, cargo lib 1294 passed / 4 ignored.

- [x] Phase 2: Resume a dead session with the remote checks
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the resume rule on a remote row is half-built until `.session.md` / trust are read remotely.
  - Requirements unchanged: yes — Phase 1's live run changed only the tmux target form.
  - Solution still feasible: yes — the one-exec open check extended cleanly.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test`: the dead-session arm returns `continue` (flag set + transcript), `restore` (no flag + remote `.session.md` + trusted), `restore-manual` (untrusted), `none`; a failed check reads as "no"; each arm mutation-proven. The open's remote checks are ONE exec (folder, has-session, mode, `.session.md`, trust, physical path, transcript), replacing `cc_spawn_remote`'s two sequential execs (AC-8.2).
  - CLI: `cargo test`/`vitest`: a passive drop leaves the flag set and the record `running`; live → reconnect without consuming; dead → `--continue` consuming it exactly as locally (AC-6).
  - CLI (state-changing, scratch remote folder): with `workflow-system/state/.session.md` created in the scratch folder, no flag and no live session, a picker click lands `/session-restore` in CC (the scratch CC transcript on the mini shows the command as a user turn) in ≥5 cold opens; timings recorded (AC-7.1).
  - CLI: with the scratch folder untrusted, the open fires nothing and shows the manual hint (bridge DOM read).
  **Alignment questions:**
  - none
  - [x] P2.1 Extend the one exec: remote `.session.md` (gated: skipped when the gate is off or the row has a profile — remote rows have none), the remote trust answer (remote-side extraction of trusted paths from `~/.claude.json`, matched in Rust by `folder_trust::is_trusted`'s rule — not a multi-MB copy), the physical path and the transcript; `cc_spawn_remote` reuses the answer.
    — as built: the open check prints `real:` / gated `session-md:` / `trusted:` keys (perl JSON::PP, constant `TRUSTED_KEYS`); `folder_trust::trust_covers` matches them. AC-8.2: `cc_spawn_remote`'s realpath + transcript + reconnect-mode execs are now ONE (`remote_cmd::spawn_facts_command` / `parse_spawn_facts`; slug computed remotely by `sed 's|[/.]|-|g'`, NOT `tr '/.' '--'`, which GNU `tr` misreads). Deviation from "reuses the answer": the spawn keeps its own (single) exec, because respawns (drive-mode apply, Recycle, Re-launch) reach `cc_spawn_remote` with no open check before them. So an open is 2 execs (check + spawn), down from 4. Tests: `the_remote_slug_is_slug_of_physical_for_the_physical_path` (sh + zsh, `.`/space/quote names, stored-vs-physical), the caller guard counts exactly one `.exec(` in the spawn; mutants (slug from stored path; `.` not replaced) each FAILED.
  - [x] P2.2 Dead → two-signal decision in Rust (`continue | restore | restore-manual | none`), returned with the open decision; the frontend's remote open uses it (not the announce map) and the fire-time trust read uses it (the local `folder_trusted` is never asked for an `ssh://` key).
    — as built: Rust returns the SIGNALS (`OpenCheck::Start(StartSignals{uncleanFlag, sessionMd, trusted})`), not a resolved arm, so the precedence rule keeps its ONE home in `predictAction`. `remoteRow.ts` `startAnnounced` maps them onto the wire vocabulary; `remoteOpenPlan` returns a one-row announce map that `ProjectPicker` passes to `rowAffordances` (same gate + door logic as a local row). `folder_trusted` answers an `ssh://` key from the check's cached trust. Live-picker tests: label `reconnect` + flag → continue; no label + remote `.session.md` → restore (gate ON) / nothing (gate OFF); label `continue` + no signal → nothing; untrusted → inject arm for the fire-time read to withhold. Mutants (click reads the picker's map; untrusted → `restore`) each FAILED.
  - [x] P2.3 Tests for the unclean-flag interplay (AC-6).
    — `cc_session::tests::a_passive_drop_keeps_the_flag_so_the_reopen_reconnects_or_continues`: real stores (flag set + `record_remote_spawn`), a drop writes nothing (`remote::tests::a_drop_records_nothing_…`), then `decide_open` live → Reconnect + `resolve_resume_arm(Reconnect)` never consumes; dead → `Start{unclean_flag:true}` + `Fire` consumes. Mutants (Reconnect authorizes a resume; the decision drops the flag) each FAILED.
  - [x] P2.4 Measure auto-resume on a cold remote open (≥5 runs, real inner command); decide the remote settle delay (keep / shorten / readiness only) and record it (AC-7).
    — measured live 2026-11-17 (<user>@ scratch row, real `cc-launch`, a project-local stand-in `/session-restore` skill replying one marker word): **6/6 cold opens LANDED** (after the bypass acceptance; see P2.verify-self.3). Each: clean × close before, no tmux session, flag absent, record `ended`. Timeline (mini poller on `#{bracket_paste_flag}` + the transcript's user turn):
         run | session | ready | landed | ready→landed  (s after the click; mini clock −0.04 s, ±0.1 s)
         1  |   –   |   –   | 2.77 |   –   (poller read the wrong tmux format, `pane_bracket_paste_flag`; fixed)
         2  | 0.99  | 1.51  | 2.62 | 1.11
         3  | 0.94  | 1.32  | 2.51 | 1.19
         4  | 0.97  | 1.35  | 2.64 | 1.29
         5  | 1.10  | 1.55  | 2.80 | 1.26
         6  | 1.11  | 1.55  | 2.77 | 1.22
    — **DECISION (AC-7.2): KEEP `INJECT_SETTLE_MS` (1500 ms) for remote panes.** The pane is ready 0.4–0.5 s after its session exists, so the settle (not readiness) bounds the land, costing ~1.2 s per remote auto-resume. "Readiness only" is not proven by these runs (all fired after the settle); shortening needs its own settle-0 probe on the remote → `SURFACE-2026-11-17-REMOTE-SETTLE-COULD-BE-READINESS-ONLY` (low). Operator may overrule at verify-human.
  - [x] verify-auto
    — evidence (re-run after the P2.verify-human.3 toast, F12, 2026-11-17): `pnpm verify:auto` → EXIT=0 (58s): vitest **3928/3928** (+6), cargo lib 1302 passed / 4 ignored; tsc caught a test typing slip first (fixed); fmt / clippy / check:link / lint (1 pre-existing warning) clean.
    — evidence: `pnpm verify:auto` → EXIT=0 (68s, 2026-11-17; no code changed after it): lint 0 errors (the 1 pre-existing `XtermPane.tsx` exhaustive-deps warning, file untouched); `format:check` clean (after a Prettier reflow of the two new test files); `tsc --noEmit` clean; `check:link` clean; vitest **3922/3922**; `cargo fmt --check` clean; `cargo clippy --all-targets -D warnings` clean; `cargo test` lib **1298 passed / 4 ignored**, integration suites green (incl. `sync_commands_do_not_block`, `hook_pl_output` 24).
    — evidence (re-run after the 2nd F9b fix, 2026-11-17): `pnpm verify:auto` → EXIT=0 (61s, after one clippy `doc_lazy_continuation` fix in a guard's doc comment): vitest 3922/3922; cargo lib 1302 passed / 4 ignored; fmt / clippy / tsc / check:link / lint (1 pre-existing warning) clean.
    — evidence (re-run after the F9b fix, 2026-11-17): `pnpm verify:auto` → EXIT=0 (71s): vitest 3922/3922; `cargo test` lib **1302 passed / 4 ignored** (+4: the trust-read and settle tests, the two caller guards); fmt / clippy `-D warnings` / tsc / check:link / lint (the same 1 pre-existing warning) clean.
    — evidence (targeted, build time): `vitest run src/components/picker` → 220/220; `cargo test --lib -- remote_cmd cc_session remote_link transcript` → 249 passed; 6 mutants (picker click reads the map; untrusted → restore; slug from the stored path; `.` not replaced; Reconnect authorizes a resume; the decision drops the flag) each FAILED, restores shasum-matched.
  - [x] verify-self
    — summary: .1 PASS with stated residual (operator ruling); .2 PASS; .3 PASS (6/6 landed after the bypass acceptance; the bypass-dialog guard gap backlogged high); .4 PASS (fires nothing; the missing remote hint → .5); .5 PASS (the F12 toast). COSMETIC: the Docs tab reads the `ssh://` key as a local path (→ WBS WP9). Integration boundary: the picker funnel + `cc_spawn_remote` driven live through the real row click.
    - [x] P2.verify-self.1 dead-session arms + one exec (AC-8.2)  <!-- status: PASS with stated residual — operator ruling 2026-11-17 -->
      — evidence (runner, own mutants): KILLED: Rust `unclean_flag`/`session_md`/`trusted` in `decide_open`; remote transcript answer (source guard only); `parse_spawn_facts`/`parse_open_facts` safe defaults; a 2nd `.exec(` in `cc_spawn_remote`; TS `startAnnounced` continue/restore/restore-manual/none.
      — ⚠️ GAP 1 (BLOCKING): the FIRE-TIME remote trust read is untested. SURVIVED (`cargo test --lib` 1298 ok): `folder_trusted`'s remote branch forced `true`; `set_open_trust(…, true || signals.trusted)`; `open_trust`'s missing-answer default `unwrap_or(true)`. That read is what withholds `/session-restore` in an untrusted folder.
      — ⚠️ GAP 2: `remote_open_check` has no one-exec guard (a 2nd `links.exec(` there SURVIVED). And the outcome's wording ("ONE exec … replacing cc_spawn_remote's two") is not met as built: an open = 2 execs (check + the spawn's own single exec; see P2.1's deviation note). Guard to add; the wording deviation goes to the operator at verify-human.
      — F9b fix (2026-11-17): `folder_trust::commands::remote_trust` (the remote half of `folder_trusted`, `None` for a local path) and `remote_link::commands::settle_open_decision` (the open check's local writes; the trust answer is now OVERWRITTEN by every check: a start's trust, else untrusted) extracted and driven by `remote_link::tests::the_fire_time_trust_read_answers_a_remote_row_from_its_last_open_check` + `settling_an_open_decision_clears_a_stale_end_intent_and_leaves_the_notice`; caller guards `the_open_check_asks_the_remote_once_and_settles_through_one_function` (exactly one `.exec(`) and `folder_trusted_answers_a_remote_row_through_remote_trust_first`. Re-verify gate: the runner's 4 survivors re-made against the new code (folder_trusted → true; remote_trust → true; trust set for any start / every outcome; `open_trust` default true; a 2nd exec in `remote_open_check`) + `clear_end_pending` ignored → 7/7 `cargo test --lib` FAILED (1301 passed / 1 failed each); restores shasum-matched. Awaiting a FRESH runner at re-verify-self.
      — re-verify-self (FRESH runner, 2026-11-17): 20 own mutants, 17 KILLED (all 3 GAP-1 survivors, T1–T3/T5/T7–T13, E1/E3, the 4 TS arms, the Rust signals). ⚠️ 3 SURVIVED (1302 green): **T4** `if project_path.starts_with("ssh://") { return true; }` at the TOP of `folder_trusted` (the guard checks the dispatch exists + precedes the local read, not that it is FIRST); **T6c** settle sets trust on `AskEndPending` (the overwrite loop omits AskEndPending + Invalid; and `remote_open_check`'s Invalid / link-failure early returns skip settle, leaving an older answer); **E2** a 2nd remote call via `links.close_exec(` in `remote_open_check` (the guard counts the text `.exec(` only). Runner confirms the two-exec description matches the code. → F9b again.
      — 2nd F9b fix (2026-11-17): `remote_open_check`'s worker restructured so EVERY outcome (Invalid row, unreachable link, the decided one) reaches one `settle_open_decision` (no `return`, no `?`); the trust test now loops every non-start outcome through an exhaustive `match`; guards are ALLOW-LISTS of `links.` calls (open check: `ensure_and_hold, exec, identifier`; settle: `set_open_notice, set_open_trust`; spawn: `wait_not_closing, ensure_and_hold, exec, identifier`); `folder_trusted`'s guard is a PREFIX check (the dispatch is its first statement). Re-verify gate: T4 (early `return true` for `ssh://`), T6c (trust on AskEndPending), T6c' (on Invalid), E2 (`close_exec` in the open check), an early `return` skipping the settle, E2' (`cancel_copy_mode` in the spawn) → 6/6 `cargo test --lib` FAILED (1301/1 each); restores shasum-matched. Awaiting a FRESH runner.
      — re-verify-self #2 (FRESH runner): 5 own mutants KILLED (M2a helper(&links) in the open check, M6/M6b/M7/M8); ⚠️ SURVIVED: **M1** (realistic) a 2nd remote exec in `cc_spawn_remote` via a helper given `&links` (the spawn guard counted only `.exec(` / `links.<m>(`); **M2b** (contrived) `&*links` in the open check. → F9b #3.
      — 3rd F9b fix (2026-11-17): both guards now require EVERY `links` occurrence in the guarded body to be an allowed site (spawn: `let links = app…`, the error text, `wait_not_closing`/`ensure_and_hold`/`exec`/`identifier`, `RemoteSpawn{links,`; open-check worker: `ensure_and_hold`/`exec`/`identifier`/the settle's `&links`), plus no second registry handle (`SharedLinks`/`try_state`) and no direct process spawn (`run_captured`/`Command::new`/`exec_argv`/`std::process`). Re-verify gate: M1, M1b (`links.clone()` alias), M2a, M2b, a 2nd `try_state::<SharedLinks>()` handle in the spawn → 5/5 FAILED (1301/1); restores shasum-matched. `pnpm verify:auto` EXIT=0 (57s): 3922 / 1302. ⚠️ Residual, stated: these are SOURCE guards (the commands take an `AppHandle`, and `LinkRegistry::exec` spawns a real ssh, so no fake transport sees it); a remote call through an entirely new free function the guards don't name would still pass.
      — re-verify-self #3 (FRESH runner): arms + trust KILLED (M1 flag, M2 `.session.md`, M3 physical-path trust); ⚠️ SURVIVED: **M4/M5** (realistic) the existing public `remote_cmd::preflight::run_preflight(&SshExec, …)` in either command; M7/M8/M9 (contrived: an `.expect` panic skipping the settle; a retry around the one exec; a registry copy before the worker the open-check guard didn't scan). → F9b #4.
      — 4th F9b fix (2026-11-17): stopped patching evasion-by-evasion; the reach is CLOSED BY CLASS in one shared check, `remote_link::commands::assert_remote_reach_is_closed`, used by both guards: (1) the `crate::remote_cmd::` / `crate::remote_link::` / `super::` items each command names must EQUAL an allow-list of pure builders/parsers (a new public helper fails without being named); (2) every crate ssh entry point (`run_preflight`, `SshExec`, `RemoteExec`, `preflight`, `install_remote_hook`, `exec_argv`/`master_argv`/`check_argv`, `run_captured`, `Transport`, `Command::new`, `std::process`) and every panic (`.expect(`, `.unwrap()`, `panic!`, `unreachable!`) banned by name; (3) every `links` occurrence an allowed site, over the WHOLE command (M9). Re-verify gate: M4, M5, M7, M9, N1 (a brand-new public `remote_cmd::probe_host` spawning a process, called from the spawn), N2 (`super::install_remote_hook` in the open check) → 6/6 FAILED (1301/1); restores shasum-matched. `pnpm verify:auto` EXIT=0 (63s): 3922 / 1302. ⚠️ Residual, stated in the helper's doc: a retry around the ONE allowed exec (M8), or a brand-new ssh spawner under a new name imported bare.
      — re-verify-self #4 (FRESH runner): every prior survivor + 2 arms + the trust read KILLED (A–G). ⚠️ SURVIVED: **1** (realistic) a 2nd `remote.links.exec(…)` DOWNSTREAM of the command, in the session dispatcher (`SpawnTarget::Remote(r) => *r` arm): the registry travels on in `RemoteSpawn`, unguarded (and that exec would run under the session-registry lock); **2** (harmless) a re-match of `check` after the settle (trust already written).
      — 5th fix (2026-11-17): the spawn guard also scans the three downstream functions the registry passes through (`SessionRegistry::spawn`, the dispatcher, `RemoteCcSession::spawn`) and bans any exec / ssh entry point / `cancel_copy_mode` / `prepare_inject` / `end_session` there (their remote I/O is the terminal itself); the scan cuts at the test MODULE (an early cut at a test-only method first made the guard fail on the clean tree, caught before trusting any kill). Re-verify gate: S1 (the runner's survivor, in the dispatcher) and S1b (in `RemoteCcSession::spawn`) → FAILED, each naming the `.exec(`; restores shasum-matched. `pnpm verify:auto` EXIT=0 (63s): 3922 / 1302.
      — ⚠️ STALL NOTE for verify-human: 5 runner rounds, 5 single survivors, each a new ROUTE for a second remote exec. The property ("an open asks the remote at most twice") spans the call graph; source guards scope per function and every route closed exposes the next. A behavioural count needs an injectable ssh binary + AppHandle-free command workers (not built). Operator decides: accept the closed-by-class guards with stated residual, or invest in the behavioural harness.
      — ✅ OPERATOR RULING (2026-11-17): "Accept + backlog harness". The class-closed guards stand, with the stated residual (a retry around the one allowed exec; a brand-new ssh spawner under a new name); the behavioural exec-count harness → `SURFACE-2026-11-17-REMOTE-EXEC-COUNT-NEEDS-A-BEHAVIOURAL-HARNESS`. AC-8.2 is a latency property, not correctness.
      — ⚠️ For verify-human (operator's call, not fixable by a guard): AC-8.2's wording ("the open's remote checks are ONE exec … replacing cc_spawn_remote's two") vs as built: the open check is one exec, and the spawn keeps ONE exec of its own (physical path + transcript + a reconnect's mode), because a respawn (drive-mode apply, Recycle, Re-launch) reaches `cc_spawn_remote` with no open check before it. An open = 2 execs (was 4).
    - [x] P2.verify-self.2 AC-6 flag interplay — evidence: `a_passive_drop_keeps_the_flag_so_the_reopen_reconnects_or_continues` (real stores + deciders); runner mutants KILLED: Reconnect authorizes+consumes; `record(Ended)` on a drop; `record(Ended)` on give-up; reconnect door → `fire` (vitest 1 failed). Only `markSessionClean` clears the flag (close, Recycle), never a drop.
    - [x] P2.verify-self.3 live `/session-restore` ×5 + timings (= P2.4)  <!-- status: PASS after the operator-ruled bypass acceptance: 6/6 landed (see P2.4) -->
      — evidence (run 1, 2026-11-17): folder trusted (↓ \r, `hasTrustDialogAccepted` = 1), clean × close (no tmux session, flag absent, record `ended`), click → pane "[exited]", "Session ended", NO transcript. Repro outside Claudesk as stayman: `cc-launch --dangerously-skip-permissions` in a pty opens "Bypass Permissions mode … ❯ No, exit / Yes, I accept". stayman never accepted it (<admin-user> had), so the auto-fired `/session-restore\r`'s `\r` confirmed "No, exit". Same class as the trust guard (paydown-2026-11-08 WP5 R1): a first-run CC dialog whose default is EXIT; the fire-time read covers trust only.
      — ✅ OPERATOR RULINGS (2026-11-17): (1) the agent accepts the Bypass Permissions warning once for the stayman account → done outside Claudesk (pty, ↓ + Enter, `/exit`); CC wrote `skipDangerousModePermissionPrompt: true` to `~/.claude/settings.json`; a re-launch shows no dialog. (2) The fire-time guard gap is NOT fixed in WP5 → `SURFACE-2026-11-17-AUTO-RESUME-INJECT-ANSWERS-BYPASS-PERMISSIONS-DIALOG-NO-EXIT` (high). Runs restart at 1.
    - [x] P2.verify-self.4 untrusted → nothing fires + manual hint (bridge DOM)  <!-- status: PASS (fires nothing); hint → verify-human -->
      — evidence (live, 2026-11-17, <user>@ scratch row added via the add form, preflight green): click → workspace opens, CC on the trust dialog ("❯ No, exit" untouched), console: "auto-resume: /session-restore withheld for ssh://…/claudesk-scratch-remote — Claude Code has not trusted this folder yet"; no command typed. ⚠️ No manual HINT anywhere for a remote row (its label is from the local record; the fire's console warning is the only trace) → alignment item for verify-human. COSMETIC: the right panel's Docs tab reads the `ssh://` key as a local path ("Could not read this project's docs: … No such file or directory"): the IDE half leaks onto a remote row.
    - [x] P2.verify-self.5 (F12 addition) the untrusted-REMOTE withheld toast — evidence: LIVE (orchestrator, dev app): toast "Claude Code hasn't trusted this folder on <mini-host> yet, so /session-restore was not typed. Trust the folder, then type /session-restore." role=alert; the pane on the mini sat on the trust dialog, nothing typed. FRESH runner: 3 files / 45 tests green, tsc 0; own mutants KILLED (trusted, argv, full user@host, workspace wired to `console.info`); SURVIVED (code correct, unpinned): the `!cancelled` term (a throwaway spec proved it) and the pane reading the prop instead of the latest-ref (no effect today: `setInjectFailure` is stable) → both become verify-codify tests; plus the stale "passes no handler" comment above `fireAutoResume` in `XtermPane.tsx` (fix at codify).
  - [x] verify-human
    - [x] P2.verify-human.1 (c) AC-8.2 as built: an open = 2 remote execs (open check + the spawn's own), was 4; the spec said ONE. — operator: "Accept 2 execs" (2026-11-17).
    - [x] P2.verify-human.2 (c) AC-7.2: keep the 1500 ms settle for remote panes — operator: "Keep 1500 ms" (2026-11-17); readiness-only probe stays backlogged (low).
    - [x] P2.verify-human.3 (c) No manual hint for an untrusted REMOTE folder → the workspace toast — operator: "Add a workspace toast", then on seeing it live: "Approve" (2026-11-17).
      — build (2026-11-17): `autoResumeFire.withheldNotice(projectPath, command)` (remote key → "Claude Code hasn't trusted this folder on <short host> yet, so <command> was not typed. Trust the folder, then type <command>."; local → null: its picker row already warned); `fireAutoResume`'s new `onWithheld` sink fires it only when trust withheld an injection; `XtermPane`'s `onAutoResumeWithheld` prop (latest-ref, no spawn-effect dep) → `Workspace` → the existing workspace toast (`setInjectFailure`). Tests: unit (`autoResumeFire.test.ts` +4), the real pane (`autoResumeFireLive.test.tsx` +2: remote untrusted → one notice naming host + command; local untrusted / trusted remote → none), the real Workspace (`remoteHookWarningToast.test.tsx` +1). Mutants (fire never calls the sink; the pane doesn't pass it; the workspace doesn't wire it; a notice for local paths) → 4/4 FAILED, restored. LIVE (dev app reloaded, scratch entry un-trusted): the workspace toast read "Claude Code hasn't trusted this folder on <mini-host> yet, so /session-restore was not typed. Trust the folder, then type /session-restore." (role=alert; screenshot `scratchpad/live/withheld-toast.png`); the pane on the mini sat on the trust dialog, "❯ No, exit", nothing typed. Re-trusted; clean close.
    - [x] P2.verify-human.4 (c) FAILED-cosmetic: the Docs tab on a remote row reads the `ssh://` key as a local path — operator: "add it to the wbs plan as a new wp" → `wbs.md` WP9 "No raw local-fs errors on a remote workspace" (overlap with WP7.3 / WP6 stated there).
  - [x] verify-codify
    Test scope: full — suite not long (`pnpm verify:auto` Last 58s in runtimes.md)
    — evidence: owed tests written: `autoResumeFire.test.ts` "no notice for a run cancelled during the trust read" (+ positive control), `autoResumeFireLive.test.tsx` "a handler swapped by a re-render before the fire is the one told" (the real XtermPane); the runner's two survivors re-made (drop `!cancelled`; read the prop instead of the latest-ref) → each 1 FAILED, restored. Stale "passes no handler" comment in `XtermPane.tsx` corrected. Already covered, not duplicated: the arms (`remoteRow.test.ts`, `pickerRemoteLive.test.tsx` = the consuming surface, the picker funnel), the trust read + settle (`remote_link::tests`), AC-6 (`cc_session::tests`), the one-exec reach (both guards), the remote slug (`remote_cmd`), the workspace toast (`remoteHookWarningToast.test.tsx`). Not codifiable: the 6/6 live remote auto-resume (needs the mini; its pieces are each tested). Full gate `pnpm verify:auto` → EXIT=0 (46s): vitest **3930/3930**, cargo lib 1302 passed / 4 ignored.

- [x] Phase 3: Detach
  **Observable outcomes:**
  - CLI: `cargo test`: `CcSession::detach()` defaults to `Unsupported` (local); the remote impl sends no `/exit`, no cancel, no end-session, and its terminal's end is not classified as a reconnect; mutation-proven.
  - CLI (state-changing, scratch remote folder): Detach on the scratch remote tile → the tile is gone (bridge DOM), `tmux -L claudesk-dev ls` on the mini still lists the session and CC is still running in it (`ps` on the mini), `session-state.json`'s flag is still set, the record is `running`; reopening labels **Reconnect** and attaches to the same session.
  - CLI: Detach with the link down (master killed) closes the tile at once and touches nothing remote.
  - Browser: local tiles show no Detach (bridge DOM); `LinkOverlayStatus::Detached` is gone (`grep` finds no `detached` variant).
  **Alignment questions:**
  - Detach beside × and ⏸ on the remote tile, with no confirm (A1, A2), seen live: still what you want?
  - [x] P3.1 `CcSession::detach()` (default `Unsupported`); `RemoteCcSession::detach`: mark detached (no reconnect), SIGHUP the local ssh, drop the hold; a `cc_detach` command (worker/async per `sync_commands_do_not_block.rs`) that removes the session so the pane's unmount `cc_kill` finds nothing. Remove `LinkOverlayStatus::Detached` and its docs.
    — as built: `hang_up_steps` = `kill_steps` minus the clean-exit step (pure; `kill` and `PtyCcSession::hang_up` share `run_teardown`); `RemoteTerminal::hang_up`; `CcSession::{can_detach (false), detach (Unsupported)}` + `CcError::Unsupported`; `RemoteCcSession::detach` = mark closed (reuses `killed`: the end classifies `Ended`, a reconnect wait gives up) + `hang_up`, NO copy-mode cancel / `begin_close` / end-session / record write; `SessionRegistry::take_detachable` (a non-detachable session stays registered); `cc_detach` (sync like `cc_kill`: take under a short lock, detach on a worker, `record_workspace_close`), registered. `LinkOverlayStatus::Detached` + TS `"detached"` + its tooltip removed; arch line 392 updated (§E rows 363/365 left for finalize, per the spec). Tests: `remote::tests::detach_hangs_up_the_terminal_and_touches_nothing_remote`, `…detach_with_the_link_down_cancels_the_reconnect_wait…` (bounded, so a regression FAILS instead of hanging), `hang_up_is_the_kill_sequence_without_the_clean_exit`, `a_local_session_cannot_detach_and_detach_leaves_it_registered`, `a_detachable_session_is_taken_out_for_its_detach`, caller guard `cc_detach_takes_a_detachable_session_and_detaches_it_on_a_worker`; the `"detached"` wire value now fails to parse. Mutants (kill instead of hang_up; no closed mark; record Ended; plain `take`; registry ignores `can_detach`) → 5/5 FAILED, restored. ⚠️ The first run of the "no closed mark" mutant HUNG the suite (unbounded wait); the hung binary was killed, the file restored from its pre-mutation copy, and the test bounded.
  - [x] P3.2 Detach on remote tiles (`TileActionButton`, beside × and ⏸): `cc_detach`, then the UNCLEAN close (flag kept), record stays `running`.
    — as built: `state/detachWorkspace.ts` `detachThenClose` (detach FIRST, then the unclean close; a failed detach KEEPS the tile, since closing it would run the unmount `cc_kill` that ENDS the remote session; a "no such session" closes); a third tile control `filmstrip-detach-<id>` ("⇥", blue hover, below the ⏸, revealed with it) on REMOTE tiles only (both layouts); `App.requestDetach` (no confirm dialog, AC-4.1); a failed detach's reason reaches THAT workspace's toast through a new `notice` prop (`App` → `CenterStage` → `Workspace`, adjusted during render, not in an effect). Tests: `detachWorkspace.test.ts` (4), `linkOverlayRender.test.tsx` (+2: remote tile only, both layouts), `remoteHookWarningToast.test.tsx` (+1), `src/__tests__/detachWiring.test.tsx` (3, the REAL App: remote only; `cc_detach {sessionId}` before any `cc_kill`, no `session_state_mark_clean`, no confirm while busy; a failed detach keeps the tile + toast). Mutants (close before detach; close after a failed detach; detach on local tiles; detach closes CLEAN; notice ignored; App doesn't wire it) → 6/6 FAILED, restored. Gate `pnpm verify:auto` EXIT=0 (69s): vitest **3940/3940**, cargo lib **1308** passed / 4 ignored.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (69s, 2026-11-17; no code changed after it): lint 0 errors (1 pre-existing warning); `format:check` clean; `tsc --noEmit` clean; `check:link` clean; vitest **3940/3940**; `cargo fmt --check` clean; `cargo clippy --all-targets -D warnings` clean; `cargo test` lib **1308 passed / 4 ignored**, integration suites green (incl. `sync_commands_do_not_block`, so the new sync `cc_detach` blocks nothing). Targeted at build: 11 mutants (5 Rust, 6 TS) each FAILED.
  - [x] verify-self
    - [x] P3.verify-self.1 cargo test: detach default Unsupported; the remote impl sends no /exit, no cancel, no end-session; its end is not a reconnect; mutation-proven  <!-- status: PASS after the in-place fix -->
      — evidence (FRESH runner): 7/8 own mutants KILLED: `hang_up_steps` keeping the clean exit; `hang_up` walking `kill_steps` (source guard); `detach` → `t.kill()`; `detach` + `end_session`; `detach` without the closed mark (bounded, 9 s, no hang); default `detach` → `Ok`; `cc_detach` → `session.kill()` (source guard). ⚠️ SURVIVED (realistic): **M3** `impl RemoteTerminal for PtyCcSession`'s `hang_up` body `PtyCcSession::hang_up(self)` → `CcSession::kill(self)` (a real Detach would cancel copy-mode and type `/exit`): the remote tests use a `FakeTerm`, and a `PtyCcSession` cannot be built in a test (needs an `AppHandle`).
      — in-place fix (shortcut): `remote::tests::the_real_terminal_hangs_up_without_exit_and_kills_with_it` pins BOTH delegation bodies by EXACT equality (`PtyCcSession::hang_up(self)` / `CcSession::kill(self)`). M3 re-made → `cargo test --lib` FAILED 1308/1; restored.
      — FRESH re-verify runner: M3, `hang_up` → `RemoteTerminal::kill`, → `run_teardown(&kill_steps)`, the two bodies swapped, and the inherent `PtyCcSession::hang_up` → `kill` → 5/5 FAILED; the kill-only half (`kill` → `PtyCcSession::hang_up`, which would stop a close ending the session) then FAILED too (orchestrator). Restores shasum-matched. Gate `pnpm verify:auto` EXIT=0 (68s): 3940 / 1309.
    - [x] P3.verify-self.2 LIVE Detach (<user>@ scratch row, dev app) — evidence: open → `cd-f37d9999` (created 10:29:30, attached), CC pid 70393 = the pane's process, flag set, record `running`; ⇥ click → the tile gone, NO confirm; on the mini the session still listed (now unattached) and pid 70393 still running `claude`; flag still set, record still `running`; no local `ssh` left (link released). Reopen → the row read "↻ reconnect"; the click attached to the SAME session (created 10:29:30, pane pid 70393), flag unspent.
    - [x] P3.verify-self.3 LIVE Detach with the link down — evidence: reattached, then `kill -9` the host's `ssh -M` → the pane's reconnect strip showed; ⇥ → the tile gone **10 ms** after the click (in-page timer); the mini session and pid 70393 untouched; no local `ssh` left; flag/record unchanged.
    - [x] P3.verify-self.4 local tiles show no Detach; `Detached` gone — evidence: live DOM: remote tile `filmstrip-detach-ws-1` present (label "Detach claudesk-scratch-remote: close it here and leave its Claude Code session running"), local `scratch-a` tile has none; `LinkOverlayStatus` has no `Detached` variant (only the doc comment explaining its removal), no `"detached"` in non-test TS.
    - [x] align: Detach beside × and ⏸ with no confirm — CAPTURED: `scratchpad/live/detach-control.png` (the remote tile's cluster revealed: ×, ⏸, ⇥ stacked; revealed by applying the hover rule's styles inline for the capture, since programmatic focus does not set `:focus-within` in a background WKWebView window, the shipped ⏸ behaves the same).
    — after the checks: reopened and closed the scratch row with × (session ENDED: no tmux server, flag cleared, record `ended`); closed `scratch-a`; dev app stopped (no `ssh` left).
  - [x] verify-human
    - [x] P3.verify-human.1 (a) Detach beside × and ⏸ on the remote tile, with no confirm (A1, A2), seen live — operator: "Approve" (2026-11-17).
  - [x] verify-codify
    Test scope: full — suite not long (`pnpm verify:auto` Last 69s in runtimes.md)
    — evidence: no new tests needed; every verified behaviour already has a mutation-proven regression test written at build/verify-self: `remote::tests::detach_*` (no /exit, no cancel, no end, no record, not a reconnect; link-down, bounded), `the_real_terminal_hangs_up_without_exit_and_kills_with_it` (the real `PtyCcSession` seam, exact), `cc_session::tests::{hang_up_is_the_kill_sequence_without_the_clean_exit, a_local_session_cannot_detach_and_detach_leaves_it_registered, a_detachable_session_is_taken_out_for_its_detach, cc_detach_takes_a_detachable_session_and_detaches_it_on_a_worker}`, the `"detached"` wire value rejected (`status_broadcaster`), `detachWorkspace.test.ts`, `linkOverlayRender.test.tsx` (remote-only control), `remoteHookWarningToast.test.tsx` (notice), and the consuming surface `src/__tests__/detachWiring.test.tsx` (the REAL App: tile control → `cc_detach {sessionId}` → unclean close; no confirm; failure keeps the tile). AC-4.2's chain is covered link by link (no record write; unclean close; Phase 1's `decide_open` live+running → reconnect). Full gate `pnpm verify:auto` EXIT=0 (68s, after the last code change): vitest **3940/3940**, cargo lib **1309** passed / 4 ignored.

- [x] Phase 4: Closed while offline + the R-4 dialogs
  **Observable outcomes:**
  - CLI: `cargo test`: a close/quit whose `close_exec` returns `LinkNotUp` (or whose end fails) writes `end-pending`; a confirmed end writes `ended`; a dead session with `end-pending` clears it and resumes without asking; mutation-proven.
  - CLI (state-changing, scratch remote folder): with the master killed and the link held down, × on the scratch tile → a toast says the session could not be ended and the next open will ask (bridge DOM); the session still runs on the mini; the record is `end-pending`; the next open (link back) shows dialog A; **End it and open** ends the tmux session (gone from `tmux ls`) and opens per the two-signal rule; repeating with **Reconnect** attaches to the same session; **Cancel** opens nothing and leaves the record.
  - CLI (state-changing): a live `cd-*` session with no record (record file entry deleted) → dialog B; **End it and start fresh** ends it and starts CC; **Reconnect** attaches.
  - Browser: an unreachable host at open (dev host alias pointing nowhere, or Tailscale-down simulation via a bad alias) → the error toast offers **Retry**, which re-runs the check.
  **Alignment questions:**
  - Dialog A and dialog B wording and buttons, seen live: still what you want?
  - The link-down close toast and the Retry toast (A6), seen live: still what you want?
  - [x] P4.1 `end-pending` written in `RemoteCcSession::kill` when the remote end is not delivered (close and quit); an event to the frontend for × / ⏸ → the close-time toast.
    — as built: the record write landed in P1.2; new port `RemotePorts::close_not_ended` called by `kill` ONLY on a failed/undelivered end (after the record); `AppPorts` emits `remote-close-not-ended` {projectPath, host} (`REMOTE_CLOSE_NOT_ENDED_EVENT`, TS mirror `state/remoteCloseNotEnded.ts`); `App` listens once and shows an app-level `app-toast` (role=alert, dismissable; the workspace is already gone). A quit takes the same path and shows nothing (the app is going away). Tests: `remote::tests::a_close_that_could_not_end_the_session_tells_the_app_once_and_one_that_did_does_not` (LinkNotUp + a failed run; not on success, not on Detach), `the_close_not_ended_event_matches_its_ts_mirror`, `detachWiring.test.tsx` "the app shows the close-not-ended toast…" (the real App).
  - [x] P4.2 `remote_end_session` (async): cancel + end over the link, record → `ended`; used by both dialogs' End buttons, followed by the normal open decision.
    — as built: `remote_link::commands::remote_end_session` (async, `on_blocking_worker`; in `ASYNC_COMMANDS`): hold → `begin_close` (a racing respawn waits) → `cancel_copy_mode` → `end_session` → `settle_end` (records `ended` ONLY on a delivered end; a failure writes nothing and says why); the link lingers `OPEN_CHECK_GRACE` for the re-check. Registered. Tests: `ending_the_session_records_ended_only_when_the_end_ran`, caller guard `remote_end_session_marks_the_close_cancels_then_ends_and_settles`.
  - [x] P4.3 Dialogs A and B in the picker open funnel (shared by both doors), replacing Phase 1's interim toasts; Cancel opens nothing.
    — as built: `remoteOpenPlan` → `{open:"ask", kind:"end-pending"|"unrecorded", message}`; `remoteAskSpec` (A: "End it and open" [default] / Reconnect / Cancel; B: Reconnect [default] / "End it and start fresh" [danger] / Cancel; Esc → cancel) rendered with the existing `ConfirmModal`; `ProjectPicker.resolveAsk`: End → `remote_end_session` then `handleOpenRecent` again (same door; the check now decides), Reconnect → `openReconnect` (the reconnect door), Cancel → nothing. Test triage: 5 Phase-1 tests encoded the interim refusal (obsolete by AC-5.1/5.2/5.4, high confidence) → rewritten. Tests: `remoteRow.test.ts` (ask arms, both dialog specs), `pickerRemoteLive.test.tsx` (each dialog + default, Reconnect, End → end → re-check → open via the same door, Cancel, a failed End).
  - [x] P4.4 Retry on the unreachable-at-open toast.
    — as built: the plan's `offerRetry` (unreachable only; never Remove); the toast's Retry re-runs `handleOpenRecent` with the same door. Test: `pickerRemoteLive` "an unreachable host … offers Retry … and Retry checks again". Phase 4 mutants: 4 Rust + 6 TS → 10/10 FAILED, restored. Gate `pnpm verify:auto` EXIT=0 (70s): vitest **3948/3948**, cargo lib **1313** passed / 4 ignored.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (70s, 2026-11-17; no source changed after it): lint 0 errors (1 pre-existing warning); format / tsc / check:link clean; vitest **3948/3948**; cargo fmt / clippy `-D warnings` clean; cargo lib **1313 passed / 4 ignored**; integration suites green (incl. `sync_commands_do_not_block` with the new async `remote_end_session` listed). Targeted at build: 10 mutants FAILED.
  - [x] verify-self
    - [x] P4.verify-self.1 cargo test: close/quit LinkNotUp → end-pending; confirmed end → ended; dead + end-pending → cleared, resumes without asking; mutation-proven  <!-- status: PASS after the in-place fix -->
      — evidence (FRESH runner): M1–M7 KILLED (close Err arm records Ended / nothing; a `Run` error records Ended; `clear_end_pending` forced false; dead + EndPending asks; `settle_open_decision` ignores the clear; `settle_end` records on Err). ⚠️ SURVIVED (realistic): **M8** `SessionRegistry::kill_all` (the QUIT) calling `detach()` for detachable sessions, so a quit would leave remote sessions running with no record (the only `kill_all` test used non-detachable fakes). Stated residuals, not fixed: `AppPorts::record` → `remote_record::record_state` is not driven (no `AppPorts` in tests: it needs an `AppHandle`; `record_state` itself is tested); `remote_end_session` / `remote_open_check` routing pinned by source guards (their behaviour by `settle_end` / `decide_open` / `settle_open_decision` tests).
      — in-place fix (shortcut): `cc_session::tests::a_quit_kills_a_detachable_session_never_detaches_it` (a `RecordingDetachable` fake: the quit must call `kill`, never `detach`). M8 re-made → FAILED 1313/1; restored.
      — FRESH re-verify runner: M8, skip detachable sessions, detach-then-kill, drop the remote id → each FAILED; survivor Mc (detach only as a fallback when `kill` fails: still records, but a failed kill reported as killed) → closed by extending the test with a FAILING detachable kill (no detach, not reported) → Mc FAILED 1313/1 (orchestrator); restored. Gate `pnpm verify:auto` EXIT=0 (75s): 3948 / 1314.
    - [x] P4.verify-self.2 LIVE link-down × → toast, end-pending; dialog A Cancel / Reconnect / End it and open — evidence (<user>@ scratch row): open → `cd-f37d9999` (10:56:26); `kill -9` the `ssh -M`, × at once → no confirm, APP toast "Couldn't end the Claude Code session on <mini-host>: it isn't reachable, so the session is still running there. The next time you open it, Claudesk will ask whether to end it or reconnect." (role=alert), record `end-pending`, flag cleared (×), session alive. Reopen: row "closed offline" → dialog A "Still running on the host / You closed this while <mini-host> was unreachable, so its Claude Code session is still running there." [End it and open (default) / Reconnect / Cancel]. **Cancel** → nothing opened, record still `end-pending`, session alive. **Reconnect** → attached the SAME session (10:56:26), record `running`. Again link-down × → `end-pending`; **End it and open** → the old session ended, a NEW one (10:57:57) started by the two-signal rule: no flag + trusted remote `.session.md` → `/session-restore` landed (transcript user turn + `SCRATCHRESTOREOK`).
    - [x] P4.verify-self.3 LIVE dialog B — evidence: Detach (session lives, record `running`) + the record entry deleted → reopen → dialog B "Already running on the host / A Claude Code session for this project is already running on <mini-host>." [Reconnect (default) / End it and start fresh (danger) / Cancel]. **Reconnect** → the SAME session (10:57:57), record `running`. Again (Detach + drop the record) → **End it and start fresh** → the old session ended, a NEW one (10:59:03), record `running` (flag set by the Detach → `--continue`).
    - [x] P4.verify-self.4 LIVE unreachable at open → Retry — evidence: a dev-only row `<user>@claudesk-unreachable.invalid` → click → toast "could not resolve hostname …: is Tailscale running?" with **Retry** (no Remove), nothing opened; Retry → the toast went "Connecting to …" → the same unreachable toast + Retry (the check ran again).
    - [x] align: dialogs A/B wording + buttons — CAPTURED `scratchpad/live/dialog-a.png`, `dialog-b.png`; the link-down close toast + the Retry toast — CAPTURED `scratchpad/live/close-not-ended-toast.png`, `retry-toast.png`.
    — note: a hand-edit of the dev `projects.json` (adding the unreachable row) first dropped `last_opened_at`; the app refused to parse it ("missing field") and wrote nothing; fixed and reloaded. Cleanup: the scratch session closed with × (no tmux server on the mini); the unreachable row removed through its own Remove (the row set equals the pre-run set, 9 rows); dev app stopped.
  - [x] verify-human
    - [x] P4.verify-human.1 (a) Dialog A and dialog B wording and buttons, seen live — operator: "Approve"; after a clarifying re-ask (the first toast question read as pick-one), "Misunderstanding, both OK" (2026-11-17).
    - [x] P4.verify-human.2 (a) The link-down close toast and the Retry toast, seen live — operator, on the re-ask: "got it. both are right then" (2026-11-17).
  - [x] verify-codify
    Test scope: full — last phase
    — evidence: no new tests needed; every Phase 4 behaviour already has a mutation-proven regression test from build/verify-self: `remote::tests::{a_close_whose_end_ran_records_ended_and_one_that_could_not_records_end_pending, a_close_that_could_not_end_the_session_tells_the_app_once_and_one_that_did_does_not, the_close_not_ended_event_matches_its_ts_mirror}`, `cc_session::tests::a_quit_kills_a_detachable_session_never_detaches_it` (incl. a failing kill), `remote_link::commands::tests::{a_dead_session_starts_and_clears_a_stale_end_intent, ending_the_session_records_ended_only_when_the_end_ran, remote_end_session_marks_the_close_cancels_then_ends_and_settles}`, `remote_link::tests::settling_an_open_decision_clears_a_stale_end_intent_and_leaves_the_notice`, `remoteRow.test.ts` (ask arms, both dialog specs, Retry), and the consuming surfaces `pickerRemoteLive.test.tsx` (dialogs A/B: default, Reconnect, End → end → re-check → open, Cancel, failed End; Retry) and `detachWiring.test.tsx` (the app toast via the real App). Full suite `pnpm verify:auto` EXIT=0 (75s, after the last code change): vitest **310 files / 3948**, cargo lib **1314** passed / 4 ignored, every integration target green.

## Current Node
- **Path:** Feature > finalize
- **Active scope:** the review's CRITICAL fixed in refactor (`remote_record` serialized, mutation-proven); MAJOR + MINORs backlogged. Next `/feature-finalize`.
- **Blocked:** none.
- **Unvisited:** finalize (delete-on-resolve WP3 `…RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`, WP3 `…CC-SESSION-MODULE-SIZE`, WP4 `…OVERLAY-KEY-DERIVED-TWICE`, WP4 `…TWO-SEQUENTIAL-SPAWN-EXECS`, with CHANGELOG lines)
- **Open discoveries:** see Discoveries

## Code-Quality Review

### Code-Quality Review — m17-wp5-lifecycle

(Reviewed the ship commit `67dec33`, 2026-11-17, by a fresh `code-quality-reviewer`.)

#### Strengths
- The `RemotePorts` / `RemoteTerminal` seam (`cc_session/remote.rs`) properly resolves the WP3 MAJOR `…RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`: the reconnect loop, exit latch, overlay edges and close order are driven by a recording fake, the `include_str!` guards they replaced are gone, and `RemoteShared` no longer holds an `AppHandle`.
- The open decision is decomposed into small pure functions (`decide_open`, `settle_open_decision`, `settle_end`, `startAnnounced`, `remoteOpenPlan`) with consistent safe-side defaults; the two-signal precedence keeps ONE home in `predictAction` (Rust returns signals, not a resolved arm).
- The tmux command builders are careful: a start never attaches, the `=name` / `=name:` exact targets document the tmux 3.8 trap found live, exit codes 3/4 are classified rather than inferred, and only trusted keys cross the link.
- Detach is fail-safe: `take_detachable` never removes a local session; `detachThenClose` detaches FIRST and keeps the tile when the detach fails.
- Closes three prior findings: the WP3 module split, WP4 `…OVERLAY-KEY-DERIVED-TWICE`, WP4 `…TWO-SEQUENTIAL-SPAWN-EXECS`.

#### Issues
**CRITICAL**
- [src-tauri/src/remote_record/mod.rs `update`/`write`] Lost-update race between concurrent record writers: whole-file read-modify-write with no lock and one shared temp name. `SessionRegistry::kill_all` (the quit) runs each session's `kill()` on its own thread; with the link down every remote kill writes `EndPending` at once, so with ≥2 remote workspaces one row can be reverted to `running` and the next open silently reconnects (no dialog A, and no close-time toast on a quit): the exact silent non-action AC-5 prevents. The shared temp can also rename a half-written file in, which reads as an empty map. `session_state` documents this hazard; `config_store` pins it. — Fix: a process-wide lock around `update` + a concurrent-writers test. → **refactor (F40)**.
  - ✅ **FIXED in refactor (2026-11-17):** `remote_record::WRITE_LOCK` (a process-wide `Mutex`) serializes `update`'s whole read-modify-write, which also makes the shared temp name safe; the doc comment's "never a wrong action" claim corrected. Test `concurrent_writers_never_lose_each_others_records` (8 threads × 25 keys, behind a barrier): with the lock removed it FAILED 3/3 runs (writers collided on the temp file); restored. Gate `pnpm verify:auto` EXIT=0 (72s): vitest 3948, cargo lib 1315.

**MAJOR**
- [cc_session/mod.rs `running_drive_mode` / `record_remote_spawn`; cc_session/remote.rs `RemoteSpawn`; remote_cmd/mod.rs `OpenFacts` / `SpawnFacts`] The reconnect's drive mode is `Option<Option<String>>` (`Option<&Option<Option<String>>>` at two sites) with four positional meanings, and `RemoteSpawn.attach: bool` duplicates `running_mode.is_some()`, kept in step by hand in `cc_spawn_remote`. Same shape as WP3 `…REMOTE-HOST-STORED-TWICE`. An enum (`SessionMode { Unknown, None, Mode(DriveMode) }` + `RemoteOpen { Start, Attach(SessionMode) }`) would self-describe; the exact-text caller guards pin today's spelling. → auto-backlogged (Mode 3).

**MINOR** (auto-backlogged, Mode 3)
- [announce/mod.rs, above the remote branch] A stale "a REMOTE row announces nothing yet" comment directly above the code that now announces remote rows.
- [cc_session/mod.rs `take_detachable` / `take`; ProjectPicker.tsx `openReconnect` / `resolveAsk` / `handleOpenRecent`] Two doc blocks displaced onto the wrong function by insertion; the orphaned `handleOpenRecent` JSDoc states the "BOTH doors funnel through here" invariant that `openReconnect` (its own `record_open`) now breaks for the dialogs' Reconnect.
- [Workspace.tsx `setInjectFailure`] The workspace toast slot now carries five sources, last writer wins (a start notice can be overwritten ~1.5 s later by the withheld notice). → appended to WP4 `…HOOK-WARNING-SHARES-INJECT-TOAST`.
- [state/remoteCloseNotEnded.ts `closeNotEndedText`] Always says "it isn't reachable", but `close_not_ended` also fires when the end ran (link up) and failed; and the toast names only the host, not the project.
- [state/detachWorkspace.ts] "already gone" is a substring match on Rust's `CcError::UnknownSession` Display text (`no such session`) with no shared constant or wire test.
- [remote_cmd/mod.rs `DRIVE_MODES`] A second hand-kept copy of the closed drive-mode set `config_store::DriveMode` defines.
- [cc_session/remote.rs `SessionExists` arm] The comment says the record is untouched, but `record_remote_spawn` already wrote `running` when the local ssh started; the sibling race (tmux's own `duplicate session`) records `Ended` and asks via dialog B.
- [remote_link/commands.rs `dense_body`; cc_session/mod.rs `fn_at` + an inline copy] Three "dense production body" helpers with different cut rules (one cut wrong during this WP).
- [several] ~23 new comment lines cite WIP node labels (`P4.verify-self.1`, `F9b`, …). → appended to WP3 `…WIP-LABELS-IN-PRODUCTION-COMMENTS`.

#### Assessment
A well-structured WP that advances the remote-session architecture and resolves three outstanding review findings; the behavioural seam, the pure decision functions, the fail-safe defaults and the detach ordering are the right foundation for WP6/WP7. The one defect is in the new local store: `remote_record` copies the whole-file read-modify-write pattern this repo already documents as a lost-update hazard, and the quit's parallel `kill_all` hits it, producing the silent reconnect this WP exists to prevent; fix it before WP6 adds writers. Readability debt concentrates in the nested-Option drive-mode encoding plus the redundant `attach` flag. At finalize, delete (as resolved, with CHANGELOG lines) WP3 `…RECONNECT-LOOP-HAS-NO-BEHAVIOURAL-SEAM`, WP3 `…CC-SESSION-MODULE-SIZE`, WP4 `…OVERLAY-KEY-DERIVED-TWICE`, WP4 `…TWO-SEQUENTIAL-SPAWN-EXECS`.

#### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Retrospect
- **What changed in our understanding:**
  - The remote account matters as much as the remote host. Moving the mini's dev user to the personal account (mid-WP, operator request) surfaced two first-run facts the admin account had hidden: `claude` lived only on the INTERACTIVE PATH (`.zshrc`; `zsh -lc` misses it), and CC's one-time Bypass Permissions warning defaults to "No, exit", which an auto-fired command's `\r` answers (backlogged high; WP1 had already flagged it as "WP5 input").
  - "One remote exec per step" is a whole-call-graph property; five fresh verify-self rounds each found one new route past per-function source guards. Closing it BY CLASS (an allow-list of module items + banned ssh entry points + every registry use) converged; a behavioural exec-count harness is the real fix (backlogged).
  - tmux 3.8's option commands refuse a bare `=name` target (`-q` hides it): use `=name:` (found live in Phase 1).
- **Assumptions that held:** the one-exec open check extended cleanly to `.session.md` + remote trust; returning SIGNALS from Rust (not a resolved arm) kept the two-signal precedence in one place; the existing `ConfirmModal` carried both R-4 dialogs; the default 1500 ms settle stays sound on a remote pane (6/6 landed, readiness arrives ~1.2 s before it).
- **Assumptions that were wrong:**
  - "A lost record write costs a label, never a wrong action, because the open check decides" (the `remote_record` doc): the quit's parallel `kill_all` could lose an `end-pending`, turning dialog A into a silent reconnect. Caught by the code-quality review (CRITICAL), fixed with a serialized write.
  - AC-8.2's "the open's remote checks are ONE exec": respawns reach the spawn without an open check, so an open is two execs (was four); accepted by the operator.
  - A remote untrusted folder could rely on "the existing manual hint": that hint is a picker label from LOCAL state, so a remote row had none; the operator asked for a workspace toast.
- **Approach delta:** Detach closes the tile (no Detached tile, spec ruling), so Phase 3 needed a no-`/exit` hang-up (`hang_up_steps`) rather than a tile state; Phase 4 added an APP-level toast (the workspace is gone when a close cannot end its session); the Docs-tab raw-error finding became WBS WP9; the readiness-only settle and the exec-count harness went to the backlog.

**Feature complete:** M17 WP5 (remote lifecycle) has shipped. Opening a remote workspace now reconnects to a session Claudesk left running, resumes a dead one from the remote's own signals, and asks (dialog A or B) whenever the session's state is unclear; Detach leaves a session running on purpose. Seen live on the mini's scratch folder in the dev build; the installed-build check is WP8's. Requester = operator — closure notice for self-record.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
- [SHORTCUT-2026-11-16] P1.verify-self.2 — re-run found 3 call-site survivors: C3 (`remove_project` not calling `remove_project_and_record`) is caught by the project gate (`pnpm verify:auto`'s clippy `-D warnings` dead_code, confirmed by the runner); B5 (`if false { record_remote_spawn(…) }`) and B6 (mode argument → `None`) fixed in place by extending the just-written caller guard `a_remote_spawn_records_running_through_record_remote_spawn` (full argument list + top-level-statement check). Re-verified by a fresh runner subagent.
- [SURFACED-2026-11-16] Phase 1 build — notes for verify / later phases (not backlog items):
  - P1.1 moved the remote session into `cc_session/remote.rs` (+ `remote/tests.rs`) behind `RemotePorts` (the WP3 module-size MINOR rides along). 12 mutants of the loop/latch/edges/close order all killed. The four retired `include_str!` guards' properties are now driven; the drive-mode guard was narrowed to the `RemotePorts` surface (+ `RemoteShared` holds no `AppHandle`).
  - P1.3 changed the start from `new -A` to `has-session && exit 3; new … \; set-option -q @cd_mode <mode>`, and the attach to `has-session || exit 4; attach`. ⚠️ The `\; set-option` after an ATTACHED `new` is unprobed on real tmux (no local tmux; the mini was unreachable): verify-self must confirm `@cd_mode` is set on a real start (`live_cancel_and_folder_check` covers show-options/has-session; the start's `; set-option` needs a live open).
  - AC-2.3's stale-label notice is left by the open check on the link registry (`remote_open_notice`, taken once) and read by the workspace with the hook warning: the picker is gone by the time the workspace opens.
  - The dev `projects.json` keeps a SCRATCH remote row (`~/claudesk-scratch-remote` on the mini) for Phases 2–4's live checks: REMOVE it at the feature's end (row set before: 8 rows, saved in the session scratchpad).
  - The overlay's Re-launch on an ended remote pane spawns with the default intent (`fire`, a start): over a session that is live again it exits 3 and says "reopen to reconnect". Acceptable; revisit if verify-human dislikes it.
- [SURFACED-2026-11-16] feature-spec — design-priors.md exceeds size guard (341 lines), truncated to first 100 + headings (the M17 priors at the end were read in full). Consider summarizing.
- [SHORTCUT-2026-11-17] P2.4 — the live timing leaf moved from build to verify-self: Tailscale was stopped, and the measurement IS Phase 2's third observable outcome (same scratch-row cold open), so it is taken once there.
- [SURFACED-2026-11-17] Phase 2 — the mini's dev user moved to the personal account (operator, 2026-11-17): the token moved, the admin account's Claudesk dir + hook entries retired, and the dev `projects.json`'s two remote rows (scratch + mccc, both on the admin account) are now dead. Re-add the scratch row on the personal account via the add form before P2.4. The mccc row has no clone on the personal account: leave it for the operator. A remote account whose `claude` is only on its interactive PATH (`.zshrc`) fails the preflight's `command -v claude` under `zsh -lc`; fixed on the mini with a `~/.zprofile` line. Claudesk could also fall back to `~/.local/bin/claude` (backlog).
- [SURFACED-2026-11-17] P2 verify-human.4 → `wbs.md` WP9 (new, operator ruling): no raw local-fs errors on a remote workspace (the Docs tab showed an `os error 2` for the `ssh://` key).
- [SURFACED-2026-11-17] Note on the bypass-dialog finding: WP1's probe outcomes (wbs.md, "First open on a fresh host") had already recorded the Bypass Permissions warning as "WP5 input"; WP5's spec did not pick it up. Routed to backlog (high) by operator ruling, not fixed in WP5.
- [SHORTCUT-2026-11-17] P3.verify-self.1 — M3 (the real terminal's `hang_up` delegating to `kill`) survived; fixed in place with an exact-equality guard on both one-line delegations of `impl RemoteTerminal for PtyCcSession` (no `PtyCcSession` is constructible in a test); re-verified by a fresh runner (see the leaf).
- [SHORTCUT-2026-11-17] P4.verify-self.1 — M8 (the quit `kill_all` detaching remote sessions) survived; fixed in place with a test-only addition (`a_quit_kills_a_detachable_session_never_detaches_it`); re-verified by a fresh runner (see the leaf).
