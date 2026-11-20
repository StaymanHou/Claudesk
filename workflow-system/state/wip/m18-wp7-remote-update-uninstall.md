---
drive_mode: autopilot
---

# Feature: M18 WP7 — Update and Uninstall (the remote refuse-guard)

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-11-20

## Problem Statement
WP6 can make a remote host account **Managed** (Install over the master), but nothing can then bring it current or take it away again: the paired affordance is missing (prior `paired-actions-need-paired-affordances`, and M18 does not close with Install alone). WP7 adds two actions to a Managed entry in Settings → Remote hosts, both run over the host's ControlMaster under the app-wide single-run lock and the `RunGuard` panic boundary, both judged by a re-probe of the host:
- **Update** (Managed + "Behind GitHub"): `git fetch` → `merge --ff-only` → `install.sh` with `HOME=<root>` → the record rewritten with `updated_at`. A dirty or non-fast-forward clone stops **before** `install.sh`, in plain words.
- **Uninstall** (Managed): through a **remote refuse-guard** of the local guard's shape. `RemoteUninstallTarget` has a private field and one constructor, `remote_refuse_guard`, fed ONLY by the record the host holds now plus host-side `pwd -P` observations. The preview is the host's real `uninstall.sh --dry-run`. The order is script → `rm -rf` of the guard-produced path → record deleted LAST, so a failure never clears the record.

The local gate is never touched. Verification only ever touches a sandbox root (`CLAUDESK_REMOTE_SUBSTRATE_ROOT`, debug builds), never the live account (§R.8).

**First (task 7.0), the two WP6-review MAJORs this WP builds on:**
- a Cancel whose remote kill fails or lands late can report "Nothing was installed" while the host becomes Managed;
- the delete guard misses other `rm` spellings and strips `*)` lines inside script templates.

WP7 adds the second remote delete, so the guard is fixed before that delete exists. The five WP6 MINORs come with them.

**Inputs:** `arch/claude-substrate.md` §R.3 (+ "R.3 Install as built"), §R.5, §R.8, and "WP3.5b, as built" (the local guard this one copies); `wbs.md` → WP7 + "Probe outcomes" (1)–(3); `backlog-quality-findings.md` → `# m18-wp6-remote-install — 2026-11-20`; `backlog.md` → `SURFACE-2026-11-20-REMOTE-INSTALL-REOPENED-SETTINGS-HIDES-THE-RUNNING-INSTALL`. **No 3rd-party probe needed:** the only external party is GitHub over public HTTPS (`fetch`, already measured as a clone at WP3, 3.9 s). Every on-host behaviour this WP leans on (`install.sh` re-run is content-idempotent, `uninstall.sh --dry-run` changes nothing, `HOME=<root>` contains every script write) was measured at WP3.

**Backlog check:** the one `high` item (`SURFACE-…` deleted-export, upstream-only) applies as a planning rule. Phase 4 generalizes the panel's IPC module; any export it renames or deletes migrates its consumers in the SAME phase, and `pnpm check:link` is in `verify:auto`. `SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN` (medium): dev builds show every streamed line twice. Phase 4's verify-self reads de-duplicated logs and does not count it as a defect; the fix stays with WP8.

## Decisions taken at plan (autopilot; each is cheap to reverse; the visible ones are Alignment questions)
- **D1 — 7.0 is Phase 1** (the handoff's "start with 7.0"), with the five WP6 MINORs. The reopened-Settings SURFACE goes to Phase 4, where the panel is reshaped anyway.
- **D2 — The Cancel fix (MAJOR 1):** once the pgid is known, Cancel sends the remote group kill ONCE and then **keeps reading the stream until it ends by itself**. It does not stop the local ssh.
  - A TERM during the clone kills the shell, so the stream ends with no result and the re-probe reads Absent: "Nothing was installed" is now true.
  - A TERM that lands after the trap is ignored, so the run reports `result:ok` and the reducer says the cancel came too late (MINOR 5's arm, `Some(Ok) if managed && cancel_requested`).
  - A kill exec that fails prints one output line ("Couldn't reach the host to cancel; waiting for the run to end") and still waits.
  - `StopLocal` stays only for "no pgid yet".
  - The deadline (1200 s) still bounds a true hang.
- **D3 — The delete guard (MAJOR 2):**
  - **The scan is a regex.** It matches every recursive `rm` spelling: any flag cluster containing `r`/`R`, or `--recursive`, in any position. It also matches `find … -delete`, `rmdir`, `unlink`, and the Rust APIs `remove_dir*` / `remove_file`.
  - **Comment stripping becomes raw-string-aware.** Inside an `r#"…"#` literal no line is treated as a comment, so a template's `*)` case arm is scanned.
  - **Each spelling is mutation-proven on its own**, and so is the `*)` case (`docs/lessons/source-text-guards.md`). The allowlist stays a (file, token-class) → count table.
- **D4 — The remote refuse-guard lives in a new `workflow_install/remote_guard.rs`.** Uninstall's and Update's script builders live in a new `workflow_install/remote_ops.rs`. The `rm -rf` of the approved clone gets **its own allowlist entry** (`remote_ops.rs`, count 1), as §R.3 says. Both files join `source_guard`'s `MODULE_FILES`.
  - The shared pieces (`fill`, the sentinel parser, the pgid line) are reused from `remote_runner.rs`, not copied.
  - The local guard's `RefusalReason` is reused where an arm has the same meaning.
- **D5 — The guard's inputs: the record AS THE HOST HOLDS IT NOW, plus host observations**, never the cached `HostSubstrate`. One exec under the lock (the "observe" script) prints, behind sentinels:
  - the record's bytes (hex, as the probe does);
  - `pwd -P` of the root, of `<root>/.claude`, of the account's own `$HOME` and of `$HOME/.claude`;
  - `pwd -P` of the record's `clone_path`, or that it does not resolve;
  - whether that path is a directory with an `uninstall.sh` file.

  The pure `remote_refuse_guard(record, &HostObservation)` refuses all of these:
  - no well-formed record;
  - an unresolvable path;
  - a path equal to a protected root, or inside a `.claude`, or an ancestor of a protected root;
  - not a directory;
  - no `uninstall.sh`.

  ⚠️ **The protected roots are the root AND the account's real `$HOME`** (both, plus each `.claude`). Under the debug sandbox they differ, and a record pointing at the real home must still be refused.
- **D6 — The host re-checks before deleting (as Install's D3 did).** The uninstall script receives the approved physical path and the record's observed bytes. Before `uninstall.sh` runs, it re-reads both. If the record's bytes changed, or `cd -P <clone> && pwd -P` is no longer exactly the approved path, it reports `result:changed` and touches nothing.
- **D7 — No Cancel on Uninstall** (decision; it takes well under 1 s, per Probe outcome (3)). The script sets `trap '' HUP PIPE TERM INT` right after its pgid line, so a dead stream (app quit) cannot split script → rm → record. `uninstall.sh` and the rm write to a log, printed afterwards, as `install.sh` does.
- **D8 — Update is cancellable only during `fetch`** (ruling A's shape: `phase:fetch` is cancellable, then `trap` and `phase:install`). The rest runs untrappable: `merge --ff-only`, then `install.sh`, then the record. The fetch is bounded by `http.lowSpeedLimit` / `http.lowSpeedTime`, so a stalled network fails in seconds rather than at the 1200 s deadline.
  - **Refusals before the fetch:** the record is gone or the probe does not read the record's clone (`result:not-managed`); the clone has local changes (`git status --porcelain` non-empty, `result:dirty`); the clone has no upstream (`result:no-upstream`).
  - **A non-ff merge** reports `result:not-ff` and nothing else runs.
- **D9 — The record gains an optional `updated_at`** (`#[serde(default, skip_serializing_if = "Option::is_none")]`). A local record and a fresh remote install stay byte-identical. `InstallRecord` has no `deny_unknown_fields`, so an older Claudesk reading an updated record still parses it. Update rewrites the record with the original `installed_at`, `clone_path` and `origin_url` kept, and only `updated_at` set. The JSON is built by Rust from the record the observe step read, written by the constant `printf` → tmp → `mv`.
- **D10 — The E0451 proof follows the WP3.5b precedent: a verify-self mutation, not a committed `compile_fail` doctest.**
  - Why not a doctest: `mod workflow_install` is private in `lib.rs`. A doctest naming the type would fail with E0603 (private module), not E0451, and would pass for the wrong reason. Rustdoc does not check error codes on stable.
  - The local precedent's "E0451 test" was the same mutation (`m10.9-wp3.5b` verify-self).
  - **Committed instead:** a `syn`-based test that the `rm -rf` builder's only path argument is a `&RemoteUninstallTarget` and that no `pub fn` / `impl` in the file returns one other than `remote_refuse_guard`. It is mutation-proven.
- **D11 — One event triple for all three remote runs, the payload carrying `host` and `op`** (`install | update | uninstall`).
  - **It replaces WP6's.** `remote-install-output` becomes `{host, op, line}`. The output event had no host, so the reopened-Settings re-attach could not tell runs apart.
  - **The rename lands in ONE phase with its consumers** (the high backlog item's rule).
  - **`workflow_remote_run_state`** returns `{host, op, phase} | null`, from a lock read. The panel seeds itself from it on mount, so a Settings reopened mid-run shows the run instead of the button. This closes the reopened-Settings SURFACE.
- **D12 — Buttons per state** (§R.5), each only while the host's link is Up:
  - **Absent:** Install (unchanged).
  - **Managed:** Uninstall, always.
  - **Managed + drift `differs`:** Update. A drift that is unknown, still checking, or can't check offers no Update (decision).
  - **Developer and Unknown:** nothing. The live account (Developer) gets no destructive affordance (exit criterion).

  Update and Uninstall each get a confirm step: Update a short one, Uninstall the dry-run preview. A success re-checks the host for HEAD + drift, as Install's does.

## Work Tree

- [x] Phase 1: 7.0 — the WP6-review carry-ins (Cancel truth, the delete guard, the five MINORs)  <!-- status: done 2026-11-20 -->
  **Observable outcomes:**
  - CLI: `cd src-tauri && cargo test --lib workflow_install` exits 0, with these tests passing:
    - a new real-script test (`/bin/zsh -c`, fixture repo) drives the late-TERM arm: a group TERM sent after `phase:install` is read, the stream is read to its end, the run reports `result:ok`, the root reads Managed, and `resolve(…, cancel_requested = true, Managed)` is `ok: true` with the "came after install.sh had started" message;
    - the existing `a_group_kill_during_the_clone_stops_the_run_and_records_nothing` still passes;
    - `abort_step` with a known pgid returns a kill-and-keep-reading step (not a stop) in a unit test.
  - CLI: a mutation that restores the old "kill then stop the local ssh" behaviour fails the new test (mutation-proven, restored by `cp` aside + `shasum`).
  - CLI: `cargo test --lib source_guard` exits 0. A throwaway mutant of `remote_runner.rs` adding each of these spellings **one at a time** fails `only_the_sanctioned_paths_may_call_deletion_apis`, every one, restored and re-shasummed: `rm -fr --`, `rm -Rf --`, `rm -R --`, `rm --recursive`, `find "$x" -delete`, `rmdir --`, and a `  *) rm -rf -- "$x" ;;` case arm inside the template.
  - CLI: a test asserts no remote run message (the four WP6 strings and every `resolve` message) contains two consecutive spaces. `grep -c '      ' src-tauri/src/workflow_install/commands.rs` drops by the four space runs (each fixed with Edit, never a Python heredoc).
  - CLI: `pnpm verify:auto` exits 0.
  - Browser (consuming surface; added at P1.verify-self per the integration-boundary rule: the Cancel path of `workflow_remote_install_start` / `workflow_remote_install_cancel` changed). State-changing: a scratch remote row + gate ON in the DEV `projects.json` / `settings.json`, with the app stopped; `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs empty sandbox dir on the mini>`; both files restored to their pre-check shas after.
    - The dev app's Settings → Remote hosts → Install → Cancel during the clone, over the real master, ends with "Cancelled. Nothing was installed.".
    - The stream ends by itself after the remote group kill: no local stop, so no `ABORTED_NOTE` in the log.
    - The sandbox then holds no record and no clone, and the live account's baseline is byte-identical before and after.
  **Alignment questions:**
  - none (copy-only fixes; the late-cancel sentence was written at WP6 and is reused verbatim)
  - [x] P1.1 Cancel truth (D2): `AbortStep::KillRemote(pgid)` sends the group kill once and returns "keep reading"; `StopLocal` only without a pgid. A failed kill exec emits one output line and keeps waiting. `resolve` gets `Some(Ok) if managed && cancel_requested` → `ok: true` + the too-late sentence (MINOR 5). The command's doc is corrected: it sets `cancel_requested` even with no run in flight, and the next start resets it.  <!-- status: done 2026-11-20 -->
  - [x] P1.2 The late-TERM real-script test + the `abort_step` unit test; mutation-prove the old behaviour fails.  <!-- status: done 2026-11-20 -->
  - [x] P1.3 The delete guard (D3): a `regex` scan for every recursive `rm` spelling, `-delete`, `rmdir`, `unlink`, `remove_dir*` and `remove_file`; `strip_comments` keeps lines inside `r#"…"#` raw strings. Meta-tests: a raw-string `*)` line survives the strip, and a real `/* … */` block is still stripped. Mutation-prove each spelling individually.  <!-- status: done 2026-11-20 -->
  - [x] P1.4 MINORs:
    - the four space-run strings restored with Edit, plus the no-double-space test;
    - the template's record name filled from `provenance::RECORD_FILENAME` (and `.claudesk` from its constant, if one exists);
    - a distinct `result:no-write` arm for a failed `mkdir -p`, with its own message;
    - `REMOTE_CLONE_PATH` in TS pinned by a test reading Rust's `CLONE_DIR_NAME` (the `?raw`/`node:fs` read of `workflow_install/mod.rs`, anchored on a unique substring);
    - the consent comment in `RemoteInstallPanel` corrected (`link_up` is a mount-time read).  <!-- status: done 2026-11-20 -->
  - [x] verify-auto  <!-- status: done 2026-11-20 -->
    — evidence: `pnpm verify:auto` → EXIT=0, 56 s (lint 0 errors, 1 pre-existing warning at an unchanged file's 988:7; format:check; tsc; check:link; vitest `Tests 4172 passed (4172)`; cargo fmt --check; clippy --all-targets -D warnings; cargo test `1462 passed; 0 failed; 4 ignored`)
    — evidence: scoped `cargo test --lib -- workflow_install::remote_runner workflow_install::source_guard workflow_install::commands remote_link::tests::begin_remote_install` → `50 passed; 0 failed`
    — evidence: `vitest run src/state/__tests__/remoteClonePath.test.ts` → `Tests 1 passed (1)`
    — evidence (at build, mutation): subshell restored → 3 tests FAIL; stop-local-after-kill restored → 3 tests FAIL; 9 deletion spellings planted one at a time in `remote_runner.rs`'s template → `only_the_sanctioned_paths_may_call_deletion_apis` FAILS on each, naming its kind; every restore `shasum -c` OK
  - [x] verify-self  <!-- status: done 2026-11-20 (runner: 5 CLI PASS; orchestrator: the live consuming-surface outcome PASS) -->
    - [x] Late-TERM real-script test, the clone-arm test and the `abort_step` unit test pass — evidence: `cargo test --lib workflow_install` → exit 0, `142 passed; 0 failed` (runner)
      - runner note (for codify): `a_cancel_whose_kill_lands_after_the_trap_…` asserts `ok && !cancelled` but not the "came after install.sh had started" text; the sibling `a_cancel_whose_kill_fails_…` asserts the exact string. Add the text assert at verify-codify.
    - [x] The "kill then stop" mutant fails the new tests — evidence: `abort_poll`'s KillRemote `false`→`true`, landed (grep 1) → `test result: FAILED. 25 passed; 3 failed` (the two real-script cancel tests + `the_abort_poll_kills_once_and_keeps_reading`); restore `shasum -c` OK (runner, independent of the build-time run)
    - [x] Each deletion spelling planted alone fails the delete guard — evidence: unmutated `cargo test --lib source_guard` → `9 passed`; 7 mutants (`rm -fr`, `rm -Rf`, `rm -R`, `rm --recursive`, `find -delete`, `rmdir`, a `*)` case arm) each landed → `FAILED. 8 passed; 1 failed` naming its kind; every restore `shasum -c` OK (runner)
    - [x] No space runs — evidence: `no_resolve_message_carries_a_space_run` + the cancel/panic + begin-refusal asserts pass; the four runs each HEAD=1 → working tree=0 (runner). Live: the dev app's refusal "…Claudesk last read this one as unknown. Reopen Settings…" arrived with single spaces.
    - [x] `pnpm verify:auto` exits 0 — evidence: exit 0, 86 s, vitest `4172 passed`, cargo `1462 passed; 0 failed; 4 ignored` (runner)
    - [x] Consuming surface, live (orchestrator, tauri bridge). The dev app ran with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=/Users/<user>/claudesk-m18-wp7-sandbox` (empty), and the scratch row was added to the dev `projects.json`. In ONE fired script:
      1. `remote_open_check` → `start`, then `remote_substrate_refresh` → `checked`, `absent`;
      2. `workflow_remote_install_start(<user>@<mini-host>)`;
      3. at the `remote-install-phase` `clone` event (336 ms), `workflow_remote_install_cancel` → accepted.

      — evidence: `remote-install-finished` at 447 ms `{ok:false, cancelled:true, message:"Cancelled. Nothing was installed."}`. The only output line was git's "Cloning into '…/claudesk-m18-wp7-sandbox/.claudesk/vendor/my-claude-code-customization'...", with NO `[stopped on request…]` note: the stream ended by itself after the remote group kill.
      — evidence (host, over the agent's own `ssh -M`):
        - the sandbox held only `./.claudesk ./.claudesk/vendor` (git removed its partial clone): no record, no clone, 0 processes;
        - the live baseline (54 links, `CLAUDE.md` / `settings.json` shas, clone `f8e8873` clean, no record) was identical before and after.
      — cleanup:
        - the dev app was stopped (no workspace was opened, so there was no tmux session);
        - the dev `projects.json` / `settings.json` were restored to `38ee76dd…` / `72bfef1c…`;
        - `tmux -L claudesk-dev ls` → no server;
        - the sandbox was removed after its `cd -P` check;
        - the scratch folder is unchanged (README + empty `workflow-system/state/`);
        - the agent's master was closed, and no `ssh -M` is left.
  - [x] verify-human  <!-- status: done 2026-11-20 --> — zero admissible leaves (F11); digest printed. Assumed: the CANCEL_UNCONFIRMED_NOTE and `no-write` copy (shown in the digest as a read-time veto)
  - [x] verify-codify  <!-- status: done 2026-11-20 -->
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 56 s; no CLAUDE.md declaration)
    — evidence: `pnpm verify:auto` → EXIT=0, 87 s; vitest `4172 passed`; cargo `1463 passed; 0 failed; 4 ignored`
    — new: `the_remote_install_worker_decides_cancel_through_abort_poll` (caller guard: the worker's abort IS `remote_runner::abort_poll`, polled by `run_streaming_abortable`; no `abort_step(` / `AbortStep::` re-derived in `commands.rs`). Mutation-proven: an inline "stop when cancel_requested" abort landed (grep 1) → `FAILED. 0 passed; 1 failed`; restore `shasum -c` OK.
    — new: the late-TERM test now asserts the "Cancel came after install.sh had started…" text (runner's note).
    — consuming surface: the live dev-app Cancel over the real master (P1.verify-self) + the caller guard above; an automated run of `workflow_remote_install_start` needs a running app and a host, so the guard is the CI-reachable half.

- [x] Phase 2: Uninstall backend — the remote refuse-guard, the preview, and the run  <!-- status: done 2026-11-20 -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — M18 cannot close with Install alone (prior `paired-actions-need-paired-affordances`)
  - Requirements unchanged: yes — §R.3 Uninstall as planned
  - Solution still feasible: yes — Phase 1 proved the run shape live; `uninstall.sh` is non-interactive with `--dry-run`
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --lib workflow_install::remote_guard` exits 0. The pure guard has one test per refusal arm, plus the approve arm:
    - no record;
    - an unresolvable path;
    - the target is the root;
    - the target is the account `$HOME` (sandboxed root ≠ home);
    - the target is inside `<root>/.claude`;
    - the target is inside `$HOME/.claude`;
    - the target is an ancestor of the root (incl. `/`);
    - not a directory;
    - no `uninstall.sh`.

    Each arm is mutation-proven **individually** (delete that one check, its test fails; restored by `cp` aside + `shasum`).
  - CLI: the observe script + parser, run for real under `/bin/zsh -c` against fixture roots:
    - a Managed fixture yields an approved target whose path is the fixture clone's `pwd -P`;
    - a record whose `clone_path` is a symlink to the root's `.claude` is refused as in-`.claude`;
    - a record pointing at the root itself is refused;
    - a missing `uninstall.sh` is refused;
    - a corrupt record reads as no record.
  - CLI: a real-script uninstall against a Managed fixture root (the fixture repo gains an `uninstall.sh` that removes its links) gives:
    - `result:ok`;
    - links gone, clone gone, record gone (deleted LAST: an injected `rm` failure leaves the record AND reports `result:rm-failed`; an injected `uninstall.sh` exit 1 leaves the clone and the record);
    - every write under the root (the WP6.4 containment walk, reused).
  - CLI: the host re-check (D6): changing the record's bytes, or swapping the clone for a symlink between observe and run, gives `result:changed`, and nothing is removed (the decoy dir is intact).
  - CLI: a committed `syn` test asserts the `rm -rf` builder's path input is `&RemoteUninstallTarget` and that nothing but `remote_refuse_guard` constructs one. It is mutation-proven: add a second constructor and the test fails.
  - CLI (verify-self, declared state change in a throwaway copy of the source tree only): a mutant constructing `RemoteUninstallTarget { … }` from `commands.rs` fails `cargo build` with `error[E0451]` (D10). The mutant is restored and the restore is `shasum`-checked.
  - CLI: the begin step refuses a non-row host, a non-Managed cached state, a link that is not Up, and a bad root, each before any worker runs (the lock is released, as `begin_remote_install`'s tests do).
  - CLI: `source_guard`'s allowlist has `remote_ops.rs` → recursive `rm`: 1, and the guard still passes. A second `rm -rf` in `remote_ops.rs` fails it.
  - Browser/IPC (consuming surface, amended at P2.verify-self: the phase changed `workflow_remote_install_start`'s begin step and its finished payload; state-changing, the dev app, the mini, a sandbox root only, the P1 recipe: scratch row in the DEV `projects.json`, `CLAUDESK_REMOTE_SUBSTRATE_ROOT`, restored after):
    - `workflow_remote_install_start` makes the sandbox Managed (`op: "install"` in its finished payload); `workflow_remote_uninstall_preview` returns the approved clone path + the host's dry-run lines; `workflow_remote_uninstall_start` ends `op: "uninstall"`, `ok: true`;
    - the result is `result:ok`, then a re-probe reads `substrate:no` with no record;
    - the live account's baseline (54 links, `CLAUDE.md` / `settings.json` shasums, the live clone's HEAD + status) is byte-identical before and after;
    - the sandbox is removed with a `cd -P` path check against `$HOME`.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (backend only; the operator sees it in Phase 4)
  - [x] P2.1 `remote_guard.rs`: `HostObservation`, `RemoteUninstallTarget` (private field, `clone_dir()` getter), the pure `remote_refuse_guard`, protected roots per D5, `RefusalReason` reused (and a new arm only if no existing one means the same thing). It joins `MODULE_FILES` with a tail anchor and gets the ambient-root guard.  <!-- status: done 2026-11-20 -->
  - [x] P2.2 `remote_ops.rs`: the observe script (sentinels, record hex, the `pwd -P` facts) + its parser; the dry-run preview script (`HOME=<root> ./uninstall.sh --dry-run` in the approved clone); the uninstall script (pgid, trap, host re-check D6, `uninstall.sh` → `rm -rf -- <approved>` → record deleted LAST, log printed, `result:<arm>`), built from a `&RemoteUninstallTarget`; a pure `resolve_uninstall` (the re-probe decides: `ok` only when the host reads Absent; every arm says what was and was not removed).  <!-- status: done 2026-11-20 -->
  - [x] P2.3 Commands:
    - `workflow_remote_uninstall_preview(host)` (async, under the lock, on a blocking worker): observe → guard → dry-run. It returns the preview text + the approved path, or the refusal's plain words.
    - `workflow_remote_uninstall_start(host)`: begin (lock, Managed, link held Up, root) → worker → observe → guard (the record is re-read in the worker, freshest) → run → re-probe through `settle_refresh` → `resolve_uninstall` → the finished event.
    - The local gate is untouched, pinned by a test.  <!-- status: done 2026-11-20 -->
  - [x] P2.4 The tests above: fixture `uninstall.sh`, guard arms, real-script runs, the containment walk, the D6 re-check, the `syn` constructor test, and the allowlist entry.  <!-- status: done 2026-11-20 -->
  - Build notes:
    - `begin_remote_install` → `begin_remote_run(…, RemoteOp)`; Install acts on Absent, Uninstall on Managed.
    - `RemoteInstallFinished` → `RemoteRunFinished`, with `op`.
    - Uninstall reports on the install's event pair (`op: "uninstall"`) until P4.1 renames them for all three ops, D11.
    - `remote_cmd::decode_hex` is now `pub(crate)`.
    - WP6's real-script fixture is shared as `pub(crate)`, and its repo gained an `uninstall.sh` of the real one's shape.
    - The worker-count guard now expects 4 `RunGuard` workers.
  - [x] verify-auto  <!-- status: done 2026-11-20 -->
    — evidence: `cargo fmt` then `pnpm verify:auto` on the final tree → EXIT=0, 77 s (lint 0 errors + the 1 pre-existing XtermPane warning; tsc; check:link; vitest `4172 passed`; clippy --all-targets -D warnings; cargo test `1492 passed; 0 failed; 4 ignored` + integration suites)
    — evidence: scoped `cargo test --lib -- workflow_install::remote_guard workflow_install::remote_ops workflow_install::source_guard workflow_install::commands remote_link::tests::begin_remote` → `52 passed; 0 failed`
    — evidence: `cargo test --test sync_commands_do_not_block` → `16 passed` (the async preview is listed in ASYNC_COMMANDS with its reason)
  - [x] verify-self  <!-- status: done 2026-11-20 (runner: 10 CLI PASS; orchestrator: the live consuming-surface outcome PASS) -->
    - [x] Guard: one test per refusal arm, plus the approve arm — evidence: `cargo test --lib workflow_install::remote_guard` → `13 passed`. Each of 9 checks was disabled alone and made its named test(s) fail; each restore `shasum -c` OK (runner logs `runner2/G{1,2,3,3b,4,4b,5,6,7}.log`):
      - G1: no record;
      - G2: unresolvable;
      - G3: is-root/home;
      - G3b: the `obs.home` member;
      - G4: in-`.claude`;
      - G4b: the home `.claude` member;
      - G5: ancestor;
      - G6: not a dir;
      - G7: no `uninstall.sh`.
    - [x] The observe script + parser, run for real against fixture roots: approved = the clone's physical path; a link into `.claude`, the root and the real home are each refused; a missing `uninstall.sh` and a missing clone are refused; a corrupt or absent record reads as no record — evidence: `remote_ops` tests → `25 passed` (runner)
    - [x] Real uninstall run:
      - `Ok`, links 2→0, clone and record gone, re-probe Absent;
      - the decoy home stays empty, and the only new path is `.claudesk/uninstall.log`;
      - injected failures: `RmFailed` (vendor 0555) keeps the record; `UninstallFailed(7)` keeps the clone and the record; `RecordDeleteFailed` is reported.

      — evidence: runner, 4 named tests ok. (Exit 7, not 1: any non-zero meets the intent.)
    - [x] D6 host re-check — evidence: changed record bytes → `Changed`, links stay 2; clone swapped for a link to a decoy → `Changed`, `decoy/keep` intact, record kept (runner)
    - [x] `syn` constructor/signature test — evidence: passes; the mutant (a second `pub fn forged()` constructor in `remote_guard.rs`) → FAILED `left: ["remote_refuse_guard", "forged"]`; restore OK (runner `SYN.log`)
    - [x] E0451 (D10) — evidence: in a throwaway rsync copy of `src-tauri` (own target), a struct literal in `workflow_remote_uninstall_start` → `error[E0451]: fields clone_dir, root and record_hex of struct RemoteUninstallTarget are private --> src/workflow_install/commands.rs:990:61`; the restored copy builds rc=0 (control) (runner `E0451.log`)
    - [x] Begin step — evidence: `begin_remote_run_for_uninstall_acts_only_on_a_managed_host` + WP6's begin tests (non-row, connecting, bad root run through the same `begin_remote_run`) ok (runner)
    - [x] Allowlist — evidence: `remote_ops.rs` RmRecursive 1 + Rm 1 pass; a second `rm -rf` → `found 2 RmRecursive deletion(s), 1 permitted` FAILED; restore OK (runner `ALLOW.log`)
    - [x] `pnpm verify:auto` — evidence: rc=0, vitest `4172 passed`, cargo `1492 passed; 0 failed; 4 ignored`, after every restore (runner)
    - [x] Consuming surface, live (orchestrator, tauri bridge). Setup: the dev app with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=/Users/<user>/claudesk-m18-wp7-sandbox` (empty), and the scratch row in the dev `projects.json`. In fired scripts:
      1. `remote_open_check` → `remote_substrate_refresh` → `absent`;
      2. `workflow_remote_install_start` → finished `{op:"install", ok:true, message:null}`;
      3. `workflow_remote_uninstall_preview` → `clone_dir` `/Users/<user>/claudesk-m18-wp7-sandbox/.claudesk/vendor/my-claude-code-customization` (the sandbox clone's physical path), and `preview` = the real `uninstall.sh --dry-run` (49 skills + 6 agents `[remove] … (dry-run)`, the `CLAUDE.md` block, the 4 printed permissions, "Done (dry-run). Nothing was changed");
      4. `workflow_remote_uninstall_start` (cache `managed`) → finished `{op:"uninstall", ok:true, message:null}` at 1.4 s, the streamed log ending "Done. Workflow symlinks and the CLAUDE.md block have been removed."

      — evidence (host, the agent's own `ssh -M`):
        - the sandbox has no record, no clone and 0 skill/agent links, with the workflow block gone from `CLAUDE.md`;
        - what remains is `uninstall.sh`'s own residue (empty `CLAUDE.md` + `.bak`, empty `skills/` + `agents/`, as WP3 measured) + Claudesk's `install.log` / `uninstall.log`;
        - 0 processes;
        - the live baseline (54 links, `CLAUDE.md` / `settings.json` shas, `f8e8873` clean, no record) is identical before and after.

      — harness note: the first fired script's Uninstall start was refused "Claudesk isn't connected … Claudesk uninstalls over that connection…". No workspace held the link, so it closed when the preview's hold dropped. That is the designed refusal, not a defect: in use, an open workspace holds the link. A fresh open check right before the start passed. Phase 4's live run opens a real workspace on the scratch row, or calls the open check per step.

      — cleanup: the dev app was stopped; the dev `projects.json` / `settings.json` were restored to `38ee76dd…` / `72bfef1c…`; there is no `claudesk-dev` tmux server; the sandbox was removed after its `cd -P` check; the scratch folder is unchanged; the master was closed and no `ssh -M` is left.
  - [x] verify-human  <!-- status: done 2026-11-20 --> — zero admissible leaves (F11); digest printed. Assumed: Claudesk's `install.log` / `uninstall.log` + an empty `vendor/` stay in `~/.claudesk/` after an Uninstall (with `uninstall.sh`'s own residue); the uninstall copy is judged in Phase 4's UI
  - [x] verify-codify  <!-- status: done 2026-11-20 -->
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 87 s; no CLAUDE.md declaration)
    — evidence: `cargo fmt` + `pnpm verify:auto` → EXIT=0, 69 s; vitest `4172 passed`; cargo `1493 passed; 0 failed; 4 ignored`
    — new: `the_remote_run_payloads_keep_their_wire_keys` (the finished payload's `op` in snake_case with WP6's keys kept; the preview's `clone_dir` / `preview`). Phase 4 binds to these, so a serde rename would blank the panel.
    — already committed at build, and each mutation-proven at verify-self:
      - the guard arms;
      - the real-script observe, run, failure, D6 and containment tests;
      - the `syn` fence;
      - the begin-step test;
      - the caller guard `the_remote_uninstall_guards_first_and_never_touches_the_local_gate`;
      - the 4-worker `RunGuard` count.
    — consuming surface: the live dev-app run (P2.verify-self) + `the_remote_uninstall_guards_first_…` and WP6's begin tests over `begin_remote_run`; an automated end-to-end of the commands needs a running app and a host.

- [x] Phase 3: Update backend — fetch, ff-only, re-install, record `updated_at`  <!-- status: done 2026-11-20 -->
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — Update is §R.3's third action and a WBS exit criterion
  - Requirements unchanged: yes — Probe outcome (2) ruled Update = pull → install.sh → `updated_at`
  - Solution still feasible: yes — Phase 2's guard and the Phase 1 stream / cancel shape are reusable
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --lib workflow_install` exits 0. Each test runs the real update script against a Managed fixture root whose clone is a clone of a local bare fixture origin:
    - **Behind:** a new commit pushed to the bare origin gives `result:ok`, the clone's HEAD equals the origin's, and `install.sh` ran (its log printed). The record still parses, keeps `installed_at` / `clone_path` / `origin_url` byte-equal, and has `updated_at` set.
    - **Dirty:** a modified tracked file in the clone gives `result:dirty`, and `install.sh` did not run (a marker file it would write is absent). The HEAD and the record are unchanged.
    - **Non-ff:** a local commit in the clone + a divergent origin commit gives `result:not-ff`. `install.sh` did not run, and the HEAD and the record are unchanged.
    - **No upstream:** gives `result:no-upstream`.
    - **The record gone between readout and run:** gives `result:not-managed`, and nothing runs.
  - CLI: `install.sh` failing after the merge gives `result:install-failed:<n>` with the record unchanged (no `updated_at` written). The reducer's message says the clone moved but the install did not complete, and that re-running Update is safe (Probe outcome (2): content-idempotent).
  - CLI: Cancel during `phase:fetch` (a group TERM, real script, a fetch slowed by a local `GIT_SSH`-free stall fixture such as a `file://` origin behind a `sleep` hook, or a pre-fetch sleep stub) ends the stream with no result. The HEAD and the record are unchanged, and the reducer says "Cancelled. Nothing was updated." A TERM after the trap is ignored and the run finishes (the D2 shape).
  - CLI: an `InstallRecord` with no `updated_at` serializes byte-identically to before (a local-record golden test), and a record with one parses through `provenance::read_record`.
  - Browser/IPC (consuming surface, amended at P3.verify-self: the phase refactored `workflow_remote_install_start`'s worker onto the shared Cancel helper; state-changing, the dev app, the mini, a sandbox root only, the P2 recipe):
    - `workflow_remote_install_start` → `{op:"install", ok:true}` (the refactored worker);
    - a sandbox-only `git reset --hard HEAD~1` of the sandbox clone (agent's own `ssh -M`) → `remote_substrate_refresh` reads `differs`;
    - `workflow_remote_update_start` → `{op:"update", ok:true}`, `phase` events `fetch` then `install`, the clone's HEAD = `git ls-remote origin HEAD`, the record keeps `installed_at` and gains `updated_at`;
    - `workflow_remote_uninstall_start` → Absent (cleanup through the product);
    - the live baseline is byte-identical, and the sandbox is removed.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (backend only)
  - [x] P3.1 `InstallRecord.updated_at: Option<String>` (D9) + the golden test.  <!-- status: done 2026-11-20 -->
  - [x] P3.2 The update script in `remote_ops.rs` (D8):
    - pgid line;
    - the record + probe re-check;
    - the dirty and no-upstream refusals;
    - `phase:fetch` with the low-speed bounds;
    - `trap`, then `phase:install`;
    - `merge --ff-only` (`not-ff`);
    - `install.sh` to the log;
    - the record rewritten LAST (`printf` → tmp → `mv`);
    - `result:`.

    Every `git` runs behind `DEV_TOOLS_GUARD` as `"$d/usr/bin/git"`, with `GIT_TERMINAL_PROMPT=0`. The new results go through the shared sentinel parser, and the phase enum gains `Fetch` (cancellable).  <!-- status: done 2026-11-20 -->
  - [x] P3.3 `workflow_remote_update_start(host)` (begin: lock, Managed, link Up, root) + the worker. The cancel path is shared with Install's (fixed in P1), and `workflow_remote_install_cancel` is generalized (renamed `workflow_remote_run_cancel` in Phase 4 with its consumer, D11). Then a pure `resolve_update`.  <!-- status: done 2026-11-20 -->
  - [x] P3.4 The tests above (a bare-origin fixture + the cancel arms).  <!-- status: done 2026-11-20 -->
  - Build notes:
    - Update acts on the remote refuse-guard's approved target (a recorded clone, never a protected root), like Uninstall; it deletes nothing.
    - `pull --ff-only` is split into `fetch` (cancellable, `phase:fetch`) + `merge --ff-only` inside the window.
    - The install worker's streaming / Cancel / re-probe moved into `stream_with_cancel` + `reprobe_host` + `cancel_was_requested`, shared by the install and update workers. The caller guard now pins the helper and both callers.
    - `RemoteSink` is generic over its result vocabulary.
    - The Cancel command is still `workflow_remote_install_cancel` (it cancels any remote run; the P4.1 rename is D11).
    - The `RunGuard` worker count is 5.
  - [x] verify-auto  <!-- status: done 2026-11-20 -->
    — evidence: `cargo fmt` then `pnpm verify:auto` on the final tree → EXIT=0, 55 s (lint 0 errors + the pre-existing XtermPane warning; vitest `4172 passed`; clippy clean; cargo `1502 passed; 0 failed; 4 ignored` + integration suites)
    — evidence: scoped `cargo test --lib -- workflow_install::remote_ops workflow_install::provenance workflow_install::commands workflow_install::remote_runner` → `77 passed; 0 failed`
    — evidence: `cargo test --test sync_commands_do_not_block` → `17 passed` (incl. the new `path_named_test_modules_are_not_scanned_as_production`)
  - [x] verify-self  <!-- status: done 2026-11-20 (runner: 5 CLI PASS; orchestrator: the live consuming-surface outcome PASS) -->
    - [x] Update real-script tests — evidence: `cargo test --lib workflow_install` → `181 passed`. Behind, Dirty, Non-ff, No-upstream and record-gone all hold. Accepted wordings: the origin is the non-bare fixture repo, and "install.sh did not run" is read from the `# workflow block` count staying 1. Mutants (each restored, `shasum -c` OK):
      - M1 (dirty check deleted) → the dirty test FAILED;
      - M2 (no `--ff-only`) → the non-ff test FAILED ("Merge made by the 'ort' strategy");
      - M4 (no `updated_at` stamp) → the behind + window tests FAILED.

      (runner3 logs)
      - ⚠️ runner gap, for codify: "its log printed" is asserted by no test. M6 (the update template's post-install `cat -- "$log"` deleted) SURVIVED all 181. The behaviour itself was observed in the M1 run (install.sh's output before `result:ok`). Add an assertion that the behind run's output carries install.sh's own lines (e.g. the fixture's `[ok] feature-build`).
    - [x] `install.sh` failing after the merge — evidence: `FIXTURE_FAIL=3` → `InstallFailed(3)`, HEAD = origin's new commit, record bytes unchanged; the `resolve_update` arm says the clone moved, the record was not updated, and Update can be retried (runner)
    - [x] Cancel during the fetch, and a TERM inside the window — evidence:
      - a group TERM 300 ms after `phase:fetch` (fetch stubbed by `sleep 30`) stops in under 10 s with no result; HEAD, record and blocks are unchanged; `resolve_update` says "Cancelled. Nothing was updated.";
      - a TERM 300 ms into `phase:install` → `Ok` with `updated_at` written;
      - M5 (trap before the fetch) → the cancel test FAILED (30.6 s);
      - M3 (install.sh in a subshell) → the window test FAILED `InstallFailed(143)`.

      (runner)
    - [x] `updated_at` golden — evidence: `updated_at_is_absent_until_an_update_sets_it` ok; `read_record` = `fs::read` + `parse_record`, so the test's `parse_record` is the same path (runner)
    - [x] `pnpm verify:auto` — evidence: exit 0, 61.6 s, vitest `4172 passed`, cargo `1502 passed; 0 failed; 4 ignored` (runner, after every restore)
    - [x] Consuming surface, live (orchestrator, tauri bridge; resumed after the operator's turn-level pause). Setup: the dev app with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=/Users/<user>/claudesk-m18-wp7-sandbox` (empty), the scratch row in the dev `projects.json`, and `remote_open_check` before each start.
      1. `workflow_remote_install_start` (the refactored worker) → `{op:"install", ok:true}`, phases `clone`, `install`.
      2. Over the agent's own `ssh -M`, after a `cd -P` path check, the sandbox clone was reset `f8e8873` → `755d1db`. `remote_substrate_refresh` → `managed`, drift `differs` (head `755d1db`, remote `f8e8873`).
      3. `workflow_remote_update_start` → `{op:"update", ok:true, message:null}`. Phase events: `fetch`, then `install`. The log (82 lines) opens with git's "Updating 755d1db..f8e8873 / Fast-forward" and carries `install.sh`'s own output. The refresh then reads `managed`, `up_to_date`, head `f8e8873`.
      4. On the host, the record keeps `installed_at` / `clone_path` / `origin_url` byte-identical and gains `updated_at`; the clone is clean at `f8e8873`; 54 links.
      5. `workflow_remote_uninstall_start` → `{op:"uninstall", ok:true}`; the refresh reads `absent`. On the host: no record, no clone, 0 links, 0 processes.

      — evidence (live baseline): 54 links, the `CLAUDE.md` / `settings.json` shas, `f8e8873` clean, no record — identical before and after.
      — cleanup:
        - the dev app was stopped (no workspace opened, no `claudesk-dev` tmux server);
        - the dev `projects.json` / `settings.json` were restored to `38ee76dd…` / `72bfef1c…`;
        - the sandbox was removed after its `cd -P` check;
        - the scratch folder is unchanged;
        - the master was closed, and no `ssh -M` is left.
  - [x] verify-human  <!-- status: done 2026-11-20 --> — zero admissible leaves (F11); digest printed. Assumed: the runner-accepted plan wordings; the install.sh-output assertion is added at codify
  - [x] verify-codify  <!-- status: done 2026-11-20 -->
    Test scope: full — suite not long (runtimes.md `pnpm verify:auto` Last 69 s; no CLAUDE.md declaration)
    — evidence: `cargo fmt` + `pnpm verify:auto` → EXIT=0, 77 s; vitest `4172 passed`; cargo `1502 passed; 0 failed; 4 ignored`
    — new: the behind test now asserts that install.sh's own output (`[ok] feature-build`) is shown before `result:ok`. This closes the runner's surviving M6: with the update template's `cat -- "$log"` removed, the test FAILED; restore `shasum -c` OK.
    — consuming surface: the live dev-app install → behind → update → uninstall run (P3.verify-self), plus the caller guards over `stream_with_cancel` and the guard-first order of the update worker.

- [x] Phase 4: Settings → Remote hosts — the Update and Uninstall buttons, one run panel, re-attach on reopen; live on the sandbox (7.5)  <!-- status: done 2026-11-20 -->
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes — the buttons are how the operator reaches Update / Uninstall; the reopened-Settings gap grows with them
  - Requirements unchanged: yes — D11 / D12 as planned
  - Solution still feasible: yes — the backend for all three ops is built and live-verified
  - No superior alternative discovered: yes
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `pnpm vitest run src/components/settings` exits 0. jsdom render tests of `RemoteHostsSettings` check which buttons each state offers:
    - Absent + link Up: Install only;
    - Managed + link Up + drift `differs`: Update and Uninstall;
    - Managed + up to date / can't check / checking: Uninstall only;
    - Managed + link down: no buttons;
    - Developer and Unknown: no buttons at all (the exit criterion: the live account gets no destructive affordance).
  - CLI: jsdom tests of the run panel cover both flows and the re-attach:
    - **Uninstall:** Uninstall… → the preview (the mocked `workflow_remote_uninstall_preview` text and the approved path shown) → confirm → the streamed log → the result. A refused preview shows its plain words and no confirm button.
    - **Update:** Update… → confirm → the log → Cancel enabled during `fetch`, disabled with a "finishing" label at `install` → the result.
    - **Re-attach:** a mount while `workflow_remote_run_state` returns `{host, op: "install", phase: "clone"}` shows the running view, not the button. The `SURFACE-…-REOPENED-SETTINGS-…` reproduction: it fails on the pre-change panel, run as a HEAD copy (`zz*.test.tsx`).
  - CLI: `pnpm verify:auto` exits 0 (incl. `check:link`, D11's renamed exports migrated in this same phase).
  - Browser (dev build via the tauri MCP bridge; state-changing: a scratch remote row + gate ON in the DEV `projects.json` / `settings.json` with the app stopped, `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs empty sandbox dir on the mini>`; restored to their pre-check shas after). The full 7.5 sequence, driven through the panel:
    1. Install → Managed.
    2. A sandbox-only `git reset --hard HEAD~1` over the agent's own `ssh -M`, then a Settings reopen → "Behind GitHub" + Update offered.
    3. Update → result Updated; the entry reads "Up to date with GitHub."
    4. Uninstall… → the preview lists the sandbox links → confirm → Absent, with Install offered again.

    Each step is read back from the DOM a frame later. After the sequence: the host sandbox holds no `.claudesk/install-record.json` and no vendor clone, and the live account's baseline is byte-identical before / after.
  - Browser: close Settings during an install's clone and reopen it. The entry shows the running view, then the result (the re-attach, live).
  - Browser: the live account's entry (Developer) shows the state + HEAD + drift and no Install / Update / Uninstall button (a DOM read of the entry).
  **Alignment questions:**
  - Uninstall's preview, in action: the confirm step shows `uninstall.sh --dry-run`'s real output and the approved clone path, then "Uninstall". Now that you see it, is that the confirmation you want before a remote delete?
  - (decision) Update gets a short confirm step (what it does: fetch from GitHub, fast-forward, re-run install.sh; it refuses on local changes), and is offered only when drift reads "Behind GitHub". Keep the confirm step, and keep hiding Update when drift can't be checked?
  - (decision) Uninstall has no Cancel (it takes under a second and must not be split), and Update can be cancelled only while fetching. OK?
  - The 7.5 happy path, in action: Install → Behind → Update → Uninstall → Absent on the sandbox entry. Does each result read right to you (`RemoteInstallFinished`-style messages for update and uninstall)?
  - [x] P4.1 IPC (D11):
    - one event triple with `{host, op, …}` payloads;
    - `workflow_remote_run_state`;
    - `workflow_remote_run_cancel`;
    - the preview / update / uninstall invokes in `src/state/remoteInstall.ts` (renamed `remoteRun.ts`).

    Every consumer is migrated in this phase; the backend events change with them.  <!-- status: done 2026-11-20 -->
  - [x] P4.2 The run panel (generalized from `RemoteInstallPanel`; one component, `op` as a prop):
    - the Install consent unchanged;
    - Update's confirm;
    - Uninstall's preview → confirm;
    - the log, the phase-gated Cancel (none for uninstall), and the result;
    - the mount-time seed from `workflow_remote_run_state`.

    `RemoteHostsSettings` offers the buttons per D12, and a success re-checks the entry.  <!-- status: done 2026-11-20 -->
  - [x] P4.3 The jsdom tests above (+ the HEAD-copy reproduction of the reopened-Settings gap).  <!-- status: done 2026-11-20 -->
  - [x] P4.4 Live 7.5 on the sandbox (verify-self), with the live-account baseline before/after and full state restore.  <!-- status: NOT-STARTED -->
  - Build notes:
    - P4.1: events `remote-run-output` `{host, op, line}`, `remote-run-phase` `{host, op, phase}`, `remote-run-finished` (`RemoteRunFinished` with `op`). The commands `workflow_remote_run_state` → `{host, op, phase} | null` and `workflow_remote_run_cancel` (renamed). `RemoteRunState.active` is set by each start command, never by the preview, and read only while the lock is held; every begin, local included, resets the remote state. Frontend `src/state/remoteInstall.ts` → `remoteRun.ts` (`git mv`) with all three consumers migrated in this phase; `check:link` is clean.
    - P4.2: `RemoteInstallPanel` → `RemoteRunPanel` (`git mv`), one component with the ops as offers. Testids are now generic `remote-run-*` plus `remote-<op>-open`. `remoteRunOffers` (a pure value) decides the buttons per D12.
    - P4.3: the HEAD-copy reproduction was substituted by a mutation positive control. HEAD's panel used other events and testids, so the new test can't run against it. Removing the re-attach makes `Settings reopened mid-run shows THIS host's run…` FAIL, which shows the WP6 behaviour (offer Install mid-run) fails the test. Also mutation-proven: Update offered on any drift, and Uninstall offered on a Developer host, each fail 2 tests. Each restore is `shasum -c` OK.
    - Gate: `pnpm verify:auto` EXIT=0, 92 s, vitest 4180, cargo 1504.
  - [x] verify-auto  <!-- status: done 2026-11-20 -->
    — evidence: `eslint` on the 4 changed frontend files → exit 0
    — evidence: `vitest run src/components/settings src/state/__tests__/remoteClonePath.test.ts` → `Test Files 24 passed`, `Tests 295 passed`
    — evidence: `cargo test --lib workflow_install::commands` → `17 passed` (incl. the run-state + event-payload tests)
    — evidence: the full `pnpm verify:auto` at build → EXIT=0, 92 s, `check:link — every entry linked cleanly (main, pip)` (the renamed module and exports migrated)
  - [x] verify-self  <!-- status: done 2026-11-20 (runner: 3 CLI PASS; orchestrator: 3 live outcomes PASS + 4 alignment captures) -->
    - [x] Offers per state (jsdom) — evidence: `vitest run src/components/settings` → EXIT=0, `294 passed`; the `remoteRunOffers` value tests + the live-mount matrix (runner)
    - [x] Run-panel flows + re-attach (jsdom). Mutants (runner, each restore OK):
      - re-attach removed → only the re-attach test FAILED;
      - (a) `cancellable` always true → the Update test FAILED ("Finishing the update…" expected, "Cancel" received);
      - (b) `canConfirm = true` → only the refused-preview test FAILED.

      The HEAD copy also ran in a throwaway `zz` test: WP6's `RemoteInstallPanel`, with an in-flight run mocked, made NO run-state call and showed Install, so the reproduction FAILS on the pre-change panel as planned. The runner accepts the mutation substitution.
      - runner gap, for codify: the Update test asserts the finishing label but not `disabled` at `install`. Both come from `finishing`, which mutant (a) proves; WP6's install test asserts `disabled`.
    - [x] `pnpm verify:auto` — evidence: EXIT=0, 55 s, `check:link — every entry linked cleanly (main, pip)`, vitest `4180 passed`, cargo `1504 passed` (runner)
    - [x] Live 7.5 through the PANEL (orchestrator, tauri bridge). Setup: the dev app with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=/Users/<user>/claudesk-m18-wp7-sandbox` (empty); the scratch workspace opened from the picker (the app's master Up, a tmux session in the scratch folder); Settings opened by the `menu` event `app.settings`. Each read was taken after the step settled.
      0. The entry reads `Absent`, with buttons `[Install…]` only; the other row (`<admin>@<host>`, link down) reads `Unknown` with no buttons.
      1. Install… → consent ("Install the workflow system on this host…") → Install → result **Installed** in 6.5 s; the entry reads `Managed`, "installed by Claudesk · HEAD f8e8873", "Up to date with GitHub."
      2. Sandbox-only `git reset --hard HEAD~1` (`cd -P` path check, own `ssh -M`) → `755d1db`; Settings closed and reopened → "Behind GitHub: this host is at 755d1db, GitHub at f8e8873.", buttons `[Update…, Uninstall…]`.
      3. Update… → the confirm lists `REMOTE_UPDATE_ITEMS` → Update. The Cancel button showed "Cancel", then "Finishing the update… [disabled]". Result **Updated** in 2.5 s; the log opens "Updating 755d1db..f8e8873 / Fast-forward"; the entry then reads "Up to date with GitHub.", HEAD `f8e8873`.
      4. Uninstall… → the preview in 1.7 s: "The clone that will be deleted: /Users/<user>/claudesk-m18-wp7-sandbox/.claudesk/vendor/my-claude-code-customization" + the host's 72-line dry run ("Uninstalling Claude Code workflow customizations… (dry-run — nothing will be changed) … Done (dry-run)") + the note; buttons `[Cancel, Uninstall]`. Uninstall → no Cancel button while running → result **Uninstalled** in 2.4 s; Close → `Absent`, buttons `[Install…]`.

      — note: the dev build delivered every streamed line twice (Update log: 164 lines, 76 unique). That is `SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN` (medium, dev-only StrictMode leak, prod confirmation at WP8), not this phase.
    - [x] Re-attach, live — evidence: Install → confirm → after 400 ms Settings closed (the group gone) → reopened 150 ms later. The entry showed "Installing on this host…" + "This run started before Settings was reopened; its earlier output isn't shown." + an enabled Cancel, and NO Install button; it then went on to **Installed** → `Managed`.
    - [x] The live account's Developer entry — evidence: the dev app was restarted WITHOUT the sandbox override (the workspace was closed through the UI first; tmux "no server") and the scratch workspace reopened. The entry reads `Developer`, "installed by hand; Claudesk doesn't manage it · HEAD f8e8873", "Up to date with GitHub.", buttons `[]`.
    - [x] align: Uninstall's confirm in action — evidence: `<session scratchpad>/p4-uninstall-confirm.png` (the intro, the clone path, the scrolling dry run, the note, Cancel / Uninstall all inside the panel) + the step-4 text above
    - [x] align: (decision) Update's confirm step + hidden when the drift is not "Behind" — evidence: the step-3 confirm text; the jsdom offers matrix (Uninstall only for up-to-date, checking, failed or can't check)
    - [x] align: (decision) no Cancel on Uninstall; Update cancellable only while fetching — evidence: steps 3 + 4 (Cancel → "Finishing the update… [disabled]"; no Cancel button during Uninstall)
    - [x] align: the 7.5 results' wording — evidence: results "Installed" / "Updated" / "Uninstalled", each with `message: null` on a clean run (the messages show only on failure; the copy is in `remote_ops::resolve_update` / `resolve_uninstall`)
    — cleanup:
      - both workspaces were closed through the UI (tmux "no server");
      - both dev apps were stopped (the second by PID, incl. its Vite on :1420);
      - the dev `projects.json` / `settings.json` were restored to `38ee76dd…` / `72bfef1c…`;
      - the sandbox was removed after its `cd -P` check (it held no record and no clone);
      - the scratch folder is unchanged;
      - the live baseline is identical before and after;
      - the master was closed, and no `ssh -M` is left.
  - [x] verify-human  <!-- status: done 2026-11-20 — 4 leaves, all approved by the operator as recommended -->
    - [x] P4.verify-human.1: the 7.5 happy path's results (Installed / Updated / Uninstalled; failure messages only on failure) — still what you want?  <!-- status: done 2026-11-20 — operator: "Yes, keep" -->
    - [x] P4.verify-human.2: Uninstall's confirm = the approved clone path + the host's real dry run, then "Uninstall" (screenshot p4-uninstall-confirm.png) — the confirmation you want before a remote delete?  <!-- status: done 2026-11-20 — operator: "Yes, as shown" -->
    - [x] P4.verify-human.3: (decision) Update has a short confirm step and is offered only when drift reads "Behind GitHub"  <!-- status: done 2026-11-20 — operator: "Keep both" -->
    - [x] P4.verify-human.4: (decision) no Cancel on Uninstall; Update cancellable only while fetching  <!-- status: done 2026-11-20 — operator: "OK, keep" -->
  - [x] verify-codify  <!-- status: done 2026-11-20 -->
    Test scope: full — last phase
    — evidence: `cargo fmt` + `pnpm verify:auto` → EXIT=0, 76 s; `check:link — every entry linked cleanly (main, pip)`; vitest `4183 passed`; cargo `1504 passed; 0 failed; 4 ignored`
    — new: the Update test asserts Cancel is `disabled` at `install` (the runner's gap). Mutation-proven: `disabled={cancel === "pending"}` (finishing dropped) → only that test FAILED; restore `shasum -c` OK.
    — new: the operator-approved P4 copy pinned by LITERAL (`REMOTE_UPDATE_ITEMS`, `REMOTE_UNINSTALL_INTRO` / `_NOTE`, and the update / uninstall result headings), as WP6 pinned the install consent.
    — consuming surface: the live 7.5 run through Settings → Remote hosts (P4.verify-self) + the jsdom mounts of the REAL `SettingsPanel` (Update, Uninstall, refused preview, re-attach).

## Current Node
- **Path:** Feature > ship
- **Active scope:** none — all four phases complete; next is `/feature-ship`
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** D-P1-a (fixed in P1.1: `install.sh` ran in a zsh subshell, which resets the ignored trap)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-11-20] feature-plan — wbs.md exceeds size guard (361 lines); read in full via section reads anyway (the WP7 section and "Probe outcomes" are the load-bearing parts). No action.
- [SURFACED-2026-11-20] Phase 1 > P1.1 — **WP6's install window did not hold (fixed here, not backlogged).** zsh resets an ignored `trap` inside a `( … )` subshell, so `( cd -- "$clone" && HOME="$root" ./install.sh )` let a TERM / HUP / INT that reached the group while `install.sh` ran kill it (exit 143) between two links: links with no record (Developer, no Uninstall), the exact state 6.3b exists to prevent. Measured with a perl harness: a TERM at 5 ms … 1.5 s into the window → `irc=143`; the same script with `install.sh` as a DIRECT child → `irc=0` at every delay, for TERM, HUP and INT. **The WP6 test passed while checking nothing:** its kill landed within ~2 ms of the `phase:install` line, before zsh forked the subshell. Fixed: the template runs `install.sh` as a direct child (`cd -- "$clone" && HOME="$root" ./install.sh …`), both kill tests deliver their TERM `KILL_DELAY` = 300 ms after their line, and a builder test refuses `( cd` in the script. Mutation-proven: the subshell restored fails 3 tests. ⚠️ Phases 2–3 inherit the rule: Uninstall's and Update's untrappable windows must run their children directly, never in `( … )`. For `arch/claude-substrate.md` → "R.3 Install as built" at finalize.
- [SURFACED-2026-11-20] Phase 3 > P3.4 — **The sync-command scanner read `#[path]` test files as production (fixed here, not backlogged).** `tests/sync_commands_do_not_block.rs` skipped an out-of-line `#[cfg(test)] mod x;` only as `x.rs` / `x/mod.rs`, so `#[path = "remote_runner_tests.rs"] mod tests;` (WP6) and `remote_ops_tests.rs` were scanned as production code. It surfaced when Phase 3's test helpers `head` / `git_in` (which call `Command::output`) shared names with fns on `git_recent_commits`' chain, a false "reaches a blocking call". Fixed: the scanner honours `#[path]` (relative to the declaring file). A positive control on the real crate pins both test files skipped and their declaring files scanned. Mutation-proven: dropping the `#[path]` skip fails both the control and the detector.
