#!/usr/bin/env bash
# M4 WP1 probe — N-workspace mount-cost CPU/RAM measurement on the real Tauri
# WKWebView. THROWAWAY probe helper. Mirrors WP4's method EXACTLY (top -l on the
# WebContent+GPU helper PIDs, footprint -p for RAM) so the numbers are directly
# comparable to the WP4 / M1-WP1 envelope (<300MB RAM, <20% active CPU).
#
# RUN SHEET:
#   1. lsof -ti:1420 | xargs kill   # clear a stale Vite (strictPort)
#   2. pnpm tauri dev               # start the app (debug build)
#   3. Point the Claudesk window at the probe route. Either:
#        - temporarily set the dev URL to include ?nwsprobe, OR
#        - in the WebKit inspector console:  location.search = '?nwsprobe&n=8'
#      Full route: http://localhost:1420/?nwsprobe&n=8&visible=1&term=cc
#        n=        number of full-M2-stack workspaces to mount (default 8)
#        visible=  how many are shown vs display:none (default 1 — one center stage)
#        term=     cc (real Claude Code, default) | shell (login shell fallback)
#        root=     abs project dir each workspace opens (default the claudesk repo)
#      Wait until all N CC sessions have spawned + settled (watch Activity Monitor
#      for the claude/WebContent CPU to fall to a quiet idle baseline).
#   4. For IDLE:   leave it sitting, no terminal output.       Run: ./measure.sh idle
#      For ACTIVE: type a prompt into the CENTER-STAGE CC pane so it streams output
#                  (or run a `cc` command that produces sustained output), THEN run:
#                  ./measure.sh active
#
# Output: median / p95 / max %CPU (WebContent+GPU summed) over the post-warmup
# window + RAM (footprint, main + WebContent + GPU). First 10 samples dropped.

set -euo pipefail

LABEL="${1:-idle}"
SAMPLES="${2:-130}"   # ~130s at 1s interval; WP4 used ~180, M1-WP1 used 120

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

# How many CC/shell sessions are alive — a sanity check that N actually spawned
# (an N-workspace probe with only 1 live session is measuring the wrong thing).
n_cc="$(pgrep -fc 'claude --dangerously-skip-permissions' 2>/dev/null || echo '?')"
echo "live 'claude' processes: $n_cc  (expect ≈N for term=cc; 0 for term=shell)"

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
