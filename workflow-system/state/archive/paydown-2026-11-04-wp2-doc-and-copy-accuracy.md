---
workflow: task
state: close (complete)
completed: 2026-11-04
created: 2026-11-04
docs-only: false  # two user-visible strings change (media card, supervisor alarm tooltip) → run the gate
drive_mode: autopilot
---

# Task: Paydown sweep WP2 — doc and copy accuracy

**Workflow:** task
**State:** Completed 2026-11-04
**Created:** 2026-11-04

## Problem Statement
Six docs or user-visible strings state something the code does not do; make each one say what the
code actually does, with no behavior change.

## Context
- Plan of record: `workflow-system/product/backlog-paydown-wbs.md` → WP2.
- ⚠️ **Scope moved at plan time:** two WP2 bullets move to the WP that changes their code, so neither
  finding is split across two closes (partial-resolution churn):
  - the `open_project_paths` doc sentence (`11-02-QUALITY-WP5-QUIT-PATH-…`) → **WP6**
  - the guard's async-command gap in both "does NOT cover" lists (`09-23-QUALITY-GUARD-EXEMPTS-…`) → **WP4**
  (T7 annotates both WPs in the sweep file.)
- No test pins either user-visible string (`grep -rln` finds only the source modules), so the gate is
  `pnpm verify:auto` (timeout 159000) for lint/format/tsc/vitest.
- Code-quality findings are deleted from BOTH `backlog-quality-findings.md` (body) and the
  `backlog.md` pointer stub, in the same commit as their `**Backlog resolved:**` line. A batch with
  sub-findings left keeps its body, rewritten down to what remains.

## Work Tree

- [x] T1 **Clause-boundary docstring** (`10-27-QUALITY-WP3-CLAUSE-BOUNDARY-DOCSTRING-OMITS-COMMA-AND-PAREN`)
  - `src/state/workflowMachine/transitionToken.ts` `extractEmittedTransitionId`: the list says `.` `!` `?` `:` `;` `→` `—` `->`; `CLAUSE_BOUNDARY_RE` also takes `,`, `(`, and a sentence end inside `)` (`[.!?])`). List the full set, and note that the comma is the loosest boundary (tests: `Plan complete, \`TRANSITION: F7\``, `(TRANSITION: P10)`).
  - Check `arch/workflow-supervisor.md` §D/§C (around "opens a clause, and is not quoted"); fix it if it lists a set.
- [x] T2 **Overlay-emit doc claim** (`10-26-QUALITY-WP4-OVERLAY-EMIT-OUTSIDE-THE-LOCK-CAN-ARRIVE-STALE`; sweep default D5)
  - `src/state/supervisor/verifyHumanPause.ts` (~"A reply typed while this ran therefore wins"): soften it to what is true. The registry's compare-and-set never overwrites a newer event, but the EMITS are not ordered: a promote can emit after a newer event's emit (microsecond window), and no consumer compares `last_event_at`.
  - Check the Rust `workspace_status_promote` / `workspace_status_clear_attention` docs and `arch/status-channel-and-surfaces.md` §A.5 for the same claim; soften wherever it appears. Record WHY the emit stays outside the lock (main-thread `#[command]`, and the tray listener runs on `emit`: the lock-across-a-marshal shape the sync guard cannot see).
- [x] T3 **`decideTurn` comments** (`09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH` item 3 only)
  - `useSupervisor.ts`: "every condition guarding it is read at the last possible moment" is overstated. `supervisorEnabledRef` is read at the top of `decideTurn`, before `fireOne`, with the ≤2 s completion wait and the ~3 s adjudication between that read and the inject. Say what is actually true (read per turn, not per subscribe).
  - The withhold-reason list in the M14 WP0 comment (before `warn(...)`) is stale: it names `not-supervised` and `no-verdict` and omits `adjudicator-failed`, `workflow-not-supervised`, `transcript-incomplete`, `duplicate-turn-end`, `inject-failed` and others. Replace the enumeration with a pointer to `FanOutReason` (`fanOut.ts`) plus `WithholdReason`, so it cannot go stale again.
  - (Body rewrite deferred to close, so it lands in the same commit as the `**Backlog resolved:**` line.) Rewrite the batch body down to items 1, 2, 4, 5 (items 1 and 2 → WP14, 4 → WP3, 5 → WP8), and update its `backlog.md` stub.
- [x] T4 **`WeekProjectMs.path` doc** (`09-29-QUALITY-ANALYTICS-WEEK-EXPORT-MINOR-BATCH` item 1; sweep default D6)
  - `src-tauri/src/time_store/query.rs`: the doc says "its sessions' heaviest modal cwd", but `build_range` keeps the FIRST non-empty per-day `path`. Document the first-day rule as the contract (Neo consumes this field, so the behavior does not change). Check `arch/time-analytics.md` for the same claim.
  - (Body rewrite deferred to close, as above.) Rewrite the batch body down to items 2, 3, 4 (items 2 and 3 → WP5, item 4 → WP14), and update its stub.
- [x] T5 **Media card copy** (`09-29-QUALITY-OVER-MEDIA-LIMIT-COPY-SAYS-LARGER-THAN-WHILE-RULE-IS-AT-LEAST`)
  - `src/components/workspace/editor/mediaDisplay.ts` `CARD_REASON_TEXT["over-media-limit"]`: "larger than 4 GiB" → "4 GiB or larger" (the rule is `>=`).
- [x] T6 **Adjudicator alarm tooltip** (`10-27-QUALITY-WP3-ADJUDICATOR-ALARM-TOOLTIP-OMITS-UNPARSEABLE`)
  - `src/cc/workspaceSupervisor.ts`: the reasons for `adjudicator-failed` are "an error, a timeout, or a model other than the pinned one". Add "an unreadable reply". Re-check `verdict.ts` / `adjudicator` for every basis that maps to `adjudicator-failed`, so the list is complete, not just one item longer.
- [x] T7 **Bookkeeping**
  - Annotate the sweep WBS: WP4 gains the guard doc half, WP6 the `open_project_paths` sentence, and WP2's list shrinks to match.
  - Run `pnpm verify:auto` (timeout 159000).

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** none

## Verification Observable

**Observable:** The task changes no behavior except the two intended user-visible strings, and the full gate stays green.
**Verification command:** `git diff -U0 -- src src-tauri | grep -E "^[-+][^-+]" | grep -vE "^[-+]\s*(//|\*|/\*\*|///|//!)"` (changed lines that are not comments) + `pnpm verify:auto`
**Expected result:** the filter prints exactly the two string literals (tooltip, media card) and nothing else; verify:auto exits 0.

## Verification Result

**Status:** PASS
**Date:** 2026-11-04
**Evidence:** The filter printed only `'withheld "adjudicator-failed" (an error, a timeout, an unreadable reply, or a ' + "model other than the pinned one). …"` (−/+ 2 lines) and `"This file is 4 GiB or larger, more than the built-in player can load."` (−/+ 1 line). `pnpm verify:auto` → `EXIT=0 98s` (lint, format, tsc, check:link, vitest, cargo fmt/clippy/test all ok).
**Notes:** Every other edit is a comment or doc. The two strings are literals, so the diff shows their exact rendered text.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[NOTE-2026-11-04] T6 — `AdjudicationBasis` has exactly four failure bases (error, timeout, unparseable, model mismatch), so the tooltip list is now complete, not just one item longer.
[NOTE-2026-11-04] T7 — verify:auto took 98s (vs 47s yesterday), so the registry timeout was recomputed 159000 → 207000.

## Retrospect
- **What changed in our understanding:** Two of the eight sweep bullets were halves of findings whose other half is a code change (the guard's async gap, the quit-path sentence). Splitting them across two closes would have created partial-resolution churn, so they moved to WP4 and WP6. The tooltip had exactly four failure bases, so the fix made the list complete rather than one item longer.
- **Assumptions that held:** No test pinned either user-visible string. The comment-only edits stayed comment-only (the diff filter showed just the two literals).
- **Assumptions that were wrong:** verify:auto took 98s against 47s the day before, so the registry timeout went from 159000 to 207000.
- **Approach delta:** The two batch-body rewrites ran at close rather than act, so each lands in the same commit as its partial `**Backlog resolved:**` line.

## Closure notice
Requester = operator — closure notice for self-record. **Paydown WP2 is complete:** six docs and strings corrected with no behavior change; 4 findings resolved and 2 batches partially resolved, all in CHANGELOG.
