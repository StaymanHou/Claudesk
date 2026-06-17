#!/bin/bash
# WP4 probe — unattended measurement driver (no-sudo path).
# Measures CPU (top) + RAM (footprint) of the real Tauri WKWebView across the
# full matrix: {serialize,clone} × {active,idle}. Frame-time is measured
# separately via Playwright against vite:1420 (engine-equivalent rAF check).
#
# For each scenario: rewrite tauri.conf.json window url → relaunch claudesk →
# warm up → sample top for ~SAMPLE_SECS → footprint → record to /tmp/wp4-results.txt.
#
# Run from repo root: bash probe/measure.sh
set -u
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(git rev-parse --show-toplevel)"

CONF=src-tauri/tauri.conf.json
RESULTS=/tmp/wp4-results.txt
SAMPLE_SECS=${SAMPLE_SECS:-180}   # ~3 min per scenario × 4 = ~12 min + warmups
WARMUP_SECS=${WARMUP_SECS:-12}
: > "$RESULTS"

restart_claudesk () {
  local url="$1"
  pkill -f "target/debug/claudesk" 2>/dev/null
  sleep 2
  # rewrite the window url line in tauri.conf.json
  node -e '
    const fs=require("fs"), p=process.argv[1], url=process.argv[2];
    const c=JSON.parse(fs.readFileSync(p,"utf8"));
    c.app.windows[0].url=url;
    fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");
  ' "$CONF" "$url"
  nohup pnpm tauri dev > /tmp/wp4-tauri-dev.log 2>&1 &
  # wait for the claudesk binary + its WebKit helpers
  for i in $(seq 1 40); do
    sleep 1
    local pid=$(pgrep -f "target/debug/claudesk" | head -1)
    [ -n "$pid" ] && break
  done
  sleep 6   # let webview load + replay start
}

measure_scenario () {
  local arm="$1" scenario="$2"
  local url="index.html?probe&mode=harness&fixture=cc-replay&arm=${arm}&scenario=${scenario}"
  echo "=== SCENARIO arm=$arm scenario=$scenario ===" | tee -a "$RESULTS"
  restart_claudesk "$url"

  local MAIN=$(pgrep -f "target/debug/claudesk" | head -1)
  # identify OUR webkit helpers: the newest WebContent/GPU (highest PID = most recent launch)
  local WC=$(pgrep -f "WebKit.WebContent" | sort -n | tail -1)
  local GPU=$(pgrep -f "WebKit.GPU" | sort -n | tail -1)
  echo "pids: main=$MAIN webcontent=$WC gpu=$GPU" | tee -a "$RESULTS"

  echo "warmup ${WARMUP_SECS}s…"
  sleep "$WARMUP_SECS"

  # sample top for the 3 pids, 1s interval, SAMPLE_SECS samples; capture %CPU column
  local nsamp=$SAMPLE_SECS
  echo "sampling top ${nsamp}s…"
  top -pid "$MAIN" -pid "$WC" -pid "$GPU" -l "$nsamp" -s 1 -stats pid,cpu > /tmp/wp4-top-${arm}-${scenario}.txt 2>/dev/null

  # RAM via footprint (sum the 3 pids' phys_footprint)
  local ram_main=$(footprint -p "$MAIN" 2>/dev/null | awk '/phys_footprint:/{print $2; exit}')
  local ram_wc=$(footprint -p "$WC" 2>/dev/null | awk '/phys_footprint:/{print $2; exit}')
  local ram_gpu=$(footprint -p "$GPU" 2>/dev/null | awk '/phys_footprint:/{print $2; exit}')
  echo "footprint MB: main=$ram_main webcontent=$ram_wc gpu=$ram_gpu" | tee -a "$RESULTS"
  echo "(raw top → /tmp/wp4-top-${arm}-${scenario}.txt, $(grep -c '^[0-9]' /tmp/wp4-top-${arm}-${scenario}.txt) rows)" | tee -a "$RESULTS"
  echo "" | tee -a "$RESULTS"
}

echo "WP4 measurement matrix start: $(date)" | tee -a "$RESULTS"
measure_scenario serialize active
measure_scenario serialize idle
measure_scenario clone     active
measure_scenario clone     idle
echo "WP4 measurement matrix done: $(date)" | tee -a "$RESULTS"
