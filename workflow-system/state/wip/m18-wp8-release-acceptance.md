---
drive_mode: autopilot
---

# Feature: M18 WP8 — release + installed-build acceptance

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-11-20

## Problem Statement

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

## Work Tree

- [ ] Phase 1: The four WP7-review MAJORs  <!-- status: NOT-STARTED -->
  **Observable outcomes:**
  - CLI: `cargo test the_extractor_reaches_every_files_tail` passes with `remote_ops.rs`'s anchor at `pub fn resolve_update(`, AND a new meta-test (e.g. `every_tail_anchor_is_the_files_last_production_fn`) fails if any `MODULE_FILES` anchor is not the last production `fn` item of its file (parsed with `syn`, `#[cfg(test)]` items skipped). Mutation proof: put the anchor back to `pub fn resolve_uninstall(` → the new meta-test FAILS; restore → passes.
  - CLI: a vitest jsdom test in `src/components/settings/__tests__/` fires `remote-run-finished` for this host BEFORE the `getRemoteRunState` promise resolves (the promise then resolves with that same run); the panel ends showing the result (no "Installing on this host…" / no enabled Cancel). The same test asserts `getRemoteRunState` is not called before the finished listener has subscribed. Mutation proof: revert `RemoteRunPanel` to the mount-time query → the test FAILS.
  - CLI: a Rust test drives `workflow_remote_update_start`'s refusal path (or the per-op mapping it calls) for a host with no record and asserts the message says nothing was **updated** and contains neither "remove" nor "uninstall"; Uninstall's refusal text for the same case is unchanged (its existing test still passes). Mutation proof: pass the removal wording through for Update → FAILS.
  - CLI: a builder assertion on `uninstall_script` output: `trap '' HUP PIPE TERM INT` is line 1, no `( cd` / `(` subshell wraps `uninstall.sh`, and `rm -rf -- "$target"` precedes `rm -f -- "$rec"`. Plus a real-signal test: the uninstall script (with a test-side pgid echo prepended, marker `Running uninstall.sh on the host.`, and a slowed fixture `uninstall.sh`) is group-TERMed/HUPed mid-`uninstall.sh`; result is `ok`, the clone and the record are gone. Mutation proofs, each alone: wrap `uninstall.sh` in `( … )` → the real-signal test FAILS; move the `trap` below the `uninstall.sh` line → both FAIL.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - (decision) Update's refusal wording, one example: "Claudesk has no record of installing this workflow system, so it will not update it. Nothing was changed." — is that the voice you want for the Update refusals?
  - [ ] P1.1 `source_guard.rs` → `MODULE_FILES`: `remote_ops.rs` anchor → `pub fn resolve_update(`; add the syn-based "anchor is the last production fn" meta-test over every entry (fix any other stale anchor it finds)  <!-- status: NOT-STARTED -->
  - [ ] P1.2 `RemoteRunPanel`: query `getRemoteRunState` from `useTauriListen`'s `onSubscribed` (once all three listeners are attached), and while the seed is pending accept a host-matching `remote-run-finished` as final; jsdom test for the finished-before-seed order  <!-- status: NOT-STARTED -->
  - [ ] P1.3 Per-op refusal wording: `observe_and_guard` takes the op (or the Update caller maps `RefusalReason` → Update words); Update's refusals say what was not updated; test on the words  <!-- status: NOT-STARTED -->
  - [ ] P1.4 Pin `UNINSTALL_TEMPLATE`'s window: builder assertion + real-signal test (the fixture's `uninstall.sh` gains `FIXTURE_SLEEP` if it lacks it); mutation-prove each form individually (memory `signal-test-kill-can-land-before-the-fork`: delay the kill inside the step)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: The seven WP7-review MINORs  <!-- status: NOT-STARTED; depends on Phase 1 -->
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
  - [ ] P2.1 Bind Uninstall consent to the preview (`clone_dir` + record hex through start; refuse on mismatch)  <!-- status: NOT-STARTED -->
  - [ ] P2.2 Delete classifier: quoted `rm` / `/bin/rm` and a `git clean` kind, each with a one-spelling meta-test  <!-- status: NOT-STARTED -->
  - [ ] P2.3 syn fence: parse `remote_guard.rs` whole and skip `#[cfg(test)]` items (or split on `mod tests`)  <!-- status: NOT-STARTED -->
  - [ ] P2.4 `uninstall_script` → `Result`, surfaced as a builder error  <!-- status: NOT-STARTED -->
  - [ ] P2.5 One `state_words` (`pub(crate)`), `RemoteSink<UninstallResult>` replaces `UninstallSink`  <!-- status: NOT-STARTED -->
  - [ ] P2.6 Rename the install-era names; drop the `begin_remote_install` wrapper; generic lock refusal  <!-- status: NOT-STARTED -->
  - [ ] P2.7 Drop the stale Phase-4 doc parenthetical  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: Release + installed-build acceptance  <!-- status: NOT-STARTED; depends on Phase 2. ⚠️ OPERATOR-GATED: /release is manual-only, it pushes main (32+ commits) and publishes; the destructive-rows ruling is the operator's (wbs.md WP8 8.2) -->
  **Observable outcomes:**
  - CLI: the Command Line Tools update is installed (`pkgutil --pkg-info=com.apple.pkg.CLTools_Executables` version ≥ the one `brew audit` asks for) — operator-run if it needs a password.
  - CLI (state-changing, outward — operator go-ahead required): `/release` completes: a new tag above the previous `git tag --sort=-v:refname | head -1`, the GitHub release carries the `.dmg`, `.app.tar.gz`, `.sig` and `latest.json` (memory `release-is-three-artifacts-verify-each`), the tap cask is bumped; every staged blob passed the public-repo identifier grep before the push.
  - CLI: the installed `/Applications/Claudesk.app`'s `CFBundleShortVersionString` equals the new tag.
  - Browser (installed build, via the operator or the bridge where it reaches): on the live mini account, Settings → Remote hosts reads **Developer** with a drift line and **no** Install / Update / Uninstall button; a skill-less scratch row with the gate ON shows the absent-host note pointing to Settings and no workflow surfaces.
  - Browser (installed build): remote Recycle on the scratch row respawns CC and restores; auto-resume never answers the bypass dialog (WP2 withhold).
  - Browser (installed build): a streamed remote-run line is delivered once, not twice (`SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN` prod check).
  - Destructive rows (Install → Update → Uninstall on an installed build): per the operator's 8.2 ruling — run against a disposable host account, or recorded as waived on the WP6/WP7 dev-build basis.
  **Alignment questions:**
  - (decision) 8.2: create a disposable account on the mini for the destructive rows, or waive them on the dev-build basis (the M17 WP8 precedent)?
  - The installed build's Remote hosts readout and absent-host note, seen live: still what you want?
  - [ ] P3.1 CLT update (operator), then `/release` on the operator's go-ahead  <!-- status: NOT-STARTED -->
  - [ ] P3.2 The operator's 8.2 ruling; run the read-path, WP1/WP2 and (if not waived) destructive acceptance rows on the installed build  <!-- status: NOT-STARTED -->
  - [ ] P3.3 Record acceptance in this WIP + `wbs.md` WP8, identifiers redacted (public repo)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 1 > P1.1
- **Active scope:** P1.1 (first task)
- **Blocked:** none (Phase 3 is operator-gated: `/release` go-ahead + the 8.2 ruling)
- **Unvisited:** Phase 2 (MINORs), Phase 3 (release + acceptance)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
