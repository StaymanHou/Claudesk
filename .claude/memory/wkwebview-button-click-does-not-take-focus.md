---
name: wkwebview-button-click-does-not-take-focus
description: In Claudesk's WKWebView a click on a <button> does not move focus, so an overlay opened from one leaves focus in xterm and any key it handles also reaches CC; overlays must take focus themselves.
metadata:
  type: project
---

In the app's WKWebView, clicking a `<button>` (a real click, or `el.click()` from the bridge) does NOT move focus to it. A popover opened from a header button therefore leaves focus where it was, normally xterm's `.xterm-helper-textarea`. A key the popover handles through a `document` listener ALSO goes to the terminal, so an Esc that closes the popover can reach CC and interrupt a running turn.

Measured live at paydown 2026-11-04 WP8 (2026-11-06) on the supervisor-activity `▾` popover. With a positive control, after the click `document.activeElement` was `xterm-helper-textarea`, and the closing Esc was logged as `Escape@xterm-helper-textarea`. After the fix, focus was on the popover and nothing reached the page.

**Why:** WebKit does not focus buttons on mouse click (unlike Chrome), and jsdom's `click()` does not focus either, so unit tests cannot reveal a leak unless they put focus in a stand-in terminal first.

**How to apply:**
- An overlay that handles keys takes focus on open (`tabIndex={-1}` + `focus()` in a mount effect), handles the key in its OWN `onKeyDown` with `stopPropagation`, and restores focus to the previous element on close (only if focus is still its own or was lost with its node).
- The observable is `document.activeElement` right after the click. Check it live over the MCP bridge, and in a jsdom test focus a stand-in `<textarea>` before clicking.
- A `document` capture listener (App's overlay Esc, Workspace's chord handler) still runs first: check it ignores the key while the overlay is open.
- Related: [[agent-cannot-send-real-keystrokes-to-dev-app]], [[tauri-xterm-pty-gotchas]].
