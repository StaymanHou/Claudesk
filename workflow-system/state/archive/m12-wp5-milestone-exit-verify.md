---
item: M12 WP5 — Milestone-exit verify (+ the OFF-invariant guard's fourth arm)
type: feature
workflow: feature
created: 2026-08-12
milestone: M12 (Smart auto-resume + drive mode)
wbs_ref: workflow-system/product/wbs.md → "WP5: Milestone-exit verify (+ the guard's fourth arm)"
---

# M12 WP5 — Milestone-exit verify (+ the guard's fourth arm)

The **last** work package in M12. `/product-finalize` follows it.

Two halves, deliberately unequal in risk:

1. **Build:** extend the OFF-invariant guard with a **fourth arm** covering M12's frontend
   surfaces, and close the **second, empirically-confirmed hole** (CSS↔component coupling).
   This is real code and carries the WP's only regression risk.
2. **Verify:** drive M12's exit criteria live and record the exit verdict. Mostly observation,
   but with one load-bearing negative arm (5.7) that a Claudesk-only check cannot distinguish
   from "broken for everyone".

## Scope decisions taken at plan time (do not re-derive)

- **The fourth arm's subject is the COMPUTED OFF-STATE VALUE of M12's frontend derivations**,
  mirroring how M11 extended the panel arm to `availablePanels(false)` rather than a static
  array. Concretely: `cellLines(model, mode, /* gateEnabled */ false, …)` must return exactly
  ONE line and no `driveMode` line; `rowAffordances(path, map, /* enabled */ false)` must
  collapse the **gated arm only** (per-arm gate — the `argv` arm is legitimately ungated and
  the arm must NOT assert it away).
- ⚠️ **The per-arm gate is the trap in 5.1.** A naive fourth arm phrased as *"nothing M12
  surfaces while OFF"* would be **wrong**, and would fail on correct code: `--continue` is
  ungated by operator decision (`announceRow.ts` `armAvailable`). The arm must assert the
  gated arm collapses and the ungated arm survives — both directions, or it is either
  decorative or actively hostile.
- **`predictAction.ts` / `autoResumeFire.ts` are deliberately NOT gate-consumers** and the arm
  must not demand they become ones — the gate is applied at `rowAffordances`, one layer up.
  Recording this so the arm is not "completed" by wiring a gate where none belongs.
- **WP4b's Rust/Perl surfaces stay OUT of scope**, per the guard header's own measured note
  (`:50-57`): widening a frontend registry invariant into a second language makes it a
  different, weaker thing. Gate-OFF there is enforced Rust-side.
- **Hole (b) — the CSS↔component coupling — is scoped to a GENERALIZED arm, not the repo-wide
  sweep.** `SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT` asks
  for a repo-wide bidirectional check across ~3400 lines of `App.css` and many component
  blocks. That is its own work package. WP5 closes the hole **for M12's own surfaces** and
  leaves the SURFACE item open with its scope narrowed in writing. Deliberately not gold-plated
  at a milestone exit.

## Work Tree

- [x] Phase 1: The guard's fourth arm (+ its anti-vacuity meta-tests)  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/state/__tests__/offInvariantGuard.test.ts` passes with a
    strictly greater test count than before (the arm is additive — the guard is *extended,
    never narrowed*, per M11's precedent).
  - CLI: the arm asserts the **computed** OFF value (`cellLines(…, false, …)`,
    `rowAffordances(…, false)`), not a static literal — so a future gated M12-family surface
    that forgets its gate lands in the asserted value and is caught.
  - CLI: an anti-vacuity companion pins that ON differs from OFF for each derivation, so the
    OFF assertion cannot be satisfied by a derivation that ignores its argument.
  - CLI: the per-arm split is asserted in BOTH directions — the `inject` arm collapses while
    OFF, the `argv` arm survives while OFF.
  - [x] P1.1 Extend `offInvariantGuard.test.ts` with the fourth arm  <!-- status: complete -->
  - [x] P1.2 Add the anti-vacuity meta-tests for the new arm  <!-- status: complete -->
  - [x] P1.3 Update the guard's header to enumerate the fourth registry + why M12's Rust
        surfaces stay out  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete -->
  - [x] verify-self  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete -->

- [x] Phase 2: Probe each arm INDIVIDUALLY (5.2)  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: each of the guard's arms — panel, menu-id, chord, **the new fourth arm**, raw-command
    bypass, wrapper bypass — fails when bypassed **individually**, one mutation at a time,
    never a composite.
  - CLI: for each mutation, `sed -n '<line>p'` (or equivalent) confirms the mutation landed in
    **executable** code before the pass/fail is believed
    (`[[verify-the-mutation-landed]]` — two attempts in one prior session reported "the guard
    does not bite" having modified nothing).
  - CLI: the tree is restored clean after every probe (`git diff --stat` empty).
  - [x] P2.1 Probe the fourth arm's gated-collapse direction  <!-- status: complete -->
  - [x] P2.2 Probe the fourth arm's ungated-survives direction (an over-broad arm must fail
        here)  <!-- status: complete -->
  - [x] P2.3 Re-probe the three pre-existing arms individually (regression: the extension must
        not have narrowed them)  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete -->
  - [x] verify-self  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete -->

- [x] Phase 3: Close hole (b) — the CSS↔component coupling for M12's surfaces  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: a guard asserts, for the picker cell's CSS block, that the set of `.<block>.<modifier>`
    selectors in `App.css` and the set of modifiers the component emits are the **same set** —
    in **both** directions (styled-but-never-emitted AND emitted-but-never-styled).
  - CLI: mutation-proven both ways: deleting a `className` the stylesheet styles fails; adding
    a `className` the stylesheet does not style fails.
  - CLI: modifiers reachable only mid-interaction (`is-editing`) are asserted against the
    component **source** with that limitation stated in the test, not skipped silently.
  - [x] P3.1 Build the bidirectional set-equality guard for the cell's block  <!-- status: complete -->
  - [x] P3.2 Mutation-prove both directions  <!-- status: complete -->
  - [x] P3.3 Narrow the SURFACE item's scope in writing (instance closed; repo-wide sweep
        remains open)  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete -->
  - [x] verify-self  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete -->

- [x] Phase 4: Live milestone-exit verify (5.3, 5.4, 5.7, 5.8)  <!-- status: complete -->
  **Observable outcomes:**
  - Browser (MCP bridge, on `tmp/scratch/scratch-*`): each of the three prediction states
    renders its correct announcement; both doors behave (row door fires, `⊘` opens without
    firing); the unclean flag survives a hard kill; the flag is consumed once.
  - CLI: `~/.claude/` is byte-identical across an **enable→disable toggle** —
    ⚠️ hashed around each **TOGGLE**, never around a relaunch (`hook_install` legitimately
    rewrites `settings.json` at launch and is universal).
  - CLI/Browser: **the drive-mode signal, BOTH arms.** Claudesk-opened workspace with a mode
    set ⇒ `/session-restore` shows **no** mode menu; `claude` run in the **same directory from
    a plain terminal** ⇒ the menu **does** appear. ⚠️ The negative arm is load-bearing: a check
    that only drives the Claudesk arm cannot distinguish "correctly inert" from "broken for
    everyone".
  - CLI: the signal's per-turn stdout write alters `settings.json` not at all (5.8 — the
    shared-script choice touches all 10 events).
  - [x] P4.1 Bring up `pnpm tauri:dev` + bridge; stage the scratch dirs  <!-- status: complete -->
  - [x] P4.2 Drive the three prediction states + both doors  <!-- status: complete -->
  - [x] P4.3 Hard-kill survival + consume-once  <!-- status: complete -->
  - [x] P4.4 `~/.claude/` byte-identity around each toggle (5.4 + 5.8)  <!-- status: complete -->
  - [x] P4.5 The signal, both arms, same session (5.7)  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete -->
  - [x] verify-self  <!-- status: complete -->
  - [x] verify-human  <!-- status: complete — operator APPROVED 2026-08-12 -->
    - [x] Operator sees the picker cell + announcements on the real app  <!-- status: complete -->
    - [x] 5.7's interactive negative arm — operator decision  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete — the guard arms ARE the codification -->

- [x] Phase 5: Docs check + exit verdict (5.5, 5.6)  <!-- status: complete -->
  **Observable outcomes:**
  - CLI: `roadmap.md`'s M12 exit criterion is confirmed to read *"the signal reaches CC"* —
    ⚠️ **not** *"the mode is persisted"*. A 5.5 that confirms persistence would pass while
    checking the wrong thing.
  - CLI: success metric 5 reads against the **picker row** and is satisfiable.
  - CLI: ⚠️ per `[[doc-correction-scope-list-is-a-floor]]`, the check greps the retracted
    CLAIMS repo-wide, not only the sites WP4d named.
  - CLI: the exit verdict + an evidence table land in `wbs.md` → "Probe outcomes".
  - [x] P5.1 Confirm the WP4d corrections landed, against the NEW wording  <!-- status: complete -->
  - [x] P5.2 Repo-wide claim grep (floor-not-boundary)  <!-- status: complete -->
  - [x] P5.3 Record the exit verdict + evidence table  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete -->
  - [x] verify-self  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete -->

## Current Node
- **Path:** M12 WP5 > all 5 phases complete
- **Active scope:** none — WP5 is verified end to end and the operator has approved
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize, then `/product-finalize` (M12 CLOSE)
- **Open discoveries:** 2 (both logged to backlog: the chord arm's whole-module gate exemption;
  the comment crediting coverage to a nonexistent sweep)

## Notes carried in from the handoff (do not re-derive)

- ⚠️ **"autopilot" is PACING, not a gate waiver.** `verify-human` is PAUSE in every drive mode
  including autopilot, and it is the one gate autopilot keeps. Per the standing HIGH item
  `SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`, a completed
  `verify-human` must name **what the human saw**, and an inferred waiver must never be
  recorded as an operator decision.
- ⚠️ **Do NOT push.** Release-time only (operator's standing rule). `main` is 12 commits ahead
  by design.
- **Two seeded dev-profile values remain:** `scratch-a` → `autopilot`, `scratch-c` → `opus`.
  Prod untouched. Useful for Phase 4 — mixed rows are already staged.
- **The WBS's `arch.md:262` "one-directional" citation names a string that does not exist** —
  the claim was implicit. Do not hunt for the quote.
- **`roadmap.md:219/227/371` match `step-by-step` as ordinary English** (invite install
  instructions), as do the `costs nothing` hits in `vision.md:86` / `roadmap.md:46` /
  `arch.md:311`. A mechanical sweep "finishing the job" there would introduce errors.

## Phase 2 probe results (5.2) — each arm probed INDIVIDUALLY

| # | Arm | Mutation | Landed (executable) | Guard bit? |
|---|---|---|---|---|
| P2.1 | **4 — row cell (gated collapse)** | `cellLines`: `if (false && !gateEnabled)` | ✅ `driveMode.ts:145` | ✅ 2 failed (arm + its anti-vacuity companion) |
| P2.2 | **4 — row cell (over-broad)** | `armAvailable`: `case "argv": return enabled` | ✅ `announceRow.ts:100` | ✅ 1 failed (exactly the ungated-survives assertion) |
| P2.3a | 1 — panel | `"docs"` into `AVAILABLE_PANELS` | ✅ `panelHost.ts:62` | ✅ 1 failed |
| P2.3b | 2 — menu id | `openWorkflowDocs` into `MENU_IDS` | ✅ `menuBridge.ts:27` | ✅ 1 failed |
| P2.3c | 3 — chord | ungated `docsChord` in `closeTerminalChord.ts` | ✅ EOF, executable | ✅ 1 failed |

Tree restored clean after every probe (`git status` shows only the guard file + this WIP).
Full guard re-run after all five: **19/19 passing**.

⚠️ **Individual probing earned its keep again, in the opposite direction from last time.** P2.2
is the probe that only exists because the arm was written as two assertions: it mutates
*correct* code into a plausible "tighten the gate" change and the guard catches it. A
collapse-only arm would have passed that mutation and reported the regression as compliance.

⚠️ **One instrument error worth recording, because it looked exactly like a guard hole.** The
first attempt at P2.3c placed the ungated `docsChord` in `panelHost.ts` — the module M11.5 WP4
widened the chord arm to reach — and the guard passed 19/19. That reads as "the arm still misses
panelHost.ts", i.e. the M10.9 hole reopened. It is not: `isUngatedWorkflowChord` exempts any
module that references `useWorkflowFeaturesEnabled`, and `panelHost.ts` legitimately does
(`:26`, `:43`). The probe was invalid, not the arm — re-run in a non-seam module
(`closeTerminalChord.ts`) it failed correctly. **But the exemption is real and coarser than it
looks** — see Discoveries.

## Phase 3 results — hole (b), the CSS↔component coupling

**⚠️ The scope changed once the code was read, and in the direction that matters.** The WBS
described hole (b) as needing the coupling closed; in fact the WP4c review had **already** closed
the *styled-but-never-emitted* direction (`projectModelCellRender.test.tsx:137`). What was open
was the **inverse** direction — and the comment claiming otherwise is the finding:

> `// This closes the styled-but-never-emitted direction for this cell. The inverse direction is`
> `// covered by verify-auto's className→CSS sweep.`

**That sweep does not exist as a standing gate.** Checked: no `package.json` script performs it,
and no test in the tree asserts it for this cell. It was an ad-hoc command run once during a
verify-auto pass — which is not coverage, and recording it *as* coverage is exactly what left the
direction open while reading as closed. Corrected in place, and the inverse arm is now a real
test. (Same family as `[[rustdoc-link-to-a-nonexistent-test-fails-no-gate]]`: a claim in a comment
that no gate checks.)

**No live defect was found** — all 7 classes the cell emits are styled. The value delivered is the
standing guard, not a fix.

| # | Direction | Mutation | Landed | Guard bit? |
|---|---|---|---|---|
| P3.2a | emitted-but-never-**styled** | added `picker-recent-bogus` to a className | ✅ `ProjectModelCell.tsx:271` | ✅ 1 failed, named the class |
| P3.2b | **styled**-but-never-emitted | deleted the `is-editing` emission (the real WP4c regression) | ✅ `:216`, `is-editing` count 0 | ✅ 2 failed |

⚠️ **The guard produced TWO false positives before it was right, and both are recorded at the
call site because each would have been "fixed" by weakening it:**
1. `picker-recent-mode-line` — a **`data-testid`, not a class**. This codebase's testids and
   classes share one naming convention, so a namespace sweep cannot tell them apart; the fix was
   to scan `className` **positions** only.
2. `is-chosen` — matched out of the design-prior slug
   `set-a-spawn-time-choice-where-the-spawn-is-chosen` **in the cell's own header comment**
   (`[[raw-guard-identifier-satisfied-by-own-comments]]`). Fixed by stripping comments first,
   the same way the OFF-invariant guard already does in both of its source-scanning arms.

**Generalizable for whoever builds the repo-wide sweep:** the set comparison is the easy half. The
hard half is establishing what counts as *emitted* — and proximity to `className` is the only
honest signal in this codebase.

## Phase 4 results — live milestone-exit verify (MCP bridge, dev build, scratch dirs)

Driven live in `pnpm tauri:dev` (dev identity `com.claudesk.app.dev`, concurrent with the
operator's production app — never touched, PID-scoped teardown only).

### 5.3 — the three prediction states, both doors, consume-once

**All three states were visible SIMULTANEOUSLY on one picker**, which is stronger than checking
them one at a time:

| row | announcement | `⊘` door | why |
|---|---|---|---|
| `scratch-a`, `scratch-b`, `scratch-c` | `↻ continue` | ✅ | unclean flag set |
| `yitang-copy`, `my-claude-code-customization` | `↻ /session-restore` | ✅ | `.session.md` present |
| `claudesk`, `areo-test-proty-1` | *(none)* | ❌ absent | neither signal |

- **Row door fires:** clicking `scratch-a` spawned `claude --permission-mode dontAsk --continue`
  — the argv arm, exactly as announced.
- **`⊘` door opens WITHOUT firing:** clicking `⊘` on `scratch-c` (which announced `↻ continue`)
  spawned `claude --permission-mode dontAsk --model opus` — **no `--continue`**, and its
  persisted model override still applied. The door also **hit-tests to itself**
  (`elementFromPoint` → `SPAN.picker-recent-nofire`, `role=button`, `tabindex=0`), confirming the
  nested-and-defended shape WP3 shipped.
- **Consume-once, proven by state change rather than by reading code:** `scratch-a` announced
  `↻ continue` → closed via the filmstrip `×` (a `CleanExitRoute`) → its key was **removed** from
  `session-state.json` while still-open `scratch-b` kept its flag → re-opening the picker showed
  `scratch-a` announcing **nothing**, with `scratch-b`/`scratch-c` unchanged.

### 5.7 — the drive-mode signal, BOTH arms, same session

⚠️ **The negative arm is the load-bearing one, and it was checked as hard as the positive one.**
Read from the spawned CC's **real process environment** (`ps eww`), not from Claudesk's own state:

| spawn | project's mode | `CLAUDESK_DRIVE_MODE` |
|---|---|---|
| pid 20120 | `autopilot` (seeded) | **`CLAUDESK_DRIVE_MODE=autopilot`** ✅ |
| pid 20726 | unset | **absent** (0 occurrences) ✅ |
| pid 22950 | unset | **absent** ✅ |

So the full chain is proven end to end — **cell → `projects.json` → the env var in the actual
process env → the `UserPromptSubmit` hook** — and cleared ⇒ the variable is **absent, not empty**,
on two independent spawns.

### 5.4 + 5.8 — `~/.claude/` byte-identity around each TOGGLE

⚠️ **Hashed around each toggle, never around a relaunch** (the task's wording is load-bearing:
`hook_install` legitimately rewrites `settings.json` at launch and is universal, so a
relaunch-spanning hash would false-positive on it).

| arm | Claudesk's own gate | `~/.claude/` |
|---|---|---|
| ON → OFF | `true` → `false` ✅ | **byte-identical** ✅ |
| OFF → ON | `false` → `true` ✅ | **byte-identical** ✅ |

Symlinks 60 → 60 unchanged; `settings.json` at `04f5614c…` before, between, and after — across
both toggles **and** three live CC spawns that fired the (now bidirectional) hook. That is 5.8:
the per-turn stdout write alters `settings.json` not at all.

### ⚠️ The most valuable live result: the PER-ARM gate, observed

With the gate **OFF**, on the same picker:

- drive-mode lines: **0**, mode `<select>`: **0**, Docs tab: **0** — gated surfaces **absent**,
  not hidden or disabled
- model lines: **7**, and rendered **unprefixed** (`Default`, `opus` — *not* `Model: Default`) —
  the byte-identical-to-pre-M12 shape `cellLines` promises
- announcements: **3, every one `↻ continue`** — the two `/session-restore` rows collapsed
  completely while the `--continue` rows survived

**This is the fourth arm's two assertions, confirmed in the live app**: the gated arm collapses,
the ungated arm survives. Toggling back ON restored the `/session-restore` announcements and the
mode lines.

## verify-human — what the operator saw (2026-08-12)

⚠️ **Recorded per `SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER` (HIGH): a
completed `verify-human` must name what the human saw, not merely that it passed.** The operator's
session instruction was **"autopilot"**, which is **pacing** — autopilot's own definition is *"only
pause at verify-human"*, so this gate was taken, not inferred away.

**What was presented:** a live `webview_screenshot` of the running dev build's picker, showing all
three prediction states at once (`scratch-c` + `scratch-b` announcing `↻ continue`, `scratch-a`
silent after its clean exit, `yitang-copy` announcing `↻ /session-restore`), the `⊘` doors present
only on announcing rows, the stacked cell with mixed values (`opus` / `Drive Mode: None` and
`Model: Default` / `autopilot`), and the workspace header carrying `↻ will continue` plus the
manual `/session-start` button. Accompanied by the measured results: the argv/env evidence per
spawn, the toggle hashes, and the consume-once state transition.

**Operator's verdict: APPROVED — "matches expectations."** No changes requested.

**One item the operator decided rather than the agent:** 5.7's *interactive* negative arm (running
`claude` from a plain terminal and confirming `/session-restore` still shows the mode menu) was
**accepted on the mechanism evidence as sufficient** — `CLAUDESK_DRIVE_MODE` is provably **absent**
outside a Claudesk spawn on two independent processes, and the gate is by absence, so the skill
cannot behave differently. ⚠️ Recorded as a **reasoned scope decision by the operator, not an agent
skip**, and the agent explicitly stated it could not drive that arm rather than claiming it.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-12] Phase 3 / verification hygiene — **a test comment credited coverage to a
"verify-auto className→CSS sweep" that does not exist as a standing gate.** Found while scoping
hole (b): `projectModelCellRender.test.tsx` stated the inverse CSS direction was "covered by
verify-auto's className→CSS sweep", so the direction read as closed. No `package.json` script runs
such a sweep and no test asserted it. An ad-hoc command run once during a verify-auto pass is not
coverage. ⚠️ Same family as `[[rustdoc-link-to-a-nonexistent-test-fails-no-gate]]` — a claim in a
comment that no gate checks — and it cost real coverage here rather than merely misinforming:
the direction stayed open for two WPs. Corrected in place at WP5; the general risk (comments that
attribute coverage to ad-hoc runs) is unguarded repo-wide. Logged to backlog.

[SURFACED-2026-08-12] Phase 2 / the chord arm — **the chord arm's gate exemption is
WHOLE-MODULE, so a seam-referencing module can host an ungated workflow chord and pass.**
`isUngatedWorkflowChord` is `namesWorkflowTerm(src) && !/useWorkflowFeaturesEnabled/i.test(src)`
— a single seam reference **anywhere** in the file exempts **every** chord in it. Measured
during P2.3c: an ungated `docsChord` added to `panelHost.ts` passes 19/19, while the identical
code in `closeTerminalChord.ts` fails correctly. ⚠️ This is the *same shape* as the M10.9
basename hole (a module the arm cannot see into), one level finer: the arm now reaches the
module but cannot distinguish "this module consumes the seam **for this chord**" from "this
module mentions the seam **somewhere**". `panelHost.ts` is exactly the module at risk — it owns
`panelForChord` and carries a seam reference, so it satisfies the exemption permanently.
Logged to backlog; **not fixed in WP5** (a per-export gate-proximity check is its own design
problem, and inventing one at a milestone exit is the gold-plating this WP's scope note forbids).
