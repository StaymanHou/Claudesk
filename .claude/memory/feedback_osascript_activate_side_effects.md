---
name: osascript activate (and equivalents) are side-effecting on macOS Spaces, not reads
description: Activating any app via osascript/open -a/subl/etc. gathers that app's windows onto the current Desktop — treat as a write during dev-time probes
type: feedback
---

`osascript -e 'tell application "<App>" to activate'`, `open -a "<App>"`, and any other command that launches/raises/activates a user-facing app on macOS is a side-effecting operation on Spaces (Mission Control Desktops) state — not a measurement read. macOS gathers an app's windows onto the currently-active Space whenever the app is activated there (unless individual windows are pinned via "Assign To → Specific Desktop"). Any probe, test, dev-time script, or measurement routine that activates a live app may disturb the user's live window arrangement across Desktops.

**Why:** On 2026-06-16 during the WP3 Sublime CLI probe, repeated `osascript activate` calls on Sublime Text — used to measure focus theft mechanically — yanked the user's live ST windows across multiple Desktops onto the active one. The measurement intent was harmless ("which app is frontmost after this command?"); the *instrument* was destructive. Recovery required manual Mission-Control window-dragging. The probe data was good but the user-state cost was not.

**How to apply:**
- Before designing a probe/test/dev-script that activates a live app, ask: "is there live user state in this app that my measurement instrument could disturb?" Use `pgrep -fl <app-process>` / `lsappinfo` to check — if the app is already running with user state, the instrument is no longer free.
- For *measuring* (e.g., "is app X frontmost?"), prefer read-only inspection: `osascript -e 'tell application "System Events" to name of first process whose frontmost is true'` (querying System Events does NOT activate the target app), `pgrep -fl`, `lsappinfo info -only pid <pid>`. Never use the target app itself as the source of truth via AppleScript-to-<app>.
- Sublime Text has a stricter per-app rule in this project — see `feedback_no_sublime_activate.md`. The current rule is the generalized version: treat ANY activation of ANY live user-facing app as a write, not a read.
- Scope: **dev-time / agent-driven only.** A built application (e.g., Claudesk itself) that activates Sublime/other apps as its core function is not constrained by this rule — that's the app's product behavior, not a measurement.
