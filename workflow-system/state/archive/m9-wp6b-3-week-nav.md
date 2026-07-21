# Feature: M9 WP6b-3 — Week-view prev/next date navigation

**Workflow:** feature
**State:** COMPLETED 2026-07-14 (finalized; archived). All phases + verify gates done; review-quality 0C/0M/3 MINOR (backlogged). Local-only per commit-only-when-asked (NOT pushed — batched with the M9 tree for the operator's push call).
**Created:** 2026-07-14
**Drive mode:** autopilot
**WBS:** M9 WP6b-3 (docs/product/wbs.md §WP6b-3, ~L194) — DESCOPED to Week-nav only (Day-nav delivered by WP6b-2 Phase 3's Custom→Day merge). `SURFACE-2026-07-14-M9-DAY-WEEK-DATE-NAV-MISSING` (Week half).

## Problem Statement
The Time-Analytics dashboard's **Week** view is pinned to *this* week (`{kind:"week"}` resolves to "the ISO week containing today", server-side) with no way to step backward — while the **Month** view got prev/next `MonthNav` arrows (WP6b-2 P2) and the **Day** view got a date picker + prev/next (WP6b-2 P3 Custom→Day merge). The reference `claude-time` had Week-nav arrows (`viz/dashboard.jsx` `data-week-nav="prev"/"next"`); this is a port-completeness gap. Add a `WeekNav` prev/next control that steps a Monday-anchor ±7 days and refetches, so the operator can view a past week. **Week stays the rollup GRID** (day-count-agnostic) — no multi-day-timeline dependency (that's WP6b-4).

## Design decision (resolves the pause-note open question — "how a past-week fetch renders")
The pause note flagged: *keep Week as the rollup grid (zero multi-day-render dependency) OR confirm the backend supports a `week`-window offset param.* Investigation at plan-entry resolved it:

- The backend `build_week(monday, …)` (`query.rs:734`) **already accepts any Monday** and returns a proper `WeekPayload` (the day-count-agnostic rollup grid). Only the `QueryWindow::Week` *enum variant* is hardcoded to today's Monday (`commands.rs:610`), with no anchor param.
- A `{kind:"custom"}` 7-day range returns a `RangePayload` (NOT a `WeekPayload`) → it would need the multi-day `DayTimeline` render (WP6b-4's job) and would NOT preserve the rollup grid. **Rejected.**
- **Chosen:** thread an optional `monday` anchor through `QueryWindow::Week` (`{kind:"week", monday?: "YYYY-MM-DD"}`). Backward-compatible (absent = today's Monday, current behavior byte-unchanged). `build_week` needs no change. This keeps Week as the rollup grid — the operator's stated preferred outcome. It nudges the WP from "XS frontend-only" to **S (small additive backend + frontend)**, but it's the correct architecture (avoids the WP6b-4 multi-day dependency the pause note warned against).

## Problem Statement (§1b re-check — F12 back-loop 2026-07-14)
**Root problem unchanged** — the WP6b-3 goal (add Week-nav) is intact and the WeekNav itself works (verify-self proved step/refetch/disable/reset all function). What the vh.2 rejection revealed is an ORTHOGONAL, pre-existing render-gating flaw the new nav *exposed*: when tracking is ON but the shown period has no rows, `mode` folds to `"empty"` → the full-screen `dashboard-empty-nodata` block renders in place of the WHOLE nav-bearing surface (toolbar + nav included) → stepping to an empty Week/Day traps the operator (no forward arrow). Month already avoids this (its `hasData` is hardcoded to `trackingEnabled` so it always renders its nav shell); Week + Day did not. The fix is a render-gating class fix (extend the Month always-render-nav property to Week + Day), NOT a change to the Week-nav logic. The Day half predates WP6b-3 (WP6b-2 P3) but is the same defect, fixed together here. `SURFACE-2026-07-14-M9-EMPTY-PERIOD-NAV-TRAP`.

## Non-goals (explicit)
- NOT multi-day timeline render (WP6b-4). Week remains the rollup grid.
- NOT a `{kind:"custom"}` route for past weeks (rejected above — wrong payload shape).
- NOT Day-nav (already shipped by WP6b-2 P3).
- NOT changing the `{kind:"week"}` default behavior (absent `monday` = today, unchanged).

## Work Tree

- [x] Phase 1: Backend — optional `monday` anchor on `QueryWindow::Week`  <!-- status: DONE — all impl + verify-auto/self/human/codify complete; 504 lib + 6 integ pass -->
  **Relevance check (before Phase 2):**
  - Requester still needs this: yes — Week-nav is the operator's stated next WP; Phase 2 is the whole user-facing deliverable.
  - Requirements unchanged: yes — Phase 1 landed exactly the anchor the plan specified; nothing about Phase 2's scope shifted.
  - Solution still feasible: yes — the backend anchor is proven; Phase 2 is FE wiring against a working, tested `{kind:"week",monday}` window.
  - No superior alternative discovered: yes — the anchor-param path (rollup grid, no multi-day dependency) held up through implementation; no better route surfaced.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test -p <crate> time_store::` exits 0 — incl. a new test proving `resolve_window(&Week{monday: Some("2026-06-15")})` yields `WindowMode::Week{monday: 2026-06-15}` (the parsed Monday) AND `resolve_window(&Week{monday: None})` yields today's Monday (default preserved).
  - CLI: `cargo test` — the existing `resolve_window_week_is_a_seven_day_span_anchored_on_monday` + the `{"kind":"week"}` deserialize test (commands.rs:1442) still pass unchanged (back-compat: bare `{"kind":"week"}` still deserializes to `Week{monday: None}`).
  - CLI: `cargo clippy --all-targets -- -D warnings` exits 0.
  - [x] P1.1 Add `monday: Option<String>` to `QueryWindow::Week` (serde `#[serde(default)]` so bare `{"kind":"week"}` → `None`). Keep snake_case.  <!-- status: DONE -->
  - [x] P1.2 In `resolve_window`, when `monday` is `Some(iso)`: parse `"YYYY-MM-DD"` → `NaiveDate`; if parse fails OR the date isn't a Monday, snap to that date's Monday (defensive — the FE always sends a Monday, but never trust the wire). When `None`: today's Monday (existing code path, unchanged). Build the 7-day span + `WindowMode::Week{monday}` from the resolved Monday. — DONE: new private `monday_of(NaiveDate)` helper snaps any anchor to its Monday; `resolve_window` parses the optional anchor (`unwrap_or(today)`) then snaps. Dropped now-unused `Datelike` import from `resolve_window` (moved into `monday_of`).  <!-- status: DONE -->
  - [x] P1.3 Unit tests: `Week{monday:Some(past-Monday)}` → that Monday's span; `Week{monday:Some(non-Monday)}` → snaps to its Monday; `Week{monday:None}` → today's Monday; bare `{"kind":"week"}` still deserializes to `Week{monday:None}`. — DONE: 3 new `resolve_window_week_*` tests (anchor-selects / non-Monday-snap / malformed-fallback) + updated `query_window_deserializes…` (bare `{"kind":"week"}` → `None`, `{monday:"2026-06-15"}` → `Some`) + updated `resolve_window_week_is_a_seven_day_span…` (None path). 504 lib pass.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — cargo test --lib time_store::commands 39 pass; clippy --all-targets clean -->
  - [x] verify-self  <!-- status: DONE — CLI-only backend phase (no live/browser surface; anchored window has no caller until Phase 2). All CLI outcomes green: 4 resolve_window_week_* anchor tests + deserialize back-compat + full lib 504 pass + clippy --all-targets clean. Wiring trace confirmed: {kind:"week",monday} deserializes → resolve_window snaps → build_week(monday) → WeekPayload rollup grid. No integration-boundary regression (existing {kind:"week"} consumer byte-unchanged). Live end-to-end (Week-nav→past-week query) is a Phase-2 verify-self outcome. -->
  - [x] verify-human  <!-- status: DONE — operator approved on the verify-self artifact (waived the manual re-run since verify-self already ran the recorded CLI check against the consuming surface; boundary change is additive + backward-compatible, all outcomes green). -->
    - [x] P1.verify-human.1 Recorded CLI invocation against the consuming surface (`time_analytics_query`'s `resolve_window`): anchor threads + back-compat holds — operator approved on verify-self's captured green result (waived re-run).  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — coverage sufficient, no new tests needed. The 4 build-time tests (resolve_window_week_anchor_selects / _snaps_a_non_monday / _malformed_anchor_falls_back + updated query_window_deserializes) fully codify the verified behavior at the right level (pure serde + date-arithmetic; no higher observable surface until Phase 2). Boundary covered: deserialize test (wire→enum) + resolve_window anchor tests (enum→span) + existing build_week test (span→payload). Full sweep 504 lib + 6 integ pass, 0 regressions. -->

- [x] Phase 2: Frontend — `weekMath` iso-week arithmetic + `QueryWindow` type + `WeekNav` control + `GlobalDashboard` wiring  <!-- status: DONE — P2.1–P2.6 + all verify gates complete (incl. the F12 empty-period nav-trap fix); 99/1032 frontend + 504 backend pass; operator-approved. -->
  **Observable outcomes:**
  - CLI: `pnpm vitest run` exits 0 — a new `weekMath` test block pins `mondayOfDate` (any day → that week's Monday iso), `prevMondayIso`/`nextMondayIso` (±7d, correct across month/year boundaries), `weekNavLabel` ("Jul 7 – Jul 13"), and `isFutureMonday` (next-week's Monday vs today → disabled).
  - CLI: `pnpm tsc --noEmit` exits 0 (the `{kind:"week", monday?}` union change type-checks end-to-end through `fetchView`/`queryTimeAnalytics`).
  - CLI: `pnpm eslint <changed files>` exits 0.
  - CLI: `pnpm vite build` exits 0 (no broken imports/JSX across the change).
  - Browser (verify-self, MCP bridge): Week tab shows a `WeekNav` (`[data-testid="dashboard-week-nav"]`) with prev/next arrows + a label; DOM snapshot contains `[data-week-nav="prev"]` and `[data-week-nav="next"]`.
  - Browser (verify-self, MCP bridge): clicking `[data-week-nav="prev"]` steps the week back — the `WeekNav` label + `[data-week-monday]` attr change to the prior Monday, and a `time_analytics_query` fires with `window.monday` = that Monday (observed via the IPC monitor OR the WeekTimeline re-rendering with the prior week's data).
  - Browser (verify-self): the "next" arrow is `disabled` when the shown week is the current week (can't step into the future); enabled after stepping back.
  - Browser (verify-self): switching to Day/Month and back to Week resets Week to the current week (matches `changeView`'s reset-to-current-period convention).
  - Console: 0 errors across the interaction.
  - [x] P2.1 `weekMath.ts`: iso-week arithmetic — DONE: `mondayOfDate` (snaps any Date to its Monday iso via local `mondayIdx`), `prevMondayIso`/`nextMondayIso` (±7d via Date arithmetic, wraps month/year, malformed→today's Monday), `weekNavLabel` ("Jun 15 – Jun 21", em-dash on malformed), `isFutureMonday` (lexicographic iso compare vs `mondayOfDate(now)`, fail-safe true on malformed). Private `dateToIso`/`isoToDate` (with overflow-rejection round-trip) helpers. 14 vitest pins added.  <!-- status: DONE -->
  - [x] P2.2 `timeAnalytics.ts`: `QueryWindow` union `{ kind: "week" }` → `{ kind: "week"; monday?: string }`. — DONE (+ doc comment).  <!-- status: DONE -->
  - [x] P2.3 `Chrome.tsx`: `WeekNav` component (sibling of `MonthNav`) — DONE: same arrow styling, `data-testid="dashboard-week-nav"`, `data-week-monday={mondayIso}`, `data-week-nav="prev"/"next"`, `nextDisabled` blocks next. Props `{ label, mondayIso, onPrev, onNext, nextDisabled }`; `minWidth:116` for the wider span label.  <!-- status: DONE -->
  - [x] P2.4 `GlobalDashboard.tsx` wiring — DONE: `mondayIso` state (default `mondayOfDate(new Date())`); added to `navRef` + both seed/flip `fetchView` call sites; `fetchView` week branch sends `{kind:"week", monday: nav?.mondayIso ?? mondayOfDate(new Date())}`; `changeWeek(dir)` (sibling of `changeMonth`, blocks future via `isFutureMonday`); `changeView` resets `mondayIso`→this week on Week-tab select (reset-to-current-period convention); `nextWeekDisabled` computed alongside `nextMonthDisabled`.  <!-- status: DONE -->
  - [x] P2.5 `WeekView` renders `<WeekNav>` in Toolbar `rightSlot` (mirrors `MonthViewContainer`) — DONE: accepts `mondayIso`/`onPrevWeek`/`onNextWeek`/`nextWeekDisabled`; label via `weekNavLabel(mondayIso)`. Wired at the `mode==="data" && view==="week"` render branch.  <!-- status: DONE -->
  - [x] P2.6 (F12 fix — empty-period nav trap) — DONE: `hasData = trackingEnabled` for ALL nav-bearing views (Week+Day now match Month's always-render-nav property); per-view `activeEmpty` flag; new `InlinePeriodEmpty` body ("No activity this week/this day" + "use the arrows above") rendered INSIDE `WeekView`/`DayView` (toolbar + WeekNav/DayDatePicker stay) instead of the full-screen `dashboard-empty-nodata` (now the fetch-ERROR fallback only). `.dashboard-empty-inline` CSS (flex-centered, fills height). Obsolete-test fix: `dashboardWiring.test.ts` week-literal grep updated to the `{kind:"week", monday}` shape (triage recorded above). Static gate: pnpm build (tsc+vite) clean, GlobalDashboard chunk still lazy-split (49.6kB); dashboard+timeAnalytics vitest 216 pass; eslint clean.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE (re-run after the F12 empty-period fix; supersedes the pre-fix run which was weekMath+timeAnalytics 36 pass) — vitest dashboard+timeAnalytics 216 pass; pnpm build (tsc+vite) clean, GlobalDashboard chunk still lazy-split; eslint clean. -->
  - [x] verify-self  <!-- status: DONE (re-run after the F12 fix — LIVE-driven via the tauri MCP bridge, fresh feature-verify-self-runner subagent). All 4 outcomes PASS: (1) Week empty-period KEEPS nav — stepped back 10 weeks into empty territory (WEEK 27→19), every empty week showed dashboard-week-nav + inline dashboard-empty-period (NOT the full-screen dashboard-empty-nodata trap), next enabled, and clicking next walked back to an active week; (2) Day empty-period KEEPS nav — empty day JUL 12 showed day-nav + inline empty body, forward-step restored data; (3) NO regression — prev steps 7d + data changes, next disabled at current week/enabled after prev, tab-switch resets; (4) 0 console errors (custom hook + bridge buffer both 0). The empty-period nav trap is FIXED on both Week + Day. Teardown PID-scoped (no operator instance); 1420+9223 clean. -->
  - [x] verify-human  <!-- status: DONE — vh.1 (visual polish) + vh.3 (empty-period fix confirmation) both operator-approved; vh.2 was the pre-fix FAILED report, superseded by the P2.6 fix. -->
    - [x] P2.verify-human.1 Visual polish — WeekNav pill reads cleanly, consistent with MonthNav. — operator: "good".  <!-- status: DONE -->
    - [x] P2.verify-human.2 Operator click-through — pre-fix FAILED (BLOCKING): empty Week/Day replaced whole surface with full-screen empty-state → trapped. SUPERSEDED by the P2.6 (F12) fix; re-verified as vh.3.  <!-- status: DONE-superseded -->
    - [x] P2.verify-human.3 After the P2.6 fix: stepping Week/Day to an empty period KEEPS toolbar + nav visible (inline "No activity <period>" body, arrows still there), can step back to an active period. — operator APPROVED (agent live-re-verified 4/4 first).  <!-- status: DONE -->
  - [x] verify-codify  <!-- status: DONE — coverage: the 14 weekMath iso-week pins (P2.1) + the updated `{kind:"week",monday}` assertion (P2.6) + 2 NEW source-grep guard tests in dashboardWiring.test.ts: (a) WeekNav wiring (<WeekNav/changeWeek/nextWeekDisabled + Chrome's data-week-nav prev/next), (b) the F12 empty-period fix markers (hasData=trackingEnabled, activeEmpty/isEmpty, InlinePeriodEmpty/dashboard-empty-period). The fix's RENDER behavior is live-verified via the MCP bridge per the project's no-render-test-toolchain convention (pure logic→vitest, live DOM→bridge); the grep guards catch a fix-revert cheaply. Full sweep: 99 files/1032 frontend + 504 backend lib pass, 0 regressions; eslint clean. No triage. (Note: two stray duplicate verify-codify lines from the F12 tree churn were collapsed into this single node.) -->

## Current Node
- **Path:** Feature > review-quality COMPLETE → finalize
- **Active scope:** ship + review-quality DONE. review-quality: 0 CRITICAL / 0 MAJOR / 3 MINOR (all low, auto-backlogged to backlog-quality-findings.md + pointer in backlog.md). Next: `/feature-finalize`.
- **Blocked:** none
- **Open discoveries:** none
- **Final state:** 99 files/1032 frontend + 504 backend lib + 6 integ tests pass; tsc+vite clean (GlobalDashboard chunk still lazy-split); eslint clean; clippy --all-targets clean. Operator-approved at verify-human (Week-nav + empty-period fix). `SURFACE-2026-07-14-M9-EMPTY-PERIOD-NAV-TRAP` resolved (class fix, Week+Day). NOTE: local-only per commit-only-when-asked — the whole M9 tree stays uncommitted for the operator's push call.
- **Phase 2 build notes:** Files: `weekMath.ts` (+iso-week arithmetic), `timeAnalytics.ts` (`QueryWindow` type), `Chrome.tsx` (`WeekNav`), `GlobalDashboard.tsx` (state + `changeWeek` + wiring + `WeekView`/`DayView` + the F12 empty-period fix), `App.css` (`.dashboard-empty-inline`), `dashboardWiring.test.ts` (updated + 2 new guards), `weekMath.test.ts` (+14 pins).
- **Build notes (P1):** backend `QueryWindow::Week{monday:Option<String>}` anchor + `resolve_window` snap via `monday_of`; additive + backward-compatible; 4 tests.

## Code-Quality Review — m9-wp6b-3-week-nav

### Strengths
- Backend anchor design (`{kind:"week", monday?}` with `#[serde(default)]`) is the right cut: backward-compatible, reuses `build_week(monday, …)` untouched, avoids the rejected `custom` payload-shape mismatch.
- Defensive `monday_of` snap (never trust the wire) + fail-safe frontend helpers (all degrade on malformed input rather than throw).
- Proportionate test coverage: 4 backend `resolve_window_week_*` + 14 `weekMath` pins (month/year boundary + `isFutureMonday` disable boundary).
- `nextWeekDisabled` (render) and `changeWeek("next")` (callback) share the same `isFutureMonday(nextMondayIso(...))` predicate — can't drift.
- The F12 fix comment block documents the WHY (nav-trap invariant), not just the what.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [Chrome.tsx:254-326] `WeekNav` is a near-verbatim copy of `MonthNav` (L171-246) — ~60 duplicated lines differing only in data-attr names / titles / minWidth. A shared `NavPill`/`ArrowNav` primitive would remove the dup. Both copies correct + contained to one file → MINOR.
- [weekMath.ts:150-174] `dateToIso` + `mondayIdx` byte-identical re-implementations of `monthMath.todayDateIso` / `monthMath.mondayIndex` (both already exported). "Flat import graph" rationale is weak (GlobalDashboard already imports both modules). Prefer importing the exports. MINOR — DRY, no correctness impact.
- [weekMath.ts:226-229] `isFutureMonday`: parsed `d` used only as a validity guard then discarded (comparison is the lexicographic `mondayIso > mondayOfDate(now)`). Correct + documented, but reads as if `d` should participate. A `if (!isoToDate(mondayIso)) return true;` or a guard comment would clarify. MINOR — future-reader confusion, not a bug.

### Assessment
Well-built, tightly-scoped increment. Core decision (Monday-anchor through `QueryWindow::Week`, preserving the rollup grid) correct + back-compatible. The F12 empty-period fix is sound: `hasData = trackingEnabled` makes the full-screen `mode==="empty"` unreachable while tracking is on, each nav-bearing view renders an inline empty body inside its nav shell, `dashboard-empty-nodata` correctly degrades to fetch-error-only (successful empty fetch → non-null payload w/ 0 projects → routes through the view branch). Only debt is MINOR duplication (WeekNav↔MonthNav, weekMath↔monthMath helpers) — appropriate for auto-backlog, not a refactor pass.

### If you disagree
Operator: dismiss any finding by marking the line `[DISMISSED]` in this section before `feature-finalize` archives the WIP.

### Disposition (autopilot, 2026-07-14)
0 CRITICAL / 0 MAJOR / 3 MINOR → Case C. All 3 MINOR auto-backlogged to `workflow/backlog-quality-findings.md` (priority low) + pointer in `workflow/backlog.md`. No refactor invoked. F39 → finalize.

## Test Triage — dashboardWiring.test.ts "queries the GLOBAL scope via the WP4 command (view-driven window)"
Classification: Obsolete test — the WP6b-3 change intentionally supersedes what the assertion checked.
Confidence: high
Evidence: L129 `expect(globalDashboard).toContain('{ kind: "week" }')` is a SOURCE-GREP for the exact window literal. WP6b-3 P2.2 deliberately changed the week window from `{ kind: "week" }` to `{ kind: "week", monday: ... }` (the anchor). The test's stated intent (comment L124-127) is "the day + week windows must both be constructed + scope stays global" — that behavior is unchanged; only the exact literal moved. No behavior regression: verify-self live-proved the week query fires with the monday anchor.
Action: update the grep to assert the new shape (`kind: "week"` + `monday`) so it still guards "week window constructed via the global command"; keep the scope + day-window assertions untouched.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-07-14] environment — `_ref/claude-customization` symlink was MISSING again at plan-entry (recurrence of `SURFACE-2026-07-13-M9-WP6B1-REF-SYMLINK-MISSING`); recreated (`ln -s ~/Personal/projects/my-claude-code-customization _ref/claude-customization`). Also: the ref dashboard.jsx moved to `viz/dashboard.jsx` (nested); week-nav logic lives in `viz_render.py:337-340` + `viz/dashboard.jsx:325,472-515`. Informational; `_ref/` is gitignored.

## Retrospect
- **What changed in our understanding:** The Week-nav "how does a past-week render?" open question (flagged at pause) had a cleaner answer than either pause-note option: `build_week(monday, …)` was ALREADY anchored — only the `QueryWindow::Week` *enum variant* was hardcoded to today. So a tiny additive `monday?` field kept Week as the rollup grid with zero WP6b-4 dependency, beating both the "confirm a week-offset param" hope (it wasn't exposed) and the "`{kind:"custom"}` route" (wrong payload shape). The bigger learning came at verify-human: the WeekNav worked perfectly, but exposing a *working* back-step immediately surfaced a latent, pre-existing render-gating bug — stepping to an empty period trapped the operator. A new nav affordance is also a new way to reach states the old UI never reached.
- **Assumptions that held:** The MonthNav pattern generalized cleanly to WeekNav (sibling component + `changeWeek` mirror of `changeMonth` + reset-to-current-period convention). The additive backend change stayed fully back-compatible (bare `{kind:"week"}` byte-unchanged). The project's "pure logic → vitest, live DOM → MCP bridge" posture held — the render-path fix was correctly verified live, not via a (nonexistent) render-test toolchain.
- **Assumptions that were wrong:** That Week-nav was "XS, frontend-only" — it needed a small backend anchor (XS→S), and the empty-period trap turned a 2-phase feature into a 2-phase-plus-F12-back-loop. Also: the trap was NOT introduced by WP6b-3 — the Day half predated it (WP6b-2 P3's Custom→Day merge gave Day a picker but not Month's always-render-nav property); the new Week-nav just made the whole class visible. Fixed both together (class fix) rather than patching only the Week symptom.
- **Approach delta:** Plan was 2 phases (backend anchor → frontend nav). Actual added a third de-facto phase: the F12 empty-period nav-trap class fix (P2.6), discovered at verify-human, fixed in build, re-verified live (verify-self re-run 4/4) before operator re-approval. One obsolete-test triage (the `dashboardWiring` week-literal grep — updated for the `{kind:"week",monday}` shape). Everything else matched the plan.
