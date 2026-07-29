---
name: mcp-bridge-tools-not-exposed-to-subagents
description: The mcp__tauri__* bridge tools are available to the ORCHESTRATOR but NOT to spawned subagents — a verify-self subagent silently falls back to bare Vite (no Tauri IPC), so drive the bridge yourself for live-app outcomes. Plus ipc_emit_event's param is `eventName`, and a plain-string payload avoids the double-encoding problem.
metadata:
  type: reference
---

**The `mcp__tauri__*` bridge tools are available to the ORCHESTRATOR but are NOT exposed to spawned subagents.** `.mcp.json` declares the server and the bridge binds fine — the tools simply are not in a subagent's toolset. This is not a config problem, so don't go looking for one.

**Why it matters (it cost a real verification hole).** A `feature-verify-self-runner` subagent that can't reach the bridge falls back to **Playwright against bare Vite at `localhost:1420`**, which reaches the React frontend but **NOT the Tauri backend** — no `__TAURI_INTERNALS__`, no IPC, no native event bus. The subagent reports honestly, but any outcome needing live IPC comes back only *partially-verified*. In **M10.9 WP2 Phase 3** this left the native `menu`-event transport unverified (outcome 3), and it was only closed when the orchestrator re-drove the check directly in the Phase-3 re-run. The fallback is *sufficient* only when the surface under test is pure frontend state.

**The rule:** when a phase's Observable Outcomes need the live Tauri app, **drive the bridge from the orchestrator** rather than delegating to `feature-verify-self-runner`. Delegating costs a verification gap, not just a slower path. (This compounds the existing caveat (a) — the runner also assumes Playwright-MCP tool names, not `mcp__tauri__*`.)

**Two associated details, same session:**
- **`mcp__tauri__ipc_emit_event`'s parameter is `eventName`, NOT `event`.** A wrong name returns a zod `invalid_type` / "Required" error on `eventName`.
- **A plain-string payload does NOT hit the double-encoding problem** documented for `ipc_emit_event` in [[mcp-bridge-seed-held-workspace-status-via-fiber]] (where an object payload arrived double-encoded as a JSON string and the handler no-op'd). `{eventName: "menu", payload: "app.settings"}` was received correctly by `App.tsx`'s `menu` listener and opened the panel. So the hazard is object payloads specifically — a bare string is safe.

**Also re-confirmed and slightly extended (caveat (d)):** any `webview_execute_js` that *references* `__TAURI_INTERNALS__.invoke` times out the bridge's eval — **not only when awaited, but even when fired unawaited or deferred via `setTimeout`**. Use `ipc_emit_event` for events; use the fire-then-poll pattern only when you genuinely need an `invoke`'s return value.

**One more, cheap to forget:** a **same-frame DOM read after dispatching a React-driven event reports the PRE-render state**. Asserting `⌘,` toggled a panel closed in the *same* `webview_execute_js` call as the dispatch returned the stale value; a follow-up call showed it correct. Read state in a **separate bridge call** from the event that changes it, or a live check produces a false FAIL and sends a healthy phase into a back-loop.

Next entry in the root `CLAUDE.md` bridge-verify-self caveat chain (a)–(e) at the "NEW (2026-06-26) — the agent CAN now drive live verify-self via the `tauri` MCP bridge" bullet. Siblings: [[mcp-bridge-manage-window-reads-native-geometry]] (native window geometry — the other "caveat (f)"-shaped finding) and [[mcp-bridge-seed-held-workspace-status-via-fiber]] (fiber-dispatch status seeding + the object-payload double-encoding hazard). Teardown discipline is unchanged and still mandatory: `driver_session{stop}` → `TaskStop` the `tauri:dev` task → **PID-scoped** `lsof -ti tcp:1420 tcp:9223 | xargs -r kill -9`, never a blanket `pkill` (see [[verify-self-dev-vs-prod-process-name-collision]]).
