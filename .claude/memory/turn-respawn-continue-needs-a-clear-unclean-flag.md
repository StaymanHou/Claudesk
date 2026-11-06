---
name: turn-respawn-continue-needs-a-clear-unclean-flag
description: "`--continue` on a respawn proves the `turn-respawn` door ONLY when the unclean-exit flag is clear; `/exit` leaves it true, so on a flagged workspace a `fire` relaunch also gets `--continue`. Close (clears it) → fresh open → Apply."
metadata:
  type: project
---

When verifying live that a drive-mode Apply's respawn spawns as `turn-respawn` (not the workspace's
`fire` door), `--continue` in the respawned `claude` argv is a **discriminating** observation only
when the project's unclean-exit flag is **clear**.

- The running session sets the flag, and **`/exit` leaves it `true`**: read the dev
  `~/Library/Application Support/com.claudesk.app.dev/session-state.json`. On a flagged workspace a
  `fire` relaunch ALSO gets `--continue` (it resumes and consumes the flag), so `--continue` there
  cannot tell a correct override from a lost one.
- **Closing the workspace clears the flag** (the picker row then shows no `↻ continue` / `⊘`).
- `cc_session`'s table: `(TurnRespawn, flag=false) → Continue`, while `fire` with no flag → a plain
  start. So the decisive recipe is:
  1. close the workspace, then reopen it fresh;
  2. check the open's spawn argv has **no** `--continue` (the positive control);
  3. Apply a drive mode from the header;
  4. check the respawn's argv **has** `--continue` (`ps -ax -o pid,ppid,args`, children of the dev
     app's PID).
- A follow-up "a plain relaunch drops the one-shot override" check can NOT be made decisive live:
  after the respawn the flag is set again, and clearing it would mean an undeclared edit to
  `session-state.json`. Leave that property to `takeSpawnArgs`'s unit test and the live-harness
  `spawnIntentRef.current === null` assertion.

**Why:** in paydown 2026-11-04 WP12 verify-self, the first Apply on `scratch-c` showed
`--continue`, and that looked like proof until it turned out the workspace carried the flag. The
check passes on both a correct build and a broken one, which is
`[[verify-the-mutation-landed]]`'s decisive-observation trap applied to a live check.

**How to apply:** any live check of the drive-mode respawn intent, `takeSpawnArgs` /
`spawnIntentRef`, or the open-door argv arms. Launch the dev app with the full Claude-marker strip
first ([[agent-launched-app-cannot-verify-continue]]).
