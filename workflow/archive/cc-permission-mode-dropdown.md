---
drive_mode: orchestrated
---

# Feature: CC Permission-Mode Dropdown (replace yolo checkbox)

**Workflow:** feature
**State:** Completed 2026-07-02 (shipped 1624e2e; review-quality clean 0C/0M/3-MINOR-backlogged; finalized)
**Created:** 2026-07-02
**Entry:** spec (complex feature) — retro-captured

## Problem Statement

Claudesk's project-selection screen has a single binary "Skip Permission Prompts (yolo)" checkbox that maps CC sessions onto only two of Claude Code's permission behaviors (`--dangerously-skip-permissions` on/off). A friend of the operator asked for the full choice — all six of CC's `--permission-mode` values (`default`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`) surfaced as a dropdown, with the preference persisted app-globally and mirrored in the native View menu. Replace the checkbox with a labeled `<select>`, migrate existing `cc_yolo` users, and convert the View-menu checkbox into a 6-item radio submenu.

## User Stories
- As a Claudesk user, I want to pick any of CC's six permission modes on the picker screen so that a new CC session spawns under exactly the permission posture I want (not just yolo on/off).
- As an existing user with a persisted `cc_yolo` boolean, I want my prior choice preserved on upgrade (yolo-on → bypassPermissions, yolo-off → default) so nothing changes silently under me.
- As a user, I want the native View-menu "Permission Mode ▸" radio and the picker dropdown to always agree, so there is one source of truth.

## Acceptance Criteria
- The picker renders a labeled `<select>` (testid `picker-permission-mode`) with all 6 modes in coarse→permissive order; the yolo checkbox is gone.
- The selection is seeded from `cc_get_permission_mode`, kept in sync via the `cc-permission-mode` broadcast, and persisted via `cc_set_permission_mode` on change (optimistic-set + revert + error-toast on failure).
- The View menu shows a "Permission Mode" submenu of 6 radio-style check items mirroring the dropdown; exactly one is checked; a menu pick or a dropdown change re-checks both surfaces.
- Default (unset / first run) = `default`. Legacy `cc_yolo` migrates: `true`→`bypassPermissions`, `false`→`default`. `cc_permission_mode` (explicit field) wins over legacy `cc_yolo`; a write clears the legacy field.
- A spawned CC session runs `claude --permission-mode <value>` for the persisted mode (verified at the argv-build unit level; live-spawn behavior carried to verify-human / release).
- No dangling references to the old yolo names (`cc_yolo`, `cc-yolo`, `cc_get_yolo`, `cc_set_yolo`, `ccYolo`, `CC_YOLO`, `picker-yolo`) remain in `src/` (docs/history mentions are fine).

## Out of Scope
- Per-project permission modes (the setting is app-global; matches the prior yolo behavior).
- Changing the effect on already-running sessions (mode is chosen once per CC process; takes effect next spawn — unchanged from yolo).
- Any change to CC's own permission semantics; Claudesk only selects the `--permission-mode` value.

## Technical Constraints
- No 3rd-party API — `--permission-mode` is a local CLI flag (`claude`); the six tokens come from `claude --help`. No probe WP needed.
- The mode string is a single wire contract byte-identical across three layers: Rust `CcPermissionMode` serde rename ↔ persisted `projects.json` ↔ CC's `--permission-mode` token ↔ the TS `CcPermissionMode` union. Any label/value edit must stay synchronized on both sides.
- Dark-mode-only UI (project convention); reuse the existing `.picker-yolo` styling shape.
- `cc_set_permission_mode` IPC param is named `mode` (`invoke("cc_set_permission_mode", { mode })`).

## Work Tree

- [x] Phase 1: Backend — permission-mode enum, settings + migration, commands, native menu  <!-- status: DONE (pre-built + verify-auto GREEN: cargo test 318 pass, clippy clean, fmt clean) -->
  **(Already built + compiling before this workflow was wrapped around it. This phase's job here is to VERIFY, not re-implement.)**
  **Observable outcomes:**
  - CLI: `cargo test` (backend) passes, including the new `cc_argv_passes_permission_mode_for_every_variant`, `cc_permission_mode_serde_matches_cli_tokens`, `legacy_cc_yolo_true_migrates_to_bypass_permissions`, `legacy_cc_yolo_false_migrates_to_default`, `cc_permission_mode_wins_over_legacy_cc_yolo`, `write_cc_permission_mode_clears_legacy_cc_yolo`, and `cc_permission_mode_ids_are_functional_and_cover_every_variant` tests.
  - CLI: `cargo clippy -- -D warnings` clean; `cargo fmt --check` clean.
  - CLI (backend argv unit): each `CcPermissionMode` variant builds argv `["claude","--permission-mode",<value>]` with the value byte-matching the serde rename.
  - [x] P1.1 `CcPermissionMode` enum + `as_flag_value` + `build_cc_argv` threading (cc_session/mod.rs)  <!-- status: DONE (pre-existing) -->
  - [x] P1.2 settings: `cc_permission_mode` field + `cc_yolo` legacy + `read/write/resolve` migration (config_store/settings.rs)  <!-- status: DONE (pre-existing) -->
  - [x] P1.3 commands: `cc_get_permission_mode`/`cc_set_permission_mode` + `CC_PERMISSION_MODE_EVENT` (cc_session/commands.rs)  <!-- status: DONE (pre-existing) -->
  - [x] P1.4 lib.rs invoke_handler + menu-sync listener rewire  <!-- status: DONE (pre-existing) -->
  - [x] P1.5 app_menu: `CcPermissionModeMenuItems` + `CC_PERMISSION_MODE_ITEMS` + View submenu build  <!-- status: DONE (pre-existing) -->
  - [x] verify-auto  <!-- status: NOT-STARTED -->
  - [x] verify-self  <!-- status: N/A — backend-only phase; live behavior carried into Phase 2 verify-self + verify-human -->
  - [x] verify-human  <!-- status: DEFERRED into Phase 2 (single combined human pass) -->
  - [x] verify-codify  <!-- status: pre-existing backend tests are the codification; verify-auto confirms they pass -->

- [x] Phase 2: Frontend — finish menu bridge, App handler, picker dropdown, tests, CSS, reconcile  <!-- status: DONE (verify-auto/self/human/codify all complete) -->
  **Observable outcomes:**
  - CLI: `pnpm tsc --noEmit` (or `pnpm build`'s tsc step) passes — the current `ccYoloToggle`/`CC_YOLO_TOGGLE` dangling refs in menuBridge.ts are resolved.
  - CLI: `pnpm lint` clean; `pnpm vitest run` passes (rewritten menuBridge + picker wiring tests); `pnpm vite build` succeeds.
  - Browser (bridge verify-self): picker renders a `<select data-testid="picker-permission-mode">` with 6 options; selecting a mode persists (survives reload) and the value round-trips via `cc_get_permission_mode`.
  - Browser (bridge verify-self): the native View-menu "Permission Mode" submenu shows 6 radio items; the checked item mirrors the dropdown after a change on either surface.
  - CLI: `grep -rE 'cc_yolo|cc-yolo|cc_get_yolo|cc_set_yolo|ccYolo|CC_YOLO|picker-yolo' src/` returns no functional references (only historical comments if any are intentionally kept — target zero).
  - [x] P2.1 menuBridge.ts: setCcPermissionMode callback carrying mode; 6 CC_MODE_* cases  <!-- status: DONE -->
  - [x] P2.2 App.tsx: removed ccYoloRef; menu handler invokes cc_set_permission_mode with carried mode  <!-- status: DONE -->
  - [x] P2.3 ProjectPicker.tsx: <select data-testid="picker-permission-mode"> seeded/synced/persisted + coerce  <!-- status: DONE -->
  - [x] P2.4 rewrote pickerPermissionModeWiring.test.ts (renamed) + menuBridge.test.ts CC section  <!-- status: DONE -->
  - [x] P2.5 App.css: .picker-yolo → .picker-permission-mode for the select  <!-- status: DONE -->
  - [x] P2.6 repo-wide reconcile — only intentional negative-assertion strings remain in tests  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: GREEN — tsc clean, eslint 0-errors, vitest 789 pass, vite build ok, cargo test 318 pass -->
  - [x] verify-self  <!-- status: PASS (render tier, bare-Vite Playwright); backend-coupled tier CARRIED to verify-human -->
    - [x] Picker renders <select data-testid="picker-permission-mode"> — SELECT, 6 options, coarse→permissive order, labels match Rust; default selected; old picker-yolo checkbox GONE; no React crash (all console errors are the expected bare-Vite IPC-unavailable pattern, not this change)  <!-- status: PASS -->
    - [x] CARRIED to verify-human: persistence round-trip; cc-permission-mode broadcast sync; View-menu radio; spawn argv — all PASS at verify-human  <!-- status: PASS -->
  - [x] verify-human  <!-- status: ALL PASS (operator, live pnpm tauri:dev, 2026-07-02) -->
    - [x] P2.verify-human.1: persistence — non-default mode survives quit+relaunch  <!-- status: PASS -->
    - [x] P2.verify-human.2: cross-surface sync — View menu ↔ picker dropdown agree both directions  <!-- status: PASS -->
    - [x] P2.verify-human.3: View-menu submenu — exactly 6 radio items, one checked, labels mirror dropdown  <!-- status: PASS -->
    - [x] P2.verify-human.4: spawn — CC runs under --permission-mode <value> (dev-build observed; installed-.app PATH parity DEFERRED-TO-RELEASE)  <!-- status: PASS (dev) / DEFERRED-TO-RELEASE (installed) -->
  - [x] verify-codify  <!-- status: DONE — backend tests already codify behavior; added src/cc/__tests__/permissionMode.test.ts (5 tests) for the pure wire-contract module + coerce fallback gap. Full suites green: vitest 794 pass / 80 files, cargo test 318 pass -->

## Current Node
- **Path:** Feature > finalize (complete) → EXIT
- **Active scope:** none — feature closed, archived
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** none (3 MINOR code-quality findings backlogged to backlog-quality-findings.md)

## Manual Verification — Phase 2 (operator drove `pnpm tauri:dev`, ALL PASS 2026-07-02)
<!-- Integration boundary APPLIES → checklist required. Render-tier items PASSED in verify-self and were excluded. Backend-coupled tier below all PASSED live. -->
- [x] P2.verify-human.1: persistence — non-default mode survives quit+relaunch  <!-- status: PASS -->
- [x] P2.verify-human.2: cross-surface sync — View menu ↔ picker dropdown agree both directions  <!-- status: PASS -->
- [x] P2.verify-human.3: View-menu submenu — exactly 6 radio items, one checked, labels mirror dropdown  <!-- status: PASS -->
- [x] P2.verify-human.4: spawn — CC runs under --permission-mode <value> (dev observed; installed-.app PATH parity DEFERRED-TO-RELEASE)  <!-- status: PASS -->

## Code-Quality Review — cc-permission-mode-dropdown
*(feature-review-quality on ship commit 1624e2e; Mode 2 orchestrated. 0 CRITICAL / 0 MAJOR / 3 MINOR — auto-backlogged to backlog-quality-findings.md.)*

### Strengths
- Wire contract enforced + verified end-to-end (Rust serde renames ↔ TS union ↔ CC's real `--permission-mode` choice set, byte-for-byte).
- Legacy `cc_yolo` migration split into pure `resolve_cc_permission_mode` + exhaustively unit-tested (precedence, both boolean mappings, write-clears-legacy).
- `coerceCcPermissionMode` gives honest fallback at every read boundary, with a test that the OLD "yolo" vocabulary does NOT round-trip.
- `CC_PERMISSION_MODE_ITEMS` single source of truth for menu build + refresh; test pins all six variants.
- Refactor from invert-current yolo toggle to self-describing per-item mode let App.tsx drop the `ccYoloRef` effect entirely — genuine simplification, not just a rename.

### Issues
**CRITICAL** — (none)
**MAJOR** — (none)
**MINOR**
- [src-tauri/src/cc_session/mod.rs ~205] `build_cc_argv` emits `--permission-mode default` for `Default`; the "harmless no-op" claim is load-bearing but rests on an untested CC-CLI assumption. Documentation-hardening (live spawn IS verify-human-covered), not a gap.
- [src/components/picker/ProjectPicker.tsx 207-222] `<select>` a11y name via implicit label nesting only; an explicit `aria-label` or label testid would make it refactor-resilient. Cosmetic.
- [src-tauri/src/cc_session/mod.rs ~55-70] `Auto`/`DontAsk` doc comments are bare restatements ("CC's `auto` mode") vs. the WHY the other variants carry. Trivial.

### Assessment
Well-built feature that advances the codebase. The permission-mode string-drift risk across the IPC boundary is closed with parallel tests on both sides matching CC's real choice set. The migration is the standout: pure, precedence-correct, self-cleaning, six focused tests. All findings MINOR; none warrant a refactor pass.

### If you disagree
Operator: dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP.

## Retrospect
- **What changed in our understanding:** Nothing about the requirements — decisions were locked with the operator before the workflow started (6 modes, default=default, migration mapping, menu submenu). The one thing that surfaced: the pre-built backend carried two latent gate failures the retro-capture wrapping exposed — 3 clippy `doc_lazy_continuation` errors (a doc line starting with `+` parsed as a markdown list) and repo-wide `cargo fmt` drift — neither caught before because the backend was committed against `cargo build`, not the full ship gate.
- **Assumptions that held:** the frontend was exactly the described remaining work (menuBridge dangling type, App.tsx ref, picker checkbox→select, CSS, 2 tests); the "menu carries the target mode, no invert" design let App.tsx *lose* the `ccYoloRef` effect entirely rather than rename it; bare-Vite Playwright could prove the render tier while the operator drove the backend-coupled tier.
- **Assumptions that were wrong:** I expected the tauri MCP bridge to be usable for live verify-self of persistence/menu-sync; the `mcp__tauri__*` tools were not loaded in this session (bootstrap-skip), so I fell back to bare-Vite render-tier verify-self + carried the backend-coupled tier to verify-human — which passed.
- **Approach delta:** matched the plan. Added one unit-test file (`permissionMode.ts`) at verify-codify that wasn't in the original task list — a genuine coverage gap (the pure wire-contract module + coerce fallback) the pre-built backend tests didn't reach.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary> -->
- [SURFACED-2026-07-02] Phase 2 — retro-capture: menuBridge.ts did not typecheck on entry (MenuCallback/menuActionFor still referenced removed CC_YOLO_TOGGLE); P2.1 resolved it. Expected pre-existing state, not a regression.
- [SURFACED-2026-07-02] Phase 1 — pre-built backend had 3 clippy doc_lazy_continuation errors + repo-wide cargo-fmt drift the retro-capture ship gate exposed; fixed (doc reword + `cargo fmt`). The fmt run also normalized unrelated pre-existing drift in fs_watch/status_broadcaster/status_log/tray (whitespace-only).
