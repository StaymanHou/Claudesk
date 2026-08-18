---
shape: temporary-wbs
cycle: backlog-paydown-2026-08-18
created: 2026-08-18
status: in-progress (WP1-WP5 done 2026-08-18; WP6 next)
parent-backlog: workflow-system/state/backlog.md (+ workflow-system/state/backlog-quality-findings.md)
---

# Backlog-Paydown Sweep — 2026-08-18

> ⚠️ **This is NOT a roadmap milestone.** It reserves no milestone number, and milestone
> numbering is untouched (M14 / M15 are still next, in an order that remains an open operator
> call). **This file is DELETED on completion** — see §"Fold back and delete" at the bottom. Do
> not treat it as a durable doc; do not resync it into `arch.md`.

**Run at:** the clean boundary after M13 closed + v0.3.3 shipped (2026-08-18), before M14/M15
decomposition. `wip/` empty, tree clean, release published.

**Inventory:** 34 open SURFACEs + **44 discrete code-quality findings** across 18 headings
(0 CRITICAL · 5 MAJOR · 39 MINOR) — which collapse into **12 themes**. That collapse is the whole
point: ~39 discrete MINORs are ~12 repeated mistakes. **Fix the theme once, not the instance N times.**

**Mode:** 3 (Autopilot) — unambiguous dispositions auto-applied; the three Discuss items were
ruled by the operator (see §Discuss rulings).

## Effort anchor (this project, do not import another's)

Benchmarked against Claudesk's own recently-archived WPs: a WP = one shipped commit + a review
pass, roughly a day (M13 ran WP1–WP4 across 2026-08-14→08-18; M13 WP2 was a single-commit gated
surface, `bd67758`). Therefore **WP-sized → Medium; sub-WP → Small/XS.** On that scale nearly every
finding here is Small — which is exactly what Rule 1 is built to catch.

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

## Discuss rulings (operator, 2026-08-18)

Three items scored to Discuss (Rule 6). All three were ruled after reading the real code — **and
one ruling was materially changed by what the code said.**

- **D1 — Recycle uncancellable across unmount → Option A.** On abort after a successful handoff
  but before the respawn, **the clean mark STAYS correct.** The handoff genuinely completed and
  `.session.md` is on disk, so a `--continue` on next open would resume a session that was already
  cleanly handed off — the wrong offer. Abort only stops the respawn. ⚠️ **This means NO
  `mark_unclean` primitive is introduced** (setting stays owned by the spawn path). → WP7.
- **D2 — `CLAUDESK_DRIVE_MODE` descendant inheritance → Option A.** The inheritance is
  **CORRECT, not a defect**: a nested `claude` inside a workspace *is* working on that project, so
  the workspace's mode is the right answer. The fix is **documentation only** — correct the
  containment story, which currently claims a narrower radius (CC-yes / login-shell-no) than
  reality. ⚠️ **Do NOT reach for `env_clear()`** — it strips `PATH`/`LANG`/`TERM` and would break
  both the M10.5 mojibake fix and the GUI-PATH spawn fix. → WP3.
- **D3 — `projects.json` / settings whole-file RMW → Option B (sweep now, not deferred).**
  ⚠️ **The backlog summary OVERSTATED this, and the sweep-time code read narrowed it — do not
  re-inflate it at build time.** Both `write_settings` (`settings.rs:186`) and `write_projects`
  (`mod.rs:177`) **already write atomically** (write-to-`*_TMP_FILE` → `fs::rename`), so this is
  **NOT** a torn-write / file-corruption problem. The real and only exposure is a **lost update
  across the read→modify→write window**: two writers interleaving clobber one field. That makes it
  smaller and lower-risk than filed — but it is still the riskiest item in this sweep, so it sorts
  **LAST** (risk outranks impact). → WP8.

---

## WP1 — Declaration hygiene: visibility + placement  `[impact: Med · effort: XS · risk: Lowest]`  ✅ DONE 2026-08-18

> **CLOSED** — archived at `workflow-system/state/archive/paydown-wp1-declaration-hygiene.md`.
> ⚠️ **Two of the four filed items were not what the filing said, and a future WP should expect the
> same:** the `recycleSession.ts` item named `waitForFreshSessionId` as misplaced, but that function
> has **no in-file caller** — only its two default-value constants were late (hoisted). And the
> `DocsPanel.tsx` `selected` item had **expired**: it was filed as "no consumer *until WP3*", and
> WP3/WP4/WP5 have shipped, so it was recorded **no-change-needed with evidence** rather than turned
> into an invented edit. ⚠️ **A backlog finding carries an implicit as-of date** — re-read the code,
> not the summary. The T2 dedup is now **compile-enforced** (`E0255` on a re-introduced copy), which
> is stronger than the finding asked for.

Pure subtraction/narrowing, so it runs first — it can only shrink surface. **Serves T10, and closes
one T1 duplication instance for free.**

- `session_state::is_unclean` is `pub` with **no external callers** (`session_state/mod.rs:188`,
  grep-confirmed still `pub`). ⚠️ **`pub` suppresses `dead_code`**, so the ledger discipline cannot
  see it — narrow to `pub(crate)`.
- `editor_fs`'s `validate_frontend_root` (`editor_fs/commands.rs:34`) is copied **verbatim** into
  `docs/commands.rs:40` (both grep-confirmed present). **`pub(crate)` on the original + delete the
  copy** — one keyword closes a T1 instance.
- `waitForFreshSessionId` + 2 constants in `recycleSession.ts` are defined **after** use — move up.
- `DocsPanel.tsx` `selected` (`:29,95`) has no consumer; the header says so, the code does not.

**Resolves theme T10 (4 items) + 1 of T1.**

## WP2 — Over-claiming prose: narrow every claim to what the code does  `[impact: Med · effort: S · risk: Low]`  ✅ DONE 2026-08-18

> **CLOSED** — archived at `workflow-system/state/archive/paydown-wp2-over-claiming-prose.md`.
> **6 narrowed · 1 REFUTED · 1 wider than filed.** ⚠️ **Item 2 (the "vice versa" test) is REFUTED
> — do NOT re-file it:** the body asserts both directions (`config_store/mod.rs:1427-1436`); the
> name is accurate. ⚠️ **Item 1 was ~5× its filed scope (11 sites, not 2) AND contained 7 sites
> that must NOT change** — past-tense narration where `⏵` is the correct subject; `ProjectPicker.tsx:550`
> stays the single authority on the glyph. ⚠️ **"Re-anchor by SYMBOL" is necessary but INSUFFICIENT**
> — it gets you to the right code; you still must judge whether the claim is wrong *there*.

The **highest-count theme (8 instances)**, all cheap, all documentary. ⚠️ **Line numbers have
drifted — App.tsx moved ~106 lines. Re-anchor by SYMBOL, never by the recorded line.**

- `pickerRowOrder.ts:52,76` still say "the `⏵` cell" after the glyph became `⊘`.
- `set_default_drive_mode_leaves_the_model_override_untouched_and_vice_versa` — the test **name
  promises "vice versa"; the body never asserts it.** Either assert it or rename.
- `headingSlug` comment claims it "mirrors GitHub's algorithm" — **overstates by one rule** (no
  collision suffix). Narrow the claim (the behavior itself is WP6).
- `src/App.tsx:306-308` "Verdict (b)'s requirement" — **two different Verdict (b)s** now cite the
  same site (M10.9's and M12 WP1's). Disambiguate.
- `showRecycleButton`'s doc claims independent divergence, but it renders **inside**
  `showSkillButtons(…) &&`, so the row's gate **strictly dominates** — the documented divergence is
  unreachable. State the real relationship. *(Do NOT "fix" it by un-nesting — the dominance is
  correct; only the doc over-claims.)*
- `m11-wp4` MINOR (3) — `plan.apply && el !== null`: the second conjunct is unreachable as a
  condition (exists only for `tsc` narrowing) and undercuts the `isMeasurable`-as-type-predicate
  rationale 200 lines earlier.
- `cc_session/mod.rs` ~205 `build_cc_argv` — the `--permission-mode default` "harmless no-op" doc
  claim is load-bearing but rests on an **untested CC-CLI assumption**. Mark it as an assumption.
- `updater/commands.rs` finish emit sends `downloaded: 0` (`:156`, `:275`) — harmless
  (`progressPercent` short-circuits on `done`) but reads as a lost value. Note or fix.

**Resolves theme T3 (8 items).**

## WP3 — Reconcile conflicting precedents + the containment story  `[impact: Med-High · effort: S · risk: Low]`  ✅ DONE 2026-08-18

> **CLOSED** — archived at `workflow-system/state/archive/paydown-wp3-conflicting-precedents.md`.
> **4 genuine · 2 REFUTED · 1 was a BEHAVIOR gap, not prose.**
> ⚠️ **Two filings are REFUTED and "reconciling" either would REGRESS — do NOT re-file:**
> (a) `expected_context()`'s duplication is the **drift detector** — sharing the literal leaves two
> mirrors agreeing with each other; (b) the "single listener" rule governs **app-global** values
> (`usePipMode`), while `fs-change` is **per-workspace** — 3 listeners are correct. Discriminator:
> CARDINALITY. Both now recorded at their sites.
> ⚠️ **D2 applied documentation-only** — the var DOES reach the whole descendant chain and that is
> intended; `env_clear()` remains forbidden.
> ⚠️ **The reload-error guard was mutation-REFUTED on its first draft** (a bare-identifier assertion
> satisfied by the declaration + the success-path clear) and rewritten to a call shape.

⚠️ **This is the theme most likely to produce a FUTURE defect** rather than describe a present one:
each pair leaves the next consumer inheriting two contradictory rules. **One sentence each** naming
which rule governs and why the other is exempt — or a conversion. **Includes the D2 ruling.**

- **D2 (documentation-only):** correct the `CLAUDESK_DRIVE_MODE` containment story at
  `cc_spawn_env` — the var reaches the **entire descendant chain** (no `env_clear` anywhere,
  grep-confirmed), not just CC. State that this is **intended**: a nested `claude` in a workspace
  is working on that project. ⚠️ **Do NOT add `env_clear()`.**
- **Render-phase ref writes:** `XtermPane.tsx:280` does it; `Workspace.tsx:196-199` documents it as
  an eslint **ERROR** — two opposite rules **in one commit**.
- **Per-workspace `fs-change` listeners:** `m11-wp4` added a second one while
  `RightPanelHost.tsx:315-317` documents "reuse the single listener."
- **Duplication rule:** `hook_pl_output.rs::expected_context()` duplicates the script's sentence
  literal 3 lines from a test whose stated principle is the opposite.
- **Error-surfacing asymmetry:** the docs reload path swallows a `docs_list` failure with no
  `setError` while the initial fetch surfaces it — against the file's own "surfaced, never
  swallowed" convention. ⚠️ A permanently-unreadable doc dir currently reads as *"nothing is
  changing."*
- **Escape-branch asymmetry:** `src/App.tsx` Escape block (now ~`:374-390`) has **no `return`** and
  falls through to `isSettingsChord(e)`; the sibling dashboard-chord branch *does* return.

**Resolves theme T4 (6 items) + T8's `arch` half + the D2 ruling.**

## WP4 — Test integrity: make each test able to fail  `[impact: High · effort: S · risk: Low]`  ✅ DONE 2026-08-18

> **CLOSED** — archived at `workflow-system/state/archive/paydown-wp4-test-integrity.md`.
> **The MAJOR was REPRODUCED before being fixed** (the leaking mutation left all 2119 tests green)
> and the same mutation now goes red. ⚠️ **Filed accurately — the first WP in this sweep needing NO
> correction.** ⚠️ **The dedup item's real insight was the UNPINNED PREMISE**, not the test shape:
> the "currently UNREACHABLE" claim had nothing asserting it. New disjointness guard sits ALONGSIDE
> the branch test — neither substitutes for the other. ⚠️ **`DayPayload.empty` is dead on the IPC
> path and was DELIBERATELY not wired up** — that would add a second source of truth for emptiness.
> ⚠️ **A brittleness fix must be proven in BOTH directions** (re-tint passes / dropped peak fails);
> proving only the first is indistinguishable from deleting the test.

The project's own named discipline (`docs/lessons/source-text-guards.md`) recurring as findings.
**Carries one behavioral MAJOR.** The standing test: *could this still pass if the code it names
were deleted?*

- **MAJOR — late-subscription disposal is unreachable by the suite.** `recycleSession.ts:272,284`
  `settled ? un() : unlisteners.push(un)` — the test mock resolves its unlisten **synchronously**,
  so the `settled ? un()` half never executes. **Deleting it leaks one `fs-change` listener per
  Recycle and the suite stays green.** Fix: defer the unlisten resolution in the mock, then assert
  it was still called.
- `m11-wp2` MINOR (2) — a private-helper test for a dedup branch **no production input reaches**
  (`docs/mod.rs:184-201`, 9 comment lines guarding it).
- `DayPayload.empty` (`query.rs:137`, set at `:652`) is **dropped by `build_range`'s single-day
  path** and absent from `RangePayload` on both IPC sides — so the flag is either dead on the IPC
  path or needs surfacing. Its only test exercises the internal type.
- **Brittle tests (T6)** — three assert an incidental literal instead of the load-bearing property,
  so a **zero-behavior cosmetic change fails a test and reads as a regression**:
  - `settingsHighlight.test.ts:55,98` hardcode `rgba(120, 165, 240` — the real property is
    *"three peaks with troughs"*, assertable by **counting stops**.
  - `pickerRowGutterStructure.test.ts:63` still emits the stale `⏵` as fixture text.
  - `mirrorTrim.test.ts` fixtures use `<div><span>text</span></div>`, but real xterm output has
    **intra-row `</span><span style=…>` transitions**. The regex handles it; the fixtures
    under-represent reality (a future-reader trap).

**Resolves theme T5 (4 items) + T6 (3 items). Includes 1 MAJOR.**

## WP5 — Guard/verification-method hygiene  `[impact: Med · effort: S · risk: Lowest]`  ✅ DONE 2026-08-18

> **CLOSED** — archived at `workflow-system/state/archive/paydown-wp5-guard-hygiene.md`.
> **6 SURFACEs resolved** (the 5 filed + `NOTHING-ENFORCES-CARGO-FMT-EITHER`, filed by this sweep at
> WP1 and folded in rather than run as a second pass). Backlog 35 → 29 open.
> ⚠️ **`pnpm verify:auto` IS the gate now** — one command, proven to exit non-zero on BOTH a Prettier
> and a `cargo fmt` violation. There is no CI and no git hook, which is why prose was not enough.
> ⚠️ **The render-harness note is corrected in ONE authority** (`docs/lessons/source-text-guards.md`)
> — 29 files cite it; do NOT restate it at the citing sites. The original `SURFACE-2026-07-31` entry
> was **rewritten, not deleted**: its factual claim is refuted, its DECISION (an interaction harness)
> is still open.
> ⚠️ **The new failure form is the 10th, not the "8th"** — this line was written at an older count.
> ⚠️ **`hasBaseRule`'s first regex produced a FALSE POSITIVE** on a comma-group base rule; widened to
> `[{,]`. A guard that flags correct code is how guards get deleted.

Co-located with WP4 (same files/discipline). All doc-or-export moves; no behavior changes.

- **Export `hasBaseRule` from `src/test-support/cssRule.ts`** and audit the **4** `hasRule` call
  sites, deciding per site whether the question is *"mentioned"* or *"has a base rule"*.
  ⚠️ **`hasRule` is NOT at fault and must not be "fixed"** — its `:`-admitting boundary is
  deliberately correct. WP2 (M13) fixed only its own call site by **inlining** `hasBaseRule`; it was
  never exported (sweep-verified). ⚠️ Prove each fix by deleting a **base rule while leaving a
  modifier** — the mutant a `hasRule`-only guard passes.
  → resolves `SURFACE-2026-08-14-CSS-CLASS-GUARDS-SATISFIED-BY-A-PSEUDO-CLASS-MODIFIER`.
- **Amend the render-harness note.** `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` reads
  as *"component behavior can only be pinned by `?raw` guards"* — **half true**, and the
  discouraging half keeps steering work toward the guard style that has failed **four** times here.
  **2 files already render** via `renderToStaticMarkup` + jsdom (`docsRender.test.tsx`,
  `projectModelCellRender.test.tsx`); **10+ files still cite the old note** (sweep-verified). Amend
  the note and its citing files. ⚠️ **State the boundary in the same breath:** server rendering
  cannot dispatch events or transition state, and an async-seeded hook returns its **pre-seed
  default** (for `useWorkflowFeaturesEnabled` that is `false`, which is why only the gate-OFF shape
  is reachable). → resolves `SURFACE-2026-08-10-THE-NO-RENDER-HARNESS-NOTE-IS-HALF-TRUE`.
- **Restate never-block-CC as TWO properties**, not one: (1) always `exit 0`, **and** (2) stdout is
  byte-empty or **exactly one CC-accepted JSON object**. ⚠️ `status-channel-and-surfaces.md:28`
  currently frames it as *"the invariant survives unchanged"* — the second axis is real (a
  non-Object `hookSpecificOutput` raises an unhandled `TypeError` that **terminates the session**).
  Update `arch/` + the script header. ⚠️ Do **not** treat upstream `#57483` as stable — assert
  **our** shape is correct, never rely on CC crashing to detect a bad one.
  → resolves `SURFACE-2026-08-07-NEVER-BLOCK-CC-HAS-A-SECOND-UNGUARDED-AXIS-STDOUT-SHAPE`.
- **Add the 8th failure form to `docs/lessons/source-text-guards.md`:** *"the guard whose subject
  does not exist yet"* — a test pins the PRESENT; a scope commitment about FUTURE work belongs in
  the WBS/WIP. → resolves `SURFACE-2026-08-14-A-TEST-CANNOT-ENFORCE-A-FUTURE-SCOPE-DECISION`.
- **Put `pnpm format:check` in the per-phase verify-auto gate.** Root `CLAUDE.md:145` already
  mandates it ("a Prettier reflow silently broke a `?raw` guard, which then reported green while
  checking nothing") and **nothing enforces it** — no CI, no hook (sweep-verified).
  → resolves `SURFACE-2026-08-01-NOTHING-ENFORCES-FORMAT-CHECK`.

**Resolves 5 SURFACEs. Serves T5/T8.**

## WP6 — Boundary / off-by-one edges  `[impact: Med · effort: S · risk: Low]`

Two real (if small) correctness edges, both currently untested at the boundary.

- **`headingSlug` has no collision suffix** (`docs/classifyHref.ts:113-119`, grep-confirmed no
  counter). Headings differing only in punctuation emit duplicate ids, so the anchor reaches only
  the first. ⚠️ **The target corpus is exactly the collision case** — WBS/WIP docs with repeated
  `## Tasks` / `## Context` headings. Add the `-1`/`-2` suffix rule (and narrow the
  GitHub-algorithm claim, WP2).
- **Custom-window midnight extra day** (`time_store/commands.rs::resolve_window`, Custom arm
  ~`:462-467`): `end_ms` exactly on local midnight is excluded by the half-open `ts < end`, but
  `end_day` resolves to the **next** day → one extra all-empty trailing day. Pin the boundary.

**Resolves theme T9 (2 actionable items).**

## WP7 — Make Recycle abortable across unmount  `[impact: High · effort: S-M · risk: Med]`  ⚠️ D1

**Carries one behavioral MAJOR, and it is the sharpest item in the sweep.** Today: closing a
workspace mid-Recycle leaves the unclean-exit flag **cleared** for a session that was **never
respawned** — `markSessionClean` fires at `recycleSession.ts:339`, `relaunch()` at `:343`, and
`relaunch: () => ccPaneRef.current?.relaunch()` **silently no-ops on a dead ref**
(sweep-verified). The next open then announces nothing where it should have offered `--continue`.

⚠️ **Do this BEFORE M15 wires the context-pressure caller**, which fires with **no human watching** —
that is what widens this from "rare operator race" to "unattended silent flag corruption."

**The shape:** add an `AbortSignal` to `RecycleInputs`; abort on unmount; the 180s operation stops
early.

⚠️ **Per the D1 ruling (Option A): on abort AFTER a successful handoff but BEFORE the respawn, the
clean mark STAYS.** The handoff completed and `.session.md` is on disk, so `--continue` would resume
an already-cleanly-handed-off session — the wrong offer. **Do NOT introduce a `mark_unclean`
primitive**; setting remains owned by the spawn path. State this at the abort site so the next
reader does not "fix" it back.

⚠️ **Extracting a pure state machine proves the MACHINE, not its CALLER** (this repo shipped a
CRITICAL that way, twice in M11 WP4). `recycleMachine.ts` already exists — the abort must be proven
**at the caller**, not only in the machine.

**Resolves 1 MAJOR from `m13-wp3` + the sharper half of theme T7.**

## WP8 — `projects.json` / settings: close the lost-update window  `[impact: Med · effort: M · risk: Med-High]`  ⚠️ D3

**Sorts LAST: highest risk in the sweep** (risk outranks impact in the ordering rules). Operator
ruled **Option B — sweep now** rather than defer to M15.

⚠️ **READ THIS BEFORE SIZING — the backlog summary overstated the problem and the sweep-time code
read narrowed it. Do not re-inflate it.**

- **Already correct:** both `write_settings` (`settings.rs:186`) and `write_projects`
  (`mod.rs:177`) write **atomically** — write to a `*_TMP_FILE` sidecar, then `fs::rename`. **This
  is NOT a torn-write or file-corruption problem, and no atomic-write helper needs building.**
- **The actual exposure:** a **lost update across the read→modify→write window**. Nine `write_*`
  fns in `settings.rs` and three project writers (`write_projects`, `set_default_model`,
  `set_default_drive_mode`) each do `read_settings()` → mutate one field → `write_settings()`. Two
  interleaving writers clobber one another's field. `set_default_drive_mode` (`mod.rs:320`) is the
  representative shape.
- **No confirmed live defect** — single-user, effectively single-writer today. The cost is that
  **the next per-project field lands on a trap**, and M15 is the next thing to add per-project state.

**Suggested shape (decide at plan time, do not inherit):** funnel every settings mutation through
**one** read-modify-write function taking a mutator closure, so there is a single place to add
serialization later — rather than adding locking to twelve call sites. ⚠️ This is the *"funnel every
write of shared state through ONE function and guard THAT"* structural fix this repo already banked
from the `pendingRestore` / `shouldJump` defects.

⚠️ **Risk is why this sorts last:** a concurrency change is exactly the class the suite will not
catch. Do **not** start it until WP1–WP7 are banked, so an interrupted sweep leaves nothing
half-applied.

**Resolves `SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW`.**

---

## Deliberately NOT in a WP — the two big documentary themes

**T1 (rationale duplication) and T2 (comment density) are NOT swept as their own WPs, and that is a
decision, not an omission.**

⚠️ **T2 has now been flagged in FOUR consecutive reviews of one file, and per-WP trimming was
measured as NOT CONVERGING.** The reviewer's own conclusion: it wants a **density budget**, not
another trim. ⚠️ **The recorded failure mode is trimming a little from each site and moving on** —
that is precisely how the four-consecutive-reviews case happened, and the M13 WP4 partial payment
proved the *guard-backed single-authority* approach is what actually works.

**Therefore:** T1/T2 are **Deferred to a dedicated convention pass** with an explicit shape —
(a) designate ONE authority per rule, (b) delete the other sites down to a pointer, (c) **guard it**
so it cannot drift back. A sweep WP that "reduces density" without (c) will be re-flagged a fifth
time. The one T1 instance that is a *pure win* (`pub(crate)` dedup of `validate_frontend_root`) is
pulled into **WP1** rather than waiting on the convention.

⚠️ **The remaining half of `m13-wp3`'s COMMENT-DENSITY MAJOR** (the *"Recycle is not a
`SKILL_BUTTONS` member"* rationale at 5 sites; raw density 52%/71%/70% in `recycleSession.ts` /
`recycleMachine.ts` / `recycleButton.ts`) is part of this deferred pass — **not** WP2/WP4, even
though those touch the same files.

## Scope — what's NOT swept (anchors intact)

**Deferred — net-new work or gated on an unmet precondition:**

| Item | Anchor / reason |
|---|---|
| `SURFACE-2026-08-05-WINDOW-SIZE-AND-POSITION-NOT-PERSISTED` | Net-new; **no `window-state` plugin in `Cargo.toml`** (sweep-verified). → M14 polish. |
| `SURFACE-2026-08-02-SET-A-CSP-AS-SECOND-LINE-OF-DEFENSE` | App-wide, needs `style-src 'unsafe-inline'`, **fails SILENTLY**, wants its own verification pass. Deliberately not folded into a sweep WP. |
| `SURFACE-2026-08-16-IDLE-DOT-CONFLATES-DONE-WITH-WAITING` + `SURFACE-2026-08-06-AWAITING-INPUT-DOT-NEVER-CLEARS-FOR-A-BACKGROUND-AGENT` | **Shared root cause** (the status model was designed around a single foreground turn). ⚠️ Gated on a **live hook capture** proving the signal exists at all — not the docs. **Settle both in one pass.** ⚠️ Do NOT "fix" with `SubagentStop → Idle`: it contradicts a correct passing test. → next QoL bucket. |
| `file-op-error-surface` (3 collapsed findings) | **Operator-ruled deferred 2026-06-30** — net-new UX (`RightPanelHost` has no toast/inline-error component). ⚠️ Building it would also give WP3's `docs_list` swallow somewhere to go — **the cross-theme leverage move**. |
| `SURFACE-2026-07-31-EDITOR-MINIMAP-STALE-ON-FILE-UPDATE` | Feature-sized `drawLine` rewrite; removed from M11.5 by operator decision. Revive when worth funding. |
| `SURFACE-2026-07-14-M9-CUSTOM-RANGE-NEEDS-MULTIDAY-TIMELINE` | Net-new render capability; blocks only the multi-day Custom view. |
| `SURFACE-2026-07-14-TURN-OUTPUT-REORIENTATION` | Net-new attention/UX feature; wants roadmap triage, not a sweep. |
| `SURFACE-2026-08-06-MANUAL-SESSION-START-MODE-MENU-INTERRUPTS-BEFORE-INTENT` | Operator-deferred; M12's signal may partially absorb it. ⚠️ Do NOT fix by changing the companion skill — it is correct for a plain-CLI user. |
| `SURFACE-2026-06-21-WP7-PER-RESULT-PER-FILE-REPLACE` | Net-new search/replace capability. |
| `SURFACE-2026-06-22-WP5-DROPPED-WATCH-WORKFLOW-DOC-HIERARCHY` | Cross-project view; re-triage at a roadmap boundary. |
| T11 coverage boundary (`qol-wp1` App wiring, `SettingsPanel` size) | Gated on decisions not taken: adopt RTL/E2E, and M14 starting. |
| `SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED` | Operator-gated; the residual is a CC-side behavior exercised daily by dogfooding. |
| `SURFACE-2026-08-18-DEV-PROFILE-PERMISSION-MODE-BLOCKS-SKILL-WRITES` | Part (1) applied (dev → `bypassPermissions`). ⚠️ **Part (2) open:** decide seed-from-prod, or record the check-this-first in `docs/lessons/verify-self-tiers.md`. Small — fold into the next live-verification session. |
| `SURFACE-2026-08-18-GUARD-VOCABULARY-MISSES-RECYCLE-AND-SESSION` | ⚠️ **No live exposure today**; M15 is the likely author of the first exposed surface (a Recycle **menu item**). **Decide (a)-widen vs (b)-own-arm BEFORE building it.** Standing precedent is **(b)** — WP2 deliberately declined to widen the shared list. |
| T1 / T2 (rationale duplication + comment density) | **Dedicated convention pass** — see the section above. Needs authority-designation + a guard, not a trim. |

**Buried — low-impact + medium-effort + low-risk (the "meh" zone; unlikely to be revisited):**

| Item | Why buried |
|---|---|
| `SURFACE-2026-06-20-WP3C-SHARED-DOC-CURSOR-RESET` | Rolled forward since **June** and the annoyance never materialized. A true fix drops the `@uiw` wrapper for raw `EditorView`s — a real refactor for a cost nobody has felt. **Revive only if the cursor reset is actually reported.** |
| `SURFACE-2026-07-13-M9-WP6B1-KEYBOARD-PAN-ZOOM-DEFERRED` | Post-WP6b-1 nicety; add if a real need surfaces. |
| `SURFACE-2026-07-31-MODEL-ALIAS-HINTS-COULD-BE-DYNAMIC` | Static hints work; dynamic is a nicety. |
| `time-tracking · ANALYTICS-HINT-EXCEEDS-SIBLING-BAND` | Real fix is net-new UI gated on `new-surface-must-earn-its-place`. |
| `SURFACE-2026-06-26-MCP-BRIDGE-RELEASE-ACL-STRINGS` | Dev-tooling ACL strings; low value, revisit only if the bridge breaks. |
| `SURFACE-2026-07-08-M9-WP6.5-CLOSE-MARKER-MISSES-FORCE-QUIT` | **Operator-ACCEPTED limitation** — a force-quit is indistinguishable from a crash (CC emits no `SessionEnd` either). Phase-4 reconciliation is the safety net. |
| `SURFACE-2026-08-01-EDITOR-DISK-RELOAD-WAITS-FOR-REAL-WINDOW-FOCUS` | Low; workaround exists. |
| `SURFACE-2026-08-01-PNPM-SPIKE-IN-TMP-MUTATES-REPO-LOCKFILE` | Doc fix **already landed** in root `CLAUDE.md` as a Setup Gotcha; only the preventive guard remains, and it is low value. |

**Kept as anti-fix warnings — NOT debt, do NOT re-score in a future sweep:**

| Item | Why it must survive |
|---|---|
| `editor-fs · RESOLVE-WITHIN-TOCTOU-NOTE` | Documentation-of-a-**non**-issue, recorded so it is not re-raised. Its own suggested action is *"none."* |
| `m9-wp6b-2 · WALLTIME-QUANTIZATION-BASIS` | ⚠️ **Explicitly NOT a defect** — a future "fix" would **break** the wall-relative layout (positions must stay on the minute grid). |
| `SURFACE-2026-08-14-SKILL-SCAN-COLLAPSES-TWO-FRONTMATTER-ERRORS` | **DORMANT** — no scanner exists (M13 chose option (i); sweep-confirmed). Real about the probe instrument; live again only if frontmatter parsing returns. ⚠️ **Not a reason to build the scanner.** |
| `SURFACE-2026-08-01-DOMPURIFY-DEFAULTS-LEAVE-DATA-SVG-AND-STYLE` | **MOOT** under the WP1 Option-B verdict — but its mutation table is the **evidence for why Option A was rejected**. Revive only if Option A is reconsidered. |
| `SURFACE-2026-08-14-SESSION-RESTORE-USAGE-FIGURE-SPANS-TWO-COMMAND-NAMES` | Method note; **no action standing**. ⚠️ Applies to **every** renamed skill. |
| `SURFACE-2026-08-06-SESSION-RESTORE-CONTRADICTS-ITSELF-ON-THE-DEFAULT-DRIVE-MODE` | **External repo** (`my-claude-code-customization`) owns it. ⚠️ Do NOT fix from Claudesk. Carry in the next cross-repo handoff. |
| `SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT` | Modifier half **done** (`cssModifierAudit.test.ts`); base-class half (~298 classes) stays open. ⚠️ Budget for false positives: interpolated classes (`` `diff-line is-${origin}` ``) appear nowhere in source, and **comments must be stripped**. |

**Deleted:** none. ⚠️ **That is the healthy signal** — delete-on-resolve is working (the four
terminal-close skills delete on resolve), so no stale `Status: resolved` clutter accumulated for
this sweep to clean.

---

## Ordering rationale (why this sequence)

Per the model: **deletions → low-risk → high-impact → co-location**; effort is *not* an ordering key.

1. **WP1** — pure narrowing/subtraction, lowest risk of anything here.
2. **WP2** — documentary only, zero behavior change.
3. **WP3** — one-sentence reconciliations + the D2 doc fix; prevents *future* defects.
4. **WP4** — test integrity; carries a MAJOR but every change is test-side. Co-located with WP5.
5. **WP5** — guard/method hygiene; same files and discipline as WP4.
6. **WP6** — first real behavior changes, but tiny and boundary-pinned.
7. **WP7** — behavioral MAJOR, Med risk. ⚠️ **Before M15.**
8. **WP8** — Med-High risk, sorts last so an interrupted sweep leaves nothing half-applied.

## Fold back and delete (on completion)

1. Confirm each finding above is **RESOLVED**, and for every resolved backlog item verify the
   `**Backlog resolved:**` line landed in `CHANGELOG.md` **in the same commit as the delete**
   (the CHANGELOG-then-delete hard invariant). Partial resolutions are **rewritten** to remaining
   open work, never deleted.
2. Execute the **Bury** actions — move those entries to the `## Buried` section of
   `workflow-system/state/backlog.md`. ⚠️ Burying is **not** resolution: it triggers no CHANGELOG
   line and no delete-on-resolve.
3. Re-label the **anti-fix warnings** so a future sweep stops re-scoring them as debt.
4. Confirm the **T1/T2 convention pass** is recorded as a deferred item with its
   authority + guard shape intact (not silently dropped).
5. **Delete this file.** It reserves no roadmap slot and must not be resynced into `arch.md`.

