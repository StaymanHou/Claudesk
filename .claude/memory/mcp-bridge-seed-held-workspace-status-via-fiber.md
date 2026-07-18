---
name: mcp-bridge-seed-held-workspace-status-via-fiber
description: To hold a live workspace CC status (running/awaiting_input) for a status-dependent MCP-bridge verify-self check, dispatch useWorkspaceStatus's setStatusMap updater via the React fiber — NOT ipc_emit_event (double-encodes the payload to a JSON string → applyStatusUpdate no-ops), and not a real CC turn (transitions faster than inter-tool latency).
metadata:
  type: reference
---

To drive a **status-dependent** verify-self check via the MCP bridge (e.g. the M10.5-WP2
active-close / active-quit gate: `requestClose`/`quit-requested` → `stateFor` →
`isActiveState` → dialog), you need a workspace **held** in a specific state
(`running`/`awaiting_input`) long enough to act. Two obvious approaches FAIL:

1. **`mcp__tauri__ipc_emit_event('workspace-status', {workspace_id, state})` does NOT work.**
   The bridge **double-encodes** the payload — the frontend `listen` callback receives
   `event.payload` as a JSON *string* (`"{\"workspace_id\":...}"`), not an object, so
   `applyStatusUpdate` reads `update.state`/`update.workspace_id` as `undefined`, the fold
   no-ops, and it even creates an `"undefined"` map key. (Confirmed by attaching a raw
   `plugin:event|listen` capture: the delivered `payload` is a string.)
2. **A real CC turn (via `cc_input`) transitions `running → idle` faster than the
   inter-tool-call latency**, so you can't catch/hold `running` between two bridge calls.

**THE RELIABLE METHOD — dispatch `setStatusMap` directly via the fiber:**
Walk the React fiber from a mounted element (`.app-shell`) up through `.return`; scan each
fiber's `memoizedState` hook chain for a state object whose values all have a `.state`
field (that's `useWorkspaceStatus`'s `statusMap`); grab `hook.queue.dispatch`; call
`dispatch(map => ({ ...map, 'ws-1': { ...map['ws-1'], state: 'running' } }))`. This is
exactly what the real `workspace-status` listener calls (`setStatusMap(map => applyStatusUpdate(map, payload))`),
so it drives the **real** `stateFor`/`isActiveState`/dialog path deterministically — and
the state HOLDS (no CC race). Then click via the real fiber `onClick` (synthetic DOM events
may not reach React) and read the dialog.

**Gotcha:** the `statusMap` only has a workspace's key *after* at least one real status
event. So drive one quick real CC turn first (`cc_input` "say hi" via
`__TAURI_INTERNALS__.invoke`, per caveat (e)) to populate the key, THEN seed the held state.

Extends the root `CLAUDE.md` MCP-bridge caveats (a)–(e) + [[mcp-bridge-manage-window-reads-native-geometry]]
(caveat (f)) — this is the next in that chain (seeding-held-status). Pairs with
[[verify-native-pty-via-ps-screencapture-stderr]]. Discovered M10.5 WP2, 2026-07-18.
