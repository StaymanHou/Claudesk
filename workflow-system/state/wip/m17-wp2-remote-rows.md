---
drive_mode: autopilot
---

# Feature: M17 WP2 — Remote rows (data model, identity, adding one)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-16
**WBS:** `workflow-system/product/wbs.md` → WP2 (tasks 2.1–2.6). **Design:** `arch/remote-workspaces.md` §A, §C (quote), §H (adding).
**Probe:** WP1 shipped 2026-11-14 (`fd4423b`). The ssh / tmux / `claude auth status` shapes used by the preflight were live-probed there and in `research.md`. There's no unprobed third-party dependency.

## Problem Statement

M17 needs a picker row whose CC session runs on another Mac. Before any build can write such a row, three things must be true. First, the row must **survive launch**: today `prune_missing_projects` deletes any row whose path doesn't exist locally, and that is the highest-severity risk in research (Risk 1). Second, it must have a **safe identity**: `ssh://<host><path>`, which never collides with a local path and is never canonicalized against the local disk. Third, every remote command string must be built by **one quoting function**, because on a shared host that is the only defense against a path or mode string becoming remote code execution. WP2 then lets the operator **add** a remote project through an async preflight: the key works, `tmux`/`claude`/`perl` resolve, the path exists, and CC is authenticated headless. The operator can also see the row and remove it. Opening one is a stub until WP3.

Problem statement unchanged (P3 F12 re-entry, 2026-11-16): the back-loop is a display ruling on the remote row (the path line and the marker). The data model, identity and add flow are untouched.

**Design decisions taken at plan time (disclosed; flag if wrong):**
- **D1: a remote row's `project_path` IS its `remote_key`** (`ssh://host/abs/path`), with the structured `remote: { host, path }` beside it. Every existing per-row IPC keys on `project_path` (`remove_project`, `record_open`, model / drive-mode setters, `touch_closed`, the unclean flag). This makes all of them work for remote rows unchanged, and makes the arch §A rule ("never key a remote workspace by its bare path") hold by construction. The invariant `path == remote_key(remote)` is enforced at insert. A local path is always absolute (`/…`), so the two spaces are disjoint.
- **D2: the remote-key pass-through lives in `status_broadcaster::canonical_key`** (the root that `key_for` and `WorkspaceRegistry` both delegate to), not only in `key_for`. That is one place, and it covers every keyed store. Without it, `Path::new("ssh://h/p").canonicalize()` resolves *relative to the process cwd*, so a local `./ssh:/…` directory would be silently matched.
- **D3: `remote_cmd` = `quote` + constant fragments.** Every **variable** value enters a remote command only through `quote` (POSIX single-quote form, applied once per shell layer it crosses). Fixed check commands containing an expansion (the preflight's `$(cat ~/.claudesk/cc-oauth-token)`) are compile-time `const` fragments in `remote_cmd` with no variable data in them. This restates arch §C's rule as "no *variable* value enters a remote command outside `quote`". **The spawn composer is WP3's (3.2).** WP2 leaves arch §C's (a)/(b) choice open. Recommendation recorded for WP3's spec: **(b), a deployed launcher**. WP3.7 already deploys `tmux.conf` to `~/.claudesk/<identifier>/`, so the launcher costs one more file in the same deploy. The spawn string then carries no expansion at all, and the "token never in the command string" test becomes trivial.
- **D4: the host string is validated before any ssh spawn.** It must not be empty or start with `-`, and must contain no whitespace or control characters. A host of `-oProxyCommand=…` would otherwise be a **local** RCE through ssh's option parsing. ssh is invoked as `ssh <opts> -- <host> <cmd>`.
- **D5: the preflight runs inside the add command**, not as a separate frontend-sequenced step. `add_remote_project` is the only writer of a remote row, so the arch §H rule "the row is written only after all of them pass" cannot be bypassed by a UI path.
- **D6: the preflight uses plain one-shot `ssh -o BatchMode=yes -o ConnectTimeout=10`**, with no ControlMaster. The master is WP3.1's, and a preflight is a one-off.

## Work Tree

- [x] Phase 1: Remote rows in the store (survive launch, keyed safely)
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml config_store` passes. These new tests must exist:
    - a `projects.json` with **no** `remote` key round-trips byte-identical;
    - a row with `remote` round-trips;
    - `prune_missing` keeps a remote row whose path doesn't exist locally while still dropping a missing local row;
    - an insert of `remote` + a non-default `profile` is rejected;
    - `set_project_profile` on a remote row is rejected;
    - a remote row whose `path != remote_key(remote)` is rejected at insert.
  - CLI (mutation, reverted by `cp` + `shasum`, never `git checkout`): deleting the prune exemption makes the prune test **fail**; restoring it makes it pass. Record the `Tests N` line for both runs.
  - CLI: `cargo test … remote_key` and `… canonical_key` pass:
    - `remote_key("u@h","/a/b") == "ssh://u@h/a/b"`;
    - `canonical_key(Path::new("ssh://u@h/a"))` returns its input **even when a `./ssh:/u@h/a` directory exists under the test's cwd** (the cwd-relative trap; a TempDir test);
    - `session_state::key_for` on a remote key is the identity;
    - no remote key equals any absolute local path.
  - CLI: `cargo test … announce` shows that `announce_actions` emits no entry for a remote row and never stats `<remote key>/workflow-system/state/.session.md`. `cargo test … editor_fs` shows that `validate_frontend_root`'s known roots exclude remote rows, so a remote key passed as `root` → `UnknownRoot`.
  - CLI (state-changing, **dev** app-data only: `~/Library/Application Support/com.claudesk.app.dev/projects.json`, backed up to the scratchpad and restored with a `shasum` check): seed one remote row by hand, launch `pnpm tauri:dev`, and let the picker mount run `prune_missing_projects`. The row is still in the file afterwards, and the prune toast does not name it. ⚠️ Never the prod `com.claudesk.app` file.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - none (pure data-model phase; D1/D2 are technical and disclosed above)
  - [x] P1.1 `RemoteTarget { host, path }` + `Project.remote: Option<RemoteTarget>` (`#[serde(default, skip_serializing_if = "Option::is_none")]`). The frontend `RecentProject.remote?` type.
  - [x] P1.2 `remote_key(host, path)` + `is_remote_key(s)`, the one identity function (in `config_store`, or a new `remote` module the later WPs share).
  - [x] P1.3 The `canonical_key` pass-through for remote keys (D2). `key_for` inherits it. Tests include the cwd-relative trap.
  - [x] P1.4 ⚠️ The `prune_missing` exemption **inside the pruner**, plus the mutation-proven test.
  - [x] P1.5 Store-level invariants: `add_remote` (insert or touch by key) rejects `remote` + profile and rejects `path != remote_key(remote)`. `set_project_profile` refuses a remote row.
  - [x] P1.6 Consumer exemptions: `announce_actions` skips remote rows, and `validate_frontend_root` drops remote rows from the known roots (a remote row has no local tree; defense in depth even though `canonicalize` would fail).
  - [x] verify-auto — evidence:
    - `pnpm verify:auto` → EXIT=0 (46 s): lint 0 errors, prettier, tsc, `check:link`, vitest 3856/3856, `cargo fmt --check`, clippy `--all-targets -D warnings`, `cargo test` (lib 1121 + integration suites) all green
    - `cargo test --lib -- remote canonical_key key_for_passes known_local` → 17/17 new tests pass
    - `cargo test --test stale_dead_code_allows -- --ignored` → 1 passed (38.8 s): the new `add_remote` attribute is accurate (load-bearing)
  - [x] verify-self (runner subagent, 2026-11-16; 6/6 PASS)
    - [x] Store tests: the 6 required tests (round-trip byte-identical, remote round-trip, prune keeps remote / drops missing local, remote+profile rejected, `set_project_profile` refused, key mismatch rejected) are present — evidence: `cargo test --lib config_store` → `ok. 151 passed; 0 failed`. Note: the mismatch and profile rejections are tested on `check_remote_invariants`, which `add_remote` runs before every write (on the new row and on a matching stored row).
    - [x] Mutation (prune exemption) — evidence: the mutant (`.partition(|p| p.path.exists())`, line 809) → `FAILED. 0 passed; 1 failed` (2 dropped, want 1). `cp` restore, shasum `9f0955e2…dcd` matches → `ok. 1 passed`. Second mutant (removing the `canonical_key` remote early-return) → the cwd-trap test `FAILED`; restored (shasum matches) → `ok`.
    - [x] Identity — evidence: `cargo test --lib remote_key` → `ok. 6 passed`, `canonical_key` → `ok. 2 passed`, `key_for_passes_a_remote_key_through_unchanged ... ok`. No `src-tauri/ssh:` left behind.
    - [x] Consumers — evidence: `cargo test --lib announce` → `ok. 32 passed` (a remote row with its unclean flag set gets no entry; the local positive control gets `continue`). `cargo test --lib editor_fs` → `ok. 55 passed`. ⚠️ Outcome wording corrected: a remote key passed as `root` is rejected with `EditorFsError::Io` (`validate_root` canonicalizes the requested root first; the relative `ssh://…` fails), not `UnknownRoot`. Either way it is rejected, and `known_local_roots` never lists a remote row.
    - [x] Dev-app prune survival (state-changing, dev `projects.json`, restored) — evidence:
      - Seeded 1 remote row beside 7 local rows and launched `pnpm tauri:dev` (marker-stripped env).
      - The picker-mount prune rewrote the file: mtime 1794836246 → 1794836265.
      - All 8 rows are present afterwards, the remote row unchanged.
      - The no-toast finding is from code (`pruneToastMessage` returns null when nothing is dropped). `screencapture` failed ("could not create image from display"), so there is no screenshot.
      - Only the agent's own PIDs were stopped. The restored file's shasum `2ffd1b3d…702a` matches.
    - [x] `pnpm verify:auto` (after the restores) — evidence: exit 0; vitest 3856/3856, cargo lib 1121/1121
  - [x] verify-human — zero admissible leaves (F11), advanced per drive_mode=autopilot (2026-11-16)
  - [x] verify-codify (2026-11-16)
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 47 s)
    - No new tests needed. Every verified behaviour already has a regression test written at build, and two of them are mutation-proven:
      - `prune_missing_never_drops_a_remote_row` (prune exemption);
      - `canonical_key_passes_a_remote_key_through_even_when_a_cwd_relative_match_exists` (pass-through).
    - Consuming surface: the `prune_missing_projects` command is a one-line wrapper over `prune_missing`, which is tested directly. The live launch was the end-to-end check (verify-self).
    - Evidence: `pnpm verify:auto` → EXIT=0; vitest 3856/3856, cargo lib 1121/1121.

- [x] Phase 2: `remote_cmd::quote` + the async preflight and add command
  **Observable outcomes:**
  - CLI: `cargo test … remote_cmd` passes, including a **real-shell round-trip**. For each hostile input (spaces, `'`, `"`, `$HOME`, `` `id` ``, `$(id)`, `\n`, a leading `-`, `;rm -rf x`, UTF-8), the value is quoted for N layers (N = 1, 2, 3) and run through N nested local `zsh -c` / `sh -c`. The innermost `printf %s` returns the input **byte-exact**, and a canary file the payload tries to create **does not exist** afterwards.
  - CLI: `cargo test … preflight` passes. The host validator (D4) rejects `""`, `-oProxyCommand=x`, `a b`, and `a\nb` **before any process spawn**: an injected spawner records zero calls. Stderr→message mapping:
    - `Could not resolve hostname` → "could not resolve hostname: is Tailscale running?"
    - `Permission denied (publickey…)` → a plain key-not-accepted message
    - `Host key verification failed` → "run `ssh <host>` once in a terminal to accept its host key"
    - a missing tool names the tool
    - a missing path names the path
    - a missing or empty token file and `loggedIn: false` both name the `claude setup-token` fix
  - CLI: `src-tauri/tests/sync_commands_do_not_block.rs` passes, with `add_remote_project` (and `remote_preflight` if exposed) listed in `ASYNC_COMMANDS` with a reason, and all ssh I/O on `spawn_blocking`.
  - CLI (real host, read-only on the remote; the host is in `tmp/m17-remote-host.local`, gitignored): invoking `remote_preflight` through the dev app (MCP bridge `ipc_execute_command`) against `<mini-host>` and an existing project path returns every check PASS. With a nonexistent path it returns the path-missing failure. With host `nosuchhost.invalid` it returns the Tailscale message. Nothing is written on the mini (`ssh <mini-host> 'ls -la ~/.claudesk'` is unchanged, by a before/after listing).
  - CLI (state-changing, **dev** `projects.json`, backed up and restored as in Phase 1): `add_remote_project` against `<mini-host>` + a real path writes exactly one row, with `project_path == "ssh://<mini-host><path>"` and `remote` set. A second call with the same host/path touches the row and does not duplicate it. A failing preflight writes nothing (the file's `shasum` is unchanged).
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - (decision) A path typed as `~/x` is expanded with the **remote** `$HOME` during the preflight and stored absolute. The alternative is to reject anything not starting with `/`. The plan takes the expansion. Still what you want once you see it in Phase 3's form?
  - [x] P2.1 `remote_cmd` module: `quote(&str) -> String` (POSIX `'…'` with `'\''`) and the constant fragments (`quote_n` dropped: nested `quote` calls express every layer, and nothing needed it) (D3). A module doc states the restated rule and the (b) recommendation for WP3.
  - [x] P2.2 Host and path validation (D4), plus the `~/` expansion via remote `$HOME`.
  - [x] P2.3 The preflight runner with an injectable spawner. It runs the checks in order (key/resolve → `zsh -lc 'command -v tmux claude perl'` → `test -d` → token file + `claude auth status` → `loggedIn`), stops at the first failure, and returns a typed per-check result. The stderr→plain-words map.
  - [x] P2.4 The `add_remote_project(host, path)` async command (preflight, then `add_remote` through `update_projects`) and, for the UI's progress line, a `remote_preflight` read-only command. Both go in `ASYNC_COMMANDS` with reasons and are registered in `lib.rs`.
  - [x] verify-auto — evidence:
    - `pnpm verify:auto` → EXIT=0: vitest 3856/3856, cargo lib 1140 passed / 1 ignored (the opt-in live test), clippy `-D warnings`, `cargo fmt --check`, and `sync_commands_do_not_block` (16/16, with both new async commands in `ASYNC_COMMANDS`) all green
    - `cargo test --lib remote_cmd` → 19/19 (quote round-trip through real sh/zsh/bash ×1–3 layers, the canary positive control, the preflight script in real zsh with a payload-named dir, the host allow-list, the stderr→words map, the real ssh to `nosuchhost.invalid` → Tailscale hint)
    - `cargo test --test stale_dead_code_allows -- --ignored` → 1 passed (no stale allow left after deleting `add_remote`'s)
  - [x] verify-self (2026-11-16; the runner subagent did the CLI outcomes and mutations, and the orchestrator drove the dev-app IPC because the tauri bridge isn't exposed to subagents). 6/6 PASS + 1 CAPTURED
    - [x] `remote_cmd` round-trip — evidence: `cargo test --lib remote_cmd` → `ok. 19 passed; 0 failed; 1 ignored`. Mutant (`quote` stops escaping `'`): `FAILED. 5 passed; 3 failed`. sh x1 fails on `"it's"`, and the hostile-path zsh test's stdout shows the injected `echo` payload ran. `cp` restore, shasum matches → green.
    - [x] Preflight validation + wording — evidence:
      - `a_bad_host_is_refused_before_any_exec` (zero fake calls), `connect_failures_are_plain_words` and `each_check_failure_names_what_failed` pass.
      - Mutant (fall through after the host-validation failure) → `FAILED … unexpected exec: printf '%s' "$HOME"`. Restored.
    - [x] Async ledger — evidence: `cargo test --test sync_commands_do_not_block` → `ok. 16 passed`. Both commands are `async` and run on `on_blocking_worker` (`spawn_blocking`). Only `resolve_data_dir` runs before the hop.
    - [x] **Consuming surface: the dev app's `remote_preflight` IPC** (`pnpm tauri:dev`, `__TAURI_INTERNALS__.invoke`; `list_projects` → 7 rows, which confirms the dev data dir) — evidence:
      - `<mini-host>` + `~`: connect, tools, path, token and auth all ok; `resolved_path` = `/Users/<user>`.
      - `~/claudesk-verify-nope-p2`: path fails with "… is not a directory on <user>@<mini-host>".
      - `nosuchhost.invalid`: connect fails with "could not resolve hostname nosuchhost.invalid: is Tailscale running?".
      - Live CLI runs (runner): `~` and `~/<real dir>` 5/5 PASS in 585 ms.
      - Remote `ls -la ~/.claudesk` before/after diff: IDENTICAL (shasum `15bcfda7…`).
    - [x] **Consuming surface: the dev app's `add_remote_project` IPC** (state-changing, dev `projects.json`, backed up and restored) — evidence:
      - A failing add (missing path) returns its plain-words error, and the rows are the same set as the backup (0 ssh rows; the launch prune re-sorts the file, so content was compared, not shasum).
      - `add ~/<real dir>` → one row with `project_path` = `ssh://<user>@<mini-host>/Users/<user>/<real dir>` and `remote` set.
      - A second add with the absolute path plus a trailing `/` touched the same row: 8 rows, 1 ssh row, `path == ssh://host+remote.path`.
      - A hostile host `-oProxyCommand=touch /tmp/claudesk-pwned` → "a host cannot start with "-"". The file shasum is unchanged (`11ad062c…` before and after) and `/tmp/claudesk-pwned` was never created.
      - Teardown: only the agent's own PIDs (84018/84048/84218/84252/84338) were stopped, nothing is left on :1420, and the restored file's shasum `2ffd1b3d…` matches.
    - [x] `pnpm verify:auto` (after the mutant restores) — evidence: exit 0; vitest 3856/3856, cargo lib 1140 passed / 1 ignored
    - [x] align (decision): `~` expansion — evidence: `~` → `/Users/<user>`; `~/my-claude-code-customization` → `/Users/<user>/my-claude-code-customization` (live). Unit: `~/proj/` → `/Users/u/proj`; a bare `proj` → path-format error before the check script runs.
  - [x] verify-human (2026-11-16, operator)
    - [x] P2.verify-human.1 (decision): `~` / `~/x` is expanded with the REMOTE `$HOME` and stored absolute — **operator: keep the `~` expansion** (2026-11-16)
  - [x] verify-codify (2026-11-16)
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 47 s)
    - Added 2 command-body tests in `remote_cmd/commands.rs` (`run_preflight` with a scripted ssh → `add_after_preflight`, i.e. the `add_remote_project` body minus the real ssh). These pin the two compositions the dev-app checks exercised:
      - `a_hostile_host_writes_nothing_and_never_reaches_ssh`;
      - `tilde_and_trailing_slash_spellings_add_one_row` (pins the operator's `~` ruling).
    - Everything else was already covered by the build's tests (19 in `remote_cmd`, two mutation-proven in verify-self). The live behaviour stays covered by the opt-in `live_preflight_against_a_real_host`.
    - Evidence: `pnpm verify:auto` → EXIT=0; vitest 3856/3856, cargo lib 1142 passed / 1 ignored. (The first run was EXIT=101: clippy `manual_is_multiple_of` in the new test's fake. Fixed to `n.is_multiple_of(2)`; it was a lint, not a test failure, so no triage entry was needed.)

- [x] Phase 3: Picker: "Add remote project…", the remote row, remove, open stub
  **Observable outcomes:**
  - Browser (dev app via the `tauri` MCP bridge, DOM reads a frame after each click): the picker shows a `data-testid="picker-add-remote"` button beside "Open Folder…". Clicking it reveals a form with host and path inputs plus Add / Cancel. Submitting shows a "Checking…" state, and then either a new row at the top of the list or an inline error naming the failed check.
  - Browser (state-changing, dev `projects.json`, backed up and restored): adding `<mini-host>` + a real path renders a row whose label is the path's basename. Its path line shows `<host>:<path>` (not the `ssh://` key) with a remote marker (`data-remote="true"`). The row has **no profile cell**, and it keeps the model and drive-mode cells.
  - Browser: clicking the remote row (both the row door and `⏵`) opens **no** workspace. The filmstrip/workspace count is unchanged, an info toast says remote workspaces open in a later build, and `record_open` is not invoked: `last_opened_at` in the dev `projects.json` is unchanged.
  - Browser: the row's remove (×) deletes it from the list and from the dev `projects.json`.
  - Browser: after an app relaunch the remote row is still listed (prune survives end to end).
  - CLI: vitest covers each of these:
    - `matchesFilter` matches on the host;
    - the open stub refuses both doors;
    - `PickerRow` renders no profile cell for a remote row;
    - a jsdom render of the form shows the error text from a rejected `add_remote_project`.
  - CLI: `pnpm verify:auto` exits 0.
  **Alignment questions:**
  - Happy path: in the dev app, add the mini with a real project path. Are the form's placement, wording and "Checking…" feedback what you want?
  - The row as rendered (basename label, `<host>:<path>` line, remote marker, no profile cell): is this how a remote row should read in the list?
  - (decision) The open stub's toast wording and that **both** doors are refused until WP3. Fine for an interim dev build?
  - [x] P3.1 `RecentProject.remote`. `matchesFilter` includes the host. `PickerRow` renders the remote variant (label, `host:path` line, marker, no profile cell).
  - [x] P3.2 The "Add remote project…" inline form, calling `add_remote_project`, with progress and error states. The new row is prepended exactly like `handleOpenFolder` does it.
  - [x] P3.3 The open stub in `handleOpenRecent`: a remote row → info toast, no `record_open`, no `onOpen`. Placed in the funnel so both doors get it.
  - [x] P3.4 Remove works unchanged through `remove_project(path = key)`, with a test.
  - [x] verify-auto — evidence:
    - `pnpm verify:auto` → EXIT=0 (after a `prettier --write` of the 3 new files; the first run failed `format:check` only): lint 0 errors, tsc, `check:link`, vitest 301 files / 3864 tests, cargo fmt/clippy, cargo lib 1142 passed / 1 ignored
    - `vitest run src/components/picker` → 26 files / 202 tests, including the new `remoteRow.test.ts` (3) and `pickerRemoteLive.test.tsx` (5)
    - **Re-run after the P3.verify-human.2 fix (F12 re-entry, 2026-11-16):** `pnpm verify:auto` → EXIT=0; vitest 301 files / 3865 tests (+1, the `shortHost` test), cargo lib 1142 passed / 1 ignored. `vitest run src/components/picker` → 26 / 203 green.
  - [x] verify-self (2026-11-16; the orchestrator drove the dev app via the tauri bridge, then the runner subagent did the mutation proofs with no dev app running): 7/7 PASS + 3 CAPTURED
    - [x] **Consuming surface: the picker page, "Add Remote Project…"** (dev app, `pnpm tauri:dev`) — evidence:
      - The button `picker-add-remote` ("Add Remote Project…") sits beside "Open Folder…" and opens the form.
      - Host `nosuchhost.invalid` + `~/x` → inline error "could not resolve hostname nosuchhost.invalid: is Tailscale running?" with 7 rows unchanged.
      - The real `<mini-host>` + `~/my-claude-code-customization` → mid-flight read: button "Checking…", inputs disabled, status "Checking <user>@<mini-host>: ssh key, tmux/claude/perl, the folder, and Claude Code login…".
      - After the add: the form closes, 8 rows, toast "Added my-claude-code-customization on <user>@<mini-host>."
    - [x] Remote row render (live) — evidence: the top row has `data-remote="true"`, name `my-claude-code-customization`, marker `⇄ remote` (title "Runs on <user>@<mini-host> over SSH"), and path line `<user>@<mini-host>:/Users/<user>/my-claude-code-customization`. No `ssh://` appears in its text, there is **no `project-profile-line`**, and the model cell is present. Positive control: the next (local) row has its profile line. Screenshot: `<scratch>/p3-picker-remote-row.png` (scratch only; it shows the real host).
    - [x] Open stub (live) — evidence:
      - A row click shows an info toast "Remote workspaces can't be opened yet: <user>@<mini-host> is saved, and opening it arrives in a later build."
      - The picker is still shown, with no stage, workspace or filmstrip elements.
      - The dev `projects.json` shasum is unchanged (`b274e4f9…` before and after), and the remote row's `last_opened_at` is unchanged (1794837726016), so there was no `record_open`.
      - The `⊘` door doesn't render on a remote row live (the backend announces nothing for remote rows). Both doors are pinned by the vitest test with a mocked announcement.
    - [x] Filter (live) — evidence: the query `ts.net:/users/<user>/my` (the shown form, not in the `ssh://` key) leaves exactly the remote row.
    - [x] Relaunch survival (live) — evidence: the dev app was killed and relaunched (only the agent's own PIDs), and the remote row is still listed (8 rows) with no prune toast.
    - [x] Remove (live) — evidence: × on the remote row → 7 rows, 0 remote. The file's rows are the same set as the pre-phase backup. Teardown: the agent's PIDs were stopped, :1420 is free, and the restored file's shasum `2ffd1b3d…` matches.
    - [x] Vitest coverage + mutations (runner) — evidence:
      - `vitest run remoteRow.test.ts pickerRemoteLive.test.tsx` → `Tests 8 passed`.
      - Five mutants each failed exactly the expected test (`Tests 1 failed | 7 passed`): refusal no-op, dropped `shown` filter term, profile line forced on, `setError(null)`, raw-key path line.
      - All restored, with shasums verified.
    - [x] `pnpm verify:auto` (after the restores) — evidence: exit 0; vitest 301 files / 3864, cargo 1187 passed / 0 failed
    - [x] align: happy path (the form's placement, wording, "Checking…") — evidence: the live readings above + the screenshot `p3-picker-remote-row.png`
    - [x] align: the row as rendered — evidence: the screenshot. ⚠️ **Observed:** with a long Tailscale MagicDNS host, the `host:path` line truncates INSIDE the host (`<user>@<mini-host>:/Use…`), so the path, which is the part that distinguishes projects, is cut. The name line still shows the project basename.
    - [x] align (decision): the open stub's toast wording and both doors refused — evidence: the toast text above
    - [x] **F12 re-entry (the P3.verify-human.2 fix)** — evidence:
      - Live re-read in the dev app (picker page): marker `⇄ <mini-host>`, tooltip with the full host, path line `/Users/<user>/my-claude-code-customization`, not truncated. Screenshot `<scratch>/p3-picker-remote-row-v2.png`.
      - Runner mutation proofs, with no dev app running: baseline `Tests 9 passed`. Five mutants each fail ≥1 test: path line back to `host:path` (2 fail), no dot cut (2), `user@` kept (2), full host on the marker (1), host dropped from the filter (1). Restored, shasums match.
      - `pnpm verify:auto` → exit 0; vitest 3865, cargo lib 1142.
  - [x] verify-human (2026-11-16, operator; one F12 round-trip on .2)
    - [x] P3.verify-human.1: happy path, tried in the running dev app — **operator: "Yes, as built"** (2026-11-16)
    - [x] P3.verify-human.2 (decision): the path line truncates inside a long host. FAILED at the first look; **operator approved the fix on re-check (2026-11-16): "Yes, approve"**
      **Fixed in build (F12 re-entry, 2026-11-16):**
      - `pathLineFor` now returns the remote path; the new `shortHost` (drops `user@`, cuts at the first `.`, keeps IPs and `[v6]` whole) drives the marker `⇄ <short host>`, whose `title` is the full host; the filter matches `remoteSearchText` (`user@host:path`).
      - Tests updated to pin the ruling, plus 1 new `shortHost` test (picker 26 files / 203 tests green).
      - Live re-read in the operator's dev app (row re-added via the form): marker `⇄ <mini-host>`, tooltip "Runs on <user>@<mini-host> over SSH", path `/Users/<user>/my-claude-code-customization`, `scrollWidth <= clientWidth` (not truncated). Screenshot `<scratch>/p3-picker-remote-row-v2.png`.
      - That remote row is LEFT in the dev `projects.json` for the operator to see (backup `<scratch>/dev-projects.p3r.bak`).
      **Operator ruling (2026-11-16):** the path line shows the REMOTE PATH only (`/Users/<user>/project`). The marker shows the host's FIRST LABEL (`⇄ <mini-host>`, i.e. `user@` dropped and cut at the first `.`), with the full `user@host` in its tooltip. The distinguishing part must never be cut. The filter must still match the host.
    - [x] P3.verify-human.3 (decision): the open-stub toast wording, and both doors refused until WP3 — **operator: "Fine as is"** (2026-11-16)
      - Operator follow-up: "what about a sad path? … the path entered is wrong or the folder is gone?" Answered:
        - A wrong path at add time is refused by the preflight (verified live in Phase 2), and the form keeps the inputs.
        - A folder deleted after adding is NOT checked anywhere yet. It is logged as SURFACE-2026-11-16-REMOTE-OPEN-MUST-CHECK-THE-FOLDER-STILL-EXISTS for WP3/WP5.
  - [x] verify-codify (2026-11-16)
    Test scope: full — last phase
    - Added 1 live test: `pickerRemoteLive.test.tsx` "while the preflight runs: 'Checking…', inputs locked, a status line naming the host". That busy state was verified live but untested. Mutation-proven: dropping the `Checking…` label → `Tests 1 failed | 5 passed`; restored (shasum match) → 6/6. (The dev app was stopped first so HMR could not load the mutant.)
    - Everything else verified this phase already has mutation-proven tests (the render, both doors, the filter, the add form's error and success paths, remove, `shortHost`). Relaunch survival is the Rust `prune_missing_never_drops_a_remote_row` (Phase 1).
    - Evidence: `pnpm verify:auto` → EXIT=0; vitest 301 files / 3866 tests; cargo 1187 passed / 0 failed (lib 1142 + integration and doc test binaries).

## Current Node
- **Path:** Feature > review-quality
- **Active scope:** review-quality. Shipped 2026-11-16: the full suite was re-run at ship (`pnpm verify:auto` EXIT=0, vitest 3866, cargo 1187), not reused, because the public-repo leak scan redacted the real host's short name from 2 `remoteRow.ts` comments after the codify run. Committed locally; push waits for the operator.
- **Blocked:** none
- **Unvisited:** review-quality, then finalize
- **Open discoveries:** none

## Build notes (Phase 1)
- ~~`add_remote` carries a per-item `#[allow(dead_code)]`~~ (removed in Phase 2; its consumer landed).
- `add_or_touch` now refuses to *create* a row from a bare `ssh://` key. It still touches an existing remote row, which is `record_open`'s path.
- `editor_fs::commands::known_local_roots` was extracted so the remote exclusion is unit-testable without an `AppHandle`.
- The canonical-key trap test creates `src-tauri/ssh:/claudesk-ck-<pid>/a` under the cwd and removes it in a Drop guard (verified: no `ssh:` left behind).

## Build notes (Phase 2)
- **Two execs, not one per check.**
  - Exec 1 is `printf '%s' "$HOME"`. It proves the host resolves and the key works, and it supplies `$HOME` for a `~/` path.
  - Exec 2 is one constant check script under `zsh -lc` that prints `ok:<check>` / `fail:<check>` lines and always exits 0. A non-zero exit therefore means ssh (255) or a missing zsh (127), never a failed check.
  - The token is read only remotely, and nothing but `ok:auth`/`fail:auth` comes back.
- **The ssh exec reuses `adjudicator::run_command`** (now `pub(crate)`): the same group-kill, drained-pipes, capped-output loop. It is not a second copy.
- **`add_remote`'s `allow(dead_code)` is deleted** (its consumer `add_remote_project` landed) and the ledger note is updated.
- **Live run against the mini:** `cargo test --lib live_preflight -- --ignored` with the host from `tmp/m17-remote-host.local` passed all five checks in 0.75 s (path `~` → the remote home).
- **Host validation is an allow-list:** alphanumerics plus `@ . _ - : [ ] %`, with no leading `-`. ssh is also invoked with `--` before the host.

## Build notes (Phase 3)
- New `src/components/picker/remoteRow.ts`, which holds three pure helpers:
  - `isRemoteRow`;
  - `pathLineFor` (`host:path`);
  - `remoteOpenRefusal` (the WP2 stub text).
- New `AddRemoteForm.tsx`: host and path inputs, Add / Cancel, a "Checking…" status, and the backend's error words shown verbatim.
- `ProjectPicker`:
  - the remote refusal sits in the `handleOpenRecent` funnel, before `record_open`, so both doors get it;
  - "Add Remote Project…" sits beside "Open Folder…" (title case to match);
  - a success prepends the new row and shows an info toast;
  - `matchesFilter` also matches the shown `host:path`.
- `PickerRow`: `data-remote`, a `⇄ remote` marker on the name's line, the `host:path` path line, and `remote` passed to `ProjectModelCell`, which then renders **no profile line** (model and drive mode stay).
- CSS reuses existing palette hexes: the marker is the neutral `#9b9b9b` (deliberately not blue, which is the awaiting-input hue) and the error is `#ff8a7a`.
- Tests: `remoteRow.test.ts` (3) and `pickerRemoteLive.test.tsx` (5, live jsdom mount).

## Notes for build
- ⚠️ **The repo is PUBLIC.** Write the host as `<mini-host>` / `<user>` in every tracked file. The real host is in `tmp/m17-remote-host.local` (gitignored). Grep staged blobs before any commit.
- ⚠️ **Operator's uncommitted files must not be swept into a commit:**
  - `.claude/memory/notarytool-…md` and its `MEMORY.md` line;
  - the `SURFACE-2026-11-06-CODIFY-RUNS-THE-FULL-SUITE-EVERY-PHASE` block in `backlog.md`;
  - the four `workflow-system/outbox/HANDOFF-to-mccc-*.md` files.

  Stage around them (memory `stage-around-operator-edits-via-blob`).
- ⚠️ No ssh I/O in a sync `#[command]` (`sync_commands_do_not_block.rs`).
- `canonical_key` callers: `WorkspaceRegistry`, `touch_closed`, `key_for`. Re-run their tests after D2.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
[SURFACED-2026-11-16] WP3/WP5 — the remote open path must check the folder still exists on the host (`prune_missing` exempts remote rows by design). Backlog: SURFACE-2026-11-16-REMOTE-OPEN-MUST-CHECK-THE-FOLDER-STILL-EXISTS.
