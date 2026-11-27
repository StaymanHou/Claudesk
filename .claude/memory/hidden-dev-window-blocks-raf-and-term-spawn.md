---
name: hidden-dev-window-blocks-raf-and-term-spawn
description: "A HIDDEN dev window (visibilityState 'hidden') runs no rAF: the right-panel terminal never spawns, screenshots go stale; write into the real xterm Terminal via its fiber instead. A relaunched app leaves the bridge session stale."
metadata:
  type: project
---

When the agent-launched `pnpm tauri:dev` window is not on screen (another Space, behind other windows),
`document.visibilityState === "hidden"` and **requestAnimationFrame does not run**. Seen 2026-11-27
(paydown WP8 verify-self):

- The right-panel terminal's **deferred `term_spawn` never happens** (it waits on an rAF-driven fit), so
  `cc_input` to `ws-N-term-0` fails with `no such session`, even though the Terminal tab reads `is-active`.
- `webview_screenshot` returns a **stale paint** (the tab row still shows the old active tab).
- A DOM read straight after a state change can miss the render. Read again a moment later
  ([[react-state-read-needs-a-deferred-frame]]).

**Driving terminal-parser behaviour anyway (no focus steal):** write into the CC pane's REAL xterm
`Terminal`. From `[data-testid="xterm-pane"]` take the `__reactFiber…` key, walk `.return` up to the
`XtermPane` fiber, and scan its hook list (`memoizedState` → `.next`) for a hook whose `memoizedState.current`
has both `.write` and `.parser` (it was the 2nd hook, 2 fibers up). Then
`term.write('\x1b]52;c;…\x07', cb)`. This runs the real parser and the registered OSC handlers and the
notice path. It skips only the PTY byte transport, so say so in the evidence. Never `osascript activate`
or `open -a` to unhide the window ([[feedback_osascript_activate_side_effects]]).

**Bridge after a relaunch:** after killing the dev app and launching a new one on the same port (9223),
`driver_session start` says "Already connected" and the next `webview_execute_js` times out. Run
`driver_session stop`, then `start`. Scripts sent before the reconnect may still have run
([[mcp-bridge-execute-js-timeout-keeps-running]]).

**Why:** without this, a live check of a terminal surface looks impossible ("no such session") and gets
pushed to the operator, or the agent steals the operator's focus to unhide the window.
**How to apply:** check `document.visibilityState` before planning a live terminal-spawn check. If it is
`hidden`, use the fiber write above, and record the substitution in the evidence.
