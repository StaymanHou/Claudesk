# Feature: M12 WP3 — Auto-fire + the picker-row announcement and its second door

**Workflow:** feature
**State:** spec
**Created:** 2026-08-03
**Entry:** spec (complex feature — L, and it carries every genuine unknown in M12)
**Milestone:** Milestone 12 — Smart auto-resume + drive mode
**WBS:** `workflow-system/product/wbs.md` → WP3
**drive_mode:** autopilot

> **⚠️ Why this spec was written EARLY, out of WP order.** WP1 (probe) and WP2 (flag lifecycle) come
> first in execution, but this spec was drafted at the end of the M12 decomposition session
> **deliberately, while the context was rich** — operator's call: *"We should only pause this session
> after we build a draft feature spec for auto-fire… because we have very rich context of this. I
> don't want to go through this again when we get to that WP."*
>
> **Consequence for whoever picks this up:** the decision model below was derived from a log-mining
> analysis (60 project stores / 2087 transcripts) that is **not repeated anywhere else** except in
> `wbs.md` → "Scope-audit findings". Read that section before touching this spec — the roadmap's
> original three-branch design was **wrong**, and the reasons are not obvious from the code.
>
> **This spec is a DRAFT pending WP1 + WP2.** Two of its inputs are verdicts those WPs produce (the
> flag's store, and the batched announce query's shape). Both are marked ⏳ below. Re-read this spec at
> WP3 entry and reconcile — do not assume it is still current.

## Problem Statement

Opening a project in Claudesk drops you at a bare CC prompt, and **you** have to remember how the last
session ended and type the matching resumption command. Across 20+ rotating projects with 3–4 in
flight, that recall is exactly the tax Claudesk exists to remove — and the log evidence shows the tax
is usually just *not paid*: **69.5% of cold opens use no resumption command at all**, not because
none was wanted, but because typing it is friction that gets skipped.

WP1 and WP2 build the two *signals* that make the right command knowable (an explicit unclean-exit
flag; the presence of `workflow-system/state/.session.md`). **This WP is the acting half:** it
announces the predicted command in the picker before you click, fires it on open, and gives you a
second door that opens the workspace without firing.

It is the milestone's risk concentration. Four unknowns live here and nowhere else:

1. **The first feature-initiated PTY write.** `cc_input`'s only caller today is `XtermPane.tsx:299`
   (real xterm keystrokes). `slash_command_bytes` exists and is used by the shutdown path, but no
   *feature* has ever composed input on the app's own initiative.
2. **Injection timing against a freshly-spawned CC** (see the Asked question below — settled, with an
   empirical gate).
3. **The `pickerRowOrder` sibling-nesting trap** — a documented, silent, 100%-reproducible defect that
   this affordance is the single most likely thing in M12 to hit.
4. **An auto-action on the app's most-glanced surface**, where a wrong prediction is both visible and
   annoying.

## User Stories

- As the operator, I want to **see which command a workspace will fire before I click it**, so opening
  a project is a predictable act rather than a surprise.
- As the operator, I want the right resumption command to **fire automatically** on open, so returning
  to a project costs one click instead of one click plus a remembered incantation.
- As the operator, I want a **second door that opens the workspace without firing anything**, for the
  times I have a handoff pointer but genuinely want to do something else — a case that **actually
  happened** (`stayman-cc-wrapper`, 2026-06-16: live `.session.md`, operator opened it and asked
  *"shall we give this desktop app a name?"*).
- As the operator, I want **`/session-start` never fired for me**, because it is rare (2.7% of cold
  opens) and expensive when wrong — but I want it **one click away** when I do want it.
- As the operator, I want to **confirm my unclean-exit click registered**, by seeing the pending action
  on an already-open workspace — otherwise the flag is write-only and I cannot tell.
- As a Claude Code user who does **not** run the companion workflow system, I want **none of this to
  exist**, because it would be a promise about files I do not have.

## Acceptance Criteria

### The decision function

- [ ] A pure `predictAction(uncleanFlag, sessionMdPresent) → "resume" | "restore" | null` exists,
      imported by its tests (not re-implemented in them).
- [ ] **The unclean flag WINS over `.session.md`.** ⚠️ This **reverses** the roadmap's *"both present →
      prefer `/session-resume`, workflow context is richer."* Operator's reason: the flag is an
      **explicit user signal**; `.session.md` is **semi-automated**.
- [ ] **The precedence is mutation-proven** — inverting it must fail a test. The roadmap states the
      opposite order, so a future reader will otherwise "fix" it back. Per
      `[[verify-the-mutation-landed]]`, confirm the mutation changed executable code before believing
      the pass.
- [ ] `null` (neither signal) fires **nothing**. `/session-start` is never auto-fired.

### The announcement

- [ ] Each picker row whose prediction is non-`null` states the command it will fire, next to the
      project name.
- [ ] A row with a `null` prediction shows **no announcement**.
- [ ] The prediction is read **once at picker open** (operator-settled), from **one batched call** —
      never a per-row probe. ⚠️ M11.5 WP1's review found the model cell issuing an IPC read per row for
      a value already on the wire; this is the same surface.
- [ ] A counted-IPC harness proves **exactly one** announce call per picker open, calibrated against a
      deliberately-wrong per-row implementation so the count is meaningful rather than vacuous.

### The two doors

- [ ] Clicking the row (the existing gesture) opens the workspace **and** fires the announced command.
- [ ] A `⏵` button opens the workspace **without** firing.
- [ ] `⏵` is **present only when a prediction is non-`null`** — with no prediction both doors are
      identical, so the button would be a control that provably does nothing. One conditional governs
      both the label and the button.
- [ ] ⚠️ **`⏵` is a SIBLING of the open-area `<button>`, never nested** — asserted via the existing
      `isSiblingOfOpenButton` (`pickerRowOrder.ts`), and the cell is added to `PICKER_ROW_CELLS` as
      **data** so the component cannot disagree with the declared order.
- [ ] Neither door **persists anything**. This is a per-open routing decision, not a preference.

### The fire

- [ ] Sending goes through **`slash_command_bytes`** (`cc_session/mod.rs:251`) — the reserved injection
      helper. **No new primitive.**
- [ ] The command fires **after `cc_ready`** for that session (see Asked → Q1).
- [ ] ⚠️ **Empirical gate before committing to the timing:** verify on `tmp/scratch/scratch-a` that a
      command sent at `cc_ready` actually **executes** — not merely that bytes were written. Evidence
      must be execution-side (the command's *output*), not typing-side. If early stdin is discarded,
      escalate to the hook-channel signal (Q1 option 3) and record why.
- [ ] Firing **consumes the unclean flag** (clears it), matching `.session.md`'s lifecycle — which
      `/session-restore` deletes at its own step 7.
- [ ] The commands sent are **`/session-restore`** and **`/resume`**. ⚠️ **`/session-resume` does not
      exist** — renamed at WP5/M9 specifically to avoid colliding with the built-in `/resume` this
      feature also sends.

### The manual `/session-start` button

- [ ] A button inside the workspace fires `/session-start` on one explicit click.
- [ ] Deliberately **one hardcoded button, not a registry** — M13 builds the generic skill registry and
      either absorbs this or keeps it as a pinned special case.

### The already-open indicator

- [ ] An already-open workspace shows the action it *would* fire next time, so the unclean flag is not
      write-only and an exit-button click is confirmable.

### The gate

- [ ] Everything in this WP reads `useWorkflowFeaturesEnabled` (the hook — never `invoke(...)` ad hoc,
      never the raw `getWorkflowFeaturesEnabled()` wrapper; both bypass shapes are scanned).
- [ ] **With the gate OFF none of it exists** — not rendered-then-hidden, not present-but-disabled, not
      registered-with-a-no-op-handler. No announcement, no `⏵`, no fire, no button.
- [ ] ⚠️ The seam reference must be in **executable source** — the guard's chord arm strips comments,
      and a comment-only mention was **measured** not to satisfy it (M11). Copy `panelHost.ts:43`'s
      `ReturnType<typeof useWorkflowFeaturesEnabled>` pattern.

## Out of Scope

- **The unclean flag's storage and lifecycle** — WP2 owns it. This WP *reads* the flag and *consumes*
  it on fire.
- **The batched announce query's implementation** — WP1 decides its shape; this WP consumes it.
- **The drive-mode picker cell** — WP4, a parallel track.
- **A generic skill registry / button palette** — M13.
- **Recycle Session** (`/clear` then restore) — M13. ⚠️ But note it is a **clean** boundary and must
  clear the flag (WP2 task 2.5), or every recycle leaves a false unclean mark.
- **Any `~/.claude/projects/<slug>/` read.** The roadmap's resumability query is deliberately **not
  built** — it is unqueryable and its only proxy is permanently true. Reintroducing it would restore
  the starved-branch defect.
- **Legacy pre-migration doc paths.** `workflow-system/state/.session.md` only. M11 built legacy
  tolerance then removed it by operator decision.
- **A confirmation gate before firing.** The announcement *is* the legibility mechanism; a keypress on
  every open was considered and rejected (the prediction is right ~97% of the time when non-null).
- **Firing anything on a warm `/clear` re-open.** Those are M13's Recycle Session, not a workspace open.

## Technical Constraints

- **One open path, verified.** `openFromOverlay` delegates to `openWorkspace` (`App.tsx:656`), so both
  picker entry points share one function — the no-fire door cannot silently apply to only one. Confirm
  this still holds at WP3 entry.
- **`RecentProject` is the announce payload's natural home** (`ProjectPicker.tsx:43`) — it already
  carries `display_name`, `project_path`, `default_model`. ⚠️ Tauri does **not** camelCase return
  values; keep any new field snake_case and pin it with a serde-shape test, as `DocEntry` does.
- **Spawn happens in `XtermPane` on mount**, and `cc_ready` (`commands.rs:112`) is the existing
  frontend→backend handshake that releases buffered output. The fire sequences after it.
- **`slash_command_bytes` normalizes to exactly one `\r`** and is already tested for CR/LF variants
  (`mod.rs:897-919`). ⚠️ A stale test at `:918` asserts on `"/session-resume"` — **WP2 fixes it**; do
  not copy that string.
- **Esc is CC's own interrupt.** The operator confirms CC already handles it, so the mitigation for a
  wrong fire is *"interrupt a running command"*, **not** *"cancel before send"*. Document it that way
  — implying a pre-send window would be false.
- **The OFF-invariant guard needs a fourth arm for this WP's surfaces** (a picker cell + a spawn-time
  action are neither panel, menu-id, nor chord). **WP5 owns the arm**; this WP must not narrow the
  guard to dodge it. `WORKFLOW_TERMS` already contains `"drivemode"`/`"drive-mode"`.
- **No 3rd-party dependency** — no external API, service, or SDK. `claude` is a local CLI already
  spawned through the existing `CcSession` seam, and this WP adds no new flag or invocation mode.
  §2's probe check does not fire.
- **No component-render harness exists** (`@testing-library/react` is not a dependency;
  `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` is open). So the decision function must be a
  **pure module tests import**, and render/interaction properties go to live verification via the MCP
  bridge on `tmp/scratch/scratch-*` — mandatory here, since every check spawns a real CC session.
- ⏳ **`arch.md` exceeds the size guard** (834 lines) — see Discoveries.

## Design-priors consult

| Prior | Rule | Effect |
|---|---|---|
| `explicit-selectable-mode-over-inferred-mode` | **3 — resolved, not overridden** | Fires hard against a silent inferred auto-fire. **The announcement resolves it without a confirmation keypress:** the action is stated *before* the click and a second door escapes it, so the state is legible and correctable while remaining automatic. Its `risk-surface-vs-value` clause additionally justifies *not* building the `~/.claude/projects/` probe (high bug surface, unproven value). |
| `primary-surface-is-zero-ceremony-not-a-mode` | 2 (agrees) | The whole point: no setup step between "I'm here" and productive. |
| `paired-actions-need-paired-affordances` | 2 (agrees) | The manual `/session-start` button is the **inverse** of the two auto-actions, not an overlap — cutting it leaves a hole. Same prior that bounded the anti-redundancy prior at M10.9. |
| `gate-substrate-dependent-feature-class-behind-default-off-opt-in` | 2 (agrees) | Behind `workflow_features_enabled`; default set by **applicability**, never audience size. |
| `new-surface-must-earn-its-place-against-existing-ones` | 2 (agrees) | Adds **no new surface** — extends the existing picker row and the existing open path. |
| `set-a-spawn-time-choice-where-the-spawn-is-chosen` | 5 — **does NOT fire** (over-infer guard) | That prior governs *where a persisted setting's control belongs*. This WP persists **nothing**; both doors are one-shot routing. Naming it here so a later reader does not stretch it into "the no-fire door should be a per-project preference" — which is precisely the misreading the operator corrected during decomposition. |

## Open Questions

- [ ] ⏳ **Where does the unclean flag live, and how is it read from the frontend?** WP1 decides
      (machine-local session state, *not* a project preference — same shape as `default_model`,
      different category). This WP consumes whatever WP1 lands.
- [ ] ⏳ **What is the batched announce call's exact signature?** WP1 designs it; this spec only fixes
      the constraint (one call per picker open, never per row).
- [ ] **Announce-label placement vs. long project names** (WBS task 3.2). Next to the name reads best,
      but competes for the flexing left region. Measure at realistic name lengths — cheap to reverse,
      so not asked.
- [ ] **Keyboard parity for the no-fire door** (WBS task 3.6). If Enter opens-with-fire, there is no
      keyboard route to the second door. Decide a modifier (⌥Enter/⌥click) or defer with a reason.
- [ ] **Does `/resume` need an argument?** `claude --help` shows `-r/--resume [value]` with an
      *optional* value, and the slash-command form may differ. Verify the bare `/resume` resumes the
      most recent conversation for the cwd before relying on it.

## Elicitation record

### Asked

**Q1 — When the auto-fire sends into a freshly-spawned CC, what guarantees the command lands after
CC's prompt is ready?** (Passed all three clauses: not discoverable without running it, a genuine
tradeoff about acceptable risk, and expensive to reverse — the wrong answer is a silently-lost command
that presents as "it just didn't restore.")

**Answer: fire on `cc_ready`, accept the risk — with an empirical gate.** A terminal buffers stdin by
design, so bytes written before CC is interactive should be consumed when it becomes so. **But this is
verified, not assumed:** WP3 must prove on `tmp/scratch/scratch-a` that the command *executes*
(execution-side evidence — the command's output — not merely that bytes were written). If early stdin
is discarded, escalate to the hook-channel ready-signal and record why.

Two alternatives were considered and rejected: **watching CC's output for a prompt marker** violates
the project's core architectural line (*"NEVER from PTY output"*) and is brittle across CC releases;
**waiting for the first hook event** is architecturally clean but may wait forever if a fresh session
emits nothing before the user types — it would need its own probe.

### Assumed (defaults taken WITHOUT asking — the review backstop)

1. **The announcement shows the literal command** (`/session-restore`) rather than prose ("restore your
   session"). The operator types these commands daily; the literal string is unambiguous and matches
   what actually gets sent. Cheap to reword.
2. **`⏵` is the glyph.** Placeholder — any icon works; the placement rule (sibling, conditional) is
   what matters. Cheap to change.
3. **The announcement is not clickable.** It is a readout; the row and `⏵` are the two actions. Adding a
   third click target on the most-glanced surface needs a reason, and none was offered.
4. **Read-at-picker-open with no live refresh** (operator-settled for the read timing; the *no-refresh*
   part is mine). `.session.md` can vanish while the picker is open. Accepted because the picker is
   on-screen briefly — but ⚠️ M11 WP4's lesson is that stale-looking-current is worse than absent, so
   if this proves wrong, refresh on window focus.
5. **The already-open indicator reuses the workspace header**, not a new surface. The header already
   carries live per-workspace state (status dot, split control). Placement is cheap to move.
6. **A fire failure surfaces visibly** rather than failing silently — per the standing lesson that a
   Tauri `invoke` rejection vanishes without a `catch` (the WP6 picker MAJOR).
7. **No telemetry / no counter** on which branch fires how often. Not asked for; the time-analytics
   subsystem is separately gated.
8. **Both doors record the open** (`record_open`, so recency ordering stays honest). Only the *firing*
   differs.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->

- `[SURFACED-2026-08-03]` feature-spec — `arch.md` exceeds size guard (834 lines). Not re-read in full
  this pass; its M11 section was authored in this same session and the M12-relevant seams
  (`slash_command_bytes`, `cc_ready`, `pickerRowOrder`, the gate seam) were read directly from source
  instead. Consider summarizing, or accept that `arch.md` is now a reference doc read by grep rather
  than end-to-end.
