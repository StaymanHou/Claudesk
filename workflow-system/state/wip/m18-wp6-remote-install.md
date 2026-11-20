---
drive_mode: autopilot
---

# Feature: M18 WP6 — Install over the master

**Workflow:** feature
**State:** plan (complete)
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

- [ ] Phase 1: Carry-ins — pay down the review findings due before WP6  <!-- status: NOT-STARTED -->
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
  - [ ] P1.1 `settle_refresh`: skip the cache write when the read is `Unknown`. Fix its doc; add the settle test + mutation proof (`SURFACE-2026-11-20-QUALITY-SETTINGS-REFRESH-WRITES-UNKNOWN-OVER-A-KNOWN-HOST`)  <!-- status: NOT-STARTED -->
  - [ ] P1.2 Rename `Drift::Behind` → `Differs`, wire tag included (Rust, TS, tests). The copy stays (`SURFACE-2026-11-20-QUALITY-DRIFT-BEHIND-VARIANT-MEANS-DIFFERS`)  <!-- status: NOT-STARTED -->
  - [ ] P1.3 `token_fix` names the resolved claude path (`SURFACE-2026-11-18-QUALITY-TOKEN-FIX-HINT-ASSUMES-CLAUDE-ON-NONLOGIN-PATH`)  <!-- status: NOT-STARTED -->
  - [ ] P1.4 Remote Recycle refreshes the bypass answer before deciding, plus the "has not been accepted" copy (`SURFACE-2026-11-18-QUALITY-REMOTE-BYPASS-ANSWER-STALE-ACROSS-RECYCLE`, `…-RECYCLE-BYPASS-REASON-OVERCLAIMS`)  <!-- status: NOT-STARTED -->
  - [ ] P1.5 `security-posture.md` → "Terminal clipboard": record the displayed-bytes vector as an accepted risk (`SURFACE-2026-11-18-QUALITY-OSC52-PASTEJACK-VECTOR-UNRECORDED`)  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: The remote install run (backend: script, transport, cancel, reducer)  <!-- status: NOT-STARTED; depends on Phase 1 -->
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
  - [ ] P2.1 `run_streaming` → `pub(crate)` + abort predicate (D10); local callers pass never  <!-- status: NOT-STARTED -->
  - [ ] P2.2 `remote_runner.rs`: pure script builder (preflight → host re-probe/refuse → guarded stale-clone removal → `phase:clone` + clone → `phase:install` + trapped subshell { `install.sh` with `HOME=<root>` → record tmp + `mv` } → log `cat` → `result:`), the record JSON from Rust, and the sentinel parser (6.2)  <!-- status: NOT-STARTED -->
  - [ ] P2.3 The remote reducer, pure: (outcome lines, exit, cancel-requested, re-probe read) → `RemoteInstallFinished`. Per-arm decisions, no shared default, no gate field (6.3)  <!-- status: NOT-STARTED -->
  - [ ] P2.4 Transport + commands: `master_only_exec_argv` + `login_shell(script)` as the program; `LinkRegistry::hold_if_up` (D8); `begin_remote_install` + `workflow_remote_install_start(host)` on a worker under `HeldRunLock` + `RunGuard` with the D7 events; post-run re-probe through `set_substrate` (known answers only) (6.1, 6.3)  <!-- status: NOT-STARTED -->
  - [ ] P2.5 Cancel per ruling A: `workflow_remote_install_cancel` → ignored after `phase:install` (it answers "too late: the install is finishing"); a pending cancel before the pgid arrives fires once it arrives; the remote `kill -TERM -- -<pgid>` over `master_exec` (2 s) + the local abort (6.3b)  <!-- status: NOT-STARTED -->
  - [ ] P2.6 Tests: the builder, the preflight's three stub arms, the local end-to-end arms, 6.3b, 6.4 containment, the delete-guard entry + its mutation proof  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

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
- **Path:** Feature > Phase 1 > P1.1
- **Active scope:** P1.1 (first task)
- **Blocked:** none
- **Unvisited:** Phase 2, Phase 3
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
- [SURFACED-2026-11-20] feature-plan — wbs.md exceeds size guard (360 lines); read the first 44 lines + headings, plus the WP3–WP8, dependency-map, exit-criteria and "Probe outcomes" sections in full (WP6's own inputs). Consider summarizing the shipped WPs at WP6 finalize.
