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
> closed at 4 WPs; this one is scoped to match.
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

## WP4: Bucket exit verify

**Description:** Live-verify the bucket's shipped WPs, close the resolved backlog items, and sweep.
**Milestone:** 13.5
**Dependencies:** WP1, WP2, WP3 (or WP3's escalation)
**Size:** XS

**Tasks:**
- [ ] 4.1 Live verify-self per shipped WP. ⚠️ **WP1 needs the installed-`.app` tier**, not
      `pnpm tauri:dev` — window geometry + `app_data_dir` behaviour differ, and the operator defers
      installed-build manual verification to the `/release` gate
      (`[[installed-build-verify-deferred-to-release]]`).
- [ ] 4.2 CHANGELOG + delete-on-resolve for each fully-resolved item; **rewrite** any partial.
- [ ] 4.3 `/product-finalize` — resync `arch/status-channel-and-surfaces.md` if WP2 added a state,
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
- **WP3 → WP4 rationale:** exit verify last, so an interrupted bucket leaves nothing half-applied.

## Dependency map

**Critical path:** WP1 → WP2 → WP3 → WP4 (sequential; a bucket is small enough that parallel tracks
buy nothing and cost context-switching).

**Parallel tracks:** none. **WP2 task 2.2 is independently shippable** if the bucket is interrupted —
it is the one item here that is a live reproducible defect with a known cause.

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
