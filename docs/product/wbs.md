---
stage: wbs
state: complete
milestone: 9
updated: 2026-07-06
---

# WBS — Milestone 9: Time-analytics panel (absorb claude-time)

**Scope of this WBS pass:** Milestone 9 only (the immediate next execution milestone). Future milestones (M10 docs-viewer, M11 auto-resume, M12 skill-orchestration, M13 polish) stay headline-only in `roadmap.md` and are decomposed just-in-time when reached.

**Milestone goal (from roadmap.md):** Bring CC time-tracking inside Claudesk as a native, **default-OFF** analytics panel — "where did this week's session time actually go, per project?" — by **absorbing** the standalone `claude-time` tool (`_ref/claude-customization/tools/claude-time/`) and deprecating it. The retrospective counterpart to the real-time status surfaces (M4 filmstrip / M5 PiP / M7 menu-bar).

**Primary input:** `SURFACE-2026-06-26-ABSORB-CLAUDE-TIME-INTO-CLAUDESK` (decisions 1–4 LOCKED). **Folded in:** `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (startup-trim → WP6, alongside the dashboard's own lazy-load).

## Locked decisions (constraints, not choices — from the SURFACE)

1. **Full absorption, not reader-only.** claude-time is deprecated once absorbed; Claudesk becomes the sole owner. No cross-repo schema coupling to preserve, no standalone-CLI coverage to keep.
2. **Universal feature, NOT workflow-coupled.** Observes generic CC lifecycle events, not the customization skills. Its own Settings toggle, **default OFF** — but any user (incl. friends) can enable it and get value without running the workflow. (This is the project's first concrete instance of the universal-vs-workflow-coupled feature-flag pattern.)
3. **Write only when tracking is enabled.** The hook fires regardless (it drives the universal live status dots — unchanged). The time-row SQLite write happens **only when the toggle is ON**. Off → receive event → update status → NO SQLite touch → zero storage/IO.
4. **DB does NOT survive / share across the dev/prod split.** Dev and prod each get their OWN tracking DB under `app_data_dir()` (per-identity, consistent with `com.claudesk.app` vs `com.claudesk.app.dev`). No migration of legacy `~/.claude-time/events.sqlite` (start fresh per identity).

**Privacy invariant (preserved from claude-time, non-negotiable):** prompt *lengths* only, tool names + ids only, notification message truncated to 200 chars — never prompt text, never tool input/output. The `privacy_check.sh`-style assertion carries into Claudesk's test suite.

## Source-survey findings (grounds the sizing + ordering)

Read at plan time (`_ref/claude-customization/tools/claude-time/`):

- **`hook.pl`** (175 lines) — logs **11 event types** (`UserPromptSubmit`, `Stop`, `Notification`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`; forward-compat no-op on unknown). Extra fields beyond Claudesk's current wire: `prompt_length_chars`, `tool_use_id`, `agent_type` (from `subagent_type`), `source` (SessionStart). Claudesk currently registers **4** events (`CLAUDESK_EVENTS`) and forwards `prompt`/`message`/`notification_type` only.
- **`reclassify.py`** (368 lines, **pure stdlib**, no I/O) — THE piece of real logic: `gap_buckets` (Stop→next-UPS gaps → reading/thinking/away with typing-debit + cross-session reattribution), `tool_durations_ms`/`tool_intervals` (Pre/Post pairing by `tool_use_id`), `subagent_intervals`/`subagent_durations_ms` (Start/Stop pairing by `agent_type`, FIFO), `active_bursts`/`session_active_ms`. Oracle: `test/test_reclassify.py` (415 lines, the 29 assertions the SURFACE names).
- **`viz_data.py`** (~54 KB) — events → the dashboard's **segment-model JSON**. Contract shape: `{label, iso, projects:[{id, alias, path, sessions:[{id, start, end, prompts, tools, segs:[{kind, start, end, label?}]}]}]}` where `kind ∈ {active, subagent, reading, thinking, away}`; `start`/`end` are integer minutes-of-day. Grouping = git-root + `project_names`-style aliasing. Oracle: `test/test_viz_data.py` (1503 lines).
- **`viz/dashboard.jsx`** (**4065 lines**) — the dashboard. **No external chart library** (hand-rolled SVG). Currently **light-theme** + React 18 UMD + `@babel/standalone` in-browser transform (`viz/template.html`/`index.html`). The unpkg/Babel/template machinery (`viz_render.py`, 63 KB) **evaporates** in a real Vite build. Two ports needed: (a) JSX→TSX for React 19 + Vite; (b) **light-theme → Claudesk dark-only** (CLAUDE.md dark-mode-only rule — no `prefers-color-scheme`, dark tokens only).
- **Claudesk seams that receive the port:** `src-tauri/src/hook_socket/` (listener + `HookEvent` + `parse_line`), `src-tauri/src/hook_install/` (`CLAUDESK_EVENTS` + `~/.claude/settings.json` registration), `src-tauri/resources/claudesk-hook.pl` (the Perl hook), `src-tauri/src/status_broadcaster/` (the fan-out — untouched by writes; the write path is a new sibling), `src/components/workspace/panelHost.ts` (`RightPanel` union + `panelForChord`) + `RightPanelHost.tsx` (the tab slot). Per-identity paths derive from the running bundle id (the dev/prod-isolation source of truth).

## Dependency-driven sizing note

The SURFACE framed the reclassifier as "the one piece of real logic." True — but **the dashboard port (4065 lines JSX→dark TSX) and the segment-model query layer (54 KB Python→Rust, 1503-line oracle) together dominate the milestone's effort and risk**, not the 368-line reclassifier. The ordering below front-loads the riskiest unknown (WP1 probe: freeze the data-model contract + prove the dashboard renders as a dark TSX tab) before any of the three ports commit to a shape.

---

## Work Packages

### WP1: Probe — data-model contract freeze + dashboard-port feasibility — ✅ COMPLETE (2026-07-06, shipped `720542e`)
**Type:** probe
**Outcome:** all 4 criteria answered in `docs/product/wp1-time-analytics-probe-outcome.md`. (a) contract frozen; (b) dark render PASS (day+week); (c) **verdict = GO-WITH-SPLIT → WP6a/6b/6c** (recorded in WP6 below); (d) hook delta = **4→10 events + 4 wire fields** (`PostToolUseFailure` confirmed distinct). Darker-fill palette + `textOn` ink locked as WP6 starting point.
**Milestone:** 9 (must precede WP4 + WP6, which depend on the frozen contract + dark-render verdict)
**Dependencies:** none
**Size:** M
**Learning objective:** Two questions, both blocking downstream shapes:
  1. **What is the exact segment-model JSON contract** the dashboard consumes (the boundary between the Rust query layer WP4 builds and the TSX dashboard WP6 builds)? Document it as a **baseline** schema so WP4/WP6 start from a known shape — the internal equivalent of the "3rd-party probe before the dependent build WP" rule (§4), with the Python `viz_data.py`/`dashboard.jsx` pair as the external contract. **NOTE:** this is claude-time's *current* shape; WP3 (the reclassifier redesign) may revise the metric definitions and therefore this contract — so WP1 freezes the *current* shape as a starting reference, and WP3's locked definitions supersede it where they differ.
  2. **Is the 4065-line `dashboard.jsx` portable to a dark-theme React-19 TSX right-panel tab** without an external chart lib, and roughly how large is that port? Confirm no hidden runtime dep (already spot-checked: hand-rolled SVG, `window.React` UMD only), confirm the light→dark token swap is mechanical (the `CT_TOKENS` block ~L12), and confirm it renders inside a Claudesk panel with a static fixture payload.
**Timebox:** half-day
**Success criterion:** A written probe outcome (`docs/product/wp1-time-analytics-probe-outcome.md`) containing: (a) the frozen segment-model JSON schema (every key + type, `kind` enum, unit conventions), captured from `test_viz_data.py`'s fixtures as the oracle; (b) a static-fixture render of the dashboard's day-view as a dark-theme TSX component inside a throwaway Vite entry (screenshot), proving feasibility; (c) a port-size estimate + a go/split verdict for WP6 (single WP vs. phased sub-views: day / week-rollup / selected-bar side panel); (d) confirmation the extra hook fields the reclassifier needs (`tool_use_id`, `agent_type`, `source`) + the 5 extra event registrations are the complete delta over the current 4-event wire.
**Tasks:**
- [x] Extract the segment-model schema from `viz_data.py` + `test/test_viz_data.py` fixtures; write it as a typed schema doc (the WP4↔WP6 contract).
- [x] Enumerate the exact event-set + field delta vs. `CLAUDESK_EVENTS` + the current `HookEvent`/wire contract (confirms WP2's scope) — 4→10 events, +4 fields.
- [x] Port the `CT_TOKENS` block to Claudesk dark tokens; render the dashboard day-view against a static fixture in a throwaway Vite entry; screenshot — day+week both rendered.
- [x] Write the probe outcome doc with the go/split verdict for WP6 and the frozen contract — GO-WITH-SPLIT.

**WP1 → WP2 rationale:** Freeze the wire/event delta (what fields + events the writer must persist) before extending the hook + DB — so WP2 builds the SQLite schema and the extended `HookEvent` against a known-complete field set, not a guessed one.

### WP2: Absorbed hook + write-gated SQLite writer (Rust, in `hook_socket`)
**Description:** Extend the CC hook + wire contract + listener to persist the full event set the reclassifier needs, **gated on the tracking toggle** (decision 3). Persistence lives in Claudesk's existing `AF_UNIX` listener — NOT a second Perl hook.
  - Extend `CLAUDESK_EVENTS` (4 → the full set: add `PreToolUse`, `SubagentStart`, `SubagentStop`, `SessionStart`, `SessionEnd`; `PostToolUseFailure` if CC emits it — confirm at WP1) and re-register additively/idempotently/reversibly (preserving the existing state-machine behavior + coexisting hooks).
  - Extend `claudesk-hook.pl` to forward the extra fields (`prompt_length_chars` — length only, never text; `tool_use_id`; `agent_type` from `subagent_type`; `source`), preserving the exits-0-unconditionally + privacy invariants.
  - Extend the `HookEvent` struct + `parse_line` + the wire-contract doc for the new fields (snake_case end-to-end, per the IPC-casing convention; add the parallel key-shape test).
  - New write path: a `time_store` module (sibling to `status_broadcaster`, both draining the same `HookEvent` stream) that INSERTs a row into the per-identity SQLite DB — **only when the toggle is ON**. Schema = claude-time's `events(ts, session_id, cwd, event, tool_name, agent_type, meta)`. DB path under `app_data_dir()` (decision 4), derived from the running bundle id.
  - **The status path is unchanged** — `status_broadcaster` keeps consuming the same events for the live dots. The write is a *second, gated* consumer.
**Milestone:** 9
**Dependencies:** WP1 (frozen event/field delta)
**Size:** L
**Tasks:**
- [ ] Extend `CLAUDESK_EVENTS` + `hook_install` registration to the full event set; keep the existing 4-event state behavior + additive/idempotent/reversible + coexistence tests green.
- [ ] Extend `claudesk-hook.pl` to forward `prompt_length_chars` / `tool_use_id` / `agent_type` / `source`; preserve exit-0 + privacy (length-only) invariants.
- [ ] Extend `HookEvent` + `parse_line` + wire-contract doc + snake_case key-shape test for the new fields.
- [ ] New `time_store` module: per-identity `app_data_dir()` SQLite path (bundle-id-derived), schema bootstrap, gated INSERT (write iff toggle ON).
- [ ] Wire `time_store` as a second consumer of the `HookEvent` stream, parallel to `status_broadcaster` (status path untouched).
- [ ] Privacy assertion test (Claudesk-side port of `privacy_check.sh`): no prompt text / tool I/O ever reaches a row.

**WP2 → WP3 rationale:** The DB + schema must exist and be populated (real rows, real shape) before building the reclassifier — the reclassifier reads rows; building it against a live schema (not a mock) de-risks the row-shape assumptions.

### WP2.5: Claudesk-native signal source (focus/blur + PTY keystrokes + registry attribution) — **NEW** (`SURFACE-2026-07-06-M9-NATIVE-SIGNALS-BEAT-GAP-INFERENCE`)
**Why this WP exists:** claude-time could only *infer* the human states (`reading`/`thinking`/`away`) from CC-hook-stream gaps + a guessed typing rate + magic thresholds — it had no other signal. **Claudesk, being the terminal + window, can OBSERVE the exact gap claude-time guesses about.** This WP captures those native signals as a **second event source** alongside the CC hook stream (WP2), so WP3's redesign can *measure* where claude-time could only estimate. This is the core "measure, don't guess" lever the milestone gained by moving in-app.
**Native signals to capture (persist into the same `time_store`, same toggle-gate as WP2):**
  - **Window focus/blur** — Claudesk window focused vs blurred (Tauri `on_window_event` focus events, already used by the PiP auto-summon path — reuse the seam). The strongest present-vs-away signal.
  - **PTY keystroke activity** — real bytes flowing INTO a workspace's CC PTY (and editor/terminal), with real timing. Replaces the `chars_per_sec` typing-debit *guess* with observed typing spans. **Privacy: activity/timing + counts only — NEVER the keystroke content** (same length-only invariant as `prompt_length_chars`).
  - **Workspace-registry attribution** — the active workspace's exact project (cwd→workspace map Claudesk already owns), replacing claude-time's git-root guess. Also which workspace was *focused* when an event fired.
**⚠️ HARD CONSTRAINT — signals are better, NOT perfect; NO naive rules (operator-directed).** This WP CAPTURES signals; it does NOT decide their interpretation (that's WP3's spec). But it must capture enough context to let WP3 disambiguate the known-hard scenarios, because a naive mapping is actively wrong. Concrete scenarios WP2.5's captured data must be able to distinguish (enumerated with the operator 2026-07-06 — this list is the WP3 spec input, and WP2.5 must not lose the information needed to resolve them):
  - **blur-but-working:** CC runs `open <screenshot>` / a browser / an external viewer → operator is reading/thinking WHILE Claudesk is blurred. "Blur → away" would be WRONG. (Capture: was the blur *preceded by* a Claudesk-initiated external launch? / blur duration / did focus return to the same workspace?)
  - **focused-but-idle:** window focused, no keystrokes, CC idle — reading vs thinking (this one likely stays partly inferred even with native signals).
  - **keystrokes-to-editor-vs-CC:** typing in the in-app editor (human work) vs typing a CC prompt vs a right-panel terminal — different attribution.
  - **second-monitor / different-Space:** blurred because on another Space, possibly still glancing at a PiP mirror.
  - **left-the-machine:** genuinely away (long blur + no keystrokes anywhere + no Claudesk-launched external).
**Milestone:** 9
**Dependencies:** WP2 (the `time_store` + schema exist — WP2.5 adds event *kinds*/columns to the same store). **Note:** the schema (WP2's `events` table) may need a `source` discriminator (cc-hook vs claudesk-native) + extra `meta` keys for focus/keystroke events — reconcile with WP2's schema.
**Size:** M *(a capture layer + schema extension; interpretation is WP3's)*
**Tasks:**
- [ ] Extend the `time_store` schema (or add a sibling table) to hold native-signal events (focus/blur transitions with timestamps + which workspace; keystroke-activity spans with counts/timing, no content; active-workspace attribution) — add a `source` discriminator vs. CC-hook rows.
- [ ] Capture window focus/blur (reuse the `on_window_event` seam the PiP auto-summon uses); write gated on the tracking toggle (same rule as WP2).
- [ ] Capture PTY-keystroke activity per workspace (bytes-in timing/counts only — privacy: NO content); attribute to the focused workspace.
- [ ] Capture the Claudesk-initiated-external-launch signal (so WP3 can resolve the `open <screenshot>` blur-but-working case) — e.g. mark blurs that follow a `sublime_open`/`open`-class launch.
- [ ] Privacy assertion test: native-signal rows carry timing/counts/attribution only — never keystroke content, never file paths beyond what attribution needs.
- [ ] Document the captured native-signal schema as the WP3 spec input (the scenario list above + what data resolves each).

**WP2.5 → WP3 rationale:** WP3 can't design "measure vs. infer" rules without the native-signal inventory in hand. WP2.5 makes the signals real + captured (with enough context to disambiguate the hard scenarios) so WP3's spec decides interpretation against actual data, not a hypothetical.

### WP3: Reclassifier — REDESIGN (metric definitions), not a straight port
**⚠️ REDESIGN, not a port (operator flag 2026-07-06).** The operator has stated **the current claude-time classifier is NOT exactly what he wants**. So this WP is a **feature (spec-first) redesign**, not a 1:1 port. `reclassify.py` (368 lines, pure — `gap_buckets` reading/thinking/away with typing-debit + cross-session reattribution; `tool_durations_ms`/`tool_intervals`; `subagent_intervals`/`subagent_durations_ms`; `active_bursts`/`session_active_ms`) and its 29 `test_reclassify.py` assertions are the **starting reference** that documents *how it currently measures* — NOT the target behavior and NOT the porting oracle.

**MANDATORY spec discussion before any code (operator-directed):** WP3 opens with a `/feature-spec` conversation that clarifies, per metric: **(a) the precise definition** the operator wants (what "active" / "reading" / "thinking" / "away" / tool-time / subagent-time / per-project attribution each *mean*), and **(b) exactly how each is measured** from the event stream (which event pairs, which debits/reattributions, which thresholds, which edge-case rules). The gap between "how claude-time currently does it" and "what the operator wants" is the actual work of this WP; capture each delta explicitly. Only after the definitions are locked does the Rust module get built. The new definitions then drive the WP4 segment model + the WP6 dashboard (both may shift from claude-time's shapes as a consequence).

**⭐ MEASURE-vs-INFER agenda item (NEW — `SURFACE-2026-07-06-M9-NATIVE-SIGNALS-BEAT-GAP-INFERENCE`):** the spec's central new question. With WP2.5's native-signal inventory (focus/blur, real keystrokes, registry attribution, Claudesk-launched-external marks) in hand, decide **per human-state which is MEASURED from native signals vs. must stay INFERRED from CC-hook gaps** (as a fallback when Claudesk isn't the active window / the signal is ambiguous). **Operator constraint: native signals are better but NOT perfect — no naive rules; play out the concrete scenarios.** The WP2.5 scenario list (blur-but-working via `open <screenshot>`; focused-but-idle; keystrokes-to-editor-vs-CC; second-monitor/different-Space; left-the-machine) MUST each get an explicit resolution rule (or an honest "this stays inferred / ambiguous"). The output is a per-state measurement rule that fuses both sources — not a swap of one guess for another. **Also the AI-vs-human color-family split** (`SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`, incl. the "reasoning vs doing/tool-call" sub-split — tool-time is hook-observable, pure reasoning stays inference-based) is locked here since it depends on which kinds are AI-execution vs human.

**Description:** After the definitions are locked: build a pure Rust reclassifier module (no DB I/O — row-slice in, typed metric structs out) implementing the *agreed* definitions. Reuse claude-time's mechanics where they already match the operator's intent; change them where they don't. Grouping logic (git-root + `project_names`-style aliasing) stays here as the single source of truth. Write a **fresh** test suite pinning the *new* agreed definitions (adapt the reference assertions only where behavior is unchanged; the reference suite is not a pass/fail oracle).
**Milestone:** 9
**Dependencies:** WP2 (CC-hook row schema exists) **+ WP2.5 (native-signal rows exist)** — the reclassifier reads BOTH sources. **Note:** WP3's outcome (the locked metric definitions + resulting metric/segment shapes) may adjust the WP1-frozen segment-model contract → feed the delta forward to WP4/WP6.
**Size:** L→XL *(a definitions-redesign + spec discussion + a two-source measure-vs-infer fusion — not a mechanical port; upsized again by the native-signal integration)*
**Tasks:**
- [ ] **`/feature-spec` metric-definitions discussion (operator, blocking):** for each metric (active / reading / thinking / away / tool-time / subagent-time / per-project attribution), lock (a) the definition and (b) the measurement rule — **fusing CC-hook gaps + WP2.5 native signals**, deciding per-state measured-vs-inferred (see the MEASURE-vs-INFER agenda above; resolve each hard scenario explicitly). Record each as a delta vs. claude-time's current behavior. *(This task gates all others.)*
- [ ] Lock the AI-vs-human color families + reasoning-vs-doing sub-split (`SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`) as part of the definitions (which kinds are AI-execution vs human drives the palette).
- [ ] Build the pure Rust reclassifier implementing the agreed definitions (reuse claude-time mechanics where they match; change where they don't).
- [ ] Fresh test suite pinning the NEW definitions (reference `test_reclassify.py` assertions adapted only where behavior is unchanged — not treated as a 1:1 oracle).
- [ ] Feed any segment-model-shape delta forward to WP4/WP6 (the definitions may change what the query layer emits + what the dashboard renders).
- [ ] Config surface (`chars_per_sec`, thresholds, `project_names`) — hardcode-vs-setting decided as part of the definitions discussion (a threshold the operator wants to tune argues for a setting).

### WP4: Segment-model query layer ported to Rust
**Description:** Adapt `viz_data.py` (~54 KB — events → segment-model JSON) to a Rust query layer that reads the SQLite rows, runs the **WP3 (redesigned) reclassifier**, and emits the segment-model contract consumed by the WP6 dashboard. **The emitted shape is the WP1-frozen contract as revised by WP3's locked metric definitions** — where WP3 changed a metric, the segment model changes with it (not a straight port of `viz_data.py`'s current shape). Exposed as a Tauri command (e.g. `time_analytics_query { scope, window }`). `test_viz_data.py` (1503 lines) is a **structural reference** for the transform mechanics (segment splitting, subagent-in-active splitting, per-project rollups, day/week/custom windows) — port the assertions that survive WP3's redefinitions; write fresh ones where the definitions changed. Scope decision (open sub-decision → resolve here): **global all-projects view vs. per-workspace** — lean **global with a per-project breakdown** (the value is cross-project "where did the week go", matching the filmstrip/PiP cross-project thesis), rendered from any workspace's tab.
**Milestone:** 9
**Dependencies:** WP1 (initial contract), WP2 (DB rows), WP3 (redesigned reclassifier + revised metric definitions — WP3's outcome may reshape what this layer emits)
**Size:** L
**Tasks:**
- [ ] Adapt `viz_data.py`'s event→segment transform to Rust (day / week-rollup / custom-window builders), emitting the WP1-contract-as-revised-by-WP3.
- [ ] Rust query layer over the per-identity SQLite DB feeding the transform; expose as a Tauri command.
- [ ] Test the transform (port surviving `test_viz_data.py` assertions; fresh assertions where WP3's definitions changed the shape).
- [ ] Snake_case DTO + parallel key-shape test for the query result (IPC-casing convention).

**WP4 → WP5 rationale:** The query path (data in → segment JSON out) is the synchronous core; the toggle that gates writing + surfaces the tab is the control layer wrapped around a working data path. Prove the data flows end-to-end before wiring the on/off control (§5 spirit: core path before the control that gates it).

### WP5: Tracking toggle — universal-vs-workflow-coupled feature-flag pattern (default OFF)
**Description:** The Settings toggle that gates everything. **Default OFF** (decision 2 — zero cost for users who don't want it). Establishes the **universal-vs-workflow-coupled feature-flag pattern** (this feature is universal; the pattern will later also serve the workflow-coupled M10–M12 features). Persisted per bundle-identity (in `projects.json` app-level settings or a sibling — decide at build; consistent with `pip_mode` persistence). When ON: WP2's `time_store` writes rows + the WP6 tab is enabled. When OFF: no SQLite touch (WP2's gate reads this flag), the tab shows an "enable tracking to see analytics" empty state, status dots unaffected.
  - `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` — this prior is about defaulting to the *operator's* benefit; here decision 2 **overrides** it to default OFF (the operator explicitly chose OFF-for-friends-cost-reasons). Disclosed override, not a silent steer — the locked decision wins.
  - `[PRIOR: explicit-selectable-mode-over-inferred-mode]` agrees with the common-sense default (a legible, directly-set toggle, not inferred state) — take it, higher confidence.
**Milestone:** 9
**Dependencies:** WP2 (the write-gate reads this flag), WP4 (the tab it enables has data to show)
**Size:** M
**Tasks:**
- [ ] Persist a `time_tracking_enabled` flag per bundle-identity (default false); expose get/set Tauri commands.
- [ ] Wire WP2's write-gate to read the flag (OFF → no INSERT, verified zero-IO).
- [ ] Settings UI affordance to toggle it (location: reuse the existing settings surface the no-yolo M6-WP7 setting lives in).
- [ ] Empty-state in the tab when OFF ("enable tracking…"); tab still mountable, just data-empty.
- [ ] Contract test: OFF → event received → status updates → no row written; ON → row written.

### WP6: Native dashboard right-panel tab (dark-theme TSX port + lazy-load) — **SPLIT into 6a/6b/6c per WP1's verdict**
**Description:** Port `viz/dashboard.jsx` (4065 lines, 28 top-level components) to a React-19 TSX right-panel tab, **dark-themed** (Claudesk dark-only), fed by WP4's Tauri command. **WP1 RESOLVED the split question (2026-07-06): verdict = GO-WITH-SPLIT** — the port is de-risked (self-contained; namespace-form hooks → a single `import React`; hand-rolled SVG = no chart dep; mechanical dark token swap proven rendering for day + week views), but 4065 lines / 28 components is too large for one WP and the surfaces separate cleanly along the existing `variant` prop + the `window.CT_DATA` key each reads. **Starting palette + contrast rule locked at WP1** (darker-fill deep semantic tokens + luminance `textOn(bg)` ink — see `wp1-...-outcome.md` §b). Renders in-window — no unpkg/Babel CDN, no separate browser window, no stale-snapshot-vs-moving-cursor problem.
**Milestone:** 9
**Dependencies:** WP1 (dark-render verdict + frozen contract + starting palette — DONE), WP4 (data source), WP5 (toggle-gated enable + empty state). **WP6c additionally depends on WP3** (its surfaces consume `metrics`/`comparison` shapes WP3 redesigns).
**Size:** XL total, split into L (6a) + M (6b) + M (6c).

#### WP6a: Day-view MVP + tab wiring + lazy-load scaffold **(the shippable MVP)**
The `DayTimeline` chain (`SegmentBar`/`SessionRow`/`ProjectHeaderRow`/`HourRuler`/`HourGridBackground`/`OverlapMarkerLayer`/`CollapsedTrackRow`) + chrome (`Toolbar`/`SummaryStrip`/`Legend`/`ProjectFilterPopover`/`Icon`) — ~55% of the file, all proven rendering in the WP1 spike. **Folds in `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`.**
- [ ] Add `"dashboard"` to `RightPanel`, a `⌘⇧`-chord in `panelForChord` (next free — confirm disjoint from `⌘⇧E`/`⌘⇧D`/`⌘⇧T`/`⌘⇧O`/`⌘⇧P` and `⌘⇧+digit`), a tab + slot in `RightPanelHost` (mirror editor/diff/terminal wiring).
- [ ] Port the day-view chain + chrome → dark TSX consuming WP4's command; lift the WP1 dark `CT_TOKENS` (darker-fill) + `textOn()` ink helper verbatim.
- [ ] Lazy-load the dashboard chunk (`React.lazy` + Suspense); fold in CM6/EditorPanel lazy-load (`SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD`); confirm the 500 KB chunk-size warning clears / main bundle shrinks.
- [ ] Live verify-self via the MCP bridge: open a scratch workspace, enable tracking, drive a CC turn, open the Dashboard tab, confirm a dark per-project day breakdown renders.

#### WP6b: Week / Month / Minimap / SidePanel + range navigation
The remaining time-*shape* surfaces (`WeekTimeline` proven in the WP1 spike; `MonthView`/`MonthNavToast`/`Minimap`/`SidePanel`/`RangePicker` share the same primitives). ~30% of the file.
- [ ] Port `WeekTimeline` + `MonthView`/`Minimap` (variant switch in `Toolbar`).
- [ ] Port `SidePanel` (selected-bar detail) + `RangePicker` (custom window).

#### WP6c: Metrics / Headline / Compare panels — **AFTER WP3 defs lock**
The aggregate-metric surfaces (`MetricsPanel`/`HeadlineCard`/`CompareView`/`EffectivenessRow`/`PresetSelector`) consume `window.CT_DATA.metrics`/`.comparison` — whose *definitions WP3 redesigns*. Porting their pixels is mechanical; their inputs aren't frozen until WP3. ~15% of the file. **Sequence last.**
- [ ] After WP3 locks metric definitions: port the metrics/headline/compare panels against the redesigned `metrics`/`comparison` shapes.
- [ ] Apply the WP3 AI-vs-human color families (`SURFACE-2026-07-06-M9-COLOR-FAMILIES-AI-VS-HUMAN`) across all surfaces once the kind→family mapping is locked.

### WP7: Deprecate standalone claude-time + milestone-exit verify
**Description:** Retire the standalone tool now that Claudesk owns the capability (decision 1). Remove the separate `claude-time-hook.pl` registration from `~/.claude/settings.json` (Claudesk's `hook_install` un-registers it / the user's own copy is left inert — decide the least-surprising path: Claudesk should NOT delete a hook it didn't install, but should stop *depending* on it; document the manual removal in the retirement note). Update `CLAUDE.md` + `arch.md` to record the absorbed hook/DB/reclassifier/dashboard as-built and the tool's deprecation. Milestone-exit verification of the exit criteria against the installed `.app` (per the installed-build smoke-test convention — this feature touches the hook registration + external-process env, so it MUST be smoke-tested from a Finder-launched `.app`, not just `pnpm tauri:dev`).
**Milestone:** 9
**Dependencies:** WP2–WP6 (the capability must be fully in-app before deprecating the source)
**Size:** S
**Tasks:**
- [ ] Document the standalone claude-time retirement (README/note in the source repo is out of Claudesk's tree — record the deprecation in Claudesk's `arch.md` + a backlog closure); confirm Claudesk no longer depends on `claude-time-hook.pl`.
- [ ] Resync `CLAUDE.md` + `arch.md`: absorbed hook event-set, `time_store` + per-identity DB, reclassifier module, dashboard tab, the universal feature-flag pattern.
- [ ] Milestone-exit verify: toggle ON → a day of usage → per-project breakdown renders in the native tab; toggle OFF → zero storage/IO + status dots unaffected; installed-`.app` smoke test (Finder-launched, GUI-PATH parity, hook registration).

---

## Learning-Sequence Ordering (summary)

1. **WP1 (probe)** — freeze the data-model contract + prove dark-dashboard feasibility. The riskiest unknown (4065-line JSX port + the WP4↔WP6 contract) resolved first, cheaply, before any port commits to a shape.
2. **WP2 (hook + write-gated DB)** — the substrate. Real rows in a real schema before anything reads them.
2.5. **WP2.5 (native-signal source)** — capture Claudesk's own focus/blur + keystroke + registry signals into the same store (second event source). The "measure, don't guess" lever; makes the signals real before WP3 designs how to use them.
3. **WP3 (reclassifier REDESIGN)** — the pure logic, spec-first; fuses CC-hook gaps + native signals (measure-vs-infer per state), over the WP2+WP2.5 schema. NOT a 1:1 port.
4. **WP4 (query layer)** — the synchronous data path (rows → segment JSON), oracle'd against `test_viz_data.py`.
5. **WP5 (toggle)** — the control layer wrapped around the working data path (§5 spirit: core before the gate).
6. **WP6 (dashboard tab)** — the render, fed by WP4, gated by WP5, dark-themed, lazy-loaded (+ CM6 fold-in). **SPLIT per WP1's verdict into 6a (day-view MVP + lazy-load) → 6b (week/month/side-panel) → 6c (metrics/compare, after WP3 defs lock).**
7. **WP7 (deprecate + exit verify)** — retire the source only after the capability is fully in-app + verified on the installed build.

**No async/orchestration layer** in M9 — the write path is a synchronous INSERT on an existing event stream, the query path is a synchronous SQLite read. §5 (orchestration-after-sync) has no applicable async wrapper to defer.

## 3rd-Party Integration Note (§4 applied internally)

There is no *external network* API here, but the **Python↔Rust behavioral contracts** are treated as 3rd-party integrations per §4: WP3 and WP4 each have a documented porting oracle (`test_reclassify.py`, `test_viz_data.py`) that must pass before the port is considered done, and WP1's probe freezes the segment-model shape that is the boundary between WP4 (producer) and WP6 (consumer) — the internal equivalent of "probe the API shape before the dependent build WP."

## Dependency Map

```
WP1 (probe: contract + dark-render verdict)
 ├─→ WP2 (CC-hook + write-gated DB) ──┬─→ WP2.5 (native-signal source) ──→ WP3 (reclassifier: fuse both) ──┐
 │                                     │        (both sources feed WP3)                                      ├─→ WP4 (query layer) ──┐
 │                                     └──────────────────────────────────────────────────────────────────┘                        ├─→ WP6 (dashboard tab)
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
                                        WP5 (toggle: gates BOTH write paths) ─────────────────────────────────────────────────────┘
                                                                                                                └─→ WP7 (deprecate + exit verify)
```

**Critical path:** WP1 → WP2 → WP2.5 → WP3 → WP4 → WP6 → WP7 (WP2.5 lands on the critical path — WP3's measure-vs-infer redesign needs the native signals captured first).
**Parallel track:** WP5 (toggle) can proceed alongside WP2.5/WP3/WP4 once WP2's write-gate hook point exists — it only needs to *land* before WP6, and its gate-read merges into WP2 **and WP2.5** (the toggle gates BOTH the CC-hook writes and the native-signal writes). WP2.5 could partly parallelize with WP3's *spec* discussion, but WP3's *build* needs WP2.5's captured schema.

## Open sub-decisions (resolve at each WP's spec/build — from the SURFACE)

- **DB path** under `app_data_dir()` — resolve at WP2 (lean: `<app-data>/time-analytics.sqlite`, sibling to `hook.sock`).
- **Native-signal schema shape** — one `events` table with a `source` discriminator (cc-hook vs claudesk-native) vs. a sibling table — resolve at WP2.5 (lean: same table + `source` column + `meta` keys, so WP3/WP4 read one stream).
- **Measure-vs-infer per human-state** (which states use native signals vs. stay CC-hook-gap-inferred; how each hard scenario resolves) — resolve at **WP3's `/feature-spec`** (the central new design question; `SURFACE-2026-07-06-M9-NATIVE-SIGNALS-BEAT-GAP-INFERENCE`). Operator constraint: signals are better not perfect — no naive rules.
- **config.json tuning surface** (`chars_per_sec`, thresholds, `project_names`) as a Claudesk setting vs. hardcode — resolve at WP3 (lean: hardcode claude-time defaults; add a setting only if a tuning need surfaces).
- **Panel scope** — global all-projects vs. per-workspace — resolve at WP4 (lean: global with per-project breakdown; the cross-project view is the value).
- **Toggle persistence location** — `projects.json` app-settings vs. a sibling file — resolve at WP5 (lean: reuse the existing settings surface the no-yolo setting uses).
- **WP6 single-WP vs. split** into day / week-rollup / selected-bar sub-phases — ✅ RESOLVED at WP1 (2026-07-06): **GO-WITH-SPLIT → 6a/6b/6c** (see WP6 above).

## Architecture check

No architectural gaps found — M9 reuses shipped seams end-to-end (M2 right-panel tab model + `panelHost`, M3 hook plumbing + `hook_socket` + `status_broadcaster`, the dev/prod per-identity `app_data_dir()` isolation, the snake_case IPC-casing convention, the MCP-bridge verify-self path). The one net-new architectural element is a **SQLite persistence layer** — a deliberate, scoped exception to the "no DB / flat JSON" key decision: that decision governs the *project list* (≤100 entries, read-on-open); time-analytics is an append-heavy event log where SQLite is the right tool (and is exactly what claude-time already proved). This will be recorded in `arch.md` at WP7's resync as a bounded, feature-local DB, not a reversal of the project-list-is-JSON decision.

**Next step:** WBS complete, architecture holds (the SQLite-for-events scope is documented above, to be reconciled into `arch.md` at WP7 — not an arch-gap back-loop). → Run `/product-context` (P9) to reconcile `.gitignore`/memory-link posture and transition to the feature workflow for WP1.
