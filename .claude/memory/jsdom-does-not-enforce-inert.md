---
name: jsdom-does-not-enforce-inert
description: jsdom does not enforce `inert`, so a jsdom test or a code reading of focus into a background (inert) workspace predicts focus landing in the hidden pane, while WKWebView refuses it and leaves focus on <body>; reproduce such focus bugs live.
metadata:
  type: project
---

Background workspaces are rendered `inert={!visible}` (`Workspace.tsx`). In WKWebView, `el.focus()` on
anything inside an inert subtree is a no-op, and focus stays where it was or falls to `<body>`.
**jsdom does not implement that**: the same `focus()` call succeeds there.

Hit at paydown-2026-11-27 WP5: a review read `PickerOverlay`'s `restoreFocus` as sending keystrokes
into a hidden yolo CC session ("+" → ⌘⇧digit → Esc). Live, the keys went nowhere: focus was stranded
on `<body>`, and the newly centered pane took no keys until clicked. The misroute was a jsdom/code
reading artifact; the real defect was smaller and different, and the fix changed with it (fall back
to the center-stage CC pane).

**How to apply:**
- A focus bug involving background workspaces is reproduced in the dev app over the MCP bridge
  first; record `document.activeElement` after each step.
- A fix that must skip inert targets checks `el.closest("[inert]")` itself, so jsdom tests see the
  same behaviour the real webview enforces (React 19 reflects the `inert` prop as an attribute, so
  the selector works under jsdom).
- A jsdom test that asserts focus "did not reach the background pane" passes on HEAD only by luck
  of the check; pair it with the live reading.

Related: [[background-webview-focus-sets-no-focus-within]], [[never-touch-the-prod-app-or-its-listener]].
