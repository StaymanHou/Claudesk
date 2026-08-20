---
shape: wbs
cycle: milestone-13.5-qol-polish-bucket
milestone: 13.5
created: 2026-08-19
state: complete
---

# WBS — Milestone 13.5: QoL polish bucket

> **An OPEN collection bucket**, the fourth of its kind — following **M6** (friend-requested QoL,
> closed 2026-06-28), **M10.5** (closed 2026-07-19) and **M11.5** (closed 2026-08-01). All three
> closed at 4 WPs; this one opened scoped to match and now stands at **5** — the drive-mode
> workspace surface (WP4) was added 2026-08-20 from a direct operator ask, which is the bucket
> convention working as intended (an OPEN bucket accepts items while it runs). ⚠️ **If WP3
> escalates out per its own gate 3.2, the bucket closes at WP1+WP2+WP4+WP5 — still four.**
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
- [ ] 1.1 Add `tauri-plugin-window-state` (`2.4.1`, first-party `tauri-apps/plugins-workspace`, same
      Tauri v2 line as the seven plugins already in `Cargo.toml`) + register it.
- [ ] 1.2 ⚠️ **Scope the plugin to the `main` label only.** The PiP NSPanel has its own position
      logic (M10.5 WP1's top-right default + the in-session `positioned` flag in `pip_resize`); a
      generic save/restore over all windows would fight it.
- [ ] 1.3 ⚠️ **Verify off-screen restore clamping actually fires.** A window restored to coordinates
      on a since-disconnected monitor lands invisible and the app reads as "failed to launch."
      Either confirm the plugin's own clamping, or clamp to the current display set.
- [ ] 1.4 ⚠️ **Confirm dev/prod geometry isolation.** State must live in the per-identity
      `app_data_dir()` so `com.claudesk.app` and `com.claudesk.app.dev` never share geometry — they
      run concurrently by design (the dogfooding requirement).
- [ ] 1.5 Verify the maximized case specifically: close maximized → relaunch → still maximized.

⚠️ **The three traps ARE the work.** The dependency-plus-registration is nearly free; 1.2–1.4 are
why this is a WP and not a task. Each is an operator-visible failure if skipped, and 1.3 is the one
that looks like a crash.

---

## WP2: Probe — does the status model need a fourth state, and can it get one?

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
- [ ] 2.1 Live hook capture against a real CC session running a backgrounded job. Record the raw
      event stream; answer Q1 from data.
- [ ] 2.2 **Build the stale-blue fix regardless of Q1** — map `SubagentStop` so a finished
      background agent clears `AwaitingInput`. ⚠️ **This half is NOT probe-gated:** the event already
      exists and is merely dropped, so it needs no new signal and no new state. It is a live,
      reproducible defect with a known cause.
- [ ] 2.3 If Q1 says a signal exists: add the fourth `WorkspaceState`, pick a colour distinct from
      gray/green/blue, thread it through all three surfaces + the aggregate ranking rule.
- [ ] 2.4 If Q1 says no signal: re-file the gray half as blocked-upstream with the capture as
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

## WP3: Turn-output reorientation

**Description:** With heavy cross-workspace switching, a single CC turn can run 10+ minutes and
100+ lines, and it is hard to locate **where the last turn's output began** — acutely in the common
case where the operator layers a question on top of a workflow instruction, so the answer and the
workflow output interleave.
**Milestone:** 13.5
**Dependencies:** WP1, WP2 (ordering only — see the rationale below; no technical dependency)
**Size:** M–L ⚠️ **and that is the problem**

⚠️ **SCOPE RISK, STATED UP FRONT RATHER THAN DISCOVERED LATE.** The QoL-bucket convention is
explicitly for *"`/feature-plan`-scale dogfooding papercuts"* (M11.5's own rationale). This item is a
**UX/attention feature**, not a papercut: it has no obvious minimal form, it touches the terminal
render path, and its backlog entry is `[type: new-work (UX / attention feature)]`.

**Therefore, a hard gate:**
- [ ] 3.1 **Design pass FIRST** — `/feature-spec`, not `/feature-plan`. Enumerate the candidate
      mechanisms (a turn-start marker/divider in the xterm buffer · a "jump to last turn start"
      affordance · a scroll-position memory per workspace · something else) and pick one.
- [ ] 3.2 ⚠️ **If the spec comes back larger than one WP, SPLIT IT OUT as its own milestone and
      close the bucket at WP1+WP2+WP4.** Do not let it sprawl inside the bucket — a bucket that
      absorbs a feature stops being a bucket, and the three prior buckets all closed at 4 WPs of
      genuinely small work. Escalating here is the expected outcome, not a failure.
- [ ] 3.3 Build only if 3.1 yields a WP-sized mechanism.

⚠️ **Do NOT reach for a new panel or view.** `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]`
fires directly: the terminal already shows this output, so any new surface would be a strict subset
plus a sync cost. The irreducible non-overlap is **navigation within the existing buffer** — build
that and nothing more.

---

## WP4: Drive-mode readout + selector on the workspace surface

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

- [ ] 4.1 **Decide readout-only vs readout+selector FIRST, and get the operator's call on record.**
      The ask says both, so build both unless 4.2 says the write path cannot be made honest. A
      readout alone is a strictly cheaper fallback and still solves the stated "no way to see it"
      half.
- [ ] 4.2 ⚠️ **Resolve the LIVENESS QUESTION before building the selector — it is the whole
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
- [ ] 4.3 ⚠️ **Add the broadcast event that M12 deliberately omitted.** With a second surface, the
      picker and the workspace can disagree, and `driveModeIpc.ts` says outright that this is when
      to add it. Mirror the **permission mode's** pattern (app-global value, re-broadcasts on
      write because it has a View-menu radio as a second surface) — that is the in-repo precedent
      for two-surfaces-one-value; the model override's no-event pattern is now the wrong template.
      Both surfaces must re-sync on a write from either.
- [ ] 4.4 ⚠️ **GATE IT, and take the OFF-invariant guard's SIXTH arm.** The mode is a
      workflow-system concept, so this surface is `workflow_features_enabled`-gated exactly as the
      skill row and `workspace-header-nextopen` are — **ABSENT when off, not hidden or disabled**.
      Per the guard's own header, a new gated surface owns a new arm. ⚠️ **Probe the new arm
      INDIVIDUALLY** — the guard now has five arms and seven subjects, and a composite bypass that
      trips *some* arm reports "the guard bites" while hiding this one's gap. Confirm the mutation
      landed in **executable** code (`[[verify-the-mutation-landed]]`,
      `[[invalid-probe-and-real-hole-look-identical]]`).
- [ ] 4.5 **Reuse `cc/driveMode.ts` as-is; add no second vocabulary.** `DRIVE_MODES`,
      `DRIVE_MODE_UNSET_PLACEHOLDER` and `driveModeChanged` already exist in the pure module and
      are the single source of truth for the wire strings. ⚠️ **`fsd` and `stepping` are the
      load-bearing spellings** — `full-autopilot` / `step-by-step` are the wrong guesses and fail
      serde on read, taking the whole project list down. A native `<select>` over the closed set is
      correct here for the same correctness reason it was correct on the picker row; the model
      override's open-string / do-NOT-validate rule must not be generalized to it.
      ⚠️ `cellLines()` is the **picker cell's** layout, not a shared widget — do not reuse it here
      and do not widen it to serve two callers.
- [ ] 4.6 **Placement on the workspace surface.** The `workspace-header` already carries the name,
      the gated `↻ <nextOpen>` prediction, the gated skill row (+ Recycle), and the split control.
      ⚠️ `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` fires: put it **in the
      existing header row**, not in a new bar, panel, or settings popover. Check the header's
      horizontal budget at a narrow window before adding a wide control — the picker column's box
      math was wrong three separate ways and only measuring the live DOM caught it. **Measure;
      compute nothing you can read.**
- [ ] 4.7 ⚠️ **If a selector is built, it has its OWN hit region.** M12's structural risk in the
      picker cell was two edit targets in one column, where a single cell-wide handler routes a
      click meant for the mode into the *model* editor — *"presents as 'the control does nothing'
      and no unit test can see it."* The header now has several adjacent clickable affordances;
      the same trap applies.
- [ ] 4.8 Live verify-self: change the mode from the workspace, confirm the picker row re-syncs
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

## WP5: Bucket exit verify

**Description:** Live-verify the bucket's shipped WPs, close the resolved backlog items, and sweep.
**Milestone:** 13.5
**Dependencies:** WP1, WP2, WP3 (or WP3's escalation), WP4
**Size:** XS

**Tasks:**
- [ ] 5.1 Live verify-self per shipped WP. ⚠️ **WP1 needs the installed-`.app` tier**, not
      `pnpm tauri:dev` — window geometry + `app_data_dir` behaviour differ, and the operator defers
      installed-build manual verification to the `/release` gate
      (`[[installed-build-verify-deferred-to-release]]`).
- [ ] 5.2 CHANGELOG + delete-on-resolve for each fully-resolved item; **rewrite** any partial.
- [ ] 5.3 `/product-finalize` — resync `arch/status-channel-and-surfaces.md` if WP2 added a state,
      archive this WBS.

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

## Session Handoff — 2026-08-19 15:25
Handed off. See `workflow-system/state/.session.md` to restore.
