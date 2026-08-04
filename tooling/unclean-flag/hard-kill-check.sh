#!/usr/bin/env bash
#
# M12 WP2 Phase 3 — the unclean-exit flag's hard-kill survival check.
#
# ═══════════════════════════════════════════════════════════════════════════════
# WHAT THIS PROVES, AND WHY NO TEST CAN PROVE IT
#
# M12's auto-resume rests on one property: a workspace that dies WITHOUT running any
# cleanup code leaves its unclean-exit flag SET, so the next open can offer `/resume`.
# That is the whole design — a power loss runs no code, so the flag must already be on
# disk before any work begins, and only a clean exit removes it.
#
# A unit test cannot establish this. Every test runs inside a process that survives to
# assert; the property here is about a process that does NOT survive. The only honest
# instrument is to kill the real app with SIGKILL — which no signal handler, no `Drop`,
# no `atexit`, and no Tauri `CloseRequested` handler can intercept — and then read the
# file the next launch would read.
#
# ⚠️ BOTH ARMS ARE MANDATORY. A passing hard-kill arm alone is under-determined: if a
# clean quit ALSO left the flag set, "it survived a kill" would prove nothing about the
# kill. Running the clean arm in the same session is what makes the result decisive.
# ═══════════════════════════════════════════════════════════════════════════════
#
# USAGE
#   tooling/unclean-flag/hard-kill-check.sh            # guided, both arms
#   tooling/unclean-flag/hard-kill-check.sh --state    # just print the flag file
#
# The script does NOT launch or kill the app on its own initiative: it prints the exact
# commands and reads state between steps. That is deliberate — see SAFETY below.
#
# ═══════════════════════════════════════════════════════════════════════════════
# ⚠️ SAFETY — READ BEFORE ADDING ANY `kill` TO THIS FILE
#
# Killing is PID-SCOPED, and the PID must be one you captured from a launch you
# performed. NEVER `pkill -f claudesk`, never kill by name, never kill by port.
#
# On 2026-07-13 a blanket port/name kill during a verify-self run killed the OPERATOR's
# live application. The dev build and a production install share the process name
# `claudesk`; the dev binary lives at `src-tauri/target/debug/claudesk` while an
# installed one lives under `/Applications`. A name-matched kill cannot tell them apart.
#
# This script therefore refuses to kill anything it cannot attribute to the dev target
# path, and refuses outright if more than one candidate matches.
# ═══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

DEV_ID="com.claudesk.app.dev"
PROD_ID="com.claudesk.app"
DEV_DIR="$HOME/Library/Application Support/$DEV_ID"
PROD_DIR="$HOME/Library/Application Support/$PROD_ID"
STATE_FILE="session-state.json"
# ⚠️ The dev binary runs as the RELATIVE path `target/debug/claudesk` (cargo launches it
# with cwd=src-tauri), NOT the absolute path — verified live 2026-08-03, when an
# absolute-path marker matched nothing and this script correctly refused to kill.
#
# That refusal was the guard earning its place: the same `ps` listing showed
# `/Applications/Claudesk.app/Contents/MacOS/claudesk` — the operator's PRODUCTION app —
# also matching the bare name `claudesk`. A `pkill -f claudesk` would have killed it.
# The `debug/` path segment is what distinguishes dev from prod; keep it in any future
# edit to this marker.
DEV_BINARY_MARKER="target/debug/claudesk"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }

show_state() {
  local dir="$1" label="$2"
  if [ -f "$dir/$STATE_FILE" ]; then
    echo "  $label: $(tr -d '\n ' < "$dir/$STATE_FILE")"
  else
    echo "  $label: (absent — the correct cold-start state; absent means CLEAN)"
  fi
}

# Print both identities' flag files. Prod is shown ONLY to prove the dev run never
# touched it — this check must never write to a production install's state.
print_state() {
  bold "session-state.json"
  show_state "$DEV_DIR" "dev  ($DEV_ID)"
  show_state "$PROD_DIR" "prod ($PROD_ID)"
}

if [ "${1:-}" = "--state" ]; then
  print_state
  exit 0
fi

# Resolve the dev app's PID by its BINARY PATH, never by name. Returns non-zero unless
# exactly one candidate matches — ambiguity is refused, not guessed.
dev_pid() {
  local pids count
  pids=$(pgrep -f "$DEV_BINARY_MARKER" 2>/dev/null | tr '\n' ' ')
  pids=$(echo "$pids" | xargs 2>/dev/null || true)
  if [ -z "$pids" ]; then
    return 1
  fi
  count=$(echo "$pids" | wc -w | tr -d ' ')
  if [ "$count" -ne 1 ]; then
    fail "REFUSING: $count processes match $DEV_BINARY_MARKER ($pids)." >&2
    fail "Cannot attribute a kill unambiguously. Close the extras and re-run." >&2
    return 2
  fi
  echo "$pids"
}

if [ "${1:-}" = "--kill" ]; then
  bold "HARD KILL (SIGKILL — uncatchable; no cleanup code can run)"
  pid=$(dev_pid) || {
    rc=$?
    [ "$rc" -eq 1 ] && fail "No dev app running (nothing matches $DEV_BINARY_MARKER)."
    exit 1
  }
  # Show exactly what is about to die, so a wrong target is visible BEFORE the kill.
  echo "  target pid: $pid"
  echo "  command:    $(ps -p "$pid" -o command= | cut -c1-100)"
  case "$(ps -p "$pid" -o command=)" in
    *"$DEV_BINARY_MARKER"*) ;;
    *)
      fail "REFUSING: pid $pid does not run from $DEV_BINARY_MARKER."
      exit 1
      ;;
  esac
  # SIGKILL specifically: SIGTERM/SIGHUP would let a handler run, which would defeat
  # the entire point — this must simulate a power loss, not a polite shutdown.
  kill -9 "$pid" && ok "  SIGKILL sent to $pid"
  sleep 1
  echo
  print_state
  exit 0
fi

bold "═══ M12 WP2 Phase 3 — hard-kill survival check ═══"
echo
bold "BASELINE"
print_state
PROD_MTIME_BEFORE=$(stat -f %m "$PROD_DIR/$STATE_FILE" 2>/dev/null || echo "absent")
echo

bold "ARM 1 — HARD KILL (no cleanup code runs → the flag MUST survive)"
cat <<'STEPS'
  1. Launch the dev app:            pnpm tauri:dev
  2. Open a scratch workspace       (tmp/scratch/scratch-a)
  3. Confirm the flag was SET:      tooling/unclean-flag/hard-kill-check.sh --state
  4. Hard-kill it:                  tooling/unclean-flag/hard-kill-check.sh --kill
  5. Confirm the flag SURVIVED:     tooling/unclean-flag/hard-kill-check.sh --state
STEPS
echo
bold "ARM 2 — CLEAN QUIT (the control; the flag MUST be gone)"
cat <<'STEPS'
  6. Relaunch, open the SAME workspace, confirm the flag is set again
  7. Quit gracefully (⌘Q, or the × on the last workspace then quit)
  8. Confirm the key is ABSENT:     tooling/unclean-flag/hard-kill-check.sh --state
STEPS
echo
warn "Arm 2 is not optional. Without it, arm 1 proves only that a key exists —"
warn "not that the KILL is what preserved it."
echo
bold "CONTAINMENT (run after both arms)"
echo "  prod session-state.json mtime before this run: $PROD_MTIME_BEFORE"
echo "  Re-check after; it must be unchanged. The dev identity writes to"
echo "  $DEV_ID and must never touch $PROD_ID."
