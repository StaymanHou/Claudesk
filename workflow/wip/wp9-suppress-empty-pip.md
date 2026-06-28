# Feature: WP9 — Suppress empty PiP when no workspace is open

**Workflow:** feature
**State:** plan (complete)
**Created:** 2026-06-28
**Milestone:** M6 (friend-requested QoL polish — open collection)
**Source:** `SURFACE-2026-06-27-PIP-SUMMONS-EMPTY-WITH-NO-WORKSPACE-OPEN` → WBS WP9
**drive_mode:** autopilot

## Problem Statement

When Claudesk has launched but the user has NOT yet opened any workspace (the picker is still showing), blurring the app (Auto mode) auto-summons an **empty PiP panel** after the 3s debounce — there is nothing to mirror, so the summoned panel is empty and visually noisy. Desired: at **zero open workspaces** the Auto-mode auto-summon must not fire at all. This is a cosmetic-but-annoying bug (operator-observed 2026-06-27), not data-affecting.

[Updated 2026-06-28: scope refined at verify-human vh.4 — the principle "no PiP when there's nothing to mirror" applies to **all modes**, not just Auto. The `On` (pinned) mode must ALSO suppress the panel at zero open workspaces, REACTIVELY (visibility tracks the open-workspace count: shown when ≥1 open, hidden when count returns to 0). Root problem unchanged ("suppress empty PiP at zero workspaces"); scope broadened from Auto-only to all-modes. → Phase 2.]

## Plan-time decisions (both WBS-flagged — now settled)

**Decision 1 — open-count signal: backend `SharedRegistry` (`WorkspaceRegistry::by_path.len()`).**
Confirmed by code trace that `by_path` IS the open-workspace set: `workspace_register` fires on workspace open and `workspace_deregister` on close, both driven by the `workspaces` list in `src/state/useWorkspaceStatus.ts` (the same store the picker mutates). So `by_path.len()` is exactly "how many workspaces are open right now," backend-reachable with **no new frontend→backend hop**. This validates the WBS lean. The existing `WorkspaceRegistry::len()` is `#[cfg(test)]`-gated — un-gate it (make it always-available) so the focus handler can read it.

**Decision 2 — REVISED at verify-human (2026-06-28, operator reject of vh.4): the `On`-mode panel ALSO suppresses when zero workspaces are open — REACTIVELY (track the count).**
*Original (now superseded) decision:* leave `On`-launch un-guarded (registry empty at launch → a `count>0` launch guard would always suppress it). *Operator correction at vh.4:* "the pip panel also shouldn't show up when there's no open workspace" — the principle is "no PiP when there's nothing to mirror," **regardless of mode**. An empty *pinned* panel is as useless as an empty auto-summoned one.
**Resolution (operator-chosen: Reactive):** the `On`-mode panel's visibility *tracks* the open-workspace count — shown whenever ≥1 workspace is open, hidden when the count returns to 0. This correctly handles BOTH the launch-with-zero case (registry empty at launch → panel stays hidden until the first `workspace_register`) AND the close-all-back-to-zero case (panel hides). Consistent with Auto's "nothing to mirror → hidden."
**Seam:** the `workspace_register`/`workspace_deregister` commands (`status_broadcaster/commands.rs`) run on every open/close, are `#[tauri::command]` (main-thread → AppKit-safe), and hold the `AppHandle` + registry. After each mutation, reconcile the `On`-panel visibility against the new count. The **launch-time unconditional `On`-show** in `lib.rs` `.setup()` is REMOVED (it showed an empty panel at launch); the first register reconciles it visible. `pip_set_mode(On)` at runtime also reconciles against the current count (don't show empty when the user picks On with zero workspaces open).

## Implementation approach (seam map)

The guard lives in two coordinated spots, mirroring the existing token+mode re-check discipline:

1. **`should_arm_summon` (pure fn, `src-tauri/src/pip/mod.rs`):** extend the signature to `should_arm_summon(mode: PipMode, panel_visible: bool, open_count: usize) -> bool`, returning `mode == Auto && !panel_visible && open_count > 0`. Keeping it pure preserves unit-testability with no live app. Update the three existing unit assertions + add open-count cases.
2. **`pip_on_main_focus_changed` (`src-tauri/src/pip/commands.rs`):** on blur, read the open-workspace count from the managed `SharedRegistry` (`app.try_state::<SharedRegistry>()` → lock → `.len()`; a poisoned/absent lock → treat as 0 = don't summon, the safe default) and pass it to `should_arm_summon`.
3. **Post-debounce main-thread re-check (same fn, inside the `run_on_main_thread` closure):** re-read the count there too and require `> 0`, symmetric with the existing token-still-ok + still-auto re-checks — a workspace could be **closed** during the 3s debounce window, which must cancel the summon just like a refocus or mode change does.
4. **`WorkspaceRegistry::len()` (`src-tauri/src/status_broadcaster/mod.rs`):** drop the `#[cfg(test)]` gate so it's callable from the focus handler. (No other change to the registry.)

**Main-thread-marshal rule (CLAUDE.md, load-bearing):** unchanged — the count read is a plain Mutex lock (thread-safe anywhere); the only AppKit op is the existing `pip_set_visible` already correctly marshaled via `run_on_main_thread`. We add NO new window op, so no new marshaling seam — just a count check guarding the existing (already-marshaled) show.

## Work Tree

- [x] Phase 1: Gate Auto auto-summon on open-workspace-count > 0  <!-- status: done — all impl + verify nodes complete (vh.4 resolved in Phase 2) -->
  **Observable outcomes:**
  - CLI: `cargo test --manifest-path src-tauri/Cargo.toml -p <crate> pip::` exits 0 — `should_arm_summon` unit tests cover: Auto+hidden+count>0 → arm; Auto+hidden+count==0 → DON'T arm; Auto+visible+count>0 → don't arm; Off/On (any count) → don't arm.
  - CLI: `cargo build --manifest-path src-tauri/Cargo.toml` exits 0 (un-gating `len()` + the new call site compile clean; `len()` no longer dead-code-warns since it now has a non-test caller).
  - CLI: `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` exits 0.
  - CLI: `pnpm tsc --noEmit` + `pnpm vite build` exit 0 (no frontend change expected, but confirm nothing broke — this WP is backend-only).
  - Live (MCP bridge / operator): Auto mode + ZERO workspaces open (picker showing) + blur Claudesk for >3s → PiP stays hidden (the bug case, now fixed). Open one workspace + blur >3s → PiP summons as before (regression guard). With PiP summoned, close all workspaces, refocus then blur >3s → PiP stays hidden (the close-during-blur / now-empty case).
  - Live: `PipMode::On` at launch still shows the pinned panel regardless of count (the un-guarded path — confirm WP9 did NOT regress it).
  - [x] P1.1 Un-gate `WorkspaceRegistry::len()` (drop `#[cfg(test)]`) in `status_broadcaster/mod.rs`  <!-- status: done — added doc + non-test caller; clippy clean (no len_without_is_empty fire) -->
  - [x] P1.2 Extend `should_arm_summon` with `open_count: usize` param + update/add unit tests in `pip/mod.rs`  <!-- status: done — pure fn now `Auto && !visible && count>0`; +arm_summon_suppressed_when_no_workspace_open test; 9 pip tests pass -->
  - [x] P1.3 In `pip_on_main_focus_changed` (blur branch): read `SharedRegistry` len, pass to `should_arm_summon` (absent/poisoned lock → 0 = don't summon)  <!-- status: done — `open_workspace_count(app)` helper; safe-0 default -->
  - [x] P1.4 In the post-debounce `run_on_main_thread` closure: re-read the count + require `> 0` alongside the token + still-auto re-checks  <!-- status: done — `still_has_workspace` gate; catches close-during-debounce -->
  - [x] verify-auto  <!-- status: done — clippy -D warnings clean, cargo test pip:: 9/9, tsc clean, vite build OK (scoped to the 3 changed files) -->
  - [x] verify-self  <!-- status: done — agent-drivable slice verified (pure fn unit tests + wiring trace + signal correctness + clean compile/lint); live OS-blur outcomes CARRIED to verify-human per the backend-lifecycle/out-of-focus PiP convention (bridge can't blur the app to itself). No Playwright runner spawned (surface doesn't exist for this outcome class). No code-fixable BLOCKING found. -->
    **Carried to verify-human (live, operator-only):**
    - Auto mode + ZERO workspaces open (picker showing) + blur Claudesk >3s → PiP stays hidden (the bug, now fixed)
    - Auto mode + one workspace open + blur >3s → PiP summons as before (regression guard)
    - Auto mode + PiP summoned, then close all workspaces inside the blur window → summon cancelled / PiP stays hidden (close-during-debounce)
    - `PipMode::On` at launch still shows the pinned panel regardless of count (the un-guarded path — confirm no WP9 regression)
  - [x] verify-human  <!-- status: done — vh.1-3 PASS; vh.4's concern (On-mode empty panel) re-scoped to Phase 2 and verified there (P2.verify-human.1-4 all PASS) -->
    - [x] P1.verify-human.1 zero workspaces + blur >3s → PiP stays hidden (the bug fix)  <!-- status: PASS (operator 2026-06-28) -->
    - [x] P1.verify-human.2 one workspace open + blur >3s → PiP summons (regression guard)  <!-- status: PASS (operator 2026-06-28) -->
    - [x] P1.verify-human.3 close last workspace during/before summon → PiP stays hidden (close-during-debounce)  <!-- status: PASS (operator 2026-06-28) -->
    - [x] P1.verify-human.4 On-mode at zero workspaces → operator wanted the pinned panel ALSO hidden; re-scoped to Phase 2 (reactive On-mode guard) and verified there (P2.verify-human.1-4 PASS). Resolved.  <!-- status: RESOLVED-IN-PHASE-2 -->
  - [x] verify-codify  <!-- status: done — Phase 1's count-guard behavior codified by should_arm_summon tests (arm_summon_suppressed_when_no_workspace_open) + len_tracks_open_workspace_count; integration-boundary side-effect (live NSPanel show/hide) is operator-verified, not CI-codifiable (no live AppKit in cargo test) — consistent with existing PiP pure-fn test posture. 295 pass. -->

- [x] Phase 2: Reactive On-mode visibility — track open-workspace count  <!-- status: done — all impl + verify nodes complete; from verify-human vh.4 reject (F12 back-loop) -->
  **Observable outcomes:**
  - CLI: `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` exits 0; `cargo test --manifest-path src-tauri/Cargo.toml` (pip + status_broadcaster) exits 0.
  - CLI: `pnpm tsc --noEmit` + `pnpm vite build` exit 0 (backend-only change; confirm no frontend break).
  - Live (operator verify-human): PiP mode = On + relaunch with ZERO workspaces → pinned panel does NOT show (the vh.4 fix). Then open a workspace → pinned panel appears. Close all workspaces → pinned panel hides. Re-open → reappears. Set mode On while zero workspaces open → stays hidden; while ≥1 open → shows.
  - Live: Auto mode behavior from Phase 1 still holds (no regression to the Phase 1 guard).
  - [x] P2.1 Add `pip::commands::reconcile_on_mode_visibility(app, open_count)` (+ pure `on_mode_should_show` in mod.rs + `pub reconcile_pip_for_workspace_count` wrapper) — On → show iff count>0; Auto/Off → no-op. Main-thread doc note added.  <!-- status: done -->
  - [x] P2.2 Call reconcile from `workspace_register` + `workspace_deregister` (read post-mutation count from the held guard, drop lock, then reconcile — no lock held across the AppKit op)  <!-- status: done -->
  - [x] P2.3 `pip_set_mode(On)` now routes through reconcile (no empty show when zero open); Auto/Off hide explicitly. REMOVED the launch-time unconditional On-show in `lib.rs` `.setup()` (reactive reconcile shows it on first register).  <!-- status: done -->
  - [x] P2.4 Unit test `on_mode_tracks_workspace_count` (On+count>0→Some(true); On+0→Some(false); Auto/Off→None). 294 tests pass.  <!-- status: done -->
  - [x] verify-auto  <!-- status: done — clippy -D warnings clean, cargo test 294/294 (incl. on_mode_tracks_workspace_count), tsc clean, vite build OK -->
  - [x] verify-self  <!-- status: done — agent slice verified (pure on_mode_should_show test + wiring trace of register/deregister/set_mode/launch-removal + main-thread safety + clean compile/lint); live On-mode panel show/hide CARRIED to verify-human (needs the real NSPanel). No Playwright runner spawned (no such surface for an NSPanel-visibility outcome). No code-fixable BLOCKING. -->
    **Carried to verify-human (live, operator-only):**
    - PiP mode = On + relaunch with ZERO workspaces → pinned panel does NOT show (the vh.4 fix)
    - Then open a workspace → pinned panel appears
    - Close all workspaces → pinned panel hides; re-open → reappears
    - Set mode = On while zero workspaces open → stays hidden; set while ≥1 open → shows
    - Phase 1 Auto-mode behavior still holds (no regression)
  - [x] verify-human  <!-- status: done — all 5 leaves PASS (operator 2026-06-28) -->
    - [x] P2.verify-human.1 On mode + relaunch with ZERO workspaces → pinned panel does NOT show (the vh.4 fix)  <!-- status: PASS -->
    - [x] P2.verify-human.2 (from .1) open a workspace → pinned panel appears  <!-- status: PASS -->
    - [x] P2.verify-human.3 close all workspaces → pinned panel hides; re-open → reappears  <!-- status: PASS -->
    - [x] P2.verify-human.4 set mode=On while zero workspaces open → stays hidden; set while ≥1 open → shows  <!-- status: PASS -->
    - [x] P2.verify-human.5 Phase 1 Auto-mode behavior still holds (zero→blur→hidden; one open→blur→summons) — no regression  <!-- status: PASS -->
  - [x] verify-codify  <!-- status: done — Phase 2's pure decision codified by on_mode_tracks_workspace_count + len_tracks_open_workspace_count (the count signal reconcile reads). Live On-mode panel show/hide is operator-verified (not CI-codifiable). 295 pass; clippy clean. -->

## Current Node
- **Path:** Feature > ship
- **Active scope:** ALL phases complete (Phase 1 + Phase 2 both `[x]`, all verify nodes done). 295 tests pass, clippy clean, tsc + vite build clean. Ready for `/feature-ship`.
- **Blocked:** none
- **Unvisited:** none
- **Open discoveries:** Design-prior CANDIDATE (vh.4): "suppress any ambient status surface that has no content to mirror, regardless of mode" — leaning feature-specific, not durable. Re-offer at close if it generalizes.
- **Blocked:** none
- **Unvisited:** none (Phase 2 is the last phase)
- **Open discoveries:** none
- **Relevance check (before Phase 2):** Requester still needs it: yes (operator just requested it). Requirements: refined at vh.4 (On-mode also guarded, reactively). Feasible: yes (register/deregister command seam). No superior alternative: reactive chosen over launch-only by operator. Verdict: proceed.
- **Blocked:** none
- **Unvisited:** none (single-phase feature)
- **Open discoveries:** none
- **Build note:** dropped the speculative `is_empty()` companion (clippy `dead_code` — it had no caller and `len()` alone doesn't trip `len_without_is_empty` here). `On`-launch show intentionally left un-guarded per the plan-time decision (registry empty at launch).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
