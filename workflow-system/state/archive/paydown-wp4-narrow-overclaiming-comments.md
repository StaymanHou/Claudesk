---
workflow: task
state: close (complete)
completed: 2026-09-23
created: 2026-09-23
docs-only: false  # touches .ts/.tsx/.rs/.mjs sources (comments + one printed message + two test strings)
drive_mode: autopilot
---

# Task: Paydown WP4 — narrow every over-claiming comment to what the code does

**Workflow:** task
**State:** Completed 2026-09-23
**Created:** 2026-09-23
**Parent:** `workflow-system/product/backlog-paydown-wbs.md` §WP4

## Problem Statement
About 14 comments and doc strings (plus 5 folded in from WP3's review) assert behavior the code does not have, and each one reads as live design to a future maintainer; narrow each to what the code actually does, **changing no executable code** except one printed error message.

## Context
- Finding bodies: `workflow-system/state/backlog-quality-findings.md` (groups A, C, D, G, H, I, L, N, S; plus `# paydown-wp3-boot-smoke-test`); stubs in `backlog.md`.
- ⚠️ Every site below was **re-anchored by symbol** at plan time (17 line cites had drifted). Line numbers here are as-of 2026-09-23 and are hints only.
- **Invariant for the whole task:** code files change in **comments only**, except `linkCheck.mjs`'s `console.error` message and two test strings (a test name + an assertion message). Proven at T8 by a comment-stripped token-stream diff, not by eye.
- WP4 is documentary, so there is **no mutant to name** for its own items. Closure evidence is the T8 token-equality proof. The guard-shaped WP3 residue goes to WP6, where mutants apply.

### Fold-in decision (autopilot default, disclosed — flag if wrong)
The handoff asked whether WP3's own review findings join WP4. Ruled by class:
- **IN (comment/prose over-claims):** `…PROBE-HARNESSES-CALLED-DEV-ONLY`, `…LINK-CHECK-FAILURE-MESSAGE-NAMES-ONE-CAUSE`, `…RELEASE-PRETTIER-CHECK-AFTER-WRITE-CANNOT-FAIL`, `…APPBOOT-PER-TEST-ISOLATION-OVERSTATED` (the narrow-the-comment option), `linkCheck.mjs`'s "BOTH entries" **header wording** (MAJOR-1's prose half only), and `SURFACE-2026-09-23-SOURCE-TEXT-GUARDS-ENTRIES-17-18-CITED-BUT-ABSENT`.
- **→ WP6 (guards that cannot fail):** MAJOR-1's **code** half (assert both entry chunks in the RollupOutput and mutation-prove it by narrowing `input`), `…APPBOOT-UNCAUGHT-ASSERTION-UNPROVEN`, `…LINKCHECK-TEST-OUTSIDE-TSC-INCLUDE`.
- **→ R2 comment-convention pass (NOT here):** `…VITEST-UNDEFINED-RATIONALE-DUPLICATED-8X`. It is T1 rationale duplication, and ruling R2 keeps all T1/T2 findings out of this sweep. Its "fits WP4" suggestion predates that ruling being applied to it.

## Work Tree

- [x] T1 **C1** — the supervisor toggle's "read PER TURN" claim
  - Sites: `src/cc/supervisorToggleIpc.ts` header, `src/cc/workspaceSupervisor.ts` header ("read per turn rather than at spawn"), `Workspace.tsx`'s shared stored-mode/toggle fetch effect comment + the `supervisorEnabledRef` mirror comment, `useSupervisor.ts`'s "THE THIRD CONDITION, re-read PER TURN".
  - State the truth (option **a**): the **ref** is read at fire time, every turn, but the **value** in it refreshes only (1) on a `visible` edge and (2) on this workspace's own toggle write (`setSupervisorEnabled(next)` in the toggle handler). Today that is complete, because **the only writer is the workspace's own toggle** (spec D-3: one surface, no broadcast) and `WorkspaceRegistry` is 1:1 by path. So a background workspace cannot hold a value that differs from disk.
  - Name the condition that breaks it: a second writer, or two workspaces on one tree. That is F-b's territory, where options (b) re-read on turn-end and (c) broadcast are deferred.
  - ⚠️ Keep "re-read at the last possible moment" true about the *ref read*; only the freshness claim narrows.
- [x] T2 **C2** — `UnsentInputWatermark.clear()` + `clearUnsentInput()` docs
  - Restate both as **no production caller, reserved**. The watermark deliberately does not clear at a turn boundary, and its false-positive rate is what dogfooding measures (`useSupervisor.ts`'s withheld-log comment). Keep the "never synthesize a fake `\r`" rationale as the reason the method exists.
  - ⚠️ **Do NOT wire a turn-boundary clear during dogfooding.** It would change the behavior under observation and discard real on-screen input.
- [x] T3 **H3, H5a, H5b** — drive-mode apply comments
  - H3: `startApply`'s inline hold comment ("matches the `INJECT_SETTLE_MS` idiom … for the same reason") → drop the borrowed comparison. `INJECT_SETTLE_MS` is measured and pinned; `RESPAWN_INTENT_HOLD_MS` (400) is **unmeasured**, with no test and one call site. Say so in both that comment and `applyDriveMode.ts`'s constant doc, which keeps its correct "not a guess at spawn duration" reasoning.
  - H5a: delete the orphan duplicate `// Apply: persist, then respawn…` block below `resolveDriveMode` (the original sits above `startApply`).
  - H5b: delete `/** Cancel: ⚠️ a TRUE no-op … */` stacked on `resolveDriveMode`. The funnel doc beneath it already covers both outcomes.
- [x] T4 **I3, I4** — turn-nav "push not poll" and the dead-constant comment
  - I3 (narrow the prose; **no re-architecture**, the returned `nav` stays): the truth is **push on turn-start** (`onTurnStartRecorded`) plus **re-read after a step** (`turnNavState()` in each click handler). Sites:
    - `turnMarkers.stepTurn` doc ("a caller never has to make a second call"): say it returns `nav` for callers that want it, and that the pane's handle re-reads through `turnNavState` instead.
    - `Workspace.tsx` `turnNav` state comment ("every step returns it").
    - The prev `onClick` comment ("returns the fresh nav state so this component never has to poll").
    - `turnMarkers.test.ts` test name "…so the caller needs no second call".
    - `turnNavControls.test.ts` assertion message "must store the returned nav state" → "the re-read nav state".
  - ⚠️ `turnNavControls.test.ts` strips comments before matching `if (next) setTurnNav(next)`, so the onClick comment edit cannot move that guard.
  - I4: delete the 7-line `TURN_MARKER_COLOR` provenance comment in `XtermPane.tsx`. The grey rationale is already live where it applies (`App.css`'s supervisor-toggle rule cites the same prior).
- [x] T5 **A3, D2, G3, S1, N1b, L3a, C3** — single-site corrections
  - **A3** `draftStore.loadDraft`: `getItem` returns `null` for an absent key, which is the real production case the `typeof` handles. A non-string only comes from a test double or shim; real `localStorage` cannot return one.
  - **D2** `useSupervisor`'s `useCallback(onTurnEnd, [host])`: `host` is a fresh literal every render, so identity is NOT stable, and it does not need to be. `useTurnEnd` receives an inline arrow anyway, and `useTauriListen` holds the handler in a latest-ref. Add that one line. **Keep the `useCallback`** (removing it is code; out of scope).
  - **G3** `m15SupervisorFixture.test.ts` naive-baseline comment + the probe report's Q1 evidence line (`archive/milestone-15-workflow-supervisor/wp1-probe-report.md`): the naive predicate runs over `fire + no_fire` only. It excludes the **472 `undecided`** records, and that exclusion is a policy decision. A policy-free predicate flags **234** (119 + 115 undecided with no `Skill` call; re-measured at plan time with `node` against the frozen fixture). The **number stays 119**; only the framing narrows. The report is archived, so add a dated correction to that line rather than rewriting history.
  - **S1** `SettingsPanel.tsx`: move the substrate-presence block down to sit directly above `const [substratePresent, …]` (the highlight state and effect currently sit between them).
  - **N1b** `XtermPane.tsx` spawn-effect exclusion comment: add `pendingAction` and `openIntent`.
    - ⚠️ **The finding's premise is STALE:** it calls both "immutable after mint", but `openIntent` flips to `"turn-respawn"` during a drive-mode apply (`spawnAsTurnRespawn`, M13.5 WP4).
    - Record the truth: `pendingAction` is never cleared by the reducer, and re-fire is governed by the consume-once latch (`shouldScheduleFire`). `openIntent` does change, and is excluded so a flip **alone** never re-spawns; its value is read when a nonce bump re-runs the effect.
  - **L3a** `recycleButton.ts` `showRecycleButton` doc: cite by symbol (inside the `showSkillButtons(…) &&` block in `Workspace.tsx`). Both `:514` and `:489` have drifted.
  - **C3** `config_store/mod.rs`: split the merged doc block. The blast-radius paragraphs go back onto `an_unknown_drive_mode_string_fails_the_whole_project_list`; `⚠️ THE UPGRADE PATH` stays on `an_absent_supervisor_enabled_key_reads_as_on`.
- [x] T6 **WP3 folded findings** (prose/message only)
  - `linkCheck.mjs` header "over BOTH webview entries": say it builds **whatever inputs the resolved `vite.config.ts` names (today `index.html` + `pip.html`)**, and that this is not asserted (see the WP6 item).
  - "dev-only probe harnesses" → "URL-flag-gated lazy chunks that ship in the bundle; rollup links their static imports, and only the names destructured at the `import()` site go unchecked". Change it in **both** `linkCheck.mjs` and `docs/lessons/verify-auto-gate.md` "Blind to".
  - The `catch` message becomes "check:link — FAILED: the build failed (rollup's reason follows)". ⚠️ Check `linkCheck.test.ts` first; it matches on status + combined output, so confirm no substring assertion depends on "cannot be bound".
  - `.claude/skills/release/SKILL.md` step 2: relabel the post-`--write` `--check` as a parse sanity check that cannot catch a reflow. The CHANGELOG is append-only, so it is **not** edited.
  - `appBoot.test.tsx` `beforeEach` comment: narrow "judged on its OWN errors". State that `uncaught` is reset per test, while the main tree stays mounted during the PiP test and `calls` accumulates across both (no false pass today, because only `Pip.tsx` issues `pip_get_layout`).
- [x] T7 **`SOURCE-TEXT-GUARDS-ENTRIES-17-18`** — write entries 17 + 18 in `docs/lessons/source-text-guards.md`
  - Source: `workflow-system/state/archive/fa-wp4-send-and-stage.md`. Entry 17 is MAJOR-1: the `CALL_SYMBOLS` `string | string[]` widening had zero array uses. Entry 18 is the confirm-arm finding: `ConfirmModal`/`planRecover` were present while the arm bypassed them.
  - Move the text **near-verbatim** (`[[grep-addressed-doc-loses-value-to-prose-rewrite]]`), then replace the placeholder heading. Check that CLAUDE.md's one-line summaries of 17/18 still match what was written.
- [x] T8 **Prove "comments only"** + gate
  - Script (scratchpad, not the repo): for each changed `.ts`/`.tsx`/`.mjs`, run the TypeScript scanner on the `HEAD` blob and the working copy with comments skipped, then diff the token streams. The expected diff is **exactly** the `linkCheck.mjs` message string plus the two T4 test strings. Positive control: an injected code change must show up as a diff.
  - For `mod.rs`: `git diff` must show only `///`/`//` lines moved.
  - Then `pnpm verify:auto` (timeout **216000**, per `runtimes.md`). ⚠️ A `?raw` guard that does not strip comments may pin a sentence I change (candidates: `spawnOnceOnReactivate.test.ts`, `workflowSubstratePresence.test.ts`, `settingsPanelWiring.test.ts`). If one goes red, read it before editing: it is either pinning a now-false claim (update the guard) or pinning a true one I broke (restore the sentence).
- [x] T9 **Bookkeeping** (at `/task-close`)
  - CHANGELOG `**Backlog resolved:**` line per fully-resolved entry, in the same commit as its delete from `backlog-quality-findings.md` + the pointer stub in `backlog.md`.
  - Partial entries are **rewritten, not deleted**:
    - `…DRIVEMODE-MINOR-POLISH`: (a)+(b) resolved; (c) CSS double-declare and (d) the hook extraction remain.
    - `…CONSTANT-BORROWS-…`: resolved by the "unmeasured" statement.
    - The G group's circularity entry, if it restates the naive framing.
    - `…LINK-CHECK-BOTH-ENTRIES…`: its prose half is resolved; its code half is routed to WP6.
  - Update the WBS: mark WP4 done; add the three WP3 residues to §WP6; note `…DUPLICATED-8X` → R2.

## Current Node
- **Path:** Task > close (complete)
- **Active scope:** all complete
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none (N1b note below is recorded, not backlogged)

## Act evidence (2026-09-23)
- **Comments-only proof (T8):** TypeScript-parser leaf-token diff (JSDoc + comment trivia excluded), `HEAD` vs working copy, over all 15 changed `.ts/.tsx/.mjs` files. **Exactly three token diffs:** the `linkCheck.mjs` error string (plus Prettier's inert trailing comma from reflowing it) and the two T4 test strings. Positive control: mutating `draftStore.ts`'s fallback `""`→`"x"` showed as a diff. Restored from a `cp` backup, `shasum` identical. The first run of the instrument FALSE-ALARMED on JSDoc blocks, which are child nodes in the TS AST, until they were filtered; recorded so a rerun does not trust an unfiltered version.
- **Rust (C3):** `git diff -U0` of `config_store/mod.rs` contains only `///` lines (moved doc block).
- **Gate:** `pnpm verify:auto` EXIT=0 in 35s. 220 files / 2966 tests, Rust 920 (identical to the WP3 baseline, as expected for a comments-only diff), and `check:link` clean. One known lint warning (`XtermPane.tsx` spawn-effect spread deps, now `:895` because comment lines above it moved).
- **Operator mid-turn ask:** the "mark a staged prompt as dictated" feature was appended to the WBS as **WP10**, with its seam (`stagedPayload`) and three open questions. It is not part of WP4.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [NOTE-2026-09-23] T5/N1b: the finding's own premise ("both immutable after mint") is stale since M13.5 WP4 made `openIntent` flip to `turn-respawn`. The comment will record the corrected reason; no new backlog entry is needed.

## Verification Observable

**Observable:** The working-copy diff against `HEAD` changes no executable token in any `.ts/.tsx/.mjs` file except the three declared strings, the Rust diff is `///`-only, the rewritten `check:link` failure message is what a broken build actually prints, and the full gate is green.
**Verification command:** `node <scratchpad>/tokdiff.cjs $(git diff --name-only | grep -E '\.(ts|tsx|mjs)$')`; `git diff -U0 src-tauri/src/config_store/mod.rs | grep -E '^[+-]' | grep -vE '^(\+\+\+|---|[+-]\s*///)'`; `node tooling/link-check/linkCheck.mjs tooling/link-check/fixtures/<broken>`; `pnpm verify:auto`
**Expected result:** tokdiff reports DIFF for exactly `turnMarkers.test.ts`, `turnNavControls.test.ts`, and `linkCheck.mjs` (string + Prettier's trailing comma), and `same` for every other file; the Rust grep prints nothing; the broken fixture exits 1 and prints `FAILED: the build failed (rollup's reason follows)` followed by rollup's `is not exported by` line; `verify:auto` EXIT=0.

## Verification Result

**Status:** PASS
**Date:** 2026-09-23
**Evidence:**
- tokdiff → `DIFF` for exactly `turnMarkers.test.ts`, `turnNavControls.test.ts`, `tooling/link-check/linkCheck.mjs`; `same` for the other 13 files.
- Rust non-comment grep → no output.
- Broken fixture → `check:link — FAILED: the build failed (rollup's reason follows)` then `"deletedExport" is not exported by "tooling/link-check/fixtures/broken/lib.js"`, exit=1.
- `pnpm verify:auto` → `EXIT=0 26s`, `Test Files 220 passed (220)`, `Tests 2966 passed (2966)`, Rust 920, `check:link — every entry linked cleanly`, 1 known lint warning.

**Notes:** The comments-only invariant holds mechanically, the one behavioral string change prints as intended on a real failing build, and the gate is green at an unchanged test count.

## Retrospect
- **What changed in our understanding:** Two over-claims were in places the finding did not name. C1's "per turn" appeared at **five** sites, not the one "Workspace.tsx header" the WBS named, and the stale "Phase 3 adds the broadcast… until then" line sat right next to it. H3's borrowed-credibility sentence had moved from the constant's doc to the `startApply` call site. Re-anchoring by symbol found both, where the line cites would have missed them.
- **Assumptions that held:** A comments-only change can be proven mechanically, not by eye, with a parser token diff plus a positive control. The gate's test count stayed at 2966/920, which is what a comment-only diff should produce.
- **Assumptions that were wrong:**
  1. N1b's own finding said `openIntent` was "immutable after mint". It has not been since M13.5 WP4, so writing the finding's suggested reason would have planted a new false comment while fixing an old one.
  2. The first version of the token-diff instrument false-alarmed. TypeScript's `getChildren()` returns JSDoc nodes as AST children, so every edited `/** */` block read as a code change until JSDoc kinds were filtered.
- **Approach delta:**
  - Five WP3 findings were folded in, by class, at the autopilot default. The operator was asked and did not rule, so the default is disclosed in the plan.
  - Mid-act, the operator asked for a new feature: mark a staged prompt as dictated. It was appended to the WBS as **WP10** and not built here.
  - The Prettier reflow of `linkCheck.mjs` added an inert trailing comma, which is visible in the token diff and accepted.
