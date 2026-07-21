# Feature: M4 WP5 — Verify multi-workspace at N (milestone-exit verification)

**Workflow:** feature
**State:** Completed 2026-06-24
**Created:** 2026-06-24
**drive_mode:** autopilot

## Problem Statement

Milestone 4's exit criterion is the **dogfood-replace bar**: N projects open concurrently as workspaces in one Claudesk window, every workspace's idle/running/awaiting-input state visible without clicking (expanded filmstrip *or* collapsed pill row), driven purely by the M3 hook channel (no PTY scraping), with click-to-promote and `⌘⇧+digit` switching the center stage. WP1–WP4b built that surface piece by piece, each verified per-WP. WP5 is the milestone-level proof that the *whole* surface holds together at real N — distinct from per-WP verify-self/human because it exercises every M4 feature simultaneously against **real CC sessions** (not the synthetic WP1 probe fixture, not isolated single-feature checks). This is verification-only: **no implementation code**. The deliverable is a structured native verify-human pass against the M4 exit criteria, plus re-confirmation of two folded-in WP1 watch-items (window-close-at-N responsiveness and N-real-session RAM headroom). It runs as **native verify-human** — the agent-side Playwright path cannot mount the workspace UI (no Tauri IPC; `window.__TAURI_INTERNALS__` undefined in a plain browser — see `SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI`, anchored to M5 planning, NOT a WP5 blocker).

## Work Tree

- [x] Phase 1: Milestone-exit verification at N real workspaces  <!-- status: done 2026-06-24 — all impl + all 5 verify nodes [x]; M4 exit criteria met -->  
  **Observable outcomes:**
  - CLI: `pnpm tsc --noEmit` exits 0; `pnpm lint` exits 0; `pnpm test` (vitest) exits 0 with the suite at its WP4b-close count (426) — no regression introduced by any WP5 housekeeping. (Kill the dev app first — shared `target/` lock.)
  - Native (verify-human, N≥4 real projects in one `pnpm tauri dev` window): each opened project gets its own live CC session in the left terminal half, already `cd`'d in, yolo mode; center-stage switch (tile click) works; typing in one workspace's terminal does NOT leak to another (no cross-workspace state leak).
  - Native: idle/running/awaiting-input of **every** workspace is visible with zero clicks — in BOTH the expanded filmstrip (incl. the static center-stage tile) AND the collapsed pill row — driven purely by the M3 hook channel; each tile/pill status dot AGREES with that workspace's center-stage header status when promoted.
  - Native: BOTH promote paths confirmed — (a) clicking a filmstrip tile / collapsed pill promotes that workspace to center stage; (b) `⌘⇧+digit` promotes by index, AND the chord fires while keyboard focus is inside CM6 (right panel) AND inside the terminal (left half). Drag-reorder rearranges tiles; the new order survives a reload; `⌘⇧+digit` follows the NEW order.
  - Native: the left/right focus indicator (WP4b) tracks terminal-half vs right-panel-half keyboard focus on the center-stage workspace (#6ea8ff accent on the focused half's outer edge).
  - Native: collapse/expand reclaims vertical space AND halts/restarts the ~1 fps serialize mirror loop (collapsed → no live preview, mirror CPU → 0; expand → loop restarts with immediate first frame).
  - Native (folded WP1 watch-items): (1) window-close at N is responsive — closing the window with N sessions open completes promptly (no N×3s stall; the `kill_all` grace-window parallelization from WP2 P3 `b48ccce` holds with REAL sessions). (2) RAM headroom at N real in-flight sessions is recorded as operator guidance — note the practical concurrent-workspace ceiling (~8–10 on 16 GB before backend-RAM pressure, per `SURFACE-2026-06-22-N8-CC-BACKEND-RAM`); confirm the marginal Claudesk webview cost (~300–430 MB) matches the WP1 probe envelope.
  - Native (verify-human sign-off — vision success metric 4): from a cold glance the operator can find the awaiting-input workspace in <1s with zero clicks, and switch to it via `⌘⇧+digit` without reaching for the mouse.
  - [x] P1.1 Pre-flight: ensure clean working tree intent (the uncommitted high-pri `SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI` backlog entry rides this cycle's commits — do not lose it); kill any stale dev app (`lsof -ti:1420 | xargs kill`); confirm vitest/tsc/lint green BEFORE the native pass (run with dev app stopped — shared `target/` lock)  <!-- status: done 2026-06-24 — stale :1420 killed; tsc clean; lint 0 errors (1 pre-existing XtermPane.tsx:327 spread-deps warning, not WP5); vitest 426/426 across 49 files = WP4b-close baseline, no regression -->  
  - [x] P1.2 Launch `pnpm tauri dev`; open N≥4 real projects (ideally the operator's real in-flight set) as workspaces; drive the full exit-criteria checklist above — this is the verify-human script, executed live in the native app  <!-- status: done 2026-06-24 — operator ran the native pass, all 7 checklist leaves PASS -->
  - [x] P1.3 Record the two folded watch-item observations: window-close-at-N responsiveness (qualitative: prompt, no multi-second stall) + RAM headroom at N real sessions (note practical ceiling for operator guidance); resolve/annotate `SURFACE-2026-06-22-N8-CC-BACKEND-RAM` accordingly  <!-- status: done 2026-06-24 — vh.6 (close responsive) + vh.7 (RAM headroom + metric 4) PASS; N8-CC-BACKEND-RAM watch confirmed at finalize -->
  - [x] verify-auto  <!-- status: done 2026-06-24 — no impl code this WP; auto-check trio (tsc/lint/vitest 426) green at pre-flight, nothing to re-scope -->  
  - [x] verify-self  <!-- status: done 2026-06-24 — auto-check leg (tsc/lint/vitest 426) verified at verify-auto; ALL native Observable Outcomes are UNVERIFIED by agent (no Tauri IPC in plain-browser Playwright → no .workspace mounts) → routed to native verify-human. See SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI (anchored M5). No integration boundary — WP adds no code, only the verification artifact. -->
  - [x] verify-human  <!-- status: done 2026-06-24 — operator "all pass" on all 7 leaves in the native app at N≥4 real sessions; M4 exit criteria met (dogfood-replace bar cleared) -->
    - [x] P1.vh.1 N≥4 real workspaces each have a live independent CC session; no cross-workspace leak  <!-- status: PASS 2026-06-24 -->
    - [x] P1.vh.2 every workspace's status visible w/ zero clicks in expanded filmstrip + collapsed pill row; dot agrees with header  <!-- status: PASS 2026-06-24 -->
    - [x] P1.vh.3 both promote paths (tile/pill click + ⌘⇧+digit) work, incl. chord with focus in CM6 and in terminal; drag-reorder persists + reindexes ⌘⇧+digit  <!-- status: PASS 2026-06-24 -->
    - [x] P1.vh.4 left/right focus indicator tracks terminal-half vs right-panel-half focus  <!-- status: PASS 2026-06-24 -->
    - [x] P1.vh.5 collapse/expand reclaims space + halts/restarts mirror loop  <!-- status: PASS 2026-06-24 -->
    - [x] P1.vh.6 window-close at N is responsive (kill_all ripple fix holds with real sessions)  <!-- status: PASS 2026-06-24 -->
    - [x] P1.vh.7 RAM headroom recorded; awaiting-input workspace found in <1s + ⌘⇧+digit switch, no mouse (vision metric 4)  <!-- status: PASS 2026-06-24 -->
  - [x] verify-codify  <!-- status: done 2026-06-24 — NO new tests: WP5 is a milestone-exit verification gate, ships no impl code, introduces no new behavior. All M4 behaviors already codified by owning WPs (pure logic unit-covered by vitest 426; wiring/render/interaction has no agent driver — that gap is M5-scoped per SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI). No integration boundary. Full suite re-run: 426/426, no regression. -->

## Current Node
- **Path:** Feature > COMPLETE → review-quality done (N/A, no code diff) → finalize
- **Active scope:** none — WP5 shipped (1fe939a); next is /feature-finalize
- **Blocked:** none
- **Unvisited:** (none — single-phase verification WP; after Phase 1 verify-codify, the WP is done → milestone-exit → `/product-finalize`)
- **Open discoveries:** none

## Code-Quality Review — M4 WP5 (Verify multi-workspace at N)

**Disposition: N/A — no code diff.** WP5 is a verification-only milestone-exit gate. The ship commit `1fe939a` changed only `workflow/backlog.md` (a SURFACE entry) and this WIP verification artifact — **zero source files** (`git diff --name-only 1fe939a^..1fe939a` matches no `.ts/.tsx/.rs/.css/.js`). The `code-quality-reviewer` subagent spawn was skipped because there is no implementation diff to review; spawning against an empty code surface would only invite confabulated findings against unchanged code. No findings (CRITICAL/MAJOR/MINOR) — none possible. All M4 implementation code was reviewed at its owning WP's review-quality pass (WP2/WP3/WP4/WP4b).

### If you disagree
If you want a review run anyway, the escape hatch is to invoke `/feature-review-quality` manually against a specific commit range; there's no code in this WP's range to review.

## Retrospect
- **What changed in our understanding:** Nothing material — WP5 was a pure verification gate and the M4 surface held together exactly as the per-WP work predicted. The single confirmation of note: the WP1 cost/RAM envelope (measured on a *synthetic* probe fixture) holds with *real* CC sessions at N≥4, and the responsive window-close from WP2's `kill_all` parallelization holds with real sessions too — both were the explicit risks WP5 existed to retire, and both passed.
- **Assumptions that held:** The four prior WPs (N>1 lift, filmstrip, collapse, focus indicator) compose without interaction bugs at real N; status is honestly M3-hook-driven with the dot agreeing with the header; both promote paths (click + `⌘⇧+digit`) fire from both focus contexts; drag-reorder persists and reindexes the chord. One clean autopilot pass, zero back-loops.
- **Assumptions that were wrong:** None. Operator returned "all pass" on all 7 leaves.
- **Approach delta:** As expected for a verification-only WP, the build/verify-auto/verify-self states were structurally near-empty — the only auto-checkable leg was the green-suite trio (already green); every behavioral outcome was native-verify-human by necessity (no Tauri IPC for agent drivers — the now-4×-hit gap tracked in `SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI`, anchored to M5). review-quality was N/A (no code diff). The workflow machinery ran end-to-end but most states were acknowledgement-only — appropriate for a milestone-exit gate.

## Communicate
> **Feature complete:** M4 WP5 (Verify multi-workspace at N) has shipped. It is the milestone-exit verification gate that proved Claudesk's full multi-workspace surface holds at N≥4 real CC sessions — independent sessions with no leak, zero-click status across the filmstrip + collapsed pills, both promote paths, the focus indicator, collapse/expand, responsive close, and the <1s-find-and-keyboard-switch success metric. With it, **Milestone 4 is complete and the M3+M4 dogfood-replace point is reached** — Claudesk can now replace the terminal + Sublime daily-driver setup. Verify by opening ≥4 projects in `pnpm tauri dev` and switching among them via `⌘⇧+digit`.

Requester = operator — closure notice for self-record.

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
[SURFACED-2026-06-24] Phase 1 verify-self — Did NOT spawn the Playwright verify-self-runner: every native Observable Outcome requires real Tauri IPC + real CC sessions, which the plain-browser Playwright path cannot mount (4th consecutive workspace-UI WP to hit this; already tracked as the high-pri SURFACE-2026-06-23-VERIFY-SELF-DRIVER-FOR-WORKSPACE-UI, anchored to M5 planning). Spawning would deterministically yield all-UNVERIFIED and burn context. Auto-checkable leg (tsc/lint/vitest 426) verified at verify-auto. All exit-criteria checks routed to native verify-human — appropriate for a milestone-exit gate by design.
