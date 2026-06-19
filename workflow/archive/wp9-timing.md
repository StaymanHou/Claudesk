# WP9 — Time-to-Productive Measurement

**Exit criterion (Phase 1, vision + roadmap):** from cold launch → click a recent project in the picker → a working, interactive Claude Code session running in the project dir inside a workspace, in **< 10 seconds**.

This is the headline pain point Claudesk exists to kill: the old flow (open terminal → `cd` → `claude` → wait for CC to boot) takes "minutes of repetitive setup" across 20+ rotating projects. The <10s target is the bar for "the launch tax is gone."

## What "productive" means here

The clock stops when the user can **type into a live CC prompt** — i.e. the embedded `claude --dangerously-skip-permissions` session has spawned in the PTY, xterm has rendered CC's initial prompt, and keystrokes reach CC. Not merely "the window appeared."

## Measurement method (operator, native shell)

The number must be taken in the real native Tauri shell (WKWebView + real PTY + real `claude`), not `vite dev` in a browser — the PTY spawn and CC boot are the dominant cost and only exist in the native runtime.

1. Build/run the app: `pnpm tauri dev` (or a release `pnpm tauri build` + launch the `.app` for a truer cold-start number — note which was used).
2. **Cold launch:** fully quit Claudesk first so this is a cold start, not a warm re-focus.
3. Start a stopwatch at the **picker-project-click** (the action the criterion measures — app-window-open is a separate, smaller cost and is noted but not the gated number).
4. Stop when the CC prompt is interactive (type a character and see it echo).
5. Record 3 runs against a representative real project (a repo CC actually has to read), take the median.

Optional finer breakdown if the median is close to 10s: note (a) window-open→picker-ready, (b) click→PTY-spawn, (c) PTY-spawn→CC-prompt-interactive. The CC-boot segment (c) is outside Claudesk's control (it's `claude`'s own startup); if the total exceeds 10s, recording the split tells us whether Claudesk's shell or CC's boot is the cost.

## Measurements

> Filled by the operator during the Phase 2 verify-human / dogfood window (this is an operator-time, native-shell measurement — the agent cannot run a GUI stopwatch).

| Run | Project | click → CC interactive | Notes |
|-----|---------|------------------------|-------|
| 1   |         |                        |       |
| 2   |         |                        |       |
| 3   |         |                        |       |

**Median:** _____ s (not formally measured)
**Verdict vs <10s target:** ACCEPTED ON FEEL — operator confirmed the launch experience "feels right" at WP9 verify-human (2026-06-19) without a stopwatch run. No number recorded.

If a formal number is wanted later: take the 3-run median per the method above; if it exceeds 10s, record the split (window/spawn/CC-boot) and SURFACE the bottleneck to backlog for Phase 2/4.
