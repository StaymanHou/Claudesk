# Feature: WP2 — Background-work status states (probe + stale-blue fix)

**Workflow:** feature
**State:** COMPLETED 2026-08-22 — shipped `e3eaed8`, archived
**Created:** 2026-08-21
**WBS:** Milestone 13.5, WP2
**Backlog items:** `SURFACE-2026-08-16-IDLE-DOT-CONFLATES-DONE-WITH-WAITING-ON-A-BACKGROUND-JOB` (wrongly-gray, probe-gated) + `SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT` (stale-blue)

## Problem Statement

The status broadcaster has exactly three live states (`Running` / `AwaitingInput` / `Idle`;
`Unknown` is the pre-first-event default and is never emitted). Two background-work shapes fall
outside it, with a shared root cause (the model was designed around a single foreground turn) but
**opposite symptoms**:

1. **Wrongly GRAY** — CC returns control while a backgrounded *shell job* it launched is still
   running. `Stop` maps unconditionally to `Idle` (`status_broadcaster/mod.rs:124`), so the dot
   reads "done, nothing to see."
2. **Wrongly BLUE (stale)** — a background *agent* lights `AwaitingInput` honestly and nothing ever
   clears it. `SubagentStop` is the only event marking that transition and it is
   `mapped=none, outcome=dropped`.

⚠️ **The blue half's DIAGNOSIS is wrong in the backlog item, the WBS, and `CLAUDE.md` — corrected
here from the corpus (F10–F12).** All three describe it as *"lit honestly, never cleared"* and name
`SubagentStop` as the missing clearing edge. The measured truth: CC sends
`notification_type: "agent_completed"`, Claudesk does not recognize the type, and
`notification_awaits_input`'s deliberate unknown-type fallback turns the dot **blue**. The dot was
**lit wrongly** — there is no missing clear, there is a light that should never have come on.
`SubagentStop` is a coincidence of timing and belongs to a different session entirely.

Consequently the WBS's blockedness split holds, but for different reasons than stated:

- The **blue** half really does ship regardless — and is **smaller** than the WBS implies: a one-line
  classification fix plus one explicit type, not a fourth state and not a counter. Both designs the
  backlog item proposed are refuted (option (a) breaks a correct pinned test for no gain; option (b)
  is impossible because `agent_type` is NULL on 100% of 3,977 events). So are two designs I drafted
  before finding F10 — recorded in Phase 1 so they are not revived.
- The **gray** half's *launch* signal almost certainly **exists** (`run_in_background: true` is a real
  `Bash` tool-input field on live invocations, and `PreToolUse` receives `tool_input`), so the probe
  is narrower than feared. The genuinely open question is the **completion** signal (F6).

## Planning findings (corpus evidence — read before building)

Measured against the live prod corpus: `~/Library/Application Support/com.claudesk.app/`
(`time-analytics.sqlite`, 103MB; `status-channel.log`, 2.5MB) plus 25 recent CC transcripts.
⚠️ Per `[[time-tracking-capture-is-machine-global]]` the SQLite spans **all** projects on this
machine, not just Claudesk — correct for measuring CC's *hook behavior*, which is what these
findings are about.

- **F1 — `SubagentStop` is unpaired and in surplus.** 3,031 `SubagentStop` vs 946 `SubagentStart`
  (3.2:1). Per-session: `0/19`, `0/13`, `5/50`, `6/32`. ⚠️ **Any counter design goes permanently
  negative.** This is the single finding that kills backlog option (b) as written.
- **F2 — `agent_type` is NULL on 100% of 3,977 subagent events.** CC does not send `subagent_type`
  (or the hook's `$payload->{subagent_type}` read misses it). ⚠️ The doc comment at
  `hook_install/mod.rs:61` and `reclassify/mod.rs:31` both assert pairing "by `agent_type`" — a
  claim the data refutes. The M9 reclassifier survives only because it buckets everything under
  `<unknown>` (`reclassify/mod.rs:294`).
- **F3 — `PreToolUse[Agent]` / `PostToolUse[Agent]` pair EXACTLY.** 493 pre vs 486 post + 7 failures
  = 493, and they balance per-session in every session sampled (2/2, 6/6, 30/30, 7/7). Both carry
  `tool_use_id` in `meta`. ⚠️ **This is the properly-paired subagent signal the backlog item asked
  for and did not find** — and it is *already registered and already flowing*. Note `SubagentStart`
  (946) ≠ `PreToolUse[Agent]` (493), so `SubagentStart` is not the spawn signal either.
- **F4 — `run_in_background: true` is a real `Bash` tool-input field** on live invocations
  (confirmed on 8+ distinct `tool_use` blocks across 4 transcripts). `PreToolUse` receives
  `tool_input`, so the **launch** side is reachable.
- **F5 — the hook script discards everything it does not name.** `claudesk-hook.pl:181-184`
  forwards only `tool_name` + `tool_use_id` for tool events; it never reads `tool_input`. ⚠️ So the
  persisted corpus **cannot** answer whether CC sends a background flag — absence in SQLite is the
  hook's forwarding choice, not evidence about CC. A **raw-payload capture is a required, separate
  instrument** (`[[cc-hook-capture-beats-docs]]` applies with force here).
- **F6 — no `BashOutput` / `KillShell` tool call appears in 25 sessions.** Background-job completion
  surfaces to the model as a harness *notification*, not a tool call. ⚠️ **This is why the
  completion side is the real gate**: if it never crosses the hook channel, there is no closing edge
  and the gray half is upstream-blocked exactly as the WBS anticipated.
- **F7 — `~/.claude/jobs/<id>/state.json` carries `inFlight: {tasks, queued, kinds}` + `tempo`.**
  A file-based background-work signal nobody considered. ⚠️ **But it is for background CC *sessions*
  (`template: "bg"`), not backgrounded shell jobs, and every instance is stale** (all `done`, last
  write 2026-08-06). Recorded so a later reader does not mistake it for a live channel — and so this
  plan is not accused of missing it.
- **F8 — `aggregate_alarm` is deliberately BINARY** (`tray/mod.rs:55`: `Attention` iff any
  `AwaitingInput`). ⚠️ Its `states.contains(...)` shape means a **new variant silently defaults to
  Neutral** — a fourth state must make that choice explicitly, not inherit it.
- **F9 — the frontend degrades safely.** `statusPresentation`'s `default` arm returns Unknown for an
  unrecognized wire state (`workspaceStatus.ts`), and PiP's `isAwaitingInput` keys on the literal
  `"awaiting_input"` only. So a fourth state cannot crash a surface — but it renders as a gray
  "Unknown" dot until each surface is taught, which is a *silent* wrong-colour, not a visible break.

## Work Tree

- [x] Phase 1: Stale-blue — `agent_completed` is an UNKNOWN type falling through to blue  <!-- status: COMPLETE 2026-08-21 — all impl tasks + all 4 verify gates [x] -->
  ⚠️ **P1.1 IS ALREADY ANSWERED, from the corpus, at plan time. Read F10–F12 before designing
  anything.** The measured instance survives verbatim at `status-channel.log.1:15948-15950`, and the
  answer is **neither** backlog option — and not the two designs I drafted before finding it
  (`Agent`-tool pairing; per-session attribution). Both are refuted below. This matters because a
  fix built on either would have passed its own tests and changed nothing.

  **F10 — the cause: CC sends `notification_type: "agent_completed"`, and Claudesk does not know the
  type, so its honest-fallback turns the dot BLUE.** `notification_awaits_input`
  (`status_broadcaster/mod.rs:~100`) returns `true` for any unrecognized type — deliberately, so a
  future input-needed type is never silently swallowed. But `agent_completed` is a **completion**
  notification, the exact opposite. `is_known_informational_notification` lists only
  `idle_prompt | auth_success | elicitation_complete | elicitation_response`. ⚠️ **So the dot was
  never "lit honestly and never cleared" (the backlog item's framing) — it was lit WRONGLY.** There
  is nothing to clear; there is a light that should not have turned on.

  **F11 — CC's real notification-type vocabulary, measured (prod corpus, all `Notification`s):**
  `idle_prompt` 1681 · `permission_prompt` 376 · **`agent_completed` 3** · `auth_success` 2 ·
  **`agent_needs_input` 1**. ⚠️ The two agent types are a **matched pair** and Claudesk handles
  exactly one of them correctly by accident: `agent_needs_input` → blue is **right** (falls through
  to the input-needed default); `agent_completed` → blue is **wrong**. The fix is to add
  `agent_completed` to the informational list. `agent_needs_input` should be added to
  `INPUT_NEEDED_NOTIFICATION_TYPES` **explicitly** — it is correct today only by fallback, and the
  fallback is what F10 shows to be unreliable.

  **F12 — severity: the backlog item's "one instance in ~5 days" note is CORRECT; do not inflate
  it.** Across the whole 103MB corpus there is **exactly 1** genuinely-blue `Notification` following
  a `Stop`. ⚠️ I first measured "655 Notification-after-Stop occurrences" and read it as a
  high-frequency defect — **that was wrong**: 1,671 of 1,673 carry `idle_prompt`, which already
  maps to no-op correctly. Recorded because the wrong number is the more alarming one and a later
  reader may re-derive it. Total `agent_completed` events ever: **3**. This is a **one-line, low-risk
  correctness fix**, not a subsystem change.

  **Refuted designs — do not revive (each cost a design pass):**
  - ❌ *`SubagentStop → Idle`* (backlog option a) — `SubagentStop` fires unpaired and in 3.2:1
    surplus (F1) and belongs to a **different session** than the blue notification (F13). Also
    breaks the pinned M9 test for no gain.
  - ❌ *count agents per workspace* (backlog option b) — impossible: `agent_type` is NULL on 100% of
    3,977 events (F2) and the stop surplus underflows any counter (F1).
  - ❌ *`Agent`-tool `PreToolUse`/`PostToolUse` pairing* (my first pass, from F3) — the blue
    `Notification` arrives **after** `Stop`, so no foreground tool event follows it to clear.
  - ❌ *per-`(cwd, session_id)` attribution* (my second pass) — real (four sessions do collapse onto
    `ws-3`, F13) but **not this defect's cause**: only **1 of 1,673** post-`Stop` notifications is
    cross-session. A genuine finding, filed separately, **not** built here.
  ⚠️ **`m9_time_analytics_events_are_status_neutral` is untouched by this fix** — the backlog item's
  warning that any fix "contradicts a passing test" was premised on option (a) alone.
  **Observable outcomes:**
  - CLI: `cargo test` exits 0; `m9_time_analytics_events_are_status_neutral` passes with its
    assertions **byte-unmodified** (grep the body before/after — `SubagentStop` still asserted
    `None`). ⚠️ If that test needed an edit, the design drifted back to a refuted one.
  - CLI: a unit test asserts `event_to_state(Notification{notification_type:"agent_completed"})`
    is `None` (no-op), and a sibling asserts `"agent_needs_input"` is `Some(AwaitingInput)`.
    ⚠️ Mutation-prove **each assertion individually** and confirm the mutant landed in executable
    code (`[[verify-the-mutation-landed]]`, `[[guard-predicate-completeness-vs-mutation-landing]]`) —
    a single composite test that trips on either change would hide a gap.
  - CLI: `notification_unknown_type_falls_back_to_awaiting` still passes — the honest-fallback
    principle is **preserved, not weakened**; this fix only moves two *known* types out of it.
  - CLI: a unit test replays the verbatim F10 sequence (`UserPromptSubmit` → `Stop` →
    `Notification{agent_completed}`) and asserts the workspace's final state is `idle`, **not**
    `awaiting_input`.
  - Browser (live, MCP bridge): with a workspace at `idle`, delivering an `agent_completed`
    `Notification` leaves the filmstrip dot on `status-dot-idle` — it does **not** go blue.
    Seed via the React fiber (`[[mcp-bridge-seed-held-workspace-status-via-fiber]]`;
    `ipc_emit_event` double-encodes). ⚠️ `read_logs{source:"console"}` captures nothing for this app
    (`[[read-logs-console-captures-nothing]]`) — an empty console is a false green.
  - [x] P1.1 ✅ **Confirmed.** Dev corpus carries only `idle_prompt` (42) / `permission_prompt` (16)
        and **zero** `agent_*` events — neither confirms nor contradicts, as predicted. A full sweep
        of **both** corpora gives the complete vocabulary: exactly **5** types
        (`idle_prompt` 1723 · `permission_prompt` 392 · `agent_completed` 3 · `auth_success` 2 ·
        `agent_needs_input` 1). The code knew 4 of the 5; `agent_completed` was the gap.  <!-- status: DONE -->
  - [x] P1.2 ✅ **Fixed.** `agent_completed` → `is_known_informational_notification`;
        `agent_needs_input` → `INPUT_NEEDED_NOTIFICATION_TYPES` (arity 2→3). Both doc comments
        rewritten with the measured vocabulary, plus the module-level `//!` state-mapping table which
        also enumerated the old lists. ⚠️ **A mutation probe found a REAL GAP in my own first test
        set** — see the note below; fixed by adding `agent_needs_input_is_classified_explicitly_not_by_fallback`.  <!-- status: DONE -->
  - [x] P1.2b ✅ **Mutation-proved each assertion individually** (4 new tests; Rust 859→863).
        ⚠️ **Mutant 2 exposed a genuine hole:** deleting `agent_needs_input` from
        `INPUT_NEEDED_NOTIFICATION_TYPES` left **every behavioral test green**, because the
        unknown-type fallback produces the identical result. So `event_to_state(agent_needs_input) ==
        AwaitingInput` cannot distinguish "classified deliberately" from "classified by accident" —
        exactly the ambiguity that let `agent_completed` ship broken. Closed by asserting **list
        membership** directly, which is the only form that fails under the mutant (verified: it
        FAILS, while the 3 behavioral tests pass — correct attribution).
        Mutant 1 (`agent_completed` removed) killed precisely its 2 owning tests and left the
        `agent_needs_input` test passing. Both mutants confirmed landed in **executable** code by
        reading the mutated lines back (`[[verify-the-mutation-landed]]`); mutant 2 initially left a
        stale `[&str; 3]` arity → compile error, i.e. an **invalid probe**, corrected before drawing
        any conclusion (`[[invalid-probe-and-real-hole-look-identical]]`).  <!-- status: DONE -->
  - [x] P1.3 ✅ **Reclassifier checked — the shared fix is CORRECT and its analytics effect is
        measured, not assumed.** `reclassify::awaiting_input_spans_bounded` (`mod.rs:962`) calls
        `notification_awaits_input` directly as its single source of truth, so this fix changes
        historical analytics in the **same direction** — an `agent_completed` no longer opens a
        CC-AwaitingInput span. **Measured impact: 3 spans, all three of them the LAST event in their
        session.** ⚠️ That placement is what makes them worth mentioning: on the *unbounded* path
        (`awaiting_input_spans`) an unclosed span is dropped, so the pre-fix error was 0s — but on
        the **bounded** path (`awaiting_input_spans_bounded`, the one the live query layer uses) each
        would open a phantom await running to the `window_end`, exactly the WP4 tail-of-stream
        behavior that exists to *preserve* trailing awaits. So the pre-fix defect inflated
        "blocked on input" at the tail of 3 sessions and the fix removes it. Small, real, and in the
        intended direction — no reclassifier code change needed.  <!-- status: DONE -->
  - [x] P1.3b ✅ **`elicitation_complete` / `elicitation_response` / `elicitation_dialog` have never
        been observed** in either corpus (the full measured vocabulary is 5 types). Left in place —
        each already classifies the way the fallback would, so they are inert. Documented as
        speculative on `INPUT_NEEDED_NOTIFICATION_TYPES` so a later reader does not cite them as
        evidence of CC behavior.  <!-- status: DONE -->
  - [x] P1.4 ✅ **Corrected — and the repo-wide grep proved the plan's 2-site list was a FLOOR, as
        warned** (`[[doc-correction-scope-list-is-a-floor]]`). **5 live sites**, not 2:
        `hook_install/mod.rs` · `reclassify/mod.rs` (module header **and** the
        `subagent_intervals` fn doc, where the claim is load-bearing) · `claudesk-hook.pl` ·
        `arch/status-channel-and-surfaces.md` · `tests/hook_pl_output.rs`. Archived WBS/WIP files were
        deliberately **left alone** — they are dated historical records, not live spec.
        ⚠️ The `hook_pl_output.rs` site is the subtle one: `subagent_start_maps_subagent_type_to_agent_type`
        **passes and is correct** (it pins the hook's transformation on a *synthetic* payload), but its
        comment asserted "CC sends `subagent_type`" as fact. Comment corrected; test unchanged —
        a passing test whose premise is false is exactly how a refuted claim survives.  <!-- status: DONE -->
  - [x] P1.5 ✅ **`CLAUDE.md` + `arch/` updated with the corrected diagnosis.** The arch doc's
        notification-gating section (line 24) was the authoritative statement of the gate and
        enumerated both stale type lists; it now carries the corrected lists, the measured 5-type
        vocabulary, and an explicit ⚠️ that the *old diagnosis in the backlog item / WBS / `CLAUDE.md`
        was wrong* (dot lit wrongly, not lit-and-never-cleared; `SubagentStop` uninvolved).
        ⚠️ **`CLAUDE.md` tripped the 40k threshold** as the handoff predicted (39,779 → 40,085 with
        the new warning). Resolved by trimming the **v0.3.4 release line**, which was 610 bytes of
        per-release detail whose own text said not to trust it and which `git tag` + CHANGELOG already
        supersede — net **39,840**, warning intact, no prune skill needed.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: PASS 2026-08-21 — see the gate result under Current Node -->
  - [x] verify-self  <!-- status: PASS 2026-08-21 — live, via the real hook socket against a rebuilt dev binary; see the verify-self block under Current Node -->
  - [x] verify-human  <!-- status: APPROVED 2026-08-21 (operator) — vh3 PASS; vh1 gray-but-did-not-exercise-the-fix; vh2 not-testable-by-frequency. See the verify-human block for what this does and does NOT establish. -->
    - [x] P1.verify-human.1 Real background agent COMPLETES → dot stayed gray  <!-- status: PASS-but-DID-NOT-EXERCISE-THE-FIX: the real Agent-tool run emitted NO agent_completed; its only Notification was idle_prompt (already handled pre-fix). Dot correctly gray, but this is not evidence about the changed code path. See the verify-human block. -->
    - [x] P1.verify-human.2 Real background agent NEEDS INPUT → dot still goes blue  <!-- status: NOT-TESTABLE (operator): "I actually rarely come across a situation where a background agent needs input." Accepted as untestable-by-frequency, NOT as a pass. Covered by socket injection at verify-self + the unit + membership tests. -->
    - [x] P1.verify-human.3 Ordinary permission prompt → dot still goes blue  <!-- status: PASS (operator: "good") — the common path (permission_prompt, 392 corpus events) is untouched. -->
  - [x] verify-codify  <!-- status: DONE 2026-08-21 — added the consuming-surface regression test (real socket → to_update); mutation-proven. Rust 863→864. -->
  - SURFACED: subagent pairing claim refuted by production data — filed as
    `SURFACE-2026-08-21-SUBAGENT-PAIRING-CLAIM-IS-REFUTED-BY-PRODUCTION-DATA`  <!-- status: SURFACED: agent_type NULL on 100% of 3,977 events + SubagentStop 3.2:1 surplus; docs corrected at 5 sites, analytics accuracy left open -->
  - SURFACED: status path keys on `cwd` alone, collapsing sessions — filed as
    `SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS`  <!-- status: SURFACED: investigated as this defect's cause and REJECTED; real but rare (1 of 1,673) -->
  - SURFACED: notification-type fallback is wrong for completion types — filed as
    `SURFACE-2026-08-21-NOTIFICATION-TYPE-FALLBACK-IS-WRONG-FOR-COMPLETION-TYPES`  <!-- status: SURFACED: the generalization of the fixed defect; nothing notices a NEW type appearing -->

- [x] Phase 2: Probe — is there a background-shell-job signal at all?  <!-- status: COMPLETE 2026-08-22 — YES on the outstanding side (Stop.background_tasks), NO upstream on completion (declined by design), and the killed-on-exit finding dissolved the expiry problem -->
  **Scope:** answer the WBS's Q1/Q2 from a **live raw hook capture**, not the docs and not the
  existing corpus (F5: the corpus structurally cannot answer it). ⚠️ **A "no signal" verdict is a
  legitimate WP outcome, not a failure** — say so in the close rather than padding the WP.
  ⚠️ **Do NOT infer from PTY output** — `arch.md` forbids it outright.
  **Observable outcomes:**
  - CLI: a raw-capture sidecar hook writes verbatim CC stdin payloads to a scratch file; running a
    `Bash(run_in_background: true)` job to completion yields a capture file in which
    `grep -c run_in_background` is **> 0** on the launch event (proving the instrument works — the
    **positive control**, per `[[invalid-probe-and-real-hole-look-identical]]`).
  - CLI: from that same capture, a written verdict on the **completion** side: either a named event
    + field that fires when the job lands, or a documented absence across ≥3 background jobs of
    varying duration. ⚠️ The positive control is what makes an absence verdict trustworthy — without
    it, "no completion event" and "broken capture" are indistinguishable.
  - CLI: the probe's own teardown is verified — `~/.claude/settings.json` is byte-identical to its
    pre-probe state (`diff` against a copy taken first), and the sidecar is removed.
  - [x] P2.1 ✅ Snapshotted `~/.claude/settings.json` (SHA-256 recorded), registered the sidecar as a
        **third, additive** matcher-group on `PreToolUse`/`PostToolUse`/`Notification`/`Stop`. Both
        Claudesk groups (dev + prod) verified untouched by count on all 10 events. Instrument
        self-tested first: captures verbatim, **exits 0**, **silent on stdout** (it runs inside the
        operator's live CC, so those are the same invariants `claudesk-hook.pl` holds).  <!-- status: DONE -->
  - [x] P2.2 ✅ **4 runs. Q1 = YES for the outstanding side, NO for the completion side.** See the
        verdict block under Current Node.  <!-- status: DONE -->
  - [x] P2.3 ✅ Verdict written; `settings.json` restored and verified **byte-identical** by matching
        SHA-256 (`04f5614c...`) and `diff`. Instrument deleted; evidence kept at
        `scratchpad/rawcap-EVIDENCE.jsonl`. Live hook channel re-confirmed working after teardown
        (fresh `claude -p` produced `UserPromptSubmit`->running / `Stop`->idle in `status-channel.log`).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: PASS — probe added NO product code (git diff --stat unchanged from Phase 1); nothing to re-gate. -->
  - [x] verify-self  <!-- status: PASS — all 3 observable outcomes checked: positive control (run_in_background=true on PreToolUse) PASS; completion verdict written from 4 runs PASS; settings.json byte-identical + sidecar removed PASS. -->
  - [x] verify-human  <!-- status: APPROVED 2026-08-22 (operator) — probe verdict acknowledged; operator challenged the no-signal call ("really no signal? nor walkaround?") which forced the docs/issue-tracker pass AND the PID-polling probe, both of which sharpened the verdict. Decision: BUILD the fourth state. -->
  - [x] verify-codify  <!-- status: N/A — probe phase, no product code. The verdict + the 2 refuted alternatives (upstream hook, PID polling) are codified as prose in this WIP and in the backlog items; there is no behavior to pin with a test. -->

- [x] Phase 3: Fourth state — BUILT (Phase 2 said yes)  <!-- status: COMPLETE 2026-08-22 — all impl tasks + all 4 verify gates [x] -->
  ⚠️ **This phase does not exist unless P2.2 finds a completion signal.** If it does not, skip
  straight to Phase 4 and re-file the gray half as blocked-on-CC-upstream with the capture as
  evidence. ⚠️ `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` leaning **minimal**:
  if the only honest signal is weak, **prefer keeping three states** over shipping a state that is
  right less often than the gray dot is now. **Flag if wrong.**
  **Relevance check (before Phase 3):** to be recorded at phase entry per the phase-advance gate —
  the P2 verdict *is* the "solution still feasible" signal, so this check is load-bearing here
  rather than ceremonial.
  **Observable outcomes:**
  - CLI: `cargo test` exits 0 with a new `WorkspaceState` variant; `dto_serde_shape_is_snake_case`
    and `state_label` both cover it (the enum's own tests already pin every variant — extend, don't
    replace).
  - CLI: a `tray::aggregate_alarm` unit test asserts the **explicit** chosen side for the new
    variant (F8: `contains` would silently default it to Neutral — the test must fail if the arm is
    removed, which a `contains`-shaped implementation cannot do).
  - Browser (live, MCP bridge): with a workspace seeded to the new state, the filmstrip dot resolves
    to the new dot class — **not** `status-dot-unknown` (F9: the safe default is exactly what makes
    a half-threaded fourth state invisible). Same assertion for PiP.
  - [x] P3.0 ✅ **Signal plumbing (not in the original task list — the probe created the need).**
        `claudesk-hook.pl` now forwards `background_task_count` on `Stop`, and `HookEvent` carries it.
        ⚠️ **A COUNT, never the tasks:** CC's array entries carry `command`/`description` (arbitrary
        user shell text), so forwarding the array would leak content the `prompt_length_chars` rule
        exists to keep off the wire. The status machine only asks "is any work outstanding", so a
        count is strictly sufficient. Verified over a real socket across 6 payload shapes: counts
        1/2 correct, `[]`→0, **absent**→0, **malformed string**→0, and the field appears **only** on
        `Stop`; no command text in any emitted line.  <!-- status: DONE -->
  - [x] P3.1 ✅ `WorkspaceState::BackgroundWork` + `state_label` → `"background_work"`. The
        label/serde lockstep test's hand-written variant list extended (⚠️ it does **not** fail to
        compile when a variant is added — it silently stops covering it; noted in the test).  <!-- status: DONE -->
  - [x] P3.2 ✅ Threaded through all three surfaces. **Colour: TEAL `#2aa198`** — ⚠️ **chosen against
        the palette that actually exists, not the plan's assumption.** The plan said "distinct from
        gray/green/blue", but `Running` is **warm orange `#d97757`**, not green — so amber/orange (the
        intuitive "in progress" pick) would have collided with Running, and any blue collides with
        Awaiting `#539bf5` *and* the active-tile glyph `rgba(110,168,255,.7)` sitting ~6px away.
        Teal is the remaining hue distinguishable from all four at 9px. Animation: the **same breathe
        as Running but slower (3.2s vs 1.8s)** — alive, less urgent; ⚠️ **never blinks**, because
        blinking is the reserved "needs me" cue. Dark-only, no light block. Added to `pip.css` too
        (its palette is a deliberate verbatim copy).  <!-- status: DONE -->
  - [x] P3.3 ✅ **`aggregate_alarm` → Neutral, as an explicit decision.** The menu bar's one bit means
        *"a project needs me"*; a running background job needs nothing. ⚠️ **Rewrote the fold from
        `states.contains(&AwaitingInput)` to an exhaustive `match`** so a 5th variant **fails to
        compile** here until someone picks its side — the `contains` form would have silently
        defaulted the new state to Neutral, which is the F8 trap this WP's own plan flagged before the
        variant existed. Pinned by a test asserting both arms (alone → Neutral; alongside an
        AwaitingInput → still Attention, i.e. it never masks a real alarm).  <!-- status: DONE -->
  - [x] P3.4 ✅ **Reclassifier: NO analogous meaning needed — documented "no".** Its `Stop` use is
        active-burst boundary detection (`last_ups_ts` → burst end). A background job is **not CC
        working**, so ending the burst at `Stop` stays correct regardless of outstanding jobs; giving
        `BackgroundWork` an analytics meaning would wrongly credit CC-active time to a sleeping shell.
        The `notification_awaits_input` coupling is untouched by this phase.  <!-- status: DONE -->
  - [x] P3.5 ✅ **A consumer the plan did not list: the close/quit guard.** `isActiveState`
        (`confirmDialog.ts`) gates the discard-or-cancel dialog, and it keyed only on
        `running`/`awaiting_input`. ⚠️ **`background_work` had to be added, and it is the opposite of
        cosmetic:** closing the workspace kills the CC session, and **a session exiting kills its
        background jobs** (Finding D). So this is precisely the "work in flight would be destroyed"
        case the guard exists for — omitting it would let one click silently discard running work,
        which is *worse* than the pre-M13.5 behaviour where the same close at least showed an honest
        `idle` dot. Found by grepping every `awaiting_input` consumer rather than trusting the plan's
        surface list.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: PASS 2026-08-22 — pnpm verify:auto exit 0; Rust 864->869, frontend 2136->2139. One Prettier reflow on the new test file, fixed; guard re-verified after the reflow (the ?raw-reflow hazard this repo has a lesson about). -->
  - [x] verify-self  <!-- status: PASS 2026-08-22 — live end-to-end on a REAL CC session + real backgrounded job: Stop -> mapped=background_work. Teal dot + 3.2s breathe + "Working in background" label confirmed on BOTH main and PiP. Backward-compat and clearing edge both driven through the real socket. -->
  - [x] verify-human  <!-- status: APPROVED 2026-08-22 (operator) — 5 of 6 leaves passed as built; the COLOUR was rejected and re-done teal->purple, then re-demoed. -->
  - [x] verify-codify  <!-- status: DONE 2026-08-22 — 3 coverage gaps closed (hook forwarding + privacy, consuming-surface e2e, the colour decision). Rust 869->873, frontend 2139->2140. -->
    - [x] P3.verify-human.1 Real backgrounded job → dot appears, reads as neither busy nor done  <!-- status: PASS (operator: "all else looking good") — demoed live through the real socket AND a real CC session -->
    - [x] P3.verify-human.2 Colour distinct from orange/blue/grey + the blue active-tile glyph  <!-- status: FAILED-then-FIXED: teal REJECTED by the operator (reads blue-adjacent; blue = needs-immediate-attention). Re-done in PURPLE #a371f7 and re-demoed side-by-side against the live blue alarm. -->
    - [x] P3.verify-human.3 3.2s breathe reads as "alive but not urgent" next to Running's 1.8s  <!-- status: PASS (operator: all else looking good) -->
    - [x] P3.verify-human.4 Menu-bar glyph stays DARK during background work  <!-- status: PASS — demoed with the contrast case (a permission_prompt DID light it), proving the dark glyph is a decision not a broken alarm -->
    - [x] P3.verify-human.5 Closing a workspace with a background job warns first  <!-- status: PASS — observed live: "scratch-c is still working (Claude Code is running). Close anyway and stop it?" / Cancel + Close Anyway; workspace survived the Cancel -->
    - [x] P3.verify-human.6 Label "Working in background" in the tooltip  <!-- status: PASS — title + hidden a11y label both read it -->

- [x] Phase 4: Close out the backlog items honestly  <!-- status: COMPLETE 2026-08-22 — all impl tasks + all 4 verify gates [x] -->
  **Observable outcomes:**
  - CLI: `grep -c 'SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT'
    workflow-system/state/backlog.md` returns 0 **iff** Phase 1 fully resolved it, and
    `CHANGELOG.md` carries the matching `**Backlog resolved:**` line in the same commit
    (the delete-on-resolve invariant).
  - CLI: the gray item is either deleted (Phase 3 shipped) or **rewritten** to describe only the
    remaining upstream-blocked work (the partial-resolution carve-out) — never left asserting a
    disproven design.
  - [x] P4.1 ✅ **Both source items FULLY resolved → DELETED (not rewritten).** The
        partial-resolution carve-out does not apply: the gray half got both halves of what it
        asked for (the probe found the signal; Phase 3 shipped the state) and the blue half was
        fixed in Phase 1. Order followed the invariant — **CHANGELOG written FIRST**, then the
        blocks deleted, both files staged for one commit. Verified mechanically: each slug is
        now `backlog=0 / changelog=1`. ⚠️ Each `**Backlog resolved:**` line carries the
        **refutation** as well as the fix, because both entries contained claims the work
        disproved: the blue item's stated diagnosis *and both of its proposed fixes* were wrong,
        and the gray item's "re-file as blocked-upstream" instruction is now obsolete and would
        mislead anyone who followed it. ⚠️ Also fixed a **dangling cross-reference**: a surviving
        item cited the deleted blue slug: annotated in place as resolved-and-deleted rather than
        left reading like a pointer to a live entry.  <!-- status: DONE -->
  - [x] P4.2 ✅ **All 4 Phase-1 discoveries confirmed still filed** (subagent-pairing, cwd-only
        attribution, notification-fallback, `~/.claude/jobs`). ⚠️ **Found 2 MORE from Phases 2-3
        that were recorded only in this WIP and would have been lost on archive** — both now
        filed: `SURFACE-2026-08-22-STOP-BACKGROUND-TASKS-IS-AN-UNDOCUMENTED-SEAM` (the purple dot
        rests on a field CC does not document; degradation is built + tested, but the failure mode
        is **silent** — the dot just goes back to grey, so the note exists to make it diagnosable)
        and `SURFACE-2026-08-22-A-CC-SESSION-EXIT-KILLS-ITS-BACKGROUND-JOBS` (the measured fact
        that retired the expiry problem AND the PID-polling branch — including the working
        `shell-snapshots` discriminator, kept in case CC ever lets jobs outlive a session).
        Backlog: 33 open (31 after the 2 deletes, +2 new).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: PASS 2026-08-22 — 6 scoped checks on the 2 edited state files; delete-on-resolve invariant HOLDS both directions; Rust 873/0 unchanged, proving no code was touched. -->
  - [x] verify-self  <!-- status: PASS 2026-08-22 — subagent verified all 7 outcomes; absence checks carried POSITIVE CONTROLS against git HEAD, and its block-set diff was stricter than my own check. -->
  - [x] verify-human  <!-- status: APPROVED 2026-08-22 (operator: "all fine") — all 3 judgement calls accepted: CHANGELOG narrative weight kept, delete-not-rewrite confirmed correct for both fully-resolved items, both new backlog notes kept. -->
    - [x] P4.verify-human.1 CHANGELOG length/narrative (refutations recorded, not just what shipped)  <!-- status: PASS -->
    - [x] P4.verify-human.2 delete-not-rewrite correct for both items; nothing open discarded  <!-- status: PASS -->
    - [x] P4.verify-human.3 the 2 new backlog notes worth keeping  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: DONE 2026-08-22 — NO test written, deliberately: the delete-on-resolve invariant is a workflow-system convention already guarded upstream (check-structure.sh Phase 11), and a Claudesk-side test would assert a one-time historical fact. Full suite re-run green (Rust 873 / frontend 2140). -->

## Current Node
- **Path:** Feature > ship (complete)
- **Active scope:** none. Shipped as **`75df9dc`** — one commit, **local and UNPUSHED** (close-commit
  discipline: the push is the operator's call). Working tree clean. **review-quality next.**
- **Blocked:** none
- **Unvisited:** none — the feature is complete. ⚠️ **WP2 does NOT close the M13.5 bucket:** WP3 (turn-output reorientation, with its own hard scope gate 3.2), WP4 and WP5 remain, which is why no `**Milestone:**` line was written to CHANGELOG.
- **Open discoveries:** 3 filed to `backlog.md` this session (see the SURFACED nodes under Phase 1); 2 more remain queued for P4.2

**Phase 1 verify-auto: PASS (2026-08-21).** Full gate `pnpm verify:auto` **exit 0** — Rust **863**
(859 + 4 new tests), frontend **2136** (unchanged), 30s wall-clock (registry says 55s; well inside
the 143000ms timeout). Scoped checks on the changed files, all green:
1. `perl -c claudesk-hook.pl` → syntax OK
2. `cargo fmt --check` → exit 0 (all 4 changed Rust files)
3. Each of the 6 load-bearing tests confirmed **individually present and passing** — the 4 new ones
   plus the 2 pinned invariants (`m9_time_analytics_events_are_status_neutral`,
   `notification_unknown_type_falls_back_to_awaiting`), both still passing **unmodified**.
   ⚠️ Named one-by-one on purpose: a `--quiet` filtered run printed only `39 passed` and could not
   show *which* tests ran — the same false-green shape as `ok. 0 passed; exit 0`
   (`docs/lessons/source-text-guards.md`). Each was re-run with a per-test grep asserting a `... ok`
   line actually matched.
4. Downstream consumers of the changed classification: `reclassify` **88 passed**, `hook_pl_output`
   **16 passed** — the reclassifier matters because it reads `notification_awaits_input` as its
   single source of truth.
5. `cargo clippy --all-targets -- -D warnings` → clean.

The one lint warning in the run (`XtermPane.tsx:631`, `react-hooks/exhaustive-deps`) is
**pre-existing and untouched** by this change.

**Phase 1 verify-self: PASS (2026-08-21)** — all outcomes verified **live**, driven through the real
`AF_UNIX` hook socket against a **rebuilt** dev binary, observed at both the main webview and PiP.

⚠️ **The run began with a STALE-RUNTIME trap that would have produced a false PASS.** The live dev
process had started at 15:43:44; the binary carrying the fix was written at 15:45:57 — so the running
image *predated the change*. `strings` on the on-disk binary found both new type strings, which is
exactly the misleading half: the artifact was correct while the process under test was not. Resolved
by stopping **only** the dev process (PID-scoped `kill`, prod PID 34942 left untouched and verified
alive afterward) and relaunching `pnpm tauri:dev`. ⚠️ Per
`SURFACE-2026-08-21-OSASCRIPT-CANNOT-SAFELY-ADDRESS-THE-DEV-BUILD`, no `osascript`/System Events was
used — the un-bundled dev binary has neither a bundle id nor a distinct title, so it resolves
silently to the wrong process (that quit the operator's live app last session).

⚠️ **An empty first DOM read was instrument-plausible and was NOT trusted.** The initial query found
`dotCount: 0`. Rather than conclude "no dots render", a positive control confirmed the instrument
(12,678 bytes of DOM, `picker` present) — the app was simply on the **project picker** with no
workspace open. Genuine state, not `[[xterm-dom-reads-fake-a-blank-pane]]`. A `scratch-b` workspace
was then opened via the React fiber (`onClick` through `__reactProps`), chosen because it carries no
`↻ continue` auto-resume flag and is a mandated scratch workspace.

| # | Event delivered (real socket) | Backend verdict | Main dots | Expected |
|---|---|---|---|---|
| 1 | `Stop` (baseline) | `mapped=idle · emitted` | `status-dot-idle` ×2 | ✅ |
| 2 | **`Notification{agent_completed}`** | **`mapped=none · dropped`** | **`status-dot-idle` ×2 (unchanged)** | ✅ **THE FIX** |
| 3 | `Notification{agent_needs_input}` | `mapped=awaiting_input · emitted` | `status-dot-awaiting` ×2 | ✅ negative control |
| 4 | `Notification{idle_prompt}` | `mapped=none · dropped` | — | ✅ no regression |
| 5 | `Notification{some_future_type}` | `mapped=awaiting_input · emitted` | — | ✅ **fallback preserved** |
| 6 | `Stop` (cleanup) | `mapped=idle · emitted` | `status-dot-idle` ×2 | ✅ left clean |

**Row 2 is the outcome that matters:** pre-fix this exact event read
`mapped=awaiting_input · outcome=emitted`. **Row 3 is what makes row 2 meaningful** — without it, a
PASS could equally mean the fix over-suppressed *all* agent notifications. **Row 5 proves the
honest-fallback principle survived** the change rather than being weakened to get row 2.

**All three surfaces agree.** PiP (`windowId: pip`) independently read `status-dot-awaiting` at the
blue step, confirming the single-broadcast fan-out is consistent — not just the main webview.

**Integration boundary: YES** (`event_to_state` feeds the existing filmstrip/PiP/tray surfaces and
`reclassify`). The phase's outcomes cite the filmstrip by name, and rows 2/3 exercise it through the
production input path — the socket, not a unit seam.

**Phase 1 verify-human: APPROVED (2026-08-21), with an honest limit on what it establishes.**

| Leaf | Operator result | What it proves |
|---|---|---|
| vh1 — real background agent completes | Dot stayed **gray** ✅ | ⚠️ **Did NOT exercise the fix** — see below |
| vh2 — background agent needs input | *"I actually rarely come across a situation where a background agent needs input"* | **Not testable by frequency** — recorded as untestable, NOT as a pass |
| vh3 — ordinary permission prompt | *"good"* ✅ | The common path (`permission_prompt`, 392 corpus events) is untouched |

⚠️ **vh1's gray dot is REAL but is NOT evidence about the changed code.** The operator ran a genuine
backgrounded `Agent`-tool task to completion (`SubagentStart` …250454 → `SubagentStop` …329696,
visible in `status-channel.log`). Its only `Notification` was at …313661 → **`mapped=none, dropped`**
— and the prod DB (machine-global capture) shows that notification's type was **`idle_prompt`**, not
`agent_completed`. `idle_prompt` was already classified correctly **before** this fix, so the gray dot
would have been gray pre-change too. **Reporting this as "the fix verified on real CC" would have
been a false claim**, and the tempting misread was available: `mapped=none, dropped` is exactly the
signature the fix produces.

⚠️ **Corollary — the in-turn `Agent` tool does NOT emit `agent_completed`.** All 3 corpus instances
came from elsewhere; the likely emitter is a **background CC session** (`~/.claude/jobs`,
`template: "bg"` — finding F7), not a subagent spawned inside a turn. So the type is real (3 live
captures, one of them the originally-reported defect) but **rarer than "any background agent
finishing"**, and this build never reproduced it on demand. Filed as a note on the follow-up item.

**What Phase 1 IS verified by, therefore:** the socket-injection run at verify-self (6 rows,
`agent_completed` → `mapped=none, dropped` through the real `AF_UNIX` path against a rebuilt binary,
with `agent_needs_input` → blue as the negative control and the unknown-type fallback preserved), the
4 unit tests, and the two individually-landed mutation probes. **What it is NOT verified by:** a live
CC-emitted `agent_completed`. That gap is stated rather than papered over.

**Screenshot artifact resolved (operator asked "look right?").** The tile shows **two** dots and only
one is a status dot: the gray one is `status-dot status-dot-idle` (`rgb(110,118,129)`, label "Idle");
the blue one below it is `filmstrip-tile-active-glyph` (`rgba(110,168,255,0.7)`) — the **"this tile is
centre-stage"** marker, blue regardless of CC state. Confirmed by walking the tile's computed styles.
⚠️ Worth noting for any future status-colour work (Phase 3): a blue non-status glyph already sits
~6px from the status dot, so a new state's colour must not collide with `rgba(110,168,255,·)` or the
two become ambiguous at a glance. **And no new colour exists yet** — Phase 1 only moves the dot
between the three existing states; the fourth colour is Phase 3, conditional on Phase 2's probe.

**Phase 1 verify-codify: DONE (2026-08-21).** Rust **863 → 864**; full `pnpm verify:auto` exit 0,
frontend 2136 unchanged. No test failed, so no `## Test Triage` entry is owed.

⚠️ **The 4 build-time tests were NOT sufficient, and the reason is the integration boundary.** All
four assert on `event_to_state` — the classifier in isolation. But the fix's whole point is what the
status *surfaces* render, and `to_update` (over a registry) is the function the filmstrip / PiP / tray
broadcast is actually built from. A classifier unit test cannot show the event is **dropped** rather
than emitted-as-something. Per the integration-boundary rule, unit coverage on the changed function
does not satisfy it — a consuming-surface test is owed **in addition**.

**Added:** `end_to_end_socket_agent_completed_is_dropped_while_agent_needs_input_still_emits` in
`status_broadcaster/commands.rs`, at the existing socket→`to_update` seam (the same level as the
pre-existing `end_to_end_socket_to_transform_…` test). It codifies the verify-self run that had been
performed **by hand** through the live socket and was therefore captured nowhere: 4 events in
(`Stop` · `agent_completed` · `agent_needs_input` · unknown type) → **3** updates out, asserted as
the exact state sequence `[Idle, AwaitingInput, AwaitingInput]`. The missing 4th update *is* the
assertion.

⚠️ **Mutation-proven, and the mutant was confirmed to land in executable code** before the result was
believed (`[[verify-the-mutation-landed]]`): removing `"agent_completed"` from the `matches!` arm made
this test **FAIL**, so it genuinely catches the regression rather than passing alongside it.

⚠️ **Two deliberate design choices in the test, both to avoid a green-but-blind guard:**
- The **negative control is in the same stream.** Asserting only "agent_completed is dropped" would
  pass equally if the fix had over-suppressed *every* agent notification — so `agent_needs_input` is
  asserted to still emit in the same run.
- The **unknown type is asserted to still emit.** That conservative fallback is load-bearing and must
  not be quietly weakened to obtain the `agent_completed` behaviour.
- `client.shutdown` is best-effort (`let _ =`), matching
  `SURFACE-2026-08-21-HOOK-SOCKET-SHUTDOWN-RACE-IS-FLAKY` — the listener may already have closed its
  side, and the assertions are what matter, not the shutdown. This avoids importing a known flake.

## Retrospect

- **What changed in our understanding:** ⚠️ **Both halves of this WP were built on a wrong premise,
  and finding that out WAS the work.** (1) The stale-blue defect's diagnosis — recorded identically in
  the backlog item, the WBS and `CLAUDE.md` — named `SubagentStop` as a missing clearing edge. The
  measured cause was the opposite shape: CC sends `notification_type: "agent_completed"`, the type was
  unlisted, and the *deliberate* unknown-type fallback (which exists so a future input-needed type is
  never swallowed) classified it as needing attention. **The dot was lit wrongly; there was nothing to
  clear.** (2) The gray half's gating question — "does a signal even exist?" — had a better answer
  than the plan's best case: `Stop` already carries a structured `background_tasks[]` array, on the
  very event that maps to `Idle`. (3) The completion side has genuinely **no** signal, and that is now
  cited rather than assumed (31 documented hook events, none applicable; `BackgroundTasksIdle`
  requested and **closed as not planned**; injected at the conversation level, bypassing hooks). (4)
  The finding that dissolved the hardest design question: **a CC session exit KILLS its background
  jobs** — the work is cancelled, not orphaned — so the feared stuck-forever state does not exist.

- **Assumptions that held:** The undocumented-field caution was right — building `unwrap_or(0)`
  degradation *before* knowing whether CC would keep the field cost nothing and is now the reason a
  future CC change degrades to grey instead of breaking. Mutation-proving each assertion individually
  held its value **three times**: it caught two of my own guards being vacuous (a CSS rule-presence
  check satisfied by the animation block; a `blue-dominance` predicate that purple *fails*) and one
  behavioural test that could not distinguish deliberate classification from accidental. The
  socket-injection instrument was the right verify-self tool.

- **Assumptions that were wrong:** ⚠️ **Three of my own, each caught by someone/something other than
  me:** (a) I claimed the `agent_completed` fix was "verified on real CC" — the operator's run emitted
  only `idle_prompt`, which was *already* correct pre-fix, so the gray dot proved nothing about the
  changed path; I caught it only by tracing the actual notification type. (b) I chose **teal** on
  distinguishability and it passed that test — but distinguishability is the wrong criterion when the
  meaning is opposite; the operator rejected it on sight. (c) ⚠️ **The consumer sweep — a shipped
  CRITICAL.** I grepped `awaiting_input` consumers and reported that as a strength; the predicate was
  structurally blind to `recycleSession.ts`'s `state === "idle"`, so widening `Stop`'s meaning hung
  Recycle to its 180s timeout in the *likely* case. **The rule: when adding a variant to a closed
  enum, sweep consumers of EVERY sibling literal, not the semantically nearest one.**

- **Approach delta:** Substantial, in both directions. Phase 1 came out **far smaller** than planned
  (two lines, not a fourth state or a counter — two backlog-proposed designs and two of my own were
  refuted before any code). Phase 2 grew a **research pass and a PID-polling probe that were not in
  the plan**, both because the operator pushed back on "no signal / no workaround" — and both changed
  the outcome: the citations made the verdict defensible, and the killed-on-exit finding retired the
  expiry rule *and* the watchdog design. Phase 3 gained an unplanned consumer (the close/quit guard)
  and an unplanned colour rebuild. ⚠️ **The plan's task 2.4 branch was never taken**, and it is marked
  as not-taken in the WBS rather than falsely ticked.

## Code-Quality Review — wp2-background-work-status-states

Reviewed against ship commit `f6fe533`. **1 CRITICAL · 2 MAJOR · 4 MINOR.** ⚠️ **The CRITICAL was a
REAL shipped regression that I caused, and the review is the only reason it was caught.**

### CRITICAL — FIXED (a live regression, not latent)

`src/components/workspace/recycleSession.ts` — the Recycle completion machine's **only** source of
the `stop` signal was `event.payload.state === "idle"`, inferring "a `Stop` hook event arrived" from
the *derived* state. Phase 3 gave `Stop` a second mapping (`background_work`), so a `Stop` carrying
outstanding work became **invisible** to the machine: `awaiting-stop` hangs to its 180s timeout, and
`awaiting-fresh-write` never raises `no-fresh-write`.

⚠️ **And it is the LIKELY case, not an edge one** — Recycle runs `/session-handoff` in a CC session
that may well have a backgrounded job outstanding.

⚠️ **THE METHOD LESSON, which is the transferable part:** my P3.5 consumer sweep grepped
**`awaiting_input` consumers**, and that predicate is *structurally incapable* of finding a site keyed
on the `"idle"` literal. I widened the state's meaning and swept for consumers of the wrong sibling.
**When adding a variant to a closed enum, sweep consumers of EVERY sibling literal — not just the
semantically nearest one.** The re-done sweep (all 5 literals) found exactly 2 real
`WireWorkspaceState` consumers: `recycleSession.ts` (this bug) and `confirmDialog.ts` (already
handled); everything else routes through `statusPresentation`/`isActiveState`, and the other `"idle"`
hits are unrelated types (`fetchLatch`, `DiffPanel.kind`, wizard `step`).
**Fixed + regression-pinned:** the listener now matches both states, and a new cross-language test
reads the **Rust** `Stop` arm, derives its variant set, converts to wire literals, and asserts the TS
listener covers each — the same shape as the existing `SESSION_MD_REL` mirror, with a non-vacuity
floor. Mutation-proven: reverting the fix fails it with a message naming the hang.

### MAJOR — both FIXED

1. `src/pip/pipLayout.ts` — the new doc comment asserted the dot colour is **teal**, the value
   rejected at verify-human. ⚠️ Same failure class as the wrong claims this whole WP existed to
   correct, landing *in the same commit*. Now says purple.
2. `src/state/workspaceStatus.ts` — `case "unknown": default:` silently absorbed any new union
   member, so the TS side had no compile-time exhaustiveness while the Rust side gained it this WP.
   ⚠️ **Not fixed by simply deleting `default:`** — the runtime fallback is independently required
   (the state crosses an IPC boundary from a separate process, so an undeclared string genuinely can
   arrive). Restructured to get **both**: a `const exhaustive: never = state` after the switch for
   compile-time coverage, then the honest-Unknown return for runtime. **Mutation-proven** — adding a
   6th union member with no arm now fails `tsc` (`TS2322 … not assignable to type 'never'`).

### MINOR — 2 fixed inline, 2 backlogged

- ✅ `status_log/mod.rs` — the `mapped` vocabulary doc omitted `background_work`. Fixed.
- ✅ `App.tsx:467` — comment said `isActiveState` covers "running/awaiting_input". Fixed.
- → Backlogged: the CSS-guard fragility note (it will false-fail on a nested rule / custom property /
  shorthand `background:`, opaquely) and the dead hyphenated `WorkspaceStatus` legacy type in
  `state/workspace.ts`.

### Assessment (reviewer, condensed)

Well-built work whose quality came from the same discipline that produced its findings — every
load-bearing claim recorded where it will be found, every guessed dependency degrading to prior
behaviour, two of its own guards caught vacuous and rewritten. `unwrap_or(0)` judged the right shape
and clearly expressed; the CSS guard judged defensible for a real duplication risk but the piece most
likely to cost maintenance. **The one shortfall was the consumer sweep** — and it is now both fixed
and pinned.

### If you disagree

Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives this file.

## Ship (2026-08-22)

**Commit `75df9dc`** — `feat(m13.5-wp2): tell the truth about background work — fix a wrongly-blue
dot, add a fourth state`. On `main` per the project's no-branching policy; **local and unpushed**
(6 ahead of origin, WP1's 3 included). Working tree clean.

**Cleanup verified, not assumed:**
- ⚠️ **The Phase 2 probe instrument is fully torn down** — `grep -c rawcap ~/.claude/settings.json`
  = 0, and the file is still **byte-identical** to the pre-probe snapshot. This mattered more than
  ordinary cleanup: the probe mutated the operator's *live CC config*, so a leftover hook would have
  kept firing on every one of their sessions.
- No `TODO`/`FIXME`/`dbg!`/`console.log`/`eprintln!` introduced anywhere in the diff.
- No `/private/tmp`, `scratchpad` or `rawcap` path leaked into `src/` or `src-tauri/`.
- ⚠️ **The 4 remaining `2aa198` (teal) references are all in the TEST that rejects teal** — the
  guard plus its measured-channel table. Zero teal in `App.css` or `pip.css`. Checked rather than
  assumed, because a leftover teal in a stylesheet is exactly the operator-rejected value coming
  back.

**Final gate:** `pnpm verify:auto` exit 0 — Rust **873**, frontend **2140**. The single lint warning
(`XtermPane.tsx:631`) is pre-existing and untouched.

⚠️ **WP2 does NOT close the M13.5 bucket** — WP3 (turn-output reorientation, gated by its own 3.2
scope check), WP4 and WP5 remain. No `**Milestone:**` line was written to CHANGELOG, deliberately.

## Standing items — status

- **v0.3.4 installed-build smoke test: DISCHARGED 2026-08-21 (operator).** *"I'm already dogfooding
  0.3.4. no more smoke test needed."* The operator running it as their daily driver **is** the
  installed-build verification, which is what the check was for. Not a backlog item (it lived only in
  the v0.3.4 CHANGELOG entry as a carried note), so nothing to delete — it simply stops being carried.
  ⚠️ Do not re-raise it in a future handoff.

## Phase 2 PROBE VERDICT (2026-08-21) — the answer SPLITS, and it is better news than the WBS feared

**Method:** a temporary raw-payload sidecar hook registered additively alongside `claudesk-hook.pl`,
capturing CC's **verbatim stdin JSON** (the existing corpus structurally cannot answer this — F5: the
real hook re-emits only the fields it names and never reads `tool_input`). 4 runs. Evidence:
`scratchpad/rawcap-EVIDENCE.jsonl`. ⚠️ `[[cc-hook-capture-beats-docs]]` earned its keep again — the
answer below is **not** what either the WBS or the backlog item predicted.

### Q1 (launch / outstanding): **A SIGNAL EXISTS — and it is far better than the hypothesised one.**

⚠️ **`Stop` carries a structured `background_tasks[]` array.** The plan hypothesised the best case
would be *inferring* outstanding work from a `PreToolUse` `run_in_background` flag plus a later
completion event. Reality is much cleaner — the signal is **on `Stop` itself**, the very event that
maps to `Idle`:

```json
"background_tasks": [
  { "id": "bi10pzh98", "type": "shell", "status": "running",
    "description": "Sleep 45s then echo done", "command": "sleep 45 && echo BGJOB_DONE" }
]
```

So the wrongly-gray defect is decidable **at the moment the dot goes gray**, with no cross-event
correlation, no counter, and no new pairing key. ⚠️ **This retires the whole "is the signal even
there?" gate** that made WP2 probe-shaped.

**Discriminates correctly (the negative control):** a turn with **no** background job emits
`"background_tasks": []` — not a missing field, not a stale value. So `!background_tasks.is_empty()`
on `Stop` is a sound predicate. Also captured on `Stop` and previously unknown to Claudesk:
`session_crons`, `last_assistant_message`, `permission_mode`, `effort.level`, `stop_hook_active`.

**Secondary confirmation:** `PreToolUse`/`PostToolUse` for a backgrounded `Bash` do carry
`tool_input.run_in_background: true` (F4 confirmed at the hook layer, not just in transcripts) — but
this is now the *inferior* path and should not be built on.

### Q2 (completion): **NO SIGNAL when the session has ended.** The gray half is genuinely half-blocked.

Run 4 is the decisive one: CC launched a 90s job, ended its turn, and the process **exited** ~85s
before the job finished. That session (`9133356c`) emitted **exactly 3 events, ever** —
`PreToolUse`, `PostToolUse`, `Stop{status: "running"}`. The job then ran to completion and **nothing
fired**. There is no closing edge once the session is gone.

⚠️ **A trap that nearly produced a wrong "completion signal exists" verdict.** In run 3 a second
`Stop` did arrive carrying `background_tasks: []`, which looks exactly like a completion edge. It is
not — the model had **re-woken itself and polled the job**, so that `Stop` belongs to a *new turn*.
The clearing is a side effect of the next turn ending, not of the job landing. Only run 4 (process
fully exited) separates the two, and it says no.

### Q2 corroborated by DOCS + ISSUE TRACKER (2026-08-22) — the operator asked "really no signal? nor workaround?"

⚠️ **The challenge was warranted and it changed what we know — but the verdict SURVIVED.** The
original "no completion signal" call rested on 4 of my own runs, i.e. absence-of-evidence from a
sample. A web pass against primary sources now makes it evidence-of-absence, and **the docs revealed
my sample was NOT the whole surface**:

- **[HIGH · official docs]** CC documents **31 hook events**; Claudesk registers **10**. So "I probed
  4 events and saw nothing" was genuinely under-powered as an argument.
- **[HIGH · official docs]** ⚠️ **`TaskCreated` / `TaskCompleted` DO exist** — the two most
  promising candidate names in the whole list — **but they fire on `TaskCreate` (the Task/subagent
  tool) only, NOT on `run_in_background` Bash.** Anyone re-opening this will find those names and
  think the problem is solved; it is not.
- **[HIGH · official docs]** No `BashOutput` hook, no background-task hook, of any kind.
- **[HIGH · issue #18544, closed as not planned]** ⚠️ **The MECHANISM, and the reason no hook can ever
  see it:** background-task notifications are *"injected at the system/conversation level, bypassing
  the hooks pipeline entirely."* This is architectural, not an oversight — so it is not a matter of
  registering the right event.
- **[HIGH · issue #45781, closed as NOT PLANNED]** A `BackgroundTasksIdle` event was **requested and
  declined.** ⚠️ So this is not "not yet" — it is "asked for, and no".
- **[HIGH · issue #20525, closed as duplicate]** Independent confirmation of silent completion (v2.19).
- **[MED · issues]** The only workaround anyone offers is the model **polling `BashOutput` from inside
  the session** — useless to an external supervisor: polling emits `PostToolUse`, which already maps
  to `Running`.
- **[HIGH · local check]** ⚠️ **The transcript JSONL is NOT a workaround either** — the one external
  path neither the docs nor the issues discuss. Run 4's transcript
  (`9133356c…jsonl`, 17 records) ends at `18:16:00` with the assistant's "LAUNCHED"; the job landed
  ~85s later and **nothing was appended**. Checked because it was the last cheap candidate.

**Two NEW findings that matter beyond this question:**

1. ⚠️ **`elicitation_url_dialog` is a documented `notification_type` that Claudesk does NOT classify**
   — it falls through the honest-fallback to `AwaitingInput`. That is *probably* right (it is a
   dialog), but it is right **by accident**, which is precisely the shape of the `agent_completed` bug
   Phase 1 just fixed. It never appears in either corpus, so it was invisible to the measured
   vocabulary. **Add it explicitly** rather than leaving a second known type on the fallback.
2. ⚠️ **`Stop.background_tasks` is UNDOCUMENTED.** It is real and structured (Phase 2 captured it),
   but the docs do not mention it — so it is a **named stale-able seam**, in the same class as M15's
   model→window map. Any Phase 3 build on it must degrade safely if the field vanishes or changes
   shape (treat absent/malformed as "no background work", never as an error).

**Sources:** `code.claude.com/docs/en/hooks` · `anthropics/claude-code` issues #18544, #45781, #20525.
`deep-research` was **not** escalated: the load-bearing question got a HIGH-confidence answer from
primary sources, so the ROI bar was not met (escalating "to be thorough" is the over-reach the
research-tier discipline exists to prevent).

**Phase 3 verify-human: APPROVED 2026-08-22 (operator) — 5 of 6 leaves passed as built; the COLOUR
was rejected and rebuilt.**

⚠️ **THE CORRECTION: teal → purple `#a371f7`.** Operator, verbatim: *"Don't use teal/blue. Use some
other color. something distinct. blue is for 'awaiting input' which need my immediate attention.
background task don't need my attention."* ⚠️ **The reasoning is the part to carry, not the hex:**
teal was chosen for *distinguishability* (it passed that test — measurably different from orange,
blue and grey at 9px) but distinguishability is the WRONG criterion when the semantics are opposite.
Teal reads as blue-adjacent, blue means "come here now", and a background job means "ignore me" — so
a colour that merely *can be told apart* from the alarm still borrows its urgency. Purple was picked
because it is **absent from the entire stylesheet** (checked: `#6ea8ff` blue is used 40× as the UI
accent, `#e2c08d` gold already means git-modified, orange/blue/grey are the other dot states), so it
carries no competing meaning and sits nowhere near the alarm family. Both `App.css` and `pip.css`
updated in lockstep; the CSS guard from Phase 1 covers the drift.

**Demoed live rather than screenshotted** (operator watched their own screen, 7 actions):
1. `Stop` no bg work → grey, static. 2. `Stop` **with** bg work → the new dot + slow breathe
(`mapped=background_work`). 3. menu bar stays **dark**. 4. a `permission_prompt` → blue + fast blink
+ menu bar **lights** (the contrast case that proves 3 is a decision, not a dead alarm).
5. next clean turn → the self-healing clear (new state → orange → grey). 6. **a real CC session with
a real backgrounded job** → `mapped=background_work`, no synthetic events. 7. closing the tile →
*"scratch-c is still working (Claude Code is running). Close anyway and stop it?"* with Cancel +
Close Anyway; the workspace survived the Cancel. Final side-by-side after the colour change: blue
`rgb(83,155,245)`/blink-0.7s beside purple `rgb(163,113,247)`/breathe-3.2s — separated on **two**
axes, hue and motion.

⚠️ **A live instrument trap hit mid-demo, worth carrying:** `scratch-b`'s dot kept reverting to
orange because Claudesk's OWN CC session in that workspace was genuinely working, and the status map
holds only the latest event per workspace (`[[workspace-status-map-collapses-consecutive-events]]`).
Setting a state on a workspace that has a live session is unreliable for a demo — it gets overwritten
within seconds. The fix was to demo on a **quiet second workspace** (`scratch-c`), not to conclude the
feature was broken. Any future live status demo should pick an idle workspace first.

**COSMETIC — RAISED AND DECLINED 2026-08-22 (operator: "the dialog wording is fine").** The close
dialog says *"Claude Code is running"*, the generic active-state copy; strictly CC is **not** running
in the background-work case, a job it left behind is. Flagged at the gate and the operator chose to
keep it. ⚠️ Do not "fix" this later as an oversight — it was seen and kept.

**DESIGN PRIOR CAPTURED:** `semantic-distance-not-just-visual-distance-for-status-colour` written to
`workflow-system/product/design-priors.md` (8th prior) on the operator's instruction. The *why* is
marked INFERRED pending operator sharpening, per the propose-never-auto-write contract.

**Phase 3 verify-codify: DONE (2026-08-22).** Rust **869 → 873**, frontend **2139 → 2140**; full gate
exit 0. No test failed, so no `## Test Triage` entry is owed.

⚠️ **Three real gaps — and two were on things I had only verified BY HAND.** The build-time tests
covered the mapping, the tray decision, the close-guard predicate and the presentation; they did not
cover:

1. **The hook script's `background_task_count` forwarding** — probed over a live socket at build time
   across 6 payload shapes and codified nowhere. Now 3 tests in `hook_pl_output.rs`: the count itself,
   the **stale-seam degradation** (empty / absent / string / object → all `0`, each asserted
   separately because they reach the guard by different paths), and Stop-only scoping. ⚠️ The first
   also asserts the **privacy invariant** — a payload whose `command` contains `SUPERSECRET` must not
   put it on the wire.
2. **The consuming-surface path** (the boundary requirement) —
   `end_to_end_socket_background_work_emits_then_clears_on_a_clean_stop`, at the same real-socket →
   `to_update` seam as its siblings. ⚠️ **The clearing edge is half the assertion, not a bonus:** this
   state has no completion event, so if the clear broke the dot would stick purple forever — the same
   stuck-state class as the stale-blue defect Phase 1 fixed. It also pins the **wire string**
   `"background_work"`, since a serde drift would leave every surface rendering the honest-but-wrong
   grey "unknown" dot.
3. **The colour decision itself** — the operator's correction was unpinned; the existing CSS guard
   only asserted *a* `background-color` existed. Two properties added: App.css and pip.css must agree
   on the **same hex** (a verbatim-copy palette can drift to two *different* colours while both
   individually pass), and background-work must stay **out of the blue family**.

⚠️ **The hue predicate took one wrong attempt, and the wrong one is instructive.** The obvious
encoding — *"blue must not be the dominant channel"* — is **vacuous for this property**: purple
`#a371f7` has `b=247`, i.e. MORE blue than the alarm blue `#539bf5` (`b=245`), so it fails a
blue-dominance test while being exactly the colour asked for. Measured:

| hue | r | g | b | r−g |
|---|---|---|---|---|
| purple `#a371f7` | 163 | 113 | 247 | **+50** |
| blue `#539bf5` | 83 | 155 | 245 | −72 |
| teal `#2aa198` | 42 | 161 | 152 | −119 |

Blue and teal are the **green-leaning** side of that axis; purple is the **red-leaning** side. So
`r > g` is what actually separates "not the alarm family" from "the alarm family". **Calibrated in
both directions:** reverting to teal FAILS (2 guards fire — the hue guard AND the App/pip sync guard),
while a legitimate re-theme to magenta `#d16ba5` applied to both files stays GREEN. A guard that only
rejected the one bad value would have been a hex-equality check wearing a hue-guard's comment.

**Phase 4 verify-self: PASS (2026-08-22)** — all 7 outcomes verified by subagent. **No integration
boundary** (only `CHANGELOG.md` + `workflow-system/state/backlog.md`; Rust 873/0 unchanged proves no
code moved).

⚠️ **The absence checks carried POSITIVE CONTROLS, which is what makes them trustworthy.** Each
"slug is gone from backlog.md" assertion was paired with the *same pattern* run against
`git show HEAD:workflow-system/state/backlog.md`, where it returns 1. Without that, a typo'd pattern
and a real deletion are indistinguishable (`[[invalid-probe-and-real-hole-look-identical]]`) — a
`grep -c` returning 0 is exactly the shape of a vacuously-passing guard.

⚠️ **The subagent's structural check was STRICTER than mine, and corrected one of my claims.** I
reported "3 pre-existing field-light items"; a block-set diff against HEAD found **6**, all
byte-identical to their committed versions — so my count was low, not wrong in direction. It also
proved something my check could not: exactly 2 block deletions + 5 additions, with only ONE surviving
block textually changed (`SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS`, delta = two removed
trailing blank lines from my `\n{3,}` collapse — no content loss). That is the assertion that rules
out a regex having silently eaten part of a neighbouring block, which counting `## SURFACE-` headings
cannot detect.

⚠️ It also traced the CHANGELOG triple-newline I had called pre-existing: **line 162 → 168, the same
M12 run shifted by my 6 added lines** — confirmed displaced, not introduced. Both refutation lines
were confirmed to carry the disproven claim *and* what shipped.

**Phase 4 verify-codify: DONE (2026-08-22) — NO test written, and that is the finding.** Full suite
re-run green (Rust **873** / frontend **2140**, exit 0); no failure, so no `## Test Triage` owed.

⚠️ **The delete-on-resolve invariant is NOT Claudesk's to test, and writing a Claudesk-side guard
would have been duplication in the wrong repo.** Checked before writing anything:
`_ref/claude-customization/tests/check-structure.sh` **Phase 11** already pins it — across all four
terminal-close skills plus the canonical snippet rule, shipped 2026-07-15 under
`SURFACE-2026-07-14-RESOLVED-ENTRY-AUDIT-TRAIL-CLUTTER` explicitly to prevent drift back toward
mark-and-retain.

⚠️ **And note WHAT the upstream guard asserts — it is the only enforceable level.** It pins the
*skill instructions* (that each closing skill still carries the convention), not the *state of any
one project's backlog*. That distinction is the whole argument: a test asserting "slug X is absent
from `backlog.md` and present in `CHANGELOG.md`" would encode a **one-time historical fact**, green
forever after this commit regardless of whether the convention is still being followed — a guard that
can never fail again is not coverage, it is decoration. The property worth protecting is *"future
closes keep doing this"*, and that lives in the skills. Phase 4's own compliance was verified
mechanically at verify-auto/self (with positive controls against `git HEAD`), which is the right
instrument for a one-time check.

**Nothing else in Phase 4 has behavior to pin:** it edited two markdown state files, added no code
path, and changed no observable surface (Rust 873/0 identical to the Phase-3 gate).


### Q2 follow-up: PID-polling the background process (operator's proposal, probed 2026-08-22)

**The idea:** skip the hook channel entirely — capture the background job's OS process and poll it to
liveness, since Claudesk already owns the PTY it spawned CC into. **Probed directly. Verdict: the
polling mechanism WORKS, but it is unnecessary — because the premise it was meant to fix turns out to
be false.**

**Finding A — no PID is in the payload.** A `background_tasks` entry carries exactly
`{id, type, status, description, command}`. `id` is a CC-internal handle (`b6at1cvzk`), **not** a PID.
So the PID must come from the process tree, not the hook.

**Finding B — the process tree DOES expose it, and Claudesk is already positioned to walk it.** The
live chain for a Claudesk-spawned session, measured on this very session:
```
/Applications/Claudesk.app (1420) -> claude (99331) -> /bin/zsh (88845 …)
```
Claudesk spawns the PTY, so **it already knows the `claude` PID** — the root of the walk is free. A
backgrounded job appears as a `/bin/zsh -c` child running `eval '<the command>'`, and that command
string is **matchable verbatim against `background_tasks[].command`**, so a task can be tied to a PID
without CC's cooperation.

**Finding C — a naive child-count would be badly wrong, but a clean discriminator exists.** The CC
child list is full of long-lived NON-job processes: `caffeinate -i -t 300`, `npm exec
@playwright/mcp@latest`, `npm exec @hypothesi/tauri-mcp-server`. Counting children would show
permanent "background work". ⚠️ **The discriminator that works: the job shells (and only the job
shells) source `~/.claude/shell-snapshots/snapshot-zsh-*.sh`.** Measured: 1 job shell correctly
identified, 3 infrastructure processes correctly excluded, zero false positives.

**Finding D — ⚠️ THE ONE THAT DECIDES IT: when CC exits, it KILLS its background jobs.** The run-4
scenario was re-run and the tree inspected: CC (pid 87229) exited, its job shell (87905) went with
it, and `sleep 120` **never completed** — no orphan reparented to launchd, no output. ⚠️ **So the
"exited session with work outstanding" case does not strand a running job at all — the work is
CANCELLED, not orphaned.** The dot has nothing to wait for.

**What this means — the residual gap is much narrower than Phase 2 first concluded:**
- CC **alive**, turn ended, job running → `Stop.background_tasks` is authoritative. Covered.
- CC **exits** with a job outstanding → the job is **killed**. There is nothing to poll and nothing to
  report; the workspace is genuinely done.
⚠️ **Therefore the expiry problem largely dissolves.** The earlier framing ("the state can get stuck
because no completion event ever arrives") was **wrong about the underlying reality** — it assumed the
job kept running after CC left. It does not.

**Recommendation: do NOT build PID polling.** It works, but it buys coverage for a case that does not
exist (Finding D), at the cost of a `ps`-walking poller plus a fragile dependency on an
**undocumented internal path** (`shell-snapshots`) — a worse seam than the undocumented-but-structured
`background_tasks`. ⚠️ Keep Findings B/C recorded, because if CC ever changes to let jobs **survive**
session exit, this is the ready-made mechanism and the discriminator is already identified.

### What this means for the build

**A fourth state is now BUILDABLE and honest for the common case** — CC still running, turn ended,
job outstanding — because `Stop.background_tasks` is authoritative at exactly that moment. **The
residual gap is narrow and nameable:** if the CC session *exits* while a job is outstanding, the
state can never be cleared by a hook event. That is the upstream-blocked remainder, and it is much
smaller than "the whole gray half is blocked."

⚠️ **This changes Phase 3's gate from "does the signal exist" to "how does the state EXPIRE."** The
`[PRIOR: new-surface-must-earn-its-place]` question is no longer *can we*, it is *should we*, and the
expiry rule is the thing to settle at verify-human. Options for the residual: expire on `SessionEnd`
(registered, 51 corpus events — but run 4 shows a `-p` session emits it *before* the job lands, so it
would clear early), expire on the next `Stop` for that workspace (self-healing, may hold a stale
fourth state until the operator returns), or accept staleness in the exited-session case and document
it. **Not decided here — it is a product call, and Phase 3 opens with it.**

⚠️ **Instrument caveat for whoever repeats this:** the capture is **machine-global** (like
`[[time-tracking-capture-is-machine-global]]`) — it recorded this very session and an unrelated
`light-bot-remastered` session too. A naive `diff` of the capture file across a wait window is
therefore **polluted by other projects' traffic**; filter by `session_id` (or `cwd`) before concluding
anything. That noise briefly looked like post-completion events arriving.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

**✅ FILED to `backlog.md` 2026-08-21 (Phase 1):** the `agent_type`/`SubagentStop` finding (as
`SURFACE-...-SUBAGENT-PAIRING-CLAIM-IS-REFUTED-BY-PRODUCTION-DATA`, merging the two entries below
since they are one root cause), the `cwd`-only attribution finding (as
`SURFACE-...-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS`), and the fallback-classification
hazard (as `SURFACE-...-NOTIFICATION-TYPE-FALLBACK-IS-WRONG-FOR-COMPLETION-TYPES`).
**Still queued for P4.2:** the `~/.claude/jobs` note below (informational only).

- [SURFACED-2026-08-21] P4.2 — **`agent_type` is NULL on 100% of 3,977 production subagent events**,
  while `hook_install/mod.rs:61` and `reclassify/mod.rs:31` both document pairing "by `agent_type`".
  The M9 reclassifier's subagent segmentation therefore buckets everything under `<unknown>`, and
  its entire test suite supplies a non-null `agent_type` that production never provides — a test
  suite proving a shape the data does not have. Doc claims corrected in P1.3; the **analytics
  consequence** is separate and unfixed.
- [SURFACED-2026-08-21] P4.2 — **`SubagentStop` outnumbers `SubagentStart` 3.2:1** (3,031 vs 946;
  per-session `0/19`, `5/50`). `reclassify::subagent_intervals` silently discards every unmatched
  stop, so M9's subagent-duration analytics are computed from ~31% of the stop events. Not a status
  defect; a **time-analytics accuracy** finding.
- [SURFACED-2026-08-21] P4.2 — **`~/.claude/jobs/<id>/state.json` exposes `inFlight: {tasks, queued,
  kinds}` + `tempo`** for background CC *sessions* (`template: "bg"`) — a file-based background-work
  signal outside the hook channel. All instances currently stale (last write 2026-08-06). Recorded so
  a future reader neither mistakes it for a live channel nor re-discovers it as novel.
- [SURFACED-2026-08-21] P4.2 — **F13: the status path keys on `cwd` ALONE and never reads
  `session_id`**, so every CC session sharing a directory collapses onto one workspace dot. Verified:
  `session_id` occurs in `status_broadcaster/` only in test fixtures (`mod.rs:338`, `:358`,
  `commands.rs:271-285`); no production path reads it. In the measured instance **four** distinct
  sessions (`2c95b1a3`, `69a7ce96`, `76e288aa`, `23a9ad84`) drove `ws-3`'s dot, and the event that
  eventually cleared the blue belonged to a *different session* than the one that lit it. ⚠️ **Real
  but rare, and deliberately NOT fixed in this WP:** only **1 of 1,673** post-`Stop` notifications is
  cross-session, and the actual defect (F10) is unrelated. Affects any second CC session on the same
  repo — a bare terminal, a `bg` job, or two Claudesk workspaces on one project. File as its own
  item with its own severity rather than smuggling a subsystem change into a one-line fix.
- [SURFACED-2026-08-21] P4.2 — **CC's notification-type vocabulary is wider than the code's list, and
  the honest-fallback default makes every unknown type read as "needs input."** F10 is one instance
  of that class (`agent_completed` → wrongly blue). ⚠️ The fallback is right for *input-needed* types
  and wrong for *completion//informational* ones, and Claudesk cannot tell which a new type is. Worth
  a standing note: whenever a new `notification_type` appears in the corpus, classify it
  deliberately. A cheap periodic check — `SELECT DISTINCT json_extract(meta,'$.notification_type')` —
  would have caught F10 the day it first fired (2026-08-16 corpus timestamp).
