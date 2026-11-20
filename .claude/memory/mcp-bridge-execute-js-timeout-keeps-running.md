---
name: mcp-bridge-execute-js-timeout-keeps-running
description: The tauri MCP bridge's `webview_execute_js` reports "Script execution timeout" on a slow async script, but the script KEEPS RUNNING in the webview (its invokes and side effects happen). Launch work fire-and-forget, store results on `window`, read them back in a second call.
metadata:
  type: project
---

**`webview_execute_js` times out on an async script that awaits slow work (a remote exec, several
IPC round trips), yet the script runs to completion in the webview.** The error comes back with no
result, and the work still happened.

**Observed (M18 WP5, 2026-11-20, three times):**
- An IIFE awaiting `remote_open_check` + `remote_substrate_refresh` timed out.
- The next call found the link already Up and the cache already written: the "timed-out" script had
  run the open check.
- Re-running it would have duplicated a remote exec.

**How to apply:**
- Start the work without awaiting it, write each step's result to `window.__x`, return at once:
  `(() => { window.__x = []; (async () => { … window.__x.push([tag, value]) … })(); return "started"; })()`.
- Read back with a second, synchronous call: `(() => window.__x)()`. Poll again if it is incomplete.
- Use `setTimeout`-staged reads inside the launched script when timing matters, e.g. a highlight that
  fades after 1.2 s: read at +200 ms and +1.6 s.
- ⚠️ Assume a timed-out script DID its side effects before retrying anything state-changing.

Related: [[react-state-read-needs-a-deferred-frame]], [[mcp-bridge-tools-not-exposed-to-subagents]].
