---
drive_mode: autopilot
---

# Feature: M16.5 WP1 — Probe: what the hook channel carries for background work and dequeued prompts

**Workflow:** feature
**State:** verify-codify (phase 1 complete)
**Created:** 2026-10-20
**WBS:** `workflow-system/product/wbs.md` → WP1 (type: probe, timebox half a day). It gates WP4.

## Problem Statement

Three status-channel items turn on facts about Claude Code's hook payloads that nobody has
captured:
1. Does an artifact watch make the dot purple
   (`SURFACE-2026-10-09-ARTIFACT-WATCH-LIGHTS-THE-DOT-PURPLE-WITH-NOTHING-RUNNING`)?
2. Can a verify-human pause with a live shell be told apart
   (`SURFACE-2026-09-29-VERIFY-HUMAN-PAUSE-WITH-A-BACKGROUND-SHELL-SHOWS-PURPLE-NOT-BLUE`)?
3. Can a dequeued mid-turn prompt be told apart from a real turn start
   (`SURFACE-2026-09-28-IS-TURN-START-FIRES-ON-MID-TURN-DEQUEUES`)?

**A plan-time finding narrows Q1:** the hook script already receives `background_tasks` as an
**array** of `{id, type, status, description, command}` and reduces it to a count itself. It does
that under a privacy invariant (`claudesk-hook.pl`, the `Stop` block), because `command` and
`description` are user content. So "the hook gives a count, never the tasks" is **our own
redaction, not CC's limit**. `type` is enum-like (`"shell"` was the captured value), so forwarding
the type list is privacy-safe in the same class as `source` / `reason`. The probe forwards
`background_task_types` permanently. On the dev build only, it also forwards each payload's
**key names** (never values), then captures the three cases live. Output: recorded payload shapes
and a per-question verdict in `wbs.md` → "Probe outcomes". No status-dot or turn-start behavior
changes here; that is WP4.

## Work Tree

- [x] Phase 1: Instrument — forward task types, and payload key names on dev only
  **Observable outcomes:**
  - CLI: `cargo test --test hook_pl_output` covers the redaction, proven by what REMAINS
    (`[[verify-redaction-by-what-remains]]`). It feeds the real `claudesk-hook.pl` a `Stop` payload
    whose `background_tasks` holds
    `[{type:"shell",command:"SECRET_CMD",description:"SECRET_DESC"}, {type:"<other>",…}]`.
    The emitted socket line has `background_task_count: 2` and `background_task_types` equal to
    `["shell","<other>"]` in order. The substrings `SECRET_CMD` and `SECRET_DESC` occur
    **nowhere** in the whole line.
  - CLI: the same test with the script installed under a `-dev` basename emits `payload_keys` (a
    sorted list of the payload's top-level key NAMES) on `Stop` and `UserPromptSubmit`. Under the
    prod basename it emits NO `payload_keys`. No VALUE of a field the hook does not otherwise
    forward appears in either. [Corrected at build: the prompt text is already forwarded on
    `UserPromptSubmit` by design (the status path), so "no prompt text" was the wrong check.]
  - CLI: `cargo test status_log` shows a `Stop` telemetry line ends with
    `bg=<n> bg_types=<a,b|->`. A non-`Stop` line is byte-identical to today's (existing format
    tests still pass unchanged).
  - CLI: a missing or non-array `background_tasks` gives `background_task_count: 0` and
    `background_task_types: []`, never an error (the stale-able-seam rule).
  - CLI: `pnpm verify:auto` exits 0.
  - CLI (state-changing: appends to the DEV identity's `status-channel.log` via the running dev
    build; added at verify-self to cover the drain-loop call site, which no test reaches). Pipe a
    `Stop` payload with `background_tasks:[{type:"shell",command:"SECRET_CMD"}]`, then a
    `UserPromptSubmit` payload, through the **deployed**
    `~/Library/Application Support/com.claudesk.app.dev/claudesk-hook-dev.pl`, with
    `CLAUDESK_HOOK_SOCK` set to that dir's `hook.sock`. The dev `status-channel.log` gains:
    - a `STATUS event=Stop` line ending
      `bg=1 bg_types=shell keys=background_tasks,cwd,hook_event_name,session_id`
    - a `STATUS event=UserPromptSubmit` line ending `keys=cwd,hook_event_name,prompt,session_id`

    `SECRET_CMD` appears in neither line.
  **Alignment questions:**
  - (decision) Forward `type` only, or `type` + `status`? I plan **type only**. `status` was
    always `"running"` in the M13.5 capture, so it would add surface for no signal. Still what you
    want?
  - [x] P1.1 `claudesk-hook.pl`: in the `Stop` block, add `background_task_types` (each entry's
        `type`, stringified; any non-scalar becomes `"?"`) beside the count, and keep the
        privacy-invariant comment accurate. Add a dev-only `payload_keys` (sorted top-level key
        names), gated on the script's own basename ending `-dev.pl`, on `Stop` and
        `UserPromptSubmit` only.  <!-- status: done -->
  - [x] P1.2 `HookEvent`: add `background_task_types: Option<Vec<String>>` and
        `payload_keys: Option<Vec<String>>` (`#[serde(default)]`; `event_to_state` reads
        neither).  <!-- status: done -->
  - [x] P1.3 `status_log::format_event_line`: append `bg=<n> bg_types=<…>` on `Stop`, and
        `keys=<…>` when `payload_keys` is present. Thread the fields from both call sites in
        `status_broadcaster/commands.rs`.  <!-- status: done -->
  - [x] P1.4 Tests: extend `tests/hook_pl_output.rs` with the outcomes above and the
        `status_log` format tests. Mutation-prove the redaction assertion: forward `command`
        and watch it fail.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - `pnpm verify:auto` → exit 0 (49s): lint 0 errors (1 pre-existing warning in untouched `XtermPane.tsx`), format, tsc, check:link, vitest 254 files / 3413 tests, cargo fmt, clippy `--all-targets -D warnings`, cargo test (all binaries ok).
    - `cargo test --test hook_pl_output` → 23 passed (5 new); `cargo test --lib status_log` → 16 passed (3 new).
    - Mutation (each landed — `perl -c` OK + grep of the mutated line — and run individually): M1 type←`command` → 2 redaction tests FAIL; M2 raw task array forwarded → key-set pin FAILS; M3 dev gate always-on → `prod_basename_never_forwards_payload_keys` FAILS; M4 values instead of key names → `dev_basename_…` FAILS. Restored by checksum.
  - [x] verify-self  <!-- status: done -->
    - [x] Redaction by what remains — evidence: `cargo test --test hook_pl_output` → exit 0, 23 passed (key-set pin + 6 secrets absent; count 5, types ["shell","monitor","?","?","?"])
    - [x] Dev-only `payload_keys` — evidence: `dev_basename_forwards_payload_key_names_never_values` + `prod_basename_never_forwards_payload_keys` → ok
    - [x] Telemetry tail format — evidence: `cargo test --lib status_log` → 16 passed; status_log diff is 70+/0− (existing format tests unchanged)
    - [x] Bad shapes degrade — evidence: `stop_task_types_degrade_to_empty_on_every_bad_shape` + `…count_degrades_to_zero…` → ok
    - [x] `pnpm verify:auto` — evidence: EXIT=0 in 35s (vitest 3413, cargo lib 1022, clippy -D warnings clean)
    - [x] Consuming surface (deployed dev hook → live socket → drain → status-channel.log) — evidence: deployed `claudesk-hook-dev.pl` byte-identical to repo; new lines `… event=Stop … bg=1 bg_types=shell keys=background_tasks,cwd,hook_event_name,session_id` and `… event=UserPromptSubmit … keys=cwd,hook_event_name,prompt,session_id`; `SECRET_CMD` count 0
    - [x] align: forward `type` only vs `type`+`status` — evidence: wire line `"background_task_types":["shell"]`, no status field; built at `claudesk-hook.pl` (the `Stop` block's `map`), which reads only `->{type}`
  - [x] verify-human  <!-- status: done -->
    - [x] P1.verify-human.1: (decision) forward `type` only vs `type` + `status` → operator approved **type only** (2026-10-20); add `status` later only if a Phase 2 capture shows a non-`running` value  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    - Already covered from build (not duplicated): redaction by what remains, dev/prod key-name gate, bad-shape degrade, telemetry tail format (`hook_pl_output.rs` + `status_log` tests).
    - New: `status_broadcaster::commands::tests::event_detail_threads_each_wire_field_into_its_own_slot` — the drain-loop helper, built from wire JSON (the consuming-surface seam reachable without a live app; the live drive is in verify-self). Mutation: swapping the types/keys arguments → FAILS. Restored by checksum.
    - Full suite: `pnpm verify:auto` → exit 0 (45s), vitest 3413, cargo lib 1023.

- [ ] Phase 2: Capture and verdicts  <!-- status: NOT-STARTED; depends on Phase 1 -->
  **Observable outcomes:**
  - CLI (state-changing: dev build + scratch workspaces under `tmp/scratch/`): launch
    `pnpm tauri:dev` with the Claude-marker env strip
    (`[[agent-launched-app-cannot-verify-continue]]`). The dev identity's `status-channel.log`
    then holds a `Stop` line with `bg=` and `keys=` fields from a real CC session.
  - CLI: captures exist for each case:
    - (a) a turn that starts a background shell (`bg_types=shell`)
    - (b) a turn with nothing outstanding (`bg=0`)
    - (c) a prompt typed while a turn runs: two `UserPromptSubmit` lines with no `Stop` between,
      and their `keys=` compared
    - (d) a background-task notification dequeue
  - CLI (corpus): for Q2, a count over CC transcripts of turns whose last `Skill` was
    `feature-verify-human` while a `run_in_background` Bash was still outstanding. The method and
    the number are recorded.
  - CLI: `wbs.md` → "Probe outcomes" holds the captured key sets, the observed `type` values, and
    a verdict per question: hook payload, transcript, or upstream ask.
  **Alignment questions:**
  - ⚠️ (decision, outward-facing) **The artifact case needs one artifact published from a scratch
    CC session.** That is a private artifact on your claude.ai account, and I can't delete it
    without your confirmation. OK to publish one throwaway private artifact for the capture? The
    alternative is to wait for one to occur naturally on a build with Phase 1 in it.
  - Do the recorded verdicts match what you see day to day (purple after artifacts; purple at
    verify-human with a dev server up)?
  - [ ] P2.1 Live captures (a)–(d) on the dev build in scratch workspaces.  <!-- status: NOT-STARTED -->
  - [ ] P2.2 Artifact capture, only on your OK (see the Alignment question).  <!-- status: NOT-STARTED -->
  - [ ] P2.3 Corpus count for Q2.  <!-- status: NOT-STARTED -->
  - [ ] P2.4 Write "Probe outcomes" in `wbs.md` with the per-question verdicts and what WP4
        should build.  <!-- status: NOT-STARTED -->
  - [ ] verify-auto  <!-- status: NOT-STARTED -->
  - [ ] verify-self  <!-- status: NOT-STARTED -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [ ] verify-codify  <!-- status: NOT-STARTED -->

## Current Node
- **Path:** Feature > Phase 2 > P2.1
- **Active scope:** P2.1 (live captures on the dev build)
- **Blocked:** P2.2 awaits the operator's OK to publish one private throwaway artifact
- **Unvisited:** none after Phase 2
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
