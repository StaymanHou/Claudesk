---
stage: verified
state: in-progress
updated: 2026-08-14
workflow: feature
milestone: 13
work_package: WP2
drive_mode: autopilot
---

# M13 WP2 — Skill buttons: a tiny fixed set, and the gated surface

## Problem

Four workflow skills the operator fires by name, plus Recycle, become clicks. Metric #3 of six
vision success metrics ("no slash-command typing for common skills") is carried by this WP.

**The SHAPE is settled and MUST NOT be re-opened** — WP1 Q1, measured from 2470 transcripts,
operator sign-off 2026-08-14: a **TINY FIXED SET**, never a per-skill registry. Full data +
rejected options: `workflow-system/product/archive/` (WP1 probe) and `wbs.md` → WP2.

**The MEMBERS are SIX** (the floor moved 5 → 6 at plan time on a new measurement — see D3):

1. `/session-start` — the existing button (`Workspace.tsx:413`); the row grows around it
2. `/session-capture`
3. `/util-prune-claude-md`
4. `/util-backlog-paydown`
5. `/session-restore` — ⚠️ **ADDED at plan time 2026-08-14, reversing WP1's exclusion.** The
   exclusion rested on "M12 auto-fires it", which the measurement showed does not cover the
   dominant flow (post-`/clear`, workspace already open). See D3 for the full reasoning; ⚠️ the
   superseded rationale in `wbs.md` must be corrected there too.
6. **Recycle Session** — ⚠️ **WP3's** operation. WP2 renders its button; the button is a caller of
   a WP3 API that does not exist yet. See P3 for how that is sequenced without a dead affordance.

⚠️ **No member is conditional.** Dropping any is a scope reduction requiring its own decision, not
an implementation detail.

## Decisions taken at plan time (2026-08-14)

**D1 — Placement: the WORKSPACE HEADER, extending the existing button in place.** Operator
decision. The header already holds `.workspace-session-start` (`Workspace.tsx:413`), so the
"exactly one `/session-start` affordance" rule resolves by construction — the row grows around
the button that is already there rather than moving it. No active-workspace lookup is needed:
each workspace's row fires into its own pane. Rejected: the right-panel tab row (skill buttons
next to editor/diff tabs they have nothing to do with); one app-level row (matches the WBS's
"active workspace" wording and yields one copy instead of N, but requires moving a module with a
15.7 KB test and an active-workspace lookup — a bigger change for a cosmetic win).

⚠️ **The header is now crowded** — name · next-open indicator · 5 buttons · split control. Layout
is a real risk, not a formality: verify at a narrow window, and the buttons must not push the
split control off-row or squeeze the project name. `.workspace-session-start` already sets
`flex-shrink: 0`.

**D2 — NO SCANNER. Hard-code the 4 command strings; task 2.1 is DELETED** (per its own
instruction: do not build a scanner nothing consumes). Operator-confirmed. The reasoning is
stronger than "the set is fixed", and it is an *architectural* constraint rather than a
convenience:

- **§4c anti-brittleness** (`arch/workflow-gate.md:30`): *"The **only** stable coupling is the
  command name."* A command string is the sanctioned coupling; a filesystem path is not.
- ⚠️ **`workflow_substrate::skills_dir_exists` already refused this exact check**, in its own
  words: *"Still deliberately NOT a check for specific skill names: the skill set evolves in the
  companion repo on its own schedule, and per the return contract's §4c anti-brittleness clause a
  hardcoded roster of skill filenames would be exactly the brittle coupling that clause forbids."*
  A 4-path existence check **is** that roster. Building it would contradict a live module's
  documented decision.
- A missing skill makes CC print "unknown command" — the terminal **is** the evidence, which is
  the same reasoning behind `injectCommand`'s deliberate no-retry design.
- ⚠️ Consequence to record: **`skills_dir_exists` is NOT the gate for these buttons.** The gate is
  the persisted user setting via `useWorkflowFeaturesEnabled`. Do not wire substrate detection in
  — it is a different question (is the system installed) from the gate (did the user opt in), and
  conflating them would make the buttons vanish for a developer install.

**D3 — SETTLED 2026-08-14: the set is SIX. `/session-restore` gets a manual door.** Operator
decision, taken on a measurement that **inverted the reading the WBS expected**. This is the
milestone's dominant-defect shape appearing in *data* rather than in a doc claim, so the reasoning
matters more than the verdict:

- **What was measured** (all 2474 transcripts, 66 project slugs; predicate = `type=="user"` with a
  `<command-name>` block, matched against string/text content **only**, never `tool_result` bodies):
  **523 operator-typed invocations**, of which **512 (97.9%) RESTORED** (the pointer was present)
  and **11 (2.1%) NOTHING-TO-RESTORE**, **0 indeterminate**.
- ⚠️ **The prior's "531" is only reachable by counting TWO command names** — `/session-restore` is
  **142** and the pre-rename `/session-resume` is **390** (clean cutover 2026-07-21, the M9 WP5
  rename), raw family **532**, minus **9** `ScheduleWakeup` self-fires from one overnight-training
  transcript = **523 operator-typed**. `/session-start` = **25**, exact. The +3 vs the prior is
  work done today. **Record the two-name split**: a future re-measurement that greps only
  `/session-restore` will find 142 and conclude the earlier figures were wrong.
- ⚠️ **THE READING THAT FLIPPED IT.** 97.9%-present was expected to prove *"M12's auto-fire already
  covers this, so no button is needed."* **It does not.** Those invocations are overwhelmingly
  **`/clear` then `/session-restore` inside an ALREADY-OPEN session** (`/clear` = 333 typed; the
  operator states the habit in-transcript). **Open-time auto-fire never runs in that flow — the
  workspace does not re-open.** So the 97.9% describes a population the automatic arm does not
  serve, and the exclusion's support was weaker than the number made it look. The two populations
  (workspace-open vs post-`/clear`) **cannot be separated from the transcripts**, which is why this
  went to the operator rather than being decided from the figure.
- **The residual 2.1%** (11 cases over ~2.5 months, all hard `File does not exist` tool results)
  is the fired-into-a-void case; a button would not have helped there either. Both branches
  pointed the same way — *away* from the naive reading.
- **Accepted cost:** on the workspace-open path this partially overlaps M12's automatic arm, i.e.
  two mechanisms serving one skill — the shape the WBS calls "the problem". Accepted knowingly
  because the flow the button serves (post-`/clear`, file present, no affordance) has none.
- **Rejected:** keep 5 and defer (leaves a live weekly-or-more action with no click door on a
  measurement that failed to support the exclusion); keep 5 and let WP3's Recycle absorb it
  (Recycle is specced around `.session.md` *handoff completion*, not the `/clear` flow — that
  would assign it work it is not shaped for).
- ⚠️ **This does NOT re-open Q1's shape.** Still a tiny fixed set; the floor moved 5 → 6.
- ⚠️ **`/session-restore`'s exclusion rationale in `wbs.md` is now superseded and must be
  corrected there**, not just here — the false-claim-survives-in-a-second-file failure hit this
  milestone twice (`wbs`+WIP swept, `CLAUDE.md` missed).

## Constraints inherited (do not re-derive)

| Constraint | Source | Consequence for WP2 |
|---|---|---|
| ⚠️ Buttons inject via **`injectCommand`** (`autoResumeFire.ts:165`) → `invoke("cc_input", …)` | WBS reuse inventory, corrected 2026-08-14 (a CRITICAL at WP1 review) | **NOT `slash_command_bytes`** — Rust-side, not a `#[tauri::command]`, unreachable from any button. Naming it would force a stall or a brand-new Tauri command, i.e. the second injection path that is forbidden. |
| ⚠️ The `invoke` **MUST** have a `.catch` | `injectCommand` header; the WP6 picker MAJOR | An unhandled Tauri rejection vanishes silently = a dead click with no diagnosis. `injectCommand` already does this internally — which is a reason to use it rather than hand-rolling `invoke`. |
| **No retry, deliberately** | `injectCommand` header | Detecting a miss needs CC output-reading, which `arch.md` forbids. |
| ⚠️ Gate consumed **only** via `useWorkflowFeaturesEnabled` | `useWorkflowFeaturesEnabled.ts` header (names "M13 skill buttons" explicitly) | Type-level, **executable** reference. The guard strips comments — a comment-only mention was *measured* not to satisfy it. |
| ⚠️ `WORKFLOW_TERMS` already contains **`"skill"`** | `offInvariantGuard.test.ts:136` | A skill-button module exporting a `*Chord*` identifier trips the **chord arm today**, before the fifth arm exists. ⚠️ The paydown's own probe used the hypothetical name **`skillPaletteChord`** — do not name an export that way by accident and read the resulting red as a new bug. |
| The guard file is at **26 tests**, four registries, chord arm **per-export** | `offInvariantGuard.test.ts` (verified `grep -c "it("` = 26) | Read its header before extending. |
| ⚠️ `Workspace.tsx:167` calls `invoke("cc_input", …)` directly, **not** `injectCommand` | measured this session | This is the funnel problem in task 2.6 already present in the tree: two send paths for one rule. P2 funnels both through one function. |

## Work Tree

- [x] Phase 1: The funnel + the five skill commands  <!-- status: COMPLETE 2026-08-14 -->
  **Observable outcomes:**
  - Browser: with the gate ON, a workspace header shows six buttons — `/session-start`,
    `/session-capture`, `/util-prune-claude-md`, `/util-backlog-paydown`, `/session-restore`, and
    a Recycle button; clicking each of the five skill buttons types that exact command into that
    workspace's CC pane and submits it (CC responds — the command is *executed*, not merely typed;
    ⚠️ typing-side evidence alone is too weak — `[[observable-outcomes-execution-evidence]]`).
  - Browser: with the gate OFF, the header shows **none** of the six — not hidden, not disabled,
    absent — and the project name + split control still render normally.
  - Browser: at a narrow window width the split control stays on-row and the project name is not
    squeezed to illegibility.
  - CLI: `pnpm test` — a test proves **every** rendered button reaches the ONE send function with
    its own command string (not merely that a registry contains 5 entries).
  - [x] P1.1 One send funnel: extend/replace the ad-hoc `invoke("cc_input", …)` at
        `Workspace.tsx:167` so **both** the existing `/session-start` click and the new buttons
        go through **`injectCommand`**. ⚠️ One function, per task 2.6 — funnel every write of the
        shared path through ONE function and guard *that*.  <!-- status: NOT-STARTED -->
  - [x] P1.2 The command set as data + the render, in the header, around the existing button.
        ⚠️ **5** hardcoded command strings, no scanner (D2). ⚠️ Do not export a `*Chord*` identifier.  <!-- status: NOT-STARTED -->
  - [x] P1.3 Gate the whole row via `useWorkflowFeaturesEnabled` (type-level executable ref);
        keep `showSessionStartButton`'s existing `ccSessionId !== null` precondition — a null
        session id is a dead click (the WP6 picker MAJOR).  <!-- status: NOT-STARTED -->
  - [x] P1.4 CSS: share the `.workspace-session-start` quiet-secondary pattern; update its
        comment, which currently predicts "M13 builds the generic skill palette and either
        absorbs this or keeps it as a pinned special case" — WP1 decided: it IS the
        `/session-start` button.  <!-- status: NOT-STARTED -->
  - [x] P1.5 ⚠️ **Prove each button has a live CALLER** — the M12 dead-`/exit` trap: a set
        membership test is not a caller test. Assert the funnel receives each command string.  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: COMPLETE 2026-08-14 -->
  - [x] verify-self  <!-- status: COMPLETE 2026-08-14 — see "verify-self" section; one outcome deferred to verify-human -->
  - [x] verify-human  <!-- status: PASS 2026-08-14 (operator: "all good") -->
  - [x] verify-codify  <!-- status: COMPLETE 2026-08-14 — CSS contract guard, 2 holes found by mutation -->

- [x] Phase 2: The fifth OFF-invariant guard arm  <!-- status: COMPLETE 2026-08-14 -->
  **Observable outcomes:**
  - CLI: the guard file gains a fifth arm asserting the **computed** OFF-state value of the
    skill-button surface, and its header's registry list reads FIVE.
  - CLI: bypassing **only** the fifth arm turns the suite red, and the mutated line is confirmed
    to be **executable** code.
  - [x] P2.1 Add the fifth arm. Copy the **row-cell arm's shape** (`offInvariantGuard.test.ts:400`):
        assert the computed OFF value, **plus** an anti-vacuity companion proving the derivation is
        genuinely gate-derived rather than a constant that ignores its argument.  <!-- status: NOT-STARTED -->
  - [x] P2.2 Update the guard header's "THE FOUR REGISTRIES" block to five.  <!-- status: NOT-STARTED -->
  - [x] P2.3 ⚠️ **Mutation-prove the fifth arm INDIVIDUALLY** — bypass only this arm. A composite
        bypass that trips *some* arm reports "the guard bites" while hiding a gap. ⚠️ Confirm the
        mutant landed in executable code (`sed -n '<line>p'`). ⚠️ An invalid probe and a real hole
        present IDENTICALLY — check the probe's premises before concluding a hole.  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: COMPLETE 2026-08-14 -->
  - [x] verify-self  <!-- status: COMPLETE 2026-08-14 — see "verify-self" section; one outcome deferred to verify-human -->
  - [x] verify-human  <!-- status: PASS 2026-08-14 (operator: "all good") -->
  - [x] verify-codify  <!-- status: COMPLETE 2026-08-14 — CSS contract guard, 2 holes found by mutation -->

- [x] Phase 3: The Recycle button's seam  <!-- status: COMPLETE 2026-08-14 -->
  **Observable outcomes:**
  - CLI: the row ships 5 of a decided 6, and a test **fails** the moment WP3 wires the
    `recycle-session` route while the row is still 5.
  - CLI: no test asserts Recycle *works*; WP3 owns that.
  - [x] P3.1 ✅ **DECIDED → option (a): WP2 ships WITHOUT Recycle; WP3 adds it.** Rejected (b)
        render-it-disabled: this repo uses `disabled` for *capability* limits reflecting real
        current state (`canOpenTerminal`, a collapsed split), **never as a promise about unbuilt
        work** — and a button that can do nothing is the "present-but-disabled" shape the seam
        contract rejects elsewhere. ⚠️ (a)'s real risk — the set quietly staying at 5 — is closed
        by a TEST, not a comment (P3.2).  <!-- status: COMPLETE -->
  - [x] P3.2 `DECIDED_ROW_SIZE = 6` + an anti-forgetting guard keyed on a **mechanical** trigger:
        `"recycle-session"` exists in `CleanExitRoute` today with **zero production callers**, so
        the appearance of one means WP3 is landing and the row must grow to 6. ⚠️ Scans production
        `src/**` only (excluding `__tests__`), or the route's own tests would fire it immediately
        and it would be deleted as a false positive. ⚠️ Carries a **non-vacuity branch**: on the
        no-callers path it asserts the scan can still SEE the declaration, so green means "WP3 has
        not landed" rather than "the scan is broken". **PROVEN by probe** — a temporary
        `export const PROBE_ROUTE = "recycle-session"` in `state/appView.ts` turned it red with
        the offending file named; probe removed, `git diff` clean.  <!-- status: COMPLETE -->
  - [x] verify-auto  <!-- status: COMPLETE 2026-08-14 -->
  - [x] verify-self  <!-- status: COMPLETE 2026-08-14 — see "verify-self" section; one outcome deferred to verify-human -->
  - [x] verify-human  <!-- status: PASS 2026-08-14 (operator: "all good") -->
  - [x] verify-codify  <!-- status: COMPLETE 2026-08-14 — CSS contract guard, 2 holes found by mutation -->

## Current Node
- **Path:** M13 WP2 > all phases complete > ready to ship
- **Active scope:** none — all 3 phases COMPLETE through verify-codify. Next: `/feature-ship`.
- **Blocked:** none.
- **Unvisited:** none.
- **Open discoveries:** none. The 6th-member question was measured and settled at plan time (D3).

## verify-self — 2026-08-14 (live dev app, MCP `tauri` bridge)

Driven on a real `pnpm tauri:dev` build (PID 97179, window "Claudesk (dev)"), workspace
`tmp/scratch/scratch-b`. ⚠️ The operator's **prod** app (PID 1557) was running throughout and was
**never touched** — teardown was PID-scoped, never a blanket `pkill`
(`[[verify-self-dev-vs-prod-process-name-collision]]`).

**PASS — the row renders, gated, with correct wiring.** All 5 buttons present with real widths
(39–63px), correct `aria-label`s naming the workspace (`Run /session-start in scratch-b`), correct
`data-testid`s. Header reads `scratch-b · ↻ will continue · start restore capture prune paydown ·
◀CC 2:2 ED▶ · Idle`.

**PASS — every button's injection reaches the IPC boundary, proven against a NEGATIVE CONTROL.**
This is the load-bearing result and it needed a control to mean anything:
- A capture-phase listener confirmed each click lands on the **intended** button (5 clicks → 5
  correct testids, in order).
- `console.warn` was wrapped. `injectCommand` warns on IPC rejection, so silence is only evidence
  if a failure would speak. **Forced one:** `injectCommand("definitely-not-a-session", …)` produced
  `auto-resume: injecting /session-capture into definitely-not-a-session failed no such session`.
- With the instrument thus proven, **all 5 real clicks produced ZERO warns** ⇒ every
  `invoke("cc_input", …)` resolved.
- Corroborated independently: the filmstrip status moved `Unknown → Running → Idle` across the
  clicks, i.e. the hook channel saw CC receive work.

**PASS — the OFF invariant, observed live and BIDIRECTIONALLY.** Toggled the real Settings control
(`settings-workflow-features`), not a stubbed value:
- **OFF:** skill row **absent** (`skillRow: false`, 0 buttons) — not hidden, not disabled. Docs tab
  and next-open indicator also collapsed. ⚠️ **Split control, project name and xterm all survived**
  — the ungated app is unharmed.
- **Picker side, same toggle:** drive-mode lines → 0, `/session-restore` announcements → 0, while
  the **ungated `↻ continue` SURVIVED** — M12's per-arm gate still holding, not over-broadened.
- **Back ON:** the row returned immediately with no relaunch or remount (the hook tracks the
  broadcast). ON → OFF → ON all three observed.

**PASS (with a measured boundary) — narrow-width layout, the risk D1 flagged.** Degradation is
graceful and *ordered*, and the row is not what gives:
| width | project name | status dot | skill row |
|---|---|---|---|
| 1280 / 760 | full (55px) | inside | 5 buttons, full width, none clipped |
| 700 | full (55px) | 10px inside | intact |
| 640 | truncating (28px) | 10px inside | intact |
| **600** | **0px** | **overflows by 2px** | intact |
| 560 | 0px | overflows by 42px | intact |
⚠️ So the header's squeeze victims are the **name and status dot**, never the buttons. This is a
pre-existing flex characteristic that 5 more buttons make reachable at a *wider* window than
before — **not a defect introduced in the row, but a real consequence of D1's placement choice.**
Carried to verify-human as a judgment call, not silently accepted.

**⚠️ NOT VERIFIABLE HERE — "CC executes the injected command."** Reported as unproven rather than
assumed, because the read instrument was demonstrated blind:
- The dev CC session first sat at the **trust-folder prompt** (a menu that ignores text), so early
  injections could not have executed regardless of correctness. Not "fixed" by editing the
  operator's shared `~/.claude.json` — that is prod CC state and out of this task's scope.
- Once CC reached a live prompt, clicks still produced no visible echo — **and neither did
  manually typing `zzz` into the pane's own `.xterm-helper-textarea`.** Since *no* input echoes in
  this agent-driven pane, the clicks are not the variable
  (`[[xterm-dom-reads-fake-a-blank-pane]]`, `[[agent-launched-app-cannot-verify-continue]]` — the
  session also carries the inherited `CLAUDE_CODE_CHILD_SESSION` marker).
- ⚠️ **Instrument failures found and NOT reasoned around:** `ipc_monitor` captured **zero** IPC
  calls even as a positive control (so its empty result was worthless, not exculpatory);
  `read_logs{console}` returned nothing; `ipc_emit_event` did not reach the gate hook at any
  payload shape tried (consistent with `[[mcp-bridge-seed-held-workspace-status-via-fiber]]`'s
  double-encoding note); `webview_execute_js` hangs on any promise-returning script.
  The console-wrap + capture-listener above is the instrument that survived scrutiny.

**Net:** everything up to and including "the bytes leave Claudesk correctly for the right session"
is proven. **"CC runs the skill" is the one outcome that needs a human at a real terminal.**

## verify-codify — 2026-08-14

**verify-human PASSED** (operator: "all good"), including the one outcome verify-self could not
reach: **clicking a button makes CC actually execute the skill**, not merely type it. That closes
the `\r`-vs-`\n` risk on the live path.

**One test added, and it found TWO real holes — both in itself, both by mutation rather than
review.** The gap it closes: the CSS↔component class contract had **no guard** for the two new
classes, and per the M12 WP5 close that exact unread direction shipped a layout regression while
1979 tests stayed green.

⚠️ **Hole 1 — the guard was satisfied by its own documentation.** First run FAILED, reporting a
live `.workspace-session-start` rule (dead CSS). There was no such rule: the only occurrence is
inside this feature's *own* CSS comment, which names the absorbed button in backticks. `hasRule`
matched the comment. Uncaught, this assertion would have passed exactly when the rule was re-added
*and* mentioned in prose, and failed when the code was already correct — the inverse of its intent
(`[[raw-guard-identifier-satisfied-by-own-comments]]`, reproduced on first run). Fixed by stripping
comments, **plus a positive control** asserting a definitely-styled class (`.workspace-header`) is
still found after stripping, so an over-eager regex cannot silently disarm both directions.

⚠️ **Hole 2 — `hasRule` alone was too weak, and the mutant proved it.** Deleting the **entire**
`.workspace-skill-btn { … }` block — padding, border, font, cursor — left the suite **GREEN at
21/21**, because `.workspace-skill-btn:hover` still exists and `hasRule`'s boundary legitimately
admits `:`. So a modifier satisfied a check for its base class while everything making the button
look like a button was gone. Same shape the 2026-08-12 paydown recorded (`.is-editing` satisfying
its base). ⚠️ **`hasRule` is not at fault and must not be "fixed"** — the weak part was asking it
the wrong question. Now asserts a **base rule** (`\.<cls>\s*\{`) alongside it.

**Mutation-proven in both directions after the fix:**
| mutant | result |
|---|---|
| delete `.workspace-skill-btn` base rule, keep `:hover` | ✅ RED (was green before the fix) |
| add a `.workspace-session-start` rule nothing emits | ✅ RED |
| unmutated tree | ✅ GREEN 21/21 |

**Also confirmed:** `.workspace-session-start`'s rule is genuinely **gone** from `App.css` (only the
provenance comment remains) — the absorbed button left no dead CSS behind.

**Deliberately NOT codified:** nothing re-asserting the `\r` payload rule (already pinned
byte-for-byte against the Rust helper by `autoResumeFire.test.ts`) and no test claiming Recycle
works (WP3 owns it). Adding either would be redundant coverage that reads as new.

**Final gate:** tsc clean · Prettier clean · ESLint 0 errors (1 pre-existing `XtermPane` warning) ·
**2054 frontend tests pass, 163 files** (2026 at WP1's close → **+28**).

## Discoveries

[RESOLVED-2026-08-14] `SURFACE-2026-08-14-SESSION-RESTORE-HAS-NO-MANUAL-DOOR` — **settled at plan
time, resolves to YES: `/session-restore` joins the set as member 5 of 6.** Measured over all 2474
transcripts, then decided by the operator because the figure did not settle it. Full reasoning +
the measurement's inverted reading: **D3** above. ⚠️ Not deleted from `backlog.md` yet — the
delete-on-resolve rule requires the `**Backlog resolved:**` CHANGELOG line to land in the same
commit, which happens at `feature-finalize`, not now.

[SURFACED-2026-08-14] measurement method, no target node — **the `/session-restore` usage figure
requires counting TWO command names, and a re-measurement that greps one will silently under-count
by 73%.** `/session-resume` (390, to 2026-07-21) + `/session-restore` (142, after) = 532 raw; the
M9 WP5 rename split one skill's history across two names. Also: **9 of the raw 532 were
`ScheduleWakeup` self-fires**, not operator input — separable because they are the only family
invocations carrying a `<command-args>` block matching a `ScheduleWakeup` prompt in the same file.
Any future usage-frequency claim about this skill must handle both, or it is wrong. Logged to
`backlog.md`.
