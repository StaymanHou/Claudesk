---
name: wp4-macos-perf-measurement
description: How to measure CPU/RAM/frame-time of the Tauri WKWebView on macOS for Claudesk perf probes
metadata:
  type: reference
---

macOS perf-measurement recipe for Claudesk's Tauri WKWebView (established in WP4 thumbnail probe, 2026-06-17):

- **Where render CPU lands:** NOT the Tauri main process (that's the WKWebView UIProcess). JS/DOM/layout/xterm-render → `com.apple.WebKit.WebContent`; compositing → `com.apple.WebKit.GPU`. "Webview cost" = WebContent + GPU summed; track the main `claudesk` process separately as overhead (~2–4% observed).
- **Measure by explicit PID, never by name.** A foreign `WebKit.WebContent` from another app (or a stale one from a prior killed launch) will contaminate a name-match. Grab PIDs: `pgrep -f "target/debug/claudesk" | head -1`, and the newest helpers `pgrep -f "WebKit.WebContent" | sort -n | tail -1` / `pgrep -f "WebKit.GPU" | sort -n | tail -1`.
- **CPU:** `powermetrics --samplers tasks --show-process-coalition --show-process-gpu` is precise but **needs sudo** — and `! sudo -v` in-session fails (no TTY for the password prompt). For unattended runs, fall back to no-sudo `top -pid <main> -pid <wc> -pid <gpu> -l N -s 1 -stats pid,cpu` (Activity-Monitor-grade, adequate for threshold checks). Parser: `probe/parse-top.mjs`. Discard ~10 warm-up samples.
- **RAM:** `footprint -p <pid>` per PID (sum main+WebContent+GPU); reports `phys_footprint`. `footprint <name>` failed ("try as root?") — use `-p`. NOT `ps -o rss` (over-reports shared/reclaimable).
- **Frame time:** in-page rAF-delta collector (`window.__probeStats()` in `src/probe/frameStats.ts`). The WKWebView's remote inspector is **not CDP-scriptable**, so for unattended in-page eval, run the same harness in Chromium via Playwright (vite:1420) — the "is rAF keeping up with refresh" check is engine-equivalent; CPU/RAM stay on the real WKWebView.
- **Reproducibility:** quiet host (quit other apps — they spawn competing WebContent), AC power, Low Power Mode off, fixed display refresh (infer frame budget from rAF median, not hardcoded 60Hz).

Probe harness + scripts live in `probe/` and `src/probe/` (mounted behind `?probe`). See `docs/product/wp4-thumbnail-probe-outcome.md` for the full method. Related: [[bash-cargo-env]].
