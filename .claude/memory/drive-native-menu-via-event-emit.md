---
name: drive-native-menu-via-event-emit
description: Drive a native menu item in the dev app from the bridge by emitting the real `menu` event (`plugin:event|emit`) from webview_execute_js; it reaches App's actual menu listener.
metadata:
  type: project
---

The native app menu cannot be clicked by the agent, and the tauri bridge's `ipc_execute_command` only reaches
its own allowlisted commands. But App's menu handling is a plain event listener (`listen("menu", …)` in
`App.tsx`, fed by `src-tauri/src/app_menu`), so the agent can drive it through the **same event channel a native
click uses**:

```js
(() => { window.__r = null;
  window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'menu', payload: 'workspace.openSublimeText' })
    .then(() => setTimeout(() => { window.__r = document.querySelector('[data-testid="workspace-inject-toast"] span')?.textContent ?? null; }, 300));
  return 'fired'; })()
```

Then read `window.__r` in a second `webview_execute_js` call. Menu ids are `MENU_IDS` in `src/menu/menuBridge.ts`
(launchers like `workspace.openSublimeText` run App callbacks; panel/finder/search ids become synthetic keydowns).

**How to apply:** fire-and-forget (the bridge often reports "Script execution timeout" on a script that chains
promises, while the emit did land); read the DOM a frame or more later ([[react-state-read-needs-a-deferred-frame]]).
⚠️ A LAUNCHER id on a LOCAL workspace really launches Sublime / Finder (window focus, Spaces: see
[[feedback_no_sublime_activate]]), so prove the local launch path in jsdom (`src/__tests__/remoteMenuLaunchers.test.tsx`),
not live. Used at M17 WP6 (2026-11-17) to prove all 8 menu items for absent surfaces show their notice on a
remote workspace. Related: [[agent-cannot-send-real-keystrokes-to-dev-app]], `docs/lessons/mcp-tauri-bridge-caveats.md`.
