---
workflow: task
state: COMPLETED
created: 2026-08-01
completed: 2026-08-01
docs-only: false
drive_mode: autopilot
---

# Task: Repair (B) — picker model cell refetches data already on the wire (N+1)

**Workflow:** task
**State:** plan (complete)
**Created:** 2026-08-01

## Problem Statement

Every picker row mounts a `ProjectModelCell` that fires its own `project_get_default_model` IPC read, even though `list_projects` already returned `default_model` on the wire and the picker already holds the array — so opening the picker costs N redundant full reads of `projects.json`, and clearing the filter box re-fires all N.

Resolves `SURFACE-2026-07-31-QUALITY-WP1-PER-ROW-IPC-REFETCHES-DATA-ALREADY-ON-THE-WIRE` (MAJOR, medium priority) — an N+1 introduced by M11.5 WP1 and caught at its code review, backlogged rather than fixed inline because the fix changes the picker's state shape.

## Verified against the code (every claim in the finding checked, all confirmed)

The previous repair's leading theory turned out to be wrong on measurement, so each claim here was checked rather than trusted:

| Claim | Verified |
|---|---|
| `list_projects` already returns `default_model` | ✅ `config_store/commands.rs:124` returns `Vec<Project>` — the **full** struct; `default_model` is a live field (`config_store/mod.rs:66`) |
| `RecentProject` merely omits the field | ✅ `ProjectPicker.tsx:35-38` types only `display_name` + `project_path`. Its own comment names `last_opened_at`/`default_drive_mode` as unused wire fields — and omits `default_model` entirely, which is how the gap slipped through |
| Each read is a full file read + parse + sort | ✅ `read_default_model` (`mod.rs:158`) → `read_projects` (`mod.rs:100`) → `std::fs::read` + `serde_json::from_slice` + `sort_by_recency`, then discards all but one field |
| The picker already holds the array | ✅ `setRecents(projects)` from `listProjects()` (`ProjectPicker.tsx:119`) |
| Clearing the filter re-fires all N | ✅ `visible = recents.filter(...)` (`:175`) — filtered-out rows **unmount**, so restoring them re-mounts and the `useEffect` at `ProjectModelCell.tsx:61-78` re-reads. Confirmed the effect's dep is `[projectPath]`, so a remount is a fresh read |

## ⚠️ The one thing the finding did NOT name — and it decides the fix

The finding prescribes "pass the seed in as a prop, keep the IPC setter as-is." Taken literally that introduces a **stale-seed bug**, because of how WP1 deliberately built the write path:

- `setProjectDefaultModel` returns **`void`** (`modelOverrideIpc.ts:52`), and
- there is **no broadcast event** for this setting — a deliberate WP1 decision (recorded in `wbs.md` → "WP1 as-built" #4: one surface only, so a fan-out with one subscriber was rejected).

Today the cell survives that by owning `value` in local state and **re-reading from disk on every mount**. That re-read is exactly what we're deleting. So if the seed comes from `recents` and the parent's copy is never updated on write, this happens:

1. Set project A's model to `opus` → persisted to disk; cell shows `opus`; `recents[A].default_model` is still `null`.
2. Type in the filter box so A is filtered out → cell unmounts, local state gone.
3. Clear the filter → A remounts, seeded from the **stale** `recents` → displays `Default` while disk says `opus`.

That is a visible correctness regression traded for a perf win — strictly worse than the N+1. **So the fix has two halves, not one:** widen the seed *and* write the committed value back into `recents`. The existing `setRecents` update sites (`:156`, `:169`) are the in-file precedent for doing that.

## Approach

1. **Widen `RecentProject`** with `default_model?: string | null` (optional, matching the existing `display_name?` style — the field is `Option<String>` in Rust and may be absent).
2. **Seed the cell from the prop.** `ProjectModelCell` takes `seedModel: string | null`; initialize `value`/`draft`/`valueRef` from it and **delete the read `useEffect` + the `getProjectDefaultModel` import**.
3. **Write the committed value back to `recents`** via an `onCommitted?: (projectPath, model) => void` callback the parent uses to `setRecents`, so the seed stays truthful across unmount. Called on the **success** path only — the existing failure path already reverts local state, and a revert must not poison the parent's copy.
4. **Keep the IPC setter untouched** — `project_set_default_model` is the only write path and stays exactly as-is.

**Deliberately NOT doing:** adding a broadcast event for this setting. WP1 rejected that on the record (one surface = one owner), and the callback covers the only staleness window without re-litigating the decision.

## ⚠️ Testing constraint — no component-render harness in this repo

There is **no `@testing-library/react`** and not one of 123 test files renders a component (`SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`, filed at WP1 for this exact reason). `projectModelCell.test.ts` is entirely `?raw` source guards + pure-function assertions. So the seed/write-back behavior **cannot** be pinned by rendering.

Given repair (A) just proved (for the third time in this repo) that `?raw` guards rot on the first reformat touching their target, the discipline here is: **extract the write-back decision as a pure function and assert it as a value.** That is also the repo's own stated remedy and the WP1 review's praise-worthy pattern ("extract a pure function whenever a decision has a truth table"). Concretely: a `seedFromRecents`-style helper, or `applyCommittedModel(recents, path, model) → recents'`, tested directly. Source guards may be used only for structural facts (the import is gone, the effect is gone) and only as **single-identifier** assertions.

## Context

- `src/components/picker/ProjectPicker.tsx` — `RecentProject` (`:35-38`), `recents` state (`:90`), seed (`:119`), `setRecents` precedents (`:156`, `:169`), filter (`:175`), cell call site (`:311-317`)
- `src/components/picker/ProjectModelCell.tsx` — the read effect to delete (`:61-78`), `commit()` (`:85-106`), props (`:38-42`)
- `src/cc/modelOverrideIpc.ts` — `getProjectDefaultModel` (`:33`, becomes unused by the cell), `setProjectDefaultModel` (`:52`, unchanged)
- `src/cc/modelOverride.ts` — pure helpers (`displayModelValue`, `normalizeModelValue`, `modelValueChanged`) all reused as-is
- `src-tauri/src/config_store/commands.rs:124` — `list_projects`; `:187` — `project_set_default_model`
- `src-tauri/src/config_store/mod.rs:66` — the `default_model` field; `:100` `read_projects`; `:158` `read_default_model`
- **Backend is untouched.** `project_get_default_model` stays — `SessionRegistry::spawn` still uses the Rust-side `read_default_model` at spawn, and that is the right call there.

## Work Tree

- [x] T1 Widen `RecentProject` with `default_model?: string | null` and update its comment (which currently lists the unused wire fields and omits this one — the omission that caused the bug).  <!-- status: complete -->
- [x] T2 Extract the write-back as a **pure function** (e.g. `applyCommittedModel(recents, projectPath, model): RecentProject[]`) in a testable module, per the no-render-harness constraint above.  <!-- status: complete — new `applyCommittedModel.ts` -->
- [x] T3 Change `ProjectModelCell` to seed from a `seedModel` prop and accept `onCommitted`; **delete** the read `useEffect` and the now-unused `getProjectDefaultModel` import. Wire `onCommitted` on the success path of `commit()` only — never on the revert path.  <!-- status: complete — read effect + import deleted; only the focus effect remains -->
- [x] T4 Pass `seedModel={r.default_model ?? null}` and `onCommitted` from the `ProjectPicker` call site; use the pure function from T2 inside `setRecents`. ⚠️ Do **not** call the side effect inside the state updater — StrictMode double-invokes updaters (the M10.9 WP2 double-write defect; project `CLAUDE.md` rule).  <!-- status: complete — `applyCommittedModel` is pure, so calling it in the updater is correct (it only computes next state); `useCallback` + import added -->
- [x] T5 Test the pure function directly (set, clear-to-null, unknown path is a no-op, other rows untouched, returns a new array rather than mutating). Add **single-identifier** source guards only for the structural facts (no `getProjectDefaultModel` import in the cell; no read effect).  <!-- status: complete — 13 tests, all mutation-proven (see below) -->
- [x] T6 Prove the N+1 is actually gone rather than assumed: confirm zero `project_get_default_model` call sites remain in the picker path, and that the cell has no mount-time IPC read at all.  <!-- status: complete — zero callers repo-wide; the cell's only surviving `useEffect` is the edit-mode focus one. Surfaced a discovery (see Discoveries) -->
- [x] T7 Full gate: `./node_modules/.bin/tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm vite build`. Baseline is **1427** tests; expect that plus the new pure-function tests. Also `pnpm format:check` (repair (A) just made it green — do not re-break it).  <!-- status: complete — 1440/1440 (124 files); format:check still green -->
- [x] T8 Commit. Then **delete-on-resolve**: the `**Backlog resolved:**` CHANGELOG line lands FIRST, then delete the finding body from `backlog-quality-findings.md` **and** its pointer-collapsed stub in `backlog.md` (the two files are coupled) — all in the same commit. Handled by `/task-close`, noted here so it is not lost.  <!-- status: complete — impl committed `e77afe0`; delete-on-resolve is /task-close's step -->

## Current Node
- **Path:** Task > verify (complete)
- **Active scope:** all complete, ready for close
- **Blocked:** none
- **Open discoveries:** 1 — `SURFACE-2026-08-01-PROJECT-GET-DEFAULT-MODEL-NOW-DEAD-CODE` (low), logged to `backlog.md`. It corrects a premise this plan asserted (see Discoveries).

## Outcome

**Commit `e77afe0`** — the per-row IPC N+1 is gone.

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `eslint` | ✅ 0 errors (1 pre-existing warning, `XtermPane.tsx`, untouched) |
| `pnpm format:check` | ✅ still green (repair (A) preserved) |
| `pnpm test` | ✅ **1440 / 1440** (124 files) — 1427 baseline + 13 new |
| `vite build` | ✅ 1.16s |
| N+1 removed | ✅ `getProjectDefaultModel` has **zero** callers; cell's only `useEffect` is the focus one |

**Mutation proofs** (a passing guard proves nothing — the standing lesson):

| Mutation | Guard fires? |
|---|---|
| Mutate `recents` in place instead of returning a new array | ✅ 2 tests fail |
| `default_model: model ?? r.default_model` — a plausible falsy-guard that would silently restore the staleness bug on clear-to-null | ✅ 1 test fails |
| Re-add the `getProjectDefaultModel` import (reintroduce the N+1) | ✅ 1 test fails |

## Verification Observable

**Observable:** With N recent projects, mounting the picker and then filtering-out-and-restoring every row issues **zero** `project_get_default_model` IPC calls (was N, then N again per filter round-trip) while every row still displays its correct persisted model — and a value committed then filtered out and back still reads the committed value, not a stale seed.

**Verification command:** A behavioral harness that drives the real transform + a counted IPC double, rather than asserting source text:

```bash
# 1. Counted-IPC behavioral check (the failure mode itself: how many reads fire?)
pnpm test src/components/picker/__tests__/nPlusOneObservable.test.ts

# 2. The write-back that makes seeding safe (the staleness half)
pnpm test src/components/picker/__tests__/applyCommittedModel.test.ts

# 3. Whole suite — the change touches the picker's state shape
pnpm test
```

**Expected result:** read-count **0** across mount + N filter round-trips (the pre-fix baseline being N and 2N); the seeded value equals the persisted value for every row; a committed-then-round-tripped row reads the **committed** value; all suites green with **1440+** tests.

**Why this observable and not the source guards already written:** T5's guards assert `getProjectDefaultModel` is not imported — that is *structure*, and this repo has now been bitten three times by structural guards standing in for behavior (`SURFACE-2026-07-28-QUALITY-WP2-RAW-GUARDS-STILL-LOAD-BEARING`, corroborated again yesterday). "The import is absent" is also strictly weaker than the claim: a read could be reintroduced through a different call path, a re-exported wrapper, or a `useEffect` added later, and the import guard would still pass. **The task's actual claim is a count**, so the observable counts. The unmount-remount cycle is included because that is where the original bug doubled and where the fix's own risk (a stale seed) lives — verifying mount-only would test the easy half.

## Verification Result

**Status:** PASS
**Date:** 2026-08-01

**Evidence** (quoted literally):

```
$ pnpm test src/components/picker/__tests__/nPlusOneObservable.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)

$ pnpm test src/components/picker/__tests__/applyCommittedModel.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)

$ pnpm test
 Test Files  125 passed (125)
      Tests  1449 passed (1449)

$ pnpm format:check   -> ✅ green
$ tsc --noEmit        -> clean
$ pnpm lint           -> 1 problem (0 errors, 1 warning; pre-existing, untouched file)
$ pnpm vite build     -> ✓ built in 1.11s
```

**The counted observable, which is the actual claim:**

| Scenario | reads (post-fix) | reads (pre-fix baseline) |
|---|---|---|
| Mount all N=12 rows | **0** | 12 |
| + 3 filter round-trips (unmount → remount all N) | **0** | 24 after one |
| Commit → filter out → filter back in | **0**, and the value read back is the **committed** one | — |
| IPC **writes** per commit | **1** (write path untouched) | 1 |

**Calibration — the model can see the bug it denies.** A zero-count assertion is worthless if the harness could never count anything, so the file's last block reproduces the *pre-fix* cell (seeding via `getProjectDefaultModel`) and asserts the counter reports **N on mount and 2N after one filter round-trip**. That test passing is what makes the four zeros above meaningful rather than vacuous.

**Notes:** All expected criteria met. Both halves of the fix are verified: the read-count is zero *and* a committed-then-round-tripped value re-displays the committed value (proving the write-back closes the staleness window the seeding change opened) — and both are confirmed to agree with the modelled disk state, so the seed is not merely self-consistent. No sibling-bug in the task's own scope; §4b shortcut not invoked. One out-of-scope discovery was already filed at act (`SURFACE-2026-08-01-PROJECT-GET-DEFAULT-MODEL-NOW-DEAD-CODE`).

**One thing the gate itself caught:** adding this harness turned `format:check` **red** (the new file wasn't Prettier-formatted). Fixed in place before finishing — repair (A) landing green one commit earlier made that a criterion rather than an afterthought, and it is a live demonstration of `SURFACE-2026-08-01-NOTHING-ENFORCES-FORMAT-CHECK`: nothing but this manual check stood between a new file and re-drifting the thing just repaired.

## Out of scope (deliberate)

- **A broadcast event for `default_model`** — WP1 rejected this on the record; the commit callback closes the only staleness window without a one-subscriber fan-out.
- **Removing `project_get_default_model`** — still the right read for `SessionRegistry::spawn`. Only the *frontend cell's* use of it goes away.
- **Adopting a component-render harness** — `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS` is a standing operator decision, not this task's to make. This task works within the constraint by extracting a pure function.
- **The 3 un-backlogged MINORs from WP1's review** (the `is-failed` persistence flag + two prose nits) — judged below the bar at review time; unchanged here.

## Retrospect

- **What changed in our understanding:**
  1. **The finding's own suggested fix was subtly incomplete, and following it literally would have shipped a worse bug than the one being fixed.** It said *"keep the IPC setter, and keep the getter for the post-write re-read only."* But the picker's staleness window is not at write time — it is at **remount** time, because filtered-out rows unmount and lose local state. A post-write re-read does nothing for that; only writing the committed value back into the parent's array does. Reasoning from *why the old code was accidentally correct* (it re-read from disk on every mount) is what surfaced this — reading the prescription alone would not have.
  2. **A count is a different claim than an absence, and only one of them is the task.** The natural guards here ("`getProjectDefaultModel` is not imported") assert *structure*; the task's claim is *"zero IPC reads on mount and across filter round-trips."* Those diverge: a read could return via another call path, a re-exported wrapper, or a later `useEffect`, and the import guard would still pass. Verifying the count required modelling the row lifecycle with a counted double — and then **calibrating** that model against the pre-fix behavior, because a zero-count assertion whose harness can't count anything is vacuous.
  3. **Removing a caller can strand an entire IPC command, and the plan's reason for keeping it was simply wrong.** `project_get_default_model` + its TS wrapper now have zero callers. The plan had scoped removal out because the command is "still the right read for `SessionRegistry::spawn`" — false: spawn calls the **Rust fn** `read_default_model` directly. Checking that claim instead of inheriting it is what turned a confident out-of-scope note into a filed discovery.

- **Assumptions that held:**
  - All five of the finding's factual claims verified exactly (wire payload, the omitted field, per-read cost of `fs::read` + `serde_json` + `sort_by_recency`, the held array, unmount-on-filter).
  - The ~15-line sizing was about right for the seeding half; the write-back half plus its tests is what made it larger.
  - `applyCommittedModel` belongs *inside* `setRecents` — it is pure, so StrictMode's double-invoke is harmless. The project rule bans *side effects* in updaters, not computation, and conflating those would have produced a needless `useEffect`.
  - The type-only import cycle (`applyCommittedModel` → `RecentProject` → `ProjectPicker`) is erased at compile time; `tsc` + `vite build` both confirm no runtime cycle.

- **Assumptions that were wrong:**
  - **The plan's "Out of scope" claim about why `project_get_default_model` must stay.** Corrected mid-task and filed rather than acted on (a registered Tauri command is a stringly-typed FE/BE binding; removing it wants its own sweep + smoke-launch, not a rider on a perf fix).
  - **That the new harness would be formatting-neutral.** It turned `format:check` red — one commit after repair (A) made it green. Caught only because keeping it green was written down as a criterion, which is itself the argument for `SURFACE-2026-08-01-NOTHING-ENFORCES-FORMAT-CHECK`.

- **Approach delta:** Plan shape held across all 8 steps. Two additions: the counted-IPC observable harness at verify (the plan anticipated only the pure-function tests, which turned out to verify the write-back but not the *count* that is the actual claim), and the dead-code discovery at T6. Mutation-proving was applied to every new guard — three mutations, three catches, including the one that would silently restore the staleness bug on a clear-to-null.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-08-01] T6 — `SURFACE-2026-08-01-PROJECT-GET-DEFAULT-MODEL-NOW-DEAD-CODE` (low). Removing the cell's read left **`project_get_default_model` (Tauri command) + `getProjectDefaultModel` (TS wrapper) with zero callers.** ⚠️ **This corrects a premise stated in this plan's own "Out of scope" section**, which kept the command on the grounds that it is "still the right read for `SessionRegistry::spawn`" — verified false: spawn calls the **Rust fn** `config_store::read_default_model` directly (`cc_session/mod.rs:797`), never the IPC command. Left in place deliberately rather than removed mid-task — deleting a registered Tauri command is a stringly-typed FE/BE binding change wanting its own caller sweep + runtime smoke-launch (`[[tauri-command-removal-needs-invoke-sweep]]`), which does not belong riding on a perf fix. Logged to `backlog.md`.
