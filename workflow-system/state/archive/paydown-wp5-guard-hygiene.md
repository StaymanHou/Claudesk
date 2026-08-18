---
workflow: task
state: verify (complete)
created: 2026-08-18
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP5 — guard/verification-method hygiene

**Workflow:** task
**State:** verify (complete)
**Created:** 2026-08-18

## Problem Statement

Five standing SURFACEs about how this repo verifies things: a shared matcher asking the weaker
question at 3 of 4 call sites, a standing note whose discouraging half keeps steering work toward a
guard style that has failed nine ways, an invariant described on one axis when it has two, a missing
failure form, and a mandated check that nothing enforces.

## Context

**Parent WBS:** `backlog-paydown-wbs.md` → WP5 (`[impact: Med · effort: S · risk: Lowest]`).
**Resolves 5 SURFACEs** — the first WP in this sweep with real backlog deletions, so the
CHANGELOG-then-delete invariant applies.

**Baselines in:** 846 Rust · 2122 frontend. **Out:** unchanged (846 · 2122) — no tests added; the
work is a matcher export, four call-site upgrades, two doc authorities, and one npm script.

## Work Tree

- [x] T1 Export `hasBaseRule`; audit + upgrade all 4 `hasRule` call sites  <!-- status: complete -->
- [x] T2 Amend the render-harness note into ONE authority with its boundary stated  <!-- status: complete -->
- [x] T3 Restate never-block-CC as TWO properties (arch/ + script header)  <!-- status: complete -->
- [x] T4 Add the new failure form to `source-text-guards.md`  <!-- status: complete -->
- [x] T5 Make `format:check` actually enforced  <!-- status: complete -->
- [x] T6 Gate  <!-- status: complete -->

## What changed

| Item | Disposition |
|---|---|
| **T1 `hasBaseRule`** | Exported from `test-support/cssRule.ts` and **all four** `hasRule` call sites audited. All four wanted the base-rule question, so all four were switched. ⚠️ **The stronger question immediately found two things** — see Verification Result: one **false positive** in my own first regex (fixed) and one **genuine exemption** (encoded, not waived). Also fixed a latent bug in the inlined original: it interpolated `cls` **unescaped** |
| **T2 render-harness note** | ⚠️ **29 files cite it, not the "10+" filed.** Editing 29 sites is the duplication trap this repo has been bitten by four times, so instead: ONE authority section in `docs/lessons/source-text-guards.md` ("cite this, do not restate it"), stating both halves — no interaction harness, **but** `renderToStaticMarkup` + jsdom works today on a component with hooks AND IPC — plus the boundary in the same breath (no event dispatch, no state transition, and an async-seeded hook returns its **pre-seed default**, which is why only the gate-OFF shape is reachable) |
| **T3 never-block-CC** | Restated as two properties in both `arch/status-channel-and-surfaces.md` and the script header. ⚠️ The old wording — *"the invariant survives unchanged"* — was **too weak, not wrong**: nothing regressed, but M12 WP4b added an axis that did not previously exist, leaving the next stdout-writing feature with no stated rule. Now: (1) always `exit 0`; (2) stdout byte-empty or exactly one CC-accepted JSON object. With the explicit warning not to treat `#57483` as stable |
| **T4 new failure form** | ⚠️ **It is the 10th, not the "8th"** — the WBS line was written when the doc had 7. Added *"The guard whose subject does not exist yet"* with the discriminator (*what code change would make this go red? if the answer is "someone deciding differently in a planning conversation", it is a note in the wrong file*) and the real failure mode: **misplaced confidence**, since the scope decision looks protected, so nobody restates it where planners look, and the guard is correctly deleted the first time it obstructs an intentional change — losing both halves at once |
| **T5 enforcement** | ⚠️ **No CI, no git hook** — so a gate spelled out only in prose is one that gets partially skipped, which is exactly what happened. Added **`pnpm verify:auto`**: `lint` → `format:check` → `tsc --noEmit` → `vitest` → `cargo fmt --check` → `clippy --all-targets -D warnings` → `cargo test`. ⚠️ **Includes the `cargo fmt --check` half I discovered at WP1**, so both halves are one command rather than two passes — this also resolves `SURFACE-2026-08-18-NOTHING-ENFORCES-CARGO-FMT-EITHER`, filed by this same sweep |

## Verification Observable

**Observable:** the upgraded CSS guards go RED on a base-rule deletion that leaves a modifier (the
mutant a `hasRule`-only guard passes), and `pnpm verify:auto` exits non-zero on a Prettier violation
AND on a `cargo fmt` violation, and zero when clean.

## Verification Result

**Status:** PASS
**Date:** 2026-08-18
**Evidence:**
- **T1, the mandated mutant** — deleted the entire `.workspace-skill-btn { … }` base block leaving
  `:hover` → **RED**, with the diagnostic naming the mode: *"has no BASE rule … A `:hover` or other
  modifier alone does not count."*
- **T1, the NEWLY-upgraded sites** — deleted `.docs-list-row`'s base rule leaving `:hover` **and**
  `.is-selected` → **2 RED** (`docsPanelStyles` + `cssModifierAudit`). ⚠️ Under the old `hasRule`
  **neither would have fired**, since both modifiers survive. That is the upgrade's whole value.
- ⚠️ **The stronger question found a FALSE POSITIVE in my own first regex, and fixing that mattered
  more than the missed detection.** `.cls\\s*\\{` flagged `.docs-panel-empty`, which **does** have a
  base rule — as the first member of a comma group (`.docs-panel-empty,\\n.docs-panel-error { … }`).
  Widened to `[{,]`. **A guard that flags correct code is how guards get deleted by the next person
  who hits it.**
- ⚠️ **And one GENUINE exemption, encoded rather than waived.** `.file-tree-file` has no base rule
  and needs none: `FileTree.tsx` always emits it as `"file-tree-row file-tree-file"`, so
  `.file-tree-row` carries the styling and this class is purely a hook for `.is-active`. Listed in
  `STYLED_BY_A_CO_EMITTED_CLASS` **with the class that styles it**, and the exemption itself asserts
  that class has a base rule — so if both ever go unstyled, it still fails. Weakening the assertion
  instead would have re-opened the hole for every base class.
- **T5, both directions** — appended a badly-formatted TS line → `pnpm verify:auto` **exit 1**
  (`Code style issues found`); appended a badly-formatted Rust fn → **exit 1**
  (`Diff in …/session_state/mod.rs:779`); both reverted → **exit 0**.
- **Gate:** `pnpm verify:auto` green end-to-end — 0 lint errors (1 pre-existing `:631` warning),
  `format:check` clean, `tsc` clean, **2122** frontend, `cargo fmt --check` clean, clippy 0
  warnings, **846** Rust.

**Notes:** PASS. Test counts unchanged in both languages, which is correct: this WP added no
behavior and no tests — it made four existing guards ask the *right question*, consolidated two
scattered notes into single authorities, and turned a prose instruction into an executable one.
⚠️ **`CLAUDE.md` grew ~1.1k to 42.7k**, further over the 40k threshold. The entry is load-bearing
(it is the enforcement pointer), so this is noted rather than trimmed — `/util-prune-claude-md`
remains owed its own session.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
