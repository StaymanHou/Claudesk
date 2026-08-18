---
workflow: task
state: verify (complete)
created: 2026-08-18
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP4 — test integrity: make each test able to fail

**Workflow:** task
**State:** verify (complete)
**Created:** 2026-08-18

## Problem Statement

Seven tests either could not fail on the defect they name, or fail on a change that is not a
defect — including one behavioral MAJOR where deleting a listener-disposal arm leaks a
subscription per Recycle while the whole suite stays green.

## Context

**Parent WBS:** `backlog-paydown-wbs.md` → WP4 (`[impact: High · effort: S · risk: Low]`).
Resolves T5 (4 items) + T6 (3 items). **Carries 1 behavioral MAJOR.**

**Baselines in:** `cargo test` 845 · `pnpm test` 2119. **Out:** **846** (+1) · **2122** (+3).

## Work Tree

- [x] T1 MAJOR — make the late-subscription disposal arm reachable and assert it  <!-- status: complete -->
- [x] T2 Pin the PREMISE behind the dedup branch's "unreachable" claim  <!-- status: complete -->
- [x] T3 Resolve `DayPayload.empty` — dead on the IPC path; documented, not wired  <!-- status: complete -->
- [x] T4 T6a — make `settingsHighlight` color-agnostic  <!-- status: complete -->
- [x] T5 T6b — refresh the stale `⏵` fixture to `⊘`  <!-- status: complete -->
- [x] T6 T6c — add the multi-span xterm fixtures  <!-- status: complete -->
- [x] T7 Gate  <!-- status: complete -->

## What changed

| Item | Disposition |
|---|---|
| **MAJOR — late disposal** | **CONFIRMED EXACTLY AS FILED, then closed.** The default `listenMock` returns `Promise.resolve(un)` — a microtask that always beats any `feed` — so `settled` is invariably `false` in the `.then` and both existing disposal tests only ever exercised `unlisteners.push(un)`. New test defers the fs-change subscription's resolution until after `Stop` has driven the operation terminal, then asserts the `settled ? un()` arm still fires. Includes a **precondition assertion** (`unlistenCalls === 1` before release) so the test cannot silently stop exercising the late path and pass for the wrong reason |
| **dedup branch** | ⚠️ **The finding was already half-addressed — but its real insight was NOT.** The code now honestly declares the branch "DEFENSIVE, and currently UNREACHABLE" and explains why its test drives `push_if_present` directly. **Nothing pinned that unreachability claim**, so adding any `*wbs*.md`-matching name to `PRODUCT_DOCS` would silently make the branch live and leave the comment lying. Added the disjointness assertion the finding originally asked for — **alongside** the branch test, not replacing it: one pins *why* the branch is unreachable, the other *what it does* if it becomes reachable |
| **`DayPayload.empty`** | **Dead on the IPC path — confirmed by three checks:** `commands.rs` imports `RangePayload`, not `DayPayload`; `RangePayload` carries `iso`+`hour_range` for back-compat but has no `empty`; and the frontend derives emptiness itself (`GlobalDashboard.tsx:1026` → `!activeData \|\| activeData.projects.length === 0`). **Documented, not wired up** — adding it to `RangePayload` would introduce a *second* source of truth for emptiness, where the frontend's cannot disagree with the data it renders |
| **T6a highlight tint** | Rewritten **color-agnostic**: counts non-`transparent` peaks (and now troughs too — three peaks without troughs is a fade, not a blink) instead of matching `rgba(120, 165, 240`. The reduced-motion arm asserts *a visible background survives*, not one exact blue |
| **T6b stale fixture** | `⏵` → `⊘`. No assertion read the character (all target `.picker-recent-nofire`), which is *why* it drifted silently — a fixture nothing depends on misinforms the next reader. Note added |
| **T6c xterm fixtures** | Added `styledRow()` producing real multi-span rows (`…</span><span style='color:…'>…`). The claim "the regex handles it" is now **empirically confirmed** rather than asserted, in both directions: a multi-span content row survives intact, and a multi-span whitespace-only row is still judged blank |

## Verification Observable

**Observable:** each of the four new/rewritten assertions goes RED on the specific defect it names
and stays GREEN on a change that is not a defect; every mutation confirmed to land in executable
code and reverted from a pristine copy.

## Verification Result

**Status:** PASS
**Date:** 2026-08-18
**Evidence:**
- **MAJOR, pre-fix:** replacing both `(un) => (settled ? un() : unlisteners.push(un))` with a bare
  `unlisteners.push(un)` — the leak — left **all 2119 tests green**. Mutation confirmed landed
  (`settled ? un()` count 0, plain-push count 2). **This is the filed MAJOR reproduced.**
- **MAJOR, post-fix:** same mutation → **RED**, 1 failed / 2119 pass, naming the new test.
  Restored, `diff` vs pristine IDENTICAL.
- **T6a, both directions** — the point of a brittleness fix:
  - a **pure re-tint** (all 4 `rgba(120,165,240,…)` → `rgba(240,100,100,…)`, zero behavior change)
    → **PASSES** where the old literal assertion would have failed;
  - **dropping one peak** (47% → `transparent`, a real regression) → **RED**, 1 failed.
- **T6c** — "simplifying" `ROW_RE` to `/<div><span>[^<]*<\/span><\/div>/g`, the shape the old
  single-span fixtures implied was sufficient → **RED, 2 failed** (both new tests). Previously that
  simplification would have passed the entire suite while breaking every colored row in production.
- **T2** — adding `("wbs.md", "wbs")` to `PRODUCT_DOCS` → **RED**, with the diagnostic naming the
  consequence: *"the dedup branch … is now REACHABLE … so its \"currently UNREACHABLE\" comment is
  stale and must be corrected."*
- **Gate:** `cargo fmt --check` clean (run first); clippy `--all-targets -D warnings` 0 warnings;
  `cargo test` **846**; `tsc --noEmit` exit 0; `pnpm lint` 0 errors (1 pre-existing `:616`);
  `pnpm format:check` clean; `pnpm test` **2122**.

**Notes:** PASS. ⚠️ **The MAJOR is the first item in this sweep that was a live defect rather than a
documentation problem, and it was filed accurately** — after three consecutive WPs of corrections,
this one needed none. ⚠️ **The T6a rewrite is the load-bearing pattern of this WP:** a brittle test
must be proven in *both* directions, because loosening an assertion is exactly how a guard stops
guarding. Asserting only "the re-tint now passes" would have been indistinguishable from deleting
the test.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
