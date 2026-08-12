---
shape: temporary-wbs
cycle: backlog-paydown-2026-08-12
created: 2026-08-12
status: not-started
parent-backlog: workflow-system/state/backlog.md (+ workflow-system/state/backlog-quality-findings.md)
---

# Backlog-Paydown Sweep — 2026-08-12

> ⚠️ **This is NOT a roadmap milestone.** It reserves no milestone number, and milestone
> numbering is untouched (M13 is still next). **This file is DELETED on completion** — see
> §"Fold back and delete" at the bottom. Do not treat it as a durable doc; do not resync it
> into `arch.md`.

**Run at:** the clean boundary after M12 closed (2026-08-12), before M13 decomposition.
**Inventory:** 143 discrete items across the two coupled backlog files — which collapse into
**10 themes**. That collapse is the whole point: ~66 discrete MINORs are ~10 repeated mistakes.
**Fix the theme once, not the instance N times.**

## Effort anchor (this project, do not import another's)

Benchmarked against Claudesk's own recently-archived WPs: a WP = one shipped commit + a review
pass, roughly a day (M11 ran WP1–WP5 across 2026-08-01→08-02; M11.5 WP4 was a single-commit
guard sharpening, `0bac2c6`). Therefore **WP-sized → Medium; sub-WP → Small/XS.** On that scale
nearly every finding here is Small — which is exactly what Rule 1 is built to catch.

## Disposition model (applied — reproduced so build sessions rule consistently)

- **Impact** = feature value + maintainability, where maintainability = quality × P(future touch).
- **Effort** = implementer time, benchmarked above.
- **Risk** = P(breaks something the suite won't catch). Suite-relative; a fix that adds the
  missing test lowers its own risk.
- **Rule 1 — cheap + safe → ALWAYS Sweep, no exception.** You can never truly know when code
  dies (the ~5% survivor), and **closing the entry de-clutters the backlog, which is itself an
  impact term.**
- **Rule 3 — severity is an INPUT to impact, not a parallel sort key.**
- **Ordering:** deletions → low-risk → high-impact → co-location. **Effort is not an ordering key.**
  Risk outranks impact, which is why deletions sort first even when low-impact.

---

## WP1 — Delete dead code that is still registered  `[impact: Med · effort: XS · risk: Lowest]`

Pure subtraction, so it runs first — it can only shrink surface.

- `SURFACE-2026-08-01-PROJECT-GET-DEFAULT-MODEL-NOW-DEAD-CODE` — **verified during this sweep:**
  the command is still registered at `src-tauri/src/lib.rs:447` and wrapped at
  `src/cc/modelOverrideIpc.ts:36`, but every remaining mention of it in `ProjectModelCell.tsx`,
  `ProjectPicker.tsx`, and `applyCommittedModel.ts` is a **comment describing its own removal**.
  Live registration, zero live callers.
  ⚠️ Removing a `#[tauri::command]` needs a frontend `invoke()` sweep + smoke-launch — the
  binding is stringly-typed and invisible to the unit gate.
- `SURFACE-2026-08-03-QUALITY-WP2-DEAD-CODE-ALLOWS-SURVIVE-CLOSE`
- `SURFACE-2026-08-10-ALLOW-DEAD-CODE-OUTLIVING-ITS-CONSUMER-IS-INVISIBLE-TO-THE-GATE`

**Resolves theme T9 (3 items).**

## WP2 — Sharpen the OFF-invariant guard's arms  `[impact: High · effort: S · risk: Low]`

All five items live in **one file** (`src/state/__tests__/offInvariantGuard.test.ts`, 805 lines).

⚠️ **Do this BEFORE M13**, which owns a *fifth* arm for its skill-button surface. Building a new
arm on top of predicates known to be too coarse just propagates the coarseness.

- `SURFACE-2026-08-12-CHORD-ARM-GATE-EXEMPTION-IS-WHOLE-MODULE` — the arm exempts any module that
  merely *mentions* the gate seam, permanently excusing `panelHost.ts`.
- `SURFACE-2026-08-01-OFF-INVARIANT-CHORD-ARM-PREDICATE-IS-MODULE-LEVEL-NOT-PER-EXPORT`
- `SURFACE-2026-08-01-QUALITY-WP4-CHORD-SELECTOR-MISSES-EXPORT-FORMS`
- `SURFACE-2026-08-01-QUALITY-WP4-SELECTOR-IS-NAME-NOT-CONTENT`
- `SURFACE-2026-08-01-QUALITY-WP4-ARM-GUARDS-PREDICATES-NOT-REGISTRATION`

⚠️ **Probe each arm INDIVIDUALLY.** A composite bypass that trips *some* arm reports "the guard
bites" while hiding a gap. And **an invalid probe and a real hole present identically** — verify
the probe's premises before weakening anything (`SURFACE-2026-08-12-...-WHOLE-MODULE` is itself the
record of a valid-looking probe that passed 19/19 for the wrong reason).

**Resolves theme T2 (5 items).**

## WP3 — Fix `?raw` guards that silently stopped checking  `[impact: High · effort: S · risk: Low]`

The single largest theme, and the highest-value one: **a guard that silently passes is worse than
no guard**, because it reads as coverage. This class has burned this repo **four separate times**.

Common fix: whitespace-flattened haystacks, single-identifier or boundary matchers, strip comments
first, and **extract-for-import** where the property is behavioral rather than textual.

- `SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`
- `SURFACE-2026-07-29-QUALITY-WP3-POSITIONAL-RAW-SLICING`
- `SURFACE-2026-08-03-QUALITY-WP1-RAW-GUARD-INTERFACE-SLICE-TRUNCATES`
- `SURFACE-2026-08-05-RAW-GUARD-BROKEN-BY-PRETTIER-AND-FORMAT-CHECK-MISSING-FROM-GATE`
- `SURFACE-2026-08-06-RAW-GUARD-SATISFIED-BY-ITS-OWN-ASSERTION-LINE`
- `SURFACE-2026-08-02-CSS-CLASS-GUARDS-MAY-USE-SUBSTRING-NOT-BOUNDARY-MATCH`
- `SURFACE-2026-07-29-CFG-TEST-SPLIT-BLINDS-SOURCE-GUARDS`
- `SURFACE-2026-08-10-QUALITY-WP4C-POINTERDOWN-GUARD-DEGENERATES`
- `SURFACE-2026-07-14-QUALITY-WP6B2P4-CLEAR-PIN-NOT-SCOPED`
- `SURFACE-2026-07-28-QUALITY-WP2-ALLOWLIST-TEST-HALF-TAUTOLOGICAL`
- `SURFACE-2026-07-29-REMEMBER-TO-REGISTER-GUARDS-ARE-NOT-GUARDS`

⚠️ **Mutation-prove each fix in both directions** — confirm the mutation changed *executable code*
(`sed -n '<line>p'` the mutated line), since a silent no-op looks exactly like a real guard hole.

**Resolves theme T1 (11 items).**

## WP4 — Assert the CALLER, not the primitive  `[impact: High · effort: S · risk: Low]`

A fully mutation-proven module can sit behind a caller that never invokes it correctly — hit twice
in M11 WP4, **one of them a shipped CRITICAL**. Fix: funnel writes of shared state through ONE
function and guard *that*; drive the boundary, not the extracted helper.

- `SURFACE-2026-08-05-NO-FIRE-INTENT-DOES-NOT-CROSS-THE-IPC-BOUNDARY`
- `SURFACE-2026-08-07-QUALITY-WP4B-SHELL-SEAM-ASSERTS-THE-PRIMITIVE-NOT-THE-CALLER`
- `SURFACE-2026-08-05-QUALITY-WP3-INDICATOR-BYPASSES-THE-WIRE-SEAM`
- `SURFACE-2026-07-08-QUALITY-WP5-GATE-BODY-APPHANDLE-HOP-UNTESTED`
- `SURFACE-2026-07-17-QUALITY-WP3-SHORTCIRCUIT-TEST-PINS-SHAPE-NOT-ORDERING`

⚠️ Directly relevant to M13: **enumerating skills/routes as data makes the SET testable but does
NOT prove each member has a CALLER** (M12 shipped a `/exit` variant called by nothing). A skill
registry is that exact shape at larger scale.

**Resolves theme T5 (5 items).**

## WP5 — Make vacuous verification decisive  `[impact: Med-High · effort: S · risk: Low]`

Each item is evidence that could not have come out differently under a broken implementation.
Fix: assert a **count**, or prove the observation would differ if the code were wrong.

- `SURFACE-2026-08-02-BROWSER-SUPPLIES-THE-ANSWER-SO-SCROLL-RESTORE-CHECKS-ARE-VACUOUS`
- `SURFACE-2026-07-29-CARGO-TEST-FILTER-OUTCOMES-ARE-VACUOUS-WITHOUT-A-COUNT`
- `SURFACE-2026-08-02-JSDOM-CLIENTHEIGHT-IS-ZERO-FOR-VISIBLE-ELEMENTS-TOO`
- `SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED`

**Resolves theme T7 (4 items).**

## WP6 — Collapse duplicated constants onto one source of truth  `[impact: Med · effort: S · risk: Low]`

Each is a documented drift channel. Fix: derive the copy, or make the original `pub(crate)`.

- `SURFACE-2026-07-29-QUALITY-WP3.5A-CLONE-DIR-NAME-DUPLICATED`
- `SURFACE-2026-07-29-QUALITY-WP3.5A-PROVENANCE-FETCH-DUPLICATED`
- `SURFACE-2026-07-13-QUALITY-MINQUANT-HELPER-PARITY-UNPINNED`
- `SURFACE-2026-08-01-QUALITY-WP2-MINOR-BATCH` (item 4 — `validate_frontend_root`)
- `SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE`
- `SURFACE-2026-08-01-TWO-HOOK-DRAINS-FILTER-DIFFERENTLY-UNDOCUMENTED`

**Resolves theme T8 (6 items).**

## WP7 — Audit the 13 CSS modifier selectors by hand  `[impact: Med · effort: XS · risk: Low]`

**Operator ruling (D1, 2026-08-12): Option A — make the code honest now; do not build the
repo-wide checker in this sweep.**

The backlog entry implies a large surface (*"`App.css` is ~3400 lines with many component
blocks"*). **Measured during this sweep: 4147 lines, 298 class blocks, but only 13
`.block.is-*/.has-*` modifier selectors** — and the modifiers are the ones carrying behavior.
13 is a hand-checkable set, not a codegen problem.

Check each of the 13 against its emitting component, in both directions (styled-but-never-emitted
/ emitted-but-never-styled). Fix any orphan found. Then **rewrite** — do not delete —
`SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT` to describe only the
remaining open work: the general bidirectional guard (partial-resolution carve-out).

⚠️ Two traps already learned by false positive at WP5: defining *"emitted"* is the hard part
(`data-testid`s share the class naming convention, so proximity to `className` is the only honest
signal), and **comments must be stripped first** (a design-prior slug ending `-is-chosen` demanded
CSS for a class that exists only in prose).

## WP8 — Correct stale and over-claiming doc/test-name claims  `[impact: Med · effort: S · risk: Low]`

⚠️ **Grep the retracted CLAIM repo-wide — the item list below is a FLOOR, not a boundary.** This
has paid off on first use in two consecutive WPs.

- `SURFACE-2026-08-12-A-COMMENT-CREDITED-COVERAGE-TO-A-SWEEP-THAT-DOES-NOT-EXIST`
- `SURFACE-2026-08-07-DOC-COMMENT-CITED-A-NONEXISTENT-TEST`
- `SURFACE-2026-08-05-QUALITY-WP3-STALE-WHOLE-FEATURE-GATE-DOCS`
- `SURFACE-2026-07-29-SETTINGS-PRESERVES-OTHER-FIELDS-TEST-NAME-OVERSTATES-ASSERTION`
- `SURFACE-2026-07-29-QUALITY-WP3-KEBAB-CASE-CLAIM-UNTESTABLE`
- `SURFACE-2026-07-29-QUALITY-WP3-STALE-SIBLING-TEST-NAME`
- `SURFACE-2026-08-01-PRIVACY-TEST-IDENTIFIER-IS-STALE-IN-FOUR-DOCS`
- `SURFACE-2026-07-20-QUALITY-WP7-STALE-COMPILE-GAP-TEST-COMMENT`
- `SURFACE-2026-07-18-QUALITY-WP2-SEAM-DOC-FORWARD-REF`
- `SURFACE-2026-08-01-QUALITY-WP1-SANITIZE-STRICTNESS-UNTRACED`

**Resolves theme T4 (10 items).**

## WP9 — Fold the instrument traps into the bridge-caveat chain  `[impact: Med · effort: S · risk: None]`

Docs-only. One consolidated addition to `docs/lessons/mcp-tauri-bridge-caveats.md`, each trap with
its concrete selector/instrument. These are exactly the caveats that have produced false verdicts.

- `SURFACE-2026-08-10-SCROLLWIDTH-IS-BLIND-TO-SUBPIXEL-TEXT-CLIPPING`
- `SURFACE-2026-08-07-XTERM-ROWS-INNERTEXT-READS-EMPTY-AND-FAKES-A-BLANK-PANE`
- `SURFACE-2026-08-05-XTERM-DOM-ROWS-ARE-NOT-THE-BUFFER`
- `SURFACE-2026-08-02-RAF-DOES-NOT-TICK-IN-MCP-BRIDGE-EVAL-CONTEXT`
- `SURFACE-2026-08-10-CSS-BOX-MATH-WAS-WRONG-THREE-TIMES-IN-ONE-COLUMN`

⚠️ That doc is **grep-addressed** — move text near-verbatim; identifier density IS the value.
Do not compress into flowing prose.

**Resolves theme T6 (5 items).**

## WP10 — Registry and doc one-liners  `[impact: Low · effort: XS · risk: Low]`

Included purely by **Rule 1 / Rule 2 tiebreak**: cheap + safe wins even at low value, because
closing the entry de-clutters the backlog.

- `SURFACE-2026-07-28-RUNTIMES-CARGO-TEST-ENTRY-HAS-DUPLICATE-BLOCKS`
- `SURFACE-2026-08-01-QUALITY-WP1-RUNTIMES-UNDERCOUNTS-OBSERVATIONS`
- `SURFACE-2026-07-16-QUALITY-WP7-CLAUDEMD-WP2-WIREFIELD-COUNT`
- `SURFACE-2026-07-16-QUALITY-WP7-WBS-FRONTMATTER-STALE`

**Resolves theme T10 (4 items).**

## WP11 — Trim comment-density / provenance narration  `[impact: Low-Med · effort: S · risk: Low]`

Runs **last** deliberately: it touches the most files for the least behavioral value, and an
interrupted sweep should not stop halfway through a cosmetic pass.

Fix: move WHAT-happened narration to the WIP/archive; keep invariants and ⚠️ markers at the code.

- `SURFACE-2026-08-02-QUALITY-WP5-COMMENT-DENSITY-NEEDS-A-BUDGET-NOT-A-TRIM`
- `SURFACE-2026-08-02-QUALITY-WP4-MINOR-BATCH` (item 1)
- `SURFACE-2026-08-02-QUALITY-WP3-COMMENT-DENSITY-PAST-USEFUL`
- `SURFACE-2026-08-01-QUALITY-WP2-MINOR-BATCH` (items 1–2)
- `SURFACE-2026-08-07-QUALITY-WP4B-INCIDENT-NARRATIVE-TRIPLE-RECORDED-IN-CODE-COMMENTS`
- `SURFACE-2026-08-03-QUALITY-WP1-HAZARD-TEST-DOC-COMMENT-LENGTH`
- `SURFACE-2026-08-01-QUALITY-WP3-TEST-COMMENTARY-TRIPLICATES-WIP-PROSE`
- `SURFACE-2026-07-29-QUALITY-WP3.5A-DEFEAT-NARRATIVE-IN-TEST-COMMENT`
- `SURFACE-2026-07-28-QUALITY-WP2-MILESTONE-RATIONALE-RESTATED-SIX-TIMES`
- `SURFACE-2026-08-10-QUALITY-WP4C-ASYMMETRY-WARNING-STATED-THREE-TIMES`

⚠️ **Budget, don't blanket-trim** — the item's own framing. And note the second-order lesson from
that review: at high comment density, **prose that is 95% accurate reads as authoritative**, and
the wrong 5% is what gets acted on.

**Resolves theme T3 (10 items).**

---

## Scope — what's NOT swept (anchors intact)

### Done during the sweep itself (2026-08-12, commit `f4f372a`)

- **`SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`** — the only `high` item in
  the backlog. **Operator ruling (D2): handed off, not deferred.** Its target level is the
  pause-policy blocks in `transitions.md` + all four `agents/*/AGENTS.md` — **owned by
  `my-claude-code-customization`, not Claudesk**, so no Claudesk WP could ever close it. Written up
  as `HANDOFF-from-claudesk-2026-08-12.md` in that repo (left uncommitted there for operator
  review) and deleted from this backlog per CHANGELOG-then-delete.
- **`SURFACE-2026-08-02-PROJECT-MEMORY-SYMLINK-NOT-IN-PLACE-TWO-COPIES-DRIFT`** — **Delete.**
  Verified during the sweep: `~/.claude/projects/-Users-stayman-Personal-projects-claudesk/memory`
  resolves to `.claude/memory`. Not a defect; the item says so itself.
- **`Code-quality findings — per-project-cc-model-override (2026-07-31)`** — **Delete.** Verified:
  **zero** coupled body remains in `backlog-quality-findings.md`; the stub self-describes as
  "safe to prune at any cycle-close sweep."

### Deliberately kept

- **`SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-LEAVE-DATA-SVG-AND-STYLE`** — moot under the WP1
  verdict, but **retained as evidence**. Not deleted.

### Deferred — anchored to M13

- `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` — an unanswered **product** question
  (does a typed `/exit` count as a clean exit?), not debt. M13's Recycle work sits right next to it.
- `SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT` — 24 of 524 opens;
  a skill-button surface is where it gets fixed. That surface is M13.

### Deferred — net-new feature work, not debt

Everything the inventory typed `new-work`/`feature` (8 items). Per the skill: *a feature-collection
backlog is not a debt sweep.* These belong to roadmap/WBS planning, and they stay in the backlog
untouched.

### Buried — the "meh" zone

Items already under `## Buried` stay there. **Burying is not resolving** — delete-on-resolve does
**not** fire on them, and they get no CHANGELOG line.

---

## Fold back and delete

On completion of the WPs above:

1. Confirm each named finding is genuinely **RESOLVED** — not "addressed in passing."
2. For each resolved item: append its `**Backlog resolved:**` line to `CHANGELOG.md` **first**,
   then delete the entry, then **stage both in the same commit**. The invariant: *no backlog delete
   without its CHANGELOG line in that same commit.*
3. ⚠️ **The two backlog files are COUPLED** — a code-quality finding's deletion takes **both** the
   body in `backlog-quality-findings.md` **and** its pointer stub in `backlog.md`.
4. ⚠️ **Partial resolution → REWRITE, do not delete** (WP7 is exactly this case).
5. **Delete this file** (`workflow-system/product/backlog-paydown-wbs.md`). It reserves no roadmap
   slot and must not survive as a durable doc.
