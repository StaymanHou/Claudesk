---
workflow: task
state: act (complete)
created: 2026-09-23
docs-only: true
drive_mode: autopilot
---

# Task: Paydown fold-back — reconcile, carry surviving obligations, delete the WBS

**Workflow:** task
**State:** act (complete)
**Created:** 2026-09-23

## Problem Statement
The 2026-09-23 backlog-paydown WBS (`workflow-system/product/backlog-paydown-wbs.md`) is
deleted on completion. All ten WPs are closed, but some obligations exist ONLY in that file.
They must be reconciled and carried into `backlog.md` before the file is deleted, or they are lost.

## Context
- `workflow-system/product/backlog-paydown-wbs.md` §"Fold back and delete" (the 4-step contract),
  §Scope (Deferred / Buried / Deleted), §Rulings (R1–R4), §Finding-ID key.
- Closure notes, which are the authority for step 1, not the WBS's own ✅ blocks: `workflow-system/state/archive/paydown-wp{1..10}-*.md`,
  specifically the 2026-09-23 set (`…-backlog-bookkeeping`, `…-docs-rulings-handoff`, `…-boot-smoke-test`,
  `…-narrow-overclaiming-comments`, `…-chord-registry-settings-guards`, `…-guards-that-cannot-fail`,
  `…-render-instead-of-raw`, `…-small-live-defects-and-dead-code`, `…-sync-command-blocking-guard`,
  `…-dictated-prompt-wrap`). ⚠️ The same directory also holds the **2026-08-18/19** paydown's
  same-prefixed files (`paydown-wp1-declaration-hygiene`, `…-over-claiming-prose`, …). Do NOT read those
  as this sweep's closure notes.
- Precedent: `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED` ("carried out of
  `backlog-paydown-wbs.md` at sweep close") is how the last sweep folded back.
- Already homed in the backlog, so it only needs CONFIRMING, not carrying: the stubs for WP3, WP7 and WP9
  (`## Code-quality findings — paydown-wp{3,7,9}-…`) with their bodies in `backlog-quality-findings.md`;
  the drive-mode H2/H5d deferral (stub `drive-mode-on-the-workspace-surface`); C1 (b)/(c) → F-b
  (stub `supervisor-hotfix`); AC3 (stub `m10.9-wp2`); AB1 (stub `file-op-error-surface`); the Row 6
  event-derived-local residual (`docs/lessons/source-text-guards.md` entry 13).
- Obligations found at plan time with NO home outside the WBS or an archive (grep count 0 in `backlog.md`):
  the ⌘⌥G go-to-line product call (WP5), the R1 B′ "latest wins" escalation note, WP8 never getting a
  code-quality review (the task path has no review-quality state), and the autopilot defaults WP5, WP6
  and WP10 disclosed as "flag if wrong" that were never ratified.
- Live references to the WBS file that its deletion strands: `backlog-quality-findings.md:103`
  (the `# paydown-wp3-boot-smoke-test` block). `backlog.md:665` is the 2026-08-19 historical
  provenance line and stays as is.

## Work Tree

- [x] T1 **Reconcile every finding ID (fold-back step 1)** against its WP's archived closure note.  
  - For each ID the WBS routes to a WP (WP1 deletes; WP4, WP5, WP6, WP7 and WP8 items), classify it as one of:
    RESOLVED (the closure note names the mutant that dies, or a deletion, refactor or refutation, as stated),
    or ROUTED (it has a live home: R2 pass, R1 deferral, F-b, a backlog stub).
  - Grep `backlog-quality-findings.md` so that no RESOLVED ID still has a body (the delete-on-resolve
    leak class that WP1 found 22 of).
  - Record the result as a compact table in this WIP's `## Reconciliation`. If an ID is neither resolved
    nor routed, it becomes a T3 carry.
- [x] T2 **Confirm every Bury, Delete and Deferral in §Scope happened (fold-back step 2).**  
  - Buried: each item is present in `backlog-archived.md` with a `Buried because:` line, and absent from `backlog.md`.
  - Deleted: each WP1 §5 SURFACE and the R4 rulings (40, 46, 32) are absent from `backlog.md`, and each has a
    `**Backlog resolved:**` line. Spot-check the same-commit invariant with `git log -S'<ID>' -- workflow-system/state/backlog.md`,
    then `git show --stat` of that commit, which must include `CHANGELOG.md`.
  - Deferred: each Deferred-row SURFACE still exists in `backlog.md`, and its entry names the anchor the table gives.
    Where the anchor lives only in the WBS, add it to the entry.
- [x] T3 **Carry the surviving obligations into `backlog.md` (fold-back step 3).** Each one outlives the WBS.  
  - [x] T3.1 New SURFACE: **⌘⌥G go-to-line is an uncatalogued CM6 binding.** Whether it gets a Settings
    hotkey row is a product call (WP5 put it in `NOT_LISTED`). Target: feature backlog. Priority: low.  
  - [x] T3.2 New SURFACE: **WP8's behavior changes never had a code-quality review.** It went through the task
    path, which has no review-quality state. The action is an optional `feature-review-quality`-style pass
    over WP8's commit range (and WP10's, same reason). Priority: low-medium.  
  - [x] T3.3 New SURFACE: **paydown autopilot defaults awaiting operator ratification.** It carries the WP5,
    WP6 and WP10 "flag if wrong" lists by pointer to their archives. ⚠️ Name the WP10 one explicitly: the
    ruling said "per-panel toggle" and the build took ONE global key. Priority: low.  
  - [x] T3.4 Amend the `drive-mode-on-the-workspace-surface` finding body (or its stub) with the **R1 B′
    escalation note**, verbatim in substance: B′ is small because the respawn reads `projects.json` at spawn
    time, and it escalates only if the operator hits "change it while ⏳ is showing".  
  - [x] T3.5 Amend `SURFACE-2026-08-19-COMMENT-CONVENTION-PASS-T1-T2-DEFERRED`:
    - Record R2's sequencing (it runs **immediately after this sweep**, guard first).
    - Record the IDs this sweep routed to it that the entry does not already list: the §Scope R2 row, WP3
      MAJOR-2 (Vitest-undefined rationale ×8), WP9 MAJOR 4 and MINOR 1, and B6.  
  - [x] T3.6 WP9 MAJOR 1 (`…-DRY-RUN-ASYNC-ATTR-STILL-BLOCKS-A-RUNTIME-WORKER`): keep it where it is, but
    raise Priority to **medium-high** with a one-line why. It is a real defect, not a nit, and it can leave
    the single-run lock stuck. Mark it task-sized in its stub.  
  - [x] T3.7 Carry any gap T1 or T2 surfaced.  
- [x] T4 **Repoint the stranded references, then delete the WBS (fold-back step 4).**  
  - Rewrite `backlog-quality-findings.md:103`'s WBS reference to point at CHANGELOG or the archive.
  - `git rm workflow-system/product/backlog-paydown-wbs.md`, in a commit whose subject says the WBS was deleted
    (e.g. `chore(paydown): fold back surviving obligations and delete the paydown WBS`). The backlog edits
    from T3 go in the same commit, so no obligation lands after its source is gone.
  - Re-run `git grep backlog-paydown-wbs` outside the archives and CHANGELOG. It must return only the
    2026-08-19 historical provenance line.
  - No `pnpm verify:auto` is needed: this is docs-only, and `.prettierignore` covers `workflow-system/`.

## Current Node
- **Path:** Task > (all complete)
- **Active scope:** all complete
- **Blocked:** none
- **Unvisited:** task-verify (docs-only auto-skip) → task-close
- **Open discoveries:** none

## Reconciliation

**T1 — finding IDs (checked against the archived closure notes and the live backlog files, 2026-09-23).**
- **No resolved finding still has a body.** Every body left in `backlog-quality-findings.md` maps to a ROUTED ID:
  - R2 comment pass: B6, C6, D4, E1, G5, I5, J1, J2, K2, L2, Q1/Q2 (`…-WP2-MINOR-BATCH`), AD1 (`…-WP4-MINOR-BATCH`), AH2, and WP3 MAJOR-2.
  - R1 deferral: H2 and H5d.
  - Deferred per §Scope: AB1 and AC3.
  - mccc handoff: O2.
  - New since the sweep: the WP7 and WP9 review groups.
- **Groups whose IDs were all resolved or buried are gone:** A, F, M, N, P, R, S, T, U, V, W, X, Y, Z, AA, AE, AF and AG.
- **The two backlog files are coupled both ways.** Every findings group has a stub. The only stubs with no group are `m11-wp3` and `time-tracking`, and both say "lives only here" (WP1 §4 routed them to R2 on purpose).
- **Resolved row-item SURFACEs are gone, each with a `**Backlog resolved:**` line:**
  - Row 1 (`…-UNCHUNKED-BASE64…`), Row 7 (`…-DOCSLINKHANDLING-FLAKE…`), Row 29 (`…-HOOK-SOCKET-SHUTDOWN-RACE…`).
  - `…-SYNC-TAURI-COMMANDS-MAY-BLOCK…`, `…-SUPERVISOR-ADJUDICATE-BLOCKS…`, `…-RUN-COMMAND-PIPES…`.
  - The three WP3-residue SURFACEs.
- **Rewritten, not deleted, by design:** Row 28 (`…-NOTIFICATION-TYPE-FALLBACK…`) is a partial resolution. Row 17 (`…-TWO-UPSTREAM-COPIES…`) needed no change and stays open for mccc.
- **Per-ID mutant evidence** is in each WP's archive (WP5 "Closure", WP6 `## Closure evidence`, WP7 `## Phase N build evidence`, WP8 `## Build evidence`). It was not re-derived here, per fold-back step 1.

**T2 — §Scope.**
- **Buried:** all 11 SURFACE burials plus the 5 finding-ID burials (O1, P1, R1, T1, W1) are in `backlog-archived.md`, each with a `Buried because:` line, and none are in `backlog.md`.
- **Deleted:** the same-commit invariant was spot-checked by `git log -S`:
  - `439aa6e` (WP1: PNPM-SPIKE, GIT-CHECKOUT)
  - `bddff8b` (WP2: all 10 entries, including the R4 rulings 40, 46 and 32)
  - `7c91d30` (VERIFY-AUTO-RED), `5c9ddcd` (BASE64), `b0ba0ea` (ADJUDICATE-BLOCKS)

  Each of those commits includes `CHANGELOG.md`, and each ID has its `**Backlog resolved:**` line.
- **Deferred:** all 17 Deferred-row SURFACEs are present. Two did not name the anchor the table gave them, and are now **fixed**:
  - `…-STATUS-PATH-KEYS-ON-CWD…` → F-b.
  - `…-GUARD-VOCABULARY-MISSES-RECYCLE…` → still named M15, which closed headless. Re-anchored to `…-SUPERVISOR-HAS-NO-OPERATOR-VISIBLE-ACTIVITY-SURFACE` (the seventh arm).

**T3 — carried.**
- **Three new SURFACEs:**
  - `…-CM6-GO-TO-LINE-HAS-NO-SETTINGS-HOTKEY-ROW`
  - `…-PAYDOWN-TASK-PATH-WPS-GOT-NO-CODE-QUALITY-REVIEW` (WP8 `4a21cbf`, WP10 `37b12a2`)
  - `…-PAYDOWN-AUTOPILOT-DEFAULTS-AWAIT-RATIFICATION` (WP5, WP6, WP10; WP10's single global key is flagged)
- **Amended:**
  - The drive-mode findings group got the R1 B′ escalation note.
  - The comment-convention pass got its **roster by SURFACE ID** (the WBS's letter IDs die with it) and its sequencing ("next after the paydown").
  - WP9 MAJOR 1 is now **medium-high** in its body and stub.
- **T3.7:** the other WBS-only facts already had durable homes:
  - the no-hook-socket-helper note: `verify-self-tiers.md:115`
  - C2's "do not wire a clear during dogfooding": the `clearUnsentInput` doc
  - Row 6's residual: `source-text-guards.md:315`

**T4.** Rewrote the one stranded reference (`backlog-quality-findings.md`, `…-VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X` Location: 7 live sites). After the delete, `git grep backlog-paydown-wbs` outside archives and CHANGELOG returns only the 2026-08-19 provenance line.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
