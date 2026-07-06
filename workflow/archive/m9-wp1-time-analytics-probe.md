# Feature: M9 WP1 — Time-analytics probe (contract-freeze + dark-dashboard feasibility)

**Workflow:** feature
**State:** build complete (all 3 phases + verify tiers passed, operator-approved) → ready for ship/finalize
**Created:** 2026-07-06
**Type:** probe (knowledge output, not shippable software)
**Drive mode:** autopilot
**WBS ref:** `docs/product/wbs.md` → M9 WP1

## Problem Statement

Before any of M9's three ports commit to a shape (WP3 reclassifier, WP4 segment-model query layer, WP6 dashboard tab), two unknowns must be resolved cheaply and up front: **(1)** the exact **segment-model JSON contract** the dashboard consumes — the boundary between the Rust query layer (WP4, producer) and the TSX dashboard (WP6, consumer) — and **(2)** whether the **4065-line `dashboard.jsx`** actually ports to a **dark-theme React-19 TSX right-panel tab** without an external chart library, and roughly how large that port is (single WP vs. phased sub-views). This is the internal equivalent of the "probe the 3rd-party API shape before the dependent build WP" rule (WBS §4), with the Python `viz_data.py`/`dashboard.jsx` pair as the external contract. The output is a written probe outcome doc + a go/split verdict for WP6 — no product code ships from this WP. Source survey already done at WBS time: no chart lib (hand-rolled SVG), light-theme `CT_TOKENS` block (~L12), `window.CT_DATA` entry contract with `day_payloads_by_iso`/`metrics`/`comparison`; current Claudesk hook wire carries 4 events + `prompt`/`message`/`notification_type` only.

## Work Tree

- [x] Phase 1: Freeze the segment-model contract + hook/event-field delta  <!-- status: COMPLETE — auto+self PASS; human folded into Phase 3 operator gate (approved) -->>
  **Observable outcomes:**
  - CLI: `test -f docs/product/wp1-time-analytics-probe-outcome.md` exits 0 AND the doc's "Segment-model schema" section names every key of the day payload (`label`, `iso`, `projects[]`, `hour_range`) and the nested `project`/`session`/`seg` shapes with types, the `kind` enum (`active`/`reading`/`thinking`/`away`/`subagent`), and the minutes-of-day unit convention — grep finds all five `kind` values + the `window.CT_DATA` top-level keys (`day_payloads_by_iso`, `metrics`, `comparison`) documented.
  - CLI: the doc's "Hook delta" section enumerates the exact event set to register (current `CLAUDESK_EVENTS` 4 → the reclassifier's full set) and the exact extra wire fields (`prompt_length_chars`, `tool_use_id`, `agent_type`, `source`) over the current 3-field payload — cross-checked against `_ref/.../hook.pl` + `src-tauri/src/hook_install/mod.rs::CLAUDESK_EVENTS` (grep confirms both the added events and the retained ones are listed).
  - CLI: schema is captured *from `test_viz_data.py` fixtures as the oracle* — the doc cites at least one fixture assertion it was derived from (traceable, not invented).
  - [x] P1.1 Extract the segment-model schema from `viz_data.py` (`build_day_data` / `_build_viz_sessions` return shapes) + `test_viz_data.py` fixtures; write it as a typed schema block in the outcome doc (the WP4↔WP6 contract).  <!-- status: complete; doc §(a) DayPayload/Project/Session/Segment tables + oracle citation -->
  - [x] P1.2 Document the `window.CT_DATA` top-level entry contract the dashboard reads (`day_payloads_by_iso`, `metrics`, `comparison`) — the surface WP4's query command must ultimately feed.  <!-- status: complete; doc §(a) top-level entry-contract block -->
  - [x] P1.3 Enumerate the hook event-set + wire-field delta vs. the current 4-event / 3-field wire, cross-checked against `hook.pl` + `CLAUDESK_EVENTS`; note the privacy invariant (length-only) carries.  <!-- status: complete; doc §(d) delta + privacy invariant -->
  - [x] P1.4 Add the CONTRACT-MAY-SHIFT caveat: this freezes claude-time's *current* shape as a baseline; WP3's metric-definitions redesign supersedes it where the definitions change (per `SURFACE-2026-07-06-M9-RECLASSIFIER-IS-REDESIGN-NOT-PORT`).  <!-- status: complete; doc top-of-file ⚠️ caveat block -->
  - [x] verify-auto  <!-- status: PASS — 10/10 grep checks (doc exists, 5 kind values, 3 CT_DATA keys, 4 DayPayload keys, 5 added events, 4 wire fields, CLAUDESK_EVENTS+4 retained, oracle cite, minutes unit, SURFACE caveat) -->
  - [x] verify-self  <!-- status: PASS — facts traced to source: CLAUDESK_EVENTS=4 exact (hook_install/mod.rs:61); oracle fixture matches test_single_burst_shape verbatim; hook.pl logs 10 events (doc said 11→corrected); PostToolUseFailure confirmed distinct+paired (reclassify.py L164-219); PreToolUse/tool_use_id + Subagent/agent_type pairing confirmed. 2 doc precision fixes applied. -->
  - [x] verify-human  <!-- status: BUNDLED — doc-only phase, no live/visual surface; operator review carried to Phase 3 gate w/ dark-render screenshot + verdict (per posture note) -->
  - [x] verify-codify  <!-- status: N/A — probe, no product code shipped; oracle already codified in claude-time's test_viz_data.py (the doc cites it) -->

- [x] Phase 2: Dark-theme render feasibility spike (throwaway Vite entry)  <!-- status: COMPLETE — auto+self PASS; human folded into Phase 3 operator gate (approved, darker-fill palette chosen) -->
  **Observable outcomes:**
  - Browser: a throwaway Vite entry renders `dashboard.jsx`'s **day view** as a React-19 TSX component against a static fixture (adapted from `viz/data.js`'s `window.CT_DATA`), in **dark theme** (the `CT_TOKENS` block swapped to Claudesk dark tokens), with **no external chart lib** and no unpkg/Babel CDN — a screenshot is saved and referenced in the outcome doc.
  - Console: the spike render produces no uncaught JS/React errors in the browser console (clean mount).
  - CLI: the spike builds — `pnpm vite build` (or the throwaway entry's build) exits 0, proving the JSX→TSX conversion type-checks/bundles under the real toolchain (catches hidden `window.React`-isms).
  - CLI: the outcome doc's "Dark render" section embeds/links the screenshot path and states the light→dark token swap was mechanical (or lists the non-mechanical exceptions found).
  - [x] P2.1 Stand up a throwaway Vite entry (dev-only, NOT wired into the app) that imports a minimal TSX port of the dashboard day-view + a static fixture payload.  <!-- status: complete; tmp/dark-render-spike/ (index.html+main.tsx+vite.config.ts+dashboard.spike.tsx verbatim port+data.js fixture) -->
  - [x] P2.2 Swap `CT_TOKENS` light values → Claudesk dark tokens (per the dark-only rule — no `prefers-color-scheme`); record any token that isn't a straight swap.  <!-- status: complete; OKLCH L-invert ramp + L-boost semantics; 2 non-mechanical exceptions recorded (grid→white-alpha, away→darker) -->
  - [x] P2.3 Render + screenshot the day view; drive via the MCP bridge or a plain Vite browser (this spike is pure frontend — no Tauri backend needed, so a bare Vite browser is sufficient and appropriate here).  <!-- status: complete; Playwright @ :5199, screenshots/dayview.png + weekview.png, 0 JS/React errors (only favicon 404) -->
  - [x] P2.4 Capture the port-size signal: which of the dashboard's surfaces (day view / week-rollup / selected-bar side panel / metrics panels / comparison view) rendered cleanly vs. needed work — feeds Phase 3's split verdict.  <!-- status: complete; doc §(b) per-surface table + 28-component inventory -->
  - [x] verify-auto  <!-- status: PASS — spike `vite build` exit 0, ✓30 modules, 246.86kB bundle -->
  - [x] verify-self  <!-- status: PASS — render driven live via Playwright; day+week views both clean dark; console has 0 JS/React errors (favicon 404 only); token swap mechanical w/ 2 documented exceptions -->
  - [x] verify-human  <!-- status: BUNDLED — dark-render screenshots are the operator's real judgment gate; carried to Phase 3 (day+week PNGs ready in tmp/dark-render-spike/screenshots/) -->
  - [x] verify-codify  <!-- status: N/A — throwaway spike, removed at WP1 close; nothing to codify -->

- [x] Phase 3: Port-size estimate + WP6 go/split verdict (synthesis)  <!-- status: COMPLETE — all verify tiers passed, operator approved at verify-human -->
  **Observable outcomes:**
  - CLI: the outcome doc's "WP6 verdict" section states an explicit **GO / GO-WITH-SPLIT / NO-GO** verdict for the dashboard port, with a port-size estimate and — if split — the named sub-phases (e.g. day view → week-rollup → selected-bar side panel → metrics/comparison) in execution order.
  - CLI: the doc confirms all four WP1 success criteria from the WBS are answered — grep finds sections (a) frozen schema, (b) dark render + screenshot, (c) port-size + go/split verdict, (d) hook event/field delta.
  - CLI: the doc records the throwaway-spike teardown note (the Phase-2 Vite entry is scratch — to be removed, not merged; WP6 builds the real tab fresh).
  - [x] P3.1 Write the port-size estimate + GO/SPLIT verdict for WP6, informed by Phase 2's per-surface signal + the 4065-line size.  <!-- status: complete; doc §(c) GO-WITH-SPLIT + 6a/6b/6c sub-phases + size breakdown -->
  - [x] P3.2 Cross-check the doc answers all four WBS success criteria (a–d); add a one-line "probe complete" summary + the scratch-entry teardown note.  <!-- status: complete; doc §(c) cross-check table + teardown note + PROBE COMPLETE line + status footer -->
  - [x] P3.3 Log any discoveries (contract surprises, non-mechanical token swaps, unexpected deps) to `## Discoveries` + `workflow/backlog.md`.  <!-- status: complete; 3 discoveries in WIP §Discoveries + WP1-outcome note under SURFACE-2026-06-26-ABSORB in backlog.md -->
  - [x] verify-auto  <!-- status: PASS — doc §(c) grep finds GO-WITH-SPLIT verdict + all 4 (a-d) criteria answered + teardown note -->
  - [x] verify-self  <!-- status: PASS — verdict grounded in Phase 2 render evidence + 28-component inventory; cross-check table confirms a/b/c/d all present -->
  - [x] verify-human  <!-- status: PASS — operator approved all items 2026-07-06 -->
    - [x] Dark day-view render looks right (colors legible, layout intact) — `dayview.png`  <!-- status: approved -->
    - [x] Dark week-view render looks right — `weekview.png`  <!-- status: approved -->
    - [x] Pill/segment text contrast — flagged white-on-bright; fixed via luminance `textOn()` + operator chose DARKER FILL over bright (deep-fill + light ink); see `dayview-darker-fill.png`. WP6 starting palette locked in outcome doc §(b).  <!-- status: approved (darker-fill) -->
    - [x] Color-family intent (AI vs human, +reasoning/doing) captured as WP3 input — `SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`  <!-- status: captured -->
    - [x] GO-WITH-SPLIT verdict + WP6 6a/6b/6c sub-phase split is sensible  <!-- status: approved -->
    - [x] Hook delta (4→10 events, +4 fields) + contract-freeze look correct for WP2 planning  <!-- status: approved -->
  - [x] verify-codify  <!-- status: N/A — probe, no product code to codify (spike is throwaway); oracle already codified in claude-time's test_viz_data.py -->>

## Current Node
- **Path:** Feature > (all phases complete) > ready for ship/finalize
- **Active scope:** WP1 probe COMPLETE + operator-approved. All 3 phases `[x]`; all 4 WBS criteria answered (a schema / b dark render + darker-fill palette / c GO-WITH-SPLIT / d hook delta 4→10). Contrast fix (`textOn` + darker fill) applied to spike + palette locked in outcome doc. Next: `/feature-ship` → `/feature-finalize` (probe = knowledge artifact; ship = commit the outcome doc + WIP, delete throwaway spike).
- **Blocked:** none.
- **Unvisited:** feature-ship → feature-finalize.
- **Open discoveries:** 5 logged (WP6 GO-WITH-SPLIT recipe; WP6c↔WP3 def dependency; PostToolUseFailure→4→10 events; textOn contrast fix; AI-vs-human color families) — all in §Discoveries + backlog SURFACEs.

## Notes on probe posture (verify tiers)
- This is a **probe** — success = a correct, complete knowledge artifact (`docs/product/wp1-time-analytics-probe-outcome.md`), not shipped behavior. `verify-auto` is thin (doc existence + `pnpm vite build` for the Phase-2 spike). `verify-self` = the agent confirms each documented fact against the source (schema traces to a `test_viz_data.py` fixture; hook delta traces to `hook.pl` + `CLAUDESK_EVENTS`; the dark render is a real screenshot). `verify-human` = operator eyeballs the dark-render screenshot + the go/split verdict (a genuine judgment point — the operator's read of "does this dashboard look right dark, and is the split sensible" is the real gate).
- **Scratch discipline:** the Phase-2 Vite entry + TSX port are THROWAWAY (dev-only, removed at WP1 close). WP6 builds the real tab from scratch against the frozen contract. Do NOT merge the spike into the app.
- **verify-self can be agent-driven here:** Phase 2 is pure frontend (no Tauri backend), so a bare Vite browser / Playwright is the correct surface — the "bare-Vite dead end" caveat (which is about backend-process outcomes) does NOT apply to a frontend render spike.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>; also logged to workflow/backlog.md -->
- [SURFACED-2026-07-06] WP6 (dashboard tab) — **GO-WITH-SPLIT**: `dashboard.jsx` (4065 lines / 28 components) ports mechanically (namespace-form hooks → single `import React`; self-contained, reads only `window.CT_DATA`; hand-rolled SVG = no chart dep; dark token swap mechanical w/ 2 exceptions). Split WP6 into 6a (day view MVP + lazy-load, folds SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD) / 6b (week/month/side-panel) / 6c (metrics/compare). Recipe + dark CT_TOKENS in `docs/product/wp1-time-analytics-probe-outcome.md` §(b)+(c).
- [SURFACED-2026-07-06] WP6c ↔ WP3 dependency — the metrics/headline/compare surfaces (`MetricsPanel`/`HeadlineCard`/`CompareView`/`EffectivenessRow`) consume `window.CT_DATA.metrics`/`.comparison`, whose *definitions* WP3 is REDESIGNING. Their pixels port mechanically but their inputs aren't frozen until WP3 locks definitions → WP6c must sequence AFTER WP3.
- [SURFACED-2026-07-06] WP2 (hook delta) — `PostToolUseFailure` confirmed a distinct CC-emitted event (in claude-time hook.pl registered set; reclassify.py pairs it with PreToolUse by tool_use_id identically to PostToolUse). Net delta is 4→**10** events, not "9 or 10". `prompt_length_chars` (length-only, privacy invariant) + `tool_use_id` + `agent_type` + `source` are the +4 wire fields.
- [SURFACED-2026-07-06] WP6 (dashboard) — contrast fix from verify-human: text-on-pill must use luminance-based `textOn(bg)` (OKLCH-L auto-pick, ~8 lines), NOT hardcoded `#fff` — the dark swap boosts semantic-color lightness so white ink on bright pills fails contrast. Applied to the spike (3 active-pills + subagent label); WP6 lifts verbatim. Survives WP3 recolor.
- [SURFACED-2026-07-06] WP3+WP6 — operator wants AI-activity vs human-activity as distinct color families, with AI possibly split "reasoning" vs "doing" (tool calls). Logged as `SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`; palette locks at WP3 (which defines the AI-vs-human kind split), not WP1. Tool-time is hook-observable; pure reasoning stays inference-based.
