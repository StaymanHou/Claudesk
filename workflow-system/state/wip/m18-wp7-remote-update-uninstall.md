---
drive_mode: autopilot
---

# Feature: M18 WP7 — Update and Uninstall (the remote refuse-guard)

**Workflow:** feature
**State:** plan (complete)
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

- [ ] Phase 1: 7.0 — the WP6-review carry-ins (Cancel truth, the delete guard, the five MINORs)  <!-- status: NOT-STARTED -->
  **Observable outcomes:**
  - CLI: `cd src-tauri && cargo test --lib workflow_install` exits 0, with these tests passing:
    - a new real-script test (`/bin/zsh -c`, fixture repo) drives the late-TERM arm: a group TERM sent after `phase:install` is read, the stream is read to its end, the run reports `result:ok`, the root reads Managed, and `resolve(…, cancel_requested = true, Managed)` is `ok: true` with the "came after install.sh had started" message;
    - the existing `a_group_kill_during_the_clone_stops_the_run_and_records_nothing` still passes;
    - `abort_step` with a known pgid returns a kill-and-keep-reading step (not a stop) in a unit test.
  - CLI: a mutation that restores the old "kill then stop the local ssh" behaviour fails the new test (mutation-proven, restored by `cp` aside + `shasum`).
  - CLI: `cargo test --lib source_guard` exits 0. A throwaway mutant of `remote_runner.rs` adding each of these spellings **one at a time** fails `only_the_sanctioned_paths_may_call_deletion_apis`, every one, restored and re-shasummed: `rm -fr --`, `rm -Rf --`, `rm -R --`, `rm --recursive`, `find "$x" -delete`, `rmdir --`, and a `  *) rm -rf -- "$x" ;;` case arm inside the template.
  - CLI: a test asserts no remote run message (the four WP6 strings and every `resolve` message) contains two consecutive spaces. `grep -c '      ' src-tauri/src/workflow_install/commands.rs` drops by the four space runs (each fixed with Edit, never a Python heredoc).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (copy-only fixes; the late-cancel sentence was written at WP6 and is reused verbatim)
  - [ ] P1.1 Cancel truth (D2): `AbortStep::KillRemote(pgid)` sends the group kill once and returns "keep reading"; `StopLocal` only without a pgid. A failed kill exec emits one output line and keeps waiting. `resolve` gets `Some(Ok) if managed && cancel_requested` → `ok: true` + the too-late sentence (MINOR 5). The command's doc is corrected: it sets `cancel_requested` even with no run in flight, and the next start resets it.  <!-- status: NOT-STARTED -->
  - [ ] P1.2 The late-TERM real-script test + the `abort_step` unit test; mutation-prove the old behaviour fails.  <!-- status: NOT-STARTED -->
  - [ ] P1.3 The delete guard (D3): a `regex` scan for every recursive `rm` spelling, `-delete`, `rmdir`, `unlink`, `remove_dir*` and `remove_file`; `strip_comments` keeps lines inside `r#"…"#` raw strings. Meta-tests: a raw-string `*)` line survives the strip, and a real `/* … */` block is still stripped. Mutation-prove each spelling individually.  <!-- status: NOT-STARTED -->
  - [ ] P1.4 MINORs:
    - the four space-run strings restored with Edit, plus the no-double-space test;
    - the template's record name filled from `provenance::RECORD_FILENAME` (and `.claudesk` from its constant, if one exists);
    - a distinct `result:no-write` arm for a failed `mkdir -p`, with its own message;
    - `REMOTE_CLONE_PATH` in TS pinned by a test reading Rust's `CLONE_DIR_NAME` (the `?raw`/`node:fs` read of `workflow_install/mod.rs`, anchored on a unique substring);
    - the consent comment in `RemoteInstallPanel` corrected (`link_up` is a mount-time read).  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: Uninstall backend — the remote refuse-guard, the preview, and the run  <!-- status: NOT-STARTED; depends on Phase 1 -->
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
  - CLI (state-changing, the mini, a sandbox dir only, over the agent's OWN `ssh -M` in a short `/tmp` socket dir, never a Claudesk master or the live account):
    - the observe + uninstall scripts printed by a throwaway test (not retyped) run against a sandbox root that a WP6-built install script made Managed;
    - the result is `result:ok`, then a re-probe reads `substrate:no` with no record;
    - the live account's baseline (54 links, `CLAUDE.md` / `settings.json` shasums, the live clone's HEAD + status) is byte-identical before and after;
    - the sandbox is removed with a `cd -P` path check against `$HOME`.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (backend only; the operator sees it in Phase 4)
  - [ ] P2.1 `remote_guard.rs`: `HostObservation`, `RemoteUninstallTarget` (private field, `clone_dir()` getter), the pure `remote_refuse_guard`, protected roots per D5, `RefusalReason` reused (and a new arm only if no existing one means the same thing). It joins `MODULE_FILES` with a tail anchor and gets the ambient-root guard.  <!-- status: NOT-STARTED -->
  - [ ] P2.2 `remote_ops.rs`: the observe script (sentinels, record hex, the `pwd -P` facts) + its parser; the dry-run preview script (`HOME=<root> ./uninstall.sh --dry-run` in the approved clone); the uninstall script (pgid, trap, host re-check D6, `uninstall.sh` → `rm -rf -- <approved>` → record deleted LAST, log printed, `result:<arm>`), built from a `&RemoteUninstallTarget`; a pure `resolve_uninstall` (the re-probe decides: `ok` only when the host reads Absent; every arm says what was and was not removed).  <!-- status: NOT-STARTED -->
  - [ ] P2.3 Commands:
    - `workflow_remote_uninstall_preview(host)` (async, under the lock, on a blocking worker): observe → guard → dry-run. It returns the preview text + the approved path, or the refusal's plain words.
    - `workflow_remote_uninstall_start(host)`: begin (lock, Managed, link held Up, root) → worker → observe → guard (the record is re-read in the worker, freshest) → run → re-probe through `settle_refresh` → `resolve_uninstall` → the finished event.
    - The local gate is untouched, pinned by a test.  <!-- status: NOT-STARTED -->
  - [ ] P2.4 The tests above: fixture `uninstall.sh`, guard arms, real-script runs, the containment walk, the D6 re-check, the `syn` constructor test, and the allowlist entry.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: Update backend — fetch, ff-only, re-install, record `updated_at`  <!-- status: NOT-STARTED; depends on Phase 2 -->
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
  - CLI (state-changing, the mini, sandbox only, own `ssh -M`, as in Phase 2):
    - a sandbox install whose clone was `git reset --hard HEAD~1` (sandbox-only) is updated by the printed script;
    - the result is `result:ok`, and HEAD equals `git ls-remote origin HEAD`;
    - the live baseline is byte-identical, and the sandbox is removed.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (backend only)
  - [ ] P3.1 `InstallRecord.updated_at: Option<String>` (D9) + the golden test.  <!-- status: NOT-STARTED -->
  - [ ] P3.2 The update script in `remote_ops.rs` (D8):
    - pgid line;
    - the record + probe re-check;
    - the dirty and no-upstream refusals;
    - `phase:fetch` with the low-speed bounds;
    - `trap`, then `phase:install`;
    - `merge --ff-only` (`not-ff`);
    - `install.sh` to the log;
    - the record rewritten LAST (`printf` → tmp → `mv`);
    - `result:`.

    Every `git` runs behind `DEV_TOOLS_GUARD` as `"$d/usr/bin/git"`, with `GIT_TERMINAL_PROMPT=0`. The new results go through the shared sentinel parser, and the phase enum gains `Fetch` (cancellable).  <!-- status: NOT-STARTED -->
  - [ ] P3.3 `workflow_remote_update_start(host)` (begin: lock, Managed, link Up, root) + the worker. The cancel path is shared with Install's (fixed in P1), and `workflow_remote_install_cancel` is generalized (renamed `workflow_remote_run_cancel` in Phase 4 with its consumer, D11). Then a pure `resolve_update`.  <!-- status: NOT-STARTED -->
  - [ ] P3.4 The tests above (a bare-origin fixture + the cancel arms).  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 4: Settings → Remote hosts — the Update and Uninstall buttons, one run panel, re-attach on reopen; live on the sandbox (7.5)  <!-- status: NOT-STARTED; depends on Phase 3 -->
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
  - [ ] P4.1 IPC (D11):
    - one event triple with `{host, op, …}` payloads;
    - `workflow_remote_run_state`;
    - `workflow_remote_run_cancel`;
    - the preview / update / uninstall invokes in `src/state/remoteInstall.ts` (renamed `remoteRun.ts`).

    Every consumer is migrated in this phase; the backend events change with them.  <!-- status: NOT-STARTED -->
  - [ ] P4.2 The run panel (generalized from `RemoteInstallPanel`; one component, `op` as a prop):
    - the Install consent unchanged;
    - Update's confirm;
    - Uninstall's preview → confirm;
    - the log, the phase-gated Cancel (none for uninstall), and the result;
    - the mount-time seed from `workflow_remote_run_state`.

    `RemoteHostsSettings` offers the buttons per D12, and a success re-checks the entry.  <!-- status: NOT-STARTED -->
  - [ ] P4.3 The jsdom tests above (+ the HEAD-copy reproduction of the reopened-Settings gap).  <!-- status: NOT-STARTED -->
  - [ ] P4.4 Live 7.5 on the sandbox (verify-self), with the live-account baseline before/after and full state restore.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 1 > P1.1
- **Active scope:** P1.1 (Cancel truth)
- **Blocked:** none
- **Unvisited:** Phase 2 (Uninstall backend), Phase 3 (Update backend), Phase 4 (Settings UI + live 7.5)
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [SURFACED-2026-11-20] feature-plan — wbs.md exceeds size guard (361 lines); read in full via section reads anyway (the WP7 section and "Probe outcomes" are the load-bearing parts). No action.
