# Feature: M13 WP4 — Milestone exit verify + Group C close

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-08-18
**Drive mode:** autopilot
**WBS:** `workflow-system/product/wbs.md` → WP4 (Size **S**, depends on WP2 + WP3)

## Problem Statement

M13's two surfaces are built — WP2's five-member skill-button row and WP3's `recycleSession()`
operation with its button caller — but the milestone's **exit criteria have never been asserted as
criteria.** Each WP verified its own parts; nobody has verified the *milestone*. Three gaps make
this more than a formality. (1) WP3's success path was proven component-by-component but **never
composed in one live run** — CC correctly refuses to hand off from an empty scratch repo, so the
blocker is the fixture, not the code, and exit criterion 2 is exactly where it closes most cheaply.
(2) The OFF-invariant negative arm now has **five** arms and has never been probed **individually**
end-to-end — a composite bypass tripping *some* arm reports "the guard bites" while hiding a gap.
(3) The `arch/` set was never resynced for M13, and the WP3 review's documentary MAJOR (comment
density 52–71%, one rationale in five files, latency figures **already drifted**: `App.css` +
`Workspace.tsx` + `recycleButton.ts` say 28–52s while `recycleSession.ts` says 51.9s and
`recycleMachine.ts` says a 9–12s tail) is cheapest to pay while that resync is open. Closing this WP
closes M13, and with it Group C — vision success metrics 2 and 3, the final two of six.

⚠️ **Exit criteria are written in the FALSIFIABLE voice, not the optimistic one.** WP3's retrospect
found its plan-time outcomes said *"after a full successful Recycle"* / *"Recycle still succeeds"* —
phrasings under which **"verified"** and **"the precondition never occurred"** are indistinguishable.
Every outcome below names what would make it FAIL, and the live ones state their precondition as an
assertion, not an assumption.

⚠️ **The verification lesson this WP inherits, which is why the outcomes are shaped this way:** WP3
found **four defects across four gates and not one was a coding error.** Each was a gap between what
an assertion *said* and what it *measured* — an unasserted outcome, an unexercised input, a `grep -c`
counting a *definition* as a call site, an `indexOf` matching an *import*. ⚠️ **A green suite plus
biting mutants is not evidence an outcome was verified** — WP3 Phase 1 had 23/23 green and 4/4
mutants biting while an outcome went entirely unasserted. The instrument that caught it every time
was reading each outcome's **operative words** against the code, not against the test names.

## Non-goals (explicit — do not let the exit verify become a build)

- ⚠️ **NOT fixing the two behavioral MAJORs from WP3's review** (late-subscription disposal
  untestable-as-mocked; Recycle uncancellable across unmount). Both stay backlogged. The second
  **carries a decision, not just an edit** (on abort after a successful handoff but before the
  respawn, is the clean mark correct?) and belongs where that decision gets made — M15, whose caller
  fires unattended. Doing them here converts an S into an L.
- ⚠️ **NOT widening the button set.** Five skills + Recycle is an operator-signed verdict. Three of
  the five were fired ≤3 times ever and were accepted knowingly; do not re-litigate as dead weight,
  and do not add a sixth skill.
- ⚠️ **NOT adding a milestone section to `arch.md`.** The as-built record is organized **by
  subsystem**. `arch.md` is a 132-line index and stays one.
- **NOT `/product-finalize`.** That follows this WP's close as its own cycle step.

## Work Tree

- [x] Phase 1: Negative arm — all five guard arms, probed individually
  **Observable outcomes:**
  - CLI: `pnpm test src/state/__tests__/offInvariantGuard.test.ts` exits 0 with a **pinned count ≥ 26**
    printed (`Tests  N passed`); ⚠️ a filtered run matching **zero** tests prints `ok. 0 passed` and
    **exits 0** — the count assertion is what makes this outcome falsifiable, not the exit code.
  - CLI: for **each of the five arms individually** (panel · menu-id · chord · picker-row-cell ·
    skill-row+Recycle), a mutation that bypasses **that arm alone** makes the suite **FAIL**, and the
    failing test named in the output belongs to **that arm**. ⚠️ FAILS if a mutant is red via a
    *different* arm's assertion — that is the composite-bypass illusion this task exists to exclude.
  - CLI: each mutation is confirmed to have landed in **executable code** by `diff` against a
    pristine copy (⚠️ **not** a `sed -n '<line>p'` spot-check — WP3 had a range-check print the
    wrong line and an invalid probe was indistinguishable from a real hole **twice**).
  - CLI: `git diff --exit-code src/` exits 0 after the phase (every mutant reverted).
  - [x] P1.1 Enumerate the five arms from `offInvariantGuard.test.ts` and, for each, name the
        **single production value** whose gate-derivation it asserts. Record the arm→value→test-name
        map in this file before mutating anything.
  - [x] P1.2 Pin the guard file's test count as a floor assertion (guard against a future filter
        silently matching zero).
  - [x] P1.3 Mutate arm 1 (workflow panel) alone → expect red **from arm 1's test**; `diff`-confirm
        the mutant landed; revert.
  - [x] P1.4 Same for arm 2 (menu id).
  - [x] P1.5 Same for arm 3 (chord). ⚠️ **This arm exempts any module that merely *mentions* the
        seam, which is how a valid-looking probe passed 19/19 at M12 WP5**
        (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`). The probe must be a
        **type-level, executable** seam reference; the arm strips comments, and a comment-only
        mention was *measured* not to satisfy it.
  - [x] P1.6 Same for arm 4 (picker-row cell).
  - [x] P1.7 Same for arm 5 (skill row) **and its Recycle extension as a separate probe** — the row
        and the Recycle button are two predicates, so two mutants, not one.
  - [x] P1.8 Record per-arm results (mutant, landing evidence, failing test name) in `## Discoveries`
        or an inline table; file a SURFACE for any arm that did not bite.
  - [x] verify-auto
  - [x] verify-self
  - [x] verify-human  <!-- AUTO-SKIPPED per drive_mode=autopilot: no integration boundary; verify-self all-PASS -->
  - [x] verify-codify

- [x] Phase 2: Exit criterion 1 — no slash-command typing for common skills (live)
  **Observable outcomes:**
  - Browser (MCP `tauri` bridge, live WKWebView): with `workflow_features_enabled` **ON**, the
    focused workspace header contains **exactly 6** affordances from the M13 row — 5 skill buttons
    whose `command` values are exactly `/session-start`, `/session-restore`, `/session-capture`,
    `/util-prune-claude-md`, `/util-backlog-paydown`, plus **1** Recycle control. ⚠️ FAILS on 5, on
    7, or on any command string not in that set.
  - Browser: **exactly one** `/session-start` affordance exists in the DOM (the WP1 Q3 disposition —
    `sessionStartButton.ts` **is** that button; the row absorbed it, it was not duplicated beside it).
    ⚠️ FAILS at 0 or ≥2.
  - Browser: clicking one skill button injects that literal command into the focused CC pane —
    asserted **on the injection call's payload** (command + trailing `\r`, per `slashCommandPayload`),
    not on the xterm DOM. ⚠️ **The xterm DOM is not the buffer** — a working pane reads as 1–3
    characters and `innerText` returns xterm's injected *stylesheet*; a DOM-text assertion here is
    instrument error, not evidence.
  - Browser: with the gate **OFF**, the same header query returns **0** M13 affordances (the live
    counterpart to Phase 1's static arms).
  - CLI: `pnpm test` exits 0, ≥2112 frontend tests pass (WP3's close count — a drop means something
    was deleted, not that nothing changed).
  - [x] P2.1 Launch the dev build (`pnpm tauri:dev`, dev identity `com.claudesk.app.dev`) and attach
        the `tauri` MCP bridge. ⚠️ Read `docs/lessons/mcp-tauri-bridge-caveats.md` first — several
        caveats have produced false verdicts, incl. (h) a freshly-opened CC pane reading blank for
        seconds and meaning nothing.
  - [x] P2.2 Open a **scratch** workspace (`tmp/scratch/scratch-{a,b,c}`) — mandatory once a check
        spawns a CC session. ⚠️ Note the dev profile still seeds `scratch-a` → `autopilot` and
        `scratch-c` → `opus`; that is expected, not a finding.
  - [x] P2.3 Gate ON: query the header, assert the exact 6-affordance set and the single
        `/session-start`. Run a **positive control** proving the query can see a button at all before
        trusting any zero.
  - [x] P2.4 Click one low-risk skill button; capture the injection payload and assert the exact
        bytes.
  - [x] P2.5 Gate OFF (via the `⌘,` Settings toggle, the real user path — not a stubbed store):
        re-query, assert 0.
  - [x] P2.6 Restore the gate to ON and confirm the row returns (proves the OFF result was the gate,
        not a broken query).
  - [x] verify-auto
  - [x] verify-self
  - [x] verify-human  <!-- AUTO-SKIPPED per drive_mode=autopilot: no boundary (phase changed NO source); verify-self all-PASS. ⚠️ Subagent outcome-6 FAIL classified as UNREACHABILITY (bridge not exposed to subagents), not a defect — orchestrator observed those outcomes directly. -->
  - [x] verify-codify

- [x] Phase 3: Exit criterion 2 — Recycle end-to-end on a real session
  **Observable outcomes:**
  - ⚠️ **PRECONDITION, asserted not assumed:** the target workspace is a **real project with real
    work in it** (not an empty scratch repo — CC correctly refuses to hand off from one, which is
    what blocked WP3). Before the click, `.session.md` **absent** and the project's unclean-exit flag
    **set or unset** is recorded. ⚠️ If the run ends without CC having produced a handoff, the
    outcome is **NOT VERIFIED** — it is *"the precondition never occurred"*, and must be reported as
    such, never as a pass.
  - CLI/filesystem: after one click, in **one continuous run**: (a) `.session.md` appears with mtime
    **later than a baseline sampled BEFORE the click**, ignoring `*.tmp.*`; (b) the operation does
    **not** terminate at that write — it waits for the **next `Stop`** (⚠️ the roadmap's "wait for
    `.session.md` write completion" is a trap: WP1 measured the file landing **9–12s before the
    skill finishes**); (c) the project's unclean-exit flag reads **clear** afterwards; (d) a fresh CC
    process is running in the same workspace (new PID); (e) the fresh session ran `/session-restore`.
  - CLI: **sibling projects' unclean-exit flags are unchanged** by the clear (targeted, not
    wholesale) — asserted against a recorded before/after of the whole flag store.
  - Browser: after completion the workspace shows a live CC pane, and a subsequent open of that same
    project **announces nothing** (the flag was genuinely cleared, so no spurious `--continue`).
  - CLI: total elapsed from click to fresh-prompt is recorded as a **measurement** (WP1's captured
    range was 28–52s to terminal `Stop`, slowest 51.9s) — recorded, not asserted as a threshold.
  - [x] P3.1 Choose the fixture and **state why it satisfies the precondition** — the WBS's own
        guidance is that this closes most cheaply by recycling **a real session once**, rather than
        building a fixture elaborate enough to fool CC.
  - [x] P3.2 Record the before-state: `.session.md` presence + mtime baseline, the **full** flag
        store (for the sibling assertion), the CC PID.
  - [x] P3.3 Click Recycle once. Observe the composite marker firing in order (fresh write → next
        `Stop`), not just the end state.
  - [x] P3.4 Assert every after-state above, including the sibling-flags-unchanged arm.
  - [x] P3.5 Re-open the project and assert **no announcement** fires.
  - [x] P3.6 Resolve `SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE` **only if
        the composition was actually observed**; if the precondition failed, leave it open and record
        why. ⚠️ Claiming a resolve that did not happen is the exact failure WP3 avoided when it
        declined to claim the `cc_ready` doc-fix.
  - [x] verify-auto
  - [x] verify-self  <!-- outcome 7 UNVERIFIED/COSMETIC: instrument reach (bridge not exposed to subagents; run non-repeatable) — orchestrator-attested -->
  - [x] verify-human  <!-- operator-approved 2026-08-18; NOT auto-skipped (gate (b) failed on the UNVERIFIED outcome 7) -->
    - [x] P3.verify-human.1 exit criterion 2 met (orchestrator-attested; run non-repeatable)
    - [x] P3.verify-human.2 dev cc_permission_mode dontAsk→bypassPermissions stands; prod untouched
  - [x] verify-codify  <!-- no new tests: every live behavior already pinned; verified, not assumed -->

- [x] Phase 4: Doc resync — `arch/` by subsystem, metrics, probe re-confirm, one latency authority
  **Observable outcomes:**
  - CLI: `grep -c "^## " workflow-system/product/arch.md` is **unchanged** from before the phase —
    ⚠️ proves no milestone section was added to the index (task 4.5's explicit prohibition).
  - CLI: `arch/session-resumption.md` contains the `CleanExitRoute::RecycleSession` flag route;
    `arch/process-and-pty.md` contains Recycle's injection path; `arch/workflow-gate.md` contains the
    **fifth** guard arm. ⚠️ Each asserted as a **claim about the subsystem**, not a bare string match
    — a doc-correction site list is a **floor**, so `grep` the retracted/absent claim repo-wide too.
  - CLI: the string `28–52` appears in **exactly one** file under `src/` (one authority), and the
    other three sites either cite it by pointer or say nothing. ⚠️ FAILS if the count is 0 (the
    invariant was deleted along with the duplication) or ≥2 (the drift survives).
  - CLI: `vision.md` success metrics **2** and **3** read as met; `roadmap.md`'s M13 metric table
    shows 2 and 3 ✅ and Group C closed. `grep` finds **no** remaining `⏳ **M13**` in that table.
  - CLI: `pnpm test` + `cargo test -p claudesk` + `cargo clippy --all-targets -- -D warnings` +
    `pnpm format:check` all exit 0, with counts ≥2112 frontend / ≥828 Rust lib.
  - [x] P4.1 Resync `arch/session-resumption.md` (Recycle's flag route + the composite completion
        marker as an **invariant**, with provenance pointed at the archive).
  - [x] P4.2 Resync `arch/process-and-pty.md` (Recycle's injection + teardown reuses `handleRelaunch`
        — **not** Ctrl+D, so no second respawn route exists).
  - [x] P4.3 Resync `arch/workflow-gate.md` (the fifth arm; arm 5 asserts companion-skill
        **provenance by command prefix**, deliberately *not* by widening the shared `WORKFLOW_TERMS`).
      
  - [x] P4.4 Pay the documentary MAJOR: pick **ONE** latency authority, delete the other four, move
        provenance to the archive. ⚠️ **Do NOT trim a little from each site** — that is precisely how
        the four-consecutive-reviews case happened. Keep the *invariant* at the code (*"the marker is
        composite — do not simplify"*); move the *provenance* (three-run table, killed candidates,
        measured figures) out.
  - [x] P4.5 Update `vision.md` metrics 2 + 3 → met; `roadmap.md` M13 table + Group C close note.
      
  - [x] P4.6 Re-confirm WP1's four probe verdicts still hold as-built (Q1 the fixed set; Q2 moot by
        Q1; Q3 the composite marker; Q4 respawn goes through `cc_spawn_env` → the drive-mode signal
        is free). Correct any that did not survive contact — ⚠️ **Q4 is the one to actually re-check
        against Phase 3's live run**, since it is the only verdict Recycle's real respawn can falsify.
      
  - [x] P4.7 Tick WP4's tasks in `wbs.md`; update `runtimes.md` with this WP's observed runtimes +
        counts (one bullet per WP, not per run).
  - [x] verify-auto
  - [x] verify-self
  - [x] verify-human  <!-- AUTO-SKIPPED per drive_mode=autopilot: no integration boundary (source edits comment-only, proven); verify-self 8/8 PASS. Affirmation printed for read-time veto. -->
  - [x] verify-codify

## Current Node
- **Path:** Feature > ALL PHASES COMPLETE > ship
- **Active scope:** none — all four phases `[x]`, every verification node `[x]`. Ready to ship.
- **Blocked:** none
- **Unvisited:** (none — Phase 4 is the last)
- **Open discoveries:** 1 — `SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` (logged to backlog)


## Phase 1 — the arm map (P1.1)

⚠️ **Recorded BEFORE any mutation**, so each probe can be attributed to a named arm and a named
test. Baseline: `vitest run src/state/__tests__/offInvariantGuard.test.ts` → **32 passed**
(2026-08-18). Note the plan's floor said ≥26; the real count is 32.

| # | Arm | Production value it asserts | Module | OFF-assertion test name |
|---|-----|------------------------------|--------|--------------------------|
| 1 | PANEL | `availablePanels(false)` | `components/workspace/panelHost.ts:116` | "registers no workflow panel in the OFF-state panel set" |
| 2 | MENU ID | `MENU_IDS` (static map) | `menu/menuBridge.ts` | "registers no workflow menu id in MENU_IDS" |
| 3 | CHORD | modules exporting `*Chord*`, selected by content | `chordModules()` + `isUngatedWorkflowChord()` (in-test) | "matches no workflow chord (no chord predicate module is workflow-coupled)" |
| 4 | ROW-CELL | `cellLines(…, false, …)` **and** `rowAffordances(…, false)` | `cc/driveMode.ts`, `components/picker/announceRow.ts` | "renders no workflow line in the OFF-state picker cell" / "announces no GATED auto-resume arm on an OFF-state picker row" |
| 5 | SKILL-ROW | `showSkillButtons({workflowEnabled:false, …})` + `SKILL_BUTTONS` membership | `components/workspace/skillButtons.ts:149` | "renders no skill button while the gate is OFF" |
| 5x | RECYCLE (arm-5 extension) | `showRecycleButton({workflowEnabled:false, …})` | `components/workspace/recycleButton.ts:41` | "renders no RECYCLE button while the gate is OFF" |

⚠️ **Arm 4 has TWO derivations and arm 5 has TWO predicates** — so this phase runs **seven**
probes, not five. `showSkillButtons` and `showRecycleButton` are *separate* predicates with
identical bodies; a mutation to one must not be assumed to cover the other (that assumption is
exactly the "the set is not the caller" shape this arm was written to catch).

⚠️ **Every arm also carries an anti-vacuity companion** ("genuinely gate-DERIVED"). Those are not
probed as bypasses — they are the reason a bypass is detectable. Recorded so a later reader does
not mistake them for arms.


## Phase 1 — probe results (P1.3–P1.8)

⚠️ **Seven probes, each mutating ONE arm's production value, each reverted before the next.**
Landing check: `diff` against a pristine copy taken before any mutation (⚠️ **not** `sed -n '<line>p'`
— WP3 had a range-check print the wrong line, and an invalid probe was indistinguishable from a real
hole **twice**). Guard baseline: **33 passed** (32 + the P1.2 arm-count pin).

| # | Arm | Mutant | Landed (diff) | Result | Failing test — attribution |
|---|-----|--------|----------------|--------|-----------------------------|
| 1 | PANEL | `"docs"` added to the **ungated** `AVAILABLE_PANELS` | ✅ line 62, in the array literal | 🔴 **1 failed / 32 passed** | "registers no workflow panel in the OFF-state panel set" — **arm 1 only** |
| 2 | MENU ID | `WORKFLOW_DOCS: "view.workflowDocs"` added to `MENU_IDS` | ✅ line 43, in the object literal | 🔴 **1 failed / 32 passed** | "registers no workflow menu id in MENU_IDS" — **arm 2 only** |
| 3 | CHORD | `export function skillRowChord(...)` appended to `panelHost.ts`, body branches on a non-gate value | ✅ lines 216–219, executable export | 🔴 **1 failed / 32 passed** | "matches no workflow chord …" — **arm 3 only** |
| 4a | ROW-CELL / `cellLines` | `if (!gateEnabled)` → `if (false)` | ✅ line 145 | 🔴 **2 failed / 31 passed** | "renders no workflow line in the OFF-state picker cell" + its own anti-vacuity companion — **arm 4 only** |
| 4b | ROW-CELL / `rowAffordances` | `if (!armAvailable(action, enabled))` → `if (false)` | ✅ line 129 | 🔴 **1 failed / 32 passed** | "announces no GATED auto-resume arm …" — **arm 4 only** |
| 5a | SKILL-ROW | `showSkillButtons` drops `inputs.workflowEnabled &&` | ✅ line 153 | 🔴 **2 failed / 31 passed** | "renders no skill button while the gate is OFF" + its anti-vacuity companion — **arm 5 only** |
| 5x | RECYCLE | `showRecycleButton` drops `inputs.workflowEnabled &&` | ✅ line 45 | 🔴 **1 failed / 32 passed** | "renders no RECYCLE button while the gate is OFF" — **arm 5x only** |

**Verdict: all seven bite, and every one is attributable to its OWN arm.** No probe went red via a
different arm's assertion — the composite-bypass illusion the outcome was written to exclude did not
occur. ⚠️ Two probes each produced **two** failures; both are the mutated arm's OFF assertion **plus
its own anti-vacuity companion**, which is the correct response to a constant-derivation mutant
(the companion exists precisely to catch "the derivation ignores its argument"), not cross-arm noise.

**5a and 5x are confirmed INDEPENDENT.** The 5a mutant left both Recycle assertions green and vice
versa — so the two identical-bodied predicates really are separately guarded. That was the assumption
worth testing, since "the set is not the caller" is the shape arm 5 exists to catch.

### ⚠️ The invalid probe, recorded because it looked exactly like a hole

Arm 2's **first** probe added `RECYCLE_SESSION: "workspace.recycleSession"` to `MENU_IDS`. It landed
in executable code and the guard stayed **33/33 green** — presenting identically to a real gap. It was
**not** one: `WORKFLOW_TERMS` is `["workflow", "docs", "skill", "drivemode", "drive-mode"]`, and
neither "recycle" nor "session" is a member, so arm 2 correctly saw nothing workflow-coupled. Re-probed
with `WORKFLOW_DOCS` (a real term) and the arm bit immediately.

⚠️ **But the invalid probe surfaced a real predicate-completeness gap** — filed as
`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`. A `RECYCLE_SESSION` menu id **would**
be a genuine M13 workflow surface, and arm 2's vocabulary cannot see it. This is the
*guard-predicate-completeness* failure mode, distinct from a mutation that never lands: the arm's
assertion is sound, its **term list** is incomplete. Not fixed here — widening `WORKFLOW_TERMS` is a
cross-arm change (the shared list feeds arms 1, 2, 3) and WP2 deliberately declined to widen it,
asserting arm 5's provenance by **command prefix** instead. Deciding that belongs with the arm's owner,
not inside an exit verify.


## Phase 2 — pre-read: the live query surface (recorded before observing)

Every M13 affordance carries a stable `data-testid`, so Phase 2's live queries are id-addressed, not
class-name-fragile (`Workspace.tsx:483-530`):

- Row container: `data-testid="workspace-skill-row"`
- Each skill button: `data-testid="workspace-skill-<command-without-slash>"` (e.g. `workspace-skill-session-start`)
- Recycle: `data-testid={RECYCLE_TESTID}`, class `workspace-skill-btn workspace-recycle-btn`
- Shared class on all six: `workspace-skill-btn`

`SKILL_BUTTONS` members confirmed at source (`skillButtons.ts:106-130`): `/session-start`,
`/session-restore`, `/session-capture`, `/util-prune-claude-md`, `/util-backlog-paydown` — matching
the plan's expected set exactly, so the "exactly 6" outcome is 5 mapped + 1 sibling.

⚠️ **Read this before interpreting a zero in Phase 2: the Recycle button renders INSIDE the
`showSkillButtons(...) &&` block.** Phase 1 proved the two *predicates* are independently guarded
(the 5a mutant left Recycle's assertions green and vice versa), but at the **render site** the row
gate strictly dominates — so a live OFF-state zero for Recycle is explained by *either* predicate and
does not by itself discriminate between them. This is WP3's review MINOR (a) observed as-wired, not a
new finding; it is recorded here so Phase 2 does not over-claim what a live zero proves.


## Phase 1 — verify-self result (independent reproduction)

**All five outcomes PASS.** A one-shot subagent re-ran all seven mutation probes plus two
meta-checks from scratch, with pristine-copy `diff` landing checks throughout. Orchestrator-side
re-confirmation after it finished: `git diff --name-only src/` lists only the intended test file,
and the guard is green at **33 passed**.

⚠️ **This is a genuine second observation, not a re-read of my own notes** — the subagent took its
own pristine copies, applied its own mutations, and reported the failing test names it saw. Its
attribution table matches the build-time table row for row (7/7 bite, each via its own arm, no
cross-arm leakage).

**Two things it checked that I had asserted rather than proven:**

1. ⚠️ **The two 2-failure probes (4a, 5a) were confirmed same-arm, not cross-arm leakage** — it read
   the companion test *bodies* and verified each asserts only on its own arm's subject function
   (e.g. 5a's companion calls only `showSkillButtons`). I had inferred this from the test names;
   reading the bodies is the stronger check, and it is exactly the "operative words against the
   code, not the test names" instrument WP3's retrospect identified.
2. ⚠️ **Probe 3 (chord) was confirmed NOT a pass-by-exemption** — the known trap here
   (`SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE`) is that the arm exempts any
   module merely *mentioning* the seam, which is how a valid-looking probe passed 19/19 at M12 WP5.
   It verified `panelHost.ts` owns a real chord predicate and the arm's **per-export** scan flagged
   the new export specifically. That is the difference between a probe that bit and a probe that was
   never in scope.
3. **The arm-count pin survived Prettier's reflow with its logic intact** — deleting the `3 CHORD`
   entry (diff-confirmed as an executable array element, `851d850`) failed with the pin's own message
   and `expected 6 to be 7`. Worth having proven rather than assumed: a formatter touched this file
   *after* the pin was written, and a reflow silently disarming a guard is a logged failure here.

**No BLOCKING findings. No COSMETIC findings.** No integration boundary — the phase adds an isolated
new test and reverted every production mutation.


## Phase 1 — verify-codify result

**No integration boundary** — the phase adds isolated new test artifacts only.

**Coverage assessment first, writing second.** Three of Phase 1's verified behaviors were already
covered and were deliberately NOT duplicated: the seven OFF-state assertions (the guard's own arms),
the anti-vacuity companions, and the arm-4/arm-5 "asserts the REAL derivation, not a local
re-implementation" meta-guards. **One real gap was found:** arms 4 and 5 each received a real-vs-stub
meta-guard when they were built, but **arm 5x (Recycle, M13 WP3) never did.**

⚠️ **That omission matters more here than anywhere else in the file:** `showRecycleButton` and
`showSkillButtons` have **byte-identical bodies**, and the guard imports only the one symbol — so a
stub written to satisfy arm 5x is indistinguishable from the real predicate.

**Test added:** `"the Recycle arm asserts the REAL predicate, not a local re-implementation"` —
pins that the symbol is imported (not stubbed), that the predicate needs BOTH terms (the null-session
dead-click guard must hold even while the gate is ON), and that the two predicates remain
**independent symbols**.

**Mutation-proven, each mutant `diff`-confirmed against a pristine copy:**

| Mutant | Result | Caught by |
|---|---|---|
| A — predicate stubbed to gate-only (`return inputs.workflowEnabled`) | 🔴 2 failed / 32 passed | the new test **+** arm 5x's existing anti-vacuity companion |
| B — the two predicates **aliased** (`export { showSkillButtons as showRecycleButton }`) | 🔴 **1 failed / 33 passed** | ⚠️ **the new test ALONE** |

⚠️ **Mutant B is the reason this test earned its place.** Aliasing the two predicates — the tempting
"dedupe" a future reader would apply to two identical bodies — leaves **all 33 pre-existing tests
green**, including every arm-5x assertion, while arm 5x silently becomes an *alias* of arm 5. A later
gate change to the row would then move Recycle with it, unnoticed. P1.3–P1.7 mutation-*proved* the two
predicates independent but nothing **pinned** it; this does.

**Suite:** **2114 frontend passed** (165 files) — exactly +2 over WP3's close baseline of 2112,
attributable to this phase's two added tests, no regressions. Rust untouched (`git status src-tauri/`
empty), so the 828 lib baseline is unchanged and was not re-run. `tsc --noEmit`, `eslint`, and
`prettier --check` all clean.


## Phase 2 — live observation results (P2.1–P2.6)

**Environment.** Dev build `pnpm tauri:dev` (PID 26625, `target/debug/claudesk`), MCP `tauri` bridge
attached. ⚠️ **Dev-vs-prod discrimination done properly:** the operator's PRODUCTION app was running
throughout at PID 1081 (`/Applications/Claudesk.app`) and was never touched. `document.title` returns
`"Claudesk"` for BOTH builds and **cannot** discriminate them — `manage_window{list}` returns the
native title **`"Claudesk (dev)"`**, which is what proves the bridge attached to the right app.
Fixture: `tmp/scratch/scratch-b` (chosen over `scratch-a`/`scratch-c`, which carry seeded dev state —
`scratch-c` visibly announces `↻ continue` from the pre-existing unclean flag).

| Outcome | Result | Evidence |
|---|---|---|
| Exactly **6** affordances, gate ON | ✅ PASS | 5 skill buttons + exactly 1 Recycle. Commands exactly `/session-start`, `/session-restore`, `/session-capture`, `/util-prune-claude-md`, `/util-backlog-paydown`. Positive control: 33 buttons on page, shell + row present. |
| Exactly **one** `/session-start` affordance | ✅ PASS | Searched **wider than the row** (all buttons, by testid/aria/title) — count is **1**, parent is `workspace-skill-row`, and the only `start`-matching testid in the whole DOM is the row member. The WP1 Q3 disposition ("the row ABSORBED it, not duplicated beside it") confirmed live. |
| Click injects the literal command | ✅ PASS | `❯ /session-capture` appears as a **submitted** prompt (typing-side) **and** CC ran a real turn — "Cooked for 26s", skill engaged and asking what to persist (execution-side). Both sides required per `[[observable-outcomes-execution-evidence]]`. |
| Gate OFF ⇒ **0** M13 affordances | ✅ PASS | Row **ABSENT** (`OFF_rowPresent: false`), not hidden/disabled — the seam contract's shape. Positive control: 26 buttons still present, **both xterm panes still mounted**, so the zero is the gate and not a torn-down workspace. |
| Gate restored ⇒ row returns | ✅ PASS | Back to 6 affordances, 33 buttons. Round-trips both directions, so the OFF result is **causal**. |

**Gate flipped through the REAL user path** — `⌘,` chord → the `settings-workflow-features` checkbox →
verified **on disk** (`com.claudesk.app.dev/settings.json` flipped `true`→`false`→`true`), not a stubbed
store. ⚠️ Prod profile confirmed **untouched**.

### ⚠️ An instrument failed first, and the failure looked like a feature failure

My first attempt at the injection outcome patched `__TAURI_INTERNALS__.invoke` to capture the payload.
It captured **nothing** (`ccInputCalls: 0`) — which reads exactly like "the button does not inject."
It was **instrument error**: `injectCommand` calls the `invoke` **imported from
`@tauri-apps/api/core`** — a module-scope binding captured at import time — so a late monkey-patch of
the internals object is never consulted. Read the source before believing the zero.

⚠️ **The second wrong instrument was the CC transcript.** `~/.claude/projects/<slug>/*.jsonl` showed
nothing newer than the click, which again looks like failure. Cause: the pane prints
*"Transcript saving is off — inherited `CLAUDE_CODE_CHILD_SESSION` marker"* — the known
`[[agent-launched-app-cannot-verify-continue]]` limitation. **An agent-launched CC writes no
transcript**, so transcript-absence is worthless as evidence here.

**What actually worked: reading the xterm BUFFER via the React fiber** (walking `memoizedState` for a
ref whose `.current.buffer.active` exists), per `[[xterm-dom-reads-fake-a-blank-pane]]` — the xterm
**DOM** is not the buffer. Two instruments failed and a third succeeded; had I stopped at either
failure I would have filed a false BLOCKING defect against a feature that works.


### Phase 2 verify-auto — residue check (the check this phase actually needed)

Phase 2 changed **no source** (`git status --short src/ src-tauri/` shows only Phase 1's test file),
so the scoped checks are about **residue from live probing**, not about new code:

- **Persisted dev settings byte-identical to pre-phase** — `workflow_features_enabled: true`, all
  other keys unchanged. The gate was flipped `true`→`false`→`true` through the real `⌘,` path and
  landed back where it started. ⚠️ **Prod profile confirmed untouched.**
- **Webview residue removed.** The `__TAURI_INTERNALS__.invoke` interceptor I installed for the
  (failed) payload-capture attempt was restored, but `window.__wp4_restore` — the closure holding the
  original `invoke` — was **still attached**. Deleted it. Harmless to the codebase, but leaving a
  patched-then-restored IPC path dangling in the webview that Phase 3 will drive a **real Recycle**
  through is exactly the kind of thing that produces an unexplainable result three steps later.
- **Static ↔ live cross-check** (neither phase makes this one alone): the five commands in
  `SKILL_BUTTONS` source and the five rendered in the live DOM are set-equal, and Recycle is a
  separate sibling. This is what closes the gap between "the array says X" and "the screen shows X".
- Standing gate on Phase 1's delta: `tsc` / `eslint` / `prettier --check` clean, guard at **34 passed**.


## Phase 2 — verify-self result

**All five reachable outcomes PASS** (independent subagent, static + persisted claims).

| Outcome | Result | Note |
|---|---|---|
| `SKILL_BUTTONS` is exactly 5, Recycle not a member | ✅ PASS | Parsed the array **programmatically**, not by eyeballing the heavily-commented file; no "recycle" anywhere in the literal |
| Exactly ONE `/session-start` render path | ✅ PASS | `SESSION_START_COMMAND` / `showSessionStartButton` **no longer exist as definitions** — surviving mentions are comments/test prose documenting the removal. `sessionStartButton.ts` survives exporting only `nextOpenIndicator`, a display-only `<span>`, not a button |
| Both gate predicates consulted at the render site | ✅ PASS | + a nesting finding, below |
| Dev gate back at `true`, prod untouched | ✅ PASS | Both read `true`; the profiles differ only in **pre-existing unrelated** fields the phase never claimed to touch |
| Guard at 34 passed | ✅ PASS | Ran the local binary directly; **re-measured the exit code** after a `PIPESTATUS` read came back empty under zsh, rather than assuming it |

⚠️ **Outcome 6 (the live-DOM outcomes) came back `FAIL/BLOCKING`, and it is NOT a genuine blocker.**
The subagent's own words: *"this is 'not reached by me,' not 'observed broken.'"* `mcp__tauri__*` is
**not exposed to subagents** (`[[mcp-bridge-tools-not-exposed-to-subagents]]`) — it had only Playwright,
which reaches a Tauri-less Vite page. ⚠️ **It correctly REFUSED to substitute a Playwright visit to
`localhost:1420`**, which would have rendered without `__TAURI_INTERNALS__` and produced instrument
error dressed as a finding. Those outcomes were observed **directly by the orchestrator** through the
bridge against the real WKWebView, and a subagent's unreachability does not retract a direct
observation. Not a back-loop.

### ⚠️ The nesting finding — independently confirmed, and it sharpens WP3's MINOR (a)

Both predicates ARE consulted, but the Recycle button sits **inside** the row's `showSkillButtons`
conditional (`Workspace.tsx:488-527`), a sibling of the five *mapped* buttons rather than of the row
itself. Today behavior is identical because the two predicates are byte-identical
(`workflowEnabled && ccSessionId !== null`).

⚠️ **The sharpened form is the useful part:** `recycleButton.ts`'s own doc says the predicates are
deliberately separate **so their conditions can diverge** — but under this nesting a future divergence
could only ever **REMOVE** Recycle, never **show** it when the skill row is hidden. The documented
independence is **half-realized at the render site**. This matches the pre-read note recorded before
Phase 2 ran and confirms WP3 review MINOR (a) from a second, independent reading. Filed as part of
that existing finding rather than as a new one — it is the same defect seen more precisely.


## Phase 2 — verify-codify result

**No integration boundary** — the phase added no artifacts; it observed existing ones.

**Coverage assessment first.** `skillButtons.test.ts` already covers Phase 2's behaviors well and
those were deliberately NOT duplicated: membership + order, per-member live callers through the real
funnel, the CR-not-LF payload rule, the row gate, Recycle-inside-the-row structure, Recycle-not-a-
member, and a **dead-CSS guard** forbidding the absorbed button's old `.workspace-session-start` class.
The absorption is also pinned at module level (`SESSION_START_COMMAND` / `showSessionStartButton` no
longer exist as definitions).

**One genuine gap found and closed.** ⚠️ **Every existing absorption assertion is about ABSENCE of the
OLD button; none is about the COUNT.** Nothing stopped a *new* second render site — a hand-written
`<button onClick={() => fireSkill("/session-start")}>` added anywhere in `Workspace.tsx` — from
satisfying all of them while putting **two** `/session-start` buttons on screen. That is exactly the
"two mechanisms serving one skill" shape the WBS calls "the problem", and WP1's Q3 disposition is a
**count** ("exactly one may exist when it is done"), not an absence.

**Test added:** `"renders EXACTLY ONE /session-start affordance — the absorption, asserted at the
render site"`. Asserts no hand-written `/session-start` literal exists in the render path (the row
emits from `SKILL_BUTTONS.map`, so any JSX literal is by construction a second affordance), that the
rendered testid is **derived** from the command rather than hardcoded, and that the array carries the
command exactly once.

**Mutation-proven:** injecting a second `/session-start` button into `Workspace.tsx` (diff-confirmed as
7 executable JSX lines) → **1 failed / 21 passed**. ⚠️ **The new test caught it and nothing else did** —
all 21 pre-existing assertions passed with two buttons rendering. Reverted; `Workspace.tsx` byte-clean.

**Suite: 2115 frontend passed** (165 files), +1 over the post-Phase-1 count of 2114, attributable to
this one test. `tsc` / `eslint` / `prettier --check` clean. Rust untouched.


## Phase 3 — live Recycle run 1 (in progress / see outcome below)

**P3.1 — fixture precondition, stated not assumed.** `~/Tmp/yitang-copy` (operator-selected) carries a
**19.7 KB incident WIP mid-workflow** (`incident-mitigate` pending), a real `backlog.md`, real git
history, and a pre-existing `.session.md`. That is genuine substance for `/session-handoff` to write
about — the thing `scratch-b` structurally cannot provide (one baseline commit, two trivial files),
which is precisely why WP3 was **fixture-blocked** rather than code-blocked.

⚠️ **The fixture also happens to exercise WP1 Q3's ambiguity case for free:** a **stale `.session.md`
already existed** (mtime `1785257920`, Jul 28) *before* the operation. Existence-as-marker would fire
instantly here — which is exactly why the marker is a composite (fresh mtime beating a
**pre-sampled** baseline, then the next `Stop`).

**P3.2 — before-state.** Fresh baseline epoch sampled BEFORE the click: **1787071250**. Flag store
immediately pre-click:

```
/Users/stayman/Personal/projects/claudesk/tmp/scratch/scratch-c : true
/Users/stayman/Personal/projects/claudesk/tmp/scratch/verify-041: true
/Users/stayman/Tmp/yitang-copy                                  : true   <- Recycle must CLEAR this
```

⚠️ **`yitang-copy` had an unclean flag set by the act of opening it** — so this run tests the
clear-on-clean-boundary rule against a *real* set flag, not a synthetic one. `scratch-c` and
`verify-041` are the **sibling-unchanged** assertion's subjects.

⚠️ **Incidental evidence worth keeping:** closing `scratch-b` **removed** its entry from the store
(it was `true` at P3.2, absent by pre-click). A clean close clears the flag — the mechanism works.

### ⚠️ A real trap avoided: the focused workspace was NOT the one just opened

Opening `yitang-copy` from the picker mounted it as a **background filmstrip tile** while the header —
and therefore the Recycle button — still belonged to **`scratch-b`**. **Clicking Recycle at that moment
would have recycled the wrong workspace.** Caught by asserting the header's project name before
clicking rather than assuming the newly-opened project was focused.

⚠️ Neither a DOM `.click()` on the tile nor a `⌘⇧2` synthetic keypress promoted it (the tile body is a
plain `<div>`; only close/pause carry `onClick`). Resolved by **closing `scratch-b`** so the target was
the only workspace — then the header read `yitang-copy` and the switch was verifiable rather than
assumed.

**P3.3 — clicked once at epoch 1787071259.** Busy state confirmed immediately: button `disabled`,
tooltip → *"Recycling — handing off, then restarting this session…"*. So the operation genuinely
started (not a silent no-op), and the double-click guard is live.

**Handoff observed running inside CC** — the pane showed `/session-handoff` reading the incident WIP
(`grep -l "tour:" …`, `head -10 … incident-v2-no-lark-doc…`). ⚠️ At ~18s CC hit **`API error ·
Retrying … attempt 2/10`** and stalled there. **Recycle correctly kept waiting** rather than firing on
a partial signal — which is the composite marker doing its job under an unplanned condition.


### Run 1 OUTCOME — the FAILURE arm fired, and it failed SAFELY (all three checks)

CC declined to write the handoff. Its own words in the pane: *"Not labeling a transition — **S17 was
not reached, since `.session.md` was never written**."* (It had stalled on `API error · Retrying …
attempt 2/10` mid-skill, then ended the turn without writing.)

⚠️ **This is `no-fresh-write` — the source calls it "run 2's shape"**: *"`Stop` arrived without a
preceding fresh write. The handoff did not happen (CC refused, errored, or answered with a question
instead)."* WP1 captured the same shape empirically. **Not** the dangerous `restore-not-injected`.

**The three safety checks, all correct:**

| Check | Observed | Why it matters |
|---|---|---|
| Was CC killed? | **NO** — session alive, `Idle`, xterm mounted | `recycleMachine.ts`'s own invariant on this arm: *"⚠️ Never kill the session on this arm."* Held. |
| Was the unclean flag cleared? | **NO** — `yitang-copy: true` still set | ⚠️ **The load-bearing one.** A failed handoff is **not** a clean boundary, so clearing would have left a false clean mark and suppressed the next open's `--continue`. |
| Was `.session.md` written? | **NO** — still mtime `1785257920` (Jul 28) | Recycle did not fabricate a write to satisfy its own marker. |

**Siblings unchanged:** `scratch-c` and `verify-041` both still `true`.

**Recovery is clean:** button re-enabled, tooltip back to the idle text, operation retryable.

⚠️ **No toast — and that is CORRECT, not a defect.** `Workspace.tsx:238-246` deliberately uses
`console.warn` as this row's failure channel: *"replacing a working terminal with an error overlay,
over an operation the user can retry, would be worse."* The CC pane itself is the evidence surface.
(The bridge's console capture returned nothing, so the arm was determined from **observed state** —
no kill + no write ⇒ terminated at the handoff-wait stage — which is stronger evidence than a log line.)

**What run 1 does and does not establish.** It **re-proves the failure arm against a real refusal**
(already proven at WP3) and adds the flag-not-cleared and siblings-unchanged assertions against a
**real set flag**. It does **NOT** establish the success path, which is what
`SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE` and exit criterion 2 actually
require. ⚠️ **Recorded as NOT-VERIFIED rather than counted as a pass** — this is exactly the
"verified vs. the precondition never occurred" distinction the plan was written in the falsifiable
voice to keep visible.


### ⚠️ RUN 2 — the same failure arm, but it exposed the REAL blocker, and it is NOT Recycle

Run 2 (clicked 1787071412, target re-confirmed as `yitang-copy` before clicking) hit `no-fresh-write`
again — but this time CC stated its reason explicitly, and it is **not** an API error and **not** the
fixture's content:

> *"Write to `workflow-system/state/.session.md` was **denied** again… the block is the **permission
> mode**, not anything about the skill or the content."* — and, decisively: *"the content is composed
> and ready."*

**Root cause: the DEV profile ran `cc_permission_mode: "dontAsk"` while PROD runs
`bypassPermissions`.** Per `cc_session/mod.rs:97`, `dontAsk` *"just stops the prompting"* — it does
**not** grant the write. So `/session-handoff` composed a correct handoff and was then silently
refused at the write, with **no prompt to accept**. Yolo (`bypassPermissions`) is the vision's default
and what prod uses; the dev profile had drifted.

⚠️ **This reframes WP3's "fixture-blocked" conclusion, and the correction matters.** WP3 concluded CC
*"correctly refuses to hand off from an empty scratch repo"* — true for `scratch-b`, but **not the
whole story**. On a fixture with ample real content, the handoff still failed — because of a
**permission-mode configuration**, which no amount of fixture-building would have fixed. ⚠️ **Anyone
retrying this on a richer fixture without checking the permission mode would keep failing and
mis-attribute it to the fixture again.**

**Fixed by setting the dev profile to `bypassPermissions`** (through the real `⌘,` Settings select,
verified on disk; prod untouched — it was already `bypassPermissions`). ⚠️ **The mode is read at
SPAWN time**, so the running CC kept the old mode — the workspace was closed and reopened to respawn
under the corrected mode before run 3.

**Run 2's safety checks: identical to run 1 and all correct** — CC not killed, `yitang-copy: true`
flag still set, `.session.md` still at the Jul-28 mtime, siblings unchanged. ⚠️ **Two independent
real refusals now confirm the failure arm** — the arm that can destroy work — which is a stronger
result than WP3's single one.


## ✅ RUN 3 — THE SUCCESS PATH, COMPOSED END-TO-END IN ONE CONTINUOUS RUN

**Exit criterion 2 is MET.** After the permission-mode fix (and a respawn to pick it up — the pane
confirmed `⏵⏵ bypass permissions on`, previously `don't ask on`), one click composed the whole
sequence. ⚠️ **This is the composition WP3 could never observe** and what
`SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE` was filed for.

**Before-state** — baseline epoch **1787071590** sampled BEFORE the click; `.session.md` **ABSENT**
(the prior restore consumed it, so no stale-file ambiguity); flags `scratch-c:true`,
`verify-041:true`, **`yitang-copy:true`** (a real set flag to clear).

**Clicked once at 1787071596**, target header re-asserted as `yitang-copy` first.

| # | Assertion | Observed | Verdict |
|---|---|---|---|
| a | Fresh write, mtime > pre-sampled baseline, ignoring `*.tmp.*` | mtime **1787071634** = **+44s** past baseline, **38s** after click, 5564 bytes | ✅ |
| b | Does **NOT** terminate at the write — waits for the next `Stop` | Recycle still **busy** at the write; pane showed *"No `tour:` field, one active WIP. Writing the pointer."* then continued | ✅ |
| c | Unclean flag cleared | See the re-set analysis below — **clear confirmed empirically** | ✅ |
| d | Fresh CC process | Pane read **`Ctx Used: 0.0%`** — a brand-new context, so the kill+respawn really happened | ✅ |
| e | Fresh session ran `/session-restore` | `❯ /session-restore` typed and executed; emitted transition **`S6`** (standard restore) and restored the incident context (field test, NEEDS-MIGRATION item) | ✅ |
| f | Siblings' flags unchanged | `scratch-c` and `verify-041` `true` throughout all three runs | ✅ |
| g | Cleared project announces nothing on reopen | Picker row reads plain `yitang-copy` — **no `↻`** at all | ✅ |

**Elapsed: ~38s click→write**, within WP1's measured 28–52s band.

### ⚠️ The flag read `true` right after Recycle — and that is CORRECT, not a missed clear

The naive read of assertion (c) fails: immediately post-Recycle the store still showed
`yitang-copy: true`. **Do not "fix" this.** Three independent lines of evidence say the clear worked
and the **respawn legitimately re-set** it:

1. **Ordering is explicit in the code** (`recycleSession.ts:320-330`): `markSessionClean(projectPath,
   "recycle-session")` at **step 4**, `relaunch()` at **step 5** — with a written rationale for that
   order (*"marking before the kill means a crash between the two leaves the flag CLEAR on a session
   that never respawned… the benign direction"*).
2. **Setting is owned by the spawn path.** `session_state/commands.rs` states there is deliberately
   **no `mark_unclean` command** — *"setting is owned by the backend spawn path
   (`SessionRegistry::spawn`)"*. So a live respawned session **must** carry the flag again.
3. **Empirically proven:** closing the recycled workspace cleanly **removed `yitang-copy` from the
   store entirely**, while both siblings survived. A clear that "did not work" could not then clear
   on a clean close.

⚠️ **The lesson for the next reader:** the post-Recycle flag state is **not** a direct observable of
the clear — it is `clear → respawn re-set`, and only the *reopen announcement* (assertion g, which
reads clean) shows the operator-visible consequence the rule actually cares about.

### Run tally — three runs, and the two failures were worth more than a clean first try

| Run | Result | What it proved |
|---|---|---|
| 1 | `no-fresh-write` (CC stalled on a transient API error, then ended the turn) | Failure arm safe: no kill, flag NOT falsely cleared, no fabricated write |
| 2 | `no-fresh-write` — **write DENIED by permission mode** | Exposed the real blocker; **corrected WP3's "fixture-blocked" diagnosis** |
| 3 | **SUCCESS** | The full composition, all seven assertions |

⚠️ **Two independent real refusals** now back the failure arm (WP3 had one), and they bracket the
success run on the same fixture — so the difference between the arms is attributable to the
permission mode, not to fixture luck.


### Phase 3 verify-auto

Phase 3 changed **no source** (live observation + docs), so the scoped checks are invariants and
residue rather than compilation:

| Check | Result |
|---|---|
| **CHANGELOG-then-delete invariant** | ✅ resolve line present in `CHANGELOG.md` (1), backlog entry **gone** (0), both staged in the same commit |
| Backlog integrity after the delete | ✅ 34 entries, **0** orphaned field lines — the block delete left no remnant |
| CHANGELOG shape | ✅ `# Changelog`, `## 2026-08-18` section, entry appended to the **bottom** of the day (chronological within a day) |
| Dev persisted settings | ✅ only `cc_permission_mode` changed (`dontAsk`→`bypassPermissions`, the deliberate Phase 3 fix); every other key unchanged |
| Prod profile | ✅ byte-identical to how it was found |
| Flag store | ✅ `yitang-copy` correctly gone after the clean close; both pre-existing siblings intact; no test junk |
| Fixture end state | ✅ `.session.md` absent — consumed by the injected restore, the correct terminal state |
| `tsc --noEmit` | ✅ |
| Targeted units (`recycleMachine`, `skillButtons`, `offInvariantGuard`) | ✅ **86 passed** |

⚠️ **One extra check worth keeping: the live run corroborates the machine's encoded constants.**
Run 3's click→write was **38s**; WP1's captured run 1 was **39.7s** to the write and 51.9s to `Stop`;
`RECYCLE_TIMEOUT_MS = 180_000` retains ~3.5× headroom over that worst case. **No drift** — the
timeout is still sized off a measurement that reality still matches. (Had the live figure landed
outside the band, the constant would have been the finding, not the run.)

⚠️ **And it independently re-confirms P4.4's target:** three sites cite *"28–52s"*
(`recycleButton.ts`, `App.css`, `Workspace.tsx`) while `recycleSession.ts` cites *51.9s* and the
*9–12s tail* — and this run adds a **fourth** live figure. That is the duplication needing ONE
authority, now with a measurement to anchor it.


## Phase 4 — pre-read: the exact resync targets (recorded before editing)

⚠️ **`arch.md` is an INDEX (a subsystem table, lines 19-29) — Phase 4 adds no row and no milestone
section.** All edits land in the three subsystem files.

**P4.1 → `arch/session-resumption.md`.** The precise stale claim is the bullet **"⚠️ THREE routes
shipped, not four"** (in *"The unclean-exit flag: its own store, keyed canonically"*). As of WP3,
`CleanExitRoute::RecycleSession` **has a production caller**, so the count is now **four**. ⚠️ The
bullet's *lesson* (enumerating routes made the SET testable but nothing proved each member had a
CALLER) must SURVIVE the edit — it is the generalizable half and M13 WP1 re-confirmed it. The
`/exit` dead-variant history stays too.

**P4.2 → `arch/process-and-pty.md`.** Existing section *"⚠️ Slash-command injection —
`slash_command_bytes`"* (line 57). Recycle's injection belongs here, plus the as-built correction the
roadmap still gets wrong: teardown reuses the pane's existing `handleRelaunch` (**not Ctrl+D**), so no
second respawn route exists.

**P4.3 → `arch/workflow-gate.md`.** ⚠️ **A concrete factual error, not just an omission:** line 12
says the guard *"asserts absence across the **three** registries"*. There are **five** (arm 4 at M12
WP5, arm 5 at M13 WP2, plus the Recycle extension) — and **line 18 of the same file already says
"all five arms"**, so the file contradicts itself today. Fix the count and add arm 5, noting it
asserts companion-skill provenance **by command prefix** rather than by widening the shared
`WORKFLOW_TERMS`.

**P4.4 → the one latency authority.** Confirmed sites: `recycleButton.ts:50`, `App.css:631`,
`Workspace.tsx:203` all say *"28–52s"*; `recycleSession.ts:76-77` says *51.9s* (write at 39.7s);
`recycleMachine.ts:119,242` says the *9–12s tail*. ⚠️ Phase 3's live run adds a **fourth** figure
(38s click→write), which is why picking ONE authority now matters more than before.


## Phase 3 — verify-self result

**All six verifiable outcomes PASS** (independent subagent, source + persisted + bookkeeping claims).

| Outcome | Result | Key evidence |
|---|---|---|
| `markSessionClean` **before** `relaunch()` | ✅ | line **326** (STEP 4) vs **330** (STEP 5); ⚠️ **and it sits inside the `succeeded` arm only** — the failure arm returns at line 308 *before* it, which is why runs 1–2 left the flag correctly set |
| No `mark_unclean` command; setting owned by the spawn path | ✅ | verbatim module doc; exactly one `#[tauri::command]` in the file |
| Composite marker is ORDERED | ✅ | `awaiting-stop` is distinct from `succeeded`; `no-fresh-write` documented as *"run 2's shape"*; failed state carries *"⚠️ Never kill the session on this arm"*; a `stop` in `awaiting-fresh-write` transitions **straight to failed** |
| Live latency consistent with the code | ✅ | 38s click→write sits **just under** WP1's run-1 write at 39.7s, inside the 28–52s band; 180s timeout ≈ 3.5× the 51.9s worst case |
| Persisted state | ✅ | dev fix persisted (mtime Aug 18 12:44); ⚠️ **prod `settings.json` mtime is Aug 3** — untouched by today's runs, which is stronger than a content match |
| CHANGELOG-then-delete invariant | ✅ | resolve bullet under `## 2026-08-18` at the day's bottom; ID absent from backlog (grep exit 1); **zero** field lines outside a heading; neighbours intact |

**Outcome 7 (the live-run observations): UNVERIFIED — classified COSMETIC, not BLOCKING.** The
subagent's own reasoning: *"not a claim I found any evidence against… the failure is one of instrument
reach, not of the feature."* Three reasons it could not reach them — the run is **non-repeatable**
(run 3 consumed `.session.md` and the close cleared the flag, so re-driving would test a different
starting state), the bridge is not exposed to subagents, and it was barred from clicking. ⚠️ Its
closing instruction is the honest framing and is adopted: **treat those five as orchestrator-attested,
not independently re-confirmed.**

### ⚠️ Two corrections it made to MY records — both verified, both matter

1. **`verify-041` is NOT a "scratch sibling."** I had called the two surviving flags "the two scratch
   siblings"; `ls -d tmp/scratch/verify-041` fails — it is a verify-run fixture living elsewhere. The
   substantive assertion (yitang absent, two entries survive) holds, but the **description** was
   wrong, and a future reader hunting `tmp/scratch/` for it would find nothing.
2. ⚠️ **The latency-citation site list is BIGGER than my pre-read said: NINE lines across FIVE files**,
   not five across four. My Phase 4 pre-read missed `recycleMachine.test.ts:106` and
   `recycleSession.ts:33`. **P4.4 must use the corrected list**, or the paydown "picks one authority"
   while leaving sites behind — the exact half-fix the four-consecutive-reviews case warns about:
   - `28–52`: `App.css:631`, `recycleButton.ts:50`, `Workspace.tsx:203`
   - `51.9`: `recycleSession.ts:76`, `:77`
   - `9–12`: `recycleMachine.ts:119`, `:242`, `recycleMachine.test.ts:106`, `recycleSession.ts:33`

   ⚠️ It also noted all sites **currently agree with each other** — so this is duplication-risk, not
   live drift. (My earlier "already drifted" framing was about the *different figures* — 28–52 vs 51.9
   vs 9–12 — which describe *different measurements*, not contradictory ones. Corrected here.)


## Phase 3 — verify-human result (operator approved 2026-08-18)

⚠️ **This phase did NOT auto-skip, and that was correct.** Gate (b) failed: verify-self outcome 7 was
`UNVERIFIED`, and the auto-skip rule requires every leaf `[x]`. The pre-filter table likewise mandates
that `UNVERIFIED` items be **presented**, annotated "agent could not verify". Since outcome 7 covers
the five observations that *constitute* exit criterion 2, this is exactly the case a human should see
— the gate behaved as designed rather than being an obstacle.

| Leaf | Result |
|---|---|
| **P3.verify-human.1** — exit criterion 2 met ("Recycle Session is a single click, end-to-end on a real session"), presented as orchestrator-attested-only with the non-repeatability stated | ✅ **APPROVED** |
| **P3.verify-human.2** — the dev-profile `cc_permission_mode` change (`dontAsk`→`bypassPermissions`) standing, prod untouched | ✅ **APPROVED** |

Operator response: *"ok. all good"* — both leaves accepted, no corrections, no rejections.

**No design prior captured.** The capture discriminant requires a product-design tradeoff (or an
identity/non-goal/anti-persona) **plus a transferable why**. This was an acceptance of evidence
already presented, not a correction and not a tradeoff — so per the exclusions there is nothing to
propose. (The permission-mode issue is a *technical/environment* matter, which the contract routes to
`arch.md`/backlog, explicitly **not** to `design-priors.md`; it is already filed as
`SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES`.)


## Phase 3 — verify-codify result

**No integration boundary** — the phase changed no source.

**NO NEW TESTS WRITTEN, and that is the finding.** Every behavior Phase 3's live run exercised is
already pinned, so writing more would be the duplication this skill forbids. Checked before
concluding, not assumed:

| Live behavior | Already covered by |
|---|---|
| The ordered sequence handoff→markClean→relaunch→restore | `recycleSession.test.ts:143` — asserted as an **ordered array**, so a reordering fails |
| Failure arm does not clear the flag (runs 1–2's shape) | `:226` run-2 shape, `:239` stale write, `:262` timeout — each asserts `markSessionClean` **not** called |
| The composite marker's ordering + all three WP1 run shapes | `recycleMachine.test.ts` — 30 tests incl. stale/temp exclusion, reversed order, and the **illegal state being unrepresentable** |
| Sibling isolation | `:317` / `:344` — ignores fs-change and status events for other workspaces |
| Restore injected exactly once, into the FRESH id | `:406`, `:173`, `:621` |

⚠️ **The one thing the live run uniquely surfaced — the post-Recycle flag reading `true` — is ALSO
already covered, on the Rust side.** `cc_session/mod.rs:1108-1119` documents the consume-before-set
ordering as *"subtle and load-bearing"* and cites `consume_before_set_or_nothing_ever_resumes` as its
pin. ⚠️ **The citation was verified, not trusted** — a rustdoc reference to a nonexistent test passes
`cargo test`, `clippy` and `fmt` (`[[rustdoc-link-to-a-nonexistent-test-fails-no-gate]]`). The
function really exists at `mod.rs:1871` (3 references = 1 definition + 2 citations). So both legs of
the clear→respawn-reset sequence are pinned: the clear's ordering frontend-side, the re-set's
ordering backend-side.

**Suites (no regressions, both matching expectations):**
- Frontend **2115 passed** / 165 files — unchanged from Phase 2's close, correct since Phase 3 wrote no code.
- Rust **828 lib** + 16 `hook_pl_output` + 1 integration, 0 failed, 1 ignored — **exactly** the WP3
  close baseline, confirming neither phase touched Rust.

⚠️ **Run hygiene:** `cargo test` was run from `src-tauri/` with an explicit cargo PATH
(`[[bash-cargo-env]]` — subshells do not inherit `~/.cargo/env`). The dev app was still running, but
it is a *running binary*, not a concurrent `cargo` invocation, so there was no `target/` lock
contention (Long-running-commands Rule 2 does not fire).


## Phase 4 — doc resync, as executed

⚠️ **`arch.md` is UNTOUCHED** — 3 `## ` sections before and after, identical to HEAD. All edits landed
in the three subsystem files (task 4.5's explicit prohibition, mechanically verified).

**P4.1 `arch/session-resumption.md`.** ⚠️ **The expected edit was WRONG and the correction is the
useful part.** The pre-read predicted "THREE routes shipped, not four" had become *four*. It has not:
the enum still holds exactly **three** variants (`WorkspaceClose`, `AppQuit`, `RecycleSession`) — what
changed is that WP3 gave the last one a **production caller**, closing the one member that was still
the caller-less shape the `/exit` bullet warns about. Recorded as *"the count did NOT change"*, with
the lesson kept **and** noted as re-confirmed (WP1 hit the identical shape on `AppQuit` and retracted
the finding before any code changed). Also added: the clear fires only on the success arm, its
before-the-kill ordering, and ⚠️ **that a live post-Recycle flag reads `true` and is NOT a missed
clear** — the trap Phase 3 walked into.

**P4.2 `arch/process-and-pty.md`.** Corrected the reachability claim (`slash_command_bytes` is
Rust-side and **not** callable from a button; `slashCommandPayload` is its intended TS mirror — two
implementations of one rule, kept in step deliberately), added the four composing callers as a table
with the `label` argument's rationale, and recorded that Recycle's teardown reuses `handleRelaunch`
**not Ctrl+D** — which is also why its respawn inherits `cc_spawn_env` for free.

**P4.3 `arch/workflow-gate.md`.** ⚠️ **A real factual error, not an omission:** the file said the guard
asserts across *"the **three** registries"* while a later paragraph already said *"all five arms"* —
it contradicted itself. Now a five-row table with each arm's **computed** OFF subject, plus arm 5's
provenance-by-command-prefix premise, the seven-subject individual-probe rule, the
`showRecycleButton`-dominated-at-the-render-site caveat, and the `WORKFLOW_TERMS` vocabulary gap.

**P4.4 — ONE authority, 9 sites → 1.** `RECYCLE_TIMEOUT_MS`'s doc in `recycleSession.ts` now carries a
four-row measurement table (51.9s worst case · 28–52s range · 9–12s tail · **38s live confirmation**);
the other sites keep their **invariant** and point at it. ⚠️ **Chosen because that is the one place a
figure is load-bearing** — it derives the constant. ⚠️ **One site deliberately left alone:** the test
*name* `"…waits out the 9–12s tail"` in `recycleMachine.test.ts`. A test name is not a documentation
site a reader would treat as authority, and renaming churns the suite for nothing.

**P4.5 — metrics 2 and 3 marked MET, but both needed their own wording corrected first.** Metric 2
named **two commands that do not exist** and a Ctrl+D teardown that never shipped; metric 3 said
*"**Every** installed workflow skill"*, which WP1's measurement refuted. Annotated in place following
metric 5's precedent rather than silently rewritten. Roadmap table: all six ✅, **Group C CLOSED**.
⚠️ **Flagged for the next `/product-vision`:** this is the **second** Group-C metric to prove
unsatisfiable as written (metric 5 was restated at M12 WP4d) — metrics phrased as *"every X"* or
naming a *specific mechanism* get refuted by the build; outcome-shaped ones survive.

**P4.6 — all four probe verdicts re-confirmed as-built** (table in `wbs.md`). ⚠️ **Q4 was the one the
live run could have falsified, and it held with direct evidence:** Phase 3's respawned session picked
up the corrected `cc_permission_mode`, which is only possible if `cc_spawn_env` recomposed at spawn.

**P4.7** — WP4's six tasks ticked, WP4 marked SHIPPED, `runtimes.md` updated (frontend 2115, Rust 828
lib + 16 + 1 = 845; ⚠️ the unchanged Rust count **is** the attribution, since WP4 touched no Rust).


### Phase 4 verify-auto

⚠️ **The scoped risk here is specific: Phase 4 edited COMMENTS in five source files, and this repo has
a documented history of comment edits silently disarming `?raw`/source guards** (a Prettier reflow
once broke a `?raw` guard that then reported green while checking nothing). So the checks target that,
not compilation alone.

| Check | Result |
|---|---|
| **Phase 4's source edits are comment-only** — no executable line changed | ✅ proven per-file via `git diff -U0` with comment lines filtered out; the `App.css` hits were confirmed by hand to sit inside the `/* … */` block (lines 628-638), which the `//`-shaped filter cannot see |
| The four guards that **read these very comments** (`skillButtons`, `recycleSession`, `recycleMachine`, `offInvariantGuard`) | ✅ **112 passed** |
| `tsc --noEmit` | ✅ |
| `prettier --check` on all six touched source files | ✅ |
| **One-authority claim holds** | ✅ exactly one non-test file carries a raw figure (`recycleSession.ts`); the other is the deliberately-kept test **name** |
| **Every pointer resolves** | ✅ all four pointer sites name `RECYCLE_TIMEOUT_MS`, which is defined exactly once |
| `arch.md` untouched (task 4.5's prohibition) | ✅ `git diff --quiet` clean |
| `workflow-gate.md` no longer self-contradicts | ✅ authoritative line now says **FIVE** |
| vision 2+3 marked MET; roadmap has **zero** remaining `⏳ M13` | ✅ |

⚠️ **One near-miss worth recording as method:** the "three registries" grep still returns **1**, which
reads as "the fix did not land." It is my own annotation *quoting* the former wording to document the
contradiction. Checked the line rather than trusting the count — a grep tally cannot distinguish a
live claim from a quotation of a retired one, which is the same
declaration-vs-use confusion that has bitten this WP's source guards twice.


## Phase 4 — verify-self result

**All eight outcomes PASS**, including the honesty check. The subagent was given an explicit
**falsify-don't-confirm** mandate, because a doc resync is exactly where prose can read plausibly
while asserting what the code does not support.

| Outcome | Result |
|---|---|
| `CleanExitRoute` still THREE variants; WP3 added the missing caller | ✅ + a nuance (below) |
| `slash_command_bytes` unreachable from the frontend; buttons use `injectCommand` | ✅ no `#[tauri::command]`, absent from `invoke_handler`, one production caller (the shutdown `/exit`) |
| The guard has FIVE registries; the doc's table matches | ✅ matches the test file **row-for-row**, including the "seven subjects" count |
| ONE latency authority | ✅ all three figures only in `RECYCLE_TIMEOUT_MS`'s doc + the one intentional test name; four pointers resolve; constant defined once |
| `arch.md` unmodified | ✅ |
| Metrics 2+3 met, and metric 3 **honestly discloses** the narrowing | ✅ *"more disclosing than required"* |
| `runtimes.md` matches reality | ✅ **independently re-ran both suites**: 2115 frontend / 828 Rust lib, exact match |
| **Honesty check on the `arch/` diffs** | ✅ *"the diffs UNDERSTATE rather than overstate in two places"* |

⚠️ **One imprecision it caught, now FIXED.** I wrote *"all three are now live."* True of the clean-exit
**routes**, but imprecise about the **variant**: the app-quit clean exit is implemented **in Rust**
(`perform_quit_teardown` → `clear_and_persist`), which **bypasses the enum** — so `AppQuit` still has
no caller routing through it, and nothing sends its `"app-quit"` wire name outside type declarations.
Verified directly, then tightened the bullet to say so and to name the **two-writers-by-design** shape
that makes a caller audit of one mechanism generalize wrongly to the other. ⚠️ **This is the third
appearance of that exact trap in this WP** (WP1's retracted `AppQuit` finding, the `/exit` dead
variant, now my own wording), which is why the bullet now states it rather than implying it.

⚠️ **The subagent also caught an instrument error in its OWN work and redid it** — its first figure
sweep reported **zero** matches because the shell mangled the en-dash (U+2013); `grep -rnF` found the
real set. Had it stopped at the first result it would have reported "no figures anywhere", which
would have looked like a *stronger* pass than the truth. Same class as this WP's other instrument
failures: a query that cannot match reports absence indistinguishably from real absence.

**Limit stated honestly:** it could not verify WP1's archived measurement *provenance* (2470
transcripts, 11-of-50 skills, the capture table) — those live in the archive, not the code. It
correctly noted these are **attributed** to the WP1 archive rather than asserted bare, which is
appropriate sourcing rather than an unverified claim.


## Phase 4 — verify-codify result

**No integration boundary** — the source edits are comment-only.

**One new guard written, and it is the only codifiable thing Phase 4 produced.** The phase output was
documentation, not behavior — but the **one-authority property was UNGUARDED**, and this repo has
been bitten by exactly that: *"the same rationale in six places drifts asymmetrically"*, flagged in
**four consecutive reviews of one file**. ⚠️ **A paydown with no guard silently undoes itself** — the
next author restates a figure "for convenience" and the nine-site sprawl re-accumulates.

**Added** (`recycleSession.test.ts`, 3 tests):
1. **no production module outside the authority restates a figure** — walks every non-test
   `.ts/.tsx/.css` under `src/`, exempting only `recycleSession.ts`.
2. **anti-vacuity: the authority itself still carries every figure** — blocks "fixing" duplication by
   *deleting the measurement*, which is the wrong direction and would otherwise pass arm 1 trivially.
3. **walker reach** — asserts a non-trivial file count *and* that it really sees the four pointer
   sites by name.

⚠️ **The figures are TS string literals with an explicit `\u2013` escape.** The verify-self pass first
reported **zero** matches because a shell mangled the en-dash — which reads as a *stronger* pass than
the truth. In-file literals remove the shell from the loop entirely.

**Mutation-proven, each mutant `diff`-confirmed and reverted (production files verified byte-identical
to their pre-mutation snapshots, not merely "changed back"):**

| Mutant | Result | Caught by |
|---|---|---|
| A — re-scatter `28–52s` into `recycleButton.ts` (**the exact regression**) | 🔴 1 failed / 28 passed | arm 1, offender named |
| B — delete a figure row from the authority (the wrong-direction "fix") | 🔴 1 failed / 28 passed | arm 2 |
| C — point the walker at a subdirectory (the vacuous-scan shape) | 🔴 1 failed / 28 passed | arm 3 |

**Full gate:** frontend **2118 passed** (165 files, +3 for this guard), Rust **828 lib** + 16 + 1,
`cargo clippy --all-targets -- -D warnings` clean, `tsc --noEmit` clean, `prettier --check` clean.


## Code-Quality Review — m13-wp4-milestone-exit-verify

**0 CRITICAL · 2 MAJOR · 4 MINOR.** Both MAJORs were **verified by reproduction, then FIXED in this
WP** rather than backlogged — each was a defect in a guard *this* WP wrote, and shipping a guard whose
title overstates its coverage is precisely the failure the WP exists to prevent.

### Strengths (reviewer's, abridged)
- The one-authority guard closes **both** vacuity directions, including "fix duplication by deleting
  the measurement", which most such guards miss.
- The Recycle real-vs-stub meta-guard asserts `showRecycleButton !== showSkillButtons` — the only
  assertion that catches byte-identical-body aliasing.
- The exactly-one-`/session-start` guard reads post-`strip()`, so the file's own prose cannot satisfy
  it (the `[[raw-guard-identifier-satisfied-by-own-comments]]` trap avoided).
- The `arch/workflow-gate.md` table fixes a real self-contradiction.

### MAJOR 1 — the arm-count pin did not detect the failure its own title named ✅ **FIXED**
`armSubjects` was a literal declared inside the test body, so it proved only that seven **functions**
are importable — not that seven **arms** exist. ⚠️ **Reproduced before accepting:** deleting the
arm-5x OFF test left the whole suite **green at 33/33**. That is the repo's own *"could this still
pass if the code it names were deleted?"* test failing — and it is the **same "assertion says X,
measures Y" gap this WP's problem statement quotes from WP3**, reproduced inside the guard written to
prevent it.
**Fix:** the count is now **derived from this file's own source** — every OFF-assertion `it()` title
in the gate-off block — and reconciled against the subject list. **Regression-proven:** the identical
deletion now **fails**, with the diagnostic *"found 6 title(s) but 7 subject(s)."*

### MAJOR 2 — the one-authority guard asserted more than it enforced ✅ **FIXED**
Scope is non-test `src/` only, so four restatements survive it: `wbs.md:171`, `wbs.md:276`,
`roadmap.md:354`, and `recycleMachine.test.ts:106`. ⚠️ **Confirmed by grep.** Neither the guard nor
`RECYCLE_TIMEOUT_MS`'s "SINGLE AUTHORITY" header disclosed that boundary.
**Fix:** the boundary is now stated at **both** sites, with the *reason* each exclusion is
deliberate — the WBS/roadmap are WP1's **historical record** (rewriting them to point at code would
erase the provenance that makes the authority trustworthy), and a test **name** is not a site a reader
treats as authority. The enforced invariant is now stated as what it is: *"no production module
restates a figure."*

### MINOR 1 — stale registry header ✅ **FIXED**
The file header listed arm 5's subjects without `showRecycleButton`, while the pin uses it — so a
reader following the pin's own pointer found a list that disagreed. Header now names both subjects and
explains the seven-vs-five reconciliation.

### MINOR 2 — reflow artifacts ✅ **FIXED**
`recycleButton.ts` said "tens of seconds" twice in one sentence with a mid-clause break;
`Workspace.tsx:203` overran the wrap width. Both rewritten as authored prose.

### MINOR 3 + 4 — documentation shape → **AUTO-BACKLOGGED** (drive_mode=autopilot)
(a) The WIP's phase sections interleave out of execution order (pre-reads appended in wall-clock
order). (b) `arch/workflow-gate.md`'s three prose paragraphs after the table partly mirror
`offInvariantGuard.test.ts`'s header — the same rationale-duplication shape one level up.
⚠️ **Deliberately not fixed at ship time:** both are judgment calls about the shape of a 1023-line
archive record, and (b) is a real instance of this project's standing duplication finding that
deserves a considered pass rather than a hasty trim — *"do NOT trim a little from each site"* is the
lesson from the four-consecutive-reviews case.

### Assessment (reviewer's, verbatim conclusion)
> *"the single finding I would act on"* was MAJOR 1 — acted on. The reviewer also judged the
> no-production-behavior-changed claim to hold under inspection, and the one-authority guard *"the
> best artifact here — it converts a documentary finding into an enforced invariant."*

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-18] Phase 1 / arm 2 — The OFF-invariant guard's shared `WORKFLOW_TERMS` list
(`["workflow","docs","skill","drivemode","drive-mode"]`) contains neither "recycle" nor "session", so
a `RECYCLE_SESSION` menu id or panel would register unseen by arms 1–3. Found because an *invalid*
probe (which looked exactly like a real hole) forced reading the predicate. Logged to backlog as
`SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION`. Not fixed here — widening the
shared list is a cross-arm change WP2 deliberately declined.

## Notes carried in from the WP3 handoff

- **Baselines for attribution:** 828 Rust lib + 2112 frontend tests. `cargo clippy --all-targets`
  and `pnpm format:check` both clean at WP3's close.
- ⚠️ **`main` is 47 ahead of `origin/main` BY DESIGN** — do not push. The operator pushes at release
  time only.
- **Backlog is 33 open**, none `high`. WP4 is expected to resolve **one**
  (`RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE`) — and only if Phase 3's precondition actually
  held.
- **Standing, not this WP's work:** `CLAUDE.md` over the 40k threshold (`/util-prune-claude-md` is
  its own session); a cross-repo handoff owed to mccc before M15 deliverable 4, with
  `HANDOFF-from-claudesk-2026-08-12.md` still uncommitted there; the stuck-AwaitingInput dot still
  live (closed on severity — ⚠️ do **not** "fix" it with `SubagentStop → Idle`).
