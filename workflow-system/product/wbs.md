---
stage: wbs
state: complete
updated: 2026-10-20  # WP1 shipped (hook-payload probe); Q2 widened: every verify-human pause reads blue
cycle: milestone-16-5-supervisor-hardening-qol-and-paydown
---

# WBS — Milestone 16.5: Supervisor hardening, QoL and paydown bucket

**Scope of this pass:** M16.5 only (`roadmap.md` → Next → item 2). The `/product-vision` revisit
that follows it stays in `roadmap.md` and is **not** decomposed here.

**Shape:** a bucket, like the QoL buckets before it (M6, M10.5, M11.5, M13.5), but larger and with
two measurement probes up front. Each item's measured detail lives in its backlog entry, and **this
file does not repeat it**; every task cites its `SURFACE-*` id.

## Rulings — `/util-grill-me`, 2026-10-20 (SETTLED; do not re-litigate)

- ⚠️ **ONE bucket holds everything.** The picker fix is included, and nothing ships ahead of this
  WBS. *(The operator reversed the agent's recommendation to ship the picker fix as a task first.)*
- ⚠️ **The adjudicator re-measurement is IN** (WP2). It needs an operator labelling pass. *(Also
  reversed the agent's recommendation to leave it owed.)*
- **The QoL seeds are absorbed,** and ⛔ **the stale minimap is EXCLUDED.** It is feature-sized:
  upstream issue #1 needs a `drawLine` rewrite, and that is why it was pulled from M11.5. Soft-wrap
  off is the workaround. The other QoL items are listed in WP5 and WP6.
- **A code-quality paydown is the LAST WP** (WP8).
- ✅ **The supervisor gate is MET.** The installed `v0.7.1` fired four times on 2026-10-12
  (`bluecg-maps`, autopilot, P3→P5→P7→P9 in `supervisor-activity.log`). What is left is the
  on-screen half, which is WP7's acceptance.

**Assumed at the grill, not asked (correct any of these at spec):**
- **Quoted-token fix = (a), require the token at line start.** It withholds about 14% of today's
  verdicts, which R-6 names as the safe direction. An ask to mccc for one canonical token form goes
  alongside it. Option (c), an adjudicator judgment, opens only if WP2 comes back with a comfortable
  margin.
- **Both status-dot items are measure-first** (WP1). The fix is chosen from the data, and may be
  an upstream CC ask.
- **The verify-human blue-dot fix is workflow-gated**: it sits behind `workflow_features_enabled`,
  default OFF, and is byte-identical when off.

## Design-priors consult

- `[PRIOR: semantic-distance-not-just-visual-distance-for-status-colour]` **agrees** (rule 2) with the
  common-sense reading of both dot items. Purple means *ignorable*. So a verify-human pause must
  not read purple, and an idle workspace must not read purple either. Each dot item is a false
  signal of exactly the kind that prior exists to prevent.
- `[PRIOR: gate-substrate-dependent-feature-class-behind-default-off-opt-in]` **agrees** (rule 2):
  the verify-human signal needs the workflow substrate, so it goes behind the gate.
- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` **leaning toward the existing Find
  Results tab** for per-result/per-file replace: markers placed through the synthetic click-line
  seam, not a new results panel. Flag if wrong. It breaks a genuine tie (rule 3); the backlog entry
  names both options.
- `[PRIOR: escape-hatch-to-the-os-over-in-app-infrastructure]` **considered and NOT applied** to
  per-result replace. That prior covers *edge* cases, and replacing one search hit is an everyday
  editor operation (the over-infer guard).
- **No prior governs** the supervisor fixes, the hotkey rows, the alias hints, Day-view keys or VFR.
  Those are decided from common sense.

## Work Packages

### WP1: Probe — what the hook channel carries for background work and dequeued prompts ✅ SHIPPED 2026-10-20 (commit d9f13ab)

**Type:** probe
**Milestone:** M16.5. It **gates WP4**: no status-dot or turn-start change is designed before this.
**Dependencies:** none
**Size:** S
**Learning objective:** Three questions with one instrument, a live hook capture
(`[[cc-hook-capture-beats-docs]]`):
1. Does publishing or opening an artifact raise `background_task_count` on `Stop`, and does the raw
   `Stop` payload say **what** the tasks are?
   (`SURFACE-2026-10-09-ARTIFACT-WATCH-LIGHTS-THE-DOT-PURPLE-WITH-NOTHING-RUNNING`)
2. On a turn that ends at verify-human with a background shell alive, which of the three
   candidate signals is present? (`SURFACE-2026-09-29-VERIFY-HUMAN-PAUSE-WITH-A-BACKGROUND-SHELL-SHOWS-PURPLE-NOT-BLUE`)
3. Does a mid-turn dequeued `UserPromptSubmit` carry anything that tells it apart from a real turn
   start? (`SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES`)

**Timebox:** half a day.
**Success criterion:** recorded payloads for each case under "Probe outcomes", plus a per-question
verdict:
- discriminable from the hook payload,
- discriminable from the transcript, or
- needs an upstream CC ask.

**Tasks:**
- [x] 1.1 Add `background_task_count` (and, behind a dev flag, the raw `Stop` / `UserPromptSubmit`
      payload) to `status-channel.log`. The count line stays as a permanent observable; the
      raw-payload capture is removed at WP4.
- [x] 1.2 Capture in scratch workspaces:
  - a turn that publishes an artifact vs one that does not
  - a verify-human pause with a dev server alive
  - a prompt typed while a turn runs
  - a background-task notification
- [x] 1.3 Corpus count: how often a PAUSE-state turn end coincides with `background_task_count > 0`.
- [x] 1.4 Record the verdicts. ⚠️ **Never from PTY output.** CC's footer text is not a candidate
      signal.

### WP2: Probe — re-measure the adjudicator on a larger labelled set

**Type:** probe
**Milestone:** M16.5. It **gates any adjudicator tuning** and option (c) of the quoted-token fix.
It is a parallel track and blocks no other WP.
**Dependencies:** none
**Size:** M (calendar-bound by the operator labelling pass)
**Learning objective:** Where should the 0.80/0.80 accept bar sit, measured on a larger set than
the 29 scorable records the +1 margin rested on?
(`SURFACE-2026-09-15-ADJUDICATOR-MARGIN-NEEDS-A-LARGER-LABELLED-SET`)
**Timebox:** 1 day of agent work, plus the operator labelling pass.
**Success criterion:**
- A labelled set at least **3×** the M15 slice, rebuilt from the corpus (`wp1-break-fixture.json`
  is the seed, R-3).
- Pinned-sonnet scores at 0.75 / 0.80 / 0.85.
- A recorded verdict: confirm 0.80, or move the bar to a measured value.

**Tasks:**
- [ ] 2.1 Mine candidate turn ends past the M15 slice. Include turns ending after 2026-09-28, which
      the transcript-read fix changed. Pre-label mechanically wherever the policy table decides.
- [ ] 2.2 ⭐ **Operator labelling pass** on the residual (question-shaped vs not). Present it as a
      batch with the agent's proposed label on each, so most rows are a one-word confirm.
- [ ] 2.3 Score it. ⚠️ The score must come from an **independent** signal: scoring a detector
      against its own policy table returns 1.000 by identity
      (`[[detector-scored-against-its-own-table-is-circular]]`).
- [ ] 2.4 Record the verdict. If the bar moves, change `adjudicator.ts` with its pinned-model test,
      and note whether option (c) of WP3.1 is now viable.

### WP3: Supervisor correctness — quoted token, format alarm, leaked subscription

**Milestone:** M16.5
**Dependencies:** none. It needs WP2 only if option (c) is chosen for 3.1.
**Size:** M
**Tasks:**
- [ ] 3.1 **A token quoted in prose must not fire**
      (`SURFACE-2026-09-28-SUPERVISOR-FIRES-ON-A-TRANSITION-TOKEN-QUOTED-IN-PROSE`).
  - Default (a): `readTurn` accepts only a line-start token.
  - Re-run the 138-message corpus split and record what moves to withheld.
  - ⚠️ `transitionToken.ts` carries the Phase 3d regex contract moved from mccc, so file an mccc
    inbox message asking for one canonical emitted form.
- [ ] 3.2 **A positive alarm for a CC transcript-format change**
      (`SURFACE-2026-09-28-QUALITY-TRANSCRIPT-COMPLETION-WAIT-HAS-NO-ALARM-FOR-A-CC-FORMAT-CHANGE`,
      the silent-supervisor MAJOR).
  - N consecutive `transcript-incomplete` withholds for one workspace surface on the badge hint.
  - A pinned transcript fixture refreshed from a live capture, so a renamed `stop_reason` /
    `system` subtype fails a test. ⚠️ Mutation-prove both halves.
- [ ] 3.3 **The leaked workspace subscription**
      (`SURFACE-2026-09-28-A-LEAKED-WORKSPACE-SUBSCRIPTION-DUPLICATES-TURN-ENDS-AND-STEALS-THE-GEAR`).
  - Reproduce from a fresh dev launch: open A, open B, run a turn in A, and count records per
    `Stop`.
  - Find the subscription that survives unmount and fix it there. The `duplicate-turn-end` dedupe
    stays as defense.
  - Done = one record per `Stop`, and the `⚙` lands in the right pane.

### WP4: Status-channel semantics — the purple dot and turn starts

**Milestone:** M16.5
**Dependencies:** WP1 (its verdicts choose every design here)
**Size:** M (L if a question comes back "transcript"; split then)
**Tasks:**
- [ ] 4.1 **Artifact watch → no false purple**, by the mechanism WP1 found. If the count cannot be
      told apart, record an upstream CC ask and stop. Do not guess from text.
- [ ] 4.2 **EVERY verify-human pause reads blue** (AwaitingInput), whether or not a background task
      is running (operator ruling, WP1 verify-human, 2026-10-20: today ~2/3 read grey, ~1/3 purple).
      Signal: the supervisor's turn-end read (last `Skill` was `feature-verify-human` and no fire
      followed). Behind `workflow_features_enabled`, byte-identical when off.
  - ⚠️ **Decide at spec whether this owns a SEVENTH guard arm.** `arch/workflow-supervisor.md` §G
    records the supervisor as owning NO arm, because every supervisor-visible surface derives from
    `workspaceSupervisorReadout` (arm 6). A supervisor-sourced dot promotion is a new shape. Check
    whether it routes through that subject before claiming it does.
  - ⚠️ Sweep every consumer of `BackgroundWork` / `AwaitingInput`
    (`[[derived-state-is-not-a-proxy-for-its-event]]`). The four-state vocabulary is unchanged.
- [ ] 4.3 **`is_turn_start` on dequeues:** apply the discriminator WP1 found, or record that
      navigation keeps the mid-turn markers. Turn attribution (`⚙`) must be unaffected.
- [ ] 4.4 Remove WP1's raw-payload capture. Keep the count line.

### WP5: QoL batch — the papercuts

**Milestone:** M16.5
**Dependencies:** none (parallel with WP1–WP4)
**Size:** M
**Tasks:**
- [ ] 5.1 **Picker filter autocorrect**
      (`SURFACE-2026-10-19-PICKER-FILTER-AUTOCORRECT-HIJACKS-THE-ROW-CLICK`).
  - Set `spellCheck`, `autoCorrect` and `autoCapitalize` off on `picker-filter`.
  - Verify live: type `eos`, see no bubble, click the row, and the workspace opens.
  - Then sweep the other filter/search inputs and decide each one. A filter never wants
    spellcheck; the Prompt panel may.
- [ ] 5.2 **A failed delete / trash shows an error** (`SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE`).
  - `RightPanelHost.onDeleteConfirm` / `onDeleteFolderConfirm` only `console.error` today.
  - The create-collision half already errors inline. Confirm it covers a gitignored `.env`, then
    close that half.
  - Reuse an existing pattern (the picker's `pruneToast`, or an inline line in the tree) before
    building a new toast.
- [ ] 5.3 **Settings hotkey rows for the uncatalogued CM6 bindings**
      (`SURFACE-2026-09-23-CM6-GO-TO-LINE-HAS-NO-SETTINGS-HOTKEY-ROW`): ⌘⌥G go to line, ⌘G find
      next, ⌘⇧L select all matches. Move them out of `NOT_LISTED`, and keep the CM6-owned-set guard
      green.
- [ ] 5.4 **Model-alias hints from recent use** (`SURFACE-2026-07-31-MODEL-ALIAS-HINTS-COULD-BE-DYNAMIC`).
      Use the union of recently used override values and the three static aliases. Still hints,
      never validation, and the non-exhaustiveness pins stay.
- [ ] 5.5 **Day-view keyboard pan/zoom** (`SURFACE-2026-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM-DEFERRED`):
      arrows to pan, `+`/`-` to zoom, Home/End. Check the keys against the chord registry first.
- [ ] 5.6 **VFR frame-step** (`SURFACE-2026-10-20-REVIEW-PLAYER-VFR-FRAME-STEP`). Measure on a real
      macOS screen recording first. If steps skip or repeat, step by presented frames (rVFC
      `mediaTime`). If they don't, close the entry on the measurement.

### WP6: Per-result and per-file replace

**Milestone:** M16.5
**Dependencies:** none
**Size:** M
**Description:** The two replace scopes deferred at WP7 (2026-06-21) because Find Results is a
read-only synthetic tab (`SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE`).
**Tasks:**
- [ ] 6.1 ⚠️ **UX decision first**: per-row/per-file markers in the existing Find Results tab via
      the synthetic click-line seam (the prior's lean), vs a richer results panel. If the
      difference is spatial, run `/util-option-mockup` before building.
- [ ] 6.2 Backend: extend `project_replace` with a scope param and a file filter. Per-file rewrite
      already exists.
- [ ] 6.3 After a replace, re-run the search so stale rows cannot be replaced twice. Open dirty
      buffers keep the disk-conflict path.

### WP7: Installed-build acceptance — close the supervisor's live checks

**Milestone:** M16.5
**Dependencies:** WP3, WP4, and **a `/release` containing them** (operator-run; never auto-invoked).
**Size:** S (calendar-bound)
**Tasks:**
- [ ] 7.1 On the installed build, verify the three on-screen checks
      (`SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`):
  - a fire with its `⚙`
  - a fire while another app is focused
  - ⚠️ **Esc recovery**, which R-1's accepted cost rests on
- [ ] 7.2 Also on the installed build: WP4's dot behavior, and the M16 hardened-runtime media
      check if it has not been done yet.
- [ ] 7.3 Close the SURFACE with a CHANGELOG line, or rewrite it to whatever stays unseen. ESCALATE
      → no fire is the known straggler.

### WP8: Code-quality paydown (LAST)

**Milestone:** M16.5
**Dependencies:** WP3–WP7 (it runs last so it also sweeps this bucket's own review findings)
**Size:** M–L
**Description:** A `/util-backlog-paydown` sweep over the carried findings: about 10 MAJOR and 26
MINOR across the `## Code-quality findings` batches in `backlog.md`. The sweep scores and orders
them, and its temporary WBS lives inside this WP.
**Tasks:**
- [ ] 8.1 Run `/util-backlog-paydown`. Exclude what WP3.2 already took (the silent-supervisor
      MAJOR). Carry the `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` routings in as
      one decision, not N per-batch trims.
- [ ] 8.2 ⚠️ Priority inputs the sweep must see:
  - `paydown-wp9` MAJOR 1 (a real defect that can leave the single-run lock stuck; medium-high)
  - the `analytics-week-export` MAJORs
- [ ] 8.3 Execute the sweep's plan. Each resolved finding is deleted from both backlog files with
      a `**Backlog resolved:**` line.

## Dependency map

```
WP1 (probe: hook payloads) ──► WP4 (status-channel semantics) ──┐
WP2 (probe: adjudicator) ··· gates only option (c) of WP3.1      │
WP3 (supervisor correctness) ────────────────────────────────────┼──► /release ──► WP7 (installed acceptance) ──► WP8 (paydown)
WP5 (QoL batch) ─────────────────────────────────────────────────┤
WP6 (per-result replace) ────────────────────────────────────────┘
```

- **The critical path is WP1 → WP4 → release → WP7 → WP8.** WP2, WP3, WP5 and WP6 are parallel
  tracks. WP2 is calendar-bound by the labelling pass, so start 2.1 early.
- **WP1 → WP4 rationale:** both status-dot items and the turn-start item turn on what the hook
  payload carries. Designing before the capture means designing around assumed shapes, which is
  exactly the probe-first rule.
- **WP2 before any tuning rationale:** R-6's condition 3 says to measure before leaning on the
  margin. Running it in parallel keeps it off the critical path.
- **WP7 after a release rationale:** each of its checks is installed-build-only
  (`[[installed-build-verify-deferred-to-release]]`). Running it before WP3/WP4 ship would verify
  the old code.
- **WP8 last rationale:** operator ruling, and it lets the sweep include this bucket's own
  code-quality findings.

## Exit criteria (M16.5)

- No supervisor fire on a quoted token. A CC transcript-format change trips an alarm, and a test
  pins it. One activity record per `Stop` in a multi-workspace session.
- An idle workspace with an artifact watch (`monitor` task) does not read purple. With the gate ON,
  EVERY verify-human pause reads blue, with or without background work. With it OFF, nothing
  changes.
- The adjudicator bar is measured, not chosen.
- The picker click opens the row it is on. A failed delete says so. The three CM6 bindings have
  Settings rows. Per-result and per-file replace work.
- `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION` is closed on the installed
  build, or rewritten to what is still unseen.
- The paydown sweep has run and its plan is executed.

## Probe outcomes

### WP1 — what the hook channel carries (2026-10-20)

**Method.** `claudesk-hook.pl` now forwards each background task's `type`, and the dev build
forwards payload key **names**. Both shipped in `d9f13ab`. A stripped-env dev build drove real
turns in `scratch-c`. Because the dev hook is registered machine-wide, the operator's own sessions
were captured passively too.

**Key sets (CC 2.x, live):**
- `Stop`: `background_tasks, cwd, effort, hook_event_name, last_assistant_message,
  permission_mode, prompt_id, scratchpad_dir, session_crons, session_id, stop_hook_active,
  transcript_path`
- `UserPromptSubmit`: `cwd, hook_event_name, permission_mode, prompt, prompt_id, scratchpad_dir,
  session_id, transcript_path`
- A typed prompt, a queued prompt and a task-notification prompt carry the **same** key set.

**Background-task `type` values seen:** `shell` (a `run_in_background` Bash), `subagent` (a
background agent) and `monitor` (an artifact watch).

**Q1 (artifact watch → purple): ANSWERED from the hook payload.**
- Publishing one private artifact gave `Stop` `bg=1 bg_types=monitor` → `background_work`, with
  nothing running.
- So the purple comes from a `monitor`-type task, and the `type` field tells it apart from
  `shell` / `subagent` with no transcript read.
- ⚠️ For WP4: the `Monitor` tool's own watches are presumably the same type (not measured).
  Decide at spec whether any `monitor` task should count as BackgroundWork, and what an unknown
  type (`?`) should mean.
- The probe artifact (`YJZRwYuaa7YqkPVmYVg4jr`) is left for the operator to delete. The delete
  needs their confirmation.

**Q2 (verify-human pause with a live shell reads purple): SIZED; the signal is the transcript.**
- In the installed app's own `status-channel.log` (since 2026-09-25), **36 of 105** verify-human
  turn ends recorded `mapped=background_work` (as of about 19:30Z on 2026-10-20; an independent
  re-derivation by verify-self an hour later read **37 of 106**, the log having gained a turn). That
  is about a third of verify-human pauses showing *ignorable* while asking the operator to act.
- Transcript-only estimate over 45 days: 57 of 204. It is an upper bound, because 93 of 138
  background shells never log a completion.
- The hook carries no structured pause marker. `last_assistant_message` is free text, so
  inferring state from it is the PTY-text anti-pattern by another route.
- **Verdict: signal 1** (the supervisor's turn-end transcript read, which already knows the
  turn's last `Skill`), behind the gate. Signals 2 (WIP parse) and 3 (upstream) are not needed.
- ⚠️ **SCOPE WIDENED by the operator at WP1 verify-human (2026-10-20): EVERY verify-human pause
  reads BLUE (AwaitingInput), whether or not any background task is running.** So the fix also
  covers the ~two-thirds of pauses that read grey `idle` today, not just the purple third. The
  background count is NOT part of the rule. The size is all verify-human pauses (106 since
  2026-09-25), not 37.

**Q3 (`is_turn_start` on a mid-turn prompt): ANSWERED by event order; no payload field needed.**
- A prompt typed while a turn runs fires `UserPromptSubmit` **at enqueue**: mid-turn, between a
  `PreToolUse` and its `PostToolUse`, with no `Stop` in between.
- The transcript confirms it: `queue-operation: enqueue` at submit, `remove` 17 s later, then the
  prompt is folded into the running turn. ⚠️ The backlog entry's word "dequeue" is inexact: the
  hook fires at enqueue.
- **Discriminator:** a `UserPromptSubmit` for a session with no `Stop` since its previous
  `UserPromptSubmit` is not a turn start. The broadcaster already sees that order.
- A task notification that arrives while idle is a REAL new turn (`UserPromptSubmit` → `Stop`).
  It has `origin.kind: "task-notification"` in the transcript and the same keys on the hook.
- `prompt_id` is on both events, but it was not needed.

## Session Handoff — 2026-10-20 15:45
Handed off. See `workflow-system/state/.session.md` to restore.
