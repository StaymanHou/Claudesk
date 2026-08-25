# Feature: Turn-output reorientation — find where the last turn began

**Workflow:** feature
**State:** ✅ **COMPLETED 2026-08-25.** Shipped `2086ae8`; code-quality findings backlogged
`27772ce`; closed at finalize. Final gate: `pnpm verify:auto` exit **0**, Rust **879**, frontend
**2230**, `tsc` **0 errors**, boot smoke-test APP MOUNTS. ⚠️ **Partially resolves**
`SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` — 1 of its 4 directions; the answer-burial half is
still open and that entry was **rewritten, not deleted**. ⚠️ **The spec sections + `## Work Tree`
below are CURRENT**; the Phase 1/2/3 build+verify history further down predates both probes, and
`## MECHANISM REFUTED` is **retracted — do not cite it**.
**Created:** 2026-08-22
**Entry:** spec (complex feature — WP3's gate 3.1 mandates a design pass, not `/feature-plan`)
**Source:** `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION`; M13.5 WBS → WP3
**Drive mode:** autopilot

## Problem Statement

With heavy cross-workspace switching, a single CC turn can run 10+ minutes and 100+ lines. Finding
**where the last turn's output began** means hand-scrolling an 8000-line buffer — acutely in the
common case where the operator layers a question on top of a workflow instruction, so the answer and
the workflow output interleave and there is no visual seam to aim for.

⚠️ **This is a RE-SPEC (task 3.2), not a resume.** Two probes preceded it, and both change the
problem:

1. **Task 3.1** proved the mechanism. `registerMarker` + `scrollToLine` work on Claudesk's CC pane;
   the "alternate buffer" refutation that escalated this WP was false. → `## Research — WP3 task 3.1`
2. **The signal-trace probe** found why the shipped affordance still did nothing: the signal path is
   whole, and the defect is **viewport arithmetic in `nextJump`**. → `## Research — WP3 signal-trace`

**The defect, stated once:** `nextJump` returns `moved: true` when it *selects* a marker, not when
the **viewport actually moves**. Since the newest turn's start is within `rows` of the buffer end, it
is already on screen, so `scrollToLine` clamps to where the viewport already is — click 1 does
nothing and the walk advances past it, click 2 overshoots to a much older turn, click 3 exhausts and
dims the button. Measured: `markers [19, 137]`, `length 198`, `rows 68`, `maxScroll 130`.

**And the affordance itself is wrong.** Operator, at re-admission: *"Current UI/UX is bad. there
should be a move up 1 turn and move down 1 turn. Just like in the 'find' feature. Otherwise it's
gonna be difficult to navigate back and forth."* A single backward-only button that dead-ends cannot
support the actual task, which is **scanning** — stepping back through turns and forward again to
re-locate a spot.

## User Stories

- As the operator, I want to **step back one turn at a time** so I can find where a long turn's
  output began without hand-scrolling.
- As the operator, I want to **step forward one turn at a time** so I can return to where I was after
  overshooting — without scrolling to the bottom and starting over.
- As the operator, I want the controls to **tell me where I am** (which turn, out of how many) so
  stepping is oriented rather than blind.
- As the operator, I want the controls to be **honest when there is nowhere to go** — disabled at the
  ends, not dimmed-and-lying after a dead click.

## Acceptance Criteria

**AC-1 — Position-based navigation, not viewport-based.** Navigation tracks a **current turn index**
into the recorded turn-start list. `prev` moves one turn earlier; `next` one turn later. ⚠️ **The
already-visible case is NOT special-cased** — a turn whose start is on screen is still a valid
position, and moving to it still counts as a move. (Operator decision, 2026-08-25; the alternative
"nearest start outside the viewport" was rejected as non-symmetric — you could not always get back.)

**AC-2 — Each move scrolls that turn's start to the TOP of the viewport** where the buffer allows,
rather than calling bare `scrollToLine` and accepting its clamp. Near the buffer end the scroll
clamps (unavoidable — there is nothing below to scroll up into), but the **position still advances**,
so the controls never stall. ⚠️ This is the fix for the shipped defect: `moved` must stop conflating
target-selection with viewport movement, and position must stop depending on whether the viewport
could move.

**AC-3 — Both directions are affordances of the same kind.** A `prev` control and a `next` control,
adjacent, same visual weight — per `[PRIOR: paired-actions-need-paired-affordances]`. Neither is
prose, a keyboard-only path, or a hidden trigger.

**AC-4 — Ends are disabled, not inert-after-failure.** At the oldest turn `prev` is `disabled`; at
the newest `next` is `disabled`; with zero recorded turns **both** are `disabled`. ⚠️ **The
`jumpInert` "click it and find out" state is DELETED** — it existed to explain a dead click, and a
correct disabled state makes a dead click impossible. (It also shipped a UI that lied — see the F12
back-loop notes.)

**AC-5 — Position is legible.** The controls show the current position (e.g. `3/7`) so the operator
knows where they are and how much is left in each direction. Exact form is a build-time detail; that
it is *visible* is the criterion. Per `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — state
the user acts on should be readable, not inferred.

**AC-6 — A new turn arriving resets position to the newest.** The operator's next prompt means they
are back at "now", so a `turn-recorded` event snaps position to the newest turn and re-enables both
controls per AC-4. (This is the F12 back-loop's fix generalized: the *edge* is what was missing.)

**AC-7 — Eviction is handled without a stale position.** When xterm disposes markers whose lines left
the scrollback, the surviving list is compacted and the position is re-clamped into range. A position
pointing at a disposed marker must never be scrolled to.

**AC-8 — The pure model owns the decision and is unit-testable.** The prev/next/reset/clamp logic
lives in `turnMarkers.ts` as pure functions taking the marker list, current position, and the
**viewport geometry** (`length`, `rows`) — the geometry the current model lacks entirely, which is
why the defect was invisible to 38 green tests. ⚠️ Per `arch.md`: extracting the model proves the
MACHINE, not its CALLER — so the caller contract gets its own coverage, and **both directions** are
tested (the F12 lesson: a two-way flag tested in one direction has an untested half).

**AC-9 — Only the CC pane.** The controls appear for the CC pane and never for the right-panel login
shell, which has no turns. (`markTurnStarts` already gates this; the controls follow the same gate.)

**AC-10 — Ungated.** The controls are **not** behind `workflow_features_enabled` — reorientation in a
terminal is core lite-IDE function, not workflow orchestration. They must therefore not live in the
wholesale-gated skill-button row; `workspace-split-control` is the established ungated neighbour.

## Out of Scope

- **CC-managed-scroll profiles.** A CC config where CC owns its own scroll region (draws its own
  "Jump to bottom", keeps history outside xterm's scrollback) is **explicitly out of scope** —
  operator decision, 2026-08-25. Claudesk's pane is append-only with real scrollback; that is the
  substrate. ⚠️ **Do not cite "CC repaints in place" as a constraint on this WP** — it describes a
  profile Claudesk does not use.
- **The overview-ruler gutter tick.** Two xterm options must both be set and the ruler still painted
  0 pixels in the 3.1 probe (likely canvas-vs-DOM-renderer). Buttons need no tick; the question stays
  open and moot. ⚠️ Do **not** re-add `registerDecoration` — it throws without `allowProposedApi` and
  the throw is silent inside a listener.
- **A separate turn-list surface / panel.** Per `[PRIOR: new-surface-must-earn-its-place-against-
  existing-ones]`: the buffer is navigable and the terminal already shows this output, so a second
  read-only surface would be a strict subset. Two controls over the existing pane is the whole shape.
- **Keyboard shortcuts.** Not in this pass. ⚠️ `⌘⇧`+digit is reserved for filmstrip switching
  (`[[cmd-shift-digit-reserved-for-filmstrip]]`); any binding needs its own decision.
- **Jumping to a turn's END, or to a specific tool call.** Turn *starts* only.
- **Re-tuning `scrollback: 10000`.** Its "premise invalidated" marking is void (the pane does
  accumulate scrollback) so the original rationale stands on its merits. Leave it; re-decide as a real
  memory-vs-reach tradeoff if it ever bites.

## Technical Constraints

- **Substrate is proven, not assumed.** `buffer.active.type === "normal"`, real scrollback
  (`baseY` 130 on a live pane), `registerMarker` + all four scroll APIs verified by running them.
- **The signal is proven.** Backend `is_turn_start` + `event_is_turn_start`, with an end-to-end socket
  test pinning exactly one turn-start per multi-tool turn and the wire key. `shouldRecordTurnStart`'s
  three guards verified live. **No backend change is expected** for this WP.
- **`maxScroll = buffer.length − rows`** is the clamp ceiling. Any marker at a line above it cannot be
  reached by `scrollToLine`; the model must know this rather than discovering it as a failed scroll.
- **Scroll-to-top needs a scroll primitive, not just `scrollToLine`.** `scrollToLine(n)` puts line `n`
  at the viewport top *when possible* — near the end it clamps. AC-2's "where the buffer allows" is
  therefore satisfied by `scrollToLine` plus honest position handling, not by a new API.
- **Host element:** `workspace-split-control` (ungated terminal chrome, `Workspace.tsx:620`,
  `App.css:653`). The existing `.workspace-jump-turn-btn` styles (`App.css:690`) are the starting
  point; `.is-inert` goes away with AC-4.
- **No new dependency.** Everything needed is in `@xterm/xterm` already.
- **Vitest can drive the model but not xterm.** The pure functions are fully testable offline; the
  caller contract needs the live-pane tier (`docs/lessons/verify-self-tiers.md`). ⚠️ The MCP bridge is
  `#[cfg(debug_assertions)]` — **prod cannot be probed**; verify on the dev build.
- **No 3rd-party service.** Step-2 probe check: not applicable.

## Open Questions

- [ ] None blocking. The one open spec question (already-visible semantics) was resolved to
      position-based by operator decision, 2026-08-25.
- [ ] *(Non-blocking, build-time)* Exact position readout form (`3/7` vs `turn 3 of 7` vs icon+count)
      — AC-5 requires only that it be visible.

## Asked

**Q (2026-08-25): With prev/next navigation, what should "previous turn" target when that turn's
start is already visible on screen?** — Recommended position-based.
**A: Position-based.** Nav tracks a current turn index; prev/next always move one turn in list order
regardless of what is on screen; each move scrolls that start to the viewport top when the buffer
allows. The already-visible case stops being special. *(Viewport-based — "nearest start outside the
viewport" — was rejected as non-symmetric: repeated prev/next could not always return you. The
no-scroll-to-top variant was rejected because it preserves the original complaint near the buffer
end.)*

**Q (2026-08-25): WP3 is escalated out of M13.5 — re-specing reverses that. Which scope?**
**A: Re-admit into M13.5.** Bucket closes at five WPs (WP1+WP2+WP3+WP4+WP5). Recorded in `wbs.md`.

## Assumed

Defaults taken **without** asking — each cheap to reverse at a verify gate:

- **Controls sit in `workspace-split-control`**, not a new chrome row. It is the established ungated
  neighbour and the 3.1 write-up already identified it. Reversible: one JSX move.
- **Two buttons, not a segmented control or a spinner.** Matches the find-widget model the operator
  named. Reversible: presentation only.
- **Icons + position text**, no text labels ("Previous turn"/"Next turn") — terminal chrome is
  space-constrained and the neighbouring controls are iconic. Tooltips carry the full label.
- **`prev` is up / older, `next` is down / newer.** Follows scroll direction and the find-widget
  convention. Reversible: swap two handlers.
- **Position resets to newest on a new turn** rather than holding the operator's place (AC-6). A new
  prompt means they are back at "now". Reversible, and it is the F12 fix generalized.
- **No persistence across workspace switches or app restart.** Position is ephemeral view state.
- **Zero turns → both disabled, no explanatory copy.** Two disabled controls are self-explanatory in
  terminal chrome; the old inert state's "No earlier turn start…" title text is not replaced.
- **`reachableTurnStarts()` stays** as the count source for AC-5.
- **No change to `scrollback: 10000`**, to the backend, or to the hook registration.
- **The overview-ruler question stays open**, unpursued (Out of Scope).

**Design priors consulted** (`design-priors.md`):
- `[PRIOR: paired-actions-need-paired-affordances]` — **agrees with the operator's ask** (rule 2,
  higher confidence). prev/next are inverses, so both get a button of the same kind. This prior's own
  boundary note is the relevant one: an *inverse* is a counterpart, not a duplicate.
- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` — fires on the "separate turn-list
  panel" option and **cuts it** (Out of Scope). The buffer is navigable; a second surface would be a
  strict subset. Its boundary note correctly does **not** license cutting `next` as redundant.
- `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — supports AC-5's visible position readout
  over a position the operator must infer from scroll offset.
- No prior governs the icon/label or button-order choices (over-infer guard) — filled from common
  sense and listed above.

**No design prior proposed for capture.** The operator's bidirectional ask is a *scope addition* with
its stated why ("difficult to navigate back and forth") already covered by the existing
`paired-actions-need-paired-affordances` prior — per the capture discriminant, a scope-add whose
principle is already recorded is not a new prior. Flag if you read it as one.

## Discoveries

[SURFACED-2026-08-25] Phase 1 verify-self — ⚠️ **An Observable outcome asserted a green gate that
this phase's own plan says it breaks** (`tsc --noEmit` exits 0, alongside a rationale reading
"removal is a compile error at every call site"). Corrected in the Work Tree to an expected-failure
SHAPE assertion; filed as
`SURFACE-2026-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS` (medium). ⚠️ The
trap generalizes: for a phase that intentionally breaks consumers a later phase fixes, a whole-gate
green is both unsatisfiable AND a false-green risk — it would pass while proving nothing about the
deletion.

<!-- Format: [SURFACED-<date>] <target node> — <summary> -->

[SURFACED-2026-08-25] feature-plan — `wbs.md` exceeds size guard (491 lines). Read was SKIPPED per
the conversation-context rule (loaded by `feature-spec` earlier in this same session), so the guard
did not bite here — but it will on a fresh session. Consider summarizing.

[SURFACED-2026-08-25] feature-plan — ⚠️ **This WIP file was CORRUPTED and rebuilt during the
re-spec.** A `cat head + spec + tail` assembly used a `tail` that already contained a full copy, so
the file doubled to 2331 lines, and a subsequent `python` string-replace then matched inside the
FIRST copy and spliced spec prose into it. Rebuilt from `git show 6cc3c0e:<path>` + the new spec;
every `##` heading verified to appear exactly once and a token-set diff confirmed the only dropped
identifiers were the deliberately-superseded decoration/ruler ones (⚠️ 92 → 89, the 3 lost being
those same warnings). ⚠️ **The transferable lesson: when splicing a large doc, verify heading
UNIQUENESS after assembly, and anchor string-replaces on text that is unique in the whole file.** A
duplicated section is invisible to a `grep` that finds its first hit — the same class as
`[[grep-addressed-doc-loses-value-to-prose-rewrite]]`.


<!-- Format: [SURFACED-<date>] <target node> — <summary> -->

- `[SURFACED-2026-08-22]` feature-spec — `wbs.md` exceeds the 300-line size guard (392 lines). Not
  truncated in practice: WP3's own section was already in context from the session restore, and the
  file is the active cycle's WBS.
- `[SURFACED-2026-08-22]` backlog — the backlog entry's **required first step** ("scan session logs
  for concrete real examples") is **discharged** by the measurement table + 5 anchors in the Problem
  Statement above. 114 qualifying instances found across 232 transcripts. The entry can be updated
  or resolved on this WP's close.
- `[SURFACED-2026-08-22]` feature-spec → AC-4 — **`WorkspaceStatusUpdate` carries no event
  discriminator, and `UserPromptSubmit` + `PostToolUse` both map to `Running`** (`mod.rs:194–212`).
  Any consumer needing "a turn started" (as opposed to "CC is running") cannot express it against
  the current DTO. Caught during spec by checking the DTO rather than assuming, after
  `[[derived-state-is-not-a-proxy-for-its-event]]` flagged the class. Resolved *within* this WP by an
  additive field; noted here because the **general** gap outlives this feature — the next per-event
  consumer will hit it too, and the second one should not have to rediscover it.
- `[SURFACED-2026-08-22]` feature-plan → P3.1 — ⚠️ **The skill-button row is GATED as a whole**
  (`Workspace.tsx:528` `showSkillButtons({workflowEnabled, …})`), so the jump affordance **cannot**
  live there — this feature is ungated per AC-7. Placing it in that row would silently make it
  disappear whenever the workflow gate is off. The ungated sibling cluster is
  `workspace-split-control` (`Workspace.tsx:577`, the ◀ CC / ratio / ED ▶ group). Caught by reading
  the render site rather than assuming the row was generic chrome.
- `[SURFACED-2026-08-22]` feature-plan → P1.1 — ⚠️ **`XtermPane` is SHARED by the CC pane and the
  login-shell terminal.** `TerminalPane.tsx:50` passes `spawnCommand="term_spawn"`; a shell has no
  turns. Turn-marking must therefore be **opt-in per instance**, not unconditional in `XtermPane`,
  or every second-terminal panel grows a meaningless affordance.
- `[SURFACED-2026-08-22]` feature-verify-human → process — ⚠️ **I ran `git checkout -- <file>` on a
  file with uncommitted work and reverted all of Phase 1's backend changes.** That is the exact action
  `arch.md` lists under "never do these" ("an agent did this and reverted uncommitted shipped work"),
  so the prohibition is now a two-time failure, not a one-off. Context: I was cleaning up a scratch
  test module that failed to compile, and reached for `checkout` instead of removing just the appended
  block. **Fully recovered** — the four edits were re-applied from conversation context, and the
  restoration was proven equivalent, not assumed: 6/6 named tests pass, `verify:auto` exit 0, Rust
  **876** / frontend **2141** (unchanged), zero non-comment deletions, `event_to_state` byte-identical.
  **The transferable lesson:** to undo an *appended* block, delete the block (or use a snapshot `cp`);
  `git checkout --` cannot distinguish it from work you want to keep. A scratch harness should also
  never be appended to committed source — it needed private test helpers it could not reach anyway.
- `[RESOLVED-2026-08-22]` Phase 2 verify-self → **closed in Phase 2 verify-codify**, not carried to Phase 3 — ~~**`turnMarkers.ts`'s purity is unenforced.**~~
  Proven from source today (zero imports, zero DOM identifiers after comment-stripping), but **no
  automated guard** would fail if a future edit introduced `document`/`window`/geometry access into
  the module. That matters more than usual here: the whole reason the module exists is that DOM/jsdom
  geometry reads are untrustworthy in this codebase (`arch.md` — jsdom reports `clientHeight === 0`
  for visible elements; WebKit's own `scrollTop` retention vacated two live proofs), so a later DOM
  read would quietly re-introduce the exact hazard the extraction was meant to remove. **Suggested
  action:** add a `?raw` source-text guard in Phase 3 asserting the module contains no DOM
  identifiers — and ⚠️ **strip comments first**, since the header prose deliberately names
  `clientHeight`/`scrollTop`/`xterm` while explaining why they are avoided (the
  `[[raw-guard-identifier-satisfied-by-own-comments]]` trap, in its inverted form: here the comments
  would cause a FALSE POSITIVE rather than a false pass). Raised by the verify-self subagent, not by
  the gate.
  **→ RESOLVED in Phase 2 verify-codify** by `__tests__/turnMarkersPurity.test.ts` (4 tests), which
  strips comments exactly as warned. **The inversion was confirmed by mutation**: disabling the strip
  fails 2 of the 4 tests on the header prose alone, so the strip is load-bearing rather than
  precautionary. Nothing carried to Phase 3.
- `[SURFACED-2026-08-22]` workflow-system (cross-cutting) — ⚠️ **`feature-verify-human`'s auto-skip
  gate (a) can never fire in this repo: it reads `drive_mode` from **YAML frontmatter**, and Claudesk's
  WIP files carry the mode as a **body line** (`**Drive mode:** autopilot`) with no frontmatter at all.
  The rule's absent-field branch says *"treat as Mode 2 and do NOT auto-skip"*, so **every** boundary-free
  phase falls through to a confirmation prompt that autopilot was meant to elide — a permanent
  papercut, not a one-off. **Two candidate fixes, one decision:** (1) give WIP files real YAML
  frontmatter with `drive_mode:` (matches what the skill and `/session-restore` both already expect —
  `session-restore` step 4 reads `drive_mode` from `state_file` frontmatter as its fallback, so the
  field is *already* specified to live there); or (2) relax gate (a) to accept the body-line form.
  ⚠️ **Option 1 is the better-evidenced one** — two skills independently expect frontmatter, so the
  WIP format is what is out of spec, not the gate. Not fixed here: it is a workflow-system change, out
  of this WP's scope, and silently auto-skipping to route around it would be the wrong resolution.
- `[SURFACED-2026-08-24]` ⚠️ **OPERATOR-DIRECTED NEXT ACTION, unrelated to this WP** —
  `SURFACE-2026-08-24-WORKSPACE-CLOSE-HANGS-AFTER-SUBAGENT-ARROW-TOGGLE` (**high**). The operator
  reproduced a **workspace-close hang** previously closed as could-not-reproduce, and believes the
  missing trigger is a multi-agent session **entered and backed out of** (← then → without ever
  starting the second agent), then closing the workspace after the main agent finishes.
  **Recorded mid-WP3 and deliberately NOT started**, at the operator's instruction: visit it
  **immediately after this WP closes**, ahead of M13.5 WP4. Full recipe + the two adjacent seams to
  check first are in `backlog.md`.
- `[SURFACED-2026-08-22]` mccc (cross-repo) — backlog solution direction 4 (orchestrator should not
  bury an inline answer behind continued task output) is a **workflow-system** concern, not
  Claudesk's, per the M15 ownership boundary (mccc owns intra-turn semantics). Candidate for the
  handoff already owed to mccc. Not in this WP.

## Work Tree

⚠️ **THIS IS THE RE-PLAN (task 3.3, 2026-08-25) — it SUPERSEDES the Phase 1/2/3 tree that used to
live here.** That tree built a single backward-only jump button against a model with no viewport
geometry; its build+verify notes survive below as history. **Do not resume it.** ⚠️ This is a
**modification of shipped, committed code** (`turnMarkers.ts` + 38 tests, backend `is_turn_start`,
the `XtermPane` listener/handle), not a greenfield build — every phase below edits existing files.

- [x] Phase 1: Position-based model with viewport geometry  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/__tests__/turnMarkers.test.ts` exits 0 and the
    suite asserts the position model directly — `stepTurn` moves ±1 in list order, clamps at both
    ends, and `scrollTargetFor` returns a line that accounts for `maxScroll = length - rows`.
  - CLI: a test replays the SHIPPED DEFECT and FAILS against the old semantics — markers
    `[19, 137]`, `length 198`, `rows 68`: stepping to the newest turn must report position 2/2 and a
    clamped scroll target of `130`, NOT "moved with no viewport change and the walk advanced past it".
  - CLI: ~~`./node_modules/.bin/tsc --noEmit` exits 0~~ — ⚠️ **CORRECTED at verify-self 2026-08-25:
    this outcome was UNSATISFIABLE AS WRITTEN.** Its two halves contradict each other — the phase
    deliberately deletes exports two consumers still use (P1.7), so a green `tsc` is impossible
    until Phase 3. ⚠️ It was also a false-green risk the other way: had the callers happened to
    still compile, "exits 0" would have passed while proving nothing about the deletion. **The
    honest outcome for a deliberate-breakage phase is an expected-failure SHAPE:**
    `./node_modules/.bin/tsc --noEmit` reports errors in **exactly two files**
    (`XtermPane.tsx`, `Workspace.tsx`), **all** of kind `TS2305`/`TS2724` (missing export), and
    **every** named symbol is one P1.7 deleted (`nextJump`, `resetWalk`, `initialWalkState`,
    `inertAfter`, `TurnWalkState`). An error in a third file, or any other error kind in those two,
    is a genuine finding. Filed as
    `SURFACE-2026-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS`.
  - [x] P1.1 Add viewport geometry to the model: a `TurnViewport {length, rows}` input and a
        `maxScroll(viewport)` helper. ⚠️ The model currently has NO geometry at all — that absence is
        why 38 green tests could not see the defect.  <!-- status: NOT-STARTED -->
  - [x] P1.2 Replace `TurnWalkState {cursor}` with `TurnPosition {index: number | null}` — an index
        into the live list, **oldest-first** (`0` = oldest), `null` = "at newest / not navigating".
        ⚠️ Deliberately the OPPOSITE indexing from the old cursor (which counted from the newest);
        oldest-first makes `prev`/`next` read as `-1`/`+1` instead of one of them being inverted.  <!-- status: NOT-STARTED -->
  - [x] P1.3 Add `stepTurn(markers, position, direction)` → `{position, nav}` (as built: it
        returns the nav state too, so a caller needs no second call). Pure
        position arithmetic, **no** viewport input: per AC-1 the already-visible case is NOT special,
        so geometry must not influence which turn is selected.  <!-- status: NOT-STARTED -->
  - [x] P1.4 Add `scrollTargetFor(markers, position, viewport)` → `{line} | null`. Clamps to
        `maxScroll` so the caller never discovers the clamp as a failed scroll (AC-2).  <!-- status: NOT-STARTED -->
  - [x] P1.5 Add `navState(markers, position)` → `{canPrev, canNext, ordinal, total}` — the single
        source for AC-4's disabled ends and AC-5's readout, so the two can never disagree.  <!-- status: NOT-STARTED -->
  - [x] P1.6 Add `clampPosition(markers, position)` for AC-7 (eviction re-clamp), and
        `positionAtNewest()` for AC-6's reset edge.  <!-- status: NOT-STARTED -->
  - [x] P1.7 DELETE `nextJump`, `TurnWalkState`, `initialWalkState`, `resetWalk`, `JumpOutcome`,
        `NoJumpReason`, `inertAfter`, `JumpInertEvent`. ⚠️ **Delete, do not deprecate** — a surviving
        `nextJump` is a second live path with the old semantics. `tsc` is the guard that every caller
        moved.  <!-- status: NOT-STARTED -->
  - [x] P1.8 Rewrite `turnMarkers.test.ts` for the new surface, keeping the eviction/`isLiveMarker`/
        `compact` coverage that is still correct. ⚠️ **Mutation-prove each new guard INDIVIDUALLY**
        and confirm each mutant lands in EXECUTABLE code (`docs/lessons/source-text-guards.md`) —
        and test **both** directions of every two-way thing (the F12 lesson: a two-way flag tested
        one way has an untested half).  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: done; 2 PASS, 1 FAILED-cosmetic (the outcome's own wording) -->
  - [x] verify-human  <!-- status: done; operator APPROVED 2026-08-25 -->
    - [x] P1.verify-human.1 Accept the corrected Observable outcome (the `tsc exits 0` contradiction)  <!-- status: done -->
    - [x] P1.verify-human.2 Accept phase-by-phase build (tree sits non-compiling until Phase 3)  <!-- status: done -->
  - [x] verify-codify  <!-- status: done; 1 real coverage hole found + closed -->

- [x] Phase 2: Caller — XtermPane exposes bidirectional navigation  <!-- status: done; its verify nodes CLOSED BY COMBINATION with Phase 3 -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/workspace/__tests__/` exits 0 with a caller-contract test
    proving the handle funnels BOTH directions through the shared position ref — per `arch.md`, a
    shared-state write must go through ONE function and the guard must sit on THAT function.
  - Browser (live pane, dev build via MCP bridge): after ≥2 real CC turns, the handle reports
    `total` ≥ 2 with distinct marker lines, `stepTurn(-1)` lowers `viewportY`, and `stepTurn(+1)`
    raises it back to the same value it started from — **round-trip symmetry**, which is the property
    the rejected viewport-based design could not provide.
  - Console: no JS errors across a full turn plus 4 navigation steps.
  - [x] P2.1 Replace the `turnWalkRef` walk state with a position ref; route every write through one
        setter so eviction re-clamp (AC-7) and the newest-reset (AC-6) cannot diverge.  <!-- status: NOT-STARTED -->
  - [x] P2.2 Replace `jumpToPreviousTurn(): boolean` on the handle with `stepTurn(direction): boolean`
        plus `turnNavState(): {canPrev, canNext, ordinal, total}`. Reads `term.buffer.active.length`
        and `term.rows` at call time and passes them as the viewport — geometry is an injected VALUE,
        never read off a DOM element (the module header's own rule).  <!-- status: NOT-STARTED -->
  - [x] P2.3 Keep the existing `onTurnStartRecorded` edge, but have it reset position to newest AND
        push fresh nav state to the parent so AC-4/AC-6 hold without the parent polling.  <!-- status: NOT-STARTED -->
  - [x] P2.4 Delete the `registerDecoration` remnants and the `.is-inert` code path. ⚠️ Do **not**
        re-add a decoration — it throws without `allowProposedApi` and the throw is SILENT inside a
        listener (3.1 probe).  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done -->
  - [x] verify-self  <!-- status: CLOSED BY COMBINATION — re-proven in Phase 3's combined gate; original readings VOIDED 2026-08-25 — its live-pane readings came from a webview holding a PRE-DELETION bundle; the app could not boot. Re-verified jointly with Phase 3. -->
  - [x] verify-human  <!-- status: CLOSED BY COMBINATION — folded into Phase 3's gate, operator-approved 2026-08-25; SUPERSEDED — folded into Phase 3's gate; P2's surface is only observable WITH the Phase 3 controls -->
  - [x] verify-codify  <!-- status: CLOSED BY COMBINATION — Phase 3's codify covers the Workspace+pane surface jointly -->

- [x] Phase 3: The prev/next control pair  <!-- status: done; built OUT OF ORDER 2026-08-25 to unblock a runtime-broken app -->
  **Observable outcomes:**
  - Browser (live pane): `[data-testid="workspace-turn-prev"]` and `[data-testid="workspace-turn-next"]`
    both exist, sit adjacent in the ungated terminal chrome, and are BOTH `disabled` on a fresh pane
    with zero turns.
  - Browser: after 3 real turns, clicking prev 3× lands on the oldest and leaves prev `disabled` with
    next `enabled`; clicking next 3× returns to the newest with next `disabled` and prev `enabled` —
    and the readout reads `1/3` → `3/3` across that sequence.
  - Browser: the controls are present with `workflow_features_enabled` OFF (AC-10) — the OFF-invariant
    guard must NOT gain an arm for them, and a test asserts they are absent from the gated row.
  - Console: no JS errors; no React duplicate-`ref` or controlled/uncontrolled warnings.
  - [x] P3.1 Replace the single `workspace-jump-turn` button with the prev/next pair, INSIDE
        `workspace-split-control` (the shipped button sat beside it, not in it) so the cluster reads
        as one ungated group.  <!-- status: NOT-STARTED -->
  - [x] P3.2 Delete `jumpInert` state and the `.is-inert` CSS; drive `disabled` from `turnNavState()`
        (AC-4). ⚠️ The inert state existed to explain a dead click; a correct `disabled` makes a dead
        click impossible, so keeping both would be two mechanisms for one job.  <!-- status: NOT-STARTED -->
  - [x] P3.3 Add the position readout (AC-5) — `ordinal/total`, hidden when `total === 0`.  <!-- status: done -->
  - [x] P3.4 `aria-label` + `title` on both controls; the readout gets `aria-live="polite"` so a
        step is announced.  <!-- status: NOT-STARTED -->
  - [x] P3.5 CSS in `App.css` beside the existing split-control rules; drop `.workspace-jump-turn-btn`
        and `.is-inert`. ⚠️ Read CSS source-guards via `node:fs`, NOT a Vitest `?raw` import
        (`[[vitest-raw-import-css-returns-processed-not-text]]`).  <!-- status: NOT-STARTED -->
  - [x] verify-auto  <!-- status: done; COMBINED gate, pnpm verify:auto exit 0 -->
  - [x] verify-self  <!-- status: done; COMBINED — Phase 2 + Phase 3 outcomes proven on a bootable app -->
  - [x] verify-human  <!-- status: done; operator APPROVED 2026-08-25 (all 4 leaves) -->
    - [x] P3.verify-human.1 prev/next walk + readout + disabled ends, live  <!-- status: done -->
    - [x] P3.verify-human.2 fresh workspace: both disabled, no 0/0 readout  <!-- status: done -->
    - [x] P3.verify-human.3 the affordance (↑ 3/3 ↓ in the split-control cluster) is right  <!-- status: done -->
    - [x] P3.verify-human.4 prev = older, ↑ = earlier, follows scroll direction  <!-- status: done -->
  - [x] verify-codify  <!-- status: done; COMBINED — 1 real gap found + closed (10 tests) -->

## Current Node
- **Path:** ✅ **CLOSED** — feature complete, archived 2026-08-25.
- **Active scope:** none.
- **Blocked:** none
- **Unvisited:** none in this feature. Next in M13.5: **WP4** (drive-mode readout on the workspace
  surface), then **WP5** (bucket exit verify).
- **Open work this feature leaves behind (all backlogged, none blocking):** 6 code-quality findings
  (3 MAJOR + 3 MINOR, `backlog-quality-findings.md` → `# turn-output-reorientation — 2026-08-25`);
  the rewritten `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` (3 of 4 directions still open, plus
  its never-done transcript-grounding first step); and 3 process SURFACEs filed by this WP's probes,
  **all three of which are workflow-system changes** belonging in the owed cross-repo handoff to
  mccc — including the **high** one,
  `SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC`.
- **⚠️ Reading order for this archived file:** the spec sections + `## Work Tree` above are the
  as-built record. The Phase 1/2/3 build+verify notes below predate both probes;
  `## MECHANISM REFUTED` is **retracted in place** and must not be cited. The two `## Research`
  sections at the bottom are the authority on substrate behaviour. `## Retrospect` and
  `## Code-Quality Review` are the closure record.

### Phasing rationale (re-plan, 2026-08-25)

- **Model → caller → UI**, because the model is the only layer that can be proven *offline* and it is
  where the defect actually lives. Landing it first means Phase 1's verify-auto is a real gate rather
  than a formality, and the shipped defect gets a **failing test before the fix** (red-green, without
  needing `/feature-reproduce` — the repro is arithmetic, already measured on a live pane).
- **Phase 1 deletes `nextJump` outright** rather than adding beside it. Two live paths with different
  semantics is how the original defect survived three verify rounds; `tsc` then proves every caller
  moved. This is what makes Phase 1 a breaking change and Phase 2 mandatory rather than optional.
- **Phase 2 is its own phase** because `arch.md`'s recurring shape — hit four times here, once as a
  shipped CRITICAL — is *"the machine is proven, the caller is not"*. The caller gets its own
  observable outcome (round-trip symmetry on a live pane), which is the property that distinguishes
  position-based navigation from the rejected viewport-based design.
- **Phase 3 is last** because it is the only phase whose outcome needs a human eye, and because a
  half-built control pair is the one state that would ship a worse UI than today's.
- **No phase touches the backend.** `is_turn_start` and its socket test are proven and unchanged.


## Build notes — Phase 1 (2026-08-25, re-plan)

**The model is rewritten, not extended.** `turnMarkers.ts` now owns two *separate* questions —
"which turn is selected?" (`stepTurn`) and "what line do we scroll to for it?"
(`scrollTargetFor`) — because conflating them is what produced the shipped defect.

**New surface:** `TurnPosition {index}` · `positionAtNewest` · `TurnViewport {length, rows}` ·
`maxScroll` · `StepDirection` · `TurnNavState` · `resolvePosition` · `clampPosition` · `stepTurn` ·
`scrollTargetFor` · `navState`. **Deleted:** `nextJump`, `TurnWalkState`, `initialWalkState`,
`resetWalk`, `JumpOutcome`, `NoJumpReason`, `inertAfter`, `JumpInertEvent`.

⚠️ **Three decisions worth not re-deriving:**

1. **Oldest-first indexing** (`0` = oldest), the OPPOSITE of the deleted newest-first walk cursor.
   It makes `prev` = `-1` and `next` = `+1` against buffer order, so neither direction is the
   inverted one. A newest-first index would leave one direction reading backwards — the asymmetry
   that produced an off-by-one-turn in the first place.
2. **`stepTurn` takes NO viewport, on purpose (AC-1).** Selection is position arithmetic; geometry
   enters only in `scrollTargetFor`. A test pins this by stepping *onto* a turn whose line is above
   `maxScroll` and asserting it is still selected, with only the *scroll* clamped. Letting geometry
   pick the turn is the rejected viewport-based design.
3. **The clamp moved INTO the model.** `scrollTargetFor` returns `min(line, maxScroll)`, so the
   caller can compare against `viewportY` and know the truth — and, more importantly, the position
   advances regardless, so the controls never stall. The old code passed a raw line, xterm clamped
   silently, and the caller reported success for a viewport that had not moved.

**The shipped defect is now a test.** `describe("⚠️ THE SHIPPED DEFECT …")` replays the live-pane
measurement verbatim — markers `[19, 137]`, `length 198`, `rows 68`, `maxScroll 130` — and asserts
the newest turn reads `2/2` with a clamped target of `130`, that ONE prev reaches line 19, and that
prev→next round-trips. Those fail against the old semantics; red-green without `/feature-reproduce`,
since the repro was arithmetic already measured on a live pane.

**Tests: 38 → 61** in `turnMarkers.test.ts` (+ 4 unchanged in the purity guard). Kept the
`isLiveMarker` / `liveMarkers` / `compact` / `reachableCount` / `shouldRecordTurnStart` coverage
(still correct); replaced the `nextJump` / `resetWalk` / `inertAfter` blocks.

⚠️ **14 mutants, each killed, each verified to land on an EXECUTABLE line** (L107–L285; the harness
refuses a mutant whose line begins `//`, `*` or `/*`, per
`[[verify-the-mutation-landed]]`): `maxScroll` 0-floor and `-`→`+`; `scrollTargetFor` clamp dropped;
`stepTurn` prev/next inverted, upper clamp dropped (wrap), lower clamp dropped, stale re-clamp
skipped; `navState` `canPrev`/`canNext` off-by-one and 0-based ordinal; `resolvePosition`
null→oldest, upper clamp dropped, empty→0-not-null, and eviction ignored. Kill counts ranged 1–14
tests; the two clamp-drop mutants kill exactly **1** test each, which is the honest minimum for a
boundary and is why they were probed **individually** rather than as a composite.

⚠️ **The purity guard's emptiness meta-guard was anchored on `nextJump` — a symbol this phase
DELETED.** Re-anchored to `stepTurn`/`scrollTargetFor`/`navState`. Left unfixed it would have failed
loudly (fine), but the trap worth recording is the other direction: an emptiness guard naming a
symbol that never returns is **permanently vacuous**, and every `not.toMatch` beneath it then passes
while checking nothing. Both arms re-proven: emptying the haystack fails the meta-guard, and adding
a real `document.body.clientHeight` read to the model fails the absence test.

⚠️ **`pnpm verify:auto` CANNOT pass until Phase 3.** P1.7's deletion is a deliberate breaking
change, so `XtermPane.tsx` and `Workspace.tsx` do not compile until Phase 2/3 move them — and that
compile error IS the guard proving no caller kept the old semantics. Phase 1's verify-auto is
therefore scoped to the model's own suites plus the Rust side, not the whole gate.

**Gate (Phase 1 scope):** `turnMarkers.test.ts` **61 passed** · `turnMarkersPurity.test.ts`
**4 passed** · `tsc` clean except the two expected caller files.

## Build notes — Phase 1 (2026-08-22)

**Shipped:** `is_turn_start: Option<bool>` on `WorkspaceStatusUpdate` + the named predicate
`event_is_turn_start`, populated in `to_update`. TS mirror added. **Rust 873 → 876; frontend 2141
unchanged** (backend-only phase). `pnpm verify:auto` exits **0** in 34s (registry updated).

**Plan-level call resolved — a named `is_turn_start` flag, NOT `hook_event_name` passed through.**
The plan left the choice open. A named boolean keeps the classification **backend-side** where
`event_to_state` and `notification_awaits_input` already live, so no surface re-classifies a raw
event name; and `None` ≡ `false` means a degraded payload loses a marker rather than inventing one.
Passing the raw name through would have exported the taxonomy to every consumer.

**⚠️ Both guards MUTATION-PROVEN, individually, with the mutation confirmed in executable code**
(`[[verify-the-mutation-landed]]`, `[[invalid-probe-and-real-hole-look-identical]]`). Two distinct
realistic defects, each attributed to the test that caught it:

| Mutation | Landed at | Result |
|---|---|---|
| Predicate also matches `PostToolUse` (the exact defect the field exists to prevent) | `mod.rs:451`, fn body | `turn_start_separates_the_two_running_producers` **FAILED** + `event_is_turn_start_predicate_pins_the_rule` **FAILED** |
| `to_update` hardcodes `is_turn_start: None` (predicate right, **caller** drops it) | `mod.rs:436`, fn body | `turn_start_separates_…` **FAILED** + `turn_start_is_false_for_every_other_mapped_event` **FAILED** |

The second mutation is the **"mechanism correct in itself, caller does not honor it"** shape that
`arch.md` records as this repo's recurring defect (hit four times). Note the complementary
attribution: the predicate test stayed **green** under mutation 2 (the predicate genuinely was
fine), and `turn_start_is_false_for_every_other_mapped_event` stayed green under mutation 1 (it does
not cover `PostToolUse` — that is the other test's job). Neither is redundant with the other.

⚠️ **The filtered-run trap was avoided**: `cargo test status_broadcaster` is a *filtered* run, and a
filter that matches nothing still prints `ok` and **exits 0** (`docs/lessons/source-text-guards.md`).
Each new test was confirmed **by name** in the output, not inferred from a green summary.

## Verify-auto notes — Phase 1 (2026-08-25, re-plan)

**Scoped to the change, per this state's role** — the model's own suites plus the Rust side, NOT
the full `pnpm verify:auto` gate (which cannot pass until Phase 3 by design).

| Check | Result |
|---|---|
| `tsc --noEmit` — error **files** | **exactly 2**: `XtermPane.tsx` (4), `Workspace.tsx` (1) |
| `tsc --noEmit` — error **kinds** | **all** `TS2305`/`TS2724` missing-export, for the 5 symbols P1.7 deleted |
| `eslint` (model + both test files) | exit **0** |
| `prettier --check` | ✅ after a fix — see below |
| `vitest` `turnMarkers.test.ts` + `turnMarkersPurity.test.ts` | **65 passed** (61 + 4) |
| `cargo fmt --check` | exit **0** |
| `cargo clippy --all-targets -D warnings` | clean |
| `cargo test` | **879 passed, 0 failed** — unchanged, no collateral |

⚠️ **The load-bearing check here was not "does it compile" but "do the EXPECTED failures match
exactly".** P1.7's deletion makes a green `tsc` impossible, so the honest gate is the *shape* of the
failure: 5 errors, 2 files, all missing-export, all naming a deliberately-deleted symbol. Anything
else — a third file, or a different error kind in those two — would have been a real finding. Both
were checked explicitly rather than eyeballed.

⚠️ **Prettier flagged the model and its test file; fixing it required proving the reformat inert.**
Per `[[prove-mechanical-transform-by-rerunning-it]]` the check is to re-run the transform on the
**pre-change input** and diff against the current file — NOT to hand-write a normalizer. First
attempt compared against a copy in the session scratchpad and reported a spurious difference (one
line-wrap): **prettier resolves `.prettierrc` from the file's own directory, so a copy outside the
repo is formatted with DEFAULTS.** Re-run with the copy placed inside `src/components/workspace/`:
byte-identical. The reformat is inert.

## Verify-self notes — Phase 1 (2026-08-22)

**⚠️ There IS an integration boundary — this phase is NOT "isolated new artifacts only".**
`WorkspaceStatusUpdate` is an existing DTO with live consumers, so boundary conditions 1 and 5
apply. The consuming surfaces, **by name**:

| Surface | Site | How it consumes |
|---|---|---|
| macOS **tray** (menu-bar alarm) | `tray/commands.rs:123` | `serde_json::from_str::<WorkspaceStatusUpdate>` — in-process **deserialize**, the one that a bad wire shape would break |
| **PiP** NSPanel webview | `Pip.tsx:96` | `useTauriListen<WorkspaceStatusUpdate>` |
| **filmstrip** / main webview | `useWorkspaceStatus.ts:55` | folds into `WorkspaceStatusMap` |
| **Recycle** operation | `recycleSession.ts:356` | raw per-event listener — ⚠️ the WP2 CRITICAL site |

**AC-8's sibling-literal sweep — RUN NOW, not deferred to Phase 3.** The boundary is here, so the
sweep belongs here. Swept all five `WorkspaceState` literals (`running`, `idle`, `awaiting_input`,
`background_work`, `unknown`) across `src/` + `src-tauri/src/`. Two live consumers key on state
literals: `recycleSession.ts:370` (`idle` || `background_work` → "a `Stop` arrived") and
`confirmDialog.ts:85` (`isActiveState`: `running` || `awaiting_input` || `background_work`).

**Neither changes meaning, and this is proven mechanically rather than asserted:**
- `git diff` shows **zero non-comment deleted lines** in the backend — the change is purely additive.
- `event_to_state` extracted from HEAD vs. working tree and `diff`ed: **byte-for-byte identical**
  (32 lines). No state mapping moved, so no consumer's `state`-keyed predicate can have shifted.
- The tray's deserialize path is pinned by the extended
  `status_update_serde_round_trips_for_tray_consumer` (full shape **with** the new field, plus the
  minimal-wire shape asserting `is_turn_start == None` — an older payload must lose a marker, never
  invent one). `cargo test tray::` green (7 passed).

This is the honest reading of the rule: the boundary exists, and the consuming surfaces are verified
by name — rather than declaring the phase isolated because the new field has no reader yet.

**Subagent verdict: 4/4 outcomes PASS, no BLOCKING, no COSMETIC.** The re-verification heuristic did
not apply (no FAILs to re-check). Reported total: **876 passed**, summed across all six
`test result:` lines; exit 0.

⚠️ **The subagent independently mutation-proved the key-set guard — a THIRD mutation on this phase,
from an agent that did not write the code.** It added a real serialized field
`pub mutation_probe_field: u32` to the DTO, confirmed via `sed` that the mutation landed in
**executable** code (the struct definition, not a comment), and — the part that matters —
**filled the struct initializers so the code actually compiled and the assertion ran**, on the
grounds that a compile error would have proven nothing. `dto_serde_shape_is_snake_case` then failed
with `mutation_probe_field` in `left` and absent from `right`. That is the exact
`[[verify-the-mutation-landed]]` / `[[invalid-probe-and-real-hole-look-identical]]` discipline
applied without being told to.

It also avoided the filtered-run false green explicitly: `803 filtered out` with a **non-zero**
filtered-**in** count, and all five relevant tests confirmed by name.

**Cleanup verified by the orchestrator, not taken on trust:** `grep -c mutation_probe_field` → **0**;
`git status` byte-identical to pre-spawn (4 modified + the untracked `wip/`); backend still shows
**zero** non-comment deleted lines; full `cargo test` **876 passed**; `pnpm verify:auto` **exit 0**.

## Verify-self notes — Phase 1 (2026-08-25, re-plan)

**Subagent verdict: 2 PASS · 1 FAIL/COSMETIC · 0 BLOCKING.** No integration boundary — Phase 1
modified only `turnMarkers.ts` and its two test files; no line was added or changed inside either
consumer (`XtermPane.tsx`, `Workspace.tsx`), so no boundary clause fires. The boundary is
deliberately Phase 2's, whose outcome cites the consuming surface by name.

| Outcome | Verdict |
|---|---|
| model suite exits 0 and asserts the position model directly | **PASS** — 61/61, plus 4/4 purity |
| a test replays the SHIPPED DEFECT and fails under the old semantics | **PASS — and PROVEN, not reasoned** |
| `tsc --noEmit` "exits 0" | **FAIL / COSMETIC** — the outcome's own wording; the guard works |

⚠️ **THE FINDING WORTH KEEPING — the subagent proved the red-green EMPIRICALLY where I had only
asserted it.** I claimed the defect test "would fail against the old semantics" by reasoning, which
is the weaker move; the old code was deleted, so I treated the claim as unprovable. **It was not:
the pre-rewrite module is still recoverable at `git show aacfaeb:.../turnMarkers.ts`.** The subagent
extracted it and ran the exact live-pane numbers through the OLD `nextJump`, confirming:

- it returns raw line **137** (> `maxScroll` 130 — the silent xterm clamp);
- its outcome shape is `{kind, line, next}` with **no ordinal field at all**, so `2/2` is not merely
  wrong but inexpressible;
- it advances its cursor past the un-moved turn, so click 2 lands on line **19** and click 3 returns
  `{kind:"none", reason:"at-oldest"}` — **the operator's 0/1/2 report reproduced exactly**;
- it has no direction parameter, so the `prev`→`next` round-trip is not expressible either.

All five assertions in `turnMarkers.test.ts:101-149` are unsatisfiable under the old model. ⚠️ **The
transferable lesson: "the old code is deleted so red-green is unprovable" is FALSE in a git repo —
`git show <pre-change-sha>:<path>` recovers the old implementation and it can be RUN.** Reach for
that before downgrading a red-green claim to an assertion.

⚠️ **The one FAIL is a plan-authoring defect of mine, not a code defect.** The outcome asserted
`tsc --noEmit` exits 0 *and* that the deletion "is a compile error at every call site" — mutually
exclusive. Observed exit **2**, matching the rationale (the load-bearing half). All three shape
sub-checks clean: (a) exactly two files, no third, and a repo-wide grep finds no other consumer of
the deleted symbols; (b) all 5 errors missing-export only — no type-mismatch, arity, or unrelated
error; (c) every named symbol is one of the five deleted. Corrected in the Work Tree (struck
through, not silently rewritten) and filed as
`SURFACE-2026-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS`.

## Verify-human — Phase 1 (2026-08-22): APPROVED

⚠️ **No auto-skip: gate (c) FAILED — the integration boundary is real.** Gates (a) drive_mode=autopilot
and (b) verify-self all-PASS were clean, but `WorkspaceStatusUpdate` is an existing DTO with four live
consumers, so the F11 skip path was **forbidden** and a checklist was presented with a captured-output
requirement. Recording this because the auto-skip path would have been the easy read here, and the
boundary is exactly what it exists to catch.

- **P1.verify-human.1 — PASS.** Boundary check against the tray's own
  `serde_json::from_str::<WorkspaceStatusUpdate>` path
  (`status_update_serde_round_trips_for_tray_consumer`): full shape **with** `is_turn_start` round-trips
  equal, and the minimal wire shape (field **absent**) deserializes to `None`.
- **P1.verify-human.2 — PASS. ⚠️ The design call is now OPERATOR-RATIFIED, not just mine:** the DTO
  carries a **named `is_turn_start: Option<bool>`**, *not* a pass-through `hook_event_name`.
  Classification stays **backend-side** with `event_to_state` / `notification_awaits_input`, so no
  surface re-derives meaning from a raw event name; `None` ≡ `false` degrades to "no marker", never a
  wrong one. **Do not "generalize" this later into shipping the raw event name** — that would export
  the hook-event taxonomy to every consumer, which is the option that was considered and rejected.

**No design prior proposed.** The approval ratified a *technical* seam decision (where classification
lives on the wire) — `arch.md` territory per the capture exclusions, not a product-design tradeoff, and
no transferable product-design *why* was stated. Proposing one here would be the over-infer failure the
capture discriminant exists to prevent.

## Verify-human — Phase 1 (2026-08-25, re-plan): APPROVED

**No integration boundary** — affirmed in writing and diff-verified across all four Phase 1
commits (`aacfaeb..14cefd6`): only `turnMarkers.ts` and its two test files changed; **neither
consumer was touched**. Their wiring is Phase 2/3 scope.

⚠️ **The §2 auto-skip gate was NOT clean, so the prompt was presented rather than elided.** Gates
(a), (c), (d) passed; **gate (b) failed** — verify-self carried a `FAILED-cosmetic`, which that
gate's own table lists as disqualifying alongside `FAILED`/`UNVERIFIED`. Worth noting because the
cosmetic item was *my own* plan-authoring defect rather than a product flaw: the gate still
correctly refused to auto-skip, which is the conservative behaviour one wants — a non-PASS is a
non-PASS regardless of whose mistake produced it.

**Both leaves approved:**

- **P1.verify-human.1** — the corrected Observable outcome accepted. The original asserted
  `tsc --noEmit` exits 0 *while also* asserting the deletion breaks every call site; replaced with
  an expected-failure SHAPE assertion, struck through rather than silently rewritten. Filed as
  `SURFACE-2026-08-25-OBSERVABLE-OUTCOME-ASSERTED-A-GREEN-GATE-ITS-OWN-PHASE-BREAKS`.
- **P1.verify-human.2** — ⚠️ **operator chose PHASE-BY-PHASE over folding Phases 2+3 together**,
  accepting that the full gate cannot pass until Phase 3. Recorded in `## Current Node` so a later
  session does not read the non-compiling tree as breakage and "helpfully" restore the deleted API.

**No design prior proposed.** Neither approval was a product-design correction — one accepted a
plan-artifact fix, the other a build-sequencing preference with no transferable *why* beyond this
WP's mechanics. Per the capture discriminant that is FACT/NOTHING, not a prior. (Build sequencing is
also closer to a technical tradeoff, which belongs in `arch.md` if anywhere, not `design-priors.md`.)

## Verify-codify — Phase 1 (2026-08-22)

**Coverage audit first, per §2 — the three build-time tests were necessary but NOT sufficient.** They
all exercise `to_update` / the DTO directly; **none** exercised socket → parse → `to_update`, which is
the path the tray, PiP and filmstrip actually consume. Since this phase has an integration boundary,
§2 requires a test against the consuming surface, and a unit test on the new field does not satisfy it.

**Added — `end_to_end_socket_one_turn_start_per_turn_not_one_per_tool_call`**
(`status_broadcaster/commands.rs`), following the harness M13.5 WP2 established for exactly this
reason. Real Unix socket, real event stream, real `to_update`:

- Stream is a **realistic multi-tool turn** — one `UserPromptSubmit`, three `PostToolUse`, one `Stop`.
- Asserts **4 of 5 events render as `Running`** (the collision, on the wire) but **exactly 1** carries
  `is_turn_start: true`, and that it is the **first** event, not an arbitrary one of the four.
- Pins the **wire key** (`wire["is_turn_start"] == true`), so a serde drift on the field name would
  fail here rather than silently stop every marker from ever being placed.

⚠️ **The count assertion is the point.** Per-event value checks (which the unit tests already do) do
not show the consequence; asserting the *count* does. Mutation-proven: re-including `PostToolUse` in
the predicate (landed at `mod.rs:451`, executable) fails with
`left: 4, right: 1` — *"keying a marker on state==Running would place 4 markers in this single turn."*
That is the defect made concrete end-to-end, in the units a reader cares about.

**Restored via `cp` from a snapshot, deliberately NOT `git checkout`** — applying this session's own
lesson (see `## Discoveries`).

**Full suite: `pnpm verify:auto` exit 0 · Rust 876 → 877 · frontend 2141 · zero failures.** No test
failed, so §3b triage did not fire and no `## Test Triage` entry is owed. Phase 1 total: **+4 Rust
tests** over the 873 baseline.

## Verify-codify — Phase 1 (2026-08-25, re-plan)

**No integration boundary** — the phase changed only `turnMarkers.ts` and its two test suites;
neither consumer was touched. Consuming-surface coverage is Phase 2's obligation.

⚠️ **Codify's job here was to find what the build's own testing MISSED, not to re-write it.** Build
already took tests 38 → 61 and probed 14 mutants individually. So the audit was: enumerate every
export and every branch, then probe the branches the build's mutants did **not** directly target.
Three such branches; probing them found **one real hole**.

⚠️ **THE HOLE — `isLiveMarker`'s two-condition guard had a half that was never load-bearing.**
Deleting `!marker.isDisposed` (keeping only `marker.line >= 0`) left **all 61 tests green**. Cause:
every evicted fixture in the suite sets **both** `isDisposed: true` **and** `line: -1` — which is
what xterm really does — so the `line >= 0` half alone caught them all and the disposal half was
decorative. The module's own comment calls the pair *"belt and braces"*; nothing proved the belt
existed.

⚠️ **This is the exact shape of `[[raw-guard-identifier-satisfied-by-own-comments]]` generalized to
a BEHAVIOURAL predicate: a compound guard whose clauses are correlated in every fixture is only as
strong as its weakest clause, and the suite cannot tell you which clause did the work.** The
mechanical test is to delete each clause **separately** — a composite fixture that trips both hides
the gap, the same way a composite guard-bypass reports "the guard bites" while hiding an arm.

**Closed** with one test asserting a disposed marker with a *non-negative* line is rejected
(`{id: 1, line: 42, isDisposed: true}`). Re-probed after: **both** halves now fail independently.
The scenario is not hypothetical — a marker observed between `dispose()` and the `-1` write, or a
future xterm that stops writing `-1`, presents exactly that shape, and scrolling to it would target
a line no longer in the buffer while reading as success.

**Nothing else was added.** Every export is exercised; the other two untargeted branches
(`clampPosition`'s null-resolve arm, `isLiveMarker`'s `line >= 0` half) already fail under mutation,
so tests there would have been duplication. ⚠️ Coverage tooling (`@vitest/coverage-v8`) is **not
installed**, and installing it here was declined as scope creep that would also dirty
`pnpm-lock.yaml` (`[[pnpm-spike-in-tmp-mutates-repo-lockfile]]`); the branch-enumeration + per-clause
mutation audit is the substitute and is strictly stronger than line coverage.

**Gate (Phase 1 scope):** `turnMarkers.test.ts` **62** · `turnMarkersPurity.test.ts` **4** = **66
passed** · eslint 0 · prettier clean · `tsc` shape unchanged (still exactly the 2 expected files).

## Build notes — Phase 2 (2026-08-22)

**Relevance check (before Phase 2):**
- Requester still needs this: **yes** — operator approved Phase 1 at verify-human minutes earlier.
- Requirements unchanged: **yes** — no AC touched; Phase 2 is the plan's P2.1/P2.2 verbatim.
- Solution still feasible: **yes** — Phase 1 delivered the exact signal (`is_turn_start`) Phase 2's
  consumer will key on, proven end-to-end through the socket.
- No superior alternative discovered: **yes** — nothing in Phase 1 suggested a different mechanism.
**Verdict:** proceed.

**Shipped:** `src/components/workspace/turnMarkers.ts` (pure; no React, no DOM, no runtime xterm
import) + 25 tests. **Frontend 2141 → 2166**; Rust 877 unchanged (frontend-only phase).
`pnpm verify:auto` exits **0**.

**API:** `isLiveMarker` · `liveMarkers` · `compact` · `reachableCount` · `nextJump` · `resetWalk`,
over `TurnMarker` / `TurnWalkState` / `JumpOutcome`. `nextJump` returns a **discriminated union** —
`{kind:"scroll", line}` or `{kind:"none", reason}` — so the caller cannot accidentally treat
"nothing to jump to" as a scroll to line 0 (AC-5). `NoJumpReason` distinguishes `no-markers` (fresh
session / all evicted) from `at-oldest`, so the affordance can be worded honestly.

**⚠️ A real xterm detail that shaped the design: a disposed marker's `line` becomes `-1`**
(`xterm.d.ts` L483–492), and `-1` handed to `scrollToLine` scrolls to the buffer **top** — which
reads as a successful jump. `isLiveMarker` therefore checks **both** `isDisposed` and `line >= 0`.

**Mutation-proven, individually, each landing in executable code:**

| Mutation | Landed | Result |
|---|---|---|
| Remove the no-wrap guard (`if (target >= live.length)` → `if (false)`) | line 140, fn body | **7 tests FAILED**, incl. the dedicated no-wrap test |
| Drop the `line >= 0` half of `isLiveMarker` | line 81, fn body | **1 test FAILED** |

⚠️ **The second result is reported honestly rather than dressed up: only ONE test caught it, and that
is the correct outcome.** Real xterm sets `isDisposed` and `line = -1` *together*, so `isDisposed`
alone is sufficient for every realistic eviction — which is exactly why the realistic-scenario tests
stayed green. The `line >= 0` half is **defensive depth against a state I have not observed**, not a
load-bearing guard, and only the one test that deliberately constructs the impossible-but-cheap
combination (`isDisposed: false, line: -1`) can distinguish it. Claiming broad coverage here would be
the "guard that reports green while checking nothing" failure inverted.

**⚠️ `pnpm verify:auto` caught a real Prettier violation in both new files (gate exit 1).** Fixed with
`prettier --write`, then **re-ran the tests after the reflow** — 25 still pass — because CLAUDE.md
records a Prettier reflow silently breaking a guard once. This is `format:check` earning its place in
the gate. (One pre-existing eslint *warning* in `XtermPane.tsx` L631 about a spread in a dep array is
untouched and not mine.)

**Restored both mutations via `cp` from a snapshot, deliberately not `git checkout`** — applying this
session's own logged lesson.

## Build notes — Phase 2 (2026-08-25, re-plan)

**The caller now speaks the position model.** `XtermPane`'s handle drops
`jumpToPreviousTurn(): boolean` for `stepTurn(direction): boolean` + `turnNavState(): TurnNavState`.
All four of Phase 1's expected `tsc` errors in this file are resolved; the single remaining one is
`Workspace.tsx`, which is Phase 3's.

⚠️ **`stepTurn`'s `true` deliberately does NOT mean "the viewport pixel-moved"**, and the handle's
doc comment says so at length. It means "a turn was selected". Near the buffer end the scroll clamps
while the position advances — conflating those two is the exact defect this WP fixes, and the honest
signal for the UI is `turnNavState()`, not the boolean. A future edit that "fixes" the boolean to
report movement would re-introduce the defect.

⚠️ **ONE writer of `turnPositionRef`** (`setTurnPosition`), per `arch.md`'s funnel rule — *extracting
a pure state machine proves the MACHINE, not its CALLER; funnel shared-state writes through ONE
function and guard THAT function*. It **always** re-clamps rather than clamping only on a
notionally-eviction path, so no caller has to remember whether markers might have been evicted since
the position was captured. Both AC-6 (new-turn reset) and AC-7 (eviction re-clamp) go through it.

⚠️ **Geometry is read at CALL time and passed as a value** — `{length: term.buffer.active.length,
rows: term.rows}`. `arch.md` forbids reading scroll geometry off an element; a *cached* viewport is
the other half of that hazard, since `length` grows as CC writes and `rows` changes on resize, so a
stale ceiling clamps against the wrong number.

⚠️ **`compact()` runs BEFORE `stepTurn`**, so the step and the scroll see one list — otherwise a
disposed marker could shift the very indices the position is expressed in.

**New guard: `turnNavWiring.test.ts` (9 tests).** Phase 1's 62 tests would ALL stay green if this
file wired the model up wrongly, which is the `arch.md` shape exactly. The guard pins: exactly one
raw write to the position ref, the clamp being unconditional, geometry read at call time, compact
ordering, the AC-6 reset going through the setter, fresh nav state reaching the parent, the deleted
walk API not creeping back (`tsc` catches an import but not a locally re-introduced same-named
helper), and `registerDecoration` staying out.

⚠️ **A MUTATION PROBE CAUGHT ONE ARM OF THAT GUARD CHECKING NOTHING — and this is the finding worth
carrying.** The "hands the parent fresh nav state" assertion matched
`onTurnStartRecorded?.(navState(` — a **call-shape** predicate. Replacing the live ref with
`positionAtNewest` (a literal, i.e. reporting a position the pane is not at) left the guard **green**.
Fixed by asserting the **arguments**, not the call. ⚠️ **The rule: a source-text predicate must name
the value that can be WRONG, not the function that can be MISSING** — otherwise it tests that
someone called something. This is why all 7 arms were probed **individually**; a composite mutant
would have tripped one of the other six and reported "the guard bites".

**Also fixed:** `exhaustive-deps` correctly flagged `setTurnPosition` missing from the handle's dep
array. Added rather than suppressed — it is `useCallback([])`-stable so listing it cannot re-create
the handle, and silencing the rule is what would hide a genuinely unstable dependency added later.
(The one remaining lint warning, a spread element at :859, is **pre-existing** — confirmed by
`git stash`.)

**Gate (Phase 2 scope):** 3 suites **75 passed** (62 + 4 + 9) · eslint 0 errors · prettier clean
(reformat proven inert by re-running the transform on the pre-change input) · `tsc` down to the
single expected `Workspace.tsx` error · 7/7 wiring mutants killed + the emptiness meta-guard proven.

## Verify-auto notes — Phase 2 (2026-08-25, re-plan)

Scoped to the changed files (`XtermPane.tsx`, new `turnNavWiring.test.ts`), not the full gate.

| Check | Result |
|---|---|
| `tsc` — errors **in** `XtermPane.tsx` | **0** — all four resolved |
| `tsc` — total | **2**, both `Workspace.tsx`, both expected kinds, no others |
| `eslint` (both changed files) | **0 errors**, 1 warning — **pre-existing** |
| `prettier --check` | clean |
| 3 affected suites | **75 passed** (62 + 4 + 9) |
| Rust collateral | none — no `src-tauri/` file changed |

⚠️ **A near-miss worth recording: `grep -c "XtermPane"` on tsc output reports a FALSE 1.** The string
`XtermPaneHandle` appears inside a **`Workspace.tsx`** error message
(*"Property 'jumpToPreviousTurn' does not exist on type 'XtermPaneHandle'"*), so a naive filename
grep counts a message-text match as an error in that file. The correct predicate anchors on the
filename **position**: `^src/components/workspace/XtermPane.tsx(`. Same class as
`[[raw-guard-identifier-satisfied-by-own-comments]]` — a bare identifier match found the identifier
somewhere other than where the check meant.

⚠️ **The pre-existing-warning check was ALSO initially invalid, and the tell was in the output.**
First attempt used `git stash` to compare against "before Phase 2" — but the tree was already
committed, so the stash was a **no-op** (`"No stash entries found"`) and the comparison compared
`HEAD` to itself, producing a meaningless `1 == 1` PASS. Redone by recovering the pre-Phase-2 file
(`git show 2a45cf7:…`) into the repo (so `.eslintrc` resolves) and linting that: the same single
spread-element warning is present at **:810** pre-Phase-2 and **:861** now — same warning, shifted by
this phase's insertions. ⚠️ **A clean tree makes `git stash` a silent no-op, and a stash-based
before/after then always agrees with itself.**

## Verify-self notes — Phase 2 (2026-08-22)

**No integration boundary — Phase 2 adds isolated new artifacts only:** `turnMarkers.ts` (a new pure
module) + its test file. No existing endpoint, route, UI component, CLI command, or job was touched.

⚠️ **Verified, not asserted:** `grep` for production imports of `turnMarkers` returns **0** — the
module has no consumer until P3.2 wires it. The only other `src/` modification in the tree
(`workspaceStatus.ts`) belongs to **Phase 1** and was already covered by that phase's own boundary
check, so it is not double-counted here. This is the deliberate contrast with Phase 1, where the
boundary *did* apply and the F11 skip path was forbidden.

**Subagent verdict: 4/4 PASS, no BLOCKING, no COSMETIC.** Re-verification heuristic not applicable
(no FAILs). Method notes worth keeping:

- **No-match positive control.** Ran vitest against a nonexistent test path → exit **1**, *"No test
  files found"*. That is what makes the real runs' exit 0 a meaningful signal rather than a vacuous
  one — the shape of check this project keeps getting burned by.
- **Baseline measured, not assumed.** Moved `turnMarkers.test.ts` out of the tree → **166 files /
  2141 tests**; restored → **167 / 2166**. The +25 delta matches the file's 25 `it(` blocks exactly,
  so the count rise is attributed rather than inferred.
- **Purity proven from SOURCE, not from green tests.** Comments stripped, then grepped for
  `document|window|clientHeight|clientWidth|offsetHeight|getBoundingClientRect|scrollTop|globalThis|@xterm|xterm|require(|import`
  → **zero matches**; `grep -c "^import"` → **0**. Every `xterm`/`scrollTop` string in the raw file
  is header prose explaining why they are avoided.
- **Fixture realism checked.** The `evicted()` helper sets **both** `line: -1` and
  `isDisposed: true` — the real xterm shape — so the `-1`-to-`scrollToLine` hazard is genuinely
  exercised rather than flag-flipped.
- **Three independent mutation probes**, each confirmed landed in executable code and reverted:
  wrap-instead-of-inert → **6** failures; `isLiveMarker` → `!isDisposed` → **1**; `liveMarkers` made
  a passthrough → **6**. Its probe (B) independently reproduced my own finding that the `line >= 0`
  half is caught by exactly one test.

**Cleanup verified by the orchestrator:** tree scope identical to pre-spawn, both mutated guards
restored to their real form (`mod` lines 89 + 148), `grep -c "^import"` still **0**, full suite
**167 files / 2166 tests** passing.

⚠️ **A real gap the subagent surfaced — non-blocking, and NOT silently swallowed:** the module's
DOM-freedom is currently protected by **review and convention, not by an automated guard**. Nothing
in the suite would fail if a future edit added `document.querySelector` to `turnMarkers.ts`. Phase 2
as scoped is verified — purity holds *today*, proven from source — but the property is unenforced.
Filed as a Discovery; the natural home for a `?raw`-style source guard is the Phase 3 wiring, where
this project's existing guards live.

## Verify-self notes — Phase 2 (2026-08-25, re-plan)

**Integration boundary APPLIES** (`XtermPane` backs a UI surface), so the skip path was forbidden
and the consuming surface was exercised **by name**: the `XtermPane` handle on the visible CC pane.

⚠️ **Split execution, deliberately.** `mcp__tauri__*` reaches the orchestrator but **not** spawned
subagents (`[[mcp-bridge-tools-not-exposed-to-subagents]]`) — a subagent driving the live app
silently falls back to bare Vite and returns a false verdict. So the **orchestrator drove the live
pane** and the **subagent audited the wiring guard**. The subagent was told to report the console
outcome UNVERIFIED rather than guess, and did.

| Outcome | Verdict |
|---|---|
| round-trip symmetry on a live pane (the load-bearing one) | **PASS** — orchestrator-driven |
| caller-contract test proves the one-writer funnel, both directions | **PASS** — subagent, mutation-proven |
| no JS console errors across a turn + 4 nav steps | **PASS** — orchestrator (subagent: UNVERIFIED) |
| *(sub-finding)* geometry guard's `rows` half was half-vacuous | **FAIL/COSMETIC → FIXED in-flight** |

**Live-pane evidence.** Handle reached via the React fiber — **no instrumentation needed**, so the
tree stayed byte-identical throughout. Handle shape:
`[focus, refit, setFontSize, relaunch, stepTurn, turnNavState]` — the deleted `jumpToPreviousTurn` is
gone from the **live object**, not merely from source. Round trip at `length 556 / rows 68 /
maxScroll 488`: `viewportY` **488 → 488 → 285 → 488 → 488** with ordinals `6→5→4→5→6`; a full walk to
both ends visited **three distinct viewports (85, 285, 488)**, so the return-equality is not hiding a
collapse. Ends: oldest `1/5 canPrev:false`, newest `5/5 canNext:false`. AC-6 confirmed live — a new
turn-start reset selection to the newest.

⚠️ **A first attempt at this outcome PROVED NOTHING and was not banked.** On the initial buffer
(`length 90 / rows 68 / maxScroll 22`) every marker sat at or above the ceiling, so `viewportY`
stayed pinned at 22 through the whole round trip — *correct behaviour*, and completely uninformative
about movement. `arch.md`'s rule is the test: *an observation is only decisive when a broken
implementation would give a DIFFERENT answer.* Grew the buffer and re-ran.

⚠️ **Console check used a POSITIVE CONTROL first.** `read_logs{source:"console"}` captures nothing
for this app (`[[read-logs-console-captures-nothing]]`), so an empty read is a false green by
default. A self-installed tap was proven to capture (a seeded `console.error` was observed) before
the empty result was accepted as meaningful. Tap removed afterwards.

### ⚠️ THE SUBAGENT FOUND A GUARD WEAKNESS THE ORCHESTRATOR MISSED — and this is the keeper

`turnNavWiring.test.ts`'s geometry assertion was **half-vacuous**. It asserted two loose substrings,
and `rows: term.rows` appears **twice** in `XtermPane.tsx` — at the `scrollTargetFor` nav call site
(:434) *and* in the unrelated `cc_resize`/fit path (:523). Hard-coding the **nav** call's rows to a
literal therefore left that assertion **GREEN**; the mutant was caught only because the sibling
`length:` substring happens to be unique to :434. One half of a two-part predicate was checking a
line it was not about.

**Fixed** by anchoring both fields inside a single `scrollTargetFor(...)` argument list. Re-probed
each half **independently**: `rows`-only hardcoded → FAIL (previously PASS), `length`-only hardcoded
→ FAIL, both-cached → FAIL. All three now bite.

⚠️ **The transferable rule, and it is the second instance this WP:** *a source-text predicate must
be anchored to the SITE it is about, not merely to a substring that occurs there.* Phase 2's build
already hit the sibling form of this (asserting a **call shape** instead of the **arguments**); this
is the same defect one level out — asserting a substring that is **not unique** to the site. Both
were found by mutating **individually**, and both would have been hidden by a composite mutant that
tripped some other assertion. ⚠️ **Check uniqueness (`grep -c`) of every substring a guard leans on.**

## Verify-human — Phase 2 (2026-08-22): SKIPPED via F11, operator-confirmed

⚠️ **This was a SKIP, not an approval of a checklist — recorded as such deliberately.** `arch.md`
records that *"a skipped step is visible, a skipped step recorded as due diligence is not"*
(`SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`, where five gates were written
up as WAIVED with invented rationale). So: **no human checklist was walked for Phase 2.** Nothing was
clicked or run by the operator; the operator confirmed the skip on the affirmation below.

**Affirmation (the thing that gates the F11 path):** this phase does NOT wire into any existing
endpoint, route, UI page, CLI command, scheduled job, or external-system call. It adds only isolated
new artifacts — `turnMarkers.ts` (**zero** production importers, verified by grep) and its 25-test
file. Consumers arrive in Phase 3 (P3.2/P3.4).

**⚠️ Auto-skip was AVAILABLE and I declined it — gate (a) could not be cleanly affirmed.** Gates (b)
verify-self all-PASS, (c) no boundary, and (d) no outcome names a consuming surface were all clean.
But gate (a) says to read `drive_mode` from the WIP's **YAML frontmatter** and, if absent, *"treat as
Mode 2 and do NOT auto-skip"* — and **this WIP has no YAML frontmatter**; the mode is a body line
(`**Drive mode:** autopilot`, plus Claudesk's per-turn hook). Read literally, gate (a) fails. Since
the rule also says *be conservative*, I fell through to F11-with-confirmation rather than
auto-skipping on a gate I could not affirm: a wrongful skip silently removes the operator's review,
while a needless pause costs one line.

⚠️ **This will recur on every no-boundary phase in this repo** (Phase 3 included, if it ends up with
no boundary — though it almost certainly has one). **The one-time fix is a decision, not a
per-phase judgement:** either give WIP files real YAML frontmatter carrying `drive_mode:`, or relax
gate (a) to accept the body-line form. Worth settling once. Filed below.

**No design prior proposed** — a skip confirmation carries no product-design tradeoff and no
transferable *why*. The capture discriminant does not fire.

## Verify-auto + Verify-self — Phase 3 (COMBINED with Phase 2, 2026-08-25)

⚠️ **Why combined.** Phase 3 was built **out of order** to unblock a runtime-broken app, and Phase
2's own verify-self was **VOIDED** — its "live-pane" readings came from a webview holding a
pre-deletion bundle. Phase 2's surface (the handle's round-trip symmetry) is only observable
*through* the Phase 3 controls anyway, so one honest gate replaces two, one of which would have been
a re-run of discredited checks. Operator approved.

**Boot smoke-test first** — the gate the incident recommends: `#root` has children and stylesheets
are loaded. ⚠️ **This is the check whose absence let a blank app pass a full verify cycle.** Run it
before trusting any live observation on a phase that deleted anything.

**Combined outcome — real DOM clicks, `viewportY` read after React commits.** Three real
turn-starts with ~120 lines of buffer growth between each, so markers land at distinct depths
(`length 341`, `rows 68`, `maxScroll 273`):

| Click | Readout | prev | next | `viewportY` |
|---|---|---|---|---|
| start | 3/3 | enabled | **disabled** | 273 |
| prev | 2/3 | enabled | enabled | **220** |
| prev | 1/3 | **disabled** | enabled | **100** |
| next | 2/3 | enabled | enabled | **220** |
| next | 3/3 | enabled | **disabled** | **273** |

**Three distinct viewports (100 · 220 · 273)**, round trip exact on *both* viewport and readout,
both ends disabling correctly. That covers Phase 2's outcome (round-trip symmetry with the viewport
genuinely moving) **and** Phase 3's (the controls, AC-4 disabled ends, AC-5 readout).

Fresh pane before any turn: both controls present and `disabled`, `cursor: default`, readout hidden
(`total === 0`). AC-6 confirmed: a new turn-start makes the readout appear at `N/N` with `next`
disabled. Console: **0 errors** across 8 clicks, on a tap with a proven positive control
(`[[read-logs-console-captures-nothing]]` — an untested tap's empty read is a false green).

⚠️ **AN INSTRUMENT ERROR THAT LOOKED EXACTLY LIKE A DEFECT, worth carrying.** A first pass clicked
the buttons and read the DOM **synchronously in the same tick**, showing the readout frozen at `3/3`
and `nextDisabled` stuck `true` — i.e. *"clicking does nothing"*, indistinguishable from a broken
handler. React had simply not committed yet. Reading after `requestAnimationFrame` shows the correct
walk. ⚠️ **For any React-state assertion driven by a synthetic click, the read must be deferred a
frame; a same-tick read reports the PREVIOUS render.** (Related but distinct from
`[[mcp-bridge-interact-click-needs-el-click-fallback]]`: `el.click()` *did* reach React here — the
bug was when I looked, not how I clicked.)

**New guard: `turnNavExportContract.test.ts` (4 tests).** Asserts every **value** import each
consumer takes from `turnMarkers` actually exists on the runtime module — the property whose absence
shipped the blank app. Type-only specifiers are excluded (erased at compile time, cannot fail at
runtime); the emptiness meta-guard asserts the **parse** rather than a value-import count, because
`Workspace.tsx` legitimately holds only a type import now and demanding otherwise would fail on
correct code. Three arms mutation-proven, including **reconstructing the real defect** — re-adding
`inertAfter` to `Workspace.tsx`'s import fails with the exact diagnostic. ⚠️ One probe initially
"passed" because a `sed` escaping slip meant the mutation never landed — redone and confirmed; **an
invalid probe and a real hole look identical** (`[[invalid-probe-and-real-hole-look-identical]]`).

**Gate:** `pnpm verify:auto` exit **0** · Rust **879** · frontend **2220** · `tsc` **0 errors** —
the first clean full gate since Phase 1.

## Verify-codify — Phase 2 (2026-08-22)

**No integration boundary**, so no consuming-surface test is owed. The four verified behaviours are
already covered by tests that would fail if the behaviour broke — proven, not assumed, by three
mutation probes. §2 says do not duplicate existing coverage, so **no behavioural tests were added.**

**Closed the ONE genuinely uncovered property** the Phase 2 verify-self subagent surfaced: purity was
enforced by review, not by a guard. Added
`src/components/workspace/__tests__/turnMarkersPurity.test.ts` (4 tests) following this repo's
established `?raw` pattern (`recycleAbortOnUnmount.test.ts`) — no imports, no
`document`/`window`/`globalThis`/geometry identifiers, no runtime xterm reference.

**⚠️ Two mutation probes, and the second one is the interesting one:**

| Mutation | Landed | Result |
|---|---|---|
| Add a real DOM read (`document.querySelector(".xterm")?.clientHeight`) inside `nextJump` | fn body, executable | **1 test FAILED** — the guard bites on the actual hazard |
| **Disable the comment-strip** (`const code = turnMarkersSource;`) | the guard's own haystack | **2 tests FAILED** |

⚠️ **The second probe proves the comment-strip is LOAD-BEARING, not defensive boilerplate** — and it
is the `[[raw-guard-identifier-satisfied-by-own-comments]]` trap **inverted**. The usual failure is a
guard satisfied by the module's own comments, passing exactly when the named code is deleted. Here the
module's header prose deliberately names `clientHeight`, `scrollTop` and `xterm` while explaining why
it avoids them, so an unstripped haystack **false-positives permanently**. Without the strip this
guard could never pass at all. That reasoning was written in the guard's header *before* the probe —
the probe confirmed it rather than discovering it.

**The emptiness meta-guard earns its place here more than usual:** every substantive assertion is
`not.toMatch`, so an over-eager strip or a `?raw` import silently resolving to `""` would make all of
them **pass while checking nothing**. The first test pins the haystack (three real function
signatures + a length floor) before any absence is trusted.

**Full suite: `pnpm verify:auto` exit 0 · Rust 877 (unchanged) · frontend 2166 → 2170 (+4) · zero
failures.** No test failed, so §3b triage did not fire and no `## Test Triage` entry is owed.
Restored both mutations via `cp` from snapshots, not `git checkout`.

**Phase 2 total: +29 frontend tests** over the 2141 baseline (25 behavioural + 4 structural).

## Verify-human — Phase 3 (COMBINED with Phase 2, 2026-08-25): APPROVED

**Integration boundary APPLIES** (`Workspace.tsx` + `XtermPane.tsx` both back a UI surface), so the
F11 skip path was forbidden and auto-skip irrelevant. All four leaves approved.

- **P3.verify-human.1** — the live walk: `↑` twice then `↓` twice, readout `3/3 → 2/3 → 1/3` and
  back, ends greying out, returning where it began.
- **P3.verify-human.2** — fresh workspace: both arrows visible but disabled, no `0/0` readout.
- **P3.verify-human.3** — ⚠️ **the affordance is CONFIRMED as `↑ N/N ↓` inside the split-control
  cluster**, with the alternatives (text labels, other glyph pairs, readout outside the arrows)
  explicitly on the table and declined.
- **P3.verify-human.4** — ⚠️ **`↑` = prev = OLDER is CONFIRMED**, following scroll direction; the
  inverse was offered as defensible and declined.

**No design prior proposed.** Both judgment calls were *confirmations of the agent's proposal*, not
corrections, and neither carried a transferable why beyond this surface — per the capture
discriminant that is FACT/NOTHING. Glyph choice and direction convention are also close to the
label/copy exclusion. ⚠️ Note for a future capture: had the operator *reversed* either call with a
reason ("controls on this app always read top-down because …"), that would have been a prior.

⚠️ **The out-of-order build was disclosed at this gate and accepted.** Phase 3 landed before Phase
2's gate finished, Phase 2's verify-self is recorded VOIDED, and its outcome was re-proven in the
combined run. The operator was offered a different bookkeeping treatment and declined.

## Build notes — Phase 3 (2026-08-22)

**Relevance check (before Phase 3):** requester still needs it **yes** · requirements unchanged
**yes** · still feasible **yes** (Phases 1+2 delivered exactly the signal and the model Phase 3
consumes) · no superior alternative **yes**. **Verdict:** proceed.

**Shipped, all 7 leaves.** `pnpm verify:auto` exits **0**; Rust 877 unchanged; frontend
**2170 → 2171**.

- **P3.1** `scrollback: 1000 → 10000` (`XtermPane.tsx:461`); mirror's `scrollback: 40` untouched
  (line 507).
- **P3.2** raw-event tap via the shared `useTauriListen` seam, matching **`is_turn_start`** →
  `registerMarker()` + `registerDecoration({overviewRulerOptions})`.
- **P3.3** opt-in `markTurnStarts` prop (default **false**), set only on the CC pane.
- **P3.4** `jumpToPreviousTurn()` + `reachableTurnStarts()` on `XtermPaneHandle`.
- **P3.5** the button, in the **ungated** cluster, with an `is-inert` honest-failure state.
- **P3.6** sibling-literal sweep (below). **P3.7** mirror unaffected (below).

**⚠️ A plan premise was WRONG, and the correction makes the change cheaper.** The plan (and my own
spec) treated the mirror path's `scrollback: 40` as a *second `Terminal` config* to leave alone. It is
not — it is an option to **`serializeAsHTML()`**, i.e. "serialize the last 40 rows *of this same
buffer*". So raising the Terminal's scrollback **cannot** change the mirror's serialize cost at all,
and P3.7's feared CPU regression was structurally impossible rather than merely unobserved. Recorded
because the WIP said otherwise in three places.

**⚠️ The affordance is NOT in the skill-button row, and that was a real trap.** That row is gated
wholesale (`showSkillButtons({workflowEnabled, …})`) and holds Recycle — the obvious neighbour. A
turn is a plain Claude Code concept, so per the gate's *applicability* rule the surface is **ungated
and takes no guard arm**; putting it in that row would have made it vanish whenever the gate is off,
silently violating AC-7. It sits with `workspace-split-control`, the ungated terminal-chrome cluster.

**⚠️ The `+1` frontend test is fully attributed — I did not write it.** The count moved 2170 → 2171
with no new test file, so I chased it rather than accepting it: `cssModifierAudit.test.ts`
**dynamically enumerates** `.block.is-*` modifier selectors in `App.css` and emits one test per
selector, and my new `.workspace-jump-turn-btn.is-inert` became the 14th. Confirmed empirically by
`git stash` (17 tests) vs. working tree (18). **Mutation-proven that it really covers my class:**
dropping the `is-inert` emission while keeping the CSS fails with *"App.css styles
.workspace-jump-turn-btn.is-inert but no component emits it"* — the repo's existing CSS↔component
guard automatically covering new work, and the direction (`styled-but-never-emitted`) that shipped a
prior CRITICAL.

⚠️ **One self-correction worth recording:** I first explained the +1 as one-test-per-selector, then
saw `--reporter=verbose` print no selector-named test and briefly concluded my explanation was wrong.
The stash comparison settled it — the mechanism was right, the *test names* just don't include the
selector. The verbose output was the weaker instrument, not the counter-evidence.

**P3.6 — sibling-literal sweep (re-run, because Phase 3 adds a NEW DTO consumer).** Swept all five
`WorkspaceState` literals across non-test `src/`. Only two consumers key on them —
`recycleSession.ts:370-371` (`idle` || `background_work`) and `confirmDialog.ts:87-89`
(`running`/`awaiting_input`/`background_work`) — unchanged from the Phase 1 sweep, and **neither was
touched by this phase**. The `"running"`/`"idle"` hits in `WorkflowInstallWizard`,
`WorkflowUninstallDialog` and `docs/fetchLatch.ts` are *different state machines*, not
`WorkspaceState`. ⚠️ **And the new listener contains ZERO references to `payload.state`** (verified by
grep) — it keys exclusively on `is_turn_start`, which is what AC-4 demands.

**P3.7 — mirror unaffected.** Both scrollback values confirmed in place; all **678** workspace tests
pass, mirror suite included.

**Colour choice:** the ruler tick is neutral grey `#6e7681`, deliberately **not** a status hue.
`[PRIOR: semantic-distance-not-just-visual-distance-for-status-colour]` fires — orange/blue/purple are
taken by Running/AwaitingInput/BackgroundWork, and WP2 rejected teal for reading blue-adjacent. A
navigation landmark must not borrow status meaning.

**Both mutations restored via `cp` from snapshots, not `git checkout`.**

## Operator live verification — post-close (2026-08-25)

⚠️ **Added AFTER the close commit, because the operator correctly challenged what had actually been
verified:** *"so is the turn nav working? I haven't verified in live action yet."*

**The gap was real.** Every live reading taken during the workflow came from **synthetic
`UserPromptSubmit` events written into the dev hook socket** — xterm ignores synthetic keystrokes, so
that was the only way the agent could drive a turn. That exercises the signal path end-to-end, but it
never exercised **a real typed prompt in a real CC pane**. The distinction was not surfaced at
verify-human, where the operator's "all good" was recorded as approval of the whole surface; on
re-reading, that was plausibly approval of the **design** (`↑ N/N ↓`, arrow direction) rather than a
statement that they had driven it.

⚠️ **Two things made the challenge especially fair.** (1) For most of Phase 2 the app **could not
boot**, and readings banked then came from a pre-deletion bundle — so "the agent said live, was
actually stale" had already happened once in this WP. (2) The agent's own measurements had twice been
wrong from an unrepresentative input ([[measurement-input-must-be-representative]]).

**Closed 2026-08-25.** Fresh dev app launched clean (boot smoke-test: `#root` has children,
stylesheets loaded → APP MOUNTS), operator opened a scratch workspace, **typed real prompts**, and
drove the controls by hand. **Verdict: PASS.** The three things no automated check could judge —
whether the arrows are findable in a crowded chrome row, whether the scroll lands somewhere useful,
and whether `↑` = older reads correctly — were all confirmed by the operator at the same time.

⚠️ **Method note worth carrying:** socket-injected turn-starts are a legitimate *agent* instrument
for this feature and prove the wire, but they are **not** a substitute for an operator-typed turn, and
the difference should be stated at verify-human rather than left implicit. Do not describe a
socket-driven run as "verified live" without that qualifier.

## Retrospect

- **What changed in our understanding:**
  ⚠️ **The biggest thing: a REFUTATION needs the same empirical bar as a claim — arguably higher,
  because a refutation CLOSES work.** This WP was escalated out of its milestone on an
  "alternate buffer" refutation built entirely from **typings and a doc comment**. One property read
  on a live pane (`buffer.active.type === "normal"`) demolished it. That false refutation had earned
  three rounds of trust, marked working code as dead, and voided a shipped config decision.
  ⚠️ **Second: a missing ES-module export is a RUNTIME failure, not a compile-time one.** We planned
  a deliberate red `tsc` across phases and called it "the guard". It was also a blank, unlaunchable
  app — and the operator found that, not any gate.
  ⚠️ **Third: `maxScroll` was the invisible variable.** The whole defect was that the newest turn's
  start is structurally *inside* the final viewport, so `scrollToLine` clamped and the caller read
  that as success.

- **Assumptions that held:**
  The model/caller seam was the right place to work. Extracting the pure model made the arithmetic
  assertable as a *value* rather than an unobservable xterm side effect, and that inversion turned
  out to be the fix rather than scaffolding around it. Hook-channel-only state detection held —
  `is_turn_start` needed no change across all three phases. The `arch.md` funnel rule (one writer,
  guard that writer) was correct and cheap to apply.

- **Assumptions that were wrong:**
  ⚠️ **"CC repaints in place / accumulates no scrollback"** — false, and it came from measuring with
  `claude -p "say ok"`, a turn far too short to overflow 68 rows. A degenerate input produced a
  confident, coherent, wrong generalization. **The operator's pushback was right twice** where the
  agent's reading was wrong.
  ⚠️ **"A red `tsc` is a safe guard"** — wrong, and it was stated to the operator as reassurance,
  which is worse: the phase-by-phase decision was approved on a false premise.
  ⚠️ **"Phase 2's live-pane verification passed"** — it ran against a **pre-deletion bundle**. A full
  verify-self → verify-human cycle banked stale-runtime evidence.

- **Approach delta:**
  Substantial. The plan was model → caller → UI, gated per phase. **Phase 3 was built out of order**
  to unblock the blank app, so Phase 2's gate never completed independently and its verify nodes are
  recorded **CLOSED BY COMBINATION** rather than back-dated. The affordance also changed shape at
  re-admission — from one backward-only jump button to a bidirectional `↑ N/N ↓` pair — on operator
  input, which is why the model is position-based rather than viewport-based (the latter cannot
  round-trip). ⚠️ **Three guards were found half-vacuous by mutation probes and tightened mid-flight**
  (a `?raw` identifier matching a non-unique substring, a call-shape assertion ignoring its
  arguments, and a two-clause predicate whose clauses were correlated in every fixture). Each was
  found only because arms were probed **individually**.


## Code-Quality Review — turn-output-reorientation

> ⚠️ **Reviewer subagent completed AFTER the operator called a turn-level hold (2026-08-25)**, so the
> findings were recorded verbatim below and **no severity-tier action was taken at the time**.
> ✅ **ACTION COMPLETED on re-entry (2026-08-25):** all 6 findings are in
> `workflow-system/state/backlog-quality-findings.md` under `# turn-output-reorientation —
> 2026-08-25` (3 MAJOR medium + 3 MINOR low), with **one** pointer in `workflow-system/state/backlog.md`.
> **0 CRITICAL → no refactor required** (F39, not F40). The reviewer was **not** re-spawned — this
> section is the record, and its presence is what makes re-entry idempotent.

**Verdict: 0 CRITICAL · 3 MAJOR · 3 MINOR** → no refactor required (F39 path, not F40).

### Strengths
- The model/caller split in `turnMarkers.ts` is the right seam for the right reason: geometry enters only as an injected `TurnViewport` value, so the clamp ceiling (`maxScroll`) becomes an assertable number instead of an unobservable xterm side effect — that inversion *is* the fix for the shipped defect, not a wrapper around it.
- `navState` as the single derivation of both `canPrev`/`canNext` and `ordinal`/`total` structurally forecloses the "1/3 next to an enabled prev" class, and `turnMarkers.test.ts` pins the agreement property directly rather than trusting it.
- `is_turn_start` is classified backend-side in one named predicate (`event_is_turn_start`), and `commands.rs`'s socket test asserts a *count* (1 turn start across 4 `Running` events) rather than per-event values — the shape that makes the `PostToolUse`-collision regression impossible to reintroduce quietly.
- `setTurnPosition` as the sole writer of `turnPositionRef`, always re-clamping, with `turnNavWiring.test.ts` counting raw writes to exactly 1 — a direct, correct application of the repo's funnel rule.
- Both source-text guards strip comments before asserting absence and carry non-vacuity meta-guards anchored on live symbols only; `turnNavControls.test.ts` reads CSS via `node:fs` rather than `?raw`. Two guards were tightened by mutation probes mid-flight and the findings are recorded at the assertion.

### Issues

**CRITICAL**
- (none)

**MAJOR**
- [`__tests__/turnNavControls.test.ts:1-161`] The whole control-surface guard is `?raw` source-grepping for **DOM-at-rest questions** (`disabled` bound to the right flag, readout hidden at `total === 0`, controls outside the gated row). ⚠️ `docs/lessons/source-text-guards.md` states the opposite rule explicitly — *"when the question is what does the DOM look like at rest, render it… Reaching for `?raw` on a DOM question is how this repo accumulated its nine failure forms"* — and names two working precedents needing no new dependency (`docsRender.test.tsx`, `projectModelCellRender.test.tsx`). *Why it matters:* the assertions are regex-brittle (a Prettier reflow or trivially-equivalent refactor breaks `disabled=\{!turnNav\.canPrev\}`; `[\s\S]{0,200}?` windows are order-dependent), cannot see the rendered attribute, and cannot cover the gate-OFF case a parsed DOM would get for free.
- [`__tests__/turnNavExportContract.test.ts:1-129`] The blank-app guard is scoped to **one import edge** in two named consumers and re-implements an ESM export check by regex-parsing import statements. It answers the orchestrator's question in the negative: **a point patch, not the structural fix.** The SURFACE it cites proposes the general remedy (a boot smoke-test asserting `#root` has children after any deletion phase) and that was **filed rather than built** — so the next module to lose an export strands its consumer exactly as before; `src/components/workspace/` alone has 4 sibling import edges with no such guard. *Why it matters:* the failure class is "the app does not start", blast radius repo-wide, mitigation one-module-wide — and the guard's own header ("deliberate redundancy on a failure mode whose blast radius is 'the app does not start'") **overclaims coverage it does not have.**
- [`turnMarkers.ts:224-243` + `XtermPane.tsx:416-441` + `Workspace.tsx:622-626`] **Three-layer contract drift on the "returns it so the caller never polls" claim.** `stepTurn` returns `{position, nav}` and its docstring says the caller "never has to make a second call" — but `XtermPane` **discards `stepped.nav`** and recomputes via `navState`; the handle then returns a `boolean` that `Workspace` **discards entirely** in favour of a follow-up `turnNavState()` call. `Workspace.tsx:222-230` and `turnNavControls.test.ts:96` both assert push-not-poll **in prose while the code polls.** *Why it matters:* the returned `nav` is dead weight at two of three layers and the comments actively mis-describe the data flow. Either thread `nav` through (`stepTurn(dir): TurnNavState | null`) and drop the boolean, or drop the returned `nav` and say plainly that the surface re-reads. The boolean's own docstring already concedes it is not the honest signal.

**MINOR**
- [`XtermPane.tsx:72-78`] A 7-line comment documenting a `TURN_MARKER_COLOR` constant **that no longer exists**, for an affordance the re-spec rejected, including its palette rationale. Clearest single instance of retracted reasoning promoted to permanent code prose; a reader hunting the marker colour finds a constant that isn't there.
- [`XtermPane.tsx`, `Workspace.tsx`, `App.css`] ⚠️ **Comment density DID get materially worse:** 58% of newly added production lines are comments (**388 of 673**); `XtermPane.tsx` moved **51% → 55%** while growing **714 → 944** lines. The `.workspace-jump-turn-btn` deletion rationale is stated in **four places**. ⚠️ The individual *retraction* blocks (`:361-372` alternate-buffer, `:451-458` premise-invalidated) **are load-bearing** — each prevents a re-derivation that already cost real work — but the duplicated deletion rationale is the "same rationale in six places" pattern. **No comment was stale or contradicted the code**, so this is polish: collapse the four copies to one canonical home plus pointers.
- [`Workspace.tsx:636-641`] `aria-live="polite"` sits on a span that is **conditionally mounted** on `turnNav.total > 0`. A live region that does not exist when the value first appears **will not announce the first turn** — only subsequent ordinal changes. Render it unconditionally and empty its text.

### Assessment
Well-built work, notably better-built than the thing it replaces. The re-plan diagnosed the real defect correctly — a walk cursor with no viewport geometry could not express the clamp that was silently eating the first click — and the fix is a genuine architectural improvement rather than a patch: position arithmetic separated from scroll geometry, geometry injected as a value, one derivation for both the disabled ends and the readout, one writer for the shared position. The backend signal is classified in exactly one place with a test that asserts the property rather than the mechanism. The test suite is real coverage, not shape-theatre: a red-green anchor built from measured live numbers, `shouldRecordTurnStart` existing specifically so the caller's contract is testable, and two guards tightened by mutation probes that found them half-vacuous. Against that, the verification strategy has one systematic weakness: the two newest guards reach for `?raw` on questions the repo documents as render-the-DOM questions, and the export-contract guard is a one-module patch standing in for a repo-wide boot check that was filed instead of built. Neither is a correctness defect today; both are guards that will rot in the ways the lesson doc catalogues. Future readers will find the code clear and the *reasoning* over-supplied — the retraction notes earn their place, the duplicated deletion rationale and the dead-constant paragraph do not. **Net: advances the codebase, with a modest, well-identified debt in guard shape and comment budget.**

### If you disagree
Dismiss any finding by editing this section in the WIP file and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Ship notes (2026-08-25)

**Cleanup:** clean. No probe/instrument residue in `src/` (every temporary tap was reverted and the
tree verified byte-identical at each step), no debug logging added, no commented-out code, no new
TODO/FIXME, no scratch files inside the repo (the ignored paths are all pre-existing and correctly
covered by the artifact-tracking policy).

**Final verification:** `pnpm verify:auto` exit **0** · Rust **879** · frontend **2230** across
**171** files · `tsc` **0 errors**.

⚠️ **Plus a BOOT SMOKE-TEST, and it is not ceremony here.** `#root` has children and stylesheets are
loaded → **APP MOUNTS**. This WP is the reason that check exists: a green `pnpm verify:auto` and a
green `tsc` were *both true* while the app was blank and unlaunchable, because a deleted ES export is
a **runtime** module-resolution failure. **Any future phase that deletes or renames an export must
run this before shipping** — the unit gate cannot see it.

**Release prep:** 18 commits, `aacfaeb`..`51aab74`, each already carrying a full message; no
squash-and-summarise step, matching this repo's history. Branch `main`, **27 ahead of origin, 0
behind**. ⚠️ **NOT PUSHED** — standing policy is push only when the operator asks, and the operator
restated it for this WP.

⚠️ **Do not read "all phases `[x]`" as "all phases independently verified".** Phase 2's verify nodes
are marked **CLOSED BY COMBINATION**: its verify-self readings were VOIDED (pre-deletion bundle) and
re-proven inside Phase 3's combined gate, and its verify-human was folded there and operator-approved.
Recorded this way rather than back-dated so the history stays legible about what was voided and where
it was re-proven.

**What shipped:** bidirectional, position-based turn navigation — `↑ N/N ↓` in the ungated
split-control cluster. Model (`turnMarkers.ts`) rewritten around `TurnPosition` + `TurnViewport` with
selection and geometry deliberately separated; `XtermPane` exposing `stepTurn(direction)` +
`turnNavState()` behind a single position writer; `Workspace` rendering the paired controls with real
`disabled` ends and a live readout. The backward-only jump button, its `inertAfter` state machine and
the `registerDecoration`/overview-ruler path are all deleted.

**Test surface added by this WP:** `turnMarkers.test.ts` 38 → **62** · `turnMarkersPurity` **4**
(anchors refreshed) · `turnNavWiring` **9** · `turnNavExportContract` **4** · `turnNavControls`
**10**. Every guard arm mutation-proven **individually**, and three of them caught real holes that a
composite probe would have masked.

## Verify-codify — Phase 3 (COMBINED with Phase 2, 2026-08-25)

**Integration boundary APPLIES** (`Workspace.tsx` backs a UI surface), so the test set had to reach
the consuming surface, not just the new module.

⚠️ **Codify's job was to find what the four existing suites CANNOT fail on.** Model (62), purity (4),
pane wiring (9) and export contract (4) would **all stay green** if `Workspace.tsx` rendered the
controls wrongly — crossed `disabled` flags, a readout visible at zero turns, a dropped AC-6 push.
That is `arch.md`'s recurring shape one level further out: *the machine is proven, the caller is
proven, and the SURFACE the operator actually touches is not.* **A real gap, closed.**

⚠️ **`cssModifierAudit.test.ts` does NOT cover the new classes, and that is correct rather than a
hole in it** — its measured scope is `.block.is-*` MODIFIER selectors, and these are base classes
plus a `:disabled` pseudo-class. Note the irony worth remembering: the one modifier it *would* have
covered (`.workspace-jump-turn-btn.is-inert`) is precisely the one this phase deleted. So the
emitted↔styled contract for the replacements had to be asserted here or nowhere.

**New guard: `turnNavControls.test.ts` (10 tests).** Pins: both controls present and of the same
element kind (paired affordances); `disabled` wired to the *correct* flag on each; the readout hidden
at `total === 0`; the AC-6 push; nav state stored after **both** directions' steps; the deleted
`jumpInert`/`inertAfter`/`jumpToPreviousTurn` absent; every emitted class actually styled **and** the
deleted classes gone from **both** sides; `cursor: default` on `:disabled`; and ungated placement
inside the split-control cluster.

⚠️ **10 arms + 2 meta-guards, each mutation-proven INDIVIDUALLY** (crossed `disabled` flags · readout
at zero turns · AC-6 push removed · `next` handler dropping its store · readout class unstyled ·
`:disabled` cursor made a pointer · `next` control deleted · controls moved outside the ungated
cluster · haystack emptied · CSS emptied). Every one failed by the intended assertion. ⚠️ **The
mutants were re-run AFTER `prettier --write`** — a Prettier reflow has silently broken a guard in
this repo before, and a regex-adjacent reformat is exactly when a source-text predicate stops
matching. Both highest-value mutants still bite post-format.

⚠️ **CSS is read via `node:fs`, not a `?raw` import** — Vite's CSS plugin intercepts `?raw` for
`.css` and returns PROCESSED output rather than source text
(`[[vitest-raw-import-css-returns-processed-not-text]]`). A `?raw` CSS guard here would have been
asserting against the wrong text entirely.

**Nothing else added.** No React render harness was introduced: `docsRender.test.tsx` is the only
precedent, the behaviour was already proven live through real DOM clicks at verify-self, and a
render harness for this surface would need an xterm mock — cost without new information. Recorded as
a deliberate choice, not an omission.

**Final gate:** `pnpm verify:auto` exit **0** · Rust **879** · frontend **2230** (2220 → +10) ·
`tsc` **0 errors** · prettier clean (reformat proven inert by re-running the transform on the
pre-change input).

## Verify-self notes — Phase 3 (2026-08-22)

**⚠️ There IS an integration boundary** (condition 2 — `XtermPane.tsx`/`Workspace.tsx` back an existing
UI view and user-visible behaviour changed). The outcomes cite the consuming surfaces by name: the
main webview DOM, `workspace-skill-row`, and `TerminalPane`.

**Driven by the orchestrator, NOT the subagent.** `mcp__tauri__*` reaches the orchestrator but is
**not exposed to spawned subagents**, which silently fall back to bare Vite and produce false
verdicts (`[[mcp-bridge-tools-not-exposed-to-subagents]]`). So the bridge work was done here and the
*findings* were handed to the subagent for independent assessment.

**Verified LIVE against the running dev app** (scratch workspace `scratch-a`, opened via the
**no-fire** door so nothing was auto-injected — `[[verify-self-tiers]]`: never dogfood a check against
the operator's real projects):

| # | Finding | Evidence |
|---|---|---|
| A | Button present, correctly placed | `jumpInsideSkillRow: **false**`, sibling of `workspace-split-control`, label `↰ turn` |
| B | Genuinely **reachable**, not just in the DOM | rect 50×20 @ (509,92); `elementFromPoint(center)` → `BUTTON.workspace-jump-turn-btn` |
| C | CSS applied **at runtime** | computed `background rgba(255,255,255,0.06)`, `borderColor rgba(128,128,128,0.3)`, `color rgb(176,176,176)` — the authored values |
| D | **AC-5 honest failure, live** | click with no turn → `is-inert`, `opacity 0.4`, `color rgb(138,138,138)` (#8a8a8a), tooltip → *"No earlier turn start is still in the scrollback"* |
| E | **P3.3 shared-pane exclusion, real subject present** | a `term-pane` (shell, `ws-1-term-0`) mounted beside the CC pane; **exactly ONE** jump button |
| F | **AC-7 gate-OFF, proven structurally** | brace-matched `Workspace.tsx`: gated block = chars 29543–31237, button at **32589** → outside it, so it renders whatever `workflowEnabled` is |
| G | Backend half works **end-to-end** | injected a real `UserPromptSubmit` into the dev hook socket; the app's own log: `resolved=ws-1 outcome=**emitted**` |

⚠️ **B and C matter beyond box-ticking.** DOM presence alone would have satisfied a naive check while
the button sat unreachable or unstyled — and *emitted-but-never-styled* is a shipped-CRITICAL shape
here. Hit-testing plus computed style closes both at runtime, not by source grep.

### ⚠️ The unresolved item — and why it is UNVERIFIABLE rather than "fine"

**H.** After the `outcome=emitted` event, **zero** decoration nodes appeared and the button stayed
`is-inert`.

**I. But the runtime is STALE, so it cannot adjudicate.** PID 3655 started **18:24:09**; the binary
`src-tauri/target/debug/claudesk` was written **18:24:11** — the process is **2 seconds older than the
binary it should be running**. This is the exact shape logged in M13.5 WP2 (*"a stale dev runtime —
`strings` on the on-disk binary looked correct; restart before believing a live result"*). The
**frontend** is ruled out as the cause: Vite serves the new source (`workspace-jump-turn`,
`is_turn_start`, `markTurnStarts`; `turnMarkers.ts` → 200) and `XtermPane.tsx`'s mtime (18:24:08)
predates app start, so HMR staleness does not apply. What is unproven is whether **this process's Rust
half** stamps `is_turn_start` onto the DTO.

**J. And the instrument could not settle it either.** Every
`window.__TAURI_INTERNALS__.invoke(...)` **times out** through the bridge while plain JS (`1+1`) works
— so I could not read the received payload to distinguish *"field absent on the wire (stale Rust)"*
from *"field present, listener didn't fire (real defect)"*. Per
`[[mcp-bridge-tauri-caveats]]` a failing JS-level tap is **not** evidence that no IPC happened, so I
did not read it as one.

⚠️ **I did NOT relaunch or kill the app to resolve this.** PID 3655 is the **operator's own live app
with real projects open**, and killing one has previously destroyed operator work
(`[[verify-self-dev-vs-prod-process-name-collision]]`). A rebuild-and-relaunch is the operator's call.

### ⚠️ The subagent PROVED the stale-runtime hypothesis — with the fact I had missed

My timing argument was circumstantial (process 2s older than the binary). The subagent made it
**mechanical**, and found the decisive datum:

- **The entire `is_turn_start` backend change is WORKING-TREE-ONLY**:
  `git show HEAD:src-tauri/src/status_broadcaster/mod.rs | grep -c is_turn_start` → **0**.
  *(Independently re-run by me: 0.)*
- `strings` on the on-disk binary → `struct WorkspaceStatusUpdate with **6** elements`, including
  `is_turn_start`. *(Re-run by me: 6.)* Every Rust artifact (`.rlib`/`.dylib`/`.a`/binary) was written
  **18:24:11**, after the process started at **18:24:09**.

**Therefore the image PID 3655 loaded necessarily had the 5-element DTO** — the broadcaster that
emitted evidence G's event **had no `is_turn_start` field to emit**. My listener requires
`payload.is_turn_start !== true`, so **zero decorations is the PREDICTED, CORRECT behaviour** of
current frontend source against a stale backend. Evidence H cannot discriminate the hypotheses; it is
not a defect signal.

### The transition call: F9b, and NOT to fix a defect

The subagent recorded outcome 2 as FAIL/BLOCKING (correctly, per *"when in doubt"*) but recommended
**against** back-looping — no defect is identified, so a code change would be speculative. I agree
about the code, and I am **still** back-looping, for a different and non-speculative reason it
surfaced:

⚠️ **The P3.2 listener wiring has ZERO automated coverage.** Grepping every test file for
`markTurnStarts` / `registerDecoration` / `jumpToPreviousTurn` matches **only the purity guard**, and
that match is *prose in a comment*, not behaviour. *(Re-verified by me.)*

That is `arch.md`'s **recurring** defect shape, hit four times in this repo and once as a shipped
CRITICAL: *"extracting a pure state machine proves the MACHINE, not its CALLER."* Both halves here are
well proven — the model by 29 tests, the backend by 4 (including a real-socket end-to-end run) — and
the **seam between them by nothing at all**. Which is exactly why a stale runtime was able to leave
this outcome unanswerable: there was no standing test to ask instead.

`arch.md`'s corollary is explicit: *"when a verify step names 'does the caller honor the contract?' as
the risk, extracting the contract does not answer it; only a caller-side guard does."* So the
back-loop adds the missing caller-side coverage. That is a real gap closed on evidence, not a guess at
a bug.

**Carried to verify-human regardless:** the live marker/jump behaviour on a **freshly rebuilt** app,
plus outcome 5 (console errors — `read_logs` captures nothing for this app, a known **false green**,
so no instrument exists).

## Build notes — P3.verify-self.2 back-loop (2026-08-22)

**No code defect was fixed, because none was identified.** What was closed is the **zero-coverage
seam**: `shouldRecordTurnStart` extracted into `turnMarkers.ts`, the listener rewritten to call it,
and **7 caller-contract tests** added. Frontend **2171 → 2178**; `pnpm verify:auto` exit **0**;
Rust 877 unchanged.

⚠️ **The extraction had to change the CALLER, or it would have repeated the exact defect shape it
closes.** Verified on **comment-stripped** source (so prose cannot satisfy it): **1**
`shouldRecordTurnStart(` call site and **0** leftover inline guards — no
`payload.is_turn_start !== true`, no `payload.workspace_id !== workspaceId`, no bare
`if (!markTurnStarts)`.

**Each of the three guards mutation-proven INDIVIDUALLY** — the discipline that matters here, since a
composite bypass would trip *some* test and report "the guard bites" while hiding a gap. Each mutation
landed in executable code and was caught by exactly **one** dedicated test (clean attribution, no
overlap):

| Mutation | Result |
|---|---|
| drop the `markTurnStarts` guard (shared shell pane) | **1 failed** |
| drop the `workspace_id` filter (event is broadcast to every pane) | **1 failed** |
| `is_turn_start === true` → truthy (loses strictness) | **1 failed** |

**The test set includes the payload shape that caused this whole detour:** *"does NOT record when
`is_turn_start` is ABSENT — the stale/older-backend payload."* The situation that was
*unverifiable live* is now **permanently covered offline** — which is the real value of the back-loop.
Also covered: a realistic full turn (prompt + 3 tool calls + stop) asserting **exactly one** record,
mirroring the Rust socket test on the caller side.

⚠️ **P3.verify-self.2 is NOT marked passed.** It is `BLOCKED` pending a rebuilt app and carried to
verify-human. Marking it green off the back of offline coverage would be exactly the
*"skipped step recorded as due diligence"* failure `arch.md` warns is worse than the skip: the
contract is proven, the **live behaviour is still unobserved**.

**Re-verify gate (§6):** the failed outcome's live half remains blocked by design, but I confirmed the
refactor did not break the render path — button still present, still outside the skill row, workspace
still mounted.

## Build notes — P3.verify-human.1 F12 back-loop (2026-08-24)

**Two defects, both found by the OPERATOR at verify-human — the gate doing its job.**

### Defect 1 (the real one): the affordance latched inert and then LIED

Operator: *"I clicked it before prompting CC — it did nothing but disabled the button itself. And
then prompting CC won't re-enable it."*

⚠️ **Confirmed by reading, not guessed:** `grep` found exactly **ONE** writer of `jumpInert`
(`Workspace.tsx`, inside the `onClick`). So the flag could only ever be cleared by a later
**successful** click. After one dead click on a fresh session the button stayed dimmed and kept
asserting *"No earlier turn start is still in the scrollback"* **even once turns existed** — a UI
that **lies**, which is strictly worse than the dead click the inert state was added to explain.

⚠️ **Same defect SHAPE as the M13.5 WP2 CRITICAL**, and as `arch.md`'s recurring four-time entry:
a mechanism correct in itself sitting behind a caller that never learns about it. `XtermPane`
already knew the exact moment a turn started (it resets the walk there) — it just never told the
parent. **The fix is the missing edge, not a re-read.**

⚠️ **Why 36 green tests missed it:** the AC-5 tests covered only the **entering** transition.
Nothing exercised **leaving** it. That asymmetry is the transferable lesson — for a two-way flag,
test both directions or the second one does not exist.

**Fixed:** new `onTurnStartRecorded` prop on `XtermPane` (mirroring the existing `onSessionId`
parent-notify precedent), fired where the walk resets; `Workspace` clears the flag on it.

### Defect 2 (found while reading, before re-testing): the tick was on the wrong edge

`overviewRulerOptions.position` was `"left"` — but the checklist I had written told the operator to
look at the **right-hand scrollbar margin**. A correctly-recorded marker could have been dismissed
as missing. **Operator delegated the choice; chose `"right"`** — that is where the scrollbar is, and
where a position cue is conventionally read.

### The extraction, and a `tsc` finding worth keeping

The inert flag lived entirely inside a JSX `onClick`, so **no unit test could reach it** — the same
untestable-caller problem the earlier F9b back-loop fixed for the listener. Extracted as
`inertAfter(event)` in `turnMarkers.ts`, with **both** edges routed through it (verified on
comment-stripped source: **2** call sites, **0** raw `setJumpInert(true/false)` writes left).

⚠️ **`tsc` caught the first draft** threading a `prev` parameter it never read (`TS6133`), and that
was a **real signal, not noise**: every event fully determines the outcome, so a signature implying
history would invite a future edit to add state this decision does not need. Renamed
`nextInert(prev, event)` → **`inertAfter(event)`**. The gate earned its place here.

**Mutation-proven TWICE** — once under the original signature, then **again** after the rename
(the first proof does not transfer to a changed signature). Reverting `turn-recorded` to not clear
reproduces the **exact shipped bug** and fails **4** tests, including one that replays the
operator's sequence verbatim.

**Gate:** `pnpm verify:auto` exit **0** · Rust **877** unchanged · frontend **2178 → 2184** (+6).

## ⚠️~~MECHANISM REFUTED — the alternate buffer~~ — ⚠️ THIS SECTION IS RETRACTED (2026-08-25)

> ⚠️⚠️ **EVERYTHING BELOW IN THIS SECTION IS FALSE. It was overturned the same day by the WP3 task
> 3.1 probe — see `## Research` at the end of this file, which is the authority.** It is kept
> verbatim rather than deleted because *how* a coherent, well-cited, entirely wrong refutation
> earned three rounds of trust is the lesson
> (`SURFACE-2026-08-25-REFUTATION-FROM-TYPINGS-NOT-RUNTIME`).
>
> **The one read that refutes all of it:** `term.buffer.active.type` on a live CC pane is
> **`"normal"`**, `buffer.active === buffer.normal` is `true`, and `buffer.alternate.length` is
> **`0`** — the alternate buffer is never used, and `onBufferChange` fires zero times across a full
> turn and a `/clear`. The real cause was two **unset xterm options** (`allowProposedApi`, and
> terminal-level `overviewRuler.width`), both documented in the typings quoted below.
>
> ⚠️ **Do not cite this section as evidence for anything.** `registerMarker` and `scrollToLine`
> work on the CC pane.

**Three failed live tests, then the cause. It is not the wiring; it is the MECHANISM.**

Claude Code is a **full-screen TUI**, and full-screen TUIs run in the terminal's **alternate
buffer**. xterm's own typings say, in two sentences I should have read at spec time:

- `registerMarker(cursorYOffset?)` — *"Adds a marker to the **normal buffer** and returns it."*
- `registerDecoration(...)` — *"Returns the decoration or **undefined if the alt buffer is
  active**."*

So on the CC pane: the decoration is **never created** (no tick can render), and a marker
registered against the *normal* buffer is meaningless while the alt buffer is displayed. `grep`
confirms the codebase — spec, plan, and code — **never mentioned the alternate buffer at all**.

⚠️ **This also undercuts OQ-1.** The operator chose `scrollback: 1000 → 10000` to keep long turns
reachable, but an alt-buffer TUI does not accumulate normal-buffer scrollback the way the spec
assumed. The memory cost was accepted on a premise that does not hold. `scrollback: 10000` should
be **re-decided, not silently kept**.

### Why every gate missed it, and what that says about the method

- **38 frontend + 4 Rust tests, all honest, all irrelevant here.** The pure model was correct; the
  caller contract was correct; the backend emitted the right field. Each layer was verified against
  the layer beside it, and **no layer was verified against the terminal's actual buffer mode**.
- ⚠️ **The recurring shape again, one level up:** I proved the machine, then proved the caller, and
  the *thing both were talking to* was never in scope. `arch.md`'s corollary — *"an observation is
  only decisive when a broken implementation would give a DIFFERENT answer"* — is exactly what was
  missing: **every** offline test passes identically whether or not the alt buffer is active.
- ⚠️ **The instrument chain hid it three times.** Stale binary → stale binary again → HMR masking a
  stale Rust half. Each was a *real* explanation of that run's failure, and each was **also** a
  reason the real cause stayed invisible. A repeated "instrument was wrong" verdict should itself
  have been the signal to go read the platform contract.
- **I reasoned twice where I should have read once.** The refuting sentence was in
  `node_modules/@xterm/xterm/typings/xterm.d.ts` the whole time, ~10 lines from the API I built on.

### What survives, and what does not

**Survives (all still correct and tested):** the backend `is_turn_start` discriminator + its
end-to-end socket test; `turnMarkers.ts`'s walk/eviction model; `shouldRecordTurnStart`;
`inertAfter`; the ungated placement; the honest-failure state; the purity guard.

**Refuted:** `registerMarker` + `registerDecoration` as the marking mechanism for the **CC pane**.

**Open question for the operator — this is a spec-level decision, not a build fix.** Candidate
directions, cheapest first:
1. **Serialize-based landmark:** record the turn boundary as a buffer/line coordinate captured from
   the `serializeAsHTML()`/write path rather than an xterm marker, and scroll by line.
2. **Mark in the normal buffer only** — correct for a plain shell pane, but the CC pane is the whole
   point, so this is close to abandoning the feature.
3. **Escalate WP3 out of the bucket** per gate 3.2, which the WBS always said was the expected
   outcome for this item — now with a *measured* reason rather than a size estimate.

⚠️ **Do NOT attempt another mechanism without first checking it against
`term.buffer.active.type === "alternate"` on a live CC pane.** That single read is the check whose
absence cost three test rounds.


## Research — WP3 task 3.1 feasibility probe (2026-08-25)

**Vehicle:** `/feature-research`. **Method:** a live CC pane (`claude` v2.1.245, PID child of
`target/debug/claudesk`) driven through the MCP tauri bridge, with a temporary `window.__probeTerms`
registry exposing the real `Terminal`. Every API was **RUN**, not read from typings. Instruments were
reverted afterwards; `git status` is byte-identical to the pre-probe state.

### ⚠️ HEADLINE: THE REFUTATION WAS ITSELF WRONG. The alternate buffer was never involved.

The escalation note said *"CC is a full-screen TUI → it runs in the ALTERNATE buffer → decorations
return undefined."* **The first clause is false, and it invalidates the chain.** Measured on a live
CC pane:

| Read | Value |
|---|---|
| `buffer.active.type` | **`"normal"`** |
| `buffer.active === buffer.normal` | **`true`** (identity-checked) |
| `buffer.active === buffer.alternate` | `false` |
| `buffer.alternate.length` | **`0`** — the alt buffer was **never used at all** |

CC v2.1.245 renders its TUI by **repainting the normal buffer**, not by switching buffers. An armed
`buffer.onBufferChange` listener recorded **zero** buffer changes across a full turn *and* a
`/clear`. So the "alt buffer" premise — the whole basis of the escalation — does not hold.

### Q1 — `term.buffer.active.type` on a running CC session

**`"normal"`.** (Expected `"alternate"`; that expectation was wrong.)

### Q2 — Does the buffer accumulate scrollback? **YES, abundantly.**

Measured across one real turn ("print 1..120"):

| | before | after |
|---|---|---|
| `buffer.active.length` | 68 (== `rows`) | **146** |
| `baseY` | 0 | **78** |

78 lines of genuine scrollback from a single turn. A later turn reached `length 151 / baseY 83`.
**"Scroll back to the turn start" is NOT impossible in principle — the history is really there.**

### Q3 — Which xterm APIs work, verified by running them

| API | Result on the live CC pane |
|---|---|
| `registerMarker(0)` | ✅ **works** — returned a live marker (`line: 90`, `isDisposed: false`) |
| `scrollToLine(0)` | ✅ `viewportY` → **0** |
| `scrollToLine(40)` | ✅ `viewportY` → **40** |
| `scrollLines(-10)` | ✅ `viewportY` → **30** |
| `scrollToBottom()` | ✅ `viewportY` → **78** |
| `buffer.getLine(n).translateToString()` | ✅ real CC text at every index |
| `registerDecoration({...})` | ❌ **THREW** — see below |

**⚠️ THE ACTUAL ROOT CAUSE — and it is a one-line config omission, not a platform limit:**

```
Error: You must set the allowProposedApi option to true to use proposed API
```

`registerDecoration` is xterm **proposed API**. `allowProposedApi` is **never set anywhere in this
codebase** (`grep` over `src/`: zero hits). **Proven causal by a controlled A/B** — same constructor,
same buffer type (`normal`), same marker, only the flag differing:

| `allowProposedApi` | `registerDecoration` returns |
|---|---|
| `false` | **throws** `"You must set the allowProposedApi option to true"` |
| `true` | **`object`** — a real decoration |

And on the **live CC pane** rebuilt with the flag: `DECORATION_CREATED: true`, marker at line 90.
**The marker/scroll half of the mechanism was sound the whole time.** Note the throw is *silent in
production*: the original code called `registerDecoration` with no try/catch inside a listener, so
the exception was swallowed and presented as "nothing renders."

### Q4 — Does CC ever leave the normal buffer? **No.**

`buffer.onBufferChange` recorded **zero** events. `/clear` did **not** reset or switch the buffer —
it *grew* it (`146 → 151`, `baseY 78 → 83`): CC's `/clear` clears its own conversation, not the
terminal scrollback. `buffer.alternate.length` stayed `0` throughout.

### ⚠️ ONE QUESTION REMAINS OPEN — the overview *ruler* never painted

This is the honest residual, and it is a **rendering** question, not a feasibility one:

- The typings state `IOverviewRulerOptions.width` **"must be set in order to see the overview
  ruler"** — a *terminal-level* option (`options.overviewRuler.width`) also **never set** in this
  codebase (a **second** missing precondition, independent of `allowProposedApi`).
- Setting it **did create** the canvas: `canvas.xterm-decoration-overview-ruler`, 14×884, correctly
  positioned (`x:946, y:120`).
- **But it painted 0 non-zero pixels**, across: 4 decorations spread over the buffer, `position:
  "right"` and `"full"`, `refresh()`, scroll nudges, a real CC turn, and a ~3s settle.
- **Hypothesis (untested):** the overview ruler is **canvas**-based, and this app is **DOM-renderer
  only** by hard architectural rule (no WebGL/canvas addon). There were **zero `<canvas>` elements in
  the whole document** before the ruler was forced. The ruler may simply not be a DOM-renderer
  feature. ⚠️ Setting the width *after* construction created an unpainted canvas; setting it *at*
  construction was not conclusively tested (the dev app exited before that run completed).

**⚠️ Do not treat this as refuted.** Unlike the alt-buffer claim, it has **not** been proven either
way. It is one probe-run from an answer, and it only affects the *gutter-tick* presentation — the
marker + `scrollToLine` navigation is already proven to work.

### Verdict: FEASIBLE. The feature is not blocked; it was mis-diagnosed.

Turn-boundary navigation in the CC pane is **feasible**: the buffer is `normal`, it accumulates real
scrollback, markers register, and all four scroll APIs move the viewport as intended. The three
failed test rounds were caused by **two unset xterm options**, not by a platform contract.

**Recommended re-spec direction:** keep `registerMarker` + `scrollToLine` (proven), set
`allowProposedApi: true`, and choose the *visual* affordance against the open ruler question —
prefer a **DOM-rendered indicator** (the existing `workspace-split-control` neighbour) over the
canvas overview ruler, since a jump *button* needs no gutter tick at all. That sidesteps the one
unresolved question entirely.

**⚠️ Re-decide `scrollback: 10000`, now on a TRUE premise.** The raise was marked "premise
invalidated" on the alt-buffer reasoning — **that marking is now itself void.** The pane *does*
accumulate normal-buffer scrollback, so the original OQ-1 rationale (p95 = 378 events could evict a
turn's own start at 1000) **stands on its merits** and should be re-evaluated as a genuine
memory-vs-reach tradeoff, not dismissed.

### ⚠️ The process lesson COMPOUNDS — the probe gate fired twice and was skipped twice

The filed SURFACE said *"a dependency being installed says nothing about whether its API works in
our runtime conditions."* The probe confirms it and **sharpens it**: the failure was not exotic
runtime conditions but **two unset options documented in the dependency's own typings**. Worse, the
*post-mortem* then mis-attributed the cause to the alternate buffer by **reading a doc comment
instead of reading a runtime value** — `buffer.active.type` is a single property access, and it
refutes the entire escalation. **The cheap mechanical test remains the same one: `grep` for whether
any shipped code already calls this API in this context — it said no, twice.**

**Meta-lesson for the mechanism-refutation class:** a refutation built from typings is a
*hypothesis*, and it earned three rounds of trust without a single runtime read. **Refutations need
the same empirical bar as claims** — arguably higher, since a refutation closes work.

---

## Research — WP3 signal-trace probe (2026-08-25, same day as 3.1)

**Why a SECOND probe.** After 3.1 closed FEASIBLE, the operator reported the shipped affordance
still did nothing: *"nothing that I can notice from the UI. Nothing happens except for it disabling
itself"* — dimmed, at **0, 1, and 2 turns**. 3.1 had proven the xterm APIs by driving them directly
through the MCP bridge, which **bypasses the hook signal entirely**, so the wire was never
exercised. This probe traced the signal.

**Vehicle:** dev app (`com.claudesk.app.dev`) + MCP bridge, with a temporary tap in
`useTauriListen` (every `workspace-status` payload) and in `XtermPane` (each guard's verdict, each
`registerMarker` result, plus a buffer-state handle). Instruments reverted; tree byte-identical to
`aacfaeb` after.

### ⚠️ HEADLINE: the signal path is WHOLE. The defect is VIEWPORT ARITHMETIC in `nextJump`.

Every layer works, driven by a **real CC turn**:

| Layer | Observed |
|---|---|
| hook → socket → backend | `{is_turn_start: true, state: "running", workspace_id: "ws-1", …}` |
| `shouldRecordTurnStart` | `verdict: true` on the CC pane; correctly `false` on the shell pane (`ws-1-term-0`) |
| `registerMarker()` | live marker, `isDisposed: false` |
| `nextJump` → `scrollToLine` | returns `moved: true` |

**⚠️ THE DEFECT, with the arithmetic that proves it.** On a live pane after two real turns:
`markerLines: [19, 137]` · `length: 198` · `rows: 68` · `baseY: 130` → `maxScroll = 198 − 68 = 130`.

| Click | Target | `viewportY` | Effect |
|---|---|---|---|
| 1 | newest marker, line **137** | 130 → **130** | **nothing moves** (137 > maxScroll 130, so `scrollToLine` clamps to where we already are) |
| 2 | older marker, line **19** | 130 → **19** | jumps — but **two turns back** |
| 3 | walk exhausted | 19 → 19 | `moved: false` → **button dims** |

⚠️ **`moved` reports TARGET-SELECTION, not VIEWPORT MOVEMENT.** A marker already inside the
viewport counts as a successful jump, so click 1 is consumed doing nothing and the walk advances
past it. **The newest turn's start is STRUCTURALLY almost always unreachable** — a turn that just
ended leaves the cursor near the buffer end, and everything within `rows` of the end is already on
screen. That exactly reproduces the operator's report at every turn count.

**Fix shape:** `nextJump` must skip markers that would not move the viewport, which means it needs
`maxScroll` (`length − rows`) passed in — the pure model currently has **no viewport geometry at
all**. That is a signature change, and it raises a spec question (below), so it is not a one-liner.

### ⚠️ TWO EARLIER CONCLUSIONS OF THIS PROBE WERE WRONG — retracted here

Both came from measuring with `claude -p "say ok"`, a turn far too short to overflow 68 rows:

1. **"CC's pane accumulates no scrollback"** — **FALSE.** `baseY: 130` on a real turn.
2. **"Successive turns mark the same line"** — **FALSE.** `[19, 137]`, distinct.

⚠️ **The transferable lesson, and it is the THIRD instance on this WP:** a degenerate input
(one-line turn) produced a confident, coherent, wrong generalization — the same failure shape as
3.1's typings-only refutation. **A measurement's INPUT must be representative of the use case, or
the reading is about the input, not the system.** The operator's pain case is a 10-min / 100+-line
turn; that is the only input that exercises the buffer.

### ⚠️ CLAIM SPLIT: "in-place repaint" is TRUE of one CC profile and FALSE of Claudesk's pane

Operator-supplied screenshots settled a distinction the WP had been conflating:

- **Default-config CC profile:** CC draws its **own** "Jump to bottom (click) ↓" affordance, and the
  host scrollbar sits at the bottom while CC's content does not. **CC owns its scroll region** —
  history is NOT in xterm's scrollback. This IS in-place repainting.
- **Claudesk's pane:** content and scrollbar move **together** when scrolled; no CC-drawn jump
  button. **Append-only with real scrollback** — corroborated by `baseY: 130`.

⚠️ **CC-managed-scroll is OUT OF SCOPE** (operator, 2026-08-25). The feature targets Claudesk's
append-only pane. ⚠️ **Do not cite "CC repaints in place" as a constraint on this WP** — it
describes a profile Claudesk does not use.

⚠️ **A contaminated measurement, recorded so it is not mistaken for evidence:** a line-content diff
run to test the repaint claim reported `changedInSettledHistory: 12` — but every changed line was
the CC welcome banner **reflowing to a wider terminal** (an HMR-triggered re-fit between snapshots),
`appendedCount: 0`. **That diff proves nothing about repainting.** The screenshots are the evidence.

### Refuted candidate causes (do not re-derive)

- **`CLAUDE_CODE_CHILD_SESSION=1` suppressing hooks** — REFUTED by A/B: hooks fire fine with it set.
  (It IS inherited by any CC pane spawned from an agent-launched dev app, and it does suppress
  transcript writes — but not hooks.)
- **A dev-vs-prod CC config divergence** — REFUTED by reading `cc_spawn_env`: it sets only `TERM`,
  `COLORTERM`, `LANG`, `LC_ALL` (+ gated `CLAUDESK_DRIVE_MODE`). **No `CLAUDE_CONFIG_DIR`, no `HOME`
  override**; `env_clear()` is explicitly forbidden. The probed pane read the real `~/.claude`
  (carried `CLAUDE_EFFORT`, telemetry vars, `--model opus` from `projects.json`).
- **Stale dev binary** — REFUTED: binary mtime postdated the last backend source edit.
- **MCP bridge in the prod build** — it is `#[cfg(debug_assertions)]`, so **prod cannot be probed**
  at all. Only the dev build is instrumentable.

### ⚠️ SCOPE GREW AT RE-ADMISSION — bidirectional navigation (operator, 2026-08-25)

> *"Current UI/UX is bad. there should be a move up 1 turn and move down 1 turn. Just like in the
> 'find' feature. Otherwise it's gonna be difficult to navigate back and forth"*

The single backward-only jump button is **rejected as the affordance**. The re-spec must design a
**prev/next turn pair** on the find-widget model (two buttons, bidirectional, stateful position),
NOT one button that walks one way and dead-ends. ⚠️ This supersedes the 3.1 write-up's
"jump BUTTON" recommendation, which assumed a single direction.

### The spec question the defect raises

"Jump to previous turn start" needs defining for the case where that start is **already visible**:

- **(a)** Skip it — target the newest turn start actually **off** screen. *(Recommended: matches
  "get me back to where output I can't see began.")*
- **(b)** Treat already-visible as success and say so — no movement, no dim, honest message.
- **(c)** Scroll it to the **top** of the viewport rather than clamping — needs room below, which
  does not exist at the buffer end.

⚠️ With bidirectional navigation now in scope, this question compounds: `prev`/`next` need a shared
notion of "current position in the turn list" that survives both directions and new turns arriving.

### Current status

- Task 3.1 ✅ (feasibility, mechanism vindicated) · this probe ✅ (defect identified + reproduced)
- **Task 3.2 (re-spec) is the next action** — `/feature-spec`, scoped to Claudesk's append-only
  pane, with bidirectional prev/next and the already-visible question resolved.
