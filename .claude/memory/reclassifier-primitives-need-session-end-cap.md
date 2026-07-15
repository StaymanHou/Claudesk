---
name: reclassifier-primitives-need-session-end-cap
description: Aggregate-duration consumers of the reclassify primitives must clip events at resolve_session_end FIRST — the WP6.5 cap lives in the caller, not the primitives (which return RAW bursts); skipping it inflates durations.
metadata:
  type: project
---

Any code summing durations from the reclassifier primitives — `active_bursts` / `session_active_ms` / `tool_intervals` / `subagent_intervals` (`src-tauri/src/reclassify/mod.rs`) — MUST first clip each session's events at `resolve_session_end(sid_events, authoritative_end(sid_events))`. These primitives return **RAW, un-capped** bursts/intervals; the WP6.5 session-end capping (explicit WorkspaceClose / CC SessionEnd / max-idle cap) lives in the **caller** — `build_viz_session` (query.rs) does the clip, and `build_metrics::capped_events` replicates it. The primitives' own docs give NO warning.

**The trap:** a dangling/dead session (never cleanly Stopped) has a burst that runs to the last stray event. Summing it raw inflates every duration — WP6c-1 research found an 885-min single "engaged" burst on the real dev DB this way. `session_active_ms` looks like the obvious engaged-time source but is wrong un-capped.

**The rule:** cap events per-session (`events.filter(|e| e.ts <= resolve_session_end(...))`) BEFORE running any primitive, so aggregate metrics agree with the timeline surfaces (which already cap) by construction. Recurs for every future analytics consumer — WP6c-2 (Compare, reuses build_metrics per side), WP7. Related: [[cc-hook-event-facts]], and the ms-precision sum-then-quantize contract (dur_ms; SURFACE-2026-07-13 minute-quantization).
