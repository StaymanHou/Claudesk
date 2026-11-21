---
name: mockipc-listen-registers-synchronously
description: Under mockIPC with shouldMockEvents, listen registers synchronously, so a subscribe-then-query race is invisible in jsdom until the listen replies are held back
metadata:
  type: project
---

Under `@tauri-apps/api/mocks` `mockIPC(cb, { shouldMockEvents: true })`, `listen` registers its handler
**synchronously** inside the mocked invoke (`handleListen` pushes it before the promise resolves). So an ordering
race of the "query before the listener subscription resolves" kind cannot happen in jsdom: a test of it passes
against the broken code.

**Why:** M18 WP8 P1.2 (2026-11-20). `RemoteRunPanel` queried `getRemoteRunState` at mount, before its three
`useTauriListen` subscriptions resolved, so in the real app a run that finished in that window left the panel
stuck. Under the plain mock the race never occurs.

**How to apply:** to reproduce a subscribe-then-query race, wrap the mocked invoke AFTER `mockIPC`:
`window.__TAURI_INTERNALS__.invoke = wrap(original)`. Let `plugin:event|listen` call through at once, so the handler
still registers, but make its REPLY await a promise the test releases. Then assert the query was not sent while the
listens were held, fire the event, and resolve the query. The worked example is `mountPanel({ wrapInvoke })` and the
test "a run that ends while a reopened panel is still asking shows its end, not a stuck run" in
`src/components/settings/__tests__/remoteHostsSettings.test.tsx`. Prove it with a mutation: HEAD's panel failed only
once the listens were held back. Related: [[whole-app-jsdom-boot-via-tauri-mockipc]], [[verify-the-mutation-landed]].
