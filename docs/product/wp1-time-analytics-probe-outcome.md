---
stage: probe-outcome
feature: m9-wp1-time-analytics-probe
state: in-progress
updated: 2026-07-06
---

# M9 WP1 — Time-analytics probe outcome

**Probe goal:** de-risk M9's three ports (WP3 reclassifier, WP4 segment-model query layer, WP6 dashboard tab) by freezing, up front, (a) the segment-model JSON contract that is the WP4↔WP6 boundary, and (b) whether `dashboard.jsx` (4065 lines) ports to a dark-theme React-19 TSX right-panel tab — with a port-size + go/split verdict for WP6. Also (d) confirm the exact hook event/field delta over Claudesk's current 4-event wire.

**Sources surveyed:** `_ref/claude-customization/tools/claude-time/{viz_data.py, reclassify.py, hook.pl, viz/data.js, viz/dashboard.jsx, test/test_viz_data.py, test/test_reclassify.py}` + Claudesk `src-tauri/src/hook_install/mod.rs`, `src-tauri/src/hook_socket/mod.rs`, `src-tauri/resources/claudesk-hook.pl`.

> **⚠️ CONTRACT-MAY-SHIFT caveat (read before relying on the schema below).** The segment-model schema here is claude-time's **current** shape, captured as a **baseline**. **M9 WP3 is a metric-definitions REDESIGN, not a port** (operator flag 2026-07-06 — the current classifier isn't what he wants; see `SURFACE-2026-07-06-M9-RECLASSIFIER-IS-REDESIGN-NOT-PORT`). WP3's `/feature-spec` will lock the real definitions of active / reading / thinking / away / tool-time / subagent-time / per-project attribution, and **those definitions supersede this schema wherever they differ** — the `kind` enum, the segment tiling, and the per-session `tools`/`prompts` rollups may all change. Treat this doc as "here is the shape WP4/WP6 start from," not "here is the shape WP4/WP6 must emit."

---

## (a) Segment-model JSON contract (the WP4 → WP6 boundary)

**Authoritative source:** `viz_data.py` module docstring (L1–56) — the contract is *defined* there against `viz/data.js`. **Derivation oracle:** `test/test_viz_data.py::…test_single_burst` (fixture L64–94) and `test_segment_kinds_are_valid` (L96–113) pin the exact event-stream → segment-output mapping and the `kind` enum. The schema below is transcribed from those, not invented.

### Top-level `window.CT_DATA` entry contract (what the dashboard reads — see §b)

```
window.CT_DATA = {
  today:               <DayPayload>,              // single-day view (back-compat shape)
  week:                <WeekPayload>,             // 7-day rollup view
  day_payloads_by_iso: { <iso>: <DayPayload> },   // v3 (WP9): keyed multi-day store the day view reads
  metrics:             <MetricsPayload>,          // WP10 MetricsPanel aggregate (headline tiles)
  comparison:          { a: {metrics}, b: {metrics} },  // A/B compare view (WP-later)
  meta:                { snapshot, snapshot_iso }, // CLI-injected snapshot stamp
}
```

Not every top-level key is needed for the *first* dashboard surface (day view reads `today` / `day_payloads_by_iso[<iso>]`). `metrics` + `comparison` back the headline-tile + A/B-compare surfaces — relevant to the WP6 split verdict (§c), not to the minimal day-view render.

### `DayPayload`

| key | type | notes |
|-----|------|-------|
| `label` | string | e.g. `"WED · MAY 13"` (upper-cased `%a · %b %d`) |
| `iso` | string | `"YYYY-MM-DD"` (oracle L61/78) |
| `projects` | `Project[]` | `[]` on an empty day (oracle L62) |
| `hour_range` | `[int, int]` | `[start_hour, end_hour_exclusive]`, data-adapted + 1h pad, clamped `[0,24]`, fallback `[6,23]` (oracle L64, L228–229) |
| `empty?` | bool | optional; absent/false on a non-empty day (oracle L79) |

### `Project`

| key | type | notes |
|-----|------|-------|
| `id` | string | == `alias` (viz_data L87–88) |
| `alias` | string | project display name (git-root + `project_names`-style aliasing) — oracle L82 `"proj-a"` |
| `path` | string | primary repo path — oracle L83 `"/repo/proj-a"` |
| `sessions` | `Session[]` | sorted by `start` (viz_data L82) |

### `Session`

| key | type | notes |
|-----|------|-------|
| `id` | string | viz-session id (a `session_id` splits into multiple viz-sessions across `away` gaps) |
| `start` | int | minutes-from-local-midnight — oracle L87 (`9*60`) |
| `end` | int | minutes-from-local-midnight — oracle L88 (`9*60+30`) |
| `prompts` | int | count of prompts in the session — oracle L89 (`1`) |
| `tools` | `{ [toolName]: int }` | **tool→count map**, NOT a list — oracle L90 (`{"Edit": 1}`) |
| `segs` | `Segment[]` | non-overlapping, sorted by `start`, tile the session window (BurstSegmentationTests L116+) |

### `Segment`

| key | type | notes |
|-----|------|-------|
| `kind` | enum | **one of `"active" | "reading" | "thinking" | "away" | "subagent"`** — oracle L108–109; constants `reclassify`/`viz_data` `KIND_*` |
| `start` | int | minutes-from-midnight, `start <= end` (oracle L111–113) |
| `end` | int | minutes-from-midnight |
| `label?` | string | present on `subagent` segments (the agent_type, e.g. `"Explore"` — oracle L185); absent on others |

**Oracle citation (single-burst, L64–94):** input events `UserPromptSubmit(9:00, len 12) → PreToolUse(9:05, Edit, t1) → PostToolUse(9:06, Edit, t1) → Stop(9:30)` produce exactly:
```json
{ "iso": "2026-05-13",
  "projects": [ { "alias": "proj-a", "path": "/repo/proj-a",
    "sessions": [ { "start": 540, "end": 570, "prompts": 1, "tools": {"Edit": 1},
      "segs": [ {"kind": "active", "start": 540, "end": 570} ] } ] } ] }
```

### `WeekPayload` (rollup view)

```
{ label, days: [ ...7 strings ], projects: [ { id, alias, rollup: [ ...7 day-totals ] } ] }
```
(viz_data docstring L17–22.) The week view is a candidate split-off for WP6 (§c).

---

## (d) Hook event-set + wire-field delta vs. Claudesk's current wire

### Current Claudesk wire (as-built, M3 + QoL-WP2)

- **Events registered** — `src-tauri/src/hook_install/mod.rs::CLAUDESK_EVENTS` = **4**: `["UserPromptSubmit", "Stop", "Notification", "PostToolUse"]`. (`PreToolUse` deliberately NOT registered; doc there explains why for the *status* machine.)
- **Wire fields** — `claudesk-hook.pl` emits `{ hook_event_name, session_id, cwd, timestamp }` always, plus **`prompt`** (UserPromptSubmit only), **`message`** + **`notification_type`** (Notification only). `HookEvent` (`hook_socket/mod.rs`) mirrors these snake_case verbatim.

### What the reclassifier + segment model consume (claude-time `hook.pl` logs 10 event types)

The reclassifier's algorithms need these events (from `reclassify.py`):
- `UserPromptSubmit`, `Stop` — gap buckets (reading/thinking/away) + active bursts *(already registered)*.
- `PreToolUse` + `PostToolUse`/`PostToolUseFailure` — tool durations/intervals, paired by `tool_use_id` *(PostToolUse registered; **PreToolUse + PostToolUseFailure are the gap**)*.
- `SubagentStart` + `SubagentStop` — subagent intervals, paired by `agent_type` FIFO *(**both missing**)*.
- `SessionStart` (+ `source`) / `SessionEnd` — session boundaries / `source` tagging *(**both missing**; SessionEnd currently no-op in claude-time but logged)*.
- `Notification` — logged by claude-time (message truncated 200 chars) but NOT used by the reclassifier's core buckets; Claudesk already registers it for status.

### DELTA WP2 must close

**Events to ADD to `CLAUDESK_EVENTS`** (register additively/idempotently/reversibly, preserving the 4 existing + their status behavior): **`PreToolUse`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PostToolUseFailure`**. **`PostToolUseFailure` is confirmed a distinct CC-emitted event** — it appears in claude-time's `hook.pl` registered set alongside `PostToolUse`, and `reclassify.py` pairs it with `PreToolUse` by `tool_use_id` identically to `PostToolUse` (`reclassify.py` L164–183, L199–219). Net: 4 → **10**.

**Wire fields to ADD** to `claudesk-hook.pl` + `HookEvent` (snake_case, per the IPC-casing convention; add the parallel key-shape test):
- **`prompt_length_chars`** (int) — on UserPromptSubmit. **Privacy invariant: LENGTH ONLY, never the prompt text.** (claude-time computes `length($prompt)`; Claudesk currently forwards the whole `prompt` for status — WP2 should forward the *length* for the time-row and keep `prompt` handling for status unchanged, OR compute length backend-side. Decide at WP2; the privacy assertion test guards it.)
- **`tool_use_id`** (string) — on Pre/PostToolUse (+Failure); the Pre/Post pairing key.
- **`agent_type`** (string) — on SubagentStart/Stop (claude-time reads CC's `subagent_type` field → stores as `agent_type`).
- **`source`** (string) — on SessionStart.

**Note (status path unchanged):** the added events must NOT alter the existing idle/running/awaiting status machine. `status_broadcaster::event_to_state` maps only the 4 current events; the new events are *time-store-only* consumers (WP2 wires `time_store` as a second, gated drain of the same `HookEvent` stream). A `PreToolUse` arriving now must not flip a dot — confirm the broadcaster ignores unmapped events (it already drops unmatched, per the as-built note).

**Schema (SQLite rows):** claude-time's `events(ts, session_id, cwd, event, tool_name, agent_type, meta)` where `meta` is a JSON blob holding `prompt_length_chars` / `tool_use_id` / `source`. WP2 owns the per-identity DB path under `app_data_dir()`.

---

## (b) Dark-theme render feasibility

**Verdict: FEASIBLE — clean, high-fidelity dark render of BOTH the day view and the week view, mechanical token swap, zero JS/React errors, bundles under the real toolchain.**

### Spike method (throwaway — `tmp/dark-render-spike/`, removed at WP1 close)

Rather than hand-port a toy subset, the spike took the **verbatim 4065-line `dashboard.jsx`** and applied only the three **mechanical** transforms a real port needs, then rendered it against the **real `data.js` fixture** under Claudesk's own toolchain (`@vitejs/plugin-react` + esbuild + React 19). This tests the actual porting question, not a strawman.

**The three mechanical transforms (this IS the per-file port recipe for WP6):**
1. **`import React from 'react'`** at the top. The source loaded UMD React via CDN and calls every hook as `React.useState` / `React.useEffect` / `React.useMemo` / `React.useRef` / `React.createContext` / `React.useContext` (namespace form, never destructured) — so a single namespace import fixes all ~15 hook call-sites with zero body edits. *(This was the biggest de-risk: no `const {useState} = React` rewrites needed.)*
2. **Swap `CT_TOKENS`** light → dark (see below).
3. **`export default Dashboard`** replacing the `window.Dashboard = Dashboard` tail. The component reads `window.CT_DATA` for data (WP6 will feed it from the Rust query layer instead of the global, but that's WP6 wiring, not a port blocker).

`dashboard.jsx` is **self-contained** — it references only `window.CT_DATA`; the `DesignCanvas`/`DC*` names in it are comments + the old index.html harness, NOT a runtime dep.

### Build outcome (CLI observable — PASS)

`npx vite build --config tmp/dark-render-spike/vite.config.ts` → **exit 0**, `✓ 30 modules transformed`, bundle **246.86 kB (74.23 kB gzip)**. The JSX→TSX conversion type-checks/bundles under the real toolchain — no hidden `window.React`-isms survived the import swap. *(Spike used `// @ts-nocheck` on the verbatim body — the build criterion is "does it bundle under esbuild+plugin-react", which `.tsx` under the real toolchain proves; adding 4065 lines of type annotations is WP6 polish, not a feasibility question.)*

### Render outcome (Browser/Console observable — PASS)

Rendered on a plain Vite dev server (`:5199`) driven by Playwright (pure frontend, no Tauri backend — the correct surface for a render spike). **Zero uncaught JS/React errors** (the one console 404 is a missing `favicon.ico`, not a mount error). Screenshots saved:
- `tmp/dark-render-spike/screenshots/dayview.png` — **day view**: toolbar (Day/Week/Month/Custom/Compare), summary strip (Active 10h10m / Away / Longest session / Most-used tool), legend, hour ruler 06:00–22:00, project rows (agent-handoff / claude-time / weekend-tinker / om-design), session rows with time labels + active-minute pills, and `SegmentBar`s in the boosted-lightness semantic colors (indigo active, amber thinking, teal subagent "EXPL", lavender reading), overlap markers, collapse/expand chevrons — **all render correctly against `#1e1e1e`.**
- `tmp/dark-render-spike/screenshots/weekview.png` — **week view**: 7-day column grid, per-project rollup rows + week totals, daily active-bars, today-column (WED 13) highlighted, weekend band — **also clean.**

### Contrast fix (WP1 verify-human, 2026-07-06) — text-on-pill legibility

Operator flagged at verify-human: white text on the **active-minute pills** (`2h 37m` badges, `background: CT_TOKENS.active, color: '#fff'`) and the **subagent segment label** ("EXPL", `color: '#fff'` on the teal bar) is too low-contrast — a *direct consequence of the dark swap boosting the semantic-color lightness* (bars pop against `#1e1e1e`, but bright fill + white ink = poor contrast).

**Resolution (two parts): luminance-based ink + darker fills (operator-chosen).**

1. **Ink = luminance auto-pick.** Added a `textOn(bg)` helper that reads the fill's OKLCH L channel and returns near-black (`#111`) for bright fills (L > 0.6) or light (`#f6f6f6`) for dark fills. Replaced all 4 hardcoded `color: '#fff'` on-color usages (3 active-pills + 1 subagent label) with `textOn(CT_TOKENS.active)` / `textOn(CT_TOKENS.subagent)`. Correct for EVERY kind automatically AND survives the WP3 color-family recolor (if WP3 changes a color's lightness, the ink flips with no code change). ~8-line helper; WP6 lifts it verbatim.

2. **Fill = darker/deeper (operator preview + choice, 2026-07-06).** Previewed both directions live in the spike: (a) bright fill + dark ink (`screenshots/dayview-contrast-fix.png`) vs (b) deeper saturated fill + light ink (`screenshots/dayview-darker-fill.png`). **Operator chose (b) — the darker fill reads as "IDE-native / terminal" and recedes into the `#1e1e1e` surface, whereas the bright version competed with the editor/terminal for attention.** Both are legible (that's `textOn`'s job); this is the aesthetic-fit call.

**WP6 STARTING PALETTE (locked at WP1 close — the darker-fill semantic tokens):**
```
active:   oklch(0.50 0.17 268)   // indigo, deep    → textOn = light ink
reading:  oklch(0.55 0.07 268)   // lavender, deep
thinking: oklch(0.58 0.13 75)    // amber, deep
subagent: oklch(0.52 0.12 175)   // teal, deep
// neutrals/surfaces unchanged from the dark-swap block above (bg 0.17, surface 0.21, text 0.96, …)
// away stays the darker-stripe pair (0.22 base / 0.28 stripe); grid stays white-alpha.
```
*(These are a WP6 **starting** palette, not frozen forever — the WP3 color-family redesign — `SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN` — may reassign hues by AI-vs-human family. But the lightness/darker-fill decision + `textOn` ink rule carry through regardless.)*

### Color families: AI-activity vs human-activity (captured for WP3, palette locks there)

Operator design intent (2026-07-06): **all AI-agent activity should read from one color family; all human activity from a different family.** This is NOT locked in WP1 — it is **WP3 metric-redesign input**, because *which `kind`s count as AI-execution vs human* is exactly what WP3 is redefining. WP1 keeps the current hues; WP6 applies the final palette after WP3.

**Operator note carried to WP3:** AI-agent activity likely has at least two sub-modes — **"reasoning"** (the model thinking) and **"doing"** (tool calls) — which may warrant distinct shades *within* the AI family. **Open question for WP3:** can the hook event stream distinguish these? *(Partial answer from §d's event survey: the wire carries `PreToolUse`/`PostToolUse[Failure]` with `tool_name` + `tool_use_id` → **"doing"/tool-execution is directly observable**; `SubagentStart`/`SubagentStop` with `agent_type` → **subagent runs are observable**. But pure model-"reasoning" time is NOT a distinct hook event — it's currently inferred as the gap between a prompt/tool and the next event, i.e. today's `thinking`/`active` buckets. So "reasoning vs doing" is derivable for tool-time but "reasoning" itself stays inference-based — a definitions call for WP3, logged as a `SURFACE`.)* See WBS M9 WP3 + `SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`.

### Token swap: mechanical, with 2 recorded exceptions

The source tokens are **OKLCH (lightness-first)**, so the neutral surface/text ramp inverts by flipping the L channel (`0.97→0.17` bg, `0.22→0.96` textPrimary, etc.) while keeping chroma/hue; the 4 semantic segment colors keep their **hue** but are **lightness-boosted** for contrast against dark. Base surfaces anchored to Claudesk's `#1e1e1e`/`#2a2a2a`. **Per-token mechanical** — no structural rework. **Non-mechanical exceptions (2):**
1. **Grid lines** flipped from black-alpha (`oklch(0 0 0 / …)`) to **white-alpha** (`oklch(1 0 0 / …)`) — a hairline over a light surface must become a hairline over a dark surface.
2. **`awayStripe` / `awayBase`** had to go **darker, not lighter** — away is rendered as subtractive hairline stripes; the naive L-invert made them too bright and they read as content.

The full dark `CT_TOKENS` block is in `tmp/dark-render-spike/dashboard.spike.tsx` (with an inline comment documenting the method) — WP6 lifts it.

### Per-surface port signal (feeds §c)

| Surface | Rendered in spike? | Signal |
|---------|-------------------|--------|
| **Day view** (`DayTimeline` + `SegmentBar`/`SessionRow`/`ProjectHeaderRow`/`HourRuler`/`HourGridBackground`/`OverlapMarkerLayer`) | ✅ clean | the core surface — ports mechanically |
| **Toolbar / SummaryStrip / Legend / ProjectFilterPopover** | ✅ clean | chrome — ports with the day view |
| **Week view** (`WeekTimeline`) | ✅ clean | the 2nd-biggest surface — also mechanical |
| **Month view** (`MonthView` / `MonthNavToast` / `Minimap`) | ⚪ not exercised | present in source (variant not rendered); low risk — same primitives |
| **Selected-bar `SidePanel`** (`variant="detail"`) | ⚪ not exercised | interactive; deferred surface |
| **`CompareView` / `MetricsPanel` / `HeadlineCard` / `EffectivenessRow`** | ⚪ not exercised | read `window.CT_DATA.metrics`/`.comparison` (not in the minimal fixture path); the A/B + headline-tile surfaces — natural split-off |

**28 top-level components total** in `dashboard.jsx` (inventory captured in `## Discoveries`). Day-view chain + chrome ≈ half; the other half is week/month/compare/metrics/sidepanel/minimap — cleanly separable by `variant`.

## (c) Port-size estimate + WP6 GO/SPLIT verdict

### VERDICT: **GO-WITH-SPLIT.** The port is de-risked (mechanical, proven-rendering) but 4065 lines / 28 components is too large for one WP — split WP6 into 3 sub-phases by `variant`.

**Why GO (not NO-GO):** Phase 2 proved the hard part. The component is self-contained (reads only `window.CT_DATA`), the hook usage is namespace-form so a single `import React` fixes it, hand-rolled SVG means **no external chart dependency**, and both the day and week views rendered clean in dark on the first pass with a purely mechanical token swap. The feared risk — "does a 4065-line light-theme CDN-React mockup even survive conversion to a dark React-19 TSX module" — is answered **yes**.

**Why WITH-SPLIT (not plain GO):** 4065 lines across **28 top-level components** is a large single WP, and the surfaces are cleanly separable along the existing `variant` prop + the `window.CT_DATA` key each reads. Shipping the day view first gets the highest-value surface in front of the operator fastest and lets the metric-heavy surfaces (which depend on WP3's *redesigned* definitions — see caveat) land after those definitions lock.

### Port-size estimate

- **Total:** ~4065 lines, 28 components, **~1 mechanical transform recipe** (the 3 steps in §b) applied once to the file + per-surface wiring to the Rust query layer.
- **Mechanical / low-risk (~55%):** the day-view chain + chrome (`DayTimeline`, `SegmentBar`, `SessionRow`, `ProjectHeaderRow`, `HourRuler`, `HourGridBackground`, `OverlapMarkerLayer`, `OverlapOverlayLayer`, `CollapsedTrackRow`, `Toolbar`, `SummaryStrip`, `Legend`, `Icon`, `ProjectFilterPopover`, `Dashboard`) — **proven rendering in the spike.**
- **Medium (~30%):** `WeekTimeline` (proven), `MonthView`/`MonthNavToast`/`Minimap`, `SidePanel` (interactive selection), `RangePicker`.
- **Definition-coupled (~15%):** `MetricsPanel`, `HeadlineCard`, `CompareView`, `EffectivenessRow`, `PresetSelector` — these consume `window.CT_DATA.metrics` / `.comparison`, i.e. **aggregate metrics whose definitions WP3 is redesigning.** Porting their *pixels* is mechanical; their *inputs* aren't frozen until WP3. Do them last.

### Recommended WP6 sub-phases (execution order)

1. **WP6a — Day view + chrome + dark tokens + lazy-load scaffold.** The `DayTimeline` chain + `Toolbar`/`SummaryStrip`/`Legend`, dark `CT_TOKENS` lifted from the spike, wired as a `React.lazy` right-panel tab reading the WP4 query layer for a single day. Folds in `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (the tab is the heavy chunk that justifies lazy-mount; confirm the 500 kB chunk-size warning clears). **This is the MVP tab.**
2. **WP6b — Week + Month + Minimap + SidePanel.** The remaining time-*shape* surfaces (`WeekTimeline` proven in spike; `MonthView`/`Minimap`/`SidePanel` share the same primitives). Adds range navigation.
3. **WP6c — Metrics / Headline / Compare panels.** The aggregate-metric surfaces — **sequenced AFTER WP3's metric definitions lock**, since their inputs (`metrics`/`comparison` shapes) may change under the redesign.

*(If WP6 is kept a single WP instead, it's an L→XL. The split turns one XL into a shippable-MVP-first sequence and cleanly quarantines the WP3-definition dependency into WP6c.)*

### Cross-check: all four WBS success criteria answered

- **(a) frozen schema** — §(a) above (DayPayload/Project/Session/Segment + `window.CT_DATA` entry contract, oracle-cited). ✅
- **(b) dark render + screenshot** — §(b) above (`tmp/dark-render-spike/screenshots/{dayview,weekview}.png`, mechanical swap + 2 exceptions, build exit 0, 0 JS errors). ✅
- **(c) port-size + go/split verdict** — this section (GO-WITH-SPLIT, 3 sub-phases). ✅
- **(d) hook event/field delta** — §(d) above (4→10 events, +4 wire fields, privacy invariant, PostToolUseFailure confirmed). ✅

### Throwaway-spike teardown note

The Phase-2 spike (`tmp/dark-render-spike/` — `index.html`, `main.tsx`, `vite.config.ts`, `dashboard.spike.tsx`, `data.js`, `screenshots/`) is **scratch, under gitignored `tmp/`, and is NOT merged into the app.** WP6 builds the real tab fresh against the frozen contract, lifting only the dark `CT_TOKENS` block + the 3-step transform recipe documented in §(b). The reference screenshots are copied into this doc's narrative; the spike dir itself may be deleted at WP1 close (it rebuilds trivially from `_ref/.../dashboard.jsx` + these notes).

**PROBE COMPLETE** — all four criteria answered; WP2 (hook delta) and WP6 (dashboard port, GO-WITH-SPLIT into 6a/6b/6c) are de-risked and ready to plan.

---

## Probe status — COMPLETE

- [x] (a) Segment-model contract frozen (baseline; WP3-may-shift caveat attached).
- [x] (d) Hook event/field delta enumerated + cross-checked against `hook.pl` + `CLAUDESK_EVENTS` (4→10 events, +4 wire fields; PostToolUseFailure confirmed distinct).
- [x] (b) Dark render + screenshot — day + week views render clean dark, mechanical token swap (2 exceptions), spike build exit 0, 0 JS/React errors.
- [x] (c) Port-size + GO/SPLIT verdict — **GO-WITH-SPLIT**, WP6 → 6a (day view MVP + lazy-load) / 6b (week/month/side-panel) / 6c (metrics/compare, after WP3 defs lock).
