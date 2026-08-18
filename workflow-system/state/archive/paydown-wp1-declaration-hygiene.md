---
workflow: task
state: closed
created: 2026-08-18
docs-only: false
drive_mode: autopilot
---

# Task: Paydown WP1 — declaration hygiene (visibility + placement)

**Workflow:** task
**State:** closed
**Completed:** 2026-08-18
**Created:** 2026-08-18

## Problem Statement

Four declaration-hygiene findings — two over-broad Rust visibilities (one of which
suppresses `dead_code`, one of which forced a verbatim copy of a security guard) and one
use-before-declaration in TypeScript — are paid down by pure narrowing/subtraction, the
lowest-risk item in the 2026-08-18 backlog-paydown sweep.

## Context

**Parent WBS:** `workflow-system/product/backlog-paydown-wbs.md` → WP1
(`[impact: Med · effort: XS · risk: Lowest]`). Runs first because it can only *shrink*
surface. Serves theme **T10** (4 items) + closes one **T1** duplication instance for free.

**Source finding:** `SURFACE-2026-08-01-QUALITY-WP2-MINOR-BATCH`
(`workflow-system/state/backlog-quality-findings.md:219-234`) — items (3) and (4) of that
batch; plus the T10 placement items.

**Files:**
- `src-tauri/src/session_state/mod.rs:188` — `pub fn is_unclean`
- `src-tauri/src/editor_fs/commands.rs:34` — `fn validate_frontend_root` (the original)
- `src-tauri/src/docs/commands.rs:40` — the verbatim copy to delete
- `src/components/workspace/recycleSession.ts:386,408,411` — late declarations
- `src/components/workspace/docs/DocsPanel.tsx` — item 4 (see T4 below: **no change needed**)

**Baselines to hold (from `runtimes.md`):** `cargo test` = **845 pass** / 0 fail (+1
ignored); `pnpm test` = **2115 pass** / 0 fail across 165 files. WP1 changes no behavior,
so **both counts must be unchanged at close** — an unchanged count IS the attribution.

**Verification note:** `pnpm format:check` is run explicitly in this task's gate. Root
`CLAUDE.md:145` mandates it and *nothing enforces it* (that enforcement gap is WP5's, not
ours) — but this task edits a Prettier-managed `.ts` file, so skipping it here would be
the exact hole WP5 exists to close.

### Findings confirmed by reading the code (pre-plan discovery)

- **T1** — `is_unclean` has **zero callers outside `session_state`** (grep-confirmed;
  `announce/mod.rs:218` uses the sibling `is_unclean_keyed`, which is the documented
  preferred entry point). `pub` is unearned and it suppresses `dead_code`.
- **T2** — the two `validate_frontend_root` bodies are **byte-identical** (verified line by
  line, not just by name). `docs/commands.rs:39` even documents the copy: *"Mirrors
  `editor_fs::commands`' `validate_frontend_root` (which is private to that module)."*
  That parenthetical becomes false once the original is `pub(crate)`, so it is rewritten,
  not just deleted.
- **T3** — ⚠️ **The WBS wording is imprecise and the code narrows it.** It says
  "`waitForFreshSessionId` + 2 constants … are defined after use." In fact
  `waitForFreshSessionId` (`:386`) has **no in-file caller at all** — it is consumed by
  `Workspace.tsx:233` and the test file. The genuine use-before-declaration is only the
  **two constants**, referenced as default parameter values at `:389-390` and declared at
  `:408`/`:411`. Hoisting the constants above the function fixes it; moving the function
  is unnecessary. (Legal at runtime — `const` in module scope is hoisted-and-initialized
  before the function is *called* — so this is readability, not a bug.)
- **T4** — ⚠️ **ALREADY RESOLVED; no change to make.** The finding (dated 2026-08-01,
  against `m11-wp2`) says `selected` "has no consumer **until WP3**". WP3/WP4/WP5 have all
  since shipped: `selected` is now the panel's central derived value with ~20 consumers
  (`DocsPanel.tsx:239` and downstream), and the stale header claim the finding cites is
  **already gone** (grep-confirmed: no "until WP3" / "no consumer" text survives). This is
  recorded as **no-change-needed**, not fabricated into an edit. It still gets its
  `**Backlog resolved:**` line, since the batch item is genuinely closed.

## Work Tree

- [x] T1 Narrow `session_state::is_unclean` `pub` → `pub(crate)`  <!-- status: complete -->
- [x] T2 `pub(crate)` on `editor_fs::commands::validate_frontend_root`, delete the verbatim copy in `docs/commands.rs`, import the original, and correct the now-false "private to that module" doc line  <!-- status: complete -->
- [x] T3 Hoist `RESPAWN_WAIT_MS` + `RESPAWN_POLL_MS` above `waitForFreshSessionId` in `recycleSession.ts` (constants only — see Context T3)  <!-- status: complete -->
- [x] T4 Record `DocsPanel.tsx` `selected` as no-change-needed with evidence (already resolved by WP3+)  <!-- status: complete -->
- [x] T5 Gate: `cargo fmt` · `cargo clippy --all-targets -- -D warnings` · `cargo test` (845) · `pnpm lint` · `pnpm format:check` · `pnpm test`  <!-- status: complete -->

## Gate results (T5, 2026-08-18)

| Check | Result |
|---|---|
| `cargo fmt` | clean — ⚠️ also reformatted one PRE-EXISTING drift in `announce/mod.rs` tests (see Discoveries) |
| `cargo clippy --all-targets -- -D warnings` | **0 warnings.** The load-bearing check for T1: had `is_unclean` become unreachable, `pub(crate)` would now raise `dead_code` and fail here |
| `cargo test -p claudesk` | **845 pass** / 0 fail / +1 ignored (828 lib + 16 + 1) — **exactly the baseline**; WP1 changes no behavior, so an unchanged count IS the attribution. 3.78s exec / 10.79s wall |
| `./node_modules/.bin/tsc --noEmit` | exit 0 (direct binary, not `pnpm exec` — per `[[pnpm-exec-shadows-local-binaries]]`) |
| `pnpm lint` | 0 errors, 1 pre-existing warning (`XtermPane.tsx:616` exhaustive-deps; recorded in `runtimes.md` at the drifted line 464 — file untouched by WP1) |
| `pnpm format:check` | clean — the hoisted block was Prettier-clean first pass |
| `pnpm test` | **2118 pass** / 0 fail, 165 files. ⚠️ **Baseline was recorded as 2115; HEAD already reports 2118** (verified by stashing the edits and re-counting). The +3 predates WP1 — `runtimes.md` was stale, not a delta introduced here. WP1 is count-NEUTRAL: 2118 → 2118 |

### Verification note on T2

The dedup is proven mechanically, not by eye: `grep -rn 'fn validate_frontend_root'` returns
**exactly 1** definition crate-wide (was 2), while both `docs/commands.rs` call sites (`:47`,
`:58`) still resolve — proven by the clean clippy + test compile, since an unresolved import is a
hard compile error. Bodies were confirmed byte-identical *before* deletion, so no behavior moved.

## Verification Observable

⚠️ **A green suite is NOT the observable here.** WP1 is pure narrowing, so a no-op change would
produce an identically green suite. The observable must prove each narrowing **binds** — i.e. that
the compiler now rejects what it previously allowed. That is a mutation check, per this repo's own
`docs/lessons/source-text-guards.md` discipline ("could this still pass if the code it names were
deleted?").

**Observable:** With T1/T2 applied, `cargo` **rejects** an out-of-crate use of
`session_state::is_unclean` and **rejects** the re-introduced duplicate of
`validate_frontend_root` as a redefinition — while the unmutated tree compiles clean, all 845
Rust + 2118 frontend tests pass, and `waitForFreshSessionId`'s two constants are declared
**before** their use site.

**Verification command:** four probes, each run individually (a composite probe that trips *some*
arm would report success while hiding a gap):

1. `PROBE-A` — append `pub use crate::session_state::is_unclean;` to `lib.rs`, then
   `cargo build`. A `pub(crate)` item cannot be re-exported `pub`.
2. `PROBE-B` — restore the deleted copy of `fn validate_frontend_root` into `docs/commands.rs`
   alongside the new import, then `cargo build`.
3. `PROBE-C` — the unmutated tree: `cargo clippy --all-targets -- -D warnings` + `cargo test`
   + `pnpm test` (positive control — proves the probes' failures are attributable to the mutation
   and not to a broken tree).
4. `PROBE-D` — assert declaration-before-use in `recycleSession.ts` by line number, mechanically.

**Expected result:**
- PROBE-A: **non-zero exit**, error `E0365`-family (private item re-exported) naming `is_unclean`.
- PROBE-B: **non-zero exit**, error `E0255`-family (name defined multiple times) naming
  `validate_frontend_root`.
- PROBE-C: exit 0 — clippy 0 warnings, 845 Rust pass, 2118 frontend pass.
- PROBE-D: exit 0 — both `RESPAWN_*` declaration lines strictly less than the
  `waitForFreshSessionId` signature line.
- ⚠️ Every mutation must be confirmed **reverted** afterward (`git diff` identical to pre-probe).

## Verification Result

**Status:** PASS
**Date:** 2026-08-18
**Evidence:** all four probes ran individually; every mutation was confirmed to land in
executable code before its verdict was believed, and confirmed reverted afterward.

- **PROBE-A (T1 binds).** Appended `pub use crate::session_state::is_unclean;` to `lib.rs`;
  mutation confirmed at line 689. `cargo build` → **non-zero**, quoting literally:
  `error[E0364]: `is_unclean` is only public within the crate, and cannot be re-exported outside`
  … `note: consider marking `is_unclean` as `pub` in the imported module`. Reverted; `git diff`
  on `lib.rs` clean.
- **PROBE-B (T2 binds).** Re-introduced `fn validate_frontend_root` into `docs/commands.rs`
  alongside the new import; mutation confirmed at line 41. `cargo build` → **non-zero**:
  `error[E0255]: the name `validate_frontend_root` is defined multiple times` … `previous import
  of the value `validate_frontend_root` here` … `` `validate_frontend_root` must be defined only
  once in the value namespace of this module``. ⚠️ A trailing `error[E0425]: cannot find type
  `PathBuf`` is the **probe's own** artifact (the now-unused `PathBuf` import was correctly
  dropped in T2) — it independently re-confirms the import cleanup. Reverted.
- **PROBE-C (positive control).** Unmutated tree: `cargo clippy --all-targets -- -D warnings`
  → 0 warnings; `cargo test` → **845 pass** (828 + 16 + 1) / 0 fail; `pnpm test` → **2118 pass**
  / 0 fail, 165 files. This is what makes A and B attributable to their mutations rather than to
  a broken tree.
- **PROBE-D (T3).** Declaration lines read mechanically: `RESPAWN_WAIT_MS` **378**,
  `RESPAWN_POLL_MS` **381**, `waitForFreshSessionId` **398** — both strictly less than the use
  site. Exit 0.

**Notes:** PASS. ⚠️ **The load-bearing point is that a green suite alone would NOT have
distinguished this change from a no-op** — WP1 is pure narrowing, so the suite is green either
way. PROBE-A and PROBE-B are what prove the narrowings actually bind, and PROBE-B additionally
proves the T2 dedup is now **structurally enforced**: a re-introduced copy of the guard is a hard
compile error, not a silent second implementation that drifts. That is a stronger outcome than the
original finding asked for (it asked only that the copy be removed).

T4 required no code change and none was invented — see Context §T4 for the evidence that WP3+
already resolved it.

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** 2 (both note-and-continue: the `cargo fmt` enforcement gap → filed as
  `SURFACE-2026-08-18-NOTHING-ENFORCES-CARGO-FMT-EITHER`, fold into paydown WP5; and the stale
  `runtimes.md` test baseline → refreshed at close)

## Retrospect

- **What changed in our understanding:** two of the four filed sub-items were **not what the
  filing said**, and both discrepancies were only visible by reading the code rather than the
  finding. (a) T3's filed shape ("`waitForFreshSessionId` + 2 constants are defined after use")
  was wrong about the function — it has no in-file caller at all, so only the two constants were
  ever misplaced. (b) T4 had **expired**: the finding's own text scoped it as "no consumer *until
  WP3*", and WP3/WP4/WP5 all shipped in the interim, leaving `selected` with ~35 references and
  the stale header claim already gone. The transferable point: **a backlog finding carries an
  implicit as-of date, and a conditional one ("until WP<n>") can be resolved by the passage of
  the very work it names.** A sweep that trusts the summary would have invented an edit here.
- **Assumptions that held:** the two Rust items were exactly as filed — `is_unclean` had zero
  out-of-module callers, and the two `validate_frontend_root` bodies were byte-identical (checked
  line by line before deleting, not assumed from the shared name). The sweep's own ordering
  rationale held too: WP1 really is pure subtraction, and nothing about it needed a behavior
  decision.
- **Assumptions that were wrong:** (1) that a green suite would be meaningful evidence — it is
  not, for a pure-narrowing change, since a **no-op** produces the identical green. The mutation
  probes are what carry the verdict. (2) that `runtimes.md`'s baselines were current: the `pnpm
  test` figure (2115) was stale, and HEAD already read 2118 before any edit. Attribution required
  stashing and re-counting rather than trusting the registry — the same "hand-maintained current
  figure is a drift channel" lesson this project banked at M13's close for `CLAUDE.md`'s
  latest-release line.
- **Approach delta:** three deltas from plan. The T3 scope narrowed to constants-only; T4 became a
  no-change-needed record with evidence instead of an edit; and `cargo fmt` surfaced a
  **pre-existing** formatting drift in `announce/mod.rs` — a file WP1 never touched — which was
  kept (reverting it would leave the tree failing `cargo fmt`) and filed as direct evidence that
  the enforcement gap WP5 addresses exists on the Rust side too.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SURFACED-2026-08-18] T5 — `cargo fmt` reformatted a PRE-EXISTING drift in
`src-tauri/src/announce/mod.rs:531-537` (a test assertion wrapped across 4 lines that fmt
collapses to 1). **Not WP1's change** — the file was never edited by this task. Kept rather than
reverted, because reverting would leave the tree failing `cargo fmt`. ⚠️ **This is direct evidence
for WP5's item** ("nothing enforces `format:check`" — root `CLAUDE.md:145`): the same enforcement
gap exists on the Rust side for `cargo fmt`, and drift accumulated silently until an unrelated
task ran the formatter. WP5 should consider covering `cargo fmt --check` alongside
`pnpm format:check`, not just the frontend half.

[SURFACED-2026-08-18] T5 — `runtimes.md`'s `pnpm test` baseline (2115) is **stale**; HEAD reports
2118 with no local edits. Attributed by stashing and re-counting, so it is a registry-drift issue,
not a WP1 delta. The registry entry is refreshed at close.
