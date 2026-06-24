---
shape: runtime-registry
updated: 2026-06-24  # app-menu-bar P1 codify — cargo test 208 pass
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
-->

## pnpm install

- **Last:** 3s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 3s — 2026-06-16

## pnpm tauri dev

- **Last:** 15s (2026-06-20, warm rebuild incl. git2 dep for WP4; window launched)
- **Use timeout:** 600000
- **History:**
  - 15s — 2026-06-20 (warm rebuild after WP4 git2 add; cargo recompiled claudesk + plugins, ~14.8s)
  - 29s — 2026-06-16 (first compile; incremental rebuilds will be faster)

## pnpm tauri build

- **Last:** 78s (2026-06-24, /release v0.1.1: COLD build after `cargo clean` — full dep-tree recompile + .app + .dmg)
- **Use timeout:** 600000
- **History:**
  - 78s — 2026-06-24 (/release v0.1.1 cold build: cargo clean removed 24.4GiB, full recompile ~49s + bundle)
  - 32s — 2026-06-24 (dev-prod-isolation Phase 2 verify-human: prod .app for the concurrent test)
  - 40s — 2026-06-16

## pnpm test

- **Last:** 1s (2026-06-23, M4 WP4b: 426 pass, +5 focusHalf tests)
- **Use timeout:** 120000
- **History:**
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

- **Last:** 1s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 1s — 2026-06-16

## cargo test

- **Last:** 5s (2026-06-24, app-menu P1 codify: +1 functional-id uniqueness test → 208 pass; warm recompile + run ~0.66s)
- **Use timeout:** 120000
- **History:**
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
