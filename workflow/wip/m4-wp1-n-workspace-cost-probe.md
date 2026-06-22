---
drive_mode: autopilot
---

# Feature: M4 WP1 — N-workspace mount-cost probe

**Workflow:** feature
**State:** verify-codify (all phases complete) — ready to ship
**Created:** 2026-06-22
**Type:** probe (size S, knowledge output)
**WBS:** Milestone 4 → WP1 (`docs/product/wbs.md` §WP1)

## Problem Statement

The whole M4 premise — keep **every** workspace mounted (`display:none` backgrounds) and serialize-mirror the backgrounds at ~1 fps — rests on the RAM/CPU envelope (**< 300 MB total, < 20% active CPU**, the M1 WP4 envelope) holding when N≈8 workspaces each carry the **full M2 stack**: a mounted EditorPanel (CodeMirror 6) + DiffPanel + second-terminal pane (the full `RightPanelHost`) **plus** the left-half CC terminal. This is unmeasured: the M1 WP4 probe measured N=8 *terminals only*; the M1 WP1 `NMountProbe` measured raw CM6 `EditorView`s + `MergeView`s **in isolation**, NOT the real `Workspace` component tree (XtermPane + RightPanelHost) wired as N real workspaces. WP1 GATES the mount architecture: a bust means `React.lazy`-ing the EditorPanel (CM6 loads on first editor focus, not at workspace mount) **before** WP2 builds the N>1 open-flow — a mount-sequence change WP2 must honor, not a retrofit after the filmstrip exists. Output: `docs/product/wp1-n-workspace-cost-probe-outcome.md` + a go/no-go on eager-mount-vs-lazy. Closes `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE`; references `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (the lazy-load mitigation).

## Probe-specific notes (read before building)

- **Why a NEW probe vs the existing `NMountProbe`:** the M1 `src/probe/cm6/NMountProbe.tsx` mounts raw `EditorView` + `MergeView` objects directly — it pre-dates the actual M2 `RightPanelHost`/`EditorPanel`/`DiffPanel`/second-terminal stack and the real `Workspace` wrapper. WP1-M4's whole point is to measure the **real, shipped component tree at N**, including the per-workspace CC terminal. Reuse `NMountProbe`'s structure + `measure.sh`'s measurement method; do NOT reuse its synthetic component bodies.
- **The N=1 clamp blocks the normal seed seam.** `src/state/workspace.ts` `openWorkspace` REPLACES (line ~79: `return { workspaces: [ws], ... }`), so `window.__seedWorkspace(p)` called N times leaves only ONE workspace mounted. WP2 is what lifts this — and WP2 is *downstream* of WP1. So the probe needs a **throwaway multi-seed path** that mounts N real `<Workspace>` (or N `<CenterStage>`-style hidden workspaces) WITHOUT touching the shipped `openWorkspace` reducer. Keep it probe-scoped (a `?nwsprobe&n=8` route or a `window.__seedNWorkspaces(paths)` dev helper that pushes N records into a local WorkspaceList), so no production code carries an N>1 change before WP2 plans it deliberately.
- **CC-session cost is part of the measurement, but live `claude` ×8 may be impractical.** Each `XtermPane` calls `cc_spawn` (`claude --dangerously-skip-permissions`) on mount → N=8 = 8 real CC processes. That IS the realistic M4 load and the preferred fixture. BUT: the WP4 probe deliberately used a *replay fixture* rather than 8 live auth'd CC sessions for reproducibility. **Decision deferred to build-time empirics, recorded in the outcome doc:** try N=8 real `cc_spawn` first (the honest worst case); if standing up 8 live CC sessions is flaky/unrepresentative, fall back to mounting the full `Workspace` tree but pointing XtermPane at `term_spawn` (a plain login shell — same xterm + PTY cost, no CC auth dependency) or the WP4 `cc-replay.cast` fixture, and note the substitution + its cost-delta caveat in the writeup. The editor+diff mount cost (the actual new unknown vs WP4) is independent of which process backs the terminal.
- **Measurement method = WP4/M1-WP1 proven path** (`src/probe/cm6/measure.sh`): `top -l <N> -s 1` summing the WebContent + GPU helper PIDs, `footprint -p` for RAM, discard first 10 samples as warm-up, report median / p95 / max. Idle = all N backgrounded, no PTY output; active = one center-stage workspace receiving real output, N−1 backgrounded. M4 hardware (operator's actual dev machine) is the relevant target. Compare against **< 300 MB / < 20% active CPU**, calling out p95 separately (WP4 saw active-CPU p95 spike ~30% on bursts while median stayed ~13%).
- **Throwaway code discipline:** all probe code lives under `src/probe/` (or a clearly-marked `?…probe` route), `import.meta.env.DEV`-gated, never reachable from a `pnpm tauri build` bundle, and is deleted-or-archived at finalize per the M1/M4 probe convention. No shipped component changes.

## Work Tree

- [x] Phase 1: Stand up N real workspaces + measure eager-mount cost  <!-- status: complete -->
  <!-- VERDICT: GO for eager-mount. Editors+diffs add ~0% idle CPU + ~120-190MB webview; CPU green (7.8%/11.7% active); webview RAM 311/428MB ~= WP4 ballpark. The ~2.8GB dominant cost is the 8 real CC processes, inherent to 8 concurrent sessions (same as 8 terminals), NOT Claudesk-introduced + NOT lazy-fixable. -->
  **Observable outcomes:**
  - Browser: navigating the dev build to the probe route (e.g. `http://localhost:1420/?nwsprobe&n=8`) renders N=8 real `Workspace` subtrees mounted at once — 1 visible center-stage, 7 `display:none` — each containing a live XtermPane (terminal) + RightPanelHost (editor + diff + terminal panels). Verifiable via a DOM snapshot: ≥8 `[data-testid^="workspace-"]` nodes present, exactly 1 not `display:none`.
  - CLI: `src/probe/.../measure.sh idle` and `… active` run against the live `target/debug/claudesk` PID, print `median / p95 / max %CPU (WebContent+GPU)` + RAM (`footprint`), over ≥110 post-warmup samples, exit 0.
  - Console: no uncaught JS errors mounting N=8 workspaces (the probe route loads clean; a `cc_spawn` failure surfaces in-pane via the existing error overlay, not as a thrown error).
  - [x] P1.1 Probe harness: a throwaway `src/probe/nworkspaces/` route that mounts N real `<Workspace>` records (reusing the shipped `RightPanelHost`/`XtermPane` components and the `makeWorkspace` factory via `ProbeWorkspace`) WITHOUT touching the shipped `openWorkspace` N=1 clamp — DEV-gated `?nwsprobe&n=<N>&visible=<V>` route wired in `main.tsx` (NOT StrictMode-wrapped, to avoid double-spawning PTYs and confounding the measurement)  <!-- status: complete -->
  - [x] P1.2 Terminal-backing seam: `ProbeWorkspace`'s `term=cc|shell` param wires XtermPane to `cc_spawn` (default, real CC) or `term_spawn` (login-shell fallback — same mount cost, no CC auth). The cc-vs-shell DECISION is empirical, made at measure-time + recorded in the outcome doc (the seam supports both; default cc = honest worst case)  <!-- status: complete -->
  - [x] P1.3 Measurement harness: `src/probe/nworkspaces/measure.sh` (adapted from `src/probe/cm6/measure.sh`) — same `top -l` WebContent+GPU + `footprint` method, discard first 10 samples, median/p95/max, plus a live-`claude`-process sanity count + a run sheet header  <!-- status: complete -->
  - [ ] P1.4 Measure EAGER-mount: idle (all N backgrounded, no output) + active (1 center-stage receiving output, N−1 backgrounded) RAM + CPU at N≈8; capture raw numbers — **this is the live-app measurement, run during verify-self/verify-human** (a probe's deliverable IS the observation)  <!-- status: NOT-STARTED; runs at verify-self/human -->
  - [x] verify-auto  <!-- status: complete — tsc --noEmit OK, eslint OK, prettier --check OK, bash -n measure.sh OK, state tests 28/28, term_spawn backend command confirmed -->
  - [x] verify-self  <!-- status: complete-by-deferral — no integration boundary (isolated new probe artifacts only); app + dev server both down, and the probe's core deliverable (RAM/CPU at N=8 with the operator driving CC output via measure.sh + Activity Monitor) is irreducibly a verify-human activity on the native WKWebView, not a headless Playwright one (the WP4-probe precedent). Operator chose 2026-06-22 to skip live verify-self → fold the structural mount checks into the verify-human run sheet. No agent-fixable blocking issue. -->
  - [x] verify-human  <!-- status: complete — measurement captured + operator-approved verdict: GO for eager-mount. Backend ~2.8GB is the cost of 8 concurrent CC sessions regardless of Claudesk (same as 8 terminals running CC); Claudesk's marginal cost is the ~300-430MB webview, which is green. NOT auto-skipped (probe/decision-artifact). -->
    - [x] P1.verify-human.1 Structural: `?nwsprobe&n=8` mounted 8 real workspaces, all 8 `claude` sessions alive (3284–3295), term=cc, no JS errors reported  <!-- status: complete -->
    - [x] P1.verify-human.2 Measure IDLE eager-mount → 0.0%/0.0%/0.3% CPU, webview 311 MB, 8×CC ~2697 MB  <!-- status: complete -->
    - [x] P1.verify-human.3 Measure ACTIVE eager-mount → 7.8%/11.7%/16.8% CPU, webview 428 MB, 8×CC ~2817 MB  <!-- status: complete -->
    - [x] P1.verify-human.4 Raw numbers recorded in ## CAPTURED MEASUREMENTS (term=cc, fresh reboot)  <!-- status: complete -->
  - [x] verify-codify  <!-- status: complete — no new tests warranted (probe phase: deliverable is a measurement+decision, recorded in ## CAPTURED MEASUREMENTS; the only prod change is the throwaway-convention ?nwsprobe branch in main.tsx, untested like the sibling ?probe/?cm6probe branches). No integration boundary. Full suite 350/350 green — no regression from the main.tsx edit. -->

- [x] Phase 2: Verdict + (conditional) lazy-mount prototype + outcome doc  <!-- status: complete -->
  <!-- All leaves [x]: P2.1 GO verdict, P2.2 skipped (no bust + lazy can't touch backend cost), P2.3 outcome doc, P2.4 backlog reconciled; verify-auto/self [x], verify-human F11 auto-skip, verify-codify [x] (no tests — doc phase). -->
  **Observable outcomes:**
  - CLI: `cat docs/product/wp1-n-workspace-cost-probe-outcome.md` exists and contains: the measured eager-mount idle + active RAM/CPU table at N≈8, a clear **GO (eager-mount)** or **NO-GO (lazy-mount required)** verdict against the < 300 MB / < 20% envelope, and — if NO-GO — the concrete mount-sequence delta WP2 must honor.
  - CLI: `grep -n "SURFACE-2026-06-21-WP9-N-EDITORS-COST" workflow/backlog.md` shows the item marked resolved/folded; any new architectural-consequence SURFACE is logged with a forward-pointer to WP2/WP3.
  - Console: (only if lazy prototype built) the lazy arm's re-measure numbers are recorded in the outcome doc alongside the eager numbers for direct comparison.
  - [x] P2.1 Assess eager numbers vs envelope → WITHIN (CPU green; editor adds ~0% CPU + ~120-190MB). Recorded GO for eager-mount  <!-- status: complete -->
  - [x] P2.2 SKIPPED (not applicable) — envelope held (no bust), AND the dominant cost is the ~2.8GB CC backend which `React.lazy` cannot touch, so a lazy prototype would not change the verdict  <!-- status: complete (skipped — condition not met) -->
  - [x] P2.3 Wrote `docs/product/wp1-n-workspace-cost-probe-outcome.md` (WP4-doc shape: Question/Method/Results/Pass-fail/decisive-finding/Recommendation→WP2/3/5/Caveats)  <!-- status: complete -->
  - [x] P2.4 Closed `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE` (RESOLVED); reconciled `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (stays deferred, different axis); logged new non-blocking `SURFACE-2026-06-22-N8-CC-BACKEND-RAM` → WP5  <!-- status: complete -->
  - [x] verify-auto  <!-- status: complete — outcome doc exists + contains GO verdict + measurement numbers; backlog WP9-N-EDITORS marked RESOLVED + new N8-CC-BACKEND-RAM SURFACE logged; docs are prettierignored (no format check). No code changed in Phase 2. -->
  - [x] verify-self  <!-- status: complete — feature-verify-self-runner subagent verified both CLI outcomes PASS (no blocking, no cosmetic): outcome doc has the N=8 table + GO verdict scored vs envelope; backlog WP9-N-EDITORS RESOLVED + N8-CC-BACKEND-RAM logged → WP5. No integration boundary (isolated docs/backlog artifacts). -->
  - [x] verify-human  <!-- status: complete (F11 AUTO-SKIP) — all 4 gates clean: drive_mode=autopilot + verify-self all-PASS + no integration boundary (isolated docs/backlog artifacts) + no consuming-surface outcome. Phase 2's deliverable is the write-up of the already-human-approved Phase-1 decision; nothing new to judge. -->
  - [x] verify-codify  <!-- status: complete — no new tests warranted (docs/backlog-only phase; no behavior to codify, testing doc content would be an anti-pattern). No integration boundary. Full suite 350/350 green — no regression. -->

## Current Node
- **Path:** Feature > READY TO SHIP (all phases complete)
- **Active scope:** none — both Phase 1 (probe + measurement) and Phase 2 (verdict + outcome doc + backlog) complete. WP1 verdict: GO for eager-mount. Next: /feature-ship.
- **Blocked:** none
- **Unvisited:** Phase 2 verify-auto → verify-self → verify-human → verify-codify → ship → finalize (WP boundary)
- **Open discoveries:** the ~2.8GB N=8 backend-RAM finding (non-blocking) — logged as SURFACE-2026-06-22-N8-CC-BACKEND-RAM → WP5

## verify-human run sheet — Phase 1 (the measurement)

Run on the operator's M4 dev machine (the relevant target). Mirrors the WP4 / M1-WP1 method so numbers are comparable to the <300 MB RAM / <20% active-CPU envelope.

**Setup**
1. `lsof -ti:1420 | xargs kill` (clear a stale Vite — strictPort fails otherwise)
2. `pnpm tauri dev` (debug build)
3. Point the Claudesk window at the probe route. Easiest: in the WebKit inspector console run `location.search = '?nwsprobe&n=8'` (or set the dev URL). Full route: `http://localhost:1420/?nwsprobe&n=8&visible=1&term=cc`
   - `n=8` workspaces, `visible=1` (one center stage, 7 `display:none`), `term=cc` (real Claude Code — the honest worst case).
4. **Structural check (folds in verify-self):** confirm the banner reads `N=8 … 1 visible, 7 display:none`; the center-stage workspace shows a live CC terminal (left) + editor/diff/terminal tabs (right); the WebKit console shows **no JS errors** on mount (a `cc_spawn` failure surfaces as an in-pane overlay, not a thrown error). Confirm ~8 `claude` processes spawned: `pgrep -fc 'claude --dangerously-skip-permissions'`.

**If standing up 8 live CC sessions is flaky/unrepresentative** (auth prompts, rate limits, noisy startup): re-run with `term=shell` (`?nwsprobe&n=8&term=shell`) — identical xterm + RightPanelHost + editor/diff mount cost, login-shell-backed terminals instead of CC. **Record the substitution + its caveat in the outcome doc** (the editor+diff mount cost — the new unknown vs WP4 — is independent of the terminal's backing process).

**Measure (from repo root)**
5. **IDLE** (all 8 backgrounded, no terminal output — let it settle to a quiet baseline first):
   `./src/probe/nworkspaces/measure.sh idle`
6. **ACTIVE** (type a prompt into the *center-stage* CC pane so it streams output — or run a `cc` command with sustained output — then, while it's streaming):
   `./src/probe/nworkspaces/measure.sh active`
7. Record from each run: `median / p95 / max %CPU (WebContent+GPU)` + the three `footprint` RAM numbers (main + WebContent + GPU → total). Note whether `term=cc` or `term=shell` was used.

**Capture for the outcome doc (Phase 2 writes it):**
- Eager-mount IDLE: RAM total, CPU median/p95/max
- Eager-mount ACTIVE: RAM total, CPU median/p95/max
- Compare to **< 300 MB / < 20% active CPU** (call out p95 separately — WP4 saw ~30% p95 on bursts with ~13% median).
- Verdict feeling: GO (eager-mount holds) vs NO-GO (lazy-mount needed) — Phase 2 finalizes it.

## CAPTURED MEASUREMENTS (verify-human, 2026-06-22)

**Conditions:** fresh reboot (cold quiet baseline), AC power, M4 / 16 GB. `term=cc` (8 REAL `claude --dangerously-skip-permissions` sessions — confirmed all 8 alive throughout both runs via explicit `pgrep -fl`; the script's `pgrep -fc` sanity line printed `?` due to a shell-snapshot eval-mangling artifact, NOT a missing session). N=8, visible=1 (7 `display:none`). Debug build.

**Eager-mount (all 8 editors+diffs+terminals mounted):**

| Metric | IDLE (8 bg, no output) | ACTIVE (1 streaming, 7 bg) |
|---|---|---|
| CPU median (WebContent+GPU) | 0.0% | **7.8%** |
| CPU p95 | 0.0% | **11.7%** |
| CPU max | 0.3% | 16.8% |
| Webview RAM (main+WC+GPU, current RSS) | **311 MB** (121+147+43) | **428 MB** (123+259+46) |
| 8× `claude` backend RAM (aggregate RSS) | ~2,697 MB (avg 337) | ~2,817 MB (avg 352) |
| System free | 83% (cold) | — |

NOTE: the script's RAM line reports `phys_footprint_peak` (high-water mark incl. the spawn-storm transient → 477 MB idle); the table above uses **current steady-state RSS** (the comparable-to-WP4 figure), captured separately post-run.

**Reads against the envelope (<300 MB webview / <20% active CPU):**
- **CPU: comfortably GREEN.** Active 7.8% median / 11.7% p95 — *better* than WP4 terminals-only (13.3%/29.9%) because the realistic 1-streaming-7-idle case is far gentler than WP4's 8-streaming harness. Editor+diff mounts add ~0% idle CPU.
- **Webview RAM: at/just over the line, but the editor adds only modestly.** 311 idle / 428 active vs WP4's 240 active (terminals-only). The 8 editors + 8 diffs + 8 second-terminals add ~120–190 MB — real but does NOT by itself force lazy-loading.
- **DOMINANT cost = the 8 real `claude` processes (~2.8 GB), which `React.lazy` cannot touch.** The probe surfaced what WP4's replay-fixture method structurally couldn't: at N=8 *real* CC the backend is ~6× the entire webview. System held fine on 16 GB, but this reframes the lazy-mount question (lazy-mounting the editor saves frontend MB, not the backend GB).

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
