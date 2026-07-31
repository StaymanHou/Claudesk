---
name: mcp-bridge-interact-click-needs-el-click-fallback
description: mcp__tauri__webview_interact{click} can fail with "window.__MCP__.resolveRef is undefined" when the bridge's ref helper isn't loaded on the page — fall back to a plain el.click() inside webview_execute_js, which drives every control type. Also: read the real Tauri command names from lib.rs's invoke handler instead of guessing.
metadata:
  type: reference
---

**`mcp__tauri__webview_interact{click}` is not always available, and its failure is not a selector problem.** It can reject with:

```
Interaction failed: WebView execution failed: undefined is not an object
(evaluating 'window.__MCP__.resolveRef')
```

`window.__MCP__` is the bridge's own injected ref-resolution helper. When it isn't present on the page, `webview_interact` cannot resolve the element handle it works through — so the call fails **regardless of whether the selector is correct and the element is on screen**. Don't debug the selector; it's the helper that's missing.

**The fallback that works: dispatch the click from inside the page.**

```js
// webview_execute_js
(() => {
  const b = document.querySelector('[data-testid="workflow-invite-later"]');
  if (!b) return "MISSING";
  b.click();
  return "clicked";
})()
```

Confirmed against every control type needed for a full M10.9 WP5 exit run: buttons in a modal, a header gear button, a checkbox `<input>` in the Settings panel, and a modal close `✕`. React `onClick` handlers fire normally — `el.click()` produces a real, trusted-enough event for React's synthetic system.

**⚠️ `el.click()` bypasses hit-testing, so it proves nothing about reachability.** This is the same trap that made three "verified live" passes hollow in WP3.5b (a 702px dialog in a 599px panel, its button row below the fold, driven happily by `data-testid`). When a check is about a control being *usable*, measure geometry explicitly in the same call — `getBoundingClientRect()` for in-viewport, plus `document.elementFromPoint(cx, cy)` and assert the returned node **is** the target or a descendant:

```js
const r = el.getBoundingClientRect();
const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
const reachable = r.top >= 0 && r.bottom <= innerHeight && !!top && (el === top || el.contains(top));
```

**Second, cheaper lesson from the same session: don't guess Tauri command names.** Two plausible guesses (`workflow_substrate_status`, `get_workflow_invite`) were both wrong and each cost a round-trip; the real names were `workflow_substrate_installed` and `workflow_get_invite`. `grep` the `invoke_handler` list in `src-tauri/src/lib.rs` first — it is the authoritative registry, and a wrong name returns a generic `Command <x> not found` that looks like a backend problem rather than a typo.

Next entry in the root `CLAUDE.md` bridge-verify-self caveat chain — recorded there as **caveat (g)** at the "NEW (2026-06-26) — the agent CAN now drive live verify-self via the `tauri` MCP bridge" bullet. Siblings: [[mcp-bridge-tools-not-exposed-to-subagents]] (drive the bridge yourself; `ipc_emit_event` param + payload hazards; the same-frame-DOM-read staleness trap that this note's geometry read must also respect), [[mcp-bridge-manage-window-reads-native-geometry]] (native window geometry for NSPanel/PiP position checks), and [[mcp-bridge-seed-held-workspace-status-via-fiber]] (fiber-dispatch status seeding). Teardown discipline unchanged: `driver_session{stop}` → `TaskStop` the `tauri:dev` task → **PID-scoped** port cleanup, never a blanket `pkill` (see [[verify-self-dev-vs-prod-process-name-collision]] and [[lsof-ti-tcp-misses-ipv6-vite]]).
