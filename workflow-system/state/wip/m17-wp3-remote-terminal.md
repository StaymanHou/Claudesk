---
drive_mode: autopilot
---

# Feature: M17 WP3 — the host link and the remote terminal

**Workflow:** feature
**State:** verify-codify (all phases complete)
**Created:** 2026-11-16

## Problem Statement

A remote picker row (WP2) is saved but opening it is a stub. WP3 makes it open a working CC pane on
the mini, running inside `tmux -L claudesk[-dev]` and reached over one ssh ControlMaster per host,
and makes that pane survive a dropped link by reattaching to the same session. Before any of that
reads rows from disk into an ssh argv, the inputs get hardened: the store enforces what only the
preflight checked (the WP2 review's MAJOR), the remote path gets one canonical form, and the
hardened subprocess runner stops borrowing the adjudicator's types. Inputs:
`workflow-system/product/wbs.md` → WP3 (tasks 3.1–3.7), `arch/remote-workspaces.md` §B, §C, §C.1,
§E, and the WP2 inheritance list. No new 3rd-party dependency: ssh, tmux and CC on the mini were
probed in WP1 (`fd4423b`) and research.

**Decisions taken at plan time (disclosed, flag if wrong):**
- **arch §C (a)/(b) → (b), a deployed launcher** `~/.claudesk/<identifier>/cc-launch`. It does the
  token export, `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` and `unset TMUX`, then `exec claude "$@"`.
  It is written on every link connect, next to `tmux.conf`. The spawn string then contains **no
  expansion at all**: every element is a constant or goes through `quote`, and the remote paths
  are absolute (from the link's `$HOME`), so there's no `~` either. "The token is never in the
  command string" becomes a plain `!contains` test. This was WP2's recommendation.
- **The `SURFACE-…-REMOTE-OPEN-MUST-CHECK-THE-FOLDER-STILL-EXISTS` check lands in Phase 3, not
  Phase 1.** It is part of the open path, and Phase 3 is the first phase with one. That still meets
  the handoff's constraint ("before 3.2 reads rows from disk"), because 3.2 is Phase 3 too.
- **The folder check runs in the PICKER, before the workspace opens** (`remote_open_check`: link up
  plus `test -d`). A failure becomes a toast on the row that offers Remove, and nothing gets mounted.
  `cc_spawn_remote` doesn't repeat the check. A folder deleted in the half-second between the two
  calls shows tmux's own error in the pane, which is acceptable.
- **Remote open = a new async command `cc_spawn_remote`.** `cc_spawn` stays sync and byte-identical
  for local. The frontend picks between them by `project.remote` via `takeSpawnArgs`, the one
  site that already chooses spawn args.
- **The cancel-before-inject funnel is backend-side: a new async `cc_inject`.** The frontend's
  `injectCommand` (already the single funnel for skill buttons, Prompt, auto-resume and Recycle)
  switches from `cc_input` to `cc_inject`. For a **local** session it writes the same bytes and
  records the same telemetry as `cc_input`. For a **remote** one it first runs the conditional
  cancel over the master, then waits for CC-readiness. The operator's own keystrokes stay on
  `cc_input` and never cancel (WP1 ruling: typing while scrolled up goes to copy-mode).
- **`--continue` is NOT offered on a remote spawn in WP3.** The transcript guard reads LOCAL
  transcripts. For a remote target it returns `false` explicitly (with a pointer to WP5 5.2)
  rather than by accident of the `ssh://` slug. WP5 5.2 adds the remote check.
- **Drive mode is passed through** in WP3. The resolved `CLAUDESK_DRIVE_MODE` value goes into the
  inner command as `env CLAUDESK_DRIVE_MODE=<quoted>`, so a remote session doesn't silently ignore
  it. WP4 4.5 still owns proving that the `UserPromptSubmit` line appears, which needs the remote hook.
- **The right half of a remote workspace stays broken until WP6.** Editor, diff, file tree,
  second terminal and the other panels will get errors on an `ssh://` path. WP3 only ensures the app
  stays up and the terminal works; WP6 makes those surfaces absent. WP6 can run straight after WP3.

Problem statement unchanged (2026-11-16, Phase 2 F9b) — the four verify-self findings (an `ensure()` race, two mutants no unit test catches, no `Drop` on the registry) are defects inside P2.1–P2.3's own scope; the goal and design are the same.

Problem statement unchanged (2026-11-16, F12 re-entry, P4.verify-human.2) — the root problem (remote pane opens, survives, and takes injections safely) holds; verify-human only added that a refused injection must be VISIBLE: the operator chose A, a plain-words toast instead of `console.warn` alone.

Problem statement unchanged (2026-11-16, F9b re-entry, P4.6) — verify-self found recycle's two injections still failed silently; same problem (a refused injection must be visible), one more caller.

Problem statement unchanged (2026-11-16, F9b re-entry, P5.5) — reattach-as-the-same-session holds; verify-self found it reattached OUTSIDE the link (ssh's silent direct-connection fallback on a stale master socket), which the design forbids: one master per host carries every terminal.

## Work Tree

- [x] Phase 1: Harden the inputs (store validation, one path form, a neutral runner)
  **Observable outcomes:**
  - CLI: `cargo test --lib config_store` passes, including new tests. `add_remote` refuses a host
    that fails `validate_host` (`-oProxyCommand=x`, `a b`) and a path that is not already in
    normalized form (`/a//b`, `/a/./b`, `/a/../b`, `/a/b/`). A refusal is a typed
    `ConfigError::Invalid` and writes nothing (`projects.json` shasum unchanged inside the test).
  - CLI: `cargo test --lib remote_cmd` passes. `normalize_remote_path` maps `/a//b` → `/a/b`,
    `/a/./b/` → `/a/b`, `~/x//y` → `<home>/x/y`, and refuses any `..` segment with a plain-words
    error. The existing hostile-input round-trips stay green.
  - CLI (state-changing, dev `projects.json` only, backed up to the scratchpad first and restored
    after): with a hand-edited remote row whose host is `-oProxyCommand=touch /tmp/x` added beside the
    existing rows, a `pnpm tauri:dev` launch lists every OTHER row (MCP bridge `invoke list_projects`
    returns them). The bad row is still in the file afterwards (row-set comparison, not shasum: memory
    `projects-json-resorted-on-every-launch`), and `/tmp/x` doesn't exist.
  - CLI: `grep -rn "adjudicator::run_command\|AdjudicateError" src-tauri/src/remote_cmd` → no
    matches. The adjudicator's user-facing strings are unchanged (`cargo test --lib adjudicator`
    green, including the "timed out" wording test).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - (decision) A remote row that fails validation on READ (hand-edited `projects.json`): the agent
    keeps it in the list and refuses to open it ("this remote row is invalid: <reason>; remove it and
    add it again"), rather than hiding it. Hiding it would make a typo invisible. Still what you want?
  - [x] P1.1 Move `adjudicator::run_command` and its error type into `subprocess` under a neutral
    name (`subprocess::run_captured` → `RunError`). `adjudicator` maps `RunError` → its own
    `AdjudicateError`, so its `Display` strings, including the load-bearing "timed out", stay
    byte-identical. `remote_cmd::preflight` switches to `RunError`. This resolves
    `SURFACE-2026-11-16-QUALITY-M17WP2-SSH-RUNNER-BORROWS-ADJUDICATOR-TYPES`.  <!-- status: done -->
  - [x] P1.2 `normalize_remote_path`: collapse `//` and `.` lexically and refuse `..` (resolving it
    lexically would be wrong across a remote symlink; refusing is honest). Add hostile-input and
    idempotence tests: `normalize(normalize(p)) == normalize(p)`. This resolves
    `…-REMOTE-PATH-NOT-FULLY-NORMALIZED`.  <!-- status: done -->
  - [x] P1.3 `check_remote_invariants` enforces `validate_host(host) == host`, and also
    `normalize_remote_path(path) == path` (a fixed point, so `/r/` and `/r` can't both exist), alongside
    the existing key and profile checks. Add mutation-proven tests: delete each new check and its
    test goes red. This resolves the MAJOR `…-STORE-DOES-NOT-ENFORCE-HOST-AND-PATH-VALIDATION`.  <!-- status: done -->
  - [x] P1.4 One validated accessor for the spawn side: `RemoteTarget::validated(&self) ->
    Result<ValidTarget, String>`, which re-runs both checks on a row read from disk. WP3's spawn and
    link code accept only `ValidTarget`, so a type error stops a raw stored string from reaching
    ssh. The picker's open path maps `Err` to the refusal text in the alignment question.
    **As built:** `remote_cmd::ValidTarget` (private fields, `new` the only constructor) +
    `RemoteTarget::validated()`. The picker mapping lands with P3.3 (`remote_open_check` →
    `Invalid(reason)`), the first phase with an open path; until then the WP2 stub refuses every
    remote row anyway.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (63 s): lint 0 errors (1 pre-existing warning, `XtermPane.tsx:948`, untouched), vitest 3866/3866, `cargo test` lib 1150 passed / 1 ignored, clippy `--all-targets -D warnings` clean. First run EXIT=101: clippy dead_code on `ValidTarget::host`/`path` (no non-test caller until Phase 2); fixed with a scoped, commented `#[allow(dead_code)]` marked for deletion in Phase 2.
    — evidence: `grep -rn "adjudicator::run_command\|AdjudicateError" src-tauri/src/remote_cmd` → exit 1 (no matches).
    — evidence: moved-runner test count: HEAD `adjudicator` 24 tests → `adjudicator` + `subprocess::captured` 25 (24 moved/kept + 1 new mapping test).
    — evidence (mutation): deleting `target.validated().map_err(ConfigError::Invalid)?;` from `check_remote_invariants` → 3 tests FAILED (`add_remote_refuses_an_unsafe_host_or_a_path_not_in_normal_form`, `add_remote_rejects_a_relative_path_and_an_empty_host`, `the_remote_invariants_check_the_host_and_path_of_a_stored_row`); file restored, shasum matched.
    — evidence (after P4.6, run 1): `pnpm verify:auto` → EXIT=1 (28s): 1 failed / 3887 passed — `singleAuthority.test.ts` › "absent: the Recycle modules carry no WIP or review labels": `recycleSession.ts` carries 5× `P4.6` (my P4.6 comments). Comment-only code defect → F9 to build.
    — fix (build, F9): the 5 `P4.6` labels in `recycleSession.ts` comments reworded to `M17 WP3` (comment-only; the module's single-authority rule forbids WIP labels); `singleAuthority` + `recycleSession` → 90 passed.
    — evidence (after P4.6 + label fix, run 2): `pnpm verify:auto` → EXIT=0 (45s): vitest `Test Files 304 passed (304)`, `Tests 3888 passed (3888)`; cargo lib `1187 passed; 0 failed; 4 ignored`; clippy/fmt clean; lint 1 pre-existing warning (`XtermPane.tsx:953`).
  - [x] verify-self  <!-- status: done -->
    - [x] O1 store refusals: PASS — evidence: runner `cargo test --lib config_store` → 154 passed; `add_remote_refuses_an_unsafe_host_or_a_path_not_in_normal_form` covers `-oProxyCommand=touch /tmp/x`, `a b`, `/r/`, `/a//b`, `/a/./b`, `/a/../b`, each a separate TempDir asserting `Invalid` + no `projects.json`. Host-only mutant (drop the `validate_host` match in `ValidTarget::new`) → 5 tests FAILED; restored, shasum matched.
    - [x] O2 normalization: PASS — evidence: `cargo test --lib remote_cmd` → 25 passed, 1 ignored (live); `..` error text: `the path cannot contain ".."; type the folder's real path, got …`; hostile round-trips green.
    - [x] O3 dev launch with a hostile hand-edited row: PASS (orchestrator, MCP bridge) — evidence: appended row `{host: "-oProxyCommand=touch /tmp/x", path: "/r"}` to the dev `projects.json` (backup `dev-projects.p1.bak` in the scratchpad); `pnpm tauri:dev` → `invoke("list_projects")` returned 9 rows incl. `hostile-wp3` and the existing remote row; picker DOM `[data-remote="true"]` = 2, picker screenshot renders normally; after launch the file's row set ⊇ the 8 backup rows + the hostile key; `/tmp/x` absent before, during and after. Dev app stopped by PID; `projects.json` restored, shasum = backup.
    - [x] O4 runner untangled: PASS — evidence: `grep -rn "adjudicator::run_command\|AdjudicateError" src-tauri/src/remote_cmd` → exit 1; `AdjudicateError` enum + `Display` diffed against HEAD → identical; `cargo test --lib adjudicator` → 7 passed incl. the "timed out" wording test.
    - [x] O5 `pnpm verify:auto`: PASS — evidence: verify-auto's run EXIT=0; no file changed since (runner shasum-checked every module).
    - [x] align: (decision) keep-and-refuse an invalid stored remote row — evidence: `a_stored_row_with_a_bad_target_still_reads_so_the_list_survives` passes (list reads both rows; `validated()` is Err); the live dev launch above listed the hostile row in the picker. Refusal text for that host: `the host "-oProxyCommand=x" is invalid: a host cannot start with "-"`. ⚠️ Until P3.3 the WP2 stub still answers a click on ANY remote row with "can't be opened yet", so the refusal text is shown to the operator only from Phase 3.
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1: (decision) an invalid stored remote row is KEPT in the list and refused at open, not hidden — operator: **A** (keep + refuse), 2026-11-16  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 63 s, < 300 s; no CLAUDE.md declaration)
    — evidence: new `an_invalid_remote_row_survives_the_picker_mount_prune_so_it_stays_visible` + `an_invalid_remote_row_can_still_be_removed` (`config_store`, the functions `prune_missing_projects` / `list_projects` / `remove_project` wrap) pin decision A. Mutation-proven individually: prune partition keyed on `validated().is_ok()` → the prune test FAILED; `remove` skipping rows that fail the invariants → the remove test FAILED; file restored, shasum matched. Other Phase 1 behaviours were already codified at build (TDD) and mutation-proven at verify-auto/verify-self.
    — evidence: `pnpm verify:auto` → EXIT=0 (59 s): vitest 3866/3866, cargo lib 1152 passed / 1 ignored, clippy clean.

- [x] Phase 2: The host link (one ControlMaster per host, deploy on connect)
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — WP3 is the critical path to the tank checkpoint (2026-12-11).
  - Requirements unchanged: yes — arch §B unchanged; Phase 1 added only `ValidTarget` as the link's input type.
  - Solution still feasible: yes — ControlMaster + `-R` + pre-connect `rm -f` were live-probed in research/WP1.
  - No superior alternative discovered: yes — none surfaced in Phase 1.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --lib remote_link` passes. That includes `control_path_fits_sun_path`:
    `<app_data>/ssh/<8-hex>` ≤ 104 bytes for both identifiers, using a 32-char username as the bound.
    It also includes a pin of the master argv (`-M -N -o ControlPersist=no -o BatchMode=yes -o ConnectTimeout=10 -o
    ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -S <ctl> -R
    <abs remote sock>:<local hook sock> -- <host>`), and a pin that the pre-connect script contains
    `rm -f` of the remote socket.
  - CLI (live, the mini; host from `tmp/m17-remote-host.local`): an `#[ignore]`d live test
    `live_link_up` brings the link Up, then `ssh -O check -S <ctl> <host>` exits 0. On the remote,
    `~/.claudesk/com.claudesk.app.dev/` holds `tmux.conf` (exactly the three ratified lines) and
    `cc-launch` (mode 0700, contains `exec claude "$@"`), and `test -S <dir>/hook.sock` succeeds.
  - CLI (live, state-changing: kills a process this test started): SIGKILL the master's local pid
    → a `Lost` state is observed → `Up` again within the backoff ceiling. The pre-connect `rm -f`
    ran: with no `StreamLocalBindUnlink`, the forward still binds (`ExitOnForwardFailure` would
    otherwise fail the reconnect).
  - Browser (MCP bridge, dev app): invoking the async `remote_link_ensure` for the mini's host
    returns `Up`, and a `remote-link` event with `{host, state: "up"}` is captured
    (`ipc_monitor`). The UI stays responsive throughout, checked with a `webview_execute_js` round-trip
    under 200 ms while it connects.
  - Browser + CLI (consuming surface `quit_now`, added at verify-self 2026-11-16 — Phase 2 edits
    `perform_quit_teardown`): with a link Up in the dev app, quitting through `quit_now` leaves no
    `ssh -M` process for that ControlPath (`pgrep -f <ctl path>` empty) and `ssh -O check` fails.
  - CLI: `cargo test --test sync_commands_do_not_block` passes. The new async command(s) are in
    `ASYNC_COMMANDS` with reasons, and no sync `#[command]` reaches `remote_link`'s ssh I/O.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:** none (no operator-visible surface yet; the link becomes visible in Phase 3).
  - [x] P2.1 `remote_link` module: a `LinkRegistry` keyed by `ValidTarget.host`. Each link is a worker
    thread running the master, with states `Connecting → Up → Lost(retrying) → Up …` or `Down`, and
    capped exponential backoff (1 s → 30 s). It broadcasts `remote-link {host, state}` on every
    transition. ControlPath `<app_data>/ssh/<first 8 hex of sha256(host)>`. The local end of `-R` is
    the running app's hook socket (it has a `/`).  <!-- status: done -->
  - [x] P2.2 The pre-connect step, a one-shot `BatchMode` exec through `subprocess::run_captured`
    that runs before every master connect: `mkdir -p` the state dir, `rm -f` the remote socket,
    write `tmux.conf` and `cc-launch` (constant contents via a quoted heredoc, `chmod 700` the
    launcher), and print `$HOME` behind a sentinel line. The sentinel also fixes
    `…-PRINT-HOME-INTOLERANT-OF-RC-NOISE` for this exec. The remote dir is
    `~/.claudesk/<identifier>/`, and the identifier comes from the same source as
    `hook_install::commands::script_basename`.  <!-- status: done -->
  - [x] P2.3 Async `remote_link_ensure(host)`: start the link if absent and wait until Up or a
    bounded timeout (15 s). Errors are in plain words, including "could not resolve hostname: is
    Tailscale running?". Links are ref-counted by open remote sessions, a link goes `Down` when its
    count reaches 0, and every master is stopped (`ssh -O exit`, then a group kill) on app quit,
    next to `kill_all`.  <!-- status: done -->
  - [x] P2.4 `remote_link::exec(host, script)`: a side-channel exec over the master
    (`ssh -S <ctl> -- <host> <login_shell(script)>`, the same hardened runner, with a short timeout).
    Phase 3's `test -d`, cap count and cancel all use it.  <!-- status: done -->
  **As built (Phase 2):** `src-tauri/src/remote_link/{mod,commands,tests}.rs`. `LinkRegistry` (managed as
  `SharedLinks`, built in `.setup()` after the hook socket) + one worker thread per host behind an
  injectable `Transport` (`SshTransport` real; a fake in tests). Pre-connect reuses WP2's one-shot
  `SshExec` + `connect_failure` (now `pub(crate)`); output read via a `CLAUDESK-REMOTE-HOME:` sentinel.
  ⚠️ `stop()` does NOT join the worker (a pre-connect can take 30 s; a join at quit would hang the
  teardown): it kills the master's process group by the pid the worker publishes, and the worker
  re-checks the stop flag before spawning. The ControlPath is removed before each connect (a
  SIGKILLed master leaves it behind), never at worker exit (a new link may own it). `stop_all()` runs
  in `perform_quit_teardown` after `kill_all`. `sha2 = "0.10"` pinned (already in the lock).
  `remote_link_ensure(project_path)` resolves the row through `commands::target_for` →
  `RemoteTarget::validated()` (decision A's refusal text). Temporary `#[allow(dead_code)]` on
  `exec`, `EXEC_TIMEOUT_MS`, `acquire`, `release`, `state`, `ValidTarget::path` (first callers in
  Phase 3; delete then). Build-time live run (`live_link_up`, the mini): Up in 0.59 s; tmux.conf +
  cc-launch (0700) read back; a byte crossed the `-R` forward; SIGKILLed master → Lost → Up in
  1.66 s; release → Down. A signal-killed master's empty stderr now reads "the link to <host>
  dropped".
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (57 s): lint 0 errors (the 1 pre-existing `XtermPane.tsx:948` warning), vitest 3866/3866, cargo lib 1170 passed / 2 ignored (the two live tests), integration tests incl. `sync_commands_do_not_block` green with `remote_link_ensure` in `ASYNC_COMMANDS`, clippy `--all-targets -D warnings` clean (after the temporary allows listed under P2.4).
    — evidence: `cargo test --lib -- remote_link` → 18 passed, 1 ignored (`live_link_up`, run once at build: PASS).
    — evidence (after F9b): first `pnpm verify:auto` EXIT=101 — `sync_commands_do_not_block::no_sync_tauri_command_reaches_a_blocking_call` flagged 9 sync commands via `drop → LinkRegistry::drop → stop_all → halt → kill_group → kill → PtyCcSession::kill → sleep` (the guard resolves by name; `libc::kill` collided). Fixed by `subprocess::kill_group` calling `libc::killpg(pgid, …)` (same syscall, no colliding name; commented). Re-run → EXIT=0 (54 s): vitest 3866/3866, cargo lib 1174 passed / 2 ignored, guard 16/16, clippy clean.
  - [x] verify-self  <!-- status: done (re-run after F9b) -->
    - [x] O1 unit pins: PASS — evidence: runner `cargo test --lib remote_link` → 18 passed, 1 ignored; `control_path_fits_sun_path` (32-char user, both ids, ≤ 103), `the_master_argv_is_pinned` (exact; outcome text now lists `ConnectTimeout=10` too), `rm -f` pin + real sh/zsh run.
    - [x] O2 live link: PASS — evidence: `live_link_up` → Up in 643 ms; tmux.conf = the 3 lines, cc-launch = `cc_launcher()` (0700), `test -S` ok, a byte crossed `-R`. Independent ssh read: `-rwx------ cc-launch`, `srw------- hook.sock`, `-rw------- tmux.conf`.
    - [x] O3 drop → reconnect: PASS — evidence: SIGKILL master → `Lost { "the link to <mini-host> dropped" }` → Connecting → Up in 2.27 s; `test -S` after → ok (forward rebound). No `ssh -M` left (`pgrep` → 0).
    - [x] O4 MCP `remote_link_ensure`: PASS (orchestrator, re-run) — evidence: dev app, a `remote-link` listener attached via `plugin:event|listen`; `invoke("remote_link_ensure", {projectPath: <the mini row's key>})` → `{state: "up"}` in 627 ms; events `connecting`, `up`; a 50 ms event-loop probe during the connect saw a worst delay of 8 ms (UI responsive); `ssh -S <app_data>/ssh/0430d011 -O check` → "Master running".
    - [x] O5 sync guard: PASS — evidence: `cargo test --test sync_commands_do_not_block` → 16 passed; the only command is `pub async fn remote_link_ensure`, listed in `ASYNC_COMMANDS`.
    - [x] O6 `quit_now` (consuming surface): PASS (orchestrator) — evidence: with that link Up (master pid recorded), `invoke("quit_now")` → the app exited; the master pid is gone, `pgrep -f 'ssh -M'` → 0, `ssh -O check` on its ControlPath → exit 255. (No quit-path positive control was run; the kill itself is pinned by `stop_kills_the_master_process_even_while_the_worker_is_busy`.)
    - [x] P2.verify-self.F1 `ensure()` misses a first failure that lands before it reads its baseline (`failures_at_start` is read AFTER the worker starts): it then waits through the next attempt (a test flake 1/~16: `a_failed_first_attempt_returns_its_reason_and_stops_an_unheld_link`). Fix: `get_or_start` returns the baseline under the registry lock (0 for a new link).  — fixed: `get_or_start` returns the failure baseline read under the registry lock (0 for a new link); test `ensure_never_misses_a_first_attempt_that_fails_instantly` (100 rounds) — mutant (baseline read after start) → that test FAILED.  <!-- status: done -->
    - [x] P2.verify-self.F2 Mutation B (no `kill_group` in `halt()`) survives every test, yet it is what kills a master at QUIT, where the process exits before the worker wakes. Needs a test with a real-pid master and a busy worker.  — fixed (code was right; now pinned): test `stop_kills_the_master_process_even_while_the_worker_is_busy` (real `sleep 30` master, worker inside a 3 s `check`) — mutant (no `kill_group` in `halt`) → that test FAILED.  <!-- status: done -->
    - [x] P2.verify-self.F3 Mutation A (no stale-ControlPath `remove_file` before connect) is caught only by the live test. Needs a unit test (fake transport checks the ctl path is absent at spawn).  — fixed (code was right; now pinned): test `a_stale_control_path_is_removed_before_every_master_spawn` — mutant (no ctl `remove_file`) → that test FAILED.  <!-- status: done -->
    - [x] P2.verify-self.F4 A panicking test leaks a live `ssh -M`: `LinkRegistry` has no `Drop`. Add `Drop` → `stop_all()`.  — fixed: `impl Drop for LinkRegistry` → `stop_all()`; test `dropping_the_registry_stops_its_links` — mutant (no Drop) → that test FAILED.  <!-- status: done -->
    - [x] Re-run (fresh runner, after F9b): O1 10/10 module runs (22 passed); O2/O3 `live_link_up` PASS (Up 636 ms, reconnect 1.66 s, `pgrep ssh -M` → 0); O5 guard 16/16. Mutants F2/F3/F4 each caught by exactly their test. `killpg(pgid)` ≡ `kill(-pgid)` for pgid > 1 per `man 2 kill`.
    - [x] F1's regression test was WEAK (caught the late-baseline mutant ~6/23) → fixed in place via the shortcut (see Discoveries): `#[cfg(test)] pause_after_start` seam in `ensure`; fresh runner: mutant FAILED 10/10, restored 5/5 PASS, seam test-only (non-test build: 0 warnings).
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11)
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 63 s, < 300 s; no CLAUDE.md declaration)
    — evidence: new `src-tauri/tests/quit_teardown_stops_remote_links.rs` (consuming surface `quit_now` → `perform_quit_teardown`): `syn` reads the call order, asserts `kill_all` then `stop_all`; a self-test proves the predicate rejects missing / reordered / string-only. Mutation-proven: `stop_all` commented out → FAILED; `stop_all` moved before `kill_all` → FAILED; `lib.rs` restored (shasum matched). The link's own behaviours were codified during build/F9b (22 unit tests, each fix mutant-proven; `live_link_up` ignored). Not codified: the `remote-link` event emission in `commands::init` (AppHandle-bound; verified live in O4; WP4's overlay is its first consumer).
    — evidence: `pnpm verify:auto` → EXIT=0 (56 s): vitest 3866/3866, cargo lib 1174 passed / 2 ignored, new guard 2/2, clippy clean.

- [x] Phase 3: The remote terminal (open, spawn, close, cap, folder check)
  **Relevance check (before Phase 3):**
  - Requester still needs this: yes — the remote terminal is WP3's core deliverable.
  - Requirements unchanged: yes — arch §C/§E unchanged; Phase 2 delivered the link as planned (plus `Drop`, `killpg`).
  - Solution still feasible: yes — the link, launcher and conf are live on the mini; `new -A` + launcher were probed in WP1.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test --lib cc_session` passes. The existing local env-composition and argv tests are
    unchanged and green (local spawn is byte-identical). A new pin covers the exact remote argv:
    `/usr/bin/ssh -S <ctl> -tt -- <host> zsh -lc '<…> exec tmux -L claudesk-dev -f <abs conf> new -A
    -s cd-<8hex> -c <quoted path> "<quoted: env CLAUDESK_DRIVE_MODE=… <abs cc-launch> <argv…>>"'`.
  - CLI: hostile-input tests on the remote spawn string pass. A path or drive mode drawn from
    `remote_cmd`'s `HOSTILE` set round-trips through every layer as data (the canary file is never
    created). `!command.contains("cc-oauth-token")`, `!contains("$(")` and `!contains("~")`.
  - Browser (MCP bridge, dev app, the mini): clicking the remote row opens a workspace. Within 10 s
    a screenshot of the left pane shows CC's prompt. On the mini, `tmux -L claudesk-dev ls` lists
    exactly one `cd-<8hex>` session, and `ps -o command` for the remote `claude` shows the yolo argv.
  - CLI (live, the mini): inside that pane, the remote env has `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`,
    no `TMUX`, and `CLAUDE_CODE_OAUTH_TOKEN` set, and `claude auth status` there reports
    `loggedIn: true`. Read with `tmux show-environment` / `ps eww <pid>` on the mini, printing only
    each variable's presence and never the token value.
  - Browser + CLI (live, state-changing: closes the workspace): scroll the remote pane up so tmux
    enters copy-mode (`#{pane_in_mode}` = 1, read over ssh), then close the workspace (×). Within 10 s
    `tmux -L claudesk-dev has-session -t cd-<8hex>` exits 1 and no `claude` process remains for that
    session. **This is the high-priority `SURFACE-2026-11-14-REMOTE-CLOSE-SWALLOWED-IN-COPY-MODE` test.**
  - Browser + CLI (live, state-changing on the mini: `mkdir` + `rmdir` of a scratch folder under
    `~/claudesk-wp3-scratch/`): add a row for the scratch folder, `rmdir` it on the mini, click the
    row. The result is a toast reading "<path> no longer exists on <host>" with a Remove action, no
    workspace mounts, and the row is still listed afterwards.
  - CLI: a unit test drives the session cap. With 8 live remote sessions on a host,
    `cc_spawn_remote` for a ninth returns the plain-words refusal and opens no PTY. A 9-workspace live
    run isn't required: the cap check is a pure function of the count, and its caller is pinned by a
    test that goes red if the call is removed.
  - Console: no uncaught JS error from mounting the remote workspace (a `window` `error` tap installed
    before the click reads empty). Errors from the right-panel OUT surfaces are allowed until WP6, as
    long as they're caught.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Open the remote row from the picker and use the pane as you would a local one: is this the
    remote CC you expect (inline TUI, colours, the scroll-up-then-`q` copy-mode behaviour you ratified
    at WP1)?
  - The launcher (option (b)) in action: `~/.claudesk/com.claudesk.app.dev/cc-launch` now exists on the
    mini and is rewritten on every connect. Now that you see it there, still what you want?
  - (decision) The missing-folder toast offers Remove but never removes on its own. The agent
    keeps an unreachable host and a missing folder distinct. Agreed?
  - [x] P3.1 `SpawnTarget::{Local { cwd }, Remote(ValidTarget)}` in `SessionRegistry::spawn`. The local
    arm is the current code path unchanged. The remote arm builds the argv via `remote_cmd`
    (`tmux_new_command`, the only builder, with no `format!` outside `quote` for variable data),
    rejects a non-default profile, returns `false` from the transcript guard explicitly (WP5 5.2
    note), and keeps the same unclean-flag ordering (it is path-keyed and works on the `ssh://` key).  <!-- status: done -->
  - [x] P3.2 Async `cc_spawn_remote(project_path, intent)`: read the row, call `validated()`, then
    `remote_link_ensure`, then the cap check (count this host's live sessions; refuse a ninth), then
    `registry.spawn(Remote)`. The PTY spawn itself is non-blocking. Add it to `ASYNC_COMMANDS` with a
    reason.  <!-- status: done -->
  - [x] P3.3 Async `remote_open_check(project_path)` for the picker: `validated()`, then
    `remote_link_ensure`, then `test -d <quoted path>` via `remote_link::exec`. It returns a typed
    result: `Ok`, `FolderMissing`, `Unreachable(reason)` or `Invalid(reason)`. The picker replaces
    `remoteOpenRefusal` with this check. It shows a "Connecting…" state on the row, then either
    opens the workspace or toasts. The `FolderMissing` toast carries a Remove action that reuses the
    existing remove path.  <!-- status: done -->
  - [x] P3.4 The frontend spawn routing: `takeSpawnArgs` / `XtermPane` select `cc_spawn_remote` when
    the workspace's project has `remote`, with the same intent handling. A guard test fails if a
    remote workspace's pane can reach `cc_spawn`.  <!-- status: done -->
  - [x] P3.5 The remote close: the remote session's `kill()` runs the conditional cancel first,
    `tmux -L <srv> if -F -t <name> '#{pane_in_mode}' 'send -X cancel'`, over `remote_link::exec`. A
    failed cancel (link down) is logged and the close continues: R-4's end-intent is WP5's. Then the
    existing `/exit\r` and group teardown run. The exit-poll window is measured live and widened
    for remote only if `/exit` → ssh exit takes longer than the local window. `kill_all` (quit)
    inherits all of this. The link ref-count drops after the reap.  <!-- status: done -->
  **As built (Phase 3):**
  - `SpawnTarget::{Local, Remote(RemoteSpawn)}` is threaded through the SAME `SessionRegistry::spawn`
    body (every existing caller guard still applies) and the same `PtyCcSession::spawn(` call, which
    branches inside: Local = the unchanged argv; Remote = `remote_terminal_argv` (pure, pinned) →
    `ssh -S <ctl> -o ControlMaster=no -o BatchMode=yes -tt -- <host> 'zsh -lc …exec tmux -L … new -A
    -s cd-<hash8(key)> -c <path> "exec env CLAUDESK_DRIVE_MODE=<m> <launcher> <args>"'`; the drive mode
    rides the command line and is dropped from the local ssh env. `admit_remote` (cap 8 per host)
    runs FIRST in `spawn`; the transcript guard returns `false` for a remote session explicitly.
  - `PtyCcSession` gained `remote_exit: Option<RemoteExit>` (`kill()` calls
    `RemoteExit::cancel_before_exit` right before it types `/exit` → `LinkRegistry::cancel_copy_mode`,
    tolerant `send-keys -X cancel … ; exit 0`; a struct called from `kill()`, NOT a closure built in
    `spawn`, which the sync-command guard attributed to `spawn` — verify-auto) and `_link_hold`
    (`LinkHold`, dropped with the session → `release`).
  - `remote_cmd`: `hash8` (moved from `remote_link`), `tmux_server`, `tmux_session`,
    `tmux_new_command`, `tmux_cancel_copy_mode_command`, `test_dir_command`.
  - Commands: async `cc_spawn_remote` (link up, THEN the registry lock for the PTY spawn) and async
    `remote_open_check` → `OpenCheck {ok | folder-missing | unreachable | invalid}`; both in
    `ASYNC_COMMANDS`. Picker: `handleOpenRecent` runs the check before `record_open` ("Connecting to
    <host>…" toast; a failure toasts; only folder-missing carries a Remove action). Frontend routing:
    `spawnCommandFor(spawnCommand, projectPath)` at XtermPane's one invoke (the pane stays a
    `cc_spawn` pane for every other branch).
  - Tests changed on purpose (WP2 stub behaviour → WP3): `remoteRow.test` (`remoteOpenRefusal` →
    `remoteOpenOutcome`), `pickerRemoteLive` (the refuse test → open-on-ok / missing-folder offers
    Remove / unreachable offers none), `spawnArgs` (the invoke-shape regex now includes
    `spawnCommandFor`). New Rust tests mutation-proven: no `admit_remote` → FAILED; no `is_remote`
    early-out → FAILED; path unquoted → FAILED; mode unquoted → FAILED.
  - Not unit-tested (live only): `kill()` running `cancel_before_exit` before `/exit` (needs a real PTY) — the
    Phase 3 scrolled-up-close outcome drives it.
  - [x] verify-auto  <!-- status: done -->
    — evidence: run 1 EXIT=1 — `prettier --check` flagged `src/cc/spawnArgs.ts` + `XtermPane.tsx` (my edits; `prettier --write`, layout only).
    — evidence: run 2 EXIT=101 — `sync_commands_do_not_block` flagged 9 sync commands via `spawn → cancel_copy_mode → exec → run_captured → sleep`: the cancel was a closure built inside `PtyCcSession::spawn`. Restructured to a `RemoteExit` struct whose `cancel_before_exit()` `kill()` calls (where the wait actually runs, on a worker).
    — evidence: run 3 `pnpm verify:auto` → EXIT=0 (60 s): lint 0 errors (the pre-existing `XtermPane` exhaustive-deps warning, now line 949), prettier clean, tsc clean, vitest 3869/3869, cargo lib 1181 passed / 2 ignored, guard 16/16, clippy clean. `cargo test --test stale_dead_code_allows -- --ignored` → 1 passed (the one remaining temporary allow, `LinkRegistry::state`, is still load-bearing).
  - [x] verify-self  <!-- status: done -->
    - [x] O1 cc_session pins: PASS — evidence: runner `cargo test --lib cc_session` → 92 passed; `git diff HEAD` shows the `SpawnTarget::Local` arm passes HEAD's exact `spawn_argv(…build_cc_argv…, project_path, &borrow_env(env), "/exit", CC_SPAWN_ENV_REMOVE)`; no pre-existing test changed (tests hunk is pure addition). Real prefix: `/usr/bin/ssh -S <ctl> -o ControlMaster=no -o BatchMode=yes -tt -- <host>` + one `zsh -lc '…'` argument.
    - [x] O2 hostile values through the spawn string: PASS after an in-place test extension (shortcut, see Discoveries) — the first runner found the test used hand-picked values, not the `HOSTILE` set. Now: all 21 `remote_cmd::tests::HOSTILE` values + 3 canary payloads, each at once as path, drive mode and CC arg, through `/bin/sh` → `/bin/zsh -fc` → fake tmux → `/bin/sh` → fake launcher, NUL-separated, byte-exact; canary never created. Fresh runner: unquoted path / mode / cc-arg mutants each FAILED; restored (shasum match). `!contains(cc-oauth-token | $( | ~ | " claude ")` lives in the non-hostile pin (PASS).
    - [x] O3 open a remote row from the picker → CC in the pane: PASS (orchestrator, dev app, the mini) — evidence: click → workspace mounted; on the mini `tmux -L claudesk-dev ls` → exactly `cd-f3eee4f9 … (attached)`, `claude --permission-mode bypassPermissions` running in `<home>/my-claude-code-customization`. ⚠️ The bridge `webview_screenshot` painted the xterm BLANK for the remote AND a local positive control (scratch-c, a normal CC) — the instrument, not the pane; the real xterm buffer read through `terminalMirror.serializeTerminal` showed CC's "Accessing workspace: …/my-claude-code-customization · Quick safety check" (folder-trust dialog; `~/my-claude-code-customization` is untrusted on the mini) for `ws-1`, and the CC banner for the local control. Backend isolation: a probe `cc_spawn_remote` → `cc_ready` streamed 12.9 KB; `cc-output-cc-1` streamed 5 KB on a resize; workspace client size 141×68 (resize reached tmux).
    - [x] O4 remote env: PASS — evidence: `ps eww` of the remote `claude` (presence only): `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` present, `CLAUDE_CODE_OAUTH_TOKEN` present, `TMUX` absent, `CLAUDESK_DRIVE_MODE` absent (the row's mode is None); cwd = the project folder; `claude auth status` with the token → `"loggedIn": true`.
    - [x] O5 close while scrolled up (the high-priority SURFACE): PASS — evidence: 6 wheel-up events on ws-1's xterm → mini `pane_in_mode=1 mode=copy-mode`. Positive control: raw `cc_input "/exit\r"` (no cancel) → session alive, still in copy-mode, CC running (the trap reproduced). Then filmstrip × (→ `cc_kill` → `cancel_before_exit` → `/exit`) → within ~2 s `has-session` → gone, no `claude` (4 polls). Locally no `ssh -tt`; after the probe session was killed too, no `ssh -M` (the last `LinkHold` drop stopped the link). Note: CC was on its trust dialog, so the `\r` of `/exit\r` picked "No, exit" once the cancel let it through.
    - [x] O6 missing folder (state-changing on the mini, declared): PASS — evidence: `mkdir ~/claudesk-wp3-scratch/gone`; `add_remote_project(<host>, "~/claudesk-wp3-scratch/gone")` passed the preflight; `rmdir`; picker click → error toast "`<home>/claudesk-wp3-scratch/gone no longer exists on <host>. Remove this project, or restore the folder there.`" with a **Remove** button; no workspace mounted (1 tile before/after); row still listed. Remove → row gone. Screenshot: `p3-missing-folder-toast.jpg` (scratchpad). Mini cleaned (`rmdir ~/claudesk-wp3-scratch`; no `claudesk-dev` tmux server left).
    - [x] O7 cap: PASS — evidence: `a_ninth_remote_session_on_one_host_is_refused_in_plain_words` (8 fake remote sessions → `admit_remote` Err "…already has 8 open workspaces…"; other host + local unaffected); caller guard red when `self.admit_remote(…)?;` is deleted.
    - [x] O8 console: PASS — evidence: a `window` `error` + `unhandledrejection` tap installed before the click read `[]` at the end of the whole session (open, close, missing-folder, remove). Expected caught OUT-surface errors (Docs: "Could not read this project's docs … ssh://…") until WP6.
    - [x] O9 `pnpm verify:auto`: PASS — verify-auto run 3, EXIT=0; the shortcut changed only test code (re-verified by the fresh runner).
    - [x] O4/O6 frontend mutants (runner): `remoteOpenOutcome` unreachable→offerRemove → 2 tests FAILED; invoke without `spawnCommandFor` → the `spawnArgs` guard FAILED; the picker open-check block deleted → 3 `pickerRemoteLive` tests FAILED.
    - [x] align: picker → remote CC (inline TUI, colours, copy-mode `q`) — evidence: the workspace opens; ws-1's buffer shows CC's folder-trust dialog (first open of an untrusted folder); the operator judges it live (the agent's screenshots cannot paint xterm).
    - [x] align: the launcher (option (b)) in action — evidence: on the mini `~/.claudesk/com.claudesk.app.dev/`: `-rwx------ cc-launch`, `-rw------- tmux.conf`, `srw------- hook.sock`; `cc-launch` = the 7-line constant script (token from `$HOME/.claudesk/cc-oauth-token`, `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`, `unset TMUX`, `exec claude "$@"`).
    - [x] align: (decision) missing folder offers Remove, never auto-removes; unreachable ≠ missing — evidence: O6 above + `p3-missing-folder-toast.jpg`; the unreachable case shows no Remove (`pickerRemoteLive` test).
  - [x] verify-human  <!-- status: done -->
    - [x] P3.verify-human.1: try the remote workspace (open the mini row in the dev app, use the pane: inline TUI, colours, scroll up + `q`) — operator: ok, 2026-11-16  <!-- status: done -->
    - [x] P3.verify-human.2: the launcher (option (b)) in action on the mini — still what you want? — operator: ok, 2026-11-16  <!-- status: done -->
    - [x] P3.verify-human.3: (decision) missing folder offers Remove but never removes; unreachable ≠ missing — operator: **A**, 2026-11-16  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 63 s, < 300 s; no CLAUDE.md declaration)
    — evidence: new `cc_session::kill_cancels_a_remote_panes_copy_mode_before_it_types_exit` (comment-stripped source order inside the production `kill`: `CleanExitAttempt` < `remote.cancel_before_exit()` < `slash_command_bytes(self.exit_command)`) — mutant (cancel removed from `kill`) → FAILED.
    — evidence: new `remote_link::dropping_the_last_session_hold_stops_the_link` (2 holds → drop one: no Down; drop both: Down + master killed) — mutant (`LinkHold::drop` without `release`) → FAILED.
    — evidence: new `#[ignore]` live `remote_link::live_cancel_and_folder_check` (the mini; a throwaway `cd-wp3test` session on the dev server, killed by a Drop guard): cancel on a pane NOT in a mode → Ok (**first probe of arch §E's unprobed case: tmux exits 1 "not in a mode"**), copy-mode → cancel → `pane_in_mode` 0; `test_dir_command` → yes / no. Mutant (tolerance `2>/dev/null; exit 0` removed) → FAILED live with `Failed { code: Some(1), stderr: "not in a mode" }`. Mini left with no `claudesk-dev` server.
    — evidence: consuming surfaces already pinned at build (`pickerRemoteLive`: open-on-ok / missing-folder Remove / unreachable none; `spawnArgs` invoke guard) + decision A (Phase 3 3=A) by the same tests. Doc: `docs/lessons/mcp-tauri-bridge-caveats.md` (n) extended (permanent-blank xterm screenshot; `serializeTerminal` route).
    — evidence: `pnpm verify:auto` → EXIT=0 (65 s): vitest 3869/3869, cargo lib 1183 passed / 3 ignored (the live tests), clippy clean; `stale_dead_code_allows -- --ignored` → 1 passed.

- [x] Phase 4: One injection funnel and a real CC-readiness signal
  **Relevance check (before Phase 4):**
  - Requester still needs this: yes — every Claudesk injection into a scrolled-up remote pane is swallowed today (Phase 3 reproduced it with a raw `/exit`); multi-line sends split before CC enables `?2004h` (WP1).
  - Requirements unchanged: yes — arch §C.1/§E unchanged. Phase 3 put the cancel in `kill()` via `RemoteExit::cancel_before_exit`; Phase 4's `cc_inject` reuses `LinkRegistry::cancel_copy_mode` (one implementation).
  - Solution still feasible: yes — the cancel and its not-in-a-mode tolerance are now live-proven; `?2004h` is P4.1's probe.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI (live probe, recorded in the WIP before building): from raw `cc-output` bytes captured on the
    mini, does tmux send `\x1b[?2004h` to the client only after CC enables it? → **FAIL** (sent on
    every attach); the pane's `#{bracket_paste_flag}` → **PASS** (tracks the app). See P4.1.
  - CLI: `cargo test --lib remote_cmd` passes, including the prepare-inject builder: its script waits
    for `bracket_paste_flag == 1` (bounded), then cancels copy-mode, prints `ready=<0|1>`, always
    exits 0; the session name enters through `quote` (hostile-name test). A live `#[ignore]` test on
    the mini: a pane whose app enables bracketed paste at +2 s → `prepare_inject` returns Ok after
    ≥ 2 s; a pane that never enables it → the plain-words "not ready" error at the bound (shortened
    in the test); a pane in copy-mode → leaves copy-mode.
  - CLI: a frontend guard test (`vitest`) passes. `invoke("cc_input"` appears only in XtermPane's
    `onData` handler, every other injection goes through `injectCommand`, and `injectCommand` invokes
    `cc_inject`. Each form is mutation-proven individually: add a second `cc_input` site and it goes
    red; point `injectCommand` back at `cc_input` and it goes red.
  - CLI: a Rust test proves `cc_inject` on a LOCAL session writes the same bytes and records the same
    keystroke-telemetry call as `cc_input`. It uses a fake session and asserts on the captured
    writes.
  - Browser + CLI (live, the mini, state-changing: sends a prompt): with the remote pane scrolled up
    (`pane_in_mode` = 1), a skill-button inject lands. The remote transcript gains the command as one
    user turn, and `pane_in_mode` reads 0 afterwards.
  - Browser + CLI (live): a three-line Prompt-panel `⌘↵` sent **within 300 ms of opening** a cold
    remote workspace arrives as exactly **one** user turn in the remote transcript, containing all
    three lines.
  - CLI (measurement): open → readiness latency on the real inner command (launcher, token, inline,
    yolo), 3 cold and 3 warm runs. The numbers are written into arch §C.1 to replace the
    default-mode figures.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Scroll the remote pane up, then click a skill button: the pane jumps back to the bottom and the
    command runs. Is that jump what you want, rather than the command landing while you stay scrolled?
  - (decision) The agent's default: an injection sent before CC is ready **waits up to 15 s**, then
    fails with a toast ("<label> could not run <command>: CC isn't ready yet") rather than sending
    into a TUI that would split it. Still what you want?
  - [x] P4.1 Probe: tmux's `?2004h` behaviour on the mini (outcome 1). Record the raw bytes in this
    WIP.  <!-- status: done -->
    **Probe result (2026-11-16, tmux 3.8, a throwaway `claudesk-wp3probe` server, killed after):**
    ❌ **the client-side `?2004h` is NOT a readiness signal** — tmux sends `ESC[?2004h` to EVERY client
    within ~0.25–0.35 s of attach, whatever the pane does: A plain `sleep` (never enables) → 2004h at
    0.35 s; B app enabling at +2 s → 2004h at 0.25 s; C/C′ reattach → 0.23–0.25 s; D real CC → 0.24 s.
    ✅ **The PANE's own mode is readable: `#{bracket_paste_flag}`** — a fake app enabling at +2 s and
    disabling at +6 s read `0,1,1,1,1,0,0` at 1 s steps; real CC (cold, via the deployed launcher,
    trust dialog in `~`) read `0` at +0.02 s and `1` at +0.25 s. tmux keeps a paste envelope intact
    only when this flag is 1 (WP1 §C.1), so it is exactly the property a multi-line send needs.
    ⇒ **Plan amendment (not a back-loop; the probe was the planned decision point):** readiness =
    the pane's `#{bracket_paste_flag}` polled over the master, not an output scanner. P4.2 is
    rewritten below; the Phase 4 outcomes 1–2 are amended to match.
  - [x] P4.2 One remote "prepare to inject" exec (`remote_cmd::tmux_prepare_inject_command`): poll the
    pane's `#{bracket_paste_flag}` every 0.2 s until 1 (bounded, 15 s), then `send-keys -X cancel`
    (tolerant), then print `ready=1` / `ready=0`. ONE exec per injection. `LinkRegistry::prepare_inject`
    runs it and maps `ready=0` (or an exec failure) to a plain-words error. ⚠️ It reads a pane MODE
    flag; it never reads CC's output for state. A local session doesn't use it (unchanged).  <!-- status: done -->
  - [x] P4.3 Async `cc_inject(session_id, data)`, THE injection funnel. Local: identical to
    `cc_input` (bytes plus keystroke telemetry). Remote: `prepare_inject` (readiness + cancel, one exec),
    then write. Add it to `ASYNC_COMMANDS`. The close path keeps its own cancel-only
    `cancel_before_exit` (it must not wait for readiness); both use `remote_cmd`'s cancel fragment.  <!-- status: done -->
  - [x] P4.4 `injectCommand` invokes `cc_inject`. The guard test covers the frontend side of the
    funnel. `unsentInput.ts`'s comment about the `cc_input` site count is updated.  <!-- status: done -->
  - [x] P4.5 (back-loop from P4.verify-human.2, operator decision A) The "not sent" toast: `injectCommand`'s `onIpcError` now also receives the backend's `reason`; new `injectFailure.ts` (`skillInjectFailure`, `promptInjectFailure` — "Your prompt was not sent: <reason>. The text is in Recent."); `fireSkillCommand(…, onFailure)`; `PromptPanel` `onSendFailure` (through a ref) ← `RightPanelHost` `onInjectFailure` ← `Workspace`'s `injectFailure` state, rendered as `.workspace-inject-toast` (role alert, × dismiss) below the header row on the right. Recycle deliberately NOT wired (its own outcome already reports a failed handoff). Tests: `injectFailureToast.test.tsx` (live Workspace: refused skill inject → toast with the reason; × dismisses; success → no toast; RightPanelHost setter renders), `injectFailure.test.ts`, `promptSendWiring` (refused send → `onSendFailure(promptInjectFailure(reason))`; text archived; success → none). Mutants each FAILED (fireSkill drops the setter → 2; panel passes no handler → 1; RightPanelHost not handed the setter → 1; diagnostic instead of reason → 2; toast never rendered → 3); restored by shasum.  <!-- status: done -->
  - [x] P4.6 (F9b from the P4.5-round verify-self (f)) Recycle's refused injections are reported: `recycleSession` injects through `injectRefusal` (THE funnel, label `recycle`, returns the backend's reason); a refused HANDOFF → `onInjectFailure("handoff", reason)` + new `RecycleCallerFailure` `handoff-not-sent` AT ONCE (nothing torn down, no 180 s wait); a refused RESTORE → `onInjectFailure("restore", reason)` + the existing `restore-not-injected` (was `ok: true`). `Workspace.fireRecycle` maps both to the toast via `recycleInjectFailure` ("Recycle stopped, nothing was changed: …" / "Recycled, but /session-restore was not sent: … Run /session-restore yourself."). Remote Recycle COMPLETION (the `.session.md` wait over ssh) stays WP7 7.4. Tests: 3 new `recycleSession` cases, a live-Workspace recycle toast case, 2 wording cases; 1 triaged (`labels its injections 'recycle'` now expects `expect.any(Function)` for the handler, label still pinned). Mutants each FAILED (handoff refusal ignored → 2, restore refusal ignored → 1, handoff not reported → 2, `injectRefusal` never records → 3, Workspace not wired → 1); restored by shasum. Re-verify gate: the live-Workspace recycle test (real `recycleSession`, `cc_inject` rejected at the IPC edge) → toast at once: PASS.  <!-- status: done -->
  **As built (Phase 4, NOT yet through verify-auto):**
  - `remote_cmd::tmux_prepare_inject_command` (+ `READY_POLLS` = 75 × 0.2 s, `parse_ready`): ONE exec that
    cancels copy-mode FIRST, polls the pane's `#{bracket_paste_flag}` until 1, cancels again, prints
    `ready=<0|1>`. ⚠️ Cancel-first is load-bearing: in copy-mode the flag reads 0 — caught by the live
    test (a scrolled-up ready pane was refused after 15 s) and fixed.
  - `LinkRegistry::prepare_inject` → plain-words Err when not ready / unreachable; `RemoteExit` is
    `Clone` with `prepare_inject()`; `RegisteredSession.remote: Option<RemoteExit>` + `remote_of(id)`.
  - async `cc_inject` (in `ASYNC_COMMANDS`, registered) → `inject_bytes(registry, id, bytes, record)`:
    remote prepare without the lock, then `input` under the lock, then the keystroke telemetry.
  - Frontend: `injectCommand` (`autoResumeFire.ts`) invokes `cc_inject`. New
    `injectionFunnelGuard.test.ts` (only XtermPane invokes `cc_input`; only autoResumeFire invokes
    `cc_inject`; injectCommand's body uses `cc_inject`) — mutants (a 2nd `cc_input` site; injectCommand
    back on `cc_input`, Prettier-wrapped) each FAILED. Comments updated in `unsentInput.ts`, `XtermPane.tsx`.
  - Tests: `prepare_inject_waits_for_the_panes_paste_mode_then_cancels_copy_mode`,
    `prepare_inject_treats_a_hostile_session_name_as_data` (HOSTILE set), `parse_ready_…`,
    `cc_inject_on_a_local_session_is_cc_inputs_bytes_then_its_telemetry`, live `#[ignore]`
    `live_prepare_inject` (PASS on the mini: late pane ready at 2.15 s; copy-mode pane OK; never-ready
    refused). 22 vitest tests updated cc_input → cc_inject (see `## Test Triage`). Last full vitest:
    3869/3869 before the guard file was added; `cargo test` targeted modules green.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (72s): vitest `Test Files 302 passed (302)`, `Tests 3873 passed (3873)` (incl. the new `injectionFunnelGuard.test.ts`); cargo lib `1187 passed; 0 failed; 4 ignored`; all 10 cargo test targets `ok` (incl. `sync_commands_do_not_block` with `cc_inject` in `ASYNC_COMMANDS`, `quit_teardown_stops_remote_links`); lint/format/tsc/check:link/fmt/clippy clean.
    — evidence: `cargo test --test stale_dead_code_allows -- --ignored` → EXIT=0 (4s): `every_allow_dead_code_is_still_load_bearing ... ok` (the remaining `LinkRegistry::state` allow is still load-bearing).
    — evidence (re-run after the P4.5 back-loop): `pnpm verify:auto` → EXIT=0 (50s): vitest `Test Files 304 passed (304)`, `Tests 3882 passed (3882)` (+ `injectFailureToast.test.tsx`, `injectFailure.test.ts`, 3 new `promptSendWiring` cases); cargo lib `1187 passed; 0 failed; 4 ignored`; clippy/fmt clean. Lint: 1 warning, `XtermPane.tsx:953` exhaustive-deps spread — pre-existing (identical in this session's first run; P4.5 did not touch the file).
  - [x] verify-self  <!-- status: done -->
    - [x] O1 probe recorded before building: PASS — evidence: P4.1 block (client `ESC[?2004h` 0.23–0.35 s after every attach → not a signal; pane `#{bracket_paste_flag}` tracks the app, real CC 0→1 at +0.25 s); the plan amendment is recorded.
    - [x] O2 `remote_cmd` + live prepare-inject: PASS — evidence (runner): `cargo test --lib remote_cmd` → 30 passed, 1 ignored; live `live_prepare_inject` on `<mini-host>` → `late pane ready after 2.179s`, copy-mode pane → `pane_in_mode` 0, never-ready → plain-words error; 1 passed. Mutants: flag-break removed → wait test FAILED; `quote` dropped → both prepare tests FAILED; `quote` → naive `"…"` → hostile-name test FAILED. Restored by shasum. Mini: no `claudesk-dev` server after. (The live test asserts ≥ 1.2 s, not ≥ 2 s; measured 2.18 s.)
    - [x] O3 frontend funnel guard: PASS — evidence (runner): `injectionFunnelGuard.test.ts` → 4/4; the only `invoke("cc_input"` is XtermPane's `term.onData`. Mutant A (2nd Prettier-wrapped `cc_input` site in skillButtons.ts) → 1 failed; mutant B (`injectCommand` back on `cc_input`) → 3 failed. Restored by shasum. Limit: the guard is per FILE, so a 2nd `cc_input` call inside XtermPane would pass.
    - [x] O4 `cc_inject` local = `cc_input`: PASS — evidence (runner): `cc_inject_on_a_local_session_is_cc_inputs_bytes_then_its_telemetry` → ok; telemetry dropped in `inject_bytes` → FAILED; bytes truncated → FAILED. ⚠️ Gap → codify: deleting the `record_keystroke_activity` call inside `cc_inject`'s own closure SURVIVED (the test drives `inject_bytes`, not the command wrapper's telemetry wiring).
    - [x] O5 skill-button inject into a scrolled-up remote pane: PASS (orchestrator, dev app, the mini) — evidence: 6 wheel-up events on the xterm viewport → mini `pane_in_mode=1 mode=copy-mode`; real click on `workspace-skill-session-restore` at 17:04:21.509Z → remote transcript gains `/session-restore` as ONE user turn at 17:04:21.637Z; `pane_in_mode=0` afterwards. ⚠️ Side effect on the mini, reverted — see Discoveries [NOTE-2026-11-16] (the restore ran against a real `.session.md`).
    - [x] O6 three-line Prompt send before CC is ready → one turn: PASS (orchestrator) — evidence: cold open (no master, no tmux server); Send clicked the moment it enabled (deferred past React's effect flush) at 17:08:39.753Z, 14 ms after the workspace mounted; mini poller: tmux session at 39.781Z, `bracket_paste_flag`=1 at 40.254Z; the remote transcript gained exactly ONE user turn at 40.476Z holding all three lines (`WP4READYA/B/C`), CC replied `ok`. ⚠️ The literal "within 300 ms of opening" is unreachable by design: Send is DISABLED until `ccSessionId` exists and the workspace itself mounts ~0.72–0.77 s after a cold picker click (open check over ssh). An earlier attempt that clicked inside the commit→passive-effect gap was dropped by `send`'s `if (!sessionId) return` (instrument artifact, not a user path; positive control re-click → one turn). A first warm-ish run (sent 1.37 s after click, setTimeout-throttled) also landed as one turn.
    - [x] O7 latency (real inner command): PASS — evidence: cold click → flag=1 **1.24 / 1.22 / 1.20 s** (click → tmux session 0.77 / 0.78 / 0.76 s); warm master (app's live master, inner command under throwaway names `cd-wp4lat1-3`, killed after) **0.33 / 0.47 / 0.54 s**; Mac↔mini clock offset ≈0 ±10 ms (3 samples). Written into arch §C.1 (old figures marked superseded), the auto-resume bullet in arch §I-adjacent list and the WBS 1.5 row updated.
    - [x] O8 `pnpm verify:auto`: PASS — evidence: verify-auto run this session EXIT=0 (72 s); after the runner's mutations, targeted re-runs green (`cargo test --lib -- remote_cmd cc_session` 124 passed; `vitest related` 466 passed).
    - [x] console: COSMETIC/pre-existing — the `unhandledrejection` tap read 23 `listeners[eventId].handlerId` rejections over the session; a LOCAL scratch-c open reproduces them (stack: Tauri's injected `unregisterListener` ← `useTauriListen.ts`, untouched since 2026-06-30). Not a Phase 4 regression → backlog `SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN`.
    - [x] align: the jump to the bottom on an inject while scrolled up — evidence: xterm keeps NO scrollback of its own on a remote pane (`scrollHeight == clientHeight` = 898); all scrolling is tmux copy-mode, so the inject's cancel returns the pane to the live bottom (`pane_in_mode` 1 → 0) and the command runs (O5). The operator judges whether that jump is wanted.
    - [x] align: (decision) 15 s wait, then a toast — evidence: backend as built: `READY_POLLS` = 75 × 0.2 s; the refusal is `Claude Code on <host> isn't ready for input yet (waited 15s)` (live never-ready case, O2). ⚠️ **Frontend as built: NO toast.** Every caller (Prompt panel, skill buttons, recycle) passes `onIpcError: undefined`, so the refusal reaches only `console.warn`; the Prompt panel has already archived the text to Recent and cleared the editor. The question's described default ("fails with a toast") is therefore not what is built — the operator decides whether to build the toast.
    - [x] P4.5 round — toast live, Prompt path: PASS (orchestrator, dev app, the mini) — evidence: remote workspace opened, then the pane's CC replaced by `sleep 900` (`tmux respawn-pane -k` on our own dev-server session → `bracket_paste_flag=0`, a REAL never-ready pane); Prompt `Send` at 17:26:08.928Z → after the 15 s wait `[data-testid=workspace-inject-toast]` role `alert`: "Your prompt was not sent: Claude Code on `<user@host>` isn't ready for input yet (waited 15s). The text is in Recent."; Recent (3 → 4). Screenshot `p4-inject-toast.jpg` (scratchpad; shows the real host, not committed): toast top-right below the header row, clear of the tab row.
    - [x] P4.5 round — toast live, skill path + dismiss: PASS — evidence: × removed the toast (`dismissedBeforeClick: true`); `restore` clicked at 17:26:42.837Z → toast "/session-restore was not sent: Claude Code on `<host>` isn't ready for input yet (waited 15s)". The mini's pane `capture-pane | grep -c -e WP4TOAST -e session-restore` → 0 (a refusal writes NOTHING; the tty would have echoed it). Non-`handlerId` errors: `[]`. Cleanup: workspace closed, session killed, no `claudesk-dev` server, no local ssh, app stopped.
    - [x] P4.5 round — wiring review + tests (runner, read-only): (a)–(e), (g) PASS; `vitest` 4 files / 30 tests; `tsc` 0; eslint 0 errors (1 pre-existing warning).
    - [x] P4.5 round — (f) recycle: FAIL BLOCKING (runner) → fixed by P4.6, re-verified at the build gate; — P4.5's reason for leaving recycle out was WRONG. A refused handoff injection surfaces only after `RECYCLE_TIMEOUT_MS` (180 s), and then only as `console.warn("recycle: … did not complete (timeout)")`; a refused `/session-restore` into the fresh pane (step 6) is reported `ok: true` — fully silent. The Recycle button shows on remote workspaces. Decision A named recycle.
    - [x] P4.6 round — Recycle toast live: PASS (orchestrator, dev app, the mini) — evidence: remote workspace opened, pane CC swapped for `sleep 900` (`respawn-pane -k`, our dev-server session; `bracket_paste_flag=0`, pane_pid 21306); real Recycle click at 17:32:41.749Z → ~15 s later (NOT 180 s) toast "Recycle stopped, nothing was changed: /session-handoff was not sent: Claude Code on `<host>` isn't ready for input yet (waited 15s)."; Recycle button idle again; local `ssh -tt` PID unchanged (42902 → no relaunch); remote pane_pid unchanged, `capture-pane | grep -c session-handoff` → 0. The refused-RESTORE arm is not live-reachable on a remote workspace until WBS WP7 7.4 (a remote handoff can never complete today: `stat_file` on the `ssh://` key) — covered by `recycleSession` unit tests + mutants.
    - [x] P4.6 round — no regression of the P4.5 Prompt toast: PASS — evidence: Prompt send at 17:33:08.715Z → "Your prompt was not sent: Claude Code on `<host>` isn't ready for input yet (waited 15s). The text is in Recent."; non-`handlerId` errors `[]`. Cleanup: workspace closed, session killed, no `claudesk-dev` server, no local ssh, app stopped.
    - [x] P4.6 round — runner review (read-only): tests 5 files / 105 passed; (a) refused handoff → `handoff-not-sent` before wait/mark/relaunch, reported once; (b) refused restore → `restore-not-injected` + reported; (c) both through `injectCommand` label `recycle`, no new invoke site; (d) `fireRecycle` wired, the only `reason` reader is its `.then` (`!== "aborted"`), the supervisor reads only the sync boolean; (e) every operator-initiated `injectCommand` caller now toasts (supervisor → activity record; auto-resume → `console.warn`, both out of scope); `tsc` 0, eslint 0 errors. (f) 4 inaccurate comments in `recycleSession.ts` → COSMETIC, fixed in place (see [SHORTCUT] in Discoveries).
  - [x] verify-human  <!-- status: done -->
    - [x] P4.verify-human.1: (align) scroll the remote pane up, then inject — the pane jumps to the live bottom (tmux copy-mode cancelled) and the command runs — operator: ok ("all good"), 2026-11-16
    - [x] P4.verify-human.2: (decision) a not-ready refusal after the 15 s wait reaches only `console.warn` — operator: **A, build the toast** (2026-11-16). Build: every `injectCommand` caller that can hit a remote refusal (Prompt panel, skill buttons, recycle) surfaces the backend's plain-words error as a toast ("<label> could not run <command>: CC isn't ready yet"-shaped), not only `console.warn`. — built (P4.5 Prompt + skill buttons, P4.6 Recycle), live-verified; operator re-check of placement/wording/look: "good", 2026-11-16
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 72 s, < 300 s; no CLAUDE.md declaration); not the last phase (Phase 5 NOT-STARTED)
    — evidence: new `cc_session::commands::cc_inject_wires_inject_bytes_record_to_the_keystroke_telemetry` closes the O4 gap (comment-stripped `cc_inject` body: the closure given to `inject_bytes` calls `record_keystroke_activity(&app, &session_id, n)`; `cc_input` records through the same fn). A source guard because the command needs an `AppHandle` no test here can build; `inject_bytes`' behaviour (bytes + `record(len)`) is the existing test. Mutants: closure records nothing → FAILED; records constant `0` → FAILED; restored by shasum.
    — evidence: already codified at build and NOT duplicated: `remote_cmd` prepare-inject builder + live `live_prepare_inject` (O2); `injectionFunnelGuard` (O3); `inject_bytes` local parity (O4); the toast on all three paths (`injectFailureToast` live-Workspace — the consuming surface: skill row + Recycle button; `promptSendWiring` real panel; `recycleSession` refusal arms; `injectFailure` wording) with 10 wiring mutants; integration boundary covered by those consuming-surface tests. Live-only outcomes (O5 scrolled-up inject, O6 pre-ready 3-line send, O7 latency) stay live evidence: they need the mini + a real CC.
    — evidence: `pnpm verify:auto` → EXIT=0 (45s): vitest 304 files / 3888 passed; cargo lib 1188 passed / 4 ignored; clippy/fmt clean; lint 1 pre-existing warning. `stale_dead_code_allows -- --ignored` → 1 passed.

- [x] Phase 5: Survive a link drop: reattach as the same session
  **Observable outcomes:**
  - CLI: `cargo test --lib cc_session` passes, covering the exit classifier. For an inner ssh exit
    with the link not Up, or exit code 255 → `Reconnect`. For a clean exit with the link Up →
    `Ended` (`cc-exit-<id>` emitted). Each arm is mutation-proven.
  - CLI: the reattach argv pin uses `attach -t cd-<8hex>`, **never `new -A`**, so a session that died
    while disconnected is never silently restarted (WP5 owns what happens next).
  - Browser + CLI (live, the mini, state-changing: kills the local master this app started, by PID):
    with a remote workspace open, record the remote `#{pane_pid}` and type a marker word (not
    submitted) into the pane, then SIGKILL the local master. Within 30 s the pane is live again: the
    screenshot shows the marker still in CC's input box, `#{pane_pid}` is unchanged, the same xterm
    instance is in use (no `cc-exit-<id>` was emitted, per `ipc_monitor`), and the tmux client size
    equals the xterm size.
  - CLI (live, state-changing: ends the remote session while the link is down): with the link held
    down (master killed and the link paused by the test), `tmux kill-session` on the mini, then let
    the link come back. The pane's session ends with `cc-exit-<id>` and no new `claude` process starts
    on the mini.
  - CLI (live): with the workspace closed during `Reconnecting`, the reconnect loop stops, no ssh child
    remains (`pgrep -f "<ctl path>"` is empty once the link ref-count reaches 0), and the remote session
    is still running (end-intent is WP5's), as recorded in the WIP.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Kill the link (or toggle Tailscale off and on) with a remote workspace open and watch it come
    back: is a frozen pane that resumes on its own acceptable until WP4's link overlay lands?
  - (decision) While reconnecting, the agent writes one dim notice line into the pane
    (`[Claudesk: connection to <short host> lost, reconnecting…]`), which tmux's redraw replaces on
    reattach. The alternative is a silent freeze until WP4's overlay. Which do you want?
  - [x] P5.1 `RemoteCcSession` wraps a replaceable inner `PtyCcSession` and keeps the session id, the
    output event name and the last cols/rows. When the inner exits, the classifier (a pure function)
    decides between `Reconnect` and `Ended`. Only `Ended` emits `cc-exit-<id>`.  <!-- status: done -->
  - [x] P5.2 Reconnect: wait for the link's `Up` (via `remote-link` state, with no extra polling),
    spawn `ssh -S <ctl> -tt -- <host> zsh -lc 'exec tmux -L <srv> attach -t <name>'` live (no
    backlog), apply the last size, and re-arm the readiness latch. tmux redraws on attach, and
    `?2004h` re-latches.  <!-- status: done -->
  - [x] P5.3 `kill()` during Reconnecting cancels the wait, releases the link ref and doesn't touch
    the remote. That case is recorded as WP5 5.4's input.  <!-- status: done -->
  - [x] P5.4 The optional notice line, per the Phase 5 decision: emitted through the same
    `cc-output-<id>` path, as Claudesk's own bytes, never parsed back.  <!-- status: done (agent default: the notice line; the (decision) goes to verify-human) -->
  - [x] P5.5 (F9b from Phase 5 verify-self O3-F) Terminals never fall back to a direct connection; reconnect retries back off. `remote_link::terminal_argv` adds `-o ProxyCommand=/usr/bin/false` (`NO_DIRECT_FALLBACK`): ssh runs a ProxyCommand only for a NEW connection, so with a live master it is inert and with a stale/dead one the terminal exits 255 at once (probed against the mini: live master → muxed 0.12 s; stale socket → 255 in 0.08 s; control without it → "went-direct"). `exec_argv` keeps its documented direct fallback (short, ConnectTimeout-bounded). `next_reconnect(prev_delay, lived)` (pure): a re-attached terminal that dies within `STABLE_TERMINAL` (10 s) is a failed attempt → back off 2→4→…→30 s, no new notice; otherwise a NEW drop → notice + immediate attempt. `on_inner_exit` takes the dead terminal OUT of `inner` before reading its exit code (sync `cc_input`/`cc_resize` never wait the reap window); the back-off sleep is cancellable (100 ms slices). Tests: `a_remote_terminal_never_falls_back_to_a_direct_connection` (REAL `/usr/bin/ssh`, the real `terminal_argv`, missing ctl + RFC 5737 address → 255 within 5 s; positive control: without the option it is still connecting after 1.5 s), `a_quick_reattach_failure_backs_off_and_only_a_new_drop_announces`. Mutants: option removed → 2 FAILED; quick failure announced → FAILED; no doubling (re-run ALONE after a harness failure, see Discoveries) → FAILED. Re-verify gate: the root cause re-run as the real-ssh CLI test → PASS; the live O3 re-run with an `lsof` direct-vs-mux check is verify-self's.  <!-- status: done -->
  **As built (Phase 5, NOT yet through verify-auto):**
  - `cc_session`: `PtyCcSession::spawn` now returns `Box<dyn CcSession>`; its remote arm builds `RemoteCcSession` (holds the `LinkHold`, session id, last size, `ready`/`killed`/`exited` flags, and a replaceable inner `PtyCcSession`). `spawn_argv` is unchanged and delegates to new `spawn_argv_with_exit(…, ExitHook)`; `ExitHook` is a VALUE (`Emit` | `Remote(Arc<RemoteShared>)`) fired by `finish_output()` inside the reader thread's `thread::spawn` closure (a closure built at spawn made `sync_commands_do_not_block` attribute the classifier's waits to 9 sync commands — false positives, fixed structurally, no ledger entry). `on_inner_exit` reads the terminal's exit code (`exit_code_within`, 2 s) and the link state → pure `classify_inner_exit(killed, code, link_up)`: killed → Ended; 255 or link not Up → Reconnect; else Ended. `reconnect`: drop the dead terminal, `emit_notice` (if ready), `LinkRegistry::wait_up` (new: waits THROUGH failed attempts on the link condvar, 250 ms cancel slices; Err when stopped/cancelled), ≥ 2 s between attempts, spawn `terminal_argv(ctl, host, remote_cmd::tmux_attach_command(srv, session))` UNDER the inner lock (its hook cannot classify before it is stored), apply the last size, `mark_ready` if the frontend is listening. `emit_exit` is the single once-latched `cc-exit-<id>` emitter. `kill()`: `killed` first, then the terminal's own kill; while reconnecting nothing touches the remote. `remote_link::state` lost its temporary dead-code allow (first caller).
  - `remote_cmd::tmux_attach_command` (`exec tmux -L <srv> attach -t =<session>`, exact match, never `new`).
  - Tests: `a_remote_terminal_end_is_classified_reconnect_or_ended`, `the_reconnect_notice_names_the_short_host_and_is_dim`, `a_remote_session_reconnects_by_attaching_and_emits_exit_only_once` (source: attach not `new`, the once-latch, one emitter), `the_reconnect_attaches_exactly_and_never_creates_a_session` + hostile-name (real zsh, fake tmux argv), `wait_up_waits_through_failed_attempts_until_the_link_is_back`, `wait_up_returns_err_for_a_stopped_link_and_promptly_on_cancel`. Mutants each FAILED: killed arm, 255 arm, link-not-Up arm, once-latch, attach→`new -A`; restored by shasum. `cargo fmt`/clippy `--all-targets` clean; `sync_commands_do_not_block` 16/16; `stale_dead_code_allows` ok.
  - [x] verify-auto
    — evidence: `pnpm verify:auto` → EXIT=0 (47s): vitest `304 passed (304)` / `3888 passed (3888)`; cargo lib `1195 passed; 0 failed; 4 ignored`; clippy `--all-targets -D warnings` + fmt clean (incl. `sync_commands_do_not_block` 16/16); lint 1 pre-existing warning (`XtermPane.tsx:953`).
    — evidence: `cargo test --test stale_dead_code_allows -- --ignored` → 1 passed (the `LinkRegistry::state` allow was removed: its first caller landed).
    — evidence (after P5.5): `pnpm verify:auto` → EXIT=0 (47s): vitest 304 / 3888 passed; cargo lib `1197 passed; 0 failed; 4 ignored`; clippy/fmt clean; lint 1 pre-existing warning. `stale_dead_code_allows -- --ignored` → 1 passed.
  - [x] verify-self  <!-- status: done (round 1: 1 BLOCKING → F9b P5.5; round 2 clean) -->
    - [x] O1 classifier: PASS — evidence (runner): `cargo test --lib cc_session` → 98 passed; `a_remote_terminal_end_is_classified_reconnect_or_ended` asserts each arm; build mutants (killed / 255 / link-not-Up / once-latch) each FAILED.
    - [x] O2 attach, never `new -A`: PASS — evidence (runner): `reconnect` builds its argv only from `tmux_attach_command` (`exec tmux -L <srv> attach -t =<session>`); real-zsh fake-tmux argv `-L claudesk-dev attach -t =cd-1234abcd`; 7 targeted tests pass; mutant attach→`new -A` FAILED.
    - [x] O3 master SIGKILL → reattach: PASS (orchestrator, dev app, the mini) — evidence: `WP5MARK` typed (unsubmitted) → in CC's input box; pane_pid 22691; tmux client 141×68 = xterm 141×68; xterm instance tagged. `kill -9` of the app's master (18:34:30.5Z) → a new `ssh -tt` within ~1 s, a new master ~2 s; after: `WP5MARK` still at the prompt (pane + xterm buffer), pane_pid 22691, client 141×68, SAME tagged xterm instance, `cc-exit-cc-1` listener (positive control: the same `listen` received `cc-output-cc-1`) recorded `[]`, output resumed (11 chunks). ⚠️ See O3-F below: the reattached terminal went DIRECT.
    - [x] O3-F reattach bypasses the master: FIXED by P5.5, re-verified live in round 2 (below). Round-1 finding: FAIL BLOCKING (orchestrator observed live + runner reproduced the mechanism) — the reattached terminal (PID 15413) started BEFORE the new master and survived a later master kill: `ssh -S <ctl> -o ControlMaster=no` FALLS BACK TO A DIRECT CONNECTION when the master socket is stale. Cause: the link worker notices a master death only on its 200 ms poll, the pane's mux client exits 255 at once, so `wait_up` reads a STALE Up and returns the dead master's ctl. `terminal_argv` has no ConnectTimeout/ServerAlive, so such a terminal can hang on connect (~75 s) or freeze silently outside the link. → P5.5.
    - [x] O4 kill-session while the terminal is down → cc-exit, no new claude: PASS — evidence: (the terminal being direct, the drop was made by killing the remote sshd serving the app's tmux client, then `kill-session` in the same remote script, 18:36:30Z) → notice chunk at 18:36:30.164Z `\r\n\e[2m[Claudesk: connection to <mini> lost, reconnecting…]\e[0m\r\n`; the reattach printed tmux's `no sessions` → Ended → exactly ONE `cc-exit-cc-1` at 18:36:30.293Z; remote: no tmux server, 0 `claude`; local terminal ssh gone.
    - [x] O5 close during Reconnecting: PASS in round 2 (below). Round 1: UNVERIFIED — the window was not reachable by timing: the reconnect completed in ~0.7 s through the direct fallback (O3-F), so a close 0.77 s after a master kill was an ordinary CONNECTED close (the copy-mode cancel also went direct and succeeded — no `could not cancel` in the app log — then `/exit` ended the remote session, as designed for a connected close). Code read (runner): `kill()` sets `killed` before taking the terminal; with none it returns at once without touching the remote; the loop ends via `wait_up`'s cancel (≤ 250 ms slices) or the under-lock check. Re-run after P5.5 (with the fallback blocked the window is ≥ the link backoff).
    - [x] O6 `pnpm verify:auto`: PASS — verify-auto run this phase EXIT=0.
    - [x] review (runner): no double/never `cc-exit` on kill-connected / kill-reconnecting / instant attach failure / stop_all-before-kill_all; no lock-order deadlock; `RemoteCcSession::kill` never on the main thread; `LinkHold` released after `kill`, no terminal stored after a close; no `Arc` cycle; `quit_teardown_stops_remote_links` 2/2 still meaningful. MINOR: (1) 255 exits with the link Up retry every 2 s forever and re-emit the notice each time → P5.5; (2) typed keys during Reconnecting are dropped silently (`cc_input` `.catch(() => {})`) — WP4's overlay territory, noted; (3) `cc_input`/`cc_resize`/`cc_ready` (sync) can wait on `shared.inner` up to 2 s during `exit_code_within` (normally ms) → P5.5 reads the exit code without holding `inner`; (4) the `quit_now` LEDGER reason (~800 ms) is stale for remote sessions (cancel up to 10 s) → codify; (5) codify gap: `on_inner_exit`'s wiring not unit-tested.
    - [x] ROUND 2 (after P5.5) O3 master SIGKILL → reattach rides the master: PASS (orchestrator, dev app, the mini) — evidence: initial terminal 32670 → `lsof -a -p 32670 -i TCP` = 0 sockets; positive control: the master 32665 = 1 TCP socket (the check discriminates). `WP5R2MARK` typed; `kill -9` master at 18:45:20.587Z → the re-attached terminal 34139 appeared at ~2 s (the immediate attempt failed fast through the blocked fallback, then the 2 s back-off) with **0 TCP sockets** (rides the new master 34132). After: pane_pid 23480 unchanged, client 141×68 = xterm 141×68, `WP5R2MARK` in the pane AND the xterm buffer, SAME tagged xterm, `cc-exit-cc-1` = `[]`, exactly ONE notice (18:45:20.589Z) despite the failed first attempt.
    - [x] ROUND 2 O5 close during Reconnecting: PASS — evidence: `kill -9` master at 18:45:39.735Z, filmstrip × at 18:45:40.480Z (inside the 2 s back-off) → exactly ONE `cc-exit-cc-1` at 18:45:40.593Z; within 1 s no local ssh with the app's ctl path (the link stopped at ref 0); the remote session STILL RUNNING (`tmux ls` → `cd-f3eee4f9 … ` detached, 1 `claude`, `WP5R2MARK` still in its input box → nothing typed); `could not cancel copy-mode` log lines: 0 (no cancel attempted). Cleanup: session killed by hand on the mini (end-intent is WP5's).
    - [x] ROUND 2 runner review (read-only): 178 passed incl. the real-ssh test; (a) both terminal argvs (initial + attach) go through `terminal_argv`, no other `-tt` builder; (b) the master-kill trace holds, nothing spins (2→30 s cap; 5 spawn failures end it); (c) close during the back-off / `wait_up` / between: stops ≤ 250 ms, one `cc-exit`, never touches the remote; (d) take-before-reap leaves no live ssh; (e) `exec_argv`'s retained direct fallback is bounded (ConnectTimeout 10 s) and never half-sends. MINOR (noted, not blocking): a 255 loop with the link Up retries every 30 s with a frozen pane (WP4 overlay); a 2nd real drop within 10 s of a reattach gets no new notice; a master dying in the instant BEFORE the first spawn makes the first terminal 255 → attach finds no session → the workspace opens then ends (WP5 input); a close in the ~0.1 s a doomed stale-Up attach is stored can wait up to 10 s on the direct-exec cancel. Codify gap: `on_inner_exit`'s wiring (`*d = next.0`, `lived`) is not unit-tested.
    - [x] align: a frozen pane that resumes on its own — evidence: O3 (resumed in ~1–2 s, marker intact, no remount).
    - [x] align: (decision) notice line vs silent freeze — evidence: the notice line as built (O4 chunk above), written dim between the last output and tmux's redraw; round 2: written ONCE per drop (a failed retry adds none).
  - [x] verify-human  <!-- status: done -->
    - [x] P5.verify-human.1: (align) a frozen pane that resumes on its own after a link drop, until WP4's overlay — operator: "good", 2026-11-16
    - [x] P5.verify-human.2: (decision) the dim reconnect notice line vs a silent freeze — operator: **A** (keep the notice line, once per drop), 2026-11-16
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — last phase
    — evidence: the round-1/2 codify gap closed: `on_inner_exit`'s stateful back-off step extracted to `reconnect_plan(&retry_delay, &attached_at)`; new `the_reconnect_back_off_persists_across_consecutive_quick_failures` (drives the STORED state: new drop → 0; quick failures → 2/4/8 s silently; a held re-attach dropping → reset, new drop) + caller guard `on_inner_exit_takes_its_reconnect_plan_from_the_sessions_stored_state`. Mutants (guarded harness): back-off not stored → FAILED; `attached_at` ignored → FAILED; `on_inner_exit` bypassing the plan → FAILED; each restored + shasum-verified.
    — evidence: `tests/sync_commands_do_not_block.rs` — the `quit_now` LEDGER comment corrected (the ~800 ms bound does not hold once a remote session is open: its kill's copy-mode cancel is an ssh exec bounded by `EXEC_TIMEOUT_MS`, 10 s, + the 2 s reap window). Comment-only.
    — evidence: already pinned at build and not duplicated: the classifier arms, attach-never-`new`, the once-latch, `wait_up` (through failures; cancel), the no-direct-fallback real-ssh test with a positive control, `next_reconnect`. Live-only (need the mini + the app): master-kill reattach (O3), session-gone-while-down (O4), close-during-Reconnecting (O5) — recorded as live evidence above.
    — evidence: FULL suite: `pnpm verify:auto` → EXIT=0 (46s): vitest 304 / 3888 passed; cargo lib `1199 passed; 0 failed; 4 ignored`; clippy/fmt clean; lint 1 pre-existing warning. `stale_dead_code_allows -- --ignored` → 1 passed. LIVE on the mini (`#[ignore]`, `CLAUDESK_TEST_REMOTE_HOST` + `_PATH`): `live_link_up`, `live_cancel_and_folder_check`, `live_prepare_inject`, `live_preflight_against_a_real_host` (5/5 checks PASS, 0.64 s) → 4/4 ok (one first run panicked on a missing `CLAUDESK_TEST_REMOTE_PATH` — instrument error, re-run with it set).

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship (all 5 phases complete; codify ran the FULL suite at the last phase). ⚠️ NOTHING of WP3 is committed yet.
- **Blocked:** none
- **Unvisited:** ship → review-quality → finalize
- **Open discoveries:** SURFACE-2026-11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED (→ WP5); SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN (low, pre-existing)

## Notes for every phase

- ⚠️ **PUBLIC repo.** The real host is in `tmp/m17-remote-host.local` (gitignored). In this WIP, tests
  and comments it is `<mini-host>`. Grep every staged blob for the host, the account and the short
  name before each commit.
- **Live tests are `#[ignore]`d** and read `CLAUDESK_TEST_REMOTE_HOST`, following the WP2 pattern
  `CLAUDESK_TEST_REMOTE_HOST=<host> CLAUDESK_TEST_REMOTE_PATH='~' cargo test --lib live_ -- --ignored`.
- **Verification split (worked at WP2):** the orchestrator drives the dev app over the `tauri` MCP
  bridge. Runner subagents do CLI checks and mutations, with the dev app STOPPED so Vite HMR can't
  load mutants (memory `live-dev-app-may-run-a-mutant`).
- **Mini hygiene:** at each phase's close, nothing is left of `claudesk-dev` beyond what the phase
  meant to leave. Check `tmux -L claudesk-dev ls` and that `~/claudesk-wp3-scratch` has been removed.
  `~/.claudesk/com.claudesk.app.dev/` (conf, launcher, socket) stays by design.

## Test Triage — 22 vitest tests asserting the injection IPC name (Phase 4 build, P4.4)
Classification: Obsolete test — the new feature intentionally supersedes what the test checked (the frontend injection funnel `injectCommand` now invokes the backend funnel `cc_inject` instead of `cc_input`).
Confidence: high
Evidence: every failing assertion names `"cc_input"` as the command `injectCommand` / the supervisor fire / the skill buttons / the Prompt send / auto-resume invoke; no failing assertion concerns XtermPane's `onData` (the operator's typing, which stays on `cc_input`).
Action: replaced `cc_input` → `cc_inject` in the 10 injection-only test files (autoResumeFireLive, clearButtonLive, injectCommandDefaultPath, readFolderTrust, skillButtons, promptSendWiring, sendStagedDraft, activityFunnel, fanOut, verifyHumanPause); in sessionStartButton only the funnel assertion changed — its "Workspace.tsx must not call cc_input directly" negative guard is kept.

## Test Triage — the_remote_terminal_argv_is_ssh_over_the_master_into_tmux_with_no_expansion (P5.5)
Classification: Obsolete test — the new `-o ProxyCommand=/usr/bin/false` pair intentionally changes the pinned argv prefix
Confidence: high
Evidence: the pin asserted `argv[..10]` and `len 11`; P5.5 inserts two elements after `ControlMaster=no`
Action: updated the pin to `argv[..12]` (with the new pair) and `len 13`; nothing else in the test changed

## Test Triage — a_remote_session_reconnects_by_attaching_and_emits_exit_only_once (P5.5)
Classification: Obsolete test — its source anchor names `reconnect`'s old signature, changed on purpose (it now takes the back-off delay and the new-drop flag)
Confidence: high
Evidence: `.find("fn reconnect(shared: Arc<RemoteShared>) {")` → None after the signature change
Action: updated the anchor to the new signature; the assertions are unchanged and pass

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-16] Phase 3 (→ WP5) — a host link's `ssh -M` master survives an app KILL (SIGTERM/SIGKILL/crash: no `perform_quit_teardown`, no `Drop`); one local ssh + one remote sshd session leak per crash. Backlog: `SURFACE-2026-11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED`.
[SHORTCUT-2026-11-16] P3.verify-self.O2 — the hostile spawn-string test used hand-picked values, not the promised `HOSTILE` set; extended it to loop all 21 `HOSTILE` values (+3 canaries) as path, mode and CC arg with NUL-separated output (`remote_cmd::tests` made `pub(crate)` for the shared set). Re-verified by a freshly spawned runner: 24 values PASS; unquoted path/mode/arg mutants each FAIL; file restored by shasum.
[NOTE-2026-11-16] Phase 3 verify-self — `mcp__tauri__webview_screenshot` painted every xterm pane BLANK for the whole session (remote AND a local CC control, 40 s+ after open), beyond caveat (h)'s seconds-long window. The working instrument was the filmstrip mirror's `serializeTerminal(workspaceId)` (dynamic `import("/src/components/workspace/terminalMirror.ts")` through Vite, workspace id from the XtermPane fiber's `workspaceId` prop). → added to `docs/lessons/mcp-tauri-bridge-caveats.md` caveat (n) at Phase 3 codify (same root cause: the hidden agent window pauses rAF).
[SHORTCUT-2026-11-16] P2.verify-self.F1 — the F9b regression test for the `ensure()` baseline race caught its mutant only ~26% of runs; extended it with a `#[cfg(test)] pause_after_start` seam in `LinkRegistry::ensure` (the window the race needs) so it fails 10/10 under the mutant. Re-verified by a freshly spawned verify-self runner (10/10 FAIL under the mutant, 5/5 PASS restored, seam confirmed test-only).
[NOTE-2026-11-16] P4.verify-self.O5 — the skill-button check fired a real `/session-restore` into the remote CC in the mini's `~/my-claude-code-customization`, which HAD a live `.session.md` (an mccc handoff from 2026-11-07). Before asking its drive-mode question the remote CC deleted that `.session.md` and stripped the uncommitted Session Handoff footer from `workflow-system/state/archive/codify-nearby-tests.md`. Agent cancelled the question (Esc) and restored both from the remote transcript's own tool results: `.session.md` (1693 bytes, the `cat` output) and the footer (`git diff --stat` back to `+3`, heading at line 234 as before; wording = the standard handoff footer). Lesson: a live skill-button check must target a scratch remote folder, never a real repo — the command runs for real.
[SURFACED-2026-11-16] Phase 4 verify-self — unhandled `listeners[eventId].handlerId` rejections on every workspace open (local too; pre-existing). Backlog: `SURFACE-2026-11-16-TAURI-UNLISTEN-REJECTION-ON-WORKSPACE-OPEN`.
[SHORTCUT-2026-11-16] P4.6 verify-self (f) — 4 inaccurate/stale comments in `recycleSession.ts` (the `onInjectFailure` JSDoc's history claims, the misplaced object-holder note, and two "only a `console.warn`" claims made stale by P4.6) corrected in place (comment-only, extending P4.6). Re-verified by a freshly spawned read-only runner: (a)–(d) + `handoff-not-sent` PASS, `singleAuthority` + `recycleSession` 90/90; it found one more stale count ("These two" / "the other two" in the `RecycleCallerFailure` doc, now four members), fixed exactly as it specified and confirmed by grep + the same 90/90 (not re-reviewed a third time).
[NOTE-2026-11-16] P5.5 build — a mutation harness wrote its aside copy to a scratchpad subdir that no longer existed; every `cp` failed, so 3 mutants were LEFT IN PLACE across `remote_link/mod.rs` and `cc_session/mod.rs`. Caught from the cp errors; each single `perl` substitution reversed by hand, 178/178 + fmt re-verified, and the stacked M3 re-run alone. Memory `git-checkout-no-ops-on-untracked-file` gained the corollary (`mkdir -p`, `cp … || exit`, verify the aside's shasum before mutating).
[NOTE-2026-11-16] Phase 5 codify — I stopped the dev app with SIGTERM while the operator still had the remote workspace open from P5.verify-human.1 (their ticker test across a Tailscale toggle). A killed app runs no teardown: its master (re-established at the operator's reconnect) was orphaned (PPID 1) and the remote session kept running — a live instance of `SURFACE-2026-11-16-REMOTE-LINK-MASTER-ORPHANED-WHEN-THE-APP-IS-KILLED` (WP5). Cleaned by hand (master killed, idle session killed after checking the pane held only the finished ticker). Practice: before stopping an agent-launched dev app, close its workspaces (or check `pgrep -f 'ssh -M'` + the mini's `tmux ls`) — the operator may have used it.
