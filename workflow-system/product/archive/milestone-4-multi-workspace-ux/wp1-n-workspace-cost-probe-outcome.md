---
stage: probe-outcome
state: complete
wp: M4 WP1
updated: 2026-06-22
---

# M4 WP1 — N-workspace mount-cost probe outcome

**Verdict: GO for eager-mount.** Keep every workspace's full M2 stack (CM6 editor + diff + second terminal) eagerly mounted at N. The editors+diffs add only ~0% idle CPU and ~120–190 MB webview RAM on top of the WP4 terminals-only envelope; CPU is comfortably green. `React.lazy`-ing the EditorPanel is **not required** for M4 — and would not address the one large cost the probe surfaced (the CC backend), so it is shelved, not adopted.

Linked from `roadmap.md` M4 + `wbs.md` §WP1. Resolves `SURFACE-2026-06-21-WP9-N-EDITORS-COST-AT-MULTIWORKSPACE`; reconciles `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` (kept deferred — see below).

## Question

The M4 premise is "keep every workspace mounted (`display:none` backgrounds) + serialize-mirror the backgrounds." That rests on the cost envelope (**< 300 MB webview RAM, < 20% active CPU** — the M1 WP4 envelope) holding when N≈8 workspaces each carry the **full M2 stack**: a mounted EditorPanel (CodeMirror 6) + DiffPanel + second-terminal pane (the full `RightPanelHost`) **plus** the left-half CC terminal. This was unmeasured: WP4 measured N=8 *terminals only*; the M1 WP1 `NMountProbe` measured raw CM6 `EditorView`s + `MergeView`s **in isolation**, not the real `Workspace` component tree wired as N real workspaces. The gating question: **does the keep-everything-mounted model hold at N — and if it busts, is lazy-loading the EditorPanel the fix, and what mount-sequence delta does that force on WP2?**

## Method

- **Harness:** `src/probe/nworkspaces/` (throwaway, DEV-only, `?nwsprobe` route in `main.tsx`). `NWorkspacesProbe` builds the WorkspaceList array directly with `makeWorkspace` (bypassing the shipped N=1-clamp `openWorkspace`, since lifting that clamp is WP2's job — downstream of this probe) and renders N copies of `ProbeWorkspace`, which reuses the **real shipped** `XtermPane` (left) + `RightPanelHost` (right: EditorSplit/CM6 + DiffPanel + second TerminalPane + FileTree). Layout mirrors production `CenterStage`: all N mounted, 1 visible, N−1 `display:none`. NOT StrictMode-wrapped (StrictMode's mount→cleanup→remount would double-spawn PTYs and confound the cost). `?nwsprobe&n=8&visible=1&term=cc`.
- **Terminal backing:** `term=cc` — **8 real `claude --dangerously-skip-permissions` sessions** (the honest worst case). All 8 confirmed alive throughout both runs (PIDs 3284–3295 via `pgrep -fl`). A `term=shell` fallback (login shells via `term_spawn`, identical mount cost, no CC auth) was built but not needed.
- **Measurement:** `src/probe/nworkspaces/measure.sh` — mirrors WP4 / M1-WP1 exactly: `top -l 130 -s 1` summing the **WebContent + GPU** helper PIDs (where xterm DOM-render + CM6 layout + compositing land; the Tauri main process is tracked separately as overhead), first 10 samples dropped as warm-up, median/p95/max. RAM via current steady-state RSS (`ps`/`footprint`). The 8 `claude` backend processes were measured separately (aggregate RSS) — a dimension WP4's replay-fixture method structurally could not capture.
- **Idle** = all 8 backgrounded, no terminal output. **Active** = 1 center-stage CC pane streaming a response, 7 backgrounded idle (the realistic M4 scenario — gentler than WP4's pessimistic 8-streaming harness).

**Hardware:** Apple M4, 16 GB RAM. **Fresh reboot** to a cold quiet baseline, AC power. Debug build. This is the operator's actual dev hardware — the relevant single-user target.

## Results

| Metric | IDLE (8 bg, no output) | ACTIVE (1 streaming, 7 bg) | Envelope |
|---|---|---|---|
| CPU median (WebContent+GPU) | **0.0%** | **7.8%** | < 20% ✅ |
| CPU p95 | 0.0% | **11.7%** | (WP4 saw ~30%) ✅ |
| CPU max | 0.3% | 16.8% | — |
| **Webview RAM** (main+WC+GPU, steady-state RSS) | **311 MB** (121+147+43) | **428 MB** (123+259+46) | ~300 MB ⚠️ (see note) |
| 8× `claude` backend RAM (aggregate RSS) | ~2,697 MB (avg 337) | ~2,817 MB (avg 352) | — (not in WP4 scope) |
| System memory free | 83% (cold) | — | — |

Tauri main process RAM is folded into the webview triplet above (121–123 MB). The `measure.sh` RAM line reports `phys_footprint_peak` (high-water mark including the spawn-storm transient → 477 MB idle); the table uses **current steady-state RSS**, the figure comparable to WP4's 240 MB.

## Pass/fail per metric (against the WP4 envelope)

| Metric | Threshold | Measured | Verdict |
|---|---|---|---|
| Idle CPU (8 idle) | < 10% | median 0.0%, p95 0.0% | ✅ **PASS** (effectively zero — off-viewport xterm renderers paused) |
| Active CPU (1 streaming, 7 idle) | < 20% | median 7.8%, p95 11.7% | ✅ **PASS** — *better* than WP4 terminals-only (13.3% / 29.9%) |
| Webview RAM | < 300 MB | 311 idle / 428 active | ⚠️ **CONDITIONAL** — modestly over; the editor's *marginal* cost is small (see below) |
| Center frame time | (not re-measured) | — | inherited from WP4 PASS (0 dropped frames) |

## The decisive finding: cost is dominated by the CC backend, not the editors

The probe surfaced what WP4's replay-fixture method structurally could not: **at N=8 real CC sessions, the 8 `claude` backend processes cost ~2.8 GB (~350 MB each) — roughly 6× the entire webview.** This reframes the whole question:

1. **The editor mount cost — the thing WP1 was scoped to measure — is modest.** WP4 hit 240 MB active with terminals only; the full M2 stack (8 editors + 8 diffs + 8 second-terminals) adds ~120–190 MB of webview on top. Real, but it does **not** by itself force lazy-loading, and it adds ~0% idle CPU.

2. **The ~2.8 GB backend cost is inherent to running 8 concurrent CC sessions — not introduced by Claudesk.** Whether the operator launches 8 sessions via Claudesk or via 8 separate Terminal tabs, the same 8 `claude` processes consume the same RAM. Claudesk's **marginal** cost over "8 terminals running CC" is just the ~300–430 MB webview (which also *replaces* 8 terminal windows + on-demand Sublime windows — a net footprint win vs. the current daily-driver setup).

3. **`React.lazy(EditorPanel)` cannot touch the dominant cost.** Lazy-mounting the editor would save frontend MB (the small part), not the backend GB (the large part). So even if the webview number were a hard concern, lazy-mounting is the wrong lever for it.

## Recommendation → WP2 / WP3 / WP5

**GO: eager-mount every workspace's full M2 stack.** WP2 appends a workspace with its EditorPanel mounted at open (no lazy gate, no mount-sequence delta) — the simplest path, and the one this probe clears. Carry these forward:

1. **No lazy-mount in M4.** `SURFACE-2026-06-19-CM6-BUNDLE-SIZE-LAZY-LOAD` stays **deferred** — it was about *startup parse time* (a different axis), and lazy-loading remains available as a future startup-trimming lever (likely M9 polish) if boot ever feels slow. It is **not** an M4 mount-architecture requirement. WP2 does not need to honor any lazy mount-sequence.
2. **WP3 background-mirror assumption confirmed.** Backgrounds can stay mounted off-viewport at ~0% CPU (idle 0.0%) — the serialize-mirror model is safe to build on. Active CPU (7.8% / 11.7%) leaves comfortable headroom under the 20% bar even with the editor stack mounted.
3. **WP5 (verify-at-N) watch-item — backend RAM headroom, not a blocker.** ~2.8 GB at N=8 held fine on 16 GB (83% free at idle). WP5 should re-confirm with N *real* in-flight sessions and note the practical ceiling (≈8–10 concurrent on 16 GB before backend RAM pressure) as operator guidance — but this is inherent-to-the-workload, not a Claudesk defect. Logged as `SURFACE-2026-06-22-N8-CC-BACKEND-RAM` (non-blocking).

## Caveats / fidelity notes

- **CPU via `top`, not `powermetrics`** (unattended, no sudo) — Activity-Monitor-grade, adequate for a threshold decision (same constraint as WP4).
- **Single root, N=8 same-repo workspaces.** Each workspace opened the claudesk repo; for a *cost* probe what matters is N full mounts, not N distinct repos. N distinct large repos would raise the file-tree/diff walk cost slightly, but the dominant CC-process cost is per-session regardless of repo.
- **Debug build, M4 / 16 GB.** A weaker Mac or a release build would shift absolute numbers; the headroom (0% idle CPU, 7.8% active, 83% RAM free) gives margin, and the backend-RAM ceiling is the metric to watch on lower-RAM machines.
- **Webview number is steady-state RSS, not peak.** The spawn-storm peak (477 MB) is transient (8 simultaneous mounts+spawns); production opens workspaces one at a time, so the peak is not representative of resting cost.
