---
name: agent-cannot-send-real-keystrokes-to-dev-app
description: The agent cannot deliver a REAL keystroke to the dev app — postToPid never reaches a non-key window and macOS refuses activate() from the agent's process; a synthetic keydown never triggers a native default. Native-action chord checks go to the operator unless a positive control proves delivery.
metadata:
  type: project
---

"Does chord X trigger a NATIVE action?" (⌘R reload, a menu shortcut, a WebKit default) cannot be
answered by the agent against `pnpm tauri:dev`, and every obvious attempt produces a false green:

- **A synthetic `KeyboardEvent` (bridge `webview_execute_js`) never triggers a native default action.**
  It reaches JS listeners — so it IS valid for app chords handled in React (⌘W, ⌘1–9, the media zoom)
  — but "the window did not reload" after a synthetic ⌘R proves nothing.
- **`CGEvent.postToPid(pid)` does not reach a window that is not key.** A posted ⌘= did NOT zoom the
  focused image; `document.hasFocus()` read `false`. So a "no reload" after a posted ⌘R is also void.
- **`NSRunningApplication(processIdentifier:).activate()` from the agent's process is refused.** The
  frontmost app stayed the operator's installed Claudesk (macOS will not let a background process
  steal activation). That at least means the attempt costs the operator nothing.

**Why:** found at M16 WP2 Phase 2 (2026-09-29) while checking that ⌘R in a media tab does not reload
the webview. Only a positive control (⌘= through the same delivery path, observable in the DOM)
revealed that the "PASS" readings were delivery failures. The operator ran it by hand in 5 seconds.

**How to apply:** for any native-action chord, first run a positive control through the SAME delivery
path (a key whose effect is observable in the DOM). If the control does nothing, the path is dead:
record `UNVERIFIED: undrivable — real key delivery refused` with static evidence (no menu item /
listener binds the key) and hand the one keypress to the operator. Do not add a speculative
`preventDefault` "just in case" — ask. Related: [[macos-tcc-permissions-granted]] (screenshots and
osascript GUI QUERIES work — input delivery is the gap), [[verify-self-dev-vs-prod-process-name-collision]]
(never target the app by name), [[react-state-read-needs-a-deferred-frame]].
