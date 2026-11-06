---
workflow: task
state: close (complete)
completed: 2026-11-06
created: 2026-11-06
docs-only: false
drive_mode: autopilot
parent: workflow-system/product/backlog-paydown-wbs.md → WP11
---

# Task: Sweep WP11 — scratch workspaces out of the repo, and the reopened-pane probe

**Workflow:** task
**State:** Completed 2026-11-06
**Created:** 2026-11-06

## Problem Statement
Agent-driven CC sessions in `claudesk/tmp/scratch/*` resolve to the operator's own `claudesk` workspace, so its dot, blue overlay and supervisor follow the agent's test turns. Separately, a reopened workspace's CC pane was once seen never painting, and that has not been reproduced.

## Context
- **D4** (sweep default): the new home is `/Users/stayman/Personal/projects/claudesk-scratch/`, a sibling outside the repo.
  - ✅ It is checked to actually escape. `status_broadcaster::resolve_cwd` matches **path components** (`is_path_ancestor`), and `resolve_cwd_sibling_with_shared_string_prefix_does_not_match` pins that `claudesk-scratch` is not a child of `claudesk`.
- **What moves** (all of `tmp/scratch/` except throwaway-spec use): `scratch-a`, `scratch-b`, `scratch-c`, `restore-test`, `media-probe`, `media-probe-outside`, `f-b-prof`, `m15-probe`, `f-b-probes.md`.
  - `media-probe-outside` is not on the WBS list, but `media-probe/fixtures/escape-link.png` is an **absolute** symlink into it.
  - The two absolute symlinks (`escape-link.png`, `inner-link.png`) must be recreated to the new targets.
  - `tmp/scratch/` itself STAYS, for throwaway vitest specs (WBS; the memories `node-strip-types-…` and `vitest-console-log-…` rely on it).
- **Dev app data** (`~/Library/Application Support/com.claudesk.app.dev/`, operator machine; back it up first):
  - `projects.json` has 3 scratch rows (a, b, c), to be repointed.
  - `session-state.json` holds unclean-exit flags for `restore-test`, `scratch-a/b/c` and `verify-041`. Drop those five keys rather than repoint them: a moved dir has a NEW CC transcript slug, so an armed `--continue` would resume nothing.
  - **Prod `projects.json` has NO scratch rows** (checked), so it is not touched.
  - The logs and `time-analytics.sqlite` are history and are left alone.
- **Code and doc sites** (re-grepped 2026-11-06):
  - `CLAUDE.md` (the structure-tree line and the verify-tiers bullet).
  - `docs/lessons/verify-self-tiers.md` (2).
  - `tooling/autofire-timing/probe.py` (docstring, the `--project` default, and the `"tmp/scratch/" not in` warning) plus `probe.sh` (2 comments).
  - `tooling/unclean-flag/hard-kill-check.sh` (step text).
  - `tooling/adjudicator-probe/corpus.ts`: `isScratchSlug` gains the new prefix and KEEPS `-tmp-scratch-`, so historical transcripts still classify. `M15_PROBE_SLUG` is used by `mine.probe.ts` as an exact match, so it becomes a set holding old and new.
  - `.claude/memory/dev-profile-for-f-b-verification.md` (the `f-b-prof` path).
- **Left alone:**
  - the mock `"/tmp/scratch/…"` strings in tests;
  - prose mentions of `scratch-a` in Rust and TS comments;
  - historical outbox handoffs, `wbs.md`, the archives, `arch/workflow-supervisor.md:349`.
- **Backlog entries:**
  - `SURFACE-2026-08-21-STATUS-PATH-KEYS-ON-CWD-ALONE-COLLAPSING-SESSIONS` (medium): REWRITE it to its residual. Two real sessions in one repo still collapse, so it is not deleted.
  - `SURFACE-2026-11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS`: settled by T7.
- **Memories that apply:**
  - `[[hmr-stale-across-file-rename]]` (the known false positive: probe on a FRESH launch with no source edits mid-run).
  - `[[xterm-dom-reads-fake-a-blank-pane]]` (a blank DOM read is an instrument error, so use screenshots plus a positive control).
  - caveat (h) (a fresh pane is blank for ~4–10 s).
  - `[[verify-self-dev-vs-prod-process-name-collision]]` (PID-scoped teardown).
  - `[[agent-launched-app-cannot-verify-continue]]` (env strip; text and `\r` sent as separate writes).

## Work Tree

- [x] T1 **Preflight + backups.** Confirm no dev or bundle Claudesk is running, and that no `claude` process has its cwd under `tmp/scratch` (`lsof -a -d cwd -c claude`). Copy the dev `projects.json` and `session-state.json` to `claudesk-scratch/.backup-2026-11-06/`, and also to the session scratchpad.
- [x] T2 **Move.** `mkdir claudesk-scratch`, then `mv` the nine entries (same filesystem, so these are renames, including the 4.8 GB render). Recreate the two absolute symlinks and check them with `readlink` plus `test -e`. Add a short `README.md` saying what the directory is for and why it lives outside the repo. Afterwards, `tmp/scratch/` should hold only `.DS_Store`.
- [x] T3 **Dev app data.** Rewrite the 3 `projects.json` rows to the new paths. Drop the 5 scratch keys from `session-state.json`. Validate both with `json.load` and diff them against the backups (the only changes should be the intended keys).
- [x] T4 **Tooling.**
  - `probe.py`: derive the default from `repo.parent / "claudesk-scratch" / "scratch-a"`, and the warning checks for that root.
  - `probe.sh` comments.
  - `hard-kill-check.sh` text.
  - `corpus.ts`: `isScratchSlug` keeps the old pattern and adds a `-Users-stayman-Personal-projects-claudesk-scratch-` prefix; `M15_PROBE_SLUGS` becomes a set of old and new, with `mine.probe.ts` using `.has`.
  - `corpus.test.ts`: new-slug positives, and a negative showing `…-claudesk-src-tauri` is NOT scratch.
  - Mutation-prove the new prefix clause.
  - Run `python3 tooling/autofire-timing/test_probe.py` (registry entry exists).
- [x] T5 **Docs.** `CLAUDE.md` (2 sites), `verify-self-tiers.md` (2), and the dev-profile memory. Afterwards, `grep -rn "tmp/scratch/scratch-\|tmp/scratch/restore-test\|tmp/scratch/media-probe\|tmp/scratch/f-b-prof\|tmp/scratch/m15-probe"` outside the left-alone set must return 0.
- [x] T6 **`verify:auto`** (timeout 207000).
- [x] T7 **The reopened-pane probe.** Run it on a FRESH `pnpm tauri:dev`, launched once with the env strip and with no source edits during the run, using the moved `scratch-b`. Instrument: `webview_screenshot` scored on the CC pane's share of bright (text) pixels, read at ≥15 s and again at ≥60 s.
  - **(A) Control:** first open paints. Folder trust will be asked, since the path is new, and the dialog painting counts as paint.
  - **(B) Normal close while idle, then reopen.**
  - **(C) Reproduce the entry's sequence:**
    1. Accept trust, then drive one short turn with `cc_input`: the text, then `\r` as a separate write.
    2. While the turn is Running, close and choose Close Anyway.
    3. Change the picker-row drive mode, then reopen by row click.
    4. Read at 15 s, 60 s and 2 min.
  - If the pane never paints in (B) or (C), the bug is REPRODUCED; go to T8. If every arm paints, it is NOT reproduced.
- [x] T8 **Act on T7.**
  - **Reproduced:** trace `cc_ready` and the output listener for the reopened session id, then fix and re-run the failing arm. If the fix grows beyond task scope (a cross-module redesign), SURFACE it instead and keep the entry open with the repro.
  - **Not reproduced:** rewrite the entry to an "installed-build watch" with the probe evidence, and leave it open.
- [x] T9 **Close-time bookkeeping** (applied by `/task-close` in the CHANGELOG commit):
  - rewrite `08-21-STATUS-PATH-KEYS…` to its residual (two real sessions per repo; drop priority back to low, since the routine trigger is gone);
  - settle the `11-04-REOPENED…` entry per T8;
  - mark WP11 ✅ in `backlog-paydown-wbs.md`.

## Act log (T1–T6, 2026-11-06)
- **T1:** Only the operator's installed app (PID 6591) was running, and no `claude` had a cwd under `tmp/scratch`. The backups in `claudesk-scratch/.backup-2026-11-06/` and the scratchpad are shasum-identical to the live stores.
- **T2:** Nine entries moved (same filesystem device 16777229, so renames). Both absolute fixture links were recreated and resolve. `scratch-a/b/c` and `restore-test` are still git repos. `tmp/scratch/` now holds only `.DS_Store`. A `README.md` was added. **Extra:** `f-b-prof/claude-scratch/plugins/known_marketplaces.json` had a live absolute `installLocation`, now repointed (the target exists). CC's own history files in that profile still name old paths, and that is left alone as history.
- **T3:** `projects.json`: 3 rows repointed. `session-state.json`: 5 scratch flags dropped (only `yitang-copy` remains). A semantic diff against the backups confirms only these changes; Claudesk writes pretty JSON (`to_vec_pretty`), so formatting is fine.
- **T4:**
  - `probe.py`: default `repo.parent/"claudesk-scratch"/"scratch-a"`, and the warning is now `scratch_root not in project_dir.parents` (checked: new path True, old path and repo False). `probe.sh` and `hard-kill-check.sh` text updated. `test_probe.py` 21/21.
  - `corpus.ts`: `isScratchSlug` keeps `-tmp-scratch-` and adds the `…-claudesk-scratch-` prefix (a strict superset); `M15_PROBE_SLUGS` is a set used via `.has`. The new test passes 28/28, and the mutant dropping the new clause FAILS it (restored by shasum). `tsc` includes `tooling/adjudicator-probe` and is green.
- **T5:**
  - `CLAUDE.md`: the tree line (now "throwaway vitest specs; CC workspaces in ../claudesk-scratch") and the verify-tiers bullet.
  - `verify-self-tiers.md` §3: the new path plus a ⚠️ "never move them back under the repo" with the reason.
  - The dev-profile memory.
  - **Extra:** two `m15SupervisorFixture.test.ts` comments that named the probe scripts' location; the test reads only in-repo fixtures.
  - The re-grep leaves only mock strings and historical files.
- **T6:** `verify:auto` EXIT 0, 63 s, 3710 tests.

## T7 probe (2026-11-06, fresh `pnpm tauri:dev`, no source edits during the run)
Dev chain: `target/debug/claudesk` PID 21836 (parent 21667). Workspace: the moved `claudesk-scratch/scratch-c` (default profile; drive mode autopilot at the start). Instrument: `webview_screenshot` scored by `ccscore.py` (the share of bright pixels in the CC pane). Calibration from WP10 screenshots: a blank pane reads 0.0000, a painted CC welcome reads 0.0012. Every arm was also eyeballed.

| Arm | Sequence | Read | Score | Result |
|---|---|---|---|---|
| A | first open (`cc-1`) | 15 s | 0.0016 | paints: CC's folder-trust dialog (new path). Answered Down then `\r` as separate writes ("No, exit" is the default!), and it reached the REPL (0.0012) |
| B | normal close while idle (no guard), reopen by row click (`cc-2`) | 15 s | 0.0012 | paints: welcome + prompt |
| C | one turn (`1..300`, done in 4 s), then a `sleep 45` turn (state `background_work`); close → guard "scratch-c is still working… Close Anyway" → **Close Anyway**; picker-row drive mode autopilot → **None**; reopen by row click | 15 s, ~33 s, ~80 s | 0.0012, 0.0011, 0.0011 | paints: welcome + prompt, header shows `None`. One `claude` in scratch-c, spawned WITHOUT `--continue` (the same arm as the report's `cc-2`); the forced-closed one is gone |

**Verdict: NOT reproduced.** The planned 60 s read first landed at ~33 s, because the harness blocked a foreground `sleep 45`. A background wait then gave a genuine read at ~80 s, which also painted. Cleanup:
- `scratch-c` was closed normally, so it is not armed to `↻ continue`, and its drive mode was restored to autopilot.
- The dev chain (21638/21667/21795/21836) was killed by PID; no `claude` was left in `claudesk-scratch`.

**The move's actual purpose, observed in the INSTALLED app** (`com.claudesk.app/status-channel.log`):
- Every one of the 13 hook events from this probe's sessions (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` ×2, `SubagentStop`, `SessionEnd`) reads `cwd=…/claudesk-scratch/scratch-c … resolved=none`.
- The same scratch-c events BEFORE the move read `cwd=…/claudesk/tmp/scratch/scratch-c … resolved=ws-3` (the operator's `claudesk` workspace).

**T8 (not-reproduced branch):** `SURFACE-2026-11-04-REOPENED-WORKSPACE-CC-PANE-NEVER-PAINTS` was rewritten to "open — watch", priority low. It now carries the probe matrix, the HMR caveat, the two leads, and a capture checklist for any installed-build sighting.

## Current Node
- **Path:** Task > closed
- **Active scope:** none (completed 2026-11-06)
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow-system/state/backlog.md -->

## Verification Observable

**Observable:** A fresh CC session started in the moved `claudesk-scratch/scratch-a` produces hook events that the INSTALLED Claudesk resolves to NO workspace, while events from the repo itself (this session's cwd) still resolve to the operator's open `claudesk` workspace in the same log. That second half is the positive control: it proves the `claudesk` workspace is registered at the time.
**Verification command:** `env -u <Claude markers> claude -p "Reply with the single word ok" --no-session-persistence` run in `/Users/stayman/Personal/projects/claudesk-scratch/scratch-a`, then read the new lines of `~/Library/Application Support/com.claudesk.app/status-channel.log`: `grep "claudesk-scratch/scratch-a"` and `grep "cwd=/Users/stayman/Personal/projects/claudesk "`.
**Expected result:** the command exits 0 and prints `ok`; ≥1 new `scratch-a` event, every one `resolved=none`; ≥1 recent repo-cwd event with `resolved=ws-<n>`.

## Verification Result

**Status:** PASS
**Date:** 2026-11-06
**Evidence:** `claude -p` in `claudesk-scratch/scratch-a` printed `ok`, `exit=0`. New installed-log lines:
```
1793985608583 STATUS event=SessionStart cwd=/Users/stayman/Personal/projects/claudesk-scratch/scratch-a mapped=none resolved=none outcome=dropped
1793985609738 STATUS event=UserPromptSubmit cwd=…/claudesk-scratch/scratch-a mapped=running resolved=none outcome=dropped
1793985610789 STATUS event=Stop cwd=…/claudesk-scratch/scratch-a mapped=idle resolved=none outcome=dropped bg=0 bg_types=-
1793985610982 STATUS event=SessionEnd cwd=…/claudesk-scratch/scratch-a mapped=none resolved=none outcome=dropped
```
Positive control, bracketing the test session in the same log:
```
1793985605131 STATUS event=PreToolUse cwd=/Users/stayman/Personal/projects/claudesk mapped=none resolved=ws-3 outcome=dropped
1793985613719 STATUS event=PostToolUse cwd=/Users/stayman/Personal/projects/claudesk mapped=running resolved=ws-3 outcome=emitted
```
**Notes:** PASS. 4/4 scratch events resolve to no workspace, while the operator's `claudesk` workspace (`ws-3`) was registered before and after. The pre-move counterpart in the same log read `resolved=ws-3` for `…/claudesk/tmp/scratch/scratch-c`, the defect this task removes. The `UserPromptSubmit` → running and `Stop` → idle events, the ones that move a dot, are both dropped. T7's 13 probe events agree. The pane-probe half was settled in act (not reproduced, entry rewritten to a watch); there is nothing further to verify for it.

## Retrospect
- **What changed in our understanding:** Moving the scratch workspaces is enough to stop the operator's `claudesk` workspace from following agent test turns, and that is now proven in the installed app's own log (`resolved=ws-3` before, `resolved=none` after). `resolve_cwd` matches path components, so a sibling with a shared name prefix is safe. The "reopened pane never paints" sighting did not reproduce on a fresh launch across all three arms, including the exact Close Anyway → drive mode None → reopen sequence. The most likely remaining explanation is the long-lived dev window of 11-04, but that is unproven, so the entry stays open as a watch.
- **Assumptions that held:**
  - D4 (a sibling directory) works.
  - The prod `projects.json` had no scratch rows.
  - The move is a same-filesystem rename, so the 4.8 GB render costs nothing.
  - The old slug pattern must stay, so historical transcripts still classify.
- **Assumptions that were wrong:**
  - The WBS move list missed `media-probe-outside`, the target of an absolute fixture link, and both fixture links were absolute, so they had to be recreated.
  - A live absolute path also sat inside the scratch CC profile (`known_marketplaces.json` `installLocation`).
  - Two test-file comments named the probe scripts' location.
  - The first turn I drove finished in 4 s, too fast to close mid-run; a `sleep 45` turn was needed, and CC ran it as a background task, so the state read `background_work`, though the close guard still read it as running.
  - The harness blocks a foreground `sleep 45`, so one planned "60 s" read landed at ~33 s; a background timer gave the real ~80 s read.
- **Approach delta:**
  - Moved nine entries, not eight (+`media-probe-outside`).
  - Repointed one CC-profile config path.
  - Dropped the stale unclean flags rather than repointing them: a new path has no CC history, so `--continue` would resume nothing.
  - Added a README to the new directory.
  - Annotated the trust-prompt backlog entry with the ready-made repro this move created.

**Closure notice:** Requester = operator — closure notice for self-record. Sweep WP11 is complete: the CC scratch workspaces and fixtures now live in `/Users/stayman/Personal/projects/claudesk-scratch/`, outside the repo, so agent test sessions no longer drive the operator's `claudesk` workspace (verified in the installed app's status log). The reopened-pane sighting did not reproduce and is now an installed-build watch. See commit `59ae19e`, and this archive file's "T7 probe" and "Verification Result".
