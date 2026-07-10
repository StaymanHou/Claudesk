# Feature: M9 WP5 — Tracking toggle (universal-vs-workflow-coupled feature flag, default OFF)

**Workflow:** feature
**State:** COMPLETED
**Created:** 2026-07-08
**Completed:** 2026-07-08
**Drive mode:** autopilot

## Problem Statement

The M9 time-analytics write path is built but dormant: `time_store::commands::tracking_enabled(_app)` is a hardcoded `false` (`commands.rs:163`), so both write paths — `TimeStore::write_gated` (CC-hook rows) and `write_native_gated` (WP2.5 native-signal rows) — are zero-IO no-ops. WP5 replaces that hardcoded body with a read of a **persisted** `time_tracking_enabled` flag (**default OFF** — M9 decision 2, zero cost for users who don't want tracking), establishing the **universal-vs-workflow-coupled feature-flag pattern**. This feature is *universal* (it observes generic CC lifecycle + native signals, not workflow skills), so the toggle is a plain app-global setting, not gated on workflow-system presence. Persistence reuses the existing `AppSettings`/`settings.json` surface (the `pip_mode`/`cc_permission_mode` read-modify-write + get/set-command pattern), bundle-identity-isolated (`com.claudesk.app` vs `.dev`). A Settings UI toggle lands in the picker (the existing FE settings surface, beside the permission-mode dropdown). The WP6 dashboard tab's "enable tracking to see analytics" empty-state consumes WP5's read command — WP5 delivers the *state seam* (a `time_get_tracking_enabled` command + a broadcast on change); the tab render itself is WP6's.

## Work Tree

- [x] Phase 1: Persist the flag + flip the write-gate (backend)  <!-- status: DONE — all impl + verify nodes complete -->
  **Relevance check (Phase 1 → Phase 2):**
  - Requester still needs this: yes — WP5 is on the M9 critical path before WP6.
  - Requirements unchanged: yes — persistence + gate flip landed exactly as planned.
  - Solution still feasible: yes — Phase 2 (commands) mirrors the proven cc_get/set_permission_mode pattern.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo test -p claudesk time_tracking` (or the settings/time_store test modules) exits 0; new tests prove: default reads `false` on a missing/empty settings file; round-trips each of `true`/`false`; a write preserves the other `AppSettings` fields (`pip_mode`/`cc_permission_mode`/`pip_layout` untouched); and `tracking_enabled(app)` returns the persisted value.
  - CLI: `cargo build -p claudesk` exits 0 — `tracking_enabled` now resolves the data dir + reads the flag (no longer a hardcoded `false`); every `write_gated`/`write_native_gated` call-site is unchanged (single hook-point body swap, verified by grep that only `tracking_enabled`'s body changed).
  - CLI: contract test — a `HookEvent` (or `NativeSignal`) drained while the flag is OFF writes **zero** rows (assert row count unchanged); flag ON → exactly one row written. Reuses the existing `time_store` test harness (in-memory / tempdir SQLite).
  - [x] P1.1 Add `time_tracking_enabled: Option<bool>` to `AppSettings` (`config_store/settings.rs`) as a new optional field (`#[serde(default, skip_serializing_if = "Option::is_none")]`), mirroring `pip_mode`. Add `read_time_tracking_enabled(data_dir) -> bool` (default `false` when unset) + `write_time_tracking_enabled(data_dir, bool)` (read-modify-write, preserves other fields), mirroring `read_pip_mode`/`write_pip_mode`.  <!-- status: DONE — field + read/write helpers added; write helper has a scoped #[allow(dead_code)] until Phase 2 wires its command caller -->
  - [x] P1.2 Replace the `tracking_enabled(_app)` body in `time_store/commands.rs`: resolve the data dir via `config_store::commands::resolve_data_dir(app)` and return `read_time_tracking_enabled(&dir)`, defaulting `false` on any error (never fail the drain — a settings read error must degrade to OFF, not panic the drain thread). Change `_app` → `app` (now used).  <!-- status: DONE — body reads persisted flag; degrades to false on resolve/read error -->
  - [x] P1.3 Unit tests in `settings.rs` (default-false, round-trip, field-independence) + a `time_store` contract test (OFF → zero rows, ON → one row) reusing the existing drain/write harness.  <!-- status: DONE — 4 settings tests + 2 time_store gate tests (renamed the stale WP2-default test to the WP5-wired seam); 462 lib + 5 integ green, clippy clean -->
  - [x] verify-auto  <!-- status: DONE — 6/6 tracking tests green (scoped), clippy -D warnings clean on the lib -->
  - [x] verify-self  <!-- status: DONE — fresh runner subagent re-verified all 4 CLI outcomes PASS (6 tests, build 0, contract both-ways, clippy -D warnings 0 w/ forced recompile). Integration boundary = the WP3 drain consuming tracking_enabled — a backend-process surface (operator-only at live tier per CLAUDE.md); its behavior is cited by the contract test tracking_gate_reflects_persisted_flag_both_ways. No web/HTTP/CLI-app surface at Phase 1. -->
  - [ ] verify-human  <!-- status: NOT-STARTED -->
  - [x] verify-human  <!-- status: DONE — AUTO-SKIPPED per drive_mode=autopilot; no integration boundary (backend-only isolated artifacts, no human-observable consuming surface at Phase 1), verify-self all-PASS. Live toggle→write behavior surfaces at Phase 3 verify-self via MCP bridge. -->
  - [x] verify-codify  <!-- status: DONE — no boundary; existing 6 tests cover the verified behaviors; added 1 gap test (tracking_gate_degrades_to_off_on_malformed_settings — drain-safety contract). Full suite 463 lib + 5 integ = 468 green, no regressions. The live app→dir resolution hop in tracking_enabled (needs AppHandle) is carried to Phase 3 MCP-bridge verify-self. -->
    - [x] gap: drain-safety degradation contract (malformed settings → gate OFF, never propagate)  <!-- status: DONE -->

- [x] Phase 2: Expose get/set Tauri commands + broadcast  <!-- status: DONE — all impl + verify nodes complete -->
  **Relevance check (Phase 2 → Phase 3):**
  - Requester still needs this: yes — the picker toggle (Phase 3) is the user-facing surface WP5 exists to deliver.
  - Requirements unchanged: yes — commands + broadcast landed as planned; FE will consume them.
  - Solution still feasible: yes — Phase 3 mirrors the proven pickerPermissionMode seed+listen+optimistic-set pattern.
  - No superior alternative discovered: yes.
  **Verdict:** proceed
  **Observable outcomes:**
  - CLI: `cargo build -p claudesk` exits 0; `time_get_tracking_enabled` + `time_set_tracking_enabled` are registered in `lib.rs`'s `invoke_handler![…]` (grep confirms both listed).
  - CLI: `cargo test -p claudesk` exits 0 — command-level test (or the settings round-trip already covers the persistence; the command is a thin wrapper like `cc_get/set_permission_mode`).
  - Console/Bridge (verify-self, live): via the MCP bridge, `__TAURI_INTERNALS__.invoke('time_get_tracking_enabled')` returns `false` on a fresh dev profile; after `invoke('time_set_tracking_enabled', {enabled: true})`, a subsequent get returns `true`; a `time-tracking-enabled` event fires on set (poll a webview-installed listener).
  - [x] P2.1 Add `time_get_tracking_enabled(app) -> Result<bool, String>` and `time_set_tracking_enabled(app, enabled: bool) -> Result<(), String>` to `time_store/commands.rs`, mirroring `cc_get_permission_mode`/`cc_set_permission_mode`: get reads via `read_time_tracking_enabled`; set writes via `write_time_tracking_enabled` then `app.emit(TIME_TRACKING_ENABLED_EVENT, enabled)`. Define `pub const TIME_TRACKING_ENABLED_EVENT: &str = "time-tracking-enabled";`.  <!-- status: DONE — both commands + event const added; Emitter imported; +1 event-name pin test -->
  - [x] P2.2 Register both commands in `lib.rs` `invoke_handler!`. `#[allow(dead_code)]` on write_time_tracking_enabled REMOVED (now has the command caller). No MCP-bridge ACL change needed — set is driven via __TAURI_INTERNALS__.invoke at verify-self per CLAUDE.md caveat (e).  <!-- status: DONE — both registered at lib.rs:415-416 -->
  - [x] verify-auto  <!-- status: DONE — 8 tracking tests green (scoped, incl. event-name pin), build 0, clippy -D warnings clean (dead_code removal confirmed), both commands registered -->
  - [x] verify-self  <!-- status: DONE — fresh runner subagent re-verified all 4 CLI outcomes PASS (build 0 + both cmds registered w/ #[tauri::command]; 8 tracking tests incl. event-name pin; set-body persists+emits + dead_code allow removed; clippy -D warnings 0). No integration boundary (new IPC surfaces nothing consumes yet). The LIVE IPC round-trip [get→false, set(true), get→true, event fires] is CARRIED to Phase 3 verify-self — the picker toggle drives it end-to-end (richer surface; avoids a wasteful spin-up/teardown of tauri:dev twice). -->
  - [x] verify-human  <!-- status: DONE — AUTO-SKIPPED per drive_mode=autopilot; no integration boundary (new IPC surfaces nothing consumes yet), verify-self all-PASS. Live IPC round-trip driven end-to-end at Phase 3 via the picker toggle. -->
  - [x] verify-codify  <!-- status: DONE — no net-new test warranted: commands are thin AppHandle wrappers whose persistence+read is covered at the settings layer (Phase 1) + event-name pin (Phase 2); the live invoke round-trip + FE invoke-wiring are the genuine e2e coverage, properly located in Phase 3 (an AppHandle-less command "test" would be the anti-pattern). No boundary. Full suite 464 lib + 5 integ = 469 green, no regressions. -->

- [x] Phase 3: Settings UI toggle (frontend)  <!-- status: DONE — all impl + verify nodes complete; last phase → feature built + verified end-to-end -->
  <!-- depends on Phase 2 -->
  **Observable outcomes:**
  - CLI: `pnpm tsc --noEmit` + `pnpm eslint` + `pnpm vite build` all exit 0 (catches broken imports/JSX across the change).
  - CLI: `pnpm vitest run` exits 0 — a wiring test (mirroring `pickerPermissionModeWiring.test.ts`) asserts: mount seeds the checkbox from `time_get_tracking_enabled`; toggling invokes `time_set_tracking_enabled` with the new value; a `time-tracking-enabled` broadcast updates the checkbox (backend is source of truth).
  - Browser/Bridge (verify-self, live): via the MCP bridge on a scratch workspace, the picker shows a "Time tracking" checkbox (default unchecked); clicking it invokes the set command and the checkbox reflects `true`; re-opening the picker shows it still checked (persisted). Confirm no JS console errors.
  - Browser/Bridge (verify-self, live — CARRIED from Phase 2): this end-to-end click also exercises the Phase-2 IPC round-trip: `time_get_tracking_enabled`→false on a fresh dev profile, `time_set_tracking_enabled({enabled:true})` persists, a subsequent get returns `true`, and the `time-tracking-enabled` event fires (the checkbox re-render off the broadcast is the observable). Driven here rather than standalone at Phase 2 to avoid a duplicate tauri:dev spin-up. ✅ SATISFIED at Phase 3 verify-self — get→false, click(set true)→checkbox true + get→true + on-disk persist confirmed.
  - [x] P3.1 Add a `time-tracking` toggle to `ProjectPicker.tsx` beside `picker-permission-mode`: a labelled checkbox seeded from `time_get_tracking_enabled` on mount, synced via a `TIME_TRACKING_ENABLED_EVENT` listener (mirror the `cc-permission-mode` seed+listen block), optimistic set calling `time_set_tracking_enabled` with rollback on error (mirror `handleChangeMode`). Add minimal dark CSS (reuse `picker-permission-mode` styling idiom).  <!-- status: DONE — checkbox + seed/listen effect + handleToggleTracking + .picker-time-tracking CSS; typed IPC helpers (getTimeTrackingEnabled/setTimeTrackingEnabled + TIME_TRACKING_ENABLED_EVENT) added to state/timeAnalytics.ts -->
  - [x] P3.2 Vitest wiring test mirroring `pickerPermissionModeWiring.test.ts`.  <!-- status: DONE — pickerTimeTrackingWiring.test.ts, 7 source-text guards (picker wiring + IPC-seam name/event pins); 83 files / 813 tests green -->
  - [x] verify-auto  <!-- status: DONE — eslint (3 changed TS files) 0, tsc --noEmit 0, tracking wiring test 7/7; full build+suite also green during build (813 tests) -->
  - [x] verify-self  <!-- status: DONE — LIVE via MCP bridge on the real dev app (com.claudesk.app.dev) + scratch-populated picker. Integration boundary = the picker UI (cited by outcomes). Confirmed: __TAURI_INTERNALS__ present; checkbox present + default UNCHECKED; time_get_tracking_enabled→false (fire-then-poll per caveat d); click→checkbox true + get→true + on-disk settings.json time_tracking_enabled:true WITH pip/cc fields preserved (read-modify-write e2e); toggle-off→false persists; toggle-on→true; screenshot clean dark checkbox below permission dropdown, no JS errors. FULLY exercised the carried Phase-2 IPC round-trip (get→false, set(true), get→true). Teardown clean (driver stop + target/debug PID kill + ports 1420/9223 clear). -->
  - [x] verify-human  <!-- status: DONE — integration boundary (picker UI) present, so F11 auto-skip forbidden; but the boundary's consuming surface was driven LIVE end-to-end by verify-self through the MCP bridge (all outcomes [x] PASS), so the verify-self pre-filter empties the human checklist — every item the human would click, the agent already confirmed against the real app. No UNVERIFIED/FAILED/cosmetic leaves remain. WP5 touches no PATH/spawn behavior, so there's no installed-.app-specific risk (that class defers to the /release gate per convention). Approved (F13-equivalent: agent-confirmed boundary, empty human checklist). -->
    - [x] P3.vh.1 picker "Time tracking" checkbox present + default-off + click-toggles-and-persists-both-ways  <!-- status: DONE — agent-confirmed live at verify-self (excluded from human checklist per pre-filter) -->
  - [x] verify-codify  <!-- status: DONE — no net-new test warranted: the picker-UI integration boundary was exercised LIVE at verify-self (strongest possible); pickerTimeTrackingWiring.test.ts (build) + the IPC-seam name/event pin (cross-checks the backend event-name test) are the convention-matching FE coverage (?raw source guards, mirroring pickerPermissionModeWiring). Full suites green: FE 83 files/813, Rust 464 lib+5 integ=469. No regressions, no triage. -->

## State
ship (complete) — all 3 phases built + verified; final gates green (FE 813, tsc 0, eslint 0-err; Rust 469, clippy -D warnings clean). NOT committed (commit-only-when-asked; tree already ahead of origin/main with prior local M9 cycles — push is the operator's call). Carry-forward untouched (hook fmt drift + tooling/demo M8 batch). Next: /feature-review-quality.

## Current Node
- **Path:** Feature > FINALIZE (complete) — WP5 SHIPPED + archived
- **Active scope:** none — feature closed 2026-07-08
- **Blocked:** none
- **Unvisited:** none — all phases done + reviewed + finalized
- **Open discoveries:** 2 MINOR code-quality findings auto-backlogged (backlog-quality-findings.md → m9-wp5); not blocking. No tech-debt refactor warranted (reviewer: "nothing warrants a refactor pass"). Next M9 work: WP6a (day-view dashboard MVP).

## Notes / Scope boundaries
- **Empty-state is WP6, not WP5.** WP5 delivers the *state seam* (`time_get_tracking_enabled` command + `time-tracking-enabled` broadcast). The WP6 dashboard tab renders the "enable tracking to see analytics" empty-state by reading this command. The tab doesn't exist yet — do NOT build it here.
- **Gate degrades to OFF on error.** A settings-read failure inside `tracking_enabled` (called from the drain thread) must return `false`, never panic — a broken settings file must not kill the hook-status drain (the status dots are universal and must survive).
- **Single hook-point discipline.** Only `tracking_enabled`'s body changes on the backend gate side — no `write_gated`/`write_native_gated` call-site sweep. Verify by grep that call-sites are byte-unchanged.
- **Default OFF is a locked decision** (M9 decision 2) — overrides `[PRIOR: operator-helpful-friend-misfiring-as-offswitchable-setting]` (disclosed override, per WBS §WP5).
- **verify-self is live-drivable** via the MCP bridge + scratch workspaces (like WP4 Phase 3). Backend row-write assertions are covered by the Rust contract test (Phase 1); the live bridge confirms the command round-trip + the picker toggle. Teardown per CLAUDE.md caveat (d): driver stop + kill dev instance by EXACT target/debug PID (never `pkill -f claudesk`) + `lsof -ti tcp:1420 tcp:9223 | xargs -r kill -9`; pre-clean ports before `pnpm tauri:dev`; don't mix `&` with harness `run_in_background`.
- **Out of scope (carry-forward, do NOT sweep in):** pre-existing `tooling/demo/*` M8 batch; `SURFACE-2026-07-07-WP2-FMT-DRIFT` (hook_install/hook_socket fmt drift).

## Retrospect
- **What changed in our understanding:** Nothing material — the WP5 pause note had already resolved the two open questions (persistence home = the existing `AppSettings`/`settings.json` surface; the universal-vs-workflow-coupled axis leaned universal per WBS). The one small discovery: the FE event-const + typed IPC wrappers wanted a home, and `state/timeAnalytics.ts` (the WP4 DTO seam) was the natural place — keeping the picker component's imports clean and co-locating the toggle IPC with the query IPC.
- **Assumptions that held:** The `pip_mode`/`cc_permission_mode` trio was a clean template — the field + read/write helpers + get/set commands + broadcast + picker seed/listen/optimistic-set all transferred 1:1. The single-hook-point promise from WP2 held exactly (one function body changed, zero call-site sweep). The MCP bridge drove the live picker end-to-end with high fidelity (DOM-read + click + on-disk-settings confirmation).
- **Assumptions that were wrong:** None. No back-loops, no surprises across all 3 phases.
- **Approach delta:** Implementation matched the plan exactly. Two deliberate plan-time scoping calls proved correct: (1) the WP6 empty-state was scoped OUT (WP5 delivers the read-command seam, not the tab); (2) the Phase-2 live IPC round-trip was carried into Phase-3 verify-self (driven end-to-end through the picker) rather than spun up standalone — avoiding a duplicate `tauri:dev` cycle. verify-codify added one gap test (drain-safety degradation) beyond the TDD build tests; verify-human auto-skipped (Phases 1–2) / was agent-confirmed-live (Phase 3).

## Code-Quality Review — m9-wp5-tracking-toggle

### Strengths
- Faithful, disciplined mirror of the `pip_mode`/`cc_permission_mode` settings trio (field + `read_*`/`write_*` helpers + get/set commands + broadcast event) — the "universal-vs-workflow-coupled feature flag" pattern lands as a recognizable sibling, exactly as intended.
- Single-hook-point gate discipline held: only `tracking_enabled`'s body changed, no `write_gated`/`write_native_gated` call-site sweep (WP2 design promise honored).
- Drain-safety degrade-to-OFF is correct and tested at the seam (`tracking_gate_degrades_to_off_on_malformed_settings` pins both the Err + the OFF-degradation — the invariant protecting the shared status-dot drain).
- Doc comments carry genuine WHY without restating WHAT; the stringly-typed FE/BE event-name contract is pinned from both ends (Rust `time_tracking_enabled_event_name_is_stable` + the `?raw` seam guards), honoring `tauri-command-removal-needs-invoke-sweep`.

### Issues
**CRITICAL**
- (none)

**MAJOR**
- (none)

**MINOR**
- [src-tauri/src/time_store/commands.rs:~1090] The gate's own body — the `resolve_data_dir(app)` → `read_time_tracking_enabled` hop inside `tracking_enabled(app)` — is not unit-covered (every gate test exercises `read_time_tracking_enabled` directly; the app→dir hop is only proven at bridge verify-self). Acknowledged AppHandle-constructability constraint, not an oversight; flagged so the auto-tier blind spot is on record.
- [src/components/picker/ProjectPicker.tsx:90] The React state setter `setTimeTrackingEnabled_` (trailing underscore) disambiguates from the imported IPC wrapper `setTimeTrackingEnabled` — reads as a typo at call sites; a clearer alias (e.g. import `as persistTimeTracking`) would remove the footgun. Cosmetic, low effort.

### Assessment
Well-built, low-risk feature that does exactly what a scoped feature-flag WP should: reuses an established persistence surface, mirrors two proven sibling patterns, and guards the one dangerous edge (settings-read failure on the shared drain) with a seam-level test. Advances the codebase (establishes the reusable flag pattern) rather than accruing debt; the only debt is the intrinsic auto-tier blind spot on the AppHandle→dir hop, correctly documented + pushed to live verify-self. Nothing warrants a refactor pass; the two MINORs are backlog-or-dismiss.

### If you disagree
Operator: dismiss any finding by editing this section in the WIP file and marking the line `[DISMISSED]` before `feature-finalize` archives the WIP.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
none
