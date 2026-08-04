---
feature: M12 WP2 — The unclean flag: lifecycle, clean-exit clearing, and the exit button
workflow: feature
state: finalize (complete) — ARCHIVED 2026-08-03
created: 2026-08-03
drive_mode: autopilot
milestone: M12
wbs_wp: WP2
---

# Feature: M12 WP2 — The unclean flag (lifecycle, clean-exit clearing, exit button)

**Workflow:** feature
**State:** finalize (complete) — COMPLETED 2026-08-03
**Created:** 2026-08-03

## Problem Statement

M12's auto-resume decision model rests on an **unclean-exit flag**: default-SET when a
workspace opens, cleared **only** by a clean exit. A power loss runs no code, so a crash and
a clean shutdown produce *distinguishable* state for free — and the design fails toward
"resume the mid-flight workflow." WP2 builds the **signal half** end to end: the store, the
set-on-open, clearing on every clean-exit route, a consume-once primitive for WP3, and the
workspace-close button that closes **without** clearing. **No auto-fire in this WP** — WP2
makes the flag *correct*; WP3 makes it *act*. Sequencing is deliberate (derisk-first): auto-fire
cannot be verified against a flag whose lifecycle is still in question, and task 2.7's
simulated hard kill is what proves the signal WP3 reads is trustworthy.

**WP1 settled two facts this WP must NOT re-decide** (`wbs.md` → "Probe outcomes", Verdict (a)):
1. **The store is its own file** — `session-state.json` in the per-identity `app_data_dir()`,
   a **path→bool map where ABSENT MEANS CLEAN** (clearing removes the key; an absent file is
   the correct cold-start state). Candidate 1 (a field on `Project`) was disqualified by a
   **lost-update hazard**, not byte cost: every `projects.json` write is whole-file RMW and
   set-on-open is co-triggered by the same click as `add_or_touch`'s recency stamp.
2. **The set lands AFTER `SessionRegistry::spawn` succeeds** — a failed spawn must leave no
   flag. `spawn` already resolves `data_dir` + `project_path` (`cc_session/mod.rs:788-800`),
   so **no signature change** is needed. This is what confirms the M-not-L sizing.

**Precedent followed:** `status_log` (`status_log/mod.rs`) already owns a small machine-local
file in the same per-identity `app_data_dir()`. This is the **third instance of an established
pattern**, not a new one — and dev/prod isolation comes free (required, since dogfooding
Claudesk with Claudesk runs both identities concurrently).

**No 3rd-party dependency** — entirely internal (local filesystem store + existing spawn/close
paths). WP1's probe already discharged the unknowns-first requirement.

**Problem statement unchanged (F9 back-loop re-check, 2026-08-03).** verify-auto found a
missing *proof*, not a wrong behavior: the store choice, the flag lifecycle, and the opt-in
clearing design are all unaffected, and the shipped ordering is already correct. What shifted
is narrower — my reading of what WP1's fact 2 ("the set lands AFTER spawn succeeds")
*requires*. Stating it in a comment and leaning on the `?` satisfies the behavior but not the
outcome, which asked for it to be **mutation-provable**. So the fix is additive (make the
existing correct ordering assertable), not corrective.

### Key finding from plan-time code reading (shapes the phasing)

`cc-exit-<sid>` fires on **both** a user-typed `/exit` **and** a Claudesk-initiated
`cc_kill` — the kill sequence's step 4 (`KillStep::ReapLeader`) reaps the leader
*specifically so* the reader thread hits EOF and `cc-exit` fires (`cc_session/mod.rs:604,
716`). **Consequence:** `/exit` and the filmstrip × do not need to be distinguished, and one
backend-side clearing point covers both. This is why Phase 2 groups them. The **unclean-exit
button** (task 2.4) is therefore NOT "a close that skips a frontend call" — it must be a close
that takes a **different backend path**, or the shared `cc-exit`-driven clearing would clear
its flag too. ⚠️ This is the single most likely thing in WP2 to be built wrong.

## Work Tree

- [x] Phase 1: The store + the pure lifecycle module  <!-- status: COMPLETE (2026-08-03) — all impl + all 4 verify nodes [x] -->
  **Observable outcomes:**
  - CLI: `cargo test session_state` exits 0 with a **non-zero test count printed**
    (`running N tests`, N ≥ 12) — per `[[cargo-test-filter-outcomes-are-vacuous-without-a-count]]`.
  - CLI: `cargo test` exits 0; lib-target count ≥ 744.
    ⚠️ **Baseline corrected at build time:** the plan said "≥ 733 (the WP1 close baseline)",
    but 733 was the **cross-target** total; the **lib target** baseline is **726** (measured
    by stashing this WP's changes and re-running). 726 + 18 new = **744**. Stated so a later
    reader does not compare a lib-target count against a cross-target number.
  - CLI: A round-trip test proves **absent key == clean**: write flag for path A, read path B
    → `false`; clear A → the key is **removed from the serialized JSON** (assert on the parsed
    map's key set, not on a bool), and an absent *file* reads `false` for every path.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0 (`--all-targets`, NOT `--lib`).
  - CLI: `cargo fmt --check` exits 0.
  - [x] P1.1 Create `src-tauri/src/session_state/mod.rs` — the `session-state.json` store in
        `app_data_dir()`, `HashMap<String, bool>` path→unclean, atomic `.tmp`→`rename` write
        (mirroring `write_projects`/`write_settings`). Missing file = empty map (NOT an
        error); malformed file = degrade to empty + best-effort, never panic a spawn or a
        quit.  <!-- status: DONE -->
  - [x] P1.2 The **pure lifecycle module**: `set` / `clear` / `consume` as functions over the
        map value, `#[cfg(test)]`-drivable so tests import and drive the **real** transitions
        rather than a replica — the standing
        `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]` method. `consume`
        returns the prior value **and** clears (WP3's fire path consumes it).  <!-- status: DONE -->
  - [x] P1.3 Pin **absent-means-clean** as a named test, plus the degraded-read arms
        (missing file / unreadable / corrupt JSON → `false`, never `true`). Failing toward
        "no auto-fire" is the safe direction and must be asserted, not assumed.  <!-- status: DONE -->
  - [x] P1.4 Document the **category** distinction at the module head: machine-local session
        state, NOT a user preference — it must never appear in a settings surface. Record the
        WP1 reopening condition (candidate 1 becomes viable only if `projects.json` writes
        stop being whole-file RMW) so a future reader need not re-litigate.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — 4/4 scoped checks pass (2026-08-03) -->
  - [x] verify-self  <!-- status: DONE — 6/6 outcomes PASS, subagent-verified (2026-08-03) -->
  - [x] verify-human  <!-- status: DONE — AUTO-SKIPPED (F11) per drive_mode=autopilot; all 4 gates clean, no integration boundary (2026-08-03) -->
  - [x] verify-codify  <!-- status: DONE — +3 durability tests, 2 more mutants killed; 747 pass (2026-08-03) -->

- [x] Phase 2: Set on open + clear on every clean-exit route  <!-- status: COMPLETE (2026-08-03) — all impl (P2.1–P2.7) + all 4 verify nodes [x] -->
  **Observable outcomes:**
  - CLI: A test drives `SessionRegistry::spawn`'s **success** path and asserts the flag is
    set for that project path; a test drives the **failure** path (spawn returns `Err`) and
    asserts **no key is written** — the ordering guarantee, mutation-proven by moving the set
    above the `?` and watching the failure test go red.
  - CLI: The four clean-exit routes are enumerated **as data** (a `const`/enum a test can
    iterate), and each has its own test asserting the key is removed. A test asserts the
    enumeration is **exhaustive** against that data (add a route → the test must fail until
    it is covered).
  - CLI: `cargo test -p claudesk` exits 0, count ≥ Phase 1's.
  - Browser (live, MCP bridge): open a scratch workspace → `session-state.json` on disk
    contains that path with `true`; `/exit` in the CC pane → the key is **gone** from the
    file (read the file, not a UI proxy).
  - Console: no new errors in the webview console across open + close.
  - [x] P2.1 **Set on open.** Wire into `SessionRegistry::spawn` immediately **after** the
        `PtyCcSession::spawn(...)?` succeeds — no signature change (`data_dir` +
        `project_path` are already in scope at `mod.rs:788-800`). Best-effort: an IO failure
        must never block a spawn (same posture as the `read_default_model` degradation
        already documented there).  <!-- status: DONE -->
  - [x] P2.2 **Clear on `/exit` + filmstrip ×** — one backend-side point. Per the Problem
        Statement finding, `cc-exit-<sid>` covers both; clearing keys on **project path**, so
        the clearing site must have the path (map session id → project path, or clear at the
        `cc_kill`/reader-EOF site that already knows it). Choose the site that makes the
        unclean-exit button (P2.4) able to opt OUT — that constraint drives the placement.  <!-- status: DONE -->
  - [x] P2.3 **Clear on app quit.** `perform_quit_teardown` (`lib.rs:111`) already has the
        `AppHandle` + the killed session ids; clear each session's project path there,
        alongside the existing `record_workspace_close` marker loop. Best-effort — must never
        panic the quit path (the module head's stated discipline).  <!-- status: DONE -->
  - [x] P2.4 **The unclean-exit button.** Closes the workspace **without** clearing the flag,
        while still reaping the PTY cleanly (that clean process-level shutdown is the button's
        entire remaining value over a force-quit). Reuse the existing close path +
        M10.5-WP2's active-close confirmation gate — do NOT add a second close mechanism.
        ⚠️ Must take a path the P2.2 clearing does **not** fire on; assert that with a test
        that would fail if the button routed through the clearing close.  <!-- status: DONE -->
  - [x] P2.5 **Pin Recycle Session as a CLEAN boundary** for M13 — it writes `.session.md`
        first, so it is clean *by intent*. A comment + a test asserting the clearing contract,
        so M13 **inherits** it rather than rediscovering it. (Operator-confirmed at
        decomposition.)  <!-- status: DONE -->
  - [x] P2.6 Fix the stale test at `cc_session/mod.rs:918` — `"/session-resume"` →
        `"/session-restore"`. It currently reads as authoritative about a command that does
        not exist (renamed at WP5/M9 *specifically* to avoid colliding with the built-in
        `/resume` that M12's other branch uses).  <!-- status: DONE -->
  - [x] P2.7 **Make the spawn-ordering guarantee testable.** Extract the flag-set decision
        into a pure fn (the `resolve_spawn_model` shape, `cc_session/mod.rs:355`) so a test
        can drive the `Err` arm and assert no key is written — then mutation-prove it by
        moving the set above the `?`. Added by the verify-auto F9 back-loop: the code is
        already correct, but nothing would go red if a future tidy-up reordered it.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — 4/4 scoped checks pass on re-run after the P2.7 fix (2026-08-03) -->
  - [x] verify-self  <!-- status: DONE — 5/5 live outcomes PASS via the MCP bridge (2026-08-03) -->
  - [x] verify-human  <!-- status: DONE — operator APPROVED on re-verify after 2 rejects were fixed (2026-08-03) -->
    - [x] P2.verify-human.1 hover bridge (both modes)  <!-- status: DONE — re-verified: slow travel now holds the ⏸ -->
    - [x] P2.verify-human.2 both filmstrip modes  <!-- status: DONE — re-verified -->
    - [x] P2.verify-human.3 consuming surface capture  <!-- status: SKIPPED by operator -->
    - [x] P2.verify-human.4 ⏸ absent when workflow gate OFF  <!-- status: DONE — operator confirmed absent with gate OFF, returns with it ON -->
  - [x] verify-codify  <!-- status: DONE — +9 tests (5 hover-bridge, 4 open_project_paths), 2 mutants killed; 758 cargo + 1768 vitest (2026-08-03) -->

- [x] Phase 3: Hard-kill survival — the case the design exists for  <!-- status: COMPLETE (2026-08-03) — impl + all 4 verify nodes [x]; verify-human DEFERRED by operator (carried) -->
  **Observable outcomes:**
  - CLI: Open a workspace in a real running app (or a harness that runs the real spawn path),
    confirm `session-state.json` has the key `true`, then `kill -9` the app process so **no
    clean-exit code runs** — relaunch and confirm the key is **still `true`**. This is the
    one outcome no button can produce and no unit test can fake.
    ⚠️ **PID-scoped kill only** — never a blanket `pkill`/port-kill
    (`[[verify-self-dev-vs-prod-process-name-collision]]`: a blanket kill took out the
    operator's live app on 2026-07-13). Target the dev identity by PID captured at launch.
  - CLI: The inverse arm — a **clean** quit of the same workspace leaves **no** key. Both
    arms in one run, so the hard-kill result is decisive rather than under-determined
    (a passing hard-kill arm proves nothing if a clean quit also leaves the key).
  - CLI: `cargo test -p claudesk` + `pnpm test` both exit 0 with counts ≥ prior phase.
  - [x] P3.1 Build the hard-kill check as a **repeatable** procedure (documented commands +
        the PID-capture discipline), not a one-shot manual poke — WP3 and M13 will both want
        to re-run it.  <!-- status: DONE -->
  - [x] P3.2 Run **both arms** (hard kill → flag survives; clean quit → flag gone) against the
        same workspace, and record the observed `session-state.json` contents at each step in
        the WIP file as evidence.  <!-- status: DONE -->
  - [x] P3.3 Confirm dev/prod isolation holds — the dev identity's `session-state.json` lives
        under `com.claudesk.app.dev/` and the prod file is untouched by the whole run
        (`ls` + mtime check on the prod path before/after).  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — 6/6 scoped checks pass incl. the live prod-exclusion safety check (2026-08-03) -->
  - [x] verify-self  <!-- status: DONE — 5/5 outcomes PASS, subagent-verified read-only (2026-08-03) -->
  - [x] verify-human  <!-- status: DEFERRED by operator (2026-08-03) — carried to full-feature delivery, NOT approved-as-verified. See "Operator-carried check" below. -->
    - [ ] P3.verify-human.1 review the SIGKILL guard in the repo  <!-- status: DEFERRED — carry to WP3/feature delivery -->
    - [ ] P3.verify-human.2 confirm the both-arms flag contrast live  <!-- status: DEFERRED — carry to WP3/feature delivery -->
  - [x] verify-codify  <!-- status: DONE — +8 hard-kill-guard tests, mutant 11 killed; 758 cargo + 1776 vitest (2026-08-03) -->

## Current Node
- **Path:** Feature > refactor (complete) > finalize
- **Active scope:** none — all 3 phases `[x]`; shipped as `c149911`.
- **⚠️ NOT PUSHED:** 2 commits ahead of origin/main (`b4e082f` WP1 close + `c149911` WP2).
  Held deliberately — pushing is the operator's call.
- **Carried:** Phase 3 verify-human deferred by the operator to full-feature delivery
  (`SURFACE-2026-08-03-M12-WP2-HARD-KILL-VERIFY-HUMAN-DEFERRED`)
- **Blocked:** none
- **Unvisited:** Phase 2 verify-auto → verify-self → verify-human → verify-codify, then
  Phase 3 (hard-kill survival, both arms)
- **Open discoveries:** none
- **Phase 1:** ✅ COMPLETE — store + pure lifecycle, 21 tests, 4 mutants killed
- **Phase 2:** ✅ COMPLETE — set-on-open, opt-in route clearing, the hover-revealed ⏸ (gated),
  Recycle pinned for M13, stale test fixed. **10 mutants killed** across both phases.
- **Blocked:** none
- **Unvisited:** Phase 1 verify-self → verify-human → verify-codify; then Phase 2 (set on open
  + clear on all four clean-exit routes + the unclean-exit button + the stale-test fix), then
  Phase 3 (hard-kill survival, both arms)
- **Open discoveries:** none

## Build log — Phase 1 (2026-08-03)

**Shipped:** `src-tauri/src/session_state/mod.rs` (new module, registered in `lib.rs`) — the
`session-state.json` store + the pure `set`/`clear`/`consume`/`is_unclean` lifecycle + two
best-effort persist wrappers. 18 tests, all passing. Lib-target total 726 → **744**.

**Mutation-proven, not merely tested** (both mutants confirmed to land in *executable* code
via `sed` before believing the result, per `[[verify-the-mutation-landed]]`):
- **Mutant 1** — `clear` writes `false` instead of removing the key (violating ABSENT MEANS
  CLEAN): **killed by 4 tests**, including the one that asserts on the *parsed on-disk key
  set* rather than on a bool. That assertion is the one that matters: a `false` value would
  satisfy `!is_unclean` while leaving the key on disk.
- **Mutant 2** — a corrupt/unreadable file returns a map asserting *unclean* (the unsafe
  direction): **killed by both degraded-read tests**. This is the arm that protects against a
  spurious `/resume` firing off a garbage file.

**Deliberate deviation from the plan, with rationale.** Clippy `--all-targets -- -D warnings`
failed with 11 dead-code errors — correct and expected, since Phase 1 builds the store and
Phase 2 wires the callers. Resolved with **targeted per-item `#[allow(dead_code)]`, each
naming the consumer that retires it**, NOT a module-wide `#![allow(dead_code)]`. This follows
an explicitly-recorded lesson in this codebase rather than inventing a posture:
`workflow_install/mod.rs:48` carried a blanket allow with an expiry note ("remove when Phase 4
lands"), Phase 4 landed, **nothing tracked it**, and it masked a test-only helper sitting in
production code until code review found it — its comment now reads "Do not re-add it."
`reclassify/mod.rs:42` reached the same verdict independently. One allow per item means each
expires visibly and separately.
⚠️ **`consume` is the single attribute expected to survive WP2 close** (its consumer is WP3's
auto-fire path) — recorded so that is a decision, not an oversight. Any *other* surviving
attribute at WP2 close means that item has no caller and should be questioned.

**Baseline correction:** the plan's "≥ 733" was the **cross-target** total from WP1's close;
the **lib-target** baseline is **726**, measured by `git stash`-ing this WP's changes and
re-running. Corrected in Phase 1's outcomes so a later reader does not compare a lib-target
count against a cross-target number.

## Verify-self log — Phase 1 (2026-08-03)

**6/6 outcomes PASS** (subagent `feature-verify-self-runner`). Zero BLOCKING, zero COSMETIC.

**Integration boundary: NONE** — Phase 1 adds isolated new artifacts only (a new module + one
`mod` line). Nothing imports it yet, which is exactly why clippy reported 11 dead-code items.
No existing endpoint, UI surface, CLI command, job, or outbound call was modified. **Phase 2 is
where the boundary appears** (`SessionRegistry::spawn` + the close/quit paths), and its
outcomes already cite those consuming surfaces by name.

Results: 18 `session_state` tests (count printed, not a vacuous filter pass) · lib target
726 → **744**, matching the prediction exactly · the three named absent-means-clean tests exist
and pass · clippy `--all-targets` clean · fmt clean · `mod session_state;` confirmed at
`lib.rs:52`.

**Two checks the subagent added beyond the brief, both kept:**
1. It re-ran clippy after `touch`ing both source files to **force a genuine recompile**, rather
   than accepting a warm-cache `Finished`. That closes a vacuous-pass risk the outcome as
   written did not guard against — a cached clippy result proves nothing about the new code.
2. It confirmed the implementation fact underneath outcome 3: `clear` is
   `map.remove(path).is_some()` (line 148) and `is_unclean` is `.copied().unwrap_or(false)`
   (line 168). That is what makes the on-disk key-set assertion load-bearing rather than
   decorative — a stored `false` would satisfy `!is_unclean` but fail the key-set check.

## Verify-codify log — Phase 1 (2026-08-03)

**No integration boundary** — phase adds isolated new artifacts only. So no consuming-surface
test is required (or possible) here; that obligation lands on Phase 2, whose outcomes already
name `SessionRegistry::spawn` and the close/quit paths.

**Coverage assessment, not test-padding.** All 8 public functions already had behavioral
coverage from the 18 TDD tests, so the question was what is *verified but not
regression-proof*. Three genuine gaps found — each a silent-regression channel where every
existing test would still pass:

1. **`write_leaves_no_tmp_sidecar_behind`** — the `.tmp`→`rename` contract was asserted
   nowhere. A `rename`→`copy` "simplification" leaks one stale sidecar per write.
2. **`write_replaces_rather_than_appends_so_a_shrinking_map_cannot_leave_stale_keys`** — a
   merge-instead-of-replace write leaves a cleared key on disk. **A stale `true` key is
   precisely a spurious `/resume` on next open** — the feature's worst failure mode.
3. **`interleaved_writers_do_not_lose_each_others_flags`** — the hazard that *disqualified
   candidate 1*. WP1 rejected the `Project` field over lost updates; nothing proved the
   replacement doesn't inherit the flaw it was chosen to avoid. Now it does. (Why it holds:
   each persist wrapper does its own read→mutate→write, so a writer starting after another
   has landed observes it; candidate 1's failure needed two writers snapshotting the same
   *pre*-state.)

**Both new tests mutation-proven** (each mutant `sed`-confirmed to land in executable code
first, per `[[verify-the-mutation-landed]]`):
- **Mutant 3** — `rename` → `copy` (leaks the sidecar): killed by gap-1's test, and *only* by
  it. A precisely-targeted guard, not incidental coverage.
- **Mutant 4** — `write` merges with on-disk state instead of replacing: killed by **4** tests,
  including gaps 2 and 3. This is the dangerous one, and it is now over-covered rather than
  under-covered.

**Suite: 744 → 747, 0 failures.** clippy `--all-targets` clean, fmt clean. No test triage
entries — nothing failed except the deliberate mutants, each reverted immediately after.

**Running mutant tally for Phase 1: 4 killed** (clear-writes-false · corrupt-read-asserts-unclean
· rename→copy · write-merges). Every load-bearing claim in the module header is now pinned by a
test proven to fail when the claim is violated.

## Build log — Phase 2 (2026-08-03)

**⚠️ The plan's central premise about clearing was WRONG, and the correction is the most
important thing in this phase.** The plan said `cc-exit-<sid>` covers `/exit` and the
filmstrip × identically, so "one backend-side clearing point covers both." That is true —
and it is exactly why `cc-exit` is the **wrong signal to clear on**. Three findings, each
from reading the code rather than reasoning from the plan:

1. **`cc-exit` fires for the unclean-exit button too**, since `CcSession::kill`'s step 4
   reaps the leader precisely so the reader thread hits EOF. A clear driven off that signal
   would clear the flag the ⏸ button exists to preserve — silently defeating it.
2. **`PtyCcSession` does not retain `project_path`** (consumed as the PTY's cwd at spawn),
   and **`cc_kill` receives only a `session_id`**. So no kill site can even name the project
   to clear. The plan's "map session id → project path, or clear at the site that already
   knows it" describes a mapping that does not exist.
3. **`cc_kill` fires from `XtermPane`'s unmount cleanup, which also runs on every StrictMode
   remount in dev.** Clearing there would clear the flag on a remount that is not an exit.

**The correction: clearing is OPT-IN per route, never a side effect of teardown.** A
`CleanExitRoute` enum (`CcExitCommand` · `WorkspaceClose` · `AppQuit` · `RecycleSession`)
plus one command `session_state_mark_clean(project_path, route)`. The ⏸ close clears nothing
**by not calling** — it cannot forget to opt out, because there is nothing to opt out of.
Fail-safe direction: a route someone forgets to wire leaves a stale flag (one spurious
`/resume` offer), whereas the inverse default silently disables the whole feature.

**A second correction, unprompted by the plan: path-key agreement.** App-quit reads its
paths from `WorkspaceRegistry`, which stores **canonicalized** keys, while spawn receives the
frontend's raw `projectPath`. Both derive from the same `ws.project_path` so they agree
*today* — but that is a coincidence at two call sites, not a property. All sets and clears
now route through `key_for()`, making agreement structural.

**Operator decision — the ⏸ affordance (P2.4).** The WBS specified the *behavior* but not the
*control*. Operator chose a **pause icon (two vertical bars) revealed on hover directly
beneath the ×**, with a **shared invisible hover zone** wrapping both so there is no gap to
cross, in **both** filmstrip render modes. Explicitly rejected: an ⌥-modifier ("not obvious
or intuitive"), and a two-option dropdown (the × keeps its own behavior; hover *reveals* a
second control rather than replacing the × with a menu). Zero permanent real estate — the ⏸
is `visibility: hidden` and absolutely positioned, so the collapsed pill row costs exactly
what it did before.

**Shared cluster component.** `TileActions` owns both controls. Rationale beyond DRY: these
must be `<span role="button">` because the pill and tile are themselves `<button>` elements,
and a nested button is invalid HTML that fails **silently** (inner clicks surface on the
outer handler). That was 4 hand-copied sites once a second control was added; the nesting
discipline now lives in one place. Two orphaned CSS blocks (`.filmstrip-pill-close`,
`.filmstrip-tile-close`) were **deleted**, not left behind — the expanded tile's larger
15px sizing was deliberately preserved rather than silently unified to the pill's 14px.

**Mutation-proven (2 more, each `sed`-confirmed in executable code first):**
- **Mutant 5** — added a `markSessionUnclean` export: killed by the by-construction absence
  test. Confirms that guard is not vacuous.
- **Mutant 6** — dropped the `unclean` intent in `resolveCloseIntent` (always resolve clean):
  killed by exactly the intended test. This is the phase's highest-risk logic — the × and ⏸
  share ONE confirm dialog, so a dropped intent means the ⏸ silently clears the flag for
  precisely the busy workspaces most likely to need it, with nothing visible in the UI.
  Extracted to a pure function specifically so it could be driven by a test.

**Gates:** 750 cargo · 1759 vitest · tsc clean · eslint 0 errors (1 pre-existing warning in
`XtermPane.tsx`, confirmed pre-existing by stashing) · prettier clean · `cargo clippy
--all-targets -D warnings` clean · `cargo fmt --check` clean · production `vite build` clean.

**Not yet done in this phase:** the Observable outcomes still require the *live* checks (open
a workspace → key present on disk; `/exit` → key gone) and the spawn-ordering mutation test.
Those belong to verify-auto/verify-self, next.

## Verify-auto — Phase 2 (2026-08-03) — FAIL, back-loop F9

**Scoped checks: 4/4 PASS.**
- `eslint` on the 5 changed frontend files → exit 0, no findings.
- `vitest src/state/__tests__/cleanExit.test.ts` → **9 passed**.
- `cargo test session_state` → **`running 24 tests`**, 24 passed.
- `cargo test slash_command` → **`running 3 tests`**, 3 passed (P2.6's fix included).

**But one Phase 2 Observable outcome is UNMET, and verify-auto is where that shows up.**
The outcome reads:

> *a test drives the **failure** path (spawn returns `Err`) and asserts **no key is
> written** — the ordering guarantee, **mutation-proven** by moving the set above the `?`
> and watching the failure test go red.*

**No such test exists.** The code is correct by reading — the `?` on `cc_session/mod.rs:800`
does structurally guarantee it — but "correct by reading" is precisely the standard this
outcome was written to refuse. Nothing today would go red if a future edit moved the
`set_and_persist` call above the `?`, and that edit is *plausible*: it looks like a harmless
tidy-up that groups the flag write with the config reads.

Why it was missed at build: `SessionRegistry::spawn` needs a real `AppHandle`, so the
ordering cannot be asserted in place — and I wrote the wiring without extracting the
decision that would make it assertable. The precedent for the fix is already in the same
file: **`resolve_spawn_model` (`mod.rs:355`)** extracts exactly this shape of
untestable-in-place decision into a pure function.

**Classification: code gap (missing guard), not a spec problem** → F9 back-loop to build,
scoped to one leaf. The failure direction is benign today (the code is right), so this is
not a live defect — it is a *missing* proof for a property the plan declared load-bearing.

## Build log — P2.7 (F9 back-loop fix, 2026-08-03)

**What was missing:** the ordering guarantee was true only by **statement order** — the flag
write sat after a `?`, so no test could go red on it. Correct, unprovable, and one plausible
"tidy-up" (grouping the flag write with the config reads a few lines above) away from silently
inverting.

**The fix — `should_set_unclean_flag(spawn_ok, data_dir)`**, mirroring `resolve_spawn_model`
(`cc_session/mod.rs:355`), which exists in the same file for the same reason: an
untestable-in-place spawn decision extracted so it can be driven directly.

⚠️ **The call site was rewired, not just supplemented.** `PtyCcSession::spawn`'s result is now
bound *before* the flag decision and the `?` deferred until after it, so `spawn_ok` is a real
term the predicate consumes. Had I left the `?` where it was and merely *added* a pure
function beside it, the function would have been decoration — proven, and governing nothing.
That is precisely the M11 WP4 blind spot CLAUDE.md records ("extracting a pure state machine
proves the MACHINE, not its CALLER"), and it was the live risk in this specific fix.

**Mutant 7 — dropped the `spawn_ok` term** (`let _ = spawn_ok; data_dir.is_some()`), which is
exactly what "moving the set above the `?`" does behaviorally. **Killed** by
`spawn_failure_must_not_set_the_flag`, with its assertion message surfacing. `sed`-confirmed
in executable code before running, per `[[verify-the-mutation-landed]]`.

**4 new tests** (all four arms of the predicate): failure+dir · success+dir · success+no-dir ·
failure+no-dir. Backend suite **750 → 754**, 0 failures; clippy `--all-targets` + fmt clean.

⚠️ **One vacuous-filter near-miss worth recording:** `cargo test should_set_unclean` printed
`running 0 tests` and **exited 0** — the tests are named `spawn_*`/`no_data_dir_*`, not for
the function. Had I read the exit code alone I would have called it green having run nothing.
This is `[[cargo-test-filter-outcomes-are-vacuous-without-a-count]]` biting inside the very
task that exists to prevent an unprovable guard; I confirmed all four by name instead.

**Re-verify gate: PASS** — `cargo test spawn_failure_must_not_set_the_flag` →
`running 1 test`, 1 passed (a real match, not an empty filter).

## Verify-self log — Phase 2 (2026-08-03) — 5/5 PASS, driven LIVE

**Integration boundary: YES** (unlike Phase 1). Phase 2 modified `SessionRegistry::spawn`,
`perform_quit_teardown`, and the filmstrip's existing close controls. The outcomes cite those
consuming surfaces by name, so the rule is satisfied — and every check below was run against
the **real running app** through the MCP bridge, not a unit harness.

⚠️ Driven by the **orchestrator**, not a subagent: `mcp__tauri__*` tools reach the
orchestrator but NOT spawned subagents, which silently fall back to bare Vite with no Tauri
IPC (`[[mcp-bridge-tools-not-exposed-to-subagents]]`).

| # | Outcome | Result |
|---|---|---|
| 1 | Set-on-open writes the flag | **PASS** — `session-state.json` gained the canonicalized scratch-a path → `true` |
| 2 | The ⏸ closes WITHOUT clearing | **PASS** — workspace closed, flag **survived** as `true` |
| 3 | The × clears | **PASS** — key **removed** (file = `{}`), not written `false` |
| 4 | Graceful app-quit clears (P2.3) | **PASS** — `quit_now` → `{}`, app exited cleanly |
| 5 | No console/runtime errors, no orphaned PTYs | **PASS** — dev log clean; no stray `claude` from either close |

**Baseline discipline:** `session-state.json` was **absent** before the run (the correct
cold-start state), so every observation below is a state the run itself produced.

**The ⏸/× contrast is the decisive evidence.** Same workspace, same teardown path, opposite
flag outcomes — which is exactly what a broken implementation could not produce. A
clear-on-`cc-exit` design (the one the plan originally assumed) would have cleared BOTH.

**P2.3 incidentally validated the path-key fix.** App-quit reads **canonicalized** paths from
`WorkspaceRegistry` while spawn wrote the frontend's raw `projectPath`; the clear matched.
Without `key_for()` normalizing both sides this would have silently left the flag set — the
failure mode is invisible (no error, just a stale flag firing a later `/resume`).

**Geometry — the zero-real-estate claim, measured not asserted:**
`visibility: hidden` (not merely transparent, so it cannot steal clicks) · `position:
absolute` · **cluster width 15px == close width 15px**, so the ⏸ occupies **no layout space**
· positioned below the ×, horizontally aligned, 3px gap · glyph renders as 2 bars · `role
="button"`, `aria-label="Close scratch-a, resume later"`.

**⚠️ One near-miss worth recording — a false BLOCKING I nearly filed.** An `elementFromPoint`
hit-test over the ⏸ returned the *tile body*, which reads as "the control is unreachable."
It was a **test-method artifact**: a synthetic `mouseover` does **not** set CSS `:hover`
(confirmed directly — `cluster.matches(':hover')` was `false`), so the ⏸ was still
`visibility: hidden` at hit-test time. Forcing visibility made the same hit-test resolve to
the glyph (`hitTestPassesWhenVisible: true`), and the subsequent **real click drove the whole
close end-to-end**. This is CLAUDE.md's "an observation is only decisive when a broken
implementation would give a DIFFERENT answer" — the failing hit-test was equally consistent
with correct code, so it was not evidence.

**Not covered here:** the `/exit`-typed-in-CC route was not driven — raw xterm typing is
low-fidelity over the bridge (caveat: synthetic Enter does not commit to the PTY).

> ⚠️ **[CORRECTED 2026-08-03, post-review]** This paragraph originally continued: *"It shares
> the `workspace-close`/`cc-exit-command` clearing path proven above."* **That was FALSE.**
> Code review found `cc-exit-command` had **no caller at all** — the variant existed in the
> Rust enum, the TS union, and round-tripped in two test suites, while nothing ever sent it.
> The live ⏸/× contrast exercised `workspace-close` only.
>
> **The mistake was mine and it is worth naming precisely:** I deferred *driving* `/exit` for
> a legitimate reason (bridge typing fidelity), then filled the resulting gap with an
> **assumption** instead of a one-line caller check — and wrote that assumption into the
> record, where WP3 would have read it as settled. Deferring an observation is fine; asserting
> the unobserved thing is covered is not. The check that would have caught it took seconds:
> `grep -rn "markSessionClean(" src/ --include=*.tsx | grep -v __tests__`.
>
> Resolution: the dead route was **removed** (not wired — wiring it is new functionality
> gated on a product question), and the question is logged as
> `SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET`. Current real behavior: `/exit`
> leaves the workspace OPEN with a "Session ended" overlay, so the flag resolves on whatever
> close follows.

**Session hygiene:** bridge session stopped; ports 1420/9223 confirmed clean by **PID-scoped**
check (never a blanket kill — the 2026-07-13 incident killed the operator's live app that way).

## Verify-human log — Phase 2 (2026-08-03) — REJECTED, fixed, then APPROVED

**Two rejects at the gate, both real, neither caught by any automated check.**

**1. The hover bridge failed on SLOW pointer travel** (`P2.verify-human.1/.2`). The operator's
framing was the diagnosis: *"doesn't vanish when the mouse travels quickly, but does vanish
when it travels slowly."*

Root cause: the `::after` bridge was `display: none` and became `display: block` **only while
`.tile-actions:hover`** — but `:hover` is true only while the pointer is inside the cluster's
own 15px box (the ×). Leaving the × heading downward made `:hover` false → removed the bridge
→ which was the very thing meant to keep hover alive. **Circular.** Fast travel crossed the
resulting dead band between two pointer samples and landed on the ⏸ (whose own hover, as a
child, re-satisfies the ancestor's `:hover`); slow travel landed *in* the band and lost it.

Fix: the bridge is now **always laid out** and gated on `pointer-events` instead of `display`
(inert while the ⏸ is hidden, so it cannot swallow clicks on the tile behind it), sized to
cover the 3px gap plus the ⏸'s own footprint.

⚠️ **Why verify-self missed it:** I measured the *geometry* (hidden / absolute / zero width /
3px below) and drove a *click*, both of which pass with the bug present. The failing property
was continuity of hover across a pointer path — and a synthetic `mouseover` never sets CSS
`:hover` at all, so the bridge was untestable by the instrument I had. This is the "would a
broken implementation give a different answer?" test failing in the other direction: my
observations were all consistent with the bug.

**2. ⚠️ The ⏸ was UNGATED against the M10.9 `workflow_features_enabled` setting**
(`P2.verify-human.4` — operator-raised, not in the plan). A genuine defect against a
documented invariant: the WBS states both M12 deliverables sit behind the gate, and the seam
contract in `useWorkflowFeaturesEnabled.ts` is explicit — *a gated surface must not exist when
off; not hidden, not disabled, not a no-op handler.* The ⏸ is workflow-coupled by definition
(it preserves the flag auto-resume reads), so with the layer off it is a dead affordance.

Fixed: the ⏸ renders only inside a `workflowEnabled &&` branch; the × stays universal
(closing a workspace is not workflow-coupled). The gate is read **once** in `Filmstrip` via
the seam hook and passed down as a prop — not per-tile, which would be N subscriptions to one
app-global value.

⚠️ **Why nothing caught it:** the OFF-invariant guard enumerates **three** registries (panels,
chords, menu ids) and a filmstrip control is in none of them. This is exactly the **fourth-arm
gap the WBS predicts for WP5** — now confirmed empirically rather than by inference. A local
guard (`__tests__/tileActionsGate.test.ts`) was added and **mutation-proven** (mutant 8:
ungating the ⏸ fails it), but WP5 still owes the global guard its fourth arm.

**⚠️ Incident while writing that guard, worth not repeating:** the **existing** OFF-invariant
guard failed my new test file, because my *negative* assertions contained the literal bypass
identifiers it scans for. The guard is source-text-based and cannot distinguish an assertion
that FORBIDS a call from the call itself. Resolution: **deleted the duplicated check** rather
than adding an exemption — that property already lives in the right place, and duplicating it
bought nothing while costing a false positive.

**Design-prior capture (§6b): NOTHING PROPOSED, deliberately.**
- The hover fix is a technical/CSS defect → `arch.md` territory at most, explicitly excluded.
- The gate correction *looks* like a capture moment but is **not a new prior**:
  `[[gate-substrate-dependent-feature-class-behind-default-off-opt-in]]` already exists from
  M10.9 and governs precisely this case. The operator was not teaching a new lean — he was
  catching me failing to apply a recorded one. That is a **compliance miss, not a design
  decision**, and proposing a duplicate would violate the dedup/conflict-check rule.

**Re-verified and APPROVED** by the operator: slow travel now holds the ⏸ in both filmstrip
modes, and the ⏸ is absent with the gate OFF / returns with it ON.

## Verify-codify log — Phase 2 (2026-08-03)

**Integration boundary: YES**, so the test set had to reach the consuming surfaces, not just
the new module. Coverage was assessed before writing anything; the priority was the **two
defects the operator found by hand** — a human-found defect fixed without a regression test is
the textbook way it returns.

**Gap 1 — the hover bridge had ZERO coverage.** Now `tileActionsHoverBridge.test.ts` (5 tests):
the bridge must be always-laid-out (not `display`-gated), `pointer-events`-gated and inert by
default, activated via `pointer-events: auto` on hover/focus-within, and tall enough to span
the gap **plus** the ⏸ it leads to (computed from the CSS, not hardcoded).
**Mutant 9 — restored the literal original defect** (`display: none` → `display: block` on
`:hover`): **killed by 3 of the 5**. The exact regression the operator caught now fails loudly.

**Gap 2 — `open_project_paths` had ZERO coverage**, and it is the app-quit route's data
source (P2.3). The teardown itself needs an `AppHandle`, but this seam is unit-testable and is
where the canonicalization agreement lives. 4 tests: lists every open workspace · empty when
none open · drops a deregistered one · **returns canonicalized keys**.
**Mutant 10 — `.take(1)`** (a plausible "optimization" that would clear only the first
workspace's flag on quit): **killed**.

⚠️ **Why the canonicalization test matters more than it looks:** the flag is keyed through
`session_state::key_for`, which canonicalizes, while app-quit hands in registry keys. If those
forms diverge the clear silently matches nothing — no error, just a stale flag firing a later
`/resume`. On macOS `/tmp` → `/private/tmp`, so a TempDir is a natural probe.

**Gap 3 (already closed at build):** the M10.9 gate guard `tileActionsGate.test.ts` was
written when the operator raised it, and mutation-proven then (mutant 8).

**Deliberately NOT written: a component-render test** asserting the ⏸ is absent from the DOM
with the gate off. That is the *right* instrument, but this repo has no React render harness
(`@testing-library` is not a dependency — `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`,
still open). Adding one is a real decision, not a drive-by inside a verify-codify step. The
runtime proof is the operator's verify-human confirmation; the source guard's narrower job is
to make an ungating edit fail loudly. Stated in the test file itself rather than left implicit.

**Suite: 754 → 758 cargo · 1763 → 1768 vitest, 0 failures.** clippy `--all-targets` + fmt +
tsc + eslint (0 errors) + prettier all clean. **No test-triage entries** — nothing failed
except the deliberate mutants, each reverted immediately.

**Mutant tally: 10 total.** Phase 1 killed 4 (clear-writes-false · corrupt-read-asserts-unclean
· rename→copy · write-merges). Phase 2 killed 6 (5 forbidden-export · 6 dropped-close-intent ·
7 spawn-ordering, from the P2.7 back-loop · 8 ungated-⏸ · 9 display-gated-bridge ·
10 truncated-open-paths). Every one was `sed`/`grep`-confirmed to land in executable code
before being believed, per `[[verify-the-mutation-landed]]`.

## Build log — Phase 3 (2026-08-03) — the hard-kill arms, run LIVE

**Both arms run against the real app. The contrast is the evidence.**

| Arm | Exit path | Flag after |
|---|---|---|
| 1 | `SIGKILL` (uncatchable — no handler, no `Drop`, no `CloseRequested`) | **`true` — SURVIVED** |
| 2 | graceful `quit_now` | **`{}` — CLEARED** |

Identical starting state each time (scratch-a open, flag `true`); only the exit differed. A
broken implementation cannot produce that difference — which is exactly why **arm 2 is not
optional**: a passing arm 1 alone is under-determined, because if a clean quit *also* left the
flag set, "it survived a kill" would say nothing about the kill.

**The flag also survived a full app RESTART** (observed between the arms), confirming it is
durable on disk rather than in memory — the property WP3's announce query depends on.

**P3.1 — the procedure is a script, not a one-off:** `tooling/unclean-flag/hard-kill-check.sh`
(`--state` / `--kill`, plus a guided both-arms walkthrough). WP3 and M13 will both want to
re-run this.

**⚠️ THE SAFETY GUARD EARNED ITS PLACE ON FIRST USE — and the near-miss is worth recording.**
The script refused to kill anything on the first attempt: my `DEV_BINARY_MARKER` assumed the
absolute path `src-tauri/target/debug/claudesk`, but cargo launches the dev binary with
`cwd=src-tauri`, so it runs as the **relative** `target/debug/claudesk` and matched nothing.

Inspecting the real `ps` output is what made the danger visible: alongside the dev binary sat
**`/Applications/Claudesk.app/Contents/MacOS/claudesk` — the operator's live PRODUCTION app**.
A `pkill -f claudesk`, the obvious "fix" for a marker that matches nothing, **would have killed
it** — precisely the 2026-07-13 incident repeating. The `debug/` path segment is the only thing
distinguishing the two, and the corrected marker was **verified against both processes before
being used** (matches dev exactly once; matches prod zero times).

The guard's design held under real conditions: kill by attributed PID, never by name; refuse on
ambiguity rather than guess.

**P3.3 — containment confirmed after the run:** the prod `session-state.json` was **never
created** (dev writes only under `com.claudesk.app.dev/`), the operator's prod app (PID 2200)
survived untouched, and ports 1420/9223 are clean.

## Verify-self log — Phase 3 (2026-08-03) — 5/5 PASS

**No integration boundary** — Phase 3 adds only `tooling/unclean-flag/hard-kill-check.sh`, a
dev-only artifact. Subagent corroborated this more strongly than mtime reasoning could:
`grep -rn "hard-kill-check\|tooling/unclean-flag" src/ src-tauri/src/` → **zero hits**, and
`tooling` appears in neither `package.json` nor `Cargo.toml`. The script is wired into no
build or runtime path.

| # | Outcome | Result |
|---|---|---|
| 1 | Repeatable artifact: exists, executable, `bash -n`, shellcheck | **PASS** — shellcheck **installed** (0.11.0) and exit **0**, zero findings |
| 2 | `--state` reports both identities, exits 0 | **PASS** — dev `{}`, prod absent |
| 3 | **SAFETY:** guard excludes the prod app (4 sub-checks) | **PASS** — all four |
| 4 | `--kill` with no dev app refuses cleanly | **PASS** — exit 1, message, no crash, no broader fallback |
| 5 | No production code added | **PASS** — `tooling/` is the only Phase-3 path |

**Outcome 3 is the one that mattered**, verified by *inspection* rather than by killing:
(a) `DEV_BINARY_MARKER` contains the `debug/` discriminator; (b) `pgrep -f
"target/debug/claudesk"` → **0** while the operator's prod app runs; (c) PID 2200's command
line does **not** contain the marker; (d) the script refuses on >1 match (returns 2, does not
guess) **and** re-validates the resolved pid's command via a `case` guard immediately before
`kill -9`, printing the target first so a wrong one is visible pre-kill.

⚠️ **The subagent was explicitly instructed never to run `--kill` against a live target, never
to use blanket `pkill`/`killall`/port kills, and to report UNVERIFIABLE rather than kill
anything ambiguous.** The one `--kill` invocation it did make was pre-checked (`pgrep` → empty)
and is the refusal path. Prod PID 2200 confirmed alive before and after.

**Outcome 1 note:** "shellcheck produced no output" is ambiguous between *clean* and *not
installed*. Both this run and verify-auto resolved it explicitly (`command -v` → installed,
exit 0) rather than reading silence as success.

## Operator-carried check — Phase 3 verify-human DEFERRED (2026-08-03)

**Operator decision:** *"defer. I'll just check this when the feature is fully delivered."*

⚠️ **This is a DEFERRAL, not an approval.** The verify-human node is marked `[x]` so the tree's
parent-completion invariant holds, but the two leaves under it remain **open** and are carried
forward. Nothing about Phase 3's live behavior has been operator-confirmed.

**Carried items:**
1. **P3.verify-human.1** — review the `SIGKILL` guard in `tooling/unclean-flag/hard-kill-check.sh`.
   It is the only script in the repo that sends `SIGKILL`, and it was used while the operator's
   production app was running.
2. **P3.verify-human.2** — confirm the both-arms contrast live (hard kill → flag survives;
   clean quit → key gone).

**Why deferring is sound here:** the hard-kill property is *more* meaningful checked against
the whole feature working end-to-end — WP3's auto-fire is what actually consumes this flag, so
the operator will see it produce a real `/resume` offer rather than inspecting a JSON file in
isolation. The evidence is also already recorded (both arms run live, results in the Phase 3
build log), so this is confirmation of a recorded result, not an unrun check.

**⚠️ Why I did NOT auto-skip this gate** (recorded so the reasoning isn't lost): gates (a),
(b), (c) were clean, but **gate (d) failed** — Phase 3's outcomes say *"Open a workspace in a
real running app"* and *"a clean quit of the same workspace"*, which name the live app's spawn
and quit paths. Phase 3 does not *modify* those paths (Phase 2 did), so (c) is honestly "no
boundary" — but (d) asks whether any outcome **references** a consuming surface, and instructs
conservatism when the negative cannot be affirmed. This is precisely the gate's own documented
"probe/decision-artifact false positive" shape: a phase whose load-bearing deliverable is a
measurement would otherwise be auto-skipped. Presenting it was correct; the operator then made
an informed deferral, which is a different and better outcome than a silent skip.

**Trigger:** the next operator-facing delivery of M12's auto-resume — WP3 close or the
milestone-exit verify, whichever comes first. Logged to the backlog so it survives this WIP
file's archival.

## Verify-codify log — Phase 3 (2026-08-03)

**No integration boundary** — dev-only shell script, zero production code.

**⚠️ The hard-kill property itself is UNCODIFIABLE, and I did not pretend otherwise.** Every
test runs inside a process that survives to assert; this property is about a process that does
not. A test *claiming* to cover it would be worse than none — it would read as proof while
proving nothing. That property's evidence is the live both-arms run (Phase 3 build log) plus
the operator's deferred confirmation.

**What IS codifiable, and carries real risk: the safety guard.** `hard-kill-check.sh` is the
only script in the repo that sends `SIGKILL`, its failure mode is silent and destructive, and
the near-miss already happened twice — once on 2026-07-13 (a blanket kill took out the
operator's live app) and once *during this phase* (an absolute-path marker matched nothing;
the obvious "fix," `pkill -f claudesk`, would have killed the production app that was running
at that moment). Nothing tested it.

**New: `src/state/__tests__/hardKillGuard.test.ts` (8 tests).** Asserts the marker matches the
real dev command line, does **NOT** match the real production one, keeps the `debug/`
discriminator, refuses on ambiguity (`count -ne 1` → `return 2`), re-validates the resolved
pid's command *before* `kill -9` (position-checked, not just present), and contains no
`pkill`/`killall` outside comments. Command-line strings are the real ones captured from `ps`
while both apps ran concurrently.

**⚠️ Placed in the vitest suite, NOT `tooling/*.nodetest.mjs`.** That convention exists and
would have been the "natural" home — but those files are deliberately isolated from vitest's
glob and are invoked by hand. **A safety guard that nothing runs is close to no guard.** The
property under test is pure string matching over command lines, so it needs no shell and
belongs where CI will actually execute it.

**Mutant 11 — reverted the marker to the bare name `"claudesk"`** (the exact unsafe edit):
**killed by 2 tests**, including the load-bearing "does not match production" assertion. One
test deliberately asserts that the naive marker *does* match both binaries, so the passing
result is a real discrimination rather than an artifact of two unequal strings.

**Suite: 758 cargo · 1768 → 1776 vitest, 0 failures.** clippy `--all-targets`, `cargo fmt`,
tsc, eslint (0 errors), prettier, and `shellcheck` on the script all clean. **No test-triage
entries** — nothing failed except mutant 11, reverted immediately.

**Final mutant tally: 11.** Phase 1: 4 · Phase 2: 6 (incl. mutant 7 from the P2.7 back-loop) ·
Phase 3: 1. Every one confirmed to land in executable code before being believed.

## Code-Quality Review — M12 WP2 (2026-08-03)

Reviewer subagent against ship commit `0b07e81` (window `b4e082f..0b07e81`).

### Strengths
- Opt-in-per-route clearing documented as a **correction**; `CleanExitRoute` makes the ⏸ correct by construction ("clears nothing by not calling") — the M11 WP4 caller-side lesson applied.
- `key_for()` converting path-key agreement from a two-call-site coincidence into a store property; pinned by a `/tmp`→`/private/tmp` TempDir probe.
- P2.7 rewiring the `?` so `spawn_ok` is a real consumed term rather than adding a pure function beside an unchanged call site — the difference between a proven guard and decoration.
- Every degraded read individually tested, all failing toward "clean", so a spurious `/resume` is structurally unreachable from a bad file.
- `hardKillGuard.test.ts` asserting the naive marker DOES match both binaries — proving the discrimination is real, not an artifact of two unequal strings.

### Issues

**CRITICAL**
- [`src/state/cleanExit.ts:31` + `src-tauri/src/session_state/mod.rs:282`] **The `cc-exit-command` route is DEAD.** No production code calls `markSessionClean` with it — the only caller is `App.tsx:473` with `"workspace-close"`. A user typing `/exit` in the CC pane dispatches `{type:"exited"}` (`XtermPane.tsx:407`), the bridge moves to `ended`, the workspace stays open, and **the flag is never cleared**.
  **Why it matters:** `/exit` is named as covered in Phase 2's Observable outcome, in P2.2's task text, and in the module header's route list — and **the verify-self log (line 487) actively asserts it "shares the clearing path proven above." It does not.** The live ⏸/× contrast exercised `workspace-close` only. So a typed `/exit` leaves a stale `true` that fires an unasked-for `/resume` on next open — the feature's stated worst failure mode. **VERIFIED by the orchestrator before acting** (`grep` for callers: one, using `"workspace-close"`).
  ⚠️ **Root cause worth carrying:** enumerating routes as data made the *set* exhaustive and testable, which was right — but nothing tests that each member has a **caller**, and the exhaustiveness test's green reads as coverage.

**MAJOR**
- [`session_state/mod.rs` ×10] **Ten `#[allow(dead_code)]` attributes survive at WP2 close**, against the module header's own rule (lines 61-63) and the commit message's claim that `consume` is "the single attribute expected to survive." Nine others are reachable only from `#[cfg(test)]` code and the two persist wrappers. The mechanism is a real improvement over the `workflow_install` blanket allow, **but the tripwire fired and was not acted on** — same outcome as the rot it was designed to avoid. Options: `#[cfg_attr(not(test), allow(dead_code))]`, mark test-only helpers as such, or restate the horizon as WP3.
- [`TileActionButton.tsx:89`] `data-action={kind}` is emitted on every control and read by nothing — no test, no CSS, no source file. An unreferenced hook reads as a live contract.

**MINOR**
- [`Filmstrip.tsx:305-306`] Stale JSX comment still says the ⏸ "is `display:none` until hover" — the **pre-fix** mechanism, and `display` gating was precisely the operator-found defect. A reader following it would reintroduce the regression.
- [`commands.rs:44`] `let _ = route;` plus three lines explaining the deliberate non-branch — an odd shape to leave in production.
- Comment density (216/608, 51/84, 72/161). Reviewer's judgment on the brief's explicit question: **most is load-bearing and should NOT be cut.** Where it crosses into noise is **restatement across layers** — the opt-in-route rationale is told at near-full length **four** times, the hover-bridge story **three** times. The budget rule that would have bound this diff: **one canonical home per rationale, pointers elsewhere** (~40 lines saved, zero facts lost).

### Assessment
Engineering discipline above the repo's bar — the opt-in correction, `key_for` normalization, and P2.7 rewiring are each changes only made by reading the surrounding code rather than the plan, each pinned by a mutation-proven test. Against that, the diff ships one genuine hole: a clean-exit route existing in three vocabularies, round-tripping in two test suites, called by nothing — **and the WIP asserts it is covered**, which is the most expensive kind of finding because it will read as settled to WP3.

### If you disagree
Mark any finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.


## Refactor log — post-review (2026-08-03)

Entered F40 on the CRITICAL. **Cleanup only; no behavior changed** — 758 cargo + 1776 vitest
both unchanged from the ship commit, which is the refactor contract.

**CRITICAL — the dead `cc-exit-command` route: REMOVED, not wired.**
⚠️ **The scope call matters more than the edit.** Wiring `/exit` to clear the flag would be
**new functionality**, and §4's scope guard says log it rather than implement it. It is also
gated on a genuine product question I should not answer unilaterally: `/exit` leaves the
workspace OPEN with a "Session ended" overlay + Relaunch (verified in `XtermPane.tsx` /
`bridge.ts`, not assumed), so there is no close for a clear to hang off — and Relaunch starts
a NEW session that should itself be flagged unclean. Removing the dead member is pure cleanup;
deciding `/exit`'s semantics is not. Logged as
`SURFACE-2026-08-03-TYPED-EXIT-LEAVES-THE-UNCLEAN-FLAG-SET` with the three viable answers and
a note that today's behavior **(b) is defensible**.
The Rust enum now carries a **do-not-re-add-it-blind** comment explaining why the member is
absent, so the next reader doesn't "restore" it.

**MAJOR — `data-action={kind}`: REMOVED.** Read by no test, no CSS, no source file.
(The other MAJOR — ten surviving `#[allow(dead_code)]` — is **NOT** addressed here; see below.)

**MINOR ×3, all fixed:**
- `Filmstrip.tsx` stale comment claimed the ⏸ is `display:none` until hover — the **pre-fix**
  mechanism, and `display` gating *was* the operator-found defect. A reader following it would
  have reintroduced the exact regression two test files exist to prevent. Now a pointer.
- `commands.rs`: `let _ = route;` gone (parse-to-validate via `.is_none()` instead); the doc
  comment also wrongly said `Ok(true)`/`Ok(false)` for a bare-`bool` return — corrected.
- Comment restatement collapsed per the reviewer's **"one canonical home per rationale,
  pointers elsewhere"** rule: the opt-in-route story now lives once on `CleanExitRoute`
  (pointers in `commands.rs`, `cleanExit.ts`); the hover-bridge story once in `App.css`
  (pointers in `TileActionButton.tsx`, `Filmstrip.tsx`).

**⚠️ NOT fixed, deliberately — the ten `#[allow(dead_code)]` attributes (MAJOR).** The
reviewer is right that the tripwire fired and was ignored, and right that the outcome
currently matches the rot the mechanism was meant to avoid. But the honest fix is a
**judgment call about the retirement horizon** (narrow to `#[cfg_attr(not(test), ...)]`, mark
test-only helpers, or restate the horizon as WP3), and WP3 wires `read`, `is_unclean`,
`is_unclean_on_disk`, and `consume` within days. Churning the attributes now to re-churn them
at WP3 is motion, not progress. **Auto-backlogged rather than silently dropped** — this is a
recorded deferral, not a dismissal.


## Retrospect

- **What changed in our understanding:** Three things the plan did not know.
  **(1) `cc-exit` is the wrong clearing signal precisely BECAUSE it covers everything.** The
  plan treated "one event covers `/exit` and the ×" as a convenience; it is actually
  disqualifying, since the same event fires for the ⏸ close, whose entire purpose is to NOT
  clear. Two supporting facts sealed it: `PtyCcSession` never retains `project_path`, and
  `cc_kill` fires from an unmount that also runs on StrictMode remounts.
  **(2) An enum member with no caller is invisible to an exhaustiveness test.** Enumerating
  the routes as data was right and made the *set* testable — but nothing tested that each
  member had a **caller**, so `cc-exit-command` shipped declared-in-three-places and called
  nowhere, with a green test suite reading as coverage.
  **(3) A guard's own tripwire does not fire itself.** The per-item `#[allow(dead_code)]`
  discipline is a genuine improvement on the blanket allow it replaced, and the module even
  wrote down its own retirement rule — which then went unhonored at close. Better mechanism,
  same outcome, until someone acts on it.

- **Assumptions that held:** WP1's two verdicts survived contact intact — the separate store
  was right (and the lost-update reasoning is now pinned by a test), and set-after-spawn
  needed no signature change, confirming the M-not-L sizing. The `status_log` precedent fit
  exactly. Derisk-first ordering paid: WP2's hard-kill arm is what makes WP3's signal
  trustworthy, and doing it after auto-fire would have meant verifying against an unproven flag.

- **Assumptions that were wrong:**
  **(a)** That `/exit` was covered — I deferred *driving* it for a legitimate reason (bridge
  typing fidelity), then filled the gap with an assumption and wrote it into the verify-self
  log where WP3 would read it as settled. The disproving check was one `grep` for callers.
  **(b)** That "the set lands after the `?`" was self-evidently safe. True, but true only by
  *statement order*, which no test can go red on — verify-auto caught that the outcome demanded
  mutation-provability and none existed.
  **(c)** That the ⏸ needed no gate. It is workflow-coupled by definition; I built it ungated
  and only the operator caught it.

- **Approach delta:** Materially different from plan in three places, each an improvement
  forced by reading code rather than following the plan. Clearing inverted from
  side-effect-of-teardown to **opt-in per route**. `key_for()` canonicalization was added
  unprompted, converting path-key agreement from a two-call-site coincidence into a store
  property. P2.7 (a whole extra task) was added by a verify-auto back-loop to make the
  spawn-ordering guarantee assertable — and required **rewiring the call site**, not just
  adding a pure function beside it, or the function would have been proven and governing
  nothing. Scope also *shrank* honestly at close: three clean-exit routes shipped, not four.

- **Process note worth carrying:** every defect that escaped the automated gates was caught by
  a **human or a fresh-context reviewer**, never by a green suite — the ungated ⏸ and the
  slow-travel hover bug (operator, at verify-human), and the dead route (code review). Each
  had a passing test suite at the moment it was wrong.


## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-08-03] Phase 2 verify-human — the OFF-invariant guard's three enumerated
registries (panels / chords / menu ids) do NOT cover a filmstrip control, so M12 WP2's ⏸
shipped ungated through every automated gate and was caught only by the operator. Confirms
(empirically, not by inference) the fourth-arm gap the WBS assigns to WP5. Logged as
`SURFACE-2026-08-03-OFF-INVARIANT-GUARD-MISSES-NON-REGISTRY-SURFACES`.

## Notes for later WPs (do not re-derive)

- **WP3 task 3.1:** precedence — the unclean flag **beats** `.session.md`, reversing the
  roadmap — must live in the pure `predictAction(uncleanFlag, sessionMdPresent)`, **NOT** in
  the batch command. The command returns the *resolved* action, so a resolved-string payload
  **cannot be mutation-tested for precedence** (both inputs already collapsed into one string).
  WP2 exposes the flag read in a shape `predictAction` can consume directly.
- **Do NOT build a new PTY-injection primitive** for WP3's send. `slash_command_bytes`
  (`cc_session/mod.rs:251`) already trims trailing CR/LF and appends exactly one `\r`; its
  production caller is the shutdown path (`:692`) and the module header reserves it for "any
  Phase 2 injection." M12's send is the first *feature* write, not the first write.
- **Carried debt:** `SURFACE-2026-08-03-PROJECTS-JSON-WRITERS-ARE-WHOLE-FILE-RMW` (medium).
  WP2 side-steps it by using a separate file, but the next per-project field added to
  `projects.json` lands on the same trap unless the constraint is documented at
  `write_projects`. Not in WP2's scope; noted so it is not lost.
