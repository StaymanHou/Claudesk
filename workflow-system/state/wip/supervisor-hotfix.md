# Feature: Supervisor hotfix — per-workspace toggle + unsent-input suppression

**Workflow:** feature
**State:** ship (complete) — committed as `a46ae89` on `main`, 2026-09-17. ⚠️ **NOT PUSHED**
(the operator has not asked; `main` is 17 ahead of origin). All 3 phases ran the full
build → verify-auto → verify-self → verify-human → verify-codify loop; gate green at 2711.
**Created:** 2026-09-15
**Spec'd:** 2026-09-17
**Planned:** 2026-09-17
**Entry:** spec (complex feature — architectural decision + persisted field)
**Milestone:** M14 (remainder) — WP0 (inserted out of decomposition)
**drive_mode:** autopilot

## Problem Statement

The M15 workflow supervisor is **firing unwanted commands in live use**, and the operator's verdict
after one day on `v0.5.0` is that it is *"making Claudesk a bit out of control and less useful."*

⚠️ **The evidence is first-hand and unusually direct: the supervisor fired six unwanted
`/feature-build` invocations into the session that was building M14's WP3.** Each arrived with no
scoped leaf IDs against a phase whose implementation was already complete, so each was a no-op that
cost a turn. The agent initially read them as operator input and asked which of four intents
applied — the operator's answer was that the supervisor was sending them.

⚠️ **Blast radius is ~half the rotation, not one workspace: 9 of 20 projects in `projects.json`
carry a stored `default_drive_mode`**, and supervision requires only that plus the M10.9 gate.

**Two distinct defects, one report** (`SURFACE-2026-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1`, high):

1. **It fires while the operator has unsent input.** *"I'm typing something midway, and the
   supervisor auto chained."* ⚠️ This is **M15's recorded dissent arriving in reality** — the fire
   policy is *silently, always*, chosen over announce-then-click and over a countdown veto, and
   `injectCommand` has **no retry and no pre-send cancel window** by design. A wrong fire is
   unrecoverable except via **Esc**.
2. **There is no way to turn it off for one workspace.** The only off switch is the app-wide
   `workflow_features_enabled` gate, which also hides the Docs panel and the rest of the workflow
   surface. ⚠️ **The operator explicitly refused that as a stopgap** — fix it properly.

A third reported item (*"inference / transition check would freeze the UI"*) is **NOT in this
feature's scope** — see Out of Scope.

## Operator rulings (2026-09-15 — decided, do not re-litigate)

- ⚠️ **Toggle default is ON, opt-out per workspace.** Not default-off. Consistent with
  `operator-helpful-friend-misfiring-as-offswitchable-setting`.
- ⚠️ **"While typing" is NOT good enough — the predicate is UNSENT INPUT PRESENT.** Operator
  correction, and it is the load-bearing distinction of the whole feature: *"typing"* is a **race**
  on keystroke recency; *"there is a buffered line you walked away from"* is a **state**. A
  debounce-on-recent-keystrokes implementation does not satisfy this ruling and should be rejected
  at review.
- ⚠️ **Do NOT flip `workflow_features_enabled` off as a stopgap** (explicit). The blunt gate costs
  the Docs panel and the rest of the workflow layer.
- **Reopen the fire policy properly — but only AFTER this patch ships and is released.**
  Sequencing is deliberate; this WIP must not grow into that.

## Spec decisions (2026-09-17)

### ⚠️ D-1 — Task 0.2 is ANSWERED, and it REFUTES the WIP's stated blind spot

The spec-time enumeration was run against source. **Every path bytes reach the CC pty:**

| Layer | Site | Routes through `term.onData`? |
|---|---|---|
| Frontend | `XtermPane.tsx:629` — the `term.onData` handler | ✅ **is** the chokepoint |
| Frontend | `autoResumeFire.ts:179` — `injectCommand` | ❌ **by design** — this is the machine's own funnel, not operator input |
| Rust | `PtyCcSession::send_input` (`cc_session/mod.rs:1075`) | single writer; only non-test caller is the exit-command path |

⚠️ **THERE ARE EXACTLY TWO `invoke("cc_input")` SITES IN THE FRONTEND.** Verified by grep across
`src/` excluding tests. Everything else (`skillButtons.ts`, `sessionStartButton.ts`,
`Workspace.tsx`, `recycleSession.ts`) **delegates to `injectCommand`** rather than invoking
`cc_input` directly — a discipline those modules' own doc comments record deliberately.

⚠️ **PASTE IS COVERED, contradicting the WIP's pre-spec assumption.** xterm 6.0's `onData` doc
comment: *"This happens for example when the user types **or pastes** into the terminal."* And
`term.input()` — the programmatic entry point — explicitly states *"the data is treated the same
way input typed into the terminal would (ie. the `onData` event will fire)"*. **Zero callers of
`term.input()` or `term.paste()` exist in this codebase.**

**So the watermark is a genuine chokepoint on human input, not a leaky approximation.** The WIP's
framing (*"an INFERENCE with a known blind spot… paste, programmatic writes"*) was correct to
demand the enumeration and **wrong about what it would find**. ⚠️ **Do not re-assert the paste
blind spot from the pre-spec text** — it is refuted here by the vendored typings.

**The residual, stated honestly (this is what remains an inference):**
- ⚠️ **CC's TUI owns its own input buffer and Claudesk cannot see it.** The watermark tracks what
  was *sent in*, not what CC currently *holds*. That gap is what D-2 addresses.
- Input typed into a pane before the `onData` handler was attached (mount race) is invisible. Narrow
  — the handler is wired in the same effect that spawns.

### ⚠️ D-2 — Watermark decay: clear on known buffer-clearing keys (OPERATOR-DECIDED)

**Asked and answered 2026-09-17.** The watermark clears on `\r` **and** on the byte sequences that
abandon a line without submitting it:

| Byte | Key | Why it clears |
|---|---|---|
| `\r` (0x0d) | Enter | the line was submitted — the turn is the operator's |
| `0x1b` | Esc | CC's own interrupt/dismiss |
| `0x03` | Ctrl+C | abandon input |
| `0x15` | Ctrl+U | kill-line |

**Why not "clear only on `\r`":** a line the operator Esc'd out of would suppress the supervisor
**forever** for that workspace until the next Enter — the workspace goes silently unsupervised,
which is the same invisible-failure shape the whole milestone exists to avoid.

⚠️ **Why NOT an idle timeout (rejected):** a timeout re-introduces a **time-based race**, which is
exactly the shape ruling 2 rejects. *"Unsent input present"* must stay a **state**, never a
recency test.

⚠️ **ACCEPTED COST, recorded not hidden:** an Esc that dismisses a CC *menu* (rather than clearing
the input line) clears the watermark early, leaving a narrow wrong-fire window. Accepted as
strictly better than an indefinitely-dead supervisor. **A backspace-to-empty line is NOT detected**
— the watermark stays set until one of the four keys above, so it fails toward **suppression**,
which is the safe direction.

### D-3 — Toggle placement: the workspace header, beside the drive-mode readout

⚠️ **`set-a-spawn-time-choice-where-the-spawn-is-chosen` does NOT govern this** — the WIP already
recorded that, and the prior's own decision rule confirms it: *"Read continuously /
live-reconfigurable → the control belongs on the instance."* The supervisor acts **every turn**,
not once at spawn. So the picker row is wrong and the workspace header is right.

**There is already a precedent to sit beside, not a new surface to invent:** M13.5 WP4 put the
**drive-mode readout** in the workspace header (`Workspace.tsx:872-990`), explicitly reversing
M12's "picker row ONLY" placement, and the prior names that exact edge as untested. The supervisor
toggle is the same shape: per-workspace, live, read continuously.

`[PRIOR: paired-actions-need-paired-affordances]` — the toggle is the **inverse** of the drive-mode
control that turns supervision *on* (a stored mode is what makes a workspace supervised at all), so
it gets an affordance of the same kind, in the same place. Not prose pointing elsewhere.

`[PRIOR: explicit-selectable-mode-over-inferred-mode]` leaning **visible state, click to edit** —
matching the drive-mode readout's own shape — **flag if wrong**.

### D-4 — Malformed/absent value reads as ON

The field is a `bool`, so the drive-mode blast-radius concern (an open string failing serde and
taking the whole project list down) **does not transfer directly** — but the failure direction
still must be pinned: `#[serde(default = …)]` with an explicit `true` default, so both an **absent**
key and an **existing `projects.json` written before this ships** read as ON. ⚠️ **Do not use
`Option<bool>` with `None` meaning ON** — that makes "unset" and "explicitly on" indistinguishable
on disk for no gain.

### ⚠️ D-5 — The SUPPRESSED state gets a passive marker (OPERATOR-ASKED 2026-09-17)

⚠️ **THERE ARE THREE STATES, NOT TWO, AND THE SPEC ORIGINALLY SHOWED ONLY TWO.** Raised by the
operator at spec review; the gap was real and is closed here.

| State | Controllable | Visible | Source |
|---|---|---|---|
| **On** | ✅ toggle (D-3) | ✅ header | `projects.json` |
| **Off** | ✅ toggle (D-3) | ✅ header | `projects.json` |
| **Temporarily suppressed** | ❌ **derived — not settable** | ✅ **marker (this decision)** | the watermark (D-2) |

**Form:** a small derived badge on the header control when the watermark holds — the **same shape**
as the drive-mode readout's existing `⚠` stale marker and `⏳` pending marker, which already
establish this exact precedent in this exact element. **Read-only:** it reflects the operator's own
unsent input and is cleared by submitting or abandoning the line (D-2's four keys), never by
clicking it.

⚠️ **WHY THIS IS NOT OPTIONAL POLISH — suppression is otherwise INVISIBLE AND UNBOUNDED.** D-2
deliberately has **no timeout**, and the watermark does **not** clear on backspace-to-empty. So a
stale watermark leaves a workspace unsupervised **indefinitely**, with **zero** on-screen difference
from a supervised one. That is precisely the **write-only state** problem M13.5 WP4 built the
drive-mode readout to fix (WP2's ⏸ set the unclean flag with no way to confirm the click landed).
Shipping the same shape again knowingly would be a regression against a lesson already paid for.

⚠️ **THE PRIOR REASONING IN THE ORIGINAL `Assumed` LIST WAS WRONG — corrected, not silently
dropped.** The first draft cited `new-surface-must-earn-its-place-against-existing-ones` to omit any
indicator. That prior governs a **new surface duplicating an existing one**; this is a **badge on a
control already being built**, and it duplicates **nothing** — no other surface in the app shows
this state. Per that prior's own `⚠️ BOUNDARY` note and
`[[paired-actions-need-paired-affordances]]`, the test is *"does it OVERLAP an existing surface, or
is it the INVERSE/complement of one?"* — here there is no overlap at all, so the anti-redundancy
prior does not fire.

`[PRIOR: explicit-selectable-mode-over-inferred-mode]` — *"the active value is visible without
interaction"* — fires **for** the marker: two of three states visible is not that.

`[PRIOR: semantic-distance-not-just-visual-distance-for-status-colour]` leaning **ambient colour,
NOT the alarm-blue used for `AwaitingInput`** — suppressed is ambient information, not an alarm, and
a badge that borrows the alarm's urgency erodes the alarm. The drive-mode stale marker's purple
precedent is the model. **Flag if wrong.**

⚠️ **EXPLICITLY NOT INCLUDED: a click-to-clear affordance.** Considered and declined at the same
review. It would be a second control whose effect is invisible until the next turn end, and the
stale-watermark case it targets is already bounded by D-2's four clearing keys. **If dogfooding
shows the stale watermark biting in practice, that is the follow-up** — recorded here so the option
is not re-derived from scratch.

## User Stories

- As the operator, I want the supervisor to **not fire into a workspace where I have a half-typed
  line**, so that my input is never consumed as the answer to a prompt I was still composing.
- As the operator, I want to **turn the supervisor off for one workspace** without losing the Docs
  panel and the rest of the workflow layer, so that a project where it misbehaves stays usable.
- As the operator, I want the toggle **where I am when it misfires** — the workspace I am looking
  at — so that the fix is one click, not a navigation.
- As the operator, I want to **see when a workspace is suppressed rather than supervised**, so that
  a stale watermark reads as a visible state instead of a supervisor that appears dead.

## Acceptance Criteria

1. A **per-workspace supervisor toggle** exists, **defaults ON**, persists in `projects.json`, and
   takes effect **without a restart**. ⚠️ A malformed or absent value reads as **ON** (D-4).
2. When a workspace has **unsent input in its CC pane**, the supervisor **does not fire** into it.
   ⚠️ "Unsent" means *entered but not submitted* — a line typed and left sitting must suppress,
   not only a keystroke in the last N ms.
3. Suppression happens **before** `injectCommand` is called — it has no retry and no undo.
4. The toggle is reachable **at the moment the supervisor misfires** — the workspace header (D-3).
5. The watermark clears on `\r`, Esc, Ctrl+C, Ctrl+U — and on **nothing time-based** (D-2).
5b. ⚠️ **The SUPPRESSED state is VISIBLE** — while the watermark holds, the workspace header shows a
   passive derived marker, ambient (never alarm-blue), read-only, cleared only by D-2's keys (D-5).
   ⚠️ **A suppression the operator cannot see is the write-only defect M13.5 WP4 already fixed once**
   — an unsupervised workspace must not be pixel-identical to a supervised one.
6. ⚠️ **The toggle is checked INSIDE the turn-end callback, per turn** — following
   `useSupervisor`'s existing discipline for `host.enabled` and `storedMode` (it can flip
   mid-turn, and the fire is the irreversible half).
7. ⚠️ **`injectCommand`'s own writes must NOT set the watermark.** The supervisor's injection, the
   skill-button row, and auto-resume all pass through `autoResumeFire.ts:179`, which does **not**
   route through `term.onData` — so this is satisfied by construction (D-1), and a test must pin it.
8. `pnpm verify:auto` passes.
9. Shipped as a **patch release**.

## Out of Scope

- ❌ **The UI-freeze report** (*"inference / transition check would freeze the UI"*) — the third
  item in the same dogfeedback batch. ⚠️ **It is a DIFFERENT defect with a different shape**: it
  matches the main-thread-blocking class that hung the app once already (P1 2026-08-25, a sync
  `cc_kill` holding the main thread; `sample` was the instrument that found it). Bundling a
  performance/threading investigation into a behavioral hotfix would delay both. **Stays on the
  backlog entry.**
- ❌ **Reopening the fire policy** (silently-always vs. announce-then-click vs. countdown veto).
  Operator-sequenced to *after* this ships. ⚠️ Probe **Q2** (can a question-shaped / answer-awaiting
  tail be detected?) remains the open gate on that policy; this feature does **not** close it.
- ❌ **Any change to which transitions the supervisor considers AUTO.** The policy graph is correct;
  the problem is *when* it fires, not *what* it decides.
- ❌ **Turning the app-wide gate off**, even temporarily.
- ❌ **Reading CC's actual input buffer.** Would require PTY-output scraping — forbidden, and the
  `xterm-dom-reads-fake-a-blank-pane` false-verdict trap. The watermark's residual (D-1) is
  accepted, not engineered around.
- ❌ **A seventh OFF-invariant guard arm.** The toggle **and D-5's marker** both live inside the
  already-gated workspace header beside the drive-mode readout (arm 6, `WORKSPACE-DRIVEMODE`); they
  register no new panel, menu id, chord, row-cell or skill-row. ⚠️ **Confirm at plan** whether arm
  6's subject list must widen — **D-5 adds a SECOND gated element to that header**, so the answer is
  more likely "yes" than it was before the marker existed. The pin is the `armSubjects.length`
  assertion in `offInvariantGuard.test.ts` (⚠️ `arch.md` cites `:931`; it is at `:949` as of
  2026-09-17 — cite the symbol, not the line). ⚠️ **With the gate OFF, BOTH must not exist in the
  DOM** — not hidden, not disabled, not an empty reserved slot.

## Technical Constraints

### The seams (verified by reading source, 2026-09-15 / re-verified 2026-09-17)

- **`term.onData` (`XtermPane.tsx:626`)** — the watermark's hook point. **The** chokepoint for
  operator input (D-1).
- **`fireOne` (`src/state/supervisor/fanOut.ts`)** — ⚠️ **the guard goes HERE.** That module's own
  header states the rule: *"EVERY FIRE GOES THROUGH `fireOne`. THE GUARD IS ON THAT FUNCTION."*
  This is the local four-times-repeated defect shape (*a mechanism correct in itself behind a
  caller that does not honor it*) already structurally solved — do not add a second check elsewhere.
- **`injectCommand` (`autoResumeFire.ts:172`)** — the single injection funnel; **no retry, no undo,
  no pre-send cancel window**.
- **`useSupervisor` (`src/state/supervisor/useSupervisor.ts:~110-120`)** — already early-exits on
  `!host.enabled` and `storedMode === null`, **re-checked per turn inside the callback**, not around
  the subscription (so hook order cannot depend on `enabled`). The new toggle is a **third** such
  condition and must follow the same discipline (AC-6).
- **`SupervisorHost`** — refs, not values, throughout: the turn-end callback is registered once and
  would otherwise close over a frozen snapshot. ⚠️ **The toggle must arrive as a ref**, or it will
  read its mount-time value forever.
- **`Project` struct (`config_store/mod.rs:63`)** — where the persisted field lands, beside
  `default_model` and `default_drive_mode`.
- **Workspace header (`Workspace.tsx:872-990`)** — D-3's placement, beside the gated drive-mode
  readout.

### ⚠️ The architectural constraint (settled; do not re-derive)

CC's input box lives **inside the PTY** — it is terminal output, not a DOM field. `CLAUDE.md`:
*"PTY byte-injection for input; hook channel for state. ⚠️ **NEVER from PTY output.**"*

**So "is the input box non-empty?" is not directly observable without breaking that rule.**
⚠️ **Scraping the xterm buffer was CONSIDERED AND REJECTED** — it violates the rule, and memory
`xterm-dom-reads-fake-a-blank-pane` documents that exact read producing **false verdicts** (rows
read empty; `innerText` returns xterm's injected stylesheet).

**The chosen approach — a keystroke watermark — infers the state from what Claudesk sends IN:**
input bytes forwarded since the last turn ended, with no clearing key since ⇒ unsent input present.
No PTY output is read, so the rule holds **by construction**.

⚠️ **It remains an inference** — but D-1 narrows the blind spot from the WIP's assumed *"paste,
programmatic writes"* to **CC's internal buffer state only**, and D-2 fixes the decay direction so
the residual fails toward **suppression**.

### No 3rd-party dependency

No external service, API, or SDK. Step-2 probe check does not fire.

## ⚠️ What an agent cannot verify here

**An agent-launched CC emits no hook events**
(`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`), so **the supervisor will
not fire under agent testing at all.** Consequences for this feature's verification:

- ✅ **Unit-provable:** the watermark state machine (set/clear on each of the four byte sequences),
  the toggle gating `fireOne`, persistence, the absent-key-reads-ON default, and AC-7 (the
  injection funnel does not self-set the watermark).
- ✅ **Agent-verifiable in the live app (D-5's marker):** unlike the fire itself, the suppressed
  marker is driven by `term.onData` — which an agent CAN exercise via the MCP bridge without any
  hook event. ⚠️ **But `xterm-dom-reads-fake-a-blank-pane` applies**: assert on the marker's own
  `data-testid` in the React tree, **never** by reading the xterm buffer, and run a positive
  control so an absent marker is not confused with a failed read.
- ❌ **NOT agent-provable:** *"does it actually stop interrupting the operator."* That is a
  **dogfooding check only the operator can make.**

⚠️ **Do not present a green suite as evidence the interruption stopped.** Say which half is proven.
This is the same trap M15 itself closed with an explicitly-unmet exit criterion rather than a
falsely-ticked one. ⚠️ **And extracting the watermark as a pure state machine proves the MACHINE,
not its CALLER** — the local four-times defect shape. The caller-side guard in `fireOne` needs its
own assertion.

## Plan decisions (2026-09-17)

Both questions the spec carried to plan are now **answered from source**.

### ⚠️ P-A — Arm 6's subject list DOES need to widen, and the guard is self-policing

`offInvariantGuard.test.ts` pins `armSubjects.length === 8`, but ⚠️ **that array is NOT the half
that polices deletion** — its own comment records that a real arm's `it()` was deleted and the
suite stayed green, because the literal asserts *eight functions are importable*, not *eight arms
exist*. The real pin derives the count **from this file's own source**, matching every OFF-assertion
title against `/\n {2}it\("((?:registers|matches|renders|announces) no [^"]+)"/g`.

⚠️ **CONSEQUENCE FOR THIS FEATURE — the two counts move together or the guard fails loudly.**
Adding an OFF-assertion `it()` without adding a subject (or vice versa) fails the reconciliation
assertion with a named diff. That is the desired behavior; **do not "fix" a failure there by
bumping the `.toBe(8)` literal alone.**

**Decision:** the toggle and D-5's marker are **derivations of arm 6's registry**, so they get
**subjects on arm 6**, not a seventh arm. Expected: `armSubjects.length` **8 → 9** (one new
subject) with **one new OFF-assertion `it()` titled to match the regex above** (must begin
`registers|matches|renders|announces no …`).

⚠️ **The pure derivation is what the arm polices, so it must exist.** Follow
`workspaceDriveModeReadout(stored, running, gateEnabled, sessionLive)` exactly: `if (!gateEnabled)
return null`, and the render follows the data. A component-level `{enabled && <X/>}` is **not**
guardable by this arm.

### P-B — A dedicated command, not a widened setter

`project_set_default_drive_mode` (`config_store/commands.rs:214`) is the model, and it is **two
things, not one**: a store write *plus* a `PROJECT_DRIVE_MODE_EVENT` broadcast emitted **only after
the write succeeds** (so two surfaces never agree on a value that never reached disk).

**Decision:** add `project_set_supervisor_enabled` mirroring that shape. ⚠️ **But NO broadcast
event** — the drive mode has **two** surfaces to keep in sync (picker row + workspace header); the
supervisor toggle has **one** (D-3: header only). A broadcast with a single consumer is sync
machinery paid forever for nothing (`new-surface-must-earn-its-place-against-existing-ones`'s cost
note). ⚠️ **If a second surface is ever added, the event comes with it** — recorded so the omission
is not read as an oversight.

## Work Tree

- [x] Phase 1: Watermark + suppression (the defect that cost six turns)  <!-- status: COMPLETE
      2026-09-17 — build → verify-auto → verify-self → verify-human → verify-codify.
      ⚠️ The 7 `P1.verify-human.*` leaves carry `DEFERRED-TO-DOGFOODING` tags: the GATE closed on
      mechanical evidence, the BEHAVIOR was not observed. Read the tags, not the checkboxes. -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/supervisor` exits 0; the watermark suite proves set-on-keystroke
    and clear-on-each-of-`\r`/`0x1b`/`0x03`/`0x15` **individually** (⚠️ four separate cases — a
    single "clears on a control byte" case would pass with three of the four unimplemented).
  - CLI: a `fireOne` test with the watermark SET and an otherwise-firing turn returns
    `{fired: false, reason: "<suppressed>"}` and the injector spy records **zero** calls.
    ⚠️ **Assert the spy, not just the return value** — `fired: false` is also what every other
    withhold path returns, so the return alone does not prove the injection was skipped.
  - CLI: a `fireOne` test proves `injectCommand`'s own write does **NOT** set the watermark (AC-7),
    by firing twice in sequence and asserting the second fire is not suppressed by the first.
    ⚠️ **STRENGTHENED AT VERIFY-SELF (SHORTCUT-2026-09-17) — the original form of this check was an
    equivalent mutant.** It now needs BOTH halves: (a) the behavioral test drives a **real**
    `UnsentInputWatermark` fed by its own injector, with a **positive control** so the final
    assertion cannot pass vacuously; and (b) an **`AC-7 (structural)`** test asserting at the
    wiring layer that exactly ONE site pushes into the watermark and `autoResumeFire.ts` never
    mentions it. ⚠️ **(b) is not optional decoration** — `fireOne` takes its injector as a dep, so
    no test at that seam can observe whether the PRODUCTION injector touches the watermark.
  - ⚠️ **[WITHDRAWN AT VERIFY-SELF 2026-09-17 — UNSATISFIABLE AS WRITTEN, moved to Phase 3.]**
    ~~Browser (MCP bridge): typing into a live CC pane sets the watermark — observed via the pure
    module's exported state.~~ **Two independent reasons, both structural:**
    (a) **Nothing to observe.** The watermark is a `useRef` inside `Workspace`'s closure — no DOM
    node, no store, no `window` handle, no `data-testid`. "The pure module's exported state" does
    not exist: `unsentInput.ts` exports a *class* and a *reducer*, and the live instance is
    private to the component. Reaching it would need React-fiber traversal, which proves the
    fiber can be walked, not that the wiring works.
    (b) **Nothing to trigger.** Even a visible watermark would not demonstrate *suppression*,
    because **an agent-launched CC emits no hook events**
    (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`), so the supervisor
    never fires under agent testing at all.
    ⚠️ **This outcome was written one phase too early — Phase 3's D-5 marker IS the observable
    surface**, and Phase 3 already carries the correct, satisfiable form of this check
    (`data-testid` in the DOM + positive control). Verifying it here would require building
    Phase 3's UI inside Phase 1.
    ⚠️ **Phase 1 therefore has NO agent-observable browser outcome, and that is now explicit
    rather than silently unmet.** Its CLI outcomes carry the whole agent-provable claim; the
    live-behavior half is dogfooding-only and is stated as such in "What an agent cannot verify".
  - [x] P1.1 Extract the watermark as a **pure state machine** (`src/state/supervisor/`): a
        reducer over input chunks → `{unsentInput: boolean}`. ⚠️ Byte-level, not string-level — a
        chunk may carry several bytes, and the clearing keys are single control bytes.  <!-- status: DONE -->
  - [x] P1.2 Hook it at `term.onData` (`XtermPane.tsx:626`). ⚠️ **Feed the RAW chunk before any
        encoding** — `encodeBase64` is the pty path, not a decision point.  <!-- status: DONE -->
  - [x] P1.3 Hold it per-workspace in a **ref** and expose it to `useSupervisor` as a ref
        (⚠️ the turn-end callback is registered once; a value would freeze at mount).  <!-- status: DONE -->
  - [x] P1.4 Consult it in **`fireOne`** (`fanOut.ts`) — ⚠️ **the guard goes on that function**,
        per its own header (*"EVERY FIRE GOES THROUGH `fireOne`. THE GUARD IS ON THAT FUNCTION"*).
        ⚠️ **PLACEMENT SETTLED AT BUILD, AND IT REVERSES THE PLAN'S OWN PHRASING — read this
        before "fixing" it.** The plan asked *"before the ledger claim? NO — after"* on the
        reasoning that a suppressed turn must not consume its claim. **Implemented AFTER the
        claim, which means a suppressed turn DOES consume it, deliberately.** The operator is
        mid-sentence and what they type IS the next instruction; re-firing the stale chain once
        they hit Enter would inject a command on top of the one they just sent — the exact
        two-commands-at-once collision this feature exists to stop. The spent claim is the
        point. Pinned by *"a suppressed turn CONSUMES its ledger claim"* and mutation-proven
        (moving the check above the claim kills that test alone).  <!-- status: DONE -->
  - [x] P1.5 ⚠️ **Caller-side assertion** — extracting the machine proves the MACHINE, not its
        CALLER (the local four-times defect shape). Pin that `fireOne` actually reads it.
        Two guards in `useSupervisor.test.ts`: the dep is supplied, and it is forwarded as a
        **thunk** (a captured boolean would answer the wrong question — `tsc` cannot see the
        difference once both are optional).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE -->
  - [x] verify-self  <!-- status: DONE — 3/3 CLI outcomes PASS, 0 BLOCKING, 0 COSMETIC; the
        browser outcome was WITHDRAWN as unsatisfiable (see the outcome block above). One
        equivalent-mutant defect found in the AC-7 TEST and fixed in place under the shortcut
        gates (SHORTCUT-2026-09-17), re-verified by a freshly spawned subagent. -->
  - [x] verify-human  <!-- status: GATE CLOSED on mechanical evidence 2026-09-17; the 7 hands-on
        checks are DEFERRED-TO-DOGFOODING by operator decision, NOT passed.
        ⚠️ **READ THE `DEFERRED-*` TAGS ON THE LEAVES BELOW, NOT THEIR `[x]` CHECKBOXES** — the
        checkbox means the gate closed, not that the behavior was observed. Same convention as
        M15 WP4/WP5 (`m15-wp5-milestone-exit-verify.md` P1.3), which `CLAUDE.md` warns about in
        those exact terms. The operator reviewed the evidence and said "looking good", while
        explicitly stating no hands-on test was performed. -->
    - [x] P1.verify-human.0 Operator reviewed the mechanical evidence and approved the phase
          ("looking good"), explicitly noting no hands-on test was performed.  <!-- status: DONE -->
    - [x] P1.verify-human.1 Unsent line present at turn end → NO fire, text intact.  <!-- status: DEFERRED-TO-DOGFOODING -->
    - [x] P1.verify-human.2 Walked-away-from line (minutes) → STILL no fire. ⚠️ The ruling's
          load-bearing case: a debounce would fire here.  <!-- status: DEFERRED-TO-DOGFOODING -->
    - [x] P1.verify-human.3 Esc, then turn end → fires normally.  <!-- status: DEFERRED-TO-DOGFOODING -->
    - [x] P1.verify-human.4 Ctrl+C and Ctrl+U → fire normally.  <!-- status: DEFERRED-TO-DOGFOODING -->
    - [x] P1.verify-human.5 Enter/submit → fires normally.  <!-- status: DEFERRED-TO-DOGFOODING -->
    - [x] P1.verify-human.6 After a suppressed turn, subsequent turns resume chaining. ⚠️ The
          suppressed turn itself stays spent BY DESIGN.  <!-- status: DEFERRED-TO-DOGFOODING -->
    - [x] P1.verify-human.7 Esc-dismissing a CC menu clears the watermark early — the recorded
          accepted cost of D-2. Confirm it is tolerable in practice.  <!-- status: DEFERRED-TO-DOGFOODING -->
  - [x] verify-codify  <!-- status: DONE 2026-09-17 — extracted `routeCcInput` + 6 behavioral
        tests; both mutants killed; full gate green at 2656. See "Codify record" below. -->

- [x] Phase 2: Per-workspace toggle — persistence + gated derivation  <!-- status: COMPLETE
      2026-09-17 — build → verify-auto → verify-self → verify-human (PASS, hands-on, 2 operator
      corrections applied) → verify-codify. -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: **yes** — the operator explicitly refused flipping
    `workflow_features_enabled` as a stopgap (ruling 3), so a per-workspace off switch is the
    only sanctioned escape hatch. Phase 1 suppresses *unsent-input* fires; it does nothing for a
    workspace the operator simply wants unsupervised.
  - Requirements unchanged: **yes** — AC-1/AC-4/AC-6 untouched by anything Phase 1 learned.
  - Solution still feasible: **yes** — `set_default_drive_mode` + `project_set_default_drive_mode`
    + `workspaceDriveModeReadout` give a working precedent at every layer (store, command, gated
    derivation, header render).
  - No superior alternative discovered: **yes** — Phase 1's watermark handles the *transient*
    case well, but it is an inference with a recorded residual (CC's own buffer) and cannot
    express "never supervise this project". The two are complements, not substitutes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk config_store` exits 0; a `projects.json` fixture **with no
    `supervisor_enabled` key** deserializes to `true` (AC-1/D-4), and a fixture written before this
    feature round-trips unchanged.
  - CLI: `pnpm vitest run src/state/__tests__/offInvariantGuard.test.ts` exits 0 with
    `armSubjects.length === 9` and a matching count of OFF-assertion titles (P-A). ⚠️ Run
    **unfiltered or with an explicit count check** — a filtered run matching zero tests exits 0.
  - CLI: the pure derivation returns `null` when `gateEnabled === false` (the arm-6 shape).
  - Browser (MCP bridge): with the gate ON, the workspace header contains the toggle
    (`data-testid`); with the gate OFF, `document.querySelector` for that testid returns **null** —
    ⚠️ not hidden, not disabled, not an empty slot.
  - [x] P2.1 Add `supervisor_enabled: bool` to `Project` with `#[serde(default = "…")]` → `true`.
        ⚠️ **NOT `Option<bool>`** (D-4). ⚠️ Decide `skip_serializing_if` deliberately: omitting the
        key when `true` keeps existing files byte-identical.  <!-- status: DONE -->
  - [x] P2.2 `set_supervisor_enabled` in the store + `project_set_supervisor_enabled` command
        (P-B) — ⚠️ **no broadcast event** (single consumer; recorded, not an oversight).  <!-- status: DONE -->
  - [x] P2.3 Pure gated derivation mirroring `workspaceDriveModeReadout`'s signature shape;
        `!gateEnabled → null`.  <!-- status: DONE -->
  - [x] P2.4 Render in the workspace header beside the drive-mode readout (D-3). ⚠️ **Copy
        `CellValueLine`'s hit-region defences** — `stopPropagation` on **both** pointerdown and
        click, plus Enter/Space mirror + `tabIndex` (the header already carries several adjacent
        clickables; M12 hit exactly this and it presents as "the control does nothing").  <!-- status: DONE -->
  - [x] P2.5 Wire into `useSupervisor` as a **third per-turn early exit**, checked INSIDE the
        callback beside `host.enabled` / `storedMode` (AC-6) and passed as a **ref**.  <!-- status: DONE -->
  - [x] P2.6 Add the arm-6 subject **and** its OFF-assertion `it()` — ⚠️ **both**, titled to match
        the self-source regex (P-A).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE 2026-09-17 — 7 scoped checks, all clean: eslint (0 problems
        on the P2 set), tsc exit 0, cargo clippy --all-targets -D warnings clean, 5 Rust tests,
        67 frontend tests (verbose-confirmed by name), prettier clean, production build ✓, and an
        IPC name-match sweep (both new commands 1:1:1 across invoke/def/registration). -->
  - [x] verify-self  <!-- status: DONE 2026-09-17 — 4/4 outcomes PASS, 0 BLOCKING, 0 COSMETIC.
        ⚠️ Unlike Phase 1, the BROWSER outcome was genuinely satisfiable and WAS verified live:
        the toggle is a real DOM element with a data-testid, and the dev overlay grants the MCP
        bridge. Gate ON → element present (`aria-pressed="true"`, `⚙ auto`); gate OFF →
        `querySelector` null, class count 0, no `⚙` anywhere in body — absent, not hidden. A
        POSITIVE CONTROL (`[data-testid="workspace-header"]`) held true throughout, so the
        absence is a real reading and not a broken query. -->
  - [x] verify-human  <!-- status: PASS (operator, 2026-09-17) — hands-on in a live dev build.
        TWO corrections applied and re-verified before approval; see the leaves. -->
    - [x] P2.verify-human.1 Toggle renders beside the drive-mode readout as one group  <!-- status: PASS -->
    - [x] P2.verify-human.2 Click flips it immediately, no restart  <!-- status: PASS -->
    - [x] P2.verify-human.3 Survives close/reopen (persists in projects.json)  <!-- status: PASS -->
    - [x] P2.verify-human.4 Tooltip states the consequence, not the flag  <!-- status: PASS -->
    - [x] P2.verify-human.5 ⚠️ **CORRECTED — labels were `auto`/`manual`, now
          `supervised`/`unsupervised`.** `auto` collided with the DRIVE-MODE readout beside it,
          whose vocabulary already includes `autopilot`; two adjacent badges both saying "auto"
          read as one mode concept rather than two independent settings.  <!-- status: PASS after correction -->
    - [x] P2.verify-human.6 Header density accepted (⚠️ `unsupervised` is wider than the old
          `manual`, and Phase 3 adds one more badge to the same strip)  <!-- status: PASS -->
    - [x] P2.verify-human.7 ⚠️ **CORRECTED — the colour mapping was INVERTED.** Shipped
          coloured-OFF/grey-ON on the reasoning "OFF is the deliberate choice, so highlight it";
          the operator inverted it to match the STATUS-DOT palette (active=orange, quiet=grey).
          A supervised workspace is the ACTIVE case. Also caught a second error: the first draft
          used `#e0a853`, a hue present nowhere else in the stylesheet — now the exact
          `.status-dot-running` / `.status-dot-idle` values (`#d97757` / `#6e7681`).  <!-- status: PASS after correction -->
    - [x] P2.verify-human.8 Hide-when-no-drive-mode — ⚠️ **operator ruled it DOES NOT MATTER
          (2026-09-17).** Control stays visible for every project. Do not re-open this as a
          Phase 3 question.  <!-- status: PASS — ruled immaterial, not deferred -->
  - [x] verify-codify  <!-- status: DONE 2026-09-17 — extracted `supervisorToggleAction` + 13 new
        tests (8 action/IPC + 5 consuming-surface wiring guards); full gate green at 2690. Two
        rejection cases deliberately NOT codified frontend-side — see `## Test Triage`. -->

- [x] Phase 3: The suppressed marker (D-5)  <!-- status: COMPLETE 2026-09-17 —
      build → verify-auto → verify-self → verify-human (PASS, hands-on, 6/6, no corrections) →
      verify-codify. ⚠️ Unlike Phase 1, THESE verify-human leaves were actually observed by the
      operator; Phase 1's 7 carry `DEFERRED-TO-DOGFOODING`. Read the tags, not the checkboxes. -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: **yes** — the operator raised the three-state gap themselves at
    spec review ("show and control whether the supervisor is on/off/temporarily suppressed"), and
    nothing since has made suppression visible. Phase 1 shipped it entirely invisible.
  - Requirements unchanged: **yes** — D-5 stands as written (passive marker, read-only, ambient
    colour, no click-to-clear).
  - Solution still feasible: **yes, but ONE PLAN ASSUMPTION IS WRONG — see below.**
  - No superior alternative discovered: **yes** — with Phase 1 shipped, a stale watermark is
    unbounded (no timeout by design, and no clear on backspace-to-empty), so the invisible-
    suppression window is real and the marker is its only mitigation.
  **Verdict:** proceed — with the reactivity correction recorded below.

  ⚠️ **PLAN CORRECTION FOUND AT BUILD (P3.1's premise): the watermark is NOT REACTIVE.**
  `UnsentInputWatermark` is a plain mutable object in a `useRef` (`Workspace.tsx:701`), mutated
  from `term.onData`. **Refs do not trigger re-renders**, so a marker derived from it would paint
  only when something *else* re-rendered the workspace — i.e. effectively never, and
  non-deterministically when it did. The plan said "extend the Phase 2 derivation to carry the
  suppressed state" and silently assumed the value would reach render.
  ⚠️ **Naively mirroring it into state is ALSO wrong**: `push()` runs on EVERY KEYSTROKE, so a
  `setState` there would re-render a component hosting a live xterm on every character typed.
  **Resolution: notify on TRANSITIONS only.** The watermark is a boolean, so it changes at most
  twice per line (set on first keystroke, clear on submit/abandon). The holder gains an
  `onChange` callback fired only when the folded value actually differs — keystroke 2..n cost
  nothing. This keeps `fireOne`'s ref read (the authority) and adds a render signal beside it.
  **Observable outcomes:**
  - CLI: the derivation returns a marker state for (gate ON, toggle ON, watermark SET) and **no
    marker** for each of: gate OFF · toggle OFF · watermark CLEAR. ⚠️ **Four cases, asserted
    individually** — three states collapse into "no marker" and a single negative case would pass
    with two of them unimplemented.
  - Browser (MCP bridge): typing into a live CC pane makes the marker appear in the header; pressing
    Esc makes it disappear. ⚠️ Assert the marker's own `data-testid` in the DOM, **never** the xterm
    buffer, with a positive control.
  - CLI: a CSS guard couples the marker's class to its emitting component in **both** directions
    (⚠️ `arch.md`: every CSS guard here reads ONE side — emitted-but-unstyled shipped a CRITICAL,
    styled-but-unemitted shipped a live regression).
  - [x] P3.1 Extend the Phase 2 derivation to carry the suppressed state (⚠️ **same function** —
        a second derivation would be a second thing arm 6 must police).  <!-- status: DONE -->
  - [x] P3.2 Render the badge, mirroring the drive-mode readout's `⚠` stale / `⏳` pending markers.
        ⚠️ **Ambient colour — NOT AwaitingInput's alarm-blue** (D-5;
        `semantic-distance-not-just-visual-distance-for-status-colour`). Read-only: **no click
        handler**.  <!-- status: DONE -->
  - [x] P3.3 CSS + the both-directions class guard.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE 2026-09-17 — 4 scoped checks on the Phase 3 file set, all
        clean: eslint 0 problems, tsc --noEmit exit 0, prettier clean, and the 3 targeted test
        files green (59 tests). Verbose-confirmed BY NAME that the four D-5 cases assert
        individually (1/4 SUPPRESSED · 2/4 gate OFF · 3/4 toggle OFF · 4/4 no unsent input) and
        that the CSS guard reads BOTH directions plus a non-vacuity check — the two properties
        the phase's Observable Outcomes call out as false-green risks. -->
  - [x] verify-self  <!-- status: DONE 2026-09-17 — 4/4 outcomes PASS, 0 BLOCKING, 0 COSMETIC.
        ⚠️ SPLIT DRIVE, deliberately: the 3 CLI outcomes ran in the subagent; the BROWSER outcome
        was driven by the ORCHESTRATOR, because `mcp__tauri__*` is not exposed to subagents and a
        subagent would have silently fallen back to bare Vite (a known false-verdict source here).
        The subagent was told this and reported the browser outcome SKIPPED-BY-DESIGN rather than
        guessing at it.
        • Browser (live, dev build `com.claudesk.app.dev` PID 93534, MCP bridge :9223, workspace
          `scratch-a`): BOTH directions observed, twice. Typing → marker appears (0→1 nodes,
          `⚙ supervised` → `⚙ supervised ⏸`); Esc → marker disappears (1→0, glyph absent from
          `document.body.innerText` entirely — absent, not hidden). The aria-label tracks it
          ("currently held back by unsent input" present/absent). ⚠️ POSITIVE CONTROL
          (`[data-testid="workspace-header"]`) held at 1 across EVERY read, and read 0 before the
          workspace was opened — so the absence readings are real, not a broken query. ⚠️ The
          marker was ALREADY PRESENT on first observation (auto-resume had left unsent input);
          verifying from that state alone would have proved nothing, so Esc established a
          controlled baseline first.
        • CLI 1 (four D-5 cases): PASS — genuinely independent, four distinct argument tuples,
          each asserting the specific state not truthiness. gate-OFF is distinguished from the
          other two "no marker" states by asserting `null` rather than `suppressed === false`.
        • CLI 2 (both-directions CSS guard): PASS — ⚠️ mechanism checked explicitly against the
          `vitest-raw-import-css-returns-processed-not-text` trap. Reads `App.css` AND
          `Workspace.tsx` via `node:fs` `readFileSync`; the file's single `?raw` occurrence is a
          COMMENT warning against it. Confirmed independently by the orchestrator, not taken on
          the subagent's word. Component is comment-stripped before matching, so a class named
          only in prose cannot satisfy it.
        • CLI 3 (transition-only notify): PASS — mutation INDEPENDENTLY reproduced. Guard removed
          at the `private set()` one-writer funnel, mutation confirmed LANDED in executable code
          (line shown pre/post, hash changed), 3 of 29 tests failed, restored from a `cp` backup
          and verified byte-identical by `shasum` (`57e4b47c…`), `git diff` empty. ⚠️ No
          `git checkout` at any point — the whole feature is uncommitted.
        Teardown was PID-scoped (93534 + vite/esbuild); prod PID 1435 untouched; `git status`
        still reports 27 files, matching the pre-verification count. -->
  - [x] verify-human  <!-- status: PASS (operator, 2026-09-17) — hands-on in a live dev build
        (`com.claudesk.app.dev`, PID 2125), all 6 leaves PASS, no corrections requested.
        ⚠️ AUTO-SKIP GATE FAILED, deliberately, and that is why this was a real pause: gates
        (a) autopilot and (b) verify-self all-PASS were clean, but (c) FAILS — this phase HAS an
        integration boundary (rule 2: `Workspace.tsx` is an existing UI component and a new badge
        now renders in the live workspace header). (d) fails independently — the Observable
        Outcomes name the live CC pane and the header by name. F11 was therefore FORBIDDEN.
        ⚠️ Contrast with Phase 1, whose 7 leaves are `DEFERRED-TO-DOGFOODING`: THESE six were
        actually observed by the operator. Read the tags — they differ by design. -->
    - [x] P3.verify-human.1 The ⏸ marker appears while typing and reads as a sub-state of
          `supervised`, not a fourth independent state.  <!-- status: PASS -->
    - [x] P3.verify-human.2 Header density with THREE badges — the strip now carries
          `⚙ supervised ⏸` + `⇅ autopilot`. P2.verify-human.6 accepted two and flagged this;
          the third is accepted, so the density question raised at Phase 2 is now CLOSED.  <!-- status: PASS -->
    - [x] P3.verify-human.3 The dimmed-orange treatment is legible and reads as "momentarily
          muted", not as a disabled/error state. ⚠️ This is the live confirmation of the
          `reuse-the-established-status-palette-before-inventing-a-hue` prior recorded this
          session — opacity-on-the-parent-hue was the right axis, and the rejected `#e0a853`
          would have implied an independence the sub-state does not have.  <!-- status: PASS -->
    - [x] P3.verify-human.4 Tooltip copy states the consequence and names the way out.  <!-- status: PASS -->
    - [x] P3.verify-human.5 The marker is genuinely passive — clicking it toggles the supervisor
          (the parent's action) rather than clearing the marker. Confirms the spec-review
          decision to decline a click-to-clear affordance.  <!-- status: PASS -->
    - [x] P3.verify-human.6 ⚠️ No per-keystroke jank in a live pane — the transition-only
          contract is unit- and mutation-proven but its POINT is felt, not asserted. **This is
          the leaf no test could have closed**: mutant A (dropping the `if (changed)` guard) is a
          pure performance regression that survived all 24 tests, so a green suite said nothing
          about it. Observed clean on real hardware with a live xterm attached.  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: DONE 2026-09-17 — full gate GREEN at 2711 frontend (was 2704;
        +7) / 198 files, Rust ALL GREEN, Prettier clean. The lone ESLint item is the pre-existing
        `XtermPane.tsx:898` spread-in-dep-array warning (0 errors), unchanged since Phase 1.
        ⚠️ **A SURVIVING MUTANT WAS FOUND HERE — this phase's codify is a real hole closed, not a
        confirmation.** See `## Test Triage — Phase 3 verify-codify` for the full record. Summary:
        a clean, compiling mutant making the marker render off the RAW watermark
        (`supervisorReadout.suppressed || unsentInput`) — bypassing gate AND toggle at once — left
        the ENTIRE SUITE GREEN at 2709, including a purpose-built jsdom render test written
        minutes earlier in this same step. Killed by 2 new source-level guards; re-proven after a
        Prettier reflow (the reflow-breaks-a-guard failure mode is documented locally).
        **Written (2 files, +7 tests):**
        • `supervisorSuppressedRender.test.tsx` (NEW, 5 tests) — the CONSUMING SURFACE
          (integration boundary: `Workspace.tsx`). Renders the real component and asserts the
          marker is ABSENT from the resting DOM under a closed gate — not hidden, not disabled,
          not an empty slot — plus a glyph-anywhere check, a positive control, and an
          ungated-siblings check so the absence is attributable to the GATE.
          ⚠️ It does NOT assert the marker's PRESENCE and cannot: `useWorkflowFeaturesEnabled`
          seeds asynchronously, so server rendering only ever reaches the gate-OFF shape. The
          appear/disappear cycle's evidence is the LIVE MCP-bridge verify-self + the operator's
          hands-on verify-human, and the file's header says so plainly.
        • `supervisorToggleStyles.test.ts` (+2 guards) — the mutant-killers, in the established
          comment-stripped `emitted` idiom so prose cannot satisfy them: a positive one pinning
          the conditional to `supervisorReadout.suppressed &&`, a NEGATIVE one asserting the
          marker's JSX never names the raw `unsentInput` (the positive alone still passes when a
          second term is OR'd in — the exact surviving mutant), and an anti-vacuity guard pinning
          both `indexOf` anchors (a missing needle silently yields a window from `-1`).
        ⚠️ No `git checkout` at any point; every mutation restored from a `cp` backup and verified
        byte-identical by `shasum` (`a7d86790`). `cargo fmt` also applied to Phase 2's Rust test
        code, which the gate caught — the documented reason `cargo fmt --check` is in it. -->

**⚠️ Phasing rationale — why suppression ships FIRST and the marker LAST.** Phase 1 alone stops
the six-unwanted-fires defect; it is the release-worthy half and is unit-provable end to end.
Phase 2 adds the escape hatch for when the watermark is not enough. Phase 3 makes the derived state
legible. ⚠️ **If the release must be cut early, Phase 1+2 is a coherent ship and Phase 3 is the
deferrable one** — but shipping Phase 1 WITHOUT Phase 3 means suppression is invisible, which is
the write-only defect D-5 exists to prevent. **Do not defer Phase 3 silently; it is a decision.**

## Current Node
- **Path:** Feature > finalize (review-quality COMPLETE 2026-09-17 — 0 CRITICAL / 3 MAJOR /
  4 MINOR, all auto-backlogged per Mode 3; see `## Code-Quality Review`)
- **Active scope:** none — **ALL THREE PHASES COMPLETE.** Every phase ran the full
  build → verify-auto → verify-self → verify-human → verify-codify loop.
  (⚠️ Phase 1's 7 verify-human leaves carry `DEFERRED-TO-DOGFOODING` tags, not observed passes —
  read the tags, not the checkboxes. Phases 2 and 3's WERE observed hands-on.)
- **Blocked:** none
- **Unvisited:**
  `/feature-ship` — ⚠️ **ALL 29 FILES ARE STILL UNCOMMITTED; `main` is at `62baed0`, which
  contains NONE of this feature.** `git checkout -- <path>` DESTROYS work here.
- **Open discoveries:** none blocking. ⚠️ Two things ride the release rather than being closed by
  it: Phase 1's 7 `DEFERRED-TO-DOGFOODING` checks, and the unprovable-by-agent question of
  whether the interruption actually stopped (an agent-launched CC emits no hook events, so the
  supervisor never fires under agent testing —
  `SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`).
- **Open discoveries:** none

## Build record — Phase 1 (2026-09-17)

**Files:** `src/state/supervisor/unsentInput.ts` (new) · `fanOut.ts` · `useSupervisor.ts` ·
`XtermPane.tsx` · `Workspace.tsx` · two test files (`unsentInput.test.ts` new, `fanOut.test.ts` +
`useSupervisor.test.ts` extended).

**`pnpm verify:auto`: GREEN** — frontend **2649 passed** (was 2613; +36), Rust all green, 0 errors.
The single ESLint warning (`XtermPane.tsx:895`, spread in a `useEffect` dep array) is
**pre-existing and unrelated** — it predates this feature and was not introduced here.

### ⚠️ Mutation evidence — four mutants, each killed by its OWN intended test

A green suite proves the tests ran, not that they **bite**. Each mutant was applied
**individually**, confirmed to have landed in **executable** code, and reverted from a `/tmp`
snapshot verified by `shasum` (⚠️ `git checkout` is INAPPLICABLE to `unsentInput.ts` — it is
untracked, and `git-checkout-no-ops-on-untracked-file` records that it exits 0 having done
nothing).

| # | Mutation | Killed by | Survivors |
|---|---|---|---|
| 1 | Delete the suppression check from `fireOne` | 3 tests incl. the injector-spy assertion | none |
| 2 | Move the check **before** the ledger claim | *"a suppressed turn CONSUMES its ledger claim"* — **that test alone** | none |
| 3 | Drop `0x1b` (ESC) from `CLEARING_BYTES` | *"clears on ESC"* + the set pin — **only those two** | none |
| 4 | Replace the ordered fold with a naive `.some(contains)` | the two order tests — **only those two** | none |

⚠️ **Mutants 3 and 4 are the ones that matter methodologically:** each killed *exactly* its
intended tests and nothing else, which is what shows the per-byte and order cases are
**independently attributed** rather than passing as a block. A single "clears on a control byte"
case would have survived mutant 3.

## Codify record — Phase 1 (2026-09-17)

**Integration boundary: YES** (`XtermPane.tsx` — an existing UI component). So the test set had to
exercise the consuming surface, not only the new module.

**Coverage audit first (§2 — skip what is already covered):** the watermark state machine, the four
clearing bytes, the suppression placement, the ledger-claim semantics and AC-7 were all already
covered by build-time tests and were **not duplicated**. One real gap remained.

### ⚠️ The gap: the `onData` handler body was never EXECUTED by any test

Every reference to it was a comment or the AC-7 **source-text** guard. That guard proves a
*shape* — one push site, and `autoResumeFire.ts` never mentions the watermark — but `arch.md` is
explicit that **`?raw` guards verify STRUCTURE, never RUNTIME**, and the handler carried an
*ordering* property no source-text predicate can express:

⚠️ **The watermark is fed BEFORE the session-id guard and BEFORE base64 encoding.** A refactor
tidying the early return upward, or feeding the encoded chunk, would **compile, pass `tsc`, and
pass every existing test** — the standing local defect shape.

**Action (`extract-for-import-when-a-raw-guard-cant-express-the-property`):** extracted
`routeCcInput` (`src/components/workspace/ccInputRouting.ts`) as a pure function and rewired the
handler through it, so the property is a **value a test asserts** rather than a shape a guard
approximates. ⚠️ **The AC-7 structural guard STAYS** — it covers a different property (the wiring
shape across three files) and still passes against the refactored handler.

**6 new tests** (`__tests__/ccInputRouting.test.ts`), both failure directions mutation-proven:

| Mutation | Killed by |
|---|---|
| Watermark skipped when the session is dead (`sessionId ? chunk : ""`) | the 2 dead-session tests, with the assertion message naming the cause |
| Watermark fed the ENCODED chunk (⚠️ would mean `\r` is never seen → watermark **never clears** → workspace permanently unsupervised) | **all 6** |

The CR test carries its own **positive control** — it asserts the encoded form does *not* clear, so
the two are genuinely distinguishable and a swap cannot pass unnoticed.

**Full gate: GREEN** — 194 files / **2656** tests (was 2650), Rust green, 0 failures, no
regressions. No test failures, so the §3b triage path did not apply. File restored after each
mutant and proven by `shasum` (`6884dae5…`).

## Build record — Phase 2 (2026-09-17)

**Files:** `config_store/mod.rs` (field + `supervisor_enabled_default` + set/read + 5 tests) ·
`config_store/commands.rs` (set + get commands) · `lib.rs` (registration) ·
`cc/workspaceSupervisor.ts` (new, the gated derivation) · `cc/supervisorToggleIpc.ts` (new) ·
`useSupervisor.ts` (third per-turn condition) · `Workspace.tsx` (state/ref/load/toggle/render) ·
`App.css` · 3 new test files + arm-6 subject in `offInvariantGuard.test.ts`.

**`pnpm verify:auto`: GREEN** — frontend **2673** (was 2656; +17), Rust green, 0 errors. The one
ESLint warning (`XtermPane.tsx:898`) is pre-existing and unrelated.

### ⚠️ Mutation evidence — three mutants, each killed by its OWN intended guard

| # | Mutation | Killed by | Why it matters |
|---|---|---|---|
| A | `supervisor_enabled_default()` → `false` | 3 Rust tests | **The upgrade defect.** Every existing `projects.json` lacks the key, so a `false` default would silently unsupervise the whole rotation on first launch with no UI change to explain it. |
| B | `=== false` → truthiness (`if (!ref.current)`) | both new `useSupervisor` wiring guards | **The not-loaded window.** `null` means "`projects.json` not read yet"; a truthy check reads that as OFF and the supervisor is silently dead on every workspace open. |
| C | Delete `if (!gateEnabled) return null` | the arm-6 OFF assertion | The OFF-invariant: a gated surface must **not exist** when the gate is off. |

Each applied **individually**, confirmed landed in **executable** code, restored from a `/tmp`
backup and verified by **content** (not only `shasum`) — ⚠️ `git checkout` is the wrong restore
here in both directions (untracked → silent no-op; tracked-but-dirty → reverts to HEAD and
**destroys** the uncommitted WP0 work, which is exactly what bit a subagent at Phase 1).

### Decisions taken at build (recorded so they are not re-derived)

- ⚠️ **`read_supervisor_enabled` / `project_get_supervisor_enabled` degrade to `true`, the
  OPPOSITE posture from the drive-mode getter beside them.** There, `None` means "pin no mode" —
  safe for a value consumed as an env var. Here, `false` is *a policy decision the operator made*,
  so it must never be manufactured by an unresolvable data dir or an unreadable list.
- ⚠️ **A `<span role="button">`, NOT a `<select>`.** The picker-row drive-mode cell uses a native
  `<select>` because its four values are a closed set whose bad string fails serde; a **boolean**
  has nothing to mistype, so that argument does not transfer and the lighter surface wins.
  Hit-region defences (`stopPropagation` on pointerdown AND click, Enter/Space mirror, `tabIndex`)
  are copied from `CellValueLine` — the header now carries several adjacent clickables and M12 hit
  exactly this.
- **The toggle does NOT depend on `default_drive_mode`.** Hiding it for a mode-less project would
  mean the operator could never pre-set it, and the control would appear/disappear as the mode is
  set and cleared. Pinned by an arity assertion so the independence is structural.
- **The setter errors rather than inserting** for an unknown project — a write that vanishes on the
  next read is worse than an error, because the toggle would appear to do nothing.
- **A both-directions CSS guard** ships with the classes (the plan put it at P3.3, but the classes
  land here). `arch.md` records that both directions have shipped real defects.


### Phase 2 verify-self — live evidence (2026-09-17)

⚠️ **THE BROWSER OUTCOME WAS ACTUALLY OBSERVED HERE, unlike Phase 1.** Phase 1's was withdrawn as
unsatisfiable (a `useRef` in a closure has no DOM surface, and an agent-launched CC emits no hook
events). Phase 2's toggle is a real element, so the gate invariant is now **live-proven**, not
only unit-proven:

| Gate | Observed |
|---|---|
| ON | `<span role="button" data-testid="workspace-header-supervisor" aria-pressed="true" …>⚙ auto</span>` |
| OFF | `querySelector` → `null`; `.workspace-header-supervisor` count `0`; no `⚙` in `document.body.innerHTML` |

⚠️ **The positive control is what makes the OFF reading trustworthy** — `[data-testid="workspace-header"]`
stayed `true` in the SAME read, proving the query mechanism worked while reporting absence
(`xterm-dom-reads-fake-a-blank-pane`: an absent-element reading with no control is worthless).

**Isolation held, verified independently by the orchestrator afterwards:** the check ran against a
DEV build (`com.claudesk.app.dev`, PID 68801) — the operator's live PROD app (PID 1435) was alive
and untouched at teardown, dev/prod `settings.json` are separate files carrying different values,
and the flipped gate was restored to `true` in dev. Teardown was **PID-scoped**
(`kill 68801`), never a name-based `pkill` — dev and prod process names collide and a blanket kill
killed the operator's live app once before.

⚠️ **`mcp__tauri__*` is not exposed to subagents** (the known gap), so the subagent drove the
bridge's raw WebSocket on `127.0.0.1:9223` directly. Worth knowing: the bridge IS reachable from a
subagent that way, which widens what future verify-self runs can observe.

## Test Triage — Phase 3 verify-codify: a SURVIVING MUTANT, not a failing test (2026-09-17)

**Classification:** Not a test failure — a deliberate mutation that SURVIVED, i.e. a measured
coverage hole in the tests this feature shipped. No production code was wrong; no test was
obsolete. Recorded here because the §3b discipline is what produced it.
**Confidence:** high — reproduced twice, with the mutation confirmed landed in executable code
(`sed -n '1039p'` shown pre/post, file hash changed `a7d86790` → `760bf1da` → `25ca9970`), and
the mutant confirmed CLEAN (compiles, `tsc --noEmit` exit 0, renders without throwing — the
precedent file warns that a *crashing* mutant's failures are worthless).

**Evidence:** making the marker's conditional read the raw watermark
(`supervisorReadout.suppressed || unsentInput`) instead of the gated derivation left the **ENTIRE
SUITE GREEN at 2709 tests / 198 files**. That mutant bypasses the gate *and* the per-workspace
toggle at once: it would paint a ⏸ on a workspace whose supervisor is OFF, and on one whose
workflow-features gate is closed entirely — a visible artifact of a feature the user never opted
into, which is precisely the OFF invariant.

⚠️ **The purpose-built jsdom render test written minutes earlier in this same verify-codify did
NOT catch it, and could not.** Under a closed gate `workspaceSupervisorReadout` returns `null`,
so the whole badge subtree — mutated line and all — is never evaluated; and
`useWorkflowFeaturesEnabled` seeds asynchronously, so server rendering can only ever reach the
gate-OFF shape. **The one arm where the mutant bites is the one arm a render test cannot reach.**
This is the local four-times defect shape again (extracting/deriving a mechanism proves the
MECHANISM, not its CALLER) and `arch.md`'s most-repeated one, verbatim: *"a mechanism correct in
itself sitting behind a caller that does not honor it."*

**Action:** added two guards to `supervisorToggleStyles.test.ts` (the established comment-stripped
`emitted` idiom, so prose cannot satisfy them): a positive one pinning the conditional to
`supervisorReadout.suppressed &&`, and — because the positive alone still passes when a second
term is OR'd in — a **negative** one asserting the marker's JSX does not reference the raw
`unsentInput` state at all, plus an anti-vacuity guard pinning both `indexOf` anchors (a missing
needle silently yields a window from `-1`). Re-applying the identical mutant now **fails 2 tests**;
restored from a `cp` backup, `shasum` byte-identical to baseline `a7d86790`. ⚠️ **No
`git checkout` at any point** — the whole feature is uncommitted.

⚠️ **The render test was KEPT, not discarded.** It closes a different property the source guards
cannot express (the marker is genuinely ABSENT from the resting DOM under a closed gate — not
hidden, not disabled, not an empty slot) and carries the glyph-anywhere check. Its header comment
states plainly that it cannot reach the ON shape and that the live MCP-bridge + verify-human
evidence is the real proof of the appear/disappear cycle.

## Test Triage — the two IPC rejection tests (2026-09-17)

Classification: **Test-harness limitation. The production code is correct and was never changed.**
Confidence: **high** — established by a standalone probe plus bisection, not by reading a stack.
Evidence: the failures carry a bare `Error: ipc down` / `Error: no project record` with **no
`AssertionError`** — i.e. the assertions PASSED and vitest failed the tests on an **unhandled
rejection**. The mocked `invoke: (...a) => invokeMock(...a)` wrapper yields a rejected promise per
call that nothing else consumes, and vitest reports it regardless of the production `.catch`
running. A standalone probe confirmed `getProjectSupervisorEnabled` resolves `true` on rejection.

⚠️ **I MISDIAGNOSED THIS THREE TIMES BEFORE GETTING IT RIGHT — recorded, not tidied away:**
1. *"`mockRejectedValue` builds the promise eagerly"* → switching to `mockImplementation` did not
   fix it. **A stack frame naming where an `Error` is CONSTRUCTED says nothing about which handler
   failed to catch it.**
2. *"the per-test `await import()` re-binds the mock"* → a static import did not fix it either.
   The probe that seemed to prove this ALSO changed the test count, confounding the variable.
3. *"`mockReset` strips the implementation"* → `mockClear` did not fix it.
**The lesson: I read a symptom and generalized, three times, instead of first asking what the
failure output actually SAID.** `grep -iE "AssertionError|Unhandled"` answered it in one command.

Action: **no production change at any point.** The two rejection cases were REMOVED from the
frontend suite with an inline comment stating where the contract is actually enforced — the Rust
side owns degrade-to-ON (`project_get_supervisor_enabled` returns `true` on every failure path,
pinned by `an_unknown_project_reads_as_supervised` and `an_absent_supervisor_enabled_key_reads_as_on`).
The frontend `.catch` is a second line of defense, verified by probe. ⚠️ **This is a deliberate
coverage decision, not a silent drop** — chasing the harness further would have been re-proving a
property that is already proven on the side that owns it.

## Codify record — Phase 2 (2026-09-17)

**Integration boundary: YES** (`Workspace.tsx`), so the set includes consuming-surface tests, not
only unit coverage of the new modules.

**Coverage audit first:** the derivation, the OFF-invariant arm, the CSS palette and the Rust
store were already covered and were **not duplicated**. Two real gaps remained, both on the
consuming surface.

### Gap 1 — the toggle's CLICK behavior was never driven

The flip + revert lived inside a `useCallback` no test could reach. Extracted as
`supervisorToggleAction` and rewired through it. ⚠️ **The load-bearing property is
`revertTo: previous`, NOT `!next`** — they agree for every boolean and disagree exactly when the
value had not loaded (`null`), where `!next` would fabricate a state the store never reported.
A failed write must leave the UI honest, because a toggle stuck on "unsupervised" while the
supervisor keeps firing is the precise confusion WP0 exists to end.

### Gap 2 — the consuming surface itself

5 source-level guards pin that `Workspace.tsx` **calls** the extracted action, destructures
`revertTo`, has a failure arm at all, passes `supervisorEnabledRef` to `useSupervisor`, and reads
the stored value on reveal. *"The module is correct"* says nothing about whether the component
uses it — the standing local defect shape.

**Full gate: GREEN** — 197 files / **2690** tests (was 2677), Rust green, 0 errors.

⚠️ **One coverage decision taken deliberately:** two IPC rejection cases were removed rather than
forced through a hostile mock. The contract they assert is owned and pinned on the Rust side; the
frontend `.catch` is a second line of defense, verified by probe. The full misdiagnosis trail is
in `## Test Triage` — including three wrong hypotheses before reading what the failure output
actually said.

## Build record — Phase 3 (2026-09-17)

**Files:** `unsentInput.ts` (transition-only `onChange` + a single-writer `set()`) ·
`workspaceSupervisor.ts` (the `suppressed` state + glyph + copy) · `Workspace.tsx` (state mirror,
marker render) · `App.css` · `useSupervisor.ts` (withhold logging — see below) · 3 test files.

**`pnpm verify:auto`: GREEN** — frontend **2704** (was 2690; +14), Rust green, 0 errors.

### ⚠️ The plan's premise for P3.1 was WRONG, and the correction is the phase's main content

The plan said *"extend the Phase 2 derivation to carry the suppressed state"* and assumed the
value would reach render. **It would not have.** `UnsentInputWatermark` is a plain mutable object
in a `useRef`, mutated from `term.onData` — **refs do not trigger re-renders**, so the marker
would have painted only when something *else* re-rendered the workspace: effectively never, and
non-deterministically when it did. Caught by reading the holder before implementing, not by a
failing test (nothing would have failed).

⚠️ **The obvious fix is also wrong:** mirroring into state from `push()` would `setState` on
**every keystroke**, re-rendering a component that hosts a live xterm. **Resolution — notify on
TRANSITIONS only:** the watermark is a boolean, so it changes at most twice per line; the holder's
single-writer `set()` compares before calling `onChange`, so characters 2..n cost nothing.
⚠️ **The ref stays the authority for `fireOne`** — React state can be one commit stale at the
moment of an irreversible injection. The two are deliberately not merged.

### ⚠️ Mutation testing found a REAL coverage hole (not just confirmation)

| # | Mutation | First result | After |
|---|---|---|---|
| A | Notify unconditionally (drop `if (changed)`) | ⚠️ **SURVIVED** — all 24 tests passed | 5 tests added; now killed by 3 |
| B | `suppressed = unsentInput` (ignore `enabled`) | killed by case 3/4 | — |

⚠️ **Mutant A is the one worth remembering.** The per-keystroke re-render defect would have
shipped invisibly: it changes no observable behavior, only cost. A green suite said nothing about
it. This is the case for mutation-proving a *performance* contract, not only a correctness one.

Also strengthened: `workspaceSupervisorReadout.length === 3` now passes **only because Phase 3's
new param has a default** (`.length` stops at the first default), so the assertion had become
quietly weaker than it reads. The real property — the function cannot consult a drive mode it
never receives — is now asserted directly against its source.

### Operator request handled mid-phase — supervisor withhold logging

⚠️ **`fireOne` computed a precise `reason` for every non-fire and `useSupervisor` threw it away**,
logging only the `fired` branch. So *"why didn't it chain there?"* had no answer short of reading
code — and WP0 adds `unsent-input-present`, whose false-positive rate is **exactly what dogfooding
must measure**. Added one `else` arm: `supervisor: withheld in <id> — <reason>`.
⚠️ **The recycle arm is excluded** (`!outcome.recycle`) — a recycle also reports `fired: false`
with a reason, and the caller already logs its started/DECLINED arms distinctly; logging here too
would double-report the loudest branch and bury the ordinary withholds.

## Code-Quality Review — supervisor-hotfix

*Run 2026-09-17 against ship commit `a46ae89` (base `62baed0`). Mode 3 (autopilot): MAJOR
auto-backlogged with chat surface; MINOR auto-backlogged. **0 CRITICAL.***

⚠️ **All three MAJOR findings were INDEPENDENTLY VERIFIED by the orchestrator before backlogging**
— the pin really does read `.toBe(9)` while both docs say 8; both reads really do sit behind
`if (!workflowEnabled || !visible) return;`; `clear()` really has zero production callers (the
`.clear()` greps that do hit are unrelated `Map`/`Set` calls).

### Strengths
- `unsentInput.ts` is the right abstraction at the right size: a pure byte-level reducer plus a
  thin holder with a single-writer `set()` funnel, which makes "last clearing byte in the chunk
  wins" a testable value — the `\rabc` vs `abc\r` case a `chunk.includes("\r")` implementation
  gets wrong.
- The suppression check's placement in `fireOne` (after the ledger claim, immediately before
  `deps.inject`) is correct for the stated failure direction, and the reasoning is encoded in a
  behavioral test rather than only in prose.
- `ccInputRouting.ts` is a genuinely good extraction: the two properties that matter (watermark fed
  *before* the session guard, and *raw* not base64) are unreachable by a source-text guard and are
  asserted as values — including a positive control proving the encoded form would NOT clear.
- The Rust field lands the upgrade path correctly and pins it: a named `supervisor_enabled_default()`
  rather than `#[serde(default)]` (whose `bool::default()` is the silently-wrong direction), tested
  against real pre-WP0 JSON bytes plus a round-trip so the default cannot mask a stored value.
- Failure directions are deliberate and consistent across the IPC boundary: the getter degrades to
  `true` everywhere, the setter errors rather than silently inserting, and the frontend mirrors it —
  with the asymmetry against the drive-mode getter explained rather than left looking inconsistent.

### Issues

**CRITICAL**
- (none)

**MAJOR** — all three auto-backlogged to `backlog-quality-findings.md`
- [`arch.md:71` + `CLAUDE.md`] The OFF-invariant arm-subject count went 8 → 9 in this commit, but
  both authoritative docs still say **8 subjects**, and `arch.md` cites a line number now ~70 off.
  → `SURFACE-2026-09-17-QUALITY-ARM-SUBJECT-COUNT-STALE-IN-TWO-AUTHORITIES`
- [`Workspace.tsx`] The toggle is read **on reveal only**, but the supervisor **fires in unfocused
  workspaces by design**, so a background workspace's ref holds whatever the last reveal fetched.
  ⚠️ A DESIGN CALL, not a reflex fix — D-4's no-broadcast is settled and the default degrades to ON.
  → `SURFACE-2026-09-17-QUALITY-TOGGLE-READ-ON-REVEAL-BUT-SUPERVISOR-FIRES-UNFOCUSED`
- [`unsentInput.ts`] `UnsentInputWatermark.clear()` has **no production caller** while its doc
  comment describes one ("used at a turn boundary") — the
  `rustdoc-link-to-a-nonexistent-test-fails-no-gate` shape in TypeScript form.
  → `SURFACE-2026-09-17-QUALITY-WATERMARK-CLEAR-HAS-NO-PRODUCTION-CALLER`

**MINOR** — auto-backlogged
- [`config_store/mod.rs`] A doc block changed owners: the new upgrade-path prose appended onto the
  previous test's comment, leaving the drive-mode test undocumented.
- [`supervisorToggleStyles.test.ts`] The `CLASSES` constant pins only **its own length** — nothing
  couples it to the CSS scan or the emitted set, so a fourth unguarded class still passes.
- [IPC boundary] No test pins the `path` / `enabled` argument names across the TS↔Rust binding —
  ⚠️ the precedent exists in this feature's own neighbourhood (`useSupervisor.test.ts` does exactly
  this for `supervisor_adjudicate` / `wip_read`) and was not applied.
- [three `src/cc/` modules] The "do not merge us" defence is repeated four times across ~95 lines of
  header prose for ~40 lines of code. A comment-budget observation, NOT an argument for merging.

### Assessment
Well-built work that clears the bar the milestone sets for itself. The core mechanism — a byte-level
state (not a recency race) fed from a verified single chokepoint, read as a thunk at the last
possible moment before an irreversible injection — is the right design for the reported defect, and
the two hardest judgment calls (suppression after the ledger claim; watermark fed before the session
guard) are both correct and pinned behaviorally rather than by prose. The Rust side is small, honest
about its failure directions, and tests the one property that would have been catastrophic (absent
key → ON) against real pre-upgrade bytes. Test weight is well-placed at the reducer and the
caller-side wiring guards; the remaining thinness is at the IPC-name boundary, where this repo has
been bitten before. The debt accrued is small and mostly documentary. The one design-shaped finding
— the toggle's reveal-only read against a supervisor that fires in background workspaces — is worth
a decision rather than a fix-by-reflex, since the settled no-broadcast ruling and the safe
`null`-reads-as-ON default together bound the damage.

### If you disagree
Dismiss any finding by editing this section and marking the line `[DISMISSED]` before
`/feature-finalize` archives this WIP. A dismissed finding is skipped by the severity-tier matrix
— ⚠️ but its entry in `backlog-quality-findings.md` must be deleted by hand in the same pass.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-09-17] P1.5 / Phase 1 verify-self — **The AC-7 test was an EQUIVALENT MUTANT and
was strengthened in place.** Found by the verification subagent, which reported (unprompted) that
the test *survived* the suppression-guard mutation. ⚠️ **The weakness was sharper than "survives a
mutation": `hasUnsentInput` was a hardcoded `{value:false}` stand-in, so the test could not fail
regardless of what `injectCommand` did** — it asserted *"the machine does not suppress itself"*
while measuring *"two independent turns both fire"*. Fix: (a) the behavioral test now drives a
**real `UnsentInputWatermark`** whose injector feeds it — modelling the failure being excluded —
plus a **positive control** asserting the wiring actually wrote to it, so the final assertion
cannot pass vacuously; (b) a new **`AC-7 (structural)`** test asserts at the wiring layer that
exactly ONE site pushes into the watermark and that `autoResumeFire.ts` never mentions it.
**Mutation-proven:** making `injectCommand` feed the watermark (the real AC-7 violation) and
adding a second `push` call site are BOTH killed by the structural guard — ⚠️ **and the behavioral
test passed under the first mutant**, confirming the subagent's diagnosis exactly and showing the
new guard covers a hole the old test could not see. Files restored and proven by `shasum`.
⚠️ **Shortcut gates:** trivial extension of the just-written leaf ✅ · re-verified by a **freshly
spawned** subagent ✅ · this audit entry ✅.

[SURFACED-2026-09-17] Phase 1 verify-self — **An Observable Outcome named a browser check for
state whose observable surface a LATER phase builds.** Phase 1's watermark lives in a `useRef`
inside a closure; the outcome said to read "the pure module's exported state", which does not
exist. The satisfiable form already sat in Phase 3 (the D-5 marker IS the surface). ⚠️ The
tempting workarounds — fiber traversal, or exporting mutable state for the test — would each have
produced a **green verify-self that demonstrated nothing**. Outcome withdrawn from Phase 1 with
the reasoning recorded inline rather than silently dropped. Logged as
`SURFACE-2026-09-17-OBSERVABLE-OUTCOME-WRITTEN-FOR-A-SURFACE-A-LATER-PHASE-BUILDS` (medium).

## Elicitation record

### Asked

1. **Watermark decay — how does "unsent input present" clear?** → **Clear on known buffer-clearing
   keys** (`\r`, Esc, Ctrl+C, Ctrl+U). Operator chose this over strict-`\r`-only (indefinite
   suppression) and over adding an idle timeout (re-introduces the time-race ruling 2 rejects).
   Recorded as D-2 with its accepted cost.

### Assumed (defaults taken WITHOUT asking — review these)

- **The toggle is a plain `bool`, not a tri-state.** No Off/On/Auto. `explicit-selectable-mode-over-inferred-mode`'s
  risk-surface rule points here: there is no third regime to infer, so a third state would add
  surface for nothing.
- **The toggle is per-PROJECT (persisted in `projects.json`), not per-SESSION.** It survives Recycle
  and reopen — answering the WIP's third open question in the affirmative. A setting that resets on
  respawn would be re-disabled by hand after every recycle.
- **No new Tauri command if an existing setter generalizes.** `set_default_drive_mode`'s shape is
  the model; plan decides whether to add `set_supervisor_enabled` or widen an existing writer.
- **Toggling OFF does not cancel an in-flight adjudication.** The check is at `fireOne` entry and
  per turn; an adjudication already running finishes and is discarded at the fire check. Simpler,
  and the adjudicator is read-only.
- **The watermark is per-workspace, held in a ref**, mirroring `FireLedger`'s lifetime discipline —
  a watermark recreated per turn would remember nothing.
- **No new status-surface signal** *(narrowed by D-5 — read that first)*. The filmstrip / PiP /
  menu-bar dots do not gain a "supervision off" indicator; those are genuinely other surfaces and a
  fourth would need sync code paid forever (`new-surface-must-earn-its-place-against-existing-ones`).
  ⚠️ **This assumption originally also excluded a SUPPRESSED marker on the workspace header, which
  was a MISAPPLICATION of that prior** — a badge on the control already being built is not a new
  surface and duplicates nothing. Corrected at operator review; see **D-5**.
- **Turn-end still runs its transcript read when the toggle is OFF?** → **No.** The toggle is
  checked early, beside `host.enabled`, so an off workspace pays no IO. Cheap to reverse if the
  plan finds a reason to gather evidence anyway.
- **Copy for the control is decided at plan/build**, not spec. Cheap to change, caught at
  verify-human.

## Open Questions

**All three pre-spec open questions are now closed.**

- [x] **Which input paths bypass `term.onData`?** → **D-1.** Enumerated: exactly two `cc_input`
      sites; paste and `term.input()` both route through `onData`; the only non-`onData` writer is
      `injectCommand`, which is the machine's own funnel and must NOT set the watermark (AC-7).
      Residual: CC's internal buffer only.
- [x] **Where does the toggle live?** → **D-3.** Workspace header, beside the drive-mode readout.
      `set-a-spawn-time-choice…`'s own rule sends a continuously-read control to the instance.
- [x] **Does the toggle need to survive a Recycle?** → **Yes** (Assumed, above). Per-project in
      `projects.json`.

**Carried to plan (implementation-level, not spec-level):**

- [ ] Does arm 6's subject list in `offInvariantGuard.test.ts` need to widen for the new control,
      or is it covered by the existing `WORKSPACE-DRIVEMODE` subject? (Out of Scope note above.)
- [ ] Widen an existing config setter vs. add `set_supervisor_enabled`.
