---
name: react-state-read-needs-a-deferred-frame
description: Reading the DOM in the same tick as a synthetic click reports the PREVIOUS render, which is indistinguishable from a broken handler — defer a frame before asserting React-driven state.
metadata:
  type: project
---

Verifying the turn-nav controls, clicking through the real buttons and reading the DOM
**synchronously in the same tick** showed the readout frozen at `3/3` with `next` stuck
`disabled` across four clicks. Reported as *"clicking does nothing"* — i.e. **a defect**.

There was no defect. **React had not committed yet.** Re-reading after
`requestAnimationFrame` showed the correct walk: `3/3 → 2/3 → 1/3 → 2/3 → 3/3` with both ends
disabling properly.

**The pattern that works** (chain the clicks, sample after each commit):

```js
const tick = () => {
  if (i >= clicks.length) { window.__done = true; return; }
  q(`workspace-turn-${clicks[i++]}`).click();
  requestAnimationFrame(() => { window.__seq.push(snap()); requestAnimationFrame(tick); });
};
```

…then read `window.__seq` in a **separate** bridge call. (A single call that awaits the whole
sequence times out the MCP bridge.)

⚠️ **Distinct from [[mcp-bridge-interact-click-needs-el-click-fallback]]** — `el.click()` *did*
reach React's handler here. The bug was **when I looked, not how I clicked**, so the usual
fiber-`onClick` workaround was not the fix and would have masked the real lesson.

⚠️ **Distinct from [[tauri-xterm-pty-gotchas]]** — that covers rAF-deferring xterm's `fit()` for
*sizing*. This is about reading **React state** after an event.

⚠️ **The dangerous shape: a same-tick read produces a FALSE FAIL, not a visible error.** "Nothing
happened" reads as a broken handler and invites a fix to working code. Any assertion over
React-driven DOM (`disabled`, conditional mounts, text from state) must be sampled at least one
frame after the event. Related: [[hmr-stale-across-file-rename]] — both are "relaunch/re-read
before believing a verify RESULT".
