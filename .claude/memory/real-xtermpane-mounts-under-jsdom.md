---
name: real-xtermpane-mounts-under-jsdom
description: The REAL XtermPane (and its spawn effect) mounts under jsdom with only @xterm/* + ResizeObserver + rAF faked; restore real timers BEFORE teardownIpc or afterEach hangs. Precedent autoResumeFireLive.test.tsx.
metadata:
  type: project
---

The shared live harness (`src/components/workspace/__tests__/liveWorkspace.tsx`) **stubs** `XtermPane`, so nothing in it reaches the pane's own spawn effect (`cc_spawn` → listeners → `cc_ready` → the auto-resume timer → `cc_input`). The real pane DOES mount under jsdom; precedent: `src/components/workspace/__tests__/autoResumeFireLive.test.tsx` (paydown-2026-11-08 WP5, the first test of the real spawn path).

Recipe:
- `// @vitest-environment jsdom`; `vi.mock` only what jsdom cannot run: `@xterm/xterm` (a fake `Terminal` with `options`, `rows`/`cols`, `buffer.active`, `loadAddon`, `open`, `focus`, `write`, `dispose`, `scrollToLine`, `registerMarker`, `onData → {dispose}`), `@xterm/addon-fit` (`fit`, `proposeDimensions`), `@xterm/addon-serialize` (`serializeAsHTML`).
- Stub `globalThis.ResizeObserver` and, if missing, `requestAnimationFrame`/`cancelAnimationFrame`.
- Use `bootIpc(handler)` / `teardownIpc(root, host)` / `ipcCalls` / `uncaught` from `liveWorkspace.tsx` (real `mockIPC` with events) and render `<XtermPane workspaceId projectPath pendingAction openIntent />` yourself.
- To cross `FIRE_DELAY_MS`, `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })` then `await act(() => vi.advanceTimersByTimeAsync(ms))`.

⚠️ **Call `vi.useRealTimers()` BEFORE `teardownIpc`.** Its `settle()` awaits a real `setTimeout`, which never fires under the fake clock: the `afterEach` hook times out at 10 s while the test body itself PASSED, which reads like a broken test. See also [[whole-app-jsdom-boot-via-tauri-mockipc]] (the whole-app boot precedent) and [[extract-for-import-when-a-raw-guard-cant-express-the-property]].
