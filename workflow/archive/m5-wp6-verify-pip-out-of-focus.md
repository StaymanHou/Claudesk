# Feature: M5 WP6 — Verify M5: PiP out-of-focus status visibility across all layouts

**Workflow:** feature
**State:** Completed 2026-06-27 — agent-verified PASS via the MCP bridge; installed-build checks DEFERRED-TO-RELEASE. Closes M5.
**Created:** 2026-06-27
**Drive mode:** autopilot

## Problem Statement

Milestone-exit verification of the M5 (Picture-in-picture) exit criteria against real N workspaces and a real out-of-focus Claudesk window, across all 4 PiP layouts. This is a **verification-only** WP — no new feature code; if a check FAILS it back-loops to a fix (refactor/build) on the offending WP, but the default path is observe-and-confirm. **Closing WP6 closes M5.** The testing posture follows the WP2 **ADOPT** verdict (`wbs.md:174`): agent-drive everything the `mcp__tauri__*` bridge can reach (main + `pip` webview DOM/IPC/click/screenshot, including layout switching and the live checkmark), and carry the genuinely-native + installed-build outcomes to verify-human (out-of-focus/Space-switch/minimize AppKit behavior, installed-`.app` parity, dev/prod isolation, the `tauri#5566` release-vs-dev caveat, real ⌘Tab-away auto-summon). Folds in the WP1/WP5 carry-ins deferred to WP6. Source: `docs/product/wbs.md` WP6 (lines 126–139).

## Work Tree

- [x] Phase 1: Agent-driven verification — status correctness, layouts, display-only, agreement (dev build via MCP bridge)  <!-- status: done 2026-06-27 — all agent-drivable outcomes PASS via the MCP bridge; verify-human SKIPPED by operator -->
  **Observable outcomes:**
  - CLI: `pnpm exec tsc --noEmit` exits 0; `pnpm exec eslint .` exits 0; `pnpm vite build` exits 0 (no broken imports/JSX across the M5 surface — static floor before live drive).
  - CLI: `cargo clippy -- -D warnings` exits 0; `cargo test` passes (M5 backend unchanged-but-confirm: pip/status_broadcaster/config_store).
  - Browser (bridge, main webview): `pnpm tauri:dev` + `mcp__tauri__driver_session{start, port:9223}` connects; two scratch workspaces mounted (`tmp/scratch/scratch-a`, `scratch-b`) → `webview_execute_js` reports `workspaceCount:2`, `__TAURI_INTERNALS__` present.
  - Browser (bridge, `pip` webview): with N≥2 workspaces in distinct states (one idle, one driven to Running/AwaitingInput via IPC `workspace-status` emit — NOT CC-TUI typing), `webview_dom_snapshot{windowId:'pip'}` shows one tile per workspace **including the center-staged one** (the deliberate roster divergence — `derivePipFrame` drops nothing); each tile's status-dot class matches the broadcast state.
  - Browser (bridge): cycle all 4 layouts via `pip_set_mode`/layout IPC (horizontal mirror, vertical mirror, compact name+dot, minimal dots-only); `webview_screenshot{windowId:'pip'}` for each confirms the layout renders and the panel auto-resized; `webview_execute_js` confirms persisted `pip_layout` survives a toggle off/on.
  - Browser (bridge): minimal-layout intent — with all workspaces Running the dots read quiet; flip one to AwaitingInput via IPC → its dot is sorted-first + blinks/glows (`orderForAttention`); per-dot `title` tooltip resolves to its project.
  - Browser (bridge): display-only — `webview_interact{click}` on a PiP tile leaves main center-stage unchanged (`webview_execute_js` reads same active workspace id before/after); no focus steal observable in DOM.
  - Browser (bridge): PiP and filmstrip never disagree — same workspace's dot class is identical in `main` filmstrip DOM and `pip` DOM after a state flip.
  - Browser (bridge): live checkmark (m5-wp5 refactor carry-in) — set PiP mode via IPC to each of Off/On/Auto; `webview_execute_js` on the View-menu state (or the menu-item checked attrs exposed) confirms exactly the active mode is checked and the other two are not.
  - [x] P1.1 Static floor: run tsc/eslint/vite build + cargo clippy/test; record results  <!-- status: done 2026-06-27 — tsc clean; eslint 0 errors/1 pre-existing XtermPane warning; vite build clean (pip entry builds; chunk warn = M9 CM6 item); clippy --all-targets -D warnings clean; cargo test 266 pass 0 fail -->
  - [x] P1.2 Bring up `pnpm tauri:dev` (background) + attach the MCP bridge; mount 2 scratch workspaces  <!-- status: done 2026-06-27 — bridge attached :9223 (dev identity com.claudesk.app.dev confirmed); both `main`+`pip` windows enumerate; scratch-a (ws-1, center-staged) + scratch-b (ws-3) mounted, __TAURI_INTERNALS__ present, CC v2.1.193 booted -->
  - [x] P1.3 Drive status states via IPC `workspace-status` emit; verify PiP tile dots (incl. center-staged tile) + filmstrip agreement  <!-- status: done 2026-06-27 — emitted ws-1 running / ws-3 awaiting_input; filmstrip + PiP both show correct dots; PiP includes ws-1 the CENTER-STAGED tile (roster divergence confirmed, derivePipFrame drops nothing); PiP↔filmstrip identical -->
  - [x] P1.4 Cycle all 4 layouts via IPC/click; screenshot each; confirm auto-resize + persisted layout across toggle  <!-- status: done 2026-06-27 — cycled horizontal→vertical→compact→minimal via pip-layout-switch; all render + auto-resize (screenshotted each); compact has 0 mirror tiles (serialize stopped); minimal persisted across PiP off→on cycle -->
  - [x] P1.5 Minimal-layout attention-weighting + tooltip check; display-only inertness check; live-checkmark check  <!-- status: done 2026-06-27 — minimal: orderForAttention puts awaiting FIRST, all-busy reads quiet (no attention class), one-flips-awaiting pops (.pip-tile-awaiting + halo box-shadow, blink from .status-dot-awaiting), per-tile title tooltips resolve to project; display-only: clicking PiP ws-3 tile left main center-stage on scratch-a (inert); live-checkmark MECHANISM verified (pip-mode broadcast cycled both toggle instances in sync + flipped Auto hide-while-focused, PiP visible:false) — native menu glyph itself NOT DOM-readable → carried to Phase 2 verify-human -->
  - [x] verify-auto  <!-- status: done 2026-06-27 — static floor green (tsc/eslint/vite/clippy/cargo test); = the agent-verifiable CLI outcomes for this verify-only WP -->
  - [x] verify-self  <!-- status: done 2026-06-27 — all Phase 1 agent-drivable observable outcomes PASS via the WP2-ADOPTED mcp__tauri__* bridge (main + pip webviews); 0 BLOCKING, 0 COSMETIC. Native-menu checkmark glyph + all out-of-focus/installed-build outcomes carried to Phase 2 (operator). -->
  - [x] verify-human  <!-- status: SKIPPED 2026-06-27 by operator ("skip") — checklist waived, NOT confirmed. The carried native-menu-checkmark glyph (P1.vh.1) is UNVERIFIED-BY-SKIP (agent verified the pip-mode broadcast mechanism in verify-self; the native AppKit glyph itself was not operator-confirmed). -->
    - [~] P1.verify-human.1 Native View-menu checkmark glyph tracks the active PiP mode  <!-- status: UNVERIFIED-BY-SKIP 2026-06-27 — operator waived; mechanism (pip-mode broadcast) PASS in verify-self, native glyph not eyeballed -->
  - [x] verify-codify  <!-- status: N/A — verify-only WP, no new behavior to codify (M5 behavior was codified by WP3/WP4/WP5's own verify-codify); a bridge-based regression suite is out of WP6 scope -->

- [x] Phase 2: Operator-driven verification — native out-of-focus behavior + installed-build parity  <!-- status: DEFERRED-TO-RELEASE 2026-06-27 — operator verifies the installed-build out-of-focus checks (the M5 exit criterion) at the /release gate before Homebrew distribution; depends on Phase 1 -->
  **Observable outcomes:** (all carried to verify-human — native AppKit + installed `.app`, unreachable by the bridge per WP2 boundary `wbs.md:190`)
  - CLI: `pnpm tauri build` produces a `.app`; launched from Finder/Dock the window title bar reads `Claudesk` (NOT `Claudesk (dev)`) — confirms installed/prod identity.
  - Browser (operator, installed `.app`): with N≥2 real CC sessions, switch Claudesk fully out of focus (another app foreground / a different macOS Space / minimized) → the PiP stays visible and keeps updating status dots in <1s with zero clicks (vision Success Metric 6). Repeat the out-of-focus check on the **installed** build (NSPanel + GUI-PATH parity per the standing convention).
  - Browser (operator): auto-summon — with PiP mode = Auto, ⌘Tab away from the Finder-launched build for ~3s → the panel auto-summons; refocus → it auto-dismisses. No off-main-thread crash (the F9b `run_on_main_thread` fix holds on the installed build).
  - Browser (operator): dev/prod isolation re-verify — installed `.app` (`com.claudesk.app`) and `pnpm tauri:dev` (`com.claudesk.app.dev`) run concurrently with independent PiP state / `pip_mode` / `pip_layout` (no cross-talk).
  - Browser (operator): `tauri#5566` release-vs-dev NSPanel caveat — confirm the NSPanel behaves identically in the release build as in dev (no collection-behavior/level regression under release codegen).
  - Browser (operator): live displayed checkmark on the installed build — change PiP mode via the icon button → open the View menu → exactly the active mode (Off/On/Auto) is checked, others are not.
  - [~] P2.1 Build the installed `.app` and launch from Finder/Dock; confirm prod identity via title bar  <!-- status: DEFERRED-TO-RELEASE 2026-06-27 (operator) — verified at release-packaging time, just before Homebrew distribution -->
  - [~] P2.2 Out-of-focus check on installed build (foreground-other / Space-switch / minimize) at N≥2 real sessions  <!-- status: DEFERRED-TO-RELEASE 2026-06-27 (operator) — the M5 exit criterion; verified at release-packaging time before Homebrew distribution -->
  - [~] P2.3 Auto-summon on real ⌘Tab-away + dev/prod isolation + tauri#5566 + live-checkmark checks  <!-- status: DEFERRED-TO-RELEASE 2026-06-27 (operator) -->
  - [x] verify-auto  <!-- status: N/A — Phase 2 is operator-driven only; static floor already run under Phase 1 -->
  - [x] verify-self  <!-- status: N/A — Phase 2 outcomes are native AppKit + installed `.app`, unreachable by the bridge per WP2 boundary; nothing for the agent to self-drive -->
  - [x] verify-human  <!-- status: DEFERRED-TO-RELEASE 2026-06-27 by operator — "package and run the release build, verify at that time right before we distribute to homebrew." Phase 2's installed-build out-of-focus checks (the M5 exit criterion) are verified at the /release gate, NOT silently passed. -->
  - [x] verify-codify  <!-- status: N/A — verify-only WP, no behavior to codify; Phase 2 is manual operator verification -->

## Current Node
- **Path:** Feature > review-quality complete (clean, docs-only) → finalize
- **Active scope:** none — both phases resolved
- **Blocked:** none
- **Note (verify-only WP):** Phase 1's agent-drivable outcomes all PASS via the MCP bridge (status dots, all 4 layouts + auto-resize + persistence, minimal attention-weighting, display-only inertness, PiP↔filmstrip agreement, pip-mode broadcast mechanism + Auto hide-while-focused). Phase 1 verify-human SKIPPED by operator. Phase 2 (installed-build out-of-focus — the M5 exit criterion + native menu glyph + auto-summon + dev/prod isolation + tauri#5566) DEFERRED-TO-RELEASE by operator: verified at the `/release` gate before Homebrew distribution.
- **Unvisited:** none
- **Open discoveries:** the deferred-to-release verification (see Discoveries) — must be honored at `/release`.

## Retrospect
- **What changed in our understanding:** The WP2-ADOPTED MCP bridge proved itself end-to-end on a *real* milestone-exit verification, not just the WP2 smoke test — it drove status transitions (via `workspace-status` IPC emit), all 4 PiP layouts (via the `pip-layout-switch` click), display-only inertness, and PiP↔filmstrip agreement, all agent-side. The dead-end that bit M4 WP3/WP4/WP4b (bare-Vite, no `__TAURI_INTERNALS__`) is genuinely dissolved for the dev build. The agent verified far more of a native-window feature than the pre-WP2 posture ("operator-only at the live tier") would have allowed.
- **Assumptions that held:** The WP2 boundary table was exactly right — DOM/IPC/click/screenshot on both `main` and `pip` webviews were high-fidelity; status *transitions* are best triggered via IPC, not CC-TUI typing; and the genuinely-native pieces (out-of-focus AppKit behavior, the native View-menu checkmark glyph, installed-`.app` parity) are unreachable by the bridge and correctly carried to the operator. The roster divergence (PiP mirrors ALL N incl. the center-staged tile) held as designed.
- **Assumptions that were wrong:** Minor mechanics, not substance: (1) `pip_set_layout` / `pip_set_mode` are NOT directly invokable via `ipc_execute_command` (the bridge restricts the command allow-list) — drove the on-panel switcher click + the right-panel toggle instead; (2) async/Promise-returning `webview_execute_js` times out — used synchronous reads after a shell `sleep`; (3) the duplicated `pip-toggle` (off-screen background-RightPanelHost instance resolves first by selector) forced coordinate-based clicks — this is the already-backlogged per-`RightPanelHost` `pipMode` duplication MINOR, re-confirmed here.
- **Approach delta:** Plan held. The plan correctly split agent-drivable (Phase 1) vs operator/native (Phase 2). The only delta is the *resolution* of Phase 2: rather than the operator walking it at verify-human now, they chose to **defer the installed-build checks to the `/release` gate** — a single pre-distribution verification point instead of a per-WP one. Recorded as `DEFERRED-TO-RELEASE` + a high-priority backlog SURFACE + a memory so it's enforced before publishing.

## Code-Quality Review — m5-wp6-verify-pip-out-of-focus

### Strengths
- Verification-only WP: the ship commit (`7bafd71`) is 100% documentation (`wbs.md`, `backlog.md`, the WIP file) — **zero source-code diff**. No new code to accrue debt.
- The deferred installed-build verification was recorded honestly (WIP tree `DEFERRED-TO-RELEASE`, a high-priority backlog SURFACE, and a memory) rather than silently marked passed — the M5 exit criterion stays auditable at the `/release` gate.

### Issues
**CRITICAL** — none.
**MAJOR** — none.
**MINOR** — none.

(No source code changed; nothing to review. Reviewer subagent not spawned — a docs-only verify WP is clean by construction. Pre-existing backlogged m5-wp5 MINORs — stale `pip_toggle` rustdoc, per-RightPanelHost `pipMode` duplication — are untouched by this WP and remain in the backlog for a future `/feature-refactor`.)

### Assessment
Clean by construction. WP6 is the M5 milestone-exit verification; it ships documentation only, so there is no code-quality surface. Agent-drivable outcomes all passed via the MCP bridge; the installed-build outcomes are deferred to release with an enforced backlog pointer.

### If you disagree
Edit this section in the WIP and mark a finding `[DISMISSED]` before `feature-finalize` archives the file.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SURFACED-2026-06-27] WP6 Phase 2 / `/release` — Operator DEFERRED M5's installed-build verification to release-packaging time. The M5 exit criterion (PiP stays visible + updates status while Claudesk is out of focus, on the installed prod `.app`) + the native View-menu PiP-mode checkmark glyph + real ⌘Tab-away auto-summon + dev/prod isolation + the tauri#5566 release-vs-dev NSPanel caveat were NOT operator-confirmed at WP6 close — they are to be verified when packaging the release build, right before the Homebrew distribution. The `/release` skill / next release run MUST exercise these out-of-focus checks on the freshly-built `.app` before publishing. Agent-side (dev build via the MCP bridge) everything reachable PASSED.
