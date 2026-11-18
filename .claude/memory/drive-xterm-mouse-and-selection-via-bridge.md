---
name: drive-xterm-mouse-and-selection-via-bridge
description: Driving xterm.js mouse/selection/copy through the tauri MCP bridge — synthetic MouseEvents need detail:1, async scripts time out, read the live Terminal via its React fiber ref, execCommand('copy') returns false but copies.
metadata:
  type: reference
---

Four traps, each hit while live-verifying M18 WP2.5 (remote copy to the Mac clipboard) on 2026-11-18:

1. **A synthetic `MouseEvent` needs `detail: 1`.** xterm's selection service switches on
   `event.detail` (the click count). `new MouseEvent(...)` defaults it to 0, so an Option+drag
   silently selected NOTHING. Mouse REPORTS to the pane's program (tmux with `mouse on`) don't check
   it, which is why a plain drag reached tmux while the Option-drag did not. Dispatch `mousedown` on
   `document.elementFromPoint(x, y)` (the `.xterm-screen`) and `mousemove`/`mouseup` on `document`,
   all with `button: 0`, `buttons` 1→0, `detail: 1`.
2. **An `async`/`await` script times out on the bridge** ("Script execution timeout"), even
   when its work ran. Run synchronously, stash results on `window.__x`, and read them back in a
   second call.
3. **Read the live `Terminal`, not the DOM.** The `.xterm-selection` query returned 0 divs while
   a selection existed. Instead, walk the React fiber from the `.xterm-screen` element (find
   the `__reactFiber*` key, then follow `f.memoizedState` → `.next` hooks, then `f.return`) for a ref whose
   `current.getSelection` is a function. That gives `hasSelection()`, `getSelection()`,
   `buffer.active.getLine(i).translateToString(true)`, `modes.mouseTrackingMode` and `options`.
   With several workspaces open, pick by rect: a parked workspace's screen sits at x ≈ −99993
   but still has an `offsetParent`.
4. **`document.execCommand('copy')` returns `false` in WKWebView yet copies** the focused
   xterm's selection (the same copy event Edit → Copy fires). Never trust the return value. Prove
   it with a control: `pbcopy` a token, select (the token must still be there), copy, then `pbpaste`.

Related: [[xterm-dom-reads-fake-a-blank-pane]] (reading glyphs), [[mcp-bridge-seed-held-workspace-status-via-fiber]]
(the same fiber-walk idea for state), [[agent-cannot-send-real-keystrokes-to-dev-app]], [[mcp-bridge-tools-not-exposed-to-subagents]]
(so these checks are orchestrator-only).
