---
drive_mode: autopilot
---

# Feature: M18 WP1 — remote Recycle respawns CC

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-11-18
**Entry:** reproduce (bug-fix feature)
**WBS:** `workflow-system/product/wbs.md` → WP1. **Constraints:** `arch/claude-substrate.md` §R.7.

## Problem Statement

`SURFACE-2026-11-17-REMOTE-RECYCLE-NEVER-RESPAWNS-CC`. On a REMOTE workspace, Recycle runs `/session-handoff`
(`.session.md` is written), then types `/exit` (CC ends, `SessionEnd` reaches the status channel), and then
**no new CC is ever started**. There is no `SessionStart` and no `claudesk` tmux server on the host, and `.session.md` stays
unconsumed. Expected, as for a local workspace: a fresh CC spawns and receives `/session-restore`, which consumes `.session.md`.

## Reproduction Attempt

**Surface chosen:** failing test (the real `XtermPane` under jsdom) + the WP8 telemetry, re-read.
**Outcome:** reproduced
**Artifact:** `src/components/workspace/__tests__/remoteRelaunchIntentLive.test.tsx`
- `a workspace opened through the Reconnect door attaches on its FIRST spawn only`: **FAILS**,
  `expected 'reconnect' not to be 'reconnect'`. The relaunch's `cc_spawn_remote` re-sends the door's intent.
- `positive control: a Fire-door workspace's relaunch spawns with Fire`: passes. The test can tell the two cases apart.

**Determinism:** every run.

**Cause (mechanism):**
1. `workspace.open_intent` is the picker DOOR, and it lives as long as the workspace. A remote workspace opened through the
   **Reconnect** door keeps `"reconnect"` for its whole life (`Workspace.tsx` passes `openIntent={workspace.open_intent}`).
2. Recycle's step 5 respawns through `XtermPaneHandle.relaunch()`. The re-run spawn effect calls
   `takeSpawnArgs(…, openIntent, spawnIntentRef)`, which returns `override ?? openIntent`. Recycle sets no override, so the
   respawn sends `intent: "reconnect"` again.
3. `cc_spawn_remote` maps `intent == Reconnect` → `attach = true` → `tmux attach -t =<name>`, never `new -A`. That is correct for a
   reconnect, which must never silently restart a session that died. But Recycle's own `/exit` has just ended that tmux
   session, so the attach finds nothing, the terminal ends at once (classified Ended), and no CC is started.

**The WP8 evidence matches exactly** (prod `status-channel.log`, 2026-11-17, scratch row):
- 21:12:17 `register ws-3` + `SessionStart`: a fresh open.
- Between 21:12:27 and 21:12:53: `deregister` → `register ws-4` with **no** `SessionEnd` or `SessionStart`. That is a reattach,
  so ws-4 was opened through the Reconnect door.
- 21:13:06 the Recycle handoff on ws-4 → 21:13:14 `Stop` → 21:13:15 `SessionEnd` → nothing until a fresh open
  (`register ws-5`, 21:17:07).

**Notes:**
- **The same defect hits any relaunch of a Reconnect-door pane,** for example the pane's Relaunch / Retry button after its session
  ended. Any later spawn of that pane sends `reconnect` and dies the same way.
- **A local workspace can't hit it:** `reconnect` is only ever a door for remote rows.
- **A Fire-door remote Recycle was never observed live.** WP8's only Recycle was on ws-4. The positive control shows the
  frontend sends `fire` on that path. Whether the backend's `new -A` respawn then lands is for this WP's verify-self (§R.7:
  the respawn goes through the open's spawn path).
- **The fix direction (for the plan):** Reconnect is the FIRST spawn's door only. A relaunch of the pane is a new session, so the
  spawn sends `fire` instead of `reconnect`. Recycle has already marked the clean-exit route, so `fire` gives a plain `new -A`
  and no `--continue`, and Recycle injects `/session-restore` itself. Keep the backend rule (`Reconnect` → attach, never
  `new -A`) unchanged: §R.7 warns against "fixing" the reconnect path to create sessions.

## Work Tree

- [x] Phase 1: a relaunch never re-uses the Reconnect door
  **Fix shape:**
  - A pure `relaunchIntent(door)` in `src/cc/spawnArgs.ts`: `"reconnect"` → `"fire"`; every other door is unchanged.
  - `takeSpawnArgs` gains an `isRelaunch` flag and applies `relaunchIntent` to the door when it is set. The one-shot override
    (`turn-respawn`) still wins over the door.
  - `XtermPane` keeps a `doorUsedRef`, set in the SAME place `hasSpawnedRef` is latched (a spawn that resolved and was not
    cancelled, so a StrictMode run doesn't count) and **never cleared by `handleRelaunch`**. It passes it as `isRelaunch`.
  - The backend is unchanged: `Reconnect` → attach, never `new -A` (§R.7).
  **Observable outcomes:**
  - CLI: `./node_modules/.bin/vitest run src/components/workspace/__tests__/remoteRelaunchIntentLive.test.tsx` → 2/2 pass. Reverting only the `XtermPane` change (or `relaunchIntent` returning its input) makes the Reconnect case fail again (mutation, each on its own, restored by `cp` + `shasum`).
  - CLI: unit tests for `relaunchIntent` / `takeSpawnArgs` cover each door × {first spawn, relaunch} × {override, none}. `turn-respawn` still wins on a relaunch.
  - CLI: `pnpm verify:auto` exits 0.
  - CLI (state-changing, dev build, mini SCRATCH folder `~/claudesk-scratch-remote` only, dev tmux server `-L claudesk-dev`): a **Reconnect-door** remote Recycle. Open the scratch row → Detach → reopen (Reconnect) → Recycle. Then:
    - `tmux -L claudesk-dev ls` shows the workspace's session with a `created` time AFTER the Recycle;
    - the new remote transcript's first user prompt is `/session-restore`;
    - `test -f ~/claudesk-scratch-remote/workflow-system/state/.session.md` fails (consumed);
    - the dev `status-channel.log` shows `SessionEnd` then `SessionStart` for that cwd.
  - CLI (state-changing, same fence): a **Fire-door** remote Recycle (open the scratch row fresh, then Recycle). Same four checks.
  - CLI: the tank row and the prod tmux server (`-L claudesk`) are untouched: the session list and its creation times are unchanged before and after.
  **Alignment questions:**
  - (decision) The pane's Relaunch / Retry on a Reconnect-door remote workspace now starts a fresh session (`new -A`, plus `--continue` when the unclean flag is set) instead of attaching. Is that what you want?
  - [x] P1.1 `relaunchIntent` + `takeSpawnArgs(…, isRelaunch)` + unit tests
  - [x] P1.2 `XtermPane` `doorUsedRef` wiring; the reproduce test goes green
  - [x] P1.3 `arch/remote-workspaces.md` §E: the Recycle row's KNOWN FAILURE → as-built (cause + fix). Rewrite the backlog entry for deletion at close
  - [x] verify-auto
    - evidence: `pnpm verify:auto` → EXIT=0 in 44s. vitest **319 files / 4061 tests passed**, cargo test 1362 passed, tsc / check:link / clippy `-D warnings` / `cargo fmt --check` clean. eslint: 1 warning, PRE-EXISTING (`XtermPane.tsx` spawn-trigger deps spread, on HEAD before this change).
    - evidence: the first run failed on `prettier --check` (`src/cc/__tests__/spawnArgs.test.ts`, the new test block). Fixed with `prettier --write` on that file, then re-run as above.
    - evidence: the reproduce test `remoteRelaunchIntentLive.test.tsx` → 2/2. Mutants, each on its own and restored by `cp` + `shasum` (RESTORED-OK): M1 `relaunchIntent` returns its input → the Reconnect case FAILS; M2 `doorUsedRef.current = true` removed → the Reconnect case FAILS. The Fire control stays green in both.
  - [x] verify-self
    - method: driven by the ORCHESTRATOR through the `tauri` MCP bridge, NOT the runner subagent: the bridge is not exposed to subagents (memory `mcp-bridge-tools-not-exposed-to-subagents`). Dev build launched with the Claude-marker `env -u` strip, bridge on 9223 = dev PID 46932 (not prod). Gate set ON in the DEV `settings.json` for the run and restored (backup → `workflow_features_enabled: false`). A scratch row was added to dev `projects.json` via `add_remote_project` (dev account, `~/claudesk-scratch-remote`) and removed after (row SET equal to the backup, 8 rows).
    - [x] Fire-door remote Recycle — evidence: the first open (no label = Fire) → tmux `-L claudesk-dev` `cd-f37d9999` created=1795022673. Recycle at 1795022956 → a NEW session created=1795022965 (+9 s). The new transcript `…fb5ac0c9.jsonl` first user prompt = `/session-restore` (17:29:27Z). `.session.md` was written by the handoff, then consumed by the restore. Dev status log: 12:29:24 `SessionEnd` → 12:29:25 `SessionStart`.
    - [x] Reconnect-door remote Recycle (the WP8 case) — evidence: Detach (`filmstrip-detach-ws-1`) → session kept running, attached=0; the picker label read `↻ reconnect`; reopen → the SAME session (created=1795022965) attached=1, dev log `register ws-3` with NO `SessionStart` (a reattach = the Reconnect door). Recycle at 1795023272 → a NEW session created=1795023279 (+7 s). The new transcript `…a2c5cb25.jsonl` first user prompt = `/session-restore` (17:34:41Z). `.session.md` was consumed. Dev log: 12:34:39 `SessionEnd` → 12:34:40 `SessionStart`. (Before the fix this exact sequence ended with no `SessionStart`: the WP8 ws-4 evidence.)
    - [x] Tank row / prod tmux untouched by this run — evidence: every remote command used `-L claudesk-dev`, and the dev app never listed tank's row. ⚠️ Prod's `cd-86d4c157` WAS recreated at 12:35:14, but the PROD status log shows why: `deregister` 12:35:05 → `SessionEnd` 12:35:10 → `register ws-10` → `SessionStart` 12:35:14. That is a close × + reopen in the PROD app's UI (operator / tank's own flow), which the dev app cannot reach.
    - [x] Cleanup — evidence: the dev scratch workspace was closed via `filmstrip-close-ws-3` (the R-1 close path ran: no dev tmux server left, no dev `ssh -M`; the only master is prod's PID 53301, tank's). The seeded scratch WIP was removed (the scratch folder holds `README.md` + an empty `workflow-system/state/` again). Dev app stopped (TaskStop; no `target/debug/claudesk` left).
    - [x] align: (decision) Relaunch / Retry on a Reconnect-door pane now starts a fresh session — evidence: `spawnArgs.test.ts` `door reconnect: a relaunch sends relaunchIntent(door)` → `fire`, and the live Reconnect-door Recycle above (which goes through the same `relaunch()`). The backend then runs `new -A`, plus `--continue` only with the unclean flag set. Judgment is the operator's.
  - [x] verify-human
    - [x] P1.verify-human.1 (decision) Relaunch / Retry on a Reconnect-door pane starts a fresh session (`new -A`, `--continue` if unclean) instead of attaching. Operator: **A**, keep it (2026-11-18).
  - [x] verify-codify
    Test scope: full — last phase
    - evidence: no new tests needed. Every verified behaviour is already pinned: the real-pane test `remoteRelaunchIntentLive.test.tsx` (the consuming surface, `XtermPane` → `cc_spawn_remote`, Reconnect door + Fire control); `spawnArgs.test.ts` (each door × first spawn / relaunch / override; term_spawn ignores the flag); and the caller guard (the invoke passes `doorUsedRef.current`). The backend is unchanged.
    - evidence: `pnpm verify:auto` (full) → EXIT=0 in 46s; vitest 319 files / 4061 tests, cargo test 1362 passed.

## Current Node
- **Path:** Feature > ship
- **Active scope:** ship
- **Blocked:** none
- **Unvisited:** none (single phase)
- **Open discoveries:** none

## Discoveries
- [NOTE-2026-11-18] verify-self — the first Recycle attempt in the EMPTY scratch folder was declined by the real `/session-handoff` ("nothing to hand off", no `.session.md`), so Recycle stopped before its respawn, correctly. Whether the operator saw a toast for that stop wasn't captured: no toast was in the DOM ~4 min later, and it may have expired. Not filed, because it's unconfirmed. Seeding a throwaway WIP made the handoff write, as above.
