---
name: workspace-status-map-collapses-consecutive-events
description: The workspace-status MAP overwrites per workspace, so two consecutive Stops are indistinguishable; per-event consumers must subscribe to the RAW event stream, or the feature silently never fires.
metadata:
  type: reference
---

The `workspace-status` **event stream** and the `workspace-status` **map** carry different
information, and the difference is invisible until a feature depends on it.

The backend emits **one event per mapped hook event with no dedupe** (`status_broadcaster/commands.rs`
— every `to_update` `Some` emits). But the frontend reducer `applyStatusUpdate`
(`state/workspaceStatus.ts`) **overwrites** a per-workspace map entry. So two consecutive `Stop`s
both land as `state:"idle"`, and a `useEffect` on `stateFor(map, id)` sees **no change** — the
second event is real on the wire and gone from the map.

**Any feature needing PER-EVENT status** — counting turns, "the next `Stop` after X", ordering two
signals against each other — must `listen(WORKSPACE_STATUS_EVENT)` directly rather than reading the
map. `useTauriListen` is already multi-subscriber (PiP and the main webview each subscribe
independently), so adding one more subscription costs nothing and touches no existing consumer.

⚠️ **The failure mode is silence, not an error.** Found at M13 WP3, where Recycle's completion
marker depends on observing *the next* `Stop` after a fresh `.session.md` write. Building it on the
map would have produced a feature that **never completes**: no exception, no failing test, just a
promise that never resolves. Nothing would have pointed at the reducer.

Today this is recorded at exactly one code site — `components/workspace/recycleSession.ts:194`, in
`awaitCompletion`'s doc comment — which helps only someone already reading that file. The next
consumer (M15's workflow supervisor is the obvious candidate, since it watches turn boundaries)
would start from `useWorkspaceStatus` and hit the same wall.

Related: [[cc-hook-event-facts]] (what the hook channel actually emits),
[[mcp-bridge-seed-held-workspace-status-via-fiber]] (holding a status value for a test).
