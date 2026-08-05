#!/usr/bin/env bash
#
# M12 WP3 Phase 1 — the injection-timing probe (wrapper).
#
# ═══════════════════════════════════════════════════════════════════════════════
# WHAT THIS ANSWERS
#
# M12's auto-resume injects a slash command into a FRESHLY SPAWNED CC session. The
# WP3 draft spec assumed it could fire at `cc_ready`; reconciliation found that
# premise false — `cc_ready` is Claudesk's own frontend-listener handshake, not a
# CC-readiness signal, and CC is a raw-mode TUI rather than a line-buffered shell.
#
# So this probe measures the real thing: at what moment does an injected command
# actually EXECUTE?
#
# ⚠️ The measurement logic lives in `probe.py` — a PTY is required, and Python's
# `pty.fork()` reproduces Claudesk's spawn conditions (real PTY, same argv + env,
# write at a controlled delay) without needing the app running. This wrapper exists
# so the entry point is a shell script like the repo's other probe harnesses, and to
# document the arms in one place.
#
# ═══════════════════════════════════════════════════════════════════════════════
# ⚠️ THE PREDICATE (defined before any run — see probe.py's docstring for the full text)
#
# The probe sends `/status`, NOT `/session-restore`. Reason: CC's TUI ECHOES typed
# characters, so a buffer containing "/session-restore" is entirely consistent with the
# command never having run — the bytes are sitting in the input box. `/status`'s echo is
# 7 characters; its EXECUTION prints a multi-line report sharing no substring with that
# echo. So:
#
#   EXECUTED      = post-send output contains a /status REPORT marker
#   NOT-EXECUTED  = no marker, even if "/status" itself is visible  ← the trap
#   INDETERMINATE = CC never became interactive (a SETUP problem, not a timing answer)
#
# ═══════════════════════════════════════════════════════════════════════════════
# ⚠️ SAFETY
#
# The probe spawns and reaps ONLY its own child, by the PID `pty.fork()` handed it.
# It never scans the process table, never matches by name, never kills by port. On
# 2026-07-13 a blanket name/port kill during a verify-self run killed the operator's
# live application (dev and prod share the process name `claudesk`). Nothing here can
# repeat that — there is exactly one PID and we own it.
#
# CC is spawned in a THROWAWAY scratch repo (`tmp/scratch/scratch-a`), never a real
# project, per the standing scratch-workspace convention.
# ═══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE_PY="$HERE/probe.py"

usage() {
  # ⚠️ Delimiter is PROBE_USAGE_EOF, not `USAGE` — the body below contains a line
  # beginning with the word "USAGE", which would terminate a `<<'USAGE'` heredoc
  # early and leave the rest of the body as shell code. `bash -n` caught exactly
  # that while writing this file.
  cat <<'PROBE_USAGE_EOF'
M12 WP3 Phase 1 — the injection-timing probe.

USAGE
  tooling/autofire-timing/probe.sh [--arm ARM] [options]

ARMS (the three measurements, in escalation order)
  cc-ready      Send at delay=0 — models firing at `cc_ready`, the earliest moment
                Claudesk could fire (the spawn invoke has resolved). This is the arm
                that answers the draft spec's assumption. DEFAULT.

  delay-sweep   Walk 0 / 250 / 500 / 1000 / 2000 / 4000 ms and stop at the first
                delay that is reliably EXECUTED across all runs. Run this only if
                cc-ready fails — it finds the earliest safe fire point.

  hook-probe    Asks whether a fresh CC session emits any hook event UNPROMPTED.
                Not automatable here (it needs Claudesk's own hook socket, i.e. a
                running app), so this arm prints guidance rather than measuring.
                It is the fallback if both arms above fail.

OPTIONS
  --runs N        Cold spawns per delay (default 5). ⚠️ <5 is reported as NOT a
                  cold-start claim — one warm sample is explicitly insufficient.
  --delay-ms N    Pre-send delay for the cc-ready arm (default 0).
  --settle SECS   Seconds to read output after sending (default 6).
  --project DIR   Where to spawn CC (default tmp/scratch/scratch-a).
  --mode VALUE    --permission-mode value (default bypassPermissions, Claudesk's).
  --capture-dir D Where raw PTY captures go (default tmp/autofire-timing, gitignored).
  --no-capture    Skip writing capture files.
  -h, --help      This text.

EXIT STATUS
  0  at least one tested delay was reliably EXECUTED across all runs
  1  no tested delay was reliable (includes FLAKY — a partial pass is not a pass)
  2  setup error (missing project dir, missing python3, missing claude)

EXAMPLES
  # The Phase-1 question: does firing at cc_ready work? (5 cold spawns)
  tooling/autofire-timing/probe.sh --arm cc-ready

  # It didn't. Find the earliest delay that does.
  tooling/autofire-timing/probe.sh --arm delay-sweep
PROBE_USAGE_EOF
}

for a in "$@"; do
  case "$a" in
    -h|--help) usage; exit 0 ;;
  esac
done

command -v python3 >/dev/null 2>&1 || { echo "error: python3 not found" >&2; exit 2; }
command -v claude  >/dev/null 2>&1 || { echo "error: claude not found on PATH" >&2; exit 2; }
[ -f "$PROBE_PY" ] || { echo "error: probe.py missing at $PROBE_PY" >&2; exit 2; }

exec python3 "$PROBE_PY" "$@"
