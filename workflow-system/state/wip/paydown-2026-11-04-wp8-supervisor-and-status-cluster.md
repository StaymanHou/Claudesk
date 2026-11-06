---
drive_mode: autopilot
---

# Feature: Sweep WP8 — Supervisor and status cluster

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-06

## Problem Statement
Eleven small findings sit in the supervisor's activity record, its failure alarm and the status surfaces. Two can silently lose information:
- The mount seed's async replay can lose the race with a live publish. The alarm then restarts from zero after a relaunch.
- A throw from the caller's `onRecycle` is recorded as `sweep-threw`, and the decision context is dropped.

One may be user-visible: the `▾` activity popover never takes focus, so its closing Esc can also reach CC.

The rest are shape debt: a ts-for-identity dedupe, a type cycle, an ad hoc widened parameter, a 7-positional-argument readout, a time formatter borrowed from the diff viewer, three copies of one line limit, the PiP re-implementing the overlay rule, and an unclassified `notification_type`.

WP8 fixes them all before WP12 extracts the `Workspace.tsx` code that hosts some of them.

## Context
- WBS: `workflow-system/product/backlog-paydown-wbs.md` → WP8 (+ D3, the "Read before any WP that touches a test or a guard" rules). The R2 arch line already landed at WP1, so it is skipped.
- Findings resolved here (`backlog-quality-findings.md` unless noted):
  - `SURFACE-2026-10-27-QUALITY-WP3-ALARM-SEED-RACES-A-LIVE-PUBLISH`
  - `SURFACE-2026-10-27-QUALITY-WP3-ACTIVITY-FEED-DEDUPES-BY-TIMESTAMP`
  - `SURFACE-2026-09-28-QUALITY-SUPERVISOR-ACTIVITY-MINOR-BATCH` items **#3, #4, #5, #6, #8** (PARTIAL: #1/#2 are comment items for WP14, #7 is WP12's `SupervisorHeaderControl`; rewrite the entry to those three)
  - `SURFACE-2026-09-28-QUALITY-SILENT-SUPERVISOR-MINOR-BATCH` item **#5** (PARTIAL: #1/#2 remain, WP14)
  - `SURFACE-2026-10-26-QUALITY-WP4-PIP-ISAWAITINGINPUT-REIMPLEMENTS-THE-OVERLAY-RULE`
  - `SURFACE-2026-10-26-QUALITY-WP4-TYPE-CYCLE-VERIFYHUMANPAUSE-USESUPERVISOR`
  - `SURFACE-2026-11-04-QUOTA-AUTO-RESUME-FIRED-IS-AN-UNCLASSIFIED-NOTIFICATION-TYPE` (`backlog.md`)
  - Pointers in `backlog.md` to rewrite/slim at close: `m16-5-wp3-supervisor-correctness`, `m16-5-wp4-status-channel-semantics`, `silent-supervisor`, `supervisor-activity-record`.
- Code:
  - `src/state/supervisor/activityFeed.ts` — `publishActivity` (the `held.ts === record.ts` clause), the per-project `failures`/`alarms` maps.
  - `src/components/workspace/Workspace.tsx` — the seed effect (`readActivityLines(2000)` → `recentForProject(…, 50)` → `publishActivity` per record); the `workspaceSupervisorReadout(...)` call.
  - `src/state/supervisor/useSupervisor.ts` — `decideTurn` (`host.onRecycle` call), `onTurnEnd` (`TurnEndSignal & Pick<…, "last_event_at">`, both `sweep-threw` catches), `export type Decision`.
  - `src/state/supervisor/verifyHumanPause.ts` — `import type { Decision } from "./useSupervisor"`.
  - `src/state/supervisor/activityRecord.ts` — `EarlyExitReason`, `SupervisorReason`, `ERROR_REASONS`, `RecordInput`.
  - `src/state/supervisor/failureAlarm.ts` — `EFFECTS` (exhaustive `Record<SupervisorReason, …>`).
  - `src/state/supervisor/turnEnd.ts` — `TurnEndSignal`.
  - `src/cc/workspaceSupervisor.ts` — `workspaceSupervisorReadout` (3 required + 4 optional positional params; ~32 call sites, mostly tests); imports `relativeTime` from `components/workspace/diff/diffModel`.
  - `src/components/workspace/SupervisorActivityPopover.tsx` — `READ_LINE_LIMIT = 2000`, `relativeTime` import, document-level Esc listener, `role="dialog"` with no focus.
  - `src/components/workspace/diff/diffModel.ts` — `relativeTime` (+ its tests in `diff/__tests__/diffModel.test.ts`; also used by `diff/CommitList.tsx`).
  - `src-tauri/src/supervisor_activity/commands.rs` — `MAX_READ_LINES: usize = 2000`.
  - `src/pip/pipLayout.ts` — `isAwaitingInput` (re-implements `attention != null`); `src/state/workspaceStatus.ts` → `displayStateFor`; pin `src/pip/__tests__/pipFanoutWiring.test.ts`.
  - `src-tauri/src/status_broadcaster/mod.rs` — `INFORMATIONAL_NOTIFICATION_TYPES: [&str; 5]`, test `every_documented_notification_type_is_classified_deliberately`.
  - `src/state/supervisor/__tests__/archDocEnumeration.test.ts` — may pin the reason set against `arch/workflow-supervisor.md`; a new reason likely needs the doc too.

**Design decisions taken at plan time (flag if wrong):**
- **Seed = one fold per project, merged with live records by ts** (`seedActivity(projectPath, replay)` in `activityFeed.ts`). Live records published before a project's seed lands are held in a small per-project buffer. The seed merges replay ∪ buffer, deduped by record identity, sorts by ts, and recomputes the alarm from `NO_FAILURES`. Later seeds for an already-seeded project (a second workspace on the same project) are no-ops, because every record they would replay was already folded. This replaces the per-record re-publish, so `publishActivity` no longer needs a dedupe clause at all. That is how the ts-as-identity finding closes: identity matters only inside the merge, keyed on `(ts, workspaceId, outcome, reason)`. That key keeps a `duplicate-turn-end` record apart from its original even in the same millisecond. The "a newer record is already held" drop in `publishActivity` (cross-workspace publish order) is unchanged.
- **#3's new reason is `recycle-threw`**, NOT a second meaning for `sweep-threw`. `decideTurn` catches a throw from `host.onRecycle` itself and returns `outcome: "error"` with the decision context it already had (edge, mode, tokens, transcript, the deferred command). It joins `ERROR_REASONS`. In `failureAlarm.EFFECTS` it is classified like its sibling `context-pressure-recycle` (`ADJUDICATED`), with a one-line why. The outer `sweep-threw` catch in `onTurnEnd` stays for anything else.
- **`Decision` moves to `activityRecord.ts`** (it is `Omit<RecordInput, …>`, already defined there). `useSupervisor.ts` re-imports it, and `verifyHumanPause.ts` imports it from the leaf.
- **D3, one line limit:** one exported TS constant (`ACTIVITY_READ_LINE_LIMIT` in `activityRecorder.ts`) used by the seed and the popover. Rust keeps `MAX_READ_LINES` as the cap, and a vitest reads `commands.rs` with `node:fs` and pins the two equal. Anchor on the exact declaration and `grep -c` it to 1 first. `no-stored-mode` keeps being recorded (D3).
- **`relativeTime` → `src/state/timeFormat.ts`** (pure, no React). Its tests move with it, and `diffModel.ts` re-exports nothing: all 3 consumers import the new module.
- **Readout options:** `workspaceSupervisorReadout(enabled, gateEnabled, workspaceName, { unsentInput?, last?, turnOrigin?, failure? } = {})`.
- **Popover focus:** the popover takes focus on mount (`tabIndex={-1}`), handles Esc on its own `onKeyDown` with `stopPropagation`, and returns focus to the element that held it before (normally xterm's helper textarea) on close. The document-level Esc listener goes away. The outside-pointer close stays.

## Work Tree

- [x] Phase 1: Activity record, alarm and type tidy
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/state/supervisor` exits 0 and includes a test where a live record published BEFORE a 50-record replay that ends in 3 consecutive `transcript-incomplete` still yields the `transcript-format` alarm (the HEAD replay path drops all 50 and shows none). Mutation-proved: restoring per-record re-publish in the seed path fails it.
  - CLI: a vitest that seeds the same project twice (two workspaces) with the same replay leaves the alarm count unchanged after the second seed. A merge test with two distinct same-ms records for one project folds BOTH. Mutation-proved: keying the merge on ts alone fails it.
  - CLI: a `useSupervisor` test whose `onRecycle` throws produces exactly ONE record with `outcome: "error"`, `reason: "recycle-threw"`, and the decision's `edgeId`/`tokens`/`command` non-null. Mutation-proved: removing the inner catch (so the outer `sweep-threw` catch takes it) fails it.
  - CLI: `failureAlarm.EFFECTS` compiles with `recycle-threw` classified (`tsc --noEmit` exits 0). `archDocEnumeration.test.ts` passes with the doc updated if it enumerates reasons.
  - CLI: `grep -rn 'from "./useSupervisor"' src/state/supervisor/verifyHumanPause.ts` → 0 hits. `grep -rn 'Pick<WorkspaceStatusUpdate, "last_event_at">' src/state/supervisor/useSupervisor.ts` → 0 hits. A test captures the `last_event_at` VALUE the dedupe receives (`[[ts-arity-flexible-assignability-hides-a-widened-param]]`), mutation-proved by dropping it at the call site.
  - CLI: `grep -rn "diff/diffModel" src/cc src/components/workspace/SupervisorActivityPopover.tsx` → 0 hits; `grep -rn "relativeTime" src/components/workspace/diff/diffModel.ts` → 0 hits; the moved `relativeTime` tests pass.
  - CLI: `grep -rn "2000" src/components/workspace/Workspace.tsx src/components/workspace/SupervisorActivityPopover.tsx` → no read-limit literal. The new TS↔Rust pin passes and fails when either side is changed to 1999.
  - CLI: `workspaceSupervisorReadout` takes an options object (`grep -c "workspaceSupervisorReadout(" ` call sites all pass ≤ 4 arguments); `pnpm verify:auto` exits 0.
  - CLI (state-changing, dev app-data only): in a `pnpm tauri:dev` build, opening a workflow-enabled project's workspace seeds the feed. Over the MCP bridge, the workspace header's `⚙` badge renders (boot smoke after the `Decision` move and the `relativeTime` move, which change module imports; `pnpm check:link` exits 0).
  **Alignment questions:**
  - none (no operator-visible behaviour changes except that the alarm now survives the race; the WP8 rulings already decided the rest)
  - [x] P1.1 Move `relativeTime` to `src/state/timeFormat.ts` (+ tests), repoint `CommitList.tsx`, the popover and `workspaceSupervisor.ts`
  - [x] P1.2 `workspaceSupervisorReadout` → options object for the trailing four; update `Workspace.tsx` and every test call site
  - [x] P1.3 `Decision` → `activityRecord.ts`; break the `verifyHumanPause` ↔ `useSupervisor` type cycle
  - [x] P1.4 `TurnEndSignal.last_event_at?: number`; `onTurnEnd(event?: TurnEndSignal)`; value-capturing test
  - [x] P1.5 `recycle-threw`: union, `ERROR_REASONS`, `EFFECTS`, the inner catch in `decideTurn` with context, arch doc §F reason list if it enumerates reasons; test
  - [x] P1.6 `ACTIVITY_READ_LINE_LIMIT` + the TS↔Rust pin; replace both 2000 literals
  - [x] P1.7 `seedActivity` (buffer-then-merge, identity key, seed-once) in `activityFeed.ts`; `publishActivity` drops its dedupe clause; `Workspace.tsx` seed calls `seedActivity`; tests + mutants
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 0 in 56 s: lint (1 pre-existing `XtermPane.tsx` warning, 0 errors), `format:check` clean, `tsc --noEmit` clean, `check:link` "every entry linked cleanly (main, pip)", vitest 284 files / 3685 tests, `cargo fmt --check` + `clippy -D warnings` clean, `cargo test` 1068 lib + all integration targets ok.
    — evidence: boot smoke `vitest run src/__tests__/appBoot.test.tsx` → 2 passed (the phase moved `Decision` and `relativeTime` exports).
  - [x] verify-self
    - Integration boundary: YES (`Workspace.tsx` header readout + mount seed). Consuming surface: the workspace header's `⚙ supervised` badge in a dev build.
    - [x] O1 live-record-before-replay keeps the alarm — evidence: `vitest run src/state/supervisor` → exit 0, 22 files / 410 tests; "a live record published BEFORE the replay lands keeps the replay's alarm" ✓ (runner)
    - [x] O2 second seed folds nothing; same-ms distinct records both fold — evidence: failureAlarm.test.ts ✓ both (runner)
    - [x] O3 `onRecycle` throw → one `recycle-threw` record with context — evidence: activityFunnel.test.tsx 38/38 ✓ (runner)
    - [x] O4 `tsc` clean; `EFFECTS["recycle-threw"]`; archDocEnumeration 13/13; arch doc mentions it — evidence: runner
    - [x] O5 cycle and ad hoc widening gone; `TurnEndSignal.last_event_at` declared — evidence: both greps → 0 (runner)
    - [x] O6 `relativeTime` moved — evidence: greps → 0; timeFormat + diff 4 files / 31 tests ✓ (runner)
    - [x] O7 one read limit, pinned to Rust — evidence: no 2000 literal in either reader; activityReadLimit 1/1 ✓ (runner)
    - [x] O8 readout call shape — evidence: TS compiler-API scan of `src/` → "calls 31 bad 0" (runner)
    - [x] O9 consuming surface, LIVE (orchestrator, MCP bridge, dev build `target/debug/claudesk` 10:07:13 > last Rust edit 10:03:32): `#root` mounted; opened `scratch-c` (default profile, stored `autopilot`) → `workspace-header-supervisor` = "⚙ supervised", title ends "Last: withheld: no-verdict · 9d ago", and the `▾` trigger (`workspace-header-supervisor-activity`) renders. That hint comes from the mount seed (`seedActivity`) and `relativeTime` from its new module; the dev log's newest scratch-c record is `withheld no-verdict`, 9.9 days old, so the hint is exactly the seeded record. `scratch-a` showed no badge, correctly: its profile is `original-dev`, and workflow features apply only to the default profile. Dev processes torn down by PID.
  - [x] verify-human — zero admissible leaves (F11)
  - [x] verify-codify — no new tests needed: every Phase 1 behaviour got its test during build, each mutation-proved (see Build notes). Consuming surface covered by `supervisorActivityLive.test.tsx` on the real `Workspace` (existing "seeded from the file on mount" + the new live-before-seed race test). Full suite: `pnpm test` → 284 files / 3685 tests passed; Rust unchanged since verify-auto (1068 passed).

- [x] Phase 2: Status surfaces — PiP ordering, quota type, popover focus
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP8 of the operator's paydown sweep, unchanged.
  - Requirements unchanged: yes — the three findings are as filed.
  - Solution still feasible: yes — Phase 1 touched none of these files except `App.css`'s neighbourhood.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `isAwaitingInput` returns `displayStateFor(map, id) === "awaiting_input"`; `grep -n "attention != null" src/pip/pipLayout.ts` → 0 hits; the existing `pipLayout.test.ts` overlay cases pass; `pipFanoutWiring.test.ts` gains a pin that `isAwaitingInput` routes through `displayStateFor`, and that pin FAILS on the re-implemented body (mutation-proved, comment-stripped haystack).
  - CLI: `cargo test --lib status_broadcaster` passes with `quota_auto_resume_fired` in `INFORMATIONAL_NOTIFICATION_TYPES`; a test asserts `notification_awaits_input("quota_auto_resume_fired") == false` (or the equivalent `event_to_state` mapping is not AwaitingInput), and it fails when the type is removed from the list.
  - CLI: a jsdom render test of `SupervisorActivityPopover`: after mount, `document.activeElement` is the popover; an Esc keydown on the popover calls `onClose` and does NOT propagate to a `document` keydown spy; after unmount, focus returns to the element focused before mount.
  - Browser (MCP bridge, dev build): with focus in a workspace's xterm helper textarea, clicking the `▾` trigger (`el.click()`, which in WKWebView, like a real click, does not focus a button) leaves `document.activeElement` on the popover (`[data-testid="supervisor-activity-popover"]`), not on `.xterm-helper-textarea`. Positive control first, on the PRE-fix build: the same sequence leaves focus on `.xterm-helper-textarea`, which is the leak. After Esc, the popover is gone and `activeElement` is the xterm textarea again.
  **Alignment questions:**
  - Popover focus in action: open `▾` while a CC turn is running and press Esc. It should close the list and leave the turn running, with the cursor back in the terminal. Is that the behaviour you want? (decision: focus returns to the terminal on close rather than staying on the trigger.)
  - [x] P2.1 `isAwaitingInput` → `displayStateFor`; widen `AttentionStatusMap` only as far as `displayStateFor` needs (or adapt its input); extend the `pipFanoutWiring` pin
  - [x] P2.2 `quota_auto_resume_fired` → `INFORMATIONAL_NOTIFICATION_TYPES` (`[&str; 6]`) with a one-line why; an "observed, undocumented" note or list beside the documented-nine test
  - [x] P2.3 Popover focus + scoped Esc + focus restore; jsdom test; live check with positive control
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → exit 0 in 54 s: lint 0 errors (the pre-existing `XtermPane.tsx` warning only), format + `tsc` clean, `check:link` "every entry linked cleanly (main, pip)", vitest 284 files / 3687 tests, `cargo fmt --check` + `clippy -D warnings` clean, `cargo test` 1069 lib tests ok (the new quota test included).
  - [x] verify-self
    - Integration boundary: YES (`SupervisorActivityPopover.tsx` in the workspace header; `pipLayout.ts` behind the PiP). Consuming surface: the `▾` supervisor-activity popover in a dev build.
    - [x] O1 PiP ordering via the funnel — evidence: `vitest run src/pip` → exit 0, 5 files / 73 tests; `grep -c 'attention != null' pipLayout.ts` → 0; the `pipFanoutWiring` body pin present (runner)
    - [x] O2 quota type informational — evidence: `cargo test --lib status_broadcaster` → 76 passed incl. `quota_auto_resume_fired_is_informational_not_by_fallback` (runner)
    - [x] O3 jsdom popover contract — evidence: `vitest run …/supervisorActivityLive.test.tsx` → 16/16 (orchestrator, after restoring the fixed file at sha `ad9cfa6f…`; the runner left it UNVERIFIED because the control swap was in place)
    - [x] O4 LIVE, consuming surface (orchestrator, MCP bridge, dev build, `scratch-c`): focus put on `.xterm-helper-textarea`, a `document` keydown spy armed, `▾` clicked with `el.click()`.
      - **Positive control (pre-fix behaviour, current imports):** after open, `activeElement` = `xterm-helper-textarea`; the closing Esc was logged as `Escape@xterm-helper-textarea`, i.e. it went to the terminal, and the document listener closed the list. The leak is real and the probe sees it. (A first control attempt with the literal HEAD file blanked the app: it imports `relativeTime` from `diff/diffModel`, removed in P1.1. Not a product defect; the control was rebuilt from the fixed file with only the old focus/Esc behaviour.)
      - **Fixed:** after open, `activeElement` = the popover (`activeIsPopover: true`, `outline: none`); Esc on it → spy logged `[]`, popover closed, `activeElement` back on `xterm-helper-textarea`.
    - [x] align: popover focus in action — evidence: the live sequence above + screenshot `/private/tmp/claude-501/-Users-stayman-Personal-projects-claudesk/6d670d5c-609f-40bd-b247-e350edb5d908/scratchpad/wp8-popover-open.png` (list open, no focus ring). CAPTURED; judgment is the operator's.
    - Dev processes torn down by PID; the installed app untouched.
  - [x] verify-human
    - [x] P2.verify-human.1: popover focus in action — open `▾` mid-turn, press Esc: list closes, turn keeps running, cursor back in the terminal; includes the decision that focus returns to the terminal (not the `▾` trigger) — operator: "pass" (2026-11-06)
  - [x] verify-codify — no new tests needed: the consuming surface is covered by `supervisorActivityLive.test.tsx` on the real `Workspace` (focus taken, Esc scoped, focus restored, no far-off close), plus the `pipFanoutWiring` ordering pin and the quota Rust test; each was mutation-proved at build and agreed with the live check. Full suite: `pnpm test` → 284 files / 3687 tests passed; Rust unchanged since verify-auto (1069 passed).

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality (ship commit below)
- **Blocked:** none
- **Unvisited:** review-quality → finalize
- **Open discoveries:** none

## Test Triage — "Esc closes the popover" (supervisorActivityLive.test.tsx)
Classification: Obsolete test — the feature intentionally supersedes what the test checked
Confidence: high
Evidence: the test dispatched Esc on `document` and expected the popover to close; that document-level listener IS the leak the finding asked to remove (the closing Esc also reached CC through xterm), and the operator approved the replacement behaviour at P2.verify-human.1.
Action: replaced during build P2.3 by "opening takes focus; Esc closes it WITHOUT reaching the page; focus goes back" and "an Esc aimed at the terminal no longer closes the popover from afar" (both mutation-proved). Recorded here at codify for the audit trail.

## Build notes — Phase 1
- **P1.1** `relativeTime` → `src/state/timeFormat.ts` (+ `src/state/__tests__/timeFormat.test.ts`, moved verbatim). `diffModel.ts` no longer has it; `CommitList.tsx`, the popover and `workspaceSupervisor.ts` import the new module.
- **P1.2** `workspaceSupervisorReadout(enabled, gateEnabled, name, { unsentInput, last, turnOrigin, failure } = {})` + `WorkspaceSupervisorReadoutOptions`. Call sites rewritten mechanically (a parser over top-level args); positional `null`/`false` fillers dropped. `.length` stays 3, so the "takes no drive mode" test is unchanged.
- **P1.3** `Decision` now lives in `activityRecord.ts`; `verifyHumanPause.ts` no longer imports `useSupervisor.ts`.
- **P1.4** `TurnEndSignal.last_event_at?: number`; `onTurnEnd(event?: TurnEndSignal)`; the `WorkspaceStatusUpdate` import is gone. **Value check:** the existing `activityFunnel.test.tsx` dedupe tests already capture the value: mutant `claimTurnEnd(host.workspaceId, undefined)` (landed, line 386) → 2 failed. No new double needed.
- **P1.5** `HostReason = "recycle-threw"` in `activityRecord.ts` → `SupervisorReason`, `ERROR_REASONS`; `EFFECTS["recycle-threw"] = ADJUDICATED` (same decision as `context-pressure-recycle`); `decideTurn` catches `onRecycle` and returns the context + `command`/`tokens`. The funnel test was rewritten from "as sweep-threw" to "once, as recycle-threw, WITH context". Mutant (inner catch removed, landed line 336) → fails. `arch/workflow-supervisor.md` §F: schema line + a "Reason added at paydown WP8" bullet.
- **P1.6** `ACTIVITY_READ_LINE_LIMIT = 2000` in `activityRecorder.ts`, used by the seed and the popover; `activityReadLimit.test.ts` pins it to Rust's `MAX_READ_LINES` (anchored regex, asserts exactly 1 declaration). Mutants 1999 on EACH side → fail. Rust doc points back.
- **P1.7** `seedActivity(projectPath, replay)` + `SEED_REPLAY_LIMIT` in `activityFeed.ts`; `publishActivity` lost its ts-equality clause and buffers live records for unseeded projects (capped at 50). `Workspace.tsx` seeds via `seedActivity`. 7 feed tests replace the old "re-publish" test; mutants: seed-as-re-publish (2 fail), identity = ts only (1 fails), no seed-once guard (1 fails, after sharpening the test with a clearing record between seeds; it was an equivalent mutant before). **Caller guard:** a new `supervisorActivityLive` test publishes a live record before the real `Workspace` mounts; mutating `Workspace.tsx` back to per-record `publishActivity` fails it.

## Build notes — Phase 2
- **P2.1** `isAwaitingInput` = `displayStateFor(statusMap, workspaceId) === AWAITING_INPUT_STATE`; `AttentionStatusMap` is now an alias of `WorkspaceStatusMap` (`workspaceStatus.ts` imports nothing, so `pipLayout.ts` stays pure). `pipLayout.test.ts` typed against the wire map (one `null`-off-the-wire case cast with a comment). New `pipFanoutWiring` pin: the comment-stripped BODY of `isAwaitingInput` is the funnel call and never mentions `attention`, and `Pip.tsx` calls it. Mutants: the old correct re-implementation → only the pin fails (as intended: the behaviour tests cannot see it); a state-only body → 3 fail.
- **P2.2** `quota_auto_resume_fired` in `INFORMATIONAL_NOTIFICATION_TYPES` (`[&str; 6]`) with its why; the vocabulary test now pins documented ∪ `OBSERVED_UNDOCUMENTED`; new `quota_auto_resume_fired_is_informational_not_by_fallback` asserts the predicate AND the membership. Mutant (entry removed) → 2 fail. `arch/status-channel-and-surfaces.md` gating line updated; the `/release` vocabulary check reads the Rust lists, so it needs no change.
- **P2.3** The popover focuses itself (`tabIndex={-1}`), handles Esc in its own `onKeyDown` (`preventDefault` + `stopPropagation`), restores focus to the prior element on close when focus is still its own (or was lost with it), and the `document` keydown listener is gone; `:focus { outline: none }` in `App.css`. Neither document-capture Esc handler interferes (App's acts only on its own overlays; Workspace's handles zoom chords). The old "Esc closes the popover" test dispatched Esc on `document`, which is the leaking design; it was replaced by "opening takes focus; Esc closes WITHOUT reaching the page; focus goes back" and "an Esc aimed at the terminal no longer closes the popover from afar". Four mutants (no focus / Esc bubbles / no restore / document listener back) → each fails.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
