---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: true
drive_mode: autopilot
---

# Task: Paydown WP1 — Backlog bookkeeping: delete, bury, restructure

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23

## Problem Statement
About one in five code-quality finding bodies and a set of SURFACE entries describe work that is already done, dormant, or recorded elsewhere, and several live entries are misfiled below `## Buried`. So `backlog.md` no longer reads as a list of open work.

## Context
- Source of truth for scope: `workflow-system/product/backlog-paydown-wbs.md` §WP1 + §Scope (the Buried/Deleted lists).
- Files: `workflow-system/state/backlog.md`, `workflow-system/state/backlog-quality-findings.md`, `workflow-system/state/backlog-archived.md`, `CHANGELOG.md`, `workflow-system/product/arch/status-channel-and-surfaces.md`, `docs/lessons/source-text-guards.md`.
- New file: `workflow-system/state/archive/backlog-cycle-close-notes.md` (historical blockquotes moved verbatim).
- ⚠️ **The GONE/stale classifications came from an inventory agent. They are claims, not facts.** Re-check each against live code or git before deleting, and delete nothing on the agent's word alone.
- ⚠️ **Delete-on-resolve:** every deleted (resolved) item gets a `**Backlog resolved:**` line under `## 2026-09-23` in `CHANGELOG.md`, in the same commit. **Burying is NOT resolving.** It moves the entry to `backlog-archived.md` and emits no CHANGELOG line.

## Work Tree

- [x] T1 Re-verify, then delete the 22 GONE finding bodies + G1 from `backlog-quality-findings.md`
- [x] T2 Delete the 4 fully-GONE headings (m10-wp4, m9-wp4, mirror-fill-from-bottom, cc-permission-mode-dropdown) + their `backlog.md` stubs
- [x] T3 Rewrite PARTIAL entries (C6, L1, Q2) down to what remains
- [x] T4 Reconcile the 10 mismatched stubs: verify stub-only claims; route LIVE ones into the WBS (WP4/WP6/R2); delete resolved ones; fix stale Priority/Pickup lines and `workflow/…` links
- [x] T5 Delete the 8 stale SURFACEs (do the prerequisite moves first: `shell-snapshots` detail → arch; pointer in `source-text-guards.md`; Q2 condition 3 → ADJUDICATOR-MARGIN entry)
- [x] T6 Bury the 16 items listed in the WBS §Scope → `backlog-archived.md`
- [x] T7 Structural: move live entries from below `## Buried` to above it; migrate that section's item to `backlog-archived.md`, then remove the section; move the historical cycle-close blockquotes verbatim to `archive/backlog-cycle-close-notes.md`
- [x] T8 Hygiene: add missing `Status:` lines; fix the ONE-TRANSITION entry's body; refresh v0.5.0 anchors in the two supervisor entries; rewrite F10B down to its measurement
- [x] T9 CHANGELOG: one `**Backlog resolved:**` bullet per deleted item under `## 2026-09-23`; final consistency check (heading count, no orphan stubs, no dangling references)

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** none (archived)
- **Blocked:** none
- **Open discoveries:** 3 (below), all folded in place; no new backlog entries

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-09-23] T4 — the WBS never routed finding C3 (`RUST-DOC-BLOCK-CHANGED-OWNERS`). It is now added to WBS WP4. The two stub claims WP1 was to verify for WP4/WP6 (m12-wp3 whole-feature-gate comments, m12-wp4b `shell_spawn_env`) turned out RESOLVED, so they were removed from the WBS. The m12-wp1 `RecentProject` regex is confirmed LIVE → WP6.
[SURFACED-2026-09-23] T8 — `SURFACE-2026-09-12-THE-TWO-UPSTREAM-COPIES-OF-THE-FEATURE-GRAPH-DISAGREE` says its `_ref/`-gated drift test is "reported as skipped, never silently passed", which contradicts the inventory's flag. WBS WP6 now says verify first; this may be no-change-needed.
[SURFACED-2026-09-23] T9 — the scale of resolved-but-undeleted findings (22 bodies, 10 stubs, one half-true closure) was added as evidence to the existing `SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE`, not filed as a new entry.

## Verification notes (for task-verify)
- Every GONE/stale classification was re-checked against live code or git before deletion (T1, T5); none was taken on the inventory agent's word.
- Delete-on-resolve: 30 `**Backlog resolved:**` lines under `## 2026-09-23` map 1:1 to the deletions (12 whole finding entries, 5 sub-item groups, 5 stub-only claims, 8 SURFACEs).
- Stub↔group cross-check: every findings group has a stub. The 2 stubs without a group (m11-wp3, time-tracking) are intentional ("lives only here"), and file-op is a pre-existing name mismatch.
- Identifier diff: 183 backticked tokens dropped, all traced to deleted/resolved entries or to fixed-at-review history in rewritten stubs. The `shell-snapshots` detail was moved to arch before its entry was deleted.
- `grep -c "^>" backlog.md` = 0; backlog.md 98 → 73 sections; 16 items → backlog-archived.md (11 SURFACEs + 5 finding bodies, and the 1 inline Buried item).

## Verification Observable

Verification skipped: docs-only declared at plan time. No runtime surface to verify. (The act-side consistency checks are recorded under "Verification notes" above.)

## Retrospect
- **What changed in our understanding:** the findings file is **per-finding** (`## SURFACE-…-QUALITY-…` entries under `# <feature> — <date>` groups), not per-feature. The inventory agent's letter IDs were a derived grouping, so several "delete this finding" items were really **rewrite this grouped entry** operations. And resolved-but-undeleted findings cluster in grouped entries: when a sweep resolves a sub-item, no heading disappears, so nothing prompts the delete. That is the scale evidence now added to `SURFACE-2026-08-26-DELETE-ON-RESOLVE-REWRITE-PATH-SKIPS-THE-DELETE`.
- **Assumptions that held:** the inventory agent's GONE classifications. All 22 finding bodies + G1 + 8 SURFACEs survived an independent re-check against live code or git. Re-checking was still the right call, because the classification was a claim.
- **Assumptions that were wrong:**
  - The WBS I authored had an **unrouted live finding** (C3) and **misdescribed the finding-ID key**. Both were found by executing it, not by reviewing it.
  - WP1's "verify then route" stub claims were mostly already RESOLVED (`shell_spawn_env`, the whole-feature-gate comments, `ALLOWED_SAMPLE`, kebab-case, the 3-ways clear).
  - The inventory's row-17 "silently skips" flag is contradicted by the entry's own text.
  - The in-file `## Buried` held one item; burial proper lives in `backlog-archived.md`.
- **Approach delta:** block-level scripted edits (split on headings, replace or delete whole blocks, assert each target matches exactly once) instead of hand edits, from backups in the session scratchpad. Plus a **backticked-identifier diff** (per `[[grep-addressed-doc-loses-value-to-prose-rewrite]]`) to prove the stub rewrites dropped only resolved history (183 tokens, each traced). The plan had not named that check; it should be standard for any backlog rewrite.
