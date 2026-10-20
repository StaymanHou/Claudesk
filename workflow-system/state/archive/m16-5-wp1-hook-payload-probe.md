---
drive_mode: autopilot
---

# Feature: M16.5 WP1 — Probe: what the hook channel carries for background work and dequeued prompts

**Workflow:** feature
**State:** finalize (complete)
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

- [x] Phase 2: Capture and verdicts
  **Relevance check (before Phase 2):** requester still needs it: yes · requirements unchanged: yes · still feasible: yes · no superior alternative: yes. **Verdict:** proceed.
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
  - [x] P2.1 Live captures (a)–(d) on the dev build in scratch workspaces.  <!-- status: done -->
  - [x] P2.2 Artifact capture, only on your OK (see the Alignment question).  <!-- status: done -->
  - [x] P2.3 Corpus count for Q2.  <!-- status: done -->
  - [x] P2.4 Write "Probe outcomes" in `wbs.md` with the per-question verdicts and what WP4
        should build.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done -->
    - Docs-only phase: `git diff --name-only d9f13ab -- src src-tauri` → 0 files; changed = `wbs.md` + this WIP.
    - `grep` of `wbs.md` → Q1 ANSWERED, Q2 SIZED, Q3 ANSWERED headers present.
    - `python3 -I q2_corpus.py 45` (scratchpad) → exit 0, reproduces 204 verify-human turn ends / 57 with a bg shell / 1 with a later recorded completion (turns 1808→1809: this session's own new turn).
  - [x] verify-self  <!-- status: done -->
    - [x] Real CC Stop lines with bg=/keys= in the dev log — evidence: 7 scratch-c `Stop` lines, `resolved=ws-1`, 12-key set (e.g. ts 1792524120764)
    - [x] Cases (a)–(d) + artifact — evidence: (a) `bg=1 bg_types=shell` @1792524120764; (b) `bg=0` ×4; (c) UPS 1792524435631 → PreToolUse → UPS 1792524445621 → PostToolUse → Stop, identical keys, transcript enqueue 19:27:25.627Z / remove 19:27:42.829Z; (d) task-notification UPS @1792524194958 with `origin.kind` task-notification; artifact `bg=1 bg_types=monitor` @1792524697134
    - [x] Corpus + installed-log join — evidence: `q2_corpus.py 45` → 204 / 57 / 1 reproduced; independent `vh_join.py 15000` → 37 of 106 background_work (recorded 36/105 an hour earlier; drift from a new turn, now noted in wbs.md)
    - [x] Probe-outcomes write-up — evidence: wbs.md key sets equal the dev log's real-CC `keys=` sets (Stop 12, UPS 8); `subagent` occurs 4× in `bg_types`; each verdict names its source
    - [x] align: artifact publish (operator-approved) — evidence: one publish, URL `YJZRwYuaa7YqkPVmYVg4jr` (transcript idx 462), followed ~1.4 s later by the `bg_types=monitor` Stop
    - [x] align: do the verdicts match daily experience — evidence: Q1/Q2 verdict lines verbatim in wbs.md; 37 of 106 re-derived
  - [x] verify-human  <!-- status: done -->
    - [x] P2.verify-human.1: do the verdicts match what you see day to day? → Q1 yes ("the issue I'd like to address"); Q2 yes, with a correction: the verify-human treatment applies with or without a dev server/container  <!-- status: done -->
    - [x] P2.verify-human.2: (decision) accept the three verdicts as WP4's design basis → accepted with Q2 REVISED: EVERY verify-human pause reads BLUE regardless of background work (operator chose blue over purple/leave-as-is); Q1 and Q3 unchanged. Recorded in wbs.md (Q2 verdict + WP4 4.2 + exit criteria) and the backlog SURFACE.  <!-- status: done -->
  - [x] verify-codify  <!-- status: done -->
    - No integration boundary — phase records measurements only (no code changed). No new tests: the hook's generic `type` forwarding (incl. `subagent`/`monitor`) is already pinned by Phase 1's `stop_forwards_task_types_and_nothing_else_from_the_tasks`; the classification built on these verdicts is WP4's to codify.
    - Full suite: `pnpm verify:auto` → exit 0 (39s), vitest 3413, cargo lib 1023.

## Code-Quality Review

*(feature-review-quality on ship `e63831b`, window `d9f13ab^..e63831b`, drive_mode=autopilot: 0 CRITICAL / 1 MAJOR / 4 MINOR — all auto-backlogged to `backlog-quality-findings.md` → `# m16-5-wp1-hook-payload-probe — 2026-10-20`.)*

### Strengths
- Redaction is checked by what remains: the emitted line's whole key set is pinned plus six planted sentinels, so an unnamed new field leaking onto the wire fails.
- The dev-only gate is tested from both sides (dev-basename copy vs prod-named repo copy), each the other's control; four individually mutation-proven mutants recorded.
- Stale-seam degradation: non-object / non-scalar `type` → `"?"` (list always aligns with the count); absent/malformed `background_tasks` → `[]`; each bad shape tested.
- `format_event_detail` keeps every non-Stop line byte-identical; existing format tests untouched.
- The `wbs.md` probe outcomes name each verdict's evidence source and flag their own open assumptions.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- [`status_broadcaster/commands.rs` tests] The new `event_detail_threads_each_wire_field_into_its_own_slot` was inserted between `end_to_end_socket_background_work_emits_then_clears_on_a_clean_stop` and its 12-line rustdoc, so the "clearing edge" warning now documents the wrong test. — backlogged (`SURFACE-2026-10-20-QUALITY-WP1-DOC-COMMENT-DETACHED-FROM-ITS-TEST`).

**MINOR**
- [`status_broadcaster/commands.rs`] Telemetry tail concatenated at two unguarded call sites; deleting either `+ &event_detail(&event)` passes every test.
- [`status_broadcaster/mod.rs` tests] Redundant `background_task_types: None, payload_keys: None` in three spread literals.
- [hook + `HookEvent` + `format_event_detail` + tests; `wbs.md` WP4 4.4] `payload_keys` removal is unmarked and 4.4's wording does not name it or say `background_task_types` stays.
- [`claudesk-hook.pl`] The dev gate re-derives the dev basename owned by `hook_install::commands::script_basename`.

### Assessment
A well-built probe: the privacy-sensitive redaction and gating are the strongest part, Rust changes are small and additive, `event_to_state` is untouched, and pre-existing log lines are byte-identical. The debt is in how the telemetry tail is threaded, the redundant `None` fields that widen WP4's cleanup, and one real readability regression (the detached rustdoc). All four are cheap and fit WP4 task 4.4's pass.

### If you disagree
Edit this section and mark a finding `[DISMISSED]` before `feature-finalize` archives this file.

## Retrospect
- **What changed in our understanding:** "The hook gives a count, never the tasks" was OUR hook's redaction, not a CC limit — CC sends the full `background_tasks` array, and its `type` is safe to forward. That turned Q1 from "maybe an upstream ask" into a hook-payload answer (`monitor`). `UserPromptSubmit` fires at ENQUEUE, not dequeue. And `Stop` carries `last_assistant_message` (deliberately not used — free-text state inference).
- **Assumptions that held:** a live capture beats reasoning about undocumented payloads; type-only forwarding is enough (operator approved, no non-`running` status seen); the corpus could size Q2.
- **Assumptions that were wrong:** the scope of Q2. The plan treated it as "purple only when a shell is outstanding"; the operator ruled EVERY verify-human pause should read blue, so ~2/3 of pauses (grey `idle`) are in scope too. Also my first corpus estimate (57/204) over-counted: 93 of 138 background shells never log a completion, so the installed app's own recorded dot state (37/106) had to be the authoritative measure.
- **Approach delta:** the dev hook is registered machine-wide, so passive capture of the operator's real sessions supplemented the scratch captures (that is where `subagent` was first seen). Driving input needed a separate `\r` write (a long one-chunk message is taken as a paste) and fire-and-forget `cc_input`. The artifact was published from the scratch-c session (only a `Stop` carries the task list), and could not be deleted from here (the delete confirmation can't be presented in-session) — left for the operator. One verify-self outcome (the drain-loop call site) was added at verify-self because no test reaches it.

**Completed:** 2026-10-20.

**Feature complete:** M16.5 WP1, the hook-payload probe, has shipped. The hook now forwards each background task's type, and the three status-channel questions are answered in `wbs.md` → "Probe outcomes" (artifact watch = `monitor`; every verify-human pause → blue; mid-turn prompts discriminated by event order). Requester = operator — closure notice for self-record.

## Current Node
- **Path:** Feature > complete (archived)
- **Active scope:** none
- **Blocked:** none (the probe artifact awaits the operator's own delete; nothing depends on it)
- **Unvisited:** none after Phase 2
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->
- [NOTE-2026-10-20] P2.1 — `cc_input` of a long message with a trailing `\r` in ONE write is taken as a paste (the `\r` becomes a newline); submit with a separate `\r` write. Also `await`ing `cc_input` through `webview_execute_js` timed out; fire-and-forget worked.
- [NOTE-2026-10-20] P2.2 — the artifact was published from the scratch-c session (only a `Stop` carries the task list, and this session's `Stop` would not fire until its turn ended). Deleting it needs the operator's confirmation, which a session can't present; left for the operator (`/artifacts` → d).
