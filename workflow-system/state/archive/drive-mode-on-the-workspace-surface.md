# Feature: Drive-mode readout + selector on the workspace surface

**Workflow:** feature
**State:** finalize (complete) — ARCHIVED
**Created:** 2026-08-25
**Entry:** spec (complex feature)
**Milestone:** 13.5 — WP4
**drive_mode:** autopilot

## Problem Statement

The workflow drive mode is settable and legible **only** on the picker row. Once a workspace is
open — which is where the operator actually spends the day — there is no way to see which mode
this session is running under, and no way to change it without navigating back to the picker.

⚠️ **THIS IS A DELIBERATE REVERSAL OF A RECORDED M12 DECISION, NOT A GAP.** Three artifacts say
"picker row **only**": `arch/session-resumption.md` → "The picker-row cell (⚠️ NOT the workspace
header)"; `cc/driveModeIpc.ts`'s no-broadcast-event note (*"would be a real reversal rather than
an extension"*); and design prior `set-a-spawn-time-choice-where-the-spawn-is-chosen`, whose
origin is the operator **rejecting** the model override on the workspace header at M11.5 WP1
verify-human. The reversal is legitimate because the prior's own `Why:` names this exact edge as
untested — *"the untested edge is a setting read at creation that is ALSO live-reconfigurable
later, which may want both."* Drive mode **is** that setting. The reversal resolves a hole the
prior itself marked open; it does not overturn the prior's decided cases.

⚠️ **THE MODEL OVERRIDE DOES NOT COME ALONG.** `--model` is fixed at spawn for the process's
life and stays picker-row-only. The discriminator is the prior's own rule — *"read at creation,
immutable afterward"* vs *"read continuously / live-reconfigurable"*.

### The liveness problem, and why Recycle is the wrong instrument for it

A mid-session mode change cannot reach the running CC session: `cc_spawn_env` composes
`CLAUDESK_DRIVE_MODE` into the CC process's environment at spawn, and `claudesk-hook.pl:120`
reads `$ENV{CLAUDESK_DRIVE_MODE}` — the env it inherited from CC, which inherited it from that
spawn. A live process's env is fixed. So a selector on a running workspace **looks live and is
not** — precisely the failure mode the design prior exists to prevent.

⚠️ **The obvious fix — reuse Recycle — was CONSIDERED AND REJECTED, and the reason is the
architecture's central distinction.** Recycle is a **session-boundary** operation:
`/session-handoff` → kill → respawn → `/session-restore`. It writes `.session.md`, ends the
session, and restores *reconstructed context from a handoff document*. Using it to change one
env var pays a full context-reconstruction tax and lands the operator in a restored-from-notes
session rather than the one they were in.

What is actually needed is **turn-level**: kill CC, respawn (re-reading the new mode), relaunch
with `--continue`. No handoff, no `.session.md`, no `/session-restore` — the **same conversation**
survives with a new PID. This is the same distinction the codebase already draws twice:

- **M12's two signals** — unclean-exit flag → spawn with `--continue`; `.session.md` present →
  inject `/session-restore`. Two doors, deliberately not interchangeable.
- **mccc's turn-vs-session boundary** — bare "pause"/"stop"/"hold" is a plain interrupt with *no
  artifact*; "hand off the session" writes `.session.md`. Conflating them is a confirmed misfire.

The turn-level respawn does not exist today. `relaunch()` (kill + respawn) exists and is used by
Recycle and the visible `cc-relaunch` control; `--continue` exists as an argv arm — but it is
bound to `OpenIntent` + the unclean-exit flag (`should_consume_for_resume`), i.e. a *reopen*
decision a running workspace cannot request. WP4 introduces that primitive.

**Problem statement unchanged** (verify-self F9b back-loop, 2026-08-25) — the root problem is
still "the drive mode is invisible and unchangeable from the workspace." What the halted
verify-self surfaced is a **verification** gap, not a problem-definition shift: Phase 1's plan
asked only for unit-level outcomes while the phase restructured `SessionRegistry::spawn`'s resume
`match` for **every** caller. Nothing about the feature's purpose, shape, or design changed; the
missing thing is evidence that the surface I edited still works. Fixing symptoms is not the risk
here — shipping unproven caller behavior is.

## User Stories

- As the operator, I want to **see** which drive mode the session in front of me is running
  under, without navigating back to the picker.
- As the operator, I want to **change** the drive mode from the workspace I am working in.
- As the operator, I want to know when a change I just made **has not taken effect yet**, rather
  than assuming it has.
- As the operator, I want to **apply** that change to the session I am in — keeping the
  conversation — without paying a session-boundary handoff for it.
- As a user with the workflow gate OFF, I want to see **none of this** — the surface must be
  absent, exactly as if the feature had never been built.

## Acceptance Criteria

**AC-1 — Spawn-time mode is retained.** The session handle records the drive mode it spawned
with, so "stored ≠ running" is computable. Today `cc_spawn_env` composes the var and forgets it.

**AC-2 — Turn-level respawn primitive.** A new spawn intent kills and respawns the pane's CC
with `--continue`, **without** a handoff, without writing or consuming `.session.md`, and
without injecting `/session-restore`. Decoupled from the unclean-exit flag — this arm fires on
request, not on crash. ⚠️ It must **not** consume the unclean flag (that signal belongs to the
reopen path; spending it here would silently disable auto-resume on the next real open).

**AC-3 — Workspace readout.** The `workspace-header` shows the project's drive mode. When the
stored value differs from what the running session spawned with, the readout shows both and
marks itself stale.

**AC-4 — Workspace selector.** Clicking the readout opens a native `<select>` over the closed
set. ⚠️ **A native `<select>` is correct here** for the same reason it was correct on the picker
row: the four values are a **closed** set and a bad string fails serde on read, taking the whole
project list down. The model override's open-string / do-NOT-validate rule must **not** be
generalized to it.

**AC-5 — Apply-on-change, via a confirm. ⚠️ REWRITTEN 2026-08-25 after the operator rejected the
original at Phase 3 verify-human.** Changing the mode in the selector IS the intent to apply it.
On change, Claudesk raises a **confirmation** offering:
  - **Apply** — drive the turn-level respawn (`/exit` → new env → relaunch with `--continue`).
    ⚠️ **If the agent is IDLE, drive it immediately. If it is NOT idle, WAIT until it becomes
    idle and drive it then** — never interrupt a turn in flight.
  - **Cancel** — **nothing changes**, including the stored value. Cancel is a true no-op.

⚠️ **THE ORIGINAL AC-5 WAS WRONG AND ITS ERROR IS INSTRUCTIVE.** It read: *"When stale, the
readout offers the AC-2 respawn"* — i.e. store the change, mark it stale, and leave a separate
affordance for the operator to find and click later. That design was derived from an assumption
**I recorded in §Assumed and mislabelled in P4.3 as "operator-reviewed"**: *"Apply-now is a
distinct affordance, never an implicit side-effect of choosing a mode… a `<select>` that silently
kills and respawns CC is too much consequence behind a dropdown."* The operator never reviewed it;
it sat unchallenged in an assumptions list. **The concern was real; the resolution was wrong.** A
confirm dialog answers "too much consequence behind a dropdown" directly — the consequence is
surfaced and acknowledged — without splitting the intent across two separate gestures the
operator has to discover and connect.

**AC-6 — Broadcast event.** With two surfaces, the picker and the workspace must re-sync on a
write from either. Mirror the **permission mode's** pattern (`CC_PERMISSION_MODE_EVENT`:
persist, then `app.emit`, all surfaces listen) — that is the in-repo precedent for
two-surfaces-one-value. ⚠️ The payload must carry the **project path**: the permission mode is
app-global, this value is per-project. The model override's no-event pattern is now the wrong
template.

**AC-7 — Gated, and it takes the guard's SIXTH arm.** The mode is a workflow-system concept, so
this surface is `workflow_features_enabled`-gated exactly as the skill row and
`workspace-header-nextopen` are — **ABSENT when off, not hidden and not disabled**
(`useWorkflowFeaturesEnabled`'s contract: not `rendered-then-hidden`, not `present-but-disabled`,
not `registered-with-a-no-op-handler`). Per the guard's own header, a new gated surface owns a
new arm. ⚠️ **Probe the new arm INDIVIDUALLY** — the guard has five arms and seven subjects, and
a composite bypass that trips *some* arm reports "the guard bites" while hiding this one's gap.
Confirm the mutation landed in **executable** code (`[[verify-the-mutation-landed]]`,
`[[invalid-probe-and-real-hole-look-identical]]`). The arm-count pin
(`still polices all five registries`) must be updated to six.

**AC-8 — One vocabulary.** Reuse `cc/driveMode.ts` as-is: `DRIVE_MODES`,
`DRIVE_MODE_UNSET_PLACEHOLDER`, `driveModeChanged`. Add no second vocabulary. ⚠️ `fsd` and
`stepping` are the load-bearing spellings; `full-autopilot` / `step-by-step` are the wrong
guesses. ⚠️ `cellLines()` is the **picker cell's** layout — do not reuse it here and do not
widen it to serve two callers.

**AC-9 — Placement in the existing header row.**
`[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` fires: put it **in the existing
`workspace-header`**, not in a new bar, panel, or settings popover. ⚠️ Check the header's
horizontal budget at a narrow window before adding a wide control — **measure the live DOM;
compute nothing you can read.** The picker column's box math was wrong three separate ways and
only measuring caught it. Note `.workspace-header-name` ellipsizes but declares no shrink limit,
so every sibling in that row is `flex-shrink: 0` deliberately — a shrinkable addition would let
the browser squeeze a sibling instead of the name, or resolve the contest differently at
different widths.

**AC-10 — Its own hit region.** The selector gets its own hit region with `stopPropagation` on
**both** pointerdown and click, plus an explicit Enter/Space mirror. M12's structural risk in the
picker cell was two edit targets in one column where a cell-wide handler routed a click meant for
the mode into the *model* editor — *"presents as 'the control does nothing' and no unit test can
see it."* The header now has several adjacent clickable affordances; the same trap applies.

**AC-11 — Live verification.** Change the mode from the workspace, confirm the picker row
re-syncs (and vice versa); confirm the OFF-gate collapse; and prove the liveness claim
**end-to-end** — after an apply-now respawn, the running session's next turn must see the new
mode, verified by reading the hook's `additionalContext`, **not** by reading `projects.json`
back.

## Out of Scope

- **The model override does not move.** It stays picker-row-only (AC-1 rationale above). A
  change that moves both, or generalizes "workspace surfaces get the picker's cells",
  contradicts the design prior.
- **No per-turn settings read in the hook.** `claudesk-hook.pl` keeps reading only the env var.
  Its own comment rejects the alternative: *"Deliberately NOT a gate read per turn on CC's
  critical path (it would also be a second source of truth able to disagree with the spawn
  side)."* The turn-level respawn is what makes a change take effect — not a live hook read.
- **Recycle is not modified.** It remains the session-boundary instrument. The new primitive is
  a sibling, not a replacement.
- **No new drive-mode default.** An unrecognized/absent mode still emits nothing; Claudesk does
  not invent workflow policy (`session-restore` contradicts itself on the default, which is
  exactly why the hook emits nothing rather than a default).
- **Claudesk still never writes `workflow-system/`.** It reads that world; it does not write it.

## Technical Constraints

- **No 3rd-party dependency.** Every piece is in-tree: `cc_session`, `config_store`,
  `driveMode.ts`, the existing `relaunch()` path. Step-2 probe check: not applicable.
- **`--continue` is gated on `OpenIntent` + the unclean flag** (`should_consume_for_resume`,
  `cc_session/mod.rs:439`). AC-2 needs a new intent that fires the flag *without* consuming it.
- ⚠️ **`SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED` is now
  load-bearing.** Arm 1's *wiring* is proven (4 standing tests); what is unverified is the CC
  **runtime** property that `--continue` resumes the *intended* conversation. WP4 makes
  `--continue` fire **on operator demand** rather than only after a crash, which raises the
  stakes on that unverified property. ⚠️ **An agent structurally cannot verify it** — an
  agent-launched Claudesk spawns CC sessions that inherit `CLAUDE_CODE_CHILD_SESSION` and write
  no transcript, so an agent-driven attempt yields a *meaningless* result, not a weak one
  (`[[agent-launched-app-cannot-verify-continue]]`). This must reach verify-human explicitly.
- **The `Workspace` model has no drive-mode field.** It carries `project_path`; the picker holds
  `recents[].default_drive_mode`. The workspace cannot see the stored mode today — AC-6's
  broadcast plus a seed is the delivery path.
- **`driveModeIpc.ts` ships no getter, on purpose.** M11.5's repair (B) removed per-row IPC
  reads that re-read + re-parsed + re-sorted the whole `projects.json` for a field already on
  the wire. ⚠️ Do not add `getProjectDefaultDriveMode` "for symmetry" — the symmetry is with a
  mistake. If the workspace needs a seed, put it on the wire.
- **`projects.json` writers are whole-file RMW** — `driveModeChanged` already suppresses
  redundant writes; keep that.
- **StrictMode double-invokes updater callbacks.** The picker cell keeps latest values in refs
  readable *outside* a state updater for exactly this reason (a `persist()` inside one fires TWO
  IPC writes per action — the M10.9 WP2 defect). Any new commit path repeats that discipline.
- ⚠️ **PiP/tray/AppKit ops and blocking work must stay off the main thread**, and a `#[command]`
  fn *is* main-thread: a sync `cc_kill` doing blocking work hung the app (P1 2026-08-25). AC-2
  kills and respawns — blocking work belongs on a worker
  (`SessionRegistry::take` + `thread::spawn`), not inline in the command.
- ⚠️ **A deleted ES-module export is a RUNTIME failure, not just a `tsc` error.** Never split an
  export deletion from its consumer migration across phases; run a boot smoke-test (`#root` has
  children) before trusting any live observation on a phase that deleted anything. Both
  `pnpm verify:auto` and `tsc` were green while the app was blank (M13.5 WP3).
- **`pnpm verify:auto` is the per-phase gate** — one command, not a remembered list.

## Decisions taken (operator, 2026-08-25)

**Asked:**

1. **How to resolve the liveness gap** → *Build the turn-level respawn.* The operator rejected
   the framing that Recycle could serve, on the grounds that the two sequences are categorically
   different — *"exactly the reason why we open the workspace with restore vs `--continue`, and
   exactly the reason why mccc distinguishes pause-the-turn vs handoff-the-session."*
2. **Whether to detect stale state** → *Yes, retain the spawn-time mode on the session handle.*
   Makes the apply-now affordance honest rather than always-on. This also settles the WBS's
   standing open question (*effective vs stored*): with both retained, the readout shows **both**
   rather than choosing.
3. **Packaging, given the scope increase** → *One WP, phased.* M13.5 stays at five WPs; WP4 grows
   from S–M to M–L.

**Assumed (defaults taken without asking — correct these at spec review if wrong):**

- The readout sits in the existing `workspace-header`, right of the existing gated affordances
  (AC-9); exact position is a cheap, reversible layout call settled at plan time by measurement.
- Visual treatment follows `workspace-header-nextopen`'s quiet-chip idiom rather than inventing
  one. ⚠️ Stale marking must not borrow the alarm-blue used for AwaitingInput
  (`[[semantic-distance-not-just-visual-distance-for-status-colour]]`).
- Label/copy wording is unfixed and settled at build time.
- The selector follows the picker's **compact-readout-that-becomes-editable** idiom (design
  prior's corollary), not a permanently-live editor — the active value stays readable without
  interaction; only the *edit affordance* is behind a click.
- ~~Apply-now is a distinct affordance from the selector, not an implicit side-effect of choosing
  a mode.~~ ⚠️ **WRONG — REJECTED by the operator at Phase 3 verify-human, 2026-08-25.** The
  concern (too much consequence behind a bare dropdown) was legitimate; the resolution was not.
  A **confirm dialog** is the right answer: it surfaces the consequence AND keeps changing the
  mode as one intent. See the rewritten AC-5. ⚠️ **Process lesson: this assumption was listed in
  §Assumed and then cited in P4.3 as "operator-reviewed", which it never was.** An unchallenged
  assumption is not an approved one, and promoting it to reviewed status in a downstream task is
  how a silent default hardens into a spec.
- The new spawn intent is additive; every existing caller keeps today's behavior.
- No keyboard shortcut is claimed (⌘⇧+digit is reserved for filmstrip switching).

## Work Tree

⚠️ **Phase ordering is dependency-driven, not convenience-driven.** P1 is backend-only and
independently verifiable; P2 renders a readout with no write path; P3 adds the writes + the
cross-surface sync; P4 wires apply-now onto P1's primitive; P5 is the live end-to-end proof that
only exists once all four are in. ⚠️ **No phase deletes an export its own phase does not also
migrate** (M13.5 WP3's blank-app lesson) — P2 and P3 are additive to `Workspace.tsx`, and
nothing in this plan removes a binding another phase still imports.

- [x] Phase 1: Retain the spawn-time mode + the turn-level respawn intent (Rust)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk --all-targets` exits 0; a new test asserts
    `resolve_cc_spawn_env`'s resolved mode is *returned* (not only embedded in the env vec),
    driven with all four degraded inputs (`None`, `Some(Err)`, `Some(Ok(None))`, `Some(Ok(Some))`).
  - CLI: a new test asserts the third `OpenIntent` variant yields `ResumeArm::Continue`
    **without** calling `consume_and_persist` — i.e. the unclean flag survives the spawn.
    Assert on the flag's post-state, not on the arm alone.
  - CLI: existing `should_consume_for_resume` tests still pass unchanged for `Fire`/`NoFire`
    (the variant is additive; no existing caller changes behavior).
  - CLI: `cargo test` shows the drive-mode wire-literal test
    (`drive_mode_serializes_to_these_literal_strings`) still green — the vocabulary is untouched.
  - ⚠️ **MISSING AT PLAN TIME, ADDED AT VERIFY-SELF (integration boundary) — `cc_spawn`.**
    Live: open a workspace from the picker in the running app and confirm CC spawns and the
    pane reaches a prompt. The phase restructured `SessionRegistry::spawn`'s resume `match`
    for **every** caller, and `cc_spawn` is unit-untestable by construction (it needs a live
    `AppHandle` and spawns a real `claude` — `cc_spawn_forwards_the_intent_rather_than_discarding_it`
    says so and settles for a source-text guard). So no unit test can discharge this; only a
    live open can.
  - ⚠️ **`Fire` still resumes, `NoFire` still does not — live.** The two pre-existing doors
    must behave identically to before the split. Open a project with the unclean flag set via
    the row door (announcement fires, `--continue` in argv) and via the `⏵` door (nothing
    fires, flag survives). ⚠️ Per `[[agent-launched-app-cannot-verify-continue]]` the agent can
    prove the ARM and the flag's post-state, NOT which conversation `--continue` lands on.
  - [x] P1.1 Return the resolved `DriveMode` from `resolve_cc_spawn_env` alongside the env vec
        (today it computes the mode at `mod.rs:583` and discards it). ⚠️ Keep it ONE resolver —
        the doc comment forbids inlining the gate/mode resolution back into `spawn`, because
        three successive source-text guards over that call site were each measured vacuous.  <!-- status: NOT-STARTED -->
  - [x] P1.2 Retain the resolved mode per session so "stored ≠ running" is computable.
        ⚠️ **Decide the carrier explicitly at build time:** `SessionRegistry` holds
        `HashMap<String, Box<dyn CcSession>>`, so the options are (a) a sibling
        `HashMap<String, Option<DriveMode>>` in the registry, or (b) a `CcSession` trait
        accessor. Prefer (a) — the trait is the "how to drive CC" seam and a display-only
        value does not belong on it. Record the choice and why in the code.  <!-- status: NOT-STARTED -->
  - [x] P1.3 Add the third `OpenIntent` variant (turn-level respawn) — authorizes
        `ResumeArm::Continue` **without** consuming the unclean flag. ⚠️ The `&&`
        short-circuit at `mod.rs:1158` is the seam: `should_consume_for_resume` must stay
        false for this variant while the arm still resolves to `Continue`, so the two
        decisions can no longer be the same boolean. ⚠️ **Do not consume the flag** — spending
        it here would silently disable auto-resume on the next real open, the exact failure
        `should_consume_for_resume`'s doc comment warns about.  <!-- status: NOT-STARTED -->
  - [x] P1.4 Expose the retained mode + the respawn intent over IPC (a command returning the
        running session's mode; the intent threaded through `cc_spawn`'s existing parameter).
        ⚠️ **Blocking work belongs on a worker, never inline in a `#[command]`** — a `#[command]`
        fn IS main-thread and a sync `cc_kill` doing blocking work hung the app (P1 2026-08-25).
        Kill+respawn follows `SessionRegistry::take` + `thread::spawn`.  <!-- status: NOT-STARTED -->
  - [x] P1.5 ⚠️ **ADDED AT VERIFY-SELF (integration-boundary back-loop, F9b).** Live `cc_spawn`
        coverage for the restructured resume `match`. Not a unit test — `cc_spawn` needs a live
        `AppHandle` and spawns a real `claude`, which is why its only prior coverage is a
        source-text guard. Driven against the dev app (PID 7904) with the scratch workspaces;
        results recorded under `## Phase 1 verify-self evidence` below.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — 4 PASS by subagent; 2 integration-boundary outcomes re-verified directly by the orchestrator (subagent lacked bridge access) -->
  - [x] verify-human  <!-- status: done — operator ACCEPTED on standing dogfooding evidence -->
    - [x] P1.verify-human.1 `--continue` resumes the intended conversation  <!-- status: done — operator: "It's always been exhibiting the right behavior" (daily dogfooding) -->
    - [x] P1.verify-human.2 both doors' argv, recorded  <!-- status: done — accepted on the same basis; agent-side live proof stands (PIDs 55903/56234) -->
  - [x] verify-codify  <!-- status: done — closed a REAL caller-composition gap; +1 test, 1 rewritten -->

- [x] Phase 2: The gated workspace readout (display-only)  <!-- status: done -->
  **Observable outcomes:**
  - Browser: with the workflow gate ON and a project whose mode is set, the live app's
    `[data-testid="workspace-header"]` contains a drive-mode readout element whose text
    includes the mode's wire string (`stepping`/`orchestrated`/`autopilot`/`fsd`).
  - Browser: with the gate OFF, `document.querySelector` for the readout's testid returns
    `null` — **absent from the DOM**, not hidden and not disabled. Verified by toggling the
    gate, not by reading a prop.
  - Browser: boot smoke-test — `#root` has children and the console shows no
    `SyntaxError`/module-resolution error (the M13.5 WP3 blank-app guard, run before trusting
    any other live observation this phase).
  - CLI: `pnpm verify:auto` exits 0.
  - CLI: the OFF-invariant guard runs with a **non-filtered** count — arm 6's subject and its
    OFF-assertion `it()` title both present, arm-count pin updated 7 → 8 subjects.
  - [x] P2.1 Deliver the stored mode to the workspace. ⚠️ `driveModeIpc.ts` ships **no getter
        on purpose** (M11.5 repair (B) removed per-row IPC reads of a field already on the
        wire) — do NOT add `getProjectDefaultDriveMode` "for symmetry". Put the value on the
        wire the workspace already receives, or seed it the way the picker's `recents` does.  <!-- status: done -->
  - [x] P2.2 Render the readout in the existing `.workspace-header`, gated on
        `useWorkflowFeaturesEnabled`. ⚠️ **`flex-shrink: 0`** — every sibling in that row is
        rigid deliberately, because `.workspace-header-name` ellipsizes with no shrink limit
        and a shrinkable addition would let the browser squeeze a sibling instead of the name.  <!-- status: done -->
  - [x] P2.3 Show the running session's mode from P1 when it differs from stored; mark stale.
        ⚠️ Stale marking must NOT borrow the alarm-blue used for AwaitingInput
        (`[[semantic-distance-not-just-visual-distance-for-status-colour]]`) — semantic
        distance, not merely visual distance.  <!-- status: done -->
  - [x] P2.4 **Arm 6 of the OFF-invariant guard**, following standing precedent **(b)**:
        assert the surface's **own predicate**, do not widen the shared `WORKFLOW_TERMS` list
        (WP2 deliberately declined to widen it; `SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`
        records (b) as precedent). Note `WORKFLOW_TERMS` already contains `drivemode`/`drive-mode`,
        so arms 1–3 would see a *menu/panel/chord*; arm 6 exists for the **header surface**.
        ⚠️ The arm-count pin is **source-derived**: the new OFF-assertion title must match
        `/\n {2}it\("(?:registers|matches|renders|announces) no [^"]+"/` or the pin fails.  <!-- status: done -->
  - [x] P2.5 ⚠️ **Probe arm 6 INDIVIDUALLY** and confirm the mutation landed in **executable**
        code — an invalid probe and a real hole present identically
        (`[[verify-the-mutation-landed]]`, `[[invalid-probe-and-real-hole-look-identical]]`).
        A composite bypass that trips *some* arm reports "the guard bites" while hiding this
        one's gap.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — 5/5 outcomes PASS (2 CLI by subagent, 3 Browser by orchestrator); a Phase-3-owned refresh gap found and recorded, not a Phase 2 regression -->
  - [x] verify-human  <!-- status: done — vh.1 PASS, vh.3 PASS, vh.2 REJECTED then fixed in place -->
    - [x] P2.verify-human.1 readout earns its place in the header  <!-- status: done — operator: "good" -->
    - [x] P2.verify-human.2 stale tooltip wording  <!-- status: done — REJECTED as against-spec, copy rewritten + regression-guarded, re-verified live -->
    - [x] P2.verify-human.3 narrow-window layout  <!-- status: done — operator: "good" -->
  - [x] verify-codify  <!-- status: done — closed a REAL caller-side gap; +3 tests, render-site coverage established -->

- [x] Phase 3: The selector + the cross-surface broadcast  <!-- status: done -->

  **Relevance check (before Phase 3):**
  - Requester still needs this: **yes** — the operator confirmed the readout earns its header slot
    at Phase 2 verify-human (vh.1 "good"), and vh.2's rejection was a demand for MORE of this
    feature's intent (apply to the running session), not less.
  - Requirements unchanged: **yes** — AC-4/AC-6 stand as specced.
  - Solution still feasible: **yes** — Phase 2 proved the readout renders and gates; the
    permission-mode broadcast precedent is in-repo and unchanged.
  - No superior alternative discovered: **yes** — Phase 2 verify-self independently CONFIRMED the
    need by finding the refresh-on-reveal gap: the reopen-dedup focuses rather than remounts, so
    no `visible` edge fires and the readout goes stale. The broadcast is not merely nice-to-have;
    it is the fix for a reproduced defect.
  **Verdict:** proceed
  **Observable outcomes:**
  - Browser: clicking the readout reveals a `<select>` whose options are exactly
    `["", ...DRIVE_MODES]` — five entries, the wire strings verbatim
    (`stepping`/`orchestrated`/`autopilot`/`fsd` + the unset placeholder).
  - Browser: choosing a mode in the workspace, then navigating to the picker, shows the SAME
    value on that project's picker row — **without a reload**. And the reverse: changing it on
    the picker row updates an open workspace's readout.
  - CLI: `projects.json` on disk contains the new `default_drive_mode` after a workspace-side
    change (`grep` the file — this is the persistence half, distinct from the sync half above).
  - Browser: clicking the readout does NOT open the project, focus the terminal, or trigger any
    adjacent header affordance — verified by `elementFromPoint` resolving to the control itself,
    not by assuming.
  - CLI: `pnpm verify:auto` exits 0.
  - [x] P3.1 Add the broadcast event, mirroring `CC_PERMISSION_MODE_EVENT` (persist → `app.emit`
        → all surfaces listen). ⚠️ **The payload must carry the project path** — the permission
        mode is app-global, this value is per-project, so a bare mode payload would apply one
        project's change to every open workspace.  <!-- status: done -->
  - [x] P3.2 Subscribe both surfaces (picker row + workspace readout) so a write from either
        re-syncs the other. ⚠️ Update `driveModeIpc.ts`'s "No broadcast event" header — it
        explicitly predicts this reversal and names the condition; leaving it stale would make
        the module lie about its own design.  <!-- status: done -->
  - [x] P3.3 The workspace selector: reuse `DRIVE_MODES`, `DRIVE_MODE_UNSET_PLACEHOLDER`,
        `driveModeChanged` from `cc/driveMode.ts`. ⚠️ **Add no second vocabulary**, and
        ⚠️ **do NOT reuse or widen `cellLines()`** — that is the picker cell's layout, not a
        shared widget. ⚠️ A native `<select>` is correct here (closed set; a bad string fails
        serde and takes the whole project list down) — the model override's open-string
        do-NOT-validate rule must not be generalized to it.  <!-- status: done -->
  - [x] P3.4 Its own hit region: `stopPropagation` on **both** pointerdown and click, plus an
        explicit Enter/Space mirror. ⚠️ M12's structural risk was two edit targets in one column
        where a cell-wide handler routed a click meant for the mode into the *model* editor —
        *"presents as 'the control does nothing' and no unit test can see it."* The header now
        has several adjacent clickable affordances.  <!-- status: done -->
  - [x] P3.5 Keep latest values in refs readable **outside** a state updater. ⚠️ StrictMode
        double-invokes updater callbacks, so a `persist()` inside one fires TWO IPC writes per
        action — the M10.9 WP2 defect the picker cell already guards against. `driveModeChanged`
        suppresses the redundant whole-file RMW.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — 5/5 outcomes PASS (2 CLI by subagent, 3 Browser by orchestrator via the bridge) -->
  - [x] verify-human  <!-- status: done — the rejected model was re-planned into Phase 4; all three leaves re-tested there and PASSED -->
    - [x] P3.verify-human.1 click-to-edit interaction  <!-- status: done — re-tested as P4.verify-human.4 under the corrected model -->
    - [x] P3.verify-human.2 stale marker on picker-side change  <!-- status: done — re-tested as P4.verify-human.2 -->
    - [x] P3.verify-human.3 the None value  <!-- status: done — re-tested as P4.verify-human.3 -->
  - [x] verify-codify  <!-- status: done — run at Phase 4 (the F12 back-loop diverted past it); closed a REAL path-check gap -->

- [x] Phase 4: Confirm-on-change + idle-gated apply  <!-- status: done -->

  **⚠️ RE-PLANNED 2026-08-25** after the operator rejected the original interaction model at
  Phase 3 verify-human. The old Phase 4 ("render a separate apply affordance when stale") encoded
  the rejected design in P4.1/P4.3; P4.2/P4.4's respawn wiring was correct and is carried forward
  verbatim. See the rewritten **AC-5** and `## Phase 3 verify-human` for the root cause.

  **Observable outcomes:**
  - Browser: choosing a DIFFERENT mode in the workspace selector raises a confirm dialog
    (`[data-testid="drivemode-confirm"]`, `role="dialog"`) offering Apply and Cancel.
  - Browser: choosing the SAME mode raises NO dialog and writes nothing (`driveModeChanged`
    already suppresses the redundant whole-file RMW).
  - Browser: **Cancel is a true no-op** — the dialog closes, the readout still shows the ORIGINAL
    mode, and `projects.json` on disk is byte-identical to before the interaction. ⚠️ Assert the
    FILE, not just the readout: "stored the value but did not respawn" is the failure to catch.
  - CLI: after Apply on an **idle** agent, `ps` shows the CC child PID for that workspace
    CHANGED, and `projects.json` holds the new mode.
  - CLI: after Apply, `workflow-system/state/.session.md` does NOT exist and no
    `/session-handoff` or `/session-restore` was injected — turn-level, not a session boundary.
    ⚠️ This is what distinguishes the primitive from Recycle; assert it, don't infer it from the
    PID change.
  - CLI: the unclean-exit flag for that project is UNCHANGED across the apply respawn (read
    `session-state.json` before and after) — the flag belongs to the reopen path.
  - CLI: `readyToRespawn` unit table — `idle` → true; `running`, `awaiting_input`,
    `background_work`, `unknown` → false. Mutation-proven per state INDIVIDUALLY.
  - CLI: `pnpm verify:auto` exits 0.

  - [x] P4.1 **The confirm dialog.** Reuse `WorkflowInviteModal.tsx`'s shape (`role="dialog"`,
        `aria-modal`, copy in named constants, `data-testid` per button) rather than inventing a
        modal idiom. Two actions only: **Apply** and **Cancel**. ⚠️ The dialog must NAME the
        consequence — it restarts Claude Code for this workspace — because that consequence is
        the entire reason the operator required a confirm rather than a silent write.  <!-- status: done -->
  - [x] P4.2 ⚠️ **Cancel reverts the STORED value too, not just the dialog.** The Phase 3 commit
        path writes optimistically on `onChange`; under the new model that write must not happen
        until Apply. Restructure so the chosen value is held as a PENDING value and only
        `setProjectDefaultDriveMode` on Apply. **Cancel must leave `projects.json` untouched** —
        a Cancel that silently persisted would be the exact "looks live and is not" trap AC-5
        exists to prevent.  <!-- status: done -->
  - [x] P4.3 **`readyToRespawn(state)` as a PURE function**, exported for test.
        ⚠️ **`idle` ONLY.** Each rejection is deliberate, not an oversight:
        • `running` / `awaiting_input` — a turn is in flight; respawning discards it.
        • `background_work` — ⚠️ **control returned BUT a backgrounded job is still running**
          (`status_broadcaster`: `Stop` with `background_task_count > 0`). Respawning kills that
          job. It is *not* "idle enough", and treating it as such is the tempting wrong answer.
        • `unknown` — no hook event observed yet. Absence of data is NOT evidence of idleness.
        ⚠️ Do NOT reuse `recycleSession`'s `idle || background_work` match: that one answers a
        DIFFERENT question ("did a `Stop` event arrive?") and its own comment says to keep it in
        sync with `event_to_state`'s `Stop` arm, *"NOT with the set of states that happen to mean
        'not busy'"* — which is precisely what this predicate is.
        (`[[derived-state-is-not-a-proxy-for-its-event]]`, a shipped CRITICAL.)  <!-- status: done -->
  - [x] P4.4 **The idle wait.** If `readyToRespawn(statusState)` is true at Apply, drive
        immediately; otherwise hold the pending apply and drive it as soon as it becomes true.
        ⚠️ **Observe the STATE, do not wait on a transition EVENT.** `stateFor` is a collapsed
        map — two consecutive same-state updates are indistinguishable
        (`[[workspace-status-map-collapses-consecutive-events]]`, failure mode: *a feature that
        silently never fires*). This feature needs "is it idle NOW", re-evaluated on each status
        change, which the map CAN express. ⚠️ Surface the waiting state in the UI — a pending
        apply that looks like nothing happened is the write-only problem again.  <!-- status: done -->
  - [x] P4.5 **Wire the respawn** through the pane's existing `relaunch()` path with P1's
        `OpenIntent::TurnRespawn` — the same single nonce-bump path Recycle and `cc-relaunch`
        already use. ⚠️ Do NOT re-implement kill+respawn, and ⚠️ do NOT route through
        `recycleSession` — that is the session-boundary instrument and injects
        `/session-handoff` + `/session-restore`.  <!-- status: done -->
  - [x] P4.6 ⚠️ `XtermPane`'s `hasFiredRef` latch governs consume-once for the inject arm; a
        relaunch clears `hasSpawnedRef` but must NOT re-type a slash command. Confirm the apply
        respawn injects **nothing** — the M12 defect where a relaunch re-fired `/session-restore`
        against a `.session.md` the first fire had deleted is the shape to avoid.  <!-- status: done -->
  - [x] P4.7 **Cancel/dismiss ergonomics:** Escape cancels, the dialog takes focus on open, and
        focus returns to the readout on close. Follows the picker cell's keyboard discipline —
        a control reachable only by mouse is half-built.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — 8/8 outcomes PASS (2 CLI by subagent, 6 browser/live by orchestrator via the bridge) -->
  - [x] verify-human  <!-- status: done — operator tested all five from their OWN dev app: "tested. all good" -->
    - [x] P4.verify-human.1 --continue resumes the real conversation  <!-- status: done — operator-launched build, transcripts on; the one check no agent can make -->
    - [x] P4.verify-human.2 queued apply on a busy agent  <!-- status: done -->
    - [x] P4.verify-human.3 the None value  <!-- status: done -->
    - [x] P4.verify-human.4 click-to-edit-then-confirm gesture  <!-- status: done — "the UI UX works as expected now" -->
    - [x] P4.verify-human.5 the stale marker earns its place  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — closed a REAL Cancel-persists gap; +4 tests -->

- [x] Phase 5: Live end-to-end verification  <!-- status: done -->

  **Relevance check (before Phase 5):**
  - Requester still needs this: **yes** — the exit verify is what lets the feature ship.
  - Requirements unchanged: **yes** — AC-11 stands.
  - Solution still feasible: **yes** — the dev app, hook socket and bridge are all proven paths.
  - No superior alternative discovered: **yes**, with one scope reduction: ⚠️ **P5.3 is ALREADY
    DISCHARGED.** Its content is *"hand the `--continue` runtime question to verify-human"*, and
    the operator answered it at Phase 4 verify-human from their **own** build ("tested. all good"),
    which is the only environment that can answer it. Re-asking would re-litigate settled work.
  **Verdict:** proceed, with P5.3 closed by reference rather than re-run.
  **Observable outcomes:**
  - CLI: **the liveness proof** — after an apply-now respawn, the running session's next turn
    receives `additionalContext` naming the NEW mode. ⚠️ Verified by reading the **hook's
    emitted line**, NOT by reading `projects.json` back (AC-11). Capture via the dev hook
    socket or the transcript; a `projects.json` read proves persistence, not delivery.
  - Browser: full cross-surface round trip on a live app — workspace → picker and picker →
    workspace, both directions, no reload.
  - Browser: gate OFF collapses every surface this feature added; gate ON restores them.
  - CLI: `pnpm verify:auto` exits 0; Rust + frontend test counts both **increased** from the
    WP3 close baseline (Rust 879 / frontend 2230).
  - [x] P5.1 Live verify-self against a real workspace in the dev app. ⚠️ Use the scratch
        workspaces (`tmp/scratch/scratch-{a,b,c}`) — mandatory once a check spawns or answers a
        CC session. ⚠️ Never target a `target/debug/claudesk` you did not launch, and scope
        teardown by PID — never a blanket `pkill`
        (`[[verify-self-dev-vs-prod-process-name-collision]]`).  <!-- status: done -->
  - [x] P5.2 ⚠️ **A socket-injected turn-start proves the WIRE but is NOT an operator-typed
        turn** (xterm ignores synthetic keystrokes). If the liveness proof uses a synthetic
        `UserPromptSubmit`, say so explicitly — do not describe it as "verified live" without
        the qualifier. The operator challenged exactly this after WP3's close, correctly.  <!-- status: done -->
  - [x] P5.3 ⚠️ **Hand the `--continue` runtime question to verify-human explicitly.**
        `SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED` is now
        load-bearing: this WP makes `--continue` fire **on operator demand** rather than only
        after a crash. ⚠️ **An agent structurally cannot verify it** — agent-launched sessions
        inherit `CLAUDE_CODE_CHILD_SESSION` and write no transcript, so an agent attempt yields
        a *meaningless* result, not a weak one (`[[agent-launched-app-cannot-verify-continue]]`).
        The agent proves the wiring; the operator confirms the conversation.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done — 4/4 PASS; adversarial evidence audit named one residual, now recorded -->
  - [x] verify-human  <!-- status: done — AUTO-SKIPPED per drive_mode=autopilot; no integration boundary (Phase 5 added no source), verify-self 4/4 -->
  - [x] verify-codify  <!-- status: done — NO new tests needed; both properties probed and already covered -->

## Current Node
- **Path:** Feature > finalize
- **Active scope:** none — shipped `efa7798`; review 0 CRITICAL / 4 MAJOR / 4 MINOR, all backlogged
- **Blocked:** none. ⚠️ Phase 3's `verify-human` stays OPEN by design: its three leaves are
  re-testable only once Phase 4's interaction model exists, so they are re-presented at Phase 4's
  verify-human rather than re-run against a model the operator already rejected.
- **Unvisited:** none — all phases complete
- **Open discoveries:** 3 (the integration-boundary finding is the blocking one)

## Open Questions

- [ ] **None blocking.** The three consequential unknowns were resolved above; the residual
      items are layout/copy calls that are cheap to reverse and are settled at plan time by
      measuring the live DOM.

## Phase 1 verify-self evidence (P1.5, live — 2026-08-25)

Driven against the **dev** build (`com.claudesk.app.dev`, PID 7904) launched by the agent, using
the scratch workspaces. Boot smoke-test first (`#root` had 1 child, 808 chars of text) — per
M13.5 WP3, no live observation is trustworthy on a phase until the app is proven to have mounted.

| Outcome | Result | Evidence |
|---|---|---|
| `cc_spawn` still spawns CC through the restructured `match` | **PASS** | PID 9177, child of 7904 |
| `Fire` door still resumes | **PASS** | `claude --permission-mode bypassPermissions --continue` |
| `NoFire` (`⊘`) door still does NOT resume | **PASS** | PID 10333: `claude --permission-mode bypassPermissions` — no `--continue` |
| `NoFire` leaves the unclean flag intact | **PASS** | `scratch-b` still `true`; row still announces `↻ continue` after the open |

⚠️ **Instrument correction worth keeping.** The first attempt counted `--continue` occurrences
machine-wide (`ps | grep -c`) and returned **6** — those were the *operator's own* CC sessions
(PIDs 1958/2088, parent 951), not the spawn under test. Scoping by parent PID (`awk '$2==7904'`)
is what made the reading about this app. A machine-global count would have "passed" no matter what
the code did.

⚠️ **The unclean flag is NOT the observable for the Fire door.** `session-state.json` read `true`
for `scratch-a` both before and after — because consume clears it and `should_set_unclean_flag`
immediately re-sets it for the now-live session (the documented post-Recycle trap, in reverse).
The honest reads are the **argv** (`--continue` present) and, for the no-fire case, the
**surviving announcement**.

⚠️ **NOT verified, and structurally not verifiable by an agent:** *which conversation*
`--continue` resumed. An agent-launched Claudesk spawns CC sessions that inherit
`CLAUDE_CODE_CHILD_SESSION` and write no transcript
(`[[agent-launched-app-cannot-verify-continue]]`), so an agent attempt yields a meaningless
result. Carried to verify-human, and it is the same residual as
`SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED`.

Teardown was PID-scoped (`kill 7904`), never a blanket `pkill` — the operator's own `claude`
sessions were confirmed alive afterwards.

## Phase 1 verify-self result (subagent + orchestrator re-verify — 2026-08-25)

**6/6 Observable Outcomes PASS.** Subagent returned 4 PASS / 2 FAIL(BLOCKING); both FAILs were
explicitly *"could not observe — no verdict either way"*, and the orchestrator re-verified them
directly per the skill's Playwright-unavailable fallback.

| # | Outcome | Verdict | Verified by |
|---|---|---|---|
| 1 | `resolve_cc_spawn_env` returns the mode, all 4 degraded inputs | PASS | subagent (mutation-proved) |
| 2 | `TurnRespawn` resumes without consuming the flag | PASS | subagent (mutation-proved) |
| 3 | `Fire`/`NoFire` unchanged (additive) | PASS | subagent |
| 4 | drive-mode wire vocabulary untouched | PASS | subagent |
| 5 | `cc_spawn` still spawns through the restructured match | PASS | **orchestrator** — PID 55903, child of 43310 |
| 6 | `Fire` resumes / `NoFire` does not | PASS | **orchestrator** — see table below |

Both doors, same app instance, same moment:

| PID | argv | Door |
|---|---|---|
| 55903 | `claude --permission-mode bypassPermissions --continue` | Fire (row) |
| 56234 | `claude --permission-mode bypassPermissions` | NoFire (`⊘`) |

`scratch-b` flag stayed `true` and its row still announced `↻ continue` after the no-fire open —
the signal was left exactly as found.

⚠️ **Why the subagent could not observe 5 and 6 — a REUSABLE constraint, not a one-off.** The
`mcp__tauri__*` bridge reaches the orchestrator only, never a spawned subagent
(`[[mcp-bridge-tools-not-exposed-to-subagents]]`). The subagent fell back to the bare Vite page at
:1420, where `__TAURI_INTERNALS__` is undefined and the project list fails to load, so no picker
row is clickable. ⚠️ It correctly marked these **BLOCKING rather than skipped** — an unobserved
outcome is not a passed one — and that is the right call to preserve.

⚠️ **The subagent's mutation probes RESTARTED the app mid-run.** Touching `mod.rs` triggered the
dev harness to rebuild: briefed PID 20067 exited and was replaced by 43310. The subagent detected
this, re-scoped to 43310, and killed nothing. Worth knowing for any future verify-self that both
mutates source and observes a running dev app — the two activities conflict.

⚠️ **The subagent self-disclosed an invalid probe that nearly became a false FAIL** — it first
filtered to `cc_spawn_env_sets_the_drive_mode_var_only_when_gate_on_and_mode_set` while the
degraded-input matrix actually lives in `the_resolved_cc_env_honors_the_gate_end_to_end`, so a
gate-bypass mutant appeared to survive. Re-run against the correct test, the mutant is caught with
the exact `[gate off, mode set]` label. Textbook `[[invalid-probe-and-real-hole-look-identical]]`.

⚠️ **STILL NOT VERIFIED, and structurally unverifiable by an agent:** which *conversation*
`--continue` resumes. Both the subagent and the orchestrator can prove `--continue` reaches argv
and the correct arm was selected; neither can prove the resumed conversation's identity
(`[[agent-launched-app-cannot-verify-continue]]`). **Carried to verify-human** — same residual as
`SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED`.

Boot smoke-test passed on both app instances before any observation was trusted. Teardown was
PID-scoped; the operator's own `claude` sessions (parent 951) were confirmed alive afterwards.

## Phase 1 verify-human — ACCEPTED (operator, 2026-08-25)

Both leaves accepted on the operator's **standing dogfooding evidence** rather than a fresh run:
*"no need to verify this. It's always been exhibiting the right behavior."* The operator resumes
projects through this door daily across 20+ rotating projects, which is a larger sample than a
one-shot check would produce.

⚠️ **This is the operator's own call on their own observation — NOT an agent-side waiver.** The
agent cannot verify which conversation `--continue` resumes at all
(`[[agent-launched-app-cannot-verify-continue]]`), so there was nothing for the agent to skip;
the human is the only instrument, and the human reported the result.

**This resolves the runtime half of `SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED`**
— the exact disposition that item asked for (*"a one-minute check from an operator-launched
build… fold into the next `/release` gate"*), satisfied by accumulated daily use. The wiring half
was already proven by 4 standing tests. ⚠️ Handle at close per delete-on-resolve: CHANGELOG line
first, then delete the entry.

## Test Triage — `the_intent_gate_is_evaluated_before_the_consume`

Classification: Obsolete test — the new code intentionally supersedes what the test checked
Confidence: high
Evidence: The guard greps `SessionRegistry::spawn`'s body for `should_consume_for_resume(`
  appearing before `consume_and_persist(` (`mod.rs`, "Source-position guard"). Verify-codify
  extracted that whole decision into `resolve_resume_arm`, so neither identifier remains in
  `spawn`'s body and the guard's `.expect("the argv arm must be gated on the open intent")`
  fires on the RESTORED, CORRECT code — not on a regression.
Action: Rewrite it to assert the property as a VALUE against `resolve_resume_arm` rather than as
  a source position. ⚠️ The property it protected is real and must NOT be dropped: the `⊘` door
  must not reach the consume at all. That is now asserted directly (and more strongly) by
  `the_spawn_path_composes_the_two_predicates_correctly`, which observes WHETHER `consume` was
  called — something the source-position grep could only approximate. The guard's own comment
  said it settled for source-position "because the alternative is spawning a real `claude`";
  the extraction removed that constraint, so the better assertion is now available.

## Phase 1 verify-codify — a REAL gap found and closed (2026-08-25)

⚠️ **Codify was not a formality here: a mutant that broke the feature passed ALL 862 TESTS.**
Deleting the `TurnRespawn` arm from `SessionRegistry::spawn`'s resume `match` — so a turn-level
respawn fell through to the consume path and resolved `Fresh`, silently losing the conversation
AND spending the unclean flag — left the suite entirely green. Both predicates
(`authorizes_resume`, `should_consume_for_resume`) were mutation-proven at build time; the
**caller composing them** was not. That is `arch.md`'s most-repeated defect shape verbatim.

**Fix (the documented structural one, not more assertions):** extracted the decision to
`resolve_resume_arm(intent, consume)`, taking the consume as a **closure** so a test can observe
*whether it was called* — the property a return-value assertion cannot express. A `TurnRespawn`
that resumed correctly but also spent the flag would otherwise be invisible.

- **New:** `the_spawn_path_composes_the_two_predicates_correctly` — the full 5-case matrix
  (intent × consume-result → arm × was-consume-called). Re-running the original mutant against it
  now FAILS on the `consume()` assertion specifically.
- **Rewritten:** `the_intent_gate_is_evaluated_before_the_consume` →
  `the_no_fire_door_never_reaches_the_consume_at_all`. Triaged as **obsolete** (see
  `## Test Triage`) — it grepped `spawn`'s body for a source ORDER that the extraction removed, so
  it failed against correct code. Its property is unchanged and now asserted as a **value**;
  mutation-proven by making `consume()` run before the authorization check.

Gate after codify: `pnpm verify:auto` **exit 0**, Rust **883** (+1 net), frontend **2230**, zero warnings.

## Test Triage — `ships no getter — the cell seeds from the list_projects wire instead`

Classification: Obsolete test — the new feature intentionally supersedes what the test checked
Confidence: high
Evidence: The guard asserts `driveModeIpc.ts` contains no `getProjectDefaultDriveMode` and no
  `project_get_default_drive_mode` **anywhere**. Its own comment states the property it is
  protecting: *"A **per-row** getter would recreate the N+1 that M11.5's repair (B) removed: one
  whole-file read + parse + sort per row, re-fired for all N whenever the filter box clears."*
  That is a statement about the **picker**. P2.1 added the symbol for the **workspace** surface,
  and the picker still seeds from the `list_projects` wire — verified, not assumed:
  `grep -rn getProjectDefaultDriveMode src/components/picker/` returns nothing, and the only
  callers are `Workspace.tsx:53` (import) and `:178` (one gated, visible-only read per open
  workspace).
Action: Narrow the guard to assert what it actually protects — that the **picker** does not call
  a per-row getter — instead of the symbol's global absence. ⚠️ The N+1 property is real and must
  NOT be dropped; it is being asserted more precisely, against the picker's own source. Rewriting
  it this way also makes it catch a regression the old form could not: the old guard would pass
  if someone added the call to `ProjectModelCell.tsx` while importing it from elsewhere.

## Phase 2 verify-self — orchestrator live findings (2026-08-25)

Boot smoke-test first: `#root` had 1 child, 808 chars. App mounted, so the observations below
are against a live runtime (the M13.5 WP3 stale-bundle guard).

**Outcome 1 (gate ON, readout renders) — PASS.** Opened `scratch-a` (stored mode `autopilot`).
`[data-testid="workspace-header-drivemode"]` renders `⇅ autopilot`, is contained by
`[data-testid="workspace-header"]`, title `Drive mode: autopilot.`, not stale. Wire string
verbatim — no display alias.

**P1's retained mode is live over IPC** (this is what makes the readout's `running` half real
rather than an echo of `stored`):

| call | result |
|---|---|
| `cc_drive_mode("cc-1")` | `"autopilot"` |
| `cc_drive_mode("cc-99")` | `Err: no such session: cc-99` |
| `project_get_default_drive_mode(scratch-a)` | `"autopilot"` |

⚠️ The unknown-id **error** (rather than `null`) is the designed distinction — it is what stops a
dead workspace rendering a confident readout.

### ⚠️ DEFECT FOUND — the readout does not re-read while the workspace stays open

Wrote `stored = fsd` via IPC while the session ran on `autopilot`. Backend was correct
(`stored: "fsd"`, `run-cc1: "autopilot"`), and the **picker cell updated to `fsd`** — but the
workspace readout still showed `⇅ autopilot` with **no stale marker**.

**Cause (diagnosed, not guessed):** the effect re-reads on a `visible` edge, and there was none.
Only ONE workspace was mounted, so navigating to the picker and reopening `scratch-a` hit the
**reopen-dedup** — it FOCUSED the existing workspace rather than minting a new one, and `visible`
never went false→true. The stale value is therefore reachable any time the mode changes while the
workspace is already open, which is the common case.

⚠️ **This is Phase 3's work, not a Phase 2 regression.** P3.1/P3.2 are exactly this fix, and
Phase 3's Observable Outcome already names the direction verbatim: *"changing it on the picker
row updates an open workspace's readout."* Phase 2's own outcomes claim only that the readout
renders and collapses with the gate. Recorded here so Phase 3 has the reproduction rather than
rediscovering it — and so the **refresh-on-reveal comment in `Workspace.tsx` is not left standing
as if it were sufficient**; it is not.

**Fixture left dirty on purpose:** `scratch-a`'s stored mode is now `fsd` while its live session
runs `autopilot` — a ready-made stale case for Phase 3 to verify against. Reset with
`project_set_default_drive_mode(path, "autopilot")` if a clean fixture is wanted.

### Outcome 2 (gate OFF) — PASS, with the positive control that makes it mean something

Toggled the gate via `workflow_set_features_enabled(false)` — an actual toggle, not a prop read.

| element | gate OFF | gate ON (restored) |
|---|---|---|
| `workspace-header` (positive control) | **PRESENT** (`scratch-a`) | PRESENT |
| `workspace-header-drivemode` | **ABSENT** | `⇅ fsd ⚠` |
| `workspace-skill-row` | ABSENT | PRESENT |
| `workspace-header-nextopen` | ABSENT | — |
| turn-nav / split control (UNGATED) | **PRESENT** | PRESENT |

⚠️ **The positive control is what makes this decisive.** The subagent explicitly declined to call
this outcome a pass from a bare `querySelector → null`, because in its backend-less page the null
was caused by *no workspace existing at all* — a false green of the "assertion says X, measures Y"
shape. Here the header itself is still present while the readout is gone, so the absence is
attributable to the gate. The ungated siblings surviving proves the gate is scoped PER ARM, not a
blanket wipe.

### P2.3 (stale marking) — PASS, and it is the refresh TRIGGER that is missing, not the logic

The gate off→on cycle forced the re-read the reopen-dedup had not, and the readout came back
correctly stale:

- text `⇅ fsd ⚠`, class `workspace-header-drivemode is-stale`
- colour `rgb(163, 113, 247)` (purple), background `rgba(163, 113, 247, 0.14)`
- ⚠️ **NOT the alarm-blue `rgb(110, 168, 255)`** — asserted explicitly, since borrowing the
  AwaitingInput hue is the failure `[[semantic-distance-not-just-visual-distance-for-status-colour]]`
  exists to prevent
- title: *"Drive mode: fsd — takes effect on the next session. This session is running as
  autopilot."* — names BOTH values, so the readout self-explains on hover

So the derivation, the styling and the gate collapse are all correct; the defect above is narrowly
that nothing re-reads while a workspace stays open. Phase 3's broadcast is the fix.

## Phase 2 verify-human — 2 PASS, 1 REJECTED and fixed (operator, 2026-08-25)

**vh.1 (readout earns its header slot) — PASS.** `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]`
resolved toward "yes, in the existing header" and the operator confirmed on sight.

**vh.3 (narrow-window layout) — PASS.** Name ellipsizes; the readout does not shrink or wrap.

### ⚠️ vh.2 (stale tooltip) — REJECTED AS AGAINST-SPEC. The copy described the rejected design.

Shipped text: *"Drive mode: fsd — **takes effect on the next session**. This session is running
as autopilot."* Operator: *"that's wrong! against my spec! The whole point of the pause-the-turn
like thing we were probing is to immediately apply the new mode to the current session when it
returns control by immediately do an /exit, change env, relaunch with --continue."*

**They are right, and it is a spec violation rather than a wording nit.** "Next session" is
**Recycle's** semantics — the session-boundary instrument WP4 explicitly rejected (handoff → kill
→ restore from *notes*). The whole feature exists because a mode change should apply to the
session you are IN, via the turn-level respawn P1 already built (`OpenIntent::TurnRespawn`,
`--continue`, conversation preserved). So Phase 1 built the right primitive and Phase 2 shipped
copy telling the operator it does not exist. AC-5 says it outright: *"When stale, the readout
offers the AC-2 respawn."*

**Fixed:** *"Drive mode: fsd. This session is still running as autopilot — apply it to restart
Claude Code here and keep this conversation."* Verified live on the running dev app.

**Guarded, because a copy rule with no test decays and this one already slipped once:**
`the stale tooltip points at APPLYING here, never at a future session` asserts (a) both modes are
named, (b) none of `next session` / `next spawn` / `next time` / `will use` / `on reopen` appears,
(c) the action word is present. ⚠️ Mutation-proven by restoring the exact rejected sentence — the
guard fires with the full rationale in its message. It reads the RETURNED VALUE, not source text,
so the module's own comment documenting the rejected phrasing cannot satisfy it
(`[[raw-guard-identifier-satisfied-by-own-comments]]`).

⚠️ **Scope check before fixing:** grepped every "next session/spawn" claim on this surface. Only
the tooltip was user-facing; the remaining hits are internal comments describing `stored`'s
storage semantics, which are accurate — a stored value genuinely is what the next spawn reads.
The defect was presenting that as the operator's ONLY option.

Gate after fix: `pnpm verify:auto` exit 0 · Rust 883 · frontend **2239** (+1).

## Phase 2 verify-codify — a REAL caller-side gap found and closed (2026-08-25)

⚠️ **A gate bypass passed all 2239 tests.** The derivation was mutation-proven twice over (its
own unit tests AND the OFF-invariant guard's arm 6) — but both prove the DERIVATION, and neither
could see the **render site** stop honoring it. Same defect shape as Phase 1's, one layer up:
*"a mechanism correct in itself sitting behind a caller that does not honor it."* It is also what
the integration-boundary rule demands of this phase — a test against the CONSUMING SURFACE
(`Workspace.tsx`), not only the new module.

**Closed by `workspaceDriveModeRender.test.tsx`** — 3 tests using `renderToStaticMarkup` + jsdom,
following `projectModelCellRender.test.tsx`'s precedent. ⚠️ **No new dependency**: the repo's
standing `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` note is half-true, and that
precedent's header already says acting on the half-truth costs real coverage.

⚠️ **THE METHOD LESSON, and it nearly produced a false result.** The first mutant was crude — a
`||` fallback that left the JSX dereferencing a null, so the component **threw** and all three
tests failed *including the positive control*. Three red tests looked like strong coverage and
were actually a crash proving nothing. Re-run with CLEAN, non-crashing mutants on both routes:

| bypass route | result |
|---|---|
| derivation ignores `gateEnabled` | 1 failed, **2 passed** |
| render site reads through `?.` with a fallback | 1 failed, **2 passed** |

Exactly one failure each, with the positive control PASSING — that is what makes the failure
attributable to the gate rather than to nothing having rendered
(`[[verify-the-mutation-landed]]`). Both routes now covered.

⚠️ Only the gate-OFF shape is reachable under server rendering (the gate hook returns its
restrictive pre-seed default) — deliberately exploited, since gate-OFF is the shape the mutant
broke and the invariant that matters most. Gate-ON, the stale marker and the tooltip were
verified LIVE and are recorded above; this file does not replace that evidence.

Gate after codify: `pnpm verify:auto` exit 0 · Rust **883** · frontend **2242** (+3, 173 files).

## Phase 3 build — live confirmation, including the Phase 2 defect (2026-08-25)

Boot smoke-test first (`#root` has children). Driven on the dev app after its Rust rebuild.

**P3.3 — the selector's option set is exactly `["", ...DRIVE_MODES]`:**
`["", "stepping", "orchestrated", "autopilot", "fsd"]`, labels `["None (skills will ask)", …]`,
auto-focused, seeded to the current value. No second vocabulary.

**P3.4 — the readout is a real control:** `role="button"`, `tabindex="0"`,
`aria-label="Workflow drive mode for scratch-a: fsd. Click to change."`

**Cross-surface sync — BOTH directions, no reload:**

| direction | result |
|---|---|
| workspace → picker | selector set `stepping`; picker cell went `fsd` → `stepping` |
| picker → workspace | picker set `orchestrated`; **workspace readout updated with NO revisit** |
| persistence | `projects.json` on disk: `"default_drive_mode": "stepping"` (written from the workspace) |

⚠️ **THE PHASE 2 DEFECT IS FIXED, and verified under the exact condition that broke it.** The
picker→workspace read was taken while the workspace stayed **mounted behind the picker** — no
`visible` edge could fire, which is precisely what the reopen-dedup produces and what left the
readout stale before. It updated to `⇅ orchestrated ⚠` anyway, via the broadcast.

⚠️ **The path check is doing real work, not decoration.** Same run: `scratch-b` and `scratch-c`
both stayed `Drive Mode: None` while `scratch-a` changed. A bare-mode payload (the permission
mode's shape) would have rewritten all three.

The corrected tooltip is live end-to-end: *"Drive mode: orchestrated. This session is still
running as fsd — apply it to restart Claude Code here and keep this conversation."*

**Two stale comments corrected as part of P3.2** (both would have made a module lie about itself):
- `driveModeIpc.ts`'s "No broadcast event" block — it NAMED this exact condition for adding one
  ("if a genuinely second surface ever appears (a workspace-header readout…)"), so the reversal
  is the extension that comment specified.
- `ProjectPicker.tsx`'s claim that there is "deliberately no `project_get_default_drive_mode`
  command to fall back on" — that command now exists for the workspace; the rule it protected
  (never per-row in the picker) is unchanged and still guarded.

## Phase 3 verify-self — orchestrator browser findings (2026-08-25)

**Outcome 1 (selector options) — PASS.** Clicking the readout reveals a `<select>` with exactly
`["", "stepping", "orchestrated", "autopilot", "fsd"]` — five entries, wire strings verbatim,
auto-focused. No second vocabulary.

**Outcome 2 (cross-surface sync, both directions) — PASS.** Recorded in `## Phase 3 build` above:
workspace→picker (`fsd`→`stepping`, no reload) and picker→workspace (updated with **no revisit**,
the mounted-but-not-revisited condition that broke it in Phase 2). Path check confirmed by
`scratch-b`/`scratch-c` staying `None` in the same run.

**Outcome 4 (the click does not leak) — PASS, and the crowding is real.**

| check | result |
|---|---|
| `elementFromPoint` at the readout's centre | resolves to `workspace-header-drivemode` **itself** |
| sibling testids in that header | **17** — the crowding M12's picker-cell defect came from |
| still in the workspace after click | yes (`scratch-a`) — did NOT reopen the project |
| terminal stole focus | no |
| select appeared + focused | yes |

⚠️ **INSTRUMENT NOTE — a same-tick read reported `selectAppeared: false`, which is a FALSE FAIL.**
Reading the DOM in the same tick as a synthetic click reports the PREVIOUS render
(`[[react-state-read-needs-a-deferred-frame]]`). Deferring a frame showed the select present and
focused. Anyone re-running this check must defer, or they will "discover" a broken handler that
works.

### Phase 3 verify-self — CLI half (subagent) + final tally

| # | Outcome | Verdict | By |
|---|---|---|---|
| 1 | selector options `["", ...DRIVE_MODES]` | PASS | orchestrator |
| 2 | cross-surface sync, both directions | PASS | orchestrator |
| 3 | `projects.json` persistence | PASS | subagent |
| 4 | click does not leak | PASS | orchestrator |
| 5 | `pnpm verify:auto` exit 0 | PASS | subagent |

Subagent CLI detail: gate exit 0 captured via `$?` on a dedicated run (its first attempt lost
`PIPESTATUS` through the `&&` chain — it re-ran rather than infer, which is the right call).
Frontend **2243 / 173 files**, Rust **883** (863 lib + 19 hook + 1 shell-history), 0 failed.
`scratch-a` holds `"default_drive_mode": "orchestrated"` — read by `project_path`, not a naive
`grep path`. ⚠️ It flagged honestly that persistence proves only that the value reached disk, not
WHICH surface wrote it; the sync half is discharged by the orchestrator's live run above.

⚠️ **A SECOND, INDEPENDENT REASON THESE OUTCOMES NEED THE BRIDGE — worth keeping for future
phases.** The subagent found that `workflow_get_features_enabled` also fails in the backend-less
page. Since the readout is gated and returns `null` when off, the control would be **absent by
design** there even if the IPC worked — so an empty-DOM reading at :1420 could never distinguish
*"gate off"* from *"feature broken."* A future verify-self must not treat a bare `querySelector`
null on that page as evidence about a gated surface, in either direction.

## Phase 3 verify-human — INTERACTION MODEL REJECTED (operator, 2026-08-25)

Operator: *"you still have the wrong ux spec. When I click the selector and change the drive mode
it should show a confirmation popup asking if I want to apply the change now (or immediately after
this turn finishes) or just cancel the change. If I click cancel, nothing changes. If I click
apply, and the agent is idle, Claudesk drive the /exit, change env, relaunch with --continue. If
agent is not idle wait until it becomes idle and drive the sequence immediately."*

**What was built:** change the mode → stored silently → a `⚠` stale marker → Phase 4 would add a
separate apply affordance to find and click.

**What is specified:** changing the mode IS the intent to apply. Confirm on change; Apply drives
the sequence itself, idle-gated; Cancel is a true no-op (the stored value does not change either).

### ⚠️ ROOT CAUSE — a §Assumed default that got promoted to "operator-reviewed"

The original AC-5 came from an assumption **I wrote at spec time and never got confirmed**:
*"Apply-now is a distinct affordance… a `<select>` that silently kills and respawns CC is too much
consequence behind a dropdown."* It was listed under §Assumed — correctly, at first — and then
**cited in task P4.3 as "(operator-reviewed assumption, spec §Assumed)"**, which it was not. An
unchallenged assumption is not an approved one. That mislabel is how a silent default hardened
into a spec line and survived three phases.

⚠️ **The concern was RIGHT; the resolution was WRONG.** "Too much consequence behind a dropdown"
is a real objection — and a confirm dialog answers it directly (the consequence is surfaced and
acknowledged) without splitting one intent across two gestures the operator must discover and
connect.

### Feasibility — checked before accepting, both facts hold

- **The idle signal exists and already reaches the workspace.** `WireWorkspaceState` is
  `idle | running | awaiting_input | background_work | unknown`, delivered to `Workspace` as the
  `statusState` prop from the hook channel — so "wait until idle" needs **no PTY scraping**
  (`CLAUDE.md`'s standing prohibition is not in play).
- ⚠️ **`stateFor` is a COLLAPSED MAP, not an event stream**
  (`[[workspace-status-map-collapses-consecutive-events]]`, whose failure mode is *a feature that
  silently never fires*). That is **not** a blocker here, and the distinction matters for whoever
  builds it: this feature needs *"is it idle NOW"*, observed until true — **not** a specific
  `→ idle` transition event, which the map genuinely cannot express.

### What survives

Phase 3's selector is **not** rewritten. Its options (`["", ...DRIVE_MODES]`), cross-surface
broadcast (both directions, verified live under the mounted-not-revisited condition), hit region
(17 sibling testids, `elementFromPoint` resolves to the control), and StrictMode-safe commit all
stand. What changes is what happens **after** a value is chosen.

**Routing:** F12 back-loops to build, but the defect is at PLAN level — Phase 4's tasks P4.1/P4.3
encode the rejected model and P4.2/P4.4 remain correct. Re-planning Phase 4 is the honest move.

## Phase 4 build — the interaction model, and a design forced by the linter (2026-08-25)

**Built:** `applyDriveMode.ts` (pure: `readyToRespawn`, `waitForIdle`, the confirm copy),
`DriveModeConfirm.tsx` (dialog, shaped after `WorkflowInviteModal`), and the Workspace wiring.
Gate: exit 0 · Rust **883** · frontend **2254** (+11, 174 files).

### ⚠️ THE DESIGN LESSON — three rejected attempts, and the linter was right each time

I tried to sequence the apply as an **effect-driven state machine** (queue flag → intent latch →
relaunch → consume). eslint's `react-hooks` rules rejected three successive shapes:

1. `setState` synchronously in an effect → *cascading render*.
2. Reading `ref.current` during render to build the `openIntent` prop → *"Cannot access refs
   during render"* (the render output would not be reproducible from props+state).
3. Passing a ref into a `useCallback` that also mutates it → *"This value cannot be modified"*.

⚠️ **Three attempts is the signal to restructure, not to keep patching.** The rule was correct:
sequencing an imperative multi-step operation is not what effects are for. `recycleSession` — the
app's OTHER multi-step operation — already has the right shape: **one async function in an event
handler**. Rewritten that way, all three errors disappeared and the code got shorter.

### The race that shaped `RESPAWN_INTENT_HOLD_MS`

The spawn effect's deps are `spawnTriggerDeps({spawnNonce, projectPath, spawnCommand})` —
**`openIntent` is NOT among them**, so it is read from the closure at nonce-bump time. Clearing
the `turn-respawn` latch synchronously after `relaunch()` would let the spawn read the workspace's
ORIGINAL door; for a `fire` open that CONSUMES the unclean-exit flag and silently disables
auto-resume on the next real open. The latch is therefore held one settle beat past the bump.

### Two things deliberately NOT copied

- ⚠️ **`recycleSession`'s `idle || background_work` match.** `readyToRespawn` is `idle` ONLY.
  `background_work` means control returned *but a backgrounded job is still running* — respawning
  kills it. The two predicates answer different questions and that one's own comment says so.
- ⚠️ **`recycleSession` itself.** It is the session-boundary instrument (`/session-handoff` →
  restore from notes). The apply goes through the pane's plain `relaunch()` with `turn-respawn`,
  keeping the conversation.

## Phase 4 verify-self — 8/8 PASS (2026-08-25)

| # | Outcome | Verdict | By |
|---|---|---|---|
| 1 | different mode → confirm dialog | PASS | orchestrator |
| 2 | same mode → no dialog, no write | PASS | orchestrator |
| 3 | Cancel is a true no-op | PASS | orchestrator |
| 4 | Apply on idle → PID changed + mode persisted | PASS | orchestrator |
| 5 | no `.session.md`, nothing injected | PASS | orchestrator |
| 6 | unclean flag unchanged | PASS | orchestrator |
| 7 | `readyToRespawn` table, mutation-proven per state | PASS | subagent |
| 8 | `pnpm verify:auto` exit 0 | PASS | subagent |

### The apply, driven live

Drove a real `Stop` event into the dev hook socket (`background_task_count: 0`) to move the
workspace from `Unknown` → `Idle`, then applied `autopilot → stepping`:

| check | observed |
|---|---|
| CC child PID | **64433 → 79226** (process replaced, still `--continue`) |
| `projects.json` | `stepping` |
| `.session.md` | **absent** |
| unclean flag | **`True`, unchanged** |

⚠️ The last two are what separate this from **Recycle**: the conversation was kept (`--continue`
in the new PID's argv), no handoff document was written, and the reopen path's signal survived.

**Both dialog copy branches verified against REAL status**, not a forced prop:
- status `Unknown` → *"as soon as this turn finishes… Claude Code is busy"* (correct —
  `readyToRespawn("unknown")` is false; absence of data is not idleness)
- status `Idle` → *"to this session now? Claude Code restarts here and keeps this conversation."*

### ⚠️ AN INSTRUMENT ERROR THAT ALMOST BECAME A FALSE FAIL

The first Cancel check reported the `projects.json` md5 had CHANGED — apparently a Cancel that
wrote. It had not. **I took the baseline before opening the workspace**, so `record_open`'s
`last_opened_at` stamp landed between baseline and comparison. Re-baselined *after* the open and
re-ran: **byte-identical** (`d3d5d867…` both sides), mode unchanged.

⚠️ **A baseline must be taken after every unrelated write the interaction under test does not
own.** Reported as-is, this would have back-looped Phase 4 to fix nothing.

### The subagent's mutation work (outcome 7), and a false-green it caught in its own method

Each rejected state was mutation-proven **individually** — the predicate widened to admit that
state alone, with the mutated line read back via `sed` to confirm it landed in executable code.
Every mutant was killed by its own named assertion. `background_work` — the exact
`recycleSession` `idle || background_work` shape that would kill a live background job — killed
two assertions including the dedicated regression test. `idle → true` was additionally proven by
a positive control (`return false`).

⚠️ **The subagent flagged a false-green in its OWN verification method, which is worth keeping:**
`applyDriveMode.ts` is a NEW UNTRACKED file, so `git diff --stat` shows no change for it **by
construction** — the revert check I asked for would have reported clean even with a mutation left
in place. It verified against a pre-mutation copy (`diff` + sha1) instead. **A `git diff` revert
check is vacuous for untracked files.**

## Phase 4 verify-human — UI/UX ACCEPTED; the context loss is ENVIRONMENTAL (2026-08-25)

Operator: *"the UI UX works as expected now. But the CC session is missing the context after the
respawn."* Screenshot showed the respawned pane starting from `/exit` with no prior history.

### ⚠️ NOT A CODE DEFECT — the agent-launched app disables transcript saving

The respawned session's own banner names the cause:

> ⚠️ *Transcript saving is off — inherited `CLAUDE_CODE_CHILD_SESSION` marker · restart with
> `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1` to keep …*

Confirmed, not inferred:

| evidence | observation |
|---|---|
| the marker's origin | `CLAUDE_CODE_CHILD_SESSION=1` is in the **agent's own shell env**, inherited by the dev app the agent launched, and passed to every CC it spawns |
| argv | `claude --permission-mode bypassPermissions --continue` — the flag DOES reach the respawn (PID 81919) |
| transcripts | `~/.claude/projects/<scratch-a slug>/` holds 40 files, **newest Aug 25 15:30** — nothing from today's sessions |

`--continue` resumes from a **transcript**. Saving is off ⇒ no transcript is written ⇒ there is
nothing to resume ⇒ context starts at `/exit`. The mechanism is correct; the environment denies
it the input.

⚠️ **This is `[[agent-launched-app-cannot-verify-continue]]` reproduced from the other side.**
That memory says an agent-launched Claudesk *cannot verify* which conversation `--continue`
resumes. The sharper statement it now supports: **an agent-launched Claudesk cannot RESUME one at
all** — so a context-loss observation in that environment is uninformative about the code.

**P4.verify-human.1 is BLOCKED, not failed.** It must be re-tested from an
**operator-launched** build (`pnpm tauri:dev` typed by the operator, or the installed `.app`),
where the marker is absent and transcripts are written. That is the same tier
`SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED` already specifies, and
the same reason the operator's earlier standing-dogfooding answer was accepted for Phase 1.

⚠️ **A trap for whoever re-tests:** setting `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1` on the
AGENT-launched app would make transcripts appear and the test seem to pass — but it changes the
environment under test rather than reproducing the operator's. Re-test in the real environment;
do not paper over it with the override.

### ⚠️ Turn-0 defect — "Claude Code is busy" over an idle session (operator, 2026-08-25)

Operator, from their OWN dev app: *"It says CC is busy where it actually is not."* Then, decisive:
*"the bug is only present at turn 0. I tried it at turn 1+, it works well."*

**Cause — structural, not a typo.** `readyToRespawn` rejected `unknown`, and a freshly-spawned
workspace IS `unknown` until its first `UserPromptSubmit`. `SessionStart` is registered and
forwarded by the hook script, but `event_to_state` deliberately returns `None` for it —
`hook_install/mod.rs`: *"registering them does NOT flip any dot."* So no event maps to a state
until the operator types. ⚠️ **Turn 0 is the only window**, which is exactly the operator's
independent observation — and it is the most common moment to change a drive mode (right after
opening a project). The filmstrip dot in their screenshot was GREY (`unknown`), not blue.

**Fix — narrowed to this feature, deliberately.** `readyToRespawn(state, sessionLive)` now accepts
`unknown` **when a session is live** ("spawned, no turn yet" = sitting at a prompt) and still
rejects it with no session (genuinely unobserved — nothing to respawn).

⚠️ **NOT fixed by mapping `SessionStart → Idle` in the broadcaster.** That would flip the status
DOT for every workspace at spawn — a status-channel decision with a far wider blast radius than
this feature, contradicting a documented, deliberate exclusion. Narrowing the question to *"is
this workspace safe to respawn"* keeps the change local.

⚠️ **`sessionLive` threaded through `waitForIdle` TOO, not just the dialog.** Had only the dialog
learned it, `canApplyNow` would say "now" while the poll hung until timeout on the same session —
two predicates disagreeing, the "mechanism correct behind a caller that does not honor it" shape.
One predicate, two callers, same arguments.

**Guarded** by three tests: `unknown` + live → true (the regression), `unknown` + no session →
false, and ⚠️ **a live session must NOT make a busy state respawnable** — if the flag leaked past
the `unknown` case it would discard a turn in flight or kill a live background job.

Gate: `pnpm verify:auto` exit 0 · Rust **883** · frontend **2255** (+1).

### Phase 4 verify-human — ALL FIVE PASS (operator, 2026-08-25)

Operator re-tested from their **own** dev app after the turn-0 fix: *"tested. all good."*

| leaf | result |
|---|---|
| vh.1 `--continue` resumes the real conversation | **PASS** |
| vh.2 queued apply on a busy agent (busy → wait → auto-fire) | **PASS** |
| vh.3 the `None` value | **PASS** |
| vh.4 click-to-edit-then-confirm gesture | **PASS** (accepted earlier) |
| vh.5 the stale marker earns its place | **PASS** |

⚠️ **vh.1 is the load-bearing one, and only the operator could produce it.** An agent-launched
Claudesk inherits `CLAUDE_CODE_CHILD_SESSION`, which turns transcript saving OFF — so `--continue`
has nothing to resume and the agent observes context loss regardless of whether the code is
correct. From an operator-launched build the marker is absent, transcripts are written, and the
resume works. This is the environment distinction proven twice in this feature; do not re-derive
it, and do not "fix" it with `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1` on an agent-launched app
(that changes the environment under test rather than reproducing the operator's).

⚠️ **vh.5 also settles a design question rather than just a check.** The `⚠` stale marker was
designed when staleness was the RESTING state (the rejected model: store silently, mark stale,
apply later). Under the shipped model it is the EXCEPTION — a change that was made and not
applied (Cancel, a failed write, a queued apply that timed out). The operator kept it on that
basis; it is not vestigial.

**Phase 3's three deferred leaves are also discharged by this run** — vh.4 covers the gesture
(P3.vh.1), vh.2 covers the picker-side change reaching an open workspace (P3.vh.2), and vh.3
covers `None` (P3.vh.3). They were deferred precisely because they were only re-testable once
this interaction model existed.

## Phase 4 verify-codify — a REAL Cancel-persists gap, closed (2026-08-25)

⚠️ **A mutant that made CANCEL PERSIST passed all 2255 tests.** It wrote the new mode while
declining to respawn — the precise "looks live and is not" state AC-5 forbids, where disk and
readout claim a mode the running session is not obeying and the operator cannot see the
divergence. The handlers were inline `useCallback`s, so nothing could observe their write
behaviour.

**Fix (arch.md's documented structural one):** extracted `driveModeWriteFor(outcome)` so the
decision is a VALUE, and **funnelled BOTH outcomes through one `resolveDriveMode`** rather than
leaving two handlers that could diverge — *"funnel shared-state writes through ONE function and
guard THAT."* Mutation-proven: flipping `cancel` to `persist: true` fails 2 assertions while 13
still pass.

### ⚠️ THE CALLER-BYPASS MUTANT STILL PASSED — named, not papered over

A second probe made `resolveDriveMode` ignore the decision and persist regardless. **2258 tests
passed.** Same shape as Phase 1's and Phase 2's, one layer up. Server rendering reaches only the
gate-OFF shape, so the dialog never mounts in a test and no behavioural assertion is available
without a dependency this phase should not add.

Closed with a **narrow SOURCE guard** — legitimate here precisely because the mutant's shape is
STRUCTURAL (does the caller read the decision at all?) rather than behavioural, which `arch.md`
says a `?raw` guard cannot express. ⚠️ **It is a floor, not a proof**: it would still pass if
`persist` were used wrongly. The real proof is the operator's live verify-human run. Comments are
stripped so this file's own prose cannot satisfy it. Mutation-proven.

Gate: exit 0 · Rust **883** · frontend **2259** (+4).

### ⚠️ Phase 3's verify-codify — run here, and it found a gap too

Phase 3's `verify-codify` **never ran**: the F12 back-loop (rejected interaction model) diverted
straight to plan. Caught while closing Phase 4 rather than left silently skipped.

⚠️ **Dropping the broadcast subscriber's PATH CHECK passes 2259 tests.** The defect it admits is
silent cross-project corruption: `PROJECT_DRIVE_MODE_EVENT` is per-project (unlike the permission
mode's app-global bare enum), so an unfiltered subscriber makes ONE project's change rewrite EVERY
open workspace's readout.

Closed with a source guard, mutation-proven (1 fails, 4 pass). Same floor-not-proof caveat as the
caller guard above — the real evidence is the operator's live run, where `scratch-b`/`scratch-c`
stayed `None` while `scratch-a` changed.

**Both Phase 3 and Phase 4 now close.** Gate: exit 0 · Rust **883** · frontend **2260**.

## Phase 5 — the liveness proof, closed end-to-end (2026-08-25)

### ⚠️ AC-11 SATISFIED, and by the observable it demands

AC-11 forbids proving liveness from `projects.json` (that proves *persistence*, not *delivery*).
The chain below reads the **live process** and then the **hook's emitted line**:

| step | observation |
|---|---|
| before | spawned CC (PID 15510) env: `CLAUDESK_DRIVE_MODE=autopilot` |
| hook output under that env | *"Claudesk reports the drive mode for this workspace as autopilot."* |
| action | selector → `stepping` → confirm → **Apply** (agent idle; immediate branch) |
| after | CC **PID 15510 → 20861**; respawned env: `CLAUDESK_DRIVE_MODE=stepping` |
| hook output under THAT env | *"Claudesk reports the drive mode for this workspace as **stepping**."* |

⚠️ **The mode fed to the hook was read FROM THE RESPAWNED PROCESS**, not from disk — so this is
delivery, not persistence. The hook invoked is the **deployed** `claudesk-hook-dev.pl`, the same
script CC runs. This is the property WP4 exists for: a mid-session change now reaches the running
session's environment, which was impossible before.

⚠️ **THE RESIDUAL, NAMED (surfaced by the Phase 5 audit — the orchestrator's own write had left it
implicit).** The hook above was invoked by the **verifier**, not by CC. So *"CC's next turn
receives it"* rests on **one env-inheritance hop** that this capture does not itself observe. It is
closed by code plus a standing test, not by the live run:

- `cc_session/mod.rs:584-593` — **no `env_clear` anywhere in this crate**, so the var reaches CC's
  entire descendant chain, including the hook CC execs.
- `tests::the_spawn_env_feeds_a_value_the_real_hook_accepts` (`mod.rs:1878`) — drives the **real**
  spawn-env composition through the **real** shipped script, asserting BOTH directions (gate ON
  emits; gate OFF is byte-empty).

⚠️ Also confirmed structurally by the audit: `projects.json` is **not on the hook's read path at
all** (`claudesk-hook.pl:120` reads only `$ENV{CLAUDESK_DRIVE_MODE}`, with its own comment *"there
is no settings read here"*), so AC-11's prohibition is satisfied **structurally**, not merely
procedurally avoided. And the PID delta alone would be weak evidence — the load-bearing observation
is the **env delta read from the NEW pid**, not the pid change.

### P5.2 — the synthetic-turn qualifier, honestly applied

⚠️ The `Stop` event used to drive the workspace to `Idle` was **injected into the dev hook
socket**, not produced by an operator-typed turn (xterm ignores synthetic keystrokes). Stated
plainly per P5.2. It does not weaken the proof above: the env read and the hook output are
*independent of how idleness was reached*, and the operator separately confirmed the whole
interaction from their own build at Phase 4 verify-human.

### P5.3 — already discharged, closed by reference

Its content is *"hand the `--continue` runtime question to verify-human."* The operator answered
it from their **own** build ("tested. all good") — the only environment that can, since an
agent-launched app inherits `CLAUDE_CODE_CHILD_SESSION` and writes no transcript. Re-running it
would re-litigate settled work.

### Round trip + gate collapse

- workspace → picker: apply `stepping`, picker row reads `stepping`
- picker → workspace: set `orchestrated`, workspace updates **with no revisit** (mounted behind
  the picker — the exact condition that failed in Phase 2), tooltip *"still running as stepping"*,
  which **matches the live process env** read directly
- gate OFF: readout / skill row / next-open all ABSENT while the **header survives** (the positive
  control) and ungated turn-nav stays; gate ON restores all three

### ⚠️ A TRANSIENT `EXIT 101` — flaky, not a defect

The first gate run after teardown exited **101** with the frontend green and no named Rust
failure. An isolated `cargo test` immediately after passed **883/0**, and two further full runs
exited **0**. Classified **flaky** per §3b (same input, different result) — almost certainly
cargo contending on the `target/` lock with the just-killed dev app, the exclusive-resource hazard
`CLAUDE.md` names. ⚠️ **Recorded rather than silently re-run**: a green retry that hides an exit
code is how a real intermittent failure gets normalized. **Confirmed at Phase 5 verify-auto: three
further consecutive full-gate runs all exit 0** (883 / 2260 each time), which meets §3b's flaky
bar — re-run, never modify code or tests to make a flake disappear.

**Final gate: exit 0 · Rust 883 (WP3 baseline 879, +4) · frontend 2260 (baseline 2230, +30).**
Both counts increased, as the outcome required.

Teardown PID-scoped (`kill 11724`); ports free; the operator's 5 `claude` sessions untouched.

### Phase 5 verify-self — 4/4 PASS via an adversarial EVIDENCE AUDIT (2026-08-25)

⚠️ **The subagent was pointed at auditing the recorded evidence rather than re-driving outcomes it
structurally cannot reach** (no bridge; the app was already torn down). Its brief was explicit: a
clean audit that rubber-stamps weak evidence is worse than a finding. It ran the one outcome it
genuinely owns — the gate — and challenged the other three.

| # | Outcome | Verdict |
|---|---|---|
| 1 | liveness proof (AC-11) | PASS — **with a residual it named**, now recorded above |
| 2 | cross-surface round trip | PASS — picker→workspace is regression-anchored, not a convenient path |
| 3 | gate OFF/ON collapse | PASS — the positive control does real work |
| 4 | gate + both counts increased | PASS — **exit 0 first run**, Rust 879→**883**, frontend 2230→**2260** |

**The finding worth keeping:** the audit judged the "header survives" positive control to be
load-bearing rather than decorative — precisely because an earlier subagent had *refused* to pass
the gate-OFF outcome from a bare `querySelector → null` (its null came from no workspace existing
at all). The surviving header is what makes the absence attributable to the GATE.

⚠️ **The audit's own correction of the orchestrator stands as the model here:** it did not soften
the liveness claim, but it did refuse to let an unstated inference pass as an observation. The
residual is now in the record above.

### Phase 5 verify-human — AUTO-SKIPPED (auto-skip gate clean, 2026-08-25)

**Affirmation:** this phase does NOT wire into any existing endpoint, route, UI page, CLI command,
scheduled job, or external-system call. **It adds no artifacts at all** — P5.1/P5.2/P5.3 produced
evidence and records, not code. Last source edit 11:10 (Phase 4 verify-codify); Phase 5 touched
only the WIP.

All four gates clean: (a) `drive_mode: autopilot`; (b) verify-self 4/4 PASS; (c) no integration
boundary; (d) the outcomes name surfaces built in Phases 1–4, each already through its OWN
verify-human — not a surface this phase modifies.

⚠️ **Worth stating because it is what makes the skip legitimate rather than convenient: every
user-facing surface in this feature already carries explicit operator sign-off.** Phase 2's readout
(approved, with the tooltip rejected and corrected), Phase 3's selector (folded into Phase 4's
re-plan after the interaction model was rejected), and Phase 4's confirm + idle-gated apply
(*"tested. all good"* from the operator's OWN build — including the `--continue` conversation check
no agent can make). Phase 5 verified those approved surfaces still work together; it introduced
nothing new to judge. The affirmation block was printed in chat so the read-time veto stands.

### Phase 5 verify-codify — NO new tests, and that is the RIGHT answer here

⚠️ **No integration boundary: Phase 5 added no artifacts at all.** But §2 asks whether the
*verified behaviors* have coverage, not merely whether this phase wrote code — so both properties
Phase 5 proved live were probed rather than assumed:

| property Phase 5 proved live | already covered? | probe |
|---|---|---|
| spawn-env → **real hook** delivery (all 4 modes) | **YES** — `the_spawn_env_feeds_a_value_the_real_hook_accepts` | severing `cc_spawn_env`'s var push **FAILS** it |
| the RETAINED mode agrees with the composed env | **YES** — `the_resolved_cc_env_honors_the_gate_end_to_end` | forcing `effective = None` **FAILS** it (862 pass, 1 fails) |

Both bite. Writing new tests would be duplication, which §2 explicitly says to skip — *"If a
behavior is already covered by a test that would fail if the behavior broke → skip it, do not
duplicate."*

⚠️ **The delivery test is unusually strong and worth knowing about**: it drives the **real**
shipped `claudesk-hook.pl` with an env from the **real** `cc_spawn_env`, across all four modes,
and `env_remove`s the ambient `CLAUDESK_DRIVE_MODE` first — because the suite runs *inside* a
Claudesk workspace, so inheriting it would make the gate-OFF arm pass for the wrong reason. That
`env_remove` is the difference between a real cross-language proof and a tautology.

Final gate: exit 0 · Rust **883** · frontend **2260** · tree clean, no probe residue (the one
"MUTANT" grep hit is a test comment naming what it catches).

## Ship — `fd03a42` (2026-08-25)

Committed to `main` (this project's working branch per the global git policy). ⚠️ **NOT pushed** —
pushing is the operator's call; `main` now sits 34 ahead of origin.

**Pre-ship checks:** no TODO/FIXME/`console.log`/`debugger` in any file this feature added. The
four `console.warn` calls are deliberate error surfacing, matching the `next-open indicator`
precedent — an unhandled Tauri rejection vanishes silently (the WP6 picker MAJOR). No stray
artifacts in the repo; the dirty `scratch-a` fixture lives in the dev app's machine-local data
dir, not the tree.

⚠️ **A production `vite build` was run in addition to the gate, deliberately.** M13.5 WP3's blank
app was a BUNDLE-level failure that both `tsc` and `pnpm verify:auto` reported green — so a
passing gate is not by itself evidence the app boots. Exit 0.

Final: `pnpm verify:auto` exit 0 · Rust **883** (baseline 879, +4) · frontend **2260**
(baseline 2230, +30) · 20 files, +3704/-100.

## Retrospect

- **What changed in our understanding:** The feature's hardest problem was never the UI — it was
  that **a mid-session drive-mode change could not reach a running CC process at all**, because the
  mode is baked into `CLAUDESK_DRIVE_MODE` at spawn and a live process's env is fixed. The spec's
  first three options (label it next-spawn-only / make the hook read live / lean on Recycle) were
  all wrong, and the operator named why: **Recycle is a session-boundary instrument** (handoff →
  restore from notes) while what was needed is the **turn-level** counterpart (`/exit` → new env →
  `--continue`, conversation preserved). That primitive did not exist; building it was the real work.

- **Assumptions that held:** The gate seam, the picker-cell idioms (compact readout → click-to-edit,
  per-line hit regions, StrictMode-safe refs), and the permission-mode broadcast precedent all
  transferred cleanly. The design prior's own `Why:` correctly predicted this exact edge
  ("read at creation that is ALSO live-reconfigurable later, which may want both").

- **Assumptions that were wrong:**
  1. ⚠️ **"Apply-now is a distinct affordance, never an implicit side-effect of choosing a mode."**
     Recorded in §Assumed, then **cited downstream as "operator-reviewed"** — which it never was.
     The concern (too much consequence behind a dropdown) was right; the resolution was wrong. A
     confirm dialog answers it without splitting one intent across two gestures. **An unchallenged
     assumption is not an approved one**, and promoting one to reviewed status is how a silent
     default hardens into a spec.
  2. **`readyToRespawn` rejecting `unknown`.** Technically defensible, practically wrong: a
     freshly-spawned workspace IS `unknown` until its first turn, so the dialog said "busy" over an
     idle session. The operator's *"only present at turn 0"* pinned it exactly.
  3. **That effects could sequence the apply.** Three shapes, three eslint rejections. The rule was
     right — effects are not for sequencing imperative operations — and `recycleSession` already had
     the answer (one async function in a handler).

- **Approach delta:** Phase 4 was **re-planned from scratch** mid-flight (F12 → plan) after the
  interaction model was rejected; Phase 3's verify-human deferred its three leaves to be re-tested
  under the corrected model rather than re-run against a rejected one. Phase 3's `verify-codify` was
  **skipped by the back-loop** and had to be run late (at Phase 4), where it found a real gap.
  ⚠️ **Four separate mutation probes each passed a fully green suite** — the Cancel-persists, the
  caller-bypass, the broadcast path-check, and the Phase-1 caller composition. Every one was the
  same shape: *the mechanism was proven, the caller was not.* That shape is now the thing to probe
  for first, not last.

## Code-Quality Review — drive-mode-on-the-workspace-surface

Reviewed against ship commit `efa7798`. **0 CRITICAL · 4 MAJOR · 4 MINOR** — no refactor owed.

⚠️ **The reviewer was handed three of the author's own suspicions and REFUTED the framing on all
three** (it was told to judge them itself, not accept them). That is the outcome worth recording:
a reviewer that inherits the author's rationalisations is not reviewing.

### Strengths (reviewer's, abridged)
- `resolve_resume_arm` with an injected `consume` closure and `driveModeWriteFor` are "exemplary
  responses to measured mutation gaps" — untestable inline decisions replaced with value-assertable
  ones; the closure makes *"was the flag spent?"* observable rather than inferred.
- Splitting `should_consume_for_resume` / `authorizes_resume` is "the right decomposition for the
  right reason", with doc comments naming which future "simplification" reintroduces the bug.
- `ResolvedCcSpawnEnv` makes stored-vs-running desync **structurally unrepresentable**.
- Retiring the fragile source-position guard in favour of value tests is "a net reduction in guard
  debt, not just an addition."
- Stale comments invalidated by the feature were narrowed in place rather than left to go false.

### Issues

**CRITICAL** — none.

**MAJOR**
1. ⚠️ **[`Workspace.tsx:374`] A LIVE re-entrancy defect, verified by the orchestrator before
   filing.** `respawnWanted` gates the HANDLER but nothing gates the AFFORDANCE: during a queued
   apply the readout stays clickable, the `<select>` stays reachable, and `storedDriveMode` was
   already optimistically written. So a second mode change → confirm → **Apply is silently
   discarded** while the readout shows the new value. That is the *"readout claims a mode the
   session is not obeying"* state AC-5 exists to prevent, reached by a different door. Confirmed at
   source: no `disabled`, no click guard; line 917 renders only the ⏳ indicator. Fix: disable the
   affordance while `respawnWanted`, or let the second apply supersede the queued one.
2. **[`applyDriveMode.ts:165`] `RESPAWN_INTENT_HOLD_MS` synchronises against the React scheduler,
   not an event.** `await Promise.resolve()` is a microtask and does NOT guarantee a committed
   render. ⚠️ A deterministic mechanism was available **and is the house idiom in this very file** —
   `onSessionIdRef` (`XtermPane.tsx:467`) solves exactly this. The failure mode if the window is
   missed is the silent one the comment itself names: consuming the unclean-exit flag and disabling
   auto-resume on the next real open, unobservable by any test.
3. **[`applyDriveMode.ts:161-164`] The justifying comment overstates its pedigree.** It claims to
   match `INJECT_SETTLE_MS`'s idiom — but that constant is empirically measured, documents its
   sample, and is pinned by a test asserting value + floor. This one has no measurement, no test,
   one call site. ⚠️ *"Borrowing a measured constant's credibility for an unmeasured one is the kind
   of comment that stops a future reader from questioning the number."*
4. **[`workspaceDriveModeRender.test.tsx:136-205`] The "floor, not proof" defence does not follow.**
   The reasoning about `?raw` guards is correct, but `arch.md`'s rule is an argument **for
   extraction** — which this same feature applied twice (`driveModeWriteFor`, `readyToRespawn`). The
   path filter is equally extractable (`shouldApplyBroadcast(payloadPath, myPath)`). The current
   regex breaks on any rename while a semantically-equivalent-but-wrong comparison would pass.

**MINOR**
5. [`Workspace.tsx:380-387`] Orphaned 8-line comment block describing `startApply`, now ~90 lines
   from it — phase-accretion leftover pointing at the wrong function.
6. [`Workspace.tsx:359-366`] A leftover `/** Cancel: a TRUE no-op */` doc comment now mislabels
   `resolveDriveMode`, which handles BOTH outcomes.
7. [`App.css:602-625, 642-660`] `.workspace-header-drivemode` declared twice, split by an unrelated
   rule; the second block reads as if adding to a distant declaration.
8. [`Workspace.tsx:229-357`] ~130 inline lines of drive-mode state/refs/effects/handlers in a
   component past 1170 lines. Not wrong as shipped, but *"the next addition should not go inline"* —
   a `useDriveModeApply(...)` hook would also make findings 1 and 4 directly testable.

### Assessment (reviewer's)
*"Careful, defect-driven work… the backend half in particular is a model of how to respond to 'the
mechanism was proven, the caller was not'… The frontend half is weaker in exactly one dimension:
the async apply operation was left inline in an already-oversized component, and the two properties
that could not then be observed were covered with regex source guards whose own comments concede
they are not proof — even though this same feature demonstrates the correct fix twice. Net: the
codebase advances… with a modest, well-localised debt in `Workspace.tsx` that a follow-up hook
extraction would clear."*

⚠️ **Findings 1, 2 and 4 have a common root and a single fix:** extracting the apply operation into
a `useDriveModeApply` hook would gate the affordance, expose the intent latch as a ref, and make
both source-guarded properties value-testable. Whoever picks this up should treat them as one item,
not four.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`feature-finalize` archives the WIP.

## Discoveries

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->

- [SURFACED-2026-08-25] Phase 2 verify-self — **the workspace readout does not re-read while the
  workspace stays open.** The effect keys on a `visible` edge, but the reopen-dedup FOCUSES an
  already-open workspace rather than remounting it, so changing the mode from the picker (or
  anywhere) leaves the readout showing a stale value with no stale marker. ⚠️ **Owned by Phase 3**
  (P3.1/P3.2 broadcast; its Observable Outcome already names *"changing it on the picker row
  updates an open workspace's readout"*), so this is a known gap between phases, NOT a Phase 2
  regression — Phase 2 claims only that the readout renders and collapses with the gate.
  Reproduction + the dirty fixture are in `## Phase 2 verify-self` above.

- [SURFACED-2026-08-25] Phase 1 verify-self — **the integration-boundary gate fired.** The
  phase restructured `SessionRegistry::spawn`'s resume `match` (rule 3: modified code inside an
  existing command the frontend consumes on every workspace open), but all four planned
  Observable Outcomes were unit-level and none cited `cc_spawn`. ⚠️ **The gap is not fixable by
  another unit test:** `cc_spawn` needs a live `AppHandle` and spawns a real `claude`, which is
  why its only existing coverage is a source-text guard whose own comment says every value-level
  test passes regardless. Two live outcomes added to the phase; verify-self did NOT run (per the
  rule's "do not run the verification subagent"). Back-looped F9b with scope P1.5.

- [SURFACED-2026-08-25] feature-spec — `design-priors.md` is 147 lines but ~29.7KB; it exceeds
  the size guard by content and was read selectively (headings + the three firing priors:
  `set-a-spawn-time-choice-where-the-spawn-is-chosen`,
  `new-surface-must-earn-its-place-against-existing-ones`,
  `explicit-selectable-mode-over-inferred-mode`). Consider whether the guard should key on bytes
  rather than lines.
- [SURFACED-2026-08-25] feature-spec — **a turn-level respawn (kill → respawn → `--continue`,
  no handoff) is a missing primitive independent of WP4.** The codebase has the session-boundary
  instrument (Recycle) and the crash-recovery arm (unclean flag → `--continue`) but no
  operator-requestable "restart this process, keep this conversation." WP4 builds it as P1;
  worth noting as reusable rather than WP4-specific.
