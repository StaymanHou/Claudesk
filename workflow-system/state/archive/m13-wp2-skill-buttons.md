---
stage: shipped
state: complete
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
6. **Recycle Session** — ⚠️ **WP3's** operation, and ⚠️ **WP2 shipped WITHOUT it** (Phase 3
   decision: rendering it early-and-disabled would be a promise about unbuilt work). ⚠️ Corrected
   at close: an earlier line here said "WP2 renders its button", which is **not** what shipped.
   The obligation moved to `wbs.md` → WP3.

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
was a real risk, and it **measured out**: see verify-self. The buttons never shrink or clip; the
project name truncates from ~640px and the status dot overflows below ~600px. Shown to the operator
and accepted.

**D2 — NO SCANNER. Hard-code the command strings (5 as shipped; "4" in the original wording predated D3 adding `/session-restore`); task 2.1 is DELETED** (per its own
instruction: do not build a scanner nothing consumes). Operator-confirmed. The reasoning is
stronger than "the set is fixed", and it is an *architectural* constraint rather than a
convenience:

- **§4c anti-brittleness** (`arch/workflow-gate.md:30`): *"The **only** stable coupling is the
  command name."* A command string is the sanctioned coupling; a filesystem path is not.
- ⚠️ **The `workflow_substrate` module already refused this exact check** (⚠️ attribution corrected
  at code-quality review: the quote is **`SKILLS_SUBPATH`'s** doc comment, not
  `skills_dir_exists`'s — which carries the same §4c argument in its own words):
  *"Still deliberately NOT a check for specific skill names: the skill set evolves in the
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

## Code-quality review — 2026-08-14 (post-ship, commit `bd67758`)

**Verdict: no CRITICAL. 4 MAJOR, 6 MINOR — all addressed in a follow-up commit; none dismissed.**
The reviewer independently re-verified all six factual claims I asked it to check (the
`slash_command_bytes` unreachability, the funnel's ownership of the `.catch`/payload rule, the two
deleted symbols having zero live references, the §4c refusal, the absent dead CSS, and the
`recycle-session` caller count) and found **no shipped falsehood of the WP1 class**. The defects
were concentrated in the one part of the commit that reasoned about the *future*.

**MAJOR 1+2 — the anti-forgetting guard was unsound in BOTH directions. REMOVED, not patched.**
⚠️ This was my own invention at P3.1 and it was worse than the comment it replaced:
- **False positive:** `DECIDED_ROW_SIZE = 6` with `SKILL_BUTTONS.length === 6` is **unsatisfiable**.
  `SKILL_BUTTONS` holds slash commands (pinned by `/^\/[a-z0-9-]+$/`), and `wbs.md:125` says
  plainly **"Recycle is not a skill"** — it is an operation with a `CleanExitRoute`. So WP3 would
  have met *three* red tests whose messages demanded the opposite of each other: exactly the
  "deleted as a false positive" outcome the guard's own comment claimed to prevent.
- **False negative:** the trigger matched only the **literal** `"recycle-session"` in `src/**`. A
  caller passing it as a typed `CleanExitRoute` parameter never spells the literal, and `wbs.md`
  leaves open that Recycle clears via the **in-process Rust** writer — where an `src/**` scan
  cannot see it. ⚠️ **The route already exists in Rust today** (`session_state/mod.rs:351`), which
  I verified. My P3.2 probe only exercised the literal path, so it proved the one arm that worked
  and not the two that didn't — the "prove each form INDIVIDUALLY" rule, violated by me.
- **Resolution:** guard and constant deleted; a long do-not-rebuild note left in the test file. The
  obligation is real but **its home is the WBS**, not a test that encodes a refuted membership
  claim. ⚠️ **Lesson: a test cannot enforce a future scope decision.**

**MAJOR 3 — reusing the funnel inherited a misattributed log prefix.** Every skill-button failure
logged `auto-resume: injecting … failed`, i.e. the one diagnostic this feature ships named M12's
*automatic* arm. `injectCommand` now takes an optional `label` (defaulting to `"auto-resume"`, so
M12's callers are byte-identical); `fireSkillCommand` passes `"skill-button"`. ⚠️ Not a second
injection path — the funnel decision was right, only the message was stale.

**MAJOR 4 — I introduced a duplicate `- **Status:**` line** in
`SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS` (the only item of 31 with a count
other than 1), so a grep-addressed field returned two contradictory answers. Merged into one line.

**MINORs, all fixed:** the JSX comment at the render site claimed the row contains a Recycle button
(false *at the code it annotates*); the §4c quotation was attributed to `skills_dir_exists`'s doc
when it is **`SKILLS_SUBPATH`'s** — ⚠️ corrected in `skillButtons.ts` **and** in `wbs.md`, since a
false claim surviving in a second file is this milestone's signature failure; the tightened
`catch` guard replaced a two-armed regex whose `.catch(` arm matched **zero** times (only the loose
`catch\s*\(` arm was live, unscoped to the injection path) — **mutation-proven** with a
try/catch→bare-await mutant the old form passed; `DECIDED_ROW_SIZE` removed as a production symbol
consumed only by tests; and comment density cut — the absorb-the-button rationale was in **4
files** and is now stated once in `skillButtons.ts`'s header with the others pointing at it.

**Two findings the reviewer judged in my favour, recorded so they are not re-litigated:**
`showSkillButtons` treating `""` as live is **right** (`!== null` matches the upstream
`string | null` type; a truthiness check would swallow a distinct state, and failing visibly at the
IPC edge beats an affordance that vanishes and reads as "gate off"). And `fireSkillCommand` is not
a wrapper-of-one — `injectCommand` has three callers, and the delegation is the guardable
chokepoint the caller test needs.

**All surviving guards re-proven by mutation AFTER the refactor** (a green suite following heavy
edits is not evidence): funnel-ignores-its-arg → red; ungate-the-row (arm 5) → red, arm 5 only;
try/catch→bare-await → red. **2052 tests pass** (2054 − the 2 deleted guard tests).

## Retrospect — M13 WP2, closed 2026-08-14

**Shipped:** five workflow skills as buttons in the workspace header, gated as a whole, all firing
through one funnel. Two commits: `bd67758` (feature) → `e45cca8` (review fixes). Sized **S** as
predicted once the scanner was dropped; frontend-only, no Rust, no new IPC.

**What this WP is actually worth remembering for: three times, a measurement or a review refuted
something I had written down as settled — and the refutations were all of MY reasoning, not of
inherited claims.**

1. **A number that meant the opposite of what it looked like.** 97.9%-of-523 was expected to
   confirm `/session-restore`'s exclusion and instead killed it, because the *population* mattered
   more than the ratio (post-`/clear`, workspace already open — a flow the automatic arm never
   runs in). ⚠️ **The transferable form: a measurement that "confirms" a hypothesis has to be read
   for WHICH CASES it covers, not just which way it points.** The two populations were
   inseparable from the data, which is exactly why it went to the operator rather than being
   decided from the figure.
2. **A guard I invented that was unsound in both directions** (removed at review). The target state
   was unsatisfiable against a constraint the WBS stated in plain words, and the trigger was blind
   to two of three realistic call shapes. ⚠️ **A test pins the PRESENT; a future scope commitment
   belongs in the WBS.** Filed as `SURFACE-2026-08-14-A-TEST-CANNOT-ENFORCE-A-FUTURE-SCOPE-DECISION`.
3. **My own probe proved only the arm that worked.** I exercised the literal path and declared the
   mechanism proven — while the doc I was quoting says *prove each form INDIVIDUALLY*. This is the
   second time this milestone that a probe's success was mistaken for a mechanism's soundness.

**The verification instruments were the other theme, and they failed more often than the code did.**
Three MCP-bridge instruments were silent-but-broken (`ipc_monitor` captured **zero** calls even as
a positive control; `read_logs{console}` returned nothing; `ipc_emit_event` never reached the gate
hook). ⚠️ **Treating their silence as evidence would have produced a confident, wrong verdict in
either direction.** What survived scrutiny was a hand-built console-wrap plus a **negative control**
— a deliberately-failed injection that *did* warn — which is the only reason "zero warns on five
real clicks" means anything. And the one outcome no instrument could reach (does CC *execute* the
command) was reported unproven and sent to the operator, who confirmed it by hand.

**Two guards I wrote were themselves holed, both found by mutation, neither by review:** one was
satisfied by its **own documentation** (a backticked class name in a comment), and one passed while
the button's entire base CSS rule was deleted (a surviving `:hover` stood in for its base class).
⚠️ Both are the same family — *a guard satisfied by a near-miss token* — now at four appearances in
this repo. The `hasRule` half generalizes and is filed.

**What went right and should be copied:** the absorbed button was **deleted, not orphaned**
(`SESSION_START_COMMAND` + `showSessionStartButton` removed, their tests retargeted onto the row) —
the M12 dead-`/exit` shape avoided deliberately. The caller-proof test mocks the **Tauri boundary**
rather than our own funnel, so it drives real bytes to the IPC edge; it caught 4-of-5 members made
unreachable while the membership test stayed green, which is precisely the defect class it exists
for. And the fifth guard arm's first failure was **the predicate's fault, not the set's** — fixed by
asserting provenance rather than widening a term list shared with four other arms.

**Costs accepted knowingly, not overlooked:** the row partially overlaps M12's automatic arm on the
workspace-open path (two mechanisms, one skill); three of the five buttons were fired ≤3 times ever;
and the header's project name truncates ~640px with the status dot overflowing ~600px — measured,
shown to the operator, accepted.

**Owed to WP3:** the row's **sixth affordance** (Recycle). Written into `wbs.md` → WP3 because the
test that was supposed to enforce it had to be deleted.

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
