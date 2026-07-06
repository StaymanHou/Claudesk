---
shape: runtime-registry
updated: 2026-07-02  # /release v0.2.5 cold tauri build 88s
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

## pnpm vite build

- **Last:** 2s (2026-07-06, mirror-fill-from-bottom verify-self: built in 1.96s — frontend-only `pnpm vite build`)
- **Use timeout:** 180000
- **History:**
  - 1.96s — 2026-07-06 (mirror-fill-from-bottom)
  - 1.10s — 2026-06-28 (WP6 P3)

## pnpm install

- **Last:** 3s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 3s — 2026-06-16

## pnpm tauri dev

- **Last:** 65s (2026-06-27, WP3 verify-self: cold-ish rebuild after source change — recompiled claudesk + plugins, ~65s to MCP-bridge bind + window)
- **Use timeout:** 600000
- **History:**
  - 65s — 2026-06-27 (WP3 P1 verify-self; cold-ish: source changed since last build, full claudesk + plugin recompile to bridge bind)
  - 15s — 2026-06-20 (warm rebuild after WP4 git2 add; cargo recompiled claudesk + plugins, ~14.8s)
  - 29s — 2026-06-16 (first compile; incremental rebuilds will be faster)

## pnpm tauri build

- **Last:** 88s (2026-07-02, /release v0.2.5: COLD build after `cargo clean` removed 6.9GiB — full dep-tree recompile incl. tauri-nspanel + .app + .dmg; rust ~63s + bundle)
- **Use timeout:** 600000
- **History:**
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

- **Last:** 47s (2026-06-30, debt-paydown WP1: cold-ish rebuild after removing the `ignore` dep — dependency-graph re-resolve + full relink; 46.76s)
- **Use timeout:** 131000
- **History:**
  - 47s — 2026-06-30 (debt-paydown WP1: dep removal forced re-resolve + relink, 46.76s)
  - 1s — 2026-06-29 (M7 WP1: warm rebuild, tray module + features already compiled)
  - 12s — 2026-06-27 (M5 WP5 Phase 1 compile gate: pip_set_visible/teardown/focus-probe/menu item)
  - 10s — 2026-06-26 (M5 WP3 P1: warm rebuild after pip module rename — compile gate)
  - 50s — 2026-06-25 (M5 WP1: tauri-nspanel v2.1.0 @a3122e89 fetch + compile vs tauri 2.11.2, clean)

## pnpm test

- **Last:** 1.37s (2026-06-28, M6 WP8 static gate: 780 pass / 79 files, no new tests — verification-only WP baseline)
- **Use timeout:** 120000
- **History:**
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

- **Last:** 1s (2026-06-16)
- **Use timeout:** 120000
- **History:**
  - 1s — 2026-06-16

## cargo test

- **Last:** 0.69s (2026-06-29, M7 WP2 verify-codify: +tray menu toggle + routing tests → 302 pass; warm run 0.69s)
- **Use timeout:** 120000
- **History:**
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
- **History:**
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
