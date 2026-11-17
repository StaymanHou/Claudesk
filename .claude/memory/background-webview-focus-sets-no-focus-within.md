---
name: background-webview-focus-sets-no-focus-within
description: In the agent-launched dev app, el.focus() does not set :focus-within/:focus-visible while the window is not key, so hover/focus-revealed controls stay visibility:hidden to the bridge; reveal inline for a capture.
metadata:
  type: project
---

Hit 2026-11-17 (M17 WP5 Phase 3, capturing the remote tile's ⏸ / ⇥ cluster for an alignment look).

- **Programmatic focus does not engage `:focus-within` / `:focus-visible` in a background WKWebView
  window.** `document.querySelector('[data-testid="filmstrip-close-…"]').focus()` returned with
  `document.activeElement` set, yet `.tile-actions:focus-within` matched nothing and the revealed
  controls stayed `visibility: hidden`. The shipped ⏸ behaves the same, so it is the instrument,
  not the CSS.
- **A `visibility: hidden` element cannot take focus at all** (`el.focus()` → `activeElement` unchanged).
- **`el.click()` still works on a hidden control**: it dispatches the click and runs the React
  handler, so the BEHAVIOUR is drivable even while the control is hidden.
- **To capture a hover/focus-revealed control for the operator:** read the reveal rule's computed
  values, apply them INLINE (`style.visibility='visible'; style.opacity='0.75'`), take the bridge
  screenshot, then clear the inline styles. Say in the evidence that it was revealed this way.

Same family as [[agent-cannot-send-real-keystrokes-to-dev-app]] (the dev app is never the key window
for the agent) and [[wkwebview-button-click-does-not-take-focus]].
