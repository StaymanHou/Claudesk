# Feature: M13 WP4 — Milestone exit verify + Group C close

**Workflow:** feature
**State:** plan (complete)
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

- [ ] Phase 2: Exit criterion 1 — no slash-command typing for common skills (live)  <!-- status: in-progress -->
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
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: Exit criterion 2 — Recycle end-to-end on a real session  <!-- status: NOT-STARTED; depends on Phase 2 -->
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
  - [ ] P3.1 Choose the fixture and **state why it satisfies the precondition** — the WBS's own
        guidance is that this closes most cheaply by recycling **a real session once**, rather than
        building a fixture elaborate enough to fool CC.  <!-- status: NOT-STARTED -->
  - [ ] P3.2 Record the before-state: `.session.md` presence + mtime baseline, the **full** flag
        store (for the sibling assertion), the CC PID.  <!-- status: NOT-STARTED -->
  - [ ] P3.3 Click Recycle once. Observe the composite marker firing in order (fresh write → next
        `Stop`), not just the end state.  <!-- status: NOT-STARTED -->
  - [ ] P3.4 Assert every after-state above, including the sibling-flags-unchanged arm.  <!-- status: NOT-STARTED -->
  - [ ] P3.5 Re-open the project and assert **no announcement** fires.  <!-- status: NOT-STARTED -->
  - [ ] P3.6 Resolve `SURFACE-2026-08-18-RECYCLE-SUCCESS-PATH-NOT-PROVEN-END-TO-END-LIVE` **only if
        the composition was actually observed**; if the precondition failed, leave it open and record
        why. ⚠️ Claiming a resolve that did not happen is the exact failure WP3 avoided when it
        declined to claim the `cc_ready` doc-fix.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 4: Doc resync — `arch/` by subsystem, metrics, probe re-confirm, one latency authority  <!-- status: NOT-STARTED; depends on Phase 3 -->
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
  - [ ] P4.1 Resync `arch/session-resumption.md` (Recycle's flag route + the composite completion
        marker as an **invariant**, with provenance pointed at the archive).  <!-- status: NOT-STARTED -->
  - [ ] P4.2 Resync `arch/process-and-pty.md` (Recycle's injection + teardown reuses `handleRelaunch`
        — **not** Ctrl+D, so no second respawn route exists).  <!-- status: NOT-STARTED -->
  - [ ] P4.3 Resync `arch/workflow-gate.md` (the fifth arm; arm 5 asserts companion-skill
        **provenance by command prefix**, deliberately *not* by widening the shared `WORKFLOW_TERMS`).
        <!-- status: NOT-STARTED -->
  - [ ] P4.4 Pay the documentary MAJOR: pick **ONE** latency authority, delete the other four, move
        provenance to the archive. ⚠️ **Do NOT trim a little from each site** — that is precisely how
        the four-consecutive-reviews case happened. Keep the *invariant* at the code (*"the marker is
        composite — do not simplify"*); move the *provenance* (three-run table, killed candidates,
        measured figures) out.  <!-- status: NOT-STARTED -->
  - [ ] P4.5 Update `vision.md` metrics 2 + 3 → met; `roadmap.md` M13 table + Group C close note.
        <!-- status: NOT-STARTED -->
  - [ ] P4.6 Re-confirm WP1's four probe verdicts still hold as-built (Q1 the fixed set; Q2 moot by
        Q1; Q3 the composite marker; Q4 respawn goes through `cc_spawn_env` → the drive-mode signal
        is free). Correct any that did not survive contact — ⚠️ **Q4 is the one to actually re-check
        against Phase 3's live run**, since it is the only verdict Recycle's real respawn can falsify.
        <!-- status: NOT-STARTED -->
  - [ ] P4.7 Tick WP4's tasks in `wbs.md`; update `runtimes.md` with this WP's observed runtimes +
        counts (one bullet per WP, not per run).  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 2: Exit criterion 1 (live) > verify-self
- **Active scope:** Phase 2 verify-auto `[x]` (no source changed; probing residue cleared, static↔live cross-check agrees); verify-self next
- **Blocked:** none
- **Unvisited:** Phase 3 (exit criterion 2, Recycle end-to-end) → Phase 4 (doc resync + metrics +
  probe re-confirm)
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
