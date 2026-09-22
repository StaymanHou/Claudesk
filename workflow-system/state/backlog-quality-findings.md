# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow-system/state/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# fa-wp2-draft-store-history-payload — 2026-09-21

## SURFACE-2026-09-21-QUALITY-TERMINATOR-COUNT-FILTERS-ELEMENTS-NOT-INDICES
- **Severity:** MINOR
- **Location:** `src/components/workspace/__tests__/stagedPayload.test.ts` — the
  "strips a literal ESC[201~" test
- **Finding:** the terminator count uses `out.filter((_b, i) => END.every((e, j) => out[i+j] === e)
  && out[i] === ESC)`, which collects matched **elements** (`0x1b`) rather than indices. The
  `&& out[i] === ESC` term is also redundant, since `END[0]` is already `ESC`. It computes the
  right count today but reads as if it collects positions — confusing beside the correct
  index-loop form used in the same file's verify-codify block.
- **Suggested action:** replace with the index-loop form already present a few tests below.
- **Priority:** low

## SURFACE-2026-09-21-QUALITY-BLANK-CHECK-READS-BEFORE-THE-STORAGE-GUARD
- **Severity:** MINOR
- **Location:** `src/components/workspace/draftHistory.ts` — `appendToHistory`'s blank-entry check
- **Finding:** the blank-entry branch calls `loadHistory(projectPath)` before `safeStorage()`, so a
  blank send performs a storage read the immediately-following no-storage guard would have
  short-circuited. Harmless; the ordering is incidental rather than intentional.
- ⚠️ **Do NOT "fix" this by returning `[]` from the blank arm** — that is the MAJOR this WP just
  fixed (every non-append path returns the ring as it stands). Only the *ordering* is the finding.
- **Suggested action:** hoist the `safeStorage()` guard above the blank check, or leave it.
- **Priority:** low

## SURFACE-2026-09-21-QUALITY-TYPEOF-GUARD-COMMENT-OVERSTATES-PRODUCTION-RISK
- **Severity:** MINOR
- **Location:** `src/components/workspace/draftStore.ts` — `loadDraft`'s `typeof raw === "string"`
  guard comment
- **Finding:** the comment says the guard defends against "a shimmed or corrupted storage", and the
  test stubs exactly that. Real `localStorage` cannot return a non-string, so the guard largely
  defends the **test double**. Fine to keep the guard; the comment overstates the production risk.
- **Suggested action:** reword to say it guards the test-double/shim case specifically. ⚠️ Fold
  into the standing comment-convention item rather than doing a per-WP trim pass.
- **Priority:** low

# hotkey-reference — 2026-09-17

## SURFACE-2026-09-17-QUALITY-TEST-SELECTOR-PINNED-TO-AN-UNSTYLED-CLASS
- **Severity:** MAJOR
- **Location:** `src/components/settings/SettingsPanel.tsx:161` + `src/App.css:3991`
- **Finding:** `.settings-hotkey-outcome` (SINGULAR) is rendered on every outcome div and is the
  selector `hotkeyGroupRender.test.tsx:145` queries to assert multi-outcome rendering — but only the
  PLURAL `.settings-hotkey-outcomes` has a CSS rule. The singular class is styled nowhere. ⚠️
  VERIFIED by the orchestrator: grepping both rule heads returns only line 3991 (plural). Every
  other class in that CSS block has a matching rule, which is what makes this one read as an
  oversight rather than a choice.
- **Why it matters:** A load-bearing test selector is pinned to a class with no styling contract. A
  future author removing "unused CSS classes" from the markup — an ordinary cleanup, since nothing
  styles it — **silently kills the only assertion that a context-scoped chord's SECOND outcome
  renders** (the ⌘W / terminal-font-zoom canary). The test would still pass with zero outcomes
  asserted if the class vanished from only some rows.
- **Suggested action:** Either give the singular class a real rule, or add a one-line comment at the
  markup site declaring it a test-handle-only class so a cleanup pass leaves it alone.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-CM6-GUARD-BLIND-TO-SPREAD-KEYMAPS
- **Severity:** MAJOR
- **Location:** `src/components/workspace/__tests__/chordRegistry.test.ts:317-352`
- **Finding:** The CM6 completeness arm extracts bindings with `/key:\s*"(Mod-[^"]+)"/g` against
  `editorExtensions.ts` — literal object entries only. The editor Find chord (`⌘F`, registry entry
  `cm6-find`) is NOT a literal entry: it arrives via `...searchKeymap` at `editorExtensions.ts:180`.
  ⚠️ VERIFIED by the orchestrator: the regex captures exactly 8 bindings (`Mod--`, `Mod-\`,
  `Mod-+`, `Mod-=`, `Mod-0`, `Mod-d`, `Mod-r`, `Mod-s`) and **`Mod-f` is not among them**.
- **Why it matters:** `cm6-find` therefore has **ZERO guard coverage in either direction** — the
  call-shape arm cannot reach it (CM6 entries are `matcher: null`) and the keymap arm cannot see it
  (spread, not literal). ⚠️ It is the single entry the feature's own user-facing hint names as the
  reason the EDITOR section exists at all ("so it is clear why a key behaves differently inside the
  editor"). The arm passes while not checking the one binding its prose cites — the
  guard-reports-green-while-checking-nothing shape, scoped to one entry.
- **Suggested action:** Resolve the spread rather than widening the regex — import `searchKeymap`
  in the test and enumerate its `key` values, or assert against the composed keymap array. ⚠️ A
  regex that also matches `...searchKeymap` textually would NOT fix this: it would prove the spread
  is present, not which bindings it contributes.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-HOST-SECTIONS-PARALLEL-TO-THE-UNION
- **Severity:** MAJOR
- **Location:** `src/components/settings/SettingsPanel.tsx:146-150` vs `chordRegistry.ts:46`
- **Finding:** `HOST_SECTIONS` is a hand-maintained list of `{host, title}` parallel to the
  `ChordHost` union (`"app" | "workspace" | "editor"`) with no exhaustiveness check. Adding a fourth
  host to the union compiles clean and its registry entries render **nowhere**. ⚠️ The render test
  iterates the same hardcoded `["app","workspace","editor"]` array, so it **shares the blind spot**
  and would also pass.
- **Why it matters:** This is precisely the drift class the whole WP exists to eliminate — data and
  its description diverging silently — reintroduced one layer above where the discipline was
  applied. The registry is guarded in both directions; the thing that RENDERS it is not.
- **Suggested action:** One line: assert `new Set(HOST_SECTIONS.map((s) => s.host))` covers every
  distinct `entry.host` in `CHORD_REGISTRY`. That closes the render-layer direction without touching
  the component.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-CHORDLABEL-HAS-NO-CONSUMER
- **Severity:** MINOR
- **Location:** `src/components/workspace/chordRegistry.ts:407`
- **Finding:** `chordLabel()` is exported, documented and unit-tested but has **zero non-test
  consumers** (⚠️ VERIFIED by grep across `src/`: only its own definition). The module's own header
  warns against unreachable guards (the M12 dead-`/exit` shape).
- **Suggested action:** Either wire it — the four `*_CHORD_LABEL` consumers are the obvious target,
  which would also retire the label duplication the WIP already records — or drop it until a caller
  exists.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-VISIBLECHORDS-RECOMPUTED-PER-SECTION
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx:645`
- **Finding:** `visibleChords(workflowFeatures.value)` is called once per host section (3x per
  render), recomputing the same filtered array each time. Harmless at 22 entries.
- **Suggested action:** Hoist it above the `.map`. The value is not performance but legibility — it
  makes the one-accessor-one-read funnel discipline the registry's JSDoc argues for visible at the
  call site.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-RATIONALE-STATED-THREE-TIMES
- **Severity:** MINOR
- **Location:** `src/components/workspace/chordRegistry.ts:1-30` + `SettingsPanel.tsx:122-144`
- **Finding:** The same ~20-line rationale (why the comment map moved, the gate-omission reasoning,
  the dead-affordance argument) appears near-verbatim in three places: the registry header, the
  panel block comment, and the commit message.
- **Why it matters:** The WP's own comment-budget lesson applies — three copies of a rationale drift
  the way the original comment map did, which is the failure this feature exists to fix.
- **Suggested action:** Keep one canonical statement in `chordRegistry.ts`; reduce the panel comment
  to a one-line pointer.
- **Priority:** low
- **Status:** pending

# supervisor-hotfix — 2026-09-17

## SURFACE-2026-09-17-QUALITY-TOGGLE-READ-ON-REVEAL-BUT-SUPERVISOR-FIRES-UNFOCUSED
- **Severity:** MAJOR
- **Location:** `src/components/workspace/Workspace.tsx` (the `if (!workflowEnabled || !visible) return;` effect)
- **Finding:** `supervisorEnabled` is fetched only inside an effect gated on `visible`, but `useSupervisor` is gated on the workflow flag alone and **fires in unfocused workspaces by design** (`fanOut.test.ts` pins "fires in an UNFOCUSED workspace"). With no broadcast (settled D-4), the ref can only ever hold what the last reveal fetched, so a value changed out-of-band is honored in the focused workspace and silently ignored in every background one.
- **Why it matters:** `supervisorToggleIpc.ts`'s own header says the toggle is *"read PER TURN rather than at spawn"*, and the value is passed as a ref specifically so a mid-session flip takes effect — but the per-turn read observes a value that only refreshes on reveal. Out-of-band change is a **supported** configuration here: `CLAUDE.md` documents running dev and prod Claudesk **concurrently** for dogfooding. The divergence sits exactly where the feature's value is (background workspaces).
- **Why it is NOT auto-fixed:** the failure direction is bounded (a failed/missing read degrades to ON, the ruled default) and the no-broadcast decision is **settled**, so closing this means either reversing D-4 or adding a re-read on turn-end — a design call, not a reflex fix.
- **Suggested fix:** decide between (a) accept + document the reveal-only staleness in `supervisorToggleIpc.ts`'s header so the "per turn" phrasing stops over-promising; (b) re-read on turn-end inside the supervisor callback; (c) reverse D-4 and broadcast. (a) is the cheapest and may well be right.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-WATERMARK-CLEAR-HAS-NO-PRODUCTION-CALLER
- **Severity:** MAJOR
- **Location:** `src/state/supervisor/unsentInput.ts` (`UnsentInputWatermark.clear()`)
- **Finding:** `clear()` has **no production caller** — verified by grep, it appears only in `unsentInput.test.ts`. Its doc comment nonetheless asserts a purpose it does not have: *"Reset — used at a turn boundary, never to fake a submit"* and *"Exists so a caller never has to synthesize a fake `\r` chunk"*.
- **Why it matters:** ⚠️ This is the `rustdoc-link-to-a-nonexistent-test-fails-no-gate` shape in TypeScript form — a doc comment describing a caller that does not exist, which passes every gate and reads as **live design**. A future reader will cite it as precedent for a turn-boundary reset that was never built. It is also adjacent to a real open question: the accepted staleness cost of no-clear-on-backspace-to-empty.
- **Suggested fix:** either wire it (a turn-boundary reset may genuinely be wanted — worth deciding alongside the reveal-only finding above), or restate the comment as "no production caller today; kept for X" so the prose stops describing an imagined wiring.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-RUST-DOC-BLOCK-CHANGED-OWNERS
- **Severity:** MINOR
- **Location:** `src-tauri/src/config_store/mod.rs` (~887-890)
- **Finding:** The new `⚠️ THE UPGRADE PATH` doc block was appended directly onto the trailing lines of the pre-existing doc comment for `an_unknown_drive_mode_string_fails_the_whole_project_list`, with no separator. The combined block — including unrelated WP4b drive-mode-rename migration prose — now attaches to `an_absent_supervisor_enabled_key_reads_as_on`, and the drive-mode test is left with **no doc comment at all**.
- **Why it matters:** two tests' documentation silently swapped owners.
- **Suggested fix:** split the block; restore the drive-mode test's own doc comment.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-CLASSES-CONST-PINS-ONLY-ITS-OWN-LENGTH
- **Severity:** MINOR
- **Location:** `src/components/workspace/__tests__/supervisorToggleStyles.test.ts` (the "names every class this feature adds" test)
- **Finding:** The test asserts only `expect(CLASSES).toHaveLength(3)`. `CLASSES` is otherwise **unused** by any assertion in the file — the three `describe` blocks name their classes as inline literals.
- **Why it matters:** ⚠️ The stated intent ("adding a third class without a guard fails here") is **not achieved**: a fourth class added without a guard passes, because nothing couples `CLASSES` to the CSS scan or the emitted set. It reads as a coverage pin but measures the length of a constant it alone reads — the `guard-predicate-completeness` shape.
- **Suggested fix:** drive the direction-1 assertions from `CLASSES` (a `for` loop) so the constant is load-bearing, or delete it and drop the claim.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-NO-IPC-NAME-CONTRACT-TEST-FOR-THE-TOGGLE
- **Severity:** MINOR
- **Location:** `src/cc/supervisorToggleIpc.ts` ↔ `src-tauri/src/config_store/commands.rs`
- **Finding:** No test asserts that the TS `getProjectSupervisorEnabled` / `setProjectSupervisorEnabled` argument names (`path`, `enabled`) match the Rust command's parameters.
- **Why it matters:** ⚠️ `tauri-command-removal-needs-invoke-sweep` records that this binding is **stringly-typed and invisible to both unit gates** — a `path`/`projectPath` mismatch would compile, pass all 2711 tests, and fail only at runtime. ⚠️ **The precedent exists in this very feature's own neighbourhood and was not applied**: `useSupervisor.test.ts` pins exactly this shape for `supervisor_adjudicate` and `wip_read`.
- **Suggested fix:** add the argument-name assertion mirroring the existing `supervisor_adjudicate` / `wip_read` tests.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-17-QUALITY-DO-NOT-MERGE-DEFENCE-REPEATED-FOUR-TIMES
- **Severity:** MINOR
- **Location:** `src/cc/supervisorToggleAction.ts`, `src/cc/supervisorToggleIpc.ts`, `src/cc/workspaceSupervisor.ts` (+ the Rust command's doc)
- **Finding:** Three new modules totalling 134 lines carry ~95 lines of header prose to ~40 lines of code, and roughly half that prose is an anticipatory justification for *not merging* with the sibling drive-mode modules — repeated in three places plus the Rust command doc.
- **Why it matters:** the split is right on its own terms (different storage key, different default, no staleness concept) and does not need defending four times; the repetition is maintenance surface that will drift out of sync with whichever decision changes first. ⚠️ A comment-budget observation (`docs/lessons/source-text-guards.md` holds the rule) — **not** an argument for merging.
- **Suggested fix:** keep the fullest statement at one site; reduce the other three to a pointer.
- **Priority:** low
- **Status:** pending

# m15-wp4-context-pressure-recycle — 2026-09-14

## SURFACE-2026-09-14-QUALITY-RECYCLE-TOKENS-CAST-IS-A-PROSE-CONTRACT
- **Severity:** MINOR
- **Location:** `src/state/supervisor/verdict.ts` (the `recycle` arm's `tokens` field)
- **Finding:** `tokens: input.contextTokens as number` rests on a comment ("Non-null by
  construction: `shouldRecycle` returns false for a null reading") to justify a cast `tsc` cannot
  check. ⚠️ **This is the same contract-in-prose-where-a-type-would-do shape the WP3 review flagged
  three times** — the pattern this feature's predecessor paid down.
- **Suggested fix:** have `shouldRecycle` return the number (or `null`) instead of a boolean; the
  cast then disappears entirely.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-14-QUALITY-USECALLBACK-MEMOIZES-NOTHING
- **Severity:** MINOR
- **Location:** `src/state/supervisor/useSupervisor.ts` (`useCallback(onTurnEnd, [host])`)
- **Finding:** `host` is a fresh object literal on every `Workspace` render, so the callback is
  recreated each time and the `useCallback` guarantees nothing. Harmless today (`useTauriListen`
  holds the handler in a latest-ref) but it **reads as an intentional stability guarantee that does
  not exist**, which a future reader may rely on.
- **Suggested fix:** either destructure `host`'s fields into the dep array, or drop the
  `useCallback` and note why identity does not matter here.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-14-QUALITY-RUNTIMES-LAST-AND-HISTORY-DISAGREE
- **Severity:** MINOR
- **Location:** `runtimes.md` (`pnpm verify:auto` entry)
- **Finding:** `**Last:**` records 25s (2026-09-14, WP4 Phase 1) while the newest `**History:**`
  bullet is 38s on the **same date** (WP3 quality refactor) — the two disagree about which
  observation is most recent, against the file's own "real chronology" note.
- **Suggested fix:** add WP4's own history bullet at close (the file's rule is one bullet per WP),
  which resolves the ordering.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-14-QUALITY-LASTINDEX-COMMENT-IS-THE-HEAVIEST-RATIO-IN-THE-DIFF
- **Severity:** MINOR
- **Location:** `src/state/supervisor/wipPhases.ts` (the `PHASE_LINE.lastIndex = 0` site)
- **Finding:** ⚠️ **Keeping the line is the RIGHT call and the reviewer agreed** — a module-level
  `/g` regex becomes a silent-wrong-answer hazard the moment a `break` is added. But **14 lines of
  comment for one defensive statement** is the heaviest ratio in the diff, and the underlying
  reasoning is a well-known JS footgun rather than a non-obvious local decision.
- **Suggested fix:** compress to roughly one line (`// module-level /g regex: reset in case a future
  early-exit leaves lastIndex non-zero`), keeping the equivalent-mutant fact but not the essay.
  ⚠️ **Fold into the standing comment-convention item** rather than treating as standalone.
- **Priority:** low
- **Status:** pending

# m15-wp3-break-detection-and-auto-fire — 2026-09-13

**0 CRITICAL · 3 MAJOR · 5 MINOR as filed.** ⚠️ **ALL THREE MAJORs + the `assertPinnedModel`
gap were RESOLVED 2026-09-14** by a `/feature-refactor` pass (see CHANGELOG) and are deleted from
this file per delete-on-resolve; **3 MINORs remain open below.** The MAJORs shared one shape —
*a contract stated in PROSE where it could have been stated in a TYPE* — and each fix converted a
comment into a compiler or a test. ⚠️ **The label fix REPLACED a source-text guard** that asserted
the requirement was *stated*; it now asserts the label is *passed*, and was mutation-proven by
dropping the argument (the old guard survived that mutant; the new one kills it).

## SURFACE-2026-09-13-QUALITY-COMMENT-DUPLICATION-ACROSS-SUPERVISOR-MODULES

- **Priority:** low
- **Source:** feature:review-quality (m15-wp3), MINOR
- **Location:** `src/state/supervisor/*.ts`, `src-tauri/src/transcript/mod.rs`

Comment density runs 43–53% in the TS supervisor modules. ⚠️ **Length is not the problem —
DUPLICATION is**, and it is measurable: three facts appear in 3–6 places each *within one diff*.
- the "narrow router sends 40 of 96 / misses 10 of 32" rationale → `adjudicator.ts:41`,
  `verdict.ts:315`, `verdict.test.ts:334`
- the "2282 → 2284 → 2286" live-corpus drift → `verdict.ts:134`, `verdict.ts:230`,
  `transcript/mod.rs:39`
- the "bitten this repo four times" framing → `turnEnd.ts:14`, `fanOut.ts:14`

⚠️ Copies drift asymmetrically: the edited one becomes right while the others keep asserting the
old thing with equal confidence.

**Suggested action:** collapse each repeated MEASUREMENT to one canonical statement with
pointers; keep the invariants and the ⚠️-what-to-do-on-failure paragraphs. The
`arch/session-resumption.md` section added in this same commit is the natural home for several.
- **Status:** pending

## SURFACE-2026-09-13-QUALITY-TIMEOUT-TEST-REIMPLEMENTS-THE-PRODUCTION-LOOP

- **Priority:** low
- **Source:** feature:review-quality (m15-wp3), MINOR
- **Location:** `src-tauri/src/adjudicator/mod.rs:214-240` (and `:177`)

⚠️ `run_program_with_timeout` in the test module is a **hand-copied re-implementation** of the
production wait/kill loop (`run_adjudicator`, lines 102-130). So
`a_slow_child_times_out_and_is_reaped` proves **the copy** kills its child — not that
`run_adjudicator` does. `run_adjudicator_with_program` (line 177) is the same pattern for the
`NotFound` arm.

This is exactly `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`: a test that
re-implements the code shares its blind spot.

**Suggested action:** extract the wait/kill loop to take a pre-spawned `Child`, so the test
drives the real thing.
- **Status:** pending

## SURFACE-2026-09-13-QUALITY-ADJUDICATOR-DISCARDS-CAPTURED-STDERR

- **Priority:** low
- **Source:** feature:review-quality (m15-wp3), MINOR
- **Location:** `src-tauri/src/adjudicator/mod.rs:110-115`

On a non-zero exit, `AdjudicateError::Failed` is built with `stderr: String::new()` — **throwing
away the stderr that was captured**. The child is spawned with `stderr(Stdio::piped())` and
`wait_with_output()` has it in hand. The `Display` impl renders `stderr.trim()`, so it always
prints an empty parenthetical.

The DECISION is unaffected (both paths withhold), but ⚠️ **the one diagnostic an operator gets
for a failing `claude -p` is blank.**

**Suggested action:** thread the captured stderr into the error.
- **Status:** pending

# m15-wp2-state-machine-as-code — 2026-09-12

⚠️ **0 CRITICAL · 2 MAJOR · 3 MINOR — but BOTH MAJORs and ONE MINOR were FIXED IN PLACE before finalize, not backlogged.** Only the two low-value MINORs below remain open. See the WIP's `## Code-Quality Review` for the full review and the fix record.

## SURFACE-2026-09-12-QUALITY-DERIVED-COUNTS-DUPLICATED-ACROSS-TESTS

- **Priority:** low
- **Source:** feature:review-quality (m15-wp2), MINOR
- **Location:** `src/state/__tests__/workflowMachineLookup.test.ts`, `workflowMachine.test.ts`, `workflowMachinePolicy.test.ts`

The five test files pin ~27 hardcoded measured counts (111 edges, 58 rows, 67/44 dispatchable, 156/153/7/4 cells, 232 cells, …). Each carries its `measured 2026-09-12` provenance and each is a deliberate regression sentinel — **but several are ARITHMETICALLY DERIVED from each other** (`232 = 58 × 4`; `44 = 111 − 67`). A single upstream edge addition therefore breaks five or six assertions that all say the same thing once.

**Not a correctness risk** — a maintenance tax at WP3's first upstream resync. **Suggested action:** collapse the arithmetic-derived expectations to one computed expression each, keeping the independently-measured ones (111, 58, 67, the histograms) as literals.

## SURFACE-2026-09-12-QUALITY-FUNNEL-PREDICATES-DECLARED-TWICE

- **Priority:** low
- **Source:** feature:review-quality (m15-wp2), MINOR
- **Location:** `src/state/__tests__/workflowMachineFunnel.test.ts` — the discrimination block

The discrimination block re-declares `wiresGraphToPolicy` and `importsMachine` as local copies of the live guard's **inline** regexes, then closes the gap with `uses the SAME predicates the live guard uses`. ⚠️ That reconciliation test does real work — **it drove out the dead-allowlist finding** — but the two regexes still exist twice in one file and could drift in a direction the reconciliation does not cover.

**Suggested action:** extract both predicates to module scope so the guard and the discrimination block call the same functions, removing the copy entirely. That is what `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` actually prescribes.

# m15-wp1-supervisor-probe — 2026-09-12

⚠️ **Findings 2 and 3 are the ones that change what a reader BELIEVES**, not just how the code looks: one lets the decisive `0.8` bar drift silently, the other overstates what the headline `119` baseline measures. Both were verified at source before filing.

## SURFACE-2026-09-12-QUALITY-FIXTURE-PATH-REACHES-INTO-A-CYCLE-ARCHIVE

- **Severity:** MAJOR · **Priority:** medium · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts:30-33, 366-374`

Both fixtures are read from `workflow-system/product/archive/milestone-15-workflow-supervisor/` — but **M15 is the ACTIVE cycle**, and `/product-finalize` owns that directory: its job is to move cycle-scoped docs into `archive/<cycle-name>/` at cycle close. The path is stable today only because the files were pre-placed there.

⚠️ **This puts a 33-test suite break under the control of a skill whose job is to relocate those exact files.** A closing sweep that renames or reorganizes the cycle dir turns the suite red for a reason unrelated to any behavior.

**Fix shape:** a `src/state/__tests__/fixtures/` copy (or symlink) as the test-owned root, with the archive kept as the narrative home.

## SURFACE-2026-09-12-QUALITY-THE-DECISIVE-BAR-IS-STATED-TWICE-AND-CAN-DRIFT

- **Severity:** MAJOR · **Priority:** medium · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts:402-406, 476, 490`

`scoreArm` hardcodes the `0.8 / 0.8` bar inline, while the same threshold is carried in `q2._meta.threshold` as **unparsed prose** and asserted only via `toContain("CHOSEN")`. The number that actually decides SEPARABLE/NOT_SEPARABLE lives in code; the artifact's record of it lives in a string. ⚠️ **Change one and the other keeps asserting the old bar with equal confidence** — the asymmetric-drift shape `docs/lessons/source-text-guards.md` warns about.

⚠️ **Compounding (verified at source):** line 476 computes **haiku's** margin against **sonnet's** `minTpForBar` (`const positives = sonnet.tp + sonnet.fn`). It is arithmetically correct **only because both arms happen to share 29 positives**, and that coincidence is **never asserted** — `haiku.tp + haiku.fn` appears nowhere in the file. If the arms ever diverge, the haiku margin assertion silently measures the wrong thing.

**Fix shape:** read the bar from `_meta` (or cross-check code against it), and derive each arm's `minTpForBar` from its own positives.

## SURFACE-2026-09-12-QUALITY-THE-NAIVE-BASELINE-COMMENT-OVERSTATES-ITS-SCOPE

- **Severity:** MAJOR · **Priority:** medium · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts:228-229, 238-241`

The comment says the naive predicate "consults no policy table at all" — but the computation runs over `fire + no_fire` only, **excluding the 472 `undecided` records**, and that exclusion *is* a policy-table decision.

⚠️ **VERIFIED AT SOURCE:** 119 in-scope + **115 undecided-with-no-chain** = **234**. A genuinely policy-table-free predicate would flag **234, not 119**.

The 119/23 figure is defensible as a measurement — "naive *within the population the discriminating predicate already decided*" — but the comment describes something stronger. ⚠️ **This is the headline number in the ship commit message, the probe report (Q1), and the circularity backlog entry**, so a reader trusting the current framing will **mis-size WP3's expected improvement**.

**Fix shape:** correct the comment's claim (not the number) in the test, the probe report's Q1 evidence line, and the commit-message framing if it is ever restated.

## SURFACE-2026-09-12-QUALITY-NEAR-TAUTOLOGICAL-ASSERTIONS-INFLATE-THE-TEST-COUNT

- **Severity:** MINOR · **Priority:** low · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts:74-76, 196-210`

Several assertions are near-tautological given how the fixture is serialized: `expected_verdict` is 1:1 with arm membership (`fire[]` is 96/96 `FIRE`), so "labels every record" can only fail if the serializer omitted a field it never omits; likewise `confidence === "n/a"` outside `fire[]`, and `groundTruth + ruleOnly === fire.length` over a two-valued enum. They **guard a serializer that no longer exists** and pass the "could this fail if the named code were deleted?" test only weakly.

## SURFACE-2026-09-12-QUALITY-COMMENT-DENSITY-IS-A-THIRD-COPY-OF-THE-WIP

- **Severity:** MINOR · **Priority:** low · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts` (whole file)

~158 of 494 lines (**~32%**) are comments, much of it **provenance**: the 223→127→96 attempt history, "an earlier version of this test also asserted…". ⚠️ `docs/lessons/source-text-guards.md` §Comment budget names exactly this, and the lesson doc records it being flagged in **four consecutive reviews of another file**.

Applying its test — *would a reader who has never seen the WIP make a worse decision without this sentence?* — the **failure-direction and what-to-do-when-this-fails** paragraphs earn their place (keep). The **attempt-history narrative** does not: the WIP and backlog already carry it verbatim, making the test file a **third copy that will drift**.

**Fix shape:** pointer-to-canonical-home, not shorter sentences — trimming treats the symptom.

## SURFACE-2026-09-12-QUALITY-TYPE-ALIAS-AND-ACCESS-STYLE-NITS

- **Severity:** MINOR · **Priority:** low · **Status:** pending
- **Site:** `src/state/__tests__/m15SupervisorFixture.test.ts:35, 429, 442-443`

(a) `Record_` uses a trailing underscore to dodge the `Record` builtin; `FixtureRecord` reads better and needs no explanation. (b) `Object.values(q2.arms)` relies on **insertion order** for `[a, b]` destructuring while lines 442-443 correctly index by name (`q2.arms.sonnet`) — harmonize to the named form.

---

# drive-mode-on-the-workspace-surface — 2026-08-26

⚠️ **Findings 1, 2 and 4 share a root cause and ONE fix** — extracting the apply operation into a
`useDriveModeApply` hook gates the affordance, exposes the intent latch as a ref, and makes both
source-guarded properties value-testable. Treat them as one item, not four.

## SURFACE-2026-08-26-QUALITY-DRIVEMODE-REENTRANCY-DISCARDS-A-SECOND-APPLY
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface, ship `efa7798`)
- **Type:** bug (live, user-facing)
- **Summary:** ⚠️ **A LIVE DEFECT, verified at source before filing.** `respawnWanted` gates the
  HANDLER (`Workspace.tsx:374`) but nothing gates the AFFORDANCE. During a queued apply the readout
  stays clickable, the `<select>` stays reachable, and `storedDriveMode` was already optimistically
  written — so a second mode change → confirm → **Apply is silently discarded** while the readout
  shows the new value.
- **Context:** This is the *"readout claims a mode the session is not obeying"* state that AC-5 and
  `applyDriveMode.ts`'s own header exist to prevent, reached through a different door. Confirmed: no
  `disabled` and no click guard on the readout; `Workspace.tsx:917` renders only the ⏳ indicator.
  Reachable only while an apply is queued behind a busy agent, which is why live verification missed
  it — every verified apply ran against an idle session.
- **Suggested action:** Disable the readout/selector while `respawnWanted`, **or** let a second
  apply supersede the queued one. ⚠️ Decide which deliberately: superseding is friendlier but needs
  the first queued apply cancelled, not merely overwritten.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-26-QUALITY-RESPAWN-INTENT-HOLD-IS-SCHEDULER-TIMING
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt
- **Summary:** `RESPAWN_INTENT_HOLD_MS = 400` (`applyDriveMode.ts:165`) synchronises against the
  React scheduler rather than an event. `await Promise.resolve()` is a microtask and does **not**
  guarantee a committed render before `relaunch()`.
- **Context:** ⚠️ A deterministic mechanism was available **and is the house idiom in the same
  file** — `onSessionIdRef` (`XtermPane.tsx:467`) solves exactly this problem. The failure mode if
  the window is missed is the silent one the comment itself names: the spawn reads the ORIGINAL
  door, consuming the unclean-exit flag and disabling auto-resume on the next real open. **No test
  can observe it.**
- **Suggested action:** Replace the sleep with a ref the spawn effect reads at spawn time. Folds
  into the `useDriveModeApply` extraction.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-26-QUALITY-CONSTANT-BORROWS-A-MEASURED-SIBLINGS-CREDIBILITY
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt (comment correctness)
- **Summary:** `applyDriveMode.ts:161-164` justifies `RESPAWN_INTENT_HOLD_MS` by claiming it
  "matches the `INJECT_SETTLE_MS` idiom … for the same reason." It does not: `INJECT_SETTLE_MS` is
  empirically measured, documents its sample, and is pinned by a test asserting both the value and a
  floor. This one has no measurement, no test, and one call site.
- **Context:** ⚠️ *"Borrowing a measured constant's credibility for an unmeasured one is the kind of
  comment that stops a future reader from questioning the number."* A generalizable comment
  anti-pattern worth naming beyond this instance.
- **Suggested action:** Either measure and pin it, or delete the comparison and state plainly that
  the value is unmeasured. Moot if the ref fix above lands.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-08-26-QUALITY-SOURCE-GUARDS-WHERE-EXTRACTION-WAS-AVAILABLE
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt (guard shape)
- **Summary:** Two source-text guards (`workspaceDriveModeRender.test.tsx:136-205`) assert that
  `Workspace.tsx` destructures `persist` and compares `e.payload.path`. Labelled "floor, not proof"
  — honest, but the conclusion does not follow.
- **Context:** ⚠️ `arch.md`'s "a `?raw` guard cannot express a behavioural property" is an argument
  **FOR EXTRACTION**, which this same feature applied twice (`driveModeWriteFor`, `readyToRespawn`).
  The path filter is equally extractable (`shouldApplyBroadcast(payloadPath, myPath)`). The current
  regex breaks on any rename or reorder, while a semantically-equivalent-but-wrong comparison passes.
- **Suggested action:** Extract both predicates and replace the regexes with value tests.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-08-26-QUALITY-DRIVEMODE-MINOR-POLISH
- **Source:** feature:review-quality (drive-mode-on-the-workspace-surface)
- **Type:** tech-debt (4 MINOR findings, grouped)
- **Summary:** (a) `Workspace.tsx:380-387` — orphaned 8-line comment describing `startApply`, now
  ~90 lines away, pointing at the wrong function. (b) `Workspace.tsx:359-366` — a leftover
  `/** Cancel: a TRUE no-op */` doc comment mislabels `resolveDriveMode`, which handles BOTH
  outcomes. (c) `App.css:602-625, 642-660` — `.workspace-header-drivemode` declared twice, split by
  an unrelated rule. (d) `Workspace.tsx:229-357` — ~130 inline lines of drive-mode state in a
  component past 1170 lines.
- **Context:** (a)–(c) are phase-accretion artifacts from the Phase 3→4 re-plan; ⚠️ two of them make
  a reader hit a comment describing the WRONG function, which is worse than no comment. (d) is the
  hook extraction that also fixes findings 1, 2 and 4.
- **Suggested action:** Sweep (a)–(c) in any refactor pass; (d) is the shared fix above.
- **Priority:** low
- **Status:** pending

# turn-output-reorientation — 2026-08-25

## SURFACE-2026-08-25-QUALITY-WP3-RAW-GUARD-ON-A-DOM-QUESTION
- **Source:** feature-review-quality (M13.5 WP3, MAJOR)
- **Type:** tech-debt (guard shape)
- **Summary:** `src/components/workspace/__tests__/turnNavControls.test.ts` (161 lines, 10 tests) is entirely `?raw` source-grepping for questions that are **DOM-at-rest** questions — `disabled` bound to the right flag, the readout hidden at `total === 0`, the controls positioned outside the gated row.
- **Context:** ⚠️ **This contradicts a rule the repo wrote down for itself.** `docs/lessons/source-text-guards.md` says: *"when the question is what does the DOM look like at rest, render it… Reaching for `?raw` on a DOM question is how this repo accumulated its nine failure forms"* — and names **two working precedents needing no new dependency** (`docsRender.test.tsx`, `projectModelCellRender.test.tsx`). The WIP never mentions `renderToStaticMarkup`. Concretely brittle: `disabled=\{!turnNav\.canPrev\}` breaks on a Prettier reflow or any trivially-equivalent refactor, and the `[\s\S]{0,200}?` proximity windows are order-dependent. ⚠️ **It also cannot see the rendered attribute at all**, so it cannot cover the gate-OFF case a parsed DOM would get for free. Not a correctness defect today — the 10 arms were each mutation-proven — but it is a guard that will rot in the catalogued ways.
- **Suggested action:** Port to a render test (`renderToStaticMarkup` + a parsed DOM), following the two named precedents. Assert the same three properties off the rendered output, and add the gate-OFF case the grep cannot reach. ⚠️ Expect the port to **delete** most of the regex machinery rather than translate it.
- **Priority:** medium

## SURFACE-2026-08-25-QUALITY-WP3-EXPORT-GUARD-IS-A-ONE-MODULE-PATCH
- **Source:** feature-review-quality (M13.5 WP3, MAJOR)
- **Type:** gap
- **Summary:** `turnNavExportContract.test.ts` — the guard for this WP's blank-app defect — is scoped to **one import edge** (`./turnMarkers`, two named consumers) and re-implements an ESM export check by regex-parsing import statements. ⚠️ **The reviewer answered the orchestrator's own question in the negative: it is a point patch, not the structural fix.**
- **Context:** The SURFACE it cites (`SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC`) **proposes the general remedy itself** — a boot smoke-test asserting `#root` has children after any deletion phase — and that was **filed rather than built**. So the next module to lose an export strands its consumer exactly as before; `src/components/workspace/` alone has **4 sibling import edges** with no such guard. ⚠️ **The guard's own header overclaims:** it says *"deliberate redundancy on a failure mode whose blast radius is 'the app does not start'"* while covering one module. The failure class is repo-wide; the mitigation is one-module-wide.
- **Suggested action:** Build the boot smoke-test as a real gate (it would **subsume** this guard, cover every import edge at once, and let the regex-parsed import-list machinery be deleted). ⚠️ Until then, at minimum **correct the header's claim** so it does not read as broader coverage than it has. Filing the general fix while shipping the narrow one is defensible sequencing — the overclaim is not.
- **Priority:** medium

## SURFACE-2026-08-25-QUALITY-WP3-PUSH-NOT-POLL-CONTRACT-DRIFT
- **Source:** feature-review-quality (M13.5 WP3, MAJOR)
- **Type:** tech-debt (contract drift)
- **Summary:** A **three-layer drift** on the "returns it so the caller never polls" claim. `turnMarkers.ts:224-243`'s `stepTurn` returns `{position, nav}` and its docstring says the caller *"never has to make a second call"* — but `XtermPane.tsx:416-441` **discards `stepped.nav`** and recomputes via `navState`; the handle's `stepTurn` then returns a **`boolean`** which `Workspace.tsx:622-626` **discards entirely** in favour of a follow-up `turnNavState()` call.
- **Context:** ⚠️ **Two places assert push-not-poll in PROSE while the code polls** — `Workspace.tsx:222-230` and `turnNavControls.test.ts:96`. The returned `nav` is **dead weight at two of three layers**, and a future maintainer reading *"every step returns it"* will hunt for a consumer that does not exist. ⚠️ The boolean's **own docstring already concedes it is not the honest signal** ("`true` does NOT promise the viewport pixel-moved… the honest signal for the UI is `turnNavState`"), which is the smell that it should not be the return type.
- **Suggested action:** Pick one and make all three layers agree: **either** thread `nav` through (`stepTurn(dir): TurnNavState | null`) and drop the boolean, **or** drop the returned `nav` and state plainly that the surface re-reads. ⚠️ **Fix the comments in the same change** — the prose is the part actively misleading readers.
- **Priority:** medium

## SURFACE-2026-08-25-QUALITY-WP3-DEAD-CONSTANT-COMMENT
- **Source:** feature-review-quality (M13.5 WP3, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** `XtermPane.tsx:72-78` — a 7-line comment documenting a `TURN_MARKER_COLOR` constant **that no longer exists**, for the overview-ruler affordance the re-spec rejected, including its full palette rationale.
- **Context:** The clearest single instance in this WP of *retracted reasoning promoted to permanent code prose*. A reader hunting for the marker colour finds a constant that is not there. By the comment-budget test — *would a reader who has never seen the WIP make a **worse decision** without this sentence?* — this is provenance and belongs in the archived WIP.
- **Suggested action:** Delete. The rationale is already in the WIP and the ship commit history.
- **Priority:** low

## SURFACE-2026-08-25-QUALITY-WP3-COMMENT-DENSITY-58-PERCENT
- **Source:** feature-review-quality (M13.5 WP3, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** ⚠️ **Comment density DID get materially worse in this WP** (the orchestrator asked the reviewer to judge exactly this): **58% of newly added production lines are comments — 388 of 673**. `XtermPane.tsx` moved **51% → 55%** while growing **714 → 944** lines. The `.workspace-jump-turn-btn` deletion rationale is stated in **four places** (`App.css:687-694`, `Workspace.tsx:66-70`, plus two test headers).
- **Context:** ⚠️ **The keep/cut split is clean and should be respected.** The individual *retraction* blocks (`XtermPane.tsx:361-372` alternate-buffer, `:451-458` premise-invalidated) **ARE load-bearing** — each prevents a specific re-derivation that already cost real work, and both are anchored to the code they warn about. The **duplicated deletion rationale** is the "same rationale in N places" pattern the lesson doc names as the expensive half. ⚠️ **No comment was found stale or contradicting the code**, so this is polish, not correctness.
- **Suggested action:** ⚠️ **FOLD INTO `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`; do NOT pay down separately.** That standing finding records that **per-WP trimming was measured as NOT converging** (four consecutive reviews of one file), and its own resolution shape is *"one authority per rule + a pointer at every other site + a GUARD"* — which is exactly what the four-copy deletion rationale needs. This entry is a concrete instance of that finding, and the **second** WP in M13.5 to produce one (see `# window-geometry-persistence — 2026-08-21`), which is itself evidence for the standing item's thesis.
- **Priority:** low

## SURFACE-2026-08-25-QUALITY-WP3-ARIA-LIVE-ON-A-CONDITIONAL-NODE
- **Source:** feature-review-quality (M13.5 WP3, MINOR)
- **Type:** bug (a11y, minor)
- **Summary:** `Workspace.tsx:636-641` — `aria-live="polite"` sits on the readout `<span>`, but that span is conditionally **mounted** on `turnNav.total > 0`. ⚠️ **A live region that does not exist when the value first appears will not announce it** — so the *first* turn is silent and only subsequent ordinal changes are announced.
- **Context:** Real but small: it degrades the AC-5 announcement rather than breaking navigation, and the surface is unannounced by any test either way. ⚠️ Note the interaction with the AC-5 decision to hide the readout at zero turns — the fix must preserve that visual behaviour, so it is *render the region unconditionally and empty its TEXT*, not *drop the conditional*.
- **Suggested action:** Render the `<span>` unconditionally with `aria-live="polite"`; gate only its text content on `turnNav.total > 0`. Verify with a screen reader or an `aria-live` assertion that the first turn announces.
- **Priority:** low

# window-geometry-persistence — 2026-08-21

## SURFACE-2026-08-21-QUALITY-WP1-COMMENT-DENSITY-117-LINES-FOR-14
- **Source:** feature-review-quality (M13.5 WP1, MAJOR)
- **Type:** tech-debt (documentary)
- **Summary:** `src-tauri/src/window_state/mod.rs` ships **117 lines of comment for 14 lines of executable code** (58 `//!` module-doc lines + 45 `///` item-doc lines). A large share is **provenance** rather than decision-support.
- **Context:** Judged against `docs/lessons/source-text-guards.md` → "Comment budget" and its test — *would a reader make a worse decision without this sentence?* ⚠️ **The keep/move split is unusually clean here.** KEEP (a future reader adding `FULLSCREEN` or `VISIBLE`, or removing the denylist, would genuinely decide worse without them): the four plugin-source properties, and the two flag-omission rationales. MOVE (answers *how did we get here*, which the lesson routes to WIP/archive/CHANGELOG): the `1280×800`/`tauri.conf.json` history, "the operator resized it on essentially every launch", "their display is 1920×1080", "verified live at P1.3 rather than assumed", "the backlog entry says X", and the mutant-E narrative in the vacuity guard's doc comment (`mod.rs`:132-141). ⚠️ **All of the MOVE material is already in the ship commit message `25a68bc` verbatim** — that is its correct home, so this is deletion, not relocation.
- **Suggested action:** Trim the MOVE set; keep the KEEP set at the code. ⚠️ **Do NOT treat this as a generic "trim comments" pass** — per `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`, per-WP trimming was **measured as not converging** (four consecutive reviews of one file). This item is a concrete instance of that standing finding and should be **folded into it**, not paid down separately.
- **Priority:** medium (no correctness impact; the cost is that at this density 95%-accurate prose reads as authoritative and the wrong 5% is what gets acted on — the lesson's own warning)
- **Status:** pending

## SURFACE-2026-08-21-QUALITY-WP1-PIP-RATIONALE-AT-FOUR-SITES
- **Source:** feature-review-quality (M13.5 WP1, MAJOR)
- **Type:** tech-debt (duplication → drift risk)
- **Summary:** The PiP-denylist rationale is stated at **four sites**: `M10.5 WP1's top-right anchor` at `mod.rs`:90, `mod.rs`:218 and `lib.rs`:212; "load-bearing not cosmetic" at `mod.rs`:84 and `lib.rs`:104; and the four-plugin-properties list summarized again in `Cargo.toml`:118-126.
- **Context:** `docs/lessons/source-text-guards.md` is unambiguous that **duplication is the expensive half** — state it once at the canonical home, make every other site a pointer — and names measured instances in this repo of a rationale living in six files and drifting **asymmetrically**. ⚠️ This is the *same* failure class as the already-open `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`, whose own resolution shape is **"one authority per rule + a pointer at every other site + a GUARD"**.
- **Suggested action:** Make `denylist()`'s doc comment the single authority; collapse the `lib.rs` and `Cargo.toml` blocks to one-line pointers to it. ⚠️ Per the standing finding above, the durable fix needs **a guard**, not just this one consolidation — otherwise the next feature re-adds a fourth site.
- **Priority:** medium (no live defect; four copies are four things to update, and the copy someone edits becomes right while the others keep asserting the old thing with equal confidence)
- **Status:** pending

## SURFACE-2026-08-21-QUALITY-WP1-MINOR-SET
- **Source:** feature-review-quality (M13.5 WP1, 4 MINOR grouped)
- **Type:** tech-debt (consistency + guard precision)
- **Summary + suggested action, one per finding:**
  1. **`mod.rs`:235 — bare `"main"` literal in a test** that argues the opposite principle three other places (`denylist()` avoids re-spelling labels; the guard at :171 forbids string literals in `register()` for that reason). `tray/commands.rs:42` already holds a **private** `const MAIN_WINDOW_LABEL`. → Promote that const, or add one line noting this literal is the **framework default**, not a Claudesk-owned label. Defensible as-is; the asymmetry is the cost.
  2. ⚠️ **`mod.rs`:171-175 — the `!code.contains('"')` assertion is BROADER than the property it names.** It reads as "no window labels inline" but also rejects `.with_filename("…")`, a legitimate builder option (plugin source :346) a future dev/prod-isolation change might want. → Narrow it (or widen the failure message to say what it really forbids). *An over-broad guard that fires on a legitimate change is how guards get **deleted** rather than narrowed.*
  3. **`mod.rs`:102 — `denylist() -> [&'static str; 1]`** bakes the count into the signature, so a second excluded label is a type change rippling to both call sites. → `&'static [&'static str]` costs nothing. Not a correctness issue; `with_denylist` takes `&[&str]` either way.
  4. **`mod.rs`:132-141 — the vacuity guard's doc comment restates the mutant-E narrative** already in commit `25a68bc`. → Keep the ⚠️ what-to-do-when-this-fails paragraph (it earns its place); drop the history. Overlaps finding 1 of the comment-density item above.
- **Priority:** low (all four)
- **Status:** pending

# m13-wp4-milestone-exit-verify — 2026-08-18

## SURFACE-2026-08-18-QUALITY-WP4-WIP-PHASE-SECTIONS-INTERLEAVED
- **Source:** feature-review-quality (M13 WP4, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** The WP4 WIP file's phase sections are **interleaved out of execution order** — "Phase 2
  — pre-read" sits between two Phase 1 sections, and "Phase 4 — pre-read" sits between Phase 3's
  verify-auto and verify-self. Cause: pre-reads were appended in **wall-clock** order into a document
  otherwise organized **by phase**.
- **Context:** The pre-reads being recorded *before* observation is the whole point of them (it is
  what makes "recorded before observing" a real claim rather than a post-hoc one), so the ordering
  itself is correct — it is the **placement** that costs a reader. At 1023 lines the file is the
  archive record for the milestone-closing WP, so navigability has real value.
- **Suggested action:** Group by phase and keep a `⚠️ recorded before observing` marker on each
  pre-read, which preserves the ordering claim without the interleave. ⚠️ Cheap only if done as a
  **move**, not a rewrite — this repo has a logged case of a prose rewrite silently dropping 259
  identifiers while preserving every warning (`[[grep-addressed-doc-loses-value-to-prose-rewrite]]`).
- **Priority:** low (readability of an archived record; no correctness impact)
- **Status:** pending

## SURFACE-2026-08-18-QUALITY-WP4-ARCH-DOC-MIRRORS-TEST-FILE-HEADER
- **Source:** feature-review-quality (M13 WP4, MINOR)
- **Type:** tech-debt (documentary)
- **Summary:** `arch/workflow-gate.md`'s property-1 bullet grew from one paragraph to a table plus
  four `⚠️` paragraphs, and the last three **partly restate** content that also lives in
  `offInvariantGuard.test.ts`'s own header: the arm-5-has-no-ungated-half rationale, the
  probe-each-arm-individually rule, and the `WORKFLOW_TERMS` vocabulary gap (the last **also** fully
  stated in `backlog.md`).
- **Context:** ⚠️ **This is the project's standing rationale-duplication finding, one level up** — an
  `arch/` doc mirroring a test-file header will drift against it asymmetrically, which is exactly what
  the WP4 latency paydown just fixed inside `src/`. The **table and the count correction are clearly
  worth keeping** (they fixed a real self-contradiction); it is the three prose paragraphs after it
  that are candidates for a pointer instead of a restatement.
- **Suggested action:** Replace the three paragraphs with one pointer at the test file, keeping the
  table. ⚠️ **Do NOT trim a little from each site** — that is precisely how the
  four-consecutive-reviews case happened. Decide which document is authoritative for the guard's
  *mechanics* (almost certainly the test file, since it is executable) and make the other point at it.
- **Priority:** low-medium (readability only; the risk is future asymmetric drift, not a live defect)
- **Status:** pending

# m13-wp3-recycle-session — 2026-08-18

## SURFACE-2026-08-18-QUALITY-WP3-LATE-SUBSCRIPTION-DISPOSAL-UNTESTED
- **Source:** feature-review-quality (M13 WP3, MAJOR) — **VERIFIED INDEPENDENTLY at review**
- **Type:** gap (real code with no reachable test)
- **Summary:** `awaitCompletion`'s `(un) => (settled ? un() : unlisteners.push(un))` at
  `recycleSession.ts:259` and `:271` disposes a subscription whose `listen()` resolved **after** the
  operation already settled. ⚠️ **The test mock always resolves its unlisten synchronously**
  (`Promise.resolve(() => …)`), so the `settled ? un()` half is **unreachable by the suite** — both
  "unsubscribes both sources" tests settle after the subscriptions have landed, and
  `unlistenCalls === 2` passes either way.
- **Context:** The real ordering it guards is a `listen()` round-trip slower than the operation —
  reachable via a slow IPC or a short `completionTimeoutMs`. ⚠️ This fails the repo's own test:
  *"could this still pass if the code it names were deleted?"* A future simplification to a bare
  `unlisteners.push(un)` would pass the entire suite while **leaking one `fs-change` listener per
  Recycle for the app's lifetime**.
- **Suggested action:** Make the mock's unlisten resolution **deferred and controllable** (resolve it
  on a later tick, or expose a resolver the test fires after settle), then assert the un-pushed
  unlisten was still called. Small, and it converts real-but-unreachable code into guarded code.
- **Priority:** medium (no live defect — the code is correct; the risk is entirely in the next edit)
- **Status:** pending

## SURFACE-2026-08-18-QUALITY-WP3-COMMENT-DENSITY-AND-RATIONALE-DUPLICATION
- **Source:** feature-review-quality (M13 WP3, MAJOR — readability)
- **Type:** tech-debt (documentary)
- **⚠️ PARTIALLY RESOLVED at M13 WP4 (2026-08-18) — rewritten to the REMAINING open work.** The
  **latency-figure half is CLOSED**: the figures now live only in `RECYCLE_TIMEOUT_MS`'s doc comment
  (`recycleSession.ts`), every other production site points there, and a **guard enforces it** (plus
  an anti-vacuity companion blocking the wrong-direction "fix" of deleting the measurement). See the
  `**Backlog resolved:**` entry in `CHANGELOG.md` for 2026-08-18.
- **Summary (what REMAINS):** (a) the *"Recycle is NOT a `SKILL_BUTTONS` member"* rationale is still
  restated across **five sites** — `recycleButton.ts`, `skillButtons.ts`, `Workspace.tsx` (import
  comment AND JSX comment) and two test files; (b) raw **comment density 52% / 71% / 70%** in
  `recycleSession.ts` / `recycleMachine.ts` / `recycleButton.ts` is unaddressed — WP4 collapsed
  duplication but did not thin any module.
- **Context:** ⚠️ Unlike the latency half, **(a) has NOT drifted** — all five sites currently agree.
  This is duplication *risk*, not live drift, which is why it is lower priority than the half already
  paid. ⚠️ **The scope-boundary lesson from the paid half applies here too:** when this is picked up,
  state at the fix site what the enforcement does and does not cover, or the next reader inherits a
  guard that claims more than it checks.
- **Suggested action:** Pick ONE authority for the not-a-skill-button rationale (`recycleButton.ts`'s
  module doc is the natural home — it is the module the rule is *about*) and reduce the other four to
  pointers. ⚠️ **Do NOT trim a little from each site** — that is precisely how the
  four-consecutive-reviews case happened. Consider whether a guard is warranted, as with the latency
  half; a paydown without one silently re-accumulates.
- **Priority:** low (readability only; no drift observed, no correctness impact)
- **Status:** pending

## SURFACE-2026-08-18-QUALITY-WP3-THREE-MINOR
- **Source:** feature-review-quality (M13 WP3, 3 MINOR)
- **Type:** tech-debt
- **Summary:** (a) `showRecycleButton`'s doc claims deliberate independence so the two predicates can
  diverge, but the button renders **inside** the `showSkillButtons(...) &&` block, so that gate
  strictly dominates and the documented divergence is unreachable as wired — the new source guard
  even pins the nesting. (b) ⚠️ **Two opposite rules for one idiom in a single commit:**
  `XtermPane.tsx:280` writes a ref **during render** while `Workspace.tsx:196-199` documents at
  length that render-phase ref writes are an eslint **ERROR** and uses an effect. (c)
  `waitForFreshSessionId` and its two constants are defined **after** their use.
- **Suggested action:** (a) one sentence acknowledging the current nesting; (b) state which rule
  governs and why the `XtermPane` precedent is exempt (or convert it); (c) reorder.
- **Priority:** low (all three)
- **Status:** pending

# m12-wp4b-drive-mode-signal — 2026-08-07

## SURFACE-2026-08-07-QUALITY-WP4B-ENV-VAR-INHERITS-TO-ALL-DESCENDANTS
- **Source:** feature-review-quality (M12 WP4b, MAJOR) — **CONFIRMED EMPIRICALLY at review, not accepted on assertion**
- **Type:** gap (stated containment story is narrower than actual reach)
- **Summary:** `CommandBuilder::env` is **additive over the inherited environment** (there is no `env_clear()` anywhere in `cc_session`), so `CLAUDESK_DRIVE_MODE` propagates down the **entire descendant chain** of a Claudesk-spawned CC — not just to CC itself. A `claude` launched from inside that CC's Bash tool inherits the var and its `UserPromptSubmit` hook fires carrying **the parent workspace's mode**, even though that nested session never opened a Claudesk workspace. Verified directly: `CLAUDESK_DRIVE_MODE=fsd bash -c 'bash -c echo $CLAUDESK_DRIVE_MODE'` → `fsd` at both levels, and feeding that value to the real hook emits the sentence.
- **Context:** ⚠️ **The WP's own containment story is CC-yes / login-shell-no** (constraint 5, `shell_spawn_env`, `the_raw_login_shell_never_receives_the_drive_mode_var`) — all of which guard the **sibling** shell and none of which address **descendants**. The announced blast radius is "1 of 10 events, CC-only"; the real radius includes nested CC invocations. ⚠️ **The test suite ALREADY OBSERVED this and neutralized it locally**: both new helpers call `.env_remove("CLAUDESK_DRIVE_MODE")` with a comment saying the ambient environment carries it because the tests run inside a Claudesk workspace. That was the strongest available signal about production behavior and it was consumed as test hygiene. ⚠️ Precedent in this repo for the same shape: `[[agent-launched-app-cannot-verify-continue]]` (CLAUDE_CODE_CHILD_SESSION leaking down a launch chain). **Not necessarily a defect** — a nested CC arguably *should* inherit the workspace's mode — but it is undecided and unstated.
- **Suggested action:** Decide the intent, then make it explicit. Either (a) accept propagation and say so at `cc_spawn_env` ("descendants inherit this; any of them emitting UserPromptSubmit will fire the hook with this mode"), or (b) scope it to the direct child. ⚠️ Do NOT reach for `env_clear()` — it would strip PATH/LANG/TERM and break the M10.5 mojibake fix and the GUI-PATH spawn fix. If (b) is wanted the mechanism is a marker the hook can compare against, not env removal.
- **Priority:** medium (no user-visible defect today; it is a stated-scope gap on a feature whose whole safety story is "inert unless Claudesk set it")
- **Status:** pending

## SURFACE-2026-08-07-QUALITY-WP4B-FOUR-MINOR-FINDINGS
- **Source:** feature-review-quality (M12 WP4b, MINOR ×4)
- **Type:** tech-debt (polish)
- **Summary:** (1) `claudesk-hook.pl:108` rebuilds the 4-element `%KNOWN` hash on every `UserPromptSubmit` — negligible against Perl's ~15 ms cold start, but the surrounding comments advertise per-call cost as a design constraint and do not answer the question they invite. (2) `cc_session/mod.rs:499-506` reaches the wire value via `serde_json::to_string(&mode).trim_matches('"')`, and the `if let Ok(wire)` arm silently drops the var on a serialization failure that cannot occur for a fieldless enum. (3) `hook_pl_output.rs`'s `expected_context()` duplicates the sentence literal from the script and defends it — three lines from the vocabulary test whose stated principle is the opposite (read it out, never restate); the two adjacent tests apply opposite duplication rules with no note reconciling them. (4) `set_default_drive_mode_leaves_the_model_override_untouched_and_vice_versa` does not assert the "vice versa" half.
- **Suggested action:** Address opportunistically. (3) is the most valuable — a one-line note reconciling why the *vocabulary* is read out of the script while the *sentence* is duplicated would stop a future editor unifying them the wrong way. (4) is a two-line test addition.
- **Priority:** low
- **Status:** pending

# m12-wp3-autofire-and-announce — 2026-08-05

## SURFACE-2026-08-05-QUALITY-WP3-THREE-MINOR-POLISH-ITEMS
- **Source:** feature-review-quality (M12 WP3, 3× MINOR)
- **Type:** tech-debt (polish)
- **Summary:** (a) `session_state::is_unclean` is `pub` with **no callers outside its own module** while its docstring calls it a footgun — `pub` in a lib crate suppresses `dead_code`, so the ledger discipline that caught `is_unclean_on_disk` **cannot see it**; narrow to `pub(crate)`. (b) `XtermPane.tsx:542-551`'s `exhaustive-deps` suppression comment enumerates every intentional exclusion by name but **omits the two new captured props** (`pendingAction`, `openIntent`) — safe today since both are immutable after mint, but that list is the mechanism protecting the effect. (c) `pickerRowOrder.ts:52,76` still say "the `⏵` cell" after the glyph became `⊘`, and `pickerRowGutterStructure.test.ts:63` still emits `⏵` as its fixture's text node.
- **Context:** Grouped as one entry because all three are single-line mechanical edits in the same WP. Item (a) is the most interesting: the module's own closing argument is that no item survives without a real caller, and this one does — invisibly, because visibility suppresses the lint that would say so.
- **Priority:** low (all three)
- **Status:** pending

# m12-wp1-probe-flag-store-and-announce — 2026-08-03

## SURFACE-2026-08-03-QUALITY-WP1-MEASUREMENT-SCRIPTS-NOT-IN-REPO
- **Source:** feature-review-quality (M12 WP1, MAJOR)
- **Type:** tech-debt (evidence provenance)
- **Summary:** All three measurements Verdicts (a)/(b) reason from were produced by scripts in the **session scratchpad**, which is not in the repo. The 27.9× write-amplification figure and the 0.022/0.051/0.123 ms announce table therefore have no reproducible provenance, while Phase 2's own observable required the measurement be *"reproducible by re-running the script the phase writes."*
- **Context:** The lost-update fact — the load-bearing one — **is** now pinned by the Rust test `interleaved_whole_file_writes_lose_the_earlier_writers_edit`, which is the right answer and supersedes its script. The two *performance* figures are the gap. **Mitigated at review time:** both are now labelled in `wbs.md` as one-shot observations with their METHOD stated inline, so the doc no longer cites evidence a reader cannot reach and the measurement can be redone in ~5 minutes. What remains open is whether a perf spike of this kind should have a durable home.
- **Suggested action:** Decide the general convention rather than just this instance: either (a) accept that probe-grade perf spikes are one-shot and method-documented (current state — arguably correct, since a benchmark nobody runs rots), or (b) give them a home under `tooling/` when the number is cited in a durable doc. ⚠️ Do NOT reflexively add a `tooling/` script for this WP alone — the conclusion depends on the round-trip COUNT (1 vs N), a design property, not on the timings.
- **Priority:** low (was MAJOR pre-mitigation; the doc no longer overclaims and the decisive fact is test-pinned)
- **Status:** pending

## SURFACE-2026-08-03-QUALITY-WP1-PHASE2-OBSERVABLE-LEFT-UNAMENDED
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** gap (process)
- **Summary:** Phase 2's observable required the verdict cite `ProjectPicker.tsx:38-42` "as the precedent it **is following**." The verdict correctly *reversed* that conclusion (sibling command, not a widening) and cites the precedent as **declined**, by name rather than by line — so the literal string `ProjectPicker.tsx:38-42` appears nowhere, and a mechanical grep of the observable reports a miss on a phase marked `[x]`.
- **Context:** The reversal is the *right* outcome; the defect is that the observable was not amended when the conclusion inverted. Generalizable process point: **when a phase's finding overturns the assumption its own observable encoded, the observable must be rewritten, not silently outgrown** — otherwise a later audit reads the mismatch as an unfinished phase.
- **Suggested action:** No code change. Consider whether `feature-verify-codify` should prompt to reconcile observables that a verdict reversed. Low value alone; worth folding into a future workflow-system pass.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-08-03-QUALITY-WP1-TWO-LIVE-VERDICT-B-REFERENCES
- **Source:** feature-review-quality (M12 WP1, MINOR)
- **Type:** tech-debt (naming ambiguity)
- **Summary:** `src/App.tsx:306-308` carries a pre-existing M10.9 comment reading *"Verdict (b)'s requirement"*. M12 WP1 introduced a **different** "Verdict (b)" whose reasoning cites that same call site, so two live "Verdict (b)"s now point at one line with different meanings.
- **Context:** Not introduced by this diff, but this diff is what made it ambiguous. Probe verdicts are per-WP and letter-keyed, so collisions recur every milestone — the fix is a qualifier convention, not a one-off edit.
- **Suggested action:** One-word qualifier at the call site (`M10.9 Verdict (b)`), and prefer milestone-qualified verdict references (`M12 WP1 Verdict (b)`) in future probe write-ups.
- **Priority:** low
- **Status:** pending

# m11-wp3-docs-render-and-navigation — 2026-08-02

*Reviewer: `code-quality-reviewer` against ship baseline `6f6df23`. 0 CRITICAL / 4 MAJOR / 3 MINOR.
**All 4 MAJOR were FIXED IN PLACE** (three verified by reproducing the reviewer's mutations first —
one of them passed the full 1645-test suite while re-opening a webview-hijack hole). Only the 3
MINOR are backlogged.*

## SURFACE-2026-08-02-QUALITY-WP3-HEADING-SLUG-NO-COLLISION-SUFFIX
- **Source:** feature:review-quality (m11-wp3)
- **Target level:** feature
- **Type:** gap (minor correctness)
- **Summary:** `headingSlug` does not de-duplicate colliding ids. Two headings differing only in
  punctuation (`## Probe outcomes` / `## Probe outcomes!`) emit the same `id`, so an anchor link
  reaches only the first. GitHub appends `-1`, `-2`; the comment claiming it "mirrors GitHub's
  algorithm" overstates by one rule.
- **⚠️ Context — MEASURED 2026-08-19 (paydown WP6). The original context claim was REFUTED.** It read:
  *"The corpus most likely to collide is exactly this panel's target — long WBS/WIP files with
  repeated section names (`## Tasks`, `## Probe outcomes` per WP)."* Scanned every `.md` the viewer
  can open (`workflow-system/`, `docs/`, `CHANGELOG.md`, `README.md`) — **197 files**:
  - **1 file** has any colliding slugs: `workflow-system/state/archive/m12-wp3-autofire-and-announce.md`
  - **4 colliding slugs** there (`gate`, `hygiene`, `session-hygiene`,
    `what-was-deliberately-not-codified`) — ⚠️ **none is `tasks` or `context`**, the two the filing named
  - **3 `](#...)` occurrences in the whole corpus, and all 3 are prose *examples* of the syntax**
    inside WBS/probe text — not navigable links
  - **0 anchor links target a colliding slug**, so the defect has no reachable consumer today
- **⚠️ And the fix is not the small change the filing implies.** `headingSlug` is a pure function of
  one string; de-duplication needs **per-document counter state**. Its only production caller is
  `DocMarkdown.tsx`'s `HEADING_COMPONENTS`, which is **module-scope deliberately** — *"so the object
  identity is stable across renders and does not force the renderer to rebuild its component map on
  every keystroke-driven re-render."* A counter means reversing that documented decision or threading
  a `useMemo`'d per-doc map.
- **Resolved half:** the over-claiming comment was narrowed at paydown WP2, and WP6 appended the
  measurement to it. ⚠️ Note the finding itself proposed this as a legitimate close — *"the comment fix
  is not a cop-out"*.
- **Suggested action (remaining):** **Leave the behavior as-is.** Revisit only if one of these becomes
  true — and check, do not assume: (a) a doc gains a *real* in-doc anchor link that targets a colliding
  slug, (b) a heading collision appears on a common slug (`tasks` / `context` / `summary`) in a
  non-archived doc, or (c) `HEADING_COMPONENTS` stops being module-scope for an unrelated reason, making
  the counter nearly free. Re-run the corpus scan before re-scoring — this entry's numbers are true
  as-of 2026-08-19 (`[[backlog-finding-carries-an-implicit-as-of-date]]`).
- **Priority:** low (latent; no reachable consumer measured)
- **Status:** open — behavior deliberately unchanged, measured latent at paydown WP6 (2026-08-19)

# m11-wp2-docs-panel-plumbing — 2026-08-01

*Reviewer: `code-quality-reviewer` against ship baseline `6632f59`. 0 CRITICAL / 3 MAJOR / 4 MINOR.
**2 of 3 MAJOR backlogged** — MAJOR-1 was verified and fixed in place (an over-claiming comment in a
guard shipped minutes earlier; leaving a knowingly-wrong claim in a test is the exact failure this
feature twice paid to avoid). Both remaining MAJORs land on WP3/WP4's path, so they are genuine
scheduling items rather than polish.*

## SURFACE-2026-08-01-QUALITY-WP2-MINOR-BATCH
- **Source:** feature:review-quality (m11-wp2)
- **Target level:** feature
- **Type:** tech-debt (cosmetic)
- **Summary:** ⚠️ **PARTIALLY RESOLVED — rewritten 2026-08-18 (paydown WP1) to the 2 remaining
  sub-items.** Was four MINOR findings; (3) and (4) are closed (see CHANGELOG 2026-08-18). What
  remains, both comment-density items:
  (1) `panelHost.ts:26-43` — the type-only seam import is genuinely load-bearing (verified by
  mutation), but its 18-line justification argues with the guard before describing the code, burying
  the secondary type-safety benefit where it reads as primary.
  (2) `docs/mod.rs:184-201` — 9 comment lines plus a dedicated private-helper test for a dedup
  branch no production input reaches; an assertion that the fixed lists and glob sets are disjoint
  would pin the same invariant at its source, smaller.
- **Resolved sub-items (2026-08-18, paydown WP1):** (4) `validate_frontend_root`'s verbatim copy —
  the `editor_fs` original is now `pub(crate)` and imported, and the dedup is **structurally
  enforced**: a re-introduced copy fails to compile (`E0255`), proven by mutation. (3)
  `DocsPanel.tsx` `selected` — resolved by the passage of the work the finding itself named
  ("no consumer *until WP3*"); WP3/WP4/WP5 shipped, the value now has ~35 references and the stale
  header claim is gone. **No edit was made — recorded as no-change-needed with evidence.**
- **Context:** The reviewer's overall note is that comment-to-code ratio in `panelHost.ts` and
  `docs/mod.rs` is high enough that load-bearing sentences compete with provenance narration.
  ⚠️ **Both survivors are comment-DENSITY items, so they belong to the deferred T1/T2 convention
  pass** (`backlog-paydown-wbs.md` → "Deliberately NOT in a WP"), **not** to a sweep WP. Per-WP
  trimming was measured as **not converging** — the same file was flagged in four consecutive
  reviews. The shape that works: designate ONE authority per rule, collapse other sites to a
  pointer, and **guard it** so it cannot drift back.
- **Suggested action:** Carry both into the T1/T2 convention pass. ⚠️ Do **not** fix by trimming a
  little from each site — that is the recorded failure mode.
- **Priority:** low
- **Status:** pending — 2 of 4 sub-items remain; routed to the T1/T2 convention pass

# time-tracking-offline-local-only-copy — 2026-08-01

*(feature-review-quality against ship baseline `0f5a8c7^..7a1a185`; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 3 MINOR. **BOTH MAJORs were FIXED IN PLACE, not backlogged**, and so was one MINOR — see the originating WIP's `## Code-Quality Review` for the full record. The two MAJORs were reflow-fragile `?raw` assertions in this WP's own new copy guards: prose inside JSX wraps at Prettier's default 80 cols, and two assertions sat 3–6 characters from the boundary, so they passed only by luck about where the words fell. Fixed by normalizing the haystack (`src.replace(/\s+/g, " ")`) in both guard files, validated in both directions — a **pure reflow** with identical words now passes where it previously failed, while dropping a claim, dropping the scope disclosure, or renaming the advertised label each still fail. Rationale for deviating from autopilot's auto-backlog default: one line per file, the guards protect a **privacy disclosure**, and they had been written in the same session — backlogging a guard already known to misfire would ship known-broken verification. Reviewer: "well-built copy-only change that does more than its brief… the plan-audit discipline is the strongest thing here.")*

## SURFACE-2026-08-01-QUALITY-WP3-ANALYTICS-HINT-EXCEEDS-SIBLING-BAND
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx:529`
- **Finding:** The Analytics `SettingsGroup` hint is **270 chars** against sibling group hints of **107 / 84 / 42** (lines 367, 391, 545) — still ~2.5× the longest sibling after the verify-human compression from 322.
- **Why it matters:** Cosmetic/proportion only; the content is correct, each of its four facts is distinct, and the length was an explicit operator-delegated call. Worth recording because the WP itself banked *"measure the incumbent's siblings first"* as the reusable lesson, and this surface still sits outside the band that lesson describes.
- **Pickup shape:** Do **not** shorten by dropping a claim — all four are load-bearing (the machine-wide scope clause especially; removing it makes the copy misleading by omission, and its truthfulness is verified in `time_store::drain_loop`). The real fix, if ever wanted, is a **dedicated privacy line** as a distinct element so the group hint returns to one sentence. That is a small UI addition, not a copy edit, so it needs to clear `new-surface-must-earn-its-place` first. Revisit only if such an element appears for another reason.
- **Priority:** low.
- **Status:** pending.

# m10.9-wp3-invite-settings-substrate — 2026-07-29

*(feature-review-quality against ship baseline `6193615^..5bc88f3`; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 5 MINOR. **MAJOR #1 (gate-seam bypass in App.tsx) was FIXED IN PLACE, not backlogged** — it was a live staleness defect and the fix was a 3-line import swap; the OFF-invariant guard's blind spot that hid it was closed in the same pass. Only MAJOR #2 and the 5 MINOR are listed here. Reviewer: "high-quality, unusually disciplined work — the strongest parts are the persistence model and the consistent instinct to extract a pure function whenever a decision has a truth table.")*

## SURFACE-2026-07-29-QUALITY-WP3-DETACHED-SUBSTRATE-COMMENT
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx:190-199`
- **Finding:** The 10-line substrate-presence comment block is separated from the code it documents — the highlight state + effect were inserted between it and `const [substratePresent, …]`. A reader arriving at :190 reads nine lines about a filesystem probe, then meets an unrelated highlight comment.
- **Why it matters:** the reasoning is load-bearing (why this is NOT a `useSettingControl`) but as placed it reads as documentation for the highlight.
- **Suggested action:** move the block down to sit directly above `const [substratePresent, …]`.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-29-QUALITY-WP3-HARDCODED-HIGHLIGHT-TINT
- **Severity:** MINOR
- **Location:** `src/components/settings/__tests__/settingsHighlight.test.ts:55,98`
- **Finding:** Two assertions hardcode the literal `rgba(120, 165, 240`. A designer-level tint tweak with zero behavioral consequence fails two tests and reads as a regression. (The duration-coupling test in the same file is well-built by contrast — it parses both sides and compares numbers.)
- **Why it matters:** the load-bearing property is "three distinct peaks with troughs between", which can be asserted by counting `background-color:` stops and their alternation without pinning a specific color.
- **Suggested action:** count stops/alternation instead of matching the color literal.
- **Priority:** low
- **Status:** pending

# editor-fs-backend-hardening — 2026-07-20

*(feature-review-quality on the uncommitted working-tree WP7 diff, HEAD `6f514d0`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all polish/observability notes, none blocking. Reviewer: "well-built, disciplined hardening pass… all flagged edge cases resolve correctly under the design; none rise to a finding." Backlog-paydown sweep WP7 — the last WP.)*

## SURFACE-2026-07-20-QUALITY-WP7-VALIDATE-ROOT-PER-CALL-COST
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/commands.rs:34-45` (`validate_frontend_root`)
- **Finding:** Reads + parses `projects.json` from disk AND canonicalizes every known root on *every* read/write/stat/delete/trash/create call — one `canonicalize` syscall per known root, N syscalls per op. Correct and acceptable at single-user scale, but scales with project count.
- **Why it matters:** A future watch/poll surface (or a tight save loop) calling these commands repeatedly would re-do the disk read + per-root canonicalize each time.
- **Suggested action:** Memoize the resolved known-roots behind the config-store's existing state rather than re-reading `projects.json` each call.
- **Priority:** low

## SURFACE-2026-07-20-QUALITY-WP7-UNKNOWN-ROOT-ERROR-VARIANT
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:199` (`validate_root` → `OutsideWorkspace { root: "<no known project>" }`)
- **Finding:** `validate_root` reuses `OutsideWorkspace` with a sentinel `root` string `"<no known project>"`; the `Display` reads `path <X> is outside the workspace root <no known project>`, which is slightly odd (the requested root *is* the rejected thing, not a path outside some other root).
- **Why it matters:** Reusing the variant blurs "root not a known project" vs. "file path escaped a valid root" — a UI that wanted to distinguish them can't.
- **Suggested action:** A distinct `EditorFsError::UnknownRoot` variant would read cleanly and let the UI branch. Minimal-choice reuse is reasonable for now.
- **Priority:** low

## SURFACE-2026-07-20-QUALITY-WP7-RESOLVE-WITHIN-TOCTOU-NOTE
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:141` (`resolve_within` `exists()`-then-`canonicalize()`)
- **Finding:** A benign, non-exploitable TOCTOU window exists between `exists()` and `canonicalize()`. A swap-to-symlink race is still re-validated by `canonicalize` + `starts_with`; a broken symlink (`exists()` false) falls to the safe not-yet-existing path whose parent is confirmed inside root.
- **Why it matters:** Not a defect — recorded only because the review flagged the pattern, so a future reader doesn't re-raise it.
- **Suggested action:** None (documentation-of-non-issue). Optionally a one-line code comment noting the window is re-validated.
- **Priority:** low

# m10.5-wp3-cc-terminal-clean-kill — 2026-07-19

*(feature-review-quality on the uncommitted working-tree diff, HEAD `92cb0cc`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all one-line doc/observability touch-ups. Reviewer: "well-built, unusually disciplined bug fix… No refactor is warranted." None blocks; refactor-optional. All 3 sit in `src-tauri/src/cc_session/mod.rs`.)*

## SURFACE-2026-07-19-QUALITY-WP3-REAPLEADER-SILENT-NONREAP
- **Severity:** MINOR
- **Location:** `src-tauri/src/cc_session/mod.rs:641-644` (`KillStep::ReapLeader`)
- **Finding:** `ReapLeader` discards `poll_reaped()`'s result (`let _ =`). If a process survives both `killpg(SIGKILL)` and the 300ms window (uninterruptible-sleep descendant, or a `None`-pgid path where a group child lingers holding the slave fd), `kill()` still returns `Ok` and `cc-exit-<id>` EOF may never fire — the AC-4 "wedged never-closed workspace" case — silently. The bounded wait is sound (can't hang); the concern is that a non-reap degrades invisibly. A debug-level log or distinct signal on `Ok(false)` would make the residual case observable.
- **Priority:** low
- **Pickup shape:** small — add a `log`/`eprintln` (or a distinct return) on the `ReapLeader` `Ok(false)` branch; rides any future kill-path touch.

# m10-wp4-updater-user-control-ux — 2026-07-17

*(feature-review-quality on ship commit `ee7bad7`; Mode 3 autopilot. Originally 0 CRITICAL / 1 MAJOR / 3 MINOR. **3 RESOLVED by M10 WP6 Phase 1** — the MAJOR `ERROR-STATE-UNCONSUMED` [now consumed by `UpdaterStatusRow`], MINOR `MENU-CHECK-DISCARDS-OUTCOME` [manual-check feedback via `statusNoteForOutcome`], MINOR `FALLBACK-VS-ERROR-RACE` [reconciled under the single-post-install-surface invariant] — closed 2026-07-18 at `/product-finalize`, see CHANGELOG. 1 MINOR survives below.)*

## SURFACE-2026-07-17-QUALITY-WP4-FINISH-EMIT-ZEROES-DOWNLOADED
- **Severity:** MINOR
- **Location:** `src-tauri/src/updater/commands.rs` (~L184-193, `on_download_finish` emit)
- **Finding:** the finish emit sends `downloaded: 0, total: None, done: true`, zeroing the final cumulative byte count. Harmless (`progressPercent` short-circuits on `done` → 100), but reads as a lost value to a future maintainer.
- **Why it matters:** trivial cosmetic; the `done`-pins-100 comment exists, but the `downloaded: 0` reset is mildly surprising.
- **Priority:** low
- **Pickup shape:** carry the final `downloaded` through on the finish emit (or a one-line comment). Rides any future `updater/commands.rs` touch. Dismiss via the WIP's review section.

# m9-wp6b-2-week-month-sidepanel-range (Phase 4) — 2026-07-14

*(feature-review-quality on the WP6b-2 Phase-4 working-tree change [SidePanel + click-to-select seam; uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — both auto-backlogged [low]. Reviewer: clean, well-disciplined render-surface port; no refactor warranted. Both MINORs are polish/awareness, not correctness.)*

## SURFACE-2026-07-14-QUALITY-WP6B2P4-WALLTIME-QUANTIZATION-BASIS
- **Severity:** MINOR (doc/awareness only)
- **File:** `src/components/workspace/dashboard/SidePanel.tsx` (L65 `wallTime = Math.max(0, session.end - session.start)`)
- **Finding:** `wallTime` uses the minute-quantized session endpoints, so the "active of Xh Ym wall" denominator + the mini-timeline seg span are on a MINUTE grid, while the numerator (`sumActive`) is true-`dur_ms`. For a sub-minute session this reads "0m active of 0m wall". This is FAITHFUL + internally consistent for POSITIONING (the mini-timeline positions legitimately live on the minute grid, matching the main timeline's `viewportPct`), NOT a defect.
- **Fix shape:** none needed. Recorded only so a future reader doesn't "fix" the mini-timeline to a `dur_ms` basis + break the wall-relative layout (the positions MUST stay on the minute grid to align with the main timeline). If the wall FIGURE (not the positions) ever needs sub-minute precision, sum `dur_ms` across the session's segs for the denominator label only — but leave the positioning math alone.
- **Priority:** low (awareness; likely a no-op / won't-fix).
- **Status:** pending.

# m9-wp4-segment-model-query-layer — 2026-07-08

*(feature-review-quality on ship commit `d8b308e`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all auto-backlogged, priority low. Reviewer: well-built phase — correctly re-expresses the transform against WP3's 6-kind enum, lands both carried MAJOR reclassify findings with genuine pinning tests, DTO/serde pinned both IPC sides, debt minimal + honestly tracked. The 4 MINORs are boundary edges + one drift-risk duplication + a possibly-dead contract field.)*

## SURFACE-2026-07-08-QUALITY-WP4-DAYPAYLOAD-EMPTY-NOT-ON-IPC-SURFACE
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`DayPayload.empty` ~114-127; `build_range` single-day path ~503-519)
- **Finding:** `DayPayload` carries `empty: Some(true)`, but `build_range`'s single-day path propagates only `iso`/`hour_range` (drops `empty`), and the command returns only `TimeAnalyticsResult::Range(RangePayload)` — which has no `empty` field (nor does the FE `RangePayload`). So a WP6 day-query consumer can't read the empty-day hint; it must infer emptiness from `projects.is_empty()`. Either the flag is dead on the IPC path (its test only exercises the internal `DayPayload`) or WP6 needs it surfaced on `RangePayload`.
- **Fix shape:** a deliberate WP6-facing decision — surface `empty` on `RangePayload`, OR document that WP6 infers emptiness from `projects.is_empty()` and the `DayPayload.empty` flag is internal-only. Decide while the shape is fresh.
- **Priority:** low (WP6-facing contract decision).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP4-CUSTOM-WINDOW-MIDNIGHT-EXTRA-DAY
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`resolve_window` Custom arm ~462-467)
- **Finding:** a Custom window whose `end_ms` lands exactly on a local midnight → `rows_in_window` excludes that instant (half-open `ts < end`) while `end_day = local_date_of(end_ms)` resolves to the next day, so `build_range` emits one extra all-empty trailing day. Cosmetic; untested at the boundary. *(Note: `local_date_of_ms` was renamed to the shared `local_date_of` in the WP3 tz-helper dedup.)*
- **Fix shape:** clamp `end_day` back by one when `end_ms` is exactly local-midnight, or add a boundary test documenting the artifact.
- **Priority:** low (cosmetic range-widget edge).
- **Status:** pending.

# mirror-fill-from-bottom — 2026-07-06

*(feature-review-quality on ship commit 99aca94; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, tightly-scoped fix at the shared seam; correctness verified against the vendored xterm source. One MINOR (count-drift typo) was fixed in-place; the two below are auto-backlogged. None warrant a refactor pass.)*

## SURFACE-2026-07-06-QUALITY-MIRRORTRIM-FIXTURE-REALISM
- **Severity:** MINOR
- **File:** `src/components/workspace/mirrorTrim.ts` (~32, 36-37 comments) + `src/components/workspace/__tests__/mirrorTrim.test.ts` (fixtures)
- **Finding:** The fixtures + comments use the simple `<div><span>text</span></div>` row shape, but real styled CC output produces intra-row `</span><span style='…'>` transitions (from xterm's `_nextCell` style diffs). The non-greedy `ROW_RE` handles the styled shape correctly (spans close with `</span>`; the first `</div>` still wins), so this is not a correctness gap — but the test fixtures under-represent the actual serializer output, which is a future-reader trap.
- **Fix shape:** add one styled-multi-span row fixture to `mirrorTrim.test.ts` documenting the real case; optionally soften the "spans hold text only" comment to acknowledge multi-span rows.
- **Priority:** low.
- **Status:** pending.

# cc-permission-mode-dropdown — 2026-07-02

*(feature-review-quality on ship commit 1624e2e; Mode 2 orchestrated. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, advances the codebase; wire contract + migration are the standouts. None warrant a refactor pass.)*

## SURFACE-2026-07-02-QUALITY-CCMODE-DEFAULT-ARGV-NOOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/cc_session/mod.rs` (~205, `build_cc_argv`)
- **Finding:** `Default` now emits an explicit `--permission-mode default` (vs. the old bare `["claude"]`); the "harmless no-op" claim in the doc comment is load-bearing but rests on an untested CC-CLI behavioral assumption. The argv unit test pins the mapping, not the behavioral equivalence.
- **Fix shape:** documentation-hardening — note that the equivalence is a verify-human/release check (live spawn IS verify-human-covered; it passed 2026-07-02). No code change strictly needed.
- **Priority:** low.
- **Status:** pending.

# qol-wp1-close-workspace — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9`. Reviewer rated the feature well-built and idiomatic — the standout being the per-pane `cc_kill`-on-unmount that reaps both PTY panes generically and closes a latent WP7 lifecycle gap. All findings are low-risk: two over-narrated comments + one accepted test-boundary gap. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP1-APP-WIRING-UNTESTED
- **Files:** `src/components/workspace/Filmstrip.tsx`, `src/App.tsx` (requestClose / resolveClose / dirty-probe registry)
- **Priority:** low
- **Status:** pending
- **Type:** test-coverage gap
- **Finding:** Only the pure layer (reducer, `dirtyDocCount`, `closeWorkspaceSpec`) is unit-covered. No component test for the × (stopPropagation routing, keyboard Enter/Space) and no App-level test for the probe-registry / focus-repick wiring. Accepted boundary per the project's manual-host-UI convention + the live 9/9 operator verification — but the App wiring (`requestClose` reading the `workspaces` closure, `resolveClose` clearing `pendingClose`) is the part most likely to regress silently.
- **Pickup shape:** if/when the project adopts a component-test harness (RTL) or E2E (deferred per Phase-1 convention), add a Filmstrip-×-routing test + an App close-handler test. Low value until then; dismiss if the manual-verification posture holds.

# file-op-error-surface (Deferred — net-new UX) — 2026-06-30

## SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE
- **Severity:** MINOR (deferred — net-new UX, not debt)
- **Finding:** Right-panel file operations fail silently: a failed `delete_file` (WP5), a failed folder `trash_path` (WP5b), and a create that collides with a gitignored file like `.env` (WP5, silent overwrite) are all swallowed to `console.error` with no user-visible surface. RightPanelHost has NO toast/inline-error component — the existing code comments already say "a future toast could show it" / "would be new UX — intentionally [deferred]".
- **Why deferred (operator ruling, debt-paydown sweep #2, 2026-06-30):** building the error surface is net-new UX, not a debt sweep — it needs a toast/inline-error component in RightPanelHost that does not exist. Honor the recorded "intentionally deferred" intent. The three original findings (WP5-DELETE-FAILURE-NOT-SURFACED, WP5B-TRASH-FAILURE-NOT-SURFACED, WP5-CREATE-COLLISION-GITIGNORE) collapse into this one anchor — one error-surface feature closes all three.
- **Anchor:** a future error-surface feature (whenever RightPanelHost gains a toast/inline-error affordance).
- **Status:** DEFERRED (anchored — net-new UX)

# m10.9-wp2-workflow-features-gate — 2026-07-28

*(feature-review-quality against ship commit `467593f`; Mode 3 autopilot. 0 CRITICAL / 4 MAJOR / 4 MINOR. **One MAJOR is NOT listed here — it was a live StrictMode double-write defect in `useSettingControl` and was fixed immediately rather than backlogged; see the WIP's `## Code-Quality Review`.** Reviewer: "well-built work that clears the bar the milestone set… the debt is concentrated in two places: the `?raw` idiom still doing load-bearing work despite this feature paying twice to learn it can't, and the (now-fixed) side-effect-in-updater.")*

## SURFACE-2026-07-28-QUALITY-WP2-PICKER-PREFIXED-TESTIDS-IN-SETTINGS-PANEL
- **Severity:** MAJOR
- **Location:** `src/components/settings/SettingsPanel.tsx:184,233,249,259`
- **Finding:** The three migrated controls kept their `picker-*` `data-testid`s (`picker-permission-mode`, `picker-time-tracking`, `picker-update-notifications`, `picker-check-updates`) inside a component whose entire purpose is that they are no longer in the picker.
- **Why it matters:** Knowingly permitted by the WBS ("consider renaming… only if it doesn't inflate the diff"), and keeping them is what let the three migrated wiring tests keep asserting without churn. But it leaves a durable lie in the selector namespace, and `settingsPanelWiring.test.ts` now asserts these `picker-`-prefixed ids are ABSENT from the picker — which reads as contradictory at a glance.
- **Suggested action:** mechanical rename to `settings-*` across ~8 sites (component + the 3 wiring tests + the parity guard). Do it as its own commit so the rename is reviewable in isolation.
- **Priority:** medium
- **Status:** pending

## SURFACE-2026-07-28-QUALITY-WP2-ESC-BRANCH-MISSING-RETURN
- **Severity:** MINOR
- **Location:** `src/App.tsx:268-287`
- **Finding:** The `if (e.key === "Escape") { … }` block has no `return` before the subsequent `isSettingsChord(e)` check.
- **Why it matters:** Harmless today (Escape is never `","`), but the sibling dashboard-chord branch above *does* `return`, so the asymmetry reads as an omission rather than a decision — in the very handler whose ordering bug this feature just fixed.
- **Suggested action:** add the `return`, restoring the "one keypress, one branch" shape.
- **Priority:** low
- **Status:** pending

## SURFACE-2026-07-28-QUALITY-WP2-SETTINGSPANEL-NEAR-DOING-TOO-MUCH
- **Severity:** MINOR
- **Location:** `src/components/settings/SettingsPanel.tsx`
- **Finding:** Four `useSettingControl` calls, an error surface, a `SettingsGroup` sub-component, and the JSX in one file — close to but not over the doing-too-much line.
- **Why it matters:** Readable today, but M14 extends this panel; adding controls without extracting a per-group module is the point where it tips.
- **Suggested action:** extract per-group modules when M14 starts, while the extraction is still cheap.
- **Priority:** low
- **Status:** pending

# m11-wp4-docs-live-reload — 2026-08-02

## SURFACE-2026-08-02-QUALITY-WP4-MINOR-BATCH
- **Source:** feature:review-quality (m11-wp4), 4 MINOR
- **Target level:** feature
- **Type:** tech-debt
- **Summary:** (1) **Comment density — THIRD consecutive flag** (WP2, WP3, now WP4; WP3 noted it
  had grown). Reviewer's judgment: it has crossed from stylistic to functional, since the two
  genuine gaps found at review sat inside the densest region of the file. Worst offenders named:
  `DocsPanel.tsx:208-222` (15 comment lines for one `useState(0)`, restating the P3.5 incident
  already recorded at length in the WIP) and `DocsPanel.tsx:113-151` (39 contiguous comment lines
  above a 24-line effect, containing two separate accounts of the same latch bug, one duplicating
  `fetchLatch.ts`'s own header). **Rule worth adopting: state the invariant and the forbidden
  shape at the code; cite the WIP for the narrative.** (2) A **second** per-workspace `fs-change`
  listener, where `RightPanelHost.tsx:315-317` documents the opposite pattern ("reuse the same
  single listener instead of a second one in `EditorSplit`") — defensible for a lazy chunk, but
  the deviation is unacknowledged, leaving the next consumer two conflicting precedents and no
  rule. (3) `DocsPanel.tsx` `plan.apply && el !== null` — the second conjunct is unreachable as a
  condition (exists only for `tsc` narrowing); undercuts the `isMeasurable`-as-type-predicate
  rationale documented 200 lines earlier. (4) The reload path swallows a `docs_list` failure with
  no `setError` while the initial fetch surfaces it — keeping the list is right, but the asymmetry
  makes a permanently-unreadable doc dir read as "nothing is changing", against the file's own
  "surfaced, never swallowed" convention.
- **Context:** (1) is the highest-value item and is now specific enough to act on. It is also
  self-reinforcing: the review found real defects hidden in the comment thicket.
- **Suggested action:** (1) at the next touch of `DocsPanel.tsx` — cut the incident retellings,
  keep the invariants. (2) record the rule either way in `arch.md`. (3)+(4) one-liners.
- **Priority:** low (all four)
- **Status:** pending

# wp2-background-work-status-states — 2026-08-22

## SURFACE-2026-08-22-QUALITY-CSS-REGEX-GUARD-SHAPE-BLINDNESS
- **Severity:** MINOR
- **Location:** `src/state/__tests__/workspaceStatus.test.ts` (the two CSS guards)
- **Finding:** The guards read `App.css`/`pip.css` as text and regex-match rule bodies, so they only understand the CSS shapes I happened to write: a flat `.status-dot-x { background-color: #hex; }`. They will **false-fail** on an ordinary refactor — a nested rule, a `var(--token)` custom property, or a shorthand `background:` — and the failure message will be opaque to whoever trips it (it will read as "pip.css must define a background-color", implying the colour is missing when it is merely expressed differently).
- **Why it matters:** the instrument itself is defensible and was kept for a real reason — `pip.css` holds a **deliberate verbatim copy** of the dot palette, that duplication has no other guard, and a silent main-vs-PiP colour divergence is precisely the "all three surfaces agree" invariant breaking. The predicate shape is also mutation-justified (a weaker rule-presence form was proven green-while-broken). So this is not "delete the guard" — it is that a guard whose failure mode is a **confusing false alarm** trains people to delete it.
- **Suggested action:** add one line to each guard naming the shapes it does NOT understand (nested rules, custom properties, shorthand `background:`), so a tripped guard tells its own story. Cheap; no logic change.
- **Priority:** low

## SURFACE-2026-08-22-QUALITY-DEAD-LEGACY-WORKSPACESTATUS-TYPE
- **Severity:** MINOR
- **Location:** `src/state/workspace.ts:14`
- **Finding:** A legacy `WorkspaceStatus = "idle" | "running" | "awaiting-input" | "unknown"` type still sits alongside the live `WireWorkspaceState`, differing in **casing** (hyphenated `awaiting-input` vs snake_case `awaiting_input`). It was not extended with `background_work` — correctly, because it appears unused for status rendering (only a literal `status: "idle"` at line 119).
- **Why it matters:** not a bug today, but two near-identical state vocabularies differing only in casing is a standing trap for the next person adding a state — they may extend the wrong one and see nothing break. ⚠️ Note this WP already demonstrated the cost of a sweep keyed on the wrong predicate (the CRITICAL), and this is the same hazard one layer over.
- **Suggested action:** confirm it is genuinely dead, then delete it. If something does depend on it, the fix is to migrate that consumer to `WireWorkspaceState` rather than to maintain two vocabularies.
- **Priority:** low

# m14-wp2-sign-notarize-delete-quarantine — 2026-09-18

## SURFACE-2026-09-18-QUALITY-REVERSE-GUARD-HAS-NO-POSITIVE-ANCHOR
- **Source:** feature:review-quality (M14 WP2)
- **Type:** tech-debt
- **Summary:** `updaterWiring.test.ts`'s new "no longer wires the deleted WP1-fallback quarantine
  dialog" test is a pure reverse guard (`expect(appTsx).not.toContain(...)` ×3). It would pass if
  `App.tsx` were emptied entirely.
- **Context:** Defensible **as currently placed** — it sits in a file whose other tests assert
  positive content from the same `appTsx` source, so an emptied `App.tsx` would fail those. The risk
  is purely future: if this guard is ever moved into its own file, or the surrounding positive
  assertions are removed, it silently becomes vacuous. Same failure family as
  `[[raw-guard-identifier-satisfied-by-own-comments]]`.
- **Suggested action:** If the guard is ever isolated, pair it with a positive anchor in the same
  test (e.g. assert `updateConfirmSpec` IS present) so an empty/failed read cannot pass.
- **Priority:** low
- **Status:** pending

# m14-wp4-two-tier-setup-docs — 2026-09-18

## SURFACE-2026-09-18-QUALITY-UNANCHORED-CHORD-LABEL-MATCH
- **Severity:** MINOR
- **Location:** `src/components/settings/__tests__/readmeTierOneHonesty.test.ts` — the leak/omission filters using `w.includes(e.label)`
- **Finding:** Chord-label detection is substring-based and unanchored (`⌘P`, `⌘T`, `⌘N`). Harmless today because the only gated label is `⌘⇧K`, but if a future milestone gates `⌘P`, the tier-2 completeness test could be satisfied by an incidental `⌘P` in adjacent prose.
- **Why it matters:** The slash-command test in the SAME file already does this correctly with a backtick-anchored match (`` `(/[a-z][a-z-]*)` ``). The inconsistency is the tell — one half of the file is rigorous about anchoring and the other is not.
- **Suggested fix:** Anchor the label match the same way (backticks or a word boundary appropriate to the glyph set).
- **Priority:** low
- **Status:** pending

## SURFACE-2026-09-18-QUALITY-GUARD-FILE-IN-UNRELATED-DIRECTORY
- **Severity:** MINOR
- **Location:** `src/components/settings/__tests__/readmeTierOneHonesty.test.ts`
- **Finding:** The file lives under `src/components/settings/__tests__/` but its subject is `README.md` plus the workspace registries — it imports nothing from `settings/`.
- **Why it matters:** Discoverability for the person who trips it. `src/state/__tests__/` (beside the OFF-invariant guard it repeatedly cites and mirrors) would be the natural home.
- **Suggested fix:** Move to `src/state/__tests__/` and update the relative imports. ⚠️ Low value on its own; ride it on the next touch of this file rather than a standalone move commit.
- **Priority:** low
- **Status:** pending
