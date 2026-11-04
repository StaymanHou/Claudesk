---
workflow: task
state: close (complete)
completed: 2026-11-04
created: 2026-11-04
docs-only: true  # no code changes: the work is live checks on the installed build + backlog/WBS/CHANGELOG bookkeeping
drive_mode: autopilot
---

# Task: M16.5 WP7 — installed-build acceptance on v0.8.1

**Workflow:** task
**State:** Completed 2026-11-04
**Created:** 2026-11-04

## Problem Statement
The supervisor's on-screen checks, WP4's dot behavior and M16's hardened-runtime media check have
never been observed on an installed build; WP7 observes them on the installed, notarized v0.8.1 and
closes or rewrites `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`.

## Context
- `workflow-system/product/wbs.md` → WP7 (tasks 7.1–7.3).
- Backlog: `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` ("What still
  closes this item", checks 1–6).
- `workflow-system/product/arch/workflow-supervisor.md` §C/§D (token rule: opens a clause, not
  quoted; turn scoping), §"Only the EXECUTION workflows chain", §G (verify-human blue).
- `src/state/supervisor/verifyHumanPause.ts`: blue = most recent skill invocation in the tail is
  `feature-verify-human` (a `Skill` call OR a typed `<command-name>` line) and the supervisor did not fire.
- `workflow-system/product/arch/status-channel-and-surfaces.md` §A: a `Stop` whose only outstanding
  tasks are `monitor` type (the artifact/comment watch) maps to idle. A `Monitor`-TOOL watch arrives
  as `shell` and correctly stays purple, so it is NOT a valid probe for this.
- Installed app: `/Applications/Claudesk.app` 0.8.1, `codesign` flags `0x10000(runtime)` (hardened
  runtime ON, notarized). Logs: `~/Library/Application Support/com.claudesk.app/`
  `supervisor-activity.log`, `status-channel.log` (`Stop` lines carry `bg=` and `bg_types=`).

### Pre-read of the installed logs (2026-11-04, during planning)
- **Check 6 (GUI-PATH smoke for `claude -p`) — already PASSED by evidence:** 8
  `adjudicator-says-awaiting` verdicts carry `adjudicator (model): AWAITING` from Finder-launched
  installed builds (0.7.1 ×2, 0.8.0 ×6). The adjudicator's spawn resolves `claude` on a GUI PATH.
- **Check 5 (context-pressure recycle):** seen 3× (0.7.1 ×1, 0.8.0 ×2).
- **Check 4 negative arms:** no-stored-mode seen (18×). **ESCALATE → no fire: still unseen.**
- **Plain fires:** 4 on 0.7.1 (`bluecg-maps`, P3–P9, before the execution-workflow gate). **0 on
  0.8.1 so far** (first 0.8.1 record 2026-11-04T01:19Z).
- **Unlogged anomaly:** 0.8.0, 2026-11-01T01:59Z, `yitang-copy`, `T5a`, autopilot →
  `outcome: error`, `reason: inject-failed`, `command: null`, `detail: null`. A fire was decided and
  the injection failed; no backlog entry covers it.
- **Unlogged hazard (found during the 2026-11-04 live check):** the installed supervisor DECIDED turn
  ends on the operator's `claudesk` workspace from two FOREIGN sessions: the dev build's CC sessions
  in `claudesk/tmp/scratch/restore-test` (`69c8d03a…`, `43cf7a56…`). Both hook scripts fire machine-wide and
  `resolve_cwd` takes the longest registered ancestor, so a scratch dir inside the repo resolves to the
  `claudesk` workspace. Both records read THIS workspace's own transcript (`e50360bc…`) and withheld only
  because it was mid-turn (`transcript-incomplete`). Same root as
  `SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` (filed as dot-only, low), but
  this instance reaches the supervisor, the irreversible half.

### Probe design (provoke, don't wait)
A throwaway project **outside** the claudesk tree (`~/Tmp/wp7-supervisor-probe`, git-initialised, a
README only) so the cross-talk above cannot contaminate it. The operator opens it in the INSTALLED app
with drive mode **autopilot** and the supervisor ON. Provocations, typed by the operator:
- **AUTO-edge break (checks 1–3):** a turn that runs `sleep 20` and then ends with a task-plan-shaped
  closing line plus an emitted `TRANSITION: T2`, and calls no skill. T2 (task plan → act) is AUTO in
  autopilot, and `task` is a supervised workflow. Expect `fired` → `/task-act` plus the `⚙`. The 20 s
  window is for switching to another app (check 2). Esc on the injected turn is check 3.
- **ESCALATE (check 4):** the same shape with `TRANSITION: T3` → expect withheld, no fire.
- **Verify-human blue (7.2):** type `/feature-verify-human` in the probe workspace; it stops to ask →
  expect the dot BLUE at turn end.
- **Artifact watch grey (7.2):** needs a real `monitor`-type task (an artifact publish/comment watch).
  First look for a natural occurrence on 0.8.1 in `status-channel.log` (`bg_types=` containing only
  `monitor` with `mapped=idle`). Provoking one means publishing a private artifact, which is outward-facing,
  so ask the operator before doing it.

## Work Tree

- [x] T1 Agent: create the probe project `~/Tmp/wp7-supervisor-probe` (git init, README) and write the exact operator prompts for each provocation into this WIP  <!-- done 2026-11-04: `~/Tmp/wp7-supervisor-probe/PROMPTS.md` (A fire+⚙ / other app, B Esc, C ESCALATE, D verify-human). Prompts spell the token out in words so no literal token appears in this supervised workspace's own replies. Policy confirmed: task `plan` row autopilot=auto; `ESCALATE / REDIRECT` autopilot=pause -->
- [x] T2 7.1 (operator on-screen + agent log read): AUTO-edge break → `fired` record + `⚙` (check 1); same with another app focused at turn end (check 2); Esc interrupts the injected `/task-act` cleanly (check 3); `TRANSITION: T3` → withheld (check 4, ESCALATE). Agent reads `supervisor-activity.log` after each and records outcome/reason/edge/command  <!-- DEFERRED to dogfooding, NOT passed (operator, 2026-11-04: "skip. I'm already dogfooding") -->
- [x] T3 7.2 dots: `/feature-verify-human` in the probe → dot BLUE (operator); artifact-watch-only `Stop` → grey (log first, provoke only with the operator's OK)  <!-- DEFERRED to dogfooding, NOT passed (operator, 2026-11-04: "skip. I'm already dogfooding") -->
- [x] T4 7.2 media under hardened runtime (operator, installed 0.8.1): open a video (e.g. a `scripture-reading` render under the 4 GiB cap), a PDF and an image in an editor tab; video plays, frame-step and reload work, the PDF renders  <!-- DEFERRED to dogfooding, NOT passed (operator, 2026-11-04: "skip. I'm already dogfooding") -->
- [x] T5 Optional, same session: close a workspace in the installed app (normal close + Close Anyway) and reopen it; does the CC pane paint? (`SURFACE-2026-11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS`; dev-only so far)  <!-- DEFERRED to dogfooding, NOT passed (operator, 2026-11-04: "skip. I'm already dogfooding") -->
- [x] T6 Agent: investigate the 0.8.0 `inject-failed` record (code path that emits it with `command: null`, the `yitang-copy` transcript around 01:59Z); log a SURFACE or explain it  <!-- done 2026-11-04: BENIGN, no SURFACE. The turn ended on a real AUTO break (`Run /task-verify …` + T5a), so the supervisor rightly decided to fire; a `/exit` (queued by the operator mid-turn) ran 0.17 s after turn end, CC exited (SessionEnd 360608, SessionStart 360812), and the `cc_input` write rejected → `fanOut.ts` `inject-failed` arm, honestly recorded (`command` is null on every non-fired record by design). Nothing was injected into the restarted session. Ordinary prompts typed mid-turn are delivered to the model mid-turn, so only local commands can race this way, and an exiting session just rejects the write. -->
- [x] T7 Agent: log the supervisor cross-talk finding (update `SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` or file a new supervisor-scoped SURFACE; re-evaluate its priority; note that in-repo `tmp/scratch` fixtures trigger it)  <!-- done 2026-11-04: folded into `SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` (re-raise trigger MET; low → medium; supervisor risk assessed LOW via the per-turn fire ledger; cheapest mitigation = move scratch workspaces out of the repo tree) -->
- [x] T8 7.3: close `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` (CHANGELOG `**Backlog resolved:**` + delete, same commit) or rewrite it to what stays unseen; tick WBS WP7 7.1–7.3; clear M16's "hardened runtime: deferred, NOT passed" in `arch/right-panel-surfaces.md` if T4 passes; delete the probe workspace from the installed app  <!-- done 2026-11-04: SURFACE REWRITTEN (not closed: its rule is a positive observable, and the checks were deferred); check 6 marked PASSED; WBS WP7 7.1–7.3 ticked as DEFERRED; arch/right-panel-surfaces.md media deferral annotated; probe project deleted (never added to the installed app) -->

## Verification Observable

Verification skipped: docs-only declared at plan time. No runtime surface to verify.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** close
- **Open discoveries:** none (T7's finding is folded into SURFACE-2026-08-21)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-04] T7 — supervisor + dot cross-talk from in-repo scratch workspaces; folded into `SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` (priority low → medium).

## Retrospect
- **What changed in our understanding:** The installed logs already answered more than expected. Check 6 (adjudicator GUI PATH) was passed by 8 real installed verdicts, and the agent's own scratch-workspace convention turned out to be a routine source of cross-session hook events into the operator's `claudesk` workspace, reaching both the dot and the supervisor.
- **Assumptions that held:** The supervisor's on-screen checks can be provoked on purpose (a T2 token with no skill call is AUTO in autopilot, the ESCALATE row is PAUSE) rather than waiting for a natural break. The 0.8.0 `inject-failed` record was the honest failure path, not a silent one.
- **Assumptions that were wrong:** That WP7 would run its on-screen checks. The operator deferred them to ordinary dogfooding, so the SURFACE was rewritten, not closed. And no `monitor`-type `Stop` has ever appeared in the installed log, so the artifact-watch-grey rule is still unexercised outside tests.
- **Approach delta:** Planned as an operator-observed acceptance pass; executed as a log-evidence pass plus two side investigations (T6, T7), with T2–T5 deferred. Writing the provocation prompts to a file instead of the chat avoided pasting a literal transition token into a supervised workspace's own reply.
