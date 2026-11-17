---
name: bridge-same-tick-editor-input-sends-stale-draft
description: Setting the Prompt panel's CM6 text and firing ⌘↵ in the SAME synchronous bridge script sends nothing (send reads the draft through a ref a React effect updates after the change); set the text in one webview_execute_js call and send in the next.
metadata:
  type: project
---

**Symptom (M17 WP7 Phase 4, 2026-11-17):** a `webview_execute_js` script that set the Prompt panel's editor text
(`view.dispatch({changes: …})`, the view from `.cm-content`'s `cmView.view` or, after a remount, `cmTile.view`) and
then dispatched a ⌘↵ keydown on `.cm-content` returned `defaultPrevented: true`, yet nothing was sent: no prompt in
the pane, no toast, the text still in the editor. It looked exactly like a product bug.

**Cause:** the host's keydown router did call the panel's `send` (hence `preventDefault`), but `send` reads the
draft through `docRef`, which `PromptPanel` updates in a `useEffect` after `@uiw/react-codemirror`'s `onChange` sets
state. Inside one synchronous script that effect has not run yet, so `send` saw the PREVIOUS draft (empty after the
last send) and no-op'd. A human never types and presses ⌘↵ in the same tick.

**How to apply:** set the text in one `webview_execute_js` call, then fire the chord (or click `prompt-send-submit`)
in a SEPARATE call. The same holds for any React-controlled input whose handler reads a ref synced by an effect.
Input-side twin of [[react-state-read-needs-a-deferred-frame]] (which is about reading the DOM too early); see also
[[agent-cannot-send-real-keystrokes-to-dev-app]].
