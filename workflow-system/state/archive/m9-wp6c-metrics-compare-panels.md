# Feature: M9 WP6c — Metrics / Headline / Compare panels

**Workflow:** feature
**State:** COMPLETED — finalized 2026-07-15 (WP6c-1; local/uncommitted per commit-only-when-asked, batched with the M9 tree)
**Created:** 2026-07-15
**Completed:** 2026-07-15
**Entry:** spec (complex feature)
**Milestone:** 9 (time-analytics panel — absorb claude-time)
**WBS ref:** WP6c (the last WP6 sub-slice; the aggregate-metric surfaces, sequenced after WP3's metric definitions locked)
**drive_mode:** autopilot

## Problem Statement

The time-analytics dashboard (M9 WP6a/6b) ships the **per-session, time-shaped** surfaces — Day/Week/Month timelines + the SidePanel session inspector. What's missing is the **aggregate, window-level analytics**: the "how much AI-effort did this week actually produce, how parallel was I, how much time did I spend blocking the agent vs. waiting on it" numbers, and the **A/B comparison** that makes those numbers legible ("this week vs. last week"). claude-time computed these via `build_metrics` + `build_comparison_data`; Claudesk's WP4 query layer **explicitly deferred them** (`query.rs:35-36` — "OUT of scope (WP6c): `build_metrics` / `build_comparison_data`").

The catch that makes this a redesign, not a port: claude-time's metrics were defined over its **OLD 5-kind enum** (`active / reading / thinking / away / subagent`). WP3 replaced that with the **6-kind two-tier model** (`ai-doing / subagent / ai-reasoning / typing / reviewing / away`), where AI-family = `{ai-doing, subagent, ai-reasoning}` and human-family = `{typing, reviewing, away}`. That reclassification **breaks several metric semantics** — most sharply, claude-time's `human_blocking_agent_ms = reading_ms + thinking_ms`, but under WP3 `thinking → ai-reasoning` is now **AI work, not human-blocking-agent time**. So the metric definitions must be **re-derived against the 6-kind families**, not copied. That re-derivation is the actual work; the pixels are mechanical.

## User Stories

- As the operator, I want a **Metrics** view showing window-level aggregates (engaged-session time, AI-agent effort + multiplier, tool-call time, human activity, concurrency stratification, blocking split) so that I can see *where the week/day went in aggregate*, not just the per-session timeline.
- As the operator, I want a **headline summary** (a few big tiles: active-session time, human activity, AI effort, away, parallelism) so that I get the one-glance answer without reading the detailed table.
- As the operator, I want a **Compare** view (this week vs. last week, this month vs. last, today vs. trailing-7, or a custom A/B range) so that I can see whether my AI-leverage and parallelism are trending up or down.
- As the operator, I want every metric to be **defined correctly against the 6-kind model** (AI-reasoning counted as AI work, not human-blocking time) so that the numbers reflect the "measure, don't infer" thesis rather than inheriting claude-time's old-enum semantics.

## Acceptance Criteria

- The Rust query layer emits a `metrics` payload (window-level aggregate) and a `comparison` payload (A/B + presets), both re-derived against the 6-kind model, exposed via the existing `time_analytics_query` command surface (new `QueryWindow` kinds or a new command — resolved at plan).
- A **Metrics** view (new tab in the Day·Week·Month bar) renders the HeadlineCard (summary tiles) + MetricsPanel (detailed sections), fed by the `metrics` payload, dark-themed, tracking-gated (reuses the WP6a gate + empty state).
- A **Compare** view (new tab) renders CompareView (A/B window grid + EffectivenessRows) with a PresetSelector (WoW / MoM / today-vs-trailing / custom), fed by the `comparison` payload.
- Every metric that changed semantics under the 6-kind redefinition is **validated against real dev-DB data** (the research spike) and the mapping is documented + oracle-tested.
- The AI-vs-human color families (already built in `kinds.ts`/`tokens.ts`) are applied to the 2 `EffectivenessRow` bar blocks that reference kind colors (blocking-split bar, concurrency-mix bar) — routed through `familyOf`/`colorForKind`, not hardcoded.
- Full suite green (Rust `cargo test` + `clippy --all-targets`; frontend `tsc`/`eslint`/`vitest`); live verify-self via the MCP bridge against the scratch dirs.

## Sub-WP split (operator-authorized 2026-07-15: "all three, break it down if too big")

The full port is ~290 Rust lines + ~855 TSX lines = L→XL. Split into two feature-sized sub-WPs (mirrors the WP6a → WP6b MVP-first pattern), plus a shared research spike:

- **WP6c-research (spike, `/feature-research`):** validate the 6-kind metric re-derivation against real dev-DB data. Produce the old-kind→new-kind metric mapping table + confirm each re-derived metric yields sensible numbers on actual sessions BEFORE locking definitions. Feeds both sub-WPs. **(This is the spec's F3 exit — operator chose spike-first.)**
- **WP6c-1 (MVP): Rust metrics producer + Metrics tab.** `build_metrics` (Rust, re-derived) → `MetricsPayload` DTO → new `time_analytics_query` window kind → HeadlineCard + MetricsPanel + Metrics tab. The highest-value slice: aggregate numbers for the current window. Ships alone.
- **WP6c-2: Compare producer + Compare tab.** `build_comparison_data` + the 3 presets (`compare_week_over_week` / `compare_month_over_month` / `compare_day_vs_trailing_window`) + custom A/B → `ComparisonPayload` DTO → CompareView + EffectivenessRow + PresetSelector + Compare tab. Reuses `build_range` (already in Rust) for a/b sides + `build_metrics` (WP6c-1) per side. Includes the 2-bar-block color-family application. Depends on WP6c-1.

## Contract reference (source map — claude-time, gathered pre-spec)

Source: `_ref/claude-customization/tools/claude-time/viz_data.py` (producer) + `viz/dashboard.jsx` (panels) + `viz_render.py` (mount/preset wiring). The panels-consuming JSX components are the STATIC design-canvas variant's siblings; the live mount is in `viz_render.py`'s `Dashboard()`.

### `build_metrics` output shape (the WP6c-1 producer contract — old-enum; §"Re-derivation" below revises it)

```
metrics = {
  window: { start, end, day_count },
  engaged_session: { wallclock_ms, effort_ms, multiplier, session_count },
  ai_agent: { wallclock_ms, effort_ms, multiplier, subagent: { wallclock_ms, effort_ms, multiplier } },
  tool_call: { wallclock_ms, effort_ms, multiplier, top: [{ name, wallclock_ms, effort_ms, multiplier }] (max 5) },
  human: { wallclock_ms, effort_ms, multiplier(=1.0), typing_ms, reading_ms, thinking_ms },
  concurrency: [ {k:1,wallclock_ms,effort_ms}, {k:2,..,effort×2}, {k:3,..,×3}, {k:4,..,×4,is_plus:true} ],
  blocking: { human_blocking_agent_ms, agent_blocking_human_ms },
}
```
- `wallclock_ms` = merged/union duration (elapsed); `effort_ms` = summed per-session (parallel adds up); `multiplier` = effort/wallclock (parallelism compression), guarded 0.
- `engaged_session` = AI bursts glued across reading/thinking gaps, SPLIT at `away` gaps; `session_count` = sessions with >0 engaged ms.
- `ai_agent.subagent` is a subset of `ai_agent`. `tool_call.top` = top-5 tools by effort.
- `concurrency` = engaged-session concurrency sweep-line; k = simultaneously-engaged sessions; k=4 row aggregates k≥4 (`is_plus`).
- **NO per-project rollup inside `build_metrics`** — it's window-global. (Per-project lives in the `RangePayload.projects` WP4 already emits.)

### `build_comparison_data` + presets (the WP6c-2 producer contract)

```
comparison = {
  a: <RangePayload + metrics:<build_metrics>>,   // window A
  b: <RangePayload + metrics:<build_metrics>>,   // window B
  deltas: { <alias>: { <kind>: { abs_min, rel_pct } } },   // NOT consumed by CompareView — separate contract
  meta: { a_start, a_end, b_start, b_end, a_day_count, b_day_count },
}
compare_payloads_by_preset = { "wow": <cmp>, "today-vs-trailing": <cmp>, "mom": <cmp> }  // custom = runtime-picked, no pre-render
```
- `wow`: A=prior 7d, B=current 7d. `mom`: A=prev calendar month, B=current. `today-vs-trailing`: A=trailing-7 baseline, B=single target day (asymmetric → length-mismatch banner).
- **CompareView reads `a.metrics`/`b.metrics` (each a full metrics tree) + `meta`; it does NOT read `deltas`** — it recomputes deltas frontend-side. So the Rust producer *may* skip `deltas` if CompareView is the only consumer (resolve at WP6c-2 plan).

### Panel components (WP6c-1: HeadlineCard, MetricsPanel; WP6c-2: CompareView, EffectivenessRow, PresetSelector)

- **HeadlineCard** (~130 lines): 5 tiles (Active session · Human activity · AI effort · Away · Parallel) + trailing-window date strip + Details toggle. Reads `engaged_session.wallclock_ms`, `human.wallclock_ms`, `ai_agent.effort_ms`, `window.*`; `awayMs`/`parallelMs` computed frontend-side.
- **MetricsPanel** (~174 lines): 6 bordered sections (Engaged session / AI agent / Tool call / Human active / Concurrency / Blocking), each a `Wall-clock | Effort | ×Mult` table. Reads the whole tree.
- **CompareView** (~144 lines): A/B header + length-mismatch banner + 4-col grid (`Metric | A | B | Δ`) + 8 EffectivenessRows. Reads `a.metrics`/`b.metrics`/`meta`.
- **EffectivenessRow** (~270 lines): 1 generalized row, 8 instances (parallelism-multiplier, ai-effort-per-human-wallclock, blocking-split bar, concurrency-mix bar, ai-agent triplet, tool-call triplet, human, engaged-session). **The 2 color-family sites:** blocking-split bar (`agent→human` = AI color, `human→agent` = neutral→should be human-family) + concurrency-mix bar (k-strata colors).
- **PresetSelector** (~75 lines): segmented control `[WoW, Today-vs-trailing, MoM, Custom]`; Custom shows two RangePickers. Preset value strings match the Python keys exactly.

## Re-derivation: old 5-kind → new 6-kind metric mapping (SPIKE VALIDATES; recommended semantics)

The research spike (`/feature-research`) confirms each of these against real dev-DB numbers before lock. Recommended mapping (my proposal, for the spike to validate/correct):

| Metric | claude-time (5-kind) | WP6c re-derivation (6-kind) | Semantic change |
|---|---|---|---|
| `ai_agent` | `active` bursts | **AI family union** `{ai-doing, subagent, ai-reasoning}` | ai-reasoning now explicitly inside AI (was `thinking`, ambiguous) |
| `tool_call` | tool intervals | `ai-doing` segments (measured Pre→Post) | now precisely the measured tool-execution kind |
| `ai_agent.subagent` | subagent intervals | `subagent` kind | unchanged |
| `ai-reasoning` | (folded into `thinking`) | **FOLDS INTO `ai_agent`** (LOCKED — no separate line) | absorbed into the AI aggregate; not broken out |
| `human` | `typing + reading + thinking` | **`typing + reviewing`** (LOCKED — NOT away; NOT ai-reasoning) | `thinking_ms` REMOVED from human (→ai-reasoning is AI); `reading`→`reviewing` |
| `blocking.human_blocking_agent_ms` | `reading + thinking` | **`reviewing` only** (human reading = agent idle); ai-reasoning is NOT human-blocking | thinking removed — it's AI work, not the human blocking the agent |
| `blocking.agent_blocking_human_ms` | `ai_agent.wallclock` | AI-family wallclock (agent busy = human waiting) | tracks the ai_agent redefinition |
| `engaged_session` | bursts glued by reading/thinking, split by away | AI-busy spans glued across `reviewing`/`ai-reasoning`/`typing`, split at `away` | glue/split set redefined onto 6-kind |
| `concurrency` | engaged-session sweep-line | same algorithm over the redefined engaged intervals | mechanical |

**Re-derivation questions — 2 LOCKED by operator (2026-07-15), 2 remain for the spike:**
1. ✅ **LOCKED — `ai-reasoning` folds into `ai_agent`** (no separate metrics line). Operator's call; consistent with the family model (ai-reasoning is AI-family). `ai_agent` = union of all three AI kinds `{ai-doing, subagent, ai-reasoning}`; `subagent` stays broken out as a sub-line, `tool_call` (= `ai-doing`) stays its own section, but `ai-reasoning` gets NO dedicated line — it's absorbed into the `ai_agent` aggregate.
2. ✅ **LOCKED — `human` = `typing + reviewing`** (exclude `away`, exclude `ai-reasoning`). `away` is reported separately (HeadlineCard's Away tile reads it independently).
3. ⏳ **SPIKE** — Does the "engaged session glue" include `typing` gaps (human typing keeps you engaged) as well as `reviewing`/`ai-reasoning`? Validate against real sessions.
4. ⏳ **SPIKE** — Confirm `build_metrics` sums at ms precision (like `dur_ms`) and quantizes once, not per-segment (the minute-quantization anti-pattern class — just killed its 3rd copy this session). Validate no sub-minute AI work vanishes.

## Out of Scope

- Any change to the per-session timelines (Day/Week/Month/SidePanel) — WP6c is aggregate-only; it reads what the reclassifier + WP4 already produce.
- Per-project rollup *inside* `build_metrics` (claude-time doesn't do it either; per-project data is in `RangePayload.projects`).
- The `deltas` map in the comparison payload IF CompareView is the only consumer (it recomputes deltas frontend-side) — decide at WP6c-2 plan; don't build an unconsumed contract.
- Reclassifier/session-end changes — WP6.5 already shipped that; WP6c only renders.
- New color palette — the AI/human families are locked (`tokens.ts`); WP6c only routes the 2 EffectivenessRow bar blocks through the existing seam.
- Filter-chip projection (`_computeMetricsView` shrinks metrics per active kind-filter) — port only if the Metrics/Compare tabs expose kind filters; otherwise defer (resolve at plan).

## Technical Constraints

- **Internal porting-oracle (per WBS §"3rd-party" framing):** `viz_data.py`'s `build_metrics`/`build_comparison_data` + `test_viz_data.py` are the behavioral contract, but only the assertions that survive WP3's redefinitions port verbatim — write fresh oracle tests where semantics changed (same discipline as WP4). No external network API; the Python↔Rust contract is the "3rd-party" boundary and the source map above is the completed probe.
- **6-kind model is locked** (`reclassify::Kind::family() -> Family::{Ai,Human}`, commit `ebe9f31`) — the re-derivation maps onto it; it does not change it.
- **Snake_case IPC casing end-to-end** (no `rename_all`) — new DTOs mirror the existing `SegPayload`/`DayPayload` convention; a `dto_serde_shape_is_snake_case`-class test pins them.
- **ms-precision-then-quantize-once** — the minute-quantization anti-pattern (just fixed its 3rd copy this session) MUST NOT recur: `build_metrics` sums durations at ms precision and converts to display units once. Pin it.
- **SQLite feature-local DB** (the WP2 store) is the data source; `build_metrics` reads the same reclassified segments `build_day`/`build_range` consume — reuse the reclassifier output, don't re-walk raw events differently.
- **Placement:** new `DashboardView` values (`"metrics"`, `"compare"`) added to the Day·Week·Month tab bar. Auxiliary/retrospective surface → a tab is consistent with `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` (that prior governs the PRIMARY continuous timeline only; a mode/tab on an auxiliary analysis surface is fine).
- **Verify posture:** agent drives live verify-self via the `tauri` MCP bridge against scratch dirs (tracking ON, ⌘⇧A); PID-scoped teardown only (check 9223 for operator's own dev server FIRST). Dashboard-visual + installed-`.app` checks carry to the release gate per operator standing preference.

## Design-prior consult log

- `[PRIOR: new-surface-must-earn-its-place-against-existing-ones]` — the Metrics/Compare panels ARE a new surface, but deliver genuine non-overlap (window-level aggregates + A/B compare that NO existing surface computes — Day/Week/Month/SidePanel are per-session/per-period timelines). So it earns its place. The prior scopes *how*: don't re-render timelines; be the aggregate lens. **Not a cut.**
- `[PRIOR: primary-surface-is-zero-ceremony-not-a-mode]` — fires only on the PRIMARY surface (the continuous Day timeline). Metrics/Compare are auxiliary; a tab/mode here is fine. **Confirms the new-tab placement.**
- `[PRIOR: explicit-selectable-mode-over-inferred-mode]` — PresetSelector is a directly-selectable segmented control (WoW/MoM/…/Custom), not an inferred mode. Consistent. Custom's A/B RangePickers are the "continuous escape hatch" the prior permits once a real precision need exists (comparing arbitrary windows). **Consistent, no action.**

## Research (spike complete — 2026-07-15)

Validated against the **real dev DB** (`~/Library/Application Support/com.claudesk.app.dev/time-analytics.sqlite`): 5394 events, 74 sessions, all 6-kind-relevant event types present (`UserPromptSubmit`/`Stop` for bursts, `PreToolUse`/`PostToolUse[Failure]` for ai-doing, `KeystrokeActivity` for typing, `SubagentStart`/`Stop`, `WindowFocus`/`Blur` native signals, `SessionEnd`/`WorkspaceClose` from WP6.5). Schema note: the timestamp column is **`ts`** (epoch-**ms**, 13-digit — confirmed), NOT `ts_ms`.

### Q4 — ms-precision-then-format: ✅ CONFIRMED, and load-bearing (quantified on real data)
The source `build_metrics` works **entirely in ms** — `_sum_intervals`/`_merge_intervals`, `.effective_ms`, `.typing_debit_ms` are all ms; the return literal stores raw `*_ms` integers; the **frontend** formats ms→display units at render. There is **no minute-quantization anywhere in the metrics path** (unlike the WP4 segment path, where minute-quantized `start`/`end` are the render *coordinate* — a different concern). **So the metrics DTO carries raw `*_ms`; nothing quantizes.** This sidesteps the anti-pattern entirely.
**Demonstrated on real data why it matters:** tool-call effort = **356.0 min** when summed at ms precision (2241 Pre→Post pairs) vs. **309 min** if each interval were floored to minutes first — a **47-min / 13% undercount**. The tool pairs are overwhelmingly sub-minute (sampled: Edit 53ms, Bash 49ms/41ms), so per-interval quantization zeroes most of them (the exact 3-copies-killed bug). **PLAN CONSTRAINT: `build_metrics` sums at ms, DTO fields are `*_ms` i64, format at render. Pin a sub-minute tool-effort oracle test.**

### Q3 — engaged-session definition: ✅ RESOLVED (the Rust model already reframed it; claude-time's glue is moot)
The claude-time `_build_engaged_intervals` (viz_data.py:942) glued **AI bursts** across non-`away` gaps and split at `away`. **But the Rust reclassifier already has a DIFFERENT, simpler engaged model built** (`reclassify::session_active_ms` + `active_bursts`, mod.rs:334–402): engaged = per-session sum of `(last_UserPromptSubmit → next Stop)` burst windows. **No gap-gluing at all** — engaged is purely the AI-running turns; human time *between* bursts (typing/reviewing/away) is not part of engaged. So the Q3 question "does glue include typing gaps" **dissolves** — there is no glue step in the Rust model. `engaged_session` for WP6c-1 is built on `active_bursts`/`session_active_ms` (per-session sum = `effort_ms`; `_merge_intervals` of the burst spans across sessions = `wallclock_ms`; count sessions with >0 = `session_count`). Real data sanity: engaged distribution 168/120/79/58 min for busy sessions — believable.
- **⚠️ PLAN CONSTRAINT (new finding — session-end capping):** one session showed **885 min engaged in a single burst** — a dangling UPS→Stop where the session was left open / never cleanly Stopped. Raw `active_bursts` would inflate engaged time. WP6c-1 MUST feed `build_metrics` through WP6.5's session-end machinery (`reclassify::resolve_session_end` / `authoritative_end`) so a dangling burst is capped at its true end (max-idle cap / explicit-close marker), exactly as `build_day`/`build_range` already do. Do NOT sum raw bursts. (This is why `build_metrics` must consume reclassified/capped segments, not re-walk raw events with different rules than the timeline surfaces.)

### `deltas` map — ✅ NOT NEEDED in Rust (trims the WP6c-2 producer)
CompareView does **not** read `comparison.deltas`. dashboard.jsx:859-860 is explicit: *"The new design sources from `window.CT_DATA.comparison.{a,b}.metrics`"* — every delta is recomputed **frontend-side** from the two metrics trees (`bShares.k1 - aShares.k1`, `_fmtSignedMult(absDelta)`, `_fmtSignedPp`, etc.). The `deltas`/`_compute_deltas` map is legacy/unconsumed. **PLAN: Rust `build_comparison_data` emits `{a:{…range, metrics}, b:{…range, metrics}, meta}` — SKIP the `deltas` map.** (Reclaims ~46 lines of `_compute_deltas`/`_project_kind_minutes` porting.)

### Confirmed mapping (all rows validated; the spec's table stands, with these notes)
- `ai_agent` = merged AI-family bursts wallclock + summed effort; `ai-reasoning` folds in (Q1 locked) → NO separate line; `subagent` broken out as a sub-line; `tool_call` = `ai-doing` intervals as its own section.
- `human` = `typing + reviewing` ms (Q2 locked); `away` reported separately (HeadlineCard Away tile).
- `blocking.human_blocking_agent_ms` = **`reviewing` only** (reading=agent-idle); `thinking`/`ai-reasoning` REMOVED (it's AI work). `blocking.agent_blocking_human_ms` = AI-family wallclock (= `ai_agent.wallclock_ms`, the identity the JSX asserts).
- `concurrency` = engaged-interval sweep-line, k=1..4+ (`is_plus`) — mechanical port over the redefined (capped) engaged intervals.

### Command-shape lean (for WP6c-1 plan)
The existing `time_analytics_query` command branches on a `QueryWindow` tagged enum + `result.kind`. Lean: add `{kind:"metrics", window}` (window = day|week|range, reusing the existing window selectors) → `MetricsPayload`; and for WP6c-2 `{kind:"compare", preset}` / `{kind:"compare", custom:{a,b}}` → `ComparisonPayload`. Confirm exact shape at WP6c-1 plan; no new command needed.

## Open Questions — RESOLVED (spike, 2026-07-15)

- [x] Validate old→new mapping against real dev-DB sessions — **DONE**, numbers sensible; table stands.
- [x] Q3 engaged definition — **RESOLVED**: Rust `session_active_ms`/`active_bursts` (no glue step); MUST cap via WP6.5 session-end (885-min dangling-burst finding).
- [x] Q4 ms-precision — **CONFIRMED** load-bearing (356 vs 309 min tool-effort on real data); DTO carries raw `*_ms`, format at render, pin sub-minute oracle. (Q1/Q2 were operator-locked, not spiked.)
- [x] `deltas` needed in Rust? — **NO**; CompareView recomputes frontend-side; Rust skips the map.
- [ ] Confirm exact `time_analytics_query` extension shape (`{kind:"metrics"|"compare"}`) — deferred to WP6c-1 plan (lean documented above; not a blocker).
```

---

# PLAN — WP6c-1 (MVP: Rust build_metrics + Metrics tab)

**State:** plan (complete) — 2026-07-15. Scope = **WP6c-1 ONLY** (aggregate metrics for the current window). WP6c-2 (compare) is a separate later plan. Color-family application (2 EffectivenessRow bar blocks) belongs to WP6c-2.

**Plan-time seam findings (from code read):**
- Command dispatch: `time_analytics_query(app, scope, window: QueryWindow) -> TimeAnalyticsResult` (commands.rs:558). `QueryWindow` is `#[serde(tag="kind", rename_all="snake_case")]` → add a `Metrics { window: MetricsWindow }` variant (window = day|week|custom span, reusing the existing `resolve_window` span logic). `TimeAnalyticsResult` (tag="kind") → add a `Metrics(MetricsPayload)` variant. FE mirror in `src/state/timeAnalytics.ts` (`QueryWindow` union + `TimeAnalyticsResult` union).
- **WP6.5 capping is applied in `build_viz_session` (query.rs:353) via `resolve_session_end(sid_events, authoritative_end(sid_events))`, NOT inside `session_active_ms`/`active_bursts`** (mod.rs:356/394 use RAW UPS→Stop). So `build_metrics` MUST cap first: per session, truncate events at the resolved end (or clip bursts/intervals to it) BEFORE running `active_bursts`/`tool_intervals`/`subagent_intervals` — otherwise the 885-min dangling burst inflates engaged. Reuse the exact capping the timeline surfaces use so metrics and timeline agree by construction.
- Reclassifier primitives to consume (all ms, all exist): `active_bursts`/`session_active_ms` (engaged), `tool_intervals` (ai-doing/tool_call), `subagent_intervals` (subagent), and the human/away durations from `human_segments_for_window`'s `dur_ms` (typing/reviewing/away) — NOT the old `gap_buckets`. All work in ms; the DTO stores raw `*_ms` i64; format at render (Q4).
- Merge/sum helpers: `build_metrics` needs `merge_intervals` + `sum_intervals` (wallclock = merged, effort = summed). Check whether query.rs already has these; if not, add them (small, pinned).

## Work Tree

- [x] Phase 1: Rust `build_metrics` producer + `MetricsPayload` DTO + command wiring  <!-- status: done — all impl + verify nodes complete; 513 lib tests (9 metrics oracle pins), clippy --all-targets clean -->>
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk time_store::` exits 0 — includes NEW oracle tests: (a) a sub-minute-tool-effort test proving `tool_call.effort_ms > 0` for N Pre→Post pairs <1min apart (the Q4 anti-pattern pin — assert ms-precision, NOT floored-to-0); (b) an engaged-cap test proving a dangling UPS-without-Stop session is capped at `resolve_session_end`, not stretched (the 885-min finding); (c) a family-mapping test proving `human.wallclock_ms == typing_ms + reviewing_ms` (excludes away + ai-reasoning) and `blocking.human_blocking_agent_ms == reviewing_ms` (NOT +ai-reasoning); (d) a `metrics_dto_serde_shape_is_snake_case` test pinning the wire keys.
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0 (no `unwrap()` outside tests; `?` + typed errors).
  - CLI: `cargo test` full backend suite green (no regression to the 498+ existing tests).
  - HTTP/IPC: invoking `time_analytics_query{scope:"global", window:{kind:"metrics", window:{kind:"day"}}}` against the real dev DB returns a `{kind:"metrics", ...}` payload whose `tool_call.effort_ms` ≈ the ms-precision total (NOT the 13%-undercounted floored value) — validated by a command-level test reading the dev DB fixture or a seeded in-memory store.
  - [x] P1.1 Add `MetricsPayload` DTO (+ nested `EngagedSession`/`AiAgentMetric`{+`SubagentMetric`}/`ToolCallMetric`{+`top:Vec<ToolSummary>`}/`HumanMetric`/`ConcurrencyStratum`[4]/`BlockingMetric`/`MetricsWindowMeta`) to `time_store/query.rs`, snake_case, all duration fields `*_ms: i64`, `multiplier: f64`. NO minute-quantization anywhere (raw ms, format at render).  <!-- status: done -->
  - [x] P1.2 Implemented `build_metrics(start_day, end_day, events) -> MetricsPayload`: `capped_events()` clips each session at `resolve_session_end`/`authoritative_end` FIRST (same idiom as `build_viz_session`); `engaged_session` via capped `active_bursts` (effort=Σ per-session burst ms, wallclock=merged, session_count=#>0); `ai_agent` = `ai_busy_intervals` cover (wallclock) + un-merged component sum (effort), ai-reasoning folded in, `subagent` sub-line from `subagent_intervals`; `tool_call` from `tool_intervals` (top-5 by effort desc, name-asc tiebreak); `human` = typing+reviewing via `human_kind_ms` (away carried separately); `concurrency` sweep-line k=1..4+ `is_plus`; `blocking` (human_blocking_agent=reviewing only, agent_blocking_human=ai_agent.wallclock). Added local `merge_intervals`/`sum_intervals`/`multiplier` helpers.  <!-- status: done -->
  - [x] P1.3 Wired the command: added `QueryWindow::Metrics{window: Box<QueryWindow>}` (nested selector reusing `resolve_window` — Range→its days, Week→Mon..Sun) + `TimeAnalyticsResult::Metrics(MetricsPayload)` + `WindowMode::Metrics{start_day,end_day}`; dispatch calls `build_metrics`.  <!-- status: done -->
  - [x] P1.4 Wrote 8 oracle/regression tests in `query/tests.rs` (outcomes a–d: ms-precision tool-effort 143ms-not-0; engaged-cap of a dangling burst; human=typing+reviewing & blocking=reviewing-only; subagent⊆ai_agent; empty-window zeros; k=2 concurrency; snake_case DTO shape; result-tag). All 31 query tests pass.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — 8 scoped metrics tests pass; full 512-test suite + clippy --all-targets green in build -->
  - [x] verify-self  <!-- status: done (agent-drivable slice) — build integrity (cargo build clean, {kind:"metrics"} dispatch compiles) + command-level IPC shape (metrics-tagged result + snake_case DTO pinned). NO live surface exists for a pure-backend phase → NO Playwright/bridge spawn (per arch convention). LIVE render observation CARRIED to Phase 2 verify-self. -->
  - [x] verify-human  <!-- status: AUTO-SKIP (drive_mode=autopilot; all 4 gates clean — no integration boundary: metrics path is a new artifact no existing surface consumes, existing day/week/custom arms byte-unchanged; verify-self all-PASS). Live Metrics-tab human check is a Phase-2 outcome. -->
  - [x] verify-codify  <!-- status: done — 8 oracle tests (TDD) + 1 added codify pin (engaged_session.multiplier==2.0 parallelism compression); full 512-suite + clippy --all-targets clean; no triage needed -->

- [x] Phase 2: Frontend Metrics tab + HeadlineCard + MetricsPanel  <!-- status: done — all impl + verify nodes complete; live-verified via MCP bridge + operator-approved -->>
  **Observable outcomes:**
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm exec eslint src/` exits 0; `pnpm exec vitest run src/components/workspace/dashboard/` exits 0 (incl. NEW pure-formatter/mapping vitest pins for `MetricsPayload`→display: ms→duration formatting, multiplier `×N.NN`, top-tools ordering, empty-metrics zero-state).
  - CLI: `pnpm vite build` exits 0 (catches broken imports/JSX across the change).
  - Browser (MCP bridge, scratch dir, tracking ON): the Day·Week·Month tab bar now shows a **Metrics** tab; clicking it fetches `{kind:"metrics"}` and renders HeadlineCard (5 tiles: Active session / Human activity / AI effort / Away / Parallel) + MetricsPanel (6 sections: Engaged session / AI agent / Tool call / Human active / Concurrency / Blocking). DOM snapshot contains the tile labels + non-zero numbers for a scratch session with real activity.
  - Browser: tracking-OFF / empty-window shows the existing WP6a empty/gate state (no crash, no NaN); the `dashboardMode` predicate + per-view `hasData` reused.
  - Console: no JS errors on tab switch or metrics render.
  - [x] P2.1 Added `MetricsPayload` + nested types (`MetricsWindowMeta`/`EngagedSession`/`AiAgentMetric`/`SubagentMetric`/`ToolSummary`/`ToolCallMetric`/`HumanMetric`/`ConcurrencyStratum`/`BlockingMetric`) to `timeAnalytics.ts` (snake_case verbatim); extended `QueryWindow` (`{kind:"metrics", window}`) + `TimeAnalyticsResult` (`{kind:"metrics"} & MetricsPayload`).  <!-- status: done -->
  - [x] P2.2 Added `"metrics"` to `DashboardView` + the enabled Metrics tab in `Chrome.tsx` `VIEW_MODES`; wired `GlobalDashboard.tsx`: `metricsData` state, `fetchView` dispatches `{kind:"metrics", window:{kind:"day"}}` (v1 today-window) + handles `result.kind==="metrics"`, `changeView` fetches via the undefined-nav branch, render branch renders `<MetricsView>` on `view==="metrics"`; `metricsEmpty` gate (no engaged sessions + no AI/human activity).  <!-- status: done -->
  - [x] P2.3 Built HeadlineCard (5 monochrome tiles: Active session/Human activity/AI effort/Away/Parallel) inside `MetricsView.tsx`. Away reads `human.away_ms` (carried in the DTO — no frontend recompute); Parallel = `parallelMsOf` (summed k≥2 concurrency wallclock). Neutral tokens only.  <!-- status: done -->
  - [x] P2.4 Built MetricsPanel (6 bordered sections via pure `METRIC_SECTIONS`: Engaged/AI agent/Tool call/Human active/Concurrency/Blocking; concurrency+blocking suppress the mult column). Pure logic (`fmtMsDur`/`fmtMult`/`parallelMsOf`/`METRIC_SECTIONS`) extracted to `metricsMath.ts`, 14 vitest pins (incl. sub-minute fmtMsDur, k≥2 parallel, section shaping). Monochrome — color-family bar blocks are WP6c-2.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — tsc 0, eslint(5 files) 0, metricsMath vitest 14/14, vite build clean; full dashboard suite 278 pass in build -->
  - [x] verify-self  <!-- status: done — LIVE via MCP bridge (Claudesk Dev, real dev DB, tracking ON). (1) Metrics tab present+enabled (Compare disabled=WP6c-2); clicking renders HeadlineCard 5 tiles [Active 22m/Human 1h9m/AI 31m/Away 15m/Parallel 0m] + MetricsPanel 6 sections with real values — sub-minute tools render in SECONDS (23s/3s/2s, the quantization-avoidance proof), human=typing+reviewing, blocking human=reviewing(1h9m)+agent=ai-wallclock(26m) identities hold, ai_agent ×1.19 multiplier meaningful. (2) far-past-window IPC → fully-shaped zeros → inline zero-state, no crash/NaN. (3) Day↔Metrics round-trip clean, no NaN leak. PID-scoped teardown clean (operator had no dev server; ports 1420/9223 freed). RESOLVES the carried Phase-1 live-render observation. -->
  - [x] verify-human  <!-- status: done — operator APPROVED the visual/aesthetic pass 2026-07-15 (functional outcomes all PASSed live in verify-self). Installed-.app visual check deferred to the release gate per operator standing preference. -->
    - [x] P2.verify-human.1 Visual/aesthetic pass — APPROVED (reads as one system with the dashboard).  <!-- status: done -->
  - [x] verify-codify  <!-- status: done — 14 metricsMath pins (TDD) + 4 added dashboardWiring pins (Metrics tab enabled + metrics window/branch/view wired — the consuming-surface coverage for the new-tab integration boundary). Full suites green: 512 backend + 1099 frontend = 1611 tests, 0 fail. No new issues → no back-loop. -->

## Current Node
- **Path:** Feature > WP6c-1 > FINALIZED (archived; local/uncommitted, batched with the M9 tree)
- **Active scope:** COMPLETE. All phases shipped + verified; review-quality done (5 MINOR backlogged); WBS ticked (WP6c-research + WP6c-1 ✅, WP6c-2 remaining); CHANGELOG appended; retrospect written; archived. Exit = F19 (feature done, WBS still has WP6c-2 + WP7 open → product cycle continues → reflect). NOT committed/pushed (operator batches).
- **Blocked:** none
- **Tech debt:** the 5 MINOR review findings (query.rs dedup theme) → standing WP-refactor batch (NOT an F18 trigger in autopilot; deferred by design). No NEW debt found at finalize.
- **WP6c-2 (NOT this feature):** the A/B Compare producer + CompareView + presets + color-family bar blocks remain — a separate later plan. The Compare tab stays disabled until then.
- **Blocked:** none
- **Unvisited:** Phase 2 verify group (verify-auto→verify-self→verify-human→verify-codify). Phase 1 COMPLETE.
- **Open discoveries:** none
- **Phase 2 verify-self carry (from Phase 1):** drive the LIVE Metrics-tab render via the MCP bridge — pick a scratch dir with tracking ON, click the Metrics tab, snapshot the HeadlineCard tiles + MetricsPanel sections with non-zero numbers. PID-scoped teardown ONLY (check 9223 for operator's own dev server first).
- **Blocked:** none
- **Unvisited:** Phase 1 verify group (verify-auto→verify-self→verify-human→verify-codify), then Phase 2 (P2.1→P2.2→P2.3→P2.4→verify group)
- **Open discoveries:** none
- **Build note:** Phase 1 is pure-backend (Rust producer + command wiring). verify-self live-observability is limited (no frontend surface consumes `{kind:"metrics"}` until Phase 2) — per the "verify-self on backend-lifecycle features is operator-only at the live tier" convention, the agent-drivable slice is the cargo suite + a command-level shape assertion; the live render check lands in Phase 2's verify-self.

## Code-Quality Review — m9-wp6c-metrics-compare-panels (WP6c-1)

Reviewed 2026-07-15 (autopilot). **0 CRITICAL, 0 MAJOR, 5 MINOR** — all auto-backlogged to `workflow/backlog-quality-findings.md` (Case C). None blocking; a coherent duplication-of-composition theme in `query.rs`, good WP-refactor-batch scope.

### Strengths
- Measure-don't-infer honored end-to-end: raw `*_ms: i64` in Rust DTO + TS mirror, format-once at render, ms-precision pinned by the 143ms-not-0 oracle — the SURFACE-2026-07-13 anti-pattern cannot silently recur.
- Operator-locked re-derivations encoded as identity-style oracle assertions (human==typing+reviewing; blocking.human==reviewing; agent==ai_agent.wallclock; subagent⊆ai_agent) — a drift breaks a test.
- Clean metricsMath/MetricsView pure-vs-presentational split (repo posture); DTO/wiring snake_case-pinned; nested `Metrics{window}` reuses `resolve_window`.
- The DayTimeline `sumKind`→`sumByKind` change actively retires a copy of the minute-quant bug class.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR** (all auto-backlogged)
- [query.rs ~1100-1116] `ai_component_spans` re-implements `reclassify::ai_busy_intervals`'s span-union body (minus the final merge) — AI-family membership now defined in two places; effort/wallclock could desync on a future kind add.
- [query.rs `merge_intervals` ~986 vs reclassify `merge_spans` ~1151] near-verbatim copy (doc-comment admits it); promote `merge_spans` to `pub(crate)` to unify.
- [query.rs `capped_events` + `human_kind_ms`] both re-build the same `by_sid` grouping + `<unknown>` sentinel verbatim (3rd copy of the idiom); a shared `group_by_session`-style helper would remove it.
- [query.rs ~1094-1116] `build_metrics` calls `active_bursts`/`tool_intervals`/`subagent_intervals` directly AND `ai_busy_intervals` (which recomputes them) → 2-3× re-walk; correctness-neutral (small windows), a one-line comment would orient readers.
- [metricsMath.test.ts:17] `fmtMsDur(143)→"0s"` — defensible (sub-second floors) but sits next to the feature's "sub-minute must be visible" thesis; a clarifying comment prevents a well-meaning regression.

### Assessment
Well-built, faithful re-derivation (not a mechanical port); advances the codebase more than it accrues debt (the DayTimeline cleanup retires a bug-class copy). Only debt is duplication-of-composition inside `query.rs` — correct today, well-commented, but the AI-family rule + session-keying convention are each encoded >1 place. A small consolidation pass (promote `merge_spans`, expose an un-merged-AI-spans primitive, share session-grouping) folds them to single sources — backlog-tier, not blocking.

### If you disagree
Dismiss any finding by marking its line `[DISMISSED]` in this section before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** The biggest surprise was that WP6c-1 was NOT the "mechanical pixel port" the WP1 probe framed — the metric *definitions* genuinely shifted under WP3's 6-kind model (source `human.thinking_ms`→AI-family `ai-reasoning`, so `blocking.human_blocking_agent = reading+thinking` became flat wrong). The spike also found the Rust reclassifier had ALREADY reframed the engaged-session concept (`session_active_ms` = capped UPS→Stop bursts, no gap-gluing) — so claude-time's `_build_engaged_intervals` glue logic was moot, and Q3 dissolved rather than needing an answer. And the `deltas` map turned out to be dead in the source (CompareView recomputes FE-side), trimming the eventual WP6c-2 producer.
- **Assumptions that held:** The WP4 command seam was as friendly as expected (`QueryWindow`/`TimeAnalyticsResult` tagged unions + `resolve_window` extended cleanly with a nested `Metrics{window}` variant — zero span-logic duplication). The color families were already built + applied (kinds.ts/tokens.ts), so WP6c-1's monochrome panels needed no palette work. The ms-precision constraint (from the just-fixed quantization bug) applied exactly as predicted — and the live dashboard proved it on real data (sub-minute tools render as `23s`/`3s`/`2s`, would've been 0 under the anti-pattern).
- **Assumptions that were wrong:** The plan-time worry that `build_metrics` could just call `session_active_ms` directly was wrong — that primitive uses RAW bursts; the WP6.5 capping is applied in `build_viz_session`, NOT the primitive, so `build_metrics` had to clip events at `resolve_session_end` FIRST (the 885-min dangling-burst finding forced this). Caught at spike/build time, not in review.
- **Approach delta:** Matched the plan closely. One addition: extracted the pure logic (`fmtMsDur`/`fmtMult`/`parallelMsOf`/`METRIC_SECTIONS`) into `metricsMath.ts` rather than inlining in MetricsView — cleaner + vitest-pinnable (repo posture). The spike narrowed to 2 live questions after the operator pre-locked Q1/Q2, so it ran fast (real-DB validation, not a rebuild). The 5 review findings are all the same duplication-of-composition theme in query.rs (correct-today, backlogged for the standing refactor batch).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>; each also logged to workflow/backlog.md -->
- (none — the 5 review-quality MINORs are in `## Code-Quality Review` + `backlog-quality-findings.md`)
