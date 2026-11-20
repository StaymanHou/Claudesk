---
drive_mode: autopilot
---

# Feature: M18 WP6 — Install over the master

**Workflow:** feature
**State:** verify-codify (phase 2 complete)
**Created:** 2026-11-20

## Problem Statement
A remote host account with no workflow system reads **Absent** in Settings → Remote hosts (WP5). The workspaces on that host have no workflow surfaces (WP4), and the only remedy today is a hand install over ssh. WP6 adds an **Install** button to that Absent entry. It clones the public HTTPS repo into `<root>/.claudesk/vendor/my-claude-code-customization` on the host, runs `install.sh` with `HOME=<root>`, and writes the provenance record **last**. All of this runs as one streaming exec over the host's ControlMaster, under the app-wide single-run lock and the `RunGuard` panic boundary (§R.3).

The run is gated by the guarded Developer-tools preflight (§R.6, `DEV_TOOLS_GUARD`). Its output streams into the install output panel. Cancel follows operator ruling **A** ("Probe outcomes" (1)):
- local kill plus one remote `kill -TERM -- -<pgid>`, with the pgid printed as a stream sentinel;
- honoured only during the clone;
- the clone→install boundary is enforced **on the host** (6.3b);
- a stale vendor clone with no record is removed first.

The result never assumes success. It **re-probes** the host and writes `HostSubstrate` through the one `set_substrate` writer, so the readout and every open workspace on that host update live. The local gate is never touched. Verification touches only a sandbox root (`CLAUDESK_REMOTE_SUBSTRATE_ROOT`, debug builds), never the live account (§R.8).

Phase 1 first pays down the review findings the handoff marked "due before WP6", plus the two WP5 findings that sit on the readout WP6 extends.

**Inputs:** design `arch/claude-substrate.md` §R.3, §R.5, §R.6, §R.8; `wbs.md` → WP6 + "Probe outcomes" (1)–(5). There is no third-party API: the only external party is a public `git clone` over HTTPS, already probed at WP3 (3.9 s).

## Decisions taken at plan (autopilot; each is cheap to reverse; the visible ones are Alignment questions)
- **D1 — The carry-ins are Phase 1 of this WIP**, not a separate task. The handoff said the WP2 MAJORs are due before WP6. The two WP5 findings sit on the readout WP6's result lands in.
- **D2 — The remote run lives in `workflow_install/`** (new `remote_runner.rs`: pure script builders, the sentinel parser and the remote reducer). Its commands go in `workflow_install/commands.rs`, so the single-run lock keeps ONE take site (`HeldRunLock::try_acquire`) and the existing lock guard covers it. The new file joins `source_guard.rs`'s `MODULE_FILES`, so the delete guard scans it.
- **D3 — Install re-checks on the host and never trusts the cached readout.** The run script re-runs `SUBSTRATE_PROBE` against the root and refuses (`already-present`) unless it reads `substrate:no` with no record. This is what makes the stale-clone removal safe even if Settings is stale.
- **D4 — Stale-clone removal is a guarded remote `rm -rf`.** It needs all three:
  - no record;
  - probe `no`;
  - the clone dir is not a symlink, and its `pwd -P` lies under the root's `pwd -P`.

  The target is the constant vendor suffix under a Rust-validated root (`is_normalized_remote_path`). The delete guard gains a `remote_runner.rs` entry: `rm -rf`, count 1.
- **D5 — The host enforces the install window (6.3b).** After `phase:install`, `install.sh` and the record write run in one subshell under `trap '' HUP PIPE TERM INT`. Their output goes to `<root>/.claudesk/install.log`, which the outer script `cat`s to the stream afterwards. Reason: `install.sh` is `set -e`, so an echo into a dead pipe would end it even with SIGPIPE ignored. A group kill or stream death after the sentinel cannot split the link set from the record.
- **D6 — The post-run re-probe decides the final state.** It runs on every ending, including cancel, stream death and panic-free failure. If the run ended without reporting a result (for example, a cancel that landed after `phase:install`), the reducer reports what the host now IS. `set_substrate` writes only a known answer (Phase 1's P1.1 rule, applied here too).
- **D7 — A separate event pair**, `remote-install-output` / `remote-install-finished` (payload carries `host`). The local wizard's events stay byte-identical. Only one run exists at a time anyway, because of the shared lock.
- **D8 — The run holds the link for its duration** through a new `LinkRegistry::hold_if_up(host)`, which never brings a link up (§R.5: Settings never does). If the link is not Up, the run refuses before it takes the lock's worker.
- **D9 — Sentinel lines** (`CLAUDESK-RUN:pgid:<n>`, `CLAUDESK-RUN:phase:clone|install`, `CLAUDESK-RUN:result:<arm>[:<detail>]`) are parsed from the live stdout stream and **not shown** in the output panel. The pgid is accepted only as all digits and > 1.
- **D10 — `run_streaming` gains an abort predicate** (`pub(crate)`, polled with the existing 20 ms `POLL`, which then kills and reaps the local group). Local callers pass "never".
- **D11 — Consent before a remote install (Assumed).** A short consent step names the host, the clone path, "links in `~/.claude` and a block in `~/.claude/CLAUDE.md` on that host", and Uninstall arriving in WP7. It mirrors the local wizard's consent. It is an Alignment question in Phase 3.

## Work Tree

- [x] Phase 1: Carry-ins — pay down the review findings due before WP6  <!-- status: done -->
  **Observable outcomes:**
  - CLI: `cargo test settle_refresh` passes a new test: a known `Developer` host stays `Developer` after a refresh whose probe printed `substrate-probed` and no `substrate:` line. The outcome is `Checked` with the cached substrate, or `Failed`, never an `Unknown` write. Mutation: restore the unconditional `set_substrate` → that test fails.
  - CLI: `grep -rn "Behind" src-tauri/src/remote_substrate src/state src/components/settings` finds no `Drift::Behind` / `"behind"` wire tag. `Differs` / `"differs"` is used in Rust + TS + tests, and the readout copy still says "Behind GitHub" (`remoteHostsSettings.test.tsx` passes).
  - CLI: a `remote_cmd::preflight` unit test pins that the token-fix hint names the claude path the tools check resolved (`ssh -t <host> /…/claude setup-token`) when one was reported, and falls back to the old text when none was. `cargo test preflight` passes.
  - CLI: a new async command (e.g. `remote_bypass_refresh(project_path)`) re-reads `BYPASS_ACCEPTED` over `master_exec` and writes through `set_open_bypass`, and that function's single-writer guard is extended to admit it. A settle test proves a host answer of `false` → `true` flips the cached value, while `LinkNotUp` or an answerless exec leaves it unchanged. `cargo test bypass` passes.
  - CLI: a vitest drives the remote Recycle respawn path and shows it awaits the bypass refresh before the withhold decision (a mocked refresh answering `true` → `/session-restore` is injected; answering `LinkDown` → still withheld). `RESTORE_WITHHELD_FOR_BYPASS` says "has not been accepted", not "is showing".
  - CLI (live, dev build, scratch remote row; read-only on the host): the bridge invokes the refresh command for the scratch row with the link Up → it returns `true` (the dev account has accepted the warning), and `bypass_dialog_cleared` for that row then answers `true`.
  - CLI: `grep -n "displayed" workflow-system/product/arch/security-posture.md` hits inside "Terminal clipboard": the displayed-bytes paste-jacking vector is recorded as an accepted risk, with the follow-up options.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Recycle copy, "has not been accepted" in place of "is showing": still what you want?
  - (decision) The token hint now names the absolute claude path the preflight found, e.g. `ssh -t <host> ~/.local/bin/claude setup-token`, rather than wrapping a login shell. OK?
  - [x] P1.1 `settle_refresh`: skip the cache write when the read is `Unknown`. Fix its doc; add the settle test + mutation proof (`SURFACE-2026-11-20-QUALITY-SETTINGS-REFRESH-WRITES-UNKNOWN-OVER-A-KNOWN-HOST`)  <!-- status: done -->
  - [x] P1.2 Rename `Drift::Behind` → `Differs`, wire tag included (Rust, TS, tests). The copy stays (`SURFACE-2026-11-20-QUALITY-DRIFT-BEHIND-VARIANT-MEANS-DIFFERS`)  <!-- status: done -->
  - [x] P1.3 `token_fix` names the resolved claude path (`SURFACE-2026-11-18-QUALITY-TOKEN-FIX-HINT-ASSUMES-CLAUDE-ON-NONLOGIN-PATH`)  <!-- status: done -->
  - [x] P1.4 Remote Recycle refreshes the bypass answer before deciding, plus the "has not been accepted" copy (`SURFACE-2026-11-18-QUALITY-REMOTE-BYPASS-ANSWER-STALE-ACROSS-RECYCLE`, `…-RECYCLE-BYPASS-REASON-OVERCLAIMS`)  <!-- status: done -->
  - [x] P1.5 `security-posture.md` → "Terminal clipboard": record the displayed-bytes vector as an accepted risk (`SURFACE-2026-11-18-QUALITY-OSC52-PASTEJACK-VECTOR-UNRECORDED`)  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0, 64 s (lint 0 errors, 1 pre-existing warning in `XtermPane.tsx`, untouched; prettier clean; tsc; check:link; vitest `Tests 4154 passed (4154)`; cargo fmt; clippy -D warnings; cargo test lib `1424 passed; 0 failed` + every integration binary ok, `sync_commands_do_not_block` 16 passed).
    — evidence: two first-run failures, fixed in build scope: Prettier on `remoteHosts.ts`, and `singleAuthority.test.ts` refusing WIP-local labels (`P1.4`) in the Recycle modules (labels dropped; the SURFACE IDs carry the trail).
    — evidence: `grep -rn 'Drift::Behind\|"behind"' src-tauri/src src/state src/components/settings` → one hit, the rename's own doc prose; no variant or wire tag.
    — evidence: P1.1 mutation (`if false && substrate == …Unknown`) → `a_refresh_that_answered_writes_the_cache_once` FAILED; restored byte-exact (shasum match).
  - [x] verify-self  <!-- status: done -->
    - [x] settle_refresh keeps a known host — evidence: `cargo test --lib a_refresh_that_answered_writes_the_cache_once` → ok; the `Unknown` guard sits before `set_substrate` (runner read); mutation run at build → FAILED as required.
    - [x] Differs rename — evidence: `grep -rn '"behind"\|Drift::Behind' src-tauri/src src` → the rename's doc prose only; "Behind GitHub" copy kept; vitest `remoteHostsSettings` + `recycleSession` → 65 passed.
    - [x] token hint — evidence: `cargo test --lib preflight` → 15 passed; `claude-at:` prints after `CLAUDE_PATH_FALLBACK`; the real-zsh test asserts `claude-at:<fake ~/.local/bin/claude>`.
    - [x] bypass re-read command + settle + two-writer guard — evidence: `cargo test --lib bypass` → 17 passed; registered `lib.rs`, listed in `ASYNC_COMMANDS`.
    - [x] Recycle awaits the re-read before deciding — evidence: vitest order `settle → refreshBypass → readBypass → inject`; accepted → injected, kept-false → withheld; toast asserts "has not been accepted". Gap (runner): no vitest pins `refreshRemoteBypass`'s local-key no-IPC branch → codify.
    - [x] LIVE (dev build, scratch row, read-only on the host; orchestrator, bridge) — evidence: `remote_open_check` → `start` (link Up, grace); `remote_bypass_refresh(<scratch key>)` → `true` in 52 ms (dev `ssh -M` pid present); local key → `null`; after the 20 s grace (dev `ssh -M` gone per `ps`) → `null` in 2 ms (no ssh). Teardown: no `claudesk-dev` tmux server on the host, scratch folder unchanged, dev app stopped, dev `projects.json` / `settings.json` shas = backups (38ee76dd…, 72bfef1c…). `UNVERIFIED: undrivable` half: `bypass_dialog_cleared` → `true` needs a SPAWNED session's recorded permission (no session → `false` by D4); spawning remote CC was not worth the account's usage. Covered by `remote_cleared`'s unit tests reading the same cache.
    - [x] security-posture displayed-bytes risk — evidence: `grep -n displayed security-posture.md` → line 133, inside "Terminal clipboard"; follow-ups at 142–146.
    - [x] `pnpm verify:auto` → EXIT=0 (verify-auto).
    - [x] align: Recycle copy — evidence: toast = `Recycled, but /session-restore was not sent: Claude Code's Bypass Permissions warning has not been accepted, and its default "No, exit" would close the session (pick "Yes, I accept" first). Run /session-restore yourself.`
    - [x] align: token hint form — evidence: `the token in ~/.claudesk/cc-oauth-token on mini is missing or empty. Fix: run `ssh -t mini '/Users/u/.local/bin/claude' setup-token` and save the token it prints to that file (chmod 600)` (absolute, single-quoted; not a `~/` form).
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1 (a) Recycle copy "has not been accepted" in place of "is showing": still what you want? — operator 2026-11-20: ok.
    - [x] P1.verify-human.2 (c, decision) token hint names the host's absolute, quoted claude path — operator: A (keep it).
    - [x] P1.verify-human.3 (c, evidence gap) `bypass_dialog_cleared` → true after a live re-read — operator: A (accept the unit-test coverage; no live CC spawn).
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 64s < 300s)
    — evidence: new `readFolderTrust.test.ts` → `refreshRemoteBypass` (local key → no IPC; remote key → one `remote_bypass_refresh` with that key; a rejected IPC resolves) → 12 passed.
    — evidence: mutations, each alone, each restored byte-exact (shasum): drop the local-key guard → "makes NO IPC for a local key" FAILED; drop Recycle's refresh call → 3 Recycle tests FAILED; refresh moved AFTER the read → the same 3 FAILED; a direct `set_open_bypass` in `remote_bypass_refresh` → `the_bypass_answer_has_two_writers_each_a_settle` FAILED; settle writes without the marker (`unwrap_or(false)`) → `a_bypass_refresh_writes_the_cache_only_when_the_host_answered` FAILED. (P1.1's mutation was run at build.)
    — evidence: `pnpm verify:auto` → EXIT=0, 60 s (vitest `Tests 4157 passed (4157)`; cargo test lib ok; clippy, fmt clean).

- [x] Phase 2: The remote install run (backend: script, transport, cancel, reducer)  <!-- status: done -->
  **Observable outcomes:**
  - CLI: pure builder tests in `remote_runner.rs` pass. They pin:
    - the root and the record JSON are quoted (`'`, `$`, spaces and a newline in a root are refused before any build);
    - the record JSON is `serde_json` of `InstallRecord`, written by a constant-format `printf` to a tmp file then `mv`'d;
    - the clone URL is the public HTTPS constant;
    - every `git` is `"$d/usr/bin/git"` behind `DEV_TOOLS_GUARD`, with `GIT_TERMINAL_PROMPT=0` and stdin closed;
    - sentinel order: `pgid` first, then `phase:clone`, then `phase:install`.
  - CLI: the **preflight's three arms** run against the stub `xcode-select` from "Probe outcomes" (5): empty output + exit 2 → `result:no-devtools`, and no `git` runs; invalid `DEVELOPER_DIR` → refuses; a real dir → proceeds. Each arm is a test.
  - CLI: **local end-to-end arms.** The real built script runs under `zsh -c` (the ssh stand-in) through `run_streaming`, with a local fixture repo whose `install.sh` carries the marker. Arms:
    - success: record written last, `HostSubstrate` re-probe = Managed;
    - `already-present` (record exists, or probe `yes`): nothing written or removed;
    - stale clone without a record: removed, then a clean install;
    - stale clone that is a symlink, or resolves outside the root: refused, nothing removed;
    - clone failure;
    - missing `install.sh`;
    - `install.sh` failure: no record.

    Each arm is asserted through the remote reducer's value.
  - CLI: **6.3b.** A fixture `install.sh` that sleeps 1 s: after `phase:install` is read, `kill -TERM -- -<pgid>` is sent → `install.sh` completes, the record is written, and the re-probe reads Managed. A kill sent during `phase:clone` (the slow-clone variant substitutes only the clone fragment) leaves no record and no process in the group at +1 s.
  - CLI: **6.4 containment.** For the sandboxed end-to-end run, the test process sets `HOME` to a decoy dir and the root to a separate temp dir. `sandbox::assert_writes_stay_under(root, …)` holds for every new path (canonicalized), the decoy is byte-identical before/after, and the positive set (`.claude/skills/*`, `.claude/agents/*`, `.claude/hooks/*`, `.claude/CLAUDE.md`, `.claudesk/{install-record.json,vendor/…,install.log}`) is present.
  - CLI: `source_guard` delete guard: `remote_runner.rs` → `rm -rf` permitted 1, and every other module file 0. Mutation: add a second `rm -rf` → the guard fails. The lock guard still finds exactly one take site, now also called from `begin_remote_install`.
  - CLI: `cargo test run_streaming` covers the new abort predicate: abort → the group is killed and reaped within ~`POLL` + `DRAIN_GRACE`, and queued lines are kept. Existing local install tests pass unchanged.
  - CLI: `begin_remote_install` refuses with plain words, and the lock is free afterwards: (a) link not Up; (b) host not a row's host; (c) cached substrate not Absent; (d) a run already in progress. Each is a test.
  - CLI (live, dev build, state-changing ONLY under the sandbox root on the mini's dev account; `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs empty dir>`): the bridge invokes the start command for the scratch row's host →
    - the `remote-install-output` events stream the clone and `install.sh` lines, with no `CLAUDESK-RUN:` lines among them;
    - `remote-install-finished` gives `ok: true`;
    - over ssh, `<root>/.claudesk/install-record.json` exists with `clone_path` = the sandbox vendor path;
    - every `<root>/.claude/skills/*` link resolves into the sandbox clone;
    - a `find ~ -xdev -newer <marker>` sweep (root pruned, the explicit exclusion list from "Probe outcomes" (3)) shows no path that `install.sh` writes;
    - the live account's baseline (link count, `CLAUDE.md` / `settings.json` shasums, live clone HEAD + status) is unchanged.
  - CLI (live, sandbox, state-changing): start, then cancel during the clone →
    - `remote-install-finished` reports cancelled;
    - at +1 s the host's process table shows no process of the run's pgid;
    - there is no record;
    - the next start clears any leftover vendor clone and succeeds.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (no operator-visible surface yet; the result copy is reviewed in Phase 3)
  - [x] P2.1 `run_streaming` → `pub(crate)` + abort predicate (D10); local callers pass never  <!-- status: done -->
  - [x] P2.2 `remote_runner.rs`: pure script builder (preflight → host re-probe/refuse → guarded stale-clone removal → `phase:clone` + clone → `phase:install` + trapped subshell { `install.sh` with `HOME=<root>` → record tmp + `mv` } → log `cat` → `result:`), the record JSON from Rust, and the sentinel parser (6.2)  <!-- status: done -->
  - [x] P2.3 The remote reducer, pure: (outcome lines, exit, cancel-requested, re-probe read) → `RemoteInstallFinished`. Per-arm decisions, no shared default, no gate field (6.3)  <!-- status: done -->
  - [x] P2.4 Transport + commands: `master_only_exec_argv` + `login_shell(script)` as the program; `LinkRegistry::hold_if_up` (D8); `begin_remote_install` + `workflow_remote_install_start(host)` on a worker under `HeldRunLock` + `RunGuard` with the D7 events; post-run re-probe through `set_substrate` (known answers only) (6.1, 6.3)  <!-- status: done -->
  - [x] P2.5 Cancel per ruling A: `workflow_remote_install_cancel` → ignored after `phase:install` (it answers "too late: the install is finishing"); a pending cancel before the pgid arrives fires once it arrives; the remote `kill -TERM -- -<pgid>` over `master_exec` (2 s) + the local abort (6.3b)  <!-- status: done -->
  - [x] P2.6 Tests: the builder, the preflight's three stub arms, the local end-to-end arms, 6.3b, 6.4 containment, the delete-guard entry + its mutation proof  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0, 71 s (lint 0 errors, the 1 pre-existing `XtermPane.tsx` warning; prettier; tsc; check:link; vitest `Tests 4157 passed (4157)`; cargo fmt; clippy `--all-targets -D warnings` clean; cargo test lib `1450 passed; 0 failed`; `sync_commands_do_not_block` 16 passed with the two new sync commands).
    — evidence (build-time, scoped): `cargo test --lib workflow_install::remote_runner` → 20 passed, including the real script under zsh against a fixture repo (ok / already-present ×3 / leftover removed / symlink + outside-root refused / clone-fail / no install.sh / install-fail / no root / the 3 preflight stub arms / group kill after `phase:install` → still `ok` + record / group kill during the clone → no record, group empty); `the_guard_releases_the_lock_and_reports_on_both_paths` extended to 3 workers; delete-guard mutation (a 2nd `rm -rf`) → "found 2 … 1 permitted", restored byte-exact.
  - [x] verify-self  <!-- status: done -->
    - [x] builder (quoting, printf+mv record, HTTPS URL, git behind the GROUPED guard, sentinel order) — evidence (runner): the 5 builder tests ok; the template's negation is `if ! { GUARD; }; then`.
    - [x] preflight 3 stub arms — evidence: `the_developer_tools_preflight_refuses_without_running_git` ok (stub exit 2 → NoDevTools, no clone dir; `DEVELOPER_DIR=/var/empty` → NoDevTools; real dir → Ok).
    - [x] local end-to-end arms (ok / already-present ×3 / leftover removed / symlink + outside-root refused / clone-fail / no install.sh / install-fail / no root) — evidence: 9 tests ok; `resolve` unit-tested over every arm. Runner note: the worker's composition (first-result → `settle_refresh` → `resolve`) is covered by the live run below.
    - [x] 6.3b (kill after `phase:install` → still ok + record + Managed; kill during clone → no result, no record, group empty) — evidence: both tests ok (group checked at +500 ms after the reap, not +1 s; runner judged it at least as strict).
    - [x] 6.4 containment (decoy `$HOME` empty, every write under the canonical root, positive set present) — evidence: `every_write_of_a_sandboxed_install_stays_under_the_root` ok.
    - [x] delete guard (`remote_runner.rs` `rm -rf` 1, others 0) + lock guard — evidence: both ok; delete-guard mutation run at build.
    - [x] `run_streaming_abortable` — evidence: `abort_kills_the_group_promptly_and_keeps_queued_lines`, `an_abort_that_never_fires_leaves_the_run_as_it_was` ok; local install tests unchanged.
    - [x] `begin_remote_install` refusals (no link / not a row / not Absent / bad root / already running; lock free after each) — evidence: `begin_remote_install_refuses_each_unsafe_start_and_leaves_the_lock_free` ok. Gaps noted by the runner: Managed is not in the not-Absent loop; "not Up" is tested only as "no link" (`hold_if_up` matches only `(Up, Some(home))`).
    - [x] LIVE install (dev build relaunched clean after the fixes, PID start 14:00:23 > binary 13:58:57 > last restore; `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs empty sandbox on the mini>`; orchestrator via bridge) — evidence: `remote_open_check` → start; `remote_substrate_refresh` → checked/absent; `workflow_remote_install_start` → ok; `remote-install-phase` clone @1.57 s, install @6.26 s; `remote-install-finished` {ok: true, cancelled: false, message: null} @6.98 s; `remote-substrate` event → managed; `remote_hosts` → the host Managed, record `clone_path` = `<sandbox>/.claudesk/vendor/my-claude-code-customization`; 79 output lines, 0 containing `CLAUDESK-RUN:`. Host: record = the Rust JSON (HTTPS origin); 54 sandbox links, 0 resolving outside the sandbox clone; `.claudesk` = record + install.log + vendor. Live account: baseline (54 links, `CLAUDE.md` / `settings.json` shasums, clone HEAD `f8e8873`, 0-line status, `~/.claudesk` listing) IDENTICAL before / after / at teardown; 0 paths under the real `~/.claude/{skills,agents,hooks,CLAUDE.md}` newer than the marker. Corrected `-newer` sweep (prunes first, `-newer` on the print branch; my first sweep attached `-newer` to one branch only and listed everything, a false finding caught by `stat`): every hit is explained (the dev link's own deploy under `~/.claudesk/com.claudesk.app.dev/`, the live CC session's runtime files under `~/.claude/`, `$HOME`'s mtime from the sandbox mkdir, the live clone's `.git` from the baseline's `git status` index refresh); positive control: 4 sandbox files newer.
    - [x] LIVE cancel during the clone (sandbox reset to empty, path-checked) — evidence: cancel invoked on the `clone` phase event @0.95 s → accepted; `remote-install-finished` {ok: false, cancelled: true, message: "Cancelled. Nothing was installed."} @1.07 s; output = "Cloning into …" + "[stopped on request; the process group was killed]". Host: 0 processes referencing the sandbox from the first sample on; no record; NO clone dir (git's own TERM handler removed it, which a local-only kill would not have caused: WP3 "Probe outcomes" (1)).
    - [x] LIVE next start clears a leftover — evidence: a planted `vendor/<name>/{.git,LEFTOVER}` → the run's first line "Removing a leftover clone from an earlier run that did not finish." → `ok: true`; host: LEFTOVER gone, install.sh present, record present; 0 sentinel leaks.
    - [x] `pnpm verify:auto` → EXIT=0 (verify-auto).
    - [x] Teardown — evidence: sandbox + marker removed (path-checked); no `claudesk-dev` tmux server; dev app stopped; dev `projects.json` / `settings.json` shas = backups; only the installed app's `ssh -M` remains.
    - [x] Finding 1 (runner; COSMETIC there, treated as BLOCKING here: it broke the module's "quoted or refused" invariant) — the template's chained `str::replace` re-scanned inserted values, so a root containing `__JSON__` left the JSON (and the root's `$(…)`) unquoted, and it executed. Fixed in place (SHORTCUT below): a one-pass `fill`, test `a_root_carrying_a_placeholder_token_stays_quoted` (runs the root's `$(touch …)` for real), mutation (the replace chain back) → FAILED.
    - [x] Finding 2 (runner; COSMETIC) — the single-run-lock guard's table did not name the remote command. Fixed in place: two entries + whole-body slicing (the fixed 400-char window was outgrown); mutation (no lock take in `begin_remote_install`) → the guard AND arm (d) FAILED.
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11)
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 71s < 300s)
    — evidence: the runner's two gaps filled: `begin_remote_install_refuses_each_unsafe_start_and_leaves_the_lock_free` now refuses a cached Managed host too; new `a_link_that_is_still_connecting_is_not_held_and_install_refuses` (a link held in Connecting by the pre-connect delay: `hold_if_up` → None, begin → "isn't connected"; once Up it can be held). Mutation (`hold_if_up` accepts any state) → the new test FAILED; restored byte-exact.
    — evidence: the live-only composition (first result → `settle_refresh` → `resolve`) stays covered by the Phase 2 live run; Phase 3's live run repeats it through the UI.
    — evidence: `pnpm verify:auto` → EXIT=0, 69 s (vitest `Tests 4157 passed (4157)`; cargo test lib `1452 passed; 0 failed`; clippy, fmt clean).

- [ ] Phase 3: The Install button, its output, and the live result  <!-- status: NOT-STARTED; depends on Phase 2 -->
  **Observable outcomes:**
  - CLI: `remoteHostsSettings.test.tsx` (jsdom render) shows:
    - an **Absent** entry with its link Up renders an Install button;
    - an Absent entry with its link down shows "Connect a workspace on this host to check." and no button;
    - Developer, Managed and Unknown entries render no Install;
    - Install → the consent step (host, clone path, what is written, Uninstall arrives later) → Confirm invokes `workflow_remote_install_start` with that host;
    - streamed `remote-install-output` lines render in the output panel;
    - Cancel is enabled during the clone and disabled with "finishing the install…" once `phase:install` was seen (a status prop from the backend's phase event, or a `remote-install-phase` event: build decides);
    - `remote-install-finished` renders the result in the entry.
  - CLI: the group's geometry is measured. With the consent or output panel open, the button row lies inside the Settings panel's visible rect (`getBoundingClientRect` in a live mount; lesson: the 702 px dialog in a 599 px panel).
  - CLI: the local install wizard's tests pass unchanged, and its events are untouched (D7).
  - Browser (live, dev build via the tauri bridge, gate ON, sandbox root; state-changing only under the sandbox root):
    - Settings → Remote hosts shows the scratch host **Absent**;
    - clicking Install → Confirm streams output, then the entry reads **Managed** with `HEAD <short>` and drift "Up to date";
    - meanwhile a gate-ON scratch workspace on that host, open throughout, goes from the absent-host note to its skill row + Session-Start + Docs **without a reopen** (6.6);
    - screenshots are captured for each state.
  - Browser (live): Install while another substrate run holds the lock → a plain-words refusal in the entry; the lock is free afterwards.
  - Console: no uncaught errors in the bridge `window` error tap during the run.
  - CLI: `pnpm verify:auto` exits 0. After verification the sandbox dir on the mini is removed over ssh (declared, scratch-only), and the dev `projects.json` / `settings.json` match their pre-check shas.
  **Alignment questions:**
  - Absent → Install → Managed in action (screenshots): is this the flow you meant?
  - (decision) The consent step before a remote install (D11): keep it, or start the run on one click?
  - (decision) Cancel is disabled with "finishing the install…" once `install.sh` starts (ruling A, as built). Is that wording right?
  - (decision) What the result shows in the entry: success = the re-probed readout itself (no extra banner); failure = the script's last error line + "Nothing was recorded; you can retry." Want a persistent banner instead?
  - [ ] P3.1 TS: `remoteInstall` state module (start, cancel, the event listeners) + the `RemoteHostEntry` install affordance (Absent + link Up only)  <!-- status: NOT-STARTED -->
  - [ ] P3.2 The consent step + the output panel (reuse the local wizard's presentational output/tail pieces; extract them if needed, with the local wizard unchanged in behaviour) + Cancel gated on phase  <!-- status: NOT-STARTED -->
  - [ ] P3.3 The result in the entry. The substrate comes through `useHostSubstrates` (the re-probe's event), never a local copy (6.5)  <!-- status: NOT-STARTED -->
  - [ ] P3.4 Geometry measurement + the jsdom render tests  <!-- status: NOT-STARTED -->
  - [ ] P3.5 Live: Absent → Install → Managed with a gate-ON workspace updating live; then remove the sandbox (6.6)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 3 > P3.1
- **Active scope:** P3.1 (the `remoteInstall` state module + the Absent-entry affordance)
- **Blocked:** none
- **Unvisited:** none (Phase 3 is the last)
- **Open discoveries:** none

## Verification hygiene (from memory; read before any live step)
- `remote-verify-hygiene`:
  - real commands only under the sandbox root or the scratch folder;
  - check for open remote workspaces before stopping the app;
  - add the scratch row with integer timestamps, with the app stopped;
  - `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs empty dir>` is set on the dev app's launch env.
- The live account's `~/.claude` is off-limits (§R.8). Never shasum the whole live `~/.claude` (tank writes there continuously, "Probe outcomes" (3)).
- Bridge scripts: fire-and-forget, read results back from `window` (`mcp-bridge-execute-js-timeout-keeps-running`).
- Never kill an `ssh -M` you didn't start. The installed Claudesk.app's master serves tank.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [2026-11-20] P2.2 (fixed in build, no backlog entry) — the run script's first draft negated `DEV_TOOLS_GUARD` bare (`if ! d=$(…) && … ; then`), which negates only the first command of the `&&` chain: a no-tools host sailed past the refusal into `git`. Caught by the stub-`xcode-select` arm; fixed as `if ! { GUARD; }; then`, pinned by a builder assertion, and the warning now sits on the constant's doc.
- [SHORTCUT-2026-11-20] P2.verify-self findings 1+2 — fixed in place (a one-pass template `fill` replacing the `str::replace` chain; the lock guard's two remote entries + whole-body slicing), each mutation-proven; re-verified by a FRESH runner subagent (8 hostile roots + a hostile URL against `fill`, positive control with the old chain; every table entry's body end named) → both PASS. Then the live checks ran on a clean relaunch.
- [SURFACED-2026-11-20] feature-plan — wbs.md exceeds size guard (360 lines); read the first 44 lines + headings, plus the WP3–WP8, dependency-map, exit-criteria and "Probe outcomes" sections in full (WP6's own inputs). Consider summarizing the shipped WPs at WP6 finalize.
