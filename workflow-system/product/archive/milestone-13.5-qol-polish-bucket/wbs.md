---
shape: wbs
cycle: milestone-13.5-qol-polish-bucket
milestone: 13.5
created: 2026-08-19
updated: 2026-08-26  # ALL FIVE WPs shipped — bucket closed; awaiting /product-finalize archive
state: complete
---

# WBS — Milestone 13.5: QoL polish bucket

> **An OPEN collection bucket**, the fourth of its kind — following **M6** (friend-requested QoL,
> closed 2026-06-28), **M10.5** (closed 2026-07-19) and **M11.5** (closed 2026-08-01). All three
> closed at 4 WPs; this one opened scoped to match and now stands at **5** — the drive-mode
> workspace surface (WP4) was added 2026-08-20 from a direct operator ask, which is the bucket
> convention working as intended (an OPEN bucket accepts items while it runs). ⚠️ **That clause
> anticipated a WP3 escalation closing the bucket at four; WP3 escalated and was re-admitted the
> same day, so the bucket closes at FIVE — see the note below.**
>
> **⚠️ WP3 ESCALATED 2026-08-25, then RE-ADMITTED the same day — the bucket closes at WP1 + WP2 +
> WP3 + WP4 + WP5, i.e. FIVE.** The escalation rested on a **mechanism refutation that was itself
> false** (it claimed the CC pane is an xterm **alternate** buffer, making `registerDecoration` a
> no-op). Task 3.1's probe overturned that, and a follow-up **signal-trace probe** (same day) then
> found the real defect: a **viewport-clamp off-by-one-turn in `nextJump`**, not a platform limit.
> With the mechanism proven and the defect understood, WP3 is **cheap** and belongs in a polish
> bucket — operator re-admitted it 2026-08-25. **Remaining work: WP3, then WP4, then WP5.**
>
> **Numbered 13.5** so the M14/M15 tail keeps its numbers — the same reason M10.5 and M11.5 were
> `.5` inserts rather than renumbering everything after them.
>
> **Execution order settled by the operator 2026-08-19: M13.5 (this) → M15 (workflow supervisor) →
> M14 (polish + OSS release).** ⚠️ That puts the OSS release **last**, which is a deliberate
> reversal of the roadmap's own lean (*"the supervisor is a dogfooding win first, and its value to a
> stranger is unproven, which argues for shipping M14 first"*). Recorded as the operator's call, not
> an oversight — do not "correct" the order back.

**Trigger:** daily-driver papercuts accumulated during v0.3.x dogfooding, plus two backlog items
already tagged *"queued for the next QoL polish bucket (none currently open)"*.

**Precondition — met.** The backlog-paydown sweep closed 2026-08-19 (8/8 WPs); `wip/` is empty and
the tree is clean.

## Source items

| WP | Backlog item | Why it qualifies |
|---|---|---|
| WP1 | `SURFACE-2026-08-05-WINDOW-SIZE-AND-POSITION-NOT-PERSISTED` | Operator request; friction paid on **every** launch |
| WP2 | `SURFACE-2026-08-16-IDLE-DOT-CONFLATES-DONE-WITH-WAITING-ON-A-BACKGROUND-JOB` + `SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT` | Both tagged for a QoL bucket; **shared root cause** |
| WP3 | `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` | Operator-felt, recurring; ⚠️ **scope risk, see WP3** |
| WP4 | *(no backlog entry — direct operator ask, 2026-08-20)* | Daily-driver papercut found by dogfooding M12; ⚠️ **reverses a recorded M12 decision, see WP4** |

⚠️ **NOT in this bucket — already fixed.** `SURFACE-...-RECYCLE-TYPES-SESSION-RESTORE-BEFORE-THE-FRESH-TUI-IS-READY`
was resolved 2026-08-19 (`42bfe0c`) and its entry deleted. ⚠️ **And the fix was NOT "wait a few
seconds"** — the 1500 ms settle already existed; it was being spent concurrently with the respawn
instead of after it. Reordering was the fix; raising the number would have bought more spawn-wait,
not more settle. Recorded here because "add a delay" is the intuitive-but-wrong reading and it will
be re-proposed by anyone who reads only the symptom.

---

## WP1: Window size + position persistence

**Description:** The main window is hardcoded to 1280×800 on every launch (`tauri.conf.json` →
`app.windows[0]`, mirrored in the `tauri.dev.json` overlay) and nothing about its geometry is
persisted. Restore the last size/position — including a maximized/"fullscreen" window launching
maximized, which is what the operator's ask meant (clarified by screenshot 2026-08-05: **maximized**,
not macOS native fullscreen).
**Milestone:** 13.5
**Dependencies:** none
**Size:** S

**Tasks:**
- [x] 1.1 Add `tauri-plugin-window-state` (`2.4.1`, first-party `tauri-apps/plugins-workspace`, same
      Tauri v2 line as the seven plugins already in `Cargo.toml`) + register it.
- [x] 1.2 ⚠️ **Scope the plugin to the `main` label only.** The PiP NSPanel has its own position
      logic (M10.5 WP1's top-right default + the in-session `positioned` flag in `pip_resize`); a
      generic save/restore over all windows would fight it.
- [x] 1.3 ⚠️ **Verify off-screen restore clamping actually fires.** A window restored to coordinates
      on a since-disconnected monitor lands invisible and the app reads as "failed to launch."
      Either confirm the plugin's own clamping, or clamp to the current display set.
      → **RESOLVED: no clamping needed.** ⚠️ The mechanism is **skip-if-no-monitor-intersects, NOT
      clamping** — `restore_state` applies `set_position` only inside `if m.intersects(...)`, while
      `set_size` applies unconditionally. Verified live (seeded `-9000,-9000` → window returned
      on-screen at saved size, OS-chosen position, screenshot-confirmed).
- [x] 1.4 ⚠️ **Confirm dev/prod geometry isolation.** State must live in the per-identity
      `app_data_dir()` so `com.claudesk.app` and `com.claudesk.app.dev` never share geometry — they
      run concurrently by design (the dogfooding requirement).
      → **RESOLVED: isolation holds.** ⚠️ But the plugin actually uses **`app_config_dir()`**, not
      `app_data_dir()` — on macOS both resolve to `~/Library/Application Support/<identifier>/`, so
      this is right for a different reason than stated. Verified by observing the file (a **dotfile**
      — `.window-state.json`; plain `ls` hides it).
- [x] 1.5 Verify the maximized case specifically: close maximized → relaunch → still maximized.

⚠️ **The three traps ARE the work.** The dependency-plus-registration is nearly free; 1.2–1.4 are
why this is a WP and not a task. Each is an operator-visible failure if skipped, and 1.3 is the one
that looks like a crash.

**✅ SHIPPED 2026-08-21** (`25a68bc`; review `fe091f9`). All five tasks done; `pnpm verify:auto` exit 0 (Rust 859 / frontend 2136).
⚠️ **Both traps 1.3 and 1.4 resolved toward the SIMPLER build** — no hand-rolled clamping, no
`save_window_state` call in `perform_quit_teardown` (`RunEvent::Exit` **does** fire through
`prevent_close` → `quit_now` → `app.exit(0)`, proven 3×). Implementation is 3 files: the dep,
`lib.rs` (+2 lines), and `src-tauri/src/window_state/` (registration policy as pure fns + 5 tests,
each assertion mutation-proven individually). Operator-approved at verify-human on real gestures.

---

## WP2: Probe — does the status model need a fourth state, and can it get one?  ✅ SHIPPED 2026-08-22 (commit `e3eaed8`)

**Type:** probe (with a build arm that is unblocked regardless — see below)
**Milestone:** 13.5
**Dependencies:** none
**Size:** S (probe) → M (build, if the probe says yes)
**Timebox:** half-day for the probe

**Learning objective:** The status broadcaster has exactly **three** live states
(`Running` / `AwaitingInput` / `Idle`; `Unknown` is the pre-first-event default and is never
emitted). Two distinct background-work shapes fall outside it:

- **Wrongly GRAY** — CC returns control while a **backgrounded shell job** it launched is still
  running. `Stop` maps unconditionally to `Idle`, so the dot reads "done, nothing to see."
- **Wrongly BLUE (stale)** — a **background agent** lights `AwaitingInput` honestly, and then
  nothing ever clears it. `SubagentStop` is the only event marking that transition and it is
  currently `mapped=none, outcome=dropped`.

⚠️ **These are NOT the same defect** and the probe must not conflate them. Shared root cause — the
status model was designed around a single foreground turn — but opposite symptoms and, critically,
**different blockedness**:

**Success criterion:** a written answer to each:
1. **Does CC emit ANY hook event when a backgrounded shell job starts or finishes?** ⚠️ **The answer
   must come from a LIVE HOOK CAPTURE, not the docs** — `[[cc-hook-capture-beats-docs]]`: the
   official docs have been confidently wrong about event existence in this exact codebase. Candidate
   signals to check: a `Bash(run_in_background)` `PostToolUse` payload plus a later completion event;
   any field on `Stop` indicating outstanding work.
2. **If no signal exists** → the gray half is **blocked on CC upstream**. Re-file it as such rather
   than inferring from PTY output, which `arch.md` forbids outright.
3. **What are the surface costs of a fourth state?** All three surfaces (filmstrip · PiP ·
   menu-bar) fold the same broadcast, so a fourth state needs a fourth glyph/colour in each **and**
   a rule for how it ranks in the menu-bar aggregate. Also check whether the M9 reclassifier needs
   an analogous analytics meaning (it shares `notification_awaits_input` as a single source of
   truth).

**Tasks:**
- [x] 2.1 Live hook capture against a real CC session running a backgrounded job. Record the raw
      event stream; answer Q1 from data.
- [x] 2.2 **Build the stale-blue fix regardless of Q1** — map `SubagentStop` so a finished
      background agent clears `AwaitingInput`. ⚠️ **This half is NOT probe-gated:** the event already
      exists and is merely dropped, so it needs no new signal and no new state. It is a live,
      reproducible defect with a known cause.
- [x] 2.3 If Q1 says a signal exists: add the fourth `WorkspaceState`, pick a colour distinct from
      gray/green/blue, thread it through all three surfaces + the aggregate ranking rule.
- [x] 2.4 ~~If Q1 says no signal:~~ **BRANCH NOT TAKEN** — re-file the gray half as blocked-upstream with the capture as
      evidence, and close WP2 on 2.2 alone. ⚠️ **That is a legitimate WP outcome, not a failure** —
      say so in the close rather than padding the WP.

**⚠️ Two design priors fire here, both disclosed:**

- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` leaning **minimal** — a fourth
  state is not a new *surface*, but the prior's decision rule generalizes (it already generalized
  from windows/panels to tabs/views at M9 WP6b-2). Applied: add a fourth **state**, not a fourth
  *indicator* or a new panel. If the only honest signal turns out to be weak, prefer keeping three
  states over shipping a state that is right less than the gray dot is now — flag if wrong.
- `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` — considered and **NOT
  applied.** A status colour is not a behaviour that misfires on a divergent setup; it is either
  honest or it is not. No setting is warranted. Recorded so the next reader sees it was weighed
  rather than missed (the over-infer guard).

---

**✅ SHIPPED 2026-08-22** (`e3eaed8`). ⚠️ **The WP's own framing was wrong in three places, and the
corrections are the deliverable as much as the code is:**

1. **The stale-blue half was MISDIAGNOSED here, in the backlog, and in `CLAUDE.md`.** All three named
   `SubagentStop` as a missing clearing edge. Measured cause: CC sends `notification_type:
   "agent_completed"`, the type was unlisted, and the deliberate unknown-type fallback classified it
   as input-needed. The dot was lit **wrongly** — there was nothing to clear. ⚠️ Task 2.2's
   instruction ("map `SubagentStop`") is therefore **refuted**: that event fires unpaired at a 3.2:1
   surplus and belonged to a *different session*, and the per-agent counter alternative is impossible
   (`agent_type` is NULL on 100% of 3,977 events). Fix was two lines, elsewhere.
2. **Task 2.4's branch was NOT taken** — the probe found the signal, so the gray half was never
   re-filed as blocked-upstream. `Stop` already carries a structured `background_tasks[]` array,
   empty when nothing is outstanding, decidable at the exact moment the dot goes gray. Better than
   this WP's hypothesised launch-flag inference.
3. **The expiry question dissolved rather than being answered.** There is genuinely no completion
   signal (31 documented hook events, none applies; `BackgroundTasksIdle` requested and **closed as
   not planned**; injected at the conversation level, bypassing hooks) — but **a CC session exit
   KILLS its background jobs**, so the feared stuck-forever state does not exist. Do not build a
   PID-polling watchdog; it was probed, it works, and it covers a case that cannot happen.

**As built:** `WorkspaceState::BackgroundWork`, **purple `#a371f7`** (teal shipped first and was
operator-rejected — it reads blue-adjacent, and blue means "needs me now"; captured as the design
prior `semantic-distance-not-just-visual-distance-for-status-colour`). Threaded through filmstrip ·
PiP · tray, plus the close/quit guard — closing kills the session, which kills the job.
`tray::aggregate_alarm` rewritten to an exhaustive match so a 5th state fails to **compile**.
⚠️ Code review caught a **shipped CRITICAL**: `recycleSession.ts` inferred "a `Stop` arrived" from
`state === "idle"` alone, so the new mapping hung Recycle to its timeout. Root cause was method —
the consumer sweep grepped `awaiting_input` consumers, blind to a site keyed on `"idle"`. Fixed +
cross-language regression test. Rust 859→873, frontend 2136→2141.

## WP3: Turn-output reorientation — ✅ SHIPPED 2026-08-25 (commit `2086ae8`)

**Description:** With heavy cross-workspace switching, a single CC turn can run 10+ minutes and
100+ lines, and it is hard to locate **where the last turn's output began** — acutely in the common
case where the operator layers a question on top of a workflow instruction, so the answer and the
workflow output interleave.
**Milestone:** **13.5** (re-admitted 2026-08-25 by operator decision, after escalating earlier the
same day — the escalation's premise was refuted by its own gate-3.1 probe)
**Status:** ✅ **SHIPPED 2026-08-25** (`2086ae8`; closed `27772ce`). Bidirectional position-based
navigation — `↑ N/N ↓` in the ungated split-control cluster. ⚠️ **The mechanism was never the
problem:** the shipped defect was a **viewport clamp** — the newest turn's start sits inside the
final screenful, so `scrollToLine` clamped and the caller read that as a successful jump.
⚠️ **Partially resolves** `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` (1 of 4 directions); the
answer-burial half remains open. Code-quality review: **0 CRITICAL, 3 MAJOR, 3 MINOR** — all
backlogged, no refactor owed.

### ⚠️ THE ALTERNATE-BUFFER REFUTATION WAS FALSE. Do not re-derive it.

A prior revision of this WP said: *"CC is a full-screen TUI → it runs in the ALTERNATE buffer →
`registerMarker` targets the normal buffer and `registerDecoration` returns undefined, so no tick
could ever render."* **The first clause is false, which voids the whole chain.** Measured by
`/feature-research` on a **live CC pane** (v2.1.245) through the MCP bridge:

| Read | Value |
|---|---|
| `buffer.active.type` | **`"normal"`** |
| `buffer.active === buffer.normal` | **`true`** (identity-checked) |
| `buffer.alternate.length` | **`0`** — the alt buffer was **never used at all** |
| `buffer.onBufferChange` events | **`0`**, across a full turn *and* a `/clear` |

**CC repaints the normal buffer; it never switches buffers.** That note was written from a **doc
comment** rather than a **one-line runtime read**, and it closed real work on a false basis.

### What the probe actually established (all by RUNNING the APIs, not reading types)

- **Scrollback accumulates, abundantly.** One "print 1..120" turn: `buffer.length` **68 → 146**,
  `baseY` **0 → 78**. A later turn reached 151/83. "Scroll back to the turn start" is **not**
  impossible in principle — the history is really there.
- **Navigation works.** `registerMarker(0)` → a live marker (line 90, not disposed).
  `scrollToLine(0)` → `viewportY` **0**; `scrollToLine(40)` → **40**; `scrollLines(-10)` → **30**;
  `scrollToBottom()` → **78**. `getLine().translateToString()` returns real CC text at every index.
- **⚠️ THE ACTUAL ROOT CAUSE OF THE THREE FAILED TESTS — a one-line config omission.**
  `registerDecoration` is xterm **proposed API** and throws
  `"You must set the allowProposedApi option to true to use proposed API"`. **`allowProposedApi` is
  set nowhere in this codebase** (`grep` over `src/`: zero hits). Proven causal by a **controlled
  A/B** — same constructor, same `normal` buffer, same marker, only the flag differing: `false` →
  throws, `true` → a real decoration `object`. Confirmed on the live pane too.
- **⚠️ The throw was SILENT in production.** The call sat un-caught inside a listener, so the
  exception was swallowed and presented as *"nothing renders"* — which is what sent three rounds of
  debugging at the wrong layer.
- **`/clear` does not reset the buffer** — it *grew* it (146 → 151, `baseY` 78 → 83). CC's `/clear`
  clears its conversation, not the terminal scrollback.

### ⚠️ ONE QUESTION IS OPEN — NOT refuted, just unfinished

The overview **ruler** never painted. It needs a **second** unset option — terminal-level
`overviewRuler.width` (the typings: *"must be set in order to see the overview ruler"*), also absent
from this codebase. Setting it **did** create the canvas (`canvas.xterm-decoration-overview-ruler`,
14×884, correctly positioned at x:946/y:120) — but it painted **0 non-zero pixels** across 4
decorations spread over the buffer, `position: "right"` and `"full"`, `refresh()`, scroll nudges, a
real CC turn, and a ~3s settle.

**Untested hypothesis:** the overview ruler is **canvas**-based while this app is **DOM-renderer
only** by hard architectural rule — there were **zero `<canvas>` elements in the whole document**
before one was forced. Setting the width *at construction* (rather than after) was not conclusively
tested; the dev app was closed mid-run. ⚠️ **Treat this as open.** It affects only the *gutter-tick*
presentation, and the recommended affordance sidesteps it entirely.

### The restructure: RE-SPEC on the probe's findings (3.1 is DONE)

- [x] 3.1 ✅ **PROBE COMPLETE 2026-08-25** — feasibility answered on a live CC pane; all four
      questions closed (buffer type · scrollback accumulation · which APIs work · buffer exits).
      Full write-up: `workflow-system/state/wip/turn-output-reorientation.md`
      → `## Research`. ⚠️ **Verdict: FEASIBLE.** The blocker was two unset xterm options, not a
      platform contract.
- [x] 3.2 **Re-spec on the probe data.** ⚠️ Do NOT resume the old spec verbatim — but note its
      *mechanism* is now vindicated, not refuted. **Recommended direction:** keep `registerMarker`
      + `scrollToLine` (both proven), set `allowProposedApi: true`, and make the affordance a
      **jump BUTTON** rather than a gutter tick — a button needs no ruler, so it moots the one open
      question above. `workspace-split-control` is the ungated neighbour to host it.
- [x] 3.3 Build once 3.2 lands and is WP-sized.

### What the first attempt leaves behind — REUSABLE, do not rebuild

⚠️ These shipped, are tested, and — now that the mechanism is vindicated — **more of them survive
than the escalation assumed**:

- **`is_turn_start` on `WorkspaceStatusUpdate`** + `event_is_turn_start` (backend), with an
  end-to-end socket test proving **exactly one** turn-start per multi-tool turn. This is the honest
  turn-boundary signal and it works; **the problem was never detecting a turn.**
- **`turnMarkers.ts`** — the walk/eviction/`inertAfter` model + `shouldRecordTurnStart`, 38 tests,
  each guard mutation-proven. ⚠️ **Its marker source is NO LONGER refuted** — `registerMarker`
  works on the CC pane, so the whole module is live, not just its logic.
- **`registerMarker` + `scrollToLine` as the navigation primitive** — probe-proven end to end.
- **The ungated-placement finding** — the skill-button row is gated wholesale, so an ungated
  affordance must NOT live there (`workspace-split-control` is the ungated neighbour).
- **`turnMarkersPurity.test.ts`** — and its inverted comment-strip lesson.
- **The `scrollback: 10000` raise** — ⚠️ its "premise invalidated" marking is **itself void**. The
  pane *does* accumulate normal-buffer scrollback, so the original OQ-1 rationale (p95 = 378 events
  could evict a turn's own start at 1000) **stands on its merits**. Re-tune it as a real
  memory-vs-reach tradeoff if wanted, but it is no longer a mistake to inherit.

⚠️ **The `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` question resolves toward
NO new surface.** The prior fired on the first pass because "the terminal already shows this
output," and the probe **confirms** that premise: the buffer is navigable, so a jump affordance over
the existing pane is the right shape. A separate read-only surface is **not** needed.

### ⚠️ THE PROCESS LESSON — the probe gate fired twice and was skipped twice

`SURFACE-2026-08-25-PROBE-CHECK-EXEMPTS-ALREADY-INSTALLED-DEPENDENCIES` said *"a dependency being
installed says nothing about whether its API works in our runtime conditions."* The probe confirms
it and **sharpens it**: the failure was not exotic runtime conditions but **two unset options
documented in the dependency's own typings**.

⚠️ **And it compounded.** The *post-mortem* then mis-attributed the cause to the alternate buffer by
**reading a doc comment instead of reading a runtime value** — `buffer.active.type` is a single
property access and it refutes the entire escalation. The cheap mechanical test was the same both
times: *"does any shipped code already call this API in this context?"* → `grep` said **no**, twice.

⚠️ **Meta-lesson (new, and the more valuable one): A REFUTATION NEEDS THE SAME EMPIRICAL BAR AS A
CLAIM — arguably higher, because a refutation CLOSES work.** This one was built from typings, earned
three rounds of trust, escalated a WP out of its milestone, and marked working code as dead. Filed
as `SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME`.


## WP4: Drive-mode readout + selector on the workspace surface — ✅ SHIPPED 2026-08-26 (commit `efa7798`)

**Description:** The drive mode is settable and legible **only** on the picker row. Once a
workspace is open — which is where the operator actually spends the day — there is no way to see
which mode this session is running under, and no way to change it without navigating back to the
picker. Add a drive-mode readout + selector to the **workspace** surface.
**Milestone:** 13.5
**Dependencies:** none (technical); ordered after WP1–WP3 by bucket convention only
**Size:** S–M
**Trigger:** operator, 2026-08-20, after dogfooding M12's picker-row cell — *"a drive mode
indicator + selector is needed in the workspace view, not just in the workspace selector page."*

⚠️ **THIS IS A DELIBERATE REVERSAL OF A RECORDED M12 DECISION, NOT A GAP.** Do not implement it
as though the second surface were merely overlooked. Three artifacts say "picker row **only**":

- `arch/session-resumption.md` → "The picker-row cell (⚠️ NOT the workspace header)":
  *"Placement is picker-row ONLY, not both. Two homes for one per-project value would need a sync
  path that deliberately does not exist."*
- `cc/driveModeIpc.ts` → "No broadcast event, same reasoning as the model override": *"If a
  genuinely second surface ever appears (a workspace-header readout, a filmstrip badge), add the
  event then; note that would be a real reversal rather than an extension."*
- Design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`, whose origin is the operator
  **rejecting** the model override on the workspace header at M11.5 WP1 verify-human.

**Why the reversal is legitimate anyway — the prior names this exact edge as untested.** Its own
`Why:` closes with: *"the untested edge is a setting read at creation that is ALSO
live-reconfigurable later, which may want both."* Drive mode **is** that setting, and
`arch/session-resumption.md` already flagged it as *"the **first live edge case** for design prior
`set-a-spawn-time-choice-where-the-spawn-is-chosen` (drive mode is read at spawn **and** is
live-reconfigurable)"*. So the reversal resolves a hole the prior itself marked open — it does not
overturn the prior's decided cases.

⚠️ **THE MODEL OVERRIDE DOES NOT COME ALONG.** The prior's rejected case (`--model`, fixed at
spawn for the process's life) is untouched: it stays picker-row-only. The discriminator is the
prior's own decision rule — *"read at creation, immutable afterward"* vs *"read continuously /
live-reconfigurable"* — and drive mode is the only one of the two stacked values that is the
latter. A change that moves both, or that generalizes "workspace surfaces get the picker's cells",
is out of scope and contradicts the prior.

**Tasks:**

- [x] 4.1 **Decide readout-only vs readout+selector FIRST, and get the operator's call on record.**
      The ask says both, so build both unless 4.2 says the write path cannot be made honest. A
      readout alone is a strictly cheaper fallback and still solves the stated "no way to see it"
      half.
- [x] 4.2 ⚠️ **Resolve the LIVENESS QUESTION before building the selector — it is the whole
      correctness risk.** Two distinct consumers read the mode and they do NOT agree on when:
      - the `UserPromptSubmit` hook's `additionalContext` line reads
        `CLAUDESK_DRIVE_MODE`, an **env var fixed at spawn** — so changing the mode mid-session
        does **not** reach the live session, exactly as `setProjectDefaultDriveMode`'s doc
        comment states (*"Takes effect on that project's NEXT CC spawn … does not affect an
        already-running session — the env of a live process is fixed"*);
      - the picker's stored value in `projects.json` changes immediately.
      **A selector on the running workspace therefore looks live and is not** — which is
      *precisely* the failure mode the design prior was written to prevent (*"Placing it on the
      created instance makes it look live when it is not"*). Pick one and say which:
      **(a)** label it as next-spawn-only (cheapest, honest, matches the existing
      `↻ <nextOpen>` prediction idiom already in the header); **(b)** make the hook read the
      mode at prompt time instead of from spawn env, so the change is genuinely live (larger —
      touches the Perl hook + `workflow_gate`, and re-opens "who owns the value at read time");
      **(c)** offer an inline Recycle affordance so the operator can *make* it take effect (WP3's
      Recycle already exists as a sibling button in the same row).
      ⚠️ **Do not ship an unlabelled live-looking `<select>` under option (a).**
- [x] 4.3 ⚠️ **Add the broadcast event that M12 deliberately omitted.** With a second surface, the
      picker and the workspace can disagree, and `driveModeIpc.ts` says outright that this is when
      to add it. Mirror the **permission mode's** pattern (app-global value, re-broadcasts on
      write because it has a View-menu radio as a second surface) — that is the in-repo precedent
      for two-surfaces-one-value; the model override's no-event pattern is now the wrong template.
      Both surfaces must re-sync on a write from either.
- [x] 4.4 ⚠️ **GATE IT, and take the OFF-invariant guard's SIXTH arm.** The mode is a
      workflow-system concept, so this surface is `workflow_features_enabled`-gated exactly as the
      skill row and `workspace-header-nextopen` are — **ABSENT when off, not hidden or disabled**.
      Per the guard's own header, a new gated surface owns a new arm. ⚠️ **Probe the new arm
      INDIVIDUALLY** — the guard now has five arms and seven subjects, and a composite bypass that
      trips *some* arm reports "the guard bites" while hiding this one's gap. Confirm the mutation
      landed in **executable** code (`[[verify-the-mutation-landed]]`,
      `[[invalid-probe-and-real-hole-look-identical]]`).
- [x] 4.5 **Reuse `cc/driveMode.ts` as-is; add no second vocabulary.** `DRIVE_MODES`,
      `DRIVE_MODE_UNSET_PLACEHOLDER` and `driveModeChanged` already exist in the pure module and
      are the single source of truth for the wire strings. ⚠️ **`fsd` and `stepping` are the
      load-bearing spellings** — `full-autopilot` / `step-by-step` are the wrong guesses and fail
      serde on read, taking the whole project list down. A native `<select>` over the closed set is
      correct here for the same correctness reason it was correct on the picker row; the model
      override's open-string / do-NOT-validate rule must not be generalized to it.
      ⚠️ `cellLines()` is the **picker cell's** layout, not a shared widget — do not reuse it here
      and do not widen it to serve two callers.
- [x] 4.6 **Placement on the workspace surface.** The `workspace-header` already carries the name,
      the gated `↻ <nextOpen>` prediction, the gated skill row (+ Recycle), and the split control.
      ⚠️ `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` fires: put it **in the
      existing header row**, not in a new bar, panel, or settings popover. Check the header's
      horizontal budget at a narrow window before adding a wide control — the picker column's box
      math was wrong three separate ways and only measuring the live DOM caught it. **Measure;
      compute nothing you can read.**
- [x] 4.7 ⚠️ **If a selector is built, it has its OWN hit region.** M12's structural risk in the
      picker cell was two edit targets in one column, where a single cell-wide handler routes a
      click meant for the mode into the *model* editor — *"presents as 'the control does nothing'
      and no unit test can see it."* The header now has several adjacent clickable affordances;
      the same trap applies.
- [x] 4.8 Live verify-self: change the mode from the workspace, confirm the picker row re-syncs
      (and vice versa), and confirm the OFF-gate collapse. ⚠️ Verify the **liveness claim actually
      chosen in 4.2** end-to-end — if (b), prove the running session's next turn sees the new mode
      by reading the hook's `additionalContext`, not by reading `projects.json` back.

**Open question for the operator (do not guess):** does the workspace readout need to show the
**effective** mode of the *running* session (what it spawned with) or the **stored** project
default (what the next spawn will use)? After a mid-session change under option (a) these differ,
and showing the stored value while the session runs on the old one is a new confabulation channel.
The `↻ <nextOpen>` prediction next to it is a *prediction* idiom and reads naturally as
next-spawn — which argues for stored-with-a-label, but the ask said "indicator", which reads as
current-state.

---

**Status:** ✅ **SHIPPED 2026-08-26** (`efa7798`). Gate: `pnpm verify:auto` exit 0 · Rust **883**
(was 879) · frontend **2260** (was 2230). Code-quality review: **0 CRITICAL · 4 MAJOR · 4 MINOR**,
all auto-backlogged — no refactor owed.

⚠️ **THE WP'S OWN INTERACTION DESIGN WAS REJECTED MID-FLIGHT AND RE-PLANNED.** Tasks 4.1/4.2 asked
whether to build a readout-only or a selector, and framed apply as *"label it next-spawn-only"* or
*"offer an inline Recycle affordance"*. The operator rejected that at Phase 3 verify-human: changing
the mode **IS** the intent to apply it, so it raises a **confirm**, and Apply drives the turn-level
respawn itself — immediately when the agent is idle, **queued until idle** when it is not. Cancel is
a true no-op. See the archived WIP's rewritten **AC-5**.

⚠️ **The root cause is worth carrying forward:** the rejected design came from an assumption the
agent recorded in §Assumed and then **cited in a downstream task as "operator-reviewed"**, which it
never was. **An unchallenged assumption is not an approved one.**

⚠️ **Two properties this WP established that later work must not re-derive:**
1. **`OpenIntent::TurnRespawn` resumes WITHOUT consuming the unclean-exit flag.** `authorizes_resume`
   and `should_consume_for_resume` are now **two predicates**; collapsing them back into one boolean
   reintroduces a silent auto-resume killer.
2. **`readyToRespawn` is `idle` ONLY.** `background_work` means a backgrounded job is still running
   (respawning kills it), and `unknown` **with a live session** means "spawned, no turn yet" — the
   turn-0 case the operator caught. ⚠️ Do NOT copy `recycleSession`'s `idle || background_work`
   match: it answers a different question and its own comment says so.

## WP5: Bucket exit verify — ✅ COMPLETE 2026-08-26

**Description:** Live-verify the bucket's shipped WPs, close the resolved backlog items, and sweep.
**Milestone:** 13.5
**Dependencies:** WP1, WP2, WP3 (or WP3's escalation), WP4
**Size:** XS

**Tasks:**
- [x] 5.1 Live verify-self per shipped WP. ⚠️ **WP1 needs the installed-`.app` tier**, not
      `pnpm tauri:dev` — window geometry + `app_data_dir` behaviour differ, and the operator defers
      installed-build manual verification to the `/release` gate
      (`[[installed-build-verify-deferred-to-release]]`).
      → **DONE (dev tier) + installed tier DEFERRED on a harder ground than this task states.**
      All four surfaces verified coexisting live in one `.workspace-header` on a scratch workspace.
      ⚠️ **The deferral is not merely the operator's `/release` preference:** WP1's commit `25a68bc`
      is **not an ancestor of `v0.3.4`**, so the installed binary does not link
      `tauri-plugin-window-state` **at all** (corroborated — the prod app-data dir is populated yet
      has no `.window-state.json`, while dev's has real geometry + `maximized: true`). The tier is
      **unsatisfiable without cutting a release first**; it is met at the next `/release`.
      ⚠️ **Two outcomes were NOT met and are recorded as such, not as passes:** WP3's
      viewport-advance needs real recorded CC turn starts (a fresh session has zero, so the cluster
      was correctly present-but-**disabled**) — operator-accepted, riding on WP3's own 2026-08-25
      verify-human; and WP4's queued-apply defect was **not reproduced** (it needs a busy agent; the
      whole run was idle — the same blind spot the filing itself names). Its filing was re-read at
      source and **is still accurate**, so it stays open and backlogged.
- [x] 5.2 CHANGELOG + delete-on-resolve for each fully-resolved item; **rewrite** any partial.
      → ⚠️ **ALREADY SATISFIED INSIDE THE WPs — this task was a no-op as written, and re-running it
      would have DOUBLE-COUNTED the paper trail.** All four source items were CHANGELOG'd and
      deleted/rewritten at their own closes (`CHANGELOG.md` lines 13/18/19/24): WP1's, WP2's two
      (deleted), WP3's (correctly **rewritten** to the remaining open work per the partial-resolution
      carve-out), and WP4's (no entry — direct operator ask).
      ⚠️ **But it left a real defect, which IS this task's delivered work:** a **stale duplicate of
      the pre-WP3 `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` body** survived under a mangled
      `` ## ` heading `` — the *rewrite* half of delete-on-resolve was done and the *delete* half was
      not, leaving two contradictory bodies for one ID, the older of which still listed as
      **undecided** the turn-boundary work WP3 shipped. Deleted. Root cause: the surviving entry's
      own HTML comment contains the literal text ``## `` (in *"lost its `## ` heading"*), so
      truncating that comment manufactures a heading — the **same mechanism** as the orphan fixed
      here on 2026-07-31, making this the second instance. Filed as
      `SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE` (the invariant's prose
      covers the full-resolution delete but never says a *rewrite* must remove the old body).
- [x] 5.3 `/product-finalize` — resync `arch/status-channel-and-surfaces.md` if WP2 added a state,
      archive this WBS.
      → **The conditional was TRUE and the resync is DONE** (executed in WP5 Phase 1, ahead of
      `/product-finalize`). ⚠️ **`arch/status-channel-and-surfaces.md` had described a THREE-state
      model for four days after WP2 shipped the fourth** — and because `CLAUDE.md` declares the
      `arch/` set *the authority*, that is not a lagging note but the authority asserting a refuted
      model as live spec. Now records `BackgroundWork`, purple `#a371f7`, the `Neutral` aggregate
      ranking, and the exhaustive-match-so-a-5th-state-fails-to-compile property.
      ⚠️ **A CORRECTION THIS WBS ITSELF NEEDS: the signal is `background_task_count > 0` — a COUNT,
      not the `background_tasks[]` ARRAY** that WP2's task text, the WP2 CHANGELOG line and WP5's own
      plan all named. The hook forwards only the array's **length**, deliberately: `command` /
      `description` in that array are arbitrary user shell text — the same privacy class as the raw
      prompt. A doc saying "array" invites a future reader to forward the tasks themselves.
      Now pinned by a test (`arch_doc_records_the_background_work_signal_and_colour`). Filed
      `SURFACE-2026-08-26-NO-GATE-FAILS-WHEN-A-SHIPPED-STATE-HAS-NO-ARCH-MENTION` — nothing failed
      when a shipped enum variant had no `arch/` mention; 5.3 phrased it as a *conditional*, i.e. a
      remembered checklist step, which is exactly what decays.

---

## Learning-sequence ordering

Standard sequence adapted: no environment WP (the dev env is long since proven), no 3rd-party probe
needed for WP1 (a first-party Tauri plugin on the same version line as seven already in the tree is
not an unknown API shape — deviation noted deliberately), and no orchestration layer anywhere.

- **WP1 → WP2 rationale:** WP1 is the lowest-risk, highest-daily-payoff item and touches nothing
  WP2 touches, so it banks a shippable win before any probe can change the plan. Deliberately
  cheapest-and-safest-first, matching the paydown sweep's ordering rule.
- **WP2 → WP3 rationale:** WP2 carries the milestone's only genuine unknown (does the signal
  exist?) and must resolve before WP3, because if WP2 turns out to be a one-task fix the bucket has
  budget for WP3's design pass — and if WP2 grows into a full fourth-state thread-through, WP3 is
  the natural thing to escalate out. **Sequencing WP3 last is what makes its escalation cheap.**
- **WP3 → WP4 rationale:** WP4 arrived after the bucket opened and has **no technical dependency**
  on anything here — it is ordered late purely so it does not preempt the two items that were
  already committed. ⚠️ **It is the most independently shippable WP in the bucket after 2.2**: if
  WP3 escalates out (its expected outcome), WP4 can be pulled forward without touching WP1/WP2.
- **WP4 → WP5 rationale:** exit verify last, so an interrupted bucket leaves nothing half-applied.

## Dependency map

**Critical path:** WP1 → WP2 → WP3 → WP4 → WP5 (sequential; a bucket is small enough that parallel
tracks buy nothing and cost context-switching).

**Parallel tracks:** none, but **two items are independently shippable** if the bucket is
interrupted: **WP2 task 2.2** (a live reproducible defect with a known cause) and **WP4** (no
technical dependency on WP1–WP3). WP5 depends on whatever actually shipped.

## Not in this bucket (anchors intact)

- **Editor minimap stale on file update** (`SURFACE-2026-07-31-...`) — ⚠️ **considered and excluded.**
  Its own suggested action requires rewriting `text.ts`'s `drawLine` to emit wrapped segments, which
  upstream left undone for three years. That is a feature, and soft-wrap OFF is a complete
  workaround. Not bucket-scale.
- **Manual `/session-start` mode-menu sequencing** (`SURFACE-2026-08-06-...`) — its own action says
  *"revisit after dogfooding M12's signal"*, which has now shipped. That makes it a
  **measure-then-decide**, not a build; it needs a fresh measurement pass before it can be scoped.
- Everything else in `backlog.md` — 29 open items at bucket open; the rest are tech-debt, guard
  completeness, or gated on unmet preconditions.
