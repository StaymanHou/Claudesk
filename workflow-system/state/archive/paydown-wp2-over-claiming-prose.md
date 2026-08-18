---
workflow: task
state: verify (complete)
created: 2026-08-18
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP2 — over-claiming prose: narrow every claim to what the code does

**Workflow:** task
**State:** verify (complete)
**Created:** 2026-08-18

## Problem Statement

Eight documentary claims assert more than the code they describe actually does — a stale glyph,
an ambiguous cross-reference, an unreachable divergence, an untested CLI assumption — each one a
trap for the next reader who trusts the comment over the code.

## Context

**Parent WBS:** `workflow-system/product/backlog-paydown-wbs.md` → WP2
(`[impact: Med · effort: S · risk: Low]`). Highest-count theme (**T3, 8 instances**), all cheap,
all documentary. Runs second: zero behavior change by construction.

**Baselines to hold:** `cargo test` = **845** pass; `pnpm test` = **2118** pass / 165 files
(the corrected figure — `runtimes.md` was refreshed at WP1's close). ⚠️ **`docs-only: false`
even though every edit is a comment**, because two items sit in Rust/TS source that must still
compile and one touches a test *name*. The gate is real.

### Discovery corrections — read before editing (two filings are WRONG)

⚠️ **This is the second consecutive WP where reading the code contradicted the filing.** Per
`[[backlog-finding-carries-an-implicit-as-of-date]]`, banked at WP1's close.

- **Item 2 is REFUTED — the test is fine; do NOT rename or "fix" it.** The finding claims
  `set_default_drive_mode_leaves_the_model_override_untouched_and_vice_versa`
  (`config_store/mod.rs:1417`) "promises *vice versa*; the body never asserts it." **The body
  asserts BOTH directions**: set model → set mode → assert model survived (`:1427-1430`), then
  clear model → assert mode survived (`:1431-1436`, with the message *"clearing the model must not
  clear the mode sharing its column"*). The name is accurate. **Recorded as no-change-needed with
  evidence; no edit.**
  - Incidental, checked and clean: the test uses `DriveMode::StepByStep` / `FullAutopilot`, which
    look like the mode strings root `CLAUDE.md` warns are invalid — but those are Rust *variant
    identifiers*; the `#[serde(rename)]` wire values (`mod.rs:137-146`) are correctly
    `stepping`/`orchestrated`/`autopilot`/`fsd`. Not a defect, and **not to be "fixed"** — the
    variant names are internal.

- **Item 1's SCOPE IS ~18× THE FILING.** The finding names `pickerRowOrder.ts:52,76`. Actual
  count: **36 `⏵` mentions across 12 files** vs 10 for the shipped `⊘`. The rendered glyph is
  `⊘` (`ProjectPicker.tsx:564`). ⚠️ **Not all 36 are wrong** — many correctly narrate *history*
  ("the original version rendered the `⏵` conditionally", "shipped a defect where `⏵` resumed…"),
  where the old glyph is the accurate subject. **Edit only where the text asserts the CURRENT
  affordance.** ⚠️ The stale-fixture instance (`pickerRowGutterStructure.test.ts:63`, which emits
  `⏵` as fixture *data*) is **WP4's**, not ours — leave it.

### The six real items, anchored by symbol

| # | Symbol / site | The over-claim |
|---|---|---|
| 1 | `isSiblingOfOpenButton` + `cellsAreFlatSiblings` docs (`pickerRowOrder.ts`) | say "the `⏵` cell" for an affordance that now renders `⊘` |
| 3 | `headingSlug` (`docs/classifyHref.ts:106`) | "Mirrors GitHub's algorithm" — overstates by one rule (no collision suffix). ⚠️ Narrow the CLAIM only; the behavior is **WP6's** |
| 4 | `App.tsx:309` | "Verdict (b)'s requirement" — **two** Verdict (b)s exist (M10.9's invite/project-count one, and M12 WP1's announcement-never-read-back one, cited as "WP1 Verdict (b)" in 6 sibling files). Unqualified here |
| 5 | `showRecycleButton` doc (`recycleButton.ts:26-32`) | claims conditions "can diverge", but it renders at `Workspace.tsx:514` **inside** the `showSkillButtons(…) &&` block opened at `:489`, and both predicates are byte-identical → the outer gate **strictly dominates**, so the divergence is unreachable *at this site*. ⚠️ **Do NOT un-nest** — the dominance is correct; only the doc over-claims |
| 6 | `DocsPanel.tsx:326` `plan.apply && el !== null` | second conjunct is unreachable as a *condition* (exists for `tsc` narrowing) and undercuts the `isMeasurable`-as-type-predicate rationale earlier in the file |
| 7 | `build_cc_argv` doc (`cc_session/mod.rs:327`) | "`--permission-mode default` is a harmless no-op" is load-bearing but rests on an **untested CC-CLI assumption**. Mark it as an assumption |
| 8 | `updater/commands.rs:156` (+ test `:275`) | finish emit sends `downloaded: 0`, reading as a lost value. **Verified harmless**: `progressPercent` short-circuits `if (p.done) return 100;` (`updateFlowState.ts:56`) before `downloaded` is read. Note it at the emit site |

## Work Tree

- [x] T1 Narrow the `⏵`→`⊘` claims where they assert the CURRENT affordance; leave historical narration and WP4's fixture alone  <!-- status: complete -->
- [x] T2 Record item 2 (the "vice versa" test) as no-change-needed with evidence  <!-- status: complete — REFUTED, see below -->
- [x] T3 Narrow `headingSlug`'s "mirrors GitHub's algorithm" to name the one rule it omits  <!-- status: complete -->
- [x] T4 Disambiguate `App.tsx`'s "Verdict (b)" by naming which milestone's verdict it means  <!-- status: complete -->
- [x] T5 Restate `showRecycleButton`'s relationship to `showSkillButtons` as dominance-at-this-site  <!-- status: complete -->
- [x] T6 Note `plan.apply && el !== null`'s second conjunct as a `tsc` narrowing  <!-- status: complete -->
- [x] T7 Mark `build_cc_argv`'s `--permission-mode default` no-op claim as an untested assumption  <!-- status: complete -->
- [x] T8 Note `downloaded: 0` at the updater finish emit as deliberate-and-ignored  <!-- status: complete -->
- [x] T9 Gate  <!-- status: complete -->

## What changed (6 edits, 1 refutation, 1 scope correction)

| Item | Disposition |
|---|---|
| 1 — glyph | **11 sites narrowed** across 4 files (`pickerRowOrder.ts` ×2 — the filed pair; `announceRow.ts` ×3; `state/workspace.ts`; `ProjectPicker.tsx:219`; `App.css` ×5). ⚠️ **7 `⏵` mentions in non-test source were KEPT because they are correct** — past-tense narration of the rename or of the defect the old glyph caused (`App.css:3189`/`:3521`, `ProjectPicker.tsx:97`/`:290`/`:550`, `XtermPane.tsx:151`/`:477`). Test-file mentions left to WP4. `ProjectPicker.tsx:550` remains the single authority on the glyph choice and was not duplicated |
| 2 — "vice versa" test | **REFUTED — no edit.** The body asserts BOTH directions (`config_store/mod.rs:1427-1436`). The name is accurate |
| 3 — `headingSlug` | Claim narrowed to "mirrors GitHub's algorithm **except for collision handling**", naming the missing `-1`/`-2` suffix rule and pointing at WP6 for the behavior |
| 4 — Verdict (b) | Disambiguated with **verified** attribution: M10.9's (invite lifecycle, issued at its WP1 probe, implemented by WP3) vs M12 WP1's (the batched announce query). ⚠️ My first draft said "M10.9 WP3" — corrected after reading the archived WBS, which shows WP3 *consumes* a verdict issued at the WP1 probe |
| 5 — `showRecycleButton` | Divergence restated as **forward-looking insurance, not live**: the button renders at `Workspace.tsx:514` inside the `showSkillButtons(…) &&` block opened at `:489`, so the row's gate strictly dominates. Explicit "do NOT un-nest" added |
| 6 — `plan.apply && el !== null` | Annotated as a `tsc` narrowing. **Premise verified mechanically:** `el === null` → `readGeometry` returns `null` → `isMeasurable(null)` false → `apply: false`, so `apply === true` implies `el !== null` |
| 7 — `build_cc_argv` | The "harmless no-op" claim relabeled an **ASSUMPTION**, with what it rests on (a `claude --help` listing, not an observed comparison), why it is load-bearing, and why a test here would assert our mapping rather than CC's response |
| 8 — `downloaded: 0` | Annotated as deliberate-and-ignored, citing the `if (p.done) return 100;` short-circuit at `updateFlowState.ts:56`. **Verified** before writing |

## Verification Observable

⚠️ **A green suite is meaningless for this WP** — every edit is a comment, so all 2963 tests pass
whether the claims are true or false. The observable must compare each claim to the code it
describes.

**Observable:** every remaining `⏵` mention in non-test source is past-tense narration (not a
claim about the current affordance), the rendered glyph is `⊘`, and the four verified premises
(T4 attribution, T5 dominance, T6 narrowing, T8 short-circuit) each hold in the code as written.

**Verification command:** classify all `grep -rn '⏵' src/ --exclude-dir=__tests__` hits;
read the rendered text node; and trace each premise to its source.

**Expected result:** zero unclassified `⏵` hits; rendered node is `⊘`; all four premises confirmed.

## Verification Result

**Status:** PASS
**Date:** 2026-08-18
**Evidence:**
- **Glyph:** 7 surviving non-test `⏵` hits, **all 7** classified as history by the phrases they
  sit in ("original version rendered", "old `⏵`", "resumed anyway", "came to resume", "door
  resume", "until the operator rejected it"). Rendered node at `ProjectPicker.tsx` is `⊘`
  (`data-testid="picker-recent-nofire"`).
- **T4 premise:** confirmed against the archived WBS — `milestone-10.9-.../wbs.md:110-125` (invite
  lifecycle) vs `milestone-12-.../wbs.md:1046` ("Verdict (b) — the batched announce query (WP1
  Phase 2)"). Six sibling files cite the M12 one.
- **T5 premise:** `Workspace.tsx:489` opens `showSkillButtons(…) && (`; `:514` is `showRecycleButton({`
  inside it. Both predicates are `workflowEnabled && ccSessionId !== null`.
- **T6 premise:** traced through `readGeometry` (`:55-62`) → `isMeasurable` → `planRestore`
  (`apply: false` on both early returns).
- **T8 premise:** `updateFlowState.ts:56` is `if (p.done) return 100;`, before any `downloaded` read.
- **Gate:** `cargo fmt --check` **clean** (checked FIRST this time, per WP1's lesson — no blind
  reformat); `clippy --all-targets -D warnings` 0 warnings; `cargo test` **845**; `tsc --noEmit`
  exit 0; `pnpm lint` 0 errors (1 pre-existing `XtermPane.tsx:616` warning); `pnpm format:check`
  clean; `pnpm test` **2118** / 165 files. Both counts exactly at baseline.

**Notes:** PASS. ⚠️ **Two filings were wrong again — the second consecutive WP.** Item 2 was
refuted outright (the test does what its name says), and item 1's real scope was ~5× the two
filed lines *while also* containing 7 sites that must NOT be changed. The WBS's "re-anchor by
SYMBOL" warning is necessary but insufficient: it gets you to the right code, and you still have
to judge whether the claim is wrong *there*. See `[[backlog-finding-carries-an-implicit-as-of-date]]`.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** 1 (glyph-claim guard gap — note-and-continue)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-18] T1 — **Nothing prevents the `⏵`/`⊘` claim drift from recurring.** The glyph
was renamed at M12 WP3 (2026-08-05) and 11 stale prose claims survived in 4 files for two weeks
across two milestones, including in the module the WBS cited as the nesting rule's documentation.
A guard is awkward here (the correct state is "`⊘` in current-affordance claims, `⏵` allowed in
historical narration", which no simple grep expresses) — but the **single-authority** shape does
apply: `ProjectPicker.tsx:550` already owns the glyph rationale, and the 11 narrowed sites could
each carry a pointer instead of restating the glyph. ⚠️ **Candidate for the deferred T1/T2
convention pass, NOT for a sweep WP** — same authority-plus-guard shape, same reason.
