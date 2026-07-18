# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# m10-wp4-updater-user-control-ux — 2026-07-17

*(feature-review-quality on ship commit `ee7bad7`; Mode 3 autopilot. Originally 0 CRITICAL / 1 MAJOR / 3 MINOR. **3 RESOLVED by M10 WP6 Phase 1** — the MAJOR `ERROR-STATE-UNCONSUMED` [now consumed by `UpdaterStatusRow`], MINOR `MENU-CHECK-DISCARDS-OUTCOME` [manual-check feedback via `statusNoteForOutcome`], MINOR `FALLBACK-VS-ERROR-RACE` [reconciled under the single-post-install-surface invariant] — closed 2026-07-18 at `/product-finalize`, see CHANGELOG. 1 MINOR survives below.)*

## SURFACE-2026-07-17-QUALITY-WP4-FINISH-EMIT-ZEROES-DOWNLOADED
- **Severity:** MINOR
- **Location:** `src-tauri/src/updater/commands.rs` (~L184-193, `on_download_finish` emit)
- **Finding:** the finish emit sends `downloaded: 0, total: None, done: true`, zeroing the final cumulative byte count. Harmless (`progressPercent` short-circuits on `done` → 100), but reads as a lost value to a future maintainer.
- **Why it matters:** trivial cosmetic; the `done`-pins-100 comment exists, but the `downloaded: 0` reset is mildly surprising.
- **Priority:** low
- **Pickup shape:** carry the final `downloaded` through on the finish emit (or a one-line comment). Rides any future `updater/commands.rs` touch. Dismiss via the WIP's review section.

# m10-wp3-brew-detect-and-defer — 2026-07-17

*(feature-review-quality on the WP3 working-tree diff [uncommitted, on HEAD `2592b2d`]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all documentary/cosmetic, auto-backlogged. Reviewer verdict: "well-built, appropriately-scoped… advances the codebase and accrues no meaningful debt." NOTE: this WP's P1.5 doc-drift fold RESOLVED the two `m10-wp2-updater-core` findings below [WP2-LIBRS-INVOKE-COMMENT-STALE + WP2-CARGO-DEP-COMMENT-STALE] — those close at finalize.)*

## SURFACE-2026-07-17-QUALITY-WP3-MOD-LAYOUT-LIST-INCOMPLETE
- **Severity:** MINOR
- **File:** `src-tauri/src/updater/mod.rs` (module header `## Layout` bullet list, ~lines 26-45)
- **Finding:** The `## Layout` list enumerates the pure-core functions (`resolve_bundle_path`, `quarantine_clear_command`, `clear_own_quarantine`, `commands`) but was not extended to list WP3's two new public functions (`install_source_from_bundle`, `install_source`).
- **Fix shape:** Add two bullets to the `## Layout` list for the install-source pair. One-line-each edit.
- **Why it matters:** the header is an otherwise carefully-maintained map of the module surface; a reader scanning it will miss the install-source pair.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-17-QUALITY-WP3-RESOLUTION-ASYMMETRY-UNREMARKED
- **Severity:** MINOR
- **File:** `src-tauri/src/updater/mod.rs` (`install_source()` ~L181 canonicalizes; `clear_own_quarantine` ~L194 does not)
- **Finding:** `install_source()` canonicalizes the bundle path before classifying; WP2's `clear_own_quarantine` operates on the non-canonicalized `resolve_bundle_path` output. Benign today (the brew branch is gated out before `clear_own_quarantine` ever runs; the direct-download path has no symlink to resolve), but the two bundle-resolution paths now differ in one step without a note.
- **Fix shape:** Add a one-line comment on `install_source()`'s canonicalize (or on `clear_own_quarantine`) explaining why one resolves the symlink chain and one doesn't, so a future maintainer doesn't wrongly "unify these."
- **Why it matters:** prevents a wrong unification refactor that could break brew detection (which NEEDS canonicalize to see the real Caskroom path behind the /Applications symlink) or add an unnecessary stat to the self-clear path.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-17-QUALITY-WP3-SHORTCIRCUIT-TEST-PINS-SHAPE-NOT-ORDERING
- **Severity:** MINOR
- **File:** `src-tauri/src/updater/commands.rs` (`homebrew_source_short_circuits_to_defer_with_no_available_version`, ~L196-211)
- **Finding:** The test reconstructs the `UpdateCheckResult` by hand rather than invoking `updater_check` (the `AppHandle` dependency makes a true command-level test awkward), so it pins the expected *shape* but not that `updater_check` actually orders the brew short-circuit BEFORE the network `check()`. That load-bearing invariant (Homebrew never hits the network) rests on code inspection + the live bridge verify-self, not the unit test. The limitation is honestly noted in the test comment.
- **Fix shape:** If/when the command layer becomes testable (a mockable updater seam, or a `tauri::test` harness), add a test asserting no network call fires for a Homebrew source. Otherwise accept as a documented structural limitation.
- **Why it matters:** the most load-bearing WP3 invariant is asserted by structure, not test — a future refactor of `updater_check`'s ordering could silently break the short-circuit.
- **Priority:** low.
- **Status:** pending.

# m10-wp2-updater-core — 2026-07-17

*(feature-review-quality on the WP2 working-tree diff [uncommitted, on HEAD `27743ff`]; Mode 3 autopilot. Originally 0 CRITICAL / 0 MAJOR / 3 MINOR — all doc-drift/cosmetic. **2 of 3 RESOLVED by M10 WP3's P1.5 doc-drift fold** [WP2-LIBRS-INVOKE-COMMENT-STALE + WP2-CARGO-DEP-COMMENT-STALE — closed 2026-07-17 at WP3 finalize, see CHANGELOG]. 1 MINOR survives below.)*

## SURFACE-2026-07-17-QUALITY-WP2-CURRENT-VERSION-DUAL-PROVENANCE
- **Severity:** MINOR
- **File:** `src-tauri/src/updater/commands.rs` (lines ~52-56, `updater_check`)
- **Finding:** The no-update branch reads the running version from `app.package_info()` while the update-available branch reads it from `update.current_version` — two provenances for the same "current version" field. Not a correctness bug (in the no-update path `update` is `None`, so `package_info` is the only option; both resolve to the bundle version), but the divergence is worth a one-line note or unification for the reader.
- **Fix shape:** Add a one-line comment explaining the two sources, or hoist the current-version read to a single `let current = app.package_info().version.to_string();` used by both branches. Cosmetic.
- **Why it matters:** a reader may wonder why `current_version` has two provenances.
- **Priority:** low.
- **Status:** pending.

# m9-wp7-deprecate-claude-time — 2026-07-16

*(feature-review-quality on the WP7 working-tree change [DOCS-ONLY resync: arch.md event-set/SQLite/deprecation Key Decisions + new "Milestone 9 architecture" section; CLAUDE.md Current-Milestone refresh; wbs.md pause-footer strip; runtimes.md build-observation]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer cross-checked every material architectural claim against source — all held. MINOR #1 [arch.md hook-schema omitted `source`/`prompt_length_chars`] was FIXED IN PLACE during review-quality [not backlogged], since it was a self-introduced one-line gap in the exact section under review. The 2 below are out-of-scope for WP7 — auto-backlogged.)*

## SURFACE-2026-07-16-QUALITY-WP7-WBS-FRONTMATTER-STALE
- **Severity:** MINOR
- **File:** `docs/product/wbs.md` (frontmatter, ~L5)
- **Finding:** After WP7 completed, the wbs.md frontmatter still reads `updated: 2026-07-15`, `state: complete`, and a comment "Only WP7 … remains for M9" — now stale (WP7 is done). The WP7 diff correctly only stripped the resolved session-pause block; the frontmatter/roadmap resync + WBS archival is deferred to `/product-finalize` by design.
- **Fix shape:** `/product-finalize` sweeps this when it closes the M9 cycle (bumps `updated:`, archives the WBS to `docs/product/archive/milestone-9-time-analytics/`). No standalone action needed — flagged so finalize doesn't skip it.
- **Priority:** low.
- **Status:** pending (expected to resolve at `/product-finalize`).

## SURFACE-2026-07-16-QUALITY-WP7-CLAUDEMD-WP2-WIREFIELD-COUNT
- **Severity:** MINOR
- **File:** `CLAUDE.md` (Current Milestone, WP2 status line, ~L162)
- **Finding:** The unchanged WP2 status line says "10-event hook + **5 wire fields**"; the actual new-field count is 6 (`prompt_length_chars`, `tool_name`, `tool_use_id`, `agent_type`, `source`, `reason`). Pre-existing WP2-era text (not introduced by the WP7 diff), but the WP7 M9-complete resync was the natural moment to correct it.
- **Fix shape:** one-word edit "5 wire fields" → "6 wire fields" in the WP2 status line; fold into the next CLAUDE.md touch or `/product-finalize`'s durable-doc resync.
- **Priority:** low.
- **Status:** pending.

# m9-wp6c-2-compare-view — 2026-07-15

*(feature-review-quality on the WP6c-2 working-tree change [Rust `build_comparison_data` + `ComparisonPayload` DTO + `{kind:"compare"}` command; FE Compare tab: `compareMath.ts` + `CompareView.tsx` + GlobalDashboard wiring + tab enable; uncommitted per commit-only-when-asked, the M9 tree local carry]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all auto-backlogged. Reviewer: well-built, advances the codebase more than it accrues debt; disciplined re-derivation reusing the shipped `build_metrics` per side + FE-side delta recompute (serde-pinned no-`deltas` contract) + strong oracle coverage. All 4 MINOR are backlog-tier polish, none blocking.)*

## SURFACE-2026-07-15-QUALITY-WP6C2-LOCAL-DATE-OF-MS-DUP
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`local_date_of_ms` ~L1260) ↔ pre-existing `local_date_of` (~L417, same module)
- **Finding:** `local_date_of_ms` byte-duplicates the WP4 `local_date_of` in the SAME module (differs only in name + the `.expect()` message). `events_in_days` could have called the existing `local_date_of`. ADDS to the standing WP6c-1 query.rs duplication-of-composition cluster.
- **Fix shape:** delete `local_date_of_ms`, point `events_in_days` at `local_date_of` — folds into the single `query.rs` consolidation pass the WP6c-1 cluster already needs.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C2-TOPBLOCKINGSHIFT-DEAD-BRANCH
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/compareMath.ts` (`topBlockingShift` ~L129)
- **Finding:** the `human→agent` branch is effectively UNREACHABLE. After the verify-self fix normalized `blockingShares` to a split summing to 100, `humanToAgent === 100 − agentToHuman` for both sides → `haShift === −ahShift` → `|ahShift| === |haShift|` always, so the `>=` tie-break always returns the `agent→human` label. The Δ column never displays `human→agent`. (No correctness impact — the pp magnitude is right; only the label choice is dead.)
- **Fix shape:** collapse to a single fixed `agent→human` label (report `ahShift` directly), or keep the two-component shift on an un-normalized basis if a `human→agent`-labeled delta is actually wanted. Pin whichever.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C2-COMPARESIDE-RANGE-UNCONSUMED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`CompareSide.range` ~L349) + `src/state/timeAnalytics.ts` (`CompareSide.range` ~L204)
- **Finding:** `CompareSide.range` is an UNCONSUMED contract field — CompareView reads only `a.metrics`/`b.metrics`/`meta`; `range` duplicates `metrics.window` (the DTO comment admits it). Mildly contradicts D2's own "no unconsumed contract" discipline (which dropped `_computeMetricsView` for exactly this reason).
- **Fix shape:** drop `CompareSide.range` from both the Rust DTO + the TS type (CompareView already has `metrics.window` if it ever needs the per-side bounds); or, if kept for future per-side labeling, note the intended consumer.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C2-CHROME-HEADER-COMMENT-DRIFT
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/Chrome.tsx` (file-header comment ~L8)
- **Finding:** the file-header comment still says "Compare stays disabled (WP6c)" though the tab is now `enabled: true` (the `VIEW_MODES` inline comment at ~L35-37 is already correct). Header/body comment drift.
- **Fix shape:** one-line comment update to reflect all 5 views enabled as of WP6c-2.
- **Priority:** low.
- **Status:** pending.

# m9-wp6b-4-multiday-timeline — 2026-07-15

*(feature-review-quality on the WP6b-4 flexible-timeline RE-SPEC [continuous no-mode video-editor timeline; fixed-origin coordinate model; uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 2 MINOR — all auto-backlogged. Reviewer: well-built, structurally sound; the hard part [continuous camera over auto-extending data, no viewport jumps] solved cleanly via fixed origin + pure unit-pinned helpers + a backward-compatible seedKey decoupling. The 2 MAJOR are in the genuinely-new complexity zone, neither a crash, both small localized fixes — appropriate for the standing refactor batch, not a feature reopen.)*

## SURFACE-2026-07-15-QUALITY-WP6B4-FRAMEDRANGE-PICKER-OFFBYONE
- **Severity:** MAJOR
- **File:** `src/components/workspace/dashboard/viewport.ts` (`framedRange` L224-243) ↔ `src/components/workspace/dashboard/RangePicker.tsx` (`MAX_RANGE_DAYS = 30`)
- **Finding:** `framedRange` can emit a 31-inclusive-day span from a LEGAL 30-day-span viewport that is day-MISALIGNED. `clampViewport` caps the visible *span* at `MAX_ZOOM_OUT_SPAN_MIN = 30*1440`, but `framedRange` maps to lanes via `floor(start/1440)` … `ceil(end/1440)-1`; a max-span viewport shifted by a fractional day yields `endLane - startLane + 1 === 31` (e.g. `[5.5d, 5.5d+30d)` → 31 days). That value feeds `RangePicker`, whose `validateRange(…, MAX_RANGE_DAYS=30)` flags it → at maximum zoom-out with a pan-misaligned camera the reactive readout sticks in a **permanent red-border error on a value the operator never typed**. No crash (the commit guard holds; only the readout display is affected).
- **Fix shape:** reconcile the two "30" bounds — the 30-*lane* span cap (`MAX_ZOOM_OUT_SPAN_MIN`) vs. the 30-*inclusive-day* picker max (`MAX_RANGE_DAYS`) are off-by-one relative to each other. Either cap the span at `29*1440 + something` so a misaligned max window spans ≤30 lanes, or clamp `framedRange`'s span to `MAX_RANGE_DAYS` days, or make the picker tolerate the 31st lane at max zoom. Pick one; pin it.
- **Priority:** medium.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6B4-AUTOEXTEND-FIRINGREF-LATCH
- **Severity:** MAJOR
- **File:** `src/components/workspace/dashboard/GlobalDashboard.tsx` (`AutoExtendWatcher` firingRef + clearing effect ↔ `extendLoaded` early-returns)
- **Finding:** `AutoExtendWatcher.firingRef` can latch `true` permanently and gates BOTH extend directions. The watcher sets `firingRef.current = true` before calling `onExtend`; only the `useEffect([lo, hi])` clears it. But `extendLoaded` early-returns WITHOUT changing `loadedStartIso`/`loadedEndIso` when already at the origin floor / at today (`if (clamped === loadedStartIso) return`). In that path `[lo,hi]` never changes → the guard never clears → and because a single `firingRef` gates both `older` and `newer`, a latched `older` guard could block a later legitimate `newer` extend at the opposite edge.
- **Fix shape:** clear `firingRef` inside the watcher's debounced callback when `needsExtend` returns null, OR have `extendLoaded` signal the no-op back so the watcher clears the guard. Small localized fix.
- **Trigger probability:** low — requires panning to one hard edge (latching the guard via a no-op extend) then to the opposite edge before any window-changing extend re-runs; `needsExtend` returning null at a reached edge masks the same-direction case (hence MAJOR not CRITICAL). But it's a genuine latent state-machine bug in the load-bearing new complexity.
- **Priority:** medium.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6B4-DEAD-VIEWPORTFROMRANGE
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/viewport.ts` (`viewportFromRange` L144-177 + its `describe` block in `viewport.test.ts`)
- **Finding:** `viewportFromRange` is now DEAD in live code — it was the D1-mode "seed on the most-recent day of a picked range" helper, superseded by `seedViewportToday`. Grep finds no live caller (only its own def, its test, and jsdoc mentions). It's still exported + unit-tested, so it reads as live and a future reader spends time reconciling two seed functions. Debt introduced BY this rework (the model swap left the old seed helper carried forward).
- **Fix shape:** delete `viewportFromRange` + its `describe` block (clarifies `seedViewportToday` is the sole seed path). Harmless if left; pure clarity.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6B4-RANGEPICKER-STALE-HEADER
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/RangePicker.tsx` (file header L1-16)
- **Finding:** The file header still describes the superseded WP6b-2 model ("single day OR arbitrary multi-day span … which the Phase-2 multi-day timeline renders", "≤31 days — D3"). The component is now the D8 REACTIVE framed-span readout of a continuous camera + `MAX_RANGE_DAYS=30`. Header prose predates the re-spec and will mislead the next reader about what drives the picker. (The `MAX_RANGE_DAYS` jsdoc at :22-24 is already correct — only the top-of-file block drifted.)
- **Fix shape:** two-line header update to the D8 reactive-readout model + 30-day cap.
- **Priority:** low.
- **Status:** pending.

# m9-wp6b-3-week-nav — 2026-07-14

*(feature-review-quality on the WP6b-3 working-tree change [Week-nav: backend `QueryWindow::Week` monday anchor + frontend weekMath/WeekNav/GlobalDashboard wiring + the F12 empty-period nav-trap class fix; uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all auto-backlogged [low]. Reviewer: well-built, tightly-scoped; correct anchor design + sound F12 fix; only debt is MINOR duplication, appropriate for backlog not a refactor pass.)*

## SURFACE-2026-07-14-QUALITY-WP6B3-WEEKNAV-MONTHNAV-DUP
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/Chrome.tsx` (`WeekNav` L254-326 vs `MonthNav` L171-246)
- **Finding:** `WeekNav` is a near-verbatim copy of `MonthNav` — the `arrowStyle` closure, container `<div>` styling, and both `<button>` blocks are duplicated, differing only in `data-*` attr names, titles, `minWidth` (100 vs 116), and the `data-month-iso` span attr. ~60 duplicated lines that will drift under future styling changes.
- **Fix shape:** extract a shared `NavPill`/`ArrowNav` primitive parameterized on the data-attr prefix + label; collapse both `MonthNav` + `WeekNav` onto it. (Also relevant to any future Day-nav-pill unification.)
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-14-QUALITY-WP6B3-WEEKMATH-MONTHMATH-HELPER-DUP
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/weekMath.ts` (L150-174 `dateToIso` + `mondayIdx`)
- **Finding:** `dateToIso` + `mondayIdx` are byte-identical private re-implementations of `monthMath.todayDateIso` / `monthMath.mondayIndex` (both already `export`ed). The "keep this module's import graph flat" rationale is weak — `GlobalDashboard.tsx` already imports from both `monthMath` and `weekMath`, so a cross-import adds no new edge. Divergent copies of a date-format helper are a latent inconsistency risk.
- **Fix shape:** import the existing `monthMath` exports instead of re-implementing (or, if a shared `dateMath.ts` is warranted once WP6b-4 lands more date helpers, extract there).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-14-QUALITY-WP6B3-ISFUTUREMONDAY-GUARD-CLARITY
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/weekMath.ts` (`isFutureMonday` L226-229)
- **Finding:** The parsed `d` is used only as a validity guard (`if (!d) return true`) then discarded — the actual comparison is the lexicographic `mondayIso > mondayOfDate(now)`. Correct + documented, but the parse-then-ignore reads as if `d` should participate in the compare.
- **Fix shape:** replace `const d = isoToDate(mondayIso); if (!d) return true;` with `if (!isoToDate(mondayIso)) return true;` (guard-only, no bound var), OR add a one-line comment that `d` is a validity guard only. Cosmetic clarity, no behavior change.
- **Priority:** low.
- **Status:** pending.

# m9-wp6b-2-week-month-sidepanel-range (Phase 4) — 2026-07-14

*(feature-review-quality on the WP6b-2 Phase-4 working-tree change [SidePanel + click-to-select seam; uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — both auto-backlogged [low]. Reviewer: clean, well-disciplined render-surface port; no refactor warranted. Both MINORs are polish/awareness, not correctness.)*

## SURFACE-2026-07-14-QUALITY-WP6B2P4-CLEAR-PIN-NOT-SCOPED
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/__tests__/dashboardWiring.test.ts` (the WP6b-2 P4 "clears it on view-switch, day-change, and close" pin)
- **Finding:** The pin asserts `setSelectedSegId(null)` appears (bare whole-file substring) + `onCloseSidePanel={() => setSelectedSegId(null)}` once, but does NOT distinguish the `changeView` clear from the `changeDay` clear (both are bare `setSelectedSegId(null)` lines). A regression that dropped the clear from *one* of `changeView`/`changeDay` would still leave the substring present → the pin passes silently.
- **Fix shape:** assert the `setSelectedSegId(null)` clear within each handler's source slice (`changeView` block + `changeDay` block separately), the way the Day-view-only pin already slices the `WeekView`/`MonthViewContainer` blocks to assert `<SidePanel>` is absent from each. One-test tightening.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-14-QUALITY-WP6B2P4-WALLTIME-QUANTIZATION-BASIS
- **Severity:** MINOR (doc/awareness only)
- **File:** `src/components/workspace/dashboard/SidePanel.tsx` (L65 `wallTime = Math.max(0, session.end - session.start)`)
- **Finding:** `wallTime` uses the minute-quantized session endpoints, so the "active of Xh Ym wall" denominator + the mini-timeline seg span are on a MINUTE grid, while the numerator (`sumActive`) is true-`dur_ms`. For a sub-minute session this reads "0m active of 0m wall". This is FAITHFUL + internally consistent for POSITIONING (the mini-timeline positions legitimately live on the minute grid, matching the main timeline's `viewportPct`), NOT a defect.
- **Fix shape:** none needed. Recorded only so a future reader doesn't "fix" the mini-timeline to a `dur_ms` basis + break the wall-relative layout (the positions MUST stay on the minute grid to align with the main timeline). If the wall FIGURE (not the positions) ever needs sub-minute precision, sum `dur_ms` across the session's segs for the denominator label only — but leave the positioning math alone.
- **Priority:** low (awareness; likely a no-op / won't-fix).
- **Status:** pending.

# m9-wp6b-1-interactive-viewport-minimap — 2026-07-13

*(feature-review-quality on the WP6b-1 working-tree diff [uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 1 MAJOR / 3 MINOR — all auto-backlogged. Reviewer: well-built, above-bar; pure math core under a single-writer clamped context, 3 source-bug fixes each test-guarded, both in-cycle verify-human regressions fixed at the right layer. Only structural debt is the duplicated RAF/scheduleSet machinery. No refactor auto-invoked — MAJOR is a dedup opportunity, not a CRITICAL.)*

## SURFACE-2026-07-13-QUALITY-WP6B1-DUP-RAF-SCHEDULESET
- **Severity:** MAJOR
- **File:** `src/components/workspace/dashboard/useTimelineGestures.ts` (L63-83) & `src/components/workspace/dashboard/Minimap.tsx` (L68-84)
- **Finding:** The `scheduleSet` RAF-coalescing helper (functional-updater form, cancel-and-reschedule) + the unmount-cancel `useEffect` are **duplicated byte-for-byte** across both gesture consumers. This is the load-bearing "one write per frame + no leak on unmount" mechanism (the exact code the spec calls out as a source-bug fix) living in two places — a future throttling-policy change must be made twice + the copies can silently drift.
- **Fix shape:** extract a small `useRafViewportSetter()` hook (owns the `rafRef` + the unmount-cancel effect; returns a `scheduleSet` bound to the context setter). Collapse both call sites onto it. Gives the invariant a single home.
- **Priority:** medium.
- **Status:** pending.

## SURFACE-2026-07-13-QUALITY-WP6B1-DAYTIMELINE-DOC-MIXED-VIEWPORT
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/DayTimeline.tsx` (L826-834, the DayTimeline docstring)
- **Finding:** The docstring says the viewport is "passed DOWN as a plain `viewport` prop," but `HourRuler`/`HourGridBackground` now read `useViewport()` directly (they also need the adaptive interval) while `SegmentBar`/overlap/collapsed rows still take a `viewport` prop. The mixed convention is defensible but the doc understates it — a reader trips on why two sibling patterns coexist.
- **Fix shape:** one clarifying sentence in the docstring (ruler/grid read context for the interval; leaf seg-renderers take the prop).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-13-QUALITY-WP6B1-MINIMAP-STOPPROP-COMMENT
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/Minimap.tsx` (L126-128)
- **Finding:** The `stopPropagation()` comment claims it prevents "the timeline's gesture handler from also reacting," but the Minimap is a SIBLING of DayTimeline (not nested) and fires on `mousedown` vs the timeline's `pointerdown` — cross-handler propagation isn't the actual mechanism. The call is harmless (`preventDefault` suppresses text-selection), but the stated *why* is inaccurate + misleads the next editor about the surfaces' coupling.
- **Fix shape:** correct the comment (the effective purpose is text-selection suppression via `preventDefault`; `stopPropagation` is belt-and-suspenders, not the timeline-decoupling mechanism).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-13-QUALITY-WP6B1-DERIVEDATAWINDOW-UNUSED-PARAM
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/viewport.ts` (L82-85, `deriveDataWindow`)
- **Finding:** `deriveDataWindow(_data: RangePayload)` ignores its param entirely (eslint-disabled unused-var) "for signature stability / forward-compat." Speculative generality — the single caller could pass nothing today; the forward-compat variant can add the param when it actually exists.
- **Fix shape:** either drop the param (caller updated) or leave as-is if a padded-relative-to-`hour_range` variant is genuinely near-term. Low-grade YAGNI; not worth churn on its own — fold into a future refactor pass.
- **Priority:** low.
- **Status:** pending.

# m9-wp6.5-session-termination-model — 2026-07-08

*(feature-review-quality on the WP6.5 working-tree diff [uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — all auto-backlogged, priority low. Reviewer: well-built feature that advances the codebase; read-time-capping architecture + P1.2 idle-gap correction + D3 precedence all hold up under reading; comprehensive coverage. Only 2 minor observations — no refactor warranted.)*

## SURFACE-2026-07-08-QUALITY-WP6.5-DANGLING-CLONE-PER-SESSION
- **Severity:** MINOR
- **File:** `src-tauri/src/reclassify/mod.rs` (`dangling_sessions`, ~L715)
- **Finding:** Per candidate session, clones the entire event slice (`evs.iter().map(|e| (*e).clone()).collect()`) purely to satisfy `authoritative_end`'s `&[EventRow]` signature, then only scans for two event-name matches. An avoidable O(events) allocation on the startup reconciliation path (which reads the whole table). Negligible at current DB scale.
- **Fix shape:** change `authoritative_end` to take `&[&EventRow]` (or a generic `IntoIterator`) so the clone drops; update its one other caller (`build_viz_session` passes an owned slice already — check both).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP6.5-FIRST-GAP-WINS-IMPLICIT
- **Severity:** MINOR
- **File:** `src-tauri/src/reclassify/mod.rs` (`resolve_session_end` level-2 loop, `return prev;`)
- **Finding:** The cap loop returns at the FIRST oversized idle gap — correct per D3 ("a session ends once"), but the "long idle → genuine resumed active burst → idle again" shape (session cut at the first gap, discarding a later real burst) has no test or comment. Load-bearing choice left implicit.
- **Fix shape:** add a one-line comment at `return prev;` stating "first oversized idle gap wins even if activity resumes (D3: a session ends once; real resumes are covered by SessionEnd/reconciliation)" + optionally a pinning test.
- **Priority:** low.
- **Status:** pending.

# m9-wp6a-day-view-dashboard — 2026-07-08

*(feature-review-quality on the WP6a working-tree diff [uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all auto-backlogged, priority low. Reviewer: well-built feature that advances the codebase; the 4065-line-source port was executed as specced, both scrutinized design decisions [overlap per-project scoping; CM6 lazy boundary below the eager ref handle] hold up under reading. Only cosmetic findings — no refactor warranted.)*

## SURFACE-2026-07-08-QUALITY-WP6A-DAYSTATS-DOUBLE-SUMACTIVE
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/dayStats.ts` (~L60-62)
- **Finding:** `computeDayTotals` calls `sumActive(segs)` twice per session (`active += sumActive(segs)` then a separate `const sessActive = sumActive(segs)`). A trivial redundant filter+reduce; harmless (day payloads are small).
- **Fix shape:** hoist to one `const sessActive = sumActive(segs); active += sessActive;`.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP6A-EDITORPANEL-DEAD-EMPTY-BRANCH
- **Severity:** MINOR
- **File:** `src/components/workspace/editor/EditorPanel.tsx` (~L249-250)
- **Finding:** The `openPath == null → <EditorEmpty/>` branch is now dead in the shipped wiring: PaneTabs renders `<EditorEmpty/>` directly for the empty pane and only mounts the lazy EditorPanel for a non-null `tab.path`. Defensive-but-unreachable — a future reader may assume EditorPanel still renders the empty pane.
- **Fix shape:** add a one-line "defensive-only; PaneTabs owns the empty case" comment (or drop the branch). `lazyBundleWiring.test.ts` already guards the regression.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP6A-ONOPENDASHBOARD-PROP-ASYMMETRY
- **Severity:** MINOR
- **File:** `src/components/workspace/Filmstrip.tsx` vs `src/components/picker/ProjectPicker.tsx`
- **Finding:** `onOpenDashboard` is a REQUIRED prop on `Filmstrip` but OPTIONAL (`?`) on `ProjectPicker`, though App.tsx always threads it to both. The picker guards its button with `{onOpenDashboard && …}`; the filmstrip does not. Inconsistent prop contracts for the same affordance (not wrong — picker button optional-by-design for test callers).
- **Fix shape:** align the two (both required, or both optional-with-guard) or add a one-line comment noting why they differ.
- **Priority:** low.
- **Status:** pending.

# m9-wp5-tracking-toggle — 2026-07-08

*(feature-review-quality on the WP5 working-tree diff [uncommitted per commit-only-when-asked; HEAD `6bdca6f`]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — all auto-backlogged, priority low. Reviewer: well-built, low-risk feature — faithful mirror of the pip_mode/cc_permission_mode trio, single-hook-point gate discipline held, drain-safety degrade-to-OFF tested at the seam, event-name contract pinned both IPC sides. The 2 MINORs are an intrinsic auto-tier blind spot + a naming footgun.)*

## SURFACE-2026-07-08-QUALITY-WP5-GATE-BODY-APPHANDLE-HOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`tracking_enabled(app)` ~1088-1094)
- **Finding:** The gate's own body — the `resolve_data_dir(app)` → `read_time_tracking_enabled(&dir).unwrap_or(false)` hop — is not unit-covered. Every gate test exercises `read_time_tracking_enabled` directly ("same code path, minus the app→dir hop"); the hop itself (the one line WP5 added to the gate) is proven only at bridge verify-self. A regression in the resolve-then-read wiring (e.g. a wrong data-dir resolver) would pass the auto-tier suite.
- **Fix shape:** intrinsic AppHandle-constructability constraint — a unit test can't build an AppHandle. Options: (a) accept it (live verify-self covers it, as done); (b) if a future test-seam for AppHandle-bound commands materializes, add a gate-body test then. No action needed now; on record so the blind spot is known.
- **Priority:** low (live-verified; auto-tier blind spot only).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP5-SETTER-UNDERSCORE-FOOTGUN
- **Severity:** MINOR
- **File:** `src/components/picker/ProjectPicker.tsx` (~90, + call sites in the seed effect + `handleToggleTracking`)
- **Finding:** The React state setter is named `setTimeTrackingEnabled_` (trailing underscore) solely to avoid colliding with the imported IPC wrapper `setTimeTrackingEnabled`. Reads as a typo at call sites; a future editor could "fix" the underscore and break the build.
- **Fix shape:** alias the import for clarity — e.g. `import { setTimeTrackingEnabled as persistTimeTracking }` — then the state setter can take the clean `setTimeTrackingEnabled` name. Cosmetic, low effort. One `/feature-refactor` fix-site.
- **Priority:** low (cosmetic footgun).
- **Status:** pending.

# m9-wp4-segment-model-query-layer — 2026-07-08

*(feature-review-quality on ship commit `d8b308e`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all auto-backlogged, priority low. Reviewer: well-built phase — correctly re-expresses the transform against WP3's 6-kind enum, lands both carried MAJOR reclassify findings with genuine pinning tests, DTO/serde pinned both IPC sides, debt minimal + honestly tracked. The 4 MINORs are boundary edges + one drift-risk duplication + a possibly-dead contract field.)*

## SURFACE-2026-07-08-QUALITY-WP4-DUP-TZ-MATH-HELPERS
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (~483-505) vs `src-tauri/src/time_store/query.rs` (`local_midnight_ms`/`local_date_of`)
- **Finding:** `local_midnight_ms_of`/`local_date_of_ms` in commands.rs are near-verbatim copies of the query module's `local_midnight_ms`/`local_date_of` (same DST-earliest-else-latest-else-UTC fallback). The comment justifies the copy ("keep the query API surface minimal") but two copies of tz-boundary math drift silently when one is later patched for a DST edge and the other isn't.
- **Fix shape:** `pub(crate)`-export the query helpers and drop the commands.rs copies (one fix-site). The API-surface cost is lower than the divergence risk. **This is the one MINOR worth addressing before drift.**
- **Priority:** low (no current bug; drift-prevention).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP4-DAYPAYLOAD-EMPTY-NOT-ON-IPC-SURFACE
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`DayPayload.empty` ~114-127; `build_range` single-day path ~503-519)
- **Finding:** `DayPayload` carries `empty: Some(true)`, but `build_range`'s single-day path propagates only `iso`/`hour_range` (drops `empty`), and the command returns only `TimeAnalyticsResult::Range(RangePayload)` — which has no `empty` field (nor does the FE `RangePayload`). So a WP6 day-query consumer can't read the empty-day hint; it must infer emptiness from `projects.is_empty()`. Either the flag is dead on the IPC path (its test only exercises the internal `DayPayload`) or WP6 needs it surfaced on `RangePayload`.
- **Fix shape:** a deliberate WP6-facing decision — surface `empty` on `RangePayload`, OR document that WP6 infers emptiness from `projects.is_empty()` and the `DayPayload.empty` flag is internal-only. Decide while the shape is fresh.
- **Priority:** low (WP6-facing contract decision).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP4-AI-BUSY-COMPUTED-TWICE
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`segments_for_window` ~255-273)
- **Finding:** `segments_for_window` computes `ai_busy_intervals(events)` directly for the AI half, then calls `human_segments_for_window` which recomputes `ai_busy_intervals` internally for the complement — the AI-busy set is walked twice per session window. Correct, harmless at current row volumes.
- **Fix shape:** if session windows ever get large, thread the computed busy-set into the human tiler (or note as a known redundancy). No action needed now.
- **Priority:** low (perf, negligible at current scale).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP4-CUSTOM-WINDOW-MIDNIGHT-EXTRA-DAY
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`resolve_window` Custom arm ~462-467)
- **Finding:** a Custom window whose `end_ms` lands exactly on a local midnight → `rows_in_window` excludes that instant (half-open `ts < end`) while `end_day = local_date_of_ms(end_ms)` resolves to the next day, so `build_range` emits one extra all-empty trailing day. Cosmetic; untested at the boundary.
- **Fix shape:** clamp `end_day` back by one when `end_ms` is exactly local-midnight, or add a boundary test documenting the artifact.
- **Priority:** low (cosmetic range-widget edge).
- **Status:** pending.

# mirror-fill-from-bottom — 2026-07-06

*(feature-review-quality on ship commit 99aca94; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, tightly-scoped fix at the shared seam; correctness verified against the vendored xterm source. One MINOR (count-drift typo) was fixed in-place; the two below are auto-backlogged. None warrant a refactor pass.)*

## SURFACE-2026-07-06-QUALITY-MIRRORTRIM-LOSSY-RECONSTRUCTION
- **Severity:** MINOR
- **File:** `src/components/workspace/mirrorTrim.ts` (~77-92, the `rows.match(ROW_RE)` + `rows.slice(0, end).join("")` rebuild)
- **Finding:** The block is reconstructed by re-joining matched `<div>…</div>` rows, which silently drops any inter-row text that isn't a row match. Safe today because `@xterm/addon-serialize`'s `_rowEnd` emits rows contiguously (nothing between them), but the reconstruction is lossier than the prefix/suffix splice implies. The module's "return input unchanged on structural surprise" contract mitigates changes it *detects*, not this silent one — if a future xterm interleaved row separators, surviving rows would be re-joined without them.
- **Fix shape:** documentation-hardening — add a one-line header-comment note that reconstruction assumes zero inter-row content. No behavior change needed today.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-06-QUALITY-MIRRORTRIM-FIXTURE-REALISM
- **Severity:** MINOR
- **File:** `src/components/workspace/mirrorTrim.ts` (~32, 36-37 comments) + `src/components/workspace/__tests__/mirrorTrim.test.ts` (fixtures)
- **Finding:** The fixtures + comments use the simple `<div><span>text</span></div>` row shape, but real styled CC output produces intra-row `</span><span style='…'>` transitions (from xterm's `_nextCell` style diffs). The non-greedy `ROW_RE` handles the styled shape correctly (spans close with `</span>`; the first `</div>` still wins), so this is not a correctness gap — but the test fixtures under-represent the actual serializer output, which is a future-reader trap.
- **Fix shape:** add one styled-multi-span row fixture to `mirrorTrim.test.ts` documenting the real case; optionally soften the "spans hold text only" comment to acknowledge multi-span rows.
- **Priority:** low.
- **Status:** pending.

# cc-permission-mode-dropdown — 2026-07-02

*(feature-review-quality on ship commit 1624e2e; Mode 2 orchestrated. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, advances the codebase; wire contract + migration are the standouts. None warrant a refactor pass.)*

## SURFACE-2026-07-02-QUALITY-CCMODE-DEFAULT-ARGV-NOOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/cc_session/mod.rs` (~205, `build_cc_argv`)
- **Finding:** `Default` now emits an explicit `--permission-mode default` (vs. the old bare `["claude"]`); the "harmless no-op" claim in the doc comment is load-bearing but rests on an untested CC-CLI behavioral assumption. The argv unit test pins the mapping, not the behavioral equivalence.
- **Fix shape:** documentation-hardening — note that the equivalence is a verify-human/release check (live spawn IS verify-human-covered; it passed 2026-07-02). No code change strictly needed.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-02-QUALITY-CCMODE-SELECT-A11Y-NAME
- **Severity:** MINOR
- **File:** `src/components/picker/ProjectPicker.tsx` (207-222)
- **Finding:** the `<select>`'s accessible name comes only from implicit label-nesting (`<label><span>Permission mode</span><select>…</label>`), no `htmlFor`/`id` or `aria-label`. Works today; would silently lose its name if the markup is refactored.
- **Fix shape:** add an explicit `aria-label="Permission mode"` on the `<select>` (or a label testid + `htmlFor`).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-02-QUALITY-CCMODE-BARE-DOC-COMMENTS
- **Severity:** MINOR
- **File:** `src-tauri/src/cc_session/mod.rs` (~55-70, `CcPermissionMode` variants)
- **Finding:** `Auto` / `DontAsk` doc comments are bare restatements ("CC's `auto` mode") vs. the semantic WHY the `Default`/`Plan`/`AcceptEdits`/`BypassPermissions` comments carry.
- **Fix shape:** enrich with the semantic distinction, or drop to match the enum's self-documenting naming.
- **Priority:** low.
- **Status:** pending.

# m5-wp5-pip-toggle-lifecycle-autosummon — 2026-06-27

*(feature-review-quality on ship commit f6e3929; Mode 3 autopilot auto-backlog. 0 CRITICAL / 2 MAJOR / 2 MINOR.)*

## SURFACE-2026-06-27-QUALITY-WP5-PIPMODE-STATE-DUP-PER-WORKSPACE
- **Severity:** MINOR
- **Finding:** `RightPanelHost.tsx:136-159` — the `pipMode` state + `pip_get_mode` fetch + `pip-mode` listener are duplicated per RightPanelHost instance (one per mounted workspace), so at N workspaces there are N redundant IPC fetches + N subscriptions for one app-global value. The inline comment acknowledges it's "fine per-RightPanelHost," but it's avoidable at the N>1 the milestone targets.
- **Fix shape:** lift `pipMode` to App-level state (fetched + subscribed once), passed down as a prop — mirroring how `tiles` is derived once in App. Low effort.
- **Priority:** low.
- **Status:** pending — DEFERRED at debt-paydown WP4 (operator, 2026-06-30), anchored to **M9**. The per-`RightPanelHost` `pip-mode` subscription is the project's INTENDED "all surfaces subscribe to the same backend broadcast" pattern (PiP mode is already an app-global View-menu radio, backend = single source of truth via `pip_set_mode`/`pip_get_mode` + the `pip-mode` event), not a missing-app-state bug — the only real cost is N-1 redundant `pip_get_mode` mount fetches. M9's time-tracking toggle follows the same backend-command + `*-mode`-broadcast + per-consumer-subscribe shape, so there is no shared app-settings store to build once-vs-twice. Fold the dedup into M9's settings work IF an app-settings hook materializes there; else it stays the documented pattern.

# qol-wp1-close-workspace — 2026-06-25

3 MINOR findings (0 CRITICAL, 0 MAJOR) from `feature-review-quality` on ship commit `c01a3f9`. Reviewer rated the feature well-built and idiomatic — the standout being the per-pane `cc_kill`-on-unmount that reaps both PTY panes generically and closes a latent WP7 lifecycle gap. All findings are low-risk: two over-narrated comments + one accepted test-boundary gap. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-25-QUALITY-WP1-APP-WIRING-UNTESTED
- **Files:** `src/components/workspace/Filmstrip.tsx`, `src/App.tsx` (requestClose / resolveClose / dirty-probe registry)
- **Priority:** low
- **Status:** pending
- **Type:** test-coverage gap
- **Finding:** Only the pure layer (reducer, `dirtyDocCount`, `closeWorkspaceSpec`) is unit-covered. No component test for the × (stopPropagation routing, keyboard Enter/Space) and no App-level test for the probe-registry / focus-repick wiring. Accepted boundary per the project's manual-host-UI convention + the live 9/9 operator verification — but the App wiring (`requestClose` reading the `workspaces` closure, `resolveClose` clearing `pendingClose`) is the part most likely to regress silently.
- **Pickup shape:** if/when the project adopts a component-test harness (RTL) or E2E (deferred per Phase-1 convention), add a Filmstrip-×-routing test + an App close-handler test. Low value until then; dismiss if the manual-verification posture holds.

# app-menu-bar — 2026-06-24

1 MAJOR + 2 MINOR from `feature-review-quality` on ship commit `f815154` (0 CRITICAL). Reviewer rated the feature well-built, appropriately-scoped, adds zero new behavior, integrates through existing chord predicates. The MAJOR is the one real durability concern: an unguarded cross-language id contract. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-24-QUALITY-APPMENU-LISTENER-NOT-EXTRACTED
- **Files:** `src/App.tsx:120-160` (the `menu` listener effect)
- **Priority:** low
- **Status:** pending
- **Type:** testability (consistent with standing posture)
- **Finding:** The `menu` listener body (id→action mapping, key re-dispatch, the 4 callback branches with the focused-path-ref lookup) lives inline in `App()` — the one piece of menu logic not extracted to a pure testable seam (unlike `menuBridge`). Extracting the action-dispatch (given an action + a small effects object) would let the callback-vs-key branching be unit-tested. LOW priority — consistent with the repo's "runtime-bound listeners are not unit-tested" posture (XtermPane, useWorkspaceStatus); the pure `menuBridge` mapping IS fully tested, which is the higher-value half.
- **Pickup shape:** optional extraction of a pure `dispatchMenuAction(action, effects)` + its unit test. Defer unless the listener grows.

# m3-wp2-hook-install — 2026-06-22

4 MINOR findings from `feature-review-quality` on ship commit `77d6a6e` (0 CRITICAL, 0 MAJOR). Reviewer rated it well-built and defensively-minded for a dangerous operation (mutating a shared user `settings.json`); standout test suite (real-config shape + byte-exact round-trip + never-wipe-on-parse-failure). No refactor warranted; all cosmetic/opportunistic. Auto-backlogged per drive_mode=autopilot.

## SURFACE-2026-06-22-QUALITY-WP2-MINORS
- **Files:** `src-tauri/src/hook_install/commands.rs:42` + `mod.rs:78`; `src-tauri/resources/claudesk-hook.pl:66`; `src-tauri/src/hook_install/mod.rs:101`; `src-tauri/src/lib.rs:62`
- **Priority:** low (all)
- **Status:** PARTIAL — #2 (Perl write-side blocking) RESOLVED (the WP3 listener drains promptly) and #4 (stale `sublime_open` "removed at WP8" comment) RESOLVED 2026-06-30 (debt-paydown WP5): the `lib.rs` `sublime_open` registration comment now states the WP8-redefinition permanent-escape-hatch reality (in-app editor primary, Sublime Text stays one-click, `⌘⇧O` dropped) instead of "Transitional — removed at WP8." #1 (chmod/invocation mismatch — a behavior decision) + #3 (`NotAnObject` error-variant coarseness — an error-enum refactor) remain as genuine deferrables.
- **Findings:**
  1. **chmod/`/usr/bin/perl` mismatch** — the registered command runs `/usr/bin/perl <script>` (not `<script>` directly), so the `chmod 0o755` in `deploy_hook_script` + the script's shebang are never exercised; the `commands.rs`/`mod.rs:78` comment "CC invokes it directly" is inaccurate. Either drop the chmod (dead effort) or invoke the script directly. *(Mild — keeping chmod is harmless future-proofing if the command form ever changes; pick one and reconcile the comment.)* **— PARTIALLY ADDRESSED 2026-06-22 (commit 99a48d5):** the related "shell-form is fine, paths are app-controlled" assumption was the leading edge of a real word-split bug (spaced app-data path) — now fixed (paths shell-quoted). The chmod-vs-invocation cosmetic mismatch itself remains open (low pri).
  3. **`NotAnObject` error-variant coarseness** — three distinct shape failures (root not object, `hooks` not object, an event value not an array) all collapse to one variant (`mod.rs:101`); a malformed `hooks.<event>` array value yields the misleading "root is not a JSON object" message. Opaque-string-to-toast, low impact; a future debugger would be misdirected.
- **Pickup shape:** both remaining nits are quick opportunistic `/feature-refactor` fixes. Dismiss any via the WIP's `## Code-Quality Review` section.

# m2-wp2-editor-shell — 2026-06-19

2 MAJOR + 3 MINOR findings from `feature-review-quality` on ship commit `a84f3e9` (0 CRITICAL). Feature rated "advances the codebase rather than accruing debt." Auto-backlogged per drive_mode=autopilot (MAJOR → Case B, MINOR → low). The two MAJORs are the load-bearing ones (backend root-trust seam + a doc/behavior security-invariant mismatch), both flagged as Phase-2-hardening candidates, neither refactor-blocking.

## SURFACE-2026-06-19-QUALITY-WP2-RESOLVE-WITHIN-LEAF-SYMLINK
- **File:** `src-tauri/src/editor_fs/mod.rs:45-90` (`resolve_within`)
- **Finding:** Canonicalizes only the target's *parent* and re-attaches the leaf un-canonicalized; a symlink whose *leaf* points outside the workspace root is NOT rejected (read/write follow it), yet the module doc (lines 17-22, 50-52) claims "a symlink inside root pointing outside is also rejected." Doc overclaims an invariant the code doesn't fully enforce.
- **Why it matters:** A future reader trusts "invariant not convention" and won't re-audit. Low exploitability (single-user local tool, user picks in-project files) but the doc/behavior mismatch is the debt.
- **Suggested action:** Canonicalize the resolved target when it exists and re-check `starts_with(root_canon)`; OR downgrade the doc claim to match. Pairs with the Phase-2 backend-hardening item below.
- **Priority:** medium
- **Status:** PARTIAL (D2, debt-paydown WP5, operator decision 2026-06-30) — DOC downgraded now, HARDENING deferred. The `editor_fs` module header + `resolve_within` doc were narrowed to state the actual guarantee: a non-leaf (directory-component) symlink escaping root IS rejected (parent canonicalize), but a LEAF symlink is NOT followed-and-validated; the over-claim is gone. The actual fix (canonicalize the full target when it exists) stays **Deferred** to a future hardening pass (anchored here), NOT done this sweep.

## SURFACE-2026-06-19-QUALITY-WP2-BACKEND-TRUSTS-FRONTEND-ROOT
- **File:** `src-tauri/src/editor_fs/commands.rs:18-26` (`read_file`/`write_file`)
- **Finding:** Both commands take `root: String` straight from the frontend with no app-side derivation, unlike `config_store`'s commands which resolve `app_data_dir()` server-side. The "confined to the open project" guarantee rests entirely on the renderer passing a correct `projectPath` — the trust boundary for the root guard lives in the webview, not the backend.
- **Why it matters:** Phase 2 (multi-workspace) multiplies the IPC callers and surface; this is the seam to tighten before more callers depend on it. Acceptable for the single-user PoC today.
- **Suggested action:** Consider having the backend validate `root` against the known project list (config_store) before honoring it, so a malformed/hostile root can't widen the guard. Pairs with the leaf-symlink item above (same module, same Phase-2 hardening pass).
- **Priority:** medium
- **Status:** PARTIAL (D2, debt-paydown WP5, operator decision 2026-06-30) — DOC stated now, HARDENING deferred. The `editor_fs/commands.rs` module doc now explicitly says `root` is frontend-supplied/-trusted (not re-validated against config_store) — acceptable for the single-user local editor where the frontend shares the trust boundary; the guard's job is to confine the *file path* to `root`, not authenticate `root`. The actual validate-`root`-against-config_store hardening stays **Deferred** to a future pass (anchored here, pairs with the leaf-symlink item above).

# file-op-error-surface (Deferred — net-new UX) — 2026-06-30

## SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE
- **Severity:** MINOR (deferred — net-new UX, not debt)
- **Finding:** Right-panel file operations fail silently: a failed `delete_file` (WP5), a failed folder `trash_path` (WP5b), and a create that collides with a gitignored file like `.env` (WP5, silent overwrite) are all swallowed to `console.error` with no user-visible surface. RightPanelHost has NO toast/inline-error component — the existing code comments already say "a future toast could show it" / "would be new UX — intentionally [deferred]".
- **Why deferred (operator ruling, debt-paydown sweep #2, 2026-06-30):** building the error surface is net-new UX, not a debt sweep — it needs a toast/inline-error component in RightPanelHost that does not exist. Honor the recorded "intentionally deferred" intent. The three original findings (WP5-DELETE-FAILURE-NOT-SURFACED, WP5B-TRASH-FAILURE-NOT-SURFACED, WP5-CREATE-COLLISION-GITIGNORE) collapse into this one anchor — one error-surface feature closes all three.
- **Anchor:** a future error-surface feature (whenever RightPanelHost gains a toast/inline-error affordance).
- **Status:** DEFERRED (anchored — net-new UX)

# m9-wp2-absorbed-hook-write-gated-sqlite-writer — 2026-07-07

*(feature-review-quality on ship commit dc3b89e; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built feature landing a tricky change — teeing a single-consumer stream into two independent drains while holding the M3 status path byte-for-byte constant — with invariants defended by construction + test-pinned. All findings MINOR polish; nothing warrants a refactor pass.)*

## SURFACE-2026-07-07-QUALITY-PRIVACY-TEST-COINCIDENTAL-SUBSTRING
- **Severity:** MINOR
- **File:** `src-tauri/tests/hook_pl_output.rs` (~124, the `!s.contains("SECRET")` privacy leak assertion)
- **Finding:** The privacy leak assertion checks `!s.contains("SECRET")` against a hardcoded literal, while the injected prompt is `"SUPER SECRET PROMPT…"`. The test only catches a leak because the operator happened to embed the substring `SECRET` in the prompt — it does not assert against the actual `secret` variable. A future author who changes the prompt string could silently weaken this to a no-op guard.
- **Fix shape:** compare against the real `secret` value (or a distinctive sentinel derived from it) so the privacy check is self-consistent regardless of the prompt string.
- **Why it matters:** the privacy invariant is the feature's most important contract; its end-to-end test should not depend on a coincidental substring.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-TS-SILENT-EPOCH-FALLBACK
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/mod.rs` (~123, `ts` falls back to `0` when `HookEvent::timestamp` is absent)
- **Finding:** `ts` defaults to `0` on an absent `HookEvent::timestamp`. Unreachable today (the production Perl hook always stamps `timestamp`), but a `ts=0` row sorts to the epoch and could corrupt WP3's time-ordered reclassification if any non-hook source (WP2.5 native signals) ever forgets to stamp. The `source`-discriminator design explicitly anticipates a second writer.
- **Fix shape:** a debug-log or a `None`-drop on absent timestamp — cheaper guard than a silent 0. Consider closing during WP2.5 (native signal source) when the second writer lands.
- **Why it matters:** a load-bearing ordering key silently defaulting to a sentinel is a latent data-quality trap for the downstream consumer this feature exists to feed.
- **Priority:** low.
- **Status:** pending — **WP2.5 update (2026-07-07):** the second writer (native signals) landed and uses `now_ms()` (a real `SystemTime` epoch-ms), so it NEVER hits this fallback — the "if WP2.5 forgets to stamp" risk this finding anticipated did NOT materialize. But the finding stands as-is: it's about the **CC-hook** `event_to_row` path (`ts` from `HookEvent::timestamp`), which WP2.5 did not touch. Still low-priority pending for a future guard.

## SURFACE-2026-07-07-QUALITY-SCHEMA-COLUMN-VS-META-ASYMMETRY
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/mod.rs` (~62, SCHEMA_SQL / the events table shape)
- **Finding:** `tool_name` and `agent_type` are first-class columns, but `source` (SessionStart) and `prompt_length_chars` (UserPromptSubmit) live inside the `meta` JSON blob. Faithfully mirrors claude-time (defensible), but WP3 must query two shapes (columns for some fields, JSON extraction for others).
- **Fix shape:** a one-line note in the schema doc-comment on *why* `tool_name`/`agent_type` earned columns while the others stayed in `meta` (query-frequency? claude-time parity?). Documentation nit; the shape is intentional.
- **Why it matters:** reduces WP3 onboarding cost.
- **Priority:** low.
- **Status:** pending.

# m9-wp2.5-claudesk-native-signal-source — 2026-07-07

*(feature-review-quality, uncommitted working-tree baseline; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, disciplined, no debt; privacy-by-closed-enum is the standout. One MINOR — stale Sublime "transitional" doc-comment — was FIXED INLINE at review time. The two below are auto-backlogged; both fold into one small readability pass on `time_set_active_context`. None warrant a refactor now.)*

## SURFACE-2026-07-07-QUALITY-ACTIVECTX-TRIPLE-LOCK
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (~197-204, `time_set_active_context`)
- **Finding:** The command locks the `SharedActiveContext` mutex three times (read-for-compare → `set_active_context` re-lock-and-write → re-lock-and-clone for the `ActiveSurface` emit). No TOCTOU/correctness risk — it's the sole writer and all `#[tauri::command]` fns run on the main thread (reviewer confirmed) — but the three-acquisition dance reads as if it were concurrency-sensitive.
- **Fix shape:** collapse to a single lock scope returning `(surface_changed, snapshot)`. Readability polish only.
- **Why it matters:** the signal path is re-touched in WP3/WP5; clearer code lowers that cost. Not a bug.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-ACTIVECTX-POISON-DISPOSITION
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (~197, the surface-change compare)
- **Finding:** The surface-change check swallows a poisoned lock as `unwrap_or(false)` (silently skip the `ActiveSurface` emit), while the immediately-following `set_active_context` surfaces the same poison as `Err`. Two dispositions for one lock in one function — both defensible for telemetry, but the asymmetry reads as an oversight.
- **Fix shape:** a one-line comment on the `unwrap_or(false)` ("poison here just skips the marker; the write below surfaces it"), OR fold into the single-lock refactor above (which removes the second acquisition entirely).
- **Why it matters:** trivial clarity; behavior is acceptable as-is. Folds with the triple-lock cleanup.
- **Priority:** low.
- **Status:** pending.

# m9-wp3-reclassifier-redesign — 2026-07-07

*(feature-review-quality on ship commit ebe9f31; Mode 3 autopilot. 0 CRITICAL / 2 MAJOR / 2 MINOR. Reviewer: well-built, carefully-scoped phase — pure-transform architecture + SSOT notification reuse + 1:1 scenario suite. The 2 MAJORs are untested behavioral edges at the classification boundary; WP4 should close them before the query layer trusts the tail of the stream. All auto-backlogged; none blocking.)*

## SURFACE-2026-07-07-QUALITY-WP3-TRAILING-OPEN-AWAIT-FALLS-TO-AWAY
- **Severity:** MAJOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~710, `awaiting_input_spans` — the unclosed-await drop at the session's last event)
- **Finding:** A still-open AwaitingInput span at the data tail is dropped ("conservative"), but the downstream effect is NOT conservative in the intended direction: an operator actively servicing a still-open prompt gets no working-credit in `classify_gap` branch 2 → falls through to branch 3 → **Away** instead of the intended capped-working. This is the most-recent slice any live dashboard renders (B2b/B4 — "doing the thing CC is blocked on right now"), so it directly undercuts the "measure, don't infer" headline. Unpinned by tests (no trailing-open-await fixture).
- **Fix shape:** bound an open await at the window end (or the last-known ts) instead of dropping it, and add a trailing-open-await test asserting capped-working (not Away). Natural WP4 tightening (WP4 owns the window bounds).
- **Priority:** medium (correctness edge on the freshest data slice; cheap fix; consume-before-trust for WP4/WP6).
- **Status:** RESOLVED (structurally) at M9 WP4 Phase 1 (2026-07-08). Fix landed: `awaiting_input_spans_bounded(events, window_end)` + `GapContext::build_with_window`; `human_segments_for_window` passes `Some(window_end)`; bare entry points keep the drop as a conservative fallback. Test `trailing_open_await_is_bounded_at_window_end_not_dropped` pins it. **NUANCE (WP4 discovery):** the finding's stated behavioral symptom ("→ Away") does NOT currently manifest — the operator LOCKED `SILENCE_CAP_MS == AWAY_THRESHOLD_MS` (both 10min), so branch 2 and branch 3 give the identical verdict for any silence level. The drop was a LATENT bug; the fix is kept as defensive correctness (decouples classification from the threshold-equality coincidence) and pins the structural guarantee rather than a spurious fixed-vs-dropped verdict divergence.

## SURFACE-2026-07-07-QUALITY-WP3-SURFACE-TIE-BREAK-ORDER-DEPENDENT
- **Severity:** MAJOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~879, `surface_is_editor_at`)
- **Finding:** The latest-surface scan's equal-ts tie-break favors the first-seen slice row (`Some((prev_ts,_)) if *prev_ts >= e.ts => {}` refuses to update on `==`), so two same-epoch-ms surface rows resolve by input order — which `group_by_session` explicitly documents is NOT guaranteed. A same-ms surface flip decides Typing-vs-Reviewing for a whole gap (an unstated input-order dependence, the confabulation-channel class the `Unvisited`-ordering convention guards against).
- **Fix shape:** last-wins on `>=` (or sort native rows by ts first, like the other helpers) + a same-ms tie-break test. One-line fix.
- **Priority:** medium (deterministic-classification correctness; trivial fix; untested at the tie).
- **Status:** RESOLVED at M9 WP4 Phase 1 (2026-07-08). `surface_is_editor_at` now collects all at-or-before candidates and sorts by `(ts, surface)`, taking the last — deterministic last-wins with a stable secondary key, so a same-ms flip no longer resolves by input order. Test `surface_tie_break_is_last_wins_same_ms` feeds both orderings and asserts an identical verdict.

## SURFACE-2026-07-07-QUALITY-WP3-SURFACE-HELPER-NOT-IN-GAPCONTEXT
- **Severity:** MINOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~879, `surface_is_editor_at` vs `GapContext`)
- **Finding:** `surface_is_editor_at` is the one hot-path helper not folded into `GapContext`; `human_segments_for_window` calls it once per gap → O(gaps × events) while every other per-gap input is precomputed once in `GapContext::build`. Harmless for a day-window; the place a WP6 month-view would first feel a scan cost, and inconsistent with the deliberate precompute design.
- **Fix shape:** hoist surface resolution into `GapContext::build` (e.g. a sorted surface-change vector + a point lookup).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-07-QUALITY-WP3-WORKING-CREDIT-PREDICATE-INLINE-RESCAN
- **Severity:** MINOR
- **File:** `src-tauri/src/reclassify/mod.rs` (~851, `classify_gap` branch 2)
- **Finding:** The working-credit predicate combines `awaiting_at(gap_start)` with an inline `awaiting.iter().any(|&(s,_)| s >= gap_start && s < gap_end)` re-scan; the two overlap and the second re-walks the awaiting vector inline rather than via a named `GapContext` helper like `launch_precedes`/`awaiting_at`. Readability nit on a load-bearing predicate.
- **Fix shape:** extract a `GapContext::awaiting_in_gap(start, end)` method matching the surrounding style.
- **Priority:** low.
- **Status:** pending.

# m9-fix-minute-quantization-ai-doing — 2026-07-13

*(feature-review-quality on the working-tree diff [uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 1 MAJOR / 2 MINOR — all auto-backlogged. Reviewer: well-built, appropriately-scoped; contract-additive `dur_ms` fix, precision-disciplined [sum ms, round once], anti-pattern signposted at the type def + both sum sites, discriminating repro tests. Only real gap: a THIRD copy of the fixed `end - start` anti-pattern in a sibling file the blast-radius analysis missed. No refactor auto-invoked — MAJOR is a same-pattern follow-up on a lower-susceptibility kind, not a CRITICAL.)*

## SURFACE-2026-07-13-QUALITY-MINQUANT-HELPER-PARITY-UNPINNED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`ms_to_minutes_round`) + `src/components/workspace/dashboard/kinds.ts` (`msToMinutesRound`)
- **Finding:** The FE/BE round-half-up helpers are an intentional documented mirror, but no single test asserts they AGREE on the same inputs — each is pinned independently (Rust `ms_to_minutes_round_is_round_half_up_and_zero_clamped`, FE sub-minute pin). The 30_000ms pivot + formula are duplicated in 3 places (2 helpers + WIP prose). Parity is currently correct + both sides pinned, so not a bug — a latent drift channel (change one pivot, no test fails on the divergence).
- **Fix shape:** a shared input→output fixture table asserted on both sides.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-13-QUALITY-MINQUANT-DOUBLE-NEGATIVE-GUARD
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs:376`
- **Finding:** `dur_ms: (s.end_ms - s.start_ms).max(0)` clamps a negative span to 0, and `ms_to_minutes_round` ALSO guards negatives — a reversed segment is defended twice, so the helper's negative branch can only ever fire on a summed total, never a single seg. Harmless redundancy.
- **Fix shape:** none needed; noting the double-guard so a future reader doesn't assume `dur_ms` can be negative downstream.
- **Priority:** low.
- **Status:** pending.

# m9-wp6c-metrics-compare-panels — 2026-07-15

Findings from the WP6c-1 (Metrics tab + build_metrics producer) review. Coherent theme: duplication-of-composition in `time_store/query.rs` — correct today, well-commented, none blocking. Good WP-refactor-batch scope; joins the standing M9 dedup debt (the WP6b-1/6b-2/6b-3 + minquant findings above).

## SURFACE-2026-07-15-QUALITY-WP6C1-AI-COMPONENT-SPAN-DUP
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`build_metrics`, ~1094-1116)
- **Finding:** `ai_component_spans` re-implements the exact span-union body of `reclassify::ai_busy_intervals` (mod.rs:862-873) — `tool_intervals` + `subagent_intervals` + positive bursts — differing ONLY in that it omits the final `merge_spans`. The effort/wallclock pair is literally "the same span set, merged (via `ai_busy_intervals`) vs. un-merged (this inline loop)," but the two halves are computed by two separately-authored walks. So the AI-family membership rule is encoded in two places; a future kind added to the AI family must be edited in both or the effort/wallclock pair desyncs.
- **Fix shape:** expose a `reclassify` primitive returning the UN-MERGED AI-component spans (which `ai_busy_intervals` then merges); `build_metrics` reads it for effort and `ai_busy_intervals` for wallclock — one source.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C1-MERGE-INTERVALS-DUP
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`merge_intervals` ~986) vs `src-tauri/src/reclassify/mod.rs` (`merge_spans` ~1151)
- **Finding:** `merge_intervals` is a near-verbatim copy of the private `merge_spans` (retain-positive → sort → coalesce); the doc-comment openly says "Local mirror of reclassify's private `merge_spans`." Two interval-merge impls to keep in step.
- **Fix shape:** promote `merge_spans` to `pub(crate)` and delete `merge_intervals`, reusing it (query.rs already imports heavily from `reclassify`).
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C1-BY-SID-GROUPING-DUP
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`capped_events` ~1017-1035 + `human_kind_ms` ~1160-1175)
- **Finding:** Both functions independently rebuild the same per-session grouping with the identical `<unknown>`-empty-sid fallback (`by_sid: HashMap<String, Vec<EventRow>>`, clone-per-event), and `human_kind_ms` re-groups events `capped_events` already grouped moments earlier. A 3rd copy of the session-keying idiom in the file (`build_range`/`build_day` have their own inline copy too).
- **Fix shape:** a shared `group_by_session`-style helper (one exists in `reclassify` for `active_bursts`) encoding the empty-sid sentinel once.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C1-PRIMITIVE-REWALK-UNCOMMENTED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`build_metrics`, ~1094-1116)
- **Finding:** `build_metrics` calls `active_bursts`/`tool_intervals`/`subagent_intervals` directly AND calls `ai_busy_intervals(&ev)`, which internally recomputes all three again → each primitive runs 2-3× on the same event slice. Correctness-neutral + perf-neutral (windows are small), but a reader tracing the data flow sees the same reclassifier walk fan out several times with no note that `ai_busy_intervals` is itself a composite of the primitives above it.
- **Fix shape:** a one-line comment ("`ai_busy_intervals` re-derives the tool/subagent/burst spans it merges") — or fold into the AI-component-span primitive from the first finding.
- **Priority:** low.
- **Status:** pending.

## SURFACE-2026-07-15-QUALITY-WP6C1-FMTMSDUR-SUBSECOND-COMMENT
- **Severity:** MINOR
- **File:** `src/components/workspace/dashboard/__tests__/metricsMath.test.ts:17` (+ `metricsMath.ts` `fmtMsDur`)
- **Finding:** The test pins `fmtMsDur(143)` → `"0s"` (a 143ms total renders "0s" — rounds below one second). Defensible, but the feature's headline invariant is "sub-minute tool work must be VISIBLE, not 0", and "0s" reads to a user like the "0m" this path exists to avoid. A future reader might "fix" it into a misleading floor-up.
- **Fix shape:** a one-line comment at the display seam clarifying the guarded anti-pattern is MINUTE-flooring (per-segment quantization), NOT sub-second display; sub-second flooring to "0s" is expected + correct.
- **Priority:** low.
- **Status:** pending.

# m10-wp6-milestone-exit-verify — 2026-07-18

Review of ship commit `4955463` (Phase 1 error-surface fold + Phase B1 revert to one self-update path), Mode 3. **0 CRITICAL / 0 MAJOR / 1 MINOR.** Reviewer verdict: "a well-executed subtraction … advances the codebase by collapsing a two-path flow into one uniform self-update path; the single MINOR is a type-narrowing polish, not debt."

## SURFACE-2026-07-18-QUALITY-WP6-PICKER-CHECK-UPDATES-VESTIGIAL-RETURN-TYPE
- **Severity:** MINOR
- **Location:** `src/components/picker/ProjectPicker.tsx:83`
- **Finding:** `onCheckForUpdates?: () => Promise<{ outcome: string } | null>` still types a `{ outcome }` return value that the handler (`handleCheckForUpdates`) no longer reads — the WP6 P1.4 de-dup made the picker KICKS-only (feedback moved to the App-level `useUpdater.statusNote`), and the comment at L79-82 even states "the return value is unused now." The advertised `{ outcome }` contract has no consumer.
- **Why it matters:** a stray return-type contract left after a surface was de-duped invites a future reader to wire against a value the producer no longer meaningfully supplies.
- **Suggested action:** narrow the type to `() => void` (or `() => Promise<unknown>`) on both the `ProjectPickerProps` declaration and the `App.tsx` prop pass-site. Trivial; no correctness impact.
- **Priority:** low.
- **Status:** pending.
