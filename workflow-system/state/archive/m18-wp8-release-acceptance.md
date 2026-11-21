---
drive_mode: autopilot
---

# Feature: M18 WP8 — the WP7-review paydown (release + installed acceptance moved after M18)

**Workflow:** feature
**State:** Completed 2026-11-20 (finalize) — Phase 3 removed by the F23 revision
**Created:** 2026-11-20

## Problem Statement

[Updated 2026-11-20: the operator moved the release and the installed-build acceptance OUT of M18 ("it will be after M18, not the last part of M18"). WP8 is now the WP7-review paydown (Phases 1–2), and M18 closes without an installed-build acceptance; the release and its acceptance are the next session's first task.]


M18's code is complete through WP7 (Install, Update, Uninstall over the master), but the milestone exits only once it is
**accepted on an installed build** (`wbs.md` → WP8, "Exit criteria (M18)"). Before a release, the WP7 code-quality review
left four MAJORs (`backlog-quality-findings.md` → `# m18-wp7-remote-update-uninstall — 2026-11-20`) on exactly the surfaces
the acceptance will exercise: a guard that can pass while checking nothing (`remote_ops.rs`'s stale tail anchor), a
re-attach race that can strand the run panel, removal-worded refusals shown on an Update, and an unpinned Uninstall
window (the class that shipped broken in WP6). Seven MINORs on the same code ride along. Then `/release` (manual-only;
the Command Line Tools update for `brew audit` first) and the acceptance rows against the mini, with the operator's ruling on
the destructive rows (a disposable host account, or the M17 WP8 dev-build waiver).

No new 3rd-party dependency: the on-host behaviours were probed at WP3 (`wbs.md` → "Probe outcomes"); the release path
(GitHub, Homebrew tap) is the existing `/release` skill.

Problem statement unchanged (2026-11-20, F12 from P2.verify-human.1): the operator asked that the LOCAL lock refusals share the remote wording, since one lock serves both. A copy fix inside Phase 2's scope, not a new problem.

## Work Tree

- [x] Phase 1: The four WP7-review MAJORs  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `cargo test the_extractor_reaches_every_files_tail` passes with `remote_ops.rs`'s anchor at `pub fn resolve_update(`, AND a new meta-test (e.g. `every_tail_anchor_is_the_files_last_production_fn`) fails if any `MODULE_FILES` anchor is not the last production `fn` item of its file (parsed with `syn`, `#[cfg(test)]` items skipped). Mutation proof: put the anchor back to `pub fn resolve_uninstall(` → the new meta-test FAILS; restore → passes.
  - CLI: a vitest jsdom test in `src/components/settings/__tests__/` fires `remote-run-finished` for this host BEFORE the `getRemoteRunState` promise resolves (the promise then resolves with that same run); the panel ends showing the result (no "Installing on this host…" / no enabled Cancel). The same test asserts `getRemoteRunState` is not called before the finished listener has subscribed. Mutation proof: revert `RemoteRunPanel` to the mount-time query → the test FAILS.
  - CLI: a Rust test drives `workflow_remote_update_start`'s refusal path (or the per-op mapping it calls) for a host with no record and asserts the message says nothing was **updated** and contains neither "remove" nor "uninstall"; Uninstall's refusal text for the same case is unchanged (its existing test still passes). Mutation proof: pass the removal wording through for Update → FAILS.
  - CLI: a builder assertion on `uninstall_script` output: `trap '' HUP PIPE TERM INT` is line 1, no `( cd` / `(` subshell wraps `uninstall.sh`, and `rm -rf -- "$target"` precedes `rm -f -- "$rec"`. Plus a real-signal test: the uninstall script (with a test-side pgid echo prepended, marker `Running uninstall.sh on the host.`, and a slowed fixture `uninstall.sh`) is group-TERMed/HUPed mid-`uninstall.sh`; result is `ok`, the clone and the record are gone. Mutation proofs, each alone: wrap `uninstall.sh` in `( … )` → the real-signal test FAILS; move the `trap` below the `uninstall.sh` line → both FAIL.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - (decision) Update's refusal wording, one example: "Claudesk has no record of installing this workflow system, so it will not update it. Nothing was changed." — is that the voice you want for the Update refusals?
  - [x] P1.1 `source_guard.rs` → `MODULE_FILES`: `remote_ops.rs` anchor → `pub fn resolve_update(`; add the syn-based "anchor is the last production fn" meta-test over every entry (fix any other stale anchor it finds)  <!-- status: done -->
  - [x] P1.2 `RemoteRunPanel`: query `getRemoteRunState` from `useTauriListen`'s `onSubscribed` (once all three listeners are attached), and while the seed is pending accept a host-matching `remote-run-finished` as final; jsdom test for the finished-before-seed order  <!-- status: done -->
  - [x] P1.3 Per-op refusal wording: `observe_and_guard` takes the op (or the Update caller maps `RefusalReason` → Update words); Update's refusals say what was not updated; test on the words  <!-- status: done -->
  - [x] P1.4 Pin `UNINSTALL_TEMPLATE`'s window: builder assertion + real-signal test (the fixture's `uninstall.sh` gains `FIXTURE_SLEEP` if it lacks it); mutation-prove each form individually (memory `signal-test-kill-can-land-before-the-fork`: delay the kill inside the step)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` run 1 → EXIT=101 (clippy `double_ended_iterator_last` in the new `every_tail_anchor_names_its_files_last_production_item`) → F9 back-loop, fixed (`.rev().find_map`, `.next_back()`); the meta-test re-proven against the stale `resolve_uninstall(` anchor → FAIL, restored by `cp` + shasum.
    — evidence: `pnpm verify:auto` run 2 → EXIT=0, 79 s: vitest 327 files / 4184 tests passed; `cargo test` 1509 + 24 + 17 passed (4 ignored); `cargo clippy --all-targets -D warnings` clean; `cargo fmt --check` clean. ESLint: 1 pre-existing warning in `XtermPane.tsx:988` (`react-hooks/exhaustive-deps`), a file this phase did not touch.
  - [x] verify-self  <!-- status: done -->
    - [x] O1 tail anchor — evidence: `cargo test --lib -- the_extractor_reaches_every_files_tail every_tail_anchor` → 2 passed; mutant anchor `resolve_uninstall(` → extractor test still green, `every_tail_anchor_names_its_files_last_production_item` FAILED ("…is not the file's last production item (`resolve_update`)"); restored, shasum matched.
    - [x] O2 re-attach race — evidence: `vitest run …/remoteHostsSettings.test.tsx` → 37 passed; HEAD `RemoteRunPanel` over the file → FAILED "subscribe, then query: no question while the listens are unanswered … got 1"; restored, shasum matched.
    - [x] O3 Update refusal words — evidence: `cargo test --lib -- an_update_refusal… no_update_refusal… the_remote_uninstall_guards_first… workflow_install::guard` → 18 passed; Update arm → `user_message()` mutant → exact-string test FAILED ("will not remove it" vs "will not update it"); restored.
    - [x] O4 Uninstall window — evidence: the builder + real-signal tests → 2 passed (2.65 s); subshell mutant → both FAILED (:762, :791); moved-trap mutant → both FAILED (:757, :791); restored each time. Note: the helper sends SIGTERM only (the trap line covers HUP too).
    - [x] O5 gate — evidence: `pnpm verify:auto` → EXIT=0, 68 s; vitest 4184 passed; cargo lib 1509 passed, 4 ignored.
    - [x] align: Update refusal voice — evidence: built `update_message` vs `user_message`, all 7 variants (captured in the runner's report; NoRecord Update = "Claudesk has no record of installing this workflow system, so it will not update it. If you installed it yourself, update it the same way you installed it. Nothing was changed."; MissingUninstallScript Update says "does not contain the workflow system's scripts").
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1: (decision) Update's refusal voice — the 7 `update_message` texts vs `user_message`  <!-- status: done — operator 2026-11-20: keep as built -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 79s)
    — evidence: no new tests needed: every verified behaviour is pinned by a test written at build and mutation-proven at build and verify-self (incl. the consuming-surface test on the real `SettingsPanel`). `pnpm verify:auto` → EXIT=0, 57 s: vitest 4184 passed; cargo lib 1509 passed, 4 ignored.

- [x] Phase 2: The seven WP7-review MINORs  <!-- status: done -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — the handoff said the MINORs ride along before `/release`.
  - Requirements unchanged: yes — Phase 1 touched none of the seven findings' code paths beyond `observe_and_guard`'s signature.
  - Solution still feasible: yes.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: Uninstall start refuses when the previewed `clone_dir` + record hex passed from the confirm step differ from what the guard approves at start (a Rust test changes the host record between preview and start → refusal, nothing deleted); a matching pair proceeds as before.
  - CLI: `source_guard::deletions` counts `Command::new("rm")`, `"/bin/rm"` and `git clean` spellings — one meta-test per new spelling, each fails when its classifier arm is removed.
  - CLI: `the_deleting_builders_take_only_an_approved_target` no longer splits on `src.find("#[cfg(test)]")` (grep for that call in the test returns nothing) and still passes.
  - CLI: `uninstall_script` returns `Result`; a test with an unfillable template surfaces the builder error, never `result:changed`.
  - CLI: one `state_words` (grep `fn state_words` in `workflow_install/` → 1 hit); `commands::UninstallSink` is gone in favour of `RemoteSink<UninstallResult>` (grep → 0 hits for `struct UninstallSink`).
  - CLI: the install-era names are renamed (`RemoteRunStart`, `REMOTE_RUN_DEADLINE`, generic lock refusal); `grep -rn "RemoteInstallStart\|REMOTE_INSTALL_DEADLINE\|begin_remote_install" src-tauri/src` → 0 hits; the lock refusal shown during an Update no longer says "install or uninstall".
  - CLI: the stale "(the events are shared until WP7 Phase 4 renames them…)" parenthetical is gone (grep → 0 hits).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none
  - [x] P2.1 Bind Uninstall consent to the preview (`clone_dir` + record hex through start; refuse on mismatch)  <!-- status: done -->
  - [x] P2.2 Delete classifier: quoted `rm` / `/bin/rm` and a `git clean` kind, each with a one-spelling meta-test  <!-- status: done -->
  - [x] P2.3 syn fence: parse `remote_guard.rs` whole and skip `#[cfg(test)]` items (or split on `mod tests`)  <!-- status: done -->
  - [x] P2.4 `uninstall_script` → `Result`, surfaced as a builder error  <!-- status: done -->
  - [x] P2.5 One `state_words` (`pub(crate)`), `RemoteSink<UninstallResult>` replaces `UninstallSink`  <!-- status: done -->
  - [x] P2.6 Rename the install-era names; drop the `begin_remote_install` wrapper; generic lock refusal  <!-- status: done -->
  - [x] P2.7 Drop the stale Phase-4 doc parenthetical  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence (re-run after the P2.verify-human.1 fix, `commands.rs` only): `cargo fmt --check` → OK; `cargo clippy --all-targets -D warnings` → clean; `cargo test --lib -- workflow_install remote_link` → 268 passed, 3 ignored.
    — evidence: `pnpm verify:auto` → EXIT=0, 82 s: vitest 4184 passed; cargo lib 1511 passed, 4 ignored (+24, +17 integration); clippy `--all-targets -D warnings` clean; `cargo fmt --check` clean; `tsc`, `check:link` clean. ESLint: the same pre-existing `XtermPane.tsx:988` warning (file untouched).
  - [x] verify-self  <!-- status: done -->
    - [x] O1 consent bound to the preview — evidence: `an_uninstall_proceeds_only_on_the_approval_the_operator_confirmed` passes; mutants each alone: `confirmed_matches` always Ok → 1 failed; the call block deleted from `workflow_remote_uninstall_start` → the order assertion failed; `confirmed` dropped from the panel's `startRemoteRun` → vitest 1 failed ("expected [] to deeply equal [{ host: 'me@up-host', … }]"). Restored, shasums matched.
    - [x] O2 classifier spellings — evidence: RmProgram arm zeroed → FAILED (`Command::new("rm")` counted 0); GitClean arm zeroed → FAILED; each regex narrowed to one spelling → FAILED on the other spellings. Near-misses ("git tree is clean", "rmx") stay 0.
    - [x] O3 syn fence — evidence: `grep -c 'find("#[cfg(test)]")'` → 0; filter-skips-everything mutant → FAILED (`left: []`); an injected production `RemoteUninstallTarget` literal in remote_guard.rs → FAILED (`left: [remote_refuse_guard, sneaky_mutant]`).
    - [x] O4 builder error — evidence: `fill_uninstall` mutated to swallow into a `result:changed` script → `an_unfillable_uninstall_template_is_a_builder_error` FAILED.
    - [x] O5 one state_words / RemoteSink — evidence: `grep fn state_words` → remote_runner.rs only; `UninstallSink` → 0 hits; the uninstall worker builds `RemoteSink { op: Uninstall, parse_result: parse_uninstall_line }`.
    - [x] O6 renames + lock refusal — evidence (re-verified after the F12 fix): old names → 0 hits; all 4 `HeldRunLock::try_acquire` refusals (`begin_install`, `begin_uninstall`, `workflow_uninstall_dry_run`, `begin_remote_run`) → `RUN_LOCK_BUSY` = "another workflow-system run (install, update or uninstall) is already running"; no old wording in src / src-tauri/src / src-tauri/tests; no frontend code keys on the text; constant reworded → 3 failed (local + both remote), restored (shasum matched) → 3 passed. (First pass: FAILED-cosmetic on the local refusals; fixed per the operator.)
    - [x] O7 stale parenthetical — evidence: `grep -rn "until WP7 Phase 4\|events are shared"` over src, src-tauri, docs, workflow-system/product → 0 hits.
    - [x] O8 gate — evidence: `pnpm verify:auto` → EXIT=0, 74 s; vitest 4184 passed; cargo lib 1511 passed, 4 ignored. Tree identical to its pre-run state after every restore.
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1: (decision) O6 FAILED-cosmetic — the local lock refusals ("an install or uninstall is already running") can show while a remote run holds the shared lock: fix now or accept?  <!-- status: done — operator 2026-11-20: fix now; fixed (one RUN_LOCK_BUSY for all four lock refusals) and re-verified at verify-self O6 -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 82s)
    — evidence: no new tests needed (every Phase 2 behaviour is pinned by a test mutation-proven at verify-self, incl. the consuming-surface test that the panel's Uninstall start carries `confirmed`). `pnpm verify:auto` → EXIT=0, 75 s: vitest 4184 passed; cargo lib 1511 passed, 4 ignored.

- Phase 3 (release + installed-build acceptance): **REMOVED from WP8 by the operator, 2026-11-20 (F23 plan revision).**
  The release is AFTER M18, not its last part; the installed-build acceptance depends on the release, so it goes with it.
  It is handed off to the next session as a post-M18 task (`.session.md`). The rulings taken at its entry carry over:
  - skip `brew audit` for that release (the Command Line Tools are absent; `SURFACE-2026-11-20-CLT-AND-XCODE-UPDATE-BEFORE-NEXT-RELEASE`);
  - the destructive installed-build rows (Install / Update / Uninstall) are waived on the dev-build basis; the installed build
    still gets the read paths, remote Recycle, the bypass withhold, and the once-not-twice streamed-line check.

## Current Node
- **Path:** Feature > finalize (complete) → product-finalize (M18: every WP shipped)
- **Active scope:** none
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** P2.6 partial (`RemoteUninstallTarget` rename, backlogged); CLT + Xcode update before the next release (backlog)

## Ship
- Cleanup: `git status` clean; no TODO / FIXME / `dbg!` / `console.log` added in `22bcec6..HEAD` under `src`, `src-tauri`.
- Full suite: reused the last-phase codify run (`Test scope: full — suite not long`, Phase 2: `pnpm verify:auto` EXIT=0, 75 s); only WIP / WBS / backlog docs changed since.
- Checks re-run: `pnpm lint` (0 errors, the pre-existing `XtermPane.tsx` warning), `pnpm format:check` clean, `tsc --noEmit` OK, `cargo fmt --check` OK, `cargo clippy --all-targets -D warnings` clean.
- Release prep: **no push** (operator, 2026-11-20). `main` stays ahead of `origin` until the post-M18 `/release`.

## Code-Quality Review — m18-wp8-release-acceptance

*(window `22bcec6^..b015868`, 2026-11-20; drive_mode=autopilot → 4 MINOR auto-backlogged, F39)*

### Strengths
- The tail-anchor fix closes the class, not the instance: a syn meta-test derives each file's last production item, mutation-proven against the stale anchor.
- The re-attach race fix follows the repo's "subscribe, then query" seam and handles every ordering; the jsdom test holds back real `listen` replies and fails against HEAD's panel.
- Consent binding: `confirmed_matches` sits between the guard and the script builder, pinned by a source-order assertion; the frontend test asserts the start carries exactly the preview's pair.
- `RefusalReason::update_message` is an exhaustive match beside `user_message`; `no_update_refusal_speaks_of_removal` covers every variant.
- The Uninstall window is pinned two ways (builder shape + a real-signal group-kill), each mutation-proven alone.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [`remote_ops.rs` `confirmed_matches`] The consent-mismatch refusal prints the same folder twice when only the record changed — a "change" the operator cannot see on the safety surface.
- [`source_guard.rs` `deletions`] `GitClean` matches only the shell spelling; the Rust `Command` / `GIT_BIN, vec!["clean"…]` form this crate uses counts as zero.
- [`source_guard.rs` / `remote_ops_tests.rs` / `tests/sync_commands_do_not_block.rs`] The syn `#[cfg(test)]` fence is hand-copied three times, with differing variant coverage.
- [`RemoteRunPanel.tsx`] `subscribed >= 3` hard-codes the listener count; a fourth listener would reopen the race.

### Assessment
A clean paydown: all four MAJORs and six of seven MINORs closed at the source, each pinned by an individually mutation-proven test; the seventh (install-era names) is honestly partial (the `RemoteUninstallTarget` rename deferred). No event ordering drops a finished event. The remaining items are small and affect no correctness today.

### If you disagree
Mark a finding `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-20] P2.6 — the `RemoteUninstallTarget` → `ApprovedRemoteClone` rename was not done: it is outside this phase's outcomes and touches the `E0451` compile-fail test's type. It stays open in `SURFACE-2026-11-20-QUALITY-INSTALL-ERA-NAMES-SERVE-ALL-OPS` (to be rewritten to that remaining part at close, not deleted). The lock refusal is now "another workflow-system run (install, update or uninstall) is already running" (the plan's outcome forbids "install or uninstall"; this names all three).

## Retrospect
- **What changed in our understanding:** The release was never M18's to own: the operator separated "the milestone's work is done" from "it ships", so a WP named after its release closed without one. Under `mockIPC`, `listen` registers synchronously, so the re-attach race cannot reproduce unless the test deliberately holds back the `listen` replies (an invoke wrapper did it).
- **Assumptions that held:** Each WP7 finding was small and test-heavy; a mutation per new test caught every regression we tried (13 mutants across both phases, each failing on its own). The one-commit-per-phase shape and the full `pnpm verify:auto` gate (57–82 s) kept every phase cheap.
- **Assumptions that were wrong:** That the remote lock wording could be fixed alone. Local and remote runs share one lock, so the local refusals named the wrong run too (verify-self found it; the operator chose one text for all). That the build's first `cargo fmt`-reflowed string would match a single-line replace (one site was missed and caught by the grep). That the moved-trap mutation landed on the first try (the line-1 trap follows `r#"`; the first attempt added a second trap and proved nothing, caught by checking the mutant landed).
- **Approach delta:** Phase 3 (release + installed-build acceptance) was removed by an F23 plan revision after the operator held `/release` and then moved it after M18. P2.6 left the `RemoteUninstallTarget` rename open (outside the outcomes; it touches the compile-fail test). P2.verify-human.1 added a small F12 back-loop (`RUN_LOCK_BUSY`).

## Closure
> **Feature complete:** M18 WP8 (the WP7-review paydown) has shipped locally. Remote Uninstall now runs only the removal you reviewed, a refused Update says what was not updated, every "already running" refusal shares one text, a Settings panel reopened mid-run can no longer stick on a finished run, and the Uninstall window and delete-scan tails are pinned by tests. Commits `f28b4a7` and `d5bb004`; not pushed — the post-M18 `/release` pushes `main`.

Requester = operator — closure notice for self-record.
