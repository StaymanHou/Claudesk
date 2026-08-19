---
workflow: task
state: closed
created: 2026-08-19
docs-only: false
---

# Task: Paydown WP6 — pin the Custom-window midnight boundary; re-file `headingSlug`

**Workflow:** task
**State:** closed
**Completed:** 2026-08-19
**Created:** 2026-08-19

## Problem Statement

`resolve_window`'s Custom arm derives `end_day` from `end_ms` with `local_date_of`, so an `end_ms`
landing exactly on local midnight is *excluded* from the row query (half-open `ts < end`) while
still *included* in the day list — one guaranteed-empty trailing day.

## Context

**⚠️ BOTH WP6 items are LATENT, not live — measured, not assumed.** The disposition below is an
operator decision (2026-08-19) taken on that measurement.

### Item 1 — `headingSlug` collision suffix → **RE-FILE, do not build**

`src/components/workspace/docs/classifyHref.ts:121-127`. The filing
(`backlog-paydown-wbs.md` WP6) justifies the work with: *"⚠️ **The target corpus is exactly the
collision case** — WBS/WIP docs with repeated `## Tasks` / `## Context` headings."*

**That claim is measurably false.** Scanned every `.md` the viewer can open (`workflow-system/`,
`docs/`, `CHANGELOG.md`, `README.md`) — **197 files**:

- **1 file** has any colliding slugs: `workflow-system/state/archive/m12-wp3-autofire-and-announce.md`
- **4 colliding slugs** in it (`gate`, `hygiene`, `session-hygiene`,
  `what-was-deliberately-not-codified`) — and note **none** is `tasks` or `context`, the two the
  filing names
- **3 in-doc anchor links exist in the entire corpus**, and **all three are prose *examples* of the
  syntax** (`[x](#heading)`, `[a](#heading)`) inside WBS/probe text — not navigable links
- **0 anchor links target a colliding slug**

So the "anchor reaches only the first heading" defect has **no reachable consumer today.**

⚠️ **And the fix is not the six-line change the filing implies.** `headingSlug` is a pure function
of one string; collision handling needs **per-document counter state**. Its only production caller
is `DocMarkdown.tsx`'s `HEADING_COMPONENTS`, which is **module-scope on purpose** — the comment
there says: *"Defined at module scope (not inline in the JSX) so the object identity is stable
across renders and does not force the renderer to rebuild its component map on every
keystroke-driven re-render."* Adding a counter means either reversing that documented decision or
threading a `useMemo`'d per-doc map. That is a real cost against a defect with no consumer.

### Item 2 — Custom-window midnight extra day → **PIN IT**

`src-tauri/src/time_store/commands.rs::resolve_window`, Custom arm at `:766-771`:

```rust
QueryWindow::Custom { start_ms, end_ms } => {
    let start_day = local_date_of(*start_ms);
    let end_day = local_date_of(*end_ms);       // ⚠️ midnight → the NEXT day
    (*start_ms, *end_ms, WindowMode::Range { start_day, end_day })
}
```

Confirmed downstream: rows are read via `query_window(start_ms, end_ms)` (half-open, `ts < end`),
and `build_range` (`time_store/query.rs:818-830`) builds `day_count = (end_day - start_day) + 1`
days **inclusive**. So an exact-midnight `end_ms` yields a trailing day that is empty *by
construction* — no row can ever fall in it.

**Why it is latent:** all three frontend producers use the inclusive-end convention
(`23:59:59.999`), so none currently sends midnight —
`rangeMath.ts:97`, `monthMath.ts:183`, `monthMath.ts:198`.

⚠️ **Correction to my own first reading:** `monthMath.ts:169`'s comment says the span is
"LOCAL-midnight", which reads like the bug's trigger. The **code is `23:59:59.999`** — the comment
is loose prose, not a second producer. Worth a touch-up while here.

**Why pin it anyway:** `QueryWindow::Custom` is a **serde-deserialized IPC boundary**
(`#[tauri::command]`), reachable by any caller present or future. The invariant "`end_ms` must be
inclusive-end, never a midnight boundary" is today an *unwritten convention* spread across three
separate frontend files with nothing enforcing it. A fourth caller — or an M15 programmatic one —
gets a silently wrong trailing day.

**Verification constraints:**
- `pnpm verify:auto` is the gate. Baselines: **846 Rust · 2136 frontend**.
- ⚠️ A green suite proves nothing for a boundary fix. Mutation-prove: revert the guard and confirm
  the new test fails, with the mutant confirmed landed in **executable** code.
- ⚠️ `cargo test <filter>` matching zero tests prints `ok. 0 passed` and **exits 0** — pin a count.

## Work Tree

- [x] T1 Pin the Custom-window midnight boundary  <!-- status: [x] -->
      Write the failing test first (exact-midnight `end_ms` must not produce a trailing empty day).
      Then make `end_day` exclude an exact-midnight `end_ms`, documenting *why* at the site.
      ⚠️ Must not change behavior for any non-midnight `end_ms` — assert both directions.
      **DONE.** Fix lives in a named helper `midnight_aware_end_day` (one home for the rule, so a
      future edit cannot silently re-derive it inline). **THREE tests, and the second is the one
      that matters most:** midnight-excludes-trailing-day, just-before-midnight-still-included, and
      degenerate-zero-width-keeps-its-day. Mutation-proven individually, each mutant confirmed
      landed via a marker grep: revert → kills 1; **blanket decrement → kills 2** (it would pass the
      midnight case while silently dropping a real day of data for the convention every caller
      actually uses); drop the zero-width guard → kills 1 (would invert the range into a
      `build_range` `Err`). Rust 846 → 849; test count pinned (4 matched, not 0).
      ⚠️ **The first draft of my own test was wrong** — I labelled `local_midnight_ms(d2) - 1` as
      "d2 23:59:59.999" when it is in fact d2**-1** 23:59:59.999. It failed for that reason, not the
      code's; corrected before proceeding. Two failures collapsed to one once the label was right,
      which is what isolated the real defect.
- [x] T2 Correct `monthMath.ts:169`'s "LOCAL-midnight" comment  <!-- status: [x] -->
      The code is `23:59:59.999`; the comment describes a convention the code does not use, and it
      is the exact prose that made this arm look live. Documentary only.
      **DONE.** Header now states `23:59:59.999` explicitly, says why inclusive-end is load-bearing
      (the two layers' half-open/inclusive disagreement), notes the backend normalizes midnight now,
      and records that the old wording described a convention the code never used.
- [x] T3 Re-file the `headingSlug` half with the measurement  <!-- status: [x] -->
      Rewrite the backlog entry: replace the refuted corpus claim with the measured numbers, record
      the module-scope constraint, and state what would make it worth doing (a real anchor link to
      a colliding slug, or a doc that collides on `tasks`/`context`). ⚠️ Narrow the `classifyHref`
      doc comment's "the target corpus is precisely the colliding case" sentence too — same
      refuted claim, restated at the code.
      **DONE.** Both sites carry the measurement: `classifyHref.ts`'s doc comment and the
      `backlog-quality-findings.md` finding (rewritten, not deleted — behavior deliberately
      unchanged). The finding's own "Suggested action" had already offered the comment fix as a
      legitimate close (*"the comment fix is not a cop-out"*), so this is the resolution it invited.
      Recorded the 3 conditions that would make the build worthwhile, and a re-scan instruction so
      the next reader does not trust these numbers past their date.
- [x] T4 Close out: CHANGELOG, mark WP6 done, gate  <!-- status: [x] -->
      CHANGELOG-then-delete invariant. ⚠️ WP6 closes **partially** — item 1 is re-filed open work,
      so its entry is rewritten, not deleted.
      **DONE.** `pnpm verify:auto` exits 0 — Rust **846 → 849** (+3, exactly the boundary tests),
      frontend unchanged at **2136** (both frontend edits are comments). Attribution exact.

## Current Node
- **Path:** Task > all complete
- **Active scope:** all complete
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Retrospect

- **What changed in our understanding:** **A WP can be correct about the defect and wrong about why
  it matters, and the "why it matters" is what decides whether to build.** Both WP6 items were real
  code-level facts; neither was live. The midnight one earned a fix on a *different* argument than
  the filing gave (a serde IPC boundary with an unenforced convention, not a user-visible empty
  column). The `headingSlug` one lost its argument entirely once the corpus was counted — 197 docs,
  1 colliding file, 0 links to a collision. ⚠️ **Counting took two minutes; the filing's claim had
  stood unexamined since 2026-08-02.**
- **Assumptions that held:** the midnight arithmetic was exactly as filed (`local_date_of(end_ms)`
  on a half-open span); `build_range` is inclusive; `pnpm verify:auto` as the single gate.
- **Assumptions that were wrong:**
  - **My own test's labelling.** I wrote `local_midnight_ms(d2) - 1` and called it "d2
    23:59:59.999"; it is d2**-1** 23:59:59.999. The suite failed twice and only one failure was the
    code's. ⚠️ **A boundary test is itself boundary-prone** — the instrument shares the defect class
    it is measuring.
  - **I briefly read `monthMath.ts` as a second, midnight-sending producer** because its header
    comment says "LOCAL-midnight span". The code is `23:59:59.999`; the comment was stale prose. I
    corrected my reading in the same turn rather than acting on it — but a less careful pass would
    have "confirmed the bug is live" from a comment.
- **Approach delta:** The plan said "add the `-1`/`-2` suffix rule" per the WBS. I measured first,
  brought the operator the refutation, and built only the half that survived it. The plan also did
  not anticipate three tests for a one-line fix — the blanket-decrement mutant is what justified
  them, since the naive fix silently drops real data and would otherwise have looked correct.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
