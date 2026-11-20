---
drive_mode: autopilot
---

# Feature: M18 WP4 — Substrate detection and the funnel's third input

**Workflow:** feature
**State:** finalize (complete)
**Completed:** 2026-11-20
**Created:** 2026-11-20
**WBS:** `workflow-system/product/wbs.md` → "WP4: Detection and the funnel's third input (+ the absent-host note)"
**Design:** `workflow-system/product/arch/claude-substrate.md` → "Remote hosts (M18)" §R.1, §R.2, §R.8
**Probe:** WP3 ✅ (`0c45070`) → `wbs.md` → "Probe outcomes" (4) is the drafted `SUBSTRATE_PROBE`; (5) is the CLT shim.

## Problem Statement

A remote workspace today shows every workflow surface (the skill row, Recycle, Session-Start, the Docs tab, the
drive-mode cell, and the auto `/session-restore`) whenever the gate is ON. Claudesk never checks whether the remote
**host account** has the workflow system installed. On a skill-less account each of those is a slash command the session
cannot run. WP4 makes the host the **third input of the one workflow funnel**:
`workflow_applicable(gate, profile, host)` in Rust and `isWorkflowApplicable(gate, profile, host)` in TS.
- `Local` is always applicable, so local behaviour stays byte-identical.
- `Remote` is applicable only when the substrate is present (Managed or Developer). Unknown fails closed.

Detection rides the open check's existing single exec, as a constant `SUBSTRATE_PROBE` that is held to the local
`skills_dir_exists` by a parity test. The answer is cached per host in `LinkRegistry` and broadcast as
`remote-substrate`. With the gate ON and the substrate absent, the workspace gets one plain-words note in the skill-row
slot (a new OFF-invariant subject, which moves the pin to 6 arms / 11 subjects). With the gate OFF nothing is probed
and nothing changes.

Problem statement unchanged (P3.verify-human.1 back-loop, 2026-11-20): the operator approved the note, its place and
Docs-absent. Only its host label changes, to the picker's short-host form.

**Folded in** (WP3 review, `backlog-quality-findings.md` → `# m18-wp3-remote-substrate-probe — 2026-11-20`; all
resolved by this WP):
- `SURFACE-2026-11-20-QUALITY-SUBSTRATE-PROBE-RUNS-THE-GIT-SHIM` (MAJOR) → P1.1 reads `HEAD` in perl, with no `git`.
- `SURFACE-2026-11-20-QUALITY-SUBSTRATE-PROBE-HAS-NO-SANDBOX-ROOT-SEAM` (MAJOR) → P1.3, a debug-only export ahead of the
  constant.
- `SURFACE-2026-11-20-QUALITY-SUBSTRATE-ROOT-LINE-NO-NEWLINE-GUARD` (MINOR) → P1.1 + P1.2.
- The non-UTF-8 `install.sh` divergence ("Probe outcomes" (4)) → P1.4: the Rust predicate reads bytes.

**Not here:** `SURFACE-…-INSTALL-SH-WINDOW-UNGUARDED…` is WP6 task 6.3b. The WP2 / WP2.5 MAJORs are due before WP6,
not in WP4.

## Design decisions taken at plan time (autopilot: defaults taken, each one disclosed)

- **D1 — HEAD without git.** In the same perl process, the probe reads `<root>/.git/HEAD`.
  - If that is `ref: <r>`, it reads `<root>/.git/<r>`, falling back to the matching line of `<root>/.git/packed-refs`.
  - A detached HEAD is printed as is.
  - Anything else (a `.git` *file*/worktree, an unreadable file, or not 40 hex characters) prints **no** head line, so
    the head is unknown.
  - The head is informational (WP5's readout) and never decides presence.
- **D2 — the sandbox seam.** In debug builds only, when the Mac-side env `CLAUDESK_REMOTE_SUBSTRATE_ROOT` is set to a
  normalized absolute remote path, the open-check script gets `CLAUDESK_SUBSTRATE_HOME=<quoted root>; export
  CLAUDESK_SUBSTRATE_HOME` ahead of the constant.
  - The fragment reads `$ENV{CLAUDESK_SUBSTRATE_HOME} // $ENV{HOME}` for both the skills dir and the record. It stays
    constant, so the parity guard holds.
  - A release build's command is byte-identical with or without the env (a `#[cfg(not(debug_assertions))]`-shaped
    test, mirrored by a pure builder that takes the root as `Option<&str>`).
  - An invalid value is ignored with an `eprintln!`, never interpolated.
  - It is the same env name WP6 uses for the install root (§R.3), so there is one sandbox knob.
- **D3 — the newline guard.** perl skips printing the root line when the root contains `\n`. The `substrate:yes` line is
  still printed, so parity holds, but the root is unknown. Rust takes the root through `is_normalized_remote_path`.
- **D4 — the wire shape.**
  - `OpenFacts.substrate: Option<SubstrateRead>`. It is `None` when not probed (the gate is OFF or the profile is not
    default), `Some(Unknown)` when probed but no `substrate:` line came back (no perl, or a broken read), and
    `Some(Known(HostProbe{present, root, head, record}))` otherwise.
  - The record is read through a new `provenance::parse_record(&[u8])`, which `read_record` also uses (one parser).
  - `HostSubstrate` = `Unknown | Absent | Developer{root, head} | Managed{root, head, record}`, via the existing
    `resolve_state`.
- **D5 — the cache write rule.** Only a successful open-check exec writes the cache. Its `Unknown` overwrites an older
  value, because it is the latest truth. An exec failure (link down, or an Unreachable or Invalid outcome) leaves the
  cache untouched, and so does a gate-OFF check (no probe).
- **D6 — the TS host input.** It is `HostInput = "local" | HostSubstrate | undefined`. `undefined` and `Unknown` are
  closed.
  - `useHostSubstrate(projectPath)` returns `"local"` for a local key with **no IPC**.
  - For a remote key it reads one module store, which the first remote consumer starts: it listens to
    `remote-substrate`, THEN seeds from `remote_host_substrates`, so no change falls in a gap. It is the seam-hook shape
    (never a one-shot read).
  - The picker reads the same store through `useHostSubstrates(active)` + `hostSubstrateFor(path, map)`, because a hook
    cannot be called per row inside `map`.
  - `[Updated 2026-11-20 at build]` This replaces a per-hook `useTauriListen`, which subscribes (an IPC call) even for a
    local key. The single-host command `remote_host_substrate` was dropped as unneeded.
- **D7 — the guard extension.** `workflowApplicableGuard` also checks every production `isWorkflowApplicable(` call: it
  must have **three** top-level args, and the third must be bound from `useHostSubstrate(` / `hostSubstrateFor(`
  (never a literal `"local"`). A Rust behavioural test per backend consumer feeds a remote key whose host is
  Absent / Unknown and asserts not-applicable. A behaviour test, not a source regex, per `source-text-guards.md`.
- **D8 — the note's predicate.** It is `isWorkflowHostBlocked(gateOn, profile, host)`: gate ON ∧ default profile ∧
  host remote ∧ not present.
  - It sits in `workflowApplicable.ts`, beside the funnel, as its second accepted wrapper of the raw gate (the guard's
    accepted shapes grow by exactly this one name).
  - Wording, when Absent: "The workflow system isn't installed for `<user@host>`. Install it in Settings → Remote
    hosts."
  - Wording, when Unknown: "Claudesk couldn't check whether the workflow system is installed for `<user@host>`."
  - Its action button opens Settings. Landing on the Remote hosts group is WP5's (added to WP5 as task 5.2b), because
    the group does not exist until then.
- **D9 — picker remote rows.** A remote row's drive-mode cell and the `/session-restore` part of its announce follow
  the cached host. Before any open check of that host in this app session, the host is unknown, so they are absent.
  This is fail closed, per §R.1. It is a visible change for the tank row until its first open, so it is an Alignment
  question.

- **D10 — the open check's restore arm and the picker's open (added at P2 build, 2026-11-20).**
  - **The open check** produces the host input, so it cannot read it before probing. It decides "probe at all?" with
    `workflow_applicable_before_host_probe` (gate ∧ default profile). It then applies the full funnel to what it
    probed: restore = `.session.md` ∧ `workflow_applicable(probed, None, Remote(substrate))`. That is ONE control,
    because "it probed" IS the pre-host gate as the exec observed it. A second gate param would mask the first (the
    redundant-controls pattern).
  - **The picker's remote START** takes its host input from the check's own answer: the new
    `StartSignals.hostSubstrate`, read through `hostFromOpenCheck`. The cached map is not used there. Found at build:
    the map is the last render's value, from before this check wrote the cache, and the `remote-substrate` event is not
    ordered against the command's response. With the map, the first remote open after a launch would have dropped
    `/session-restore` on a host that has the workflow system.

## Work Tree

- [x] Phase 1: Detection — `SUBSTRATE_PROBE`, `OpenFacts.substrate`, the per-host cache, the `remote-substrate` event
  **Observable outcomes:**
  - CLI: `cargo test substrate_probe_agrees_with_skills_dir_exists` passes. It runs the real `remote_cmd::SUBSTRATE_PROBE`
    under `zsh -c` with a temp `HOME` against **every** fixture shape and asserts agreement with `skills_dir_exists`
    case by case:
    - the 12 shapes from WP3: none, no skills dir, skills is a file, empty, a user's real dir, a dangling link, a repo
      without an installer, an installer without the marker, the marker, a user dir + a marker link, a marker link
      under a dotfile name, the skills dir itself a symlink;
    - plus a non-UTF-8 installer that holds the marker, and a repo path that contains `\n`;
    - `[added at P1 verify-self]` plus a real dir under a marker installer two levels up, and a link dangling into a
      marker repo (16 in all).
    Every positive must print the canonicalized root, except the newline one, which prints none.
  - CLI: the same test file covers HEAD, asserting the printed head equals the fixture's commit sha for a loose ref, a
    packed ref (after `git pack-refs --all`) and a detached HEAD, and that no head line is printed for a `.git` file.
    A `PATH` with a failing `git` stub first in line changes nothing, which proves no `git` runs.
  - CLI: mutation-proven. Changing the marker in `SUBSTRATE_PROBE` alone turns the parity test red, and so does
    deleting the `next unless -l $e` guard alone, and so does deleting the `&& -e $t` check alone. Each mutant is restored by `cp` + `shasum`, each run shows a
    `test result:` line, and the live dev app is stopped first.
  - CLI: `cargo test open_check` covers four things:
    - with the gate OFF, the command contains no `substrate`, no `install-record` and no `CLAUDESK_SUBSTRATE_HOME`;
    - with the gate ON, it contains `SUBSTRATE_PROBE` verbatim;
    - `parse_open_facts` maps no line → `Some(Unknown)`, `no` → Absent, `yes` + no record → Developer, and `yes` + a
      well-formed record hex → Managed;
    - a malformed hex or a malformed record reads as Developer, never Managed.
  - CLI: the release-shape builder (`root = None`) is byte-identical to today's gate-ON command plus the constant. The
    debug builder with an invalid root (relative, `~`, or containing `\n`) yields the same bytes as `None`.
  - CLI: `cargo test` on the cache covers three things:
    - a set that changes the value emits exactly one `remote-substrate` event, and an identical set emits none;
    - a failed exec or a gate-OFF check leaves the cached value as it was;
    - two hosts are cached independently.
  - CLI (live, read-only, the dev build, the gate ON, the `~/claudesk-scratch-remote` scratch row on the mini's dev
    account): the open check runs, then the bridge `invoke('remote_host_substrates')` maps the mini's host to Developer
    with `root` equal to the host's `cd ~/my-claude-code-customization && pwd -P`, and `head` equal to that clone's
    `.git` HEAD, read by the agent's own ssh.
  - CLI (live, read-only, debug sandbox; the dev app relaunched with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs path of an
    empty dir on the host>`): the same row reads **Absent**. The live account's `~/.claude/skills` link count and the
    `CLAUDE.md` shasum are unchanged before and after.
  **Alignment questions:**
  - none (all checks are pass/fail; the live readings are Observable outcomes).
  - [x] P1.1 `remote_cmd::SUBSTRATE_PROBE`: adopt "Probe outcomes" (4)'s draft, with D1 (HEAD in perl), D3 (the newline guard) and D2's `$ENV{CLAUDESK_SUBSTRATE_HOME} // $ENV{HOME}`  <!-- status: done -->
  - [x] P1.2 `open_check_command` (its `check_session_md` param becomes `workflow`: the `.session.md` read + the probe) + `OpenFacts.substrate` / `SubstrateRead` / `HostProbe` + parsing (hex → bytes → `provenance::parse_record`; the root through `is_normalized_remote_path`)  <!-- status: done -->
  - [x] P1.3 D2: the debug-only `CLAUDESK_REMOTE_SUBSTRATE_ROOT` → a quoted export prefix; a pure builder that takes `Option<&str>`; the release byte-identity test  <!-- status: done -->
  - [x] P1.4 `workflow_substrate::skills_dir_exists` reads `install.sh` as BYTES (the marker is ASCII), settling the divergence. `provenance::parse_record(&[u8])` is extracted, and `read_record` routes through it  <!-- status: done -->
  - [x] P1.5 The parity test `substrate_probe_agrees_with_skills_dir_exists` (16 fixtures, 2 added at verify-self) + the HEAD fixtures + the git-stub PATH check  <!-- status: done -->
  - [x] P1.6 `HostSubstrate` + `resolve_state` mapping; `LinkRegistry` per-host cache + `set_substrate` (emits on change through a second sink) + D5's write rule in `remote_open_check`; sync `remote_host_substrate(project_path)` + `remote_host_substrates()` commands (registered, and added to the sync-command ledger if needed); `useHostSubstrate` / `useHostSubstrates` + a TS mirror type  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (61s). It reports vitest 322 files / 4094 tests passed (incl. the new
    `useHostSubstrate.test.tsx`, 6, with a positive control for the listen), `cargo test` lib 1399 passed (incl.
    `remote_substrate::parity::substrate_probe_agrees_with_skills_dir_exists` 14 fixtures, the HEAD / no-git / sandbox
    tests, the open-check probe/parse/sandbox tests and the cache/settle/decide tests), all integration tests ok
    (`sync_commands_do_not_block` covers the new sync `remote_host_substrates`), clippy `-D warnings` and `fmt --check`
    clean. Two rounds were needed: Prettier on the new test, then three clippy findings (`then_some`, `is_multiple_of`,
    and `LinkRegistry::substrate` unread outside tests, given a `cfg_attr(not(test), allow(dead_code))` that P2.2 must
    remove). ESLint's 1 warning is pre-existing (`XtermPane.tsx:988`, unchanged since `e38cdc7`).
  - [x] verify-self  <!-- status: done -->
    - [x] vs.1 parity, 16 fixtures (runner)  — evidence: `cargo test --lib substrate_probe_agrees_with_skills_dir_exists` → `test result: ok. 1 passed`; the runner read `fixtures()`: per-fixture asserts local==expected, probe.present==local, probe.root==canonical root (newline fixture → None)
    - [x] vs.2 HEAD without git (runner)  — evidence: `the_probe_reads_head_from_dot_git_without_git` → ok (loose/packed/detached = sha, `.git` file → None); `the_probe_never_runs_git` → ok (stub first on PATH after env_clear; no canary)
    - [x] vs.3 mutation-proven (runner, re-verified by a FRESH runner after the in-place fix)  — evidence: M1 marker → FAILED on "the marker"; M2 `next unless -l $e;` deleted → FAILED on "a real dir under a marker installer two levels up"; M3 `&& -e $t` deleted → FAILED on "a link dangling into a marker repo"; each landed by grep, restored by `cp` with sha `1dce100c…dc55a16` matching; restored parity ok, `remote_substrate` 7/7. ⚠️ First run: M2 SURVIVED (no fixture separated a real dir from a link), see `[SHORTCUT-2026-11-20]`
    - [x] vs.4 open-check probe/parse (runner)  — evidence: `cargo test --lib open_check` → 11 passed; `the_substrate_lines_parse_and_fail_closed` ok; `remote_substrate::tests` 3 passed (malformed / wrong-shape / non-UTF-8 record → Developer, never Managed)
    - [x] vs.5 release-shape builder (runner)  — evidence: `the_sandbox_root_is_debug_only_and_never_interpolated_unvalidated` → ok (debug=false ignored, byte-identical to None; 7 invalid roots ignored)
    - [x] vs.6 cache (runner)  — evidence: the three cache/settle/decide tests → ok each (3 events for 3 changes, none for identical; per host; no-probe decision leaves the cache; every answered decision carries the substrate)
    - [x] vs.7 live, read-only, dev build, gate ON, scratch row `<user>@<mini-host>:~/claudesk-scratch-remote` (orchestrator, bridge)  — evidence: `remote_host_substrates` before = `{}`; `remote_open_check` → `start` in 838 ms; after = `{"<user@host>": {state: "developer", root: "/Users/<u>/my-claude-code-customization", head: "f8e8873970c0…"}}`, equal to the agent's own ssh read (`pwd -P` + `.git/refs/heads/main` = `f8e8873970c0071254f0ddb98a1d8c6e6ed8660d`); the key's account is `stayman` (not the root-ops one); gate read `true`
    - [x] vs.8 live, debug sandbox (orchestrator, bridge; state-changing as declared: an empty `~/claudesk-m18-wp4-sandbox` on the host, removed after)  — evidence: relaunched with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=/Users/<u>/claudesk-m18-wp4-sandbox` → the same row's check → `{state: "absent"}`. Live account before = after: 48 skill links, `CLAUDE.md` sha256 `539e1b954fa84d45…`, no record. Cleanup: sandbox `rmdir`'d (gone), no `claudesk-dev` tmux server, only prod's `ssh -M` (pid 6044, tank) left, dev `projects.json` / `settings.json` restored from backup (shas `b30fd5f8…` / `0fc30928…`)
    - [x] vs.9 hook seam (runner)  — evidence: `vitest run src/state/__tests__/useHostSubstrate.test.tsx` → 6 passed (local → `calls == []` with events unmocked; positive control: a remote key's `plugin:event|listen` reaches the handler)
    - No integration boundary reaches a user-visible surface yet: Phase 1 adds the probe to the EXISTING `remote_open_check` (consumed by the picker's remote open), and vs.7/vs.8 drive that consuming command directly. The open still answered `start` (unchanged behaviour), so the picker's path is intact.
  - [x] verify-human  <!-- status: done --> — zero admissible leaves (F11)
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 61s)
    — evidence: no new tests needed. Every verified behaviour already has a regression test written at build (parity
    ×16 fixtures killing M1/M2/M3, HEAD / no-git / sandbox-variable, open-check probe/parse/release-shape, cache / settle /
    decide, the hook seam with its positive control). The consuming surface `remote_open_check` is pinned through
    `decide_open` → `settle_open_decision` plus its reach guard (`substrate_home_override` in the exact allowlist,
    `set_substrate` in settle's exact call list). `pnpm verify:auto` → EXIT=0 (60s): vitest 4094 passed, lib 1399 passed,
    integration ok. The first run failed only `cargo fmt --check` on the new fixture's layout (a reflow, fixed by
    `cargo fmt`); no test logic changed.

- [x] Phase 2: The funnel's third input — Rust + TS, every consumer migrated, the guard extended
  **Observable outcomes:**
  - CLI: `cargo test workflow_applicable` shows a truth table over gate × profile × host, where host ∈
    {Local, Absent, Unknown, Developer, Managed}. Applicable is exactly gate ∧ default ∧ (Local ∨ Developer ∨ Managed).
  - CLI: a Rust behavioural test per backend consumer, each fed a remote key whose cached host is Absent and then
    Unknown, each asserting not-applicable. Each also gets a positive control with Developer → applicable:
    - the spawn env carries no `CLAUDESK_DRIVE_MODE`;
    - the open check's `/session-restore` arm is not chosen even though `.session.md` exists;
    - the Docs poller reports `GateOff` and runs no listing;
    - the picker announce's gated arm is unavailable.
  - CLI: `pnpm vitest run src/state` covers three things:
    - the TS truth table equals the Rust one row for row;
    - `useHostSubstrate` returns `"local"` for a local key with **zero** `invoke` calls (a `mockIPC` spy);
    - for a remote key, it seeds, then flips on a `remote-substrate` event for its host and ignores another host's.
  - CLI: `workflowApplicableGuard` gains two checks:
    - **mutation-proven per form:** replacing one consumer's host arg with `"local"` fails the guard, and so does
      dropping the arg in another consumer, run individually;
    - a reverse check that every `KNOWN_ROUTED` file passes a hook-bound host.
  - CLI: `pnpm verify:auto` exits 0.
  - Browser (live, bridge, the dev build, the gate ON, the scratch remote row, the host Developer): the skill row,
    Recycle, Session-Start, the Docs tab and the picker row's drive-mode cell are all present, exactly as before WP4
    (DOM testids). A local workspace is unchanged.
  **Alignment questions:**
  - (decision) D9 in action: after a fresh app launch, the tank/scratch remote rows show **no drive-mode cell** until
    that host has been open-checked once in this app session (fail closed). Is that acceptable, or should the picker
    row keep showing the stored cell for remote rows?
  - [x] P2.1 Rust `workflow_applicable(gate, profile, host: HostInput)` (`Local | Remote(&HostSubstrate)`) + its truth-table test  <!-- status: done -->
  - [x] P2.2 (also remove the temporary `allow(dead_code)` on `LinkRegistry::substrate`) Migrate the Rust consumers (spawn env, `remote_open_check`'s arm decision via `decide_open`, the poller's `gate_on`, announce) + a behavioural test each  <!-- status: done -->
  - [x] P2.3 TS `isWorkflowApplicable(gate, profile, host)` + its mirror table; migrate `Workspace.tsx` (×2), `RightPanelHost.tsx`, `ProjectPicker.tsx` (×2, via `useHostSubstrates`), `ProjectModelCell.tsx`  <!-- status: done -->
  - [x] P2.4 Extend `workflowApplicableGuard` (D7) + mutation-prove each form individually  <!-- status: done -->
    — build evidence: 4 forms, each alone on a real consumer, each turning the guard red (`Tests 2 failed | 4 passed`)
    and each restored with a matching sha: `Workspace.tsx` given a literal `"local"`, `RightPanelHost.tsx` with the
    host dropped, `ProjectPicker.tsx` passing `undefined` (not from the seam), and `ProjectModelCell.tsx` with an unbound
    identifier.
  - [x] P2.5 (added at build, D10) `StartSignals.host_substrate` → the picker's remote start uses `hostFromOpenCheck`; the live-picker test adds the host-absent and not-probed cases  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (65s), after `prettier --write` + `cargo fmt`. It reports vitest 322 files /
    4126 tests passed (incl. the 30-row TS truth table, the extended `workflowApplicableGuard` 6/6, `remoteRightPanelLive`
    with its 2 new host-absent / not-probed cases, `pickerRemoteLive` with its 2 new cases), lib 1401 passed (incl.
    the 30-row Rust truth table + pre-probe rows, `a_remote_spawn_withholds_the_drive_mode_unless_its_host_has_the_substrate`,
    `the_poll_gate_reads_the_hosts_substrate_through_the_funnel`, the open check's absent / unknown / not-probed restore
    cases, the announce absent / unknown host cases), integration ok, clippy `-D warnings` + `fmt --check` clean.
    ESLint's 1 warning is pre-existing (`XtermPane.tsx:988`).
  - [x] verify-self  <!-- status: done -->
    - [x] vs.1 Rust truth table (runner)  — evidence: `cargo test --lib profile_workflow_applicable_truth_table` → ok; read: 6 profile rows × 5 hosts, expected `gate && profile_ok && host_ok`; `workflow_applicable_before_host_probe` = `gate && profile_ok`
    - [x] vs.2 per-consumer behaviour, Absent + Unknown closed with a Developer positive control (runner)  — evidence: spawn env `a_remote_spawn_withholds_the_drive_mode_unless_its_host_has_the_substrate` ok; open check `a_dead_session_starts_with_the_remote_resume_signals` ok (absent / unknown / not probed → no restore); Docs poller `the_poll_gate_reads_the_hosts_substrate_through_the_funnel` ok (real `AppEnv` + `LinkRegistry`); announce `a_remote_row_is_announced_from_its_local_record_and_flag` ok (reconnect@fsd only with Developer; lookup asked about the row's own host)
    - [x] vs.3 TS mirror + hook (runner)  — evidence: `vitest run workflowApplicable.test.ts useHostSubstrate.test.tsx` → 42 passed; the TS table equals Rust's row for row; local key → `calls == []` with events unmocked, plus the remote positive control; seed then own-host event flips, other host's ignored
    - [x] vs.4 guard mutation-proven per form (runner, independent of the build's 4 forms)  — evidence: M-a `Workspace.tsx` first call's host → `"local"` → `Tests 2 failed | 4 passed`; M-b `ProjectPicker.tsx` PickerRow call's host dropped → `Tests 2 failed | 4 passed`; each restored by sha (05ff2bf3…, f9dbb7f0…); restored tree 6/6; a REVERSE check over `KNOWN_ROUTED` exists
    - [x] vs.5 picker start takes the check's host; Docs closed on an absent / unprobed host (runner)  — evidence: `vitest run pickerRemoteLive remoteRightPanelLive` → 48 passed; read the absent / not-probed cases and their Developer positive controls
    - [x] vs.6 `pnpm verify:auto` (runner, after the restores)  — evidence: EXIT=0; vitest 4126 passed; lib 1401 passed + 10 more `test result: ok.`
    - [x] vs.7 CONSUMING SURFACES live, dev build, gate ON, scratch row `<user>@<mini-host>:~/claudesk-scratch-remote` (orchestrator, bridge; a real CC session in the scratch folder, closed after)  — evidence: picker click → open check → workspace `ws-1`. Visible: `workspace-skill-row` 1, `workspace-skill-session-start` 1, `workspace-skill-session-restore` 1, `workspace-recycle` 1, `panel-tab-docs` 1. `remote_host_substrates` → `{<user>: "developer"}`. Screenshot `scratchpad/wp4/p2-remote-developer.jpg`: skill row start·clear·restore·capture·prune·paydown·recycle, Docs tab, remote CC in `~/claudesk-scratch-remote`. LOCAL positive control: `scratch-c` (default profile) opened → skill row, Session-Start, Recycle and Docs present. Both closed through `filmstrip-close-*`. Sweep: no `claudesk-dev` tmux server, only prod's `ssh -M` (tank), live account 48 links + `CLAUDE.md` `539e1b95…` unchanged, dev files restored (`b30fd5f8…` / `0fc30928…`)
    - [x] align: (decision) D9 — remote rows have no drive-mode cell until their host is open-checked once in the app session  — evidence (CAPTURED): fresh launch, gate ON. BEFORE any check, both remote rows lack `picker-recent-mode-line`, while the default-profile local rows (scratch-c, yitang-copy, claudesk, my-claude-code-customization, areo-test-proty-1) have it. AFTER opening the scratch row (its host → developer), that row has `picker-recent-mode-line` = true. The other remote row (a different account, never probed) still has none. Screenshot `scratchpad/wp4/p2-picker-d9.jpg`: the unprobed remote row reads "Model: Default" with no "Drive Mode" line; local rows read "Drive Mode: None".
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1 (decision, D9) remote rows show no drive-mode cell until their host has been open-checked once in this app session — **operator ruling 2026-11-20: A (keep: fail closed)**; the cell appears once the host is known
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — suite not long (`runtimes.md` → `pnpm verify:auto` Last 65s)
    — evidence: ONE new test, for the one verified behaviour with no regression test:
    `pickerRemoteLive.test.tsx` → "a remote row's drive-mode line appears only once its host is known to have the
    workflow system". It is the D9 ruling A, picker-level: unknown → absent, a Developer event → present, an absent
    event → absent, another host's event ignored, with the local row as positive control. It KILLS a mutant giving
    `ProjectModelCell` a `"local"` host (`Tests 1 failed`; file restored, sha matched). `livePicker.teardownLive` now
    resets the host-substrate store, which is module state. Everything else is already pinned (see verify-self vs.1–vs.6).
    Consuming surfaces: `remote_open_check` (restore arm), the picker rows/open, `Workspace` / `RightPanelHost`, the
    spawn env, the poller. `pnpm verify:auto` → EXIT=0 (64s): vitest 4127 passed, lib 1401 passed.

- [x] Phase 3: The absent-host note, the OFF-invariant pin 6/11, the count sweep, and the live skill-less check
  **Observable outcomes:**
  - CLI: `pnpm vitest run offInvariantGuard`. Arm 5 now lists `showAbsentHostNote` as its own subject; the pin asserts
    **6 arms / 11 subjects**. Mutation-proven on its own: making the note's predicate ignore the gate turns arm 5 red
    via that subject (`Tests N` line shown), and restoring it turns it green.
  - CLI: a jsdom render test checks four cases:
    - gate ON + a remote Absent host → the note's text names `<user@host>` and "Settings → Remote hosts", and there
      is no skill row;
    - Unknown → the "couldn't check" wording;
    - gate OFF → no note and no skill row (the same DOM as before WP4);
    - a local workspace → no note.
  - CLI: `grep -rn "10 subjects\|6 arms / 10" CLAUDE.md docs workflow-system/product src` → 0 hits outside archives.
    `workflow-gate.md`, `arch.md`, `CLAUDE.md` and `workspaceSurfaces.ts`'s header read 6 / 11.
  - CLI: `pnpm verify:auto` exits 0.
  - Browser (live, bridge, the dev build relaunched with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<empty host dir>`, the gate
    ON, the scratch remote row):
    - the skill row, Recycle, Session-Start and the Docs tab are absent (no DOM);
    - `[data-testid=workspace-absent-host-note]` is present with the D8 wording;
    - clicking its button opens Settings;
    - the open fired no `/session-restore`, with a `.session.md` **seeded in the scratch folder** (state-changing,
      scratch remote folder only, removed after), checked by reading the remote pane / transcript for the absence of
      the command.
  - Browser (live, the dev build relaunched WITHOUT the override, the same row): all the surfaces are present and the
    note is absent.
  **Alignment questions:**
  - D8 in action: the note's wording, its place in the skill-row slot, and its button that opens Settings. Now that you
    see it, still what you want?
  - (decision) The Unknown wording ("Claudesk couldn't check whether the workflow system is installed for
    `<user@host>`.") instead of silence or the Absent text. Keep it?
  - [x] P3.1 `isWorkflowHostBlocked` + `showAbsentHostNote` (pure) + the note's render in the skill-row slot (`clearButton` keeps its place)  <!-- status: done -->
    — as built: `absentHostNote({hostBlocked, host, authority})` returns text or `null` (an unseeded host → `null`, no
    flash). `Workspace` feeds it `isWorkflowHostBlocked(useWorkflowFeaturesEnabled(), profile, host)`, which
    `workflowApplicableGuard` accepts as the second wrapper; its host argument is held to the same seam rule.
    `onOpenSettings` is threaded App → `CenterStage` → `Workspace`. CSS: `.workspace-absent-host-note` (it clips, never
    wraps, with a tooltip). There is a live test, `absentHostNoteLive.test.tsx` (6 cases).
  - [x] P3.2 OFF-invariant guard: arm 5's new subject, pin → 6 / 11, the guard's header; mutation-prove the subject on its own  <!-- status: done -->
    — build evidence: the mutant (`absentHostNote` ignoring `hostBlocked`) fails EXACTLY "renders no ABSENT-HOST NOTE
    while the gate is OFF" (`Tests 1 failed | 41 passed`). Restored with a matching sha → 42/42. The source-derived
    title count (11) equals `armSubjects` (11).
  - [x] P3.3 Docs in the same change: `workflow-gate.md`, `arch.md`, `arch/claude-substrate.md` §R.1/§R.2 (PLANNED → as built for WP4's part), `workspaceSurfaces.ts` header  <!-- status: done -->
  - [x] P3.4 WBS 4.7: a repo-wide grep sweep for "10 subjects" / "6 arms / 10" and correct every live (non-archive) hit  <!-- status: done -->
    — build evidence: swept by the claim's NOUN ("subjects"), not by the number. That found a further stale claim the
    number-grep could not: `arch.md`'s "**9 subjects**", stale since paydown WP13b, now corrected to 11 with a note.
    Present-tense claims were corrected to 11 in `CLAUDE.md`, `arch.md`, `arch/workflow-gate.md` (text + the arm-5 table
    row), `arch/workflow-supervisor.md`, `src/state/workspaceSurfaces.ts`, `docs/lessons/closed-cycles-m13-m13-5.md`
    and `docs/lessons/closed-cycles-m14-m16-5.md` (×2). `arch/profiles.md` gained "11 since M18 WP4". Left as
    history: `arch/remote-workspaces.md:508` (M17's "passed unedited") and the WBS task's own text.
  - [x] verify-auto  <!-- status: done -->
    — evidence: `pnpm verify:auto` → EXIT=0 (54s), after `prettier --write`. It reports vitest 323 files / 4135 tests
    passed, which includes:
    - `absentHostNoteLive.test.tsx` 6/6;
    - `offInvariantGuard` 42/42 (pin 11; the source-derived title count is 11);
    - `workflowApplicableGuard` 6/6 (both wrappers' hosts checked).
    Also lib 1401 passed, integration ok, clippy + fmt clean. ESLint's 1 warning is pre-existing.
    — re-run after the P3.verify-human.1 fix (short host): `pnpm verify:auto` → EXIT=0 (54s), vitest 4135 passed (incl.
    the updated `absentHostNoteLive` and the OFF guard), lib 1401; `check:link` green (the new `shortHost` import resolves).
  - [x] verify-self  <!-- status: done -->
    - [x] vs.1 OFF-invariant arm 5 third subject, pin 11, mutation-proven alone (runner)  — evidence: `armSubjects` 11 (incl. "5 ABSENT-HOST-NOTE"), `.toBe(11)`, 11 source-derived OFF titles. Mutant (`absentHostNote` ignoring `hostBlocked`) → `Tests 1 failed | 41 passed`, failing EXACTLY "renders no ABSENT-HOST NOTE while the gate is OFF"; restored with a matching sha (947ff976…) → 42/42
    - [x] vs.2 render test, real `Workspace` (runner)  — evidence: `absentHostNoteLive.test.tsx` 6/6. Absent → note names `me@mini-host` + "Settings → Remote hosts", no row, the button calls `onOpenSettings` once. Unknown → couldn't-check wording. Not seeded → nothing. Developer → row, no note. Gate OFF → nothing. Local → row, no note
    - [x] vs.3 count sweep (runner)  — evidence: 5 remaining hits, each classified as history or annotated with 11; `CLAUDE.md`, `arch.md`, `arch/workflow-gate.md` and `workspaceSurfaces.ts` state 11 for the current pin
    - [x] vs.4 `workflowApplicableGuard` holds the note's wrapper (runner)  — evidence: 6/6; FUNNELS covers `isWorkflowHostBlocked(`; the literal-"local" self-test bites; the one production call's host is `useHostSubstrate`-bound
    - [x] vs.5 `pnpm verify:auto` (runner, after the restore)  — evidence: EXIT=0 (54s), vitest 4135, lib 1401
    - [x] vs.6 CONSUMING SURFACE live, dev build relaunched with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<empty host dir>`, gate ON, scratch row `<user>@<mini-host>:~/claudesk-scratch-remote` (orchestrator, bridge; state-changing as declared: an empty sandbox dir + a `.session.md` SEEDED in the scratch folder's existing empty `workflow-system/state/`)  — evidence: picker click → workspace. Visible: `workspace-skill-row` 0, Session-Start 0, Recycle 0, `panel-tab-docs` 0; `workspace-absent-host-note` 1 = "The workflow system isn't installed for `<user@host>`. Install it in Settings → Remote hosts." with a Settings button; the ungated `clear` button and the Prompt tab kept. The note's button → `settings-panel` opened. NO `/session-restore`: the seeded `.session.md` was still present, the remote pane showed an empty prompt, and 0 `session-restore` lines were in its scrollback. Screenshot `scratchpad/wp4/p3-absent-note.jpg`
    - [x] vs.7 positive control live, relaunched WITHOUT the override, same row (orchestrator)  — evidence: skill row 1, Session-Start 1, Recycle 1, Docs 1, note 0; the auto `/session-restore` FIRED (`❯ /session-restore` in the pane, then its "Drive mode" question). So vs.6's no-fire is the funnel's doing, not a blocked arm. Closed through the UI (the close guard's "Close Anyway")
    - Cleanup: the dev app (pnpm 76394, app 76653, vite 76558: all mine) stopped by PID; no `claudesk-dev` tmux server; only prod's `ssh -M` (6044, tank). The seed was consumed by the restore skill itself; the scratch `state/` dir is empty as before; the sandbox was `rmdir`'d. Live account: 48 links, `CLAUDE.md` `539e1b95…`, no record (unchanged). Dev files restored (`b30fd5f8…` / `0fc30928…`)
    - [x] vs.8 RE-VERIFY of the P3.verify-human.1 fix (short host)  — evidence: a FRESH runner read `absentHostNote.ts` (text from the imported picker `shortHost(authority)`, tooltip from the full authority) and `Workspace.tsx` (`title={hostNote.tooltip}`, `{hostNote.text}`); vitest 48/48. Mutant `text = sentence(authority)` → `Tests 2 failed | 4 passed` (absent + unknown cases); restored by sha. LIVE (orchestrator, dev build with the sandbox root, scratch row): the note text reads "The workflow system isn't installed for <mini-host>. Install it in Settings → Remote hosts." (no `@` in the text); its `title` is the same sentence with the full `<user>@<full-host>`; no skill row. Screenshot `scratchpad/wp4/p3-absent-note-short.jpg`. Cleanup: workspace closed through the UI, dev app stopped (TaskStop), no vite / tmux left, only tank's `ssh -M`, sandbox `rmdir`'d, live account unchanged (48 / `539e1b95…` / no record), scratch `state/` empty, dev files restored
    - [x] align: D8 in action — the note's wording, place and Settings button  — evidence (CAPTURED): `scratchpad/wp4/p3-absent-note.jpg`. The header reads `claudesk-scratch-remote · clear · The workflow system isn't installed for <user>@<full MagicDNS host>. Install it in Settings → Remote hosts. · [Settings]`, in the skill-row slot, with the right half on the Prompt tab. NOTE for the operator: the note prints the FULL `user@host`, while the picker shows the SHORT host (M17 WP2 operator ruling) with `user@host` in a tooltip
    - [x] align: (decision) the Unknown wording  — evidence (CAPTURED, runner): absent → "The workflow system isn't installed for ${authority}. Install it in Settings → Remote hosts."; unknown → "Claudesk couldn't check whether the workflow system is installed for ${authority}." (no install instruction; the Settings button still shows); not seeded / local → no note. The render test asserts both strings
  - [x] verify-human  <!-- status: done -->
    - [x] P3.verify-human.1 (a+b) a skill-less host, end to end: the note (wording, place, Settings button, FULL user@host vs the picker's short host) + Docs absent there (the arch's revision of the grill default) — still what you want? — **operator 2026-11-20: ok (after the short-host fix, re-verified live)**
      — operator 2026-11-20: "ok, short host". The note, its place, its button and Docs-absent are approved. CHANGE: print
      the SHORT host (as the picker row does, M17 WP2 ruling), with the full `user@host` in its tooltip.
      — fixed at build (F12): `absentHostNote` returns `{text, tooltip}`, with the text through the picker's own
      `shortHost` and the tooltip carrying the full `user@host`; `Workspace` renders `title={tooltip}`. The live test now
      uses a MagicDNS host and asserts the text says `mini-host`, does NOT contain the full host, and that the title is
      the full sentence. 54/54 across `absentHostNoteLive` + both guards.
    - [x] P3.verify-human.2 (decision) the Unknown wording ("Claudesk couldn't check…") vs silence vs the Absent text — **operator ruling 2026-11-20: A (keep the distinct couldn't-check wording)**
  - [x] verify-codify  <!-- status: done -->
    Test scope: full — last phase
    — evidence: ONE new test, for the one verified behaviour with no regression test: the REAL wiring of the note's
    Settings button (App → `CenterStage` → `Workspace`). It is a source guard in `absentHostNoteLive.test.tsx`, anchored
    INSIDE the `<CenterStage … />` element. ⚠️ The first version was VACUOUS: App passes the same prop to
    `ProjectPicker`, so a whole-file `toContain` passed with the CenterStage wiring deleted. The first mutant even hit
    the picker's line, and the grep count (2 → 1) exposed it. Anchored now, deleting only the CenterStage prop FAILS
    it (`Tests 1 failed | 6 passed`); restored with a matching sha. Everything else is already pinned (vs.1–vs.8, with
    the render test asserting short host + tooltip). `pnpm verify:auto` → EXIT=0 (56s): vitest 4136 passed, lib 1401
    passed, integration ok.

## Verification constraints (from §R.8 + memory `remote-verify-hygiene`)

- Detection may READ the live account only. WP4 writes nothing on any host except the Phase 3 seeded `.session.md` in
  the **scratch** remote folder (declared above; removed after).
- Use a scratch remote row (`~/claudesk-scratch-remote` on the dev account). Never take ssh's user from the dev
  `projects.json`'s old root-ops row. Restore `projects.json`'s row set after.
- Before any Rust edit or rebuild, or any `App.tsx` save, with a remote workspace open: close it through the UI and stop
  the dev app first, then sweep for orphaned `ssh -M` and `tmux -L claudesk-dev ls` afterwards.
- `CLAUDESK_REMOTE_SUBSTRATE_ROOT` is debug-only. The sandbox dir is an **empty** dir created by the agent on the host
  and removed after (state-changing, declared).

## Code-Quality Review

*(feature-review-quality on `9ce4810^..d57aa15`, drive_mode=autopilot: 0 CRITICAL, 1 MAJOR, 7 MINOR, all auto-backlogged to
`backlog-quality-findings.md` → `# m18-wp4-substrate-detection-and-funnel — 2026-11-20`, with a pointer in `backlog.md`.)*

### Strengths
- The host is a third parameter of the ONE existing funnel (Rust + TS), not a per-site flag. Local is a typed variant,
  and Unknown / undefined fail closed. The truth tables cover all 5 hosts and mirror each other.
- The parity test runs the real `SUBSTRATE_PROBE` through the real `parse_open_facts` against 16 fixtures, and each
  guard in the constant is killed by its own fixture.
- The non-UTF-8 divergence is closed at the source (local reads bytes), and `provenance::parse_record` is one shared
  parser.
- D10: the pre-probe funnel is named separately, with a "never a consumer's answer" warning, and the picker's start
  takes the check's own host (the ordering bug was found at build).
- D5 lives in one place (`settle_open_decision`, its exact call list pinned). Each backend consumer has a behavioural
  Absent/Unknown test with a Developer positive control.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`src/state/__tests__/workflowApplicableGuard.test.ts` → `checkHostArg`] The host-argument check is an `includes` match,
  so a ternary with a non-seam arm (an identifier holding `"local"`, an object literal) passes; only a literal
  `"local"` is caught. The production `ProjectPicker.tsx` call is a ternary, so the shape is real. Split the arms and
  check each one. → `SURFACE-2026-11-20-QUALITY-HOST-ARG-GUARD-CHECKS-BY-INCLUDES`

**MINOR**
- [`useHostSubstrate.ts`] The `started` latch never resets on a failed `listen`, so remote hosts stay `undefined` and the
  workspace loses its row with no note. → `…-HOST-STORE-LATCH-NEVER-RETRIES`
- [`Workspace.tsx`] A third inline `useWorkflowFeaturesEnabled()` (separate seed + listener). →
  `…-WORKSPACE-THIRD-GATE-HOOK-CALL`
- [`Workspace.tsx` / `CenterStage.tsx`] `onOpenSettings` is optional, and a source guard stands in for `tsc`. →
  `…-ONOPENSETTINGS-OPTIONAL-PROP`
- [`absentHostNote.ts`] `shortHost` is imported from a picker module (a layering inversion). →
  `…-SHORTHOST-CROSS-LAYER-IMPORT`
- [`arch/claude-substrate.md` → "R.1 + R.2 as built"] The note wording still shows the full `<user@host>`. →
  `…-ARCH-NOTE-WORDING-STALE` (fix at finalize)
- [`remote_link/mod.rs`] The substrate sink is installed by a post-construction setter, while the link sink is a
  constructor argument. → `…-SUBSTRATE-SINK-SETTER-SHAPE`
- [`cc_session/mod.rs`] One doc-comment line is past the wrap width. → `…-CC-SESSION-DOC-LINE-WIDTH`

### Assessment
The feature is well built. The input goes through the existing funnel; the one caller that cannot have the host yet gets
a named pre-probe funnel; parity is held by a mutation-proven behavioural test. The Rust side is clean: no `unwrap()`
outside tests, short main-thread-safe lock reads, the gate-OFF command pinned byte-identical, and the debug seam
unreachable in release. The main debt is the TS guard's `includes` match, which is weaker than its self-tests suggest
and should be tightened before more consumers rely on it. The rest is small cleanup. Net: forward motion with modest
debt.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` here before `feature-finalize` archives the WIP.

## Current Node
- **Path:** Feature > finalize
- **Active scope:** finalize
- **Blocked:** none
- **Unvisited:** finalize
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

[SHORTCUT-2026-11-20] P1.verify-self vs.3 — mutant M2 (`next unless -l $e;` deleted) SURVIVED the 14-fixture parity test: no fixture separated a real dir from a link. In-place fix, extending P1.5's fixture list (a trivial extension of the just-built leaf): added "a real dir under a marker installer two levels up" and, for the analogous unguarded `-e $t` check, "a link dangling into a marker repo" (16 fixtures). Re-verified by a FRESH runner subagent: M1, M2 and M3 each fail on their own fixture, and every restore matched the sha.

[SHIP-2026-11-20] Full suite: reused the last-phase codify run (`Test scope: full — last phase`, `pnpm verify:auto` EXIT=0, 56s, vitest 4136 / lib 1401). Nothing but this WIP and runtimes.md changed since. Fast checks re-run at ship: eslint on the changed files clean, `tsc --noEmit` ok, `cargo fmt --check` ok. No TODO/debug leftovers.

## Retrospect
- **What changed in our understanding:**
  - A cache written by a command and read through an event has an ordering hole for the SAME action's next step. The
    picker's open read the host map from the last render, before its own check wrote the cache, and Tauri does not
    order the event against the command's response. The consumer that acts on a check must take the answer from the
    check (`StartSignals.hostSubstrate`), not from the cache it fills.
  - "Local costs no IPC" ruled out the obvious `useTauriListen`-per-hook shape, because `listen` is itself an IPC call.
    A lazily started module store (`useSyncExternalStore`) was the right shape for a per-host value read by many
    consumers.
- **Assumptions that held:**
  - The host as a THIRD input of the one funnel (§R.1) worked without any consumer learning about hosts.
  - The probe's +16 ms cost.
  - The WP3 draft constant, once its three review findings were folded in.
  - Fail closed for an unknown host (the operator kept it at D9, ruling A).
- **Assumptions that were wrong:**
  - The 14-fixture parity set was "every shape". Mutant M2 survived it, because no fixture separated a real dir from
    a symlink; the analogous `-e $t` guard was equally unguarded. 16 fixtures now, each guard killed by its own.
  - The plan's count sweep was keyed on the number "10". The stale `arch.md` claim said "9 subjects", which only a
    sweep by the claim's noun found.
  - The first App-wiring guard was vacuous: the same prop is passed twice in `App.tsx`. The mutant's grep count
    (2 → 1) exposed it.
- **Approach delta:**
  - Added at build: D10 (the pre-probe funnel + the check-carried host) and `StartSignals.hostSubstrate`.
  - One store hook in place of two `useTauriListen` hooks, and the single-host command dropped.
  - The note's short-host label came from the operator at verify-human (one F12 back-loop).
  - Otherwise the 3-phase plan held.

## Closure
> **Feature complete:** M18 WP4 (substrate detection and the funnel's third input) has shipped. Claudesk now checks
> each remote host account for the workflow system in the open check's existing exec, and a workspace on a host
> without it shows no workflow buttons, no Docs tab and no auto `/session-restore`, just one line pointing to
> Settings → Remote hosts. Seen live on the mini with the debug sandbox root (`CLAUDESK_REMOTE_SUBSTRATE_ROOT`) and
> on the real account (unchanged).

Requester = operator — closure notice for self-record.
