---
name: vite-hmr-stamped-url-is-a-separate-module-instance
description: In the Vite dev webview, an edited module is imported by the app as `<path>?t=<ts>` (even after a full reload), so a bridge-side `import('<path>')` gets a SEPARATE instance with its own module-level state. Import the exact URL from `performance.getEntriesByType('resource')`.
metadata:
  type: project
---

After a source file is edited while `pnpm tauri:dev` runs, Vite rewrites importers to fetch it as
**`/src/…/mod.ts?t=<timestamp>`**, and that stamped URL survives a full `location.reload()`. A
`webview_execute_js` dynamic `import('/src/…/mod.ts')` by the **plain** URL is a DIFFERENT module
record, so its module-level state (a `Map` store, a singleton, a latch) is a fresh copy **the app never
reads**. Writes through it silently do nothing, and a check built on them looks like a broken feature.

**How to apply:** before driving a module's state from the bridge, list what the app actually loaded:

```js
performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('turnOrigin'))
// → ['http://localhost:1420/src/state/supervisor/turnOrigin.ts?t=1790600181428', '…/turnOrigin.ts']
```

Import the **stamped** URL (fire-and-forget: `import(url).then(m => { window.__m = m })`, since a
Promise-returning script times out the eval, `docs/lessons/mcp-tauri-bridge-caveats.md`). Then prove
it is the shared instance with a **positive control through the app's own behavior**. Here, an origin
armed via the imported `turnOrigin` made the real `XtermPane` render `⚙ 2/2`, while a control turn
stayed `1/1`. An unedited module has only the plain URL. The plain-URL entry in the list above was the
bridge's own import.

**Why:** found 2026-09-28 at supervisor-activity-record P3 verify-self. It is what let the agent verify
the real pane (normally only structurally guarded) live. Related: [[hmr-stale-across-file-rename]],
[[mcp-bridge-seed-held-workspace-status-via-fiber]] (the other way to push state in),
[[agent-launched-app-cannot-verify-continue]] (how to get real turns to act on).
