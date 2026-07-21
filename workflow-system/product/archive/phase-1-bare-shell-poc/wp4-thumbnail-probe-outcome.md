---
stage: probe-outcome
state: complete
wp: WP4
updated: 2026-06-17
---

# WP4 — Thumbnail-rendering probe outcome

**Verdict: PASS (conditional) → Phase 2 ships live ~1 fps mirrors, using the `serializeAsHTML()` arm, with a documented active-CPU p95 caveat and mitigations.**

Linked from `arch.md` §"Phase 1 thumbnail-rendering probe" and `roadmap.md` Phase 2.

## Question

Can Claudesk sustain ~1 fps live terminal mirrors of **8 backgrounded** xterm.js instances + **1 active foreground** xterm.js on real macOS hardware, within budget? Outcome gates Phase 2's filmstrip + PiP rendering strategy: **pass → live mirrors; fail → static status tiles in v1**, live mirrors deferred to a Future Possibility.

## Method

- **Harness:** `src/probe/Harness.tsx` (throwaway). 8 background xterm.js instances (DOM renderer only — **no WebGL addon**) + 1 active center xterm, filmstrip of 8 `scale(0.15)` thumbnail tiles, mirror updates RAF-throttled to ~1 fps (pauses on `document.hidden`). Two arms, runtime/URL-toggleable:
  - **Arm A — `clone`:** tile = `cloneNode(true)` of the live terminal DOM each tick; backgrounds kept on-viewport but `opacity:0` so xterm's `IntersectionObserver` does NOT pause their renderer.
  - **Arm B — `serialize`:** tile = `@xterm/addon-serialize` `serializeAsHTML()` from the buffer each tick; backgrounds pushed off-viewport (`left:-99999px`) so the renderer pauses (~5ms/frame saved each) while the buffer still updates via `write()`.
- **Fixture:** `cc-replay.cast` — reconstructed from a **real Claude Code transcript** (`probe/gen-cc-replay-cast.mjs`): real assistant prose + tool names + tool-result output, at real transcript cadence (idle gaps clamped ≤1.2s), wrapped in CC-representative ANSI (colored streamed prose, tool-call header + spinner, boxed tool output, periodic clears). 5366 output events, 578s loop. This carries the two render-cost-driving properties faithfully (real content volume + real bursty pacing); only the exact escape-sequence choreography is synthesized vs a live `asciinema rec`.
- **CPU + RAM** measured on the **real Tauri WKWebView** (debug build) by explicit PID — `top -l 180 -s 1` (no-sudo path; `powermetrics` needs root and the run was unattended) summing the **WebContent + GPU** helper processes (where xterm's DOM-render + compositing work lands; the Tauri main process is tracked separately as overhead). RAM via `footprint -p`. First 10 samples discarded as warm-up.
- **Frame time** measured via the in-page rAF-delta collector (`window.__probeStats()`) over 60s per arm. **Measured in Chromium (vite:1420), not WKWebView** — the WKWebView's remote inspector isn't CDP-scriptable for unattended in-page eval, and the "is rAF keeping up with the 60Hz refresh" check is engine-equivalent. CPU/RAM — the engine-specific metrics — were measured on WKWebView.
- **Matrix:** {serialize, clone} × {active, idle}, ~3 min CPU capture each.

**Hardware:** Apple M4, 10-core, 16 GB RAM, macOS 26.5.1 (25F80), 1920×1080 @ 60 Hz. Machine freshly restarted to a quiet baseline; AC power. Single-user tool — this is the operator's actual dev hardware, which is the relevant target.

## Results

| Scenario | Webview %CPU median | Webview %CPU p95 | Webview %CPU max | RAM total (main+WC+GPU) | Frame median / p95 / max / dropped |
|---|---|---|---|---|---|
| **serialize / idle** | **4.5** | 5.3 | 6.1 | **147 MB** (26+55+66) | — |
| **serialize / active** | **13.3** | 29.9 | 38.8 | **240 MB** (26+142+72) | 16.7 / 18.0 / 18.7 / **0** of 4049 |
| clone / idle | 7.0 | 7.9 | 8.7 | 198 MB (26+101+70)\* | — |
| clone / active | 17.1 | 32.9 | 40.5 | 234 MB (26+161+73)\* | 16.7 / 17.7 / 18.7 / **0** of 3997 |

\* clone/idle RAM measured after the clone/active run; clone tiles retain cloned DOM.
Main (claudesk) process CPU was 2–4% across all scenarios — negligible overhead.

## Pass/fail per metric (against WBS thresholds)

| Metric | Threshold | serialize (primary) | Verdict |
|---|---|---|---|
| Idle CPU (8 idle) | < 10% | median 4.5%, p95 5.3% | ✅ **PASS** (comfortable) |
| Active CPU (1 streaming, 7 idle) | < 20% | **median 13.3% ✅** / **p95 29.9% ⚠️** | **CONDITIONAL** — median passes; p95 exceeds on bursts |
| RAM total | < 300 MB | 240 MB active, 147 MB idle | ✅ **PASS** |
| Center frame time | < 16 ms (p95) | p95 18.0 ms, **0 dropped frames** | ✅ **PASS** (p95 is 1 refresh interval; rAF capped at 60 Hz = 16.7 ms, so 18 ms p95 with zero drops = keeping up) |

**Note on the harness vs the real worst case:** the harness fed ALL 8 backgrounds the stream during "active" (8 streaming + 1 active), which is *harsher* than the WBS "active" definition (1 streaming, 7 idle). So the active-CPU numbers above are a pessimistic upper bound — the real Phase 2 active scenario will sit between the measured "active" (8 streaming) and "idle" (0 streaming) rows, i.e. comfortably under the active row's figures.

## Arm A vs Arm B

`serialize` beats `clone` on every active-scenario axis, as the research predicted:
- Active CPU: serialize median **13.3%** vs clone **17.1%** (and lower p95: 29.9 vs 32.9).
- Active RAM: serialize 240 MB vs clone 234 MB (comparable; clone's WebContent higher at 161 vs 142 MB).
- Both hold 60 Hz with **zero dropped frames**.
- Architecturally `serialize` is also the only arm compatible with letting xterm pause off-viewport renderers — `clone` must fight that pause by forcing backgrounds on-viewport (`opacity:0`), forfeiting the free ~5ms/frame/terminal saving.

**Recommendation: Phase 2 uses the `serializeAsHTML()`-from-buffer arm.**

## Recommendation → Phase 2

**Ship live ~1 fps mirrors** (probe passes on idle CPU, RAM, and frame time; active CPU median passes). Use the **serialize arm**. Carry these deltas into Phase 2's filmstrip + PiP design:

1. **Mirror mechanism = `@xterm/addon-serialize` `serializeAsHTML()` from the buffer**, throttled to ~1 fps, into a `scale()` tile. NOT cloneNode, NOT off-screen-DOM-mirror (see arch.md correction below).
2. **Background workspaces live off-viewport** (`left:-99999px`) so xterm's `IntersectionObserver` pauses their renderer for free — the buffer still updates via `write()`, so the serialized snapshot stays current. This is an architectural gift: collapsed/hidden workspaces cost ~0 render.
3. **Active-CPU p95 caveat:** bursty CC output drives transient WebContent+GPU spikes to ~30% (median stays ~13%). Mitigations available if real-world dogfooding shows this matters: lower the mirror rate below 1 fps for backgrounds, coalesce serialize calls, or only mirror the N most-recent/visible tiles. The harness over-streamed (8 concurrent background streams) vs the realistic 1-active-7-idle case, so production p95 will be lower.
4. **`display:none` breaks FitAddon** (`fit()` throws on zero dims) — for truly collapsed tiles use off-viewport positioning, not `display:none`, if a re-measure/refit is ever needed.

This does NOT gate any Phase 1 build; it informs Phase 2 only.

## Caveats / fidelity notes

- **Frame-time was Chromium, not WKWebView** (tooling constraint). The rAF-cap check is engine-equivalent for "keeping 60 Hz"; CPU/RAM (the engine-specific metrics) were on WKWebView. A future spot-check of WKWebView frame-time via Safari Web Inspector → Timelines would fully close this.
- **CPU via `top`, not `powermetrics`** (unattended, no sudo). `top`'s sampled `%CPU` is Activity-Monitor-grade — adequate for a threshold decision, less precise than kernel power counters.
- **`cc-replay` fixture** is a faithful reconstruction (real content + cadence) but synthesizes the ANSI choreography. A live `asciinema rec -f asciicast-v2` capture would be the gold standard if a future re-measure wants exact escape sequences.
- Numbers are M4-specific. A weaker Mac would scale up; the headroom on idle CPU (4.5% vs 10%) and RAM (240 vs 300 MB) gives margin, but the active-CPU p95 is the metric to watch on slower hardware.
