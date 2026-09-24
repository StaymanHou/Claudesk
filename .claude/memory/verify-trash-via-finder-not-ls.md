---
name: verify-trash-via-finder-not-ls
description: ~/.Trash is TCC-blocked for the agent's shell ("Operation not permitted"); verify a Trash move via a read-only Finder osascript query instead
metadata:
  type: reference
---

`ls ~/.Trash` from the agent's shell fails with **`Operation not permitted`**. macOS protects the Trash under TCC (Full Disk Access), and the app hosting the shell does not hold that grant. Observed 2026-09-24 while verifying F-b's Delete-to-Trash (P5.vs.7), from a session running inside a Claudesk-hosted Claude Code pane.

**Use Finder's scripting interface instead. It is read-only and works:**

```
osascript -e 'tell application "Finder" to get name of every item of trash'
osascript -e 'tell application "Finder" to count items of trash'
```

Pipe the first through `tr ',' '\n' | sed 's/^ //'` and grep for the dir's basename. Take a count before and after, so a pre-existing item with the same name cannot fake a pass.

⚠️ **No `activate`.** Querying Finder does not gather windows. An `activate` / `open -a Finder` would, which counts as a WRITE during a probe (see [[feedback_osascript_activate_side_effects]]).

Recurs at the `/release` gate: whether `trash::delete`, which is Finder-backed on macOS, needs an Automation grant from an installed `.app`. Related grants: [[macos-tcc-permissions-granted]].
