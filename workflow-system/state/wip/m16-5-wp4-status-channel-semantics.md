---
drive_mode: autopilot
---

# Feature: M16.5 WP4 — Status-channel semantics: the purple dot and turn starts

**Workflow:** feature
**State:** ship (complete) — `53141d4`, local `main`, not pushed (operator: push only on request)
**Created:** 2026-10-21
**Entry:** spec (complex feature)
**WBS:** `workflow-system/product/wbs.md` → WP4 (critical path: WP4 → `/release` → WP7 → WP8).
Its design basis is WP1's probe verdicts (`wbs.md` → "Probe outcomes" → WP1); do not re-derive them.
**Backlog:**
- `SURFACE-2026-10-09-ARTIFACT-WATCH-LIGHTS-THE-DOT-PURPLE-WITH-NOTHING-RUNNING` (4.1)
- `SURFACE-2026-09-29-VERIFY-HUMAN-PAUSE-WITH-A-BACKGROUND-SHELL-SHOWS-PURPLE-NOT-BLUE` (4.2, scope widened at WP1)
- `SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES` (4.3)
- `SURFACE-2026-10-20-QUALITY-WP1-DOC-COMMENT-DETACHED-FROM-ITS-TEST` (MAJOR, folded in) and the four
  WP1 MINORs (`backlog-quality-findings.md` → `# m16-5-wp1-hook-payload-probe`), which 4.4 resolves
  or makes moot

## Problem Statement

The status dot answers one glance-question: *does this workspace need me?* Two of its colours lie
today, and one of its per-event signals over-fires:

1. **Purple with nothing running (4.1).** Publishing or opening an artifact starts a `monitor`-type
   background task (a watch for comments and republishes). `Stop` counts it, so the workspace
   reads purple (BackgroundWork) for as long as the watch lives, often the rest of the session.
2. **No blue at verify-human (4.2).** The workflow's one deliberate stop for the operator never
   reads blue. Of 106 verify-human turn ends since 2026-09-25, ~69 read grey `idle` and ~37 purple.
   The operator ruled (WP1 verify-human, 2026-10-20) that **every** verify-human pause reads blue,
   with or without background work, behind the M10.9 gate.
3. **`is_turn_start` on queued prompts (4.3).** A prompt typed while a turn runs fires
   `UserPromptSubmit` at enqueue, so the turn prev/next markers get planted mid-turn.

Plus WP1's cleanup (4.4): the dev-only `payload_keys` capture comes out, and the review MAJOR on
the file this WP edits gets fixed.

### Spec-time measurements (2026-10-21; they decide the design, so they are recorded here)

- **M1 — CC's `Monitor` tool does NOT produce a `monitor` task.** A throwaway `claude -p` Stop hook
  (CC 2.1.306, types/status only recorded) showed a `Monitor`-tool watch on `sleep 15; echo
  probe-done` arrive as `type: "shell"`, with the tool-use stream confirming the `Monitor` tool (not
  Bash) made it. A `run_in_background` Bash is also `shell`. So `monitor` is the artifact/comment
  watch specifically, and excluding it cannot hide a real watch the agent or the operator started.
  Probe: scratchpad `monprobe/`.
- **M2 — the verify-human read must be SESSION-scoped, not turn-scoped.** Over 45 days of
  transcripts (2,736 turn ends), "last skill **in this turn** was `feature-verify-human`" finds 270
  turn ends. "Last skill **in the session**" finds 402. A 25-row sample of the 129 extra turn ends is
  overwhelmingly multi-turn checklists still waiting on the operator ("reply **pass** and I'll
  close out Phase 4", "Answer those two and Phase 3 closes"). Counting typed or injected
  `<command-name>` lines as invocations alongside `Skill` tool calls changes the session-scoped
  count by 3 (399). Script: scratchpad `vh_rule.py`.
- **M3 — CC does NOT fire `Stop` on an Esc interrupt.** 0 of 16 interrupts in 30 days are followed
  by a `stop_hook_summary` line, against 2,060 of 2,068 normal `end_turn`s (positive control).
  Script: scratchpad `interrupt.py`.
- **M4 — neither hook-order discriminator for 4.3 is good enough.** Simulated against the installed
  app's `status-channel.log` + transcript ground truth (`tsr.py`):

  | Rule | Queued prompts (sat in queue > 1.5 s) caught | Post-Esc prompts kept as turn starts |
  |---|---|---|
  | A: "no `Stop` since the previous submit" (WP1's discriminator) | 30 / 34 | **0 / 8** |
  | B: A, plus "a tool call is still open" | 6 / 34 | 7 / 8 |

  Because of M3, rule A demotes the first prompt after **every** Esc, and Esc is the recovery
  R-1's accepted cost rests on. Rule B is safe but barely helps.

Problem statement unchanged (2026-10-21, Phase 2 F9 re-entry): the failure was a guard pinning the old single-source literal that P2.3 deliberately replaced; the never-disagree property it protects still holds and is the point of the change.

Problem statement unchanged (2026-10-26, Phase 3 F12 re-entry for P3.verify-human.0): the gap is a precision gap in item 2's read. "Last skill was verify-human" also matches a turn that has already LEFT verify-human by emitting an exit token (F11/F12/F13) and then stopped. That stop is a broken chain, not a verify-human pause. The goal itself has not changed: blue means the operator is being asked something.

## User Stories

- As the operator scanning the filmstrip, I want purple to mean real work is running, so that an
  idle workspace with an artifact open does not read "busy, ignore me".
- As the operator running autopilot across several projects, I want a workspace stopped at
  verify-human to read blue on every surface (filmstrip, header, PiP, menu-bar glyph), so that the
  one stop the workflow makes for me is the one I see first.
- As a user with the workflow gate OFF, I want the dot to behave exactly as before, so that the
  workflow layer costs me nothing.
- As the operator walking turn markers, I want to know whether a queued prompt plants a mid-turn
  marker, and why, so that I don't mistake it for a bug again.

## Acceptance Criteria

### 4.1 — `monitor` tasks do not light purple
- `Stop` maps to BackgroundWork iff **at least one outstanding task's type is not `monitor`**. A
  `monitor`-only `Stop` maps to Idle. `monitor` + `shell` is still BackgroundWork.
- ⚠️ **Exclude-one-type, not allow-list.** Any other type, including `?` (CC sent no scalar type)
  and a type CC adds later, still counts as work. Failing toward today's colour is the safe
  direction (it mirrors the unknown-`notification_type` → AwaitingInput default).
- ⚠️ **Degrade path unchanged.** When `background_task_types` is absent, or its length disagrees
  with `background_task_count` (an older deployed hook script), the decision falls back to the
  count alone, exactly as today. Pinned by test, alongside the existing
  `stop_with_zero_or_absent_background_count_still_maps_to_idle`.
- The rule lives in ONE named predicate beside `event_to_state` (the `notification_awaits_input`
  precedent). Not gated: it corrects the four-state mapping for every user.
- `status-channel.log` keeps ` bg=<n> bg_types=<...>` (the permanent observable).

### 4.2 — every verify-human pause reads blue (gate ON only)
- **The signal.** At a turn end, the turn "stopped at verify-human" iff the **last skill invocation
  in the transcript tail** (a `Skill` tool call, or a `<command-name>` slash-command line, whichever
  is later) is `feature-verify-human`, **and** the supervisor did not fire on that turn end.
  Session-scoped per M2.
- ⚠️ **Independent of supervision.** It applies whenever the M10.9 gate is ON, including a project
  with no stored drive mode and a workspace whose supervisor toggle is OFF. "Every" is the operator's
  word, and the dot must not change colour because the supervisor was switched off.
- **Blue on all three surfaces, which agree.** The filmstrip tile and header dot, the PiP, and the
  menu-bar glyph (lit, since needs-you is Attention) all show AwaitingInput for that workspace. The
  promotion therefore travels through the backend's `workspace-status` stream; it is not a
  main-webview-only state.
- ⚠️ **Display overlay, not a state change** (Q1: operator, "color only"). The DTO's `state` stays the hook
  truth (`idle` / `background_work`), and a new optional field marks the pause. Surfaces that
  answer "what colour / does this need me" read one display funnel per side (TS and Rust tray). The
  close/quit guard (`isActiveState`) and the respawn guard (`readyToRespawn`) keep reading `state`,
  so they behave exactly as today. With background work outstanding they still protect the job.
- **Clears on the workspace's next state-mapped hook event** (the operator's reply →
  `UserPromptSubmit` → Running). A later turn end re-evaluates.
- ⚠️ **Never overwrites a newer event.** The promotion is applied only if the workspace's latest
  event is still the `Stop` it was decided for (compare on that event's identity). A reply typed
  inside the decision window (transcript-flush wait plus up to ~3 s of adjudication) must not turn
  a Running dot blue. A promotion with no event identity is refused.
- **No blue flash on a fired turn.** If the supervisor fires, no promotion is sent.
- **Byte-identical with the gate OFF.** No promotion is ever requested, the new DTO field is
  absent (`skip_serializing_if`), and every surface renders as today. Turning the gate OFF clears
  any live promotion at once rather than at the next event. Workspace close forgets it.
- ⚠️ **Sweep, per `[[derived-state-is-not-a-proxy-for-its-event]]`.** Every consumer of
  `awaiting_input` / `background_work` / `idle` is classified as either a *display* consumer (reads
  the funnel) or a *truth* consumer (reads `state`), and every **raw-stream** consumer that matches on
  `state` is checked so the promotion event cannot be read as a `Stop` (`recycleSession`'s
  `idle || background_work` match is the known one). Known display consumers: `statusPresentation`
  callers, `pipLayout.isAwaitingInput`, `tray::aggregate_alarm`. Known truth consumers:
  `isActiveState` (App close/quit), `readyToRespawn`.
- Only `feature-verify-human`. Task and incident workflows have no verify-human pause.

### 4.3 — turn starts on queued prompts: keep the markers, record why
- `event_is_turn_start` is **unchanged**. Per M3 + M4, the only hook-order discriminator that
  catches queued prompts (rule A) drops the marker on every prompt after an Esc, and the safe one
  (rule B) catches 6 of 34. A spurious mid-turn stop on the marker walk is the cheaper error.
- `arch/status-channel-and-surfaces.md` §A.5 records M3 + M4, and the `event_is_turn_start` rustdoc
  points at it, so the question is not reopened without new data.
- An upstream CC ask is drafted for the operator (not sent): a field on `UserPromptSubmit` that
  says the prompt was queued, or a hook on interrupt. Sending it is the operator's call.
- Turn attribution (`⚙`) is unaffected (no code change).
- `SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES` closes with a CHANGELOG line ("kept
  by measurement"), or is rewritten to the upstream ask if the operator sends one.

### 4.4 — WP1 cleanup
- **Remove `payload_keys` everywhere:** the hook script's dev-only block and its header line,
  `HookEvent::payload_keys`, `format_event_detail`'s `keys=` branch, the test literals and the
  tests that exist only for it. ⚠️ **KEEP `background_task_count` and `background_task_types`**
  (4.1 now reads the types).
- The hook script's dev-basename re-derivation goes with that block (MINOR moot).
- The detached rustdoc (MAJOR): the 12-line M13.5 rationale sits on
  `end_to_end_socket_background_work_emits_then_clears_on_a_clean_stop` again.
- The two drain-loop log sites share one line builder, so the telemetry tail cannot be dropped at
  one site while every test stays green (MINOR).
- ⚠️ **Deletion discipline** (high-priority `SURFACE-2026-08-25-A-DELETED-EXPORT-...`): the field
  removal and every consumer migration land in the SAME phase, and the phase gets a boot
  smoke-test before any live observation is trusted.

### Whole-WP
- `pnpm verify:auto` green at every phase.
- Docs resynced: `arch/status-channel-and-surfaces.md` (§A mapping + `monitor`, §A.5 per 4.3, the
  overlay field), `arch/workflow-supervisor.md` §G (the overlay and the arm decision below), and
  the CLAUDE.md "FOUR states" bullet.
- WP7 (installed build, after a `/release`) re-checks the dot behaviour. That is not this WP's gate.

## Out of Scope

- Any change to the four-state vocabulary. There is no fifth state.
- Detecting other "asking" pauses (task-workflow checklists, AskUserQuestion is already blue via
  `Notification`). `needs-you-outranks-busy` says a new asking state inherits the precedence when one
  is added; none is added here.
- Parsing WIP files or `.session.md` bodies for the pause (signal 2), and any upstream mccc change
  (signal 3). WP1 ruled both unneeded.
- Reading `last_assistant_message`, or any PTY or CC footer text, for state.
- Changing `event_is_turn_start` (see 4.3) or turn attribution.
- Supervisor correctness (WP3), the release, and installed-build acceptance (WP7).

## Technical Constraints

- **No 3rd-party dependency.** CC's hook payload and transcripts are already probed (WP1, M1–M4).
- **R-4 holds.** The verify-human decision is TypeScript, beside the supervisor's turn-end handler
  (`useSupervisor` → `useTurnEnd`), reusing the same `transcript_tail` read. It reaches the backend
  through an ordinary frontend→backend command, which re-emits on `workspace-status`. There is no
  new backend→frontend direction, and the tray stays an in-process Rust consumer.
- ⚠️ **The decision runs before `decideTurn`'s early exits are allowed to skip it.**
  `decideTurn` returns before reading the transcript when the toggle is OFF or no mode is stored, so
  the verify-human read cannot simply ride `decideTurn`. It needs the tail even when no verdict is
  computed (per 4.2's independence AC).
- ⚠️ **Decision for review: the overlay does NOT own a seventh OFF-invariant guard arm.**
  `arch/workflow-supervisor.md` §G says a supervisor surface that does not render from
  `workspaceSupervisorReadout` would own a new subject. This is not a new surface. It is a value fed
  into the existing status channel, and the guard's arms all select on *registration shapes*
  (panel sets, menu ids, chords, row cells, the skill row, the readout). None of them can express
  "a DTO field is never set", so a seventh arm would be a source-text guard checking nothing
  (`docs/lessons/source-text-guards.md`). OFF-invariance is pinned **behaviourally at the single
  funnel** instead: with `enabled: false` the promotion command is never invoked (call captured in
  the double, mutation-proven), and with the field absent the Rust and TS display funnels return
  `state` unchanged. The `armSubjects` pin stays at **9**, and §G records the new shape and why it
  is not an arm.
- **Where the compare lives.** The backend applies a promotion only if the workspace's
  last-emitted update is still the `Stop` it names. That needs a small per-workspace "last event"
  record in the broadcaster; the tray's alarm map is the precedent for per-workspace state.
- **Tail window.** The session-scoped read sees only the 512 KiB `transcript_tail` window. A
  verify-human `Skill` call older than that reads as "not verify-human", which is today's
  behaviour (the safe direction). The plan measures how often it happens.
- Rust: no `unwrap()` outside tests, typed errors. `event_to_state` stays pure.
- The hook script change is a deletion, and the deployed script is refreshed by `hook_install` on
  launch. A stale deployed script still parses (`#[serde(default)]`).

## Open Questions

- [x] **Q1:** answered (see Asked).
- No research needed. The unknowns WP1 left (the `Monitor` tool's type, the signal's scope, the 4.3
  discriminator) were measured at spec (M1–M4).

## Asked

- **Q1:** Should a verify-human pause become a real `awaiting_input` (the close/quit confirm and
  the drive-mode respawn check would then treat it as busy), or change the colour only? →
  **"color only"** (operator, 2026-10-21; the recommended answer). The dot, PiP and menu-bar glyph
  go blue through a display overlay; `isActiveState` and `readyToRespawn` keep reading `state`.

## Assumed (not asked; correct any at review)

1. **4.1 excludes `monitor` only, and `?` / unknown types count as work** (safe direction; M1 shows
   no real watch is `monitor`).
2. **4.2 is session-scoped** and counts `<command-name>` lines as invocations (M2).
3. **4.2 is independent of the supervisor toggle and stored drive mode.** It needs only the gate.
4. **Only `feature-verify-human`** triggers the promotion.
5. **4.3 keeps today's behaviour** (M3 + M4), with the reason recorded and an upstream ask drafted,
   not sent. ⚠️ This is the WBS's own alternative ("or record that navigation keeps the mid-turn
   markers"). If you would rather trade spurious markers for missed post-Esc ones, rule A is a
   one-function change.
6. **No seventh guard arm.** OFF-invariance is a behavioural test at the funnel (see Technical
   Constraints).
7. **The two-sites telemetry MINOR is folded in** alongside the MAJOR, since 4.4 edits that code.
8. **Turning the gate OFF clears live promotions immediately**, so "OFF = byte-identical" holds
   without waiting for the next event.
9. **Promotion is decided after the verdict**, so a fired turn never flashes blue. The cost is up to
   ~3 s of grey/purple before blue on an adjudicated turn.

## Design-priors consult

- `[PRIOR: needs-you-outranks-busy]` **agrees** (rule 2): blue wins over background work at
  verify-human, and the tray lights. It governs the **signal**, not the close/quit/respawn guards
  (over-infer guard, rule 5), so it does not decide Q1.
- `[PRIOR: semantic-distance-not-just-visual-distance-for-status-colour]` **agrees** (rule 2) with
  4.1 and 4.2: purple must mean *ignorable*, so neither an artifact watch nor a verify-human pause
  may read purple.
- `[PRIOR: gate-substrate-dependent-feature-class-behind-default-off-opt-in]` **agrees** (rule 2):
  4.2 is gated. 4.1 is not workflow knowledge, so it is not gated.
- `[PRIOR: reuse-the-established-status-palette-before-inventing-a-hue]` **agrees**: existing blue,
  no new colour.
- No prior governs 4.3 or 4.4.

## Work Tree

- [x] Phase 1: Backend mapping + WP1 cleanup (4.1, 4.4)
  **Observable outcomes:**
  - CLI: `cargo test` (via `pnpm verify:auto`) holds new `status_broadcaster` tests: a `Stop` with
    types `["monitor"]` → `Idle`; `["monitor","shell"]` → `BackgroundWork`; `["?"]` →
    `BackgroundWork`; types absent with count 2 → `BackgroundWork`; types `["monitor"]` with count 2
    (length mismatch) → `BackgroundWork` (count fallback). Each arm mutation-proven individually.
  - CLI: `grep -rn payload_keys src-tauri/src src-tauri/resources src-tauri/tests` → 0 hits, while
    `grep -c background_task_types src-tauri/src/hook_socket/mod.rs` ≥ 1 and the hook script still
    emits `background_task_types` (`hook_pl_output.rs` passes).
  - CLI: `sed -n` on `status_broadcaster/commands.rs` shows the M13.5 rustdoc directly above
    `fn end_to_end_socket_background_work_emits_then_clears_on_a_clean_stop`, and both drain-loop
    log sites call ONE line builder (`grep -c` of the builder call = 2, of `+ &event_detail` = 0).
  - CLI (state-changing: dev build, dev `hook.sock`, scratch cwd `tmp/scratch/scratch-a`): launch
    `pnpm tauri:dev` (Claude-marker env strip), register scratch-a, then write one hand-built
    `Stop` JSON line with `background_task_count:1, background_task_types:["monitor"]` and that
    cwd to the dev socket → the dev `status-channel.log` gains `mapped=idle ... bg=1
    bg_types=monitor` with no `keys=`; a second line with `["shell"]` → `mapped=background_work`.
  - Browser (MCP bridge, dev build): the boot smoke-test passes (`#root` non-empty, the workspace
    header renders) after the `payload_keys` deletion, and after the `monitor` line the scratch-a
    dot reads `status-dot-idle`.
  **Alignment questions:**
  - Spec Assumed #1 in action: an artifact-watch-only workspace now reads grey, and an unknown
    task type (`?`) still reads purple. Now that you see it, still what you want?
  - [x] P1.1 `stop_leaves_background_work(event)` predicate beside `event_to_state`
        (exclude `monitor`; count fallback when types are absent or misaligned); `event_to_state`'s
        `Stop` arm calls it; rustdoc on `WorkspaceState::BackgroundWork` + `HookEvent::
        background_task_types` updated ("telemetry only" is no longer true).  <!-- status: done -->
  - [x] P1.2 Remove `payload_keys` at every site (hook script block + header line,
        `HookEvent`, `format_event_detail`'s `keys=` branch, test literals in
        `status_broadcaster`, `status_log`, `time_store` (+ `export/tests.rs`), `hook_pl_output.rs`
        dev-copy tests). KEEP count + types. Same phase as all consumers (deletion discipline).  <!-- status: done -->
  - [x] P1.3 Move `event_detail_threads_each_wire_field_into_its_own_slot` above the M13.5
        rustdoc block (MAJOR); one `format_hook_event_line(&HookEvent, mapped, resolved)` used by
        both drain-loop sites (MINOR).  <!-- status: done -->
    - Build evidence (2026-10-21): `stop_leaves_background_work` + 3 new tests
      (`an_artifact_watch_alone_is_not_background_work`, `an_unknown_task_type_still_counts_as_background_work`,
      `untrusted_types_fall_back_to_the_count`). Mutants, each run alone, landing checked by `cmp`:
      any-type-is-work → 1 FAILED; drop length guard → 1; fallback `false` → 6; drop zero-count guard → 10;
      drop the builder's tail → `hook_event_line_threads_each_wire_field_into_its_own_slot` FAILED. Restored by shasum.
      `payload_keys` gone from 9 files; the hook test is now `neither_basename_forwards_payload_key_names`
      (both basenames). `hook_event_line(` = 6 (def + 2 drain sites + 3 test calls); `+ &event_detail` = 0.
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 (44s): lint 0 errors / 1 warning (`XtermPane.tsx:932` exhaustive-deps, a file this phase did not touch, so it was already there), format, tsc, check:link, vitest 3479 passed, cargo fmt, clippy `--all-targets -D warnings`, cargo lib 1025 passed (incl. the 3 new mapping tests + `hook_event_line_threads_each_wire_field_into_its_own_slot`), `hook_pl_output` 22 passed.
  - [x] verify-self  <!-- status: done -->
    - [x] Mapping tests exist + pass; one arm mutation-killed (runner, isolated crate copy) — evidence: `cargo test --lib status_broadcaster` → 66 passed; mutant `.any(|t| true)` → `an_artifact_watch_alone_is_not_background_work` FAILED; real mod.rs shasum unchanged 61ecf894…
    - [x] `payload_keys` gone; types kept — evidence: 3 hits, all in `neither_basename_forwards_payload_key_names`; `hook_pl_output` 22 passed
    - [x] Rustdoc reattached; one builder — evidence: doc → `#[test]` → fn @commands.rs:470; `hook_event_line(` ×6 (def :41, sites :115/:136, tests); `+ &event_detail` = 0
    - [x] Hook script emits types, no values — evidence: captured `{"background_task_count":1,"background_task_types":["monitor"],…}`, no payload_keys / description / command
    - [x] LIVE boot smoke-test (dev build PID 70885, MCP bridge) — evidence: `#root` innerHTML 14,170 chars, picker rendered; scratch-a opened (`REGISTRY op=register id=ws-1`)
    - [x] LIVE consuming surface (integration boundary: the filmstrip tile + header status dot) — evidence: hand-built Stop lines on the dev `hook.sock` → dev `status-channel.log`: `bg_types=monitor` → `mapped=idle resolved=ws-1 outcome=emitted` (ts 1792599090822, again 1792599120383), dots `status-dot-idle` ×2; positive controls `bg_types=shell` → `mapped=background_work` (1792599101676) and `bg_types=?` → `mapped=background_work` (1792599105680), dots `status-dot-background` / "Working in background"; no `keys=` on any line
    - [x] align: artifact-watch-only reads grey; `?` reads purple — evidence (CAPTURED, for verify-human): `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/ce0ae9c7-bd81-4518-8512-aa8a21d80dd6/scratchpad/wp4-p1-monitor-only-idle.png` (grey dot + "Idle"), `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/ce0ae9c7-bd81-4518-8512-aa8a21d80dd6/scratchpad/wp4-p1-unknown-type-purple.png` (purple dot + "Working in background")
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1: artifact-watch-only reads grey, an unknown task type (`?`) still reads purple (spec Assumed #1) — still what you want? → operator: "all good" (2026-10-21)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    - New consuming-surface test (real socket → `to_update`, hook-shaped lines): `status_broadcaster::commands::tests::end_to_end_socket_an_artifact_watch_emits_idle_and_real_work_still_emits_background_work` — monitor → Idle, shell → BackgroundWork, `?` → BackgroundWork, monitor → Idle. Mutant `any(...)`→`true` → FAILED; restored by shasum.
    - Already covered from build (not duplicated): the 3 mapping tests, `hook_event_line_threads_each_wire_field_into_its_own_slot`, `neither_basename_forwards_payload_key_names`.
    - Full suite: `pnpm verify:auto` → EXIT=0 (52s), vitest 3479, cargo lib 1026.

- [x] Phase 2: The display overlay on the status channel (4.2 plumbing)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the operator ruled blue at every verify-human pause (WP1) and chose "color only" (Q1, 2026-10-21).
  - Requirements unchanged: yes — Phase 1 touched only the Stop mapping and telemetry.
  - Solution still feasible: yes — the DTO, tray listener and TS fold are as surveyed at spec.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: Rust tests pin (a) `WorkspaceStatusUpdate` serializes with NO new key when the overlay is
    absent (byte-identical JSON against a pre-change fixture string); (b) the promote command's
    compare: applied when the workspace's last emitted update is the named `Stop`, refused when a
    later event arrived, refused with no event identity, refused for an unregistered workspace;
    (c) deregister and clear-all forget overlays; (d) `tray` display funnel: an overlaid `idle` and
    an overlaid `background_work` each fold to `Attention`.
  - CLI: Vitest pins the TS display funnel (`displayStateFor`): overlay → `awaiting_input`;
    absent → `state`; and that `stateFor` (truth) is unchanged by an overlay — `isActiveState`
    and `readyToRespawn` are called with truth (assert the VALUE passed, mutation-proven per
    `[[ts-arity-flexible-assignability-hides-a-widened-param]]`).
  - CLI: `recycleSession`'s raw listener keys on `is_turn_end === true`; a Vitest case feeds an
    overlay re-emit (`state: "idle"`, `is_turn_end: false`) and asserts NO `stop` is fed.
  - CLI: the consumer sweep is recorded in this WIP: every `listen<WorkspaceStatusUpdate>` site
    (`useWorkspaceStatus`, `turnEnd`, `Pip`, `recycleSession`, `XtermPane`) and every
    `stateFor`/`isAwaitingInput`/`aggregate_alarm` caller, each classified display vs truth.
  - Browser (MCP bridge, dev build, state-changing: dev app only): with scratch-a idle, invoke the
    promote command for scratch-a's last `Stop` via `ipc_execute_command` → the filmstrip tile and
    header dot read `status-dot-awaiting` and `stateFor` still returns `idle`; a hand-built
    `UserPromptSubmit` line on the dev socket then turns it `status-dot-running`. A promote naming
    an older `Stop` is refused (dot unchanged).
  - Browser (PiP webview via MCP bridge): the PiP tile for scratch-a reads awaiting while promoted.
  - CLI: the tray glyph swaps to the lit variant while promoted (dev `status-channel.log` /
    tray debug line, or `screencapture` of the menu bar per `[[verify-native-pty-via-ps-screencapture-stderr]]`).
  **Alignment questions:**
  - Q1 ("color only") in action: a promoted workspace is blue on the filmstrip, PiP and menu bar,
    yet closing it raises no "discard?" prompt and a drive-mode change still applies. Still what
    you want?
  - [x] P2.1 Rust: optional `attention` field on `WorkspaceStatusUpdate`
        (`skip_serializing_if`), one variant `verify_human`; a per-workspace last-emitted record in
        the broadcaster; `workspace_status_promote(workspace_id, stop_event_at)` (compare-and-set,
        re-emits on `workspace-status`); `workspace_status_clear_attention()` (re-emits each live
        overlay cleared); deregister forgets. Commands are sync and non-blocking
        (`sync_commands_do_not_block.rs` stays green).  <!-- status: done -->
  - [x] P2.2 Rust tray: `display_state(update)` funnel feeding `aggregate_alarm`; exhaustive match kept.  <!-- status: done -->
  - [x] P2.3 TS: mirror the field; store it in `WorkspaceStatusEntry`; `displayStateFor` beside
        `stateFor`; Filmstrip, CenterStage→Workspace header indicator, PiP tiles and
        `pipLayout.isAwaitingInput` read display; App close/quit and `readyToRespawn` keep truth
        (Workspace receives both).  <!-- status: done -->
  - [x] P2.4 `recycleSession`: match `is_turn_end === true` instead of `state`; sweep the other
        raw listeners and record the classification here.  <!-- status: done -->
    - Build evidence (2026-10-21):
      - Rust: `Attention` enum + `WorkspaceStatusUpdate::attention` (skip-if-none); registry `last_emitted` record, `record_emitted` in the drain loop under the same lock, `promote` (CAS on `is_turn_end == Some(true)` && `last_event_at`), `clear_attention`, deregister forgets; `overlay_update` CLEARS both turn markers; `display_state` feeds the tray fold. Commands `workspace_status_promote` / `workspace_status_clear_attention` registered. 6 new tests incl. the byte-identical wire string. Mutants killed: drop timestamp compare, drop turn-end compare, copy turn markers. `sync_commands_do_not_block` 10 passed; clippy clean.
      - TS: `WireAttention`, `WorkspaceStatusEntry.attention`, `displayStateFor`; Filmstrip + Workspace header dot (new `statusDisplayState` prop) + PiP tile + `pipLayout.isAwaitingInput` read display; App close/quit + `readyToRespawn` + the respawn wait keep `stateFor`/`statusState`. Live test `workspaceDriveModeLive` kills both mutants (guard reads display → FAILED; dot ignores display → FAILED).
      - `recycleSession` keys on `is_turn_end === true`; its obsolete M13.5 source-text guard (pinned the `"idle"`/`"background_work"` literals the change deliberately removes) replaced by two behavioural tests (background_work Stop counts; overlay re-emit does not). Mutant (restore the state match) → overlay test FAILED. Fixture `emitStop` now carries `is_turn_end: true`, as every real Stop does.
      - **Consumer sweep** (`[[derived-state-is-not-a-proxy-for-its-event]]`): raw `workspace-status` listeners — `useWorkspaceStatus` (fold; exposes truth `stateFor` + `displayStateFor`), `Pip` (fold → display), `turnEnd` (`is_turn_end`; overlay clears it → no re-trigger), `recycleSession` (now `is_turn_end`), `XtermPane`/`turnMarkers` (`is_turn_start`; overlay clears it). Display: Filmstrip, Workspace header indicator, PiP tile/`isAwaitingInput`/`orderForAttention`, tray `aggregate_alarm` via `display_state`. Truth: App `isActiveState` (close + quit), `readyToRespawn` + `waitForIdle`. Unrelated: `docs/fetchLatch.ts` (its own fetch state).
  - [x] verify-auto  <!-- status: done -->
    - Re-run after F9: `pnpm verify:auto` → EXIT=0 (40s): lint 0 errors / 1 warning (`XtermPane.tsx:932`, a file this phase did not touch, so it was already there), tsc, check:link, vitest 3488 passed, cargo fmt, clippy `-D warnings`, cargo lib 1032 passed (incl. the 6 overlay tests), `sync_commands_do_not_block` passed, `hook_pl_output` 22 passed.
    - `pnpm verify:auto` → EXIT=1 (23s): vitest 1 failed / 3487 passed. `pipFanoutWiring.test.ts` → "the dot state is derived from stateFor ONCE per tile (single source)": `expected +0 to be 1`. Cause: the guard's regex pins the literal `stateFor(statusMap, tile.id)`, and P2.3 deliberately moved the PiP's single source to `displayStateFor(statusMap, tile.id)` (the filmstrip moved the same way, so never-disagree still holds). Classification: obsolete test literal, high confidence → F9, update the regex to the display funnel.
    - F9 fix: the guard now asserts ONE `displayStateFor(statusMap, tile.id)` and ZERO bare `stateFor(statusMap, tile.id)` in `Pip.tsx`; 28 passed. Mutant (PiP back on `stateFor`) → FAILED; restored by shasum.
  - [x] verify-self  <!-- status: done (one UNVERIFIED leaf surfaced) -->
    - [x] Rust overlay tests assert every listed case; tray folds `display_state`; both commands registered (runner) — evidence: `cargo test --lib status_broadcaster` → 73 passed; tray/commands.rs:198-199; lib.rs:630-631
    - [x] TS display funnel + live-component guard split (runner) — evidence: 4 files 85 passed (workspaceStatus 18, pipLayout 20, workspaceDriveModeLive 6, recycleSession 41); App.tsx:513/582 `isActiveState(stateFor(`; :844 Filmstrip `statusFor={displayStateFor}`
    - [x] recycleSession keys on `is_turn_end` (runner) — evidence: recycleSession.ts:368; both new tests ✓
    - [x] Consumer sweep re-derived independently, nothing unnamed (runner) — evidence: 5 non-test listeners + 14 caller hits, all classified
    - [x] LIVE boot smoke (fresh relaunch, dev PID 65628) — evidence: `#root` 14,170 chars, picker rendered, new `timeOrigin` 1792599927488
    - [x] LIVE consuming surface: promote CAS on the real stream — evidence: Stop @1792600251439 → dots `status-dot-idle`; promote(older 1792600251438) → `false`, no event, dots unchanged; promote(named) → `true`, raw event `{attention:"verify_human", state:"idle", last_event_at:1792600251439}` with NO `is_turn_end`/`is_turn_start` keys; filmstrip + header → `status-dot-awaiting` / "Awaiting input"; PiP tile → `status-dot-awaiting`; a `UserPromptSubmit` then → dots `status-dot-running`, event carries no `attention`
    - [x] LIVE blue over purple — evidence: Stop `bg_types=shell` @1792600335305 → promote `true` → raw event `state:"background_work"` + `attention` (truth kept for the close guard); main dots + PiP dot `status-dot-awaiting`
    - [x] LIVE tray glyph lit while promoted (confirmed by the operator at P2.verify-human.2)  <!-- status: was UNVERIFIED: no harness — `screencapture` is TCC-blocked for this process ("could not create image from display": this CC session runs inside Claudesk, not Terminal.app); the fold is covered by `display_state` tests + the runner's call-site check; buildable: yes (a tray debug line in `reconcile`, or run captures from Terminal.app). scratch-a is LEFT PROMOTED so the dev app's menu-bar glyph should read lit now -->
    - [x] align: Q1 "color only" in action — evidence (CAPTURED): `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/ce0ae9c7-bd81-4518-8512-aa8a21d80dd6/scratchpad/wp4-p2-promoted-main.png` (tile + header blue, "Awaiting input"), `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/ce0ae9c7-bd81-4518-8512-aa8a21d80dd6/scratchpad/wp4-p2-promoted-pip.png`; the live event keeps `state` = truth (`idle` / `background_work`); `workspaceDriveModeLive` pins the drive-mode confirm reading "to this session now?" while the dot is blue. ⚠️ Nuance for the operator: with a background job alive the close guard STILL prompts (it reads `background_work`, protecting the job) — exactly today's behaviour
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1: Q1 "color only" in action — a promoted workspace is blue on the filmstrip, header and PiP while its true state (and so the close/respawn guards) is unchanged. Still what you want? → operator: "all good" (2026-10-21)  <!-- status: done -->
    - [x] P2.verify-human.2: the dev app's menu-bar glyph reads LIT right now (scratch-a is left promoted) — agent could not screenshot (TCC) → operator: "all good" (2026-10-21)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    - New consuming-surface test (tray, the surface only the operator could see live): `status_broadcaster::tests::a_promoted_stop_survives_the_wire_and_lights_the_tray` — a real Stop (idle and background_work) → `record_emitted` → `promote` → serialize → parse as the tray does → `tray::aggregate_alarm(display_state)` = Attention (Neutral before), `state` = truth, no turn-end marker. Mutant (`display_state` ignores the overlay) → FAILED; restored by shasum.
    - Already covered from build (not duplicated): the 6 overlay unit tests, `workspaceStatus`/`pipLayout`/`workspaceDriveModeLive`/`recycleSession` WP4 tests, the `pipFanoutWiring` single-source guard.
    - Known limit (recorded, not a gap): the `apply_update` insert site needs an `AppHandle`, and this repo has no `tauri::test` harness; the runner checked it statically and the operator saw the glyph lit live.
    - Full suite: `pnpm verify:auto` → EXIT=0 (40s), vitest 3488, cargo lib 1033.

- [x] Phase 3: The verify-human decision (4.2 signal + gate)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — Phase 2's channel is inert until something promotes; the operator approved it at P2.verify-human.
  - Requirements unchanged: yes — Q1 "color only" holds, and the overlay plumbing landed as specced.
  - Solution still feasible: yes — the turn-end handler has `last_event_at`, the CC session id and `transcript_tail`.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: Vitest pins the pure `endsAtVerifyHuman(lines)`: last invocation `Skill` →
    `feature-verify-human` → true; a later `Skill` (`feature-verify-codify`) → false; a
    `<command-name>/feature-verify-human</command-name>` user line → true; a later
    `<command-name>` of another command → false; the skill call in an EARLIER turn of the same
    tail (multi-turn checklist) → true; sidechain `Skill` calls ignored; no invocation → false.
  - CLI: Vitest pins the wiring at the turn-end handler: promote is invoked with the `Stop`'s
    `last_event_at` when (gate ON, not fired, verify-human) — including with the supervisor toggle
    OFF and with no stored drive mode; NOT invoked when fired, when not verify-human, when the
    event has no `last_event_at`, or with `enabled: false` (call captured in the double; each
    condition mutation-proven individually). `armSubjects` pin still 9.
  - CLI: Vitest: flipping the gate ON→OFF invokes `workspace_status_clear_attention` once.
  - CLI: the tail-window miss rate is measured over the corpus (session-scoped verify-human turn
    ends whose last invocation lies beyond 512 KiB of the turn end) and recorded here.
  - Browser + CLI (state-changing: dev build, real CC session in `tmp/scratch/scratch-b`, gate
    ON): drive a turn that runs `/feature-verify-human` (no WIP there, so the skill reports and
    stops) → within ~5 s of its `Stop` the scratch-b dot reads `status-dot-awaiting`, its
    `supervisor-activity.log` line is not `fired`, and the dev `status-channel.log` shows the
    promote; typing a reply turns it `status-dot-running`. A plain non-skill turn in scratch-b
    afterwards with no new skill still reads blue (session-scoped), and a turn invoking another
    skill reads grey.
  - Browser (state-changing: dev settings): with the gate OFF, the same verify-human turn leaves
    the dot `status-dot-idle` and the DTO carries no `attention` key; turning the gate OFF while
    scratch-b is blue clears it at once.
  **Alignment questions:**
  - Spec Assumed #2/#3 in action: blue persists across a multi-turn checklist and appears even
    with the supervisor toggled off for that project. Still what you want?
  - Spec Assumed #9 in action: on an adjudicated turn the dot sits grey/purple for up to ~3 s
    before turning blue. Acceptable, or should blue come first and retract on a fire?
  - [x] P3.1 Pure `endsAtVerifyHuman(lines)` in `src/state/supervisor/` (reuses
        `skillInvocation`; adds the `<command-name>` read; ignores sidechains).  <!-- status: done -->
  - [x] P3.2 Wire it in `useSupervisor`'s turn-end handler after the decision, reading the tail
        itself when `decideTurn` exited before reading it; invoke promote only when not fired.
        Keep the "one record per turn end" property (the promotion writes no activity record).  <!-- status: done -->
  - [x] P3.3 Gate-OFF clear: on the gate's ON→OFF edge, invoke `workspace_status_clear_attention`.  <!-- status: done -->
  - [x] P3.4 Measure the tail-window miss rate (script in scratchpad; result recorded here).  <!-- status: done -->
  - [x] P3.5 (added at build, from P3.4's measurement) Per-CC-session memo of the last invocation seen (`SessionSkillMemo`), with a turn-start guard: a window that does not reach the current turn's start forgets the memo. Cleared on the gate's OFF edge.  <!-- status: done -->
    - Build evidence (2026-10-21):
      - `src/state/supervisor/verifyHumanPause.ts`: `lastSkillInvocation` / `endsAtVerifyHuman` (session-scoped; `Skill` call OR `<command-name>` line; sidechains skipped), `mayPromote` (not after `fired` / `recycle-started` / `duplicate-turn-end`), `promoteIfVerifyHuman` (IO injected), `SessionSkillMemo`.
      - Wired in `useSupervisor`'s turn-end handler AFTER the decision, inside the gate check, wrapped so a failure cannot cost the activity record. ⚠️ **Deviation from the spec's "reuse the same `transcript_tail` read":** `decideTurn` exits before reading when the toggle is OFF / no mode is stored, and the overlay must work then (spec Assumed #3), so this path makes its own read. It runs after the decision, so the 74–109 ms flush wait has already passed.
      - `useClearAttentionOnGateOff` (App): ON→OFF edge only → `workspace_status_clear_attention`.
      - Tests: `verifyHumanPause.test.tsx` 30 (pure + LIVE `useSupervisor` mount via `mockIPC`), `useClearAttentionOnGateOff.test.tsx` 6. Mutants killed, each alone: ignore-decision, ignore-skill, turn-scoped read, no command lines, keep sidechains, wrong timestamp, wrong decision at the call site, drop memo, no gate clear, no turn-start guard, guard-without-forget, guard-always-true, clear-on-any-OFF. ⚠️ An edge OUT of verify-human (F13) does not fire (the conditional cell's pause fallback), so the fired-turn test uses F5.
      - `offInvariantGuard` 40 passed — no new subject; the pin stays at 9 (no seventh arm, per spec).
      - **P3.4 measured** (45 days, 407 verify-human turn ends, `tail_window.py` in scratchpad): tail-only read → 358 hit / **49 beyond 512 KiB** (median 47 KiB, p95 1 MB, max 3.6 MB; a sample was still asking — "Reply per item", "**Pass?**"). Memo without the guard → 394 hit but **24 false blues** (one huge `feature-build` turn, agents running). Memo WITH the turn-start guard → **380 hit, 0 false blues** — shipped.
  - [x] verify-auto  <!-- status: done (re-run 2026-10-26 after the F12 back-loop, green; prior: done, first run FAILED 3; fixed; re-run green) -->
    - Run 3 (2026-10-26, after the F12 back-loop): `pnpm verify:auto` → EXIT=0 (44s). lint 0 errors / 1 warning (the same pre-existing `XtermPane.tsx:932`), format, tsc, check:link, vitest 263 files / 3528 passed (+4 new P3.verify-human.0 pins), cargo fmt, clippy, cargo lib 1033 passed.
    - Run 1: `pnpm verify:auto` → EXIT=1 (23s), vitest 3 failed / 3521 passed. Triage (all high-confidence, one explanation each):
      - `workflowMachineFunnel` importer allowlist: the new test imported `DriveMode` from `workflowMachine/`. → derived the type from `SupervisorHost` instead (no allowlist change).
      - `activityFunnel` "two DIFFERENT events are each decided" expected 2 tail reads, got 3: Phase 3's separate read doubled the IO on withheld turns. A real regression of an invariant, not an obsolete test. → `decideTurn` gained an optional `onTailRead`, and the verify-human read REUSES the decision's tail, reading separately only on the early exits (toggle OFF / no stored mode). This also realigns with the spec's "reuse the same read". Test unchanged and green.
      - `archDocEnumeration`: `workspace_status_promote` is invoked from `useSupervisor.ts`, so `arch/workflow-supervisor.md` §B must name it. → added to the command table ("SIX commands").
      - ⚠️ Process note: these fixes were made under verify-auto rather than via an F9 → build → F8 round-trip; recorded here so the bypass is visible.
    - Run 2: `pnpm verify:auto` → EXIT=0 (34s): lint 0 errors / 1 warning (`XtermPane.tsx:932`, a file this phase did not touch, so it was already there), tsc, check:link, vitest 3524 passed, cargo fmt, clippy, cargo lib 1033 passed.
  - [x] verify-self  <!-- status: done (re-run 2026-10-26 after the F12 back-loop; prior live evidence below still stands, since no executable code changed) -->
    - [x] Back-loop is comments-only in executable terms (runner). Evidence: `diff` baseline vs working → only hunk `20a21,30` (`//` lines). `ts.transpileModule(removeComments)` gives identical output on both (2693 = 2693 chars). Positive control: `const __probe = 1;` in a scratchpad copy → identical:false (2693 vs 2712). Copy deleted, no repo file touched (scratchpad `cmp.cjs`).
    - [x] Pins + guards (runner). Evidence: `verifyHumanPause.test.tsx` 34/34, all 4 P3.verify-human.0 pins named and passing. `workflowMachineFunnel` + `offInvariantGuard` 60/60: no new importer, no new subject.
    - [x] Corpus reproduces with no drift (runner). Evidence: `vh_exit.py 45` → 324 vh turn ends / 301 no-token. `vh_exit2.py` F13 FINAL-BLOCK ×3, only `7563843d` a bare stop. `autoskip.py` 5 = 2 chained + 3 quoted in `5609cfc9`.
    - [x] align: P3.verify-human.0 decision. Evidence (CAPTURED): verbatim tails for every token category are in scratchpad `vh2.out` / `vh2_nonfinal.out`. All F8/T2/F5/F11-this-turn/F12 tails end in an ask; F13 is 1 bare stop + 1 question + 1 quote. Note: `F11@earlier-turn` ×10 are all `5609cfc9`, a verify-human turn with subagents running ("Three subagents are still running"). They read blue under the operator's "with or without background work" ruling, and a this-turn token rule would not touch them either.
    - [x] Pure read + wiring + gate hook (runner) — evidence: `verifyHumanPause.test.tsx` 30 passed (each case a value assertion, promote ARGS captured); guards `offInvariantGuard`/`activityFunnel`/`workflowMachineFunnel`/`archDocEnumeration` 104 passed, `armSubjects` still 9; `useClearAttentionOnGateOff` 6 passed; App.tsx:294 calls it
    - [x] Decision tail reused (runner) — evidence: useSupervisor.ts `onTailRead` → `decisionTail`; separate read only when the decision did not read
    - [x] P3.4 measurement re-derived — evidence: `tail_window.py 45` → 407 / 49 beyond 512 KiB (runner, no drift); `memo_sim.py 45` (scratchpad) → tail-only 358, memo 394 + 24 false, memo+guard **380 + 0 false**
    - [x] LIVE real CC turn (dev build PID 32902, relaunched; scratch-c, default profile, real `claude` Opus): `/feature-verify-human` → `UserPromptSubmit` 1792603000873 → `Stop` 1792603012366 (`mapped=idle bg=1`) → supervisor `withheld no-verdict` → raw re-emit **135 ms later** `{attention:"verify_human", state:"idle", last_event_at:1792603012366}`, no turn markers → tile + header `status-dot-awaiting` / "Awaiting input" — screenshot `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/ce0ae9c7-bd81-4518-8512-aa8a21d80dd6/scratchpad/wp4-p3-real-vh-blue.png`
    - [x] LIVE session-scoped — evidence: a plain "pass" reply turn (no skill) → `Stop` 1792603044101 → promoted again, dot stays blue
    - [x] LIVE another skill moves on — evidence: turn invoking `Skill` `keybindings-help` (transcript-confirmed) → `Stop` 1792603616792 → NO promotion → dots `status-dot-idle`
    - [x] LIVE gate ON→OFF clears at once (state-changing, dev settings, declared) — evidence: 2nd verify-human turn promoted (`Stop` 1792603786708); `workflow_set_features_enabled(false)` → clear re-emit `attention` absent, `is_turn_end` absent → dots `status-dot-idle`
    - [x] LIVE gate OFF = byte-identical — evidence: verify-human turn with the gate OFF (`Stop` 1792604014164) → raw events' key sets `is_turn_end,is_turn_start,last_event_at,session_id,state,workspace_id` (no `attention`), no re-emit, dot idle; `supervisor-activity.log` 54 → 54 lines. Gate restored ON (1792604228244).
    - Environment notes (not defects): scratch-b runs the `test-test` profile, which has no companion skills, so `/feature-verify-human` was rejected there (history.jsonl confirms the submit) → used scratch-c. `/cost` (alias `/usage`) opened a full-screen panel that swallowed the next input; dismissed with Esc; side-effect check clean (repo diff = only this WP's edits, `~/.claude/CLAUDE.md` + `settings.json` untouched).
    - [x] align: Assumed #2/#3 (multi-turn + independent of supervision) — evidence (CAPTURED): the "pass" turn stayed blue live; the supervisor-toggle-OFF and no-stored-mode cases are pinned on a live `useSupervisor` mount (not driven on the real app — scratch-c is supervised)
    - [x] align: Assumed #9 (decide after the verdict) — evidence (CAPTURED): 135 ms Stop→blue on a no-verdict turn; an adjudicated turn adds the adjudicator's ~3 s before blue (not driven live)
  - [x] verify-human  <!-- status: done (2026-10-26: operator "0 A, all pass") -->
    - [x] P3.verify-human.1: main happy path — every verify-human pause reads blue, stays blue across a multi-turn checklist, and is independent of the supervisor toggle / stored mode (Assumed #2/#3). Still what you want?  <!-- status: done (operator pass 2026-10-26) -->
    - [x] P3.verify-human.0: DECISION (re-presented after the F12 back-loop). The verify-human AUTO-SKIP false blue, measured rather than fixed. **Operator: A** (2026-10-26). Accept the one false blue; no token rule.  <!-- status: done -->
      - Back-loop build evidence (2026-10-26, F12 → build). Corpus is 45 days, 484 transcripts, 2,566 turn ends, 324 session-scoped verify-human turn ends (scratchpad `vh_exit.py`, `vh_exit2.py`, `autoskip.py`):
        - **Sub-case B (auto-skip F11, then stop): 0.** There were 2 real auto-skips (`Nothing here needs you`), and both chained to `feature-verify-codify` in the same turn, so they already read grey (sub-case A). The 3 other matches were quotes in session `5609cfc9`, which was *about* the auto-skip.
        - **Any verify-human exit token followed by a stop with no question: 1** (`7563843d`, F13 then "Next: `/feature-verify-codify`"). This is the only real false blue.
        - **301 / 324 carry no token after the invocation.** The remaining 23 carry one, and nearly all are still asking: an F13 followed by "want me to run verify-codify now?", two F12s asking the operator to act, and tokens QUOTED inside checklists (F8/T2/F5/F11, and "I'm still not emitting `TRANSITION: F13`").
        - ⇒ The planned fix ("no promotion when this turn's token is an exit out of verify-human") would fix 1 and un-blue ≥4–5 real asks. **Not shipped.** The plan's premise was wrong on frequency, not on mechanism.
        - Shipped instead: a header block in `verifyHumanPause.ts` ("NOT KEYED ON THE TURN'S EXIT TOKEN") and 4 pins in `verifyHumanPause.test.tsx` (auto-skip that chains → false; exit token + question → true; quoted token → true; ACCEPTED COST, bare exit-and-stop → true). Mutant: a naive "F11/F12/F13 in the last line → false" rule in `endsAtVerifyHuman`. It landed in executable code (`sed`-confirmed), 3 pins killed it, and the file was restored to the same SHA (`621a435`).
      - Alternative if the operator rejects the recommendation: a line-anchored, verdict-only token rule. It would still un-blue the "F13 + question" shape, and it reads the same token `readTurn` misreads when a token is quoted (`SURFACE-2026-09-28-SUPERVISOR-FIRES-ON-A-TRANSITION-TOKEN-QUOTED-IN-PROSE`).
    - [x] P3.verify-human.2: blue is decided after the supervisor's verdict — ~0.1 s on a plain pause, up to the adjudicator's ~3 s on an adjudicated turn, so a fired turn never flashes blue (Assumed #9). Acceptable?  <!-- status: done (operator pass 2026-10-26) -->
  - [x] verify-codify  <!-- status: done (2026-10-26) -->
    - Coverage map. Already pinned and not duplicated: the rule, memo, `mayPromote` and handler in `verifyHumanPause.test.tsx` (34, including the 4 P3.verify-human.0 pins added in the back-loop); the hook's edge logic in `useClearAttentionOnGateOff.test.tsx` (6). Integration boundary: `Workspace` (it hosts `useSupervisor`, and the header dot is user-visible) and `App` (it hosts the gate clear). The tests above mount neither.
    - NEW `src/components/workspace/__tests__/verifyHumanPauseLive.test.tsx` (4, real `Workspace` via `liveWorkspace`): a verify-human stop → `workspace_status_promote {workspaceId:"ws-1", stopEventAt}`; a supervised turn → ONE `transcript_tail` and one promote (the decision's read is reused); another skill → no promote; gate OFF → no read and no promote.
    - NEW `src/__tests__/gateOffClearWiring.test.tsx` (2, real `App` + the REAL gate seam, driven by its broadcast event): ON→OFF → exactly one `workspace_status_clear_attention`; boot OFF then ON → none.
    - Mutants, each alone, each landed in executable code, each file restored to the same SHA: `Workspace` gate forced `true` → killed (gate-OFF test); `Workspace` `ccSessionIdRef` → `{current:null}` → killed (3); decision tail not reused → killed (one-read test); `App` hook fed `true` → killed; `App` call deleted → killed; `App` hook fed `!gate` → killed (2).
    - Full run: `pnpm verify:auto` → EXIT=0 (39s). vitest 265 files / 3534 passed, cargo lib 1033 passed, lint 0 errors / 1 warning (the old `XtermPane.tsx:932`). The first run failed 1 (`offInvariantGuard`, triaged above as my new test naming the gate command, which was rewritten).

- [x] Phase 4: Record 4.3 and resync the docs
  **Observable outcomes:**
  - CLI (docs-only phase; no product code changes): `git diff --name-only` for the phase touches
    only `workflow-system/product/arch/status-channel-and-surfaces.md`,
    `workflow-system/product/arch/workflow-supervisor.md`, `CLAUDE.md`, the `event_is_turn_start`
    rustdoc, the backlog files and this WIP; `pnpm verify:auto` still exits 0.
  - CLI: `grep` finds M3 (Stop does not fire on Esc, 0/16 vs 2,060/2,068) and the M4 table in
    §A.5; §A's `Stop` mapping names the `monitor` exclusion and the count fallback; §G records the
    overlay as a status-channel input that owns no seventh arm and why; CLAUDE.md's "FOUR states"
    bullet names the `monitor` exclusion and the gated verify-human overlay.
  - CLI: an upstream CC ask is drafted at `workflow-system/outbox/` (queued-prompt field on
    `UserPromptSubmit`, or an interrupt hook) — written, NOT sent.
  **Alignment questions:**
  - (decision, outward-facing) Spec Assumed #5: 4.3 keeps today's markers. Send the drafted
    upstream CC ask, keep it unsent, or drop it?
  - [x] P4.1 Arch docs + CLAUDE.md resync.  <!-- status: done -->
    - `arch/status-channel-and-surfaces.md` §A: the WP1 "array length only" claim is now marked superseded (types are forwarded); a new bullet for the `Stop` mapping (`monitor` exclusion, exclude-one-never-allow-list, count fallback, the M1 measurement); a new bullet for the overlay (the `attention` field, the two readers, promote compare-and-set, the three clears, the re-emit clearing the turn markers, absent when the gate is OFF).
    - §A.5: new "Queued prompts" subsection with M3 + the M4 table. Also CORRECTED a pre-existing stale paragraph: it said `session_id` is dropped before the DTO, but it has been on the DTO since M15 WP3. Collapse onto one workspace still holds.
    - `arch/workflow-supervisor.md` §G: new subsection. The overlay is a status-channel input; it sits outside `decideTurn` and reuses the decision's tail; it is decided after the verdict; it is session-scoped with a memo (380/407, 0 false); it is NOT keyed on the exit token (decision A); no seventh arm and why. The pin stays at 9.
    - `CLAUDE.md` "FOUR states" bullet: count + types, a `monitor`-only `Stop` is Idle, the verify-human blue is a gated display overlay, and which consumers read `state`.
  - [x] P4.2 `event_is_turn_start` rustdoc points at §A.5's measurement.  <!-- status: done (M3/M4 numbers + pointer to §A.5 "Queued prompts"; `cargo fmt --check` OK) -->
  - [x] P4.3 Draft the upstream ask (outbox, unsent).  <!-- status: done — `workflow-system/outbox/UPSTREAM-to-claude-code-queued-prompt-signal.md`, frontmatter `status: DRAFT — NOT SENT`. Two options: a `queued` field on `UserPromptSubmit`, or an interrupt hook. Generic wording, no project paths. -->
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → EXIT=0 (48s). lint 0 errors / 1 warning (the old `XtermPane.tsx:932`), format, tsc, check:link, vitest 265 files / 3534 passed (includes `archDocEnumeration` over the edited arch docs), cargo fmt (the new rustdoc), clippy, cargo lib 1033 passed.
  - [x] verify-self  <!-- status: done -->
    - [x] Product code change is rustdoc-only (runner). Evidence: `diff mod.rs.p4baseline mod.rs` → one hunk `668a669,675`, 7 `///` lines added, 0 removed. With `///` stripped the files are identical. Positive control: a planted `const __P: u8 = 0;` → a difference is reported. `pnpm verify:auto` → EXIT=0 (39.4s), vitest 3534, cargo lib 1033, clippy clean.
    - [x] Doc anchors present as positive statements at the right sites (runner). Evidence: status-channel §A.5 L88–96 (M3 0/16 + 2,060/2,068; M4 table 30/34·0/8, 6/34·7/8); §A L41–43 (`monitor` exclusion, exclude-one, count fallback); supervisor §G L342–382 (no seventh arm, registration-shape reason, pin 9); CLAUDE.md L166. Every code claim in the new text checked against source, with no contradiction.
    - [x] Upstream ask drafted, unsent, no private paths (runner). Evidence: `git status` `??`; frontmatter `status: DRAFT — NOT SENT`; `grep -niE '/Users/|claudesk|stayman'` → no match.
    - [x] align: send / keep unsent / drop the upstream ask. Evidence (CAPTURED): full Title + Body of `workflow-system/outbox/UPSTREAM-to-claude-code-queued-prompt-signal.md`.
    - Note: the runner flagged a pre-existing stale `:502` line citation at status-channel §A.5 L64 (the function is at :676 now). It was fixed in place as part of this phase's docs resync: the sentence now cites by symbol only, as its own warning says to. This is a doc edit, not a code change.
  - [x] verify-human  <!-- status: done (2026-10-26) -->
    - [x] P4.verify-human.1: DECISION (outward-facing, Spec Assumed #5): send the drafted upstream CC ask / keep it unsent / drop it. **Operator: A, agent files it** (2026-10-26).  <!-- status: done -->
      - Filed: https://github.com/anthropics/claude-code/issues/105187 (`gh issue create`, account StaymanHou). Duplicate check first: #90296 is about a different app (ZCode, hook never fires mid-turn), and no interrupt-hook request exists.
      - ⚠️ **Agent error, fixed:** the issue was first created with an EMPTY body. The body-extraction `sed` had errored, leaving an empty file, and it was not checked before filing. Corrected within ~1 minute via `gh issue edit --body-file` (2,070 chars). No comments or labels landed in between. The outbox draft's frontmatter now records SENT + URL.
      - Backlog `SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES` rewritten (not deleted; still open): blocked on upstream #105187, with the measurement and a pointer to §A.5.
  - [x] verify-codify  <!-- status: done (2026-10-26) -->
    - Docs-only phase: no integration boundary (one rustdoc comment). What was codified is the decision KEPT here: `event_is_turn_start` stays a stateless "every submit" rule.
    - NEW `status_broadcaster::tests::a_submit_with_no_stop_since_the_last_is_still_a_turn_start`: submit → PostToolUse → submit through `to_update` + `record_emitted` → both submits `is_turn_start: Some(true)`.
    - Gap proven: a rule-A mutant in `to_update` ("a turn start only if the last emitted was a turn end") compiled and landed (`grep` L643/L650). The 4 pre-existing turn-start tests (`event_is_turn_start_predicate_pins_the_rule`, `turn_start_separates_the_two_running_producers`, `turn_start_is_false_for_every_other_mapped_event`, `end_to_end_socket_one_turn_start_per_turn_not_one_per_tool_call`) all PASSED on it; only the new test FAILED. File restored (shasum match).
    - Full run: `pnpm verify:auto` → EXIT=0 (42s). vitest 3534, cargo lib **1034** (+1), lint 0 errors / 1 old warning.

## Test Triage — offInvariantGuard "no module bypasses the seam to read the setting directly" (Phase 3 verify-codify, 2026-10-26)
Classification: Obsolete test (of my own): the new `src/__tests__/gateOffClearWiring.test.tsx` names the raw gate command `workflow_get_features_enabled` to answer the seed. The guard is correct, and the code under test is correct.
Confidence: high
Evidence: the guard's offenders list is exactly `["src/__tests__/gateOffClearWiring.test.tsx"]`; the file matches on its `if (cmd === "workflow_get_features_enabled")` mock answer.
Action: rewrote the new test to drive the REAL seam only through its broadcast event (`WORKFLOW_FEATURES_ENABLED_EVENT`: ON, then OFF). The command name no longer appears, and the guard's allowlist is untouched.

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality against ship commit `53141d4`
- **Blocked:** none
- **Unvisited:** review-quality, finalize
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-10-21] feature-spec — wbs.md exceeds size guard (438 lines). Read in full anyway: WP4's design basis is its "Probe outcomes" section, past line 300. Consider moving closed WPs' probe outcomes out at the next trim.

