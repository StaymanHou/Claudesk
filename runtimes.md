---
shape: runtime-registry
updated: 2026-08-19
---

# Runtime Registry

<!--
Timeout policy: `**Use timeout:**` is the larger of the formula value
(ceil(observed * 1.5 + 60) * 1000) and a 120000 ms safety floor. For sub-40s
commands the formula yields < 120000, so these entries clamp UP to 120000 — a
deliberate floor, not a recording error. The floor guards against spurious
kills on a cold/contended run where a fast command runs much slower than its
recorded best case. Long commands (tauri dev/build) exceed the floor and use
the formula's value (clamped to the Bash tool's 600000 ms max).

History granularity: ONE BULLET PER FEATURE/WP, not one per run. A work package
typically runs its suite three or more times (a verify-auto per phase, plus
verify-codify), and logging each would bury the signal — what a future session
needs is the runtime and the test COUNT at that unit's close, not a transcript.
When several runs within a unit disagree meaningfully (a cold compile, a
contended machine), record the SLOWEST, since the timeout is sized off it.
Settled 2026-08-12 at the paydown sweep; it had been implicit, and one entry
labelled "M11 WP1 P1 verify-auto" was in fact the last of three runs.

Entry schema: exactly ONE `**Use timeout:**` and ONE `**History:**` per command.
The `## cargo test` entry had accumulated two and three respectively (merged at
the same sweep) — a stitched-together entry reads as two commands and hides the
real chronology.
-->

## pnpm vite build

- **Last:** 1.15s (2026-07-18, M10 WP6 Phase B1: one-self-update-path revert — removed brew branch; built clean)
- **Use timeout:** 180000
- **History:**
  - 1.15s — 2026-07-18 (M10 WP6 Phase B1)
  - 1.23s — 2026-07-17 (M10 WP6 P1)
  - 1.19s — 2026-07-15 (WP6c-1 P2)
  - 1.96s — 2026-07-06 (mirror-fill-from-bottom)
  - 1.10s — 2026-06-28 (WP6 P3)

## pnpm install

- **Last:** 3s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 3.5s — 2026-08-04 (147 files / 1806 pass)
  - 3.6s — 2026-08-04 (145 files / 1776 pass)
  - 3s — 2026-06-16

## pnpm tauri dev

- **Last:** 65s (2026-06-27, WP3 verify-self: cold-ish rebuild after source change — recompiled claudesk + plugins, ~65s to MCP-bridge bind + window)
- **Use timeout:** 600000
- **History:**
  - 65s — 2026-06-27 (WP3 P1 verify-self; cold-ish: source changed since last build, full claudesk + plugin recompile to bridge bind)
  - 15s — 2026-06-20 (warm rebuild after WP4 git2 add; cargo recompiled claudesk + plugins, ~14.8s)
  - 29s — 2026-06-16 (first compile; incremental rebuilds will be faster)

## pnpm tauri build

- **Last:** 114s (2026-08-18, /release v0.3.3: cargo clean removed 107736 files / 36.1 GiB + cold build, 1m28s rust + bundle triad [.dmg/.app.tar.gz/.sig], signed)
- **Use timeout:** 600000
- **History:**
  - 114s — 2026-08-18 (/release v0.3.3: cargo clean 107736 files/36.1GiB — largest yet, 1m28s rust + bundle, signed)
  - 110s — 2026-08-06 (/release v0.3.2: cargo clean 81435 files/25.9GiB, 1m18s rust + bundle, signed)
  - 107s — 2026-08-03 (/release v0.3.0: cargo clean 0 files, 1m21s rust + bundle, signed)
  - 103s — 2026-07-20 (/release v0.2.9: cargo clean 11.8GiB, 1m21s rust + bundle, signed)
  - 102s — 2026-07-18 (/release v0.2.8 no-op target: cargo clean 1.6GiB, 1m18s rust + bundle, signed)
  - 110s — 2026-07-18 (/release v0.2.7: cargo clean 7.8GiB, 1m24s rust + bundle, signed)
  - 99s — 2026-07-17 (M10 WP1 probe "from" 0.2.5: fresh tauri-plugin-updater+process compile, 1m39s rust + bundle; "to" 0.2.6 warm-incremental 20.84s)
  - 88s — 2026-07-02 (/release v0.2.5 cold build: cargo clean removed 6.9GiB, full recompile ~63s incl. tauri-nspanel + bundle)
  - 91s — 2026-06-30 (/release v0.2.4 cold build: cargo clean removed 7.5GiB, full recompile ~67s incl. tauri-nspanel + bundle)
  - 92s — 2026-06-29 (/release v0.2.3 cold build: cargo clean removed 7.3GiB, full recompile ~67s incl. tauri-nspanel + bundle)
  - 102s — 2026-06-28 (/release v0.2.2 cold build: cargo clean removed 8.6GiB, full recompile ~77s incl. tauri-nspanel + bundle)
  - 89s — 2026-06-27 (/release v0.2.1 cold build: cargo clean removed 6.4GiB, full recompile ~65s incl. tauri-nspanel + bundle)
  - 83s — 2026-06-27 (/release v0.2.0 cold build: cargo clean removed 16.9GiB, full recompile ~60s incl. tauri-nspanel + bundle)
  - 73s — 2026-06-25 (/release v0.1.2 cold build: cargo clean removed 9.7GiB, full recompile ~50s + bundle)
  - 78s — 2026-06-24 (/release v0.1.1 cold build: cargo clean removed 24.4GiB, full recompile ~49s + bundle)
  - 32s — 2026-06-24 (dev-prod-isolation Phase 2 verify-human: prod .app for the concurrent test)
  - 40s — 2026-06-16

## cargo build (src-tauri)

- **Last:** 14.1s (2026-07-17, M10 WP2 P1: new production `updater` module wired [updater_check/updater_apply + migrated self-clear core], probe module removed — incremental recompile of claudesk crate)
- **Use timeout:** 131000  <!-- 14.1s warm; cold (dep re-resolve) has hit 47s → the 131000 floor still covers it -->
- **History:**
  - 14.1s — 2026-07-17 (M10 WP2 P1: new production updater module wired, probe module removed — incremental recompile)
  - 13.6s — 2026-07-16 (M9 WP7 build smoke: docs-only change, incremental recompile 13.60s — timeout kept at the 47s-cold sizing)
  - 47s — 2026-06-30 (debt-paydown WP1: dep removal forced re-resolve + relink, 46.76s)
  - 1s — 2026-06-29 (M7 WP1: warm rebuild, tray module + features already compiled)
  - 12s — 2026-06-27 (M5 WP5 Phase 1 compile gate: pip_set_visible/teardown/focus-probe/menu item)
  - 10s — 2026-06-26 (M5 WP3 P1: warm rebuild after pip module rename — compile gate)
  - 50s — 2026-06-25 (M5 WP1: tauri-nspanel v2.1.0 @a3122e89 fetch + compile vs tauri 2.11.2, clean)

## pnpm test

- **Last:** 3.14s wall / 2.39s exec (2026-08-18, paydown WP1 close — 165 files / **2118** pass, 0 fail. ⚠️ **This corrects a stale figure:** the prior entry recorded 2115 for M13 WP4, but HEAD already read **2118** before any WP1 edit — verified by stashing WP1's changes and re-counting, so the +3 predates WP1 and is not its delta. WP1 is count-NEUTRAL (2118 → 2118), which for a no-behavior narrowing IS the attribution. ⚠️ A hand-maintained count in a doc is a drift channel; re-count rather than trusting the entry when attribution matters)
- **Prior:** 3.69s wall / 1.78s exec (2026-08-14, M13 WP2 Phase 1 verify-auto — 163 files / **2045** pass, 0 fail. +19 over WP1's 2026: 18 new in `skillButtons.test.ts` (the skill-button row) and +1 net in `sessionStartButton.test.ts`, whose assertions were retargeted rather than deleted when the row absorbed the standalone `/session-start` button)
- **Prior:** 4.48s wall / 1.86s exec (2026-08-14, M13 WP1 Phase 1 verify-codify — 162 files / 2026 pass, 0 fail. WP1 was a probe: zero lines under `src/`, so its run's only job was attribution)
- **Use timeout:** 120000
- **History:**
  - 3.69s wall / 1.78s exec — 2026-08-14
  - 4.48s wall / 1.86s exec — 2026-08-14
  - 3.05s wall / 1.87s exec — 2026-08-11
  - 3.5s wall / 2.66s exec — 2026-08-05
  - 3.5s wall / 2.5s exec — 2026-08-04
  - 3s wall / 2.62s exec — 2026-08-03
  - 1.9s — 2026-08-01 (M11 WP1 P1 verify-auto: 1470 pass, +0 — knowledge-only phase, baseline confirm)
  - 2.0s — 2026-08-01 (M11.5 WP3 P1 verify-codify: +7, 1467 pass — cross-surface copy-promise guard)
  - 1.9s — 2026-08-01 (M11.5 WP3 P1 build: +11, 1460 pass — time-tracking copy guard)
  - 2.5s — 2026-07-31 (M11.5 /product-wbs baseline: 121 files / 1400 pass)
  - 2.3s — 2026-07-29 (WP3 P4 verify-codify: +2, 1307 pass — WP3 COMPLETE)
  - 2.3s — 2026-07-29 (WP3 P3 verify-codify: +12, 1278 pass)
  - 2.2s — 2026-07-29 (WP3 P3 build: +6, 1262 pass)
  - 2.14s — 2026-07-29 (WP3 P2: +12, 1253 pass)
  - 1.79s — 2026-07-28 (M10.9 WP2 P4 verify-codify: +3 coerce-behavior tests → 111 files / 1239 pass)
  - 1.68s — 2026-07-28 (M10.9 WP2 P4 operator-requested picker Settings button: +5 discovery-parity tests → 111 files / 1236 pass)
  - 1.70s — 2026-07-28 (M10.9 WP2 P4 build: migrate 3 controls + gate + retire picker strip → 111 files / 1231 pass)
  - 1.71s — 2026-07-28 (M10.9 WP2 P3 verify-codify: no-backdrop + z-index pins → 110 files / 1225 pass)
  - 1.78s — 2026-07-28 (M10.9 WP2 P3 P3.2 back-loop fix: escDismiss pure seam + 6 exhaustive tests, replaced the misleading source-order guard → 110 files / 1223 pass)
  - 1.77s — 2026-07-28 (M10.9 WP2 P3 build: ⌘, Settings panel shell + menu item → 109 files / 1217 pass)
  - 1.90s — 2026-07-28 (M10.9 WP2 P2 verify-codify: +4 meta-tests, caught+fixed a camelCase matcher defect → 107 files / 1199 pass)
  - 1.78s — 2026-07-28 (M10.9 WP2 P2 build: consumption seam + OFF-invariant guard → 107 files / 1195 pass)
  - 1.59s — 2026-07-28
  - 3.29s — 2026-07-20 (backlog-paydown WP6 verify-auto: +1 tie assertion, comment/naming nits → 105 files / 1181 pass)
  - 1.87s — 2026-07-20 (backlog-paydown WP5 verify-auto: dead-code cleanup, −4 viewportFromRange tests → 105 files / 1181 pass)
  - 1.87s — 2026-07-20 (backlog-paydown WP4 verify-auto: dashboard dedup, 1 wiring-guard test updated → 105 files / 1185 pass)
  - 1.87s — 2026-07-20 (backlog-paydown WP3 verify-auto: query/reclassify dedup, no new FE tests → 105 files / 1185 pass)
  - 1.71s — 2026-07-19 (M10.5 WP4 P1 codify: +2 bridge UTF-8 round-trip tests → 105 files / 1176 pass)
  - 1.75s — 2026-07-18 (M10 WP6 Phase B1: revert — 105 files / 1163 pass)
  - 1.99s — 2026-07-17 (M10 WP6 P2 brew real-check-and-notify: 106 files / 1170 pass)
  - 1.78s — 2026-07-17 (M10 WP4 P5 build: +9 menu/picker-updates tests → 106 files / 1154 pass)
  - 2.38s — 2026-07-17 (M10 WP4 P4 codify: +2 layout-invariant guards → 104 files / 1145 pass)
  - 2.72s — 2026-07-17 (M10 WP4 P4 build: +11 updateFlowState/updaterWiring tests → 104 files / 1143 pass)
  - ~2s — 2026-07-17 (M10 WP4 P3 build: +12 updateNotifyState pure-gate tests → 102 files / 1132 pass)
  - 2.21s — 2026-07-17 (M10 WP2 P2 verify-auto regression: probe UI removed + throwaway UpdaterTrigger added [no dedicated test] → 101 files / 1120 pass, unchanged)
  - 2.43s — 2026-07-17 (M10 WP1 P2 verify-codify regression; 101 files / 1120 pass, no new FE tests)
  - 2s — 2026-07-15 (M9 WP6c-2 P2 verify-codify: +21 compareMath pins + 2 Compare-enabled updates → 101 files / 1120 pass)
  - 1.68s — 2026-07-15 (M9 WP6b-4 re-spec P2 verify-codify: +1 Minimap-alignment pin → 99 files / 1083 pass)
  - 1.67s — 2026-07-15 (M9 WP6b-4 re-spec P2: +3 dashboardWiring pins → 99 files / 1082 pass)
  - 1.84s — 2026-07-15 (M9 WP6b-4 re-spec P1: +18 flexible-timeline math pins → 99 files / 1079 pass)
  - 2.68s — 2026-07-15 (M9 WP6b-4 P2: +6 nowMarkerAbsMin pins → 99 files / 1061 pass)
  - 1.64s — 2026-07-15 (M9 WP6b-4 P1: multi-day coordinate core pins → 99 files / 1055 pass)
  - 1.62s — 2026-07-14 (M9 WP6b-2 P4: SidePanel + click-to-select seam → 99 files / 1015 pass)
  - 1.6s — 2026-07-08 (M9 WP6a P3 F12 back-loop: dropped Most-used-tool stat + retuned palette → 89 files / 857 pass)
  - 1.5s — 2026-07-08 (M9 WP5 P3: +7 pickerTimeTrackingWiring.test.ts → 83 files / 813 pass)
  - 1.48s — 2026-07-08 (M9 WP4 P3 build: +5 timeAnalytics.test.ts [DTO shape + ?raw invoke-wiring guards] → 82 files / 806 pass)
  - 1.37s — 2026-06-28 (M6 WP8 static gate: 780 pass / 79 files, verification-only baseline)
  - 1.3s — 2026-06-28 (M6 WP7 P3 build: 731 pass / 75 files, +5 pickerYoloWiring guards)
  - 1.3s — 2026-06-28 (M6 WP7 P2 build: 726 pass / 74 files, +3 cc-yolo menuBridge + App.tsx wiring guards)
  - 1.3s — 2026-06-27 (M6 WP5 verify-codify: 719 pass / 74 files, +8 editorWrapToggle + wrap cases)
  - 1.3s — 2026-06-27 (M6 WP4 verify-codify: 711 pass / 73 files, +17 terminalFontZoom)
  - 1s — 2026-06-27 (M5 WP5 P2R tri-state rework verify-codify: 670 pass / 71 files)
  - 1s — 2026-06-27 (M5 WP5 Phase 1 verify-codify: 670 pass / 71 files, +1 menu-wiring guard)
  - 1s — 2026-06-26 (M5 WP4 Phase 5 verify-codify: 669 pass / 71 files)
  - 1s — 2026-06-26 (M5 WP4 Phase 4 verify-codify: 663 pass / 71 files)
  - 1s — 2026-06-26 (M5 WP4 Phase 3 verify-codify: 652 pass / 71 files)
  - 1s — 2026-06-26 (M5 WP4 P3 rebuild: +9 pipPanelSize (content-driven size); pip-scoped 49)
  - 1s — 2026-06-26 (M5 WP4 P2: 640 pass / 70 files, +3 switcher wiring guards)
  - 1s — 2026-06-26 (M5 WP4 P1: 637 pass / 70 files, +pipLayout (16) + WP4 wiring guards)
  - 1s — 2026-06-26 (M5 WP3 P3: 622 pass / 69 files, +9 mirrorFrameSharing + mirror guards)
  - 1s — 2026-06-26 (M5 WP3 P2: 610 pass / 68 files, +5 pipFanoutWiring guards)
  - 1s — 2026-06-26 (M5 WP3 P1: 600 pass / 66 files, +9 pipEntryWiring guards)
  - 1s — 2026-06-25 (QoL-WP8 P2: 591 pass, +7 stickyHeaderStacking)
  - 1s — 2026-06-25 (QoL-WP8 P1: 584 pass, +5 commitsCollapsedDefault)
  - 1s — 2026-06-25 (QoL-WP7 P2: 579 pass)
  - 1s — 2026-06-25 (QoL-WP7 P1: 573 pass)
  - 1s — 2026-06-25 (QoL-WP6 verify-codify: +8 newWorkspaceChord cases → 61 files / 562 tests; run ~1.05s)
  - 1s — 2026-06-25 (QoL-WP5 Phase 3 verify-codify: +11 ?raw wiring assertions → 60 files / 514 tests; run ~1.07s)
  - 1s — 2026-06-25 (QoL-WP5 Phase 2 verify-codify: +16 pure-seam tests → 59 files / 503 tests; run ~1.04s)
  - 1s — 2026-06-25 (QoL-WP1 Phase 3 verify-codify: +8 dirtyDocCount + closeWorkspaceSpec tests → 53 files / 456 tests)
  - 1s — 2026-06-25 (QoL-WP1 Phase 1 verify-codify: +6 closeWorkspace focus-repick tests → 52 files / 448 tests; run ~0.94s)
  - 1s — 2026-06-23 (M4 WP4b verify-codify: +5 focusHalf derivation tests → 49 files / 426 tests; run ~0.86s)
  - 1s — 2026-06-23 (M4 WP2 P4: +6 mapIpcError picker-error-surfacing tests → 39 files / 361 tests; run ~0.74s)
  - 1s — 2026-06-23 (M4 WP2 P1 codify: +1 3+-workspace generalization test → 38 files / 355 tests; run ~0.94s)
  - 1s — 2026-06-23 (M4 WP2 P1 build: +4 openWorkspace append/focus-existing + viewFor N>1 → 38 files / 354 tests; run ~0.78s)
  - 1s — 2026-06-22 (M4 WP1 verify-codify: 38 files / 350 tests, no new tests — throwaway probe phase; run ~0.73s)
  - 1s — 2026-06-21 (WP11 P4: +10 railWidth cases → 35 files / 337 tests; run ~0.73s)
  - 1s — 2026-06-21 (WP11 P3: +6 gitStatus cases → 34 files / 327 tests; run ~0.67s)
  - 1s — 2026-06-21 (WP11 P1: +4 cases → 33 files / 321 tests; run ~0.63s)
  - 1s — 2026-06-16

## pnpm lint

- **Last:** <1s (2026-07-28, M10.9 WP1 close: 0 errors, 1 pre-existing warning [XtermPane.tsx:464 exhaustive-deps])
- **Use timeout:** 120000
- **History:**
  - <1s — 2026-07-28
  - 1s — 2026-06-16

## tooling/autofire-timing/probe.sh --arm cc-ready --runs 5
- **Last:** 54s (2026-08-19)
- **Use timeout:** 141000
- **Note:** one delay arm, 5 cold CC spawns. A `--arm delay-sweep` run walks 6 delays and costs
  roughly 6x this — budget ~5 min and pass a timeout accordingly.
- **History:**
  - 54s — 2026-08-19

## python3 tooling/autofire-timing/test_probe.py

- **Last:** <1s (2026-08-04, M12 WP3 Phase 1 — 21 tests, pure predicate/verdict logic, no subprocess)
- **Use timeout:** 60000
- **History:**
  - <1s — 2026-08-04

## cargo test --test stale_dead_code_allows -- --ignored

The stale-`#[allow(dead_code)]` guard (paydown WP1, 2026-08-12). `#[ignore]`d because it shells out
to its own `cargo check` with `RUSTFLAGS="--force-warn dead_code"` — run it explicitly in the
per-phase verify-auto gate, alongside `clippy --all-targets`.

⚠️ First run after any change to the crate's non-test sources pays a **full recompile into a
separate target dir** (`target/force-warn-dead-code`, kept distinct so it does not invalidate the
ordinary build's cache — the two use different `RUSTFLAGS`). Warm runs are ~1s.

- **Last:** 33s cold / 0.65s warm (2026-08-12, paydown WP1: 9 attributes, all accurate → pass;
  mutation-proven by adding a stale attribute above `read_default_model`, which failed it and
  named `src/config_store/mod.rs:220`)
- **Use timeout:** 120000
- **History:**
  - 33s cold / 0.65s warm — 2026-08-12

## cargo test

- **Last:** 3.78s exec / 10.79s wall (2026-08-18, paydown WP1 close: full `cargo test -p claudesk`, **828 lib** + 16 hook_pl_output + 1 integration = **845 pass** / 0 fail, +1 ignored. ⚠️ **Exactly the M13 WP4 baseline** — WP1 is pure visibility narrowing with no behavior change, so an unchanged count IS the attribution. The load-bearing check for WP1 was not this suite but `clippy --all-targets -D warnings` plus two mutation probes: a green suite cannot distinguish a real narrowing from a no-op)
- **Prior:** 3.92s exec (2026-08-18, M13 WP4 verify-codify: full `cargo test -p claudesk`, **828 lib** + 16 hook_pl_output + 1 integration = **845 pass** / 0 fail, +1 ignored. ⚠️ **Exactly the WP3 close baseline** — WP4 touched no Rust, so an unchanged count IS the attribution. Run from `src-tauri/` with an explicit cargo PATH; the dev app was running but a running binary does not contend on the `target/` lock)
- **Prior:** 18.6s wall / 3.86s warm exec (2026-08-14, M13 WP1 Phase 1 verify-codify: full `cargo test -p claudesk`, **827 lib** + 16 hook_pl_output + 1 integration = **844 pass** / 0 fail, +1 ignored. Phase 1 touched no Rust — measurements + doc edits only — so this run's only job is attribution, and the count matches `CLAUDE.md`'s recorded 827. ⚠️ A verify-human finding claiming the app-quit clean-exit route had no caller was **retracted** this phase: the clear is implemented in `perform_quit_teardown` and covered by 4 tests. No code changed, so no count movement is expected or observed)
- **Prior:** 12s wall / 4.04s warm exec (2026-08-12, paydown WP1 verify-auto: full `cargo test -p claudesk`, **823 lib** + 16 hook_pl_output + 1 integration = **840 pass** / 0 fail, **+1 ignored**. Deleting the callerless `project_get_default_model` command left the lib count **unchanged at 823** — the right result, since no test drove it; that is the attribution. The new ignored test is `stale_dead_code_allows`, which is opt-in because it runs its own `cargo check`)
- **Prior:** 14s wall / 4.80s warm exec (2026-08-12, M12 WP5 Phase 1-3 verify-auto: full `cargo test -p claudesk`, **823 lib** + 16 hook_pl_output + 1 integration = **840 pass** / 0 fail. WP5 is frontend-only so far, so this run's job is attribution — the count matches WP4d exactly, confirming the guard work is inert to Rust)
- **Prior:** 8s wall / 4.30s warm exec (2026-08-11, M12 WP4d verify-auto: full `cargo test -p claudesk`, **823 lib** + 16 hook_pl_output + 1 integration = **840 pass** / 0 fail. WP4d touched no Rust at all, so this run's only job is attribution — the count matches WP4c's post-review close, confirming the doc edits are inert)
- **Use timeout:** 510000
- **History:**
  - 18.6s — 2026-08-14
  - 12s — 2026-08-12
  - 14s — 2026-08-12
  - 8s wall / 4.30s exec — 2026-08-11 (840 total; WP4d doc-only — run purely to prove inertness)
  - 7s wall / 3.84s exec — 2026-08-10 (838 total, unchanged; WP4c Phase 1 baseline — CSS-only change, run purely to fix attribution)
  - 7s wall / 3.93s exec — 2026-08-07 (838 total: 821 lib + 16 hook + 1; WP4b complete)
  - 7s wall / 4.18s exec — 2026-08-07 (817 lib pass, +7 WP4b Phase 2 spawn-env)
  - 9s wall / 5.5s exec — 2026-08-06 (810 lib pass, +11 WP4b drive-mode)
  - 8s wall / 4.0s exec — 2026-08-05 (781 lib pass, +4 round-trip)
  - 8s — 2026-08-04 (776 pass, warm)
  - 8s — 2026-08-04 (765 pass, warm)
  - 19s wall / 4.06s exec — 2026-08-03
  - 4.04s warm — 2026-07-31 (M11.5 WP1 P1; full run, 698 pass)
  - ~300s cold (estimate, backgrounded) — 2026-07-31 (WP3.5b P1; first post-`cargo clean` run)
  - 0.78s — 2026-07-29 (WP3 P4 verify-codify: +2, 581 lib)
  - 0.71s — 2026-07-29 (WP3 P1 verify-codify: +2, 579 lib)
  - 0.76s — 2026-07-29 (WP3 P1 build: +12, 577 lib)
  - 0.73s — 2026-07-28 (M10.9 WP2 P4 verify-codify: +1 milestone-invariant source guard [proven to bite by injecting a ~/.claude/skills path], 565 lib pass; warm)
  - 0.75s — 2026-07-28 (M10.9 WP2 P3 verify-codify: +1 settings_id membership pin [proven to bite where the 5 iterate-FUNCTIONAL_IDS tests do not], 564 lib pass; warm)
  - 0.74s — 2026-07-28 (M10.9 WP2 P1 verify-codify: +2 persistence-contract tests, 563 lib pass; warm)
  - 0.75s — 2026-07-28 (M10.9 WP2 P1 build: workflow_features_enabled field + workflow_gate module, 561 lib pass; warm)
  - 3.54s — 2026-07-28
  - 0.69s — 2026-07-20 (backlog-paydown WP7 P2 codify: +validate_root canonical-form-tolerance pin, 556 lib + 6 integ + 1 shell-history pass; warm)
  - 0.71s — 2026-07-20 (backlog-paydown WP7 P2 build: validate_root + AppHandle-injected commands, 555 lib + 6 integ + 1 shell-history pass; warm)
  - 0.86s — 2026-07-20 (backlog-paydown WP7 P1: leaf-symlink full-target canonicalize in resolve_within, 550 lib + 6 integ + 1 shell-history pass; warm)
  - 0.69s — 2026-07-20 (backlog-paydown WP6: surface change-point precompute + ACTIVECTX single-lock + hook privacy-test self-consistency, 547 lib + integ pass; warm)
  - 1.07s — 2026-07-20 (backlog-paydown WP5: dead-code cleanup + 8 targeted per-item allows, 547 lib pass; warm-ish)
  - 0.69s — 2026-07-20 (backlog-paydown WP3: query/reclassify dedup, 547 lib pass unchanged; warm)
  - 0.68s — 2026-07-19 (M10.5 WP4 P2 codify: color_tty_env +LANG/LC_ALL locale — 547 lib pass [+1 locale test], warm)
  - 0.92s — 2026-07-17 (M10 WP4 P2 build: +2 download-progress tests, 547 lib + 6 integ pass; warm)
  - 0.72s — 2026-07-17 (M10 WP4 P1 build: +6 updater-prefs tests, 545 lib + 6 integ pass; warm)
  - 0.82s — 2026-07-17 (M10 WP3 verify-codify: full lib 539 pass + 6 integ pass; warm)
  - 0.58s — 2026-07-17 (M10 WP3 verify-auto: +9 updater tests [install_source detection + brew-defer command shape], 539 lib pass; warm)
  - 0.76s — 2026-07-17 (M10 WP1 P2 verify-codify; warm, 530 lib pass, +6 updater_probe tests)
  - 0.81s — 2026-07-17 (M10 WP1 P1 verify-codify regression; warm, 524 lib pass, no new tests)
  - 1s — 2026-07-15 (M9 WP6c-2 P1; warm, 523 lib pass)
  - 3.74s — 2026-07-14 (M9 WP6b-3 P1; cold-ish first compile)
  - 0.72s — 2026-07-08 (M9 WP5 P1; warm)
  - 0.72s — 2026-07-08 (M9 WP5 P1: +7 tracking-toggle tests [time_tracking_enabled settings + write-gate seam], 463 lib + 5 integ = 468 pass; warm)
  - 0.80s — 2026-07-08 (M9 WP4 P3 build: +7 time_store::commands tests [time_analytics_query], 457 lib + 5 integ = 462 pass; warm)
  - 1.00s — 2026-07-08 (M9 WP4 P2 build: +15 time_store::query tests [day/range/week builders + snake_case DTO key-shape], 450 lib + 5 integ = 455 pass; warm. Cold compile of the new chrono dep was ~12s.)
  - 0.72s — 2026-07-08 (M9 WP4 P1 build: +2 reclassify tests [surface_tie_break_is_last_wins_same_ms, trailing_open_await_is_bounded_at_window_end_not_dropped], 435 lib pass; warm)
  - 0.69s — 2026-07-07 (M9 WP2.5 P4 codify [FINAL]: +4 tests [launch tool-id all 3, launch gate-off, ActiveSurface attribution, surface-change detect], 367 lib + 5 integ = 372 pass; warm)
  - 0.70s — 2026-07-07 (M9 WP2.5 P3 codify: +3 tests [keystroke privacy SECRETKEYS, gate on/off, count+attribution], 363 lib + 5 integ = 368 pass; warm)
  - 0.79s — 2026-07-07 (M9 WP2.5 P2 codify: +4 tests [set_active_context round-trip/clear, focus-row attribution, empty-context blur], 360 lib + 5 integ = 365 pass; warm)
  - 0.73s — 2026-07-07 (M9 WP2.5 P1 build: +11 native-signal tests [NativeSignal/native_row/write_native_gated: round-trip, privacy-on-structured-fields, now_ms sanity, gate-off zero-IO], 356 lib + 5 integ = 361 pass; warm)
  - 0.69s — 2026-07-07 (M9 WP2 P3 codify: +1 fan-out gate-OFF stream test [socket_stream_fans_out_but_gate_off_writes_nothing], 345 lib + 5 integ = 350 pass; warm)
  - 0.75s — 2026-07-07 (M9 WP2 P2 codify: +time_store module 17 tests [15 build + 2 real-file WAL/persist codify], 341 lib + 5 integ = 346 pass; warm)
  - 0.72s — 2026-07-07 (M9 WP2 P1 codify: +5 hook_pl_output integration tests [Perl hook output + privacy invariant], 324 lib + 5 integ = 329 pass; warm)
  - 0.69s — 2026-06-29 (M7 WP2 codify: +toggle_pip_cycles + tray_menu_ids_route tests, 302 pass; warm)
  - 0.69s — 2026-06-29 (M7 WP1 codify: +1 DTO serde round-trip test, 300 pass; warm)
  - 40s — 2026-06-29 (M7 WP1 build: +4 tray tests, 299 pass; cold compile of new tray-icon + image-png deps ~40s, run ~0s)
  - 0.69s — 2026-06-28 (M6 WP8 static gate: 295 pass, verification-only baseline)
  - 1s — 2026-06-28 (M6 WP9 codify: +len_tracks_open_workspace_count + on_mode/arm_summon count tests, 295 pass; warm 0.69s)
  - 1s — 2026-06-28 (M6 WP7 P1 codify: +1 cc_yolo_absent_in_present_file test, 291 pass; warm 0.68s)
  - 4s — 2026-06-28 (M6 WP7 P1 build: +5 cc_yolo/build_cc_argv tests, 290 pass; cold-ish compile ~3.5s, run 0.71s)
  - 0.67s — 2026-06-28 (WP6 P2 codify, 285 pass)
  - 0.72s — 2026-06-28 (WP6 P1 codify, 283 pass)
  - 0.64s — 2026-06-27 (m5-wp5, 266 pass)
  - 1s — 2026-06-27 (m5-wp5 MAJOR-findings refactor: View-menu checkmark refresh; 266 pass, no behavior change)
  - 1s — 2026-06-27 (M5 WP5 P2 tri-state rework: 266 pass, pip_mode enum)
  - 1s — 2026-06-27 (M5 WP5 P2 build: 264 pass, +6 settings + pip state-machine)
  - 1s — 2026-06-26 (M5 WP4 P2: 258 pass, +9 layout enum + settings store)
  - 3s — 2026-06-26 (M5 WP2 verify-codify: 249 pass, no new tests — probe deliverable is the wbs.md verdict; dev-only mcp-bridge wiring compiles under debug_assertions w/ no test regression)
  - 5s — 2026-06-25 (M5 WP1 verify-codify: 249 pass, no new tests — probe knowledge artifact is the wbs.md verdict)
  - 7s — 2026-06-25 (QoL-WP5 Phase 1 build: delete_file_core + delete_file command + IsDirectory variant; +6 editor_fs tests, 237 pass; warm recompile)
  - 6s — 2026-06-25 (QoL-WP2 Phase 2 build: Notification gated on notification_type; +7 tests, 231 pass; warm recompile)
  - 7s — 2026-06-25 (QoL-WP2 Phase 1 build: PostToolUse→Running + CLAUDESK_EVENTS 3→4; +3 tests, 224 pass; warm recompile)
  - 4s — 2026-06-25 (QoL-WP1 Phase 2 verify-auto: no new Rust — frontend-only unmount-kill; 221 pass, no regression; warm run 0.62s)
  - 6s — 2026-06-24 (QoL-WP0 fs-watcher Phase 1 — new fs_watch module, 13 unit tests incl. ignore-filter + FsChange snake_case DTO, 221 pass)
  - 5s — 2026-06-24 (app-menu-bar Phase 1 codify — new app_menu module, 3 unit tests incl. FUNCTIONAL_IDS uniqueness, 208 pass)
  - 6s — 2026-06-23 (M4 WP2 P4 — +1 registry_generalizes_to_n_gt_1 test, 186 pass)
  - 6s — 2026-06-23 (M4 WP2 P3 codify — +1 kill_all_is_best_effort test (FailingSession double), 185 pass)
  - 6s — 2026-06-23 (M4 WP2 P3 — +1 kill_all_runs_grace_windows_in_parallel test, 184 pass; FakeSession gained a kill_delay seam)
  - 5s — 2026-06-22 (M3 WP4 P1 — +14 status_broadcaster tests, 178 pass; warm recompile + run ~0.63s)
  - 9s — 2026-06-22 (M3 WP2 P1 — +13 hook_install tests, 151 pass)
  - 8s — 2026-06-22 (WP11 path-keying task: +2 nested-workspace tests → 138 pass; recurse_untracked_dirs fix, no new deps)
  - 8s — 2026-06-21 (WP11 P2: new git_status module, +8 status_map_core tests → 136 pass; reuses git2/git_diff, no new deps)
  - 4s — 2026-06-21 (warm, WP12 P1: +4 stat_file_core tests → 111 pass; no new deps, serde already present)
  - 5s — 2026-06-20 (warm, WP10 P1: +8 walk_tree_core tests → 90 pass; no new deps, reused ignore crate)
  - 30s — 2026-06-20 (cold build, WP6 P1: +9 fs_index tests → 82 pass; ignore 0.4.26 dep tree compiled, test run itself ~0.37s)
  - 6s — 2026-06-20 (warm, WP5 P1: +4 merge_command tests → 71 pass; sublime module generalized for Sublime Merge)
  - 7s — 2026-06-20 (warm, WP4 Phase A: +12 tests → 72 pass; git_diff hunks + commit log/diff)
  - 21s — 2026-06-20 (cold build, WP4 git_diff: +13 tests → 60 pass; git2 0.21 linked fast, no slow C compile)
  - 6s — 2026-06-19 (warm rebuild, WP9 P1.1/P1.3: +6 tests → 35 pass; test run itself ~0s)
  - 8s — 2026-06-19 (cold build of WP8 global-shortcut dep tree: 31 tests pass; test run itself ~0s)
  - 11s — 2026-06-19 (cold build of WP7 cc_session dep tree; test run itself ~0s warm)
  - 17s — 2026-06-18 (cold; new dep tree from WP6 — incremental runs are ~2s)
  - 2s — 2026-06-16

## npm run pip (tooling/demo)
- **Last:** 19s (2026-06-29, round-3 10s loop)
- **Use timeout:** 180000
- **History:**
  - 19s — 2026-06-29 (round-4: +mouse react + 1+⏎ keycap, 10s/150 frames)
  - 19s — 2026-06-29 (round-3 re-author: 10s loop, 150 frames, region-switch ending)
  - 18s — 2026-06-29 (round-2 re-author: 9s loop, 135 frames)
  - 16s — 2026-06-29
