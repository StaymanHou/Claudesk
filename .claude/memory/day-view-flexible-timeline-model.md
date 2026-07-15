---
name: day-view-flexible-timeline-model
description: "M9 time-analytics Day view = a continuous video-editor flexible timeline (SHIPPED 2026-07-15, fixed-origin model); its coordinate frame has ONE source of truth — every consumer reads it, never recomputes."
metadata:
  node_type: memory
  type: project
  originSessionId: 9e7b7756-7b6a-4e2e-a140-8606906ca08a
---

The time-analytics **Day view is THE primary analytics UI** — a **continuous, video-editor-grade flexible timeline** (fluidly zoom/pan any granularity hour→day→week→multi-day; **no mode, no picker-gate**; the visible range is emergent from zoom+scroll, not a selection you commit). **SHIPPED 2026-07-15** (WP6b-4 re-spec) via a **fixed-origin coordinate model**: a fixed 30-day space anchored at `originIso = today-29d` that never moves, 14-day pre-load + auto-extend ±7d on reaching an edge, RangePicker demoted to a reactive readout + jump-to (not a gate), 30-day zoom-out cap, single-open project accordion, seed-on-today. Superseded the original D1 "range-mode" design (rejected by the operator on the real trackpad).

**COORDINATE-FRAME CONTRACT (the standing rule — a P2.7 regression made it load-bearing):** the multi-day coordinate frame has **ONE source of truth** — the `ViewportContext` `dataWindow` (origin-relative coord minutes = the loaded pan bound) + the `DayWindowContext` `windowStartIso` (the fixed origin). **EVERY consumer — `DayTimeline`, `Minimap`, gestures — must READ that shared frame, never recompute its own.** The P2.7 Minimap bug was exactly this violation: it flattened density by raw minute-of-day (no dayOffset shift) AND recomputed a `[0, day_count*1440]` window that didn't share the fixed origin → density collapsed onto lane 0 + overflowed past 100%. Fix: read `windowStartIso` from `useDayWindow()` + shift each seg by `dayOffsetMin(s.day_iso, windowStartIso)`; read `dataWindow` from `useViewportSetter()` (the resolved shared window), NOT a per-consumer `deriveDataWindow(data)`. This drifts as **silent VISUAL misalignment, not a test failure** — so any future edit that adds/touches a timeline consumer must honor it.

**Why (design):** operator direction at WP6b-4 verify-human (2026-07-15, real trackpad) — a mode/gate on the primary retrospective surface is a defect (attention is the scarce resource; the view must be effortless to navigate). See design-prior `[[primary-surface-is-zero-ceremony-not-a-mode]]` (docs/product/design-priors.md) + `SURFACE-2026-07-15-M9-DAY-VIEW-AS-PRIMARY-FLEXIBLE-TIMELINE` (resolved). Related: [[claudesk-philosophy]].

**Known follow-ups (backlogged, standing refactor batch):** `framedRange`↔picker 30-lane-vs-30-inclusive-day off-by-one; `AutoExtendWatcher` firingRef latch; dead `viewportFromRange`; stale RangePicker header. (`backlog-quality-findings.md` → `# m9-wp6b-4-multiday-timeline`.)
