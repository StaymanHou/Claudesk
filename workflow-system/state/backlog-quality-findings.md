# Backlog — Code-Quality Findings

This file collects findings surfaced by `feature-review-quality` between ship and finalize. Each entry is grouped under a `# <feature-name> — <YYYY-MM-DD>` header. A single pointer per feature is added to `workflow/backlog.md`.

To pick up: read the entries below, then run `/feature-refactor` to address them. To dismiss: edit the originating WIP file's `## Code-Quality Review` section and mark the line `[DISMISSED]`.

# editor-fs-backend-hardening — 2026-07-20

*(feature-review-quality on the uncommitted working-tree WP7 diff, HEAD `6f514d0`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all polish/observability notes, none blocking. Reviewer: "well-built, disciplined hardening pass… all flagged edge cases resolve correctly under the design; none rise to a finding." Backlog-paydown sweep WP7 — the last WP.)*

## SURFACE-2026-07-20-QUALITY-WP7-VALIDATE-ROOT-PER-CALL-COST
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/commands.rs:34-45` (`validate_frontend_root`)
- **Finding:** Reads + parses `projects.json` from disk AND canonicalizes every known root on *every* read/write/stat/delete/trash/create call — one `canonicalize` syscall per known root, N syscalls per op. Correct and acceptable at single-user scale, but scales with project count.
- **Why it matters:** A future watch/poll surface (or a tight save loop) calling these commands repeatedly would re-do the disk read + per-root canonicalize each time.
- **Suggested action:** Memoize the resolved known-roots behind the config-store's existing state rather than re-reading `projects.json` each call.
- **Priority:** low

## SURFACE-2026-07-20-QUALITY-WP7-UNKNOWN-ROOT-ERROR-VARIANT
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:199` (`validate_root` → `OutsideWorkspace { root: "<no known project>" }`)
- **Finding:** `validate_root` reuses `OutsideWorkspace` with a sentinel `root` string `"<no known project>"`; the `Display` reads `path <X> is outside the workspace root <no known project>`, which is slightly odd (the requested root *is* the rejected thing, not a path outside some other root).
- **Why it matters:** Reusing the variant blurs "root not a known project" vs. "file path escaped a valid root" — a UI that wanted to distinguish them can't.
- **Suggested action:** A distinct `EditorFsError::UnknownRoot` variant would read cleanly and let the UI branch. Minimal-choice reuse is reasonable for now.
- **Priority:** low

## SURFACE-2026-07-20-QUALITY-WP7-STALE-COMPILE-GAP-TEST-COMMENT
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:434-497` (the WP7 gap-2 test block)
- **Finding:** The test block carries a stale compile-gap RED-phase comment ("This intentionally fails to COMPILE until the fix lands…") directly above the live post-fix restatement — now historically inaccurate (it compiles + passes).
- **Why it matters:** A future reader hits a contradictory comment pair.
- **Suggested action:** Trim the superseded RED-phase paragraph. Cosmetic.
- **Priority:** low

## SURFACE-2026-07-20-QUALITY-WP7-RESOLVE-WITHIN-TOCTOU-NOTE
- **Severity:** MINOR
- **Location:** `src-tauri/src/editor_fs/mod.rs:141` (`resolve_within` `exists()`-then-`canonicalize()`)
- **Finding:** A benign, non-exploitable TOCTOU window exists between `exists()` and `canonicalize()`. A swap-to-symlink race is still re-validated by `canonicalize` + `starts_with`; a broken symlink (`exists()` false) falls to the safe not-yet-existing path whose parent is confirmed inside root.
- **Why it matters:** Not a defect — recorded only because the review flagged the pattern, so a future reader doesn't re-raise it.
- **Suggested action:** None (documentation-of-non-issue). Optionally a one-line code comment noting the window is re-validated.
- **Priority:** low

# m10.5-wp3-cc-terminal-clean-kill — 2026-07-19

*(feature-review-quality on the uncommitted working-tree diff, HEAD `92cb0cc`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all one-line doc/observability touch-ups. Reviewer: "well-built, unusually disciplined bug fix… No refactor is warranted." None blocks; refactor-optional. All 3 sit in `src-tauri/src/cc_session/mod.rs`.)*

## SURFACE-2026-07-19-QUALITY-WP3-REAPLEADER-SILENT-NONREAP
- **Severity:** MINOR
- **Location:** `src-tauri/src/cc_session/mod.rs:641-644` (`KillStep::ReapLeader`)
- **Finding:** `ReapLeader` discards `poll_reaped()`'s result (`let _ =`). If a process survives both `killpg(SIGKILL)` and the 300ms window (uninterruptible-sleep descendant, or a `None`-pgid path where a group child lingers holding the slave fd), `kill()` still returns `Ok` and `cc-exit-<id>` EOF may never fire — the AC-4 "wedged never-closed workspace" case — silently. The bounded wait is sound (can't hang); the concern is that a non-reap degrades invisibly. A debug-level log or distinct signal on `Ok(false)` would make the residual case observable.
- **Priority:** low
- **Pickup shape:** small — add a `log`/`eprintln` (or a distinct return) on the `ReapLeader` `Ok(false)` branch; rides any future kill-path touch.

# m10.5-wp2-active-close-confirmation — 2026-07-18

*(feature-review-quality on the uncommitted working-tree diff, HEAD `75ef6f8`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR — all cosmetic polish. Reviewer: "well-built… advances the codebase rather than accruing debt… no refactor pass warranted." None blocks; refactor-optional.)*

## SURFACE-2026-07-18-QUALITY-WP2-SEAM-DOC-FORWARD-REF
- **Severity:** MINOR
- **Location:** `src-tauri/src/cc_session/mod.rs:339` (Phase-3 `spawn_shell` doc note)
- **Finding:** The seam doc references `workflow/archive/m10.5-wp2-*` Phase 3 — a forward-reference that only becomes valid after `feature-finalize` archives the WIP (currently at `workflow/wip/`). Acceptable if finalize always archives (the convention), but the glob-with-wildcard pointer is softer than a concrete path; a reader grepping today won't find it. **NOTE: `feature-finalize` WILL archive the WIP to exactly `workflow/archive/m10.5-wp2-active-close-confirmation.md`, so this forward-ref resolves on finalize — likely self-closing; verify at finalize.**
- **Priority:** low
- **Pickup shape:** verify at finalize (the archive makes the glob valid); if a concrete path is wanted, one-line edit post-archive.

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

## SURFACE-2026-07-17-QUALITY-WP3-SHORTCIRCUIT-TEST-PINS-SHAPE-NOT-ORDERING
- **Severity:** MINOR
- **File:** `src-tauri/src/updater/commands.rs` (`homebrew_source_short_circuits_to_defer_with_no_available_version`, ~L196-211)
- **Finding:** The test reconstructs the `UpdateCheckResult` by hand rather than invoking `updater_check` (the `AppHandle` dependency makes a true command-level test awkward), so it pins the expected *shape* but not that `updater_check` actually orders the brew short-circuit BEFORE the network `check()`. That load-bearing invariant (Homebrew never hits the network) rests on code inspection + the live bridge verify-self, not the unit test. The limitation is honestly noted in the test comment.
- **Fix shape:** If/when the command layer becomes testable (a mockable updater seam, or a `tauri::test` harness), add a test asserting no network call fires for a Homebrew source. Otherwise accept as a documented structural limitation.
- **Why it matters:** the most load-bearing WP3 invariant is asserted by structure, not test — a future refactor of `updater_check`'s ordering could silently break the short-circuit.
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

# m9-wp5-tracking-toggle — 2026-07-08

*(feature-review-quality on the WP5 working-tree diff [uncommitted per commit-only-when-asked; HEAD `6bdca6f`]; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 2 MINOR — all auto-backlogged, priority low. Reviewer: well-built, low-risk feature — faithful mirror of the pip_mode/cc_permission_mode trio, single-hook-point gate discipline held, drain-safety degrade-to-OFF tested at the seam, event-name contract pinned both IPC sides. The 2 MINORs are an intrinsic auto-tier blind spot + a naming footgun.)*

## SURFACE-2026-07-08-QUALITY-WP5-GATE-BODY-APPHANDLE-HOP-UNTESTED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`tracking_enabled(app)` ~1088-1094)
- **Finding:** The gate's own body — the `resolve_data_dir(app)` → `read_time_tracking_enabled(&dir).unwrap_or(false)` hop — is not unit-covered. Every gate test exercises `read_time_tracking_enabled` directly ("same code path, minus the app→dir hop"); the hop itself (the one line WP5 added to the gate) is proven only at bridge verify-self. A regression in the resolve-then-read wiring (e.g. a wrong data-dir resolver) would pass the auto-tier suite.
- **Fix shape:** intrinsic AppHandle-constructability constraint — a unit test can't build an AppHandle. Options: (a) accept it (live verify-self covers it, as done); (b) if a future test-seam for AppHandle-bound commands materializes, add a gate-body test then. No action needed now; on record so the blind spot is known.
- **Priority:** low (live-verified; auto-tier blind spot only).
- **Status:** pending.

# m9-wp4-segment-model-query-layer — 2026-07-08

*(feature-review-quality on ship commit `d8b308e`; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 4 MINOR — all auto-backlogged, priority low. Reviewer: well-built phase — correctly re-expresses the transform against WP3's 6-kind enum, lands both carried MAJOR reclassify findings with genuine pinning tests, DTO/serde pinned both IPC sides, debt minimal + honestly tracked. The 4 MINORs are boundary edges + one drift-risk duplication + a possibly-dead contract field.)*

## SURFACE-2026-07-08-QUALITY-WP4-DAYPAYLOAD-EMPTY-NOT-ON-IPC-SURFACE
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`DayPayload.empty` ~114-127; `build_range` single-day path ~503-519)
- **Finding:** `DayPayload` carries `empty: Some(true)`, but `build_range`'s single-day path propagates only `iso`/`hour_range` (drops `empty`), and the command returns only `TimeAnalyticsResult::Range(RangePayload)` — which has no `empty` field (nor does the FE `RangePayload`). So a WP6 day-query consumer can't read the empty-day hint; it must infer emptiness from `projects.is_empty()`. Either the flag is dead on the IPC path (its test only exercises the internal `DayPayload`) or WP6 needs it surfaced on `RangePayload`.
- **Fix shape:** a deliberate WP6-facing decision — surface `empty` on `RangePayload`, OR document that WP6 infers emptiness from `projects.is_empty()` and the `DayPayload.empty` flag is internal-only. Decide while the shape is fresh.
- **Priority:** low (WP6-facing contract decision).
- **Status:** pending.

## SURFACE-2026-07-08-QUALITY-WP4-CUSTOM-WINDOW-MIDNIGHT-EXTRA-DAY
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/commands.rs` (`resolve_window` Custom arm ~462-467)
- **Finding:** a Custom window whose `end_ms` lands exactly on a local midnight → `rows_in_window` excludes that instant (half-open `ts < end`) while `end_day = local_date_of(end_ms)` resolves to the next day, so `build_range` emits one extra all-empty trailing day. Cosmetic; untested at the boundary. *(Note: `local_date_of_ms` was renamed to the shared `local_date_of` in the WP3 tz-helper dedup.)*
- **Fix shape:** clamp `end_day` back by one when `end_ms` is exactly local-midnight, or add a boundary test documenting the artifact.
- **Priority:** low (cosmetic range-widget edge).
- **Status:** pending.

# mirror-fill-from-bottom — 2026-07-06

*(feature-review-quality on ship commit 99aca94; Mode 3 autopilot. 0 CRITICAL / 0 MAJOR / 3 MINOR. Reviewer: well-built, tightly-scoped fix at the shared seam; correctness verified against the vendored xterm source. One MINOR (count-drift typo) was fixed in-place; the two below are auto-backlogged. None warrant a refactor pass.)*

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

# file-op-error-surface (Deferred — net-new UX) — 2026-06-30

## SURFACE-2026-06-30-FILE-OP-ERROR-SURFACE
- **Severity:** MINOR (deferred — net-new UX, not debt)
- **Finding:** Right-panel file operations fail silently: a failed `delete_file` (WP5), a failed folder `trash_path` (WP5b), and a create that collides with a gitignored file like `.env` (WP5, silent overwrite) are all swallowed to `console.error` with no user-visible surface. RightPanelHost has NO toast/inline-error component — the existing code comments already say "a future toast could show it" / "would be new UX — intentionally [deferred]".
- **Why deferred (operator ruling, debt-paydown sweep #2, 2026-06-30):** building the error surface is net-new UX, not a debt sweep — it needs a toast/inline-error component in RightPanelHost that does not exist. Honor the recorded "intentionally deferred" intent. The three original findings (WP5-DELETE-FAILURE-NOT-SURFACED, WP5B-TRASH-FAILURE-NOT-SURFACED, WP5-CREATE-COLLISION-GITIGNORE) collapse into this one anchor — one error-surface feature closes all three.
- **Anchor:** a future error-surface feature (whenever RightPanelHost gains a toast/inline-error affordance).
- **Status:** DEFERRED (anchored — net-new UX)

# m9-fix-minute-quantization-ai-doing — 2026-07-13

*(feature-review-quality on the working-tree diff [uncommitted per commit-only-when-asked]; Mode 3 autopilot. 0 CRITICAL / 1 MAJOR / 2 MINOR — all auto-backlogged. Reviewer: well-built, appropriately-scoped; contract-additive `dur_ms` fix, precision-disciplined [sum ms, round once], anti-pattern signposted at the type def + both sum sites, discriminating repro tests. Only real gap: a THIRD copy of the fixed `end - start` anti-pattern in a sibling file the blast-radius analysis missed. No refactor auto-invoked — MAJOR is a same-pattern follow-up on a lower-susceptibility kind, not a CRITICAL.)*

## SURFACE-2026-07-13-QUALITY-MINQUANT-HELPER-PARITY-UNPINNED
- **Severity:** MINOR
- **File:** `src-tauri/src/time_store/query.rs` (`ms_to_minutes_round`) + `src/components/workspace/dashboard/kinds.ts` (`msToMinutesRound`)
- **Finding:** The FE/BE round-half-up helpers are an intentional documented mirror, but no single test asserts they AGREE on the same inputs — each is pinned independently (Rust `ms_to_minutes_round_is_round_half_up_and_zero_clamped`, FE sub-minute pin). The 30_000ms pivot + formula are duplicated in 3 places (2 helpers + WIP prose). Parity is currently correct + both sides pinned, so not a bug — a latent drift channel (change one pivot, no test fails on the divergence).
- **Fix shape:** a shared input→output fixture table asserted on both sides.
- **Priority:** low.
- **Status:** pending.

