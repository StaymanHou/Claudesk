---
drive_mode: autopilot
---

# Feature: M18 WP4 — Substrate detection and the funnel's third input

**Workflow:** feature
**State:** plan (complete)
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
  - For a remote key it seeds by `remote_host_substrate` and listens to `remote-substrate`. It is the seam-hook shape
    (never a one-shot read).
  - The picker uses one `useHostSubstrates()` map hook (one seed `remote_host_substrates`, one listener), because a hook
    cannot be called per row inside `map`.
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

## Work Tree

- [ ] Phase 1: Detection — `SUBSTRATE_PROBE`, `OpenFacts.substrate`, the per-host cache, the `remote-substrate` event  <!-- status: NOT-STARTED -->
  **Observable outcomes:**
  - CLI: `cargo test substrate_probe_agrees_with_skills_dir_exists` passes. It runs the real `remote_cmd::SUBSTRATE_PROBE`
    under `zsh -c` with a temp `HOME` against **every** fixture shape and asserts agreement with `skills_dir_exists`
    case by case:
    - the 12 shapes from WP3: none, no skills dir, skills is a file, empty, a user's real dir, a dangling link, a repo
      without an installer, an installer without the marker, the marker, a user dir + a marker link, a marker link
      under a dotfile name, the skills dir itself a symlink;
    - plus a non-UTF-8 installer that holds the marker, and a repo path that contains `\n`.
    Every positive must print the canonicalized root, except the newline one, which prints none.
  - CLI: the same test file covers HEAD, asserting the printed head equals the fixture's commit sha for a loose ref, a
    packed ref (after `git pack-refs --all`) and a detached HEAD, and that no head line is printed for a `.git` file.
    A `PATH` with a failing `git` stub first in line changes nothing, which proves no `git` runs.
  - CLI: mutation-proven. Changing the marker in `SUBSTRATE_PROBE` alone turns the parity test red, and so does
    deleting the `next unless -l $e` guard alone. Each mutant is restored by `cp` + `shasum`, each run shows a
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
    account): the open check runs, then the bridge `invoke('remote_host_substrate', {projectPath})` returns Developer
    with `root` equal to the host's `cd ~/my-claude-code-customization && pwd -P`, and `head` equal to that clone's
    `.git` HEAD, read by the agent's own ssh.
  - CLI (live, read-only, debug sandbox; the dev app relaunched with `CLAUDESK_REMOTE_SUBSTRATE_ROOT=<abs path of an
    empty dir on the host>`): the same row reads **Absent**. The live account's `~/.claude/skills` link count and the
    `CLAUDE.md` shasum are unchanged before and after.
  **Alignment questions:**
  - none (all checks are pass/fail; the live readings are Observable outcomes).
  - [ ] P1.1 `remote_cmd::SUBSTRATE_PROBE`: adopt "Probe outcomes" (4)'s draft, with D1 (HEAD in perl), D3 (the newline guard) and D2's `$ENV{CLAUDESK_SUBSTRATE_HOME} // $ENV{HOME}`  <!-- status: NOT-STARTED -->
  - [ ] P1.2 `open_check_command` (its `check_session_md` param becomes `workflow`: the `.session.md` read + the probe) + `OpenFacts.substrate` / `SubstrateRead` / `HostProbe` + parsing (hex → bytes → `provenance::parse_record`; the root through `is_normalized_remote_path`)  <!-- status: NOT-STARTED -->
  - [ ] P1.3 D2: the debug-only `CLAUDESK_REMOTE_SUBSTRATE_ROOT` → a quoted export prefix; a pure builder that takes `Option<&str>`; the release byte-identity test  <!-- status: NOT-STARTED -->
  - [ ] P1.4 `workflow_substrate::skills_dir_exists` reads `install.sh` as BYTES (the marker is ASCII), settling the divergence. `provenance::parse_record(&[u8])` is extracted, and `read_record` routes through it  <!-- status: NOT-STARTED -->
  - [ ] P1.5 The parity test `substrate_probe_agrees_with_skills_dir_exists` (14 fixtures) + the HEAD fixtures + the git-stub PATH check  <!-- status: NOT-STARTED -->
  - [ ] P1.6 `HostSubstrate` + `resolve_state` mapping; `LinkRegistry` per-host cache + `set_substrate` (emits on change through a second sink) + D5's write rule in `remote_open_check`; sync `remote_host_substrate(project_path)` + `remote_host_substrates()` commands (registered, and added to the sync-command ledger if needed); `useHostSubstrate` / `useHostSubstrates` + a TS mirror type  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 2: The funnel's third input — Rust + TS, every consumer migrated, the guard extended  <!-- status: NOT-STARTED; depends on Phase 1 -->
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
  - [ ] P2.1 Rust `workflow_applicable(gate, profile, host: HostInput)` (`Local | Remote(&HostSubstrate)`) + its truth-table test  <!-- status: NOT-STARTED -->
  - [ ] P2.2 Migrate the Rust consumers (spawn env, `remote_open_check`'s arm decision via `decide_open`, the poller's `gate_on`, announce) + a behavioural test each  <!-- status: NOT-STARTED -->
  - [ ] P2.3 TS `isWorkflowApplicable(gate, profile, host)` + its mirror table; migrate `Workspace.tsx` (×2), `RightPanelHost.tsx`, `ProjectPicker.tsx` (×2, via `useHostSubstrates`), `ProjectModelCell.tsx`  <!-- status: NOT-STARTED -->
  - [ ] P2.4 Extend `workflowApplicableGuard` (D7) + mutation-prove each form individually  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

- [ ] Phase 3: The absent-host note, the OFF-invariant pin 6/11, the count sweep, and the live skill-less check  <!-- status: NOT-STARTED; depends on Phase 2 -->
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
  - [ ] P3.1 `isWorkflowHostBlocked` + `showAbsentHostNote` (pure) + the note's render in the skill-row slot (`clearButton` keeps its place)  <!-- status: NOT-STARTED -->
  - [ ] P3.2 OFF-invariant guard: arm 5's new subject, pin → 6 / 11, the guard's header; mutation-prove the subject on its own  <!-- status: NOT-STARTED -->
  - [ ] P3.3 Docs in the same change: `workflow-gate.md`, `arch.md`, `arch/claude-substrate.md` §R.1/§R.2 (PLANNED → as built for WP4's part), `workspaceSurfaces.ts` header  <!-- status: NOT-STARTED -->
  - [ ] P3.4 WBS 4.7: a repo-wide grep sweep for "10 subjects" / "6 arms / 10" and correct every live (non-archive) hit  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Verification constraints (from §R.8 + memory `remote-verify-hygiene`)

- Detection may READ the live account only. WP4 writes nothing on any host except the Phase 3 seeded `.session.md` in
  the **scratch** remote folder (declared above; removed after).
- Use a scratch remote row (`~/claudesk-scratch-remote` on the dev account). Never take ssh's user from the dev
  `projects.json`'s old root-ops row. Restore `projects.json`'s row set after.
- Before any Rust edit or rebuild, or any `App.tsx` save, with a remote workspace open: close it through the UI and stop
  the dev app first, then sweep for orphaned `ssh -M` and `tmux -L claudesk-dev ls` afterwards.
- `CLAUDESK_REMOTE_SUBSTRATE_ROOT` is debug-only. The sandbox dir is an **empty** dir created by the agent on the host
  and removed after (state-changing, declared).

## Current Node
- **Path:** Feature > Phase 1 > P1.1
- **Active scope:** P1.1 (adopt `SUBSTRATE_PROBE` with D1/D2/D3)
- **Blocked:** none
- **Unvisited:** Phase 1 (P1.2–P1.6, verify), Phase 2, Phase 3
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
