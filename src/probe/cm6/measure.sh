#!/usr/bin/env bash
# WP1 probe — objective (b) CPU/RAM measurement on the real Tauri WKWebView.
# THROWAWAY probe helper. Mirrors WP4's method (top -l on WebContent+GPU PIDs,
# footprint -p for RAM). Run AFTER pointing the Claudesk window at the nmount probe:
#
#   1. pnpm tauri dev   (if not already running)
#   2. In the Claudesk window: open the WebKit inspector (right-click → Inspect
#      Element, or the dev build's menu) and navigate to:
#         http://localhost:1420/?cm6probe&mode=nmount&n=8&merge=2
#      OR temporarily set the dev URL — see the WIP file's run sheet.
#   3. For IDLE:   leave it sitting (no typing).  Run:  ./measure.sh idle
#      For ACTIVE: click "start typing (idle→active)" first.  Run: ./measure.sh active
#
# Output: median/p95/max %CPU (WebContent+GPU summed) over the sample window + RAM.

set -euo pipefail

LABEL="${1:-idle}"
SAMPLES="${2:-120}"   # ~120s at 1s interval; WP4 used ~180

main_pid="$(pgrep -f 'target/debug/claudesk' | head -1 || true)"
if [[ -z "$main_pid" ]]; then
  echo "ERROR: claudesk (target/debug/claudesk) not running. Start 'pnpm tauri dev' first." >&2
  exit 1
fi

# WebContent + GPU helpers spawned alongside the app (PID > main is the heuristic;
# verify they're the claudesk window's, not a stray Safari, by checking they
# appeared after the app launched).
wc_pid="$(pgrep -f 'WebKit.WebContent' | awk -v m="$main_pid" '$1 > m-2000' | tail -1 || true)"
gpu_pid="$(pgrep -f 'WebKit.GPU' | awk -v m="$main_pid" '$1 > m-2000' | tail -1 || true)"

echo "claudesk main=$main_pid  WebContent=$wc_pid  GPU=$gpu_pid  label=$LABEL  samples=$SAMPLES"
if [[ -z "$wc_pid" || -z "$gpu_pid" ]]; then
  echo "ERROR: could not find WebContent/GPU helper PIDs. Inspect 'ps aux | grep WebKit'." >&2
  exit 1
fi

# RAM via footprint (one shot — RAM is stable across the window).
echo "=== RAM (footprint) ==="
for p in "$main_pid" "$wc_pid" "$gpu_pid"; do
  rss="$(footprint -p "$p" 2>/dev/null | grep -iE 'phys_footprint|footprint' | tail -1 || echo 'n/a')"
  echo "  pid $p: $rss"
done

# CPU via top -l, summing WebContent+GPU per sample. Discard first 10 as warm-up.
echo "=== CPU (top -l, WebContent+GPU summed; first 10 samples dropped) ==="
top -l "$SAMPLES" -s 1 -pid "$wc_pid" -pid "$gpu_pid" -stats pid,cpu 2>/dev/null \
  | awk -v wc="$wc_pid" -v gpu="$gpu_pid" '
      $1==wc { wcv=$2 }
      $1==gpu { gpuv=$2; print wcv+gpuv }
    ' \
  | tail -n +11 \
  | sort -n \
  | awk '{ a[NR]=$1 } END {
      n=NR; if(n==0){print "no samples"; exit}
      printf "  samples=%d  median=%.1f  p95=%.1f  max=%.1f  (sum WebContent+GPU %%CPU)\n",
        n, a[int(n*0.5)], a[int(n*0.95)], a[n]
    }'
