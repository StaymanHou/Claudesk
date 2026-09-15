# Feature: Supervisor hotfix — per-workspace toggle + unsent-input suppression

**Workflow:** feature
**State:** spec (not started — needs `/feature-spec` or `/feature-plan`)
**Created:** 2026-09-15
**Entry:** TBD — see "Entry point" below
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
  `operator-helpful-friend-misfiring-as-offswitchable-setting` (default to the operator's benefit,
  off-switchable).
- ⚠️ **"While typing" is NOT good enough — the predicate is UNSENT INPUT PRESENT.** Operator
  correction, and it is the load-bearing distinction of the whole feature: *"typing"* is a **race**
  on keystroke recency; *"there is a buffered line you walked away from"* is a **state**. A
  debounce-on-recent-keystrokes implementation does not satisfy this ruling and should be rejected
  at review.
- ⚠️ **Do NOT flip `workflow_features_enabled` off as a stopgap** (explicit). The blunt gate costs
  the Docs panel and the rest of the workflow layer.
- **Reopen the fire policy properly — but only AFTER this patch ships and is released.**
  Sequencing is deliberate; this WIP must not grow into that.

## Acceptance Criteria

1. A **per-workspace supervisor toggle** exists, **defaults ON**, persists in `projects.json`, and
   takes effect **without a restart**. ⚠️ A malformed or absent value reads as **ON**, never a
   crash — the picker-row drive-mode precedent (a bad mode string fails serde and takes the whole
   project list down) applies.
2. When a workspace has **unsent input in its CC pane**, the supervisor **does not fire** into it.
   ⚠️ "Unsent" means *entered but not submitted* — a line typed and left sitting must suppress,
   not only a keystroke in the last N ms.
3. Suppression happens **before** `injectCommand` is called — it has no retry and no undo.
4. The toggle is reachable **at the moment the supervisor misfires**, not only from a surface the
   operator must navigate to. ⚠️ **`set-a-spawn-time-choice-where-the-spawn-is-chosen` does NOT
   govern this**: the supervisor is not a value read once at spawn, it acts every turn — so the
   prior's rationale (put it where the creation is chosen) does not transfer. Placement is a real
   design decision for spec/plan.
5. `pnpm verify:auto` passes.
6. Shipped as a **patch release**.

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

## Technical Constraints

### The seam (verified by reading source, 2026-09-15)

- **`term.onData` (`XtermPane.tsx:626`)** is the single chokepoint for every keystroke Claudesk
  forwards **into** the pty. This is the watermark's hook point.
- **`fireOne` (`src/state/supervisor/fanOut.ts`)** is where the suppression must be consulted.
- **`injectCommand` (`src/components/workspace/autoResumeFire.ts:172`)** is the single injection
  funnel — and has **no retry, no undo, no pre-send cancel window**.
- **`useSupervisor` (`src/state/supervisor/useSupervisor.ts`)** already early-exits on two
  conditions, re-checked **per turn** (not only at subscribe): `!host.enabled` (the M10.9 gate,
  line ~110) and `storedMode === null` (line ~115). The new toggle is a **third** such condition
  and should follow the same per-turn re-check discipline — the gate can flip mid-turn and the
  fire is the irreversible half.

### ⚠️ The architectural constraint that shapes the whole design

CC's input box lives **inside the PTY** — it is terminal output, not a DOM field. `CLAUDE.md`:
*"PTY byte-injection for input; hook channel for state. ⚠️ **NEVER from PTY output.**"*

**So "is the input box non-empty?" is not directly observable without breaking that rule.**
⚠️ **Scraping the xterm buffer was CONSIDERED AND REJECTED** — it violates the rule, and memory
`xterm-dom-reads-fake-a-blank-pane` documents that exact read producing **false verdicts** (rows
read empty; `innerText` returns xterm's injected stylesheet).

**The chosen approach — a keystroke watermark — infers the state from what Claudesk sends IN:**
input bytes forwarded since the last turn ended, with no `\r` since ⇒ unsent input present. No PTY
output is read, so the rule holds by construction.

⚠️ **THE KNOWN WEAKNESS, stated up front so it is not discovered as a surprise:** the watermark is
an **inference**, not an observation. Any input path that does **not** route through `term.onData`
is invisible to it — paste implementations, programmatic writes, text typed before Claudesk
attached. **Task 0.2 exists to enumerate those paths before the suppression is trusted.** A
suppression with an unknown blind spot is worse than none, because it *will* be trusted.

## ⚠️ What an agent cannot verify here

**An agent-launched CC emits no hook events**
(`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`), so **the supervisor will
not fire under agent testing at all.** Consequences for this feature's verification:

- ✅ **Unit-provable:** the watermark state machine, the toggle gating the call, persistence and
  malformed-value fallback.
- ❌ **NOT agent-provable:** *"does it actually stop interrupting the operator."* That is a
  **dogfooding check only the operator can make.**

⚠️ **Do not present a green suite as evidence the interruption stopped.** Say which half is proven.
This is the same trap M15 itself closed with an explicitly-unmet exit criterion rather than a
falsely-ticked one.

## Entry point

⚠️ **Fails the small/simple criteria on at least two counts**, so this wants `/feature-spec`, not
`/feature-plan`:
- It **requires an architectural decision** — the suppression signal trades against a standing
  project rule (no PTY-output reading), and the chosen watermark is an inference with a known
  blind spot whose extent is not yet enumerated.
- It **adds a persisted data field** (`projects.json`), with a malformed-value path that has bitten
  this project before.

It is otherwise small (Size S) and the shape is well understood.

## Open Questions

- [ ] **Which input paths bypass `term.onData`?** (task 0.2) ⚠️ **Answer this before trusting the
      suppression** — it bounds what the fix actually covers.
- [ ] **Where does the toggle live?** Acceptance criterion 4 says "reachable when it misfires."
      Candidates: the workspace header, the filmstrip tile's context menu, the picker row (⚠️ but
      see criterion 4 — the spawn-time-placement prior does **not** govern here). Decide at spec.
- [ ] **Does the toggle need to survive a Recycle?** Recycle tears down and respawns the CC session;
      the toggle is a per-workspace/project property, so it likely should — confirm at spec.
